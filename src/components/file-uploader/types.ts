import type { FileItem, FileType, FileUploadCapability } from '../../services/types';

export type FileUploadTaskStatus = 'pending' | 'uploading' | 'succeeded' | 'failed' | 'cancelled';

export type FileUploadFailureReason = 'upload-failed' | 'invalid-result' | 'file-count' | 'file-size';

export interface FileUploadTask {
  id: string;
  file: File;
  fileType: FileType;
  groupId: string | null;
  status: FileUploadTaskStatus;
  progress?: number;
  item?: FileItem;
  error?: unknown;
  failureReason?: FileUploadFailureReason;
}

export interface FileUploadFailure {
  task: FileUploadTask;
  reason: FileUploadFailureReason;
  error: unknown;
}

export interface FileUploadBatchResult {
  succeeded: FileItem[];
  failed: FileUploadFailure[];
  cancelled: FileUploadTask[];
}

export interface AFileUploaderProps {
  service?: Partial<FileUploadCapability>;
  fileType?: FileType;
  groupId?: string | null;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
  buttonText?: string;
  disabled?: boolean;
}

export interface AFileUploaderExposed {
  upload(files: readonly File[]): Promise<FileUploadBatchResult>;
  cancel(taskId?: string): void;
  retry(taskId: string): void;
  remove(taskId: string): void;
  clear(): void;
  tasks: readonly FileUploadTask[];
}
