import { computed, ref, shallowRef } from 'vue';
import type { Editor } from '@tiptap/core';
import { Mark, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { AllSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { normalizeFontSize, normalizeTextColor } from './text-format';

const formatNames = ['bold', 'italic', 'underline', 'strike', 'textStyle', 'highlight'];
type Failure = 'source' | 'mixed' | 'code' | 'target';
type TextPart = { from: number; to: number; node: ProseMirrorNode; parent: ProseMirrorNode };

function textParts(state: EditorState): TextPart[] {
  if (!(state.selection instanceof TextSelection || state.selection instanceof AllSelection)) return [];
  const { from, to } = state.selection;
  const parts: TextPart[] = [];
  state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (node.isText && parent) parts.push({ from: Math.max(from, pos), to: Math.min(to, pos + node.nodeSize), node, parent });
  });
  return parts;
}

function formats(marks: readonly Mark[]): Mark[] {
  return marks.flatMap((mark) => {
    if (!formatNames.includes(mark.type.name)) return [];
    if (mark.type.name === 'textStyle') {
      const color = normalizeTextColor(mark.attrs.color);
      const fontSize = normalizeFontSize(mark.attrs.fontSize);
      return color || fontSize ? [mark.type.create({ color, fontSize })] : [];
    }
    if (mark.type.name === 'highlight') return [mark.type.create({ color: normalizeTextColor(mark.attrs.color) })];
    return [mark];
  });
}

const isCode = (marks: readonly Mark[], parent: ProseMirrorNode) =>
  Boolean(parent.type.spec.code || marks.some((mark) => mark.type.spec.code));

export function readFormatSource(state: EditorState): { marks: Mark[] } | { error: Failure } {
  const { selection } = state;
  if (selection instanceof TextSelection && selection.empty) {
    const { $from } = selection;
    if (!$from.parent.textContent) return { error: 'source' };
    const marks = state.storedMarks ?? $from.marks();
    if (isCode(marks, $from.parent)) return { error: 'code' };
    return { marks: formats(marks) };
  }
  const parts = textParts(state);
  if (!parts.length) return { error: 'source' };
  if (parts.some(({ node, parent }) => isCode(node.marks, parent))) return { error: 'code' };
  const marks = formats(parts[0].node.marks);
  if (parts.some(({ node }) => !Mark.sameSet(marks, formats(node.marks)))) return { error: 'mixed' };
  return { marks };
}

export function paintTextFormat(state: EditorState, marks: readonly Mark[]): { transaction: Transaction } | { error: Failure } {
  const parts = textParts(state);
  if (!parts.length || state.selection.empty) return { error: 'target' as Failure };
  if (parts.some(({ node, parent }) => isCode(node.marks, parent))) return { error: 'code' as Failure };
  const { tr } = state;
  parts.forEach(({ from, to }) => {
    formatNames.forEach((name) => {
      if (state.schema.marks[name]) tr.removeMark(from, to, state.schema.marks[name]);
    });
    marks.forEach((mark) => tr.addMark(from, to, mark));
  });
  return { transaction: tr };
}

export function createFormatPainter(getEditor: () => Editor | undefined, editable: () => boolean) {
  const snapshot = shallowRef<readonly Mark[]>();
  const active = computed(() => snapshot.value !== undefined);
  const failure = ref<Failure>();
  let session = 0;
  let frame: number | undefined;
  let pointer: number | undefined;
  let detach: (() => void) | undefined;

  const cancel = () => {
    snapshot.value = undefined;
    failure.value = undefined;
    session += 1;
    pointer = undefined;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const focus = () => getEditor()?.view.dom.focus({ preventScroll: true });
  const toggle = () => {
    if (active.value) {
      cancel();
      focus();
      return;
    }
    const editor = getEditor();
    if (!editor || !editable()) return;
    const source = readFormatSource(editor.state);
    if ('error' in source) {
      failure.value = source.error;
      return;
    }
    session += 1;
    snapshot.value = source.marks;
    failure.value = undefined;
    focus();
  };
  const apply = () => {
    const editor = getEditor();
    if (!editor || editor.isDestroyed || !editable() || !snapshot.value) return;
    const result = paintTextFormat(editor.state, snapshot.value);
    if ('error' in result) {
      failure.value = result.error;
      return;
    }
    const changed = !result.transaction.doc.eq(editor.state.doc);
    cancel();
    if (changed) {
      editor.view.dispatch(closeHistory(result.transaction));
      if (!editor.isDestroyed) editor.view.dispatch(closeHistory(editor.state.tr));
    }
    if (!editor.isDestroyed) focus();
  };
  const bind = (root: HTMLElement) => {
    const inside = (target: EventTarget | null) => target instanceof Node && root.contains(target);
    const prose = (target: EventTarget | null) => {
      const editor = getEditor();
      return target instanceof Node && Boolean(editor?.view.dom.contains(target));
    };
    const controls = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('[data-format-painter]'));
    const pointerCancel = () => {
      pointer = undefined;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    };
    const down = (event: PointerEvent) => {
      pointerCancel();
      if (!inside(event.target)) {
        cancel();
        return;
      }
      if (active.value && event.button === 0 && event.pointerType === 'mouse' && prose(event.target)) {
        pointer = event.pointerId;
      }
    };
    const up = (event: PointerEvent) => {
      if (!active.value || event.pointerId !== pointer) return;
      pointer = undefined;
      const expectedSession = session;
      const editor = getEditor();
      const doc = editor?.state.doc;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (session !== expectedSession || editor !== getEditor() || editor?.isDestroyed || editor?.state.doc !== doc) return;
        if (!editor?.state.selection.empty) apply();
      });
    };
    const click = (event: MouseEvent) => {
      if (active.value && !controls(event.target) && !prose(event.target)) cancel();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!active.value) return;
      pointerCancel();
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        focus();
      } else if (event.key === 'Enter' && !event.isComposing && prose(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        apply();
      } else if (prose(event.target)) {
        const navigation = [
          'Shift',
          'Control',
          'Meta',
          'Alt',
          'Tab',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ];
        const selectionOrCopy = (event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase());
        if (event.isComposing || (!navigation.includes(event.key) && !selectionOrCopy)) cancel();
      }
    };
    const focusout = (event: FocusEvent) => {
      if (event.relatedTarget) {
        if (!inside(event.relatedTarget)) cancel();
      } else {
        const expectedSession = session;
        queueMicrotask(() => {
          if (session === expectedSession && !inside(document.activeElement)) cancel();
        });
      }
    };
    const input = (event: Event) => {
      if (prose(event.target)) cancel();
    };
    const inputEvents = ['beforeinput', 'compositionstart', 'paste', 'cut', 'drop'];
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', cancel);
    root.addEventListener('click', click, true);
    root.addEventListener('keydown', keydown, true);
    root.addEventListener('focusout', focusout);
    inputEvents.forEach((name) => root.addEventListener(name, input, true));
    detach = () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('blur', cancel);
      root.removeEventListener('click', click, true);
      root.removeEventListener('keydown', keydown, true);
      root.removeEventListener('focusout', focusout);
      inputEvents.forEach((name) => root.removeEventListener(name, input, true));
    };
  };
  return {
    active,
    failure,
    toggle,
    apply,
    cancel,
    bind,
    dispose: () => {
      cancel();
      detach?.();
    },
  };
}
