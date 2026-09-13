import { readFileSync } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateSha256Digest,
  calculateSha512Integrity,
  findSingleTarball,
  resolveOutputDirectory,
  validateReleaseArtifactMetadata,
} from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedOptions = ['--tarball-dir', '--repository', '--workflow', '--run-id', '--run-attempt', '--commit'];
const values = new Map();
const args = process.argv.slice(2);
if (args.length !== expectedOptions.length * 2) throw new Error('Invalid release artifact verification arguments.');
for (let index = 0; index < args.length; index += 2) {
  if (!expectedOptions.includes(args[index]) || values.has(args[index]) || !args[index + 1]) {
    throw new Error(`Invalid release artifact verification option: ${args[index]}`);
  }
  values.set(args[index], args[index + 1]);
}

const outputDirectory = resolveOutputDirectory(['--output-dir', values.get('--tarball-dir')], packageRoot);
const tarballPath = await findSingleTarball(outputDirectory);
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const metadata = JSON.parse(readFileSync(resolve(outputDirectory, 'release-metadata.json'), 'utf8'));
const stats = await lstat(tarballPath);
const sha256 = await calculateSha256Digest(tarballPath);
const integrity = await calculateSha512Integrity(tarballPath);

validateReleaseArtifactMetadata(metadata, {
  repository: values.get('--repository'),
  workflow: values.get('--workflow'),
  runId: Number(values.get('--run-id')),
  runAttempt: Number(values.get('--run-attempt')),
  headSha: values.get('--commit'),
  packageName: packageJson.name,
  packageVersion: packageJson.version,
  filename: basename(tarballPath),
  size: stats.size,
  sha256,
  integrity,
});

const expectedChecksums = `${sha256.slice('sha256:'.length)}  ${basename(tarballPath)}\n`;
if (readFileSync(resolve(outputDirectory, 'SHA256SUMS'), 'utf8') !== expectedChecksums) {
  throw new Error('SHA256SUMS does not match the verified release tarball.');
}
process.stdout.write(`Verified CI release artifact for ${packageJson.name}@${packageJson.version}.\n`);
