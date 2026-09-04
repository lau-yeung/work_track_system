# PRD：模板配置 / 月度目标 / 周报汇总 / 绩效评分

> 版本：v1.0 ｜ 日期：2026-09-03 ｜ 作者：基于 `新需求.md` 整理

## 1. 背景与目标

工时管理系统已完成工时日报、项目、工作总结（AI 周期总结）能力。本期基于已有的日报数据与 AI 服务，扩展四项闭环功能：

1. **模板配置**：周期总结生成前可选模板，AI 按模板字段输出。
2. **月度目标**：月初录入目标、产出、任务拆解、验收标准、风险点。
3. **周报汇总**：周计划自动承接月度目标/上周下周计划，实际完成由 AI 基于本周日报生成（带兜底）。
4. **绩效评分**：月度任务项与五维评分由 AI 基于本月周报自动生成，总分 100 分加权。

**整体价值**：形成「日报 → 周报 → 月度目标 → 绩效」的数据闭环，减少人工搬运，AI 提效并保留兜底。

---

## 2. 现状与约束（复用现有架构）

- **框架**：Next.js 16 App Router + React 19 + TS5 + shadcn/ui + Tailwind 4；包管理 `pnpm`。
- **数据库**：Supabase（Postgres）。新表沿用 `ensureAITables()` 模式（`pg.Client` 直连 `CREATE TABLE IF NOT EXISTS`，并放在 `src/lib/ai-init.ts` 中扩展）。前端读写统一用 `getSupabaseClient()`。
- **会话/鉴权**：`getSessionUser(request)` 返回 `{ id, username, real_name, role }`，role ∈ `admin` | `pm` | `user`。普通用户仅看本人数据，`admin` 看全员（沿用 work-summary 既有策略）。
- **AI 层**：`src/lib/ai-service.ts`
  - `getAIConfig()` 读 `system_configs`，区分 `builtin`（规则引擎兜底）/ `external`（OpenAI 兼容，如 DeepSeek）。
  - `callAI(messages)` 返回文本；`callAIJson<T>()` 返回结构化 JSON，内置三级兜底：① JSON.parse（含去 ```json 包裹、截取首尾 `{}`）→ ② `## 字段名` 分节解析 → ③ `fallbackFactory` 工厂兜底。**周报/绩效/模板化总结统一走 `callAIJson`**，确保 AI 不通时有可用结果。
  - `used_external_ai` 标识来源，沿用现有展示策略。
- **既有表字段**：
  - `time_entries`：`work_date, hours, completed_work, tomorrow_plan, coordination_matters, remarks, project_id, user_id`
  - `work_summaries`：`dimension, period_start, period_end, summary_content, used_external_ai, user_id, project_id`
- **导航**：`src/components/sidebar.tsx` 已注册 `/monthly-goals`、`/weekly-reports`、`/my-performance`、`/performance`、`/work-summary`，但对应页面目录尚未创建（本期补齐）。

---

## 3. 功能一：模板配置

### 3.1 目标
生成周期总结（work-summary）前，用户可选择模板；AI 按模板字段输出，使总结结构可配置。

### 3.2 数据模型
新建 `report_templates` 表：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | SERIAL PK | |
| name | VARCHAR(100) NOT NULL | 模板名称 |
| fields | JSONB NOT NULL | 字段定义数组，如 `[{"key":"plan","label":"本周计划"},{"key":"done","label":"实际完成"}]` |
| is_default | BOOLEAN DEFAULT FALSE | 是否默认模板（每用户至多一个） |
| user_id | INTEGER REFERENCES users(id) ON DELETE CASCADE | 所属用户；NULL=系统内置 |
| created_at / updated_at | TIMESTAMPTZ | |

约束：`(user_id, name)` 唯一；系统内置模板 `user_id IS NULL`。

初始化内置默认模板，字段为：`本周计划 / 实际完成 / 未完成原因 / 下周计划 / 输出产物`（即新需求中周报字段，保证开箱即用）。

### 3.3 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/report-templates` | 列出当前用户可用模板（本人 + 系统内置），标记 `is_default` |
| POST | `/api/report-templates` | 新建模板 `{ name, fields[] }` |
| PUT | `/api/report-templates/:id` | 编辑模板（仅本人） |
| DELETE | `/api/report-templates/:id` | 删除（仅本人，系统内置不可删） |
| POST | `/api/report-templates/:id/default` | 设为默认 |

`fields` 校验：`key` 仅字母数字下划线；`label` 必填；每模板字段数 1~12。

