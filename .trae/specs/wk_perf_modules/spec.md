# 工作跟踪系统 - 模板配置 / 月度目标 / 周报汇总 / 绩效评分 — 产品需求文档（PRD）

## Overview
- **Summary**：在现有工时日报与 AI 工作总结（`work_summaries`）基础上，新增四个关联模块：
  1. **模板配置**：允许在生成周期总结前选择自定义字段模板，指导 AI 按模板字段组织内容；
  2. **月度目标**：管理员指定负责人，员工完善月度目标条目、预期产出、任务拆解、验收标准、风险点；
  3. **周报汇总**：每周一行计划+实际完成+未完成原因+下周计划+输出产物，默认数据与月度目标、上周计划、本周日报 AI 自动生成联动；
  4. **绩效评分**：以月为维度为每位员工自动（AI 建议分+管理员审核锁定）产出任务项/工时/完成度/质量/进度/协作/纪律/总分。
- **Purpose**：把「工时填报 → 计划目标 → 周报核对 → 月末绩效」整条链路在系统内闭环，减少线下 Excel 汇总与人工数据搬运。
- **Target Users**：
  - 普通员工（user）：填报月度目标细节、填/改周报、查看绩效；
  - 管理员（admin）：创建月度目标并指定负责人、审核/覆盖绩效评分、查看全员周报与绩效汇总。

## Goals
1. 一条周期总结在"是否按模板输出"两种模式下均可生成并落库；模板字段由管理员配置。
2. 管理员可以为指定员工创建当月月度目标，员工登录后仅能完善自己的目标条目；目标记录包含需求规定的 6 个字段与提示文案。
3. 周报每周自动划分周边界（按 8 月首个工作日=第 1 周 的自然周切分法，且周起点按周一~周日），本周计划、上周计划联动、勾选完成、AI 生成实际完成具备兜底逻辑。
4. 月度绩效每月为每位在职员工生成一条可审核评分；评分按权重自动算出总分；AI 不可用时仍能手动打分并落库。
5. 所有新增数据均与现有 `users.id`、`time_entries` 工时数据打通，跨页面数据可追溯。

## Non-Goals
- 本期不做目标审批流（多级审批、抄送人、驳回重填等），由管理员直接覆盖完成审核锁定即可。
- 本期不做"项目维度绩效"或"跨部门对比图表"，仅产出员工个人月度绩效列表。
- 本期不做自定义权重配置，固定按需求要求权重：完成度 35%、质量 30%、进度 20%、协作 10%、纪律 5%。
- 本期不做 AI 自动调整权重或个性化模板评分。
- 本期不支持批量导入/导出 Excel 形式的目标或绩效（仅现有工时导出保留）。
- 本期不做短信、App Push 等额外推送通道；邮件与企业微信二选一（通过系统配置 `notification.channel` = `email` / `wecom` / `none`）。

## Background & Context
- **代码库骨架**：Next.js 16 (App Router) + React 19 + TypeScript 5 + shadcn/ui + Tailwind 4，数据库为 PostgreSQL（经 Supabase / DATABASE_URL 连接，DDL 使用 `pg.Client` 走 `ensureAITables` 模式自动建表），包管理仅允许 pnpm。
- **现有相关模块**：
  - 工时日报：`src/app/(dashboard)/time-entries/page.tsx` 与 `time_entries` 表（`user_id`, `project_id`, `work_date`, `hours`, `completed_work`, `tomorrow_plan` 等）。
  - AI 工作总结：`src/app/(dashboard)/work-summary/page.tsx` 调用 `POST /api/ai/work-summary`，内部通过 `ai-service.ts` 的 `callAI(messages, options)` 统一走"外部 AI → 失败则内置规则 fallback"。
  - AI 配置状态：`GET /api/ai/config-status` 返回 `enabled/provider/configComplete` 三态；`enabled=false` 或配置缺失时 `callAI` 自动走内置规则。
  - 侧边栏导航位于 `src/components/sidebar.tsx`，现有菜单 5 项（工作台/项目/工时/总结/分析）+ 管理员 2 项（用户/系统配置）。
  - 权限控制统一在 API 层通过 `getSessionUser` 判定 `role === 'admin'` 时才能跨用户查看/写入。
