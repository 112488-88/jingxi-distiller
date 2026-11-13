'use strict';
/* 两阶段持久化自测：phase=write 写入 localStorage/窗口状态，phase=read 复查 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) || '--phase=read').split('=')[1];
const ROOT = path.join(__dirname, '..');

async function main() {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadFile(path.join(ROOT, 'app', 'index.html'));
  await new Promise((r) => setTimeout(r, 800));

  if (PHASE === 'write') {
    const r = await win.webContents.executeJavaScript(
      `(() => { localStorage.setItem('msgcard.apikey', 'sk-smoke-123'); localStorage.setItem('msgcard.history', JSON.stringify([{ id: 'x', at: Date.now(), title: '持久化测试' }])); return localStorage.getItem('msgcard.apikey'); })()`,
      true
    );
    console.log('WRITE ok ->', r, '| userData =', app.getPath('userData'));
  } else {
    const r = await win.webContents.executeJavaScript(
      `(() => ({ key: localStorage.getItem('msgcard.apikey'), hist: localStorage.getItem('msgcard.history') }))()`,
      true
    );
    console.log('READ ->', JSON.stringify(r));
    // 测试完成后清掉，别把假数据留在用户环境里
    await win.webContents.executeJavaScript(`localStorage.removeItem('msgcard.apikey'); localStorage.removeItem('msgcard.history'); true`, true);
    console.log('cleanup done');
  }
  app.exit(0);
}

app.whenReady().then(main);
