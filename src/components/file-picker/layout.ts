import type { FilePickerView } from './types';

/** Geometry of the default cards, independent of the files on the current page. */
export default function resolveFilePickerLayout(
  width: number,
  height: number,
  view: FilePickerView,
  narrow: boolean,
  imagesOnly = false
) {
  if (width <= 0 || height <= 0) return { columns: 1, pageSize: 0, gridHeight: 0 };
  const gap = 12;
  if (view === 'list') return { columns: 1, pageSize: Math.max(1, Math.floor((height + gap) / (66 + gap))), gridHeight: 0 };
  const columns = Math.max(1, Math.min(narrow ? 2 : 5, Math.floor((width + gap) / ((narrow ? 122 : 150) + gap))));
  const cardWidth = (width - (columns - 1) * gap) / columns;
  const cardHeight = (cardWidth - 20) * 0.75 + (imagesOnly ? 20 : 72);
  const rows = Math.max(1, Math.min(3, Math.floor((height + gap) / (cardHeight + gap))));
  return { columns, pageSize: columns * rows, gridHeight: rows * cardHeight + (rows - 1) * gap };
}
