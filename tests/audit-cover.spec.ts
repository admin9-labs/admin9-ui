/* eslint-disable vue/one-component-per-file */
import { createApp, defineComponent, h, inject, nextTick, provide, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditAcceptance from '../dev/audit-acceptance.vue';
import { messages } from '../src/locale';

// Exercise the real acceptance page and CoverPicker, isolating unrelated demos and the file library transport.
vi.mock('../src', async () => {
  const vue = await import('vue');
  const { default: ACoverPicker } = await import('../src/components/cover-picker/index.vue');
  const empty = vue.defineComponent({ render: () => null });
  return {
    ACoverPicker,
    AIconPicker: empty,
    ACoordinatePicker: empty,
    AFilePicker: empty,
    AImagePicker: empty,
    AFileUploader: empty,
    AFilterForm: empty,
    AProTable: empty,
    ATiptapEditor: empty,
    AChatComposer: empty,
    AChatMessageList: empty,
  };
});

vi.mock('../src/components/file-picker/index.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      emits: ['confirm', 'visibleChange'],
      setup(_, { emit, expose }) {
        const visible = vue.ref(false);
        const setVisible = (value: boolean) => {
          visible.value = value;
          emit('visibleChange', value);
        };
        expose({ open: () => setVisible(true), close: () => setVisible(false), clear: () => undefined });
        return () =>
          visible.value
            ? vue.h(
                'button',
                {
                  'data-testid': 'choose-source',
                  'onClick': () => {
                    emit('confirm', [{ id: 'source', name: 'source.png', type: 'image', url: '/source.png', status: 'ready' }]);
                    setVisible(false);
                  },
                },
                'Choose source'
              )
            : null;
      },
    }),
  };
});

const Transparent = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});
const Button = defineComponent({
  props: { disabled: Boolean },
  setup(props, { slots }) {
    return () => h('button', { disabled: props.disabled }, slots.default?.());
  },
});
const groupKey = Symbol('radio');
const RadioGroup = defineComponent({
  props: { disabled: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    provide(groupKey, (value: string) => {
      if (!props.disabled) emit('update:modelValue', value);
    });
    return () => h('div', slots.default?.());
  },
});
const Radio = defineComponent({
  props: { value: { type: String, default: '' }, disabled: Boolean },
  setup(props, { slots }) {
    const update = inject<(value: string) => void>(groupKey, () => undefined);
    return () =>
      h(
        'button',
        { 'disabled': props.disabled, 'data-ratio': props.value, 'onClick': () => update(props.value) },
        slots.default?.()
      );
  },
});

const cropEngine = vi.hoisted(() => ({ open: vi.fn(), cancel: vi.fn(), count: 0 }));
vi.mock('../src/components/image-cropper/index.vue', async () => {
  const vue = await import('vue');
  return {
    default: vue.defineComponent({
      props: ['crop', 'aspectRatio'],
      setup(props, { expose }) {
        expose(cropEngine);
        return () =>
          vue.h('span', {
            'data-testid': 'crop-config',
            'data-ratio': props.aspectRatio,
            'data-policy': JSON.stringify(props.crop),
          });
      },
    }),
  };
});
vi.mock('../dev/fake-file-picker-service', () => ({
  default: () => ({
    list: vi.fn(),
    readOriginal: vi.fn().mockResolvedValue(new File(['source'], 'source.png')),
    upload: vi.fn().mockImplementation(async () => {
      cropEngine.count += 1;
      return {
        id: `crop-${cropEngine.count}`,
        name: 'crop.png',
        type: 'image',
        groupId: null,
        url: `/crop-${cropEngine.count}.png`,
        status: 'ready',
      };
    }),
  }),
}));
let app: App | undefined;
async function flush() {
  await nextTick();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}
function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Missing ${selector}`);
  button.click();
}
const preview = (index: number) =>
  document.querySelector<HTMLImageElement>(`[data-testid="cover-picker-preview-${index}"]`)?.getAttribute('src');
async function fillCover(index: number) {
  click(`[data-testid="cover-picker-slot-${index}"]`);
  await flush();
  click('[data-testid="choose-source"]');
  await flush();
}
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  cropEngine.count = 0;
  cropEngine.open.mockReset().mockResolvedValue(new File(['crop'], 'crop.png'));
  app = createApp(AuditAcceptance);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  [
    'AConfigProvider',
    'AForm',
    'AFormItem',
    'ATooltip',
    'AInput',
    'AAlert',
    'ASpin',
    'IconPlus',
    'IconEdit',
    'IconDelete',
    'IconImageClose',
  ].forEach((name) => app?.component(name, Transparent));
  app.component('AButton', Button);
  app.component('ARadioGroup', RadioGroup);
  app.component('ARadio', Radio);
  app.mount('#app');
});
afterEach(() => {
  app?.unmount();
  document.body.innerHTML = '';
});
describe('acceptance native cover crop integration', () => {
  it.each([
    ['4:3', 4 / 3],
    ['16:9', 16 / 9],
    ['1:1', 1],
    ['3:4', 3 / 4],
  ])('passes business ratio %s and exact640 to the formal cropper', async (preset, ratio) => {
    click(`.crop-scenario [data-ratio="${preset}"]`);
    await flush();
    const config = document.querySelector('[data-testid="crop-config"]');
    expect(Number(config?.getAttribute('data-ratio'))).toBe(ratio);
    expect(JSON.parse(config?.getAttribute('data-policy') || '{}').output.resize).toEqual({ mode: 'exact', longEdge: 640 });
    expect(
      document.querySelector<HTMLElement>('.a9-cover-picker')?.style.getPropertyValue('--a9-cover-picker-slot-ratio')
    ).toBe(String(ratio));
  });
  it('keeps the old image on cancel and replaces it only after successful processing', async () => {
    await fillCover(0);
    const old = preview(0);
    cropEngine.open.mockResolvedValueOnce(null);
    await fillCover(0);
    expect(preview(0)).toBe(old);
    await fillCover(0);
    expect(preview(0)).not.toBe(old);
  });
  it('starts an empty acceptance scenario when the business preset changes', async () => {
    click('[data-testid="cover-picker-mode-triple"]');
    await flush();
    await fillCover(0);
    await fillCover(1);
    click('.crop-scenario [data-ratio="3:4"]');
    await flush();
    expect(preview(0)).toBeUndefined();
    expect(preview(1)).toBeUndefined();
    expect(document.querySelectorAll('[data-testid^="cover-picker-slot-"]')).toHaveLength(3);
    expect(document.querySelector('.crop-scenario__warning')).toBeNull();
  });
});
