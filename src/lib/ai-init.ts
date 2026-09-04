/**
 * Database table auto-initialization for AI features
 * Uses raw pg client to execute DDL when tables don't exist yet.
 */

import { Client } from 'pg';

const CREATE_WORK_SUMMARIES_SQL = `
CREATE TABLE IF NOT EXISTS work_summaries (
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
CREATE INDEX IF NOT EXISTS idx_work_summaries_dimension ON work_summaries(dimension);
`;

// 报告模板表（模板配置功能）
const CREATE_REPORT_TEMPLATES_SQL = `
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  fields JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_report_templates_user ON report_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_default ON report_templates(is_default);
`;

// 月度目标表（支持每月多条目标，故不再有 (user_id, year, month) 唯一约束）
const CREATE_MONTHLY_GOALS_SQL = `
CREATE TABLE IF NOT EXISTS monthly_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  goals TEXT NOT NULL,
  expected_output TEXT,
  task_breakdown TEXT,
  planned_completion_date DATE,
  acceptance_criteria TEXT,
  risk_points TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_goals_user ON monthly_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_period ON monthly_goals(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_user_period ON monthly_goals(user_id, period_year, period_month);
`;

// 迁移：老版本 monthly_goals 有 (user_id, period_year, period_month) 唯一约束，
// 多目标录入前需删除（IF EXISTS 兼容新库）。
const MIGRATE_MONTHLY_GOALS_MULTI_SQL = `
ALTER TABLE monthly_goals DROP CONSTRAINT IF EXISTS monthly_goals_user_id_period_year_period_month_key;
CREATE INDEX IF NOT EXISTS idx_monthly_goals_user_period ON monthly_goals(user_id, period_year, period_month);
`;

// 周报汇总表
const CREATE_WEEKLY_REPORTS_SQL = `
CREATE TABLE IF NOT EXISTS weekly_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  week_index INTEGER NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  this_week_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_completed TEXT,
  uncompleted_reason TEXT,
  next_week_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_artifacts TEXT,
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_year, period_month, week_index)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user ON weekly_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_period ON weekly_reports(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(week_start, week_end);
`;

// 绩效评分表
const CREATE_PERFORMANCE_SCORES_SQL = `
CREATE TABLE IF NOT EXISTS performance_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  monthly_tasks TEXT,
  work_hours DECIMAL(8,1),
  score_explanation TEXT,
  completion DECIMAL(5,1),
  quality DECIMAL(5,1),
  progress DECIMAL(5,1),
  collaboration DECIMAL(5,1),
  discipline DECIMAL(5,1),
  total_score DECIMAL(5,1),
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_performance_scores_user ON performance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_scores_period ON performance_scores(period_year, period_month);
`;

// 月度工作期配置表（全局按月，由管理员设定后才生成周报）
const CREATE_MONTH_WORK_CONFIG_SQL = `
CREATE TABLE IF NOT EXISTS month_work_config (
  id SERIAL PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  work_start DATE NOT NULL,
  work_end DATE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(period_year, period_month)
);
`;

// 迁移：monthly_goals 增排序字段（拖拽优先级）
const MIGRATE_MONTHLY_GOALS_SORT_SQL = `
ALTER TABLE monthly_goals ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_monthly_goals_sort ON monthly_goals(user_id, period_year, period_month, sort_order);
`;

// 迁移：weekly_reports.output_artifacts 由 TEXT 改 JSONB（支持附件+链接数组）
const MIGRATE_WEEKLY_OUTPUT_JSONB_SQL = `
UPDATE weekly_reports SET output_artifacts = NULL
  WHERE output_artifacts IS NOT NULL AND output_artifacts <> ''
    AND NOT (output_artifacts ~ '^\\s*[\\[{].*[\\]}]\\s*$');
ALTER TABLE weekly_reports ALTER COLUMN output_artifacts TYPE JSONB USING COALESCE(NULLIF(output_artifacts,'')::jsonb, '[]'::jsonb);
ALTER TABLE weekly_reports ALTER COLUMN output_artifacts SET DEFAULT '[]'::jsonb;
`;

/**
 * 内置默认模板字段（周报字段，开箱即用）
 */
export const DEFAULT_TEMPLATE_FIELDS = [
  { key: 'plan', label: '本周计划' },
  { key: 'done', label: '实际完成' },
  { key: 'uncompleted_reason', label: '未完成原因' },
  { key: 'next_week_plan', label: '下周计划' },
  { key: 'output_artifacts', label: '输出产物' },
];

