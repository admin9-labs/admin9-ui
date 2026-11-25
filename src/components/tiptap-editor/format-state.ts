import { Mark, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { selectedTextBlocks } from './text-blocks';
import { normalizeTextColor } from './text-format';

export type InlineFormat = 'color' | 'highlight' | 'fontSize' | 'letterSpacing';
export interface FormatState {
  value: string;
  partial: boolean;
  hasEmpty?: boolean;
}
interface TextPart {
  node: ProseMirrorNode;
  parent: ProseMirrorNode;
  from: number;
  to: number;
}
const markName = (key: InlineFormat) => (key === 'highlight' ? 'highlight' : 'textStyle');
const attributeName = (key: InlineFormat) => (key === 'highlight' ? 'color' : key);

function textParts(state: EditorState): TextPart[] {
  const parts: TextPart[] = [];
  state.selection.ranges.forEach(({ $from, $to }) => {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos, parent) => {
      if (node.isText && parent)
        parts.push({ node, parent, from: Math.max(pos, $from.pos), to: Math.min(pos + node.nodeSize, $to.pos) });
    });
  });
  return parts;
}
function allows(state: EditorState, key: InlineFormat, parent: ProseMirrorNode, marks: readonly Mark[]) {
  const type = state.schema.marks[markName(key)];
  return Boolean(
    type && !parent.type.spec.code && !marks.some((mark) => mark.type.spec.code) && parent.type.allowsMarkType(type)
  );
}
function valueOf(marks: readonly Mark[], key: InlineFormat): string {
  const mark = marks.find((item) => item.type.name === markName(key));
  if (key === 'highlight' && mark && !mark.attrs.color) return 'default-highlight';
  const value = mark?.attrs[attributeName(key)];
  return key === 'color' || key === 'highlight' ? normalizeTextColor(value) ?? '' : String(value ?? '');
}
// Resolve explicit CSS colors only. Inherited/default states never enter this comparison.
function explicitColorKey(value: string): string {
  const color = normalizeTextColor(value);
  if (!color || typeof document === 'undefined' || !document.defaultView) return value;
  const probe = document.createElement('span');
  probe.style.setProperty('color', color, 'important');
  probe.style.display = 'none';
  document.documentElement.append(probe);
  try {
    return document.defaultView.getComputedStyle(probe).color || color;
  } finally {
    probe.remove();
  }
}
function summarize(values: string[], partial: boolean, color = false): FormatState {
  if (new Set(values).size <= 1) return { value: values[0] ?? 'unavailable', partial };
  const comparisons = new Map<string, string>();
  values.forEach((value) => {
    if (!comparisons.has(value))
      comparisons.set(value, color && value && value !== 'default-highlight' ? explicitColorKey(value) : value);
  });
  const unique = new Set(comparisons.values());
  return { value: unique.size > 1 ? 'mixed' : values[0] ?? 'unavailable', partial };
}

export function readInlineFormat(state: EditorState, key: InlineFormat): FormatState {
  if (state.selection instanceof NodeSelection) return { value: 'unavailable', partial: false };
  if (state.selection.empty) {
    const marks = state.storedMarks ?? state.selection.$from.marks();
    return {
      value: allows(state, key, state.selection.$from.parent, marks) ? valueOf(marks, key) : 'unavailable',
      partial: false,
    };
  }
  const parts = textParts(state);
  const eligible = parts.filter(({ parent, node }) => allows(state, key, parent, node.marks));
  const hasEmpty = selectedTextBlocks(state).some(({ node }) => !node.textContent);
  return {
    ...summarize(
      eligible.map(({ node }) => valueOf(node.marks, key)),
      hasEmpty || (eligible.length > 0 && eligible.length < parts.length),
      key === 'color' || key === 'highlight'
    ),
    ...(hasEmpty ? { hasEmpty: true } : {}),
  };
}

export function readBlockFormat(state: EditorState, key: string): FormatState {
  const blocks = selectedTextBlocks(state).filter(({ node }) => key in node.attrs);
  let excluded = false;
  state.selection.ranges.forEach(({ $from, $to }) => {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (pos + 1 < $to.pos && (node.isTextblock || (node.isAtom && node.isBlock)) && !(key in node.attrs)) excluded = true;
    });
  });
  return summarize(
    blocks.map(({ node }) => String(node.attrs[key] ?? '')),
    blocks.length > 0 && excluded
  );
}

/** Change only the requested attribute; identical choices produce no document steps. */
export function setInlineFormat(state: EditorState, key: InlineFormat, value: string | null): Transaction {
  const { tr } = state;
  if (state.selection instanceof NodeSelection) return tr;
  const type = state.schema.marks[markName(key)];
  const colorKeys = new Map<string, string>();
  const colorKey = (color: string) => {
    const cached = colorKeys.get(color);
    if (cached !== undefined) return cached;
    const resolved = explicitColorKey(color);
    colorKeys.set(color, resolved);
    return resolved;
  };
  const update = (marks: readonly Mark[]) => {
    const previous = marks.find((mark) => mark.type === type);
    const previousColor = previous?.attrs.color;
    if (
      (key === 'color' || key === 'highlight') &&
      value !== null &&
      typeof previousColor === 'string' &&
      previousColor &&
      (previousColor === value || colorKey(previousColor) === colorKey(value))
    )
      return previous;
    if (key === 'highlight') return value === null ? null : type.create({ color: value });
    const attrs = { ...previous?.attrs, [attributeName(key)]: value };
    return Object.values(attrs).some((attribute) => attribute != null) ? type.create(attrs) : null;
  };
  if (state.selection.empty) {
    const marks = state.storedMarks ?? state.selection.$from.marks();
    if (!allows(state, key, state.selection.$from.parent, marks)) return tr;
    const next = update(marks);
    const nextMarks = next ? next.addToSet(type.removeFromSet(marks)) : type.removeFromSet(marks);
    if (!Mark.sameSet(marks, nextMarks)) tr.setStoredMarks(nextMarks);
  } else {
    textParts(state).forEach(({ node, parent, from, to }) => {
      if (!allows(state, key, parent, node.marks)) return;
      const previous = node.marks.find((mark) => mark.type === type);
      const next = update(node.marks);
      if (previous && next && previous.eq(next)) return;
      if (!previous && !next) return;
      if (previous) tr.removeMark(from, to, type);
      if (next) tr.addMark(from, to, next);
    });
  }
  return tr;
}
export function setBlockFormat(state: EditorState, key: string, value: string | null): Transaction {
  const { tr } = state;
  selectedTextBlocks(state).forEach(({ node, pos }) => {
    if (key in node.attrs && node.attrs[key] !== value) tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: value });
  });
  return tr;
}
