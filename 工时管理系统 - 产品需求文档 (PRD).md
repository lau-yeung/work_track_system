# 文档信息
表格

| **项目** | **内容** |
| --- | --- |
| <font style="color:rgb(79, 79, 79);">产品名称</font> | <font style="color:rgb(79, 79, 79);">工时管理系统 (WorkTrack / Time Management System)</font> |
| <font style="color:rgb(79, 79, 79);">文档版本</font> | <font style="color:rgb(79, 79, 79);">v1.2</font> |
| <font style="color:rgb(79, 79, 79);">创建日期</font> | <font style="color:rgb(79, 79, 79);">2026年1月23日</font> |
| <font style="color:rgb(79, 79, 79);">最近更新</font> | <font style="color:rgb(79, 79, 79);">2026年9月8日</font> |
| <font style="color:rgb(79, 79, 79);">文档类型</font> | <font style="color:rgb(79, 79, 79);">产品需求文档</font> |
| <font style="color:rgb(79, 79, 79);">目标用户</font> | <font style="color:rgb(79, 79, 79);">项目团队、项目经理、企业HR</font> |
| <font style="color:rgb(79, 79, 79);">当前发布</font> | <font style="color:rgb(79, 79, 79);">v1.0.0 (2026-08-04)</font> |


---

# 1. 产品概述
## 1.1 产品定位
工时管理系统（WorkTrack）是一款面向中小型企业和项目团队的工时追踪与管理工具，帮助企业实现项目工时的精细化管控、提升团队工作效率、降低项目风险。系统支持多角色协作、数据分析、AI 智能工作总结与风险预警、数据多维度导出等核心功能。

## 1.2 产品价值
精细化管理：实现对项目工时的实时追踪和精准控制

风险预警：通过规则引擎或外部 AI 分析提前识别项目超支风险

效率提升：简化工时填报流程，自动化数据统计，支持日报合并避免重复录入

决策支持：提供多维度数据分析与工作总结，辅助管理决策

数据沉淀：按日/周/月/年/自定义维度导出 Excel/CSV/Markdown，支持归档与汇报

灵活配置：支持多种系统参数配置，适应不同企业需求

## 1.3 目标用户
项目经理 (PM) ：负责项目规划、工时预算、风险管控

团队成员：每日填报工时，跟踪个人工作进度

系统管理员：用户管理、系统配置、数据维护

企业高管：通过数据分析了解整体项目状态

---

# 2. 产品功能
## 2.1 核心功能模块
### 2.1.1 用户管理
**功能描述：**提供完整的用户生命周期管理，支持多种角色权限控制。

**详细需求：**

1. 用户注册/登录
+ 用户名+密码登录
+ 管理员创建用户
+ 独立注册页面（`/register`），受系统配置 `allow_user_registration` 开关控制
+ 新用户审核机制受系统配置 `registration_approval_required` 开关控制，开启后注册用户初始状态为 `pending`
+ 提供种子数据接口 `/api/seed` 用于一键创建演示账号
2. 用户信息管理
+ 基本信息：用户名、密码、邮箱、真实姓名
+ 角色分配：管理员（admin）、项目负责人（pm）、普通用户（user）
+ 状态管理：active（正常）、disabled（禁用）、pending（待审核）
3. 角色权限体系

表格

| **角色** | **权限范围** |
| --- | --- |
| <font style="color:rgb(79, 79, 79);">管理员 admin</font> | <font style="color:rgb(79, 79, 79);">全部功能权限；可访问用户管理、系统配置；可操作任意工时记录</font> |
| <font style="color:rgb(79, 79, 79);">项目负责人 pm</font> | <font style="color:rgb(79, 79, 79);">创建/管理项目、查看负责与参与项目数据、填报工时</font> |
| <font style="color:rgb(79, 79, 79);">普通用户 user</font> | <font style="color:rgb(79, 79, 79);">查看参与项目、填报个人工时、查看个人数据与个人工作总结</font> |


4. 系统保留账号
+ `username='admin'` 为系统保留账号，**不可被分配为项目负责人或项目成员**（前后端双重校验）

**业务规则：**

+ 用户名、邮箱全局唯一
+ 密码使用 bcrypt 加密存储
+ 管理员可修改任意用户密码
+ 状态为 `disabled` 的用户无法登录系统
+ 状态为 `pending` 的用户登录时给予"等待审核"提示
+ 用户通过注册接口创建时仅可为 `role='user'` 的普通用户

---

### 2.1.2 项目管理
**功能描述：**实现项目的全生命周期管理，包括创建、分配、跟踪、查看。

**详细需求：**

1. **项目基本信息**
+ 项目名称（必填，200字符内）
+ 项目描述（可选，多行文本）
+ 项目负责人 owner_id（必填，从 PM / 管理员中选择，**排除系统 admin 账号**）
+ 预估总工时 estimated_hours（必填，单位：小时，numeric(10,1)）
+ 项目状态：进行中 `in_progress`、已完成 `completed`、风险中 `at_risk`
+ 项目周期：开始日期 start_date、结束日期 end_date（**空字符串会自动转为 NULL**，避免 PostgreSQL 日期解析错误）
2. 项目成员管理
+ 创建项目时多选添加成员，负责人自动加入成员列表
+ 支持动态调整成员列表（通过 `/api/projects/[id]/members` 增加成员）
+ 新增成员时校验：不可加入系统保留账号 `admin`
3. 项目查看权限
+ 管理员：查看所有项目
+ 项目负责人（PM）：查看自己负责的项目 + 参与的项目
+ 普通用户：仅查看参与的项目
4. 项目工时统计
+ 列表实时展示预估工时 vs 实际工时（actual_hours 动态聚合 time_entries）
+ 计算工时偏差和使用率
+ 根据角色显示不同数据（管理员/PM 看全员，普通用户看个人）

**业务规则：**

+ 项目删除时通过外键 `onDelete: cascade` 级联删除相关工时记录与项目成员关系
+ 状态为 `completed` 的项目仍可查看历史数据
+ 项目负责人必须为 PM 或管理员角色（前端下拉过滤 + 后端权限校验）
+ 项目成员可包含 PM、管理员、普通用户

---

### 2.1.3 工时日报
**功能描述：**团队成员每日填报工时，记录工作内容和进度。以**月历视图**为主交互，点击日期直接填报或追加；支持批量多日期填报、同日同项目自动合并、当日工时不足提醒。

**详细需求：**

1. **工时填报字段**
+ 项目 project_id（必填，仅显示用户参与的项目）
+ 工作日期 work_date（必填，日期选择器）
+ 工时数 hours（必填，0-24 小时，numeric(4,1)）
+ 备注 remarks（可选）
+ 今日完成工作 completed_work（必填，多行文本）
+ 需协调事宜 coordination_matters（可选，多行文本）
+ 明日计划工作 tomorrow_plan（必填，多行文本）
2. **填报默认值（UX 增强）**
+ **工时** 默认填 `8`
+ **项目** 默认选用户最近一次录入的项目
+ **今日完成工作** 默认填前一日的 `tomorrow_plan`（支持手动调整）
3. 工时校验规则
+ **单日总工时限制：**单人单日所有项目总工时不超过 8 小时（超过返回当前已填报数）
+ **项目总工时限制：**项目累计工时不得超过预估工时 estimated_hours
+ **项目成员校验：**只有项目成员（或管理员）才能填报该项目工时
+ **历史补填限制：**系统配置 `allow_historical_entry` 开关控制是否允许补填历史工时
+ **工时范围校验：**hours 必须为数字，且 0 < hours ≤ 24
4. 工时记录管理
+ 支持创建、编辑、删除工时记录
+ 编辑时锁定项目和日期，仅可修改工时和内容
+ 普通用户只能操作自己的工时记录
+ 管理员可操作任意工时记录
5. **工时记录合并机制**（核心特性）
+ 同一用户 + 同一项目 + 同一日期再次填报时，**不报错、不覆盖**，而是触发**合并更新**：
    - `hours` 累加
    - `completed_work`、`coordination_matters`、`tomorrow_plan` 以**编号列表**追加（`1. xxx\n2. xxx`），保留历史条目
    - `remarks` 以换行简单追加
+ 合并后接口返回 `merged: true`，前端 toast 提示"工时已合并"
6. **日总提醒**
+ 填报成功后接口返回 `daily_total`（当日工时合计）与 `is_below_minimum`（是否低于 8 小时）
+ 前端展示日总提醒，便于员工自查当日工时是否填满
7. **批量多日期填报**
+ 弹窗支持一次填报多个日期（动态多行，每行 `{project_id, work_date, hours, completed_work, ...}`）
+ 后端 `POST /api/time-entries/batch` 逐行校验后循环写入，同日同项目记录由 API 自动合并
+ 批量提交后返回每行 `daily_total` / `is_below_minimum`，前端逐行提示不足 8 小时
8. **一体化填报/追加弹窗**
+ 点击月历任意日期格子打开统一弹窗：传入 `initialDate` 与当日已有 `entries`
+ 弹窗支持「填报新行」「追加合并」「编辑现有」三种模式无缝切换
+ 同日多次填报自动走合并机制
9. **月历视图展示**（取代表格分页）
+ 月历网格固定 6 行 42 格，**从周日起始**（`WEEK_HEADERS = ['日','一','二','三','四','五','六']`）
+ 每格显示：日期、当日合计工时、项目摘要
+ **协调事项标签**：当日 `coordination_matters` 非空时显示黄色「协调」标签，便于在月历上快速识别需协调的日期
+ 图例说明工时状态（如已填/不足/未填）
+ 普通用户看自己记录，管理员看全员；按月份切换加载