- **已确认的用户澄清**：
  1. 四模块本期全部落地（不切 MVP）。
  2. 模板能力复用现有 AI 工作总结流程，不新建独立页面。
  3. 周边界沿用工时日报的"周一~周日"。
  4. 绩效：AI 只是建议分，管理员审核后锁定，员工仅能查看。
  5. 月度目标：管理员先创建并指定负责人，负责人补全其他 5 项。
  6. 工时统计字段直接从 `time_entries` 按 user+month 聚合，不手动填。

## Functional Requirements

### FR-T1：模板配置（管理员）
- 管理员进入"系统配置 → 模板管理"子 tab，可查看模板列表、新建/编辑/删除模板（至少保留一个默认模板不可删）。
- 模板字段：
  - 模板名（如"标准周报模板"、"项目交付模板"），适用维度（week / month / both / custom），是否为默认模板。
  - 自定义字段列表：字段名 + 类型（短文本/长文本） + 字段说明 + 顺序。例如需求举例：「本周计划」「实际完成」「未完成原因」「下周计划」「输出产物」。
- 默认模板自带需求所述 5 个字段（用户可在其上增删）。
- 新建保存字段名不可为空、同一模板内不可重名。

### FR-T2：按模板生成 AI 周期总结（员工/管理员均可）
- 现有 `work-summary` 页面：
  - 新增一个"按模板输出"开关（默认关）与一个"模板"下拉。开关关闭时走旧逻辑；开关打开时必须选择模板。
  - 用户点击生成时在请求体附带 `template_id`，AI 服务按模板字段输出**结构化内容**（JSON 或分节 Markdown，详见下方数据结构）。
  - 列表展示时结构化内容按字段分节渲染，不再只有大段文本。
- AI 兜底：
  - 外部 AI 未配置、请求失败或超时，使用内置规则生成与模板字段同结构的占位内容（字段名+从日报提取的 bullet 聚合），并在 UI 提示「AI 未接通，已使用内置规则生成」。
- 存储：生成的结构化内容仍写入 `work_summaries.summary_content`，同时新增列 `template_id`（可空），以便列表识别"是否按模板输出"。

### FR-G1：月度目标 - 创建入口与负责人指定（管理员）
- 新增页面 `/(dashboard)/monthly-goals`：管理员可见"新增目标"按钮；普通用户无此按钮。
- 新建弹窗字段：
  - 负责人：下拉所有用户（不含 `username='admin'`，与项目选择规范一致），**必填**，管理员可多次为同一人在同一月份创建多条目标（每个目标一条，对应"最重要的几个目标"提示）。
  - 月份：日期选择器（默认当前月），仅允许精确到月，保存后不可改。
  - 月度目标：长文本，提示文案「最重要的几个目标」，**管理员必填**。
  - 预期产出：长文本，提示文案「代码、文档、版本」，**管理员必填**。
  - 计划任务拆解：长文本，提示文案「根据目标自己拆解」，管理员可留空，由员工后续补全。
  - 计划完成时间：`YYYY-MM-DD`，管理员可留空，由员工补全。
  - 验收标准：长文本，提示文案「什么叫完成」，管理员可留空，由员工补全。
  - 风险点：长文本，提示文案「哪里可能卡住」，管理员可留空，由员工补全。

### FR-G2：月度目标 - 员工补全与管理员维护
- 员工打开月度目标页面，默认筛选本人当月（或可切到历史月）。列表展示需求规定 6 个字段。
- 权限矩阵：
  - 管理员：可编辑任意目标任意字段；可删除任意目标；可锁定"已完成"状态（锁定后任何人不可改）。
  - 普通员工：对自己的、管理员未锁定的目标可编辑 计划任务拆解/计划完成时间/验收标准/风险点 四个字段（月度目标、预期产出、月份、负责人仅读）；对他人目标不可见。
