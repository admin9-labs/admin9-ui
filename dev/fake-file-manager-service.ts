import type {
  CreateFileGroupOptions,
  FileGroup,
  FileItem,
  FileListParams,
  FileListResult,
  FileManagerService,
  FileType,
  FileUploadOptions,
  MoveFileOptions,
  RemoveFileGroupOptions,
  RenameFileGroupOptions,
} from '../src';
import { type AcceptanceState, wait } from './fake-acceptance-utils';

const FILE_TYPES: FileType[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];

const demoGroups: Record<FileType, FileGroup[]> = {
  image: [
    { id: 'image-design', name: '设计稿' },
    { id: 'image-release', name: '发布图片' },
  ],
  video: [{ id: 'video-campaign', name: '活动视频' }],
  audio: [{ id: 'audio-brand', name: '品牌音频' }],
  document: [
    { id: 'document-product', name: '产品文档' },
    { id: 'document-finance', name: '财务文档' },
  ],
  archive: [{ id: 'archive-release', name: '发布归档' }],
  other: [{ id: 'other-assets', name: '其他附件' }],
};

const demoFiles: FileItem[] = [
  {
    id: 'file-image-1',
    name: 'dashboard-board.svg',
    type: 'image',
    groupId: 'image-design',
    url: '/media-board.svg',
    thumbnail: '/media-board.svg',
    extension: 'svg',
    size: 18432,
    status: 'ready',
  },
  {
    id: 'file-image-2',
    name: 'responsive-layout.svg',
    type: 'image',
    groupId: 'image-release',
    url: '/media-layout.svg',
    thumbnail: '/media-layout.svg',
    extension: 'svg',
    size: 22184,
    status: 'ready',
  },
  {
    id: 'file-video-1',
    name: 'component-motion.mp4',
    type: 'video',
    groupId: 'video-campaign',
    url: '/media-motion.mp4',
    thumbnail: '/media-layout.svg',
    extension: 'mp4',
    size: 7340032,
    duration: 2,
    status: 'ready',
  },
  {
    id: 'file-audio-1',
    name: 'interface-tone.wav',
    type: 'audio',
    groupId: 'audio-brand',
    url: '/media-tone.wav',
    extension: 'wav',
    size: 184320,
    duration: 2,
    status: 'ready',
  },
  {
    id: 'file-document-1',
    name: 'product-specification.pdf',
    type: 'document',
    groupId: 'document-product',
    url: '/documents/product-specification.pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    size: 2489344,
    status: 'ready',
  },
  {
    id: 'file-document-2',
    name: 'release-plan.docx',
    type: 'document',
    groupId: 'document-product',
    url: '/documents/release-plan.docx',
    extension: 'docx',
    size: 842752,
    status: 'ready',
  },
  {
    id: 'file-document-3',
    name: 'quarterly-budget.xlsx',
    type: 'document',
    groupId: 'document-finance',
    url: '/documents/quarterly-budget.xlsx',
    extension: 'xlsx',
    size: 126976,
    status: 'ready',
  },
  {
    id: 'file-document-4',
    name: 'processing-report.pdf',
    type: 'document',
    groupId: 'document-finance',
    url: '/documents/processing-report.pdf',
    extension: 'pdf',
    size: 524288,
    status: 'pending',
  },
  {
    id: 'file-archive-1',
    name: 'release-v0.3.1.zip',
    type: 'archive',
    groupId: 'archive-release',
    url: '/archives/release-v0.3.1.zip',
    extension: 'zip',
    size: 12582912,
    status: 'ready',
  },
  {
    id: 'file-archive-2',
    name: 'failed-backup.tar.gz',
    type: 'archive',
    groupId: null,
    url: null,
    extension: 'gz',
    size: 7340032,
    status: 'failed',
  },
  {
    id: 'file-other-1',
    name: 'font-license.bin',
    type: 'other',
    groupId: 'other-assets',
    url: '/files/font-license.bin',
    extension: 'bin',
    size: 4096,
    status: 'ready',
  },
  {
    id: 'file-other-2',
    name: 'unavailable-source.dat',
    type: 'other',
    groupId: null,
    url: null,
    extension: 'dat',
    status: 'ready',
  },
];

