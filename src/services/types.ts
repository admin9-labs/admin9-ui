/**
 * @admin9-labs/admin9-ui — 服务接口契约
 *
 * 设计原则（重要）：库只定义接口契约，不包含任何具体后端实现。
 * 把接口落到具体后端（调哪个 URL、字段叫什么、怎么解响应、怎么鉴权）
 * 是消费方 App 的职责，由 App 写 adapter 实现这些接口再注入给库。
 *
 * 这样库可被任意后端复用：换后端，App 只需重写 adapter，库代码不动。
 */

/* ---------------------------- File capabilities --------------------------- */

/** 真实文件类型；“全部”仅由查询中的 undefined 表示，不属于 FileType。 */
export type FileType = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

/** 跨文件类型的分组，支持一级分组及其二级子分组。 */
export interface FileGroup {
  id: string;
  name: string;
  /** 一级分组省略或为 null；二级分组指向同一列表中的一级分组。 */
  parentId?: string | null;
  /** 分组内所有类型的文件总数，不随类型筛选改变。 */
  count?: number;
}

/** 后端无关的文件记录。 */
export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  /** null 表示未分组；同一分组可以包含不同文件类型。 */
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
  /** undefined 表示全部分组，null 表示未分组，字符串表示指定分组。 */
  groupId?: string | null;
}

/**
 * 分组与类型独立；fileType 与 fileTypes 互斥。
 * 聚合查询省略 fileTypes 表示六类全部；提供 fileTypes 时由 adapter 对该集合执行服务端筛选和准确分页。
 * 空 fileTypes 表示无匹配结果，不能退化为六类全部。
 */
export type FileListParams = FileListParamsBase &
  ({ fileType?: undefined; fileTypes?: readonly FileType[] } | { fileType: FileType; fileTypes?: never });

export interface FilePagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface FileListResult {
  list: FileItem[];
  pagination: FilePagination;
}

export interface FileUploadOptions {
  file: File;
  /** adapter/后端识别真实类型并在持久化前校验允许集合。 */
  fileTypes: readonly FileType[];
  groupId: string | null;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface FileBrowseCapability {
  list(params: FileListParams): Promise<FileListResult>;
  /** 返回跨类型的真实分组，不包含“我的上传”等业务虚拟筛选。 */
  listGroups?(): Promise<FileGroup[]>;
}

export interface FileUploadCapability {
  upload(options: FileUploadOptions): Promise<FileItem>;
}

/** Adapter 提供的受控上传拒绝信息；不直接向用户展示任意异常 message。 */
export type FileUploadRejection =
  | { code: 'unsupported-file-type' }
  | { code: 'unsupported-file-format'; allowedFormats?: readonly string[] };

/** AFilePicker only requires browsing; upload remains an optional capability. */
export type FilePickerAdapter = FileBrowseCapability & Partial<FileUploadCapability>;

/** Plugin installation options for app.use(Admin9UI, options). */
export interface Admin9UIPluginOptions {
  fileService?: FilePickerAdapter;
}
