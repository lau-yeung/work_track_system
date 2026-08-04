#!/usr/bin/env node
/**
 * 跨平台构建脚本
 * 支持 Windows / macOS / Linux
 */

const { spawn } = require('child_process');
const isWindows = process.platform === 'win32';

function run(cmd, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n\x1b[36m▶ ${label}\x1b[0m`);
    const child = spawn(isWindows ? `${cmd}.cmd` : cmd, args, {
      stdio: 'inherit',
      shell: isWindows,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${label} 失败 (exit ${code})`));
      resolve();
    });
  });
}

async function main() {
  try {
    await run('pnpm', ['install', '--prefer-frozen-lockfile'], '安装依赖');
    await run('pnpm', ['next', 'build'], '构建 Next.js 项目');
    await run('pnpm', ['tsup', 'src/server.ts', '--format', 'cjs', '--platform', 'node', '--target', 'node20', '--outDir', 'dist', '--no-splitting', '--no-minify'], '打包服务端');
    console.log('\n\x1b[32m✓ 构建成功！\x1b[0m\n');
  } catch (err) {
    console.error(`\n\x1b[31m✗ ${err.message}\x1b[0m\n`);
    process.exit(1);
  }
}

main();
