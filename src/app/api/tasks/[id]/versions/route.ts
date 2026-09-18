import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';
import { ensureProductTables } from '@/lib/product-init';

// 同步任务-版本 N:N 关联
// 请求体：{ version_ids: number[] } —— 传入的数组即期望的最终关联集合
//   - 数组中存在的版本会被关联（已存在则跳过）
//   - 不在数组中的现有关联会被删除
//   - 传空数组 [] 等价于解绑全部版本
// 校验：所有版本必须归属任务所在项目
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin' && currentUser.role !== 'pm') {
      return NextResponse.json({ error: '仅PM或管理员可修改任务版本关联' }, { status: 403 });
    }

    await ensureProductTables();

    const { id } = await params;
    const client = getSupabaseClient();

    // 取任务所在项目
    const { data: task, error: tError } = await client
      .from('project_tasks')
      .select('id, project_id')
      .eq('id', id)
      .maybeSingle();
    if (tError) throw new Error(`查询任务失败: ${tError.message}`);
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

    const body = await request.json();
    const versionIdsRaw: unknown = body.version_ids;
    if (!Array.isArray(versionIdsRaw)) {
      return NextResponse.json({ error: 'version_ids 必须为数组' }, { status: 400 });
    }
    const versionIds = Array.from(
      new Set(
        versionIdsRaw
          .map((v) => Number(v))
          .filter((v) => Number.isInteger(v) && v > 0)
      )
    );

    // 校验所有版本归属当前任务所在项目
    if (versionIds.length > 0) {
      const { data: versions, error: vError } = await client
        .from('project_versions')
        .select('id, project_id')
        .in('id', versionIds);
      if (vError) throw new Error(`校验版本失败: ${vError.message}`);
      if (!versions || versions.length !== versionIds.length) {
        return NextResponse.json({ error: '部分版本不存在' }, { status: 400 });
      }
      const wrongProject = versions.find((v) => v.project_id !== task.project_id);
      if (wrongProject) {
        return NextResponse.json(
          { error: '版本必须归属任务所在项目' },
          { status: 400 }
        );
      }
    }

    // 删除现有全部关联
    const { error: delError } = await client
      .from('project_task_versions')
      .delete()
      .eq('task_id', id);
    if (delError) throw new Error(`清理旧关联失败: ${delError.message}`);

    // 批量插入新关联
    if (versionIds.length > 0) {
      const rows = versionIds.map((vid) => ({ task_id: Number(id), version_id: vid }));
      const { error: insError } = await client
        .from('project_task_versions')
        .insert(rows);
      if (insError) {
        if (insError.code === '23503') {
          return NextResponse.json(
            { error: '关联失败：版本或任务不存在' },
            { status: 400 }
          );
        }
        throw new Error(`建立关联失败: ${insError.message}`);
      }
    }

    // 返回任务 + 当前关联的版本
    const { data: updated, error: qError } = await client
      .from('project_tasks')
      .select(
        '*, projects(id, name, product_id, products!projects_product_id_fkey(id, name)), project_task_versions(version_id, project_versions(id, name))'
      )
      .eq('id', id)
      .maybeSingle();
    if (qError) throw new Error(`查询失败: ${qError.message}`);

    return NextResponse.json({ data: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
