import MarkdownIt from 'markdown-it';
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUpdated,
  ref,
  shallowRef,
  watch,
  type VNodeChild,
} from 'vue';

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
// eslint-disable-next-line no-control-regex -- Reject literal control characters in destinations.
const safeLink = (url: string) => /^(https?:\/\/|mailto:)/i.test(url) && !/[\u0000-\u0020\u007f]/.test(url);
markdown.validateLink = safeLink;
const linkAttributes = (url: string) => ({
  href: url,
  ...(/^https?:\/\//i.test(url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
});

// Only markdown-it's built-in tokens reach this renderer; raw HTML and plugins are disabled.
// Vue patches the token tree instead of replacing the whole message's HTML on every delta.
function renderTokens(tokens: MarkdownIt.Token[]): VNodeChild[] {
  let index = 0;
  const consume = (): VNodeChild[] => {
    const nodes: VNodeChild[] = [];
    while (index < tokens.length) {
      const token = tokens[index];
      index += 1;
      if (token.nesting === -1) break;
      const attrs = Object.fromEntries(token.attrs ?? []);
      if (token.tag === 'a') Object.assign(attrs, linkAttributes(token.attrGet('href') ?? ''));
      if (token.nesting === 1) {
        const children = consume();
        if (token.hidden) nodes.push(...children);
        else nodes.push(h(token.tag, attrs, children));
      } else if (token.type === 'inline') {
        nodes.push(...renderTokens(token.children ?? []));
      } else if (token.type === 'text') {
        nodes.push(token.content);
      } else if (token.type === 'softbreak') {
        nodes.push('\n');
      } else if (token.type === 'code_inline') {
        nodes.push(h('code', [token.content]));
      } else if (token.type === 'fence' || token.type === 'code_block') {
        const language = markdown.utils.unescapeAll(token.info).trim().split(/\s+/)[0];
        nodes.push(h('pre', [h('code', { class: language ? `language-${language}` : undefined }, [token.content])]));
      } else if (token.type === 'image') {
        const label = markdown.renderer.renderInlineAsText(token.children ?? [], markdown.options, {});
        const url = token.attrGet('src') ?? '';
        nodes.push(safeLink(url) ? h('a', linkAttributes(url), label || url) : label);
      } else {
        nodes.push(h(token.tag, attrs));
      }
    }
    return nodes;
  };
  return consume();
}

export default defineComponent({
  name: 'ChatMarkdown',
  props: { content: { type: String, required: true } },
  setup(props) {
    const tokens = shallowRef(markdown.parse(props.content, {}));
    const root = ref<HTMLElement>();
    let mounted = false;
    let frame: number | undefined;
    // Updating an existing text node also resets native selection offsets. Preserve selections
    // in unchanged text prefixes (including a paragraph that is still receiving appended text).
    let selectionBefore:
      | { anchor: Text; focus: Text; anchorOffset: number; focusOffset: number; anchorPrefix: string; focusPrefix: string }
      | undefined;
    onBeforeUpdate(() => {
      selectionBefore = undefined;
      const selection = root.value?.ownerDocument.getSelection();
      if (!selection || selection.isCollapsed) return;
      const { anchorNode, focusNode, anchorOffset, focusOffset } = selection;
      if (
        anchorNode?.nodeType !== 3 ||
        focusNode?.nodeType !== 3 ||
        !root.value?.contains(anchorNode) ||
        !root.value.contains(focusNode)
      )
        return;
      selectionBefore = {
        anchor: anchorNode as Text,
        focus: focusNode as Text,
        anchorOffset,
        focusOffset,
        anchorPrefix: anchorNode.textContent?.slice(0, anchorOffset) ?? '',
        focusPrefix: focusNode.textContent?.slice(0, focusOffset) ?? '',
      };
    });
    onUpdated(() => {
      const saved = selectionBefore;
      selectionBefore = undefined;
      if (!saved || !root.value?.contains(saved.anchor) || !root.value.contains(saved.focus)) return;
      if (
        saved.anchor.data.slice(0, saved.anchorOffset) !== saved.anchorPrefix ||
        saved.focus.data.slice(0, saved.focusOffset) !== saved.focusPrefix
      )
        return;
      const selection = root.value.ownerDocument.getSelection();
      if (
        selection?.anchorNode !== saved.anchor ||
        selection.anchorOffset !== saved.anchorOffset ||
        selection.focusNode !== saved.focus ||
        selection.focusOffset !== saved.focusOffset
      ) {
        selection?.setBaseAndExtent(saved.anchor, saved.anchorOffset, saved.focus, saved.focusOffset);
      }
    });
    onMounted(() => {
      mounted = true;
    });
    watch(
      () => props.content,
      () => {
        if (!mounted) tokens.value = markdown.parse(props.content, {});
        else if (frame === undefined) {
          frame = requestAnimationFrame(() => {
            frame = undefined;
            tokens.value = markdown.parse(props.content, {});
          });
        }
      }
    );
    onBeforeUnmount(() => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    });
    return () => h('div', { ref: root, class: 'a9-chat-markdown' }, renderTokens(tokens.value));
  },
});