**API：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/time-entries?startDate=&endDate=&page=&pageSize=` | 查询（月历默认 page=1&pageSize=1000 取整月） |
| POST | `/api/time-entries` | 单条填报/合并 |
| PUT | `/api/time-entries/:id` | 编辑（锁定 project+date） |
| DELETE | `/api/time-entries/:id` | 删除 |
| POST | `/api/time-entries/batch` | 批量多日期填报，返回每行 `daily_total`/`is_below_minimum` |
| GET | `/api/time-entries/export?dimension=&format=&...` | 导出（excel/csv/markdown） |

**业务规则：**

+ 同一用户、同一项目、同一日期的记录通过应用层合并机制保证唯一性（数据库层不强制唯一约束）
+ 删除工时记录时无需再校验项目成员资格（仅权限校验）
+ 被移出项目的成员的历史工时记录保留，但无法再创建新记录
+ 月历视图取代传统表格分页；数据按月加载聚合

---

### 2.1.4 数据分析
**功能描述：**提供多维度工时数据分析，帮助管理者了解项目进度和团队效率。

**详细需求：**

1. 工时趋势分析
+ 图表展示：每日工时柱状图 + 累计工时折线图（基于 recharts 2.x 双轴展示）
+ 支持自定义日期范围
+ X 轴：日期，Y 轴：工时（小时）
2. 工时偏差分析
    1. 对比预估工时 vs 实际工时
    2. 计算指标：
    - 剩余工时 = 预估工时 - 实际工时
    - 偏差 = 实际工时 - 预估工时
    - 偏差率 = (偏差 / 预估工时) × 100%
    - 使用率 = (实际工时 / 预估工时) × 100%
    3. 偏差状态判断（阈值由系统配置控制，单位为百分比）：
    - 正常（绿色）：使用率 < `warning_threshold`（默认 80）
    - 超支风险（橙色）：`warning_threshold` ≤ 使用率 < `critical_threshold`（默认 100）
    - 严重超支（红色）：使用率 ≥ `critical_threshold`
3. 用户工时统计
+ 总工时统计（可按日期范围）
+ 按项目分组统计工时
+ 最近 30 天工时趋势
+ 管理员可查看任意用户，普通用户仅查看自己
4. 工作台概览（`/api/analytics/overview`）
+ 总项目数
+ 进行中项目数
+ 总工时（所有项目累计）
+ 本月工时

**业务规则：**

+ 普通用户查看项目数据时仅统计自己的工时
+ 管理员和 PM 查看项目数据时统计全员工时
+ 风险阈值可在系统配置中调整（百分比单位，0-100）

---

### 2.1.5 AI 智能功能
**功能描述：**基于工时数据提供智能风险分析、项目总结与周期性工作总结。AI 支持**内置规则引擎**与**外部 OpenAI 兼容 API**（如 DeepSeek、通义千问等）两种模式，外部 AI 不可用时自动回退到内置模式。

**详细需求：**

1. AI 风险分析（`/api/ai/risk-analysis`）
    1. 输入：项目ID
    2. 输出：
    - 风险等级：低风险、中风险、高风险
    - 风险概率：20% / 60% / 90%
    - 工时使用率
    - 风险原因列表
    - 管理建议列表
2. AI 项目总结（`/api/ai/project-summary`）
    1. 输入：项目ID
    2. 输出：
    - 项目基本信息（名称、状态、周期、负责人）
    - 工时统计（预估、实际、偏差、使用率）
    - 团队规模（成员去重，排除负责人）
    - 项目总结文本
3. AI 周期工作总结（`/api/ai/work-summary`）
    1. 输入：维度（dimension）、参考日期、可选 userId/projectId/自定义日期范围
    2. 支持的维度：
    - `week` 本周、`last_week` 上周
    - `month` 本月、`last_month` 上月
    - `year` 本年、`last_year` 上年
    - `custom` 自定义日期范围
    3. 输出：基于日报数据（completed_work、tomorrow_plan 等）生成的结构化总结文本
    4. **上下文延续**：生成 `week/month/year` 时自动拉取上一周期已保存总结作为参考
    5. **大数据量优化**：调用外部 AI 前，先经 `summary-optimizer` 聚合日报数据（压缩 60-80% token）
    6. **持久化**：总结保存到 `work_summaries` 表，按 `(user_id, project_id, dimension, period_start)` 唯一约束 upsert
    7. **来源标记**：每条总结携带 `used_external_ai` 字段，标识是否由外部 AI 生成
4. AI 功能配置
+ 可在系统配置中开启/关闭 AI 功能（`enable_ai_feature`）
+ 支持配置 AI 服务提供商（`ai_provider`：`builtin` / `external`）
+ 支持配置外部 AI API 端点、密钥、模型名（兼容 OpenAI Chat Completions 协议）
+ 前端展示当前 AI 状态（启用状态、provider、配置完整性、提示信息）
+ 提供 `/api/ai/config-status` 与 `/api/ai/test-connection` 用于状态查询与连通性测试

**业务规则：**

1. AI 功能需在系统配置中开启才可使用风险分析、项目总结
2. 风险分析基于工时使用率（阈值来自系统配置）：
+ 使用率 ≥ `critical_threshold`（默认 100）：高风险（90% 概率）
+ 使用率 ≥ `warning_threshold`（默认 80）：中风险（60% 概率）
+ 使用率 < `warning_threshold`：低风险（20% 概率）
3. 工作总结在外部 AI 未配置或调用失败时自动回退到内置规则引擎
4. 普通用户仅可生成/查看自己的工作总结，管理员可查看所有人

---

### 2.1.6 数据导出
**功能描述：**支持按多种时间维度和文件格式导出工时日报，便于汇报与归档。

**详细需求：**

1. 路由：`/api/time-entries/export`
2. 支持的时间维度（`dimension`）：
+ `day` 按日（指定日期）
+ `week` 按周（ISO 周，周一至周日）
+ `month` 按月（自然月）
+ `year` 按年（自然年）
+ `custom` 自定义日期范围（需提供 startDate、endDate）
3. 支持的导出格式（`format`）：
+ `excel` / `xlsx`：Excel 工作簿（基于 xlsx 库，含标题行、表头、数据、合计行，预设列宽与合并单元格）
+ `csv`：UTF-8 BOM 编码的 CSV（兼容 Excel 直接打开）
+ `markdown` / `md`：按日期分组的 Markdown 表格
4. 导出字段：日期、员工姓名、用户名、项目名称、工时(h)、今日完成工作、明日计划工作、协调事项、备注
5. 权限控制：
+ 普通用户仅导出自己的工时记录
+ 管理员可导出全员记录
+ 支持按 `projectId` 过滤

**业务规则：**

+ 所选范围内无工时记录时返回 404 错误提示
+ 文件名采用 `工时日报_{startDate}_{endDate}.{ext}` 格式，使用 RFC 5987 UTF-8 编码
+ Excel 与 Markdown 自动追加总工时合计

---

### 2.1.7 系统配置
**功能描述：**提供灵活的系统参数配置，适应不同企业需求。

**详细需求：**

1. 用户管理配置
+ `allow_user_registration`：是否允许用户注册（开关，默认 true）
+ `registration_approval_required`：新用户是否需要审核（开关，默认 true）
2. 工时管理配置
+ `daily_hour_limit`：单人工时上限（小时/天，数字，默认 8）
+ `warning_threshold`：工时使用率预警阈值（百分比，默认 80）
+ `critical_threshold`：工时使用率严重阈值（百分比，默认 100）
+ `allow_historical_entry`：是否允许补填历史日报（开关，默认 true）
3. AI 功能配置
+ `enable_ai_feature`：是否启用 AI 功能（开关，默认 false）
+ `ai_provider`：AI 服务提供商（`builtin` 内置 / `external` 外部，默认 builtin）
+ `ai_api_endpoint`：外部 AI API 端点（字符串，如 `https://api.deepseek.com`）
+ `ai_api_key`：外部 AI API 密钥（字符串，建议加密存储）
+ `ai_model`：AI 模型名称（字符串，如 `deepseek-v4-flash`）

**业务规则：**

+ 仅管理员可访问与修改系统配置（`/api/system-configs` 路由服务端强制校验）
+ 配置修改立即生效，无需重启服务
+ 缺失的配置项在管理员首次访问时自动补充默认值（自动建项机制）
+ 阈值单位为**百分比**（0-100），与早期文档中 0-1 的小数写法不同

