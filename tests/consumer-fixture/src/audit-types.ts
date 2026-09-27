/* eslint-disable import/no-duplicates, @typescript-eslint/no-unused-vars -- Independent negative imports verify removed public types. */
import type {
  FileListParams,
  FileGroup,
  FileUploadRejection,
  FileUploadFailureReason,
  FileUploadOptions,
  FileBrowseCapability,
  AIconPickerProps,
  AIconPickerExposed,
  ACoordinatePickerProps,
  ACoordinatePickerExposed,
  AFilePickerProps,
  AImagePickerProps,
  AImagePickerEmits,
  AImagePickerSlots,
  AImagePickerExposed,
  ImagePickerDisplayMode,
  ImagePickerFit,
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

export const imagePickerDisplayMode: ImagePickerDisplayMode = 'banner';
export const imagePickerFit: ImagePickerFit = 'cover';
export const imagePickerProps: AImagePickerProps = {
  multiple: true,
  limit: 2,
  showFileList: false,
  displayMode: imagePickerDisplayMode,
  fit: imagePickerFit,
  readonly: true,
};
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

export const mixedGroupQuery: FileListParams = { page: 1, pageSize: 24, groupId: 'campaign', fileTypes: ['image', 'document'] };
export const ungroupedQuery: FileListParams = { page: 1, pageSize: 24, groupId: null };
export const globalGroups: FileBrowseCapability['listGroups'] = async () => [{ id: 'campaign', name: 'Campaign' }];
export const mixedUploader: AFileUploaderProps = { fileTypes: ['image', 'document'], groupId: 'campaign' };
export function uploadConstraints(options: FileUploadOptions) {
  const allowed: readonly string[] = options.fileTypes;
  // @ts-expect-error Uploads no longer assign a single file type.
  const removed = options.fileType;
  return { allowed, removed };
}
// @ts-expect-error Single-type and multi-type query filters remain mutually exclusive.
export const invalidTypeQuery: FileListParams = { page: 1, pageSize: 24, fileType: 'image', fileTypes: ['document'] };
// @ts-expect-error The uploader uses allowed type sets.
export const legacyUploader: AFileUploaderProps = { fileType: 'image' };

export const rejectedType: FileUploadRejection = { code: 'unsupported-file-type' };
export const rejectedFormat: FileUploadRejection = { code: 'unsupported-file-format', allowedFormats: ['PNG', 'JPG'] };
export const rejectionReasons: FileUploadFailureReason[] = ['file-type', 'file-format'];
// @ts-expect-error Arbitrary transport codes do not enter the controlled rejection contract.
export const arbitraryRejection: FileUploadRejection = { code: 'ECONNRESET' };

export const nestedGroups: FileGroup[] = [
  { id: 'campaign', name: 'Campaign' },
  { id: 'event', name: 'Event assets', parentId: 'campaign' },
];
