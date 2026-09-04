import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

/**
 * POST /api/report-templates/:id/default
 * 将指定模板设为当前用户的默认模板（清除本人其他默认；系统内置模板也可设为默认，
 * 但其本身 is_default 字段保持不变，仅作为用户偏好返回标记）。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id } = await params;
    const templateId = parseInt(id);
    if (Number.isNaN(templateId)) {
      return NextResponse.json({ error: '无效的模板ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // 校验模板存在且对当前用户可见
    const { data: tpl, error: findErr } = await client
      .from('report_templates')
      .select('id, user_id')
      .eq('id', templateId)
      .single();
    if (findErr) throw new Error(`查询失败: ${findErr.message}`);
    if (!tpl) return NextResponse.json({ error: '模板不存在' }, { status: 404 });
    if (tpl.user_id !== null && tpl.user_id !== currentUser.id) {
      return NextResponse.json({ error: '无权操作他人模板' }, { status: 403 });
    }

    // 清除本人其他默认
    await client
      .from('report_templates')
      .update({ is_default: false })
      .eq('user_id', currentUser.id)
      .eq('is_default', true);

    // 若是本人模板，置为默认；若是系统内置模板，通过 user_preferences 单独记录
    if (tpl.user_id === currentUser.id) {
      const { error } = await client
        .from('report_templates')
        .update({ is_default: true })
        .eq('id', templateId);
      if (error) throw new Error(`设置失败: ${error.message}`);
    } else {
      // 系统内置模板：在 system_configs 写一条用户偏好（key=template_default_user_<uid>）
      const prefKey = `template_default_user_${currentUser.id}`;
      const { error: prefErr } = await client
        .from('system_configs')
        .upsert(
          {
            config_key: prefKey,
            config_value: String(templateId),
            config_type: 'string',
            description: `用户 ${currentUser.id} 的默认模板偏好`,
          },
          { onConflict: 'config_key' }
        );
      if (prefErr) throw new Error(`保存偏好失败: ${prefErr.message}`);
    }

    return NextResponse.json({ success: true, templateId });
  } catch (err) {
    const message = err instanceof Error ? err.message : '设置失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