---

### 2.1.8 模板配置
**功能描述：**生成周期工作总结前，用户可选择自定义模板；AI 按模板字段输出结构化内容，使总结格式可配置。模板与 work-summary 模块集成。

**详细需求：**

1. 模板字段定义
+ 每个模板包含 1~12 个字段，每字段 `{ key, label }`
+ `key` 仅字母数字下划线；`label` 必填
+ 系统初始化内置默认模板：`本周计划 / 实际完成 / 未完成原因 / 下周计划 / 输出产物`（开箱即用）
+ 用户可新建/编辑/删除自定义模板；系统内置模板不可删
2. 默认模板
+ 每用户至多一个默认模板（`is_default=true`）
+ work-summary 生成时默认勾选默认模板，可不选走原自由总结逻辑（向后兼容）
3. 与 work-summary 集成
+ work-summary `POST /api/ai/work-summary` 增加可选 `templateId`
+ 传入后，prompt 注入模板字段作为输出 schema，AI 按字段输出 JSON，再拼装为带 `## label` 的 Markdown 落库 `summary_content`
+ AI 不通时 `callAIJson` 的 `fallbackFactory` 按字段从日报 `completed_work/tomorrow_plan` 规则填充
4. 模板管理入口
+ 在 `/work-summary` 页面加「模板配置」按钮，弹出侧边抽屉/对话框 CRUD

**API：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/report-templates` | 列出当前用户可用模板（本人 + 系统内置），标记 `is_default` |
| POST | `/api/report-templates` | 新建模板 `{ name, fields[] }` |
| PUT | `/api/report-templates/:id` | 编辑（仅本人） |
| DELETE | `/api/report-templates/:id` | 删除（仅本人，系统内置不可删） |
| POST | `/api/report-templates/:id/default` | 设为默认 |

**业务规则：**

+ `(user_id, name)` 唯一；系统内置模板 `user_id IS NULL`
+ 删除被引用模板不影响已存总结（`summary_content` 是文本快照）
+ 所有 AI 调用均经 `callAIJson`，外部/内置/兜底三种状态均返回可用结果，前端 toast 明示来源

---

### 2.1.9 月度目标
**功能描述：**员工月初录入月度目标与预期产出，再拆解计划任务、验收标准、风险点；数据供周报第一周计划与绩效月度任务项引用。支持拖拽排序与优先级展示。

**详细需求：**

1. 录入字段
+ 月度目标 `goals`（最重要的几个目标）
+ 预期产出 `expected_output`（代码、文档、版本）
+ 计划任务拆解 `task_breakdown`（根据目标自己拆解）
+ 计划完成时间 `planned_completion_date`
+ 验收标准 `acceptance_criteria`（什么叫完成）
+ 风险点 `risk_points`（哪里可能卡住）
+ 状态 `status`：draft / active / closed
2. 拖拽排序与优先级（增强）
+ 列表支持上下拖拽重排，**第一行优先级最高**
+ 表格新增「优先级」列，展示序号 1,2,3...，首行高亮
+ 新建目标时 `sort_order` 自动取当前最大值+1（追加到末尾）
+ 普通用户只能重排自己的目标，admin 可重排任意
3. 多条录入
+ 对话框支持批量录入（多行 items），并提供「上同」按钮复制上一条内容
4. 列表展示
+ 字段：`#、优先级、负责人、月度目标、预期产出、计划任务拆解、计划完成时间、验收标准、风险点、操作`
+ 空值显示「-」
+ 普通用户默认显示本人当月；admin 默认显示全员当月

**API：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/monthly-goals?year=&month=&userId=` | 列表（普通用户看本人，admin 看全员） |
| POST | `/api/monthly-goals` | 批量 upsert `{items:[{year, month, goals, ...}]}` |
| GET / PUT | `/api/monthly-goals/:id` | 单条详情/更新 |
| DELETE | `/api/monthly-goals/:id` | 删除单条 |
| PUT | `/api/monthly-goals/reorder` | 批量重排 `{items:[{id, sort_order}]}` |
| GET | `/api/monthly-goals/export?year=&month=&userId=&format=` | 导出（excel/csv/markdown） |

**业务规则：**

+ 默认进入当前年月；支持切换月份
+ admin 可见全员下拉筛选；普通用户默认本人当月
+ 排序：`sort_order ASC, id ASC`
+ `username='admin'` 不参与目标分配（沿用项目约束）

---

### 2.1.10 周报汇总
**功能描述：**按月自动划分周区间；周计划自动承接（第一周来自月度目标，后续周来自上周下周计划）；实际完成由 AI 基于本周日报生成（带兜底）；支持勾选完成项、从月度目标添加计划、输出产物附件与链接。

**详细需求：**

1. 周区间划分规则
+ 每周按「周一 ~ 周五」（5 个工作日）作为一个周报周期
+ **若管理员设置了本月工作期（work_start/work_end）**：首周 = `mondayOf(work_start)`，仅当周一 ≤ work_end 时入列；周归属唯一由该月配置窗口决定，杜绝跨月重复
+ **未设置工作期（默认兜底）**：一周归属本月当且仅当其周一所在月 === 目标月（删除原"周五在本月且周一在上月"分支，消除 0831~0904 同周同时属 8 月和 9 月的 bug）
+ 每月最多 5 周；周报日报数据取 `[week_start, week_end]` 区间的 `time_entries`
2. 周计划承接逻辑
+ **第一周** `this_week_plan` 默认从当月 `monthly_goals.goals` + `task_breakdown` 切分为计划项（`{id, text, done:false}`），支持手动增删改与勾选完成
+ **第二周起** `this_week_plan` 默认从上一周 `weekly_reports.next_week_plan` 整体复制（重置 `done=false`）
+ 生成本周周报时：若已存在 `this_week_plan` 则用现有；否则按上述规则自动初始化并落库
3. 实际完成（AI 生成 + 兜底）
+ 用户点「生成周报」→ `POST /api/weekly-reports/generate`，后端取本周 `time_entries.completed_work/tomorrow_plan/coordination_matters`，调 `callAIJson` 生成 `{ actualCompleted, uncompletedReason, outputArtifacts }`
+ **兜底**：AI 不通/解析失败时，用日报 `completed_work` 拼接成「实际完成」，未完成原因填「详见日报待办」，输出产物取 `remarks/tomorrow_plan` 中含「产出/文档/版本」关键字行；同时 `used_external_ai=false`
+ 生成结果 upsert 到 `weekly_reports`（保留用户已编辑的 `this_week_plan/next_week_plan`，仅覆盖 `actual_completed/uncompleted_reason/output_artifacts/used_external_ai/generated_at`）
+ 生成后前端 toast 提示 AI 来源（外部/内置/兜底）
4. **从月度目标添加计划**（增强）
+ 编辑器中「本周计划」「下周计划」区域提供「从月度目标添加」按钮，弹出 Popover 列出本人当月 `monthly_goals`，多选后追加为 `PlanItem {text: goal.goals, done:false}`
5. **实际完成从本周计划勾选**（增强）
+ 编辑器「实际完成」区域渲染 `this_week_plan` 项的复选框；勾选某项即标记 `PlanItem.done=true`，并自动加入「实际完成」展示
+ `actual_completed` 字段保存为文本，由勾选项文本拼接（兼容 AI 绩效生成读取文本的逻辑）
6. **输出产物附件与链接**（增强）
+ `output_artifacts` 为 JSONB 数组 `[{type:'link'|'file', name, url, size?}]`
+ 「链接」类型：用户直接输入 name+url
+ 「文件」类型：通过 `/api/weekly-reports/upload` 上传，返回 `{url, name, size, key}` 后追加到 `output_artifacts`
+ 支持删除单个产物项
7. 列表字段
+ `成员、本周计划、实际完成、未完成原因、下周计划、输出产物`
+ 「本周计划」「下周计划」单元格渲染为可勾选 checkbox 列表（`done` 勾选即时保存）
+ 「实际完成」单元格在未生成前显示「—」并附「生成周报」按钮

**API：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/weekly-reports?year=&month=` | 列出当月各周（普通用户本人，admin 全员） |
| GET | `/api/weekly-reports?weekStart=&weekEnd=&userId=` | 指定周 |
| PUT | `/api/weekly-reports/:id` | 更新计划项/勾选 done/下周计划/未完成原因/输出产物 |
| POST | `/api/weekly-reports/generate` | `{ userId, weekStart, weekEnd }` 生成实际完成（AI+兜底） |
| POST | `/api/weekly-reports/init` | 显式初始化某周计划（承接月度目标/上周计划）；**未设置本月工作期时返回 409「管理员未设置本月工作期」** |
| POST | `/api/weekly-reports/upload` | multipart 上传附件，返回 `{url, name, size, key}` |
| GET | `/api/weekly-reports/export?year=&month=&userId=&format=` | 导出（excel/csv/markdown） |

**业务规则：**

