#!/usr/bin/env node
/**
 * 发布包打包脚本
 * 生成跨平台的发布压缩包（zip + tar.gz）
 *
 * 用法：
 *   node scripts/pack.js [version]
 *
 * 默认版本号从 package.json 读取
 *
 * 依赖：bsdtar（Windows 10+ / macOS / Linux 均自带）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist-release');

// 需要排除的文件/目录（测试数据、敏感信息、构建产物、内部脚本）
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.next',
  'dist',
  'dist-release',
  '.git',
  '.env.local',
  '.env.production',
  '.env.*.local',
  'tsconfig.tsbuildinfo',
  '*.tsbuildinfo',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '.vscode',
  '.idea',
  'coverage',
  '.turbo',
  '.cache',
  'projects',          // 内部测试项目数据
  'start-dev.bat',     // 内部开发脚本
  'start.bat',         // 内部启动脚本
  'scripts/heartbeat.bat',
  'scripts/setup-heartbeat.bat',
  '.coze',
  '.cozeproj',
  '.coze-logs',
  '.preview',
  '*.tmp',
  '*.temp',
];

function getVersion() {
  const argVersion = process.argv[2];
  if (argVersion) return argVersion.startsWith('v') ? argVersion : `v${argVersion}`;

  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  return `v${pkg.version}`;
}

function buildExcludeArgs() {
  return EXCLUDE_PATTERNS.map((p) => `--exclude=${p}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 使用 bsdtar 打包（Windows 10+ / macOS / Linux 均自带）
 * bsdtar 通过 --format 指定输出格式，通过 --exclude 排除文件
 */
function packWithTar(version, format, ext) {
  const outputFile = path.join(distDir, `worktrack-${version}.${ext}`);
  console.log(`\n📦 生成 ${ext}: ${path.basename(outputFile)}`);

  const excludes = buildExcludeArgs();
  // --format=zip 生成 zip；gzip 由 .gz 扩展名自动推断
  const formatArg = format === 'zip' ? '--format=zip' : '';
  const compressFlag = format === 'gzip' ? '-z' : '';
  const cmd = [
    'tar',
    formatArg,
    '-c',
    compressFlag,
    `-f "${outputFile}"`,
    ...excludes,
    '-C',
    `"${projectRoot}"`,
    '.',
  ].filter(Boolean).join(' ');

  try {
    execSync(cmd, { stdio: 'inherit' });
    const stats = fs.statSync(outputFile);
    console.log(`   ✓ ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    return outputFile;
  } catch (err) {
    console.error(`   ✗ ${ext} 打包失败:`, err.message);
    return null;
  }
}

function generateChecksum(filePath) {
  try {
    const isWindows = process.platform === 'win32';
    let hash;
    if (isWindows) {
      hash = execSync(`powershell -NoProfile -Command "(Get-FileHash '${filePath}' -Algorithm SHA256).Hash"`, { encoding: 'utf8' }).trim();
    } else {
      hash = execSync(`shasum -a 256 "${filePath}"`, { encoding: 'utf8' }).split(' ')[0];
    }
    return hash.toLowerCase();
  } catch {
    return null;
  }
}

function main() {
  const version = getVersion();
  console.log(`\n🚀 开始打包 WorkTrack ${version}\n`);

  ensureDir(distDir);

  // 清理旧的发布包（仅清理 worktrack-* 开头的文件，保留 _tmp 等目录）
  if (fs.existsSync(distDir)) {
    fs.readdirSync(distDir).forEach((f) => {
      const fullPath = path.join(distDir, f);
      if (f.startsWith('worktrack-') && fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
      }
    });
  }

  // 清理可能残留的临时目录
  const tmpDir = path.join(distDir, '_tmp_worktrack');
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // 使用 bsdtar 生成两种格式
  const tarGzFile = packWithTar(version, 'gzip', 'tar.gz');
  const zipFile = packWithTar(version, 'zip', 'zip');

  // 生成校验和文件
  const checksums = [];
  if (tarGzFile) {
    const hash = generateChecksum(tarGzFile);
    if (hash) checksums.push(`${hash}  ${path.basename(tarGzFile)}`);
  }
  if (zipFile) {
    const hash = generateChecksum(zipFile);
    if (hash) checksums.push(`${hash}  ${path.basename(zipFile)}`);
  }

  if (checksums.length > 0) {
    const checksumFile = path.join(distDir, `worktrack-${version}-checksums.txt`);
    fs.writeFileSync(checksumFile, checksums.join('\n') + '\n');
    console.log(`\n📝 校验和文件: ${path.basename(checksumFile)}`);
  }

  console.log(`\n✅ 打包完成！\n`);
  console.log(`   输出目录: ${distDir}`);
  console.log(`   版本: ${version}\n`);

  // 列出所有发布文件
  console.log('   📋 发布文件列表:');
  fs.readdirSync(distDir).forEach((f) => {
    if (f.startsWith('worktrack-')) {
      const stat = fs.statSync(path.join(distDir, f));
      console.log(`      - ${f} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
    }
  });
  console.log('');
}

main();
