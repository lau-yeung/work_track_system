import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { ensureAITables, ALTER_DIMENSION_CHECK_SQL } from '@/lib/ai-init';

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS work_summaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary_content TEXT NOT NULL,
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, project_id, dimension, period_start)
);

CREATE INDEX IF NOT EXISTS idx_work_summaries_user ON work_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_work_summaries_period ON work_summaries(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_work_summaries_dimension ON work_summaries(dimension);`;

const MIGRATION_SQL = `-- 更新维度检查约束（支持新增维度）
ALTER TABLE work_summaries 
  DROP CONSTRAINT IF EXISTS work_summaries_dimension_check;
  
ALTER TABLE work_summaries 
  ADD CONSTRAINT work_summaries_dimension_check 
  CHECK (dimension IN ('week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom'));

-- 添加 used_external_ai 字段（用于区分AI来源）
ALTER TABLE work_summaries 
  ADD COLUMN IF NOT EXISTS used_external_ai BOOLEAN DEFAULT FALSE;`;

/**
 * GET /api/init-ai-tables - Get SQL for manual table creation/migration
 * POST /api/init-ai-tables - Try auto-create table
 */
export async function GET() {
  return NextResponse.json({
    message: '工作总结表建表SQL',
    sql: CREATE_TABLE_SQL,
    migrationSql: MIGRATION_SQL,
    instructions: '如果是新建表，执行建表SQL；如果是升级已有表（支持新增维度），执行迁移SQL。',
    alternative: '或设置DATABASE_URL环境变量后，通过POST /api/init-ai-tables 自动创建。',
  });
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可执行此操作' }, { status: 403 });
    }

    await ensureAITables();

    // After auto-init, verify the table exists
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const client = getSupabaseClient();
    const { error } = await client.from('work_summaries').select('id').limit(1);

    if (error && error.code === '42P01') {
      return NextResponse.json({
        success: false,
        message: '自动建表失败，请手动执行SQL',
        sql: CREATE_TABLE_SQL,
        instructions: '在Supabase控制台SQL Editor中执行上述建表语句',
      });
    }

    if (error) {
      return NextResponse.json({ error: `验证失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '工作总结表已就绪',
      migrationSql: MIGRATION_SQL,
      migrationNotice: '如需支持新增维度（上周/上月/上年/自定义），请执行迁移SQL更新约束'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}