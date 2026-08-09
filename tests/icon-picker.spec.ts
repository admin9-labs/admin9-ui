/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AIconPicker from '../src/components/icon-picker/index.vue';

const mountedApps: App[] = [];

const PopoverStub = defineComponent({
  props: { popupVisible: Boolean },
  emits: ['update:popupVisible'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', [
        h('button', { 'data-testid': 'open-icons', 'onClick': () => emit('update:popupVisible', true) }, 'Open'),
        slots.default?.(),
        props.popupVisible ? h('div', { 'data-testid': 'icon-panel' }, slots.content?.()) : undefined,
      ]);
  },
});

const InputStub = defineComponent({
  props: { modelValue: String, placeholder: String, size: String, readonly: Boolean },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'icon-input',
          'data-value': props.modelValue,
          'data-placeholder': props.placeholder,
          'data-size': props.size,
          'data-readonly': String(props.readonly),
        },
        [slots.prefix?.(), slots.suffix?.()]
      );
  },
});

const InputSearchStub = defineComponent({
  props: { modelValue: String, placeholder: String },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
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
    return () => h('button', { ...attrs, 'data-testid': 'clear-icon' }, 'Clear');
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
          'admin9Ui.iconPicker.empty': 'No matching icon',
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

describe('AIconPicker public contract', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    mountedApps.splice(0).forEach((app) => app.unmount());
  });

  it('renders controlled input props, accepts PascalCase selection, and emits clear', async () => {
    const onUpdate = vi.fn();
    mountPicker({
      'modelValue': 'IconDashboard',
      'allowClear': true,
      'placeholder': 'Choose one',
      'size': 'large',
      'onUpdate:modelValue': onUpdate,
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
