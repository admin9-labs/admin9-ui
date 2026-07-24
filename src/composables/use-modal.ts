import { Message, Modal, type ModalConfig, type ModalReturn } from '@arco-design/web-vue';
import { useI18n } from 'vue-i18n';

/**
 * 命令式弹窗，对标 Arco Modal.open，叠加项目惯例：
 * - 统一 i18n 文案（确定/取消/删除确认）
 * - 防重复提交（onBeforeOk + done 控制）
 * - 可选统一成功提示（传 successMsg 时弹，不传则由调用方自行处理）
 *
 * 库只依赖 Arco Modal + vue-i18n，不调任何具体后端。
 */
export interface UseModalReturn {
  /** 删除确认（最常用场景，自动 i18n + 防重复提交 + 可选成功提示） */
  confirmDelete: (config: {
    title?: string;
    content?: string;
    onDelete: () => Promise<void>;
    /** 传入则删除成功后弹此提示；不传则由 onSuccess 自行处理 */
    successMsg?: string;
    onSuccess?: () => void;
  }) => ModalReturn;
  /** 通用确认 */
  confirm: (config: {
    title: string;
    content: string;
    onOk: () => Promise<void> | void;
    okText?: string;
    cancelText?: string;
    type?: 'warning' | 'info';
    hideCancel?: boolean;
    /** 传入则成功后弹此提示 */
    successMsg?: string;
  }) => void;
  /** 透传 Arco ModalConfig（不丢原生能力） */
  open: (config: ModalConfig) => ModalReturn;
}

export function useModal(): UseModalReturn {
  const { t } = useI18n();

  const confirmDelete: UseModalReturn['confirmDelete'] = ({ onDelete, title, content, successMsg, onSuccess }) =>
    Modal.warning({
      title: title ?? t('common.confirm.delete.title'),
      content: content ?? t('common.confirm.delete.content'),
      okText: t('common.action.delete'),
      cancelText: t('common.action.cancel'),
      hideCancel: false,
      onBeforeOk: async (done) => {
        try {
          await onDelete();
          done(true);
          if (successMsg) Message.success(successMsg);
          onSuccess?.();
        } catch {
          done(false);
        }
      },
    });

  const confirm: UseModalReturn['confirm'] = ({
    title,
    content,
    onOk,
    okText,
    cancelText,
    type = 'warning',
    hideCancel = false,
    successMsg,
  }) => {
    const opener = type === 'info' ? Modal.info : Modal.warning;
    opener({
      title,
      content,
      okText: okText ?? t('common.action.confirm'),
      cancelText: cancelText ?? t('common.action.cancel'),
      hideCancel,
      onBeforeOk: async (done) => {
        try {
          await onOk();
          done(true);
          if (successMsg) Message.success(successMsg);
        } catch {
          done(false);
        }
      },
    });
  };

  const open = (config: ModalConfig) => Modal.open(config);

  return { confirmDelete, confirm, open };
}

export default useModal;
