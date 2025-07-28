import { spawnSync } from 'child_process';
import { Octokit } from '@octokit/rest';

function runGit(args, silent = true) {
  console.info(`Running git ${args.join(' ')}`);
  const res = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: silent ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed with code ${res.status}: ${res.stderr}`);
  }
  return res.stdout.trim();
}

export function stageAllChanges() {
  runGit(['add', '-A']);
}

function hasStagedChanges() {
  const res = spawnSync('git', ['diff', '--cached', '--quiet', '--exit-code']);
  return res.status !== 0;
}

function ensureOnBranch(issueNumber, protectedBranches, suggestedSlug) {
  let branch = '';
  try {
    branch = runGit(['symbolic-ref', '--short', '-q', 'HEAD']);
  } catch {
    branch = '';
  }
  if (!branch || protectedBranches.includes(branch)) {
    if (suggestedSlug) {
      const safeSlug = suggestedSlug
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      branch = `codex-fix-${issueNumber}-${safeSlug}`;
    } else {
      branch = `codex-fix-${issueNumber}-${Date.now()}`;
    }
    runGit(['switch', '-c', branch]);
  }
  return branch;
}

function commitIfNeeded(issueNumber) {
  if (hasStagedChanges()) {
    runGit(['commit', '-m', `fix: automated fix for #${issueNumber} via Codex`]);
  }
}

function pushBranch(branch, githubToken, ctx) {
  const repoSlug = ctx.get('GITHUB_REPOSITORY');
  const remoteUrl = `https://x-access-token:${githubToken}@github.com/${repoSlug}.git`;
  runGit(['push', '--force-with-lease', '-u', remoteUrl, `HEAD:${branch}`]);
}

export async function maybePublishPRForIssue(issueNumber, lastMessage, ctx) {
  const githubToken = ctx.tryGetNonEmpty('GITHUB_TOKEN') || ctx.tryGetNonEmpty('GH_TOKEN');
  if (!githubToken) {
    console.warn('No GitHub token - skipping PR creation.');
    return undefined;
  }

  runGit(['status']);
  stageAllChanges();

  const octokit = ctx.getOctokit(githubToken);
  const [owner, repo] = ctx.get('GITHUB_REPOSITORY').split('/');

  let defaultBranch = 'main';
  try {
    const repoInfo = await octokit.repos.get({ owner, repo });
    defaultBranch = repoInfo.data.default_branch || 'main';
  } catch (e) {
    console.warn(`Failed to get default branch, assuming 'main': ${e}`);
  }

  const sanitizedMessage = lastMessage.replace(/\u2022/g, '-');
  const [summaryLine] = sanitizedMessage.split(/\r?\n/);
  const branch = ensureOnBranch(issueNumber, [defaultBranch, 'master'], summaryLine);
  commitIfNeeded(issueNumber);
  pushBranch(branch, githubToken, ctx);

  const headParam = `${owner}:${branch}`;
  const existing = await octokit.pulls.list({ owner, repo, head: headParam, state: 'open' });
  if (existing.data.length > 0) {
    return existing.data[0].html_url;
  }

  let baseBranch = 'main';
  try {
    const repoInfo = await octokit.repos.get({ owner, repo });
    baseBranch = repoInfo.data.default_branch || 'main';
  } catch (e) {
    console.warn(`Failed to get default branch, assuming 'main': ${e}`);
  }

  const pr = await octokit.pulls.create({
    owner,
    repo,
    title: summaryLine,
    head: branch,
    base: baseBranch,
    body: sanitizedMessage,
  });
  return pr.data.html_url;
}

export function createEnvContext(env = process.env) {
  return {
    get(name) {
      const value = env[name];
      if (value == null) throw new Error(`Missing required env var: ${name}`);
      return value;
    },
    tryGet(name) {
      return env[name];
    },
    tryGetNonEmpty(name) {
      const v = env[name];
      return v == null || v === '' ? null : v;
    },
    getOctokit(token) {
      const auth = token || env['GITHUB_TOKEN'] || env['GH_TOKEN'];
      if (!auth) throw new Error('Missing GitHub token');
      return new Octokit({ auth });
    },
  };
}