+ 进入月份时若该周无记录，自动 POST `/init` 初始化计划；未设置工作期则提示 admin 先设置
+ 周计划项 `done` 状态持久化到 `this_week_plan` JSONB
+ 文件上传限制：单文件 ≤ 20MB；允许类型 png/jpeg/gif/webp/pdf/zip/xlsx/docx/xls/doc/txt/md/json

---

### 2.1.11 绩效评分
**功能描述：**基于本月周报「实际完成」由 AI 生成月度任务项与五维评分；总分 100 分加权；管理员视角。支持导出。

**详细需求：**

1. 评分权重（总分 100）

| 维度 | 权重 | 字段 |
| --- | --- | --- |
| 完成度 | 35% | completion |
| 质量 | 30% | quality |
| 进度 | 20% | progress |
| 协作 | 10% | collaboration |
| 纪律 | 5% | discipline |

+ `总分 = round(completion*0.35 + quality*0.30 + progress*0.20 + collaboration*0.10 + discipline*0.05, 1)`，各维度 0~100
2. AI 生成流程
+ 管理员点「生成绩效」→ `POST /api/performance/generate` `{ year, month, userId? }`（不传 userId 则全员）
+ 对每个成员：
  1. 汇总本月各周 `weekly_reports.actual_completed` 与 `time_entries.hours`（工时统计）
  2. 调 `callAIJson` 生成 `{ monthlyTasks, scoreExplanation, completion, quality, progress, collaboration, discipline }`（prompt 注明各维度定义与满分 100，要求 JSON）
  3. **兜底**（`fallbackFactory`）：AI 不通时，`completion` 按周报计划完成率估算、`quality/progress` 取中位 80、`collaboration` 由 `coordination_matters` 是否为空判断、`discipline` 按日报缺勤天数估；`monthly_tasks` 直接拼接周报 `actual_completed`；`score_explanation` 写「规则兜底估算」
  4. 后端按权重计算 `total_score`（不信任 AI 给的总分，统一后端算）
  5. upsert 落库
3. `monthly_tasks` 是「实际完成的工作」，与需求一致
4. 列表字段
+ `成员、月度任务项、工时统计、得分说明、完成度、质量、进度、协作、纪律、总分`
5. 页面
+ `/performance`（admin 专属）：年月选择 + 成员筛选 + 「生成绩效」按钮；表格按字段列；总分高亮
+ `/my-performance`（普通用户）：本人当月绩效只读 + 历史月份切换

**API：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/performance?year=&month=&userId=` | 列表（admin 全员/本人） |
| POST | `/api/performance/generate` | `{ year, month, userId? }` 生成（admin） |
| GET | `/api/performance/:id` | 单条详情 |
| GET | `/api/performance/export?year=&month=&userId=&format=` | 导出（excel/csv/markdown） |

**业务规则：**

+ 普通用户：仅本人 my-performance；不能访问 `/performance`
+ `admin`：全员视图 + 生成绩效；`pm` 同普通用户（不扩展 PM 跨项目视图）
+ `username='admin'` 不参与目标/绩效分配（沿用项目约束）

---

### 2.1.12 月度工作期配置
**功能描述：**管理员手动设置每月的工作起始与结束日期，系统据此划定各周；周报生成依赖此配置。解决跨月周重复归属问题。

**详细需求：**

1. 配置粒度：全局按月（`period_year, period_month` 唯一），admin 设置
2. 字段：`work_start DATE`、`work_end DATE`，起始不得晚于结束
3. 周报初始化依赖：`/api/weekly-reports/init` 先读 `month_work_config`，未设置则返回 409「管理员未设置本月工作期，无法生成周报」
4. 周划分：`getMonthWeeks(year, month, { workStart, workEnd })` 从 `mondayOf(workStart)` 起，按周一~周五推进，周一 ≤ work_end 才入列
5. 跨月去重：每个配置窗口唯一决定本月周归属，避免 0831~0904 同周同时属 8 月和 9 月

**API：**

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/month-work-config?year=&month=` | 返回指定月份工作期配置（全局可读） |
| PUT | `/api/month-work-config` | `{ period_year, period_month, work_start, work_end }` admin upsert |

**业务规则：**

+ 仅管理员可设置；所有用户可读
+ 默认（未设置）：周归属本月当且仅当周一在本月（兜底规则）

---

### 2.1.13 文件存储抽象层
**功能描述：**统一封装文件上传/读取/删除，支持 local / S3 兼容（AWS S3 / Cloudflare R2 / MinIO）多种后端，由环境变量切换，便于在不同部署环境间无缝切换。

**详细需求：**

1. 存储接口（`src/storage/types.ts`）
+ `FileStorage { upload(buffer, key, contentType, originalName?): Promise<UploadResult>; getPublicUrl(key): string; delete(key): Promise<void> }`
+ `UploadResult { url, key, name, size, contentType }`
2. 后端实现
+ **local**（默认）：写入 `public/uploads/<dir>/`，Next.js 静态托管，零配置
+ **s3 / r2 / minio**：基于 `@aws-sdk/client-s3`，S3 兼容协议；MinIO 启用 `forcePathStyle`
3. 工厂切换（`src/storage/index.ts`）
+ 读取 `STORAGE_DRIVER` 环境变量（local/s3/r2/minio）
+ S3/R2/MinIO 在凭证完整（`isS3Configured()`）时启用，否则自动回退 local
4. 上传路由
+ `POST /api/weekly-reports/upload` multipart/form-data，字段名 `file`
+ 鉴权：需登录；单文件 ≤ 20MB；允许类型见 2.1.10
+ 返回 `{ url, name, size, key }`，由前端追加到 `weekly_reports.output_artifacts`

**环境变量：**

| 变量 | 说明 |
| --- | --- |
| `STORAGE_DRIVER` | local（默认）/ s3 / r2 / minio |
| `S3_ENDPOINT` | S3 兼容端点（R2: `https://<account>.r2.cloudflarestorage.com`；MinIO: `http://localhost:9000`） |
| `S3_REGION` | R2 用 auto，MinIO 用 us-east-1，AWS 用对应 region |
| `S3_BUCKET` | bucket 名称 |
| `S3_ACCESS_KEY_ID` | 访问密钥 |
| `S3_SECRET_ACCESS_KEY` | 秘密密钥 |
| `S3_PUBLIC_URL` | 公开访问前缀（如 `https://cdn.example.com`） |

**业务规则：**

+ 凭证缺失时自动回退 local，保证零配置可用
+ 上传 key 格式：`<timestamp>-<random6>.<ext>`，避免重名
+ local 模式文件 URL 走 `/uploads/<dir>/<key>` 静态托管

---

## 2.2 系统界面
> 界面基于 shadcn/ui（Radix UI）+ Tailwind CSS 4 实现，整体遵循 `DESIGN.md` 设计规范：深靛蓝主色（#1e3a5f）、低饱和度专业氛围、白色卡片 + 圆角 lg + 细微阴影、表格斑马纹、状态标签彩色 badge。

### 2.2.1 登录页面 
**界面元素：**

+ 产品标题："工时管理系统"
+ 副标题："BEWIN TIME MANAGEMENT"
+ 用户名输入框（带图标）
+ 密码输入框（带图标，支持显示/隐藏切换）
+ 登录按钮（主色调）
+ 提供独立注册入口 `/register`（受 `allow_user_registration` 控制显隐）

**交互说明：**

+ 表单验证：用户名和密码必填
+ 登录成功后跳转到工作台
+ 登录失败显示错误提示
+ 待审核用户（status=pending）登录时显示警告信息

---

### 2.2.2 注册页面（受配置控制）
**界面元素：**

+ 用户名、密码、邮箱、真实姓名输入框
+ 注册按钮

**交互说明：**

+ `allow_user_registration=false` 时接口返回 403，前端提示"当前系统不允许注册"
+ `registration_approval_required=true` 时注册成功提示"等待管理员审核"

---

### 2.2.3 主布局
**界面结构：**

1. 左侧导航栏（深靛蓝主题，shadcn/ui Sidebar）
+ 系统标题
+ 菜单项：工作台、项目管理、工时日报、工作总结、数据分析
+ 管理员专属：用户管理、系统配置
2. 顶部栏（白色）
+ 用户信息展示（头像 + 姓名）
+ 下拉菜单：退出登录
3. 内容区域（极浅灰背景 #f8fafc + 白色卡片）

**交互说明：**

+ 当前页面菜单项高亮显示
+ 响应式设计，支持移动端折叠（基于 `use-mobile` hook）
+ 退出登录清除本地存储

---

### 2.2.4 工作台
**界面元素：**

1. 页面标题："工作台"
2. 4 个统计卡片：
+ 总项目数
+ 进行中项目数
+ 总工时（所有项目累计）
+ 本月工时

**交互说明：**

+ 页面加载自动统计数据（`/api/analytics/overview`）
+ 数值实时更新

---

### 2.2.5 项目管理页面
**界面元素：**

+ 页面标题 + "新建项目"按钮
+ 项目列表表格（shadcn/ui Table，斑马纹）
+ 新建/编辑项目弹窗（shadcn/ui Dialog）