export default function createFakeFileManagerService(state: AcceptanceState): FileManagerService {
  let files = demoFiles.map((item) => ({ ...item }));
  let uploadSequence = 0;
  const groups = Object.fromEntries(
    Object.entries(demoGroups).map(([type, entries]) => [type, entries.map((group) => ({ ...group }))])
  ) as Record<FileType, FileGroup[]>;

  const listGroups = async (fileType: FileType) => {
    await wait(160);
    if (state === 'error') throw new Error('Acceptance host: simulated file group failure');
    return groups[fileType].map((group) => ({
      ...group,
      count: files.filter((item) => item.type === fileType && item.groupId === group.id).length,
    }));
  };

  return {
    async list(params: FileListParams): Promise<FileListResult> {
      if (state === 'loading') await wait(5000);
      else await wait(260);
      if (state === 'error') throw new Error('Acceptance host: simulated file list failure');
      if (state === 'empty' || state === 'loading') {
        return {
          list: [],
          pagination: { page: params.page, pageSize: params.pageSize, total: 0, hasMore: false },
          typeCounts: {},
        };
      }

      let requestedTypes: readonly FileType[] = FILE_TYPES;
      if (params.fileType) requestedTypes = [params.fileType];
      else if (params.fileTypes !== undefined) requestedTypes = params.fileTypes;
      const typeSet = new Set(requestedTypes);
      const keyword = params.keyword?.trim().toLowerCase();
      const keywordFiltered = files.filter((item) => !keyword || item.name.toLowerCase().includes(keyword));
      const filtered = files.filter(
        (item) =>
          typeSet.has(item.type) &&
          (!params.fileType || params.groupId === undefined || item.groupId === params.groupId) &&
          (!keyword || item.name.toLowerCase().includes(keyword))
      );
      const offset = (params.page - 1) * params.pageSize;
      const typeCounts = Object.fromEntries(
        FILE_TYPES.map((fileType) => [fileType, keywordFiltered.filter((item) => item.type === fileType).length])
      ) as Record<FileType, number>;
      return {
        list: filtered.slice(offset, offset + params.pageSize),
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total: filtered.length,
          hasMore: offset + params.pageSize < filtered.length,
        },
        typeCounts,
      };
    },

    listGroups,

    async upload(options: FileUploadOptions) {
      const ensureActive = () => {
        if (options.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
      };
      ensureActive();
      await wait(120);
      ensureActive();
      options.onProgress?.(35);
      await wait(120);
      ensureActive();
      options.onProgress?.(72);
      await wait(120);
      ensureActive();
      options.onProgress?.(100);
      uploadSequence += 1;
      const item: FileItem = {
        id: `file-upload-${Date.now()}-${uploadSequence}`,
        name: options.file.name,
        type: options.fileType,
        groupId: options.groupId,
        url: URL.createObjectURL(options.file),
        mime: options.file.type,
        size: options.file.size,
        status: 'ready',
      };
      files = [item, ...files];
      return item;
    },

    async remove(ids: string[]) {
      await wait(220);
      const existingIds = ids.filter((id) => files.some((item) => item.id === id));
      const successfulIds = existingIds.length > 1 ? existingIds.slice(0, -1) : existingIds;
      const idSet = new Set(successfulIds);
      files = files.filter((item) => !idSet.has(item.id));
      return successfulIds;
    },

    async createGroup({ fileType, name }: CreateFileGroupOptions) {
      await wait(180);
      const group: FileGroup = { id: `${fileType}-group-${Date.now()}`, name };
      groups[fileType] = [...groups[fileType], group];
      return { ...group, count: 0 };
    },

    async renameGroup({ fileType, groupId, name }: RenameFileGroupOptions) {
      await wait(180);
      const group = groups[fileType].find((entry) => entry.id === groupId);
      if (!group) throw new Error('Acceptance host: file group not found');
      group.name = name;
      return { ...group };
    },

    async removeGroup({ fileType, groupId }: RemoveFileGroupOptions) {
      await wait(180);
      groups[fileType] = groups[fileType].filter((group) => group.id !== groupId);
      files = files.map((item) => (item.type === fileType && item.groupId === groupId ? { ...item, groupId: null } : item));
    },

    async move({ fileType, ids, groupId }: MoveFileOptions) {
      await wait(220);
      const existingIds = ids.filter((id) => files.some((item) => item.id === id && item.type === fileType));
      const successfulIds = existingIds.length > 1 ? existingIds.slice(0, -1) : existingIds;
      const idSet = new Set(successfulIds);
      files = files.map((item) => {
        if (item.type !== fileType || !idSet.has(item.id)) return item;
        return { ...item, groupId };
      });
      return successfulIds;
    },
  };
}
