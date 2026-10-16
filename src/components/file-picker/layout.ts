/** Responsive grid columns; pagination is independent of the available space. */
export default function resolveFilePickerColumns(width: number, narrow: boolean) {
  return Math.max(1, Math.min(narrow ? 2 : 5, Math.floor((width + 12) / ((narrow ? 122 : 150) + 12))));
}