const SEED_DEFAULT_TEMPLATE_SQL = `
INSERT INTO report_templates (name, fields, is_default, user_id)
SELECT '默认周报模板', $1::jsonb, TRUE, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates WHERE is_default = TRUE AND user_id IS NULL
);
`;

/**
 * 新功能（模板配置/月度目标/周报汇总/绩效评分）的完整建表 + 种子 SQL。
 * 作为单一事实来源，可直接在 Supabase SQL Editor 执行（用字面量，无需参数）。
 */
export const NEW_FEATURES_DDL = `
-- 报告模板表（模板配置）
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  fields JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_report_templates_user ON report_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_default ON report_templates(is_default);

-- 月度目标表（支持每月多条目标，无每月唯一约束）
CREATE TABLE IF NOT EXISTS monthly_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  goals TEXT NOT NULL,
  expected_output TEXT,
  task_breakdown TEXT,
  planned_completion_date DATE,
  acceptance_criteria TEXT,
  risk_points TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_user ON monthly_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_period ON monthly_goals(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_user_period ON monthly_goals(user_id, period_year, period_month);
-- 迁移：老库若存在每月唯一约束则删除（支持每月多条目标）
ALTER TABLE monthly_goals DROP CONSTRAINT IF EXISTS monthly_goals_user_id_period_year_period_month_key;

-- 周报汇总表
CREATE TABLE IF NOT EXISTS weekly_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  week_index INTEGER NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  this_week_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_completed TEXT,
  uncompleted_reason TEXT,
  next_week_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_artifacts TEXT,
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_year, period_month, week_index)
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_user ON weekly_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_period ON weekly_reports(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(week_start, week_end);

-- 绩效评分表
CREATE TABLE IF NOT EXISTS performance_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  monthly_tasks TEXT,
  work_hours DECIMAL(8,1),
  score_explanation TEXT,
  completion DECIMAL(5,1),
  quality DECIMAL(5,1),
  progress DECIMAL(5,1),
  collaboration DECIMAL(5,1),
  discipline DECIMAL(5,1),
  total_score DECIMAL(5,1),
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_year, period_month)
);
CREATE INDEX IF NOT EXISTS idx_performance_scores_user ON performance_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_performance_scores_period ON performance_scores(period_year, period_month);

-- 月度工作期配置表（全局按月，管理员设定后才生成周报）
CREATE TABLE IF NOT EXISTS month_work_config (
  id SERIAL PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  work_start DATE NOT NULL,
  work_end DATE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(period_year, period_month)
);

-- 迁移：monthly_goals 增排序字段（拖拽优先级）
ALTER TABLE monthly_goals ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_monthly_goals_sort ON monthly_goals(user_id, period_year, period_month, sort_order);

-- 迁移：weekly_reports.output_artifacts 由 TEXT 改 JSONB（支持附件+链接数组）
UPDATE weekly_reports SET output_artifacts = NULL
  WHERE output_artifacts IS NOT NULL AND output_artifacts <> ''
    AND NOT (output_artifacts ~ '^\s*[\[{].*[\]}]\s*$');
ALTER TABLE weekly_reports ALTER COLUMN output_artifacts TYPE JSONB USING COALESCE(NULLIF(output_artifacts,'')::jsonb, '[]'::jsonb);
ALTER TABLE weekly_reports ALTER COLUMN output_artifacts SET DEFAULT '[]'::jsonb;

-- 内置默认模板
INSERT INTO report_templates (name, fields, is_default, user_id)
SELECT '默认周报模板',
  '[{"key":"plan","label":"本周计划"},{"key":"done","label":"实际完成"},{"key":"uncompleted_reason","label":"未完成原因"},{"key":"next_week_plan","label":"下周计划"},{"key":"output_artifacts","label":"输出产物"}]'::jsonb,
  TRUE, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates WHERE is_default = TRUE AND user_id IS NULL
);

-- 通知 PostgREST 刷新 schema cache
NOTIFY pgrst, 'reload schema';
`;

/**
 * SQL to update existing table's CHECK constraint (for upgrades)
 */
export const ALTER_DIMENSION_CHECK_SQL = `
ALTER TABLE work_summaries 
  DROP CONSTRAINT IF EXISTS work_summaries_dimension_check;
  
ALTER TABLE work_summaries 
  ADD CONSTRAINT work_summaries_dimension_check 
  CHECK (dimension IN ('week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom'));
`;

/**
 * SQL to add used_external_ai column to existing table
 */
