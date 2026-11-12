# 让别人也能用：四条路

这个工具是**纯静态网页**（一堆 html/css/js），没有后端、没有数据库。所以"给别人用"只有一件事要定：**DeepSeek 的 Key 谁出、藏在哪**。

| 路线 | Key 谁填 | 要服务器吗 | 成本 | 适合 |
|---|---|---|---|---|
| A 局域网共享 | 各自填 | 不用（自己的电脑就是服务器） | 0 | 同一办公室 / 同一 WiFi 的几个人 |
| B 静态托管（各自填 Key） | 各自填 | 不用，白嫖托管 | 0 | 发给会注册 API 的人 |
| C 静态托管 + 服务端代填 Key | 你 | 要（Worker / VPS / PHP 空间） | 域名+服务器，或 Cloudflare 免费 | 发给朋友、同事，不想让他们折腾 Key |
| D 打包成压缩包发送 | 各自填 | 不用，离线 | 0 | 涉密、内网、不想上公网 |


---

## 0. 最快的一条：直接发分享包（推荐给「给人用」）

```
dist/jingxi-distiller-YYYYMMDD.zip   （约 0.8 MB）
```

里面只有运行必需的文件 + 说明书 + 一份《先看我.txt》。对方解压、双击 `index.html`、填自己的 Key 就能用。

重新打包：`npm run pack`

> 已验证：解压后从 `file://` 直接打开，脚本全部加载、提炼流程正常、控制台零报错（1440 宽屏下桌宠间距 12px）。

---

## A. 局域网共享（最快，2 分钟）

在放工具的电脑上开一个静态服务：

```powershell
cd jingxi-distiller
python -m http.server 8000
```

然后把这个工具所在电脑的局域网地址发给同事：`http://192.168.x.x:8000`（用 `ipconfig` 查 IPv4）。

- 每人还是自己填 Key（存在各自浏览器里）
- 电脑关机就没了，适合临时用
- 手机连同一个 WiFi 也能打开

---

## B. 静态托管，各自填 Key（零成本，长期）

工具目录里**除了 `deploy/` 之外的文件**全都是静态资源，直接传上去就能用。

### GitHub Pages

```powershell
cd jingxi-distiller
git init
git add index.html style.css app.js parse.js tone.js prompts.js parsers
git commit -m "鲸汐提炼器"
git branch -M main
git remote add origin https://github.com/你的用户名/distiller.git
git push -u origin main
```

仓库 → Settings → Pages → Source 选 `main / root` → 保存，几十秒后拿到 `https://你的用户名.github.io/distiller/`。

### Cloudflare Pages / Netlify / Vercel

三者都是"把文件夹拖进去"就行，不用命令行：

- Cloudflare Pages → Create project → Direct upload → 拖文件夹
- Netlify → Sites → Drag and drop 那个文件夹
- Vercel → Add New → Project → 上传或用 git 仓库

**优点**：免费、有 https、全球可用。
**注意**：`deploy/` 目录可以一起传，但别在里面写真实 Key。国内访问 GitHub Pages 可能偏慢。

---

## C. 服务端代填 Key（给别人用的正解）

前端改成请求**你自己的接口**，Key 只存在服务器上。为此我在 `app.js` 里加了配置钩子：

```html
<!-- index.html 里，其它脚本之前 -->
<script src="config.js"></script>
```

`config.js`（模板见 `deploy/config.js`）：

```js
window.DSH_CONFIG = {
  apiUrl: '/api/chat/completions',   // 你的代理地址
  model: 'deepseek-chat',
  keyOptional: true                  // 页面不再要求填 Key
};
```

后端三选一，代码都写好了：

| 环境 | 文件 | 说明 |
|---|---|---|
| Cloudflare Workers（免费、无需服务器） | `deploy/cloudflare-worker.js` | 单文件粘进 Worker，配两个环境变量即可；自带 CORS、路径白名单、每分钟 20 次限流 |
| VPS / 宝塔（nginx 反代） | `deploy/nginx.md` | 静态目录 + `location /api/` 注入 Authorization + `limit_req` |
| PHP 虚拟主机 | `deploy/php-proxy.php` | 改名叫 `api.php` 放根目录，支持环境变量 Key、可选口令、IP 限流 |

三个都做了同一件事：**只转发 `/chat/completions`、挡掉其它路径、限流、不把 Key 给浏览器**。

**必须做的三件防护**（不做就会被人白嫖额度）：

1. 限流（worker / nginx / php 里都有，按需调数值）
2. 可选口令 `ACCESS_TOKEN`（前端带 `X-Access-Token`，够挡路人）
3. DeepSeek 平台设**消费上限**（最后一道保险）

---

## D. 打包发人（不上公网）

把 `消息提炼器` 目录压成 zip 发给对方，他解压后双击 `index.html` 就能用（每个人自己填 Key）。

- 优点：不经过任何服务器，原文只发 DeepSeek
- 缺点：更新要重新发一遍；对方得会申请 API Key

---

## 常见问题

| 问题 | 答 |
|---|---|
| 换成别人用，我这边数据会混吗 | 不会。历史、Key、勾选状态全在各自浏览器 `localStorage`，服务器不存任何东西 |
| 能不能不要 Key，直接免费用 | 不行，DeepSeek 是付费接口；只能用你的 Key 代填（路线 C） |
| 手机能用吗 | 能，页面本来就是响应式的；局域网 IP 或公网域名都行 |
| 部署后改动怎么更新 | 重新上传覆盖，浏览器 `Ctrl+F5`；没有构建步骤 |
| 一定要域名吗 | 不一定，IP:端口 也能访问；但用 https 才有剪贴板 API 与摄像头等能力的完整体验（复制卡片有降级方案） |
| 数据安全 | 只有你粘/拖进去的原文会发给 DeepSeek；工具本身不收集、不上报 |

---

## 我的建议

- **给同事临时用** → 路线 A，两分钟
- **给自己长期用 + 偶尔分享链接** → 路线 B（Cloudflare Pages，国内访问比 GitHub Pages 稳）
- **发给不懂技术的朋友** → 路线 C + Cloudflare Worker（免费、不用买服务器），把 `keyOptional: true` 打开，对方打开就能用
- **涉密/内网** → 路线 D，纯离线

---

## 这个版本特有的注意事项（2026-11）

| 能力 | file:// 双击打开 | 自己起 http(s) 服务 |
|---|---|---|
| 提炼 / 追问 / 桌宠提问 | ✅ 直接可用（CORS 已放行） | ✅ |
| 保存导出的文件（md/csv/ics） | ⚠️ 会退化成「下载到下载夹」 | ✅ 支持弹「另存为」，可存到桌面 |
| 桌宠换形象（上传图片） | ✅ 存 localStorage（`file://` 下 IndexedDB 常被浏览器禁用，已做兜底） | ✅ |
| 复制卡片 | ⚠️ 剪贴板 API 可能被拒 → 自动切「手动复制框」 | ✅ |
| 历史 / Key / 标记 | ✅ 各人浏览器各自保存，互不影响 | ✅ |

也就是说：**想白嫖「另存为到桌面」就得给它一个 http(s) 地址**（局域网那条或静态托管都行）；
只是自己用、发给别人双击用，`file://` 完全够。
