/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { arcoIconCategories } from '../src/components/icon-picker/icon-categories';
import { arcoIconNames } from '../src/components/icon-picker/icon-names';
import AIconPicker from '../src/components/icon-picker/index.vue';

const mountedApps: App[] = [];

const PopoverStub = defineComponent({
  props: { popupVisible: Boolean, disabled: Boolean },
  emits: ['update:popupVisible'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', [
        h(
          'button',
          {
            'data-testid': 'open-icons',
            'disabled': props.disabled,
            'onClick': () => !props.disabled && emit('update:popupVisible', true),
          },
          'Open'
        ),
        slots.default?.(),
        props.popupVisible ? h('div', { 'data-testid': 'icon-panel' }, slots.content?.()) : undefined,
      ]);
  },
});

const InputStub = defineComponent({
  props: { modelValue: String, placeholder: String, size: String, readonly: Boolean, disabled: Boolean, inputAttrs: Object },
  setup(props, { slots, expose }) {
    const input = document.createElement('input');
    expose({ focus: () => input.focus() });
    return () =>
      h(
        'div',
        {
          'data-testid': 'icon-input',
          'data-value': props.modelValue,
          'data-placeholder': props.placeholder,
          'data-size': props.size,
          'data-readonly': String(props.readonly),
          'data-disabled': String(props.disabled),
        },
        [
          h('input', {
            ...(props.inputAttrs as Record<string, unknown>),
            'data-testid': 'native-icon-input',
            'value': props.modelValue,
            'placeholder': props.placeholder,
            'readonly': props.readonly,
            'disabled': props.disabled,
          }),
          slots.prefix?.(),
          slots.suffix?.(),
        ]
      );
  },
});

const InputSearchStub = defineComponent({
  props: { modelValue: String, placeholder: String, inputAttrs: Object },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        ...(props.inputAttrs as Record<string, unknown>),
        'data-testid': 'icon-search',
        'placeholder': props.placeholder,
        'value': props.modelValue,
        'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const TooltipStub = defineComponent({
  props: { content: String },
  setup(props, { slots }) {
    return () => h('div', { 'data-icon-name': props.content }, slots.default?.());
  },
});

const CloseIconStub = defineComponent({
  setup(_, { attrs }) {
    return () => h('span', { ...attrs, 'data-testid': 'clear-icon' }, 'Clear');
  },
});

const DashboardIconStub = defineComponent({
  setup() {
    return () => h('span', { 'data-testid': 'dashboard-icon' });
  },
});

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function mountPicker(props: Record<string, unknown> = {}) {
  const app = createApp(AIconPicker, props);
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: {
        'en-US': {
          'admin9Ui.iconPicker.placeholder': 'Select icon',
          'admin9Ui.iconPicker.searchPlaceholder': 'Search icons',
          'admin9Ui.iconPicker.categoryLabel': 'Icon categories',
          'admin9Ui.iconPicker.searchResults': 'Search results',
          'admin9Ui.iconPicker.empty': 'No matching icon',
          'admin9Ui.iconPicker.clear': 'Clear icon',
          'admin9Ui.iconPicker.categories.all': 'All',
          'admin9Ui.iconPicker.categories.direction': 'Direction',
          'admin9Ui.iconPicker.categories.suggestion': 'Suggestions',
          'admin9Ui.iconPicker.categories.interaction': 'Interactions',
          'admin9Ui.iconPicker.categories.edit': 'Editing',
          'admin9Ui.iconPicker.categories.media': 'Media',
          'admin9Ui.iconPicker.categories.brand': 'Brands',
          'admin9Ui.iconPicker.categories.general': 'General',
        },
      },
    })
  );
  app.component('APopover', PopoverStub);
  app.component('AInput', InputStub);
  app.component('AInputSearch', InputSearchStub);
  app.component('ATooltip', TooltipStub);
  app.component('IconClose', CloseIconStub);
  app.component('IconDashboard', DashboardIconStub);
  mountedApps.push(app);
  app.mount('#app');
}

