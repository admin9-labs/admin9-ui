/** @vitest-environment node */
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import AChatMessageList from '../src/components/chat-message-list/index.vue';
import AChatComposer from '../src/components/chat-composer/index.vue';
import { messages } from '../src/locale';

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { clear: () => undefined } });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { clear: () => undefined } });

describe('chat SSR', () => {
  it('renders initial markdown and controlled input without browser globals', async () => {
    const app = createSSRApp({
      render: () =>
        h('div', [
          h(AChatMessageList, { messages: [{ id: 'a', role: 'assistant', content: '**initial**', status: 'pending' }] }),
          h(AChatComposer, { modelValue: 'draft' }),
        ]),
    });
    app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
    const html = await renderToString(app);
    expect(html).toContain('<strong>initial</strong>');
    expect(html).toContain('Waiting for reply');
    expect(html).toContain('draft');
  });
});
