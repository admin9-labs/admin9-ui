import { mergeAttributes, Node } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import {
  isSafeMediaUrl,
  normalizeAudioWidth,
  normalizeBlockWidth,
  normalizeInlineSize,
  normalizeMediaAlign,
} from './media-attributes';
import MediaNodeView from './media-node-view.vue';
import type { TiptapImageDisplay } from './types';

export { isSafeMediaUrl } from './media-attributes';

export type TiptapMediaNodeName = 'blockImage' | 'inlineImage' | 'video' | 'audio';

const readCommonAttributes = (element: HTMLElement) => {
  const src = element.getAttribute('src');
  if (!isSafeMediaUrl(src)) return false;
  return {
    src,
    title: element.getAttribute('title'),
  };
};

const commonAttributes = {
  src: { default: null },
  title: { default: null },
};

const renderCommonAttributes = (attributes: Record<string, unknown>) => {
  const result: Record<string, string> = {};
  if (isSafeMediaUrl(attributes.src)) result.src = attributes.src;
  if (typeof attributes.title === 'string' && attributes.title) result.title = attributes.title;
  return result;
};

interface ImageNodeOptions {
  getDefaultDisplay: () => TiptapImageDisplay;
}

export const BlockImage = Node.create<ImageNodeOptions>({
  name: 'blockImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { getDefaultDisplay: () => 'block' };
  },

  addAttributes() {
    return {
      ...commonAttributes,
      alt: { default: '' },
      width: { default: 'natural' },
      align: { default: 'left' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => {
          const image = element as HTMLElement;
          const display = image.getAttribute('data-display');
          if (display !== 'block' && (display || this.options.getDefaultDisplay() !== 'block')) return false;
          const common = readCommonAttributes(image);
          if (!common) return false;
          return {
            ...common,
            alt: image.getAttribute('alt') ?? '',
            width: normalizeBlockWidth(image.getAttribute('data-width')),
            align: normalizeMediaAlign(image.getAttribute('data-align')),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const width = normalizeBlockWidth(HTMLAttributes.width);
    return [
      'img',
      mergeAttributes(renderCommonAttributes(HTMLAttributes), {
        'alt': typeof HTMLAttributes.alt === 'string' ? HTMLAttributes.alt : '',
        'loading': 'lazy',
        'data-display': 'block',
        'data-width': width,
        'data-align': normalizeMediaAlign(HTMLAttributes.align),
        ...(width === 'natural' ? {} : { width }),
      }),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(MediaNodeView);
  },
});

export const InlineImage = Node.create<ImageNodeOptions>({
  name: 'inlineImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { getDefaultDisplay: () => 'block' };
  },

  addAttributes() {
    return {
      ...commonAttributes,
      alt: { default: '' },
      size: { default: '1em' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => {
          const image = element as HTMLElement;
          const display = image.getAttribute('data-display');
          if (display !== 'inline' && (display || this.options.getDefaultDisplay() !== 'inline')) return false;
          const common = readCommonAttributes(image);
          if (!common) return false;
          return {
            ...common,
            alt: image.getAttribute('alt') ?? '',
            size: normalizeInlineSize(image.getAttribute('data-size')),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(renderCommonAttributes(HTMLAttributes), {
        'alt': typeof HTMLAttributes.alt === 'string' ? HTMLAttributes.alt : '',
        'loading': 'lazy',
        'data-display': 'inline',
        'data-size': normalizeInlineSize(HTMLAttributes.size),
      }),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(MediaNodeView);
  },
});

interface PlaybackNodeOptions {
  tag: 'video' | 'audio';
  getPlaybackTabIndex: () => -1 | undefined;
}

const createPlaybackNode = (name: 'video' | 'audio') =>
  Node.create<PlaybackNodeOptions>({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addOptions() {
      return { tag: name, getPlaybackTabIndex: () => undefined };
    },

    addAttributes() {
      return {
        ...commonAttributes,
        width: { default: name === 'video' ? '100%' : 'standard' },
        align: { default: 'left' },
      };
    },

    parseHTML() {
      return [
        {
          tag: `${name}[src]`,
          getAttrs: (element) => {
            const media = element as HTMLElement;
            const common = readCommonAttributes(media);
            if (!common) return false;
            if (name === 'audio') {
              return {
                ...common,
                width: normalizeAudioWidth(media.getAttribute('data-width')),
                align: normalizeMediaAlign(media.getAttribute('data-align')),
              };
            }
            return {
              ...common,
              width: normalizeBlockWidth(media.getAttribute('data-width'), '100%'),
              align: normalizeMediaAlign(media.getAttribute('data-align')),
            };
          },
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const attributes: Record<string, string> = {
        ...renderCommonAttributes(HTMLAttributes),
        controls: '',
        preload: 'metadata',
      };
      if (name === 'video') {
        const width = normalizeBlockWidth(HTMLAttributes.width, '100%');
        attributes['data-width'] = width;
        attributes['data-align'] = normalizeMediaAlign(HTMLAttributes.align);
        if (width !== 'natural') attributes.width = width;
      } else {
        attributes['data-width'] = normalizeAudioWidth(HTMLAttributes.width);
        attributes['data-align'] = normalizeMediaAlign(HTMLAttributes.align);
      }
      return [name, mergeAttributes(attributes)];
    },

    addNodeView() {
      return VueNodeViewRenderer(MediaNodeView);
    },
  });

export const Video = createPlaybackNode('video');
export const Audio = createPlaybackNode('audio');
