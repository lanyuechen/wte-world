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
import type { AppData, AppSettings, Order, Recipe } from '../types'
import { EMPTY_APP_DATA } from '../types'
import { GITHUB_CONFIG, resolveGithubToken } from '../config'
import {
  deleteThumbnail,
  fetchAppData,
  putAppData,
  testConnection,
  thumbnailRawUrl,
  uploadThumbnail,
} from '../lib/github'
import { loadCachedData, loadSettings, saveCachedData, saveSettings } from '../lib/storage'

type Status = {
  syncing: boolean
  message: string
  error: string
  /** 顶部条重试行为：写回 / 拉取 */
  retry: 'persist' | 'sync' | null
}

type AppContextValue = {
  data: AppData
  settings: AppSettings
  sha: string | null
  status: Status
  configured: boolean
  thumbUrl: (path: string) => string
  setSettings: (next: AppSettings) => void
  syncFromRemote: () => Promise<void>
  testGithub: () => Promise<string>
  saveRecipe: (recipe: Recipe, thumbnailDataUrl?: string | null) => void
  removeRecipe: (id: string) => void
  setAvailableIngredients: (list: string[]) => void
  saveOrder: (order: Order, availableIngredients?: string[]) => void
  removeOrder: (id: string) => void
  setCollabRoomId: (roomId: string) => void
  retryPersist: () => void
  dismissPersistError: () => void
  allIngredients: string[]
}

const AppContext = createContext<AppContextValue | null>(null)

function githubFromSettings(settings: AppSettings) {
  return {
    owner: GITHUB_CONFIG.owner,
    repo: GITHUB_CONFIG.repo,
    branch: GITHUB_CONFIG.branch,
    token: resolveGithubToken(settings.github.token),
  }
}

/** 本地 data: 缩略图先上传，再写回仓库 path。 */
async function materializeThumbnails(
  settings: AppSettings,
  data: AppData,
): Promise<AppData> {
  const github = githubFromSettings(settings)
  if (!github.token) return data

  let changed = false
  const recipes: Recipe[] = []
  for (const recipe of data.recipes) {
    if (!recipe.thumbnail.startsWith('data:')) {
      recipes.push(recipe)
      continue
    }
    const path = await uploadThumbnail(github, recipe.id, recipe.thumbnail)
    recipes.push({ ...recipe, thumbnail: path })
    changed = true
  }
  return changed ? { ...data, recipes } : data
}

function mergeUploadedThumbs(current: AppData, uploaded: AppData): AppData {
  if (current === uploaded) return uploaded
  return {
    ...current,
    recipes: current.recipes.map((r) => {
      const next = uploaded.recipes.find((x) => x.id === r.id)
      if (
        next &&
        r.thumbnail.startsWith('data:') &&
        !next.thumbnail.startsWith('data:')
      ) {
        return { ...r, thumbnail: next.thumbnail }
      }
      return r
    }),
  }
}

