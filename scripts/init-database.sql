-- ============================================
-- 工时管理系统 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 1. 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  real_name VARCHAR(50) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users(status);

-- 2. 创建项目表
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  estimated_hours DECIMAL(10, 1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON projects(owner_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);

-- 3. 创建项目成员表
CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS pm_project_id_idx ON project_members(project_id);
CREATE INDEX IF NOT EXISTS pm_user_id_idx ON project_members(user_id);

-- 4. 创建工时记录表
CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  hours DECIMAL(4, 1) NOT NULL,
  remarks TEXT,
  completed_work TEXT,
  coordination_matters TEXT,
  tomorrow_plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS te_user_id_idx ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS te_project_id_idx ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS te_work_date_idx ON time_entries(work_date);
CREATE INDEX IF NOT EXISTS te_user_project_date_idx ON time_entries(user_id, project_id, work_date);

-- 5. 创建系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  config_type VARCHAR(20) NOT NULL DEFAULT 'string',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sc_config_key_idx ON system_configs(config_key);

-- 6. 创建健康检查表（用于系统检测）
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. 创建AI工作总结表
CREATE TABLE IF NOT EXISTS work_summaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  dimension VARCHAR(20) NOT NULL CHECK (dimension IN ('week', 'last_week', 'month', 'last_month', 'year', 'last_year', 'custom')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary_content TEXT NOT NULL,
  used_external_ai BOOLEAN DEFAULT FALSE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id, dimension, period_start)
);
CREATE INDEX IF NOT EXISTS idx_work_summaries_user ON work_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_work_summaries_period ON work_summaries(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_work_summaries_dimension ON work_summaries(dimension);

-- 8. 创建报告模板表（模板配置功能）
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

-- 9. 创建月度目标表（支持每月多条目标，无每月唯一约束）
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
-- 老库迁移：若存在每月唯一约束则删除（支持每月多条目标）
ALTER TABLE monthly_goals DROP CONSTRAINT IF EXISTS monthly_goals_user_id_period_year_period_month_key;

-- 10. 创建周报汇总表
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

-- 11. 创建绩效评分表
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

-- 12. 灌入内置默认模板
INSERT INTO report_templates (name, fields, is_default, user_id)
SELECT '默认周报模板',
  '[{"key":"plan","label":"本周计划"},{"key":"done","label":"实际完成"},{"key":"uncompleted_reason","label":"未完成原因"},{"key":"next_week_plan","label":"下周计划"},{"key":"output_artifacts","label":"输出产物"}]'::jsonb,
  TRUE, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM report_templates WHERE is_default = TRUE AND user_id IS NULL
);

-- 完成
SELECT 'Database initialized successfully!' as message;
