'use strict';

const { app, BrowserWindow, Menu, shell, session, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_DIR = path.join(__dirname, 'app');
const INDEX_FILE = path.join(APP_DIR, 'index.html');
const INDEX_URL = 'file:///' + INDEX_FILE.replace(/\\/g, '/');
const ICON = path.join(__dirname, 'build', 'icon.ico');
const APP_TITLE = '鲸汐提炼器';

let win = null;

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

  // 下载（例如导出 .md/.txt 走 blob 的备用路径）
  ses.on('will-download', (_e, item) => {
    const name = item.getFilename();
    item.setSavePath(path.join(app.getPath('downloads'), name));
    item.once('done', (_evt, state) => {
      if (state === 'completed' && win) {
        win.webContents.send('download-done', name);
        dialog.showMessageBox(win, {
          type: 'info',
          title: '已保存',
          message: '文件已保存到下载文件夹',
          detail: `${name}\n${path.join(app.getPath('downloads'), name)}`,
          buttons: ['好'],
        });
      }
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
    autoHideMenuBar: true,
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

  // 无边框拖拽 / 打印等调用系统能力
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
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
