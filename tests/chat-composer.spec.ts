import { createApp, h, nextTick, reactive, ref, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AChatComposer from '../src/components/chat-composer/index.vue';
import type { AChatComposerExposed, ChatComposerSize, ChatComposerSlot } from '../src/components/chat-composer/types';
import { messages } from '../src/locale';

let app: App;
const customAction = ref(false);
let activate: (() => void) | undefined;
const state = reactive({
  modelValue: '',
  size: undefined as ChatComposerSize | undefined,
  generating: false,
  disabled: false,
  submitDisabled: false,
  maxLength: undefined as number | undefined,
  autoSize: { minRows: 1, maxRows: 8 },
});
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
  customAction.value = false;
  document.body.innerHTML = '<div id="app"></div>';
  Object.assign(state, {
    modelValue: '',
    size: undefined,
    generating: false,
    disabled: false,
    submitDisabled: false,
    maxLength: undefined,
  });
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
          header: (scope: ChatComposerSlot) => h('span', { 'data-header-slot': JSON.stringify(scope) }),
          attachments: (scope: ChatComposerSlot) => h('span', { 'data-attachments-slot': JSON.stringify(scope) }),
          toolbar: (scope: ChatComposerSlot) => h('span', { 'data-toolbar-slot': JSON.stringify(scope) }),
          ...(customAction.value
            ? {
                action: (scope: ChatComposerSlot & { canSubmit: boolean; activate: () => void }) => {
                  activate = scope.activate;
                  return h(
                    'button',
                    { disabled: scope.disabled || (!scope.generating && !scope.canSubmit), onClick: scope.activate },
                    'Custom'
                  );
                },
              }
            : {}),
        }
      ),
  });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount('#app');
});
afterEach(() => app.unmount());

describe('AChatComposer', () => {
  it('defaults every surface to large and switches size without rebuilding or disturbing the input', async () => {
    state.modelValue = 'draft text';
    await nextTick();
    const originalInput = input();
    originalInput.focus();
    originalInput.setSelectionRange(2, 7);

    const assertSize = (size: ChatComposerSize) => {
      expect(document.querySelector('.a9-chat-composer')?.classList.contains(`a9-chat-composer--${size}`)).toBe(true);
      expect(button().classList.contains(`arco-btn-size-${size}`)).toBe(true);
      ['header', 'attachments', 'toolbar'].forEach((slot) => {
        expect(document.querySelector(`[data-${slot}-slot]`)?.getAttribute(`data-${slot}-slot`)).toContain(`"size":"${size}"`);
      });
    };

    assertSize('large');
    const assertInputState = () => {
      expect(input()).toBe(originalInput);
      expect(input().value).toBe('draft text');
      expect(document.activeElement).toBe(originalInput);
      expect(input().selectionStart).toBe(2);
      expect(input().selectionEnd).toBe(7);
    };
    state.size = 'small';
    await nextTick();
    assertSize('small');
    assertInputState();
    state.size = 'medium';
    await nextTick();
    assertSize('medium');
    assertInputState();
    state.size = 'large';
    await nextTick();
    assertSize('large');
    assertInputState();
  });

  it('truncates pasted supplementary characters by code point without splitting them', async () => {
    state.maxLength = 1;
    await nextTick();
    input().value = '😀a';
    input().dispatchEvent(new Event('input', { bubbles: true }));
    expect(update).toHaveBeenCalledWith('😀');
    state.modelValue = '😀';
    await nextTick();
    key();
    expect(submit).toHaveBeenCalledWith('😀');
  });
  it('guards a custom action and permits stopping during submit cooldown', async () => {
    customAction.value = true;
    await nextTick();
    activate?.();
    expect(submit).not.toHaveBeenCalled();
    state.modelValue = 'hello';
    await nextTick();
    button().click();
    expect(submit).toHaveBeenCalledWith('hello');
    Object.assign(state, { generating: true, submitDisabled: true });
    await nextTick();
    expect(button().disabled).toBe(false);
    button().click();
    expect(stop).toHaveBeenCalledOnce();
    state.disabled = true;
    await nextTick();
    activate?.();
    expect(stop).toHaveBeenCalledOnce();
  });
  it('rejects externally supplied overlong text and accepts the exact limit', async () => {
    state.maxLength = 2;
    state.modelValue = '三个字';
    await nextTick();
    key();
    expect(submit).not.toHaveBeenCalled();
    expect(button().disabled).toBe(true);
    state.modelValue = '两字';
    await nextTick();
    key();
    expect(submit).toHaveBeenCalledWith('两字');
  });
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
    expect(button().getAttribute('aria-label')).toBe('Stop generating');
    button().click();
    expect(stop).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector('[data-toolbar-slot]')?.getAttribute('data-toolbar-slot')).toBe(
      JSON.stringify({ size: 'large', disabled: false, submitDisabled: true, generating: true })
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
