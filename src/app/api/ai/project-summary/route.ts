import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { project_id } = await request.json();
    if (!project_id) {
      return NextResponse.json({ error: '请提供项目ID' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Check if AI is enabled
    const { data: aiConfig } = await client
      .from('system_configs')
      .select('config_value')
      .eq('config_key', 'enable_ai_features')
      .maybeSingle();

    if (!aiConfig || aiConfig.config_value !== 'true') {
      return NextResponse.json({ error: 'AI功能未启用' }, { status: 400 });
    }

    // Get project info
    const { data: project, error: pError } = await client
      .from('projects')
      .select('id, name, description, estimated_hours, status, start_date, end_date, users!projects_owner_id_fkey(id, real_name)')
      .eq('id', project_id)
      .maybeSingle();

    if (pError) throw new Error(`查询项目失败: ${pError.message}`);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // Get members
    const { data: members, error: mError } = await client
      .from('project_members')
      .select('*, users(id, real_name)')
      .eq('project_id', project_id);

    if (mError) throw new Error(`查询成员失败: ${mError.message}`);

    // Get actual hours
    const { data: entries, error: teError } = await client
      .from('time_entries')
      .select('hours, work_date')
      .eq('project_id', project_id);

    if (teError) throw new Error(`查询工时失败: ${teError.message}`);

    const actualHours = entries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
    const estimatedHours = parseFloat(project.estimated_hours);
    const deviation = actualHours - estimatedHours;
    const usageRate = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0;

    // Get recent work content for highlights
    const recentEntries = entries?.sort((a: { work_date: string }, b: { work_date: string }) => 
      b.work_date.localeCompare(a.work_date)
    ).slice(0, 5) || [];

    // Generate summary text
    const statusText = project.status === 'in_progress' ? '进行中' : 
      project.status === 'completed' ? '已完成' : '风险中';
    
    const ownerName = (project.users as any[] | undefined)?.[0]?.real_name || '未知';
    const summaryText = `项目"${project.name}"当前状态为${statusText}。预计总工时${estimatedHours}小时，已投入${Math.round(actualHours * 10) / 10}小时，工时使用率${Math.round(usageRate)}%。项目团队共有${members?.length || 0}名成员，负责人为${ownerName}。${deviation > 0 ? `目前工时已超支${Math.round(deviation * 10) / 10}小时，建议关注进度并及时调整计划。` : '项目进度符合预期，请继续保持。'}`;

    // Generate highlights based on recent entries
    const highlights = [
      `项目团队规模合理，共有${members?.length || 0}名成员参与`,
      `当前工时使用率为${Math.round(usageRate)}%，${usageRate < 80 ? '处于健康水平' : '需要关注'}`,
      `负责人${ownerName}持续跟进项目进度`,
    ];

    // Generate risks
    const risks: string[] = [];
    if (usageRate >= 100) {
      risks.push('项目工时已超支，存在预算风险');
    } else if (usageRate >= 80) {
      risks.push('工时使用率较高，接近预警阈值');
    }
    if (project.status === 'at_risk') {
      risks.push('项目状态为风险中，需要及时处理');
    }

    return NextResponse.json({
      data: {
        project_id: project.id,
        project_name: project.name,
        project_description: project.description || '',
        status: statusText,
        start_date: project.start_date || '',
        end_date: project.end_date || '',
        owner_name: ownerName,
        estimated_hours: estimatedHours,
        actual_hours: Math.round(actualHours * 10) / 10,
        deviation: Math.round(deviation * 10) / 10,
        usage_rate: Math.round(usageRate * 10) / 10,
        team_size: members?.length || 0,
        members: members?.map((m: { users: { real_name: string } }) => m.users.real_name) || [],
        summary_text: summaryText,
        highlights: highlights,
        risks: risks.length > 0 ? risks : ['暂无明显风险'],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '分析失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
