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
  deleteRecipeThumbnail,
  fetchAppData,
  isConflictError,
  putAppData,
  thumbnailRawUrl,
  uploadThumbnail,
} from '../lib/github'
import { loadCachedData, loadSettings, saveCachedData, saveSettings } from '../lib/storage'

const CONFLICT_RETRY_MAX = 2

function pickNewerByUpdatedAt<T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[],
): T[] {
  const map = new Map<string, T>()
  for (const item of remote) map.set(item.id, item)
  for (const item of local) {
    const prev = map.get(item.id)
    if (!prev) {
      map.set(item.id, item)
      continue
    }
    const localT = Date.parse(item.updatedAt) || 0
    const remoteT = Date.parse(prev.updatedAt) || 0
    map.set(item.id, localT >= remoteT ? item : prev)
  }
  return [...map.values()]
}

/** 冲突时合并本地与远程：菜谱/订单按 updatedAt 取新，食材列表取并集。 */
function mergeAppDataForConflict(local: AppData, remote: AppData): AppData {
  const recipes = pickNewerByUpdatedAt(local.recipes, remote.recipes).sort(
    (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
  )
  const orders = pickNewerByUpdatedAt(local.orders, remote.orders).sort(
    (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
  )
  const availableIngredients = [
    ...new Set([...remote.availableIngredients, ...local.availableIngredients]),
  ].sort((a, b) => a.localeCompare(b, 'zh'))
  return { recipes, orders, availableIngredients }
}

type Status = {
  syncing: boolean
  error: string
  /** 失败后可重试：写回 / 拉取 */
  retry: 'persist' | 'sync' | null
}

type AppContextValue = {
  data: AppData
  settings: AppSettings
  status: Status
  thumbUrl: (path: string) => string
  applyGithubToken: (token: string) => Promise<void>
  syncFromRemote: () => Promise<void>
  /** thumbnailPatch：undefined 保持原封面；'' 清除；data URL 换新图 */
  saveRecipe: (recipe: Recipe, thumbnailPatch?: string) => void
  removeRecipe: (id: string) => void
  saveOrder: (order: Order, availableIngredients?: string[]) => void
  /** 协同端收到他人生成的订单：只写本地，不触发 GitHub */
  applyRemoteOrder: (order: Order, availableIngredients?: string[]) => void
  removeOrder: (id: string) => void
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
    error: '',
    retry: null,
  })

  const configured = Boolean(
    GITHUB_CONFIG.owner &&
      GITHUB_CONFIG.repo &&
      resolveGithubToken(settings.github.token) &&
      !GITHUB_CONFIG.owner.startsWith('YOUR_'),
  )

  const runPersist = useCallback(async () => {
    if (flushingRef.current) return
    flushingRef.current = true
    let failed = false
    let conflictTries = 0

    setStatus((s) => ({
      ...s,
      syncing: true,
      error: '',
      retry: null,
    }))

    try {
      while (dirtyRef.current) {
        dirtyRef.current = false
        try {
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
          conflictTries = 0
        } catch (err) {
          if (isConflictError(err) && conflictTries < CONFLICT_RETRY_MAX) {
            conflictTries += 1
            const github = githubFromSettings(settingsRef.current)
            const remote = await fetchAppData(github)
            const merged = mergeAppDataForConflict(dataRef.current, remote.data)
            dataRef.current = merged
            setData(merged)
            setSha(remote.sha)
            shaRef.current = remote.sha
            saveCachedData(merged, remote.sha)
            dirtyRef.current = true
            continue
          }
          throw err
        }
      }
      setStatus({
        syncing: false,
        error: '',
        retry: null,
      })
    } catch (err) {
      failed = true
      dirtyRef.current = true
      setStatus({
        syncing: false,
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
    const github = githubFromSettings(settingsRef.current)
    if (!github.token || github.owner.startsWith('YOUR_')) {
      setStatus((s) => ({
        ...s,
        error: '请先输入 GitHub Token',
        retry: null,
      }))
      return
    }
    setStatus({
      syncing: true,
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
        error: '',
        retry: null,
      })
    } catch (err) {
      setStatus({
        syncing: false,
        error: err instanceof Error ? err.message : '同步失败',
        retry: 'sync',
      })
    }
  }, [])

  const applyGithubToken = useCallback(
    async (token: string) => {
      const trimmed = token.trim()
      if (!trimmed) return
      const next: AppSettings = {
        ...settingsRef.current,
        github: {
          owner: GITHUB_CONFIG.owner,
          repo: GITHUB_CONFIG.repo,
          branch: GITHUB_CONFIG.branch,
          token: trimmed,
        },
      }
      setSettingsState(next)
      settingsRef.current = next
      saveSettings(next)
      await syncFromRemote()
    },
    [syncFromRemote],
  )

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
    (recipe: Recipe, thumbnailPatch?: string) => {
      let prevThumb = ''
      let nextThumb = recipe.thumbnail
      commit((prev) => {
        prevThumb = prev.recipes.find((r) => r.id === recipe.id)?.thumbnail ?? ''
        nextThumb =
          thumbnailPatch !== undefined ? thumbnailPatch : recipe.thumbnail
        const saved: Recipe = { ...recipe, thumbnail: nextThumb }
        const exists = prev.recipes.some((r) => r.id === saved.id)
        const recipes = exists
          ? prev.recipes.map((r) => (r.id === saved.id ? saved : r))
          : [...prev.recipes, saved]
        return { ...prev, recipes }
      })
      // 清除封面，或仓库路径变更时删旧文件（同 id 的 data: 上传会覆盖，无需先删）
      const shouldDeleteOld =
        Boolean(prevThumb) &&
        !prevThumb.startsWith('data:') &&
        (nextThumb === '' ||
          (Boolean(nextThumb) &&
            !nextThumb.startsWith('data:') &&
            nextThumb !== prevThumb))
      if (shouldDeleteOld) {
        const gh = githubFromSettings(settingsRef.current)
        void deleteRecipeThumbnail(gh, recipe.id, prevThumb)
      }
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
      const gh = githubFromSettings(settingsRef.current)
      void deleteRecipeThumbnail(gh, id, thumb)
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

  const applyRemoteOrder = useCallback(
    (order: Order, availableIngredients?: string[]) => {
      setData((prev) => {
        const exists = prev.orders.some((o) => o.id === order.id)
        const orders = exists
          ? prev.orders.map((o) => (o.id === order.id ? order : o))
          : [order, ...prev.orders]
        const next = {
          ...prev,
          orders,
          ...(availableIngredients !== undefined
            ? { availableIngredients }
            : null),
        }
        dataRef.current = next
        saveCachedData(next, shaRef.current)
        return next
      })
    },
    [],
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

  const allIngredients = useMemo(() => {
    const set = new Set<string>(data.availableIngredients)
    data.recipes.forEach((r) => r.ingredients.forEach((i) => set.add(i)))
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }, [data])

  const value: AppContextValue = {
    data: data ?? EMPTY_APP_DATA,
    settings,
    status,
    thumbUrl,
    applyGithubToken,
    syncFromRemote,
    saveRecipe,
    removeRecipe,
    saveOrder,
    applyRemoteOrder,
    removeOrder,
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
