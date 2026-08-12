/**
 * @admin9-labs/admin9-ui — 服务接口契约
 *
 * 设计原则（重要）：库只定义接口契约，不包含任何具体后端实现。
 * 把接口落到具体后端（调哪个 URL、字段叫什么、怎么解响应、怎么鉴权）
 * 是消费方 App 的职责，由 App 写 adapter 实现这些接口再注入给库。
 *
 * 这样库可被任意后端复用：换后端，App 只需重写 adapter，库代码不动。
 */

/* --------------------------- Media capabilities -------------------------- */

/** 素材类型；浏览与管理表面按单一类型查询。 */
export type MediaType = 'image' | 'video' | 'audio';

/** 后端真实分组；“全部”和“未分组”由组件内置，不属于此列表。 */
export interface MediaGroup {
  id: string;
  name: string;
  count?: number;
}

/** 后端无关的媒体素材项。 */
export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  /** null 表示未分组；素材只能属于一个同类型的单级分组。 */
  groupId: string | null;
  url: string | null;
  /** 后端相对路径（引用/删除用），可选 */
  path?: string;
  /** 字节数，可选 */
  size?: number;
  /** MIME 类型，如 image/jpeg，可选 */
  mime?: string;
  /** 文件扩展名，如 jpg 或 webp，可选 */
  extension?: string;
  /** 缩略图 URL，缺省时库回退用 url */
  thumbnail?: string;
  width?: number;
  height?: number;
  /** 音视频时长，单位为秒。 */
  duration?: number;
  /** ISO 时间，可选 */
  createdAt?: string;
  /** 服务端处理状态；未提供时按历史行为视为 ready */
  status?: 'pending' | 'ready' | 'failed';
}

export interface MediaListParams {
  /** 1-based 页码 */
  page: number;
  pageSize: number;
  /** 搜索关键词，由消费方 adapter 交给后端筛选。 */
  keyword?: string;
  mediaType: MediaType;
  /** undefined=全部，null=未分组，string=具体分组。 */
  groupId?: string | null;
}

export interface MediaPagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface MediaListResult {
  list: MediaItem[];
  pagination: MediaPagination;
}

export interface MediaUploadOptions {
  file: File;
  mediaType: MediaType;
  /** null 表示上传到未分组。 */
  groupId: string | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** 所有素材表面共享的最小只读浏览能力。 */
export interface MediaBrowseService {
  list(params: MediaListParams): Promise<MediaListResult>;
  /** 可选分组能力；不需要分组浏览的消费表面可不实现。 */
  listGroups?(mediaType: MediaType): Promise<MediaGroup[]>;
}

/** 上传能力；upload() 必须返回符合 MediaItem 契约且带稳定 id 的记录。 */
export interface MediaUploadCapability {
  upload(options: MediaUploadOptions): Promise<MediaItem>;
}

/** 删除能力；返回值只包含实际删除成功且属于本次请求的 id。 */
export interface MediaRemoveCapability {
  remove(ids: string[]): Promise<string[]>;
}

export interface CreateMediaGroupOptions {
  mediaType: MediaType;
  name: string;
}

export interface RenameMediaGroupOptions extends CreateMediaGroupOptions {
  groupId: string;
}

export interface RemoveMediaGroupOptions {
  mediaType: MediaType;
  groupId: string;
}

export interface MoveMediaOptions {
  mediaType: MediaType;
  ids: string[];
  /** null 表示移动到未分组。 */
  groupId: string | null;
}

/** 单级分组浏览与管理能力。 */
export interface MediaGroupCapability {
  listGroups(mediaType: MediaType): Promise<MediaGroup[]>;
  createGroup(options: CreateMediaGroupOptions): Promise<MediaGroup>;
  renameGroup(options: RenameMediaGroupOptions): Promise<MediaGroup>;
  /** 仅删除分组；不得隐式删除分组内素材，非空处理策略由 adapter 明确实现。 */
  removeGroup(options: RemoveMediaGroupOptions): Promise<void>;
}

/** 素材移动能力。 */
export interface MediaMoveCapability {
  /** 返回成功移动的素材 id；允许 adapter 表达部分成功。 */
  move(options: MoveMediaOptions): Promise<string[]>;
}

/** Picker 的能力组合；默认只要求浏览，启用上传时再要求上传能力。 */
export type MediaPickerService = MediaBrowseService & Partial<MediaUploadCapability>;

/** Library 的能力组合；具体开关决定运行时必需的方法。 */
export type MediaLibraryAdapter = MediaBrowseService &
  Partial<MediaUploadCapability> &
  Partial<MediaRemoveCapability> &
  Partial<MediaGroupCapability> &
  Partial<MediaMoveCapability>;

/**
 * 完整素材服务兼容接口。现有 adapter 可继续使用；新组件应按实际功能依赖能力接口。
 */
export interface MediaService extends MediaBrowseService, MediaUploadCapability, MediaRemoveCapability {}

/** 完整页面级素材管理兼容类型。 */
export type MediaLibraryService = MediaService & MediaGroupCapability & MediaMoveCapability;

/* ---------------------------- File capabilities --------------------------- */

/** 真实文件类型；“全部”仅由查询中的 undefined 表示，不属于 FileType。 */
export type FileType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

/** 当前真实文件类型下的单级分组。 */
export interface FileGroup {
  id: string;
  name: string;
  count?: number;
}

/** 后端无关的文件记录。 */
export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  /** null 表示未分组；分组始终隶属于同一真实文件类型。 */
  groupId: string | null;
  /** 可访问或下载的文件地址；处理中或失败记录可以为 null。 */
  url: string | null;
  path?: string;
  size?: number;
  mime?: string;
  extension?: string;
  thumbnail?: string;
  duration?: number;
  createdAt?: string;
  status?: 'pending' | 'ready' | 'failed';
}

