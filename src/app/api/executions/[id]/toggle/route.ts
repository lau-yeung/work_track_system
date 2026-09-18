import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables, recalcTaskProgress } from '@/lib/product-init';

// 切换执行完成状态（active↔done）
// 可逆勾选：done → active 清空 completed_at/completed_by；active → done 写入当前用户与今日日期
// 请求体可选：{ work_date?: string } —— 日报提交时传入填报日期作为 completed_at（否则取今日）
// 请求体可选：{ unmark?: boolean } —— 显式指定 true=取消完成，false=标记完成
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    const { data: execution, error: eError } = await client
      .from('task_executions')
      .select(
        'id, task_id, status, project_tasks!task_executions_task_id_fkey(project_id)'
      )
      .eq('id', id)
      .maybeSingle();
    if (eError) throw new Error(`查询执行失败: ${eError.message}`);
    if (!execution) return NextResponse.json({ error: '执行不存在' }, { status: 404 });

    const projectId = (
      execution.project_tasks as unknown as { project_id: number } | null
    )?.project_id;
    if (projectId == null) {
      return NextResponse.json({ error: '执行所属任务不存在' }, { status: 400 });
    }

    // 权限：admin/pm 或项目成员（日报勾选场景下用户通常已是项目成员）
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      const { data: membership } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: '无权切换该执行状态' }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => ({})) as {
      work_date?: string;
      unmark?: boolean;
    };

    const currentStatus = (execution as { status: string }).status;
    // unmark 显式指定优先，否则按当前状态翻转
    const willDone =
      typeof body.unmark === 'boolean' ? !body.unmark : currentStatus !== 'done';

    const completedAt = willDone
      ? (body.work_date && /^\d{4}-\d{2}-\d{2}$/.test(body.work_date)
          ? body.work_date
          : new Date().toISOString().slice(0, 10))
      : null;

    const { data, error } = await client
      .from('task_executions')
      .update({
        status: willDone ? 'done' : 'active',
        completed_at: completedAt,
        completed_by: willDone ? currentUser.id : null,
      })
      .eq('id', id)
      .select('*, users:created_by(id, real_name), completer:completed_by(id, real_name)')
      .maybeSingle();

    if (error) throw new Error(`切换状态失败: ${error.message}`);

    // 状态变化触发任务进度重算
    const taskId = (execution as { task_id: number }).task_id;
    const progress = await recalcTaskProgress(taskId);

    return NextResponse.json({ data, progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : '切换失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