- 删除使用统一的 shadcn `AlertDialog` 二次确认。

### FR-R1：周报自动周边界与列表
- 新增页面 `/(dashboard)/weekly-reports`。
- 周报周边界（按需求所述"每月周报自动划分，比如 8 月第一个工作日开始于 8 月 3 日，8 月第一周就是 8.3~8.7"）计算规则：
  > 以**自然月**为单位，把当月所有天按"周一~周日"切成若干段；任一周如果**与当月交集 ≥ 1 天**，就视为该月的一个周报周。周报周的显示名称形如"2026 年 8 月第 1 周"、"第 2 周"……当月第 N 周编号按该周周一在当月的先后排序。
  - 如果周的第 1 天恰好是工作日（周一~周五），与"首个工作日"语义兼容；边界本身不依赖假期表，一律按周一~周日。
- 列表字段：成员、本周计划、实际完成、未完成原因、下周计划、输出产物。每一行代表 **(用户, 周报周)** 的唯一记录。UNIQUE 约束 `(user_id, week_start_date)`。
- 管理员可看全公司并按月份切换；员工只看本人。

### FR-R2：本周计划联动与勾选完成
- 每月第 1 周：该行若尚未生成，用户点击"创建本周周报"或访问当周且无数据时，自动插入一条草稿：
  - 本周计划 默认值 = 该用户当月所有未锁定 `monthly_goals` 记录中的第一条的「月度目标」文本原样拷贝（支持多行）。用户可继续手动添加。
- 每月第 2 周起：若上周存在周报记录，本周计划 = 上周的「下周计划」原样拷贝。上周没有则置空。
- 本周计划支持勾选已完成：每条计划前有 checkbox，勾选后该行文字增加删除线样式。勾选状态保存于行内 JSON 数组（`plan_items: [{text, done}]`），与"纯文本计划"二选一（优先结构化结构；纯文本也可解析回 JSON）。

### FR-R3：实际完成 AI 自动生成 + 兜底
- 行内按钮「生成周报」：点击后调用 `POST /api/weekly-reports/:week_start/generate`。
- 服务端逻辑：按本周工作日期区间查 `time_entries` 中该用户的 completed_work/tomorrow_plan/coordination_matters，传入 AI 生成：
  - 实际完成 = AI 从 completed_work 中提炼要点；
  - 未完成原因 = AI 从"完成度低于本周计划"的差异推断（内置规则先匹配：计划勾选完成度、工时低于 32h/月等）；
  - 输出产物 = AI 从 completed_work 中提取名词（文档、版本号、交付物关键词）。
- **兜底**：
  - AI 配置不可用或接口超时 10s：内置规则从 completed_work 按日期前缀生成 bullet 列表；未完成原因固定"未能从 AI 获取，请手动补充"；输出产物留空。前端提示 toast「AI 不可用，已使用内置规则汇总，请核对」。
  - 当周无日报数据：返回 404 并在 UI 提示「本周无日报数据，无法自动生成」。

### FR-R4：下周计划手动填写与跨月边界
- 下周计划字段允许员工任意填写长文本。保存后，下周周报创建时联动（FR-R2）。
- 跨月边界：例如 2026.8 最后一周有部分日期落入 9 月，该周编号归属按"该周周一所在月"计入。当用户在 9 月第 1 周继续联动时，仍可读取上周（8 月最后一周）的"下周计划"。

