import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractReleaseNotes, normalizeReleaseNotes, parseChangelog, validateChangelog } from '../scripts/changelog.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const validChangelog = `# Changelog

## [Unreleased]

## [0.3.1] - 2026-08-11

### Fixed

- 当前修复。

## [0.3.0] - 2026-08-10

### Added

- 历史功能。
`;

describe('changelog release notes', () => {
  it('validates the current version and extracts historical release notes', () => {
    const changelog = validateChangelog(validChangelog, '0.3.1');

    expect(changelog.releases.map((release) => release.version)).toEqual(['0.3.1', '0.3.0']);
    expect(extractReleaseNotes(validChangelog, 'v0.3.0')).toBe('### Added\n\n- 历史功能。');
  });

  it('normalizes only line endings and surrounding whitespace', () => {
    expect(normalizeReleaseNotes('\r\n### Fixed\r\n\r\n- Item.\r\n')).toBe('### Fixed\n\n- Item.');
    expect(normalizeReleaseNotes('### Fixed\n\n-  Item.')).not.toBe(normalizeReleaseNotes('### Fixed\n\n- Item.'));
  });

  it('requires a section for the current package version', () => {
    expect(() => validateChangelog(validChangelog, '0.3.2')).toThrow(/missing the current package version 0.3.2/);
  });

  it('rejects duplicate and empty release sections', () => {
    expect(() => parseChangelog(`${validChangelog}\n## [0.3.0] - 2026-08-10\n\n### Fixed\n\n- Duplicate.\n`)).toThrow(
      /Duplicate changelog release/
    );
    expect(() => parseChangelog('# Changelog\n\n## [Unreleased]\n\n## [0.3.1] - 2026-08-11\n')).toThrow(/must not be empty/);
  });

  it('rejects malformed headings and impossible dates', () => {
    expect(() => parseChangelog(validChangelog.replace('[0.3.1] - 2026-08-11', '[v0.3.1] - 2026-08-11'))).toThrow(
      /Invalid changelog release heading/
    );
    expect(() => parseChangelog(validChangelog.replace('2026-08-11', '2026-02-30'))).toThrow(/Invalid changelog release date/);
    expect(() => extractReleaseNotes(validChangelog, 'v0.3')).toThrow(/canonical vX.Y.Z/);
  });

  it('requires versions and dates to be ordered newest first', () => {
    const wrongVersionOrder = validChangelog.replace('[0.3.1] - 2026-08-11', '[0.2.9] - 2026-08-11');
    expect(() => parseChangelog(wrongVersionOrder)).toThrow(/newest to oldest version/);

    const wrongDateOrder = validChangelog.replace('2026-08-11', '2026-08-09');
    expect(() => parseChangelog(wrongDateOrder)).toThrow(/release dates must be ordered/);
  });

  it('requires exactly one leading Unreleased section', () => {
    expect(() => parseChangelog(validChangelog.replace('## [Unreleased]\n\n', ''))).toThrow(/must start/);
    expect(() => parseChangelog(`${validChangelog}\n## [Unreleased]\n`)).toThrow(/exactly one/);
  });

  it('exposes check and release modes through the CLI', () => {
    const check = spawnSync(process.execPath, ['scripts/check-changelog.mjs', '--check'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    expect(check.status).toBe(0);
    expect(check.stdout).toMatch(/Validated 7 changelog releases through 0\.6\.0/);

    const release = spawnSync(process.execPath, ['scripts/check-changelog.mjs', '--release', 'v0.6.0'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    expect(release.status).toBe(0);
    expect(release.stdout).toContain('移除独立的 `AMediaPicker`、`AMediaLibrary`');
    expect(release.stdout).not.toContain('## [0.6.0]');

    const invalid = spawnSync(process.execPath, ['scripts/check-changelog.mjs', '--unknown'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/Usage: check-changelog/);
  });
});
