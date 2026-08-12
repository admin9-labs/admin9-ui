/* eslint-disable no-console */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureEmptyOutputDirectory, resolveOutputDirectory } from './release-utils.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(packageRoot, 'tests', 'consumer-fixture');
const hostBaseline = JSON.parse(readFileSync(join(fixtureRoot, 'host-baseline.json'), 'utf8'));
const retainedOutputDirectory = resolveOutputDirectory(process.argv.slice(2), packageRoot);
const temporaryRoot = await mkdtemp(join(tmpdir(), 'admin9-ui-consumer-'));
const tarballDirectory = retainedOutputDirectory ?? join(temporaryRoot, 'tarball');
const consumerDirectory = join(temporaryRoot, 'consumer');
let createdTarballPath;
let verified = false;
const runtimeEnv = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: consumerDirectory,
    env: runtimeEnv,
    stdio: 'inherit',
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

try {
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8', env: runtimeEnv }).trim();
  assert(
    nodeMajor === Number(hostBaseline.node),
    `Host baseline requires Node ${hostBaseline.node}; found ${process.versions.node}.`
  );
  assert(pnpmVersion === hostBaseline.pnpm, `Host baseline requires pnpm ${hostBaseline.pnpm}; found ${pnpmVersion}.`);
  assert(existsSync(fixtureRoot), `Consumer fixture is missing: ${fixtureRoot}`);
  assert(existsSync(join(fixtureRoot, 'pnpm-lock.yaml')), 'Consumer fixture lockfile is missing.');

  if (retainedOutputDirectory) await ensureEmptyOutputDirectory(retainedOutputDirectory);

  run('pnpm', ['run', 'build'], { cwd: packageRoot });

  await cp(fixtureRoot, consumerDirectory, { recursive: true });
  if (!retainedOutputDirectory) await mkdir(tarballDirectory);

  console.log(
    `Using host baseline ${hostBaseline.consumerRepository}@${hostBaseline.consumerCommit} with Node ${process.versions.node} and pnpm ${pnpmVersion}.`
  );
  console.log('\n> npm pack . --json --pack-destination <temporary-directory>');
  const packOutput = execFileSync('npm', ['pack', '.', '--json', '--pack-destination', tarballDirectory], {
    cwd: packageRoot,
    encoding: 'utf8',
    env: runtimeEnv,
  });
  const packResult = JSON.parse(packOutput);
  assert(Array.isArray(packResult) && packResult.length === 1, 'npm pack did not return exactly one package.');

  const packed = packResult[0];
  assert(
    packed.filename === basename(packed.filename) && packed.filename.endsWith('.tgz'),
    'npm pack returned an unsafe filename.'
  );
  const tarballPath = join(tarballDirectory, packed.filename);
  createdTarballPath = tarballPath;
  assert(existsSync(tarballPath), `npm pack did not create ${tarballPath}.`);

  const packedFiles = new Set(packed.files.map((file) => file.path));
  const requiredFiles = [
    'package.json',
    'CHANGELOG.md',
    'dist/index.js',
    'dist/index.cjs',
    'dist/index.d.ts',
    'dist/locale/index.js',
    'dist/locale/index.cjs',
    'dist/locale/index.d.ts',
    'dist/style.css',
    'docs/components/file-manager.md',
    'docs/components/file-picker.md',
    'docs/components/icon-picker.md',
    'docs/components/tiptap-editor.md',
  ];
  requiredFiles.forEach((file) => assert(packedFiles.has(file), `Tarball is missing required file: ${file}`));
  const forbiddenPrefixes = ['src/', 'tests/', 'scripts/', 'node_modules/', 'dist/acceptance-host/'];
  packed.files.forEach((file) => {
    assert(
      !forbiddenPrefixes.some((prefix) => file.path.startsWith(prefix)),
      `Tarball unexpectedly includes development content: ${file.path}`
    );
  });

  run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts']);
  run('pnpm', ['add', tarballPath, '--save-exact', '--strict-peer-dependencies', '--ignore-scripts']);

  const sourcePackage = readJson(join(packageRoot, 'package.json'));
  const installedPackagePath = join(consumerDirectory, 'node_modules', '@admin9-labs', 'admin9-ui', 'package.json');
  const installedPackage = readJson(installedPackagePath);
  assert(installedPackage.name === sourcePackage.name, 'Installed tarball has the wrong package name.');
  assert(installedPackage.version === sourcePackage.version, 'Installed tarball has the wrong package version.');
  assert(
    JSON.stringify(installedPackage.peerDependencies) === JSON.stringify(sourcePackage.peerDependencies),
    'Installed tarball peerDependencies differ from the source package.'
  );
  ['vue', '@arco-design/web-vue', 'vue-i18n'].forEach((peer) => {
    assert(installedPackage.peerDependencies?.[peer], `Published package does not declare required peer: ${peer}`);
  });
  ['@tiptap/core', '@tiptap/pm', '@tiptap/starter-kit', '@tiptap/vue-3'].forEach((dependency) => {
    assert(installedPackage.dependencies?.[dependency], `Published package does not declare runtime dependency: ${dependency}`);
  });
  assert(installedPackage.exports?.['.']?.types, 'Root export is missing its types condition.');
  assert(installedPackage.exports?.['./locale']?.types, 'Locale export is missing its types condition.');
  assert(installedPackage.exports?.['./styles'], 'Styles export is missing.');
  assert(installedPackage.typesVersions?.['*']?.locale, 'Locale export is missing its TypeScript 4.9 mapping.');
  assert(!installedPackage.engines?.npm, 'Published package must not impose the library repository npm version on consumers.');
  assert(!installedPackage.packageManager, 'Published package must not expose a repository-only package-manager pin.');

  run('pnpm', ['list', '@admin9-labs/admin9-ui', 'vue', '@arco-design/web-vue', 'vue-i18n', '@tiptap/core', '@tiptap/pm']);
  run('pnpm', ['run', 'typecheck']);
  run('pnpm', ['run', 'build']);

  const builtAssetsDirectory = join(consumerDirectory, 'dist', 'assets');
  const cssAssets = (await readdir(builtAssetsDirectory))
    .filter((file) => file.endsWith('.css'))
    .map((file) => join(builtAssetsDirectory, file));
  assert(cssAssets.length > 0, 'Consumer build did not emit a CSS asset.');
  assert(
    cssAssets.some((path) => readFileSync(path, 'utf8').includes('.a9-')),
    'Consumer CSS asset does not contain admin9-ui styles.'
  );

  run('pnpm', ['run', 'smoke']);

  verified = true;
  console.log(`\nVerified ${packed.filename} (${packed.size} bytes) in the single host-baseline consumer.`);
  if (retainedOutputDirectory) console.log(`Retained verified tarball at ${tarballPath}.`);
} finally {
  if (retainedOutputDirectory && createdTarballPath && !verified) await rm(createdTarballPath, { force: true });
  await rm(temporaryRoot, { recursive: true, force: true });
}