async function persistToGithub(
  settings: AppSettings,
  data: AppData,
  sha: string | null,
): Promise<{ data: AppData; sha: string | null }> {
  const prepared = await materializeThumbnails(settings, data)
  saveCachedData(prepared, sha)
  const github = githubFromSettings(settings)
  if (!github.owner || !github.repo || !github.token) {
    return { data: prepared, sha }
  }
  const res = await putAppData(github, prepared, sha)
  saveCachedData(prepared, res.sha)
  return { data: prepared, sha: res.sha }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const cached = loadCachedData()
  const [settings, setSettingsState] = useState<AppSettings>(() => loadSettings())
  const [data, setData] = useState<AppData>(cached.data)
  const [sha, setSha] = useState<string | null>(cached.sha)
  const dataRef = useRef(data)
  const shaRef = useRef(sha)
  const settingsRef = useRef(settings)
  const dirtyRef = useRef(false)
  const flushingRef = useRef(false)
  dataRef.current = data
  shaRef.current = sha
  settingsRef.current = settings

  const [status, setStatus] = useState<Status>({
    syncing: false,
    message: '',
    error: '',
    retry: null,
  })

  const configured = Boolean(
    GITHUB_CONFIG.owner &&
      GITHUB_CONFIG.repo &&
      resolveGithubToken(settings.github.token) &&
      !GITHUB_CONFIG.owner.startsWith('YOUR_'),
  )

  const setSettings = useCallback((next: AppSettings) => {
    const merged: AppSettings = {
      ...next,
      github: {
        owner: GITHUB_CONFIG.owner,
        repo: GITHUB_CONFIG.repo,
        branch: GITHUB_CONFIG.branch,
        token: resolveGithubToken(next.github.token),
      },
    }
    setSettingsState(merged)
    saveSettings(merged)
  }, [])

  const runPersist = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    let failed = false

    setStatus((s) => ({
      ...s,
      syncing: true,
      message: s.error ? '重试中…' : '保存中…',
      error: '',
      retry: null,
    }))

    try {
      while (dirtyRef.current) {
        dirtyRef.current = false
        const snapshot = dataRef.current
        const currentSha = shaRef.current
        const result = await persistToGithub(
          settingsRef.current,
          snapshot,
          currentSha,
        )
        const merged = mergeUploadedThumbs(dataRef.current, result.data)
        dataRef.current = merged
        setData(merged)
        setSha(result.sha)
        shaRef.current = result.sha
      }
      setStatus({
        syncing: false,
        message: '已保存',
        error: '',
        retry: null,
      })
    } catch (err) {
      failed = true
      dirtyRef.current = true
      setStatus({
        syncing: false,
        message: '',
        error:
          err instanceof Error ? err.message : '保存失败（已写入本地缓存）',
        retry: 'persist',
      })
    } finally {
      flushingRef.current = false
      if (!failed && dirtyRef.current) {
        void runPersist()
      }
    }
  }, [])

  const schedulePersist = useCallback(() => {
    dirtyRef.current = true
    void runPersist()
  }, [runPersist])

  const retryPersist = useCallback(() => {
    dirtyRef.current = true
    void runPersist()
  }, [runPersist])

  const dismissPersistError = useCallback(() => {
    setStatus((s) => ({ ...s, error: '', retry: null }))
  }, [])

  const syncFromRemote = useCallback(async () => {
    const github = githubFromSettings(settings)
    if (!github.token || github.owner.startsWith('YOUR_')) {
      setStatus((s) => ({
        ...s,
        error: '请先在 src/config.ts 填写仓库与 Token',
        retry: null,
      }))
      return
    }
    setStatus({
      syncing: true,
      message: '同步中…',
      error: '',
      retry: null,
    })
    try {
      const res = await fetchAppData(github)
      setData(res.data)
      setSha(res.sha)
      dataRef.current = res.data
      shaRef.current = res.sha
      dirtyRef.current = false
      saveCachedData(res.data, res.sha)
      setStatus({
        syncing: false,
        message: res.created ? '已初始化远程 app.json' : '同步完成',
        error: '',
        retry: null,
      })
    } catch (err) {
      setStatus({
        syncing: false,
        message: '',
        error: err instanceof Error ? err.message : '同步失败',
        retry: 'sync',
      })
    }
  }, [settings])

  useEffect(() => {
    if (configured) {
      void syncFromRemote()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  /** 先更新本地，再异步串行写 GitHub。 */
  const commit = useCallback(
    (updater: (prev: AppData) => AppData) => {
      const next = updater(dataRef.current)
      setData(next)
      dataRef.current = next
      saveCachedData(next, shaRef.current)
      schedulePersist()
    },
    [schedulePersist],
  )

  const thumbUrl = useCallback(
    (path: string) => {
      if (!path) return ''
      if (
        path.startsWith('data:') ||
        path.startsWith('blob:') ||
        path.startsWith('http://') ||
        path.startsWith('https://')
      ) {
        return path
      }
      return thumbnailRawUrl(settings.github, path)
    },
    [settings.github],
  )

  const saveRecipe = useCallback(
    (recipe: Recipe, thumbnailDataUrl?: string | null) => {
      const saved: Recipe = {
        ...recipe,
        thumbnail:
          thumbnailDataUrl !== undefined && thumbnailDataUrl !== null
            ? thumbnailDataUrl
            : recipe.thumbnail,
      }
      commit((prev) => {
        const exists = prev.recipes.some((r) => r.id === saved.id)
        const recipes = exists
          ? prev.recipes.map((r) => (r.id === saved.id ? saved : r))
          : [...prev.recipes, saved]
        return { ...prev, recipes }
      })
    },
    [commit],
  )

  const removeRecipe = useCallback(
    (id: string) => {
      let thumb = ''
      commit((prev) => {
        thumb = prev.recipes.find((r) => r.id === id)?.thumbnail ?? ''
        return { ...prev, recipes: prev.recipes.filter((r) => r.id !== id) }
      })
      if (thumb && !thumb.startsWith('data:')) {
        const gh = githubFromSettings(settingsRef.current)
        void deleteThumbnail(gh, thumb)
      }
    },
    [commit],
  )

  const setAvailableIngredients = useCallback(
    (list: string[]) => {
      commit((prev) => ({ ...prev, availableIngredients: list }))
    },
    [commit],
  )

  const saveOrder = useCallback(
    (order: Order, availableIngredients?: string[]) => {
      commit((prev) => {
        const exists = prev.orders.some((o) => o.id === order.id)
        const orders = exists
          ? prev.orders.map((o) => (o.id === order.id ? order : o))
          : [order, ...prev.orders]
        return {
          ...prev,
          orders,
          ...(availableIngredients !== undefined
            ? { availableIngredients }
            : null),
        }
      })
    },
    [commit],
  )

  const removeOrder = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        orders: prev.orders.filter((o) => o.id !== id),
      }))
    },
    [commit],
  )

  const setCollabRoomId = useCallback(
    (roomId: string) => {
      commit((prev) => ({ ...prev, collabRoomId: roomId || 'home' }))
    },
    [commit],
  )

  const testGithub = useCallback(async () => {
    return testConnection(githubFromSettings(settings))
  }, [settings])

  const allIngredients = useMemo(() => {
    const set = new Set<string>(data.availableIngredients)
    data.recipes.forEach((r) => r.ingredients.forEach((i) => set.add(i)))
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }, [data])

  const value: AppContextValue = {
    data: data ?? EMPTY_APP_DATA,
    settings,
    sha,
    status,
    configured,
    thumbUrl,
    setSettings,
    syncFromRemote,
    testGithub,
    saveRecipe,
    removeRecipe,
    setAvailableIngredients,
    saveOrder,
    removeOrder,
    setCollabRoomId,
    retryPersist,
    dismissPersistError,
    allIngredients,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
