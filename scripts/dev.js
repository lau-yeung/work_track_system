#!/usr/bin/env node
/**
 * 跨平台启动脚本 - 开发模式
 * 支持 Windows / macOS / Linux
 *
 * 用法：
 *   node scripts/dev.js          # 默认端口 5000
 *   PORT=3000 node scripts/dev.js # 自定义端口
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000';
const isWindows = process.platform === 'win32';

/**
 * 终止占用指定端口的进程（跨平台）
 */
function killPortIfListening(port) {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
        if (err || !stdout) {
          console.log(`端口 ${port} 空闲。`);
          return resolve();
        }
        const pids = new Set();
        stdout.split('\n').forEach((line) => {
          const match = line.match(/\s+(\d+)\s*$/);
          if (match) {
            const pid = match[1];
            if (pid !== '0') pids.add(pid);
          }
        });
        if (pids.size === 0) {
          console.log(`端口 ${port} 空闲。`);
          return resolve();
        }
        console.log(`端口 ${port} 被占用 (PID: ${[...pids].join(', ')})，正在清理...`);
        pids.forEach((pid) => {
          try {
            exec(`taskkill /F /PID ${pid}`);
          } catch (e) {
            // 忽略错误
          }
        });
        setTimeout(resolve, 1000);
      });
    } else {
      exec(`lsof -t -i:${port}`, (err, stdout) => {
        if (err || !stdout.trim()) {
          console.log(`端口 ${port} 空闲。`);
          return resolve();
        }
        const pids = stdout.trim().split('\n');
        console.log(`端口 ${port} 被占用 (PID: ${pids.join(', ')})，正在清理...`);
        pids.forEach((pid) => {
          try {
            exec(`kill -9 ${pid}`);
          } catch (e) {
            // 忽略错误
          }
        });
        setTimeout(resolve, 1000);
      });
    }
  });
}

/**
 * 检查环境变量是否已配置
 */
function checkEnvironment() {
  const envFile = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile)) {
    console.error('\x1b[31m[错误] 未找到 .env.local 文件\x1b[0m');
    console.error('');
    console.error('  请复制 .env.example 为 .env.local 并填写配置：');
    console.error('    cp .env.example .env.local   (macOS/Linux)');
    console.error('    copy .env.example .env.local (Windows)');
    console.error('');
    process.exit(1);
  }

  const content = fs.readFileSync(envFile, 'utf8');
  if (
    content.includes('your-project-ref') ||
    content.includes('your-service-role-key') ||
    content.includes('please-replace-with')
  ) {
    console.error('\x1b[33m[警告] .env.local 中包含占位符，请先替换为真实的 Supabase 凭证\x1b[0m');
    console.error('');
    console.error('  编辑 .env.local 填入以下必填项：');
    console.error('    COZE_SUPABASE_URL');
    console.error('    COZE_SUPABASE_SERVICE_ROLE_KEY');
    console.error('    JWT_SECRET');
    console.error('');
    const shouldContinue = process.argv.includes('--force');
    if (!shouldContinue) {
      process.exit(1);
    }
    console.warn('  已通过 --force 跳过检查，继续启动...\n');
  }
}

async function main() {
  checkEnvironment();

  console.log(`\x1b[36m[工时管理系统]\x1b[0m 启动开发服务器 (端口 ${PORT})`);
  console.log('');

  await killPortIfListening(PORT);

  const cmd = isWindows ? 'npx.cmd' : 'npx';
  const child = spawn(cmd, ['tsx', 'watch', 'src/server.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT, DEPLOY_RUN_PORT: PORT },
    shell: isWindows,
  });

  child.on('error', (err) => {
    console.error('\x1b[31m启动失败：\x1b[0m', err.message);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

main();
