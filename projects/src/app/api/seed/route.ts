import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/auth';

export async function POST() {
  try {
    const client = getSupabaseClient();

    // Check if admin user already exists
    const { data: existingAdmin } = await client
      .from('users')
      .select('id')
      .eq('username', 'admin')
      .maybeSingle();

    if (existingAdmin) {
      return NextResponse.json({ message: '种子数据已存在，跳过初始化' });
    }

    // Create default users
    const adminPassword = await hashPassword('admin123');
    const pmPassword = await hashPassword('pm123');
    const userPassword = await hashPassword('user123');

    const { data: users, error: usersError } = await client
      .from('users')
      .insert([
        { username: 'admin', password: adminPassword, email: 'admin@example.com', real_name: '管理员', role: 'admin', status: 'active' },
        { username: 'pm', password: pmPassword, email: 'pm@example.com', real_name: '张经理', role: 'pm', status: 'active' },
        { username: 'user', password: userPassword, email: 'user@example.com', real_name: '李开发', role: 'user', status: 'active' },
        { username: 'user2', password: userPassword, email: 'user2@example.com', real_name: '王测试', role: 'user', status: 'active' },
      ])
      .select();

    if (usersError) throw new Error(`创建用户失败: ${usersError.message}`);

    // Create default project
    const { data: project, error: projectError } = await client
      .from('projects')
      .insert({
        name: '工时管理系统V2.0',
        description: '全新工时管理系统开发项目',
        owner_id: users[1].id, // pm
        estimated_hours: '500',
        status: 'in_progress',
        start_date: '2026-01-01',
        end_date: '2026-06-30',
      })
      .select()
      .single();

    if (projectError) throw new Error(`创建项目失败: ${projectError.message}`);

    // Add all users as project members
    const { error: memberError } = await client.from('project_members').insert(
      users.map((u: { id: number }) => ({
        project_id: project.id,
        user_id: u.id,
      }))
    );
    if (memberError) throw new Error(`添加成员失败: ${memberError.message}`);

    // Create another project
    const { data: project2, error: project2Error } = await client
      .from('projects')
      .insert({
        name: '移动端App开发',
        description: '配套移动端应用开发',
        owner_id: users[1].id,
        estimated_hours: '300',
        status: 'in_progress',
        start_date: '2026-02-01',
        end_date: '2026-08-31',
      })
      .select()
      .single();

    if (project2Error) throw new Error(`创建项目2失败: ${project2Error.message}`);

    const { error: member2Error } = await client.from('project_members').insert(
      [users[2], users[3]].map((u: { id: number }) => ({
        project_id: project2.id,
        user_id: u.id,
      }))
    );
    if (member2Error) throw new Error(`添加成员2失败: ${member2Error.message}`);

    // Create system configs
    const { error: configError } = await client.from('system_configs').insert([
      { config_key: 'daily_hour_limit', config_value: '8', config_type: 'number', description: '单人工时上限（小时/天）' },
      { config_key: 'warning_threshold', config_value: '80', config_type: 'number', description: '工时使用率预警阈值(%)' },
      { config_key: 'critical_threshold', config_value: '100', config_type: 'number', description: '工时使用率严重阈值(%)' },
      { config_key: 'allow_historical_entry', config_value: 'true', config_type: 'boolean', description: '是否允许补填历史工时' },
      { config_key: 'enable_ai_features', config_value: 'false', config_type: 'boolean', description: '是否启用AI分析功能' },
    ]);
    if (configError) throw new Error(`创建配置失败: ${configError.message}`);

    // Create sample time entries
    const today = new Date();
    const timeEntries = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      timeEntries.push({
        user_id: users[2].id,
        project_id: project.id,
        work_date: dateStr,
        hours: String(Math.round((4 + Math.random() * 4) * 2) / 2),
        completed_work: `完成第${7 - i}天的开发工作`,
        tomorrow_plan: `计划继续第${7 - i + 1}天的开发`,
        coordination_matters: i % 3 === 0 ? '需要后端接口支持' : '',
      });
    }

    const { error: teError } = await client.from('time_entries').insert(timeEntries);
    if (teError) throw new Error(`创建工时记录失败: ${teError.message}`);

    return NextResponse.json({
      message: '种子数据初始化成功',
      users: users.length,
      projects: 2,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
