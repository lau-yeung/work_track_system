#!/usr/bin/env node
/**
 * 跨平台启动脚本 - 生产模式
 * 支持 Windows / macOS / Linux
 *
 * 用法：
 *   node scripts/start.js
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || process.env.DEPLOY_RUN_PORT || '5000';
const isWindows = process.platform === 'win32';

function killPortIfListening(port) {
  return new Promise((resolve) => {
    if (isWindows) {
      exec(`netstat -ano | findstr :${port}`, (err, stdout) => {
        if (err || !stdout) return resolve();
        const pids = new Set();
        stdout.split('\n').forEach((line) => {
          const match = line.match(/\s+(\d+)\s*$/);
          if (match) {
            const pid = match[1];
            if (pid !== '0') pids.add(pid);
          }
        });
        pids.forEach((pid) => {
          try { exec(`taskkill /F /PID ${pid}`); } catch (e) {}
        });
        setTimeout(resolve, 1000);
      });
    } else {
      exec(`lsof -t -i:${port}`, (err, stdout) => {
        if (err || !stdout.trim()) return resolve();
        stdout.trim().split('\n').forEach((pid) => {
          try { exec(`kill -9 ${pid}`); } catch (e) {}
        });
        setTimeout(resolve, 1000);
      });
    }
  });
}

function checkEnvironment() {
  const envFile = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile)) {
    console.error('\x1b[31m[错误] 未找到 .env.local 文件\x1b[0m');
    console.error('  请复制 .env.example 为 .env.local 并填写配置');
    process.exit(1);
  }
}

async function main() {
  checkEnvironment();

  console.log(`\x1b[36m[工时管理系统]\x1b[0m 启动生产服务器 (端口 ${PORT})`);

  await killPortIfListening(PORT);

  const cmd = isWindows ? 'npx.cmd' : 'npx';
  const child = spawn(cmd, ['tsx', 'src/server.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT, DEPLOY_RUN_PORT: PORT },
    shell: isWindows,
  });

  child.on('error', (err) => {
    console.error('\x1b[31m启动失败：\x1b[0m', err.message);
    process.exit(1);
  });

  child.on('close', (code) => process.exit(code || 0));
}

main();
