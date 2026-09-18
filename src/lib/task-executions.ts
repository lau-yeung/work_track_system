/**
 * 任务执行相关业务工具：日报勾选执行的同步处理。
 * 日报 POST/PUT 接收 execution_ids 后，调用本模块把对应执行标记为 done/active，
 * 然后调用 recalcTaskProgress 重算任务进度，并把最新进度作为快照写入 time_entries.progress。
 */
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { recalcTaskProgress } from '@/lib/product-init';

interface ExecutionLite {
  id: number;
  task_id: number;
  status: string;
}

interface MarkOptions {
  /** 日报工时记录 id（用于把进度快照写回 time_entries.progress） */
  timeEntryId?: number;
  /** 填报日期，作为执行 completed_at；默认今日 */
  workDate?: string;
  /** 当前用户 id，作为 completed_by */
  userId: number;
}

/**
 * 把传入的执行 ids 标记为 done（completed_at=workDate/completed_by=userId）。
 * 同任务下"原本是 done 但本次未传入"的执行保持原状（不会反向取消），
 * 如需取消请用 unmarkIds 显式传入。
 * @param taskId 任务 id
 * @param markDoneIds 要标记完成的执行 id 列表
 * @param unmarkIds 要取消完成的执行 id 列表
 * @param options 进度回写相关参数
 * @returns 重算后的任务进度（0-100）
 */
export async function syncExecutionsAndProgress(
  taskId: number,
  markDoneIds: number[],
  unmarkIds: number[] = [],
  options: MarkOptions
): Promise<number> {
  const client = getSupabaseClient();
  const workDate =
    options.workDate && /^\d{4}-\d{2}-\d{2}$/.test(options.workDate)
      ? options.workDate
      : new Date().toISOString().slice(0, 10);

  // 标记 done
  if (markDoneIds.length > 0) {
    const { error: e1 } = await client
      .from('task_executions')
      .update({
        status: 'done',
        completed_at: workDate,
        completed_by: options.userId,
      })
      .in('id', markDoneIds)
      .eq('task_id', taskId);
    if (e1) throw new Error(`标记执行完成失败: ${e1.message}`);
  }

  // 取消 done
  if (unmarkIds.length > 0) {
    const { error: e2 } = await client
      .from('task_executions')
      .update({
        status: 'active',
        completed_at: null,
        completed_by: null,
      })
      .in('id', unmarkIds)
      .eq('task_id', taskId);
    if (e2) throw new Error(`取消执行完成失败: ${e2.message}`);
  }

  // 重算任务进度
  const progress = await recalcTaskProgress(taskId);

  // 进度快照回写 time_entries.progress
  if (options.timeEntryId) {
    const { error: e3 } = await client
      .from('time_entries')
      .update({ progress })
      .eq('id', options.timeEntryId)
      .eq('task_id', taskId);
    if (e3) throw new Error(`进度回写工时记录失败: ${e3.message}`);
  }

  return progress;
}

/**
 * 校验 execution_ids 都归属指定 task_id，并返回去重后的 id 数组。
 */
export async function validateExecutionIdsBelongToTask(
  taskId: number,
  executionIds: unknown
): Promise<number[]> {
  if (!Array.isArray(executionIds) || executionIds.length === 0) return [];
  const ids = Array.from(
    new Set(
      executionIds
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0)
    )
  );
  if (ids.length === 0) return [];

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('task_executions')
    .select('id, task_id')
    .in('id', ids)
    .eq('task_id', taskId);
  if (error) throw new Error(`校验执行失败: ${error.message}`);
  if (!data || data.length !== ids.length) {
    throw new Error('部分执行不属于所选任务，请刷新后重试');
  }
  return (data as ExecutionLite[]).map((r) => r.id);
}

/**
 * 查询某任务下所有执行，并按当前状态分组返回 { doneIds, activeIds }。
 * 用于编辑日报时计算 unmarkIds（当前 done 但本次未勾选）。
 */
export async function fetchExecutionsByTask(
  taskId: number
): Promise<{ doneIds: number[]; activeIds: number[] }> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('task_executions')
    .select('id, status')
    .eq('task_id', taskId);
  if (error) throw new Error(`查询执行失败: ${error.message}`);
  const rows = (data || []) as ExecutionLite[];
  return {
    doneIds: rows.filter((r) => r.status === 'done').map((r) => r.id),
    activeIds: rows.filter((r) => r.status !== 'done').map((r) => r.id),
  };
}