**表格列：**

+ 项目名称
+ 项目负责人
+ 预估工时
+ 实际工时（动态聚合）
+ 状态（彩色 badge：进行中/已完成/风险中）
+ 开始日期
+ 结束日期
+ 操作（编辑、删除按钮）

**弹窗表单：**

+ 项目名称（必填）
+ 项目描述（多行文本）
+ 项目负责人（下拉选择，仅显示 PM 与管理员，排除 admin 账号）
+ 预估总工时（数字输入）
+ 项目状态（下拉选择）
+ 项目周期（日期范围选择器）
+ 项目成员（多选下拉，排除 admin 账号）

**交互说明：**

+ 仅 PM 和管理员可新建/编辑/删除项目
+ 项目负责人选项仅显示 PM 和管理员
+ 删除使用 shadcn/ui AlertDialog 二次确认（**禁用原生 window.confirm**，避免被浏览器拦截导致 UI 无响应）

---

### 2.2.6 工时日报页面
**界面元素：**

+ 页面标题 + "填报工时"按钮 + "批量填报"按钮 + "导出"按钮 + 月份切换
+ **月历视图**（6 行 42 格，周日起始）
+ 填报/追加一体化弹窗（TimeEntryDialog）

**月历格子内容：**

+ 日期数字
+ 当日合计工时
+ 项目摘要（多项目分行）
+ **协调事项黄色标签**（当日 `coordination_matters` 非空时显示「协调」）
+ 图例：已填满 8h / 不足 / 未填

**弹窗表单：**

+ 项目（下拉选择，默认最近一次项目；编辑时禁用）
+ 工作日期（日期选择器，默认点击的格子日期；编辑时禁用）
+ 工时（数字输入，0-24，默认 8）
+ 备注（可选）
+ 今日完成工作（必填，多行文本，**默认填前一日 `tomorrow_plan`**）
+ 需协调事宜（可选，多行文本）
+ 明日计划工作（必填，多行文本）
+ **批量多行**：可动态添加多个日期行，一次提交

**交互说明：**

+ 点击月历任意日期格子直接打开弹窗，支持填报新行 / 追加合并 / 编辑现有三种模式
+ 项目下拉仅显示用户参与的项目
+ 编辑时项目和日期不可修改
+ 删除使用 shadcn/ui AlertDialog 二次确认
+ 表单提交时校验工时限制（单日 8h、项目总工时）
+ **合并提示**：当日同项目再次填报触发合并，toast 提示"merged"
+ **日总提醒**：填报后展示当日合计工时，不足 8 小时给予提示
+ 月份切换重新加载整月数据（page=1&pageSize=1000）
+ **批量填报**：弹窗内动态添加多日期行，一次提交多日工时

---

### 2.2.7 工作总结页面
**界面元素：**

+ 页面标题
+ AI 状态卡片（当前 provider、配置完整性、提示信息）
+ 维度选择器（本周/上周/本月/上月/本年/上年/自定义）
+ 用户选择器（管理员可见）、项目选择器
+ "生成总结"按钮
+ 总结列表表格（维度、周期、内容预览、生成时间、AI 来源标识、操作）
+ 总结内容查看弹窗（支持复制内容）

**交互说明：**

+ 切换维度自动加载已保存总结列表
+ 点击"生成总结"触发 AI 调用，loading 状态
+ 生成成功后保存到数据库（`work_summaries` 表 upsert）
+ 外部 AI 调用失败时自动回退内置规则引擎
+ 未保存的临时总结展示迁移提示
+ 通过 `used_external_ai` 标识区分内置/外部 AI 来源

---

### 2.2.8 数据分析页面
**界面元素：**

+ 页面标题
+ 项目选择器（下拉）
+ 统计卡片行（4 个指标）
+ 工时趋势图表（recharts）
+ AI 功能卡片

**统计卡片：**

+ 预估工时
+ 实际工时
+ 使用率（超过预警阈值显示橙色，超过严重阈值显示红色）
+ 偏差状态（彩色 badge）

**AI 功能：**

+ "AI 风险分析"按钮
+ "AI 项目总结"按钮
+ 风险分析报告展示区
+ 项目总结展示区

**交互说明：**

+ 切换项目自动加载对应数据
+ 点击 AI 按钮触发分析请求
+ 分析结果实时展示
+ 风险等级以不同颜色标识

---

### 2.2.9 用户管理页面（仅管理员）
**界面元素：**

+ 页面标题 + "新建用户"按钮
+ 用户列表表格
+ 新建/编辑用户弹窗
+ 修改密码弹窗

**表格列：**

+ 用户名
+ 姓名
+ 邮箱
+ 角色（标签显示）
+ 状态（标签显示）
+ 操作（编辑、改密、删除按钮）

**新建/编辑表单：**

+ 用户名（必填，编辑时禁用）
+ 密码（新建时必填）
+ 姓名
+ 邮箱
+ 角色（下拉选择）
+ 状态（编辑时可选）

**修改密码表单：**

+ 新密码（必填）
+ 确认密码（必填，需匹配）

**交互说明：**

+ 删除使用 shadcn/ui AlertDialog 二次确认
+ 密码修改独立弹窗
+ 表单验证严格

---

### 2.2.10 系统配置页面（仅管理员）
**界面元素：**

+ 页面标题
+ 配置表单卡片

**配置分组：**

1. 用户管理
+ 允许用户注册（Switch 开关）
+ 新用户需要审核（Switch 开关）
2. 工时管理
+ 单人工时上限（数字输入）
+ 工时超支预警阈值（数字输入，0-100）
+ 工时超支严重阈值（数字输入，0-100）
+ 允许补填历史日报（Switch 开关）
3. AI 功能
+ 启用 AI 功能（Switch 开关）
+ AI 服务提供商（下拉：内置/外部）
+ 外部 AI API 端点（文本输入）
+ 外部 AI API 密钥（密码输入框）
+ AI 模型名称（文本输入）

**交互说明：**

+ 配置修改后需点击"保存配置"
+ 保存成功 toast 提示
+ 阈值输入带说明文字
+ 缺失配置项首次访问时自动补齐默认值

---

### 2.2.11 月度目标页面 `/monthly-goals`
**界面元素：**

+ 页面标题 + "新建目标"按钮 + "导出"下拉 + 年月选择 + 成员筛选（admin 全员）
+ 目标列表表格（斑马纹）
+ 新建/编辑目标弹窗（支持批量多行）

**表格列：**

+ #（序号）
+ 优先级（拖拽序号 1=最高，首行高亮；**支持上下拖拽重排**）
+ 负责人
+ 月度目标
+ 预期产出
+ 计划任务拆解
+ 计划完成时间
+ 验收标准
+ 风险点
+ 操作（编辑、删除）

**弹窗表单（placeholder）：**

+ 月度目标：最重要的几个目标
+ 预期产出：代码、文档、版本
+ 计划任务拆解：根据目标自己拆解
+ 验收标准：什么叫完成
+ 风险点：哪里可能卡住
+ 多行支持「上同」复制上一条

**交互说明：**

+ 普通用户进入默认显示本人当月；admin 默认显示全员当月
+ 拖拽行结束后调用 `PUT /api/monthly-goals/reorder` 批量更新 `sort_order`
+ 新建目标自动追加到末尾（`sort_order` = max+1）
+ 导出支持 excel / csv / markdown

---

### 2.2.12 周报汇总页面 `/weekly-reports`
**界面元素：**

+ 页面标题 + 年月选择 + 成员筛选（admin 全员）+ 周次切换 Tab（第1~5 周）
+ **工作期配置卡**（admin 可见）：设置本月 `work_start` / `work_end` 日期
+ "生成周报"按钮 + "导出"下拉
+ 周报编辑表格

**表格列：**

+ 成员
+ 本周计划（checkbox 列表，`done` 即时保存）
+ 实际完成（未生成前显示「—」+「生成周报」按钮）
+ 未完成原因
+ 下周计划（checkbox 列表）
+ 输出产物（附件/链接列表）

**编辑器弹窗：**

+ 本周计划：「从月度目标添加」按钮 + 手动新增/编辑/勾选 `done`/删除
+ 实际完成：渲染 `this_week_plan` 复选框，勾选即填入「实际完成」
+ 未完成原因（多行文本）
+ 下周计划：「从月度目标添加」按钮 + 手动新增/编辑/勾选/删除
+ 输出产物：链接（name+url）/ 文件（上传 via `/api/weekly-reports/upload`）+ 删除

**交互说明：**

+ 进入月份时若该周无记录，自动 `POST /init` 初始化计划
+ **未设置本月工作期**：`/init` 返回 409，提示「管理员未设置本月工作期」
+ 第一周 `this_week_plan` 默认来自月度目标，第二周起来自上周 `next_week_plan`
+ 点击「生成周报」调 AI 生成实际完成（含兜底），toast 提示来源
+ 「本周计划」「下周计划」单元格内联勾选 `done` 即时保存
+ 导出支持 excel / csv / markdown

---

