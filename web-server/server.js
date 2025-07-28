import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { maybePublishPRForIssue, createEnvContext } from './git-helpers.js';

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

const sessions = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), 'public')));

app.post('/run', async (req, res) => {
  const { repoUrl, prompt, token, branch = 'main', userId } = req.body;
  if (!repoUrl || !prompt || !token || !userId) {
    res.status(400).send('repoUrl, prompt, token and userId are required');
    return;
  }

  // ensure repo not used by another user
  for (const [otherId, s] of sessions.entries()) {
    if (otherId !== userId && s.repos && s.repos.has(repoUrl)) {
      res.status(409).send('Repository in use by another user');
      return;
    }
  }

  let session = sessions.get(userId);
  if (!session) {
    session = { repos: new Map(), home: path.join(os.tmpdir(), `codex-home-${userId}`) };
    sessions.set(userId, session);
    await fs.promises.mkdir(session.home, { recursive: true });
  }

  let repo = session.repos.get(repoUrl);
  let workdir;
  if (!repo) {
    workdir = path.join(os.tmpdir(), `codex-${userId}-${Date.now()}`);
    const url = repoUrl.replace('https://', `https://${token}@`);
    await run('git', ['clone', url, workdir]);
    if (branch !== 'main') {
      await run('git', ['checkout', '-B', branch], { cwd: workdir });
    }
    session.repos.set(repoUrl, { path: workdir, branch });
  } else {
    workdir = repo.path;
    try {
      await run('git', ['checkout', repo.branch], { cwd: workdir });
    } catch {
      await run('git', ['checkout', '-B', repo.branch], { cwd: workdir });
    }
    await run('git', ['pull'], { cwd: workdir });
  }

  const env = {
    ...process.env,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    CODEX_HOME: session.home,
  };

  try {
    await run('npx', ['codex', 'exec', '--full-auto', prompt], { cwd: workdir, env });

    const ctx = createEnvContext({ ...process.env, GITHUB_TOKEN: token, GITHUB_REPOSITORY: repoUrl.split('github.com/')[1].replace(/\.git$/, '') });
    const prUrl = await maybePublishPRForIssue(1, prompt, ctx);
    res.json({ prUrl });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
