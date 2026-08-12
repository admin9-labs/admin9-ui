import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { normalizeReleaseNotes } from './changelog.mjs';

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
const SLSA_PROVENANCE_TYPE = 'https://slsa.dev/provenance/v1';

function parseReleaseTag(tag) {
  const tagMatch = RELEASE_TAG.exec(tag);
  if (!tagMatch) throw new Error(`Release tag must use canonical vX.Y.Z form: ${tag}`);
  return tag.slice(1);
}

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

export function validateReleaseIdentity({ tag, packageVersion, commit, checkoutHead, mainHead, isMainAncestor }) {
  const tagVersion = parseReleaseTag(tag);
  if (tagVersion !== packageVersion) {
    throw new Error(`Release tag ${tag} does not match package version ${packageVersion}.`);
  }

  const shas = { commit, checkoutHead, mainHead };
  Object.entries(shas).forEach(([name, sha]) => {
    if (!GIT_SHA.test(sha)) throw new Error(`Invalid ${name} Git SHA: ${sha}`);
  });
  if (commit !== checkoutHead) throw new Error('The workflow event commit does not match the checked-out commit.');
  if (!isMainAncestor) throw new Error('The release tag commit is not an ancestor of remote main.');

  return tagVersion;
}

export function buildRemoteTagRefs(tag) {
  parseReleaseTag(tag);
  const tagRef = `refs/tags/${tag}`;
  return [tagRef, `${tagRef}^{}`];
}

export function assertCommandSucceeded(result, description) {
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? String(result.stderr ?? '').trim();
    throw new Error(`${description} failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout ?? '');
}

export function resolveRemoteTagCommit(output, tag) {
  const [tagRef, peeledRef] = buildRemoteTagRefs(tag);
  const refs = new Map();
  const lines = output.trim() ? output.trim().split(/\r?\n/) : [];

  lines.forEach((line) => {
    const match = /^([0-9a-f]{40})\s+(.+)$/i.exec(line);
    if (!match || (match[2] !== tagRef && match[2] !== peeledRef) || refs.has(match[2])) {
      throw new Error(`Unable to resolve remote release tag ${tag}: unexpected git ls-remote output.`);
    }
    refs.set(match[2], match[1].toLowerCase());
  });

  if (!refs.has(tagRef)) throw new Error(`Remote release tag ${tag} does not exist.`);
  return refs.get(peeledRef) ?? refs.get(tagRef);
}

export function validateRemoteTagBinding({ tag, commit, output }) {
  if (!GIT_SHA.test(commit)) throw new Error(`Invalid workflow commit Git SHA: ${commit}`);
  const remoteCommit = resolveRemoteTagCommit(output, tag);
  if (remoteCommit !== commit.toLowerCase()) {
    throw new Error(`Remote release tag ${tag} resolves to ${remoteCommit} instead of workflow commit ${commit}.`);
  }
  return remoteCommit;
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

export async function calculateSha256Digest(path) {
  const contents = await readFile(path);
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}

export function buildRegistryVersionUrl(packageName, packageVersion) {
  if (!packageName || !packageVersion) throw new Error('Package name and version are required for registry lookup.');
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(packageVersion)}`;
}

export function buildRegistryPackageUrl(packageName) {
  if (!packageName) throw new Error('Package name is required for registry lookup.');
  return `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
}

export function assertPublishedMetadata(metadata, { packageName, packageVersion, integrity }) {
  if (metadata.name !== packageName || metadata.version !== packageVersion) {
    throw new Error('The npm registry returned metadata for a different package version.');
  }
  if (metadata.dist?.integrity !== integrity) {
    throw new Error(`npm ${packageName}@${packageVersion} exists but its tarball integrity differs.`);
  }
}

export function assertLatestDistTag(metadata, { packageName, packageVersion }) {
  if (metadata.name !== packageName) throw new Error('The npm registry returned dist-tags for a different package.');
  if (metadata['dist-tags']?.latest !== packageVersion) {
    throw new Error(`npm latest does not point to ${packageName}@${packageVersion}.`);
  }
}

function normalizeGitHubRepository(value) {
  const withoutProtocol = value.replace(/^https:\/\/github\.com\//i, '');
  return withoutProtocol
    .replace(/\.git$/i, '')
    .replace(/\/$/, '')
    .toLowerCase();
}

function buildNpmPurl(packageName, packageVersion) {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    if (!scope || !name) throw new Error(`Invalid scoped npm package name: ${packageName}`);
    return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(name)}@${packageVersion}`;
  }
  return `pkg:npm/${encodeURIComponent(packageName)}@${packageVersion}`;
}

