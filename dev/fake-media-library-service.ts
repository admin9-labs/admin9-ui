import type {
  CreateMediaGroupOptions,
  MediaGroup,
  MediaItem,
  MediaLibraryService,
  MediaListParams,
  MediaListResult,
  MediaType,
  MediaUploadOptions,
  MoveMediaOptions,
  RemoveMediaGroupOptions,
  RenameMediaGroupOptions,
} from '../src';
import { createDemoGroups, createDemoMedia, type AcceptanceState, wait } from './fake-media-service';

export default function createFakeMediaLibraryService(state: AcceptanceState): MediaLibraryService {
  let media = createDemoMedia();
  const groups = createDemoGroups();

  const listGroups = async (mediaType: MediaType) => {
    await wait(180);
    return groups[mediaType].map((group) => ({
      ...group,
      count: media.filter((item) => item.type === mediaType && item.groupId === group.id).length,
    }));
  };

  return {
    async list(params: MediaListParams): Promise<MediaListResult> {
      if (state === 'loading') await wait(5000);
      else await wait(280);
      if (state === 'error') throw new Error('Acceptance host: simulated media library failure');
      if (state === 'empty' || state === 'loading') {
        return {
          list: [],
          pagination: { page: params.page, pageSize: params.pageSize, total: 0, hasMore: false },
        };
      }

      const keyword = params.keyword?.trim().toLowerCase();
      const filtered = media.filter(
        (item) =>
          item.type === params.mediaType &&
          (params.groupId === undefined || item.groupId === params.groupId) &&
          (!keyword || item.name.toLowerCase().includes(keyword))
      );
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

    listGroups,

    async upload(options: MediaUploadOptions) {
      await wait(420);
      options.onProgress?.(100);
      const item: MediaItem = {
        id: `library-upload-${Date.now()}`,
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
      await wait(240);
      const existingIds = ids.filter((id) => media.some((item) => item.id === id));
      const idSet = new Set(existingIds);
      media = media.filter((item) => !idSet.has(item.id));
      return existingIds;
    },

    async createGroup({ mediaType, name }: CreateMediaGroupOptions) {
      await wait(220);
      const group: MediaGroup = { id: `${mediaType}-group-${Date.now()}`, name };
      groups[mediaType] = [...groups[mediaType], group];
      return { ...group, count: 0 };
    },

    async renameGroup({ mediaType, groupId, name }: RenameMediaGroupOptions) {
      await wait(220);
      const group = groups[mediaType].find((entry) => entry.id === groupId);
      if (!group) throw new Error('Acceptance host: group not found');
      group.name = name;
      return {
        ...group,
        count: media.filter((item) => item.type === mediaType && item.groupId === groupId).length,
      };
    },

    async removeGroup({ mediaType, groupId }: RemoveMediaGroupOptions) {
      await wait(220);
      groups[mediaType] = groups[mediaType].filter((group) => group.id !== groupId);
      media = media.map((item) => (item.type === mediaType && item.groupId === groupId ? { ...item, groupId: null } : item));
    },

    async move({ mediaType, ids, groupId }: MoveMediaOptions) {
      await wait(240);
      const idSet = new Set(ids);
      const movedIds: string[] = [];
      media = media.map((item) => {
        if (item.type !== mediaType || !idSet.has(item.id)) return item;
        movedIds.push(item.id);
        return { ...item, groupId };
      });
      return movedIds;
    },
  };
}
