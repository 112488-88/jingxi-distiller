'use strict';
/*
 * desktop/tools/e2e2.js —— 第二轮：存储/导出/桌宠/历史/解析这些「原件功能」
 * 用法：electron tools/e2e2.js
 */
const { app, BrowserWindow, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-smoke');

const FAKE = JSON.stringify({
  conclusion: '测试结论：项目按期上线。',
  points: [{ text: '张伟负责接口联调', evidence: '张伟：接口我搞定' }],
  todos: [{ owner: '张伟', task: '完成接口联调', deadline: '周三' }],
  risks: [{ text: '设计稿没定稿', evidence: '还在改' }],
});

const results = [];
const rec = (n, ok, d) => {
  results.push({ name: n, ok: !!ok, detail: d || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + String(d).slice(0, 300) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let win;
async function js(body) {
  return win.webContents.executeJavaScript(
    `(async () => { try { ${body} } catch (e) { return { __err: String((e && e.stack) || e) }; } })()`, true);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  win = new BrowserWindow({ width: 1400, height: 950, show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  const cErr = [];
  win.webContents.on('console-message', (_e, l, m, line, src) => {
    if (l >= 2 && !/Electron Security Warning/.test(m)) cErr.push(m + ' @' + src);
  });
  const dl = [];
  win.webContents.session.on('will-download', (e, item) => {
    dl.push(item.getFilename());
    try { item.setSavePath(path.join(OUT, 'dl-' + item.getFilename())); } catch (_) {}
  });

  await win.loadFile(path.join(ROOT, 'app', 'index.html'));
  await sleep(1200);

  // A) IndexedDB / localStorage / OPFS 可用性
  let r = await js(`
    const idb = await new Promise(res => {
      let done = false;
      try {
        const req = indexedDB.open('__probe', 1);
        req.onsuccess = () => { req.result.close(); done = true; res('ok'); };
        req.onerror = () => res('error:' + (req.error && req.error.name));
        req.onblocked = () => res('blocked');
        setTimeout(() => { if (!done) res('timeout'); }, 3000);
      } catch (e) { res('throw:' + e.message); }
    });
    let ls = 'ok';
    try { localStorage.setItem('__p', '1'); localStorage.removeItem('__p'); } catch (e) { ls = 'ERR:' + e.message; }
    return { indexedDB: idb, localStorage: ls, protocol: location.protocol, origin: String(location.origin) };`);
  rec('IndexedDB 可用（桌宠自定义形象要用）', r && r.indexedDB === 'ok', JSON.stringify(r));

  // B) stub fetch + 提炼，产出卡片
  await js(`
    window.__stubbed = true;
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: ${JSON.stringify(FAKE)} }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return true;`);
  await js(`
    const setVal = (el, v) => {
      const proto = (el instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(document.getElementById('keyInput'), 'sk-test-1234567890abcdef');
    document.getElementById('keySave').click();
    setVal(document.getElementById('input'), '张伟：接口我搞定。李娜：设计稿还在改。');
    return true;`);
  await sleep(400);
  await js(`document.getElementById('run').click(); return true;`);
  await sleep(2200);

  // C) 卡片「展开原文」/ 要点展开
  r = await js(`
    const before = document.querySelectorAll('[hidden]').length;
    const toggles = Array.from(document.querySelectorAll('button, summary, .ref-toggle, [data-act]')).filter(x => /原文|依据|展开/.test((x.textContent || '') + (x.title || '')));
    let clicked = 0;
    for (const t of toggles.slice(0, 3)) { try { t.click(); clicked++; } catch (e) {} }
    await new Promise(r => setTimeout(r, 400));
    return { toggles: toggles.length, clicked, labels: toggles.map(x => (x.textContent || x.title || '').trim().slice(0, 12)).slice(0, 5) };`);
  rec('要点/原文展开入口', r && r.toggles > 0, JSON.stringify(r));

  // D) 导出：先关掉 File System Access，走下载兜底
  r = await js(`
    window.__pickerCalls = 0;
    const realPicker = window.showSaveFilePicker;
    window.showSaveFilePicker = undefined;
    document.getElementById('petTools').querySelector('[data-tool="md"]').click();
    await new Promise(r => setTimeout(r, 1500));
    window.showSaveFilePicker = realPicker;
    return { ok: true };`);
  await sleep(800);
  rec('导出 卡片.md（下载兜底）', dl.length > 0, 'downloads=' + JSON.stringify(dl));

  // E) 导出：picker 真调用会怎样（只调用不等待，记录错误）
  r = await js(`
    let err = null;
    try {
      const p = window.showSaveFilePicker({ suggestedName: 'probe.txt' });
      if (p && p.catch) p.catch(e => { window.__pickerErr = String(e && e.name) + ':' + String(e && e.message); });
    } catch (e) { err = String(e && e.name) + ':' + e.message; }
    await new Promise(r => setTimeout(r, 1200));
    return { syncErr: err, asyncErr: window.__pickerErr || null };`);
  rec('showSaveFilePicker 在 file:// 下可用', r && !r.syncErr && !r.asyncErr, JSON.stringify(r));

  // F) 桌宠自定义形象（IndexedDB 落盘 + 渲染）
  r = await js(`
    document.getElementById('petSkinBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const input = document.getElementById('petSkinFile');
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));
    const file = new File([bytes], 'skin.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 2500));
    const img = document.getElementById('petImg');
    return {
      imgHidden: img ? img.hidden : 'no-img',
      imgSrcLen: img && img.src ? img.src.length : 0,
      svgHidden: document.getElementById('petSvg').hidden,
      lsSkin: (() => { try { return (localStorage.getItem('msgcard.petskin') || '').slice(0, 40); } catch (e) { return 'ERR'; } })()
    };`);
  rec('桌宠上传自定义形象', r && r.imgSrcLen > 100, JSON.stringify(r));

  // G) 历史回看
  r = await js(`
    const items = Array.from(document.querySelectorAll('[data-hist], .hist-item, .history-item, .hist-row'));
    if (!items.length) return { count: 0, html: (document.querySelector('.sidebar') || document.body).innerHTML.slice(0, 120) };
    items[0].click();
    await new Promise(r => setTimeout(r, 600));
    return { count: items.length, bodyHasConclusion: document.body.innerText.indexOf('项目按期上线') >= 0 };`);
  rec('历史列表存在并能回看', r && r.count > 0, JSON.stringify(r));

  // H) 打印入口
  r = await js(`
    return { print: typeof window.print, cssPrint: !!Array.from(document.styleSheets).length };`);
  rec('window.print 可用', r && r.print === 'function', JSON.stringify(r));

  // I) 解析器：拖入微信 CSV，检查 chip 与预览
  r = await js(`
    document.getElementById('clear') && document.getElementById('clear').click();
    await new Promise(r => setTimeout(r, 300));
    const csv = 'StrTime,StrContent,NickName\\n2026-11-12 14:30:27,接口我周三前搞定,张伟\\n2026-11-12 14:31:02,设计稿周四给,李娜\\n';
    const dt = new DataTransfer();
    dt.items.add(new File([csv], 'wechat.csv', { type: 'text/csv' }));
    ['dragenter','dragover','drop'].forEach(t => window.dispatchEvent(new DragEvent(t, { bubbles: true, dataTransfer: dt })));
    await new Promise(r => setTimeout(r, 1500));
    const txt = document.body.innerText;
    return { hasWechatChip: /微信/.test(txt), hasPreview: /预览|条目|条消息|共 /.test(txt), inputLen: document.getElementById('input').value.length };`);
  rec('微信 CSV 识别', r && r.hasWechatChip, JSON.stringify(r));

  // J) 桌宠问答（stub fetch，验证气泡有回复）
  r = await js(`
    document.getElementById('pet').click();
    await new Promise(r => setTimeout(r, 400));
    const inp = document.getElementById('petInput');
    const proto = HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, '押金多少钱');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('petAskForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 2000));
    const log = document.getElementById('petLog');
    return { logLen: log ? log.innerText.length : 0, text: log ? log.innerText.slice(0, 120) : '' };`);
  rec('桌宠问答', r && r.logLen > 0, JSON.stringify(r));

  rec('无控制台错误', cErr.length === 0, cErr.slice(0, 3).join(' | '));

  fs.writeFileSync(path.join(OUT, 'e2e2-report.json'), JSON.stringify({ results, cErr, downloads: dl }, null, 2));
  const fail = results.filter(x => !x.ok);
  console.log(`\n汇总：${results.length - fail.length}/${results.length} 通过`);
  if (fail.length) console.log('失败项：' + fail.map(f => f.name).join('、'));
  app.exit(fail.length ? 2 : 0);
}

app.whenReady().then(main).catch(e => { console.error('CRASH', e && e.stack || e); app.exit(3); });