function integritySha512Hex(integrity) {
  const match = /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (!match) throw new Error(`Invalid sha512 integrity: ${integrity}`);
  const digest = Buffer.from(match[1], 'base64');
  if (digest.length !== 64) throw new Error(`Invalid sha512 integrity: ${integrity}`);
  return digest.toString('hex');
}

export function assertProvenanceAttestation(
  attestations,
  { packageName, packageVersion, integrity, repository, workflowPath, tag, commit }
) {
  const provenance = attestations.attestations?.find((attestation) => attestation.predicateType === SLSA_PROVENANCE_TYPE);
  if (!provenance) throw new Error('The npm registry did not return SLSA provenance.');

  const envelope = provenance.bundle?.dsseEnvelope;
  if (envelope?.payloadType !== 'application/vnd.in-toto+json' || !envelope.payload) {
    throw new Error('The npm SLSA provenance envelope is invalid.');
  }

  let statement;
  try {
    statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
  } catch {
    throw new Error('The npm SLSA provenance payload is invalid JSON.');
  }

  if (
    Reflect.get(statement, '_type') !== 'https://in-toto.io/Statement/v1' ||
    statement.predicateType !== SLSA_PROVENANCE_TYPE
  ) {
    throw new Error('The npm attestation is not an in-toto SLSA provenance statement.');
  }

  const expectedSubject = buildNpmPurl(packageName, packageVersion);
  const expectedDigest = integritySha512Hex(integrity);
  const subjectMatches = statement.subject?.some(
    (subject) => subject.name === expectedSubject && subject.digest?.sha512?.toLowerCase() === expectedDigest
  );
  if (!subjectMatches) throw new Error('The npm provenance subject does not match the verified tarball.');

  const workflow = statement.predicate?.buildDefinition?.externalParameters?.workflow;
  if (
    normalizeGitHubRepository(workflow?.repository ?? '') !== normalizeGitHubRepository(repository) ||
    workflow?.path !== workflowPath ||
    workflow?.ref !== `refs/tags/${tag}`
  ) {
    throw new Error('The npm provenance workflow identity does not match this release.');
  }

  const expectedDependencyUri = `git+https://github.com/${repository}@refs/tags/${tag}`;
  const dependencyMatches = statement.predicate?.buildDefinition?.resolvedDependencies?.some(
    (dependency) => dependency.uri === expectedDependencyUri && dependency.digest?.gitCommit === commit
  );
  if (!dependencyMatches) throw new Error('The npm provenance Git commit does not match this release.');
}

function assertGitHubReleaseAsset(metadata, { tag, assetName, assetSize, assetDigest }) {
  if (metadata.tag_name !== tag) throw new Error(`The GitHub Release does not belong to ${tag}.`);
  const matchingAssets = metadata.assets?.filter((asset) => asset.name === assetName) ?? [];
  if (matchingAssets.length !== 1) {
    throw new Error(`Expected exactly one GitHub Release asset named ${assetName}; found ${matchingAssets.length}.`);
  }

  const [asset] = matchingAssets;
  if (asset.state !== 'uploaded' || asset.size !== assetSize || asset.digest !== assetDigest) {
    throw new Error(`GitHub Release asset ${assetName} does not match the verified tarball.`);
  }
}

function assertGitHubReleaseNotes(metadata, { releaseNotes }) {
  if (normalizeReleaseNotes(metadata.body) !== normalizeReleaseNotes(releaseNotes)) {
    throw new Error('The GitHub Release notes do not match CHANGELOG.md.');
  }
}

export function assertGitHubRelease(metadata, expected) {
  assertGitHubReleaseAsset(metadata, expected);
  assertGitHubReleaseNotes(metadata, expected);
  if (metadata.draft !== false) throw new Error('The GitHub Release is still a draft.');
  if (metadata.prerelease !== false) throw new Error('The GitHub Release is not a stable release.');
}

export function getGitHubReleaseDisposition(metadata, expected) {
  if (metadata === null) return 'create';
  assertGitHubReleaseAsset(metadata, expected);
  assertGitHubReleaseNotes(metadata, expected);
  if (metadata.prerelease !== false) throw new Error('The GitHub Release is marked as a prerelease.');
  if (metadata.draft === true) return 'promote';
  if (metadata.draft !== false) throw new Error('The GitHub Release draft state is invalid.');
  return 'skip';
}

export function requirePublishedGitHubRelease(disposition, tag) {
  if (disposition !== 'skip') throw new Error(`GitHub Release ${tag} is not a published stable release yet.`);
  return disposition;
}

export async function retry(operation, { attempts, delayMs }) {
  async function run(attempt) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolveDelay) => {
        setTimeout(resolveDelay, delayMs);
      });
      return run(attempt + 1);
    }
  }

  return run(1);
}
