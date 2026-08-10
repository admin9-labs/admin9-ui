import { lstat } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateSha256Digest,
  findSingleTarball,
  getGitHubReleaseDisposition,
  requirePublishedGitHubRelease,
  resolveOutputDirectory,
  retry,
} from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const requireExisting = args.includes('--require-existing');
const normalizedArgs = args.filter((arg) => arg !== '--require-existing');

if (
  normalizedArgs.length !== 6 ||
  normalizedArgs[0] !== '--tarball-dir' ||
  normalizedArgs[2] !== '--tag' ||
  normalizedArgs[4] !== '--repository'
) {
  throw new Error(
    'Usage: check-github-release-status.mjs --tarball-dir <directory> --tag <tag> --repository <owner/repo> [--require-existing]'
  );
}

const outputDirectory = resolveOutputDirectory(['--output-dir', normalizedArgs[1]], packageRoot);
const tag = normalizedArgs[3];
const repository = normalizedArgs[5];
const tarballPath = await findSingleTarball(outputDirectory);
const tarballStats = await lstat(tarballPath);
const tarballDigest = await calculateSha256Digest(tarballPath);
const relativeTarball = relative(packageRoot, tarballPath).split(sep).join('/');
const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required to inspect the GitHub Release.');

async function inspectRelease() {
  const repositoryPath = repository
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const response = await fetch(`${apiUrl}/repos/${repositoryPath}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (response.status === 404) {
    if (requireExisting) throw new Error(`GitHub Release ${tag} does not exist yet.`);
    return getGitHubReleaseDisposition(null, {});
  }
  if (!response.ok) throw new Error(`GitHub Release request failed with status ${response.status}.`);

  const metadata = await response.json();
  const disposition = getGitHubReleaseDisposition(metadata, {
    tag,
    assetName: basename(tarballPath),
    assetSize: tarballStats.size,
    assetDigest: tarballDigest,
  });
  return requireExisting ? requirePublishedGitHubRelease(disposition, tag) : disposition;
}

const disposition = requireExisting ? await retry(inspectRelease, { attempts: 5, delayMs: 2000 }) : await inspectRelease();
const exists = disposition === 'skip';
process.stdout.write(`disposition=${disposition}\nexists=${exists}\ntarball=${relativeTarball}\n`);
