# 工作跟踪系统 - 四模块（模板/月度目标/周报/绩效）实现任务清单

> 依赖顺序：**T0 基建 → T1 月度目标 → T2 周报 → T3 绩效** 为业务数据主链；**T-Templates** 独立但需在「AI 服务能力增强」T0.3 之后实现。

---

## Task 0：基建 - 数据库建表 / 统一建表入口 / 侧边栏导航
- **Status**: `pending`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 0.1 新增 `src/lib/perf-init.ts`，统一管理新增表的 DDL：`summary_templates`、`summary_template_fields`、`monthly_goals`、`weekly_reports`、`performance_reviews`、`notification_logs`，以及在 `users` 表增量增加 `wecom_webhook VARCHAR NULL`、`phone VARCHAR NULL` 两列（若不存在）。每表使用 `CREATE TABLE IF NOT EXISTS` + 必要 UNIQUE/INDEX；所有新增 POST API 入口先调用 `ensurePerfTables()`。
  - 0.2 `work_summaries` 增量 DDL：`ALTER TABLE work_summaries ADD COLUMN IF NOT EXISTS template_id INT NULL REFERENCES summary_templates(id)`，封装进 `ensurePerfTables`。
  - 0.3 扩展 `ai-service.ts`：新增 `callAIJson<T>(messages, schema)` 封装，自动尝试 JSON.parse，失败时按 `## 字段名` 回退解析为对象；统一 15s 超时（AbortController）。
  - 0.4 `src/components/sidebar.tsx`：
    - 员工导航新增 3 条：「月度目标」(/monthly-goals, Target)「周报汇总」(/weekly-reports, CalendarCheck)「我的绩效」(/my-performance, TrendingUp)。
    - 管理员在员工 3 条上再加「绩效评分」(/performance, Award)。
  - 0.5 系统配置页内新增 Tab 支持：新建 `src/app/(dashboard)/settings/components/templates-tab.tsx` 与 `src/app/(dashboard)/settings/components/notifications-tab.tsx`；settings 主页改造为 Tabs（原配置项归为"通用"Tab + 模板管理 + 通知通道）。
- **Acceptance Criteria Addressed**: AC-T1、AC-NAV1、NFR-1
- **Test Requirements**:
  - `rule` TR-0.1: `SELECT to_regclass(...)` 检查 6 表均存在；`work_summaries.template_id` 列存在；`users.phone` 列存在。证据：SQL 查询。
  - `rule` TR-0.2: 员工/管理员登录后侧边栏截图分别为 3 条 / 4 条，模板配置 Tab 只在管理员系统配置页显示。证据：UI 截图 × 3。
  - `rule` TR-0.3: `callAIJson` 在 AI 未配置时返回对象（T 结构）无 500 抛错。证据：API 响应日志。
- **Notes**: DDL 执行方式沿用 `ai-init.ts`：`pg.Client` + `process.env.DATABASE_URL`（失败回退 Supabase PG 直连）。空串 → NULL 由 API 层保证。

---

## Task T-Templates：模板配置 CRUD + 默认模板 + 系统配置 Tab 集成
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 0
- **Description**:
  - T-T.1 API：`/api/templates` [GET/POST] + `/api/templates/[id]` [PUT/DELETE]。写入前字段名非空/重名校验；删除默认模板被拒绝；设置默认模板时自动把其他模板 `is_default=false`。
  - T-T.2 在系统配置页内新增 Tab「模板管理」，包含：模板列表（CRUD）、默认模板单选、字段管理弹窗（字段名/类型/说明/拖拽排序）。
  - T-T.3 首次 `ensurePerfTables` 时插入需求中的"标准周报模板"作为默认模板（5 字段：本周计划/实际完成/未完成原因/下周计划/输出产物）。
- **Acceptance Criteria Addressed**: AC-T1、AC-UX1
- **Test Requirements**:
  - `rule` TR-T.1: `DELETE` 默认模板返回 400。
  - `rule` TR-T.2: `POST /api/templates` 字段重复名返回 400。
  - `rule` TR-T.3: 初始化后数据库只有 1 条默认模板且字段数=5。
  - `rubric` TR-T.4: 字段新增/删除/拖拽保存响应延迟；scale 1-5；锚点 1=卡顿/UI 跳变；3=基本可用；5=流畅无跳变。阈值 >= 4。证据：浏览器 performance 面板截图。

---

