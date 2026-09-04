import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { FileStorage, UploadResult } from './types';

/**
 * S3 兼容存储：AWS S3 / Cloudflare R2 / MinIO 均走同一 SDK。
 * 所需环境变量：
 *   S3_ENDPOINT       例如 https://<account>.r2.cloudflarestorage.com 或 http://localhost:9000
 *   S3_REGION         R2 用 auto，MinIO 用 us-east-1，AWS 用对应 region
 *   S3_BUCKET         bucket 名称
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_PUBLIC_URL     公开访问前缀（如 https://cdn.example.com 或 bucket 公开域名）
 */
class S3Storage implements FileStorage {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET || '';
    this.publicUrl = (process.env.S3_PUBLIC_URL || '').replace(/\/$/, '');
    const forcePathStyle = process.env.STORAGE_DRIVER === 'minio';
    this.client = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle,
    });
  }

  async upload(buffer: Buffer, key: string, contentType: string, originalName?: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return {
      url: `${this.publicUrl}/${key}`,
      key,
      name: originalName || key,
      size: buffer.length,
      contentType,
    };
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      // 删除失败忽略
    }
  }
}

let instance: S3Storage | null = null;

export function getS3Storage(): S3Storage {
  if (!instance) instance = new S3Storage();
  return instance;
}

/** 是否已配置 S3 兼容后端凭证 */
export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}