### FR-R5：管理员一键提醒未提交周报
- 在周报汇总页（管理员视图）顶部新增按钮「提醒未提交」。
- 点击后：
  1. 在选定月份 + 选定周内扫描所有 `users.status='active'` 员工；
  2. 如果该员工本周周报不存在或状态仍为 draft（未提交），则列入"待提醒名单"；
  3. 调用 `POST /api/notifications/send`（本需求新增）：读取 `system_configs` 中的 `notification.channel`（取值 `email` / `wecom` / `none`），根据配置对应：
     - `email`：走系统配置的 SMTP（若未配置则降级为失败提示）；
     - `wecom`：向用户表 `wecom_webhook`（若无该字段则采用 `system_configs.wecom_webhook_default` 并 @ 指定成员）发送机器人消息；
     - `none`：仅把"待提醒名单"存入一张 `notification_logs`（供前端展示"已模拟提醒，未启用推送通道"）。
  4. 返回 JSON：`{successCount, skippedCount, channel, items:[{user_id, email, reason}]}`。
- 前端 toast 展示成功/跳过数；未配置任何通道时弹出警告告知管理员"未启用邮件/企微，仅已记录提醒名单"。

### FR-P1：绩效评分 - 列表与自动生成入口
- **管理员页面** `/(dashboard)/performance`：入口仅管理员侧边栏可见。
  - 列表列：成员、月度任务项、工时统计、得分说明、完成度、质量、进度、协作、纪律、总分。按月份 + 部门（员工直接平铺即可，管理员可切换月份）筛选。
  - 按钮「生成本月绩效」：管理员点击后按月份对所有 `users.status='active'` 员工各创建/覆盖一条草稿（UNIQUE `user_id + month`）。
- **员工独立页面** `/(dashboard)/my-performance`（侧边栏新增，所有登录用户可见）：
  - 仅展示本人 `status=final` 的绩效（草稿不可见），按月份倒序；
  - 支持月份切换；不提供任何编辑能力。

### FR-P2：月度任务项（AI 提取本月实际完成）
- 「月度任务项」字段：在生成绩效草稿时，服务端读取该用户当月所有周报的「实际完成」，调用 AI 合并+去重，产出有序列表。
- 兜底：AI 不可用则直接拼接所有周报「实际完成」的前 1~3 句，带"★ 人工核对"前缀。

### FR-P3：权重评分公式与 AI 自动打分
- 五维权重合计 100：完成度 35%、质量 30%、进度 20%、协作 10%、纪律 5%。
- 每维度分值范围 0~100（整数），总分 = Σ（维度分 × 权重）。
- 自动打分调用 AI 时输入：该月目标条目、周报实际完成、未完成原因、本月工时合计（FR-P4）、本月请假/迟到数据（若系统无此表则纪律默认 100 并注明"无考勤数据"）。
- 兜底：AI 不可用则五维默认值分别为 75/70/70/80/100，并在「得分说明」注明"AI 未接通，使用默认值，请管理员复核"。

### FR-P4：工时统计与得分说明
- 工时统计 = 该员工当月 `time_entries.hours` 合计（自动填入，不可手动改）。
- 得分说明 = AI 打分返回的逐维理由 + 总分，允许管理员在覆盖评分后手动改写说明。

### FR-P5：审核锁定与员工可见
- 绩效草稿状态：`draft` / `final`；管理员可以「锁定」→ `final`。锁定后：
  - 管理员仍可解锁；
  - 普通员工在 `/(dashboard)/my-performance` 页面看到本人最终版；
  - 草稿状态员工不可见（在 my-performance 页面直接不展示该行）。
- 锁定前必须五维分均已填写 + 总分计算合法（0 ≤ total ≤ 100）。

### FR-NAV1：侧边栏导航入口
- 员工可见（3 项）：新增 — 「月度目标」(/monthly-goals)「周报汇总」(/weekly-reports)「我的绩效」(/my-performance)。
- 管理员可见（在员工 3 项之上再加 1 项）：「绩效评分」(/performance)。
- 模板配置入口：管理员在现有"系统配置"页面内新增 Tab。
- 图标：月度目标 Target、周报 Calendar Check、员工绩效 TrendingUp（或 BarChart 复用）、管理员绩效 Award（lucide-react 提供）。

