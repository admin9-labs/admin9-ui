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

/** 媒体素材项（类型无关：图片/视频/附件都套这个结构） */
export interface MediaItem {
  id: string;
  name: string;
  url: string;
  /** 后端相对路径（引用/删除用），可选 */
  path?: string;
  /** 字节数，可选 */
  size?: number;
  /** MIME 类型，如 image/jpeg，可选 */
  mime?: string;
  /** 缩略图 URL，缺省时库回退用 url */
  thumbnail?: string;
  width?: number;
  height?: number;
  /** ISO 时间，可选 */
  createdAt?: string;
}

export interface MediaListParams {
  /** 1-based 页码 */
  page: number;
  pageSize: number;
  /** 搜索关键词，后端不支持则 App adapter 可忽略 */
  keyword?: string;
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
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * 媒体服务契约。由 App 注入实现（adapter），库不直接调任何后端。
 *
 * 注意：upload() 返回的 MediaItem.id 可能缺失（取决于后端是否返回），
 * 调用方（库组件）应在 id 缺失时回退为"上传后刷新列表"策略。
 */
export interface MediaService {
  list(params: MediaListParams): Promise<MediaListResult>;
  upload(options: MediaUploadOptions): Promise<MediaItem>;
  remove(ids: string[]): Promise<string[]>;
}

/* ----------------------------- UserService ------------------------------ */

/** 用户/实体选择项（AUserPicker 通用化，不绑定具体业务字段） */
export interface UserItem {
  id: string;
  name: string;
  /** 副标题/描述（如邮箱、部门），可选 */
  description?: string;
  /** 头像 URL，可选 */
  avatar?: string;
  [k: string]: unknown;
}

export interface UserListParams {
  page: number;
  pageSize: number;
  keyword?: string;
}

export interface UserListResult {
  list: UserItem[];
  pagination: MediaPagination;
}

/** 用户服务契约。由 App 注入实现，库不关心具体后端。 */
export interface UserService {
  list(params: UserListParams): Promise<UserListResult>;
}
