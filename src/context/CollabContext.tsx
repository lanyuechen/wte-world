import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CollabRoom,
  createEmptySession,
  type CollabTransportMode,
} from '../lib/collab'
import { loadActiveRoomId } from '../lib/storage'
import type { CollabSession } from '../types'
import { useApp } from './AppContext'

type CollabContextValue = {
  session: CollabSession
  mode: CollabTransportMode
  error: string
  roomId: string
  patchSession: (partial: Partial<CollabSession>) => void
  clearError: () => void
}

const CollabContext = createContext<CollabContextValue | null>(null)

export function CollabProvider({ children }: { children: ReactNode }) {
  const { data, settings } = useApp()
  const roomRef = useRef<CollabRoom | null>(null)
  const [roomId, setRoomId] = useState(() => loadActiveRoomId())
  const [session, setSession] = useState<CollabSession>(() =>
    createEmptySession(roomId),
  )
  const [mode, setMode] = useState<CollabTransportMode>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const onRoom = (event: Event) => {
      const next = (event as CustomEvent<{ roomId?: string }>).detail?.roomId
      if (next?.trim()) setRoomId(next.trim())
      else setRoomId(loadActiveRoomId())
    }
    window.addEventListener('wte:active-room', onRoom)
    return () => window.removeEventListener('wte:active-room', onRoom)
  }, [])

  useEffect(() => {
    setError('')
    const collab = new CollabRoom(
      roomId,
      settings.nickname,
      {
        onSession: setSession,
        onMembers: (members) =>
          setSession((prev) => ({ ...prev, members })),
        onStatus: setMode,
        onError: setError,
      },
      {
        availableIngredients: data.availableIngredients,
        filterMode: 'any',
        selectedRecipeIds: [],
      },
    )
    roomRef.current = collab
    setSession(collab.getSession())

    return () => {
      collab.destroy()
      roomRef.current = null
    }
    // 昵称或房间变化时重建连接
  }, [settings.nickname, roomId])

  const patchSession = useCallback((partial: Partial<CollabSession>) => {
    roomRef.current?.updateSession(partial)
  }, [])

  const clearError = useCallback(() => setError(''), [])

  const value = useMemo(
    () => ({
      session,
      mode,
      error,
      roomId,
      patchSession,
      clearError,
    }),
    [session, mode, error, roomId, patchSession, clearError],
  )

  return (
    <CollabContext.Provider value={value}>{children}</CollabContext.Provider>
  )
}

export function useCollab() {
  const ctx = useContext(CollabContext)
  if (!ctx) throw new Error('useCollab must be used within CollabProvider')
  return ctx
}
