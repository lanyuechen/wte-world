# 吃什么

React + Vite 网页小应用：菜谱管理、按手头食材点单、订单采购清单，数据存 GitHub；固定二维码协同点单（Achex 信令 + WebRTC）。

## 开发

```bash
npm install
npm run dev
```

## 配置

仓库、Token、协同房间号、Achex、分享地址均写在 [`src/config.ts`](src/config.ts)。

## 部署（GitHub Pages + jsDelivr）

推送到 `master` 后，[Deploy GitHub Pages](.github/workflows/deploy.yml) 会构建并发布到 `gh-pages` 分支。

首次使用请在仓库 **Settings → Pages** 中将 Source 设为 **Deploy from a branch**，Branch 选 `gh-pages` / `/ (root)`。

| 入口 | 地址 |
| --- | --- |
| GitHub Pages | https://lanyuechen.github.io/wte-world/ |
| jsDelivr CDN | https://cdn.jsdelivr.net/gh/lanyuechen/wte-world@gh-pages/index.html |

扫码分享默认使用 jsDelivr 入口。生产构建启用 Service Worker，会预缓存应用资源，并对 `cdn.jsdelivr.net`、GitHub Raw 图片做运行时缓存。

本地预览生产包：

```bash
npm run build
npm run preview
```
