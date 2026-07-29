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

    // Get threshold configs
    const { data: warningConfig } = await client
      .from('system_configs')
      .select('config_value')
      .eq('config_key', 'warning_threshold')
      .maybeSingle();
    const { data: criticalConfig } = await client
      .from('system_configs')
      .select('config_value')
      .eq('config_key', 'critical_threshold')
      .maybeSingle();

    const warningThreshold = parseFloat(warningConfig?.config_value || '80');
    const criticalThreshold = parseFloat(criticalConfig?.config_value || '100');

    // Get project info
    const { data: project, error: pError } = await client
      .from('projects')
      .select('id, name, estimated_hours, status, start_date, end_date')
      .eq('id', project_id)
      .maybeSingle();

    if (pError) throw new Error(`查询项目失败: ${pError.message}`);
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    // Get actual hours
    const { data: entries, error: teError } = await client
      .from('time_entries')
      .select('hours')
      .eq('project_id', project_id);

    if (teError) throw new Error(`查询工时失败: ${teError.message}`);

    const actualHours = entries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
    const estimatedHours = parseFloat(project.estimated_hours);
    const usageRate = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0;

    // Rule-based AI analysis
    let riskLevel: '低风险' | '中风险' | '高风险';
    let riskProbability: number;
    let riskReasons: string[];
    let suggestions: string[];

    if (usageRate >= criticalThreshold) {
      riskLevel = '高风险';
      riskProbability = 90;
      riskReasons = [
        `项目工时使用率已达${Math.round(usageRate)}%，超出预估工时`,
        '实际工时已超过预算，项目可能面临超支风险',
        '需要及时调整项目计划或追加资源',
      ];
      suggestions = [
        '立即评估剩余工作量，重新分配资源',
        '与客户沟通可能需要延长工期或增加预算',
        '优先完成关键路径任务，减少非必要工作',
        '考虑增加人力投入或延长工作时间',
      ];
    } else if (usageRate >= warningThreshold) {
      riskLevel = '中风险';
      riskProbability = 60;
      riskReasons = [
        `项目工时使用率已达${Math.round(usageRate)}%，接近预警阈值`,
        '需要关注项目进度，防止进一步超支',
        '部分任务可能存在效率问题',
      ];
      suggestions = [
        '定期召开项目进度会议，跟踪风险',
        '分析工时消耗较大的任务，优化流程',
        '预留一定的缓冲时间应对突发情况',
        '与团队沟通提高工作效率',
      ];
    } else {
      riskLevel = '低风险';
      riskProbability = 20;
      riskReasons = [
        `项目工时使用率为${Math.round(usageRate)}%，处于正常范围`,
        '项目进度符合预期，风险可控',
      ];
      suggestions = [
        '保持当前工作节奏，定期监控进度',
        '继续执行项目计划，确保按时交付',
        '关注可能出现的潜在风险因素',
      ];
    }

    return NextResponse.json({
      data: {
        project_id: project.id,
        project_name: project.name,
        risk_level: riskLevel,
        risk_probability: riskProbability,
        usage_rate: Math.round(usageRate * 10) / 10,
        estimated_hours: estimatedHours,
        actual_hours: Math.round(actualHours * 10) / 10,
        risk_reasons: riskReasons,
        suggestions: suggestions,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '分析失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
