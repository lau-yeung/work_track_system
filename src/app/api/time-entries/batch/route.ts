import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSessionUser } from '@/lib/session';

interface BatchEntryInput {
  project_id: number;
  hours: string;
  completed_work: string;
  remarks?: string;
}

interface BatchRequestBody {
  work_date: string;
  coordination_matters?: string;
  tomorrow_plan: string;
  entries: BatchEntryInput[];
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const body = (await request.json()) as BatchRequestBody;
    const { work_date, coordination_matters, tomorrow_plan, entries } = body;

    // Basic validation
    if (!work_date) {
      return NextResponse.json({ error: '工作日期为必填' }, { status: 400 });
    }
    if (!tomorrow_plan || !tomorrow_plan.trim()) {
      return NextResponse.json({ error: '明日计划工作为必填' }, { status: 400 });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: '至少需要一条工时记录' }, { status: 400 });
    }

    const client = getSupabaseClient();

    // Validate each entry and parse hours
    const parsedEntries: Array<{
      project_id: number;
      hoursNum: number;
      completed_work: string;
      remarks: string;
    }> = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.project_id || !entry.hours || !entry.completed_work?.trim()) {
        return NextResponse.json(
          { error: `第${i + 1}行：项目、工时和完成工作为必填` },
          { status: 400 }
        );
      }

      const hoursNum = parseFloat(entry.hours);
      if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 8) {
        return NextResponse.json(
          { error: `第${i + 1}行：工时必须在 0-8 之间` },
          { status: 400 }
        );
      }
      // Check 0.5 step
      if (hoursNum * 2 !== Math.floor(hoursNum * 2)) {
        return NextResponse.json(
          { error: `第${i + 1}行：工时必须是 0.5 的倍数` },
          { status: 400 }
        );
      }

      parsedEntries.push({
        project_id: entry.project_id,
        hoursNum,
        completed_work: entry.completed_work.trim(),
        remarks: entry.remarks || '',
      });
    }

    // Check duplicate projects within batch
    const projectIds = parsedEntries.map((e) => e.project_id);
    const uniqueProjectIds = new Set(projectIds);
    if (uniqueProjectIds.size !== projectIds.length) {
      return NextResponse.json(
        { error: '批量填报中存在重复项目，每个项目只能填报一次' },
        { status: 400 }
      );
    }

    // Check project membership for non-admin users
    if (currentUser.role !== 'admin') {
      const { data: memberships } = await client
        .from('project_members')
        .select('project_id')
        .eq('user_id', currentUser.id)
        .in('project_id', projectIds);

      const memberProjectIds = new Set((memberships || []).map((m: { project_id: number }) => m.project_id));
      const nonMemberProjects = projectIds.filter((pid) => !memberProjectIds.has(pid));
      if (nonMemberProjects.length > 0) {
        return NextResponse.json(
          { error: '您不是部分所选项目的成员，无法填报工时' },
          { status: 403 }
        );
      }
    }

    // Query existing entries for this user+date (for daily total and upsert detection)
    const { data: existingDailyEntries } = await client
      .from('time_entries')
      .select('id, project_id, hours')
      .eq('user_id', currentUser.id)
      .eq('work_date', work_date);

    const existingMap = new Map<number, { id: number; hours: number }>();
    let existingDailyTotal = 0;
    for (const e of existingDailyEntries || []) {
      const h = parseFloat(e.hours);
      existingDailyTotal += h;
      existingMap.set(e.project_id, { id: e.id, hours: h });
    }

    // Calculate batch total (for new entries, add full; for upsert, add delta)
    let batchDelta = 0;
    for (const entry of parsedEntries) {
      const existing = existingMap.get(entry.project_id);
      if (existing) {
        // Upsert: replace old hours with new
        batchDelta += entry.hoursNum - existing.hours;
      } else {
        batchDelta += entry.hoursNum;
      }
    }

    const newDailyTotal = existingDailyTotal + batchDelta;
    if (newDailyTotal > 8) {
      return NextResponse.json(
        {
          error: `单日工时总计不能超过8小时（当前已填报${existingDailyTotal}小时，本次拟填报后总计${newDailyTotal}小时）`,
        },
        { status: 400 }
      );
    }

    // Check project estimated hours for each project
    const { data: projectsData } = await client
      .from('projects')
      .select('id, name, estimated_hours')
      .in('id', projectIds);

    const projectMap = new Map<number, { name: string; estimated_hours: string }>(
      (projectsData || []).map((p: { id: number; name: string; estimated_hours: string }) => [
        p.id,
        { name: p.name, estimated_hours: p.estimated_hours },
      ])
    );

    // Query current total hours for all batch projects
    const { data: projectEntries } = await client
      .from('time_entries')
      .select('project_id, hours, user_id, work_date')
      .in('project_id', projectIds);

    // Calculate current usage per project (excluding entries that will be upserted)
    const projectUsageMap = new Map<number, number>();
    for (const pe of projectEntries || []) {
      const h = parseFloat(pe.hours);
      // If this entry is the one being upserted (same user+project+date), skip it
      const isUpsertTarget =
        pe.user_id === currentUser.id && pe.work_date === work_date;
      if (!isUpsertTarget) {
        projectUsageMap.set(pe.project_id, (projectUsageMap.get(pe.project_id) || 0) + h);
      }
    }

    for (const entry of parsedEntries) {
      const project = projectMap.get(entry.project_id);
      if (!project) continue;

      const currentUsage = projectUsageMap.get(entry.project_id) || 0;
      const estimated = parseFloat(project.estimated_hours);
      if (currentUsage + entry.hoursNum > estimated) {
        return NextResponse.json(
          {
            error: `项目「${project.name}」工时已超出预估（预估${project.estimated_hours}小时，已用${currentUsage}小时，本次拟填报${entry.hoursNum}小时）`,
          },
          { status: 400 }
        );
      }
    }

    // All validations passed, now write entries via upsert
    const savedEntries: Array<Record<string, unknown>> = [];

    for (const entry of parsedEntries) {
      const existing = existingMap.get(entry.project_id);

      let result: Record<string, unknown> | null;
      if (existing) {
        // Update existing entry
        const { data, error } = await client
          .from('time_entries')
          .update({
            hours: String(entry.hoursNum),
            remarks: entry.remarks,
            completed_work: entry.completed_work,
            coordination_matters,
            tomorrow_plan,
          })
          .eq('id', existing.id)
          .select('*, projects(id, name), users(id, real_name, username)')
          .maybeSingle();
        if (error) throw new Error(`更新工时失败: ${error.message}`);
        result = data;
      } else {
        // Create new entry
        const { data, error } = await client
          .from('time_entries')
          .insert({
            user_id: currentUser.id,
            project_id: entry.project_id,
            work_date,
            hours: String(entry.hoursNum),
            remarks: entry.remarks,
            completed_work: entry.completed_work,
            coordination_matters,
            tomorrow_plan,
          })
          .select('*, projects(id, name), users(id, real_name, username)')
          .maybeSingle();
        if (error) throw new Error(`创建工时失败: ${error.message}`);
        result = data;
      }

      if (result) savedEntries.push(result);
    }

    // Query final daily total
    const { data: dailyAfter } = await client
      .from('time_entries')
      .select('hours')
      .eq('user_id', currentUser.id)
      .eq('work_date', work_date);
    const dailyTotal = (dailyAfter || []).reduce(
      (sum: number, e: { hours: string }) => sum + parseFloat(e.hours),
      0
    );

    return NextResponse.json(
      {
        data: savedEntries,
        daily_total: Math.round(dailyTotal * 10) / 10,
        is_below_minimum: dailyTotal < 8,
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '批量填报失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
