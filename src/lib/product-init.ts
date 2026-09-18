/**
 * 产品-项目-任务三级结构（禅道风格）自动建表入口。
 * 与 ai-init.ts / perf-init.ts 保持同一风格：用 pg.Client + DATABASE_URL 直连 PG 执行 DDL。
 * 涉及 products 表、project_tasks 表，以及 projects.product_id / time_entries.task_id 两个关联列。
 * products / tasks / time-entries 相关 API 在处理业务前先调用 ensureProductTables()。
 */

import { Client } from 'pg';

// ================== 1. 产品表（禅道：产品，如 Starfish） ==================

const CREATE_PRODUCTS_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL UNIQUE,
  code VARCHAR(50),
  description TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
`;

// ================== 2. 项目挂产品（projects.product_id） ==================

const ALTER_PROJECTS_ADD_PRODUCT_ID = `
ALTER TABLE projects ADD COLUMN IF NOT EXISTS product_id INTEGER
  REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_product_id ON projects(product_id);
`;

// ================== 1.1 产品编号唯一约束 ==================
// PostgreSQL 不支持 ADD CONSTRAINT IF NOT EXISTS，用 DO 块兼容已存在情况。
// code 允许 NULL（多个 NULL 不冲突），但非空值必须唯一。
const ADD_PRODUCTS_CODE_UNIQUE = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_code_key'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_code_key UNIQUE (code);
  END IF;
END $$;
`;

// ================== 3. 任务表（禅道：任务，隶属于项目，如 Starfish-4.1.0-功能测试） ==================

const CREATE_PROJECT_TASKS_SQL = `
CREATE TABLE IF NOT EXISTS project_tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_status ON project_tasks(status);
`;

// ================== 4. 工时记录挂任务（time_entries.task_id） ==================

const ALTER_TIME_ENTRIES_ADD_TASK_ID = `
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_id INTEGER
  REFERENCES project_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
`;

// ================== 5. 工时记录加任务进度（time_entries.progress） ==================

const ALTER_TIME_ENTRIES_ADD_PROGRESS = `
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS progress INTEGER
  DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
`;

// ================== 6. 项目版本表（禅道：版本 Build，隶属项目，如 Starfish-V4.1.0-Build1） ==================
// 版本是项目里程碑，任务可关联版本用于版本规划。
const CREATE_PROJECT_VERSIONS_SQL = `
CREATE TABLE IF NOT EXISTS project_versions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  release_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_project_versions_project ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_status ON project_versions(status);
`;

// ================== 7. 任务-版本 N:N 关联表（project_task_versions） ==================
// 一个任务可关联多个版本（如回归测试关联 2.0.1/2.0.2/2.0.3），
// 一个版本也可关联多个任务（如 2.0.0 关联冒烟/功能/系统测试）。
const CREATE_PROJECT_TASK_VERSIONS_SQL = `
CREATE TABLE IF NOT EXISTS project_task_versions (
  task_id INTEGER NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  version_id INTEGER NOT NULL REFERENCES project_versions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, version_id)
);
CREATE INDEX IF NOT EXISTS idx_ptv_version_id ON project_task_versions(version_id);
`;

// 老库迁移：移除 project_tasks.version_id（1:N 已升级为 N:N 关联表）
const DROP_PROJECT_TASKS_VERSION_ID = `
ALTER TABLE project_tasks DROP COLUMN IF EXISTS version_id;
`;

// ================== 8. 工时记录挂版本（time_entries.version_id，可选） ==================
// 填报日报时选择项目下任意版本，与任务解耦（N:N 允许任意组合）
const ALTER_TIME_ENTRIES_ADD_VERSION_ID = `
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS version_id INTEGER
  REFERENCES project_versions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_version_id ON time_entries(version_id);
`;

