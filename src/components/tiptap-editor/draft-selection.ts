import { TextSelection, type SelectionBookmark, type Transaction } from '@tiptap/pm/state';

/** Keep a draft attached to its original text, excluding insertions at either edge. */
export default function mapDraftSelection(
  bookmark: SelectionBookmark,
  transaction: Transaction
): SelectionBookmark | undefined {
  const selection = bookmark.resolve(transaction.before);
  const from = transaction.mapping.mapResult(selection.from, 1);
  const to = transaction.mapping.mapResult(selection.to, -1);
  if (selection.empty ? from.deletedAcross : from.pos >= to.pos) return undefined;
  if (!(selection instanceof TextSelection) || selection.empty) return bookmark.map(transaction.mapping);
  const start = transaction.doc.resolve(from.pos);
  const end = transaction.doc.resolve(to.pos);
  return (
    selection.anchor === selection.from ? TextSelection.between(start, end) : TextSelection.between(end, start)
  ).getBookmark();
}
