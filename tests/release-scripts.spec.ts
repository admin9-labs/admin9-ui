import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertCommandSucceeded,
  assertGitHubRelease,
  assertLatestDistTag,
  assertProvenanceAttestation,
  assertPublishedMetadata,
  buildRemoteTagRefs,
  buildRegistryPackageUrl,
  buildRegistryVersionUrl,
  ensureEmptyOutputDirectory,
  findSingleTarball,
  getGitHubReleaseDisposition,
  requirePublishedGitHubRelease,
  resolveRemoteTagCommit,
  resolveOutputDirectory,
  retry,
  validateReleaseIdentity,
  validateRemoteTagBinding,
} from '../scripts/release-utils.mjs';

const temporaryRoots: string[] = [];
const sha = '0123456789abcdef0123456789abcdef01234567';
const newerMainSha = 'fedcba9876543210fedcba9876543210fedcba98';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function buildProvenance({
  integrity,
  repository = 'admin9-labs/admin9-ui',
  workflowPath = '.github/workflows/release.yml',
  tag = 'v0.2.0',
  commit = sha,
}: {
  integrity: string;
  repository?: string;
  workflowPath?: string;
  tag?: string;
  commit?: string;
}) {
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex');
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: 'pkg:npm/%40admin9-labs/admin9-ui@0.2.0', digest: { sha512: digest } }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            ref: `refs/tags/${tag}`,
            repository: `https://github.com/${repository}`,
            path: workflowPath,
          },
        },
        resolvedDependencies: [
          {
            uri: `git+https://github.com/${repository}@refs/tags/${tag}`,
            digest: { gitCommit: commit },
          },
        ],
      },
    },
  };
  return {
    attestations: [
      {
        predicateType: 'https://slsa.dev/provenance/v1',
        bundle: {
          dsseEnvelope: {
            payloadType: 'application/vnd.in-toto+json',
            payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
          },
        },
      },
    ],
  };
}

async function createTemporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), 'admin9-ui-release-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('release tarball output safety', () => {
  it('uses a safe direct child only when explicitly requested', async () => {
    const root = await createTemporaryRoot();
    const output = resolveOutputDirectory(['--output-dir', 'release-artifacts'], root);
    expect(output).toBe(resolve(root, 'release-artifacts'));
    if (!output) throw new Error('Expected an output directory.');

    await ensureEmptyOutputDirectory(output);
    await writeFile(join(output, 'package.tgz'), 'verified');
    expect(await findSingleTarball(output)).toBe(join(output, 'package.tgz'));
  });

  it('accepts the argument separator forwarded by pnpm run', async () => {
    const root = await createTemporaryRoot();
    expect(resolveOutputDirectory(['--', '--output-dir', 'release-artifacts'], root)).toBe(resolve(root, 'release-artifacts'));
    expect(() => resolveOutputDirectory(['--', '--', '--output-dir', 'release-artifacts'], root)).toThrow(/Usage/);
  });

  it('rejects unsafe, reserved, and non-empty output directories', async () => {
    const root = await createTemporaryRoot();
    expect(resolveOutputDirectory([], root)).toBeNull();
    expect(() => resolveOutputDirectory(['--output-dir', '../outside'], root)).toThrow(/safe, relative/);
    expect(() => resolveOutputDirectory(['--output-dir', resolve(root, 'absolute')], root)).toThrow(/safe, relative/);
    expect(() => resolveOutputDirectory(['--output-dir', 'dist'], root)).toThrow(/reserved/);
    expect(() => resolveOutputDirectory(['--wrong', 'release-artifacts'], root)).toThrow(/Usage/);

    const output = join(root, 'release-artifacts');
    await mkdir(output);
    await writeFile(join(output, 'existing.txt'), 'keep');
    await expect(ensureEmptyOutputDirectory(output)).rejects.toThrow(/must be empty/);
  });

  it('requires exactly one real tarball', async () => {
    const root = await createTemporaryRoot();
    await expect(findSingleTarball(root)).rejects.toThrow(/exactly one tgz/);
    await writeFile(join(root, 'one.tgz'), 'one');
    await writeFile(join(root, 'two.tgz'), 'two');
    await expect(findSingleTarball(root)).rejects.toThrow(/found 2/);
  });
});

