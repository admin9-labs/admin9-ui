import { createApp, h, nextTick, ref, type App } from 'vue';
import { Modal as ArcoModal } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from '../src/internal/modal.vue';
import { messages } from '../src/locale';

const apps: App[] = [];
function mount(render: () => ReturnType<typeof h>, locale = 'en-US') {
  const i18n = createI18n({ legacy: false, locale, messages });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render });
  app.use(i18n);
  app.mount(host);
  apps.push(app);
  return { i18n };
}
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
});

describe('localized internal Modal with real Arco', () => {
  it('localizes only its own close button, preserves slots and forwards cancellation', async () => {
    const visible = ref(true);
    const cancel = vi.fn();
    const { i18n } = mount(
      () =>
        h('div', [
          h(
            Modal,
            {
              'visible': visible.value,
              'modalClass': 'localized-modal',
              'title': '核对素材',
              'onCancel': cancel,
              'onUpdate:visible': (value: boolean) => {
                visible.value = value;
              },
            },
            {
              default: () => h('input', { id: 'modal-content', value: 'selected.png' }),
              footer: () => h('button', { id: 'modal-footer' }, '自定义确认'),
            }
          ),
          h(ArcoModal, { visible: true, modalClass: 'application-modal', title: 'Application' }),
        ]),
      'zh-CN'
    );
    await vi.waitFor(() =>
      expect(document.querySelector('.localized-modal .arco-modal-close-btn')?.getAttribute('aria-label')).toBe('关闭弹窗')
    );
    expect(document.querySelector<HTMLInputElement>('#modal-content')?.value).toBe('selected.png');
    expect(document.querySelector('#modal-footer')?.textContent).toBe('自定义确认');
    expect(document.querySelector('.application-modal .arco-modal-close-btn')?.getAttribute('aria-label')).toBe('Close');
    i18n.global.locale.value = 'en-US';
    await nextTick();
    await vi.waitFor(() =>
      expect(document.querySelector('.localized-modal .arco-modal-close-btn')?.getAttribute('aria-label')).toBe('Close dialog')
    );
    expect(document.querySelector('.application-modal .arco-modal-close-btn')?.getAttribute('aria-label')).toBe('Close');
    document.querySelector<HTMLElement>('.localized-modal .arco-modal-close-btn')?.click();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    expect(visible.value).toBe(false);
  });

  it('preserves the asynchronous before-ok guard', async () => {
    const beforeOk = vi.fn(async () => false);
    const update = vi.fn();
    const ok = vi.fn();
    mount(() =>
      h(Modal, {
        'visible': true,
        'modalClass': 'guarded-modal',
        'onBeforeOk': beforeOk,
        'onOk': ok,
        'onUpdate:visible': update,
      })
    );
    await nextTick();
    document.querySelector<HTMLElement>('.guarded-modal .arco-modal-footer .arco-btn-primary')?.click();
    await vi.waitFor(() => expect(beforeOk).toHaveBeenCalledOnce());
    await nextTick();
    expect(update).not.toHaveBeenCalled();
    expect(ok).not.toHaveBeenCalled();
  });
});
