import type { ComponentPublicInstance } from 'vue';
import TiptapEditor from './index.vue';
import type { ATiptapEditorProps, TiptapValueFormat } from './types';

type EditorProps<F extends TiptapValueFormat> = F extends TiptapValueFormat
  ? Omit<Parameters<typeof TiptapEditor<F>>[0], 'valueFormat' | 'modelValue'> & ATiptapEditorProps<F>
  : never;
type EditorExposed = Parameters<NonNullable<Parameters<typeof TiptapEditor>[2]>>[0];
type EditorInstance<F extends TiptapValueFormat> = Omit<ComponentPublicInstance<EditorProps<F>>, '$emit'> &
  EditorExposed & { $emit: NonNullable<Parameters<typeof TiptapEditor<F>>[1]>['emit'] };

interface TiptapEditorComponent {
  <F extends TiptapValueFormat = 'html'>(
    props: { valueFormat?: F } & EditorProps<F>,
    context?: Parameters<typeof TiptapEditor<F>>[1]
  ): ReturnType<typeof TiptapEditor<F>>;
  new <F extends TiptapValueFormat = 'html'>(props: { valueFormat?: F } & EditorProps<F>): EditorInstance<F>;
  // Keep InstanceType concrete on TypeScript 4.9 while templates infer F from constructor props.
  new (): EditorInstance<TiptapValueFormat>;
}

// Preserve Vue's instance-ref contract alongside format-specific template and h() props.
export default TiptapEditor as TiptapEditorComponent;
