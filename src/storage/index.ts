import { FileStorage } from './types';
import { localStorageInstance } from './local-storage';
import { getS3Storage, isS3Configured } from './s3-storage';

/**
 * 存储工厂：按 STORAGE_DRIVER 选择后端。
 * - local（默认）：写 public/uploads/，零配置
 * - s3 / r2 / minio：S3 兼容，需配置 S3_* 环境变量；凭证缺失时自动回退 local
 */
export function getStorage(): FileStorage {
  const driver = (process.env.STORAGE_DRIVER || 'local').toLowerCase();
  if ((driver === 's3' || driver === 'r2' || driver === 'minio') && isS3Configured()) {
    return getS3Storage();
  }
  return localStorageInstance;
}

export type { UploadResult } from './types';
export { UPLOAD_DIR_WEEKLY } from './types';
