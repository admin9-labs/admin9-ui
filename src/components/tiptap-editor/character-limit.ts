import { Extension } from '@tiptap/core';
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { handlePaste as handleTablePaste } from '@tiptap/pm/tables';

type LimitNotice = { kind: 'partial' | 'rejected'; limit: number };

// Only truncate flat text blocks. A table, list or custom node needs its whole
// structure: refusing that paste is safer than dropping cells or existing text.
function textPrefix(slice: Slice, length: number): Slice | undefined {
  const blocks: ProseMirrorNode[] = [];
  let remaining = length;
  let safe = true;
  slice.content.forEach((block) => {
    if (!['paragraph', 'heading'].includes(block.type.name)) safe = false;
    block.forEach((node) => {
      if (!node.isText && node.type.name !== 'hardBreak') safe = false;
    });
  });
  if (!safe || slice.openStart > 1 || slice.openEnd > 1) return undefined;
  slice.content.forEach((block) => {
    if (remaining <= 0) return;
    const children: ProseMirrorNode[] = [];
    block.forEach((node) => {
      if (remaining <= 0) return;
      if (node.isText) {
        const text = node.text ?? '';
        let end = Math.min(remaining, text.length);
        // CharacterCount uses UTF-16 length, but a cut must not split an emoji.
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? '')) end -= 1;
        if (end) children.push(node.cut(0, end));
        remaining -= Math.min(remaining, text.length);
      } else {
        children.push(node);
        remaining -= 1;
      }
    });
    blocks.push(block.copy(Fragment.fromArray(children)));
  });
  return new Slice(Fragment.fromArray(blocks), slice.openStart, slice.openEnd);
}

export default function createCharacterLimit(getLimit: () => number, notify: (notice: LimitNotice) => void) {
  return Extension.create({
    name: 'a9DynamicCharacterLimit',
    priority: 1000,
    addProseMirrorPlugins() {
      const characters = (node: ProseMirrorNode): number => this.editor.storage.characterCount.characters({ node });
      return [
        new Plugin({
          key: new PluginKey('a9DynamicCharacterLimit'),
          appendTransaction: (transactions, _oldState, state) => {
            if (!transactions.some((transaction) => transaction.docChanged && transaction.getMeta('paste'))) return undefined;
            return closeHistory(state.tr).setMeta('addToHistory', false);
          },
          props: {
            handlePaste: (view, event, slice) => {
              const limit = getLimit();
              // Let the table package produce the real cell-fill transaction.
              // Ordinary replaceSelection has different semantics for rectangles.
              const tableView = new Proxy(view, {
                get(target, key) {
                  if (key !== 'dispatch') return Reflect.get(target, key);
                  return (transaction: Transaction) => {
                    if (limit > 0 && characters(transaction.doc) > limit) {
                      notify({ kind: 'rejected', limit });
                      return;
                    }
                    view.dispatch(closeHistory(transaction).setMeta('paste', true).setMeta('uiEvent', 'paste'));
                  };
                },
              });
              if (handleTablePaste(tableView, event, slice)) return true;
              if (limit <= 0) return false;
              const full = view.state.tr.replaceSelection(slice);
              if (characters(full.doc) <= limit) return false;
              const empty = view.state.tr.deleteSelection();
              const budget = limit - characters(empty.doc);
              const prefix = budget > 0 ? textPrefix(slice, budget) : undefined;
              if (prefix && prefix.content.size > 0) {
                const transaction = view.state.tr.replaceSelection(prefix);
                if (characters(transaction.doc) <= limit && !transaction.doc.eq(empty.doc)) {
                  view.dispatch(closeHistory(transaction).setMeta('paste', true).setMeta('uiEvent', 'paste').scrollIntoView());
                  notify({ kind: 'partial', limit });
                  return true;
                }
              }
              notify({ kind: 'rejected', limit });
              return true;
            },
          },
          filterTransaction: (transaction, state) => {
            if (transaction.getMeta('paste')) closeHistory(transaction);
            const limit = getLimit();
            if (!transaction.docChanged || limit <= 0 || isHistoryTransaction(transaction)) return true;
            const oldSize = characters(state.doc);
            const newSize = characters(transaction.doc);
            if (newSize <= limit || (oldSize > limit && newSize <= oldSize)) return true;
            if (transaction.getMeta('paste')) notify({ kind: 'rejected', limit });
            return false;
          },
        }),
      ];
    },
  });
}