### 3.4 与 work-summary 的集成
- work-summary 生成接口 `POST /api/ai/work-summary` 增加可选 `templateId`。
- 传入后，`generateWorkSummary` 构造 prompt 时把模板字段作为输出 schema 注入（`请严格按以下字段输出 JSON：{字段key:内容}`），结果用 `callAIJson` 解析为 `{fieldKey: content}`，再拼装成带 `## label` 的 Markdown 落库到 `summary_content`（保留 work_summaries 既有结构与唯一约束）。
- 前端 work-summary 页面：生成前下拉选择模板（默认勾选默认模板），不选则走原自由总结逻辑（向后兼容）。
- 模板管理入口：在 `/work-summary` 页面加「模板配置」按钮，弹出侧边抽屉/对话框 CRUD。

### 3.5 边界
- 删除被引用模板不影响已存总结（`summary_content` 是文本快照）。
- 兜底：AI 不通时 `callAIJson` 的 `fallbackFactory` 按字段从日报 `completed_work/tomorrow_plan` 规则填充各字段。

---

## 4. 功能二：月度目标

### 4.1 目标
月初录入目标与产出，并拆解任务、验收标准、风险点；数据供周报第一周计划与绩效月度任务项引用。

### 4.2 数据模型
新建 `monthly_goals` 表：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | SERIAL PK | |
| user_id | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | 负责人 |
| period_year | INT NOT NULL | 年 |
| period_month | INT NOT NULL | 月 1-12 |
| goals | TEXT NOT NULL | 月度目标（最重要的几个目标） |
| expected_output | TEXT | 预期产出（代码/文档/版本） |
| task_breakdown | TEXT | 计划任务拆解 |
| planned_completion_date | DATE | 计划完成时间 |
| acceptance_criteria | TEXT | 验收标准 |
| risk_points | TEXT | 风险点 |
| status | VARCHAR(20) DEFAULT 'draft' | draft/active/closed |
| created_at / updated_at | TIMESTAMPTZ | |

唯一约束：`(user_id, period_year, period_month)`（每人每月一条）。索引 `user_id, period_year, period_month`。

### 4.3 提示文案（placeholder）
| 字段 | placeholder |
|---|---|
| 月度目标 | 最重要的几个目标 |
| 预期产出 | 代码、文档、版本 |
| 计划任务拆解 | 根据目标自己拆解 |
| 验收标准 | 什么叫完成 |
| 风险点 | 哪里可能卡住 |

### 4.4 列表字段
`负责人、月度目标、预期产出、计划任务拆解、计划完成时间、验收标准、风险点`（与需求 1 一致）。

### 4.5 API
- `GET /api/monthly-goals?year=&month=&userId=` 列表（普通用户看本人，admin 看全员）
- `POST /api/monthly-goals` upsert `{year, month, goals, expectedOutput, ...}`
- `GET/PUT /api/monthly-goals/:id`
- 默认进入当前年月；支持切换月份。

### 4.6 页面 `/monthly-goals`
- 顶部：年月选择 + 成员筛选（admin 可见全员下拉）。
- 表格：按需求字段列展示，空值显示「-」。
- 操作：新建/编辑弹窗（Dialog），字段对应数据模型，placeholder 如上。
- 普通用户进入默认显示本人当月；admin 默认显示全员当月。

---

## 5. 功能三：周报汇总

### 5.1 目标
按月自动划分周区间；周计划自动承接（第一周来自月度目标，后续周来自上周下周计划）；实际完成由 AI 基于本周日报生成（带兜底）；支持勾选完成项。

### 5.2 周区间划分规则（每月）
- 每周按「周一 ~ 周日」。
- 月内首周 = 该月第一个工作日（周一~周五）所在自然周（周一~周日）。
- 例：8 月第一个工作日为 8/3（周一），则第一周 = 8/3~8/7（周日 8/9 仍算本周，但日报只取工作日）。
  - 说明：为简化「周区间」，统一以「该周所在周一 ~ 周日」为周期；周报日报数据取该周内（周一~周日）的 `time_entries`。
- 每月最多 5 周；月末跨月周按本月归属（以周一所在月为准）。

### 5.3 数据模型
新建 `weekly_reports` 表：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | SERIAL PK | |
| user_id | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | 成员 |
| period_year | INT NOT NULL | |
| period_month | INT NOT NULL | |
| week_index | INT NOT NULL | 该月第几周 1-5 |
| week_start | DATE NOT NULL | 周一 |
| week_end | DATE NOT NULL | 周日 |
| this_week_plan | JSONB NOT NULL DEFAULT '[]' | 本周计划项数组 `[{id,text,done}]` |
| actual_completed | TEXT | 实际完成（AI 生成） |
| uncompleted_reason | TEXT | 未完成原因 |
| next_week_plan | JSONB NOT NULL DEFAULT '[]' | 下周计划项 `[{id,text,done:false}]` |
| output_artifacts | TEXT | 输出产物 |
| used_external_ai | BOOLEAN DEFAULT FALSE | AI 来源 |
| generated_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

