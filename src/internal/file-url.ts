/** URLs rendered by file previews and download links. No executable or embedded document schemes. */
export default function safeFileUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  // eslint-disable-next-line no-control-regex -- URL parsing otherwise silently strips control characters.
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value.trim(), 'https://admin9.invalid/');
    return ['http:', 'https:', 'blob:'].includes(url.protocol) ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}
