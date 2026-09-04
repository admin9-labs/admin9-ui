import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const proTableSource = readFileSync(resolve(process.cwd(), 'src/components/pro-table/index.vue'), 'utf8');

describe('AProTable style contract', () => {
  it('keeps title, toolbar, and before-table blocks 12px from the next block', () => {
    expect(proTableSource).toMatch(/&__title\s*{[\s\S]*?margin: 0 0 12px;/);
    expect(proTableSource).toMatch(/&__toolbar\s*{[\s\S]*?margin-bottom: 12px;/);
    expect(proTableSource).toMatch(/&__before-table\s*{[\s\S]*?margin-bottom: 12px;/);
  });

  it('removes empty title and before-table blocks from layout', () => {
    expect(proTableSource).toMatch(/&__title:empty,\s*&__before-table:empty\s*{\s*display: none;\s*margin: 0;\s*}/);
  });
});
