import { Octokit } from '@octokit/rest'
import type { AppData, GithubSettings } from '../types'
import { EMPTY_APP_DATA, normalizeAppData } from '../types'
import { APP_JSON_PATH, THUMBNAIL_DIR } from '../constants'

function client(token: string) {
  return new Octokit({ auth: token })
}

function assertConfigured(settings: GithubSettings) {
  if (!settings.owner || !settings.repo || !settings.token) {
    throw new Error('请先在设置中填写 GitHub owner、repo 与 Token')
  }
}

function toGithubError(err: unknown): Error {
  const status = (err as { status?: number })?.status
  const message = String((err as { message?: string })?.message ?? '')
  if (status === 401 || /bad credentials/i.test(message)) {
    return new Error(
      'GitHub Token 无效或已过期，请重新输入或扫描带 Token 的二维码',
    )
  }
  if (status === 403) {
    return new Error('GitHub 权限不足，请检查 Token 对数据仓库的 Contents 读写权限')
  }
  if (status === 409 || status === 422) {
    return new Error('远程数据已变更，请先同步再保存')
  }
  if (err instanceof Error) return err
  return new Error(message || 'GitHub 请求失败')
}

export function thumbnailRawUrl(
  settings: GithubSettings,
  path: string,
): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path
  }
  const clean = path.replace(/^\//, '')
  // 国内 cdn.jsdelivr.net 对图片常不稳定（夸克等），改走 testingcf 节点
  return `https://testingcf.jsdelivr.net/gh/${settings.owner}/${settings.repo}@${settings.branch}/${clean}`
}

/** 上传约定路径：assets/thumbnails/{recipeId}.jpg */
export function thumbnailPathForRecipe(recipeId: string) {
  return `${THUMBNAIL_DIR}/${recipeId}.jpg`
}

/** 把 thumbnail 字段（相对路径或 CDN/raw URL）收成仓库内路径，供删除用。 */
export function normalizeThumbnailRepoPath(path: string): string {
  const raw = path.trim()
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return ''
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return raw.replace(/^\//, '')
  }
  try {
    const { pathname } = new URL(raw)
    const marker = `/${THUMBNAIL_DIR}/`
    const idx = pathname.indexOf(marker)
    if (idx >= 0) {
      return pathname.slice(idx + 1).replace(/\/+$/, '')
    }
    const file = pathname.match(/\/thumbnails\/([^/?#]+)$/i)?.[1]
    if (file) return `${THUMBNAIL_DIR}/${file}`
  } catch {
    // ignore
  }
  return ''
}

export async function fetchAppData(settings: GithubSettings): Promise<{
  data: AppData
  sha: string | null
}> {
  assertConfigured(settings)
  const octokit = client(settings.token)
  try {
    const res = await octokit.repos.getContent({
      owner: settings.owner,
      repo: settings.repo,
      path: APP_JSON_PATH,
      ref: settings.branch,
    })
    if (Array.isArray(res.data) || res.data.type !== 'file' || !('content' in res.data)) {
      throw new Error('app.json 格式异常')
    }
    const content = decodeURIComponent(escape(atob(res.data.content.replace(/\n/g, ''))))
    const parsed = JSON.parse(content) as AppData
    return {
      data: normalizeAppData({ ...EMPTY_APP_DATA, ...parsed }),
      sha: res.data.sha,
    }
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 404) {
      const initial = { ...EMPTY_APP_DATA }
      const { sha } = await putAppData(settings, initial, null)
      return { data: initial, sha }
    }
    throw toGithubError(err)
  }
}

export async function putAppData(
  settings: GithubSettings,
  data: AppData,
  sha: string | null,
): Promise<{ sha: string }> {
  assertConfigured(settings)
  const octokit = client(settings.token)
  const content = btoa(
    unescape(
      encodeURIComponent(JSON.stringify(normalizeAppData(data), null, 2)),
    ),
  )
  try {
    const res = await octokit.repos.createOrUpdateFileContents({
      owner: settings.owner,
      repo: settings.repo,
      path: APP_JSON_PATH,
      message: `chore(wte): update app data ${new Date().toISOString()}`,
      content,
      branch: settings.branch,
      ...(sha ? { sha } : {}),
    })
    const newSha = res.data.content?.sha
    if (!newSha) throw new Error('写入成功但未返回 SHA')
    return { sha: newSha }
  } catch (err: unknown) {
    throw toGithubError(err)
  }
}

export async function uploadThumbnail(
  settings: GithubSettings,
  recipeId: string,
  base64Jpeg: string,
  existingSha?: string,
): Promise<string> {
  assertConfigured(settings)
  const octokit = client(settings.token)
  const path = `${THUMBNAIL_DIR}/${recipeId}.jpg`
  const content = base64Jpeg.replace(/^data:image\/\w+;base64,/, '')

  let sha = existingSha
  if (!sha) {
    try {
      const existing = await octokit.repos.getContent({
        owner: settings.owner,
        repo: settings.repo,
        path,
        ref: settings.branch,
      })
      if (!Array.isArray(existing.data) && existing.data.type === 'file') {
        sha = existing.data.sha
      }
    } catch {
      // new file
    }
  }

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner: settings.owner,
      repo: settings.repo,
      path,
      message: `chore(wte): thumbnail ${recipeId}`,
      content,
      branch: settings.branch,
      ...(sha ? { sha } : {}),
    })
  } catch (err: unknown) {
    throw toGithubError(err)
  }

  return path
}

export async function deleteThumbnail(
  settings: GithubSettings,
  pathOrUrl: string,
): Promise<void> {
  const path = normalizeThumbnailRepoPath(pathOrUrl)
  if (!path) return
  if (!settings.owner || !settings.repo || !settings.token) return
  const octokit = client(settings.token)
  try {
    const existing = await octokit.repos.getContent({
      owner: settings.owner,
      repo: settings.repo,
      path,
      ref: settings.branch,
    })
    if (Array.isArray(existing.data) || existing.data.type !== 'file') return
    await octokit.repos.deleteFile({
      owner: settings.owner,
      repo: settings.repo,
      path,
      message: `chore(wte): remove thumbnail ${path}`,
      sha: existing.data.sha,
      branch: settings.branch,
    })
  } catch {
    // best effort（文件本就不存在等）
  }
}

/** 按菜谱 ID（及可选的 thumbnail 字段）删除仓库中的封面文件。 */
export async function deleteRecipeThumbnail(
  settings: GithubSettings,
  recipeId: string,
  thumbnailField?: string,
): Promise<void> {
  const candidates = new Set<string>()
  if (recipeId) candidates.add(thumbnailPathForRecipe(recipeId))
  const fromField = thumbnailField ? normalizeThumbnailRepoPath(thumbnailField) : ''
  if (fromField) candidates.add(fromField)
  for (const path of candidates) {
    await deleteThumbnail(settings, path)
  }
}