### 2.2.13 绩效评分页面 `/performance` 与 `/my-performance`
**界面元素（admin `/performance`）：**

+ 页面标题 + 年月选择 + 成员筛选 + "生成绩效"按钮 + "导出"下拉
+ 绩效列表表格（按总分倒序，总分高亮）

**表格列：**

+ 成员
+ 月度任务项
+ 工时(h)
+ 完成度
+ 质量
+ 进度
+ 协作
+ 纪律
+ 总分
+ 评分说明

**界面元素（普通用户 `/my-performance`）：**

+ 页面标题 + 月份切换
+ 本人当月绩效只读卡片
+ 历史月份切换

**交互说明：**

+ admin 点「生成绩效」→ AI 生成月度任务项与五维评分（含兜底），后端统一加权
+ toast 提示 AI 来源（外部/内置/兜底）
+ 普通用户无法访问 `/performance`，仅看 `/my-performance`
+ 导出支持 excel / csv / markdown

---

### 2.2.14 工作期配置入口
**界面元素：**

+ 位于 `/weekly-reports` 页面顶部（admin 可见的工作期配置卡）
+ 年月（只读，与当前页一致）
+ 起始日期 `work_start`（日期选择器）
+ 结束日期 `work_end`（日期选择器）
+ "保存工作期"按钮

**交互说明：**

+ admin 设置起止日期后调用 `PUT /api/month-work-config`（body: `{ period_year, period_month, work_start, work_end }`）
+ 保存成功后周报列表按新窗口重新划分各周
+ 普通用户只读查看当前月份工作期
+ 未设置工作期时，普通用户进入周报页面会看到「等待管理员设置工作期」提示

---

# 3. 非功能性需求
## 3.1 性能需求
+ 页面加载时间 < 2 秒
+ API 响应时间 < 500ms（本地网络）
+ 支持并发用户数：100+
+ 数据库查询优化，建立必要索引（用户名、邮箱、角色、状态、项目 owner、工时 user/project/date 组合索引等）
+ 大数据量工作总结调用前进行聚合优化，降低外部 AI token 消耗

## 3.2 安全需求
+ 密码 bcrypt 加密存储
+ JWT Token 认证（基于 jose 库），Token 有效期可配置
+ 权限校验在服务端强制执行（每个 API 路由均校验 `getSessionUser`）
+ XSS 防护（React 自动转义）+ SQL 注入防护（Supabase/Drizzle ORM 参数化查询）
+ `service_role key` 仅在服务端使用，**严禁泄露到前端**
+ `.env.local` 通过 `.gitignore` 排除版本控制

## 3.3 可用性需求
+ 界面友好，操作直观
+ 关键操作提供二次确认（统一使用 shadcn/ui AlertDialog）
+ 错误信息清晰明确（统一中文提示）
+ 支持主流浏览器（Chrome, Firefox, Safari, Edge）
+ 响应式设计，适配桌面端与移动端折叠

## 3.4 可维护性需求
+ 代码结构清晰，TypeScript 严格模式
+ 模块化设计（API 路由按资源拆分，组件按 shadcn/ui 规范）
+ RESTful API 设计规范（基于 Next.js App Router Route Handler）
+ 数据库设计合理，支持扩展（Drizzle ORM schema 集中管理）
+ 关键操作日志记录（控制台 warn/error）

## 3.5 可扩展性需求
+ 支持接入更多 OpenAI 兼容 AI 服务
+ 已支持报表导出（Excel/CSV/Markdown）
+ 支持移动端适配
+ 数据库 schema 可通过 Drizzle migration 扩展
+ AI 表（`work_summaries`）支持运行时自动建表与字段补齐

---

# 4. 技术架构 
## 4.1 技术栈
**核心框架：**

+ Next.js 16（App Router，前后端一体化）
+ React 19
+ TypeScript 5（strict 模式）

**UI 与样式：**

+ shadcn/ui（基于 Radix UI）
+ Tailwind CSS 4
+ lucide-react（图标）
+ sonner（toast 通知）

**数据与表单：**

+ Supabase（PostgreSQL 云数据库）
+ Drizzle ORM（schema 定义与关系映射）
+ @supabase/supabase-js（数据库客户端）
+ pg（直接连接 Postgres，用于 DDL 与 AI 表自动初始化）
+ react-hook-form + zod（表单与校验）
+ xlsx（Excel 导出）

**认证与加密：**

+ jose（JWT 签名与会话）
+ bcryptjs（密码哈希）

**图表与日期：**

+ recharts 2.x（图表，替代原计划的 ECharts）
+ date-fns（日期处理，替代原计划的 Day.js）

**拖拽与文件存储：**

+ @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities（月度目标拖拽排序）
+ @aws-sdk/client-s3（S3 兼容存储：AWS S3 / Cloudflare R2 / MinIO）
+ 本地文件存储兜底（`public/uploads/`，零配置）

**AI：**

+ 内置规则引擎（兜底）
+ 外部 OpenAI 兼容 API（DeepSeek、通义千问等）

**包管理与部署：**

+ pnpm 9+（**强制使用，通过 `only-allow` 拦截 npm/yarn**）
+ 跨平台启动脚本（Windows/macOS/Linux，基于 Node.js 自实现，无 Docker）
+ 默认端口 5000（可通过 `DEPLOY_RUN_PORT` 环境变量覆盖）

## 4.2 系统架构图
```plain
┌─────────────────────────────────────────────────────────┐
│                         用户界面                          │
│  (Next.js App Router + React 19 + shadcn/ui + recharts)  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST (同源, Next.js Route Handler)
┌────────────────────▼────────────────────────────────────┐
│                    后端服务                              │
│  (Next.js API Routes + JWT 认证 + 业务逻辑层)             │
│  ┌──────────────┬──────────────┬──────────────┐        │
│  │  Route 层    │  Service 层  │  AI 服务层   │        │
│  │  (handlers)  │  (业务逻辑)  │  (内置/外部)  │        │
│  └──────────────┴──────────────┴──────────────┘        │
│  ┌──────────────┐                                       │
│  │  Drizzle ORM │                                       │
│  └──────────────┘                                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                Supabase (PostgreSQL)                     │
│  (users/projects/project_members/time_entries/          │
│   system_configs/work_summaries/health_check)            │
└─────────────────────────────────────────────────────────┘
```

## 4.3 数据库设计
**核心表结构（Drizzle schema 集中定义于 `src/storage/database/shared/schema.ts`）：**