## Non-Functional Requirements
- **NFR-1（一致性）**：所有日期字段保存到 PostgreSQL 必须使用 `DATE` 类型或 `YYYY-MM-DD` 字符串（禁止空串，与项目创建接口保持一致：空串 → NULL 转换）。
- **NFR-2（权限严格）**：除管理员外的 API 调用如果尝试读/写他人数据，必须返回 403。
- **NFR-3（AI 鲁棒性）**：所有调用 AI 的接口必须在 15s 内返回兜底结果（请求超时、网络错误、配置缺失均有内置规则），禁止把 AI 失败透传到 UI 造成空白或 500。
- **NFR-4（可维护性）**：新建 API 遵循 `src/app/api/<模块>/route.ts` RESTful 风格；页面遵循 App Router 目录约定 `src/app/(dashboard)/<页面>/page.tsx`。
- **NFR-5（可访问性）**：删除确认使用 shadcn AlertDialog，禁止原生 `window.confirm`。
- **NFR-6（Hydration）**：前端一律按 `'use client' + useEffect + useState` 处理动态日期/统计数据，不得直接在 render 内用 `Date.now()`。
- **NFR-7（Hydration II）**：不允许在页面里手写 `<head>`；标题/描述统一用 Next.js metadata API。

## Constraints
- **技术**：
  - 必须使用项目规定技术栈：Next.js 16 App Router + React 19 + TypeScript 5 + shadcn/ui + Tailwind 4。
  - 包管理：**仅允许 pnpm**。
  - 数据库：PostgreSQL（通过 `getSupabaseClient` 读写），建表走 `ai-init.ts` 同款 `pg.Client` + `ensureXxxTables()` 模式。
  - 日期路径不得硬编码绝对路径，使用 `path.resolve(__dirname, …)` / `process.cwd()` / `import.meta.dirname`。
- **业务**：
  - 周起点**必须**周一~周日，与工时周报、AI work-summary 的 `week` 维度对齐。
  - 绩效权重本期**必须**固定为 35/30/20/10/5。
  - 用户 `username='admin'` 不能作为月度目标负责人（沿用 projects 规则）。
- **依赖**：
  - `ai-service.ts` 已实现外部 AI + 内置规则 fallback；本需求新增 AI 调用必须走统一 `callAI(messages, { temperature, maxTokens })`。
  - `time_entries.hours` 按 DECIMAL 存；聚合时统一 `parseFloat(e.hours)` 并四舍五入到小数点后 1 位。

## Assumptions
- 系统当前无请假/迟到/打卡表，绩效-纪律维度默认 100 分，得分说明注明"无考勤数据，纪律按全勤计算"。后续扩展考勤模块时可再对接。
- 一个用户一个月允许多条月度目标（对应"最重要的几个目标"），月度绩效合并统计。
- 需求未指定多负责人，月度目标每条**只有一个负责人**（`owner_id INT REFERENCES users`）。如需多人则通过创建多条目解决。
- 结构化模板输出采用"Markdown 分级标题"存储（即仍然塞进 `summary_content` 的 TEXT 列），同时新增列 `template_id INT NULL` 便于识别；不改原表 schema 主结构，兼容旧数据。
- 邮件 SMTP / 企业微信 Webhook 配置未完备时，FR-R5 会自动降级为"仅记录通知日志，不实际发送"，管理员可在系统配置页完成参数后重新启用。默认 `notification.channel = 'none'`。
- 若 `users` 表暂缺 `wecom_webhook` 列，FR-R5 采用系统级 `wecom_webhook_default` + `mentioned_mobile_list`（从 users 表读取手机号；若无则 @all）作为企微侧兜底；后续可再细化。

## Acceptance Criteria

