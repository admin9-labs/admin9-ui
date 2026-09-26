/* eslint-disable import/no-duplicates, @typescript-eslint/no-unused-vars -- Independent negative imports verify removed public types. */
import type {
  AIconPickerProps,
  AIconPickerExposed,
  ACoordinatePickerProps,
  ACoordinatePickerExposed,
  AFilePickerProps,
  AImagePickerProps,
  AImagePickerEmits,
  AImagePickerSlots,
  AImagePickerExposed,
  ImagePickerValue,
  AFilePickerExposed,
  AFileUploaderProps,
  AFilterFormExposed,
  ATiptapEditorExposed,
  AChatComposerProps,
  AChatComposerExposed,
  AProTableExposed,
  AProTableEmits,
  ProTableAction,
  ProTableActionSlot,
} from '@admin9-labs/admin9-ui';
// @ts-expect-error Removed compatibility alias must not be published.
import type { Admin9UIOptions } from '@admin9-labs/admin9-ui';
// @ts-expect-error Generic public Action was replaced with a component-scoped type.
import type { Action } from '@admin9-labs/admin9-ui';
// @ts-expect-error Generic public Slot was replaced with a component-scoped type.
import type { Slot } from '@admin9-labs/admin9-ui';

export const icon: AIconPickerProps = { size: 'mini', readonly: true };
export const coordinate: ACoordinatePickerProps = { apiKey: '', size: 'mini', allowSearch: false };
export const files: AFilePickerProps = { size: 'mini', disabled: true, readonly: true, defaultView: 'list', allowClear: false };
export const upload: AFileUploaderProps = { limit: 2, maxFileSize: 100, size: 'mini' };
export const composer: AChatComposerProps = {
  modelValue: '',
  size: 'mini',
  readonly: true,
  textareaAttrs: { 'id': 'message', 'aria-label': 'Message' },
};
export function checkMethods(
  iconRef: AIconPickerExposed,
  coordinateRef: ACoordinatePickerExposed,
  filesRef: AFilePickerExposed,
  formRef: AFilterFormExposed,
  editorRef: ATiptapEditorExposed,
  composerRef: AChatComposerExposed,
  tableRef: AProTableExposed,
  emit: AProTableEmits<{ id: string }>
) {
  iconRef.focus();
  iconRef.blur();
  coordinateRef.open();
  coordinateRef.close();
  coordinateRef.clear();
  coordinateRef.focus();
  coordinateRef.blur();
  filesRef.open();
  filesRef.close();
  filesRef.clear();
  filesRef.refresh();
  formRef.validate();
  formRef.validateField('field');
  formRef.resetFields();
  formRef.clearValidate();
  formRef.setFields({});
  formRef.scrollToField('field');
  editorRef.getJSON();
  editorRef.getHTML();
  editorRef.getImageUploadState();
  composerRef.focus();
  composerRef.blur();
  tableRef.refresh({ resetPage: true });
  emit('selectionChange', ['one']);
  emit('select', ['one'], 'one', { id: 'one' });
  // @ts-expect-error Boolean refresh overload has been removed.
  tableRef.refresh(true);
}
export type RowAction = ProTableAction<{ id: string }>;
export type RowActionScope = ProTableActionSlot<{ id: string }>;

export function checkConcreteEditor(instance: InstanceType<typeof import('@admin9-labs/admin9-ui').ATiptapEditor>) {
  const exposed: ATiptapEditorExposed = instance;
  const focused: boolean | undefined = exposed.focus();
  const cleared: boolean | undefined = exposed.clear();
  return { focused, cleared };
}

export const imagePickerProps: AImagePickerProps = { multiple: true, limit: 2, showFileList: false, readonly: true };
export const emptyImagePicker: ImagePickerValue = undefined;
export const imagePickerSlots: AImagePickerSlots = {
  trigger: ({ open, selectedItems, selectedCount, disabled, readonly, limitReached }) => {
    if (!disabled && !readonly) open();
    return `${selectedItems.length}:${selectedCount}:${limitReached}`;
  },
};
// @ts-expect-error URL-only values belong to the application adapter.
export const invalidImagePickerValue: ImagePickerValue = '/image.png';
export function checkImagePicker(
  instance: InstanceType<typeof import('@admin9-labs/admin9-ui').AImagePicker>,
  emit: AImagePickerEmits
) {
  const exposed: AImagePickerExposed = instance;
  exposed.open();
  exposed.close();
  exposed.clear();
  const pending: Promise<void> = exposed.refresh();
  emit('confirm', []);
  emit('change', undefined);
  emit('visibleChange', false);
  return pending;
}
