import { promises as fs } from 'fs';
import path from 'path';
import { FileStorage, UploadResult, UPLOAD_DIR_WEEKLY } from './types';

const PUBLIC_ROOT = path.join(process.cwd(), 'public', 'uploads', UPLOAD_DIR_WEEKLY);
const URL_PREFIX = `/uploads/${UPLOAD_DIR_WEEKLY}/`;

/**
 * 本地文件存储：写入 public/uploads/<dir>/，Next.js 静态托管。
 * 零配置可用，适合开发与小规模部署。
 */
class LocalStorage implements FileStorage {
  async upload(buffer: Buffer, key: string, contentType: string, originalName?: string): Promise<UploadResult> {
    await fs.mkdir(PUBLIC_ROOT, { recursive: true });
    const filePath = path.join(PUBLIC_ROOT, key);
    await fs.writeFile(filePath, buffer);
    return {
      url: URL_PREFIX + encodeURIComponent(key),
      key,
      name: originalName || key,
      size: buffer.length,
      contentType,
    };
  }

  getPublicUrl(key: string): string {
    return URL_PREFIX + encodeURIComponent(key);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(PUBLIC_ROOT, key);
    try {
      await fs.unlink(filePath);
    } catch {
      // 文件不存在忽略
    }
  }
}

export const localStorageInstance = new LocalStorage();