## Task T-1.1：月度目标 - 数据库 + API（CRUD + 权限 + 锁定）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 0
- **Description**:
  - T-1.1.1 API 路由创建：`/api/monthly-goals` [GET/POST]；`/api/monthly-goals/[id]` [PUT/DELETE]；`/api/monthly-goals/[id]/lock` [POST]（切换 locked 状态）。
  - T-1.1.2 权限：
    - GET：admin 可取全部；user 只能取自己。可按 `month=YYYY-MM` 过滤。
    - POST：仅 admin；`owner_id` 不可指向 `username='admin'`；月份必须是 `YYYY-MM-01` 类（API 层统一 `new Date(yy,mm-1,1)` → 1 号 DATE）。
    - PUT：admin 可改任意字段（除锁定状态下不可改外）；user 对本人 unlocked 记录仅可改 `task_breakdown` / `planned_completion_date` / `acceptance_criteria` / `risk_points`。锁定记录任何人 PUT 失败 409。
    - DELETE：仅 admin。
  - T-1.1.3 空串 → NULL：所有日期列写入前做 `val === '' ? null : val`。
- **Acceptance Criteria Addressed**: AC-G1、AC-G2、NFR-1、NFR-2
- **Test Requirements**:
  - `rule` TR-1.1.1: 员工 A 登录 curl 修改自己的月度目标字段（非允许四字段）返回 403。
  - `rule` TR-1.1.2: 锁定后 admin/员工两次 PUT 均失败。
  - `rule` TR-1.1.3: `owner_id` 指向 admin 用户 → 400。
  - `rule` TR-1.1.4: `planned_completion_date` 为空串时，DB 中存 NULL。

---

## Task T-1.2：月度目标 - 页面 UI（管理员+员工）
- **Status**: `pending`
- **Priority**: high
- **Depends On**: T-1.1
- **Description**:
  - T-1.2.1 新建页面 `src/app/(dashboard)/monthly-goals/page.tsx`：顶部月份切换器 + 筛选（员工仅本人；管理员可按人）+ 新增按钮 + 表格 6 列 + 操作列。
  - T-1.2.2 新建/编辑弹窗：字段 placeholder 严格按需求文案（月度目标: 最重要的几个目标；预期产出: 代码、文档、版本；计划任务拆解: 根据目标自己拆解；验收标准: 什么叫完成；风险点: 哪里可能卡住）。
  - T-1.2.3 操作权限：员工隐藏锁定按钮、删除按钮；管理员显示"锁定/解锁/删除"。删除走 AlertDialog。
- **Acceptance Criteria Addressed**: AC-G1、AC-G2、AC-UX1、AC-UX2
- **Test Requirements**:
  - `rule` TR-1.2.1: 员工端 6 字段里 4 个字段可编辑（非灰），其余灰。
  - `rubric` TR-1.2.2: UI 一致性；同 AC-UX2。阈值 >= 4。
  - `rule` TR-1.2.3: 删除走 AlertDialog 二次确认。

---

## Task T-2.1：周报周边界计算 + `weekly_reports` API 基础
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 0
- **Description**:
  - T-2.1.1 在 `src/lib/week.ts`（新建）实现核心函数：`getMonthWeeks(year, month): Array<{index, start, end, belongsToMonth}>`，按 spec 规则计算。纯函数可写 test 用例（8 月 2026 示例）。
  - T-2.1.2 建 `weekly_reports` 表：`id, user_id INT, week_start DATE, plan_items JSONB, actual_completion TEXT, incomplete_reason TEXT, next_week_plan TEXT, output_deliverables TEXT, status VARCHAR('draft'|'submitted'), created_at, updated_at, UNIQUE(user_id, week_start)`。索引：`(user_id, week_start)`。
  - T-2.1.3 API：`/api/weekly-reports` [GET/POST]；`/api/weekly-reports/[week_start]` [GET/PUT]；`/api/weekly-reports/[week_start]/generate` [POST]（生成：联动 T-2.2 时再实现 AI 部分，本期此任务先返回 501 或空壳）。
  - T-2.1.4 权限：GET/POST/PUT 本人；管理员可按 `userId` 切换。
- **Acceptance Criteria Addressed**: AC-R1
- **Test Requirements**:
  - `rule` TR-2.1.1: 2026 年 8 月返回 5 条周：起始 8/3、8/10、8/17、8/24、8/31。
  - `rule` TR-2.1.2: 同 `(user_id, week_start)` 二次 INSERT 返回冲突（通过 UNIQUE 保证）。

