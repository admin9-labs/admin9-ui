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

/** AFilePicker only requires browsing; upload remains an optional capability. */
export type FilePickerAdapter = FileBrowseCapability & Partial<FileUploadCapability>;

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
  fileService?: FileManagerAdapter;
}

/** @deprecated Use Admin9UIPluginOptions. */
export type Admin9UIOptions = Admin9UIPluginOptions;