### AC-T1：管理员能创建模板并设置默认模板
- **Type**: `rule`
- **Given**: 管理员登录；在系统配置 → 模板管理页面；模板列表至少存在默认模板
- **When**: 管理员点"新建模板"，填写模板名 + 适用维度 + 5 个字段（本周计划、实际完成、未完成原因、下周计划、输出产物）并保存；再点"设为默认"
- **Then**: 模板列表新出现一条记录，适用维度与字段名正确，且默认标记只存在一个
- **Pass Condition**: 通过 API 拉模板列表能读到新模板，且只有一条 `is_default=true`
- **Evidence**: GET `/api/templates` 返回 JSON 校验

### AC-T2：work-summary 页面开启"按模板输出"后能生成结构化内容并落库
- **Type**: `rule`
- **Given**: 选中任意一个已存在模板；开关"按模板输出"打开；当前周期有日报
- **When**: 点击"生成总结"
- **Then**: 生成内容中每个模板字段名均作为小标题出现；`work_summaries.template_id` 保存对应模板 ID
- **Pass Condition**: UI 渲染能看到分节标题 + `SELECT template_id FROM work_summaries` 非空
- **Evidence**: 页面渲染 + 数据库查询截图

### AC-T3：AI 失败时生成总结有兜底且不报错
- **Type**: `rule`
- **Given**: AI 配置 `enable_ai_features=false` 或 endpoint 指向一个 500/超时地址
- **When**: 触发任意"生成总结 / 生成周报 / 生成绩效"操作
- **Then**: 返回 HTTP 200，产出内置规则结果，UI toast 提示「已使用内置规则」
- **Pass Condition**: 响应体非空 + 对应 `used_external_ai=false`（或等价字段）/ 得分说明含"AI 未接通"
- **Evidence**: 请求抓包 + UI 截图

### AC-G1：管理员创建月度目标指定 owner（非 admin）成功，员工登录后能看到并补全任务拆解等字段
- **Type**: `rule`
- **Given**: 管理员已创建当月月度目标，指定 owner=员工A，仅填了月度目标/预期产出；员工 A 登录
- **When**: 员工 A 访问月度目标页面并编辑「计划任务拆解、计划完成时间、验收标准、风险点」保存
- **Then**: 管理员刷新后能看到员工 A 填入的 4 项内容；员工 A 无法改"月度目标、预期产出、负责人、月份"；管理员也无法指定 owner=admin
- **Pass Condition**: API 拒绝 `owner_id` 指向 `username='admin'`；员工 A PUT 请求若只改 4 项外字段返回 403
- **Evidence**: 管理员/员工双端截图 + curl 403 结果

### AC-G2：锁定后的月度目标任何人不可改
- **Type**: `rule`
- **Given**: 管理员将某目标 status=locked
- **When**: 管理员/员工再次尝试修改其中任意字段
- **Then**: 修改被拒绝，返回错误"已锁定，无法修改"
- **Pass Condition**: PUT 返回 409/403 且 DB 内容未变
- **Evidence**: API 响应日志 + DB 快照

### AC-R1：每月周报周边界计算符合"月内周编号"规则
- **Type**: `rule`
- **Given**: 2026 年 8 月（8/1 为周三，首个工作日 8/1，首个周一 8/3）
- **When**: 访问 8 月份周报列表
- **Then**: 出现 5 行周编号：第 1 周 = 8/3~8/9、第 2 周 = 8/10~8/16、第 3 周 = 8/17~8/23、第 4 周 = 8/24~8/30、第 5 周 = 8/31~9/6（属于 8 月，编号"8 月第 5 周"）
- **Pass Condition**: `week_start_date` 与编号在 `monthly_weekly_weeks` 视图/计算函数里符合上述
- **Evidence**: 页面周选择器 + 数据库查某员工 8 月行数

