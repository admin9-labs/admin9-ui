import type { FileItem, FileType } from '../services/types';
import safeFileUrl from './file-url';

export default function fileUploadResultError(item: FileItem, fileTypes: readonly FileType[]): string | undefined {
  if (!item || typeof item !== 'object') return 'received an invalid FileItem result.';
  if (typeof item.id !== 'string' || item.id.trim().length === 0) return 'requires a stable non-empty FileItem id.';
  if (!fileTypes.includes(item.type)) return 'received a FileItem with a mismatched type.';
  if (item.status !== undefined && item.status !== 'ready') return 'received a FileItem that is not ready.';
  if (!safeFileUrl(item.url)) return 'received a FileItem without a usable URL.';
  return undefined;
}
