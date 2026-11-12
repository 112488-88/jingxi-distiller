/*
 * scripts/check-privacy.mjs —— 提交前扫一遍，防止把本机信息 / 密钥带进仓库
 *
 * 用法：
 *   node scripts/check-privacy.mjs            # 扫「已暂存」的文件（pre-commit 钩子就这么调）
 *   node scripts/check-privacy.mjs --all      # 扫工作区所有文件
 *   node scripts/check-privacy.mjs --history  # 扫全部历史提交（发版前跑一次）
 *
 * 命中任何一条就以非零码退出，提交会被拦下。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const MODE = process.argv.includes('--history') ? 'history'
  : process.argv.includes('--all') ? 'all' : 'staged';

// 只扫这些文本类型；二进制（png/pdf/docx）跳过——它们由人工看
const TEXT_EXT = /\.(md|markdown|js|mjs|cjs|ts|json|html|css|yml|yaml|txt|sh|ps1|py|toml|ini|conf|webmanifest)$/i;

const RULES = [
  { name: 'API Key / Token', re: /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,})\b/,
    ere: '(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})' },
  { name: 'Windows 用户目录', re: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/,
    ere: '[A-Za-z]:[\\/]+Users[\\/]' },
  { name: '本机工作目录', re: /[A-Za-z]:[\\/]+(鲸汐工坊|surfcore)/,
    ere: '[A-Za-z]:[\\/]+(鲸汐工坊|surfcore)' },
  { name: '邮箱', re: /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/,
    ere: '[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+[.])+[A-Za-z]{2,}' },
  { name: '疑似手机号', re: /1[3-9]\d{9}/, ere: '[^0-9]1[3-9][0-9]{9}[^0-9]' },
  { name: '疑似身份证', re: /\d{17}[\dXx]/, ere: '[^0-9][0-9]{17}[0-9Xx][^0-9]' }
];

function scanText(text) {
  const hits = [];
  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) hits.push({ rule: rule.name, sample: m[0].slice(0, 40) });
  }
  return hits;
}

function lineOf(text, sample) {
  const i = text.indexOf(sample);
  return i < 0 ? 0 : text.slice(0, i).split('\n').length;
}

let bad = 0;

if (MODE === 'staged' || MODE === 'all') {
  let files = [];
  if (MODE === 'staged') {
    files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } else {
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['.git', 'node_modules', 'dist'].includes(e.name)) continue;
        const p = dir + '/' + e.name;
        if (e.isDirectory()) walk(p); else files.push(p.replace(/^\.\//, ''));
      }
    };
    walk('.');
  }

  for (const f of files) {
    if (!TEXT_EXT.test(f) || !fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const h of scanText(text)) {
      bad++;
      console.error(`  ✗ ${f}:${lineOf(text, h.sample)}  ${h.rule} → ${h.sample}`);
    }
  }
}

if (MODE === 'history') {
  const commits = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const c of commits) {
    for (const rule of RULES) {
      try {
        const out = execFileSync('git', ['grep', '-n', '-I', '-E', rule.ere || rule.re.source, c, '--', '.'], { encoding: 'utf8' });
        if (out.trim()) {
          bad++;
          console.error(`  ✗ ${c.slice(0, 7)}  ${rule.name}`);
          console.error('    ' + out.trim().split('\n').slice(0, 2).join('\n    '));
        }
      } catch { /* 没命中 */ }
    }
  }
}

if (bad) {
  console.error(`\n发现 ${bad} 处可能泄露本机信息的内容，已阻止提交。`);
  console.error('确认无误再提交可用：git commit --no-verify');
  process.exit(1);
}
console.log(`隐私检查通过（${MODE}）`);
