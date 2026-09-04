/**
 * 新增模块（模板/月度目标/周报/绩效/通知日志）自动建表入口。
 * 与 ai-init.ts 保持同一风格：用 pg.Client + DATABASE_URL 直连 PG 执行 DDL。
 * 所有新增 POST API 在处理业务前先调用 ensurePerfTables()。
 */

import { Client } from 'pg';

// ================== 1. 模板（summary_templates + summary_template_fields） ==================

const CREATE_SUMMARY_TEMPLATES_SQL = `
CREATE TABLE IF NOT EXISTS summary_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  applicable_dimension VARCHAR(20) NOT NULL DEFAULT 'both'
    CHECK (applicable_dimension IN ('week', 'month', 'both', 'custom')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_summary_templates_default ON summary_templates(is_default) WHERE is_default = TRUE;
`;

const CREATE_TEMPLATE_FIELDS_SQL = `
CREATE TABLE IF NOT EXISTS summary_template_fields (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES summary_templates(id) ON DELETE CASCADE,
  field_name VARCHAR(60) NOT NULL,
  field_type VARCHAR(20) NOT NULL DEFAULT 'textarea'
    CHECK (field_type IN ('text', 'textarea')),
  description VARCHAR(240),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_template_fields_template ON summary_template_fields(template_id, sort_order);
`;

// ================== 2. 月度目标（monthly_goals） ==================

const CREATE_MONTHLY_GOALS_SQL = `
CREATE TABLE IF NOT EXISTS monthly_goals (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  goal TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  task_breakdown TEXT,
  planned_completion_date DATE,
  acceptance_criteria TEXT,
  risk_points TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'locked', 'completed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_owner_month ON monthly_goals(owner_id, month);
CREATE INDEX IF NOT EXISTS idx_monthly_goals_status ON monthly_goals(status);
`;

// ================== 3. 周报（weekly_reports） ==================

const CREATE_WEEKLY_REPORTS_SQL = `
CREATE TABLE IF NOT EXISTS weekly_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  plan_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  actual_completion TEXT,
  incomplete_reason TEXT,
  next_week_plan TEXT,
  output_deliverables TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week ON weekly_reports(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON weekly_reports(status);
`;

// ================== 4. 绩效评分（performance_reviews） ==================

const CREATE_PERFORMANCE_REVIEWS_SQL = `
CREATE TABLE IF NOT EXISTS performance_reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  monthly_tasks TEXT,
  total_hours DECIMAL(10,1) NOT NULL DEFAULT 0,
  score_notes TEXT,
  completion_score INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 0,
  progress_score INTEGER NOT NULL DEFAULT 0,
  collaboration_score INTEGER NOT NULL DEFAULT 0,
  discipline_score INTEGER NOT NULL DEFAULT 0,
  total_score DECIMAL(4,1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'final')),
  locked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month)
);
CREATE INDEX IF NOT EXISTS idx_performance_user_month ON performance_reviews(user_id, month);
CREATE INDEX IF NOT EXISTS idx_performance_status ON performance_reviews(status);
`;

// ================== 5. 通知日志（notification_logs） ==================

const CREATE_NOTIFICATION_LOGS_SQL = `
CREATE TABLE IF NOT EXISTS notification_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('none', 'email', 'wecom')),
  subject VARCHAR(240),
  content_excerpt TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent ON notification_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
`;

// ================== 增量列：users.phone / users.wecom_webhook / work_summaries.template_id ==================

const ALTER_USERS_ADD_CONTACT_COLS = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS wecom_webhook VARCHAR(500);
`;

const ALTER_WORK_SUMMARIES_ADD_TEMPLATE_ID = `
ALTER TABLE work_summaries ADD COLUMN IF NOT EXISTS template_id INTEGER
  REFERENCES summary_templates(id) ON DELETE SET NULL;
`;

// ================== 种子数据：标准周报模板（默认模板，5 字段） ==================

interface SeededTemplate {
  id: number;
}

/**
 * 在模板表为空时插入标准周报模板。
 * 注意：不能写死 NOT NULL 的 created_by，管理员不一定存在，所以这里单独走一次 Supabase
 * 也可以用单独的连接查询来 upsert。为避免与建表事务耦合，此部分在初始化后独立运行。
 */
const SEED_TEMPLATE_IF_EMPTY = `
WITH tpl AS (
  INSERT INTO summary_templates (name, applicable_dimension, is_default, created_at, updated_at)
  SELECT '标准周报模板', 'both', TRUE, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM summary_templates)
  RETURNING id
)
INSERT INTO summary_template_fields (template_id, field_name, field_type, description, sort_order)
SELECT tpl.id, f.name, f.type, f.desc, f.ord
FROM tpl
CROSS JOIN (VALUES
  ('本周计划', 'textarea', '本周围绕月度目标的计划要点', 1),
  ('实际完成', 'textarea', '本周实际完成的工作要点与数据', 2),
  ('未完成原因', 'textarea', '计划未完成的原因与影响', 3),
  ('下周计划', 'textarea', '下周主要推进事项', 4),
  ('输出产物', 'textarea', '本周交付的文档、版本号、二进制、链接等', 5)
) AS f(name, type, desc, ord);
`;

let initialized = false;

function pickConnectionString(): string | undefined {
  let connStr = process.env.DATABASE_URL;
  if (!connStr) {
    const url = process.env.COZE_SUPABASE_URL;
    const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (m) {
        const projectRef = m[1];
        connStr = `postgresql://postgres.${projectRef}:${key}@db.${projectRef}.supabase.co:5432/postgres`;
      }
    }
  }
  return connStr;
}

export async function ensurePerfTables(): Promise<void> {
  if (initialized) return;
  const connectionString = pickConnectionString();
  if (!connectionString) {
    console.warn('[perf-init] No database connection, perf tables auto-init skipped');
    return;
  }

  let client: Client | undefined;
  try {
    client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await client.connect();

    for (const stmt of [
      CREATE_SUMMARY_TEMPLATES_SQL,
      CREATE_TEMPLATE_FIELDS_SQL,
      CREATE_MONTHLY_GOALS_SQL,
      CREATE_WEEKLY_REPORTS_SQL,
      CREATE_PERFORMANCE_REVIEWS_SQL,
      CREATE_NOTIFICATION_LOGS_SQL,
      ALTER_USERS_ADD_CONTACT_COLS,
      ALTER_WORK_SUMMARIES_ADD_TEMPLATE_ID,
    ]) {
      await client.query(stmt);
    }

    // 插入默认模板（仅当 templates 为空）
    try {
      await client.query(SEED_TEMPLATE_IF_EMPTY);
    } catch (seedErr) {
      console.warn('[perf-init] seed template skipped:', seedErr instanceof Error ? seedErr.message : String(seedErr));
    }

    initialized = true;
    console.log('[perf-init] perf tables initialized successfully');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[perf-init] failed:', msg);
    console.warn(
      '[perf-init] Please manually create perf tables with SQL above if tables still missing.'
    );
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