export const ALTER_ADD_USED_EXTERNAL_AI_SQL = `
ALTER TABLE work_summaries 
  ADD COLUMN IF NOT EXISTS used_external_ai BOOLEAN DEFAULT FALSE;
`;

let initialized = false;

export interface EnsureTablesResult {
  ok: boolean;
  reason?: 'no-connection' | 'error';
  message: string;
  tables: string[];
}

const NEW_TABLE_NAMES = ['report_templates', 'monthly_goals', 'weekly_reports', 'performance_scores'];

/**
 * Ensure the AI-related tables exist. Uses pg directly since
 * Supabase JS client doesn't support DDL statements.
 * Tries multiple connection methods in order.
 *
 * 返回结构化结果：当无法连接数据库（如缺少 DATABASE_URL 且直连失败）时，
 * 不静默吞错，而是返回 ok:false 并附带可在 Supabase SQL Editor 执行的 DDL。
 */
export async function ensureAITables(force = false): Promise<EnsureTablesResult> {
  if (initialized && !force) {
    return { ok: true, message: 'already initialized', tables: NEW_TABLE_NAMES };
  }

  // Try DATABASE_URL first (set in .env.local or production env)
  let connectionString = process.env.DATABASE_URL;
  
  // Fallback: derive from Supabase URL + service role key
  if (!connectionString) {
    const supabaseUrl = process.env.COZE_SUPABASE_URL;
    const serviceKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      // Extract project ref from URL: https://<project-ref>.supabase.co/
      const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match) {
        const projectRef = match[1];
        // Use Supabase's direct Postgres connection
        connectionString = `postgresql://postgres.${projectRef}:${serviceKey}@db.${projectRef}.supabase.co:5432/postgres`;
      }
    }
  }

  if (!connectionString) {
    const message =
      '未配置 DATABASE_URL，无法通过直连自动建表。请在 Supabase SQL Editor 执行建表 SQL（见 /api/init-ai-tables 返回的 newFeaturesDdl），或配置 DATABASE_URL 环境变量。';
    console.warn('[ai-init] ' + message);
    return { ok: false, reason: 'no-connection', message, tables: NEW_TABLE_NAMES };
  }

  let client: Client | null = null;
  try {
    client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    await client.connect();
    await client.query(CREATE_WORK_SUMMARIES_SQL);
    // Add used_external_ai column to existing table if not exists
    await client.query(ALTER_ADD_USED_EXTERNAL_AI_SQL);
    // 新增四表（模板配置/月度目标/周报汇总/绩效评分）
    await client.query(CREATE_REPORT_TEMPLATES_SQL);
    await client.query(CREATE_MONTHLY_GOALS_SQL);
    // 迁移：去掉 monthly_goals 每月唯一约束，支持每月多条目标
    await client.query(MIGRATE_MONTHLY_GOALS_MULTI_SQL);
    await client.query(CREATE_WEEKLY_REPORTS_SQL);
    await client.query(CREATE_PERFORMANCE_SCORES_SQL);
    // 新增：月度工作期配置表 + monthly_goals 排序字段 + output_artifacts 转 JSONB
    await client.query(CREATE_MONTH_WORK_CONFIG_SQL);
    await client.query(MIGRATE_MONTHLY_GOALS_SORT_SQL);
    await client.query(MIGRATE_WEEKLY_OUTPUT_JSONB_SQL);
    // 灌入内置默认模板（仅当不存在系统级默认模板时）
    try {
      await client.query(SEED_DEFAULT_TEMPLATE_SQL, [JSON.stringify(DEFAULT_TEMPLATE_FIELDS)]);
    } catch {
      // 种子失败不影响主流程
    }
    // 通知 PostgREST 刷新 schema cache，使其能立即识别新建表
    try {
      await client.query("NOTIFY pgrst, 'reload schema'");
    } catch {
      // NOTIFY 失败不影响主流程（部分环境不支持）
    }

    initialized = true;
    console.log('AI tables initialized successfully (work_summaries/report_templates/monthly_goals/weekly_reports/performance_scores)');
    return {
      ok: true,
      message: 'AI tables initialized successfully',
      tables: NEW_TABLE_NAMES,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const message =
      `自动建表失败（数据库直连可能不可达）：${msg}。请在 Supabase SQL Editor 执行建表 SQL（见 /api/init-ai-tables 返回的 newFeaturesDdl）。`;
    console.error('[ai-init] ' + message);
    return { ok: false, reason: 'error', message, tables: NEW_TABLE_NAMES };
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
}