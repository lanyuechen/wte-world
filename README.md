# 吃什么

React + Vite 网页小应用：菜谱管理、按手头食材点单、订单采购清单。数据存 GitHub；协同点单走 EMQX 公共 MQTT（信令 / 兜底）+ WebRTC DataChannel。

## 开发

```bash
npm install
npm run dev
```

## 配置

GitHub 仓库与 MQTT 写在 [`src/config.ts`](src/config.ts)。分享链接跟当前访问域名走（本地 / GitHub Pages）。

**不要把 GitHub Token 提交进仓库**（提交后会被 GitHub 立刻吊销）。首次打开会提示输入 Token 并写入 localStorage；扫码页二维码会带上 Token，家人扫码后自动写入本机。

## 部署（GitHub Pages + jsDelivr）

推送到 `master` 后，[Deploy GitHub Pages](.github/workflows/deploy.yml) 会构建并发布到 `gh-pages` 分支。

首次使用请在仓库 **Settings → Pages** 中将 Source 设为 **Deploy from a branch**，Branch 选 `gh-pages` / `/ (root)`。

| 入口 | 地址 |
| --- | --- |
| GitHub Pages | https://lanyuechen.github.io/wte-world/ |
| jsDelivr CDN | https://cdn.jsdelivr.net/gh/lanyuechen/wte-world@gh-pages/index.html |

生产构建启用 Service Worker，会预缓存应用资源，并对 jsDelivr、GitHub Raw 图片做运行时缓存。

本地预览生产包：

```bash
npm run build
npm run preview
```
