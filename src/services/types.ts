/**
 * @admin9-labs/admin9-ui — 服务接口契约
 *
 * 设计原则（重要）：库只定义接口契约，不包含任何具体后端实现。
 * 把接口落到具体后端（调哪个 URL、字段叫什么、怎么解响应、怎么鉴权）
 * 是消费方 App 的职责，由 App 写 adapter 实现这些接口再注入给库。
 *
 * 这样库可被任意后端复用：换后端，App 只需重写 adapter，库代码不动。
 */

/* ----------------------------- MediaService ----------------------------- */

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

/**
 * 媒体服务契约。由 App 注入实现（adapter），库不直接调任何后端。
 *
 * upload() 必须返回符合 MediaItem 契约且带稳定 id 的记录。
 */
export interface MediaService {
  list(params: MediaListParams): Promise<MediaListResult>;
  /** 可选分组能力；不需要分组浏览的消费表面可不实现。 */
  listGroups?(mediaType: MediaType): Promise<MediaGroup[]>;
  upload(options: MediaUploadOptions): Promise<MediaItem>;
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

/** 页面级素材管理所需的窄扩展；Picker 只依赖基础 MediaService。 */
export interface MediaLibraryService extends MediaService {
  listGroups(mediaType: MediaType): Promise<MediaGroup[]>;
  createGroup(options: CreateMediaGroupOptions): Promise<MediaGroup>;
  renameGroup(options: RenameMediaGroupOptions): Promise<MediaGroup>;
  /** 仅删除分组；不得隐式删除分组内素材，非空处理策略由 adapter 明确实现。 */
  removeGroup(options: RemoveMediaGroupOptions): Promise<void>;
  /** 返回成功移动的素材 id；允许 adapter 表达部分成功。 */
  move(options: MoveMediaOptions): Promise<string[]>;
}

/** Plugin installation options for app.use(Admin9UI, options). */
export interface Admin9UIPluginOptions {
  mediaService?: MediaService;
}

/** @deprecated Use Admin9UIPluginOptions. */
export type Admin9UIOptions = Admin9UIPluginOptions;
