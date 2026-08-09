import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

const SAFE_OUTPUT_DIRECTORY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PROTECTED_OUTPUT_DIRECTORIES = new Set([
  '.git',
  '.dist',
  'dev',
  'dist',
  'docs',
  'node_modules',
  'scripts',
  'src',
  'tests',
]);
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const GIT_SHA = /^[0-9a-f]{40}$/i;

export function resolveOutputDirectory(args, packageRoot) {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  if (normalizedArgs.length === 0) return null;
  if (normalizedArgs.length !== 2 || normalizedArgs[0] !== '--output-dir') {
    throw new Error('Usage: verify-tarball.mjs [--output-dir <repository-child-directory>]');
  }

  const requested = normalizedArgs[1];
  if (!requested || isAbsolute(requested) || !SAFE_OUTPUT_DIRECTORY.test(requested)) {
    throw new Error('The output directory must be a safe, relative, single-level directory name.');
  }
  if (PROTECTED_OUTPUT_DIRECTORIES.has(requested)) {
    throw new Error(`The output directory is reserved: ${requested}`);
  }

  const outputDirectory = resolve(packageRoot, requested);
  const relativePath = relative(packageRoot, outputDirectory);
  if (!relativePath || relativePath.includes(sep) || relativePath.startsWith('..')) {
    throw new Error('The output directory must be a direct child of the package root.');
  }
  return outputDirectory;
}

export async function ensureEmptyOutputDirectory(outputDirectory) {
  try {
    const stats = await lstat(outputDirectory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`The output path must be a real directory: ${outputDirectory}`);
    }
    const entries = await readdir(outputDirectory);
    if (entries.length !== 0) throw new Error(`The output directory must be empty: ${outputDirectory}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(outputDirectory);
  }
}

export function validateReleaseIdentity({ tag, packageVersion, commit, checkoutHead, mainHead }) {
  const tagMatch = RELEASE_TAG.exec(tag);
  if (!tagMatch) throw new Error(`Release tag must use canonical vX.Y.Z form: ${tag}`);
  const tagVersion = tag.slice(1);
  if (tagVersion !== packageVersion) {
    throw new Error(`Release tag ${tag} does not match package version ${packageVersion}.`);
  }

  const shas = { commit, checkoutHead, mainHead };
  Object.entries(shas).forEach(([name, sha]) => {
    if (!GIT_SHA.test(sha)) throw new Error(`Invalid ${name} Git SHA: ${sha}`);
  });
  if (commit !== checkoutHead) throw new Error('The workflow event commit does not match the checked-out commit.');
  if (commit !== mainHead) throw new Error('The release tag commit is not the exact remote main HEAD.');

  return tagVersion;
}

export async function findSingleTarball(outputDirectory) {
  const entries = (await readdir(outputDirectory)).filter((entry) => entry.endsWith('.tgz'));
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one tgz in ${outputDirectory}; found ${entries.length}.`);
  }
  const filename = entries[0];
  if (filename !== basename(filename)) throw new Error(`Invalid tarball filename: ${filename}`);
  const tarballPath = resolve(outputDirectory, filename);
  const stats = await lstat(tarballPath);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Tarball must be a real file: ${tarballPath}`);
  return tarballPath;
}

export async function calculateSha512Integrity(path) {
  const contents = await readFile(path);
  return `sha512-${createHash('sha512').update(contents).digest('base64')}`;
}

export function buildRegistryVersionUrl(packageName, packageVersion) {
  if (!packageName || !packageVersion) throw new Error('Package name and version are required for registry lookup.');
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(packageVersion)}`;
}

export function assertPublishedMetadata(metadata, { packageName, packageVersion, integrity }) {
  if (metadata.name !== packageName || metadata.version !== packageVersion) {
    throw new Error('The npm registry returned metadata for a different package version.');
  }
  if (metadata.dist?.integrity !== integrity) {
    throw new Error(`npm ${packageName}@${packageVersion} exists but its tarball integrity differs.`);
  }
}
