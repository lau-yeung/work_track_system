# 文档信息
表格

| **项目** | **内容** |
| --- | --- |
| <font style="color:rgb(79, 79, 79);">产品名称</font> | <font style="color:rgb(79, 79, 79);">工时管理系统 (WorkTrack / Time Management System)</font> |
| <font style="color:rgb(79, 79, 79);">文档版本</font> | <font style="color:rgb(79, 79, 79);">v1.1</font> |
| <font style="color:rgb(79, 79, 79);">创建日期</font> | <font style="color:rgb(79, 79, 79);">2026年1月23日</font> |
| <font style="color:rgb(79, 79, 79);">最近更新</font> | <font style="color:rgb(79, 79, 79);">2026年9月2日</font> |
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
**功能描述：**团队成员每日填报工时，记录工作内容和进度，支持同日同项目多次填报自动合并。

**详细需求：**

1. **工时填报字段**
+ 项目 project_id（必填，仅显示用户参与的项目）
+ 工作日期 work_date（必填，日期选择器）
+ 工时数 hours（必填，0-24 小时，numeric(4,1)）
+ 备注 remarks（可选）
+ 今日完成工作 completed_work（必填，多行文本）
+ 需协调事宜 coordination_matters（可选，多行文本）
+ 明日计划工作 tomorrow_plan（必填，多行文本）
2. 工时校验规则
+ **单日总工时限制：**单人单日所有项目总工时不超过 8 小时（超过返回当前已填报数）
+ **项目总工时限制：**项目累计工时不得超过预估工时 estimated_hours
+ **项目成员校验：**只有项目成员（或管理员）才能填报该项目工时
+ **历史补填限制：**系统配置 `allow_historical_entry` 开关控制是否允许补填历史工时
+ **工时范围校验：**hours 必须为数字，且 0 < hours ≤ 24
3. 工时记录管理
+ 支持创建、编辑、删除工时记录
+ 编辑时锁定项目和日期，仅可修改工时和内容
+ 普通用户只能操作自己的工时记录
+ 管理员可操作任意工时记录
4. **工时记录合并机制**（核心特性）
+ 同一用户 + 同一项目 + 同一日期再次填报时，**不报错、不覆盖**，而是触发**合并更新**：
    - `hours` 累加
    - `completed_work`、`coordination_matters`、`tomorrow_plan` 以**编号列表**追加（`1. xxx\n2. xxx`），保留历史条目
    - `remarks` 以换行简单追加
+ 合并后接口返回 `merged: true`，前端 toast 提示"工时已合并"
5. **日总提醒**
+ 填报成功后接口返回 `daily_total`（当日工时合计）与 `is_below_minimum`（是否低于 8 小时）
+ 前端展示日总提醒，便于员工自查当日工时是否填满
6. **工时列表展示**
+ 表格展示，支持分页
+ 字段：项目名称、工作日期、工时、备注、今日完成工作、填报人、操作
+ 普通用户仅看自己的记录，管理员看全部
+ 支持按项目、日期范围筛选

**业务规则：**

+ 同一用户、同一项目、同一日期的记录通过应用层合并机制保证唯一性（数据库层不强制唯一约束）
+ 删除工时记录时无需再校验项目成员资格（仅权限校验）
+ 被移出项目的成员的历史工时记录保留，但无法再创建新记录

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

+ 页面标题 + "填报工时"按钮 + "导出"按钮
+ 工时记录表格
+ 填报/编辑工时弹窗

**表格列：**

+ 项目名称
+ 工作日期
+ 工时（小时）
+ 备注
+ 今日完成工作
+ 填报人
+ 操作（编辑、删除按钮）

**弹窗表单：**

+ 项目（下拉选择，禁用编辑）
+ 工作日期（日期选择器，禁用编辑）
+ 工时（数字输入，0-24）
+ 今日完成工作（必填，多行文本）
+ 需协调事宜（可选，多行文本）
+ 明日计划工作（必填，多行文本）

**交互说明：**

+ 项目下拉仅显示用户参与的项目
+ 编辑时项目和日期不可修改
+ 删除使用 shadcn/ui AlertDialog 二次确认
+ 表单提交时校验工时限制（单日 8h、项目总工时）
+ **合并提示**：当日同项目再次填报触发合并，toast 提示"merged"
+ **日总提醒**：填报后展示当日合计工时，不足 8 小时给予提示

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

## 7.2 短期优化（规划中，源自 `新需求.txt`）
+ **模板配置功能**：生成周期总结前可选择自定义模板字段（如"本周计划"、"实际完成"、"未完成原因"、"下周计划"、"输出产物"），AI 报告按模板字段产出
+ **月度目标功能**：员工月初录入"月度目标"与"预期产出"，再拆解"计划任务"、"计划完成时间"、"验收标准"、"风险点"
+ **周报汇总功能**：第一周"本周计划"默认来自月度目标，后续周从上周"下周计划"复制；"实际完成"点击"生成周报"按钮调 AI 自动生成（含兜底逻辑）；按月工作日自动划分周
+ **绩效评分功能**：列表含"完成度(35%)、质量(30%)、进度(20%)、协作(10%)、纪律(5%)"五维度，AI 自动从周报"实际完成"生成"月度任务项"并打分（总分 100）
+ 接入更多 AI 服务（OpenAI/Claude）
+ 增加工时审批流程
+ 增加邮件通知功能
+ 优化移动端体验

## 7.3 中期扩展 (3-6 个月)
+ 支持多语言国际化
+ 增加移动 APP
+ 集成第三方服务（钉钉/企业微信）
+ 增加数据备份和恢复
+ 实现 SaaS 多租户模式

## 7.4 长期愿景 (6-12 个月)
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


---

# 9. 联系方式
如有需求疑问或建议，请联系产品团队。