---

## Task T-2.2：周报草稿自动创建 + 计划联动 + AI 生成
- **Status**: `pending`
- **Priority**: high
- **Depends On**: T-2.1, T-1.1（读取月度目标）
- **Description**:
  - T-2.2.1 `ensureWeeklyDraft(userId, weekStart)`：
    - 若属于当月第 1 周：查 `monthly_goals` 该用户当月所有记录，取 `id` 最小的 `goal` 文本，解析成 `plan_items = [{text:goal, done:false}]` 结构落库。
    - 否则：取上周周报 `next_week_plan`，按换行切分 → `plan_items = [{text:line, done:false}]`。上周没有则计划为空数组。
  - T-2.2.2 `POST /api/weekly-reports/[week_start]/generate` 实现：
    - 输入：user（自动）、week_start（推导区间）
    - 步骤：①按区间查 time_entries（completed_work/coordination/tomorrow_plan）→②调用 `callAIJson` 生成结构化 `{actual_completion, incomplete_reason, output_deliverables}` →③失败（配置/超时/解析异常）走内置规则：`completed_work` 按日期 + bullet 提取，并加前缀说明；④返回并把值更新进 weekly_reports。
    - 超时：HTTP 层设置外部 AI 10s。
  - T-2.2.3 "勾选已完成"：PUT 时允许修改 `plan_items` 的 done 字段；前端渲染时对 `done:true` 项加删除线。
- **Acceptance Criteria Addressed**: AC-R2、AC-R3、AC-R4、AC-T3
- **Test Requirements**:
  - `rule` TR-2.2.1: 员工当月有月度目标 A、B（id 顺序 A<B），8 月第 1 周草稿 → plan_items[0].text === A.goal。
  - `rule` TR-2.2.2: 上周 next_week_plan = "xxx\nyyy"，本周草稿创建后 plan_items 长度 2 且文本一致。
  - `rule` TR-2.2.3: AI 禁用后调用 generate 接口返回 HTTP 200 且 actual_completion 非空；响应体或日志包含 "内置规则" 指示。

---

## Task T-2.3：周报汇总页面 UI
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: T-2.2
- **Description**:
  - 新建 `src/app/(dashboard)/weekly-reports/page.tsx`。
  - 顶部：月份选择器 + 周列表选择器（显示"8 月第 1 周 (8/3-8/9)"）+ 创建草稿按钮（若当周无数据）+ 生成周报按钮。
  - 主体：表格展示"成员 / 本周计划（可勾选+列表） / 实际完成（Textarea 可编辑） / 未完成原因（Textarea） / 下周计划（Textarea） / 输出产物（Textarea）" + 保存/生成操作列。
  - 管理员可按成员筛选；员工仅本人。
- **Acceptance Criteria Addressed**: AC-R1、AC-R2、AC-R3、AC-R4、AC-UX2
- **Test Requirements**:
  - `rule` TR-2.3.1: 周选择器 8 月显示 5 项，起始日正确。
  - `rule` TR-2.3.2: 勾选本周计划后下次刷新保持 done 状态。
  - `rubric` TR-2.3.3: UI 一致性；同 AC-UX2。阈值 >= 4。

---

## Task N：通知通道 - 通知 API + 周报提醒按钮（FR-R5）
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: T-0（notification_logs 表 / users.phone 列 / 系统配置通知 Tab）
- **Description**:
  - N.1 新增 `src/lib/notification-service.ts`：封装 `sendWecom(webhook, content, mentionedMobiles?)` 与 `sendEmail(to, subject, html)`；两函数均实现失败不抛错而是返回 `{ok, error}`。
    - 企微：POST `webhook`，body `{msgtype:'text', text:{content, mentioned_mobile_list}}`；超时 8s。
    - 邮件：使用 `nodemailer`（新增依赖 `pnpm add nodemailer` + dev `@types/nodemailer`），从 system_configs 取 `smtp_host/smtp_port/smtp_user/smtp_pass/smtp_from`。
  - N.2 API：
    - `POST /api/notifications/send` 主体 `{channel, recipients:[{user_id, email?, phone?, name?}], templateKey?, payload?}`。内部按 `notification.channel` 系统配置覆盖默认值。每条结果写 `notification_logs (id, user_id?, channel, subject, content_excerpt, status, error_message, sent_at)`。
    - 管理员快捷接口：`POST /api/weekly-reports/[week_start]/remind`。内部：扫描未提交员工 → 拼装内容「本周周报未提交提醒：请尽快登录系统完成」→ 内部转调 `POST /api/notifications/send` → 返回 `{successCount, skippedCount, items[]}`。
  - N.3 周报页面管理员视图顶部按钮「提醒未提交」→ 调用 `remind` API → toast 展示计数；channel='none' 时警告。
  - N.4 系统配置页的「通知通道」Tab：字段：`notification.channel`(radio none/email/wecom)、SMTP 五项、`wecom_webhook_default`（URL）。保存走 `system_configs` 标准 upsert。
