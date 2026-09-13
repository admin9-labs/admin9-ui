/* eslint-disable no-console */
import { spawnSync } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOutputDirectory } from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolveOutputDirectory(process.argv.slice(2), packageRoot);
const pnpm = ['pnpm@10.5.2'];

function run(args) {
  console.log(`\n> corepack ${[...pnpm, ...args].join(' ')}`);
  const result = spawnSync('corepack', [...pnpm, ...args], {
    cwd: packageRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`corepack ${[...pnpm, ...args].join(' ')} exited with status ${result.status}`);
}

run(['--version']);
run(['run', 'changelog:check']);
run(['run', 'type:check']);
run(['run', 'acceptance:typecheck']);
run(['run', 'lint']);
run(['test']);
run(['run', 'acceptance:build']);
run(['run', 'verify:tarball', ...(outputDirectory ? ['--', '--output-dir', basename(outputDirectory)] : [])]);
