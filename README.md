# WorkTrack 工时管理系统

> 基于 Next.js 16 + React 19 + shadcn/ui + Supabase 的全栈工时管理系统
>
> 支持 Windows / macOS / Linux 三大平台

## ✨ 功能特性

- 📊 **工时日报管理**：填报、编辑、查询每日工时
- 👥 **项目管理**：项目创建、成员管理、进度跟踪
- 📈 **数据看板**：项目工时统计、成员投入分析
- 📤 **数据导出**：支持按日/周/月/年维度导出 Excel/CSV/Markdown
- 🤖 **AI 工作总结**：基于日报数据自动生成周/月/年工作总结
- ⚙️ **系统配置**：灵活的系统参数管理
- 🔐 **权限控制**：管理员/项目经理/普通用户三级权限

## 📦 安装部署

### 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | ≥ 18（推荐 20 LTS） | [下载地址](https://nodejs.org) |
| pnpm | ≥ 9 | `npm install -g pnpm` |
| Supabase 账号 | 免费 | [注册地址](https://supabase.com) |

> 💡 无需本地数据库，使用 Supabase 云端 PostgreSQL 即可。

### 三平台快速安装

#### Windows

```powershell
# 1. 解压发布包后进入项目目录
cd worktrack

# 2. 复制环境变量模板并编辑
copy .env.example .env.local
notepad .env.local   # 填入 Supabase 凭证

# 3. 安装依赖
pnpm install

# 4. 初始化数据库（见下方"数据库初始化"章节）

# 5. 启动开发服务器
pnpm dev
```

#### macOS / Linux

```bash
# 1. 解压发布包后进入项目目录
cd worktrack

# 2. 复制环境变量模板并编辑
cp .env.example .env.local
nano .env.local   # 填入 Supabase 凭证

# 3. 安装依赖
pnpm install

# 4. 初始化数据库（见下方"数据库初始化"章节）

# 5. 启动开发服务器
pnpm dev
```

启动后访问 [http://localhost:5000](http://localhost:5000) 即可。

### 环境变量配置

编辑 `.env.local` 文件，填入以下必填项：

```env
# Supabase 数据库连接（必填）
COZE_SUPABASE_URL=https://your-project-ref.supabase.co
COZE_SUPABASE_ANON_KEY=your-anon-key-here
COZE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# JWT 密钥（必填，使用强随机字符串）
JWT_SECRET=please-replace-with-a-strong-random-string

# 服务端口（可选，默认 5000）
DEPLOY_RUN_PORT=5000
```

**获取 Supabase 凭证步骤**：
1. 前往 [supabase.com](https://supabase.com) 注册并创建项目
2. 进入 Project Settings → API
3. 复制 Project URL、anon key、service_role key

> ⚠️ **安全提示**：service_role key 拥有数据库完全访问权限，切勿泄露到前端或公共仓库。

### 数据库初始化

在 Supabase 控制台的 **SQL Editor** 中执行 `scripts/init-database.sql` 脚本：

1. 打开 Supabase 项目 Dashboard
2. 左侧菜单选择 **SQL Editor**
3. 点击 **New query**
4. 复制 `scripts/init-database.sql` 全部内容粘贴
5. 点击 **Run** 执行

执行成功后会创建以下表：
- `users` - 用户表
- `projects` - 项目表
- `project_members` - 项目成员表
- `time_entries` - 工时记录表
- `system_configs` - 系统配置表
- `health_check` - 健康检查表

### 初始化演示数据（可选）

启动应用后，调用种子接口创建演示账号：

```bash
# 使用 curl
curl -X POST http://localhost:5000/api/seed

# 或者 Windows PowerShell
Invoke-WebRequest -Uri http://localhost:5000/api/seed -Method POST
```

创建的演示账号：

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 项目经理 | pm | pm123 |
| 普通用户 | user | user123 |
| 普通用户 | user2 | user123 |

> ⚠️ **生产环境**：请务必修改默认密码，或直接删除 `/api/seed` 路由。

## 🚀 使用指南

### 开发模式

```bash
pnpm dev
```

支持热更新，修改代码后页面自动刷新。

### 生产构建

```bash
pnpm build
pnpm start
```

### 类型检查与代码规范

```bash
pnpm ts-check    # TypeScript 类型检查
pnpm lint        # ESLint 代码检查
pnpm validate    # 同时执行以上两项
```

### 端口修改

默认端口 5000，可通过环境变量修改：

```bash
# Windows (PowerShell)
$env:DEPLOY_RUN_PORT="3000"; pnpm dev

# macOS / Linux
DEPLOY_RUN_PORT=3000 pnpm dev
```

## 📂 项目结构

```
worktrack/
├── public/                      # 静态资源
├── scripts/                     # 跨平台脚本
│   ├── build.js                # 构建脚本（跨平台）
│   ├── dev.js                  # 开发启动（跨平台）
│   ├── start.js                # 生产启动（跨平台）
│   └── init-database.sql       # 数据库初始化 SQL
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (dashboard)/        # 后台管理页面
│   │   │   ├── projects/       # 项目管理
│   │   │   ├── time-entries/   # 工时日报
│   │   │   ├── work-summary/   # 工作总结
│   │   │   ├── settings/       # 系统设置
│   │   │   └── ...
│   │   ├── api/                # API 路由
│   │   │   ├── auth/           # 认证
│   │   │   ├── time-entries/   # 工时接口
│   │   │   ├── projects/       # 项目接口
│   │   │   ├── ai/             # AI 工作总结
│   │   │   └── ...
│   │   └── layout.tsx          # 根布局
│   ├── components/ui/           # shadcn/ui 组件库
│   ├── lib/                     # 工具库
│   │   ├── ai-service.ts       # AI 服务
│   │   ├── summary-optimizer.ts # 总结优化器
│   │   ├── api.ts              # API 客户端
│   │   └── ...
│   └── storage/database/        # 数据库层
├── .env.example                 # 环境变量模板
├── .gitattributes               # Git 换行符规范
├── AGENTS.md                    # 项目规范文档
├── DESIGN.md                    # 设计文档
└── package.json
```

## 🔧 技术栈

- **框架**：Next.js 16 (App Router)
- **UI**：React 19 + shadcn/ui (Radix UI)
- **样式**：Tailwind CSS 4
- **语言**：TypeScript 5
- **数据库**：Supabase (PostgreSQL)
- **包管理**：pnpm
- **AI**：支持 OpenAI 兼容 API（DeepSeek、通义千问等）

## 📋 常见问题

### Q: 启动时报端口被占用？

A: 修改 `.env.local` 中的 `DEPLOY_RUN_PORT`，或通过环境变量指定端口。

### Q: 数据库连接失败？

A: 检查 `.env.local` 中的 Supabase 凭证是否正确，确认网络可访问 Supabase 服务。

### Q: AI 工作总结功能如何启用？

A: 在「系统设置」页面配置 AI 服务，或在 `.env.local` 中添加：
```env
AI_PROVIDER=external
AI_API_ENDPOINT=https://api.deepseek.com
AI_API_KEY=your-api-key
AI_MODEL=deepseek-v4-flash
```

### Q: 如何升级到新版本？

A: 1) 备份 `.env.local`；2) 解压新版本覆盖代码；3) 恢复 `.env.local`；4) 执行 `pnpm install`；5) 如有数据库迁移，按 CHANGELOG 指引执行 SQL。

## 📝 开发规范

详见 [AGENTS.md](./AGENTS.md)。

## 📄 License

MIT