- **Acceptance Criteria Addressed**: AC-R5
- **Test Requirements**:
  - `rule` TR-N.1: `channel='none'` 时调用 remind，DB `notification_logs` 行数 = 未提交员工数。
  - `rule` TR-N.2: `wecom_webhook_default` 填 `http://127.0.0.1:0/bad`（必然失败）时 API 返回 200 且 skippedCount > 0，items 含 reason。
  - `rule` TR-N.3: 员工调用 remind API → 403。

---

## Task T-3.1：绩效评分 - 数据库 + 草稿生成 API
- **Status**: `pending`
- **Priority**: high
- **Depends On**: T-2.2（生成绩效需读取周报实际完成）
- **Description**:
  - T-3.1.1 表 `performance_reviews`：
    ```
    id SERIAL PK
    user_id INT FK users
    month DATE          -- 统一存当月 1 号
    monthly_tasks TEXT
    total_hours DECIMAL(10,1)
    score_notes TEXT
    completion_score INT
    quality_score INT
    progress_score INT
    collaboration_score INT
    discipline_score INT
    total_score DECIMAL(4,1)
    status VARCHAR('draft'|'final') DEFAULT 'draft'
    locked_by INT NULL REFERENCES users(id)
    locked_at TIMESTAMPTZ NULL
    created_at, updated_at
    UNIQUE(user_id, month)
    ```
  - T-3.1.2 API：
    - `POST /api/performance/generate` { month }：为所有 active 员工生成或覆盖草稿。调用以下计算：
      1. 工时统计：`SUM(time_entries.hours)` 按 user_id + 当月；
      2. 月度任务项：读取所有 weekly_reports.actual_completion（该用户当月）→ `callAIJson` 去重合并；兜底直接拼接前 1~3 句 + 前缀「★ 人工核对」；
      3. 五维打分：`callAIJson`（输入：目标、周报、未完成原因、工时、纪律默认=100）→ 解析 JSON `{completion, quality, progress, collaboration, discipline, notes}`；兜底赋值 75/70/70/80/100 + notes 写明"AI 未接通，使用默认值"。
      4. 总分 = Σ（*权重），ROUND 1 位小数。
    - `GET /api/performance`：按 month 筛选；员工只取本人 final。
    - `PUT /api/performance/[id]`：管理员可修改五维分、得分说明、月度任务。员工任何 PUT 被拒绝 403。
    - `POST /api/performance/[id]/lock`：管理员设置 status=final 写 locked_by/locked_at；草稿员工不可见。
- **Acceptance Criteria Addressed**: AC-P1、AC-P2、AC-P3、AC-P4、AC-T3
- **Test Requirements**:
  - `rule` TR-3.1.1: 5 维分（80,85,70,90,100）→ 总分 = 81.5。
  - `rule` TR-3.1.2: 员工 A 通过 curl `PUT /api/performance/:id` → 403。
  - `rule` TR-3.1.3: 未配置 AI 时 score_notes 包含「AI 未接通」且 discipline = 100。
  - `rule` TR-3.1.4: total_hours 与 `SELECT sum(hours) from time_entries where user_id=? and date_trunc('month',work_date)=?` 一致。

---

## Task T-3.2：绩效评分 - 管理员页 + 员工独立「我的绩效」页
- **Status**: `pending`
- **Priority**: high
- **Depends On**: T-3.1
- **Description**:
  - T-3.2.1 新建 `src/app/(dashboard)/performance/page.tsx`（管理员侧；用 `useAuth` 判断 role!=='admin' 时 307 重定向到 /my-performance，避免员工误进入）。
    - 顶部：月份选择器、「生成本月绩效」按钮、搜索（按姓名/用户名）。
    - 表格：成员、月度任务项（点击展开长文本）、工时统计（只读）、得分说明（可编辑）、五维分（number 0-100，实时计算总分列）、总分（自动只读）、状态（draft/final）、操作（保存/锁定/解锁）。
    - 锁定前置校验：五维 0~100 整数；0≤总分≤100；否则按钮 disabled 并 toast 提示。
  - T-3.2.2 新建员工独立页 `src/app/(dashboard)/my-performance/page.tsx`（所有登录用户可进入）：
    - 顶部月份选择器（默认当月）。
    - 表格列：月份、月度任务项（展开）、工时统计、得分说明、完成度/质量/进度/协作/纪律/总分、状态。
    - GET API 仅返回本人 status=final 的绩效记录（草稿一律过滤掉）。页面内无任何编辑入口。
