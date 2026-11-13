/*
 * desktop/scripts/prepare-app.mjs
 *
 * desktop/ 只是外壳：网页本体永远以仓库根目录那份为准（PWA 与桌面版共用同一套代码）。
 * 打包/调试前跑这个脚本，把根目录的网页文件复制到 desktop/app/。
 * desktop/app/ 已在 .gitignore 里，不进仓库，避免两份副本互相打架。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.resolve(HERE, '..', 'app');

// 网页本体（根目录）
const FILES = [
  'index.html',
  'style.css',
  'app.js',
  'parse.js',
  'prompts.js',
  'tone.js',
  'manifest.webmanifest',
];
const DIRS = ['parsers'];
// 额外搬进 app/ 的说明文档（菜单「打开使用说明」用）
const EXTRA = [['docs/manual.pdf', 'manual.pdf'], ['docs/manual.html', 'manual.html']];

function clean() {
  if (fs.existsSync(OUT)) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
}

let copied = 0;
function copyFile(from, to) {
  const src = path.resolve(REPO, from);
  if (!fs.existsSync(src)) {
    console.warn(`  ! 跳过（不存在）${from}`);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(src, to);
  copied++;
}

clean();
for (const f of FILES) copyFile(f, path.join(OUT, f));
for (const d of DIRS) {
  const dir = path.resolve(REPO, d);
  if (!fs.existsSync(dir)) continue;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile()) copyFile(path.join(d, e.name), path.join(OUT, d, e.name));
  }
}
for (const [from, to] of EXTRA) copyFile(from, path.join(OUT, to));

console.log(`desktop/app 准备好了：${copied} 个文件 → ${OUT}`);
