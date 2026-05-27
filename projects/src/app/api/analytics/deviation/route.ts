import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const client = getSupabaseClient();

    // Get system config for thresholds
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

    // Get all projects user can see
    let projectQuery = client.from('projects').select('id, name, estimated_hours, status');
    if (currentUser.role !== 'admin') {
      const { data: memberships } = await client
        .from('project_members')
        .select('project_id')
        .eq('user_id', currentUser.id);
      const { data: ownedProjects } = await client
        .from('projects')
        .select('id')
        .eq('owner_id', currentUser.id);
      const allIds = [
        ...new Set([
          ...(memberships?.map((m: { project_id: number }) => m.project_id) || []),
          ...(ownedProjects?.map((p: { id: number }) => p.id) || []),
        ]),
      ];
      if (allIds.length > 0) {
        projectQuery = projectQuery.in('id', allIds);
      } else {
        return NextResponse.json({ data: [] });
      }
    }

    const { data: projects, error: pError } = await projectQuery;
    if (pError) throw new Error(`查询项目失败: ${pError.message}`);

    const results = [];
    for (const project of projects || []) {
      let hoursQuery = client
        .from('time_entries')
        .select('hours')
        .eq('project_id', project.id);
      if (currentUser.role === 'user') {
        hoursQuery = hoursQuery.eq('user_id', currentUser.id);
      }
      const { data: entries } = await hoursQuery;
      const actualHours = entries?.reduce((sum: number, e: { hours: string }) => sum + parseFloat(e.hours), 0) || 0;
      const estimatedHours = parseFloat(project.estimated_hours);
      const remainingHours = Math.max(0, estimatedHours - actualHours);
      const deviation = actualHours - estimatedHours;
      const deviationRate = estimatedHours > 0 ? (deviation / estimatedHours) * 100 : 0;
      const usageRate = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0;

      let deviationStatus: 'normal' | 'warning' | 'critical' = 'normal';
      if (usageRate >= criticalThreshold) deviationStatus = 'critical';
      else if (usageRate >= warningThreshold) deviationStatus = 'warning';

      results.push({
        project_id: project.id,
        project_name: project.name,
        estimated_hours: estimatedHours,
        actual_hours: Math.round(actualHours * 10) / 10,
        remaining_hours: Math.round(remainingHours * 10) / 10,
        deviation: Math.round(deviation * 10) / 10,
        deviation_rate: Math.round(deviationRate * 10) / 10,
        usage_rate: Math.round(usageRate * 10) / 10,
        deviation_status: deviationStatus,
        project_status: project.status,
      });
    }

    return NextResponse.json({ data: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : '查询失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