describe('AIconPicker official category metadata', () => {
  it('covers every public icon exactly once with the official category counts', () => {
    const counts = Object.fromEntries(arcoIconCategories.map((category) => [category.key, category.names.length]));
    const categorizedNames = arcoIconCategories.flatMap((category) => [...category.names]);
    const publicNames = arcoIconNames.map((item) => item.kebab);

    expect(counts).toEqual({
      direction: 34,
      suggestion: 25,
      interaction: 43,
      edit: 42,
      media: 23,
      brand: 23,
      general: 97,
    });
    expect(categorizedNames).toHaveLength(287);
    expect(new Set(categorizedNames).size).toBe(287);
    expect(new Set(categorizedNames)).toEqual(new Set(publicNames));
  });

  it('uses the repository-normalized Facebook icon name', () => {
    const brand = arcoIconCategories.find((category) => category.key === 'brand');

    expect(brand?.names).toContain('icon-face-book-circle-fill');
    expect(brand?.names).not.toContain('icon-faceBook-circle-fill');
  });
});

describe('AIconPicker public contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('renders controlled input props, accepts PascalCase selection, and emits clear', async () => {
    const onUpdate = vi.fn();
    const onChange = vi.fn();
    const onClear = vi.fn();
    mountPicker({
      'modelValue': 'IconDashboard',
      'allowClear': true,
      'placeholder': 'Choose one',
      'size': 'large',
      'onUpdate:modelValue': onUpdate,
      'onChange': onChange,
      'onClear': onClear,
    });
    await flush();

    const input = document.querySelector('[data-testid="icon-input"]');
    expect(input?.getAttribute('data-value')).toBe('IconDashboard');
    expect(input?.getAttribute('data-placeholder')).toBe('Choose one');
    expect(input?.getAttribute('data-size')).toBe('large');
    expect(input?.getAttribute('data-readonly')).toBe('true');
    expect(document.querySelector('[data-testid="dashboard-icon"]')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[data-testid="open-icons"]')?.click();
    await flush();
    expect(document.querySelector('[data-icon-name="icon-dashboard"] .is-active')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[data-testid="clear-icon"]')?.click();
    expect(onUpdate).toHaveBeenCalledWith(undefined);
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(onClear).toHaveBeenCalledOnce();
    expect(document.querySelector('.a9-icon-picker__clear')?.getAttribute('aria-label')).toBe('Clear icon');
  });

  it('forwards form attributes to the native input and blocks readonly or disabled interaction', async () => {
    mountPicker({
      'modelValue': 'icon-dashboard',
      'allowClear': true,
      'id': 'menu-icon',
      'name': 'menu_icon',
      'aria-label': 'Menu icon',
      'readonly': true,
    });
    await flush();

    const input = document.querySelector<HTMLInputElement>('[data-testid="native-icon-input"]');
    expect(input?.id).toBe('menu-icon');
    expect(input?.name).toBe('menu_icon');
    expect(input?.getAttribute('aria-label')).toBe('Menu icon');
    expect(input?.getAttribute('role')).toBe('combobox');
    expect(input?.getAttribute('aria-readonly')).toBe('true');
    expect(document.querySelector('.a9-icon-picker__clear')).toBeNull();
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="icon-panel"]')).toBeNull();

    mountedApps.splice(0).forEach((app) => app.unmount());
    document.body.innerHTML = '<div id="app"></div>';
    mountPicker({ disabled: true });
    await flush();
    expect(document.querySelector<HTMLInputElement>('[data-testid="native-icon-input"]')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('[data-testid="open-icons"]')?.disabled).toBe(true);
  });

  it('opens from the keyboard and provides roving keyboard selection for icon options', async () => {
    const onUpdate = vi.fn();
    mountPicker({ 'id': 'keyboard-icon', 'onUpdate:modelValue': onUpdate });
    await flush();

    const input = document.querySelector<HTMLInputElement>('#keyboard-icon');
    input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="icon-panel"]')).not.toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-testid="icon-search"]'));

    const search = document.querySelector<HTMLInputElement>('[data-testid="icon-search"]');
    search?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await flush();
    expect(document.activeElement?.getAttribute('role')).toBe('option');
    expect(document.activeElement?.getAttribute('data-icon-index')).toBe('0');

    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await flush();
    expect(document.activeElement?.getAttribute('data-icon-index')).toBe('1');
    const selectedName = document.activeElement?.getAttribute('aria-label');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(onUpdate).toHaveBeenCalledWith(selectedName);
    expect(document.querySelector('[data-testid="icon-panel"]')).toBeNull();
  });

  it('clears from the keyboard without opening the popover', async () => {
    const onUpdate = vi.fn();
    mountPicker({ 'modelValue': 'icon-dashboard', 'allowClear': true, 'onUpdate:modelValue': onUpdate });
    await flush();

    const clear = document.querySelector<HTMLButtonElement>('.a9-icon-picker__clear');
    clear?.focus();
    clear?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    clear?.click();
    await flush();

    expect(onUpdate).toHaveBeenCalledWith(undefined);
    expect(document.querySelector('[data-testid="icon-panel"]')).toBeNull();
  });

  it('filters icon names, emits kebab-case selection, and resets search after closing', async () => {
    const onUpdate = vi.fn();
    mountPicker({ 'onUpdate:modelValue': onUpdate });
    document.querySelector<HTMLButtonElement>('[data-testid="open-icons"]')?.click();
    await flush();

    const search = document.querySelector<HTMLInputElement>('[data-testid="icon-search"]');
    if (!search) throw new Error('Icon search was not rendered');
    expect(document.querySelector('[data-testid="icon-input"]')?.getAttribute('data-placeholder')).toBe('Select icon');
    expect(search.placeholder).toBe('Search icons');

    search.value = 'icon-dashboard';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(document.querySelectorAll('.a9-icon-picker__cell')).toHaveLength(1);

    document.querySelector<HTMLElement>('[data-icon-name="icon-dashboard"] .a9-icon-picker__cell')?.click();
    await flush();
    expect(onUpdate).toHaveBeenCalledWith('icon-dashboard');
    expect(document.querySelector('[data-testid="icon-panel"]')).toBeNull();

    document.querySelector<HTMLButtonElement>('[data-testid="open-icons"]')?.click();
    await flush();
    expect(document.querySelector<HTMLInputElement>('[data-testid="icon-search"]')?.value).toBe('');
    expect(document.querySelectorAll('.a9-icon-picker__cell').length).toBeGreaterThan(1);
  });

  it('filters by official category and keeps search global before restoring the category', async () => {
    mountPicker();
    document.querySelector<HTMLButtonElement>('[data-testid="open-icons"]')?.click();
    await flush();

    expect(document.querySelector('.a9-icon-picker__categories')?.getAttribute('role')).toBe('group');
    expect(document.querySelector('[data-category="all"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-category="brand"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelectorAll('.a9-icon-picker__cell')).toHaveLength(287);
    document.querySelector<HTMLButtonElement>('[data-category="brand"]')?.click();
    await flush();
    expect(document.querySelector('[data-category="all"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-category="brand"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.a9-icon-picker__cell')).toHaveLength(23);
    expect(document.querySelector('[data-icon-name="icon-face-book-circle-fill"]')).not.toBeNull();
    expect(document.querySelector('.a9-icon-picker__result-heading')?.textContent).toContain('Brands');

    const search = document.querySelector<HTMLInputElement>('[data-testid="icon-search"]');
    if (!search) throw new Error('Icon search was not rendered');
    search.value = 'dashboard';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(document.querySelectorAll('.a9-icon-picker__cell')).toHaveLength(1);
    expect(document.querySelector('[data-icon-name="icon-dashboard"]')).not.toBeNull();
    expect(document.querySelector('.a9-icon-picker__result-heading')?.textContent).toContain('Search results');
    expect(document.querySelector('[data-category="all"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-category="brand"]')?.getAttribute('aria-pressed')).toBe('false');

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(document.querySelectorAll('.a9-icon-picker__cell')).toHaveLength(23);
    expect(document.querySelector('.a9-icon-picker__result-heading')?.textContent).toContain('Brands');
    expect(document.querySelector('[data-category="all"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-category="brand"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the localized empty state when no icon matches', async () => {
    mountPicker();
    document.querySelector<HTMLButtonElement>('[data-testid="open-icons"]')?.click();
    await flush();

    const search = document.querySelector<HTMLInputElement>('[data-testid="icon-search"]');
    if (!search) throw new Error('Icon search was not rendered');
    search.value = 'not-a-real-icon';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(document.querySelectorAll('.a9-icon-picker__cell')).toHaveLength(0);
    expect(document.querySelector('.a9-icon-picker__empty')?.textContent?.trim()).toBe('No matching icon');
  });
});
