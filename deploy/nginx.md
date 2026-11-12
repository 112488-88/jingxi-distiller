# 在自己服务器上部署（nginx，推荐 VPS / 宝塔）

目标：`https://你的域名/` 打开工具，**Key 藏在 nginx 里**，别人不用填 Key。

## 1. 放文件

把整个 `消息提炼器` 目录传到服务器，例如 `/www/wwwroot/distiller/`：

```
distiller/
├── index.html
├── style.css
├── app.js
├── parse.js
├── tone.js
├── prompts.js
├── parsers/merged-forward.js
└── config.js          ← 用 deploy/config.js 改一份放进来
```

`config.js` 内容：

```js
window.DSH_CONFIG = {
  apiUrl: '/api/chat/completions',
  model: 'deepseek-chat',
  keyOptional: true
};
```

`index.html` 里在其它脚本**之前**加一行：

```html
<script src="config.js"></script>
```

## 2. nginx 站点配置

```nginx
server {
    listen 443 ssl http2;
    server_name 你的域名;

    # 静态文件
    root /www/wwwroot/distiller;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 代理到 DeepSeek，Key 只存在服务器上
    location /api/ {
        # 只允许 POST，挡掉扫描器
        limit_except POST { deny all; }

        proxy_pass https://api.deepseek.com/;
        proxy_http_version 1.1;
        proxy_set_header Host api.deepseek.com;
        proxy_set_header Authorization "Bearer sk-换成你自己的Key";
        proxy_set_header Content-Type application/json;
        proxy_ssl_server_name on;

        # 超时给够，长文本提炼会慢
        proxy_read_timeout 180s;
        proxy_connect_timeout 15s;
        proxy_send_timeout 180s;

        # 简单限流：每个 IP 每分钟 20 次
        limit_req zone=distiller burst=10 nodelay;
    }
}

# 限流用的 zone 要放在 http {} 里
# limit_req_zone $binary_remote_addr zone=distiller:10m rate=20r/m;
```

## 3. 几个坑

| 坑 | 说明 |
|---|---|
| 备案 | 用国内服务器 + 域名必须备案；不想备案就用香港/海外 VPS，或者直接用 Cloudflare Pages |
| HTTPS | 页面是 https，接口也必须 https，否则浏览器会拦混合内容 |
| Key 泄露 | Key 只写在 nginx 里，别写进 `config.js`；`config.js` 会被下载到浏览器 |
| 别人刷你的额度 | 一定要留 `limit_req`，或者干脆保留填 Key 模式（各自付费） |
| 更新 | 改完文件直接覆盖，浏览器 `Ctrl+F5`，没有构建步骤 |
