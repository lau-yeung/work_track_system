/**
 * 文件存储抽象层
 * 支持 local / S3(含 R2 / MinIO) 后端，由 STORAGE_DRIVER 环境变量切换。
 */

export interface UploadResult {
  url: string; // 可访问的公开 URL
  key: string; // 存储后端内部 key（用于删除）
  name: string; // 原始文件名
  size: number; // 字节
  contentType: string;
}

export interface FileStorage {
  upload(buffer: Buffer, key: string, contentType: string, originalName?: string): Promise<UploadResult>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}

export const UPLOAD_DIR_WEEKLY = 'weekly-reports';