### AC-R2：每月第 1 周本周计划默认等于当月第一条月度目标
- **Type**: `rule`
- **Given**: 员工 A 当月有 2 条月度目标（创建时间不同）；第 1 周周报不存在
- **When**: 员工 A 创建第 1 周周报
- **Then**: 自动生成草稿，本周计划 = 员工 A 当月 `monthly_goals` 中 id 最小的那条 `goal` 字段全文
- **Pass Condition**: 保存后 `weekly_reports.plan_items` 文本一致
- **Evidence**: 页面截图 + DB 对照

### AC-R3：非第 1 周本周计划 = 上周下周计划
- **Type**: `rule`
- **Given**: 上周周报存在且下周计划 = "完成 API 联调"；本周周报不存在
- **When**: 创建本周周报
- **Then**: 本周计划 = "完成 API 联调"
- **Pass Condition**: 文本一致
- **Evidence**: 前后两周 UI 对照

### AC-R4：点击"生成周报"在 AI 不可用时仍产生实际完成内容
- **Type**: `rule`
- **Given**: AI 未配置；本周该员工有 ≥3 条日报
- **When**: 点击"生成周报"
- **Then**: 实际完成字段填充 3 条以上 bullet；toast 显示「AI 不可用，已使用内置规则汇总」
- **Pass Condition**: 实际完成非空 + toast 出现
- **Evidence**: UI 操作录屏或两张截图

### AC-P1：绩效 5 维评分公式正确
- **Type**: `rule`
- **Given**: 某草稿分数：完成度=80、质量=85、进度=70、协作=90、纪律=100
- **When**: 保存后计算总分
- **Then**: 总分 = 80×0.35 + 85×0.30 + 70×0.20 + 90×0.10 + 100×0.05 = 28 + 25.5 + 14 + 9 + 5 = 81.5
- **Pass Condition**: UI 显示 81.5（或四舍五入 82，须与文档一致，本 PRD 规定保留 1 位小数）
- **Evidence**: 浏览器控制台或保存后 DB 值

### AC-P2：管理员锁定绩效后员工不可见草稿，仅可见最终
- **Type**: `rule`
- **Given**: 管理员把员工 A 8 月绩效从 draft 点锁定 → final；员工 A 登录
- **When**: 员工 A 访问 `/(dashboard)/my-performance`
- **Then**: 员工 A 只能看到 8 月 final 的那条；其他 draft / 其他月份没有的完全看不到；访问 /performance 页面被 307 重定向到 /my-performance；任何 PUT 由员工发起返回 403
- **Pass Condition**: 员工端 API 返回仅 final 记录；访问 /my-performance 命中本人 final 列表；curl PUT 返回 403；员工访问 /performance（管理员页）被跳转
- **Evidence**: 员工端截图 + API 权限 curl + 重定向抓包

### AC-P3：工时统计字段来源于当月 time_entries 合计
- **Type**: `rule`
- **Given**: 员工 A 当月工时汇总 SQL 结果 = 123.5
- **When**: 管理员点击「生成本月绩效」
- **Then**: 绩效行"工时统计" = 123.5h；UI 不可手动编辑（只读）
- **Pass Condition**: DB 中 `performance_reviews.total_hours` 与 SQL 合计相等
- **Evidence**: SQL 对比结果

### AC-P4：月度任务项来源于当月周报实际完成（或兜底）
- **Type**: `rule`
- **Given**: 员工 A 当月 4 周周报均已写「实际完成」
- **When**: 管理员生成绩效草稿
- **Then**: 「月度任务项」字段非空且包含 ≥4 条要点；AI 失败时字段有前缀「★ 人工核对」
- **Pass Condition**: 字段非空；或存在前缀字串
- **Evidence**: 生成绩效后页面字段文本

### AC-UX1：所有"删除"交互使用 AlertDialog
- **Type**: `rule`
- **Given**: 用户点击模板/月度目标/周报草稿的删除图标
- **When**: -
- **Then**: 出现 shadcn AlertDialog 二次确认；点击"取消"不执行动作
- **Pass Condition**: 三处删除都触发 AlertDialog 组件而非原生 confirm
- **Evidence**: 组件源码 + 交互截图

