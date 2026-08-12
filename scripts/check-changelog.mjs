import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReleaseNotes, validateChangelog } from './changelog.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(packageRoot, 'CHANGELOG.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

if (args.length === 1 && args[0] === '--check') {
  const changelog = validateChangelog(source, packageJson.version);
  process.stdout.write(`Validated ${changelog.releases.length} changelog releases through ${packageJson.version}.\n`);
} else if (args.length === 2 && args[0] === '--release') {
  validateChangelog(source, packageJson.version);
  process.stdout.write(`${extractReleaseNotes(source, args[1])}\n`);
} else {
  throw new Error('Usage: check-changelog.mjs --check | --release <vX.Y.Z>');
}
