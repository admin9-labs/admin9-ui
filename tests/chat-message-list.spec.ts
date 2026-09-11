import MarkdownIt from 'markdown-it';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AChatMessageList from '../src/components/chat-message-list/index.vue';
import type { AChatMessageListExposed, ChatMessage, ChatMessageSlot } from '../src/components/chat-message-list/types';
import { messages } from '../src/locale';

let app: App | undefined;
let exposed: AChatMessageListExposed;
const state = reactive({ messages: [] as ChatMessage[], autoScroll: true });
let frames: Map<number, FrameRequestCallback>;
let sequence: number;
let resize: () => void;
const disconnect = vi.fn();
let height: number;
let extra: number;
let top: number;
let viewport: HTMLElement;
const rowHeight = 100;
const mount = (slots: Record<string, (scope: ChatMessageSlot) => unknown> = {}) => {
  app = createApp({
    render: () =>
      h(
        AChatMessageList,
        {
          ...state,
          ref: (value) => {
            exposed = value as unknown as AChatMessageListExposed;
          },
        },
        slots
      ),
  });
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount('#app');
  viewport = document.querySelector('.a9-chat-message-list__viewport') as HTMLElement;
  Object.defineProperties(viewport, {
    clientHeight: { get: () => height },
    scrollHeight: { get: () => state.messages.length * rowHeight + extra },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = value;
      },
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: HTMLElement) {
    const index = Array.from(document.querySelectorAll('[data-chat-message]')).indexOf(this);
    return {
      top: index < 0 ? 0 : index * rowHeight - top,
      bottom: index < 0 ? height : (index + 1) * rowHeight - top,
    } as DOMRect;
  });
};
const flush = async () => {
  await nextTick();
  for (let round = 0; round < 4; round += 1) {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
    // Each frame must finish its Vue patch before the next frame is executed.
    // eslint-disable-next-line no-await-in-loop
    await nextTick();
  }
};
const scroll = (value: number) => {
  top = value;
  viewport.dispatchEvent(new Event('scroll'));
};
const history = (count: number): ChatMessage[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${index}`, role: 'assistant', content: `message ${index}` }));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  Object.assign(state, { messages: [], autoScroll: true });
  frames = new Map();
  sequence = 0;
  height = 200;
  top = 0;
  extra = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    sequence += 1;
    frames.set(sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }

      observe = vi.fn();

      disconnect = disconnect;
    }
  );
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe('AChatMessageList rendering', () => {
  it('renders empty state and safe plain user text', async () => {
    mount();
    expect(viewport.textContent).toContain('No messages yet');
    state.messages = [{ id: 'u', role: 'user', content: '<img src=x onerror=alert(1)>\n**plain**' }];
    await flush();
    expect(viewport.querySelector('img')).toBeNull();
    expect(viewport.querySelector('strong')).toBeNull();
    expect(viewport.textContent).toContain('**plain**');
  });
  it('renders markdown, incomplete fences and tables without executing HTML or loading images', async () => {
    state.messages = [
      {
        id: 'a',
        role: 'assistant',
        content:
          '# Title\n\n**strong** ~~old~~\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n<script>alert(1)</script>\n\n![description](https://example.com/image.png)\n\n```ts\nconst a = 1;',
      },
    ];
    mount();
    await flush();
    expect(viewport.querySelector('h1')?.textContent).toBe('Title');
    expect(viewport.querySelector('table')).not.toBeNull();
    expect(viewport.querySelector('s')?.textContent).toBe('old');
    expect(viewport.querySelector('pre code')?.textContent).toContain('const a = 1;');
    expect(viewport.querySelector('script, img')).toBeNull();
    expect(viewport.querySelector('a')?.textContent).toBe('description');
  });
  it('allows only approved links, escaping attributes and treating other destinations as text', () => {
    state.messages = [
      {
        id: 'a',
        role: 'assistant',
        content:
          '[web](https://example.com) [mail](mailto:test@example.com) [relative](/settings) [fragment](#secret) [script](javascript:alert%281%29) [data](data:text/html,bad) [encoded](jav&#x61;script:alert%281%29) ![quote](https://example.com/%22evil)',
      },
    ];
    mount();
    const links = [...viewport.querySelectorAll('a')];
    expect(links).toHaveLength(3);
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[1].getAttribute('target')).toBeNull();
    expect(links.every((link) => /^(https:\/\/|mailto:)/.test(link.getAttribute('href') ?? ''))).toBe(true);
    expect(viewport.textContent).toContain('relative');
  });
  it('retains partial content in error/stopped states and passes message slots', async () => {
    state.messages = [{ id: 'a', role: 'assistant', content: 'partial', status: 'error' }];
    const actions = vi.fn(({ message, index }: ChatMessageSlot) => h('button', `${message.id}:${index}`));
    mount({ actions, footer: ({ message }) => h('span', `source-${message.id}`), avatar: () => h('span', 'custom avatar') });
    await flush();
    expect(viewport.textContent).toContain('partial');
    expect(viewport.textContent).toContain('Generation failed');
    expect(viewport.textContent).toContain('source-a');
    expect(viewport.textContent).toContain('custom avatar');
    expect(actions).toHaveBeenCalledWith(expect.objectContaining({ index: 0, message: expect.objectContaining({ id: 'a' }) }));
    state.messages[0].status = 'stopped';
    await flush();
    expect(viewport.textContent).toContain('Stopped');
    expect(document.querySelector('[aria-live]')?.textContent).not.toContain('partial');
  });
  it('preserves unchanged markdown nodes, selection, link focus and code scrolling during streaming', async () => {
    state.messages = [
      {
        id: 'a',
        role: 'assistant',
        content: '# Stable heading\n\n[Stable link](https://example.com)\n\n```ts\nconst stable = 1;\n```\n\nStreaming body',
        status: 'streaming',
      },
    ];
    mount();
    await flush();
    const heading = viewport.querySelector('h1') as HTMLElement;
    const link = viewport.querySelector('a') as HTMLAnchorElement;
    const code = viewport.querySelector('pre') as HTMLPreElement;
    const selection = window.getSelection() as Selection;
    const range = document.createRange();
    range.selectNodeContents(heading);
    selection.removeAllRanges();
    selection.addRange(range);
    link.focus();
    code.scrollLeft = 40;
    state.messages[0].content += ' updated';
    await flush();
    expect(viewport.querySelector('h1')).toBe(heading);
    expect(viewport.querySelector('a')).toBe(link);
    expect(viewport.querySelector('pre')).toBe(code);
    expect(document.activeElement).toBe(link);
    expect(selection.toString()).toBe('Stable heading');
    expect(code.scrollLeft).toBe(40);
    expect(viewport.textContent).toContain('Streaming body updated');
    selection.removeAllRanges();
  });
  it.each(['paragraph', 'fence'])('preserves a backwards selection inside a growing %s', async (format) => {
    state.messages = [
      { id: 'a', role: 'assistant', content: `${format === 'fence' ? '```txt\n' : ''}An existing answer`, status: 'streaming' },
    ];
    mount();
    await flush();
    const text = viewport.querySelector(format === 'fence' ? 'pre code' : 'p')?.firstChild as Text;
    const selection = window.getSelection() as Selection;
    selection.setBaseAndExtent(text, 18, text, 3);
    state.messages[0].content += ' with more text';
    await flush();
    expect(selection.toString()).toBe('existing answer');
    expect(selection.anchorNode).toBe(text);
    expect(selection.anchorOffset).toBe(18);
    expect(selection.focusOffset).toBe(3);
    selection.removeAllRanges();
  });
  it('renders nested tight lists, quotes, breaks and aligned tables with escaped code', async () => {
    state.messages = [
      {
        id: 'a',
        role: 'assistant',
        content:
          '3. **First**\n   - nested *item*\n4. Second\n\n> Quote\n>\n> Paragraph\n\nline  \nbreak\n\n---\n\n| left | right |\n| :--- | ---: |\n| A | B |\n\n```html\n<script>alert(1)</script>\n```',
      },
    ];
    mount();
    await flush();
    expect(viewport.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(viewport.querySelector('ol > li > p')).toBeNull();
    expect(viewport.querySelector('ol ul em')?.textContent).toBe('item');
    expect(viewport.querySelectorAll('blockquote p')).toHaveLength(2);
    expect(viewport.querySelector('br')).not.toBeNull();
    expect(viewport.querySelector('hr')).not.toBeNull();
    expect(viewport.querySelector('th:last-child')?.getAttribute('style')).toContain('text-align: right');
    expect(viewport.querySelector('code.language-html')?.textContent).toContain('<script>alert(1)</script>');
    expect(viewport.querySelector('script')).toBeNull();
  });
  it('announces the latest assistant with the default complete status, including when status is removed', async () => {
    state.messages = [{ id: 'a', role: 'assistant', content: 'failed', status: 'error' }];
    mount();
    await flush();
    const announcement = () => document.querySelector('[aria-live]')?.textContent;
    expect(announcement()).toBe('Assistant: Generation failed');
    state.messages.push({ id: 'b', role: 'assistant', content: 'completed' });
    await flush();
    expect(announcement()).toBe('Assistant: Generation complete');
    state.messages[1].status = 'streaming';
    await flush();
    expect(announcement()).toBe('Assistant: Generating');
    delete state.messages[1].status;
    state.messages.push({ id: 'u', role: 'user', content: 'next question' });
    await flush();
    expect(announcement()).toBe('Assistant: Generation complete');
  });
  it('supports a replacement content slot and parses only changed messages once per frame', async () => {
    state.messages = history(2);
    const render = vi.spyOn(MarkdownIt.prototype, 'parse');
    mount();
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    state.messages[0].status = 'streaming';
    await flush();
    expect(render).toHaveBeenCalledTimes(2);
    state.messages[0].content = 'first delta';
    await nextTick();
    state.messages[0].content = 'last delta';
    await nextTick();
    await flush();
    expect(render).toHaveBeenCalledTimes(3);
    expect(viewport.textContent).toContain('last delta');
    app?.unmount();
    mount({ content: ({ message }) => h('mark', message.id) });
    expect(viewport.querySelector('mark')?.textContent).toBe('0');
    expect(viewport.querySelector('.a9-chat-markdown')).toBeNull();
  });
});

