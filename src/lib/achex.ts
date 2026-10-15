/**
 * Achex 信令客户端，协议对齐 retina：
 * https://github.com/lanyuechen/retina/blob/master/src/webrtc/Socket.ts
 */
import { ACHEX_CONFIG } from '../config'

export type AchexRawMessage = Record<string, unknown> & {
  auth?: string
  SID?: number | string
  sID?: number | string
  joinHub?: string
  leftHub?: string
  user?: string
  users?: Array<{ username: string; session: number | string; hub?: string }>
  type?: string
  message?: unknown
  FROM?: string
}

type Handlers = {
  onJoined?: (info: {
    clientId: string
    peers: { id: string; nickname: string }[]
  }) => void
  onPeerLeave?: (peer: { id: string; nickname: string }) => void
  onMessage?: (message: unknown, fromSessionId: string) => void
  onClose?: () => void
  onError?: (message: string) => void
}

export class AchexClient {
  private ws: WebSocket | null = null
  private handlers: Handlers = {}
  private nickname = ''
  private closedByUser = false
  private authWaiters: Array<(ok: boolean) => void> = []
  clientId = ''
  roomId = ''

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async joinRoom(roomId: string, nickname: string, handlers: Handlers = {}) {
    this.handlers = handlers
    this.roomId = roomId
    this.nickname = nickname
    this.closedByUser = false

    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.connect()
        const authed = await this.login(nickname)
        if (!authed) throw new Error('Achex 登录失败')
        this.send({ joinHub: roomId })
        return
      } catch (err) {
        lastError = err
        this.teardownSocket()
        if (this.closedByUser) return
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
      }
    }

    if (!this.closedByUser) {
      this.handlers.onError?.(
        lastError instanceof Error
          ? lastError.message
          : '无法连接 Achex（请检查网络是否可访问 cloud.achex.ca）',
      )
    }
  }

  broadcast(message: unknown) {
    this.send({ toH: this.roomId, type: 'message', message })
  }

  sendTo(sessionId: string, message: unknown) {
    this.send({ toS: sessionId, type: 'message', message })
  }

  close() {
    this.closedByUser = true
    this.resolveAuthWaiters(false)
    this.teardownSocket()
    this.clientId = ''
  }

  private teardownSocket() {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      try {
        this.ws.close()
      } catch {
        // ignore
      }
    }
    this.ws = null
  }

  private connect() {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(ACHEX_CONFIG.wsUrl)
      this.ws = ws
      let settled = false

      const timer = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('连接 Achex 超时'))
        this.teardownSocket()
      }, 8000)

      ws.onopen = () => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve()
      }

      ws.onerror = () => {
        if (settled || this.closedByUser) return
        settled = true
        window.clearTimeout(timer)
        reject(new Error('WebSocket 连接失败'))
      }

      ws.onclose = () => {
        if (!this.closedByUser) this.handlers.onClose?.()
      }

      ws.onmessage = (evt) => {
        try {
          this.handleMessage(JSON.parse(String(evt.data)) as AchexRawMessage)
        } catch {
          // ignore
        }
      }
    })
  }

  private login(username: string) {
    return new Promise<boolean>((resolve) => {
      this.authWaiters.push(resolve)
      this.send({ auth: username, passwd: ACHEX_CONFIG.password })
      window.setTimeout(() => this.resolveAuthWaiters(false), 5000)
    })
  }

  private resolveAuthWaiters(ok: boolean) {
    const waiters = this.authWaiters
    this.authWaiters = []
    waiters.forEach((w) => w(ok))
  }

  private send(message: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(message))
  }

  private handleMessage(data: AchexRawMessage) {
    if (data.auth === 'OK') {
      this.clientId = String(data.SID ?? '')
      this.resolveAuthWaiters(true)
      return
    }

    // 部分环境返回小写 ok
    if (String(data.auth).toLowerCase() === 'ok' && data.SID != null) {
      this.clientId = String(data.SID)
      this.resolveAuthWaiters(true)
      return
    }

    if (data.joinHub === 'OK') {
      this.broadcast({
        type: 'peer-join-room',
        peer: { id: this.clientId, nickname: this.nickname },
        roomId: this.roomId,
      })
      this.send({ serverstat: true })
      return
    }

    if (data.users) {
      const peers = data.users
        .filter(
          (user, i) =>
            i > 0 &&
            user.hub === this.roomId &&
            user.username !== this.nickname,
        )
        .map((user) => ({
          id: String(user.session),
          nickname: user.username,
        }))
      this.handlers.onJoined?.({
        clientId: this.clientId,
        peers,
      })
      return
    }

    if (data.leftHub) {
      this.handlers.onPeerLeave?.({
        id: String(data.sID ?? ''),
        nickname: String(data.user ?? ''),
      })
      return
    }

    if (data.type === 'message') {
      this.handlers.onMessage?.(data.message, String(data.sID ?? ''))
    }
  }
}
