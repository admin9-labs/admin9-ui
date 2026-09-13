import { appendFile } from 'node:fs/promises';
import { selectSuccessfulMainCiRun } from './release-utils.mjs';

const expectedOptions = ['--repository', '--commit', '--workflow'];
const values = new Map();
const args = process.argv.slice(2);
if (args.length !== expectedOptions.length * 2) throw new Error('Invalid CI candidate arguments.');
for (let index = 0; index < args.length; index += 2) {
  if (!expectedOptions.includes(args[index]) || values.has(args[index]) || !args[index + 1]) {
    throw new Error(`Invalid CI candidate option: ${args[index]}`);
  }
  values.set(args[index], args[index + 1]);
}

const token = process.env.GITHUB_TOKEN;
const outputPath = process.env.GITHUB_OUTPUT;
if (!token || !outputPath) throw new Error('GITHUB_TOKEN and GITHUB_OUTPUT are required.');

const [owner, repositoryName, extra] = values.get('--repository').split('/');
if (!owner || !repositoryName || extra) throw new Error('Repository must use owner/name form.');
const workflow = values.get('--workflow');
const workflowPath = `.github/workflows/${workflow}`;
const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const url = new URL(
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/actions/workflows/${encodeURIComponent(
    workflow
  )}/runs`,
  apiUrl
);
url.searchParams.set('branch', 'main');
url.searchParams.set('event', 'push');
url.searchParams.set('head_sha', values.get('--commit'));
url.searchParams.set('per_page', '100');

const response = await fetch(url, {
  headers: {
    'accept': 'application/vnd.github+json',
    'authorization': `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  },
  cache: 'no-store',
});
if (!response.ok) throw new Error(`GitHub Actions run lookup failed with status ${response.status}.`);
const payload = await response.json();
const candidate = selectSuccessfulMainCiRun(payload.workflow_runs, {
  commit: values.get('--commit'),
  workflowPath,
});
await appendFile(outputPath, `run-id=${candidate.runId}\nrun-attempt=${candidate.runAttempt}\n`);
