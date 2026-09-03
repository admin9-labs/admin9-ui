import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const filterFormSource = readFileSync(resolve(process.cwd(), 'src/components/filter-form/index.vue'), 'utf8');

describe('AFilterForm style contract', () => {
  it('provides a card-like surface without a border or shadow', () => {
    const rootDeclarations = filterFormSource.match(/\.a9-filter-form\s*{([\s\S]*?)&__body/)?.[1];

    expect(rootDeclarations).toContain('box-sizing: border-box;');
    expect(rootDeclarations).toContain('padding: 20px;');
    expect(rootDeclarations).toContain('background: var(--color-bg-2);');
    expect(rootDeclarations).toContain('border-radius: 4px;');
    expect(rootDeclarations).not.toContain('box-shadow');
    expect(rootDeclarations).not.toMatch(/\bborder:/);
  });

  it('uses compact padding on mobile viewports', () => {
    expect(filterFormSource).toMatch(/@media \(width <= 767px\)[\s\S]*?\.a9-filter-form\s*{\s*padding: 16px;/);
  });
});
