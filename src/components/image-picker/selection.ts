import safeFileUrl from '../../internal/file-url';
import type { FileItem } from '../../services/types';

const itemFields: (keyof FileItem)[] = [
  'id',
  'name',
  'type',
  'groupId',
  'url',
  'path',
  'size',
  'mime',
  'extension',
  'thumbnail',
  'duration',
  'createdAt',
  'status',
];

export const imageValueSignature = (value: unknown) => JSON.stringify(value, itemFields);
export const imageLimit = (value: number) => (Number.isInteger(value) && value >= 0 ? value : 0);
export const isEligibleImage = (value: unknown): value is FileItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as FileItem;
  return (
    typeof item.id === 'string' &&
    item.id.trim().length > 0 &&
    item.type === 'image' &&
    Boolean(safeFileUrl(item.url)) &&
    (item.status === undefined || item.status === 'ready')
  );
};

export const sameImages = (left: FileItem[], right: FileItem[]) =>
  left.length === right.length && left.every((item, index) => itemFields.every((field) => item[field] === right[index][field]));

export const normalizeImages = (value: unknown, multiple: boolean, limit: number): FileItem[] => {
  let candidates: unknown[] = [value];
  if (multiple) candidates = Array.isArray(value) ? value : [];
  const counts = new Map<string, number>();
  candidates.forEach((candidate) => {
    if (candidate && typeof candidate === 'object' && typeof (candidate as FileItem).id === 'string') {
      const { id } = candidate as FileItem;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  });
  const images = candidates.filter((item): item is FileItem => isEligibleImage(item) && counts.get(item.id) === 1);
  return multiple && limit > 0 ? images.slice(0, limit) : images;
};

export const modelMatchesImages = (value: unknown, images: FileItem[], multiple: boolean) => {
  if (value === undefined && images.length === 0) return true;
  if (multiple) return Array.isArray(value) && value.every(isEligibleImage) && sameImages(value, images);
  return isEligibleImage(value) && sameImages([value], images);
};

export const replaceImage = (images: FileItem[], targetId: string, replacement: FileItem): FileItem[] | undefined => {
  if (
    !images.some((item) => item.id === targetId) ||
    images.some((item) => item.id !== targetId && item.id === replacement.id)
  ) {
    return undefined;
  }
  return images.map((item) => (item.id === targetId ? replacement : item));
};