唯一约束：`(user_id, period_year, period_month, week_index)`，并加 `(user_id, week_start)` 唯一兜底。索引 `user_id, week_start, period_year, period_month`。

`this_week_plan`/`next_week_plan` 为结构化数组：每项 `{ id: string, text: string, done: boolean }`，支持前端勾选完成。

### 5.4 周计划承接逻辑
1. **第一周** `this_week_plan` 默认从当月 `monthly_goals.goals` + `task_breakdown` 转成计划项（按行/分号切分），`done=false`；支持手动增删改；支持勾选完成。
2. **第二周起** `this_week_plan` 默认从上一周 `weekly_reports.next_week_plan` 整体复制（保留 `done=false` 重置，因属新周）。
3. 生成本周周报时：若已存在 `this_week_plan` 则用现有；否则按上述规则自动初始化并落库，再进入编辑。
4. 计划项可手动新增、编辑文本、勾选 `done`、删除。`done` 状态持久化到 `this_week_plan`。

### 5.5 实际完成（AI 生成 + 兜底）
- 用户点「生成周报」→ `POST /api/weekly-reports/generate`，后端取本周（`week_start`~`week_end`）该用户 `time_entries.completed_work/tomorrow_plan/coordination_matters`，调 `callAIJson` 生成 `{ actualCompleted, uncompletedReason, outputArtifacts }`。
- **兜底逻辑**（`fallbackFactory`）：AI 不通/解析失败时，用日报 `completed_work` 拼接成「实际完成」，未完成原因填「详见日报待办」，输出产物取 `remarks`/`tomorrow_plan` 中含「产出/文档/版本」关键字行。同时 `used_external_ai=false`。
- 生成结果 upsert 到 `weekly_reports`（保留用户已编辑的 `this_week_plan/next_week_plan`，仅覆盖 `actual_completed/uncompleted_reason/output_artifacts/used_external_ai/generated_at`）。
- 生成后前端 toast 提示 AI 来源（外部/内置/兜底）。

### 5.6 列表字段
`成员、本周计划、实际完成、未完成原因、下周计划、输出产物`（与需求一致）。
- 「本周计划」「下周计划」单元格渲染为可勾选 checkbox 列表（`done` 勾选即时保存）。
- 「实际完成」单元格在未生成前显示「—」并附「生成周报」按钮。

