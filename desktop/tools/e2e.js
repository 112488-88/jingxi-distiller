'use strict';
/*
 * desktop/tools/e2e.js —— 桌面版功能回归：真点按钮，stub 掉 DeepSeek，不花额度
 * 用法：electron tools/e2e.js
 * 每一步都在渲染进程里 try/catch，失败会打印真实堆栈
 */
const { app, BrowserWindow, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-smoke');

const FAKE_CONTENT = JSON.stringify({
  conclusion: '测试结论：项目按期上线，接口联调是唯一卡点。',
  points: [
    { text: '同事A负责接口联调，周三前完成', evidence: '同事A：接口我周三前搞定' },
    { text: '设计稿预计本周四定稿', evidence: '同事B：设计稿周四给' },
  ],
  todos: [{ owner: '同事A', task: '完成接口联调', deadline: '周三' }],
  risks: [{ text: '设计稿还没定稿，可能拖到下周', evidence: '设计稿还在改' }],
});

const results = [];
function rec(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 300) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let win;

// 在渲染进程里执行代码，异常也能拿回来
async function evalJs(body) {
  const wrapped = `(async () => { try { ${body} } catch (e) { return { __err: String((e && e.stack) || e) }; } })()`;
  const out = await win.webContents.executeJavaScript(wrapped, true);
  return out;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  win = new BrowserWindow({
    width: 1400,
    height: 950,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, message, line, src) => {
    if (level >= 2 && !/Electron Security Warning/.test(message)) consoleErrors.push(message + ' @' + src + ':' + line);
  });

  let downloads = 0;
  win.webContents.session.on('will-download', (e, item) => {
    downloads++;
    try { item.setSavePath(path.join(OUT, 'download-' + item.getFilename())); } catch (_) {}
  });

  await win.loadFile(path.join(ROOT, 'app', 'index.html'));
  await sleep(1200);

  // 0) 骨架
  let r = await evalJs(`
    return {
      title: document.title,
      run: !!document.getElementById('run'),
      input: !!document.getElementById('input'),
      pet: !!document.getElementById('petSvg'),
      keyInput: !!document.getElementById('keyInput'),
      protocol: location.protocol
    };`);
  rec('页面骨架', r && r.run && r.input && r.pet, JSON.stringify(r));

  // 1) stub fetch
  r = await evalJs(`
    if (window.__stubbed) return { already: true };
    window.__fetchCalls = [];
    window.fetch = function (url, opts) {
      window.__fetchCalls.push({ url: String(url), hasAuth: !!(opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization)) });
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: ${JSON.stringify(FAKE_CONTENT)} }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1200, completion_tokens: 260, total_tokens: 1460 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    window.__stubbed = true;
    return { stubbed: true, fetchType: typeof window.fetch };`);
  rec('stub fetch', r && r.stubbed, JSON.stringify(r));

  // 2) 填 Key + 原文
  r = await evalJs(`
    const setVal = (el, v) => {
      const proto = (el instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const keyEl = document.getElementById('keyInput');
    if (keyEl) setVal(keyEl, 'sk-test-1234567890abcdef');
    const saveBtn = document.getElementById('keySave');
    if (saveBtn) saveBtn.click();
    const ta = document.getElementById('input');
    setVal(ta, '同事A：接口我周三前搞定。同事B：设计稿周四给，还在改。');
    return { chars: ta.value.length, keySaved: !!localStorage.getItem('msgcard.apikey') };`);
  rec('填 Key / 原文', r && r.chars > 10, JSON.stringify(r));
  await sleep(500);

  // 3) 点提炼
  r = await evalJs(`document.getElementById('run').click(); return { clicked: true };`);
  await sleep(2500);

  r = await evalJs(`
    const txt = document.body.innerText;
    return {
      fetchCalls: (window.__fetchCalls || []).length,
      hasConclusion: txt.indexOf('项目按期上线') >= 0,
      hasPoint: txt.indexOf('接口联调') >= 0,
      hasTodo: txt.indexOf('完成接口联调') >= 0,
      hasRisk: txt.indexOf('设计稿还没定稿') >= 0,
      hist: (() => { try { return (JSON.parse(localStorage.getItem('msgcard.history') || '[]') || []).length; } catch (e) { return 'ERR:' + e.message; } })(),
      bodyLen: txt.length
    };`);
  rec('提炼：请求发出', r && r.fetchCalls === 1, JSON.stringify({ calls: r && r.fetchCalls, err: r && r.__err }));
  rec('提炼：结论/要点/待办/风险渲染', r && r.hasConclusion && r.hasPoint && r.hasTodo && r.hasRisk, JSON.stringify(r));
  rec('提炼：写历史', r && r.hist === 1, 'hist=' + (r && r.hist));

  fs.writeFileSync(path.join(OUT, 'e2e-card.png'), (await win.capturePage()).toPNG());

  // 4) 复制卡片
  clipboard.writeText('');
  r = await evalJs(`
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => /复制卡片|复制全部|复制/.test(x.textContent || '') && !/诊断/.test(x.textContent || '')) 
           || btns.find(x => /复制卡片/.test(x.title || ''));
    if (!b) return { found: false, all: btns.map(x => (x.textContent || '').trim()).slice(0, 20) };
    b.click();
    return { found: true, label: (b.textContent || '').trim() };`);
  await sleep(900);
  const clip = clipboard.readText();
  rec('复制卡片', r && r.found && clip.length > 10, `label=${(r && r.label) || '-'} clipLen=${clip.length}`);

  // 5) 导出
  r = await evalJs(`
    const els = Array.from(document.querySelectorAll('button, a'));
    const hits = els.filter(x => /导出|下载/.test((x.textContent || '') + ' ' + (x.title || '')));
    const out = { count: hits.length, labels: hits.map(x => (x.textContent || x.title || '').trim()).slice(0, 8), errors: [] };
    for (const b of hits.slice(0, 2)) {
      try { b.click(); } catch (e) { out.errors.push(String(e && e.message || e)); }
      await new Promise(r => setTimeout(r, 700));
    }
    return out;`);
  await sleep(1500);
  rec('导出按钮', r && r.count > 0, JSON.stringify({ labels: r && r.labels, downloads, err: r && r.__err }));
  rec('导出无异常', r && r.errors && r.errors.length === 0, JSON.stringify(r && r.errors));

  // 6) 拖文件
  r = await evalJs(`
    const before = document.getElementById('input').value;
    const dt = new DataTransfer();
    dt.items.add(new File(['2026-11-12 14:30:27 甲同学(10001)\\n今天下午三点开会，把报价单发一下。'], 'sample.txt', { type: 'text/plain' }));
    ['dragenter','dragover','drop'].forEach(t => window.dispatchEvent(new DragEvent(t, { bubbles: true, dataTransfer: dt })));
    await new Promise(r => setTimeout(r, 1200));
    const after = document.getElementById('input').value;
    return { beforeLen: before.length, afterLen: after.length, sample: after.slice(0, 30) };`);
  rec('拖文件载入', r && r.afterLen >= 10, JSON.stringify(r));

  // 7) 主题
  r = await evalJs(`
    const before = document.documentElement.dataset.theme;
    document.getElementById('themeToggle').click();
    await new Promise(r => setTimeout(r, 300));
    return { before, after: document.documentElement.dataset.theme };`);
  rec('深浅色切换', r && r.before !== r.after, JSON.stringify(r));

  // 8) 桌宠
  r = await evalJs(`
    const layer = document.getElementById('petLayer') || document.getElementById('pet');
    const v1 = getComputedStyle(layer).display;
    document.getElementById('petToggle').click();
    await new Promise(r => setTimeout(r, 300));
    const v2 = getComputedStyle(layer).display;
    document.getElementById('petToggle').click();
    await new Promise(r => setTimeout(r, 300));
    return { v1, v2 };`);
  rec('桌宠显隐', r && r.v1 !== r.v2, JSON.stringify(r));

  // 9) 新建
  r = await evalJs(`
    document.getElementById('newBtn').click();
    await new Promise(r => setTimeout(r, 400));
    return { inputLen: document.getElementById('input').value.length };`);
  rec('新建提炼', r && r.inputLen === 0, JSON.stringify(r));

  // 10) Ctrl+Enter
  r = await evalJs(`
    const ta = document.getElementById('input');
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, '丙同学：预算 12 万，下周一前报。');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const before = (window.__fetchCalls || []).length;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true }));
    await new Promise(r => setTimeout(r, 2000));
    return { before, after: (window.__fetchCalls || []).length };`);
  rec('Ctrl+Enter 提炼', r && r.after > r.before, JSON.stringify(r));

  // 11) 控制台错误
  rec('无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 4).join(' | '));

  const env = await evalJs(`
    return {
      secureContext: window.isSecureContext,
      clipboardApi: !!(navigator.clipboard && navigator.clipboard.writeText),
      saveFilePicker: typeof window.showSaveFilePicker,
      protocol: location.protocol,
      lsKeys: (() => { try { return Object.keys(localStorage).length; } catch (e) { return 'ERR'; } })()
    };`);
  console.log('ENV ' + JSON.stringify(env));

  const fail = results.filter((x) => !x.ok);
  console.log(`\n汇总：${results.length - fail.length}/${results.length} 通过`);
  if (fail.length) console.log('失败项：' + fail.map((f) => f.name).join('、'));
  fs.writeFileSync(path.join(OUT, 'e2e-report.json'), JSON.stringify({ results, env, consoleErrors }, null, 2));
  app.exit(fail.length ? 2 : 0);
}

app.whenReady().then(main).catch((e) => {
  console.error('E2E CRASH', e && e.stack || e);
  app.exit(3);
});
