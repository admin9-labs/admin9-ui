import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileStyleAsync, parse } from 'vue/compiler-sfc';
import { afterEach, describe, expect, it } from 'vitest';

const filterFormSource = readFileSync(resolve(process.cwd(), 'src/components/filter-form/index.vue'), 'utf8');

const installFilterFormStyle = async () => {
  const { descriptor } = parse(filterFormSource);
  const compiled = await compileStyleAsync({
    source: descriptor.styles[0].content,
    filename: 'filter-form.vue',
    id: 'data-v-filter-form-test',
    scoped: true,
    preprocessLang: 'less',
  });
  expect(compiled.errors).toEqual([]);

  const style = document.createElement('style');
  style.setAttribute('data-filter-form-test-style', '');
  style.textContent = compiled.code;
  document.head.appendChild(style);
  return compiled.code;
};

describe('AFilterForm style contract', () => {
  afterEach(() => {
    document.head.querySelector('[data-filter-form-test-style]')?.remove();
    document.body.innerHTML = '';
  });

  it('provides a card-like surface without a border or shadow', () => {
    const rootDeclarations = filterFormSource.match(/\.a9-filter-form\s*{([\s\S]*?)&__body/)?.[1];

    expect(rootDeclarations).toContain('box-sizing: border-box;');
    expect(rootDeclarations).toContain('padding: 20px;');
    expect(rootDeclarations).toContain('background: var(--color-bg-2);');
    expect(rootDeclarations).toContain('border-radius: 4px;');
    expect(rootDeclarations).not.toContain('box-shadow');
    expect(rootDeclarations).not.toMatch(/\bborder:/);
  });

  it('uses the mobile layout for narrow containers without relying on viewport media queries', async () => {
    const css = await installFilterFormStyle();
    expect(css).toMatch(/@media \(width <= 767px\)[\s\S]*?\.a9-filter-form[^{]*\{\s*padding: 16px;/);
    document.body.innerHTML = `
      <form class="a9-filter-form a9-filter-form--narrow" data-v-filter-form-test>
        <div class="a9-filter-form__body" data-v-filter-form-test>
          <div class="a9-filter-form__fields" data-v-filter-form-test>
            <div class="a9-filter-form__field" data-v-filter-form-test style="flex-basis: 100%"></div>
          </div>
          <div class="a9-filter-form__actions a9-filter-form__actions--single" data-v-filter-form-test>
            <button class="arco-btn"></button>
          </div>
        </div>
      </form>
    `;
    const styleFor = (selector: string) => getComputedStyle(document.querySelector(selector) as HTMLElement);
    expect(styleFor('form').padding).toBe('16px');
    expect(styleFor('.a9-filter-form__body').display).toBe('block');
    expect(styleFor('.a9-filter-form__field').flexBasis).toBe('100%');
    expect(styleFor('.a9-filter-form__actions').flexFlow).toBe('row wrap');
    expect(styleFor('.a9-filter-form__actions').width).toBe('100%');
    expect(styleFor('.a9-filter-form__actions').paddingLeft).toBe('0px');
    expect(styleFor('.arco-btn').width).toBe('auto');
  });

  it('fills picker controls within fields while preserving explicit widths and unrelated pickers', async () => {
    await installFilterFormStyle();
    document.body.innerHTML = `
      <div class="a9-filter-form__field" data-v-filter-form-test style="width: 120px">
        <div class="arco-picker" data-testid="default"><input class="arco-picker-input" /></div>
        <div class="arco-picker" data-testid="explicit" style="width: 80px"></div>
      </div>
      <div class="arco-picker" data-testid="outside"></div>
    `;
    const pickerStyle = (testId: string) =>
      getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as HTMLElement);

    // happy-dom resolves declarations but has no layout engine to measure percentage widths.
    expect(pickerStyle('default').width).toBe('100%');
    expect(pickerStyle('default').maxWidth).toBe('100%');
    expect(pickerStyle('default').minWidth).toBe('0');
    expect(getComputedStyle(document.querySelector('.arco-picker-input') as HTMLElement).minWidth).toBe('0');
    expect(pickerStyle('explicit').width).toBe('80px');
    expect(pickerStyle('outside').width).not.toBe('100%');
  });
});
