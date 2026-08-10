import type { TiptapAudioWidth, TiptapInlineImageSize, TiptapMediaAlign } from './types';

const protocolPattern = /^([a-z][a-z0-9+.-]*):/i;
const percentagePattern = /^(100|[1-9][0-9]?)%$/;
const inlineSizes: TiptapInlineImageSize[] = ['1em', '1.25em', '1.5em', '2em'];
const audioWidths: TiptapAudioWidth[] = ['compact', 'standard', 'full'];
const alignments: TiptapMediaAlign[] = ['left', 'center', 'right'];

const isIgnorableCharacter = (character: string) => {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint <= 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x2000 && codePoint <= 0x200d) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x2060 ||
    codePoint === 0xfeff
  );
};

export function isSafeMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = Array.from(value.trim())
    .filter((character) => !isIgnorableCharacter(character))
    .join('');
  if (!normalized) return false;
  const protocol = normalized.match(protocolPattern)?.[1]?.toLowerCase();
  return !protocol || protocol === 'http' || protocol === 'https';
}

export function normalizeBlockWidth(value: unknown, fallback = 'natural') {
  if (value === 'natural') return value;
  if (typeof value === 'string' && percentagePattern.test(value)) return value;
  return fallback;
}

export function normalizeInlineSize(value: unknown): TiptapInlineImageSize {
  return inlineSizes.includes(value as TiptapInlineImageSize) ? (value as TiptapInlineImageSize) : '1em';
}

export function normalizeAudioWidth(value: unknown): TiptapAudioWidth {
  return audioWidths.includes(value as TiptapAudioWidth) ? (value as TiptapAudioWidth) : 'standard';
}

export function normalizeMediaAlign(value: unknown): TiptapMediaAlign {
  return alignments.includes(value as TiptapMediaAlign) ? (value as TiptapMediaAlign) : 'left';
}
