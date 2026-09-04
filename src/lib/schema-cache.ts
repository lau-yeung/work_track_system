import { ensureAITables } from './ai-init';

/**
 * 判定是否为 PostgREST schema cache 未命中 / 表不存在的错误。
 * - PGRST205: "Could not find the table ... in the schema cache"
 * - 42P01: relation does not exist（部分驱动返回）
 */
export function isSchemaCacheMissError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === 'PGRST205') return true;
  if (e.code === '42P01') return true;
  if (e.message && /schema cache/i.test(e.message)) return true;
  if (e.message && /relation .* does not exist/i.test(e.message)) return true;
  return false;
}

/**
 * 执行一次查询；若遇到 schema cache miss / 表不存在，
 * 强制重建表 + 刷新 PostgREST schema cache 后重试一次。
 * 若自动建表失败（如无法直连数据库），把原因附加到错误信息中，便于引导用户手动执行 SQL。
 * 统一把最终错误包装成 Error，保留原始 message。
 */
export async function withSchemaCacheRetry<T>(fn: () => Promise<T>): Promise<T> {
  const toError = (e: unknown): Error => {
    const msg = (e as { message?: string })?.message || String(e);
    return new Error(msg);
  };
  try {
    return await fn();
  } catch (err) {
    if (isSchemaCacheMissError(err)) {
      const ensure = await ensureAITables(true);
      try {
        return await fn();
      } catch (retryErr) {
        // 重试仍失败：若自动建表未成功，附加可操作指引
        if (!ensure.ok) {
          throw new Error(
            `${toError(retryErr).message}｜自动建表未成功：${ensure.message}｜可在 Supabase SQL Editor 执行 /api/init-ai-tables 返回的 newFeaturesDdl。`
          );
        }
        throw new Error(
          `${toError(retryErr).message}｜表已创建但 PostgREST schema cache 尚未刷新，请稍后重试或在 Supabase SQL Editor 执行：NOTIFY pgrst, 'reload schema';`
        );
      }
    }
    throw toError(err);
  }
}
