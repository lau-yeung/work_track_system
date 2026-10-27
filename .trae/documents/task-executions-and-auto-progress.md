# 任务执行与自动进度实施方案

## Context（背景）

当前工时管理系统中：
- 任务（`project_tasks`）管理嵌入在 [projects/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/projects/page.tsx) 的弹窗里，没有独立页面
- 日报录入（`time_entries`）时 `progress` 字段需用户手动录入（[time-entry-dialog.tsx#L668-L678](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/time-entry-dialog.tsx#L668-L678)），与任务实际推进情况脱节
- 日历预览展示 `项目/版本/任务/进度%`，信息冗杂

用户希望：
1. 任务独立成列表页面，任务下可挂多个"执行"（任务→执行两层结构）
2. 日报录入选任务后自动拉取该任务下的执行，用户勾选当日完成的执行
3. 勾选执行后系统按"已完成执行数/总执行数*100%"实时算出任务进度并缓存到 `project_tasks.progress`，无需用户录入
4. 日历预览简化为 `产品+版本+进度%`

执行可逆勾选（active↔done），项目页原有任务管理功能保留。

## 数据模型变更

### 新增表 `task_executions`（任务→执行两层）
```sql
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
```

### 给 `project_tasks` 增加缓存进度字段
```sql
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS progress INTEGER
  NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100);
```

### `time_entries.progress` 字段保留但语义变更
- 不再由用户录入，提交日报时由后端写入"当时 `project_tasks.progress` 快照"
- 日历预览直接读 `time_entries.progress` 即可（避免 join）

**所有 DDL 写入 [src/lib/product-init.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/product-init.ts) 的 `ensureProductTables()` 函数，沿用现有 pg.Client 直连 + `NOTIFY pgrst, 'reload schema'` 模式**。同步更新 [src/storage/database/shared/schema.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/storage/database/shared/schema.ts) 增加 `taskExecutions` 表和 `projectTasks.progress` 字段定义。

## 进度计算与缓存逻辑

新增工具函数 `recalcTaskProgress(client, taskId)`：
1. 查询 `task_executions` 中该任务的 `status='done'` 数量与总数
2. `progress = total > 0 ? Math.round(doneCount / total * 100) : 0`
3. 写入 `project_tasks.progress`
4. 返回新的 progress 值

**触发时机**：
- 创建执行后（total +1，分母变化）
- 删除执行后（total -1）
- 切换执行状态后（doneCount 变化）
- 日报提交勾选执行后（间接触发 toggle）

## API 设计

### 任务执行管理（新增）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/tasks/:id/executions` | 查询任务下所有执行（按 sort_order, created_at 排序） |
| POST | `/api/tasks/:id/executions` | 创建执行（仅 admin/pm，必填 name） |
| PUT | `/api/executions/:id` | 编辑执行（name/description/sort_order） |
| DELETE | `/api/executions/:id` | 删除执行（仅 admin/pm 或创建者） |
| PUT | `/api/executions/:id/toggle` | 切换完成状态（active↔done），自动写 completed_at/completed_by 并重算任务进度 |

参考 [src/app/api/tasks/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/tasks/route.ts) 的鉴权与 `ensureProductTables()` 调用模式。目录结构：
```
src/app/api/tasks/[id]/executions/route.ts        (GET/POST)
src/app/api/executions/[id]/route.ts              (PUT/DELETE)
src/app/api/executions/[id]/toggle/route.ts      (PUT)
```

### 日报 API 改造（修改现有）

修改 [src/app/api/time-entries/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/time-entries/route.ts) 的 POST：
1. 请求体新增可选字段 `execution_ids: number[]`
2. 校验：每个 execution_id 必须归属所选 task_id
3. 提交时把对应 `task_executions` 标记为 done（completed_at=work_date, completed_by=currentUser.id）
4. 调用 `recalcTaskProgress()` 重算任务进度
5. `time_entries.progress` 写入重算后的 `project_tasks.progress` 值

PUT（编辑）同步处理 `execution_ids`：在编辑时支持重新勾选/取消勾选执行。

GET 查询字段保持不变（已有 progress），无需改查询逻辑。

## 前端变更

### 1. 新增任务管理独立页面 `src/app/(dashboard)/tasks/page.tsx`

- 顶部：产品/项目筛选 + 搜索 + "新建任务"按钮
- 主体：任务列表（按项目分组或表格展示），每行展示 `任务名 / 进度% / 执行数 / 关联版本`
- 点击任务行展开"执行管理面板"（或弹窗）：
  - 列出所有执行（含状态、完成时间、完成人）
  - 行内勾选切换 done/active（调 toggle API）
  - 添加执行（输入框 + 添加按钮）
  - 编辑/删除执行（行内编辑模式，复用 [projects/page.tsx#L407-L433](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/projects/page.tsx#L407-L433) 的 startEdit/cancelEdit/saveEdit 模式）
- 复用 [src/components/simple-pagination.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/components/simple-pagination.tsx) 翻页
- 复用 [src/components/ui/](file:///f:/Users/liuyang/Projects/work_track_system/src/components/ui/) 的 Dialog/Button/Input/Select 等

### 2. 侧边栏导航增加入口

修改 [src/components/sidebar.tsx#L22-L32](file:///f:/Users/liuyang/Projects/work_track_system/src/components/sidebar.tsx#L22-L32)，在 `项目管理` 之后插入：
```ts
{ href: '/tasks', label: '任务管理', icon: ListTodo },
```
从 `lucide-react` 导入 `ListTodo`。

### 3. 改造日报填报弹窗 [time-entry-dialog.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/time-entry-dialog.tsx)

- 在 `EntryRow` 接口增加 `execution_ids: number[]` 字段
- 选任务后（`updateRow` 中 `task_id` 变化时）调 `/api/tasks/:id/executions` 拉取执行列表，存到 row 内（或独立 state）
- 用 Checkbox 组件展示执行列表（多选），勾选时更新 `execution_ids`
- **删除进度输入框**（[L667-L678](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/time-entry-dialog.tsx#L667-L678)），改为只读提示："当前任务进度 X%（勾选执行后自动更新）"
- 提交时 body 增加 `execution_ids`
- 历史回填逻辑（[L258-L261](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/time-entry-dialog.tsx#L258-L261)）的 `latestProgress` 保留

### 4. 改造编辑工时表单 [time-entries/page.tsx#L420-L557](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/page.tsx#L420-L557)

- 删除"任务进度(%)"输入框（[L495-L507](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/page.tsx#L495-L507)），改为只读展示当前 `editEntry.progress`
- 在任务选择下方加执行勾选区（选任务后拉取执行，预选中已完成项，支持 toggle）
- `handleEdit` 提交时附带 `execution_ids`

### 5. 简化日历预览 [time-entries/page.tsx#L773-L816](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/page.tsx#L773-L816)

把 `dayEntries.slice(0, 3).map` 的展示逻辑改为：
```ts
const productName = e.projects?.products?.name || '';
const versionName = e.project_versions?.name || '';
const parts: string[] = [];
if (productName) parts.push(productName);
if (versionName) parts.push(versionName);
let label = parts.length > 0 ? parts.join('/') : '-';
if (e.progress != null && e.progress > 0) label += ` ${e.progress}%`;
```
title 同步简化为 `产品 / 版本 / 进度% / 工时`。去掉任务名展示。

### 6. 增强 [projects/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/projects/page.tsx) 任务管理弹窗

在现有任务管理 Dialog 内（搜 `taskProject` 状态相关 UI）增加"执行管理"区块：
- 任务行展开时显示该任务的执行列表
- 支持添加/编辑/删除/勾选完成执行
- 复用第 1 步任务页的执行管理子组件（建议抽成 `TaskExecutionsPanel` 共用组件放 `src/app/(dashboard)/tasks/task-executions-panel.tsx`）

## 关键复用点

- [src/lib/api.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/api.ts) 的 `apiFetch`
- [src/lib/session.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/session.ts) 的 `getSessionUser`
- [src/storage/database/supabase-client.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/storage/database/supabase-client.ts) 的 `getSupabaseClient`
- [src/components/ui/checkbox.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/components/ui/checkbox.tsx)（如不存在则用 shadcn/ui CLI 添加：`pnpm dlx shadcn@latest add checkbox`）
- 现有 [projects/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/projects/page.tsx) 的行内编辑模式（startEdit/cancelEdit/saveEdit）

## 约束遵守（来自 project_memory）

- 禁止 `as any` / 隐式 any
- `Radix UI SelectItem` 不能用空字符串 value，用 `'none'` 占位
- 创建/修改表后必须 `NOTIFY pgrst, 'reload schema'` 刷新 schema cache
- 单日单用户+项目+任务工时不能超过 8h（已有校验，保持）
- `DATABASE_URL` 必须用 Supabase Session pooler（IPv4）
- `work_summaries.used_external_ai` 等 AI 字段约束不影响本次改动

## 验证步骤

1. **DDL 生效**：启动 dev server（`pnpm dev`），查看服务端日志出现 `[product-init] product/project-task tables initialized successfully`；在 Supabase SQL Editor 验证 `task_executions` 表存在、`project_tasks.progress` 列存在
2. **任务页 CRUD**：访问 `/tasks`，创建任务、添加执行、勾选完成、删除执行，验证进度自动更新
3. **日报勾选**：访问 `/time-entries`，点击日期填报，选任务后看到执行列表，勾选后提交，验证：
   - `time_entries.progress` 等于提交时的 `project_tasks.progress`
   - `task_executions` 对应行 status=done, completed_at=填报日期, completed_by=当前用户
4. **进度可逆**：再次编辑该日报，取消勾选某执行，保存后 `task_executions.status=active`，任务进度重算
5. **日历预览**：日历格子展示 `产品名/版本名 进度%`，无任务名
6. **项目页保留**：访问 `/projects`，点击项目的"任务管理"按钮，弹窗内任务+执行管理均可用
7. **类型检查**：`pnpm tsc --noEmit` 无报错
8. **生产构建**：`pnpm build` 通过

## 实施顺序建议

1. 数据库 DDL（product-init.ts + schema.ts）→ 验证表创建成功
2. API 层（executions CRUD + toggle + time-entries POST 改造）→ 用 Postman/curl 验证
3. 抽取 `TaskExecutionsPanel` 共用组件
4. 新建 `/tasks` 页面 + 侧边栏导航
5. 改造 `time-entry-dialog.tsx`（勾选执行 + 去掉手动进度）
6. 改造 `time-entries/page.tsx` 编辑表单 + 日历预览
7. 在 `projects/page.tsx` 任务管理弹窗内集成 `TaskExecutionsPanel`
8. 全链路验证 + 类型检查 + 构建
