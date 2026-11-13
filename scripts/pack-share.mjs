/*
 * scripts/pack-share.mjs —— 打包「可直接发给别人」的 zip
 *
 * 用法：npm run pack        （输出到 dist/）
 * 原则：只带运行必需的文件 + 说明书，绝不带 .git / deploy / dist 自身
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = path.join(ROOT, 'dist');
const STAGE = path.join(OUTDIR, 'jingxi-distiller');

const FILES = [
  'index.html',
  'style.css',
  'app.js',
  'parse.js',
  'tone.js',
  'prompts.js',
  'manifest.webmanifest',
  'sw.js',
  'parsers/merged-forward.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/favicon-32.png',
  'docs/manual.pdf',
  'docs/manual/manual.html',
  'README.md',
  'LICENSE'
];

const d = new Date();
const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const ZIP = path.join(OUTDIR, `jingxi-distiller-${stamp}.zip`);

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

const missing = [];
for (const rel of FILES) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) { missing.push(rel); continue; }
  const to = path.join(STAGE, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.writeFileSync(path.join(STAGE, 'START-HERE.txt'), [
  '鲸汐提炼器（分享版）',
  '====================',
  '',
  '用法：',
  '1. 解压到任意文件夹',
  '2. 双击 index.html（用 Chrome 或 Edge）',
  '3. 右上角钥匙图标 → 填自己的 DeepSeek API Key（platform.deepseek.com 申请）',
  '4. 粘一段聊天记录/邮件/通知 → 选类型 → 一键提炼',
  '',
  '注意：',
  '· 纯前端，数据不上传；只有你粘的原文会发给 DeepSeek',
  '· 历史 / Key / 桌宠形象都存在你自己浏览器里',
  '· 想要「安装成 App + 离线」，需要放到 http(s) 上打开（GitHub Pages 等）',
  '· 详细说明看 docs/manual.pdf',
  '',
  '打包于 ' + stamp
].join('\r\n'), 'utf8');

if (fs.existsSync(ZIP)) fs.rmSync(ZIP, { force: true });

if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${ZIP}' -Force`], { stdio: 'inherit' });
} else {
  execFileSync('zip', ['-r', '-q', ZIP, '.'], { cwd: STAGE, stdio: 'inherit' });
}

console.log(`打包完成：${ZIP}`);
console.log(`大小：${(fs.statSync(ZIP).size / 1024 / 1024).toFixed(2)} MB`);
if (missing.length) console.warn('缺失文件：', missing);
