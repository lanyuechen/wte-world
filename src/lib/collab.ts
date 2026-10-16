import type { CollabSession, Order } from '../types'
import { MqttSignalClient } from './mqtt-signal'

/** idle：未连；mqtt：MQTT 已连（点单可走 MQTT 兜底）；webrtc：DataChannel 已通 */
export type CollabTransportMode = 'idle' | 'mqtt' | 'webrtc'

const PEER_RETRY_MAX = 3
const MQTT_RECONNECT_BASE_MS = 1200
const MQTT_RECONNECT_MAX_MS = 15_000
/** 超过此时长未收到对端任何消息则移出成员列表 */
const PEER_STALE_MS = 45_000
const PEER_PRUNE_EVERY_MS = 12_000

type CollabEvents = {
  onSession: (session: CollabSession) => void
  onMembers: (members: CollabSession['members']) => void
  onStatus: (mode: CollabTransportMode) => void
  onError: (message: string) => void
  onOrderCreated?: (order: Order, availableIngredients: string[]) => void
  onOrderUpdated?: (order: Order, availableIngredients: string[]) => void
}

type AppMessage =
  | {
      type: 'peer-join-room'
      peer: { id: string; nickname: string }
      roomId: string
    }
  | { type: 'session'; session: CollabSession; sync?: boolean }
  | {
      type: 'order-created'
      order: Order
      availableIngredients: string[]
    }
  | {
      type: 'order-updated'
      order: Order
      availableIngredients: string[]
    }
  | { type: 'offer'; description: RTCSessionDescriptionInit }
  | { type: 'answer'; description: RTCSessionDescriptionInit }
  | {
      type: 'candidate'
      candidate: {
        sdpMLineIndex: number | null
        candidate: string
      }
    }

/** STUN + 公共 TURN（Open Relay，仅作连通性兜底，不保证长期可用） */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.voipbuster.com:3478' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

export function createEmptySession(roomId: string): CollabSession {
  return {
    roomId,
    selectedRecipeIds: [],
    availableIngredients: [],
    filterMode: 'any',
    ingredientStatus: {},
    members: [],
    revisedAt: Date.now(),
  }
}

