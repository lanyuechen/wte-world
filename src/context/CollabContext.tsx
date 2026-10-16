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
import { loadActiveRoomId, loadOrderFilter, saveOrderFilter } from '../lib/storage'
import type { CollabSession, Order } from '../types'
import { useApp } from './AppContext'

type CollabContextValue = {
  session: CollabSession
  mode: CollabTransportMode
  error: string
  roomId: string
  patchSession: (partial: Partial<CollabSession>) => void
  /** 生成新订单：广播并清空点单草稿 */
  publishOrderCreated: (order: Order, availableIngredients: string[]) => void
  /** 更新已有订单（加菜/删菜）：广播，不清空点单草稿 */
  publishOrderUpdated: (order: Order, availableIngredients?: string[]) => void
  clearError: () => void
}

const CollabContext = createContext<CollabContextValue | null>(null)

export function CollabProvider({ children }: { children: ReactNode }) {
  const { settings, applyRemoteOrder } = useApp()
  const roomRef = useRef<CollabRoom | null>(null)
  const applyRemoteOrderRef = useRef(applyRemoteOrder)
  const [roomId, setRoomId] = useState(() => loadActiveRoomId())

  useEffect(() => {
    applyRemoteOrderRef.current = applyRemoteOrder
  }, [applyRemoteOrder])
  const [session, setSession] = useState<CollabSession>(() => {
    const filter = loadOrderFilter()
    return {
      ...createEmptySession(roomId),
      availableIngredients: filter.availableIngredients,
      filterMode: filter.filterMode,
    }
  })
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
    const filter = loadOrderFilter()
    const collab = new CollabRoom(
      roomId,
      settings.nickname,
      {
        onSession: setSession,
        onMembers: (members) =>
          setSession((prev) => ({ ...prev, members })),
        onStatus: setMode,
        onError: setError,
        onOrderCreated: (order, availableIngredients) => {
          applyRemoteOrderRef.current(order, availableIngredients)
        },
        onOrderUpdated: (order, availableIngredients) => {
          applyRemoteOrderRef.current(order, availableIngredients)
        },
      },
      {
        availableIngredients: filter.availableIngredients,
        filterMode: filter.filterMode,
        selectedRecipeIds: [],
      },
    )
    roomRef.current = collab
    setSession(collab.getSession())

    return () => {
      collab.destroy()
      roomRef.current = null
    }
  }, [settings.nickname, roomId])

  useEffect(() => {
    saveOrderFilter({
      availableIngredients: session.availableIngredients,
      filterMode: session.filterMode,
    })
  }, [session.availableIngredients, session.filterMode])

  const patchSession = useCallback((partial: Partial<CollabSession>) => {
    roomRef.current?.updateSession(partial)
  }, [])

  const publishOrderCreated = useCallback(
    (order: Order, availableIngredients: string[]) => {
      roomRef.current?.publishOrderCreated(order, availableIngredients)
    },
    [],
  )

  const publishOrderUpdated = useCallback(
    (order: Order, availableIngredients: string[] = []) => {
      roomRef.current?.publishOrderUpdated(order, availableIngredients)
    },
    [],
  )

  const clearError = useCallback(() => setError(''), [])

  const value = useMemo(
    () => ({
      session,
      mode,
      error,
      roomId,
      patchSession,
      publishOrderCreated,
      publishOrderUpdated,
      clearError,
    }),
    [
      session,
      mode,
      error,
      roomId,
      patchSession,
      publishOrderCreated,
      publishOrderUpdated,
      clearError,
    ],
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
