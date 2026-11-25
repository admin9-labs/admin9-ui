import type { Node as ProseMirrorNode, NodeType } from '@tiptap/pm/model';
import { NodeSelection, type Selection, type Transaction } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

interface TextBlock {
  node: ProseMirrorNode;
  pos: number;
}

const isTextBlock = (node: ProseMirrorNode) => ['paragraph', 'heading'].includes(node.type.name);

export function selectedTextBlocks(
  { doc, selection }: { doc: ProseMirrorNode; selection: Selection },
  includeCode = false
): TextBlock[] {
  const blocks = new Map<number, TextBlock>();
  const take = (node: ProseMirrorNode, pos: number) => {
    if (isTextBlock(node) || (includeCode && node.type.name === 'codeBlock')) blocks.set(pos, { node, pos });
  };
  if (selection.empty || (selection instanceof NodeSelection && selection.node.isInline)) {
    if (selection instanceof NodeSelection && selection.node.type.name !== 'inlineImage') return [];
    if (selection.$from.depth) take(selection.$from.parent, selection.$from.before());
  } else {
    selection.ranges.forEach(({ $from, $to }) => {
      doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        // A text selection ending at the next block's start does not select that block.
        if (selection instanceof CellSelection || pos + 1 < $to.pos) take(node, pos);
      });
    });
  }
  return [...blocks.values()];
}

export function canConvertTextBlock(doc: ProseMirrorNode, { node, pos }: TextBlock, targetType: NodeType): boolean {
  if ((!isTextBlock(node) && node.type.name !== 'codeBlock') || !['paragraph', 'heading'].includes(targetType.name))
    return false;
  const $pos = doc.resolve(pos);
  return $pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, targetType) && targetType.validContent(node.content);
}

/** Convert only directly compatible blocks, without setNode's container-lifting fallback. */
export function convertSelectedTextBlocks(
  tr: Transaction,
  targetType: NodeType,
  targetAttrs: { level?: number } = {}
): boolean {
  const blocks = selectedTextBlocks(tr, true);
  const { selection } = tr;
  const startStep = tr.steps.length;
  blocks.forEach((block) => {
    const pos = tr.mapping.slice(startStep).map(block.pos);
    const node = tr.doc.nodeAt(pos);
    if (!node || !canConvertTextBlock(tr.doc, { node, pos }, targetType)) return;
    // A zero-width range inside the block includes it, including an empty block, but never its neighbor.
    tr.setBlockType(pos + 1, pos + 1, targetType, { ...node.attrs, ...targetAttrs });
  });
  if (tr.steps.length === startStep) return false;
  const mapping = tr.mapping.slice(startStep);
  // Replacing a selected block's markup marks its boundary deleted; keep its NodeSelection explicitly.
  tr.setSelection(
    selection instanceof NodeSelection
      ? NodeSelection.create(tr.doc, mapping.map(selection.from))
      : selection.map(tr.doc, mapping)
  );
  return true;
}
