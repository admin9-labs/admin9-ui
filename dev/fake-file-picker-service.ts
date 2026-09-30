import type {
  FileGroup,
  FileItem,
  FileListParams,
  FileListResult,
  FilePickerAdapter,
  FileType,
  FileUploadOptions,
  FileUploadRejection,
} from '../src';
import { type AcceptanceState, wait } from './fake-acceptance-utils';

const FILE_TYPES: FileType[] = ['image', 'video', 'audio', 'document', 'archive', 'other'];

const demoGroups: FileGroup[] = [
  { id: 'campaign', name: '国庆活动' },
  { id: 'campaign-event', name: '现场素材', parentId: 'campaign' },
  { id: 'campaign-empty', name: '待补充', parentId: 'campaign' },
  { id: 'brand', name: '品牌素材' },
  { id: 'product', name: '产品资料' },
  ...Array.from({ length: 18 }, (_, index) => ({ id: `archive-${index + 1}`, name: `历史素材 ${index + 1}` })),
];

const demoFiles: FileItem[] = [
  {
    id: 'file-event-image',
    name: 'event-poster.svg',
    type: 'image',
    groupId: 'campaign-event',
    url: '/media-board.svg',
    thumbnail: '/media-board.svg',
    extension: 'svg',
    size: 18432,
    status: 'ready',
  },
  {
    id: 'file-event-video',
    name: 'event-highlight.mp4',
    type: 'video',
    groupId: 'campaign-event',
    url: '/media-motion.mp4',
    thumbnail: '/media-layout.svg',
    extension: 'mp4',
    size: 7340032,
    duration: 2,
    status: 'ready',
  },
  {
    id: 'file-event-document',
    name: 'event-agenda.txt',
    type: 'document',
    groupId: 'campaign-event',
    url: '/event-agenda.txt',
    extension: 'txt',
    status: 'ready',
  },
  {
    id: 'file-image-1',
    name: 'dashboard-board.svg',
    type: 'image',
    groupId: 'campaign',
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
    groupId: 'brand',
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
    groupId: 'campaign',
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
    groupId: 'brand',
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
    groupId: 'campaign',
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
    groupId: 'campaign',
    url: '/documents/release-plan.docx',
    extension: 'docx',
    size: 842752,
    status: 'ready',
  },
  {
    id: 'file-document-3',
    name: 'quarterly-budget.xlsx',
    type: 'document',
    groupId: 'product',
    url: '/documents/quarterly-budget.xlsx',
    extension: 'xlsx',
    size: 126976,
    status: 'ready',
  },
  {
    id: 'file-document-4',
    name: 'processing-report.pdf',
    type: 'document',
    groupId: 'product',
    url: '/documents/processing-report.pdf',
    extension: 'pdf',
    size: 524288,
    status: 'pending',
  },
  {
    id: 'file-archive-1',
    name: 'release-v0.3.1.zip',
    type: 'archive',
    groupId: 'product',
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
    groupId: 'brand',
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
  ...Array.from({ length: 45 }, (_, index): FileItem => {
    const media = [
      { url: '/media-board.svg', label: '横图' },
      { url: '/media-tall.svg', label: '竖图' },
      { url: '/media-square.svg', label: '方图' },
    ][index % 3];
    let status: FileItem['status'] = 'ready';
    if (index === 43) status = 'pending';
    if (index === 44) status = 'failed';
    return {
      id: `file-pagination-image-${index + 1}`,
      name: `分页图片-${String(index + 1).padStart(2, '0')}-${media.label}${
        index % 9 === 0 ? '-长文件名验收'.repeat(8) : ''
      }.svg`,
      type: 'image',
      groupId: ['campaign', 'campaign-event', 'brand', 'product', null][index % 5],
      url: media.url,
      thumbnail: media.url,
      extension: 'svg',
      size: 18432 + index * 1024,
      status,
    };
  }),
];

interface FakeFilePickerOptions {
  pageSize?: number;
  onList?: (params: FileListParams, result: FileListResult) => void;
}

export default function createFakeFilePickerService(
  state: AcceptanceState,
  scenario: FakeFilePickerOptions = {}
): FilePickerAdapter {
  let files = demoFiles.map((item) => ({ ...item }));
  let uploadSequence = 0;
  const failedOnce = new Set<string>();
  const groups = demoGroups.map((group) => ({ ...group }));

  return {
    async list(params: FileListParams): Promise<FileListResult> {
      const pageSize = scenario.pageSize ?? params.pageSize;
      if (state === 'loading') await wait(5000);
      else await wait(260);
      if (state === 'error') throw new Error('Acceptance host: simulated file list failure');
      if (state === 'empty' || state === 'loading') {
        const result = {
          list: [],
          pagination: { page: params.page, pageSize, total: 0, hasMore: false },
        };
        scenario.onList?.(params, result);
        return result;
      }

      let requestedTypes: readonly FileType[] = FILE_TYPES;
      if (params.fileType) requestedTypes = [params.fileType];
      else if (params.fileTypes !== undefined) requestedTypes = params.fileTypes;
      const typeSet = new Set(requestedTypes);
      const keyword = params.keyword?.trim().toLowerCase();
      const filtered = files.filter(
        (item) =>
          typeSet.has(item.type) &&
          (params.groupId === undefined || item.groupId === params.groupId) &&
          (!keyword || item.name.toLowerCase().includes(keyword))
      );
      const offset = (params.page - 1) * pageSize;
      const result = {
        list: filtered.slice(offset, offset + pageSize).map((item) =>
          item.id === 'file-image-2'
            ? {
                ...item,
                name: `responsive-layout-${'very-long-file-name-'.repeat(8)}.svg`,
                extension: `svg-${'ext'.repeat(28)}`,
                mime: `image/svg+xml;profile=${'metadata'.repeat(24)}`,
              }
            : { ...item }
        ),
        pagination: {
          page: params.page,
          pageSize,
          total: filtered.length,
          hasMore: offset + pageSize < filtered.length,
        },
      };
      scenario.onList?.(params, result);
      return result;
    },

    async listGroups() {
      await wait(160);
      if (state === 'error') throw new Error('Acceptance host: simulated file group failure');
      return groups.map((group) => ({
        ...group,
        count: files.filter((item) => item.groupId === group.id).length,
      }));
    },

    async createGroup({ name, parentId }) {
      await wait(state === 'loading' ? 5000 : 260);
      if (state === 'error' || name === 'fail') throw new Error('Simulated group creation failure');
      if (groups.some((group) => group.name === name && (group.parentId ?? null) === (parentId ?? null))) {
        throw new Error('Duplicate group name');
      }
      const group = { id: `group-${groups.length + 1}`, name, parentId: parentId ?? null };
      groups.push(group);
      return { ...group };
    },

    async deleteFiles(ids) {
      await wait(260);
      const succeeded = ids.filter((id) => files.some((item) => item.id === id));
      files = files.filter((item) => !succeeded.includes(item.id));
      return succeeded;
    },

    async moveFiles({ ids, groupId }) {
      await wait(260);
      if (groupId !== null && !groups.some((group) => group.id === groupId)) throw new Error('Unknown group');
      const succeeded = ids.filter((id) => files.some((item) => item.id === id));
      files = files.map((item) => (succeeded.includes(item.id) ? { ...item, groupId } : item));
      return succeeded;
    },

    async upload(options: FileUploadOptions) {
      const extension = options.file.name.split('.').pop()?.toLowerCase() ?? '';
      const formats: Partial<Record<FileType, RegExp>> = {
        image: /^(png|jpe?g|gif|webp|svg)$/,
        video: /^(mp4|webm|mov)$/,
        audio: /^(mp3|wav|ogg)$/,
        document: /^(pdf|docx?|xlsx?|txt|csv)$/,
        archive: /^(zip|gz|tar)$/,
      };
      const type = FILE_TYPES.find((candidate) => formats[candidate]?.test(extension)) ?? 'other';
      if (!options.fileTypes.includes(type))
        throw Object.assign(new Error('Unsupported type'), { code: 'unsupported-file-type' } satisfies FileUploadRejection);
      if (options.file.name.startsWith('unsupported-format'))
        throw Object.assign(new Error('Unsupported format'), {
          code: 'unsupported-file-format',
          allowedFormats: ['PNG', 'JPG'],
        } satisfies FileUploadRejection);
      if (options.file.name.startsWith('temporary-failure') && !failedOnce.has(options.file.name)) {
        failedOnce.add(options.file.name);
        throw new Error('Simulated temporary upload failure.');
      }
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
      const response = await fetch('/__acceptance/uploads', {
        method: 'POST',
        body: options.file,
        signal: options.signal,
        headers: { 'Content-Type': options.file.type || 'application/octet-stream' },
      });
      if (!response.ok) throw new Error('Acceptance upload failed.');
      const uploaded: { url: string } = await response.json();
      uploadSequence += 1;
      const item: FileItem = {
        id: `file-upload-${Date.now()}-${uploadSequence}`,
        name: options.file.name,
        type,
        extension,
        groupId: options.groupId,
        url: uploaded.url,
        mime: options.file.type,
        size: options.file.size,
        status: 'ready',
      };
      files = [item, ...files];
      return item;
    },
  };
}
