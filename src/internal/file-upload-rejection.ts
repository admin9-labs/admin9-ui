import type { FileUploadRejection } from '../services/types';

export default function fileUploadRejection(error: unknown): FileUploadRejection | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  if (error.code === 'unsupported-file-type') return { code: error.code };
  if (error.code !== 'unsupported-file-format') return undefined;
  const formats = 'allowedFormats' in error ? error.allowedFormats : undefined;
  const allowedFormats = Array.isArray(formats)
    ? [
        ...new Set(
          formats
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
        ),
      ]
    : [];
  return { code: error.code, allowedFormats };
}
