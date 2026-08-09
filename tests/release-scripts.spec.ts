import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertPublishedMetadata,
  buildRegistryVersionUrl,
  ensureEmptyOutputDirectory,
  findSingleTarball,
  resolveOutputDirectory,
  validateReleaseIdentity,
} from '../scripts/release-utils.mjs';

const temporaryRoots: string[] = [];
const sha = '0123456789abcdef0123456789abcdef01234567';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  it('accepts a canonical tag on the exact main head', () => {
    expect(
      validateReleaseIdentity({
        tag: 'v0.2.0',
        packageVersion: '0.2.0',
        commit: sha,
        checkoutHead: sha,
        mainHead: sha,
      })
    ).toBe('0.2.0');
  });

  it('rejects malformed tags, version mismatches, and non-main commits', () => {
    const input = { packageVersion: '0.2.0', commit: sha, checkoutHead: sha, mainHead: sha };
    expect(() => validateReleaseIdentity({ ...input, tag: 'v0.2' })).toThrow(/vX.Y.Z/);
    expect(() => validateReleaseIdentity({ ...input, tag: 'v00.2.0' })).toThrow(/vX.Y.Z/);
    expect(() => validateReleaseIdentity({ ...input, tag: 'v0.3.0' })).toThrow(/does not match/);
    expect(() => validateReleaseIdentity({ ...input, tag: 'v0.2.0', mainHead: 'f'.repeat(40) })).toThrow(
      /exact remote main HEAD/
    );
  });

  it('builds the scoped npm version endpoint', () => {
    expect(buildRegistryVersionUrl('@admin9-labs/admin9-ui', '0.2.0')).toBe(
      'https://registry.npmjs.org/%40admin9-labs%2Fadmin9-ui/0.2.0'
    );
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
});

describe('release command ownership', () => {
  it('runs each release gate exactly once', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts.build).toBe('vite build --config vite.config.lib.ts');
    expect(packageJson.scripts['release:check'].split(' && ')).toEqual([
      'pnpm run type:check',
      'pnpm run acceptance:typecheck',
      'pnpm run lint',
      'pnpm test',
      'pnpm run acceptance:build',
      'pnpm run verify:tarball',
    ]);
    expect(packageJson.scripts['pack:check']).toBeUndefined();

    const verifier = readFileSync(join(packageRoot, 'scripts', 'verify-tarball.mjs'), 'utf8');
    expect(verifier.match(/run\('pnpm', \['run', 'build'\], \{ cwd: packageRoot \}\)/g)).toHaveLength(1);
    expect(verifier.match(/execFileSync\('npm', \['pack'/g)).toHaveLength(1);

    const ciWorkflow = readFileSync(join(packageRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ciWorkflow.match(/pnpm run release:check/g)).toHaveLength(1);
    expect(ciWorkflow).not.toMatch(/pnpm run build|pack:check/);
  });
});