### AC-UX2：四模块 UI 与工时日报一致（配色/间距/按钮形状）
- **Type**: `rubric`
- **Dimension**: 界面一致性
- **Scale**: 1-5
- **Anchors**:
  1 = 明显不同配色 / 大量原生控件未走 shadcn；
  3 = 主色一致但间距/卡片/表格边框风格明显差异；
  5 = 主色 `#1e3a5f`、卡片圆角/边框/字号/表格行高/按钮尺寸与 time-entries 页面肉眼无法区分
- **Pass Threshold**: >= 4
- **Evidence**: 与 time-entries 页面对比截图（header、按钮、表格、表格行 hover 色、徽章）

### AC-R5：管理员点「提醒未提交」按配置通道发通知并返回成功/跳过数
- **Type**: `rule`
- **Given**: 当月该周有 2 员工已提交、2 员工未提交；system_configs 有 `notification.channel` 配置
- **When**: 管理员点「提醒未提交」
- **Then**:
  - 若 `channel='none'`：写 notification_logs，返回 `successCount=2 skippedCount=0 channel=none`；前端 toast 警告「未启用邮件/企微，仅已记录提醒名单」。
  - 若 `channel='wecom'` 且 `wecom_webhook_default` 已填：向对应 webhook 发 2 条（或 @2 人合并 1 条）消息；返回 successCount=2。失败则记录 skippedCount 并把失败原因写入 items。
  - 若 `channel='email'` 但 SMTP 未配置：API 返回 200，但 `items` 中每人 `reason='SMTP 未配置'`，前端 toast 提示。
- **Pass Condition**: 前端 toast 显示正确计数；`notification_logs` 有至少 2 条提醒日志（或更多对应未提交人数）
- **Evidence**: 前端 toast 截图 + notification_logs DB 行数

### AC-NAV1：侧边栏入口按角色正确展示
- **Type**: `rule`
- **Given**: 员工登录 / 管理员登录两种会话
- **When**: 渲染左侧侧边栏
- **Then**:
  - 员工侧：显示"月度目标""周报汇总""我的绩效"3 条（工时/总结/分析仍在）；不出现"绩效评分"。
  - 管理员侧：在员工 3 条之上再出现"绩效评分"（/performance）。
  - 模板配置：管理员的系统配置页有模板管理 Tab，员工的系统配置页无该 Tab。
- **Pass Condition**: 两种账户的 UI 截图比对 + 超链接路径正确。
- **Evidence**: 两张 UI 截图

### AC-SEC1：4 个 API 模块均校验 session user
- **Type**: `rule`
- **Given**: 无有效 `SESSION` cookie 调用任一新增 API
- **When**: -
- **Then**: 全部返回 401；未授权且非管理员操作他人数据返回 403
- **Pass Condition**: 至少 1 条 401 + 1 条 403 的 curl 响应
- **Evidence**: curl 命令输出

## Open Questions（已全部闭环）
- [x] 四模块范围：用户已确认本期全做。
- [x] 模板与 work-summary 融合：用户已确认复用现有 work-summary 流程。
- [x] 周起点：用户已确认周一~周日。
- [x] 绩效审核人：用户已确认管理员锁定，员工只读。
- [x] 目标负责人：用户已确认管理员指定，员工补全其余字段。
- [x] 绩效工时统计：用户已确认由 time_entries 聚合。
- [x] ~~未决 1~~ 员工绩效入口：独立 `/(dashboard)/my-performance` 侧边栏页面（所有用户可见）；管理员侧保留 `/(dashboard)/performance` 仅管理员可见。
- [x] ~~未决 2~~ 周报提醒：支持邮件 + 企业微信双通道，`notification.channel` 可配置；未配置时降级为日志记录。
- [x] ~~未决 3~~ 纪律默认值：无考勤数据时=100，得分说明自动追加「无考勤数据，纪律按全勤计算」。
