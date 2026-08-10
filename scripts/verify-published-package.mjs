import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertLatestDistTag,
  assertProvenanceAttestation,
  assertPublishedMetadata,
  buildRegistryPackageUrl,
  buildRegistryVersionUrl,
  calculateSha512Integrity,
  findSingleTarball,
  resolveOutputDirectory,
  retry,
} from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedOptions = ['--tarball-dir', '--tag', '--commit', '--repository', '--workflow'];
const args = process.argv.slice(2);

if (args.length !== expectedOptions.length * 2) {
  throw new Error(`Usage: verify-published-package.mjs ${expectedOptions.map((option) => `${option} <value>`).join(' ')}`);
}

const values = new Map();
for (let index = 0; index < args.length; index += 2) {
  const option = args[index];
  const value = args[index + 1];
  if (!expectedOptions.includes(option) || values.has(option) || !value) throw new Error(`Invalid option: ${option}`);
  values.set(option, value);
}

const outputDirectory = resolveOutputDirectory(['--output-dir', values.get('--tarball-dir')], packageRoot);
const tarballPath = await findSingleTarball(outputDirectory);
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const integrity = await calculateSha512Integrity(tarballPath);
const versionUrl = buildRegistryVersionUrl(packageJson.name, packageJson.version);
const packageUrl = buildRegistryPackageUrl(packageJson.name);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Registry request failed with status ${response.status}: ${url}`);
  return response.json();
}

await retry(
  async (attempt) => {
    try {
      const versionMetadata = await fetchJson(versionUrl);
      assertPublishedMetadata(versionMetadata, {
        packageName: packageJson.name,
        packageVersion: packageJson.version,
        integrity,
      });

      const packageMetadata = await fetchJson(packageUrl);
      assertLatestDistTag(packageMetadata, {
        packageName: packageJson.name,
        packageVersion: packageJson.version,
      });

      const attestationsUrl = new URL(versionMetadata.dist?.attestations?.url ?? '');
      if (
        attestationsUrl.origin !== 'https://registry.npmjs.org' ||
        !attestationsUrl.pathname.startsWith('/-/npm/v1/attestations/')
      ) {
        throw new Error('The npm registry returned an invalid provenance URL.');
      }
      const attestations = await fetchJson(attestationsUrl);
      assertProvenanceAttestation(attestations, {
        packageName: packageJson.name,
        packageVersion: packageJson.version,
        integrity,
        repository: values.get('--repository'),
        workflowPath: values.get('--workflow'),
        tag: values.get('--tag'),
        commit: values.get('--commit'),
      });
    } catch (error) {
      process.stderr.write(`Registry verification attempt ${attempt} failed: ${error.message}\n`);
      throw error;
    }
  },
  { attempts: 8, delayMs: 3000 }
);

process.stdout.write(`Verified npm ${packageJson.name}@${packageJson.version}, latest, integrity, and SLSA provenance.\n`);
