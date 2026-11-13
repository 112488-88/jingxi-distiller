'use strict';
/* 桌面版冒烟测试：加载页面 → 截图 → 探测关键能力（本地存储/剪贴板/另存为/DeepSeek 连通） */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-smoke');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    show: true,
    backgroundColor: '#f5f6f8',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on('did-fail-load', (_e, c, d) => errors.push(`load-fail ${c} ${d}`));

  await win.loadFile(path.join(ROOT, 'app', 'index.html'));
  await new Promise((r) => setTimeout(r, 3000));

  const img = await win.capturePage();
  fs.writeFileSync(path.join(OUT, 'ui.png'), img.toPNG());

  const probe = await win.webContents.executeJavaScript(
    `(async () => {
      const out = {};
      out.title = document.title;
      out.newBtn = !!document.getElementById('newBtn');
      out.textarea = !!document.querySelector('textarea');
      out.pet = !!document.getElementById('petSvg');
      try { localStorage.setItem('__smoke', '1'); out.localStorage = localStorage.getItem('__smoke') === '1'; localStorage.removeItem('__smoke'); }
      catch (e) { out.localStorage = 'ERR:' + e.message; }
      out.clipboardApi = !!(navigator.clipboard && navigator.clipboard.writeText);
      try { await navigator.clipboard.writeText('smoke'); out.clipboardWrite = 'ok'; }
      catch (e) { out.clipboardWrite = 'ERR:' + e.message; }
      out.saveFilePicker = typeof window.showSaveFilePicker;
      out.secureContext = window.isSecureContext;
      try {
        const r = await fetch('https://api.deepseek.com/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        });
        out.deepseek = 'HTTP ' + r.status;   // 401 = 通、无 CORS 问题
      } catch (e) { out.deepseek = 'THROW ' + e.message; }
      return out;
    })()`,
    true
  );

  console.log('PROBE ' + JSON.stringify(probe, null, 2));
  console.log('CONSOLE_ERRORS ' + JSON.stringify(errors.slice(0, 10), null, 2));
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('SMOKE FAIL', e);
  app.exit(1);
});
