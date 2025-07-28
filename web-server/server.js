import express from 'express';
import { execSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { maybePublishPRForIssue, createEnvContext } from './git-helpers.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(path.dirname(new URL(import.meta.url).pathname), 'public')));

app.post('/run', async (req, res) => {
  const { repoUrl, prompt, token } = req.body;
  if (!repoUrl || !prompt || !token) {
    res.status(400).send('repoUrl, prompt and token are required');
    return;
  }

  const workdir = path.join(os.tmpdir(), `codex-${Date.now()}`);
  try {
    const url = repoUrl.replace('https://', `https://${token}@`);
    execSync(`git clone ${url} ${workdir}`, { stdio: 'inherit' });

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
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
