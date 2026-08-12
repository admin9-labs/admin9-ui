const RELEASE_HEADING = /^\[(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\] - (\d{4}-\d{2}-\d{2})$/;
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function normalizeReleaseNotes(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Invalid changelog release date: ${value}`);
  }
  return date.getTime();
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function parseChangelog(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const headings = [];

  lines.forEach((line, index) => {
    if (!line.startsWith('## ')) return;
    const heading = line.slice(3);
    if (heading === '[Unreleased]') {
      headings.push({ kind: 'unreleased', line: index });
      return;
    }

    const match = RELEASE_HEADING.exec(heading);
    if (!match) throw new Error(`Invalid changelog release heading on line ${index + 1}: ${line}`);
    headings.push({
      kind: 'release',
      line: index,
      version: `${match[1]}.${match[2]}.${match[3]}`,
      versionParts: [Number(match[1]), Number(match[2]), Number(match[3])],
      date: match[4],
      dateValue: parseDate(match[4]),
    });
  });

  if (headings.length === 0 || headings[0].kind !== 'unreleased') {
    throw new Error('CHANGELOG.md must start its version sections with ## [Unreleased].');
  }
  if (headings.filter((heading) => heading.kind === 'unreleased').length !== 1) {
    throw new Error('CHANGELOG.md must contain exactly one ## [Unreleased] section.');
  }

  const releases = [];
  const seenVersions = new Set();
  headings.forEach((heading, index) => {
    if (heading.kind !== 'release') return;
    if (seenVersions.has(heading.version)) {
      throw new Error(`Duplicate changelog release: ${heading.version}`);
    }
    seenVersions.add(heading.version);

    const nextLine = headings[index + 1]?.line ?? lines.length;
    const body = normalizeReleaseNotes(lines.slice(heading.line + 1, nextLine).join('\n'));
    if (!body) throw new Error(`Changelog release ${heading.version} must not be empty.`);
    releases.push({ ...heading, body });
  });

  for (let index = 1; index < releases.length; index += 1) {
    const previous = releases[index - 1];
    const current = releases[index];
    if (compareVersions(previous.versionParts, current.versionParts) <= 0) {
      throw new Error('Changelog releases must be ordered from newest to oldest version.');
    }
    if (previous.dateValue < current.dateValue) {
      throw new Error('Changelog release dates must be ordered from newest to oldest.');
    }
  }

  return { releases };
}

export function validateChangelog(source, currentVersion) {
  const changelog = parseChangelog(source);
  if (!RELEASE_HEADING.test(`[${currentVersion}] - 2000-01-01`)) {
    throw new Error(`Package version must use canonical X.Y.Z form: ${currentVersion}`);
  }
  if (!changelog.releases.some((release) => release.version === currentVersion)) {
    throw new Error(`CHANGELOG.md is missing the current package version ${currentVersion}.`);
  }
  return changelog;
}

export function extractReleaseNotes(source, tag) {
  const match = RELEASE_TAG.exec(tag);
  if (!match) throw new Error(`Release tag must use canonical vX.Y.Z form: ${tag}`);
  const version = `${match[1]}.${match[2]}.${match[3]}`;
  const changelog = parseChangelog(source);
  const release = changelog.releases.find((entry) => entry.version === version);
  if (!release) throw new Error(`CHANGELOG.md does not contain release ${version}.`);
  return release.body;
}
