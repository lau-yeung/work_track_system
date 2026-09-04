import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { ensureAITables, NEW_FEATURES_DDL } from '@/lib/ai-init';

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

const NEW_TABLE_NAMES = ['report_templates', 'monthly_goals', 'weekly_reports', 'performance_scores'];

/**
 * GET /api/init-ai-tables - Get SQL for manual table creation/migration
 */
export async function GET() {
  return NextResponse.json({
    message: '建表 SQL：work_summaries 为工作总结表；newFeaturesDdl 为模板配置/月度目标/周报汇总/绩效评分四表',
    sql: CREATE_TABLE_SQL,
    migrationSql: MIGRATION_SQL,
    newFeaturesDdl: NEW_FEATURES_DDL,
    instructions:
      '首次使用请在 Supabase SQL Editor 执行 newFeaturesDdl（含四表+默认模板+刷新缓存）；work_summaries 升级执行 migrationSql。',
    alternative: '或配置 DATABASE_URL 环境变量后，POST /api/init-ai-tables 由管理员触发自动创建。',
  });
}

/**
 * POST /api/init-ai-tables - Try auto-create tables (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request);
    if (!currentUser) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (currentUser.role !== 'admin') {
      return NextResponse.json({ error: '仅管理员可执行此操作' }, { status: 403 });
    }

    // 强制尝试自动建表（忽略 initialized 短路）
    const result = await ensureAITables(true);

    // 验证所有表是否可通过 PostgREST 访问
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const client = getSupabaseClient();
    const missing: string[] = [];
    const allTables = ['work_summaries', ...NEW_TABLE_NAMES];
    for (const t of allTables) {
      const { error } = await client.from(t).select('id').limit(1);
      if (error && (error.code === '42P01' || error.code === 'PGRST205' || /schema cache/i.test(error.message))) {
        missing.push(t);
      }
    }

    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        autoInit: result,
        missingTables: missing,
        message: `自动建表未完全成功，以下表仍不可访问：${missing.join(', ')}。请在 Supabase SQL Editor 手动执行 newFeaturesDdl。`,
        sql: CREATE_TABLE_SQL,
        newFeaturesDdl: NEW_FEATURES_DDL,
        instructions: '打开 Supabase 控制台 SQL Editor，粘贴 newFeaturesDdl 执行后刷新页面。',
      });
    }

    return NextResponse.json({
      success: true,
      message: '所有数据表已就绪（work_summaries + 模板/月度目标/周报/绩效四表）',
      autoInit: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '初始化失败';
    return NextResponse.json({ error: message, newFeaturesDdl: NEW_FEATURES_DDL }, { status: 500 });
  }
}
