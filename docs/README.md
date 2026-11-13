# 文档导航

仓库里的文档分三类，别翻错。

## 给用的人看

| 文件 | 内容 |
|---|---|
| [`manual/manual.md`](manual/manual.md) | 使用说明（Markdown 版，改这个） |
| [`manual.pdf`](../manual.pdf) | 同一份的 PDF，适合直接发给别人 |
| [`manual/manual.docx`](manual/manual.docx) | 同一份的 Word，方便二次编辑 |
| [`manual/manual.html`](manual/manual.html) | 同一份的网页版 |

四份内容一致，源以 `manual.md` 为准。改了 md 之后，docx / pdf / html 需要一起重出。

## 给改代码的人看

| 文件 | 内容 |
|---|---|
| [`frontend-notes.md`](frontend-notes.md) | 前端实现笔记：为什么零构建、样式令牌怎么分层、标记体系怎么设计的 |
| [`devlog.md`](devlog.md) | 开发日志：按时间记每一步做了什么、踩了什么坑、怎么解决的 |

## 别的地方

- 部署方案（Cloudflare Worker / nginx / PHP 代填 Key）：[`../deploy/README.md`](../deploy/README.md)
- 桌面版（Electron 壳）怎么跑、怎么打包、怎么自测：[`../desktop/README.md`](../desktop/README.md)
- 版本变更：[`../CHANGELOG.md`](../CHANGELOG.md)
- 怎么参与：[`../CONTRIBUTING.md`](../CONTRIBUTING.md)
