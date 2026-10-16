/** 写死在程序中的 GitHub 仓库信息（不要把 Token 提交进仓库）。 */
export const GITHUB_CONFIG = {
  owner: 'lanyuechen',
  repo: 'wte-world-data',
  branch: 'master',
} as const

/** 默认协同房间号（本地未指定房间时使用） */
export const DEFAULT_COLLAB_ROOM_ID = 'wte-home'

/** 扫码分享用的站点入口（GitHub Pages）。 */
export const SCAN_SHARE_BASE = 'https://lanyuechen.github.io/wte-world/'

/**
 * Achex 信令（对齐 https://github.com/lanyuechen/retina ）
 */
export const ACHEX_CONFIG = {
  wsUrl: 'wss://cloud.achex.ca',
  password: '123456',
} as const

/** 使用本机已保存的 Token（localStorage / 扫码写入），勿硬编码进仓库。 */
export function resolveGithubToken(storedToken?: string) {
  return (storedToken ?? '').trim()
}
