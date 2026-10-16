/** 写死在程序中的 GitHub 仓库信息（不要把 Token 提交进仓库）。 */
export const GITHUB_CONFIG = {
  owner: 'lanyuechen',
  repo: 'wte-world-data',
  branch: 'master',
} as const

/** 扫码分享用的站点入口（GitHub Pages）。 */
export const SCAN_SHARE_BASE = 'https://lanyuechen.github.io/wte-world/'

/**
 * WebRTC 信令：EMQX 公共 MQTT（国内接入点）。
 * @see https://www.emqx.com/zh/mqtt/public-mqtt5-broker
 * 仅传 offer/answer/candidate/进房信令，勿传 Token 等敏感数据。
 */
export const MQTT_SIGNAL_CONFIG = {
  url: 'wss://broker-cn.emqx.io:8084/mqtt',
  topicPrefix: 'wte/v1',
} as const

/** 使用本机已保存的 Token（localStorage / 扫码写入），勿硬编码进仓库。 */
export function resolveGithubToken(storedToken?: string) {
  return (storedToken ?? '').trim()
}
