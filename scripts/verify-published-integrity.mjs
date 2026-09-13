import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPublishedMetadata,
  buildRegistryVersionUrl,
  calculateSha512Integrity,
  findSingleTarball,
  resolveOutputDirectory,
  retry,
} from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--tarball-dir') {
  throw new Error('Usage: verify-published-integrity.mjs --tarball-dir <repository-child-directory>');
}
const outputDirectory = resolveOutputDirectory(['--output-dir', args[1]], packageRoot);
const tarballPath = await findSingleTarball(outputDirectory);
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const integrity = await calculateSha512Integrity(tarballPath);
const registryUrl = buildRegistryVersionUrl(packageJson.name, packageJson.version);

await retry(
  async () => {
    const response = await fetch(registryUrl, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500) {
      const error = new Error(`The published package is not available from the npm registry (status ${response.status}).`);
      error.retryable = true;
      throw error;
    }
    if (!response.ok) throw new Error(`npm registry request failed with status ${response.status}.`);
    assertPublishedMetadata(await response.json(), {
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      integrity,
    });
  },
  { attempts: 6, delayMs: 2000, shouldRetry: (error) => error.retryable === true }
);
process.stdout.write(`Verified npm integrity for ${packageJson.name}@${packageJson.version}.\n`);
