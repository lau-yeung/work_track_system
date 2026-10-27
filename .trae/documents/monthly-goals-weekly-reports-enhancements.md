# 月度目标 / 周报汇总 / 绩效 增强 + 日历改造 方案

## Context（背景与目标）

当前系统已完成月度目标批量录入、周报汇总、绩效评分的基础功能。本次在已实现基础上做 7 项增强/修复：

1. 月度目标列表支持上下拖拽排序、显示"优先级"字段（第一行=最高优先级）。
2. 月度目标、周报、绩效三个模块支持导出（Excel/CSV/Markdown）。
3. 周报"本周计划""下周计划"支持从月度目标中筛选添加。
4. 周报"实际完成"从"本周计划"中勾选展示。
5. 周报"输出产物"支持添加附件（文件）和链接。
6. 修复 bug：8 月第五周(0831~0904) 同时出现在 9 月第一周；新增"管理员自定义每月工作起止日期"，系统据此划定各周；周报须管理员先设定工作期后才生成。
7. 工时日历改为从周日起始。

用户决策：①输出产物附件采用**抽象存储层**（支持 R2 / MinIO / 本地 uploads，由环境变量切换，默认本地）；②每月工作起止日期为**全局按月配置**，由管理员手动设定后才生成周报。

## 复用现有实现

- 导出：复用 [src/app/api/time-entries/export/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/time-entries/export/route.ts) 的 xlsx 模式（`XLSX.utils.aoa_to_sheet` + `Content-Disposition: attachment`），三格式 excel/csv/markdown。
- 前端下载：复用 [src/lib/api.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/api.ts) 的 `apiDownload`。
- 周划分：改造 [src/lib/week-utils.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/week-utils.ts) 的 `getMonthWeeks`。
- 建表/迁移：复用 [src/lib/ai-init.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/ai-init.ts) 的 DDL + 迁移 SQL + `NOTIFY pgrst, 'reload schema'` 机制（DATABASE_URL 已配置，自动可达）。
- 日历组件：[src/components/ui/calendar.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/components/ui/calendar.tsx)（react-day-picker v9，设 `weekStartsOn`）。

---

## 一、共享：存储抽象层（服务附件上传）

新建 `src/storage/` 目录：

- `src/storage/types.ts`：定义接口 `FileStorage` —— `upload(buffer, key, contentType): Promise<{url, key}>`、`getPublicUrl(key): string`、`delete(key): Promise<void>`。
- `src/storage/local-storage.ts`：写 `public/uploads/weekly-reports/<uuid>-<原名>`，返回 `/uploads/...` 静态 URL（Next.js 自动托管 public）。
- `src/storage/s3-storage.ts`：基于已装 `@aws-sdk/client-s3`，兼容 R2 / MinIO / AWS S3。读取环境变量 `S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_PUBLIC_URL`，`putObject` 上传，`S3_PUBLIC_URL + key` 生成公开 URL。
- `src/storage/index.ts`：工厂 `getStorage()`，按 `STORAGE_DRIVER`（`local` | `s3` | `r2` | `minio`）选择；未配置或缺失凭证时回退 `local`，保证零配置可用。
- 新建上传路由 `src/app/api/weekly-reports/upload/route.ts`：`POST` multipart（`formData.get('file')`），鉴权后调 `getStorage().upload(...)`，返回 `{url, name, size}`。大小/类型白名单限制（如 ≤20MB，文档/图片/压缩包）。

`.env.example` 增补存储层可选变量说明。

---

## 二、数据库迁移（ai-init.ts 增 DDL + 迁移块）

在 [src/lib/ai-init.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/ai-init.ts) 新增：

1. **monthly_goals 加排序字段**
   ```sql
   ALTER TABLE monthly_goals ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
   CREATE INDEX IF NOT EXISTS idx_monthly_goals_sort ON monthly_goals(user_id, period_year, period_month, sort_order);
   ```

2. **weekly_reports.output_artifacts 改 JSONB**（当前 TEXT）
   ```sql
   ALTER TABLE weekly_reports ALTER COLUMN output_artifacts TYPE JSONB USING COALESCE(NULLIF(output_artifacts,'')::jsonb, '[]'::jsonb);
   ALTER TABLE weekly_reports ALTER COLUMN output_artifacts SET DEFAULT '[]'::jsonb;
   ```