1. **users (用户表)**
+ id (serial, 主键)
+ username (varchar(50), 唯一, 索引)
+ password (varchar(255), bcrypt 哈希)
+ email (varchar(100), 唯一, 索引)
+ real_name (varchar(50))
+ role (varchar(20), 默认 'user'，取值 admin/pm/user)
+ status (varchar(20), 默认 'active'，取值 active/disabled/pending)
+ created_at、updated_at (timestamptz)
+ 索引：username、email、role、status
2. **projects (项目表)**
+ id (serial, 主键)
+ name (varchar(200))
+ description (text)
+ **owner_id** (integer, 外键 → users，**注意非 pm_id**)
+ estimated_hours (numeric(10,1))
+ status (varchar(20), 默认 'in_progress'，取值 in_progress/completed/at_risk)
+ start_date、end_date (date，**空字符串自动转 NULL**)
+ created_at、updated_at (timestamptz)
+ 索引：owner_id、status
3. **project_members (项目成员表)**
+ id (serial, 主键)
+ project_id (integer, 外键 → projects, **onDelete: cascade**)
+ user_id (integer, 外键 → users)
+ created_at (timestamptz)
+ 索引：project_id、user_id
4. **time_entries (工时记录表)**
+ id (serial, 主键)
+ user_id (integer, 外键 → users)
+ project_id (integer, 外键 → projects, onDelete: cascade)
+ work_date (date)
+ hours (numeric(4,1))
+ remarks、completed_work、coordination_matters、tomorrow_plan (text)
+ created_at、updated_at (timestamptz)
+ 索引：user_id、project_id、work_date、(user_id, project_id, work_date) 组合索引
+ **注意：数据库层不设唯一约束，同 user+project+date 通过应用层合并机制保证业务唯一性**
5. **system_configs (系统配置表)**
+ id (serial, 主键)
+ config_key (varchar(100), 唯一, 索引)
+ config_value (text)
+ config_type (varchar(20), 默认 'string'，取值 boolean/string/number/json)
+ description (text)
+ updated_at (timestamptz)
6. **work_summaries (AI 工作总结表，运行时自动创建)**
+ id (serial, 主键)
+ user_id (integer, 外键 → users, onDelete: cascade)
+ project_id (integer, 外键 → projects, onDelete: SET NULL)
+ dimension (varchar(20), CHECK 约束：week/last_week/month/last_month/year/last_year/custom)
+ period_start、period_end (date)
+ summary_content (text)
+ **used_external_ai** (boolean, 默认 false，标记是否由外部 AI 生成)
+ generated_at、created_at (timestamptz)
+ 唯一约束：(user_id, project_id, dimension, period_start)
+ 索引：user_id、(period_start, period_end)、dimension
7. **health_check (健康检查表)**
+ id (serial)
+ updated_at (timestamptz)
8. **report_templates (模板表，运行时自动创建)**
+ id (serial, 主键)
+ name (varchar(100), NOT NULL)
+ fields (JSONB, NOT NULL) — 字段定义数组 `[{"key","label"}]`
+ is_default (boolean, 默认 false) — 每用户至多一个
+ user_id (integer, 外键 → users, onDelete: cascade；NULL=系统内置)
+ created_at、updated_at (timestamptz)
+ 唯一约束：`(user_id, name)`；系统内置 `user_id IS NULL`
+ 初始化内置默认模板：本周计划/实际完成/未完成原因/下周计划/输出产物
9. **monthly_goals (月度目标表，运行时自动创建)**
+ id (serial, 主键)
+ user_id (integer, NOT NULL, 外键 → users, onDelete: cascade)
+ period_year (int, NOT NULL)
+ period_month (int, NOT NULL, 1-12)
+ goals (text, NOT NULL)
+ expected_output (text)
+ task_breakdown (text)
+ planned_completion_date (date)
+ acceptance_criteria (text)
+ risk_points (text)
+ status (varchar(20), 默认 'draft'，取值 draft/active/closed)
+ **sort_order** (integer, NOT NULL, 默认 0) — 优先级排序，首行最高
+ created_at、updated_at (timestamptz)
+ 索引：`user_id, period_year, period_month`；无唯一约束（允许多人多目标）
10. **weekly_reports (周报汇总表，运行时自动创建)**
+ id (serial, 主键)
+ user_id (integer, NOT NULL, 外键 → users, onDelete: cascade)
+ period_year (int, NOT NULL)
+ period_month (int, NOT NULL)
+ week_index (int, NOT NULL, 1-5)
+ week_start (date, NOT NULL) — 周一
+ week_end (date, NOT NULL) — 周五
+ this_week_plan (JSONB, NOT NULL, 默认 '[]') — `[{id, text, done}]`
+ actual_completed (text) — AI 生成或勾选拼接
+ uncompleted_reason (text)
+ next_week_plan (JSONB, NOT NULL, 默认 '[]') — `[{id, text, done:false}]`
+ **output_artifacts** (JSONB, 默认 '[]') — `[{type:'link'|'file', name, url, size?}]`
+ used_external_ai (boolean, 默认 false)
+ generated_at、created_at、updated_at (timestamptz)
+ 唯一约束：`(user_id, period_year, period_month, week_index)`
+ 索引：`user_id, week_start, period_year, period_month`
11. **performance_scores (绩效评分表，运行时自动创建)**
+ id (serial, 主键)
+ user_id (integer, NOT NULL, 外键 → users, onDelete: cascade)
+ period_year (int, NOT NULL)
+ period_month (int, NOT NULL)
+ monthly_tasks (text) — AI 从本月周报实际完成生成
+ work_hours (numeric(8,1)) — 本月工时统计
+ score_explanation (text)
+ completion (numeric(5,1)) — 完成度 0-100
+ quality (numeric(5,1))
+ progress (numeric(5,1))
+ collaboration (numeric(5,1))
+ discipline (numeric(5,1))
+ total_score (numeric(5,1)) — 后端统一加权计算
+ used_external_ai (boolean, 默认 false)
+ generated_at、created_at、updated_at (timestamptz)
+ 唯一约束：`(user_id, period_year, period_month)`
12. **month_work_config (月度工作期配置表，运行时自动创建)**
+ id (serial, 主键)
+ period_year (int, NOT NULL)
+ period_month (int, NOT NULL, 1-12)
+ work_start (date, NOT NULL)
+ work_end (date, NOT NULL)
+ created_by (integer, 外键 → users, NULL)
+ created_at、updated_at (timestamptz)
+ 唯一约束：`(period_year, period_month)` — 全局按月唯一

> **运行时自动建表机制**：8~12 号表的 DDL 集中写入 `src/lib/ai-init.ts` 的 `ensureAITables()`，在启动或首次访问对应 API 时调用，沿用 `work_summaries` 模式；`scripts/init-database.sql` 同步补充。建表后执行 `NOTIFY pgrst, 'reload schema'` 刷新 PostgREST schema 缓存。

---

# 5. 业务流程
## 5.1 工时填报流程（含合并机制）
```plain
开始
  ↓
用户登录系统
  ↓
进入"工时日报"页面
  ↓
点击"填报工时"
  ↓
选择项目和日期，填写工时与工作内容
  ↓
[校验] 项目成员资格？
  ├─ 否 → 提示错误 → 返回
  └─ 是 ↓
[校验] 单日总工时 ≤ 8 小时？
  ├─ 否 → 提示当前已填报数 → 返回
  └─ 是 ↓
[校验] 项目总工时 ≤ 预估工时？
  ├─ 否 → 提示预估与已用数 → 返回
  └─ 是 ↓
[查询] 同 user + project + date 是否已有记录？
  ├─ 是 → 触发合并：工时累加、详情按编号列表追加 → 更新原记录
  └─ 否 → 插入新记录
  ↓
返回结果（含 daily_total、is_below_minimum、merged 标识）
  ↓
前端 toast 提示 + 刷新列表
  ↓
结束
```

5.2 项目创建流程

```plain
开始
  ↓
PM/管理员登录
  ↓
进入"项目管理"页面
  ↓
点击"新建项目"
  ↓
填写项目信息
  - 项目名称（必填）
  - 项目描述
  - 项目负责人（必填，排除 admin 账号）
  - 预估工时（必填）
  - 项目周期（空日期自动转 NULL）
  - 项目成员（排除 admin 账号）
  ↓
[校验] owner_id 与 member_ids 中是否包含 admin 账号？
  ├─ 是 → 提示"系统保留账号不可作为项目负责人或成员" → 返回
  └─ 否 ↓
提交创建
  ↓
系统创建项目 + 创建项目成员关联（负责人自动入列）
  ↓
显示成功提示
  ↓
刷新项目列表
  ↓
结束
```

5.3 AI 工作总结生成流程

```plain
开始
  ↓
用户登录
  ↓
进入"工作总结"页面
  ↓
选择维度（本周/上周/本月/上月/本年/上年/自定义）
  ↓
可选：选择用户（管理员可）、选择项目
  ↓
点击"生成总结"
  ↓
系统拉取所选周期内的日报数据
  ├─ 无数据 → 提示"所选周期内无日报数据" → 返回
  └─ 有数据 ↓
[优化] summary-optimizer 聚合日报（压缩 60-80% token）
  ↓
[可选] 拉取上一周期已保存总结作为上下文
  ↓
[读取配置] AI provider 与凭证
  ├─ 外部 AI 已配置且完整 → 调用 OpenAI 兼容接口
  │    ├─ 调用失败 → 回退到内置规则引擎
  │    └─ 成功 ↓
  └─ 内置 AI 或未配置 → 直接使用内置规则引擎
  ↓
生成总结内容（携带 used_external_ai 标识）
  ↓
upsert 到 work_summaries 表（按 user+project+dimension+period_start 唯一）
  ↓
返回前端展示
  ↓
结束
```

5.4 数据导出流程

```plain
开始
  ↓
用户进入"工时日报"页面，点击"导出"
  ↓
选择维度（day/week/month/year/custom）、格式（excel/csv/markdown）、可选项目
  ↓
GET /api/time-entries/export?dimension&format&date&...
  ↓
[权限] 普通用户仅导出自己的记录，管理员可导出全员
  ↓
[查询] 按日期范围拉取工时记录（含项目与用户关联）
  ├─ 无数据 → 返回 404 错误 → 返回
  └─ 有数据 ↓
按格式生成文件（xlsx / csv / markdown）
  ↓
返回二进制流（Content-Disposition: attachment）
  ↓
浏览器下载
  ↓
结束
```

---

# 6. 系统约束
## 6.1 数据约束
+ 单日单人总工时 ≤ 8 小时（硬编码上限，配置项 `daily_hour_limit` 预留扩展）
+ 项目总工时 ≤ 预估工时 estimated_hours
+ 项目成员才能填报项目工时（管理员除外）
+ 用户名和邮箱全局唯一
+ 工时记录业务唯一性：用户 + 项目 + 日期（应用层合并保证，非数据库约束）
+ PostgreSQL date 列禁止空字符串，必须为合法日期或 NULL

## 6.2 权限约束
+ 普通用户仅查看参与的项目数据
+ 普通用户仅操作自己的工时记录与工作总结
+ PM 和管理员可创建项目
+ 仅管理员可访问用户管理和系统配置
+ 禁用用户无法登录
+ 待审核用户登录时给予提示

## 6.3 业务约束
+ 项目负责人必须为 PM 或管理员角色
+ 系统保留账号 `admin` 不可作为项目负责人或成员（前后端双重校验）
+ 历史工时补填需系统配置开启 `allow_historical_entry`
+ AI 功能需系统配置开启 `enable_ai_feature`
+ 删除项目级联删除相关工时与成员关系（外键 cascade）
+ 工作总结维度必须为 `week/last_week/month/last_month/year/last_year/custom` 之一（数据库 CHECK 约束）