interface FileListParamsBase {
  page: number;
  pageSize: number;
  keyword?: string;
}

/**
 * 文件查询是判别联合：聚合查询不能携带 groupId；具体类型查询必须显式携带 fileType。
 * 聚合查询省略 fileTypes 表示六类全部；提供 fileTypes 时由 adapter 对该集合执行服务端筛选和准确分页。
 * 空 fileTypes 表示无匹配结果，不能退化为六类全部。
 */
export type FileListParams = FileListParamsBase &
  (
    | { fileType?: undefined; fileTypes?: readonly FileType[]; groupId?: never }
    | { fileType: FileType; fileTypes?: never; groupId?: string | null }
  );

export interface FilePagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface FileListResult {
  list: FileItem[];
  pagination: FilePagination;
  /** 可选的各真实类型总数，用于文件类型导航反馈。 */
  typeCounts?: Partial<Record<FileType, number>>;
}

export interface FileUploadOptions {
  file: File;
  fileType: FileType;
  groupId: string | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface FileBrowseCapability {
  list(params: FileListParams): Promise<FileListResult>;
  /** 分组只能按一个真实文件类型查询。 */
  listGroups?(fileType: FileType): Promise<FileGroup[]>;
}

export interface FileUploadCapability {
  upload(options: FileUploadOptions): Promise<FileItem>;
}

export interface FileRemoveCapability {
  /** 返回实际删除成功且属于本次请求的 id，允许表达部分成功。 */
  remove(ids: string[]): Promise<string[]>;
}

export interface CreateFileGroupOptions {
  fileType: FileType;
  name: string;
}

export interface RenameFileGroupOptions extends CreateFileGroupOptions {
  groupId: string;
}

export interface RemoveFileGroupOptions {
  fileType: FileType;
  groupId: string;
}

export interface MoveFileOptions {
  fileType: FileType;
  ids: string[];
  groupId: string | null;
}

export interface FileGroupCapability {
  listGroups(fileType: FileType): Promise<FileGroup[]>;
  createGroup(options: CreateFileGroupOptions): Promise<FileGroup>;
  renameGroup(options: RenameFileGroupOptions): Promise<FileGroup>;
  /** 仅删除分组；不得隐式删除组内文件。 */
  removeGroup(options: RemoveFileGroupOptions): Promise<void>;
}

export interface FileMoveCapability {
  /** 返回成功移动的文件 id，允许表达部分成功。 */
  move(options: MoveFileOptions): Promise<string[]>;
}

/** AFileManager 的按能力组合 adapter；界面开关决定运行时必需方法。 */
export type FileManagerAdapter = FileBrowseCapability &
  Partial<FileUploadCapability> &
  Partial<FileRemoveCapability> &
  Partial<FileGroupCapability> &
  Partial<FileMoveCapability>;

/** 完整文件管理能力组合，供提供全部管理能力的 adapter 使用。 */
export type FileManagerService = FileBrowseCapability &
  FileUploadCapability &
  FileRemoveCapability &
  FileGroupCapability &
  FileMoveCapability;

/** Plugin installation options for app.use(Admin9UI, options). */
export interface Admin9UIPluginOptions {
  mediaService?: MediaLibraryAdapter;
  fileService?: FileManagerAdapter;
}

/** @deprecated Use Admin9UIPluginOptions. */
export type Admin9UIOptions = Admin9UIPluginOptions;