3. **月度工作期配置表（全局按月）**
   ```sql
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
   ```
   末尾 `NOTIFY pgrst, 'reload schema'`。

> 这些 SQL 进 ai-init.ts 的 `NEW_FEATURES_DDL` 与独立迁移块，服务启动自动执行（DATABASE_URL 已通）。

---

## 三、功能 1：月度目标拖拽排序 + 优先级

**依赖**：`pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`（React 19 兼容，shadcn 生态标准选择）。

**API**
- [src/app/api/monthly-goals/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/monthly-goals/route.ts)：GET 排序改为 `sort_order ASC, id ASC`（覆盖现 `period_year,period_month` 倒序）。
- 新增 `src/app/api/monthly-goals/reorder/route.ts`：`PUT`，body `{items:[{id, sort_order}]}`，鉴权（admin 或本人），批量 `UPDATE monthly_goals SET sort_order=$ WHERE id=$`（单事务循环）。仅允许重排本人目标（admin 可重排任意）。

**前端** [src/app/(dashboard)/monthly-goals/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/monthly-goals/page.tsx)
- 表头首列改为"优先级"，展示 `idx+1`，第 1 行加 "最高" 徽标（Badge）。
- 用 `DndContext` + `SortableContext` 包裹 `TableBody`，每行 `TableRow` 外包 `SortableRow`（拖拽手柄 GripVertical 图标列）。
- `onDragEnd`：本地重排 → 调 `PUT /api/monthly-goals/reorder` → 失败回滚 + toast。
- 录入对话框 [monthly-goal-dialog.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/monthly-goals/monthly-goal-dialog.tsx)：批量插入时 `sort_order` 取当前最大值+1 递增赋值（后端 POST 兜底）。

---

## 四、功能 2：导出（月度目标 / 周报 / 绩效）

复用 [time-entries/export/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/time-entries/export/route.ts) 的 `buildExcelWorkbook/buildCSV/buildMarkdown` 模式。

**新路由**（各 `GET ?year=&month=&userId=&format=excel|csv|markdown`）：
- `src/app/api/monthly-goals/export/route.ts`：列 负责人/目标/预期产出/任务拆解/计划完成时间/验收标准/风险点/优先级。
- `src/app/api/weekly-reports/export/route.ts`：按周分块，列 周次/周期/本周计划(done/未)/实际完成/未完成原因/下周计划/输出产物。
- `src/app/api/performance/export/route.ts`：列 负责人/月度任务/工时/五维评分/总分/说明。

**前端**：三页面顶部各加"导出"下拉按钮（DropdownMenu：Excel/CSV/Markdown），调 `apiDownload` 触发对应路由。

---

## 五、功能 3：周报本周/下周计划 从月度目标添加

**前端** [weekly-reports/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/weekly-reports/page.tsx) 编辑对话框：
- "本周计划""下周计划"区域各加按钮"从月度目标添加"，打开 `Popover`/`Dialog`。
- 弹层内 `apiFetch('/api/monthly-goals?year=&month=')` 拉本人当月目标列表（含优先级排序），多选（Checkbox）→ 确认后把选中项追加为 `PlanItem {id:newItemId(), text: goal.goals, done:false}`。
- 下周计划同理（通常取当月剩余未完成目标或下月目标，先按当月实现）。

---

## 六、功能 4：周报实际完成 从本周计划勾选

**前端** 编辑对话框"实际完成"区：
- 渲染 `editorPlan`（本周计划项）每条带 Checkbox；勾选即 `PlanItem.done=true`。
- 勾选项即为"实际完成"展示内容；未勾选项归入"未完成"。
- 保存时 `actual_completed`（TEXT）由勾选项 text 用换行拼接自动生成，保持与绩效生成 API（读 actual_completed 文本）兼容。
- 非编辑态展示视图：本周计划 done 项以高亮"已完成"展示，构成实际完成区。

**API** [weekly-reports/[id]/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/weekly-reports/[id]/route.ts)：PUT 已接收 `this_week_plan`，新增接收并保存 `actual_completed`（沿用现有字段）。

---

## 七、功能 5：输出产物 附件 + 链接

**DB**：`output_artifacts` 改 JSONB（见迁移），存 `[{type:'link'|'file', name, url, size?}]`。