describe('AChatMessageList scrolling', () => {
  it('follows a large append using the state before layout changes', async () => {
    state.messages = history(10);
    mount();
    await flush();
    expect(top).toBe(800);
    extra = 2000;
    state.messages[9].content += 'large update';
    resize();
    await flush();
    expect(top).toBe(2800);
  });
  it('preserves an anchor during simultaneous history prepend and trailing generation', async () => {
    state.messages = history(10);
    mount();
    await flush();
    scroll(250);
    state.messages.unshift({ id: 'older', role: 'user', content: 'history' });
    extra = 1000;
    state.messages[10].content += 'delta';
    resize();
    await flush();
    expect(top).toBe(350);
    expect(document.querySelector('.a9-chat-message-list__bottom')).not.toBeNull();
    exposed.scrollToBottom();
    await flush();
    expect(top).toBe(1900);
    extra += 200;
    resize();
    await flush();
    expect(top).toBe(2100);
  });
  it('resumes following when the user manually reaches the bottom', async () => {
    state.messages = history(10);
    mount();
    await flush();
    scroll(100);
    scroll(800);
    extra = 300;
    resize();
    await flush();
    expect(top).toBe(1100);
  });
  it('preserves reading position across hiding and reopening but follows if previously at bottom', async () => {
    state.messages = history(10);
    mount();
    await flush();
    scroll(250);
    height = 0;
    resize();
    await flush();
    state.messages.unshift({ id: 'older', role: 'user', content: 'older' });
    await flush();
    height = 200;
    resize();
    await flush();
    expect(top).toBe(350);
    exposed.scrollToBottom();
    await flush();
    height = 0;
    resize();
    await flush();
    extra = 400;
    height = 200;
    resize();
    await flush();
    expect(top).toBe(1300);
  });
  it('does not auto-follow when disabled, including after an explicit bottom action', async () => {
    state.messages = history(10);
    state.autoScroll = false;
    mount();
    await flush();
    expect(top).toBe(0);
    exposed.scrollToBottom();
    await flush();
    expect(top).toBe(800);
    extra = 200;
    resize();
    await flush();
    expect(top).toBe(800);
  });
  it('initializes an empty list, clamps position after anchor removal and clears scheduled work', async () => {
    mount();
    await flush();
    state.messages = history(10);
    await flush();
    expect(top).toBe(800);
    scroll(650);
    state.messages = history(3);
    await flush();
    expect(top).toBe(100);
    state.messages[0].content = 'pending';
    await nextTick();
    app?.unmount();
    app = undefined;
    await flush();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });
});
