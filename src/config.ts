/** 写死在程序中的 GitHub 仓库信息。 */
export const GITHUB_CONFIG = {
  owner: 'lanyuechen',
  repo: 'wte-world-data',
  branch: 'master',
} as const

/** 默认协同房间号（本地未指定房间时使用） */
export const DEFAULT_COLLAB_ROOM_ID = 'wte-home'

/** GitHub Pages 站点 */
export const GITHUB_PAGES_URL = 'https://lanyuechen.github.io/wte-world/'

/**
 * jsDelivr CDN（指向 gh-pages 构建产物，国内访问更稳）。
 * 扫码分享默认走 CDN；显式 index.html 以便 jsDelivr 正确返回入口。
 */
export const JSDELIVR_CDN_URL =
  'https://cdn.jsdelivr.net/gh/lanyuechen/wte-world@gh-pages/'

/** 扫码分享用的站点；二维码仅带 room。 */
export const SCAN_SHARE_BASE = `${JSDELIVR_CDN_URL}index.html`

/** 程序内置 GitHub Token */
export const SCAN_SHARE_TOKEN =
  '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'

/**
 * Achex 信令（对齐 https://github.com/lanyuechen/retina ）
 */
export const ACHEX_CONFIG = {
  wsUrl: 'wss://cloud.achex.ca',
  password: '123456',
} as const

/** 始终使用内置 Token。 */
export function resolveGithubToken(_storedToken?: string) {
  return SCAN_SHARE_TOKEN.trim()
}