export class CollabRoom {
  private roomId: string
  private nickname: string
  private clientId = ''
  private events: CollabEvents
  private signal = new MqttSignalClient()
  private peers = new Map<string, RTCPeerConnection>()
  private channels = new Map<string, RTCDataChannel>()
  private peerRetryCounts = new Map<string, number>()
  private peerRetryTimers = new Map<string, number>()
  private mqttReconnectTimer: number | null = null
  private mqttReconnectAttempt = 0
  private peerLastSeen = new Map<string, number>()
  private peerPruneTimer: number | null = null
  private session: CollabSession
  private destroyed = false
  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.ensureMqttConnected()
  }
  private onOnline = () => {
    this.ensureMqttConnected()
  }

  constructor(
    roomId: string,
    nickname: string,
    events: CollabEvents,
    initial?: Partial<CollabSession>,
  ) {
    this.roomId = roomId
    this.nickname = nickname
    this.events = events
    this.session = {
      ...createEmptySession(roomId),
      ...initial,
      members: [],
      // 进房尚未本地编辑：不抢房内已有点单的 revisedAt
      revisedAt: 0,
    }

    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('online', this.onOnline)
    this.peerPruneTimer = window.setInterval(
      () => this.pruneStaleMembers(),
      PEER_PRUNE_EVERY_MS,
    )

    void this.signal.joinRoom(roomId, nickname, {
      onJoined: ({ clientId, peers }) => {
        this.clientId = clientId
        this.mqttReconnectAttempt = 0
        const now = Date.now()
        this.peerLastSeen.set(clientId, now)
        for (const p of peers) this.peerLastSeen.set(p.id, now)
        this.session = {
          ...this.session,
          members: [
            { id: clientId, name: nickname },
            ...peers.map((p) => ({ id: p.id, name: p.nickname })),
          ],
        }
        this.events.onMembers(this.session.members)
        this.events.onSession(this.session)
        this.setMode('mqtt')
        for (const peer of peers) {
          void this.ensurePeer(peer.id, true)
        }
      },
      onReconnected: () => {
        this.mqttReconnectAttempt = 0
        this.refreshTransportMode()
        // 重连后先只保留自己 + 仍通的 P2P，其余靠 hello 重新发现
        if (this.clientId) {
          const self = { id: this.clientId, name: this.nickname }
          const live = this.session.members.filter(
            (m) =>
              m.id === this.clientId ||
              this.channels.get(m.id)?.readyState === 'open',
          )
          const members = live.some((m) => m.id === self.id)
            ? live
            : [self, ...live]
          this.peerLastSeen.clear()
          const now = Date.now()
          for (const m of members) this.peerLastSeen.set(m.id, now)
          this.session = { ...this.session, members }
          this.events.onMembers(this.session.members)
        }
      },
      onPeerLeave: (peer) => {
        this.peerLastSeen.delete(peer.id)
        this.session = {
          ...this.session,
          members: this.session.members.filter((m) => m.id !== peer.id),
        }
        this.events.onMembers(this.session.members)
        this.peerRetryCounts.delete(peer.id)
        this.closePeer(peer.id)
      },
      onMessage: (message, fromSessionId) => {
        if (fromSessionId) this.touchPeer(fromSessionId)
        void this.handleAppMessage(message as AppMessage, fromSessionId)
      },
      onClose: () => {
        if (this.destroyed) return
        // MQTT 断了：无 P2P 时名单只留自己；有 P2P 则只留 DataChannel 仍通的人
        this.pruneMembersOnMqttDown()
        this.refreshTransportMode()
        this.scheduleMqttReconnect()
      },
      onError: (message) => {
        if (!this.destroyed) this.events.onError(message)
      },
    })
  }

  getSession() {
    return this.session
  }

  updateSession(patch: Partial<CollabSession>, broadcast = true) {
    this.session = {
      ...this.session,
      ...patch,
      revisedAt: Date.now(),
      members: this.session.members,
    }
    this.events.onSession(this.session)
    if (broadcast) this.publishSession()
  }

  /** 广播「已生成订单」并清空本机点单（对端本地落单，不写 GitHub）。 */
  publishOrderCreated(order: Order, availableIngredients: string[]) {
    this.relayPayload({
      type: 'order-created',
      order,
      availableIngredients,
    })
    this.updateSession({
      selectedRecipeIds: [],
      ingredientStatus: {},
    })
  }

  /** 广播订单更新（加菜/删菜等）；不清空对端点单草稿。 */
  publishOrderUpdated(order: Order, availableIngredients: string[]) {
    this.relayPayload({
      type: 'order-updated',
      order,
      availableIngredients,
    })
  }

  destroy() {
    this.destroyed = true
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('online', this.onOnline)
    if (this.peerPruneTimer !== null) {
      window.clearInterval(this.peerPruneTimer)
      this.peerPruneTimer = null
    }
    if (this.mqttReconnectTimer !== null) {
      window.clearTimeout(this.mqttReconnectTimer)
      this.mqttReconnectTimer = null
    }
    for (const timer of this.peerRetryTimers.values()) window.clearTimeout(timer)
    this.peerRetryTimers.clear()
    this.peerRetryCounts.clear()
    for (const pc of this.peers.values()) pc.close()
    this.peers.clear()
    this.channels.clear()
    this.signal.close()
  }

  private setMode(mode: CollabTransportMode) {
    this.events.onStatus(mode)
  }

  private refreshTransportMode() {
    if (
      [...this.channels.values()].some((c) => c.readyState === 'open')
    ) {
      this.setMode('webrtc')
    } else if (this.signal.isOpen) {
      this.setMode('mqtt')
    } else {
      this.setMode('idle')
    }
  }

  /** 进前台 / 网络恢复 / MQTT 断开时：尽量拉回 MQTT。 */
  private ensureMqttConnected() {
    if (this.destroyed || this.signal.isOpen) return
    this.scheduleMqttReconnect(true)
  }

  private scheduleMqttReconnect(immediate = false) {
    if (this.destroyed || this.signal.isOpen) return
    if (this.mqttReconnectTimer !== null) {
      if (!immediate) return
      window.clearTimeout(this.mqttReconnectTimer)
      this.mqttReconnectTimer = null
    }

    const delay = immediate
      ? 0
      : Math.min(
          MQTT_RECONNECT_BASE_MS * 2 ** this.mqttReconnectAttempt,
          MQTT_RECONNECT_MAX_MS,
        )

    this.mqttReconnectTimer = window.setTimeout(() => {
      this.mqttReconnectTimer = null
      if (this.destroyed || this.signal.isOpen) return
      this.mqttReconnectAttempt += 1
      void this.signal.reconnect().then(() => {
        if (this.destroyed) return
        if (!this.signal.isOpen) this.scheduleMqttReconnect()
      })
    }, delay)
  }

  /** 优先 WebRTC；对端 DataChannel 未通时经 MQTT 中继 */
  private publishSession() {
    this.sendSession(false)
  }

  private sendSession(sync: boolean, onlyTo?: string) {
    this.relayPayload(
      {
        type: 'session',
        session: this.session,
        ...(sync ? { sync: true } : {}),
      },
      onlyTo,
    )
  }

  private relayPayload(payload: AppMessage, onlyTo?: string) {
    let sentViaRtc = false
    const rtcPeers = new Set<string>()

    const tryRtc = (peerId: string) => {
      const channel = this.channels.get(peerId)
      if (channel?.readyState !== 'open') return
      channel.send(JSON.stringify(payload))
      sentViaRtc = true
      rtcPeers.add(peerId)
    }

    if (onlyTo) {
      tryRtc(onlyTo)
    } else {
      for (const peerId of this.channels.keys()) tryRtc(peerId)
    }

    if (this.signal.isOpen) {
      if (onlyTo) {
        if (!rtcPeers.has(onlyTo)) this.signal.sendTo(onlyTo, payload)
      } else {
        for (const m of this.session.members) {
          if (!m.id || m.id === this.clientId) continue
          if (!rtcPeers.has(m.id)) this.signal.sendTo(m.id, payload)
        }
      }
    }

    if (sentViaRtc) this.setMode('webrtc')
    else if (this.signal.isOpen) this.setMode('mqtt')
  }

  private async handleAppMessage(message: AppMessage, fromSessionId: string) {
    if (!message || typeof message !== 'object' || !('type' in message)) return

    if (message.type === 'peer-join-room') {
      if (message.roomId !== this.roomId) return
      if (message.peer.id === this.clientId) return
      this.upsertMember(message.peer.id, message.peer.nickname)
      // 字典序更大的一方发起 offer，避免双方同时 offer
      const shouldOffer = this.clientId > message.peer.id
      await this.ensurePeer(message.peer.id, shouldOffer)
      // P2P 未通时也立刻用 MQTT 把已选菜推给新人
      if (this.session.selectedRecipeIds.length > 0) {
        this.sendSession(true, message.peer.id)
      }
      return
    }

    if (message.type === 'session') {
      this.ingestRemoteSession(message.session, Boolean(message.sync))
      return
    }

    if (message.type === 'order-created') {
      if (!message.order?.id) return
      this.events.onOrderCreated?.(
        message.order,
        message.availableIngredients ?? [],
      )
      // 生成订单：对端同步清空点单草稿
      this.session = {
        ...this.session,
        selectedRecipeIds: [],
        ingredientStatus: {},
        revisedAt: Math.max(this.session.revisedAt, Date.now()),
      }
      this.events.onSession(this.session)
      return
    }

    if (message.type === 'order-updated') {
      if (!message.order?.id) return
      this.events.onOrderUpdated?.(
        message.order,
        message.availableIngredients ?? [],
      )
      return
    }

    if (!fromSessionId || fromSessionId === this.clientId) return

    if (message.type === 'offer') {
      const pc = await this.ensurePeer(fromSessionId, false)
      if (!pc) return
      await pc.setRemoteDescription(message.description)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.signal.sendTo(fromSessionId, { type: 'answer', description: answer })
      return
    }

    if (message.type === 'answer') {
      const pc = this.peers.get(fromSessionId)
      if (!pc) return
      await pc.setRemoteDescription(message.description)
      return
    }

    if (message.type === 'candidate') {
      const pc = this.peers.get(fromSessionId)
      if (!pc) return
      try {
        await pc.addIceCandidate(
          new RTCIceCandidate({
            candidate: message.candidate.candidate,
            sdpMLineIndex: message.candidate.sdpMLineIndex,
          }),
        )
      } catch {
        // ignore race
      }
    }
  }

  /**
   * sync：DataChannel 刚通时的快照交换——空点单不能盖掉已有订单，本机为空则接受对端订单。
   * 普通更新仍按 revisedAt 最后写入胜出（含故意清空点单）。
   */
  private ingestRemoteSession(remote: CollabSession, isSync: boolean) {
    const localHasOrder = this.session.selectedRecipeIds.length > 0
    const remoteHasOrder = remote.selectedRecipeIds.length > 0

    if (isSync) {
      if (!localHasOrder && remoteHasOrder) {
        this.applyRemoteSession(remote)
        return
      }
      if (localHasOrder && !remoteHasOrder) return
    }

    if (remote.revisedAt >= this.session.revisedAt) {
      this.applyRemoteSession(remote)
    }
  }

  private applyRemoteSession(session: CollabSession) {
    const self = {
      id: this.clientId || 'me',
      name: this.nickname,
    }
    const members = session.members.some((m) => m.id === self.id)
      ? session.members
      : [...session.members.filter((m) => m.id !== 'me'), self]
    this.session = { ...session, members }
    this.events.onSession(this.session)
    this.events.onMembers(this.session.members)
  }

  private touchPeer(id: string) {
    if (!id || id === this.clientId) return
    this.peerLastSeen.set(id, Date.now())
  }

  private upsertMember(id: string, name: string) {
    this.touchPeer(id)
    const exists = this.session.members.some((m) => m.id === id)
    this.session = {
      ...this.session,
      members: exists
        ? this.session.members.map((m) => (m.id === id ? { id, name } : m))
        : [...this.session.members, { id, name }],
    }
    this.events.onMembers(this.session.members)
  }

  private pruneStaleMembers() {
    if (this.destroyed || !this.clientId) return
    if (this.signal.isOpen) this.signal.announcePresence()
    const now = Date.now()
    const next = this.session.members.filter((m) => {
      if (m.id === this.clientId) return true
      if (this.channels.get(m.id)?.readyState === 'open') {
        this.touchPeer(m.id)
        return true
      }
      const seen = this.peerLastSeen.get(m.id) ?? 0
      return now - seen < PEER_STALE_MS
    })
    if (next.length === this.session.members.length) return
    const kept = new Set(next.map((m) => m.id))
    for (const m of this.session.members) {
      if (!kept.has(m.id)) {
        this.peerLastSeen.delete(m.id)
        this.closePeer(m.id)
      }
    }
    this.session = { ...this.session, members: next }
    this.events.onMembers(this.session.members)
  }

  private pruneMembersOnMqttDown() {
    if (!this.clientId) return
    const self = {
      id: this.clientId,
      name: this.nickname,
    }
    const live = this.session.members.filter(
      (m) =>
        m.id === this.clientId ||
        this.channels.get(m.id)?.readyState === 'open',
    )
    const members = live.some((m) => m.id === self.id)
      ? live
      : [self, ...live]
    for (const m of this.session.members) {
      if (!members.some((x) => x.id === m.id)) {
        this.peerLastSeen.delete(m.id)
        this.closePeer(m.id)
      }
    }
    this.session = { ...this.session, members }
    this.events.onMembers(this.session.members)
  }

  private closePeer(id: string) {
    const timer = this.peerRetryTimers.get(id)
    if (timer) {
      window.clearTimeout(timer)
      this.peerRetryTimers.delete(id)
    }
    this.peers.get(id)?.close()
    this.peers.delete(id)
    this.channels.delete(id)
  }

  private schedulePeerRetry(remoteId: string) {
    if (this.destroyed || !remoteId) return
    if (this.channels.get(remoteId)?.readyState === 'open') return
    if (this.peerRetryTimers.has(remoteId)) return
    const attempt = this.peerRetryCounts.get(remoteId) ?? 0
    if (attempt >= PEER_RETRY_MAX) return

    const delay = 1200 * (attempt + 1)
    const timer = window.setTimeout(() => {
      this.peerRetryTimers.delete(remoteId)
      if (this.destroyed) return
      if (this.channels.get(remoteId)?.readyState === 'open') return
      this.closePeer(remoteId)
      this.peerRetryCounts.set(remoteId, attempt + 1)
      const shouldOffer = this.clientId > remoteId
      void this.ensurePeer(remoteId, shouldOffer)
    }, delay)
    this.peerRetryTimers.set(remoteId, timer)
  }

  private async ensurePeer(remoteId: string, createOffer: boolean) {
    if (!remoteId || remoteId === this.clientId) return null
    let pc = this.peers.get(remoteId)
    if (pc) return pc

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.peers.set(remoteId, pc)

    const channel = pc.createDataChannel('datachannel', {
      negotiated: true,
      id: 0,
    })
    this.bindChannel(remoteId, channel)

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return
      this.signal.sendTo(remoteId, {
        type: 'candidate',
        candidate: {
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
          candidate: ev.candidate.candidate,
        },
      })
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'connected') {
        this.peerRetryCounts.delete(remoteId)
        return
      }
      if (state === 'failed' || state === 'disconnected') {
        this.schedulePeerRetry(remoteId)
      }
    }

    if (createOffer) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.signal.sendTo(remoteId, {
        type: 'offer',
        description: offer,
      })
    }

    // 跨网 ICE 可能一直 pending：超时后重试
    window.setTimeout(() => {
      if (this.destroyed) return
      if (this.channels.get(remoteId)?.readyState === 'open') return
      this.schedulePeerRetry(remoteId)
    }, 5000)

    return pc
  }

  private bindChannel(remoteId: string, channel: RTCDataChannel) {
    this.channels.set(remoteId, channel)
    channel.onopen = () => {
      this.peerRetryCounts.delete(remoteId)
      const timer = this.peerRetryTimers.get(remoteId)
      if (timer) {
        window.clearTimeout(timer)
        this.peerRetryTimers.delete(remoteId)
      }
      this.setMode('webrtc')
      // 有已选菜才推快照；空点单新人静默等待，避免盖掉房内菜单
      if (this.session.selectedRecipeIds.length === 0) return
      this.sendSession(true, remoteId)
    }
    channel.onmessage = (ev) => {
      try {
        void this.handleAppMessage(
          JSON.parse(String(ev.data)) as AppMessage,
          remoteId,
        )
      } catch {
        // ignore
      }
    }
    channel.onclose = () => {
      this.channels.delete(remoteId)
      if (
        ![...this.channels.values()].some((c) => c.readyState === 'open') &&
        this.signal.isOpen
      ) {
        this.setMode('mqtt')
      }
    }
  }
}