### 5.7 API
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/weekly-reports?year=&month=` | 列出当月各周（普通用户本人，admin 全员） |
| GET | `/api/weekly-reports?weekStart=&weekEnd=&userId=` | 指定周 |
| PUT | `/api/weekly-reports/:id` | 更新计划项/勾选 done/下周计划/未完成原因等 |
| POST | `/api/weekly-reports/generate` | `{ userId, weekStart, weekEnd }` 生成实际完成（AI+兜底） |
| POST | `/api/weekly-reports/init` | 显式初始化某周计划（承接月度目标/上周计划） |

### 5.8 页面 `/weekly-reports`
- 顶部：年月选择 + 成员筛选（admin 全员）+ 周次切换（第1~5 周 Tab）。
- 表格按成员行；周计划/下周计划可内联勾选与编辑；实际完成为只读 + 「生成周报」按钮。
- 进入月份时若该周无记录，自动 POST `/init` 初始化计划。

---

## 6. 功能四：绩效评分

### 6.1 目标
基于本月周报「实际完成」由 AI 生成月度任务项与五维评分；总分 100 分加权；管理员视角。

### 6.2 评分权重（总分 100）
| 维度 | 权重 | 字段 |
|---|---|---|
| 完成度 | 35% | completion |
| 质量 | 30% | quality |
| 进度 | 20% | progress |
| 协作 | 10% | collaboration |
| 纪律 | 5% | discipline |

`总分 = round(completion*0.35 + quality*0.30 + progress*0.20 + collaboration*0.10 + discipline*0.05, 1)`，各维度 0~100。

### 6.3 数据模型
新建 `performance_scores` 表：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | SERIAL PK | |
| user_id | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | 成员 |
| period_year | INT NOT NULL | |
| period_month | INT NOT NULL | |
| monthly_tasks | TEXT | 月度任务项（AI 从本月周报实际完成生成） |
| work_hours | DECIMAL(8,1) | 工时统计（本月 time_entries hours 汇总） |
| score_explanation | TEXT | 得分说明（AI 给出） |
| completion | DECIMAL(5,1) | 完成度 0-100 |
| quality | DECIMAL(5,1) | 质量 |
| progress | DECIMAL(5,1) | 进度 |
| collaboration | DECIMAL(5,1) | 协作 |
| discipline | DECIMAL(5,1) | 纪律 |
| total_score | DECIMAL(5,1) | 总分（计算列） |
| used_external_ai | BOOLEAN DEFAULT FALSE | |
| generated_at | TIMESTAMPTZ | |
| created_at / updated_at | TIMESTAMPTZ | |

唯一约束：`(user_id, period_year, period_month)`。

### 6.4 AI 生成流程
- 管理员点「生成绩效」→ `POST /api/performance/generate` `{ year, month, userId? }`（不传 userId 则全员）。
- 对每个成员：
  1. 汇总本月各周 `weekly_reports.actual_completed` 与 `time_entries.hours`（工时统计）。
  2. 调 `callAIJson` 生成 `{ monthlyTasks, scoreExplanation, completion, quality, progress, collaboration, discipline }`（prompt 注明各维度定义与满分 100，要求 JSON）。
  3. **兜底**（`fallbackFactory`）：AI 不通时，`completion` 按周报计划完成率估算、`quality/progress` 取中位 80、`collaboration` 由 `coordination_matters` 是否为空判断、`discipline` 按日报缺勤天数估；`monthly_tasks` 直接拼接周报 `actual_completed`；`score_explanation` 写「规则兜底估算」。
  4. 后端按权重计算 `total_score`（不信任 AI 给的总分，统一后端算）。
  5. upsert 落库。
- `monthly_tasks` 是「实际完成的工作」，与需求一致。

### 6.5 列表字段
`成员、月度任务项、工时统计、得分说明、完成度、质量、进度、协作、纪律、总分`。

### 6.6 页面
- `/performance`（admin 专属，已在 sidebar adminItems）：年月选择 + 成员筛选 + 「生成绩效」按钮；表格按字段列；总分高亮。
- `/my-performance`（普通用户，已在 navItems）：本人当月绩效只读 + 历史月份切换。

### 6.7 API
- `GET /api/performance?year=&month=&userId=` 列表（admin 全员/本人）
- `POST /api/performance/generate` `{ year, month, userId? }` 生成（admin）
- `GET /api/performance/:id`

---

## 7. 落库与初始化策略
- 新表（`report_templates`、`monthly_goals`、`weekly_reports`、`performance_scores`）DDL 集中写入 `src/lib/ai-init.ts` 的 `ensureAITables()`，并在启动/首次访问对应 API 时调用（沿用 work_summaries 模式）。
- 同时在 `scripts/init-database.sql` 补充这四张表的 DDL，便于一次性初始化。
- 内置默认模板在 `ensureAITables()` 内 `INSERT ... ON CONFLICT DO NOTHING` 灌入。

## 8. 鉴权与可见性（沿用现有）
- 普通用户：仅本人 monthly-goals / weekly-reports / my-performance；不能访问 `/performance`。
- `admin`：全员视图 + 生成绩效；`pm` 同普通用户（本期不扩展 PM 跨项目视图）。
- `username='admin'` 不参与目标/绩效分配（沿用项目约束）。

## 9. 兜底与稳定性总览
| 功能 | AI 不通时兜底 |
|---|---|
| 模板总结 | `callAIJson` fallbackFactory 按字段从日报字段规则填充 |
| 周报实际完成 | 拼接 `completed_work`；未完成原因/输出产物关键字提取 |
| 绩效评分 | 规则估算五维 + 后端统一加权；任务项拼接周报实际完成 |

所有 AI 调用均经 `callAIJson`，外部/内置/兜底三种状态均返回可用结果，前端 toast 明示来源。

## 10. 交付清单（实现阶段）
1. `src/lib/ai-init.ts`：新增四表 DDL + 默认模板 + `ensureAITables` 扩展；`scripts/init-database.sql` 同步。
2. API 路由：
   - `/api/report-templates/*`
   - `/api/monthly-goals/*`
   - `/api/weekly-reports/*`（含 `/generate`、`/init`）
   - `/api/performance/*`（含 `/generate`）
   - work-summary `POST` 增加 `templateId` 支持
3. AI service：新增 `generateWeeklyReport`、`generatePerformanceScore`、`generateTemplatedSummary`（复用 `callAIJson` + fallbackFactory）。
4. 页面：
   - `/monthly-goals`
   - `/weekly-reports`
   - `/performance`（admin）
   - `/my-performance`（普通用户）
   - work-summary 页接入模板选择 + 模板管理抽屉
5. sidebar 已就绪，无需改（仅确认链接可用）。

## 11. 不在本期范围
- PM 跨项目聚合视图、绩效导出 PDF、周报邮件推送、模板字段依赖联动、历史周报补录回填——后续迭代。
