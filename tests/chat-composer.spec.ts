import { createApp, h, nextTick, reactive, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AChatComposer from '../src/components/chat-composer/index.vue';
import type { AChatComposerExposed } from '../src/components/chat-composer/types';
import { messages } from '../src/locale';

let app: App;
const state = reactive({ modelValue: '', generating: false, disabled: false, submitDisabled: false });
const submit = vi.fn();
const stop = vi.fn();
const update = vi.fn();
let exposed: AChatComposerExposed | null;
const input = () => document.querySelector('textarea') as HTMLTextAreaElement;
const button = () => document.querySelector('button') as HTMLButtonElement;
const key = (options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options });
  input().dispatchEvent(event);
  return event;
};
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  Object.assign(state, { modelValue: '', generating: false, disabled: false, submitDisabled: false });
  app = createApp({
    render: () =>
      h(
        AChatComposer,
        {
          ...state,
          'ref': (value) => {
            exposed = value as unknown as AChatComposerExposed;
          },
          'onUpdate:modelValue': update,
          'onSubmit': submit,
          'onStop': stop,
        },
        {
          toolbar: (scope: Record<string, boolean>) => h('span', { 'data-slot': JSON.stringify(scope) }),
        }
      ),
  });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount('#app');
});
afterEach(() => app.unmount());

describe('AChatComposer', () => {
  it('emits controlled input and submits untrimmed content without clearing', async () => {
    input().value = 'draft';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(update).toHaveBeenCalledWith('draft');
    state.modelValue = '  hello\nworld  ';
    await nextTick();
    expect(key().defaultPrevented).toBe(true);
    expect(submit).toHaveBeenCalledWith('  hello\nworld  ');
    expect(input().value).toBe('  hello\nworld  ');
  });
  it('rejects whitespace and allows newline and modified keys', async () => {
    state.modelValue = ' \n ';
    await nextTick();
    key();
    expect(button().disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    state.modelValue = 'hello';
    await nextTick();
    [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }].forEach((options) =>
      expect(key(options).defaultPrevented).toBe(false)
    );
    expect(submit).not.toHaveBeenCalled();
  });
  it('does not submit composition confirmation or compatibility keycode 229', async () => {
    state.modelValue = '中文';
    await nextTick();
    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    key();
    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    key({ isComposing: true });
    key({ keyCode: 229 });
    expect(submit).not.toHaveBeenCalled();
    key();
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('allows editing and stopping while generation and submit restriction are both active', async () => {
    Object.assign(state, { modelValue: 'next draft', generating: true, submitDisabled: true });
    await nextTick();
    expect(input().disabled).toBe(false);
    expect(key().defaultPrevented).toBe(false);
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Stop generating');
    button().click();
    expect(stop).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('[data-slot]')?.getAttribute('data-slot')).toBe(
      JSON.stringify({ disabled: false, submitDisabled: true, generating: true })
    );
  });
  it('separates submit restriction from overall disabled state', async () => {
    Object.assign(state, { modelValue: 'hello', submitDisabled: true });
    await nextTick();
    key();
    expect(button().disabled).toBe(true);
    expect(input().disabled).toBe(false);
    Object.assign(state, { disabled: true, generating: true });
    await nextTick();
    expect(input().disabled).toBe(true);
    expect(button().disabled).toBe(true);
    button().click();
    expect(stop).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
  it('exposes focus and gives the textarea an accessible name', () => {
    exposed?.focus();
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute('aria-label')).toContain('Message');
  });
});
