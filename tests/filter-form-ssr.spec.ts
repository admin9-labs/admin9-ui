/** @vitest-environment node */
import { createSSRApp, defineComponent, h, type Component } from 'vue';
import { createI18n } from 'vue-i18n';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AFilterForm from '../src/components/filter-form/index.vue';

const storageStub = { clear: () => undefined };
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storageStub });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storageStub });

const IconStub = defineComponent({
  setup() {
    return () => h('span', { 'aria-hidden': 'true' });
  },
});

const renderInitialMarkup = async () => {
  const app = createSSRApp({
    render: () =>
      h(
        AFilterForm,
        { model: { first: '', second: '', third: '' } },
        { default: () => [h('div', 'First'), h('div', 'Second'), h('div', 'Third')] }
      ),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'en-US',
      messages: {
        'en-US': {
          admin9Ui: {
            filterForm: { search: 'Search', reset: 'Reset', expand: 'Expand', collapse: 'Collapse' },
          },
        },
      },
    })
  );
  ['IconSearch', 'IconRefresh', 'IconDown', 'IconUp'].forEach((name) => app.component(name, IconStub as Component));
  return renderToString(app);
};

describe('AFilterForm SSR contract', () => {
  it('keeps server and mobile client initial markup aligned before mount', async () => {
    const serverMarkup = await renderInitialMarkup();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { innerWidth: 390, performance: globalThis.performance },
    });

    try {
      const mobileClientMarkup = await renderInitialMarkup();
      expect(serverMarkup).toContain('data-layout="single"');
      expect(mobileClientMarkup).toContain('data-layout="single"');
      expect(serverMarkup.includes('Expand')).toBe(mobileClientMarkup.includes('Expand'));
    } finally {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
