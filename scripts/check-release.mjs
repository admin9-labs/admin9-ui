import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertCommandSucceeded,
  buildRemoteTagRefs,
  validateReleaseIdentity,
  validateRemoteTagBinding,
} from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function parseOptions(input, expectedOptions, usage) {
  if (input.length !== expectedOptions.length * 2) throw new Error(usage);
  const values = new Map();
  for (let index = 0; index < input.length; index += 2) {
    const option = input[index];
    const value = input[index + 1];
    if (!expectedOptions.includes(option) || values.has(option) || !value) {
      throw new Error(`Invalid release option: ${option}`);
    }
    values.set(option, value);
  }
  expectedOptions.forEach((option) => {
    if (!values.has(option)) throw new Error(`Missing release option: ${option}`);
  });
  return values;
}

if (args[0] === '--remote-tag') {
  const expectedOptions = ['--tag', '--commit'];
  const values = parseOptions(
    args.slice(1),
    expectedOptions,
    'Usage: check-release.mjs --remote-tag --tag <tag> --commit <commit>'
  );
  const tag = values.get('--tag');
  const commit = values.get('--commit');
  const remoteTag = spawnSync('git', ['ls-remote', '--tags', 'origin', ...buildRemoteTagRefs(tag)], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  const output = assertCommandSucceeded(remoteTag, `Reading remote release tag ${tag}`);
  const remoteCommit = validateRemoteTagBinding({ tag, commit, output });
  process.stdout.write(`remote_tag_commit=${remoteCommit}\n`);
  process.exit(0);
}

const expectedOptions = ['--tag', '--commit', '--checkout-head', '--main-head'];
const values = parseOptions(
  args,
  expectedOptions,
  `Usage: check-release.mjs ${expectedOptions.map((option) => `${option} <value>`).join(' ')}`
);

const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', values.get('--commit'), values.get('--main-head')], {
  cwd: packageRoot,
  encoding: 'utf8',
});
if (ancestry.error || (ancestry.status !== 0 && ancestry.status !== 1)) {
  const detail = ancestry.error?.message ?? ancestry.stderr.trim();
  throw new Error(`Unable to compare the release commit with remote main: ${detail}`);
}

const version = validateReleaseIdentity({
  tag: values.get('--tag'),
  packageVersion: packageJson.version,
  commit: values.get('--commit'),
  checkoutHead: values.get('--checkout-head'),
  mainHead: values.get('--main-head'),
  isMainAncestor: ancestry.status === 0,
});

process.stdout.write(`version=${version}\n`);
