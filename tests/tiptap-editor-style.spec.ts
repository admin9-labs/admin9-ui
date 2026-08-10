import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const editorSource = readFileSync(resolve(process.cwd(), 'src/components/tiptap-editor/index.vue'), 'utf8');

describe('ATiptapEditor style contract', () => {
  it('uses the theme text color for the gap cursor instead of the primary action color', () => {
    const rule = editorSource.match(/\.ProseMirror-gapcursor::after\s*{([^}]*)}/)?.[1];

    expect(rule).toContain('border-top-color: var(--color-text-1);');
    expect(rule).not.toContain('primary-6');
  });
});
