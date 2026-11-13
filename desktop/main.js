'use strict';

const { app, BrowserWindow, Menu, shell, session, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_DIR = path.join(__dirname, 'app');
const INDEX_FILE = path.join(APP_DIR, 'index.html');
const INDEX_URL = 'file:///' + INDEX_FILE.replace(/\\/g, '/');
const ICON = path.join(__dirname, 'build', 'icon.ico');
const APP_TITLE = '鲸汐提炼器';

let win = null;
let selfTestMode = false;

/* ── 窗口状态记忆 ───────────────────────────────────── */
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

function readState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')) || {}; } catch { return {}; }
}
function writeState(s) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(s));
  } catch { /* 忽略 */ }
}

/** 计算窗口尺寸与位置：不越出工作区；旧位置不靠谱就直接居中 */
function resolveBounds(st) {
  const { screen } = require('electron');
  const wa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(st.width || 1320, Math.round(wa.width * 0.94));
  const height = Math.min(st.height || 900, Math.round(wa.height * 0.94));
  if (typeof st.x !== 'number' || typeof st.y !== 'number') return { width, height };

  const area = screen.getDisplayMatching({ x: st.x, y: st.y, width, height }).workArea;
  const visibleEnough =
    st.x + width > area.x + 200 &&
    st.x < area.x + area.width - 200 &&
    st.y >= area.y - 10 &&
    st.y < area.y + area.height - 100;
  if (!visibleEnough) return { width, height };

  return {
    width,
    height,
    x: Math.max(area.x, Math.min(st.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(st.y, area.y + area.height - height)),
  };
}

/* ── 网络：给 DeepSeek 补 CORS 头（file:// 下 Origin 为 null 时兜底） ── */
function installNetworkTweaks() {
  const ses = session.defaultSession;

  ses.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || '';
    if (url.startsWith('https://api.deepseek.com')) {
      const headers = Object.assign({}, details.responseHeaders);
      headers['Access-Control-Allow-Origin'] = ['*'];
      headers['Access-Control-Allow-Headers'] = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET,POST,OPTIONS'];
      headers['Access-Control-Expose-Headers'] = ['*'];
      callback({ responseHeaders: headers });
      return;
    }
    callback({});
  });

  // 不做任何权限弹窗：剪贴板、另存为、全屏等一律放行
  ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(true));
  if (ses.setPermissionCheckHandler) ses.setPermissionCheckHandler(() => true);

  // 下载（导出 .md/.txt 走 blob 兜底路径时）：不覆盖同名文件，存完给「打开所在文件夹」
  ses.on('will-download', (_e, item) => {
    const dir = selfTestMode
      ? path.join(app.getPath('userData'), 'self-test-downloads')
      : app.getPath('downloads');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* 忽略 */ }
    const raw = item.getFilename() || '导出.txt';
    const ext = path.extname(raw);
    const base = path.basename(raw, ext);
    let target = path.join(dir, raw);
    for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${base} (${i})${ext}`);

    item.setSavePath(target);
    item.once('done', (_evt, state) => {
      if (state !== 'completed' || !win || win.isDestroyed()) return;
      if (selfTestMode) return; // 自检不打扰用户
      dialog
        .showMessageBox(win, {
          type: 'info',
          title: '已保存',
          message: '导出的文件已经存好',
          detail: target,
          buttons: ['打开所在文件夹', '好'],
          defaultId: 1,
          cancelId: 1,
        })
        .then((r) => {
          if (r.response === 0) shell.showItemInFolder(target);
        });
    });
  });
}

/* ── 菜单 ───────────────────────────────────────────── */
function resourceRoot() {
  return __dirname.includes('app.asar')
    ? __dirname.replace(/app\.asar$/, 'app.asar.unpacked')
    : __dirname;
}

function openGuide() {
  const root = resourceRoot();
  const pdf = path.join(root, 'app', 'manual.pdf');
  const html = path.join(root, 'app', 'manual.html');
  if (fs.existsSync(pdf)) shell.openPath(pdf);
  else if (fs.existsSync(html)) shell.openPath(html);
}

/* ── 打印 / 自检 ────────────────────────────────────── */
function printPage() {
  if (!win || win.isDestroyed()) return;
  win.webContents.print({ silent: false, printBackground: true }, (ok, reason) => {
    if (!ok && reason) console.warn('[打印]', reason);
  });
}

async function runSelfTest() {
  if (!win || win.isDestroyed()) return;
  const ask = await dialog.showMessageBox(win, {
    type: 'question',
    title: '运行自检',
    message: '会临时清空输入框，并用假数据点一遍主要按钮（不消耗 API 额度）',
    detail: '你的 Key、历史、主题、桌宠形象等本地数据会在自检结束后原样恢复。',
    buttons: ['开始自检', '取消'],
    defaultId: 0,
    cancelId: 1,
  });
  if (ask.response !== 0) return;

  let res;
  selfTestMode = true;
  try {
    const { CHECK_SOURCE } = require('./tools/selftest.js');
    res = await win.webContents.executeJavaScript(CHECK_SOURCE, true);
  } catch (e) {
    dialog.showErrorBox('自检没跑起来', String((e && e.message) || e));
    return;
  } finally {
    setTimeout(() => { selfTestMode = false; }, 4000);
  }

  const outFile = path.join(app.getPath('userData'), `self-test-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), version: app.getVersion(), ...res }, null, 2));
  } catch { /* 写不了就只显示结果 */ }

  const steps = (res && res.steps) || [];
  const fail = steps.filter((s) => !s.ok);
  dialog
    .showMessageBox(win, {
      type: fail.length ? 'warning' : 'info',
      title: '自检结果',
      message: `${steps.length - fail.length}/${steps.length} 项通过`,
      detail: fail.length
        ? `没通过的：${fail.map((f) => f.name).join('、')}\n\n报告：${outFile}`
        : `主要功能都正常。\n\n报告：${outFile}`,
      buttons: ['打开报告', '好'],
      defaultId: fail.length ? 0 : 1,
      cancelId: 1,
    })
    .then((r) => {
      if (r.response === 0) shell.openPath(outFile);
    });
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建提炼',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (win) win.webContents.executeJavaScript("document.getElementById('newBtn') && document.getElementById('newBtn').click();", true).catch(() => {});
          },
        },
        { type: 'separator' },
        { label: '打印卡片…', accelerator: 'CmdOrCtrl+P', click: printPage },
        { type: 'separator' },
        { label: '打开使用说明', click: openGuide },
        { label: '打开配置文件夹', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { label: '退出', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新载入', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '实际大小', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { label: '开发者工具', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '运行自检（不花 API 额度）', click: runSelfTest },
        { type: 'separator' },
        {
          label: '关于鲸汐提炼器',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: `关于${APP_TITLE}`,
              message: `${APP_TITLE} ${app.getVersion()}`,
              detail:
                '乱消息 → 一句话结论 / 关键信息 / 待办事项 / 风险与分歧。\n\n' +
                '纯本地运行，数据只存在这台电脑上；只有你粘贴的原文会发给 DeepSeek。\n' +
                `配置文件：${app.getPath('userData')}`,
              buttons: ['好'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ── 窗口 ───────────────────────────────────────────── */
function createWindow() {
  const st = readState();
  const b = resolveBounds(st);

  win = new BrowserWindow({
    width: b.width,
    height: b.height,
    ...(typeof b.x === 'number' ? { x: b.x, y: b.y } : {}),
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_TITLE,
    backgroundColor: '#f5f6f8',
    icon: fs.existsSync(ICON) ? ICON : undefined,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });

  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  win.loadFile(INDEX_FILE).catch((err) => {
    dialog.showErrorBox('页面加载失败', String(err));
  });

  // 站内导航限制：任何非本页链接都丢给系统浏览器
  const allowPrefixes = [INDEX_URL.replace(/index\.html$/i, ''), 'file:///' + APP_DIR.replace(/\\/g, '/') + '/'];
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowPrefixes.some((p) => url.startsWith(p))) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3) return; // 用户主动中断
    dialog.showErrorBox('加载出错', `${desc} (${code})\n${url}`);
  });

  // 右键菜单：网页版这块是浏览器白送的，桌面壳得自己给
  win.webContents.on('context-menu', (_e, params) => {
    const items = [];
    const flags = params.editFlags || {};

    if (params.isEditable) {
      items.push({ label: '撤销', role: 'undo', enabled: !!flags.canUndo });
      items.push({ label: '重做', role: 'redo', enabled: !!flags.canRedo });
      items.push({ type: 'separator' });
      items.push({ label: '剪切', role: 'cut', enabled: !!flags.canCut });
      items.push({ label: '复制', role: 'copy', enabled: !!flags.canCopy });
      items.push({ label: '粘贴', role: 'paste', enabled: !!flags.canPaste });
      items.push({ label: '粘贴为纯文本', click: () => {
        const text = clipboard.readText();
        if (text) win.webContents.insertText(text);
      } });
      items.push({ type: 'separator' });
      items.push({ label: '全选', role: 'selectAll' });
    } else if ((params.selectionText || '').trim()) {
      items.push({ label: '复制', role: 'copy' });
      items.push({
        label: '用浏览器搜索选中内容',
        click: () => {
          const q = encodeURIComponent(params.selectionText.trim().slice(0, 100));
          shell.openExternal('https://www.bing.com/search?q=' + q);
        },
      });
    }

    if (params.linkURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: '在浏览器中打开链接', click: () => shell.openExternal(params.linkURL) });
      items.push({ label: '复制链接地址', click: () => clipboard.writeText(params.linkURL) });
    }

    if (params.mediaType === 'image' && params.srcURL) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: '复制图片', click: () => win.webContents.copyImageAt(params.x, params.y) });
      items.push({ label: '另存图片…', click: () => win.webContents.downloadURL(params.srcURL) });
    }

    if (!items.length) return;
    items.push({ type: 'separator' });
    items.push({ label: '刷新界面', click: () => win.webContents.reload() });
    if (process.env.WHALE_DEBUG_CTX) console.log('[ctx-menu] editable=' + params.isEditable + ' items=' + items.length);
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  // 键盘：F12 调试、Ctrl+P 打印（网页版靠浏览器，这里自己接）
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      e.preventDefault();
      return;
    }
    if (ctrl && !input.shift && (input.key === 'p' || input.key === 'P')) {
      e.preventDefault();
      printPage();
    }
  });

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    const maxed = win.isMaximized();
    const b = maxed ? readState() : win.getBounds();
    writeState({
      x: b.x, y: b.y,
      width: maxed ? (readState().width || 1320) : b.width,
      height: maxed ? (readState().height || 900) : b.height,
      maximized: maxed,
    });
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; });

  // 命令行自检：xxx.exe --selftest=<输出文件>  —— 给自动化/排障用，跑完直接退出
  const selfArg = process.argv.find((a) => a.startsWith('--selftest'));
  if (selfArg) {
    const outPath = selfArg.includes('=') ? selfArg.split('=').slice(1).join('=') : path.join(app.getPath('temp'), 'whale-selftest.json');
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1800));
      selfTestMode = true;
      try {
        const { CHECK_SOURCE } = require('./tools/selftest.js');
        const res = await win.webContents.executeJavaScript(CHECK_SOURCE, true);
        fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), version: app.getVersion(), ...res }, null, 2));
      } catch (e) {
        try { fs.writeFileSync(outPath, JSON.stringify({ error: String((e && e.stack) || e) }, null, 2)); } catch {}
      }
      selfTestMode = false;
      app.exit(0);
    });
  }
}

/* ── 生命周期 ───────────────────────────────────────── */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.jingxi.refiner');
    installNetworkTweaks();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
