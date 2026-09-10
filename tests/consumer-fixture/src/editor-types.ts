/* eslint-disable import/no-unresolved -- package imports resolve only after the tarball is installed in the fixture */
import { h, ref } from 'vue';
import {
  ATiptapEditor,
  type ATiptapEditorProps,
  type TiptapDocument,
  type TiptapValueFormat,
  type TiptapContentError,
} from '@admin9-labs/admin9-ui';

const document: TiptapDocument = { type: 'doc', content: [{ type: 'paragraph' }] };
const format: TiptapValueFormat = 'json';
const htmlProps: ATiptapEditorProps = { modelValue: '<p>HTML</p>' };
const jsonProps: ATiptapEditorProps<'json'> = { valueFormat: format, modelValue: document };
const onContentError = (error: TiptapContentError) => error.reason;
const editorRef = ref<InstanceType<typeof ATiptapEditor>>();
const html: string | undefined = editorRef.value?.getHTML();
const json: TiptapDocument | undefined = editorRef.value?.getJSON();
editorRef.value?.focus();
editorRef.value?.clear();
// @ts-expect-error Instance methods retain their concrete return types.
export const invalidHTMLReturn: number | undefined = editorRef.value?.getHTML();
// @ts-expect-error Instance emits reject values outside the document/string contract.
editorRef.value?.$emit('change', { invalid: true });
export { html, json };

h(ATiptapEditor<'html'>, { ...htmlProps, 'onUpdate:modelValue': (value: string) => value, onContentError });
h(ATiptapEditor, { ...htmlProps, 'onUpdate:modelValue': (value: string) => value });
h(ATiptapEditor<'json'>, { ...jsonProps, 'onUpdate:modelValue': (value: TiptapDocument) => value, onContentError });
h(ATiptapEditor, { ...jsonProps, onChange: (value: TiptapDocument) => value });
// @ts-expect-error A JSON props object must identify its runtime format.
export const missingJSONFormat: ATiptapEditorProps<'json'> = { modelValue: document };
// @ts-expect-error Specializing the component does not set its runtime format.
h(ATiptapEditor<'json'>, { modelValue: document });
// @ts-expect-error The default component also rejects JSON without a format.
h(ATiptapEditor, { modelValue: document });
ATiptapEditor({ valueFormat: 'json', modelValue: document, onChange: (value: TiptapDocument) => value });
// @ts-expect-error Format is inferred from valueFormat, not widened by modelValue.
ATiptapEditor({ valueFormat: 'json', modelValue: '<p>HTML</p>' });
// @ts-expect-error Omitting the format keeps the HTML contract.
ATiptapEditor({ modelValue: document });
// @ts-expect-error An inferred JSON component cannot call a string callback.
ATiptapEditor({ valueFormat: 'json', onChange: (value: string) => value });
// @ts-expect-error HTML is the default model format.
export const invalidHTML: ATiptapEditorProps = { modelValue: document };
// @ts-expect-error JSON mode requires a document object, not serialized JSON.
export const invalidJSON: ATiptapEditorProps<'json'> = { valueFormat: 'json', modelValue: '{}' };
// @ts-expect-error JSON model cannot be passed to an HTML component.
h(ATiptapEditor<'html'>, { modelValue: document });
// @ts-expect-error HTML model cannot be passed to a JSON component.
h(ATiptapEditor<'json'>, { valueFormat: 'json', modelValue: '<p>HTML</p>' });
// @ts-expect-error JSON change handlers receive documents.
h(ATiptapEditor<'json'>, { valueFormat: 'json', onChange: (value: string) => value });
