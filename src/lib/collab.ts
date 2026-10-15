import type { CollabSession, FilterMode, IngredientStatus, Recipe } from '../types'
import { AchexClient } from './achex'

export type CollabTransportMode = 'idle' | 'achex' | 'webrtc' | 'achex-relay'

export type CollabEvents = {
  onSession: (session: CollabSession) => void
  onMembers: (members: CollabSession['members']) => void
  onStatus: (mode: CollabTransportMode) => void
  onError: (message: string) => void
}

type AppMessage =
  | {
      type: 'peer-join-room'
      peer: { id: string; nickname: string }
      roomId: string
    }
  | { type: 'session'; session: CollabSession }
  | { type: 'offer'; description: RTCSessionDescriptionInit }
  | { type: 'answer'; description: RTCSessionDescriptionInit }
  | {
      type: 'candidate'
      candidate: {
        sdpMLineIndex: number | null
        candidate: string
      }
    }

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.voipbuster.com:3478' },
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

export function filterRecipes(
  recipes: Recipe[],
  available: string[],
  mode: FilterMode,
  query: string,
  tags: string[],
): Recipe[] {
  const availableSet = new Set(available)
  const q = query.trim().toLowerCase()
  return recipes.filter((recipe) => {
    if (q && !recipe.name.toLowerCase().includes(q)) return false
    if (tags.length && !tags.every((t) => recipe.tags.includes(t))) return false
    if (available.length === 0) return true
    if (mode === 'all') {
      return recipe.ingredients.every((ing) => availableSet.has(ing))
    }
    return recipe.ingredients.some((ing) => availableSet.has(ing))
  })
}

export function buildIngredientStatus(
  recipes: Recipe[],
  recipeIds: string[],
  available: string[],
  prev: Record<string, IngredientStatus> = {},
): Record<string, IngredientStatus> {
  const availableSet = new Set(available)
  const names = new Set<string>()
  for (const id of recipeIds) {
    const recipe = recipes.find((r) => r.id === id)
    recipe?.ingredients.forEach((ing) => names.add(ing))
  }
  const next: Record<string, IngredientStatus> = {}
  for (const name of names) {
    next[name] = prev[name] ?? (availableSet.has(name) ? 'have' : 'need')
  }
  return next
}

export class CollabRoom {
  private roomId: string
  private nickname: string
  private clientId = ''
  private events: CollabEvents
  private achex = new AchexClient()
  private peers = new Map<string, RTCPeerConnection>()
  private channels = new Map<string, RTCDataChannel>()
  private session: CollabSession
  private destroyed = false

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
      revisedAt: Date.now(),
    }

    void this.achex
      .joinRoom(roomId, nickname, {
        onJoined: ({ clientId, peers }) => {
          this.clientId = clientId
          this.session = {
            ...this.session,
            members: [
              { id: clientId, name: nickname },
              ...peers.map((p) => ({ id: p.id, name: p.nickname })),
            ],
          }
          this.events.onMembers(this.session.members)
          this.events.onSession(this.session)
          this.setMode('achex')
          for (const peer of peers) {
            void this.ensurePeer(peer.id, true)
          }
        },
        onPeerLeave: (peer) => {
          this.session = {
            ...this.session,
            members: this.session.members.filter((m) => m.id !== peer.id),
          }
          this.events.onMembers(this.session.members)
          this.closePeer(peer.id)
        },
        onMessage: (message, fromSessionId) => {
          void this.handleAppMessage(message as AppMessage, fromSessionId)
        },
        onClose: () => {
          if (!this.destroyed) this.setMode('idle')
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

  destroy() {
    this.destroyed = true
    for (const pc of this.peers.values()) pc.close()
    this.peers.clear()
    this.channels.clear()
    this.achex.close()
  }

  private setMode(mode: CollabTransportMode) {
    this.events.onStatus(mode)
  }

  private publishSession() {
    const payload: AppMessage = { type: 'session', session: this.session }
    let sentViaRtc = false
    for (const channel of this.channels.values()) {
      if (channel.readyState === 'open') {
        channel.send(JSON.stringify(payload))
        sentViaRtc = true
      }
    }
    if (sentViaRtc) {
      this.setMode('webrtc')
    } else {
      this.achex.broadcast(payload)
      this.setMode('achex-relay')
    }
  }

  private async handleAppMessage(message: AppMessage, fromSessionId: string) {
    if (!message || typeof message !== 'object' || !('type' in message)) return

    if (message.type === 'peer-join-room') {
      if (message.roomId !== this.roomId) return
      if (message.peer.id === this.clientId) return
      this.upsertMember(message.peer.id, message.peer.nickname)
      await this.ensurePeer(message.peer.id, true)
      this.achex.broadcast({ type: 'session', session: this.session })
      return
    }

    if (message.type === 'session') {
      if (message.session.revisedAt >= this.session.revisedAt) {
        this.applyRemoteSession(message.session)
        if (![...this.channels.values()].some((c) => c.readyState === 'open')) {
          this.setMode('achex-relay')
        }
      }
      return
    }

    if (!fromSessionId || fromSessionId === this.clientId) return

    if (message.type === 'offer') {
      const pc = await this.ensurePeer(fromSessionId, false)
      if (!pc) return
      await pc.setRemoteDescription(message.description)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.achex.sendTo(fromSessionId, { type: 'answer', description: answer })
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

  private upsertMember(id: string, name: string) {
    const exists = this.session.members.some((m) => m.id === id)
    this.session = {
      ...this.session,
      members: exists
        ? this.session.members.map((m) => (m.id === id ? { id, name } : m))
        : [...this.session.members, { id, name }],
    }
    this.events.onMembers(this.session.members)
  }

  private closePeer(id: string) {
    this.peers.get(id)?.close()
    this.peers.delete(id)
    this.channels.delete(id)
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
      this.achex.sendTo(remoteId, {
        type: 'candidate',
        candidate: {
          sdpMLineIndex: ev.candidate.sdpMLineIndex,
          candidate: ev.candidate.candidate,
        },
      })
    }

    if (createOffer) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.achex.sendTo(remoteId, {
        type: 'offer',
        description: offer,
      })
    }

    return pc
  }

  private bindChannel(remoteId: string, channel: RTCDataChannel) {
    this.channels.set(remoteId, channel)
    channel.onopen = () => this.setMode('webrtc')
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
        this.achex.isOpen
      ) {
        this.setMode('achex-relay')
      }
    }
  }
}
