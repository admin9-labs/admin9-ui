import type { FileType } from '../services/types';

export const FILE_TYPES: readonly FileType[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];

export function normalizeFileTypes(values?: readonly FileType[]): FileType[] {
  return !Array.isArray(values) ? [...FILE_TYPES] : [...new Set(values.filter((value) => FILE_TYPES.includes(value)))];
}
