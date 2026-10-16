/**
 * EMQX 公共 MQTT 信令客户端（仅 WebRTC 信令，不做业务中继）。
 * @see https://www.emqx.com/zh/mqtt/public-mqtt5-broker
 */
import mqtt, { type MqttClient } from 'mqtt'
import { MQTT_SIGNAL_CONFIG } from '../config'

export type SignalEnvelope = {
  from: string
  nickname: string
  roomId: string
  message: unknown
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

type PresenceMsg = {
  type: 'peer-join' | 'peer-leave' | 'peer-hello'
  peer: { id: string; nickname: string }
  roomId: string
}

function safeTopicSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64)
}

export class MqttSignalClient {
  private client: MqttClient | null = null
  private handlers: Handlers = {}
  private nickname = ''
  private closedByUser = false
  private knownPeers = new Map<string, string>()
  clientId = ''
  roomId = ''

  get isOpen() {
    return Boolean(this.client?.connected)
  }

  private lobbyTopic() {
    return `${MQTT_SIGNAL_CONFIG.topicPrefix}/${safeTopicSegment(this.roomId)}/lobby`
  }

  private inboxTopic(peerId = this.clientId) {
    return `${MQTT_SIGNAL_CONFIG.topicPrefix}/${safeTopicSegment(this.roomId)}/to/${safeTopicSegment(peerId)}`
  }

  async joinRoom(roomId: string, nickname: string, handlers: Handlers = {}) {
    this.close()
    this.handlers = handlers
    this.roomId = roomId
    this.nickname = nickname
    this.closedByUser = false
    this.knownPeers.clear()
    this.clientId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `p${Date.now().toString(36)}`

    const clientId = `wte_${this.clientId}`
    const leavePayload = JSON.stringify({
      type: 'peer-leave',
      peer: { id: this.clientId, nickname },
      roomId,
    } satisfies PresenceMsg)

    try {
      await new Promise<void>((resolve, reject) => {
        const client = mqtt.connect(MQTT_SIGNAL_CONFIG.url, {
          clientId,
          clean: true,
          connectTimeout: 10_000,
          reconnectPeriod: 0,
          protocolVersion: 5,
          will: {
            topic: this.lobbyTopic(),
            payload: leavePayload,
            qos: 0,
            retain: false,
          },
        })
        this.client = client

        const timer = window.setTimeout(() => {
          reject(new Error('连接 MQTT 信令超时'))
          client.end(true)
        }, 12_000)

        client.on('connect', () => {
          window.clearTimeout(timer)
          resolve()
        })
        client.on('error', (err) => {
          window.clearTimeout(timer)
          reject(err instanceof Error ? err : new Error('MQTT 连接失败'))
        })
      })
    } catch (err) {
      this.teardown()
      if (!this.closedByUser) {
        this.handlers.onError?.(
          err instanceof Error
            ? err.message
            : '无法连接 EMQX（请检查网络是否可访问 broker-cn.emqx.io）',
        )
      }
      return
    }

    const client = this.client
    if (!client) return

    client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString())
    })
    client.on('close', () => {
      if (!this.closedByUser) this.handlers.onClose?.()
    })

    await this.subscribe([this.lobbyTopic(), this.inboxTopic()])

    // 尚无成员列表服务：先回报自己，对端靠 lobby 发现
    this.handlers.onJoined?.({ clientId: this.clientId, peers: [] })

    this.publishLobby({
      type: 'peer-join',
      peer: { id: this.clientId, nickname: this.nickname },
      roomId: this.roomId,
    })
    // 让已在房间的人回应，便于补齐 peers
    this.publishLobby({
      type: 'peer-hello',
      peer: { id: this.clientId, nickname: this.nickname },
      roomId: this.roomId,
    })
  }

  broadcast(message: unknown) {
    // 仅用于信令广播（如 peer-join 外的房间级信令）
    this.publishRaw(this.lobbyTopic(), {
      from: this.clientId,
      nickname: this.nickname,
      roomId: this.roomId,
      message,
    } satisfies SignalEnvelope)
  }

  sendTo(sessionId: string, message: unknown) {
    this.publishRaw(this.inboxTopic(sessionId), {
      from: this.clientId,
      nickname: this.nickname,
      roomId: this.roomId,
      message,
    } satisfies SignalEnvelope)
  }

  close() {
    this.closedByUser = true
    if (this.client?.connected) {
      this.publishLobby({
        type: 'peer-leave',
        peer: { id: this.clientId, nickname: this.nickname },
        roomId: this.roomId,
      })
    }
    this.teardown()
    this.clientId = ''
    this.knownPeers.clear()
  }

  private teardown() {
    if (this.client) {
      try {
        this.client.removeAllListeners()
        this.client.end(true)
      } catch {
        // ignore
      }
    }
    this.client = null
  }

  private subscribe(topics: string[]) {
    const client = this.client
    if (!client) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      client.subscribe(topics, { qos: 0 }, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private publishLobby(msg: PresenceMsg) {
    this.publishRaw(this.lobbyTopic(), msg)
  }

  private publishRaw(topic: string, payload: unknown) {
    if (!this.client?.connected) return
    this.client.publish(topic, JSON.stringify(payload), { qos: 0, retain: false })
  }

  private handleMessage(topic: string, raw: string) {
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return
    }
    if (!data || typeof data !== 'object') return

    if ('type' in data && (data as PresenceMsg).type) {
      this.handlePresence(data as PresenceMsg)
      return
    }

    const env = data as SignalEnvelope
    if (!env.from || env.from === this.clientId) return
    if (env.roomId && env.roomId !== this.roomId) return

    // inbox 或 lobby 上的信令包
    if (topic === this.inboxTopic() || topic === this.lobbyTopic()) {
      if (env.nickname) this.knownPeers.set(env.from, env.nickname)
      this.handlers.onMessage?.(env.message, env.from)
    }
  }

  private handlePresence(msg: PresenceMsg) {
    if (!msg.peer?.id || msg.peer.id === this.clientId) return
    if (msg.roomId && msg.roomId !== this.roomId) return

    if (msg.type === 'peer-leave') {
      this.knownPeers.delete(msg.peer.id)
      this.handlers.onPeerLeave?.(msg.peer)
      return
    }

    if (msg.type === 'peer-join' || msg.type === 'peer-hello') {
      const isNew = !this.knownPeers.has(msg.peer.id)
      this.knownPeers.set(msg.peer.id, msg.peer.nickname)
      if (isNew) {
        // 伪装成原 Achex 的 peer-join-room，复用 collab 逻辑
        this.handlers.onMessage?.(
          {
            type: 'peer-join-room',
            peer: msg.peer,
            roomId: this.roomId,
          },
          msg.peer.id,
        )
      }
      // 已在房的人回复 hello，让新人发现自己
      if (msg.type === 'peer-hello') {
        this.publishLobby({
          type: 'peer-join',
          peer: { id: this.clientId, nickname: this.nickname },
          roomId: this.roomId,
        })
      }
    }
  }
}