---

# 7. 未来规划
## 7.1 已实现（v1.0.0，2026-08-04 发布）
+ 报表导出（Excel/CSV/Markdown，按日/周/月/年/自定义维度）
+ AI 工作总结（周/月/年/自定义维度，内置 + 外部 AI 双模式）
+ AI 风险分析与项目总结
+ 跨平台启动脚本（Windows/macOS/Linux）
+ 工时合并机制（同日同项目多次填报自动累加）

## 7.2 已实现（v1.1，2026-08 ~ 2026-09）
+ **工时日报月历视图重构**：取代传统表格分页，6 行 42 格月历网格，**周日起始**
+ **批量多日期填报**：`POST /api/time-entries/batch`，弹窗动态多行，逐行返回 `daily_total`/`is_below_minimum`
+ **填报/追加一体化弹窗**：点击月历日期直接填报/追加/编辑，三种模式无缝切换
+ **填报默认值（UX）**：工时默认 8、项目默认最近、今日完成默认填前日 `tomorrow_plan`
+ **月历协调事项标签**：当日有 `coordination_matters` 显示黄色「协调」标签
+ **AI 配置校验与连接测试**：`/api/ai/config-status` 与 `/api/ai/test-connection`
+ **工作总结 AI 来源标识**：`used_external_ai` 字段区分外部/内置
+ **模板配置功能**（详见 2.1.8）：周期总结前可选模板，AI 按字段输出
+ **月度目标功能**（详见 2.1.9）：月初录入目标/产出/拆解/验收/风险，**支持拖拽排序+优先级展示**
+ **周报汇总功能**（详见 2.1.10）：按月划分周，计划承接，AI 生成实际完成（含兜底）；**计划从月度目标添加、实完从本周计划勾选、输出产物附件+链接**
+ **绩效评分功能**（详见 2.1.11）：AI 五维评分，总分 100 加权
+ **月度工作期配置**（详见 2.1.12）：admin 设置起止日期，修复跨月周重复归属 bug
+ **文件存储抽象层**（详见 2.1.13）：local / S3 / R2 / MinIO 适配，环境变量切换
+ **三模块导出**：月度目标 / 周报 / 绩效 支持 excel / csv / markdown 导出

## 7.3 短期优化（规划中）
+ PM 跨项目聚合视图
+ 绩效导出 PDF
+ 周报邮件推送
+ 模板字段依赖联动
+ 历史周报补录回填
+ 接入更多 AI 服务（OpenAI/Claude）
+ 增加工时审批流程
+ 增加邮件通知功能
+ 优化移动端体验

## 7.4 中期扩展 (3-6 个月)
+ 支持多语言国际化
+ 增加移动 APP
+ 集成第三方服务（钉钉/企业微信）
+ 增加数据备份和恢复
+ 实现 SaaS 多租户模式

## 7.5 长期愿景 (6-12 个月)
+ 智能工时预测
+ 资源排程优化
+ 项目全生命周期管理
+ BI 数据分析平台
+ 开放 API 生态

---

# 8. 附录
## 8.1 术语表
表格

| **术语** | **定义** |
| --- | --- |
| <font style="color:rgb(79, 79, 79);">PM</font> | <font style="color:rgb(79, 79, 79);">Project Manager，项目负责人</font> |
| <font style="color:rgb(79, 79, 79);">JWT</font> | <font style="color:rgb(79, 79, 79);">JSON Web Token，用于身份认证（基于 jose 库）</font> |
| <font style="color:rgb(79, 79, 79);">ORM</font> | <font style="color:rgb(79, 79, 79);">Object-Relational Mapping，对象关系映射（Drizzle ORM）</font> |
| <font style="color:rgb(79, 79, 79);">RBAC</font> | <font style="color:rgb(79, 79, 79);">Role-Based Access Control，基于角色的访问控制</font> |
| <font style="color:rgb(79, 79, 79);">App Router</font> | <font style="color:rgb(79, 79, 79);">Next.js 13+ 的路由系统，基于文件系统的服务端路由</font> |
| <font style="color:rgb(79, 79, 79);">Route Handler</font> | <font style="color:rgb(79, 79, 79);">Next.js App Router 中的后端 API 处理单元</font> |
| <font style="color:rgb(79, 79, 79);">Supabase</font> | <font style="color:rgb(79, 79, 79);">基于 PostgreSQL 的开源 BaaS，提供数据库与认证</font> |
| <font style="color:rgb(79, 79, 79);">shadcn/ui</font> | <font style="color:rgb(79, 79, 79);">基于 Radix UI 的可复制粘贴 React 组件库</font> |
| <font style="color:rgb(79, 79, 79);">pnpm</font> | <font style="color:rgb(79, 79, 79);">高效磁盘空间的 Node.js 包管理器</font> |


## 8.2 参考文档
+ 项目规范：[AGENTS.md](file:///f:/Users/liuyang/Projects/work_track_system/AGENTS.md)
+ 设计规范：[DESIGN.md](file:///f:/Users/liuyang/Projects/work_track_system/DESIGN.md)
+ 更新日志：[CHANGELOG.md](file:///f:/Users/liuyang/Projects/work_track_system/CHANGELOG.md)
+ 快速开始：[README.md](file:///f:/Users/liuyang/Projects/work_track_system/README.md)
+ 数据库初始化：[scripts/init-database.sql](file:///f:/Users/liuyang/Projects/work_track_system/scripts/init-database.sql)
+ 环境变量模板：[.env.example](file:///f:/Users/liuyang/Projects/work_track_system/.env.example)
+ GitHub 仓库：https://github.com/yeunglau/work_track_system
+ v1.0.0 发布：https://github.com/yeunglau/work_track_system/releases/tag/v1.0.0

## 8.3 变更记录
表格

| **版本** | **日期** | **变更内容** | **作者** |
| --- | --- | --- | --- |
| <font style="color:rgb(79, 79, 79);">v1.0</font> | <font style="color:rgb(79, 79, 79);">2026-01-23</font> | <font style="color:rgb(79, 79, 79);">初始版本（基于代码分析生成）</font> | <font style="color:rgb(79, 79, 79);">基于代码分析</font> |
| <font style="color:rgb(79, 79, 79);">v1.1</font> | <font style="color:rgb(79, 79, 79);">2026-09-02</font> | <font style="color:rgb(79, 79, 79);">根据 v1.0.0 实际实现全面校准：技术栈修正为 Next.js 16 + React 19 + shadcn/ui + Supabase/PostgreSQL + Drizzle ORM；数据库表字段修正（projects.owner_id 替代 pm_id，新增 work_summaries 与 health_check 表）；新增数据导出（Excel/CSV/Markdown）与 AI 工作总结模块；修正工时填报合并机制、admin 保留账号约束、PostgreSQL 空日期转 NULL 等业务规则；系统配置阈值单位由 0-1 修正为 0-100 百分比；界面由 Ant Design 调整为 shadcn/ui + Tailwind 设计规范；未来规划补充"新需求.txt"中的模板配置、月度目标、周报汇总、绩效评分四项</font> | <font style="color:rgb(79, 79, 79);">基于 v1.0.0 源码校准</font> |
| <font style="color:rgb(79, 79, 79);">v1.2</font> | <font style="color:rgb(79, 79, 79);">2026-09-08</font> | <font style="color:rgb(79, 79, 79);">合并 PRD.md / 新需求.md / 111.md 至本文档，并补录 v1.1 期间已上线功能：① 工时日报重构为月历视图（周日起始、6 行 42 格、协调事项黄色标签、点击日期直填/追加/编辑一体化弹窗）；② 批量多日期填报 POST /api/time-entries/batch；③ 填报 UX 默认值（工时 8、项目取最近、今日完成取前日 tomorrow_plan）；④ 模板配置（2.1.8 + 2.2 工作总结页接入）；⑤ 月度目标含拖拽排序+优先级（2.1.9 + 2.2.11）；⑥ 周报汇总含从目标添加计划、实完勾选、输出产物附件+链接（2.1.10 + 2.2.12）；⑦ 绩效评分（2.1.11 + 2.2.13）；⑧ 月度工作期配置修复跨月周重复（2.1.12 + 2.2.14）；⑨ 文件存储抽象层 local/S3/R2/MinIO（2.1.13 + 4.1 技术栈补 @dnd-kit + @aws-sdk/client-s3）；⑩ 月度目标/周报/绩效三模块导出 excel/csv/markdown；⑪ 数据库新增 report_templates / monthly_goals / weekly_reports / performance_scores / month_work_config 五张表；⑫ 未来规划 7.2 标记已实现，7.3 重新规划短期优化</font> | <font style="color:rgb(79, 79, 79);">基于 v1.1 源码校准</font> |


---

# 9. 联系方式
如有需求疑问或建议，请联系产品团队。
