import type {
  MediaGroup,
  MediaItem,
  MediaListParams,
  MediaListResult,
  MediaService,
  MediaType,
  MediaUploadOptions,
} from '../src';

export type AcceptanceState = 'normal' | 'loading' | 'empty' | 'error';

const demoGroups: Record<MediaType, MediaGroup[]> = {
  image: [
    { id: 'image-design', name: '设计稿' },
    { id: 'image-release', name: '发布素材' },
  ],
  video: [
    { id: 'video-clips', name: '视频片段' },
    { id: 'video-campaign', name: '活动视频' },
  ],
  audio: [
    { id: 'audio-music', name: '背景音乐' },
    { id: 'audio-voice', name: '语音素材' },
  ],
};

const demoMedia: MediaItem[] = [
  {
    id: 'image-1',
    name: 'dashboard-board.svg',
    type: 'image',
    groupId: 'image-design',
    url: '/media-board.svg',
    thumbnail: '/media-board.svg',
    extension: 'svg',
    status: 'ready',
  },
  {
    id: 'image-2',
    name: 'responsive-layout.svg',
    type: 'image',
    groupId: 'image-design',
    url: '/media-layout.svg',
    thumbnail: '/media-layout.svg',
    extension: 'svg',
    status: 'ready',
  },
  {
    id: 'image-3',
    name: 'processing-cover.svg',
    type: 'image',
    groupId: 'image-release',
    url: '/media-layout.svg',
    thumbnail: '/media-layout.svg',
    extension: 'svg',
    status: 'pending',
  },
  {
    id: 'image-4',
    name: 'failed-export.svg',
    type: 'image',
    groupId: 'image-release',
    url: null,
    thumbnail: '/media-board.svg',
    extension: 'svg',
    status: 'failed',
  },
  {
    id: 'image-5',
    name: 'missing-source.svg',
    type: 'image',
    groupId: null,
    url: null,
    extension: 'svg',
    status: 'ready',
  },
  {
    id: 'video-1',
    name: 'component-motion.mp4',
    type: 'video',
    groupId: 'video-clips',
    url: '/media-motion.mp4',
    thumbnail: '/media-layout.svg',
    extension: 'mp4',
    duration: 2,
    status: 'ready',
  },
  {
    id: 'video-2',
    name: 'release-preview.mp4',
    type: 'video',
    groupId: 'video-campaign',
    url: '/media-motion.mp4',
    thumbnail: '/media-board.svg',
    extension: 'mp4',
    duration: 2,
    status: 'ready',
  },
  {
    id: 'video-3',
    name: 'transcoding.mp4',
    type: 'video',
    groupId: 'video-clips',
    url: '/media-motion.mp4',
    thumbnail: '/media-layout.svg',
    extension: 'mp4',
    duration: 2,
    status: 'pending',
  },
  {
    id: 'video-4',
    name: 'failed-render.mp4',
    type: 'video',
    groupId: null,
    url: null,
    thumbnail: '/media-board.svg',
    extension: 'mp4',
    status: 'failed',
  },
  {
    id: 'audio-1',
    name: 'interface-tone.wav',
    type: 'audio',
    groupId: 'audio-music',
    url: '/media-tone.wav',
    extension: 'wav',
    duration: 2,
    status: 'ready',
  },
  {
    id: 'audio-2',
    name: 'notification-tone.wav',
    type: 'audio',
    groupId: 'audio-voice',
    url: '/media-tone.wav',
    extension: 'wav',
    duration: 2,
    status: 'ready',
  },
  {
    id: 'audio-3',
    name: 'normalizing.wav',
    type: 'audio',
    groupId: 'audio-music',
    url: '/media-tone.wav',
    extension: 'wav',
    duration: 2,
    status: 'pending',
  },
  {
    id: 'audio-4',
    name: 'failed-track.wav',
    type: 'audio',
    groupId: null,
    url: null,
    extension: 'wav',
    status: 'failed',
  },
];

export const createDemoMedia = () => demoMedia.map((item) => ({ ...item }));
export const createDemoGroups = () =>
  Object.fromEntries(
    Object.entries(demoGroups).map(([type, groups]) => [type, groups.map((group) => ({ ...group }))])
  ) as Record<MediaType, MediaGroup[]>;

export const wait = (duration: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });

export function createFakeMediaService(state: AcceptanceState): MediaService {
  let media = createDemoMedia();
  const groups = createDemoGroups();

  return {
    async list(params: MediaListParams): Promise<MediaListResult> {
      if (state === 'loading') await wait(5000);
      else await wait(320);

      if (state === 'error') throw new Error('Acceptance host: simulated media list failure');
      if (state === 'empty' || state === 'loading') {
        return {
          list: [],
          pagination: { page: params.page, pageSize: params.pageSize, total: 0, hasMore: false },
        };
      }

      const keyword = params.keyword?.toLowerCase();
      const filtered = media.filter((item) => {
        const matchesType = item.type === params.mediaType;
        const matchesGroup = params.groupId === undefined || item.groupId === params.groupId;
        const matchesKeyword = !keyword || item.name.toLowerCase().includes(keyword);
        return matchesType && matchesGroup && matchesKeyword;
      });
      const offset = (params.page - 1) * params.pageSize;
      return {
        list: filtered.slice(offset, offset + params.pageSize),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total: filtered.length,
          hasMore: offset + params.pageSize < filtered.length,
        },
      };
    },

    async listGroups(mediaType: MediaType) {
      await wait(180);
      return groups[mediaType].map((group) => ({
        ...group,
        count: media.filter((item) => item.type === mediaType && item.groupId === group.id).length,
      }));
    },

    async upload(options: MediaUploadOptions) {
      await wait(480);
      options.onProgress?.(100);
      const item: MediaItem = {
        id: `upload-${Date.now()}`,
        name: options.file.name,
        type: options.mediaType,
        groupId: options.groupId,
        url: URL.createObjectURL(options.file),
        mime: options.file.type,
        size: options.file.size,
        status: 'ready',
      };
      media = [item, ...media];
      return item;
    },

    async remove(ids: string[]) {
      await wait(260);
      const idSet = new Set(ids);
      media = media.filter((item) => !idSet.has(item.id));
      return ids;
    },
  };
}
