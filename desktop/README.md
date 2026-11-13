# 鲸汐提炼器 · 桌面版（Electron 外壳）

把仓库根目录那套网页本体，包成能双击运行的 Windows 桌面程序。

**网页本体只有一份**：根目录的 `index.html` / `app.js` / `style.css` … 是 PWA 和桌面版共用的源。`desktop/` 里不放网页副本，`scripts/prepare-app.mjs` 在打包前把根目录文件复制到 `desktop/app/`（已在 `.gitignore` 里忽略），所以两边永远同源，不会出现「改了网页忘了改桌面」。

## 产物

| 文件 | 说明 |
|---|---|
| `dist/鲸汐提炼器-<版本>-便携版.exe` | 单文件，双击即开，不写注册表、不装运行库 |
| `dist/鲸汐提炼器-<版本>-安装版.exe` | 安装包，建桌面 + 开始菜单快捷方式，可在「应用和功能」里卸载 |
| `dist/win-unpacked/` | 解包目录，启动最快，排查问题时用 |

产物不进仓库（`.gitignore` 已排除 `desktop/dist/`）。发版时把 exe 传到 GitHub Releases。

## 怎么跑

```bash
cd desktop
npm install

# 开发预览（会先把根目录网页复制进 app/）
npm start

# 出包（便携版 + 安装版）
npm run dist
# 只要单个目标
npm run dist:portable
npm run dist:nsis

# 只要解包目录（最快，方便看控制台）
npm run dist:dir
```

国内网络下载 Electron 慢的话，先设镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
```

## 外壳比浏览器打开多出来的东西

- 独立窗口 + 任务栏图标（图标由 `assets/icon-512.png` 生成多尺寸 `build/icon.ico`，跟 PWA 图标同一套）
- **菜单栏默认显示**（文件 / 编辑 / 视图 / 帮助），不再按 Alt 才出来
- **右键菜单**：输入框里是撤销 / 重做 / 剪切 / 复制 / 粘贴 / 粘贴为纯文本 / 全选；选中有文字时能复制或丢给浏览器搜索；右键链接能打开或复制地址；右键图片能复制或另存
- **打印**：`Ctrl+P` 或菜单「打印卡片…」，走系统打印对话框（网页版这块是浏览器给的）
- **窗口状态记忆**：大小 / 位置 / 最大化都会记住，换屏幕、拔外接屏都不会跑到屏幕外
- 单实例：再点一次只是把已开的窗口叫到前面
- 网页里的外链交给系统浏览器，不会在软件内跳走；拖文件也不会把窗口导航到别处
- **导出 PDF/图片以外的东西**：优先弹系统「另存为」；兜底下载落到系统「下载」文件夹，**同名文件自动加序号不覆盖**，存完弹「打开所在文件夹」
- `localStorage` 与 IndexedDB 落在软件自己的配置目录，不再跟着浏览器走：
  Windows 是 `%APPDATA%\鲸汐提炼器\`（Key、历史 20 条、桌宠形象、主题都在这里，删掉即清空）
- 对 `api.deepseek.com` 的响应补 CORS 头做兜底（`file://` 下 Origin 为 `null` 的情况）
- 剪贴板、另存为、全屏等权限直接放行，不弹 Chromium 授权框
- **内置自检**：菜单「帮助 → 运行自检」会用假数据点一遍主要按钮（不花 API 额度），跑完自动恢复你的 Key / 历史 / 主题 / 桌宠形象，报告写在 `%APPDATA%\鲸汐提炼器\self-test-*.json`

网页本体本身零改动：PWA 那段 `initPwa()` 在 `file://` 下自动跳过 Service Worker 和 manifest，正好适合桌面壳。

## 自测（不花 API 额度）

```bash
cd desktop
npm run prepare:app

npm run smoke            # 冒烟：界面渲染 / localStorage / 剪贴板 / 另存为 / DeepSeek 连通（401 = 通）
npm run smoke:persist-write   # 写入 localStorage
npm run smoke:persist-read    # 重启后再读，验证落盘

npx electron tests/e2e.js     # 回归 ①：提炼 / 复制 / 导出 / 拖文件 / 主题 / 桌宠 / 快捷键
npx electron tests/e2e2.js    # 回归 ②：IndexedDB / 导出下载 / 桌宠上传形象 / 历史回看 / CSV 识别 / 问答

# 命令行自检（打包后也能跑）：结果写 JSON，进程自己退出
鲸汐提炼器.exe --selftest=C:\temp\selftest.json
```

截图和报告落在 `desktop/dist-smoke/`（已忽略）。

## 打包踩过的坑

1. **`ELECTRON_RUN_AS_NODE=1`**：某些终端/CI 环境里带着这个变量，`electron` 会退化成 Node 跑（报 `app is undefined`）。跑之前清掉：`Remove-Item Env:\ELECTRON_RUN_AS_NODE`。用户双击 exe 不受影响。
2. **npm ≥ 11 默认拦 install 脚本**：`electron` 的 postinstall 不跑，`node_modules/electron/dist` 是空的。要么放行该包的脚本，要么手动下 `electron-v<版本>-win32-x64.zip` 解压进 `node_modules/electron/dist` 并写 `path.txt`（内容就是 `electron.exe`）。
3. **winCodeSign 解压要符号链接权限**：没开开发者模式、非管理员会失败。提前把 `winCodeSign-2.6.0.7z` 解压到
   `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`（7-Zip 用 `-snl-` 跳过 symlink 即可）。
4. **asar 里的 PDF 打不开**：`app/manual.*` 已加进 `asarUnpack`，`main.js` 的 `resourceRoot()` 会把路径指向 `app.asar.unpacked`。
5. **没有代码签名证书**：首次运行 Windows SmartScreen 可能提示「未知发布者」→「更多信息」→「仍要运行」。功能不受影响。

## 结构

```
desktop/
├─ package.json          Electron 版本、electron-builder 配置（appId com.jingxi.refiner）
├─ main.js               主进程：窗口、菜单、单实例、窗口状态、CORS 兜底、外链/下载
├─ scripts/
│  └─ prepare-app.mjs    从仓库根复制网页本体到 desktop/app/
├─ tests/
│  ├─ selftest.js        内置自检脚本（帮助菜单调用，也能 --selftest 命令行跑）
│  ├─ smoke.js           冒烟测试（截图 + 能力探测）
│  ├─ e2e.js             功能回归 ①：提炼/复制/导出/拖文件/主题/桌宠/快捷键
│  ├─ e2e2.js            功能回归 ②：IndexedDB/下载/上传形象/历史/CSV/问答
│  └─ persist-test.js    localStorage 持久化两阶段验证
├─ build/
│  └─ icon.ico           由 assets/icon-512.png 生成（16/24/32/48/64/128/256）
├─ app/                  ⚠ 生成物，不进仓库
└─ dist/                 ⚠ 打包产物，不进仓库
```
