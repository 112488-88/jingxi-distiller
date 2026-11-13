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
  'README.md',
  'LICENSE'
];

// 说明书改名成中文，放进根目录，收包的人一眼能看到
const RENAMED = [
  ['docs/manual.pdf', '使用说明.pdf'],
  ['docs/manual/manual.html', '使用说明.html']
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
for (const [rel, asName] of RENAMED) {
  const from = path.join(ROOT, rel);
  if (!fs.existsSync(from)) { missing.push(rel); continue; }
  fs.copyFileSync(from, path.join(STAGE, asName));
}

fs.writeFileSync(path.join(STAGE, '先看我.txt'), [
  '鲸汐提炼器（分享版）',
  '====================',
  '',
  '三步：',
  '1. 解压到任意文件夹（别放在需要管理员权限的目录）',
  '2. 双击 index.html，用 Chrome 或 Edge 打开（IE 和很老的浏览器不行）',
  '3. 右上角钥匙图标 → 填一个 DeepSeek API Key',
  '   申请：platform.deepseek.com（工具本身免费，调接口要充值，几块钱能用很久）',
  '   → 粘一段聊天记录 / 邮件 / 通知 → 选类型 → 一键提炼',
  '',
  '没 Key 怎么办',
  '· 找发给你这个包的人要，或者自己申请',
  '· 嫌每次填麻烦：把整个文件夹放到一个 https 网址上（GitHub Pages 之类），',
  '  再打开就能填一次记住，还能「安装成 App、离线打开」',
  '',
  '关于隐私',
  '· 纯前端工具，不上传任何东西；只有你粘的原文会发给 DeepSeek',
  '· 历史、Key、桌宠形象都存在你自己浏览器里',
  '· 别把身份证号、银行卡、密码原文粘进去，先打码',
  '',
  '说明书：使用说明.pdf（手机上也能看 使用说明.html）',
  '出问题：翻到使用说明最后一节「出问题先看这张表」',
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