**前端** 编辑对话框"输出产物"区：
- 列表展示已添加项（文件图标/链接图标 + 名称 + 删除）。
- 添加链接：输入 名称+URL → 追加 `{type:'link'}`。
- 添加文件：`<input type=file>` → `POST /api/weekly-reports/upload` → 追加 `{type:'file', url, name, size}`。
- 保存时 PUT `output_artifacts` 为 JSON 数组。

**API**：`PUT /api/weekly-reports/[id]` 接收 `output_artifacts` JSON 数组并存 JSONB。

---

## 八、功能 6：跨月周划分 bug 修复 + 管理员工作期配置

**根因**：[week-utils.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/lib/week-utils.ts) 当前"一周归属本月=周一在本月 或（首周）周五在本月且周一在上月"，导致 0831~0904 同周既属 8 月(周一 8/31 在 8 月)又属 9 月(9 月首工作日 9/1=周二回溯周一=8/31)。

**修复 + 新特性**：`getMonthWeeks(year, month, opts?: {workStart?, workEnd?})`
- 有 `workStart/workEnd`：从 `mondayOf(workStart)` 起，按周一~周五推进，仅当 `cursor(周一) <= workEnd` 时入列；周归属唯一由该月配置窗口决定，杜绝跨月重复。
- 无配置（默认兜底）：改为"**周一在本月**才算归属"（删除"周五在本月且周一在上月"分支），8/31 周只属 8 月；9 月首周从 9 月首个周一算起。彻底消除重复。

**月度工作期配置（管理员）**
- `src/app/api/month-work-config/route.ts`：`GET ?year=&month=` 返回配置；`PUT {period_year,period_month,work_start,work_end}`（admin 鉴权）upsert。
- `src/app/api/month-work-config/[year]/[month]/route.ts`：`GET`/`DELETE`（可选）。
- [src/app/api/weekly-reports/init/route.ts](file:///f:/Users/liuyang/Projects/work_track_system/src/app/api/weekly-reports/init/route.ts)：先查 `month_work_config`，**无配置则返回 409 + 提示"管理员未设置本月工作期，无法生成周报"**；有配置则 `getMonthWeeks(year, month, config)` 划周。
- 周报页面 [weekly-reports/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/weekly-reports/page.tsx)：admin 可见一张"本月工作期"卡片，设置 work_start/work_end（DatePicker 两个），保存调 PUT；非 admin 只读展示。无配置时周报区提示"待管理员设置工作期"。

---

## 九、功能 7：日历从周日起始

**工时日历** [time-entries/page.tsx](file:///f:/Users/liuyang/Projects/work_track_system/src/app/(dashboard)/time-entries/page.tsx)：
- `getMonthGridDates`：将"周一为起点"改为"周日为起点"——`firstDayIdx = new Date(year, month, 1).getDay()`（周日=0），`start = new Date(year, month, 1 - firstDayIdx)`。
- 表头列顺序改为 日/一/二/三/四/五/六。

**shadcn Calendar**：所有 `<Calendar>` 用法加 `weekStartsOn={0}`（react-day-picker v9 支持）。搜索 `Calendar` 使用点统一修改。

---

## 验证（端到端）

1. `pnpm ts-check` 通过。
2. `pnpm build` 通过。
3. 重启服务（DATABASE_URL 已通，迁移自动执行）。
4. 浏览器逐项验证：
   - 月度目标：拖拽换序后刷新顺序保持；优先级列第 1 行"最高"。
   - 三个页面导出 Excel/CSV/Markdown 下载正常。
   - 周报编辑：从月度目标添加计划项；实际完成勾选联动；输出产物加链接+上传文件并下载。
   - 管理员设本月工作期(如 2026-09: 09-01~09-30) → 周报生成按窗口分周；8/31 周不再出现在 9 月。
   - 工时日历首列为周日。
5. 直连验证迁移 SQL（`node` pg 脚本或 Supabase SQL Editor）：`sort_order` 列存在、`output_artifacts` 类型为 JSONB、`month_work_config` 表存在、PostgREST schema 已刷新。

## 不做（范围外）
- 不改动绩效评分 AI 生成算法（仅复用其读取的 actual_completed 文本）。
- 不实现 S3/R2/MinIO 凭证自动配置（留环境变量，默认本地可用）。
- 不做周报跨月数据迁移（历史 output_artifacts TEXT 用 `COALESCE` 兜底为 `[]`）。