describe('release identity validation', () => {
  it('accepts a canonical tag on the current or an earlier remote main commit', () => {
    expect(
      validateReleaseIdentity({
        tag: 'v0.2.0',
        packageVersion: '0.2.0',
        commit: sha,
        checkoutHead: sha,
        mainHead: sha,
        isMainAncestor: true,
      })
    ).toBe('0.2.0');
    expect(
      validateReleaseIdentity({
        tag: 'v0.2.0',
        packageVersion: '0.2.0',
        commit: sha,
        checkoutHead: sha,
        mainHead: newerMainSha,
        isMainAncestor: true,
      })
    ).toBe('0.2.0');
  });

  it('rejects malformed tags, version mismatches, and non-main commits', () => {
    const input = {
      packageVersion: '0.2.0',
      commit: sha,
      checkoutHead: sha,
      mainHead: sha,
      isMainAncestor: true,
    };
    expect(() => validateReleaseIdentity({ ...input, tag: 'v0.2' })).toThrow(/vX.Y.Z/);
    expect(() => validateReleaseIdentity({ ...input, tag: 'v00.2.0' })).toThrow(/vX.Y.Z/);
    expect(() => validateReleaseIdentity({ ...input, tag: 'v0.3.0' })).toThrow(/does not match/);
    expect(() => validateReleaseIdentity({ ...input, tag: 'v0.2.0', isMainAncestor: false })).toThrow(/ancestor/);
  });

  it('resolves lightweight and annotated remote tags to their final commit', () => {
    const tag = 'v0.2.0';
    const tagObject = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(buildRemoteTagRefs(tag)).toEqual([`refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
    expect(resolveRemoteTagCommit(`${sha}\trefs/tags/${tag}\n`, tag)).toBe(sha);
    expect(resolveRemoteTagCommit(`${tagObject}\trefs/tags/${tag}\n${sha.toUpperCase()}\trefs/tags/${tag}^{}\n`, tag)).toBe(
      sha
    );
    expect(
      validateRemoteTagBinding({
        tag,
        commit: sha,
        output: `${tagObject}\trefs/tags/${tag}\n${sha}\trefs/tags/${tag}^{}\n`,
      })
    ).toBe(sha);
  });

  it('rejects missing, moved, malformed, and failed remote tag lookups', () => {
    const tag = 'v0.2.0';
    expect(() => resolveRemoteTagCommit('', tag)).toThrow(/does not exist/);
    expect(() => validateRemoteTagBinding({ tag, commit: sha, output: `${newerMainSha}\trefs/tags/${tag}\n` })).toThrow(
      /instead of workflow commit/
    );
    expect(() => resolveRemoteTagCommit(`invalid\trefs/tags/${tag}\n`, tag)).toThrow(/unexpected/);
    expect(() => buildRemoteTagRefs('v0.2')).toThrow(/vX.Y.Z/);
    expect(() => assertCommandSucceeded({ status: 128, stderr: 'fatal: unavailable' }, 'Reading remote release tag')).toThrow(
      /unavailable/
    );
    expect(() =>
      assertCommandSucceeded({ status: null, error: new Error('spawn failed') }, 'Reading remote release tag')
    ).toThrow(/spawn failed/);
  });

  it('builds the scoped npm version endpoint', () => {
    expect(buildRegistryVersionUrl('@admin9-labs/admin9-ui', '0.2.0')).toBe(
      'https://registry.npmjs.org/%40admin9-labs%2Fadmin9-ui/0.2.0'
    );
    expect(buildRegistryPackageUrl('@admin9-labs/admin9-ui')).toBe('https://registry.npmjs.org/%40admin9-labs%2Fadmin9-ui');
  });

  it('accepts only the already-published tarball with identical integrity', () => {
    const expected = {
      packageName: '@admin9-labs/admin9-ui',
      packageVersion: '0.2.0',
      integrity: 'sha512-local',
    };
    const metadata = {
      name: expected.packageName,
      version: expected.packageVersion,
      dist: { integrity: expected.integrity },
    };
    expect(() => assertPublishedMetadata(metadata, expected)).not.toThrow();
    expect(() => assertPublishedMetadata({ ...metadata, dist: { integrity: 'sha512-other' } }, expected)).toThrow(
      /integrity differs/
    );
  });

  it('requires the stable latest dist-tag to point to this version', () => {
    const expected = { packageName: '@admin9-labs/admin9-ui', packageVersion: '0.2.0' };
    expect(() =>
      assertLatestDistTag({ 'name': expected.packageName, 'dist-tags': { latest: expected.packageVersion } }, expected)
    ).not.toThrow();
    expect(() => assertLatestDistTag({ 'name': expected.packageName, 'dist-tags': { latest: '0.1.0' } }, expected)).toThrow(
      /latest/
    );
  });

  it('binds SLSA provenance to the tarball, repository, workflow, tag, and commit', () => {
    const integrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
    const expected = {
      packageName: '@admin9-labs/admin9-ui',
      packageVersion: '0.2.0',
      integrity,
      repository: 'admin9-labs/admin9-ui',
      workflowPath: '.github/workflows/release.yml',
      tag: 'v0.2.0',
      commit: sha,
    };
    const provenance = buildProvenance({ integrity });
    expect(() => assertProvenanceAttestation(provenance, expected)).not.toThrow();
    expect(() => assertProvenanceAttestation(provenance, { ...expected, commit: newerMainSha })).toThrow(/commit/);
    expect(() => assertProvenanceAttestation(provenance, { ...expected, workflowPath: '.github/workflows/other.yml' })).toThrow(
      /workflow identity/
    );
    expect(() =>
      assertProvenanceAttestation(provenance, {
        ...expected,
        integrity: `sha512-${Buffer.alloc(64, 8).toString('base64')}`,
      })
    ).toThrow(/subject/);
  });

  it('classifies published and draft releases with the exact asset', () => {
    const expected = {
      tag: 'v0.2.0',
      assetName: 'admin9-labs-admin9-ui-0.2.0.tgz',
      assetSize: 123,
      assetDigest: `sha256:${'a'.repeat(64)}`,
      releaseNotes: '### Added\n\n- Release notes.',
    };
    const metadata = {
      tag_name: expected.tag,
      body: expected.releaseNotes,
      draft: false,
      prerelease: false,
      assets: [
        {
          name: expected.assetName,
          state: 'uploaded',
          size: expected.assetSize,
          digest: expected.assetDigest,
        },
      ],
    };
    expect(() => assertGitHubRelease(metadata, expected)).not.toThrow();
    expect(getGitHubReleaseDisposition(null, expected)).toBe('create');
    expect(getGitHubReleaseDisposition(metadata, expected)).toBe('skip');
    expect(getGitHubReleaseDisposition({ ...metadata, draft: true }, expected)).toBe('promote');
    expect(() => assertGitHubRelease({ ...metadata, draft: true }, expected)).toThrow(/draft/);
    expect(() => getGitHubReleaseDisposition({ ...metadata, prerelease: true }, expected)).toThrow(/prerelease/);
    expect(() => assertGitHubRelease({ ...metadata, prerelease: true }, expected)).toThrow(/stable/);
  });

  it('rejects conflicting or incomplete GitHub Releases', () => {
    const expected = {
      tag: 'v0.2.0',
      assetName: 'admin9-labs-admin9-ui-0.2.0.tgz',
      assetSize: 123,
      assetDigest: `sha256:${'a'.repeat(64)}`,
      releaseNotes: '### Added\n\n- Release notes.',
    };
    const metadata = {
      tag_name: expected.tag,
      body: expected.releaseNotes,
      draft: false,
      prerelease: false,
      assets: [
        {
          name: expected.assetName,
          state: 'uploaded',
          size: expected.assetSize,
          digest: expected.assetDigest,
        },
      ],
    };
    expect(() =>
      assertGitHubRelease({ ...metadata, assets: [{ ...metadata.assets[0], digest: `sha256:${'b'.repeat(64)}` }] }, expected)
    ).toThrow(/does not match/);
    expect(() => assertGitHubRelease({ ...metadata, tag_name: 'v0.1.0' }, expected)).toThrow(/does not belong/);
    expect(() => assertGitHubRelease({ ...metadata, body: 'Different notes.' }, expected)).toThrow(/do not match CHANGELOG/);
    expect(() => getGitHubReleaseDisposition({ ...metadata, body: 'Different notes.' }, expected)).toThrow(
      /do not match CHANGELOG/
    );
    expect(() => getGitHubReleaseDisposition({ ...metadata, draft: undefined }, expected)).toThrow(/draft state/);
  });

  it('retries require-existing checks until the release is published', async () => {
    const dispositions = ['promote', 'promote', 'skip'];
    let attempt = 0;
    const disposition = await retry(
      async () => {
        const current = dispositions[attempt];
        attempt += 1;
        return requirePublishedGitHubRelease(current, 'v0.2.0');
      },
      { attempts: 3, delayMs: 0 }
    );

    expect(disposition).toBe('skip');
    expect(attempt).toBe(3);
  });
});

describe('release command ownership', () => {
  it('runs each release gate exactly once', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts.build).toBe('vite build --config vite.config.lib.ts');
    expect(packageJson.scripts['release:check'].split(' && ')).toEqual([
      'pnpm run changelog:check',
      'pnpm run type:check',
      'pnpm run acceptance:typecheck',
      'pnpm run lint',
      'pnpm test',
      'pnpm run acceptance:build',
      'pnpm run verify:tarball',
    ]);
    expect(packageJson.scripts['pack:check']).toBeUndefined();

    const verifier = readFileSync(join(packageRoot, 'scripts', 'verify-tarball.mjs'), 'utf8');
    expect(packageJson.files).toContain('CHANGELOG.md');
    expect(verifier).toMatch(/'CHANGELOG\.md'/);
    expect(verifier.match(/run\('pnpm', \['run', 'build'\], \{ cwd: packageRoot \}\)/g)).toHaveLength(1);
    expect(verifier.match(/execFileSync\('npm', \['pack'/g)).toHaveLength(1);

    const ciWorkflow = readFileSync(join(packageRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ciWorkflow.match(/pnpm run release:check/g)).toHaveLength(1);
    expect(ciWorkflow).not.toMatch(/pnpm run build|pack:check/);

    const releaseWorkflow = readFileSync(join(packageRoot, '.github', 'workflows', 'release.yml'), 'utf8');
    const releaseIdentityCheck = readFileSync(join(packageRoot, 'scripts', 'check-release.mjs'), 'utf8');
    expect(releaseWorkflow).toMatch(/concurrency:\n {2}group: release\n {2}cancel-in-progress: false/);
    expect(releaseIdentityCheck).toMatch(/git.*merge-base.*--is-ancestor/s);
    expect(releaseWorkflow).toMatch(/permissions:\n {6}contents: read\n {6}id-token: write/);
    expect(releaseWorkflow).toMatch(/permissions:\n {6}contents: write/);
    expect(releaseWorkflow.match(/sha256sum --check SHA256SUMS/g)).toHaveLength(2);
    expect(releaseWorkflow).toMatch(
      /npm publish "\.\/\$\{\{ steps\.registry\.outputs\.tarball \}\}" --access public --provenance/
    );
    const changelogGatePosition = releaseWorkflow.indexOf('run: pnpm run changelog:check');
    const npmPublishPosition = releaseWorkflow.indexOf('npm publish');
    expect(changelogGatePosition).toBeGreaterThan(-1);
    expect(releaseWorkflow.match(/pnpm run changelog:check/g)).toHaveLength(1);
    expect(npmPublishPosition).toBeGreaterThan(changelogGatePosition);
    expect(releaseWorkflow).toMatch(/verify-published-package\.mjs/);
    expect(releaseWorkflow).toMatch(/check-github-release-status\.mjs/);
    expect(releaseWorkflow).toMatch(/check-changelog\.mjs --release "\$GITHUB_REF_NAME" > release-notes\.md/);
    expect(releaseWorkflow).toMatch(/gh release create[\s\S]*--notes-file release-notes\.md/);
    expect(releaseWorkflow).not.toMatch(/--generate-notes/);
    expect(releaseWorkflow.match(/--notes-file release-notes\.md/g)).toHaveLength(3);
    expect(releaseWorkflow.match(/--remote-tag/g)).toHaveLength(2);
    expect(releaseWorkflow).toMatch(
      /Revalidate remote tag before npm publication[\s\S]*Check npm publication state[\s\S]*Publish verified tarball to npm/
    );
    expect(releaseWorkflow).toMatch(
      /Revalidate remote tag before GitHub Release[\s\S]*Check GitHub Release state[\s\S]*Create GitHub Release/
    );
    expect(releaseWorkflow).toMatch(/outputs\.disposition == 'create'/);
    expect(releaseWorkflow).toMatch(/outputs\.disposition == 'promote'/);
    expect(releaseWorkflow).toMatch(/gh release edit "\$GITHUB_REF_NAME" --draft=false --prerelease=false --verify-tag/);
    expect(releaseWorkflow).toMatch(/check-github-release-status\.mjs[\s\S]*--require-existing/);
    expect(releaseWorkflow).not.toMatch(/--clobber/);
  });
});
