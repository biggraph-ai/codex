import express from 'express';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { maybePublishPRForIssue, createEnvContext } from './git-helpers.js';

const repos = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), 'public')));

app.post('/run', async (req, res) => {
  const { repoUrl, prompt, token, branch = 'main' } = req.body;
  if (!repoUrl || !prompt || !token) {
    res.status(400).send('repoUrl, prompt and token are required');
    return;
  }

  let repo = repos.get(repoUrl);
  let workdir;
  if (!repo) {
    workdir = path.join(os.tmpdir(), `codex-${Date.now()}`);
    const url = repoUrl.replace('https://', `https://${token}@`);
    execSync(`git clone ${url} ${workdir}`, { stdio: 'inherit' });
    if (branch !== 'main') {
      execSync(`git checkout -B ${branch}`, { cwd: workdir, stdio: 'inherit' });
    }
    repos.set(repoUrl, { path: workdir, branch });
  } else {
    workdir = repo.path;
    try {
      execSync(`git checkout ${repo.branch}`, { cwd: workdir, stdio: 'inherit' });
    } catch {
      execSync(`git checkout -B ${repo.branch}`, { cwd: workdir, stdio: 'inherit' });
    }
    execSync('git pull', { cwd: workdir, stdio: 'inherit' });
  }

  try {
    execSync(`npx codex exec --full-auto "${prompt.replace(/"/g, '\"')}"`, {
      cwd: workdir,
      stdio: 'inherit',
      env: { ...process.env, OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' },
    });

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
