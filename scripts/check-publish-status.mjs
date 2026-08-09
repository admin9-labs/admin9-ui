import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPublishedMetadata,
  buildRegistryVersionUrl,
  calculateSha512Integrity,
  findSingleTarball,
  resolveOutputDirectory,
} from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--tarball-dir') {
  throw new Error('Usage: check-publish-status.mjs --tarball-dir <repository-child-directory>');
}

const outputDirectory = resolveOutputDirectory(['--output-dir', args[1]], packageRoot);
const tarballPath = await findSingleTarball(outputDirectory);
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const localIntegrity = await calculateSha512Integrity(tarballPath);
const registryUrl = buildRegistryVersionUrl(packageJson.name, packageJson.version);
const response = await fetch(registryUrl, {
  headers: { accept: 'application/json' },
});

let published = false;
if (response.status === 404) {
  published = false;
} else if (response.ok) {
  const metadata = await response.json();
  assertPublishedMetadata(metadata, {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    integrity: localIntegrity,
  });
  published = true;
} else {
  throw new Error(`npm registry request failed with status ${response.status}.`);
}

const relativeTarball = relative(packageRoot, tarballPath).split(sep).join('/');
process.stdout.write(`version=${packageJson.version}\ntarball=${relativeTarball}\npublished=${published}\n`);