// ================== 9. 任务进度缓存（project_tasks.progress） ==================
// 任务进度按"已完成执行数/总执行数"实时重算后缓存到此字段，
// 日报提交时把该值作为快照写入 time_entries.progress，日历预览直接读 time_entries.progress。
const ALTER_PROJECT_TASKS_ADD_PROGRESS = `
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS progress INTEGER
  NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
`;

// ================== 10. 任务执行表（task_executions，任务→执行两层） ==================
// 一个任务下挂多个"执行"，日报录入选任务后自动拉取执行列表，用户勾选当日完成的执行，
// 系统按"已完成执行数/总执行数*100%"自动算任务进度，无需用户录入。
const CREATE_TASK_EXECUTIONS_SQL = `
CREATE TABLE IF NOT EXISTS task_executions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'done')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at DATE,
  completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(task_id, name)
);
CREATE INDEX IF NOT EXISTS idx_task_executions_task ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
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

/**
 * 确保产品/任务三级结构相关表与列存在。
 * 静默失败时仅告警（与 perf-init 一致），业务 API 会在查询时报 schema cache miss，
 * 用户可按日志在 Supabase SQL Editor 手动执行等价 DDL。
 */
export async function ensureProductTables(): Promise<void> {
  if (initialized) return;
  const connectionString = pickConnectionString();
  if (!connectionString) {
    console.warn('[product-init] No database connection, product/task tables auto-init skipped');
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
      CREATE_PRODUCTS_SQL,
      ADD_PRODUCTS_CODE_UNIQUE,
      ALTER_PROJECTS_ADD_PRODUCT_ID,
      CREATE_PROJECT_TASKS_SQL,
      ALTER_TIME_ENTRIES_ADD_TASK_ID,
      ALTER_TIME_ENTRIES_ADD_PROGRESS,
      CREATE_PROJECT_VERSIONS_SQL,
      CREATE_PROJECT_TASK_VERSIONS_SQL,
      DROP_PROJECT_TASKS_VERSION_ID,
      ALTER_TIME_ENTRIES_ADD_VERSION_ID,
      ALTER_PROJECT_TASKS_ADD_PROGRESS,
      CREATE_TASK_EXECUTIONS_SQL,
    ]) {
      await client.query(stmt);
    }

    // 通知 PostgREST 刷新 schema cache，使其能立即识别新表/新列
    try {
      await client.query("NOTIFY pgrst, 'reload schema'");
    } catch {
      // NOTIFY 失败不影响主流程（部分环境不支持）
    }

    initialized = true;
    console.log('[product-init] product/project-task tables initialized successfully');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[product-init] failed:', msg);
    console.warn(
      '[product-init] Please manually create products/project_tasks tables and projects.product_id / time_entries.task_id columns if still missing.'
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

/**
 * 重算任务进度并写入 project_tasks.progress 缓存字段。
 * 进度公式：已完成执行数 / 总执行数 * 100（向下取整，无执行时为 0）。
 * 触发时机：创建/删除执行、切换执行状态、日报提交勾选执行后。
 * @returns 重算后的进度值（0-100）
 */
export async function recalcTaskProgress(taskId: number): Promise<number> {
  const connectionString = pickConnectionString();
  if (!connectionString) {
    console.warn('[product-init] recalcTaskProgress skipped: no database connection');
    return 0;
  }

  let client: Client | undefined;
  try {
    client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await client.connect();

    // 查询该任务的执行总数与已完成数
    const { rows } = await client.query<{
      total: string;
      done: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'done')::int AS done
       FROM task_executions
       WHERE task_id = $1`,
      [taskId]
    );

    const total = rows[0]?.total ? parseInt(rows[0].total, 10) : 0;
    const done = rows[0]?.done ? parseInt(rows[0].done, 10) : 0;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;

    await client.query(
      `UPDATE project_tasks SET progress = $1, updated_at = NOW() WHERE id = $2`,
      [progress, taskId]
    );

    return progress;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[product-init] recalcTaskProgress(taskId=${taskId}) failed:`, msg);
    return 0;
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