- **Acceptance Criteria Addressed**: AC-P1、AC-P2、AC-UX1、AC-UX2
- **Test Requirements**:
  - `rule` TR-3.2.1: 五维输入后前端实时计算总分 = 值×权重合计（与后端同一值）。
  - `rule` TR-3.2.2: 员工账号访问 /performance → 被 307 重定向到 /my-performance；/my-performance 列表仅见 final 记录。
  - `rubric` TR-3.2.3: UI 一致性；阈值 >= 4。

---

## Task WT：Work-summary 接入模板输出（复用现有流程）
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: T-Templates、Task 0.3
- **Description**:
  - WT.1 修改 `src/app/api/ai/work-summary/route.ts` POST：
    - 接收 `template_id?` 字段；如非空：
      1. 从 DB 读取模板字段列表；
      2. 在 `callAIJson` 的 system 消息中加入"请严格按如下 JSON 字段输出：{字段名数组}"；
      3. 返回结构化 JSON；
      4. 保存 summary_content 时，把 JSON 转为"## 字段名\n内容\n\n## 字段名\n内容\n" Markdown 分节格式（便于人阅读 + 兼容旧 summary_content TEXT）；
      5. 同时写入 `template_id`。
    - 未提供 template_id 时完全保持旧逻辑（回归兼容）。
  - WT.2 修改 `src/app/(dashboard)/work-summary/page.tsx`：
    - 顶部筛选区新增 Switch "按模板输出" + 模板 Select（从 `/api/templates` 拉取）；开关打开时强制选模板。
    - 生成后渲染：如果 summary_content 模板化 → 用 `<h3>`/卡片分节；否则原大段文本。
    - List 表格里增加一列："是否按模板"（template_id 非空 显示模板名）。
- **Acceptance Criteria Addressed**: AC-T2、AC-T3
- **Test Requirements**:
  - `rule` TR-WT.1: 生成时请求带 template_id → 响应 summary_content 首行为 `## 本周计划` 等标题；DB `template_id IS NOT NULL`。
  - `rule` TR-WT.2: 请求不带 template_id → summary_content 格式与旧实现一致；DB `template_id IS NULL`。
  - `rule` TR-WT.3: AI 禁用 + 选择模板 → 接口返回 2xx，分节内容仍存在（每个字段为空或由日报原始 bullet 拼接）。

---

## Task I：集成校验 + 文档 + 遗留清理
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: WT, T-1.2, T-2.3, T-3.2, Task N
- **Description**:
  - I.1 删除 `batch-entry-dialog.tsx` 的遗留引用（已于上一轮工时任务完成；本次再全局 grep 确保没有 showBatch/dayDetail/等旧变量残留）。
  - I.2 四模块页面的 metadata: 在各 `page.tsx` 顶部 `export const metadata = {title, description}`。
  - I.3 手动冒烟：走通"管理员新建 2 条月度目标→员工补全→员工创建 8 月第 1 周周报→生成周报→管理员生成绩效→锁定→员工看个人绩效"全链路。
  - I.4 更新 `.env.example` 注释（若新增无密码密钥无需新增），但需把 `ENABLE_AI_FEATURES=false` 场景备注在 README 无需（本 PRD 要求勿建文档，默认不建）。
- **Acceptance Criteria Addressed**: AC-SEC1、AC-UX2
- **Test Requirements**:
  - `rule` TR-I.1: 全部 4 个新增模块 API 在未登录状态下返回 401。
  - `rule` TR-I.2: 员工访问他人月度目标/他人周报 PUT 均返回 403。
  - `rubric` TR-I.3: 全链路冒烟体验（从月度目标→绩效）；维度：端到端顺畅度，scale 1-5，1=多处报错，3=需补操作但能跑完，5=无感顺畅。阈值 >= 4。
