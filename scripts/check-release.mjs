import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseIdentity } from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedOptions = ['--tag', '--commit', '--checkout-head', '--main-head'];
const args = process.argv.slice(2);

if (args.length !== expectedOptions.length * 2) {
  throw new Error(`Usage: check-release.mjs ${expectedOptions.map((option) => `${option} <value>`).join(' ')}`);
}

const values = new Map();
for (let index = 0; index < args.length; index += 2) {
  const option = args[index];
  const value = args[index + 1];
  if (!expectedOptions.includes(option) || values.has(option) || !value) throw new Error(`Invalid release option: ${option}`);
  values.set(option, value);
}
expectedOptions.forEach((option) => {
  if (!values.has(option)) throw new Error(`Missing release option: ${option}`);
});

const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const version = validateReleaseIdentity({
  tag: values.get('--tag'),
  packageVersion: packageJson.version,
  commit: values.get('--commit'),
  checkoutHead: values.get('--checkout-head'),
  mainHead: values.get('--main-head'),
});

process.stdout.write(`version=${version}\n`);
