#!/usr/bin/env node
/**
 * 从下厨房链接拉取菜谱，写入数据仓库 data/app.json（并上传封面）。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx npm run import:xcf -- <链接或 id> [更多...]
 *   GITHUB_TOKEN=xxx npm run import:xcf -- --file list.txt
 *   GITHUB_TOKEN=xxx npm run import:xcf -- -f a.txt -f b.txt --dry-run 34602
 *
 * 文件每行一条：完整链接、纯数字 recipe id，或二者混合；
 * 空行与 # 注释忽略。命令行参数与 --file 可并用。
 *
 * Token 需对 wte-world-data 有 Contents 写权限。也可设环境变量
 * GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH 覆盖默认仓库。
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Octokit } from '@octokit/rest'

const OWNER = process.env.GITHUB_OWNER || 'lanyuechen'
const REPO = process.env.GITHUB_REPO || 'wte-world-data'
const BRANCH = process.env.GITHUB_BRANCH || 'master'
const APP_JSON_PATH = 'data/app.json'
const THUMBNAIL_DIR = 'assets/thumbnails'

const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
const UA_DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const RECIPE_ID_RE =
  /(?:https?:\/\/)?(?:[\w-]+\.)?xiachufang\.com\/recipe\/(\d+)\/?/i
const BARE_ID_RE = /^\d{3,}$/

function usage(code = 1) {
  console.error(`用法:
  GITHUB_TOKEN=xxx npm run import:xcf -- [--dry-run] <链接|id> [更多...]
  GITHUB_TOKEN=xxx npm run import:xcf -- [--dry-run] --file list.txt`)
  process.exit(code)
}

function parseArgs(argv) {
  let dryRun = false
  const files = []
  const inputs = []
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--dry-run') {
      dryRun = true
      continue
    }
    if (a === '--file' || a === '-f') {
      const path = argv[i + 1]
      if (!path || path.startsWith('-')) {
        console.error('缺少 --file 路径')
        usage(1)
      }
      files.push(path)
      i += 1
      continue
    }
    if (a.startsWith('-')) {
      console.error(`未知参数: ${a}`)
      usage(1)
    }
    inputs.push(a)
  }
  return { dryRun, files, inputs }
}

function recipeIdFromInput(input) {
  const s = String(input).trim()
  if (!s || s.startsWith('#')) return null
  // 去掉行内注释：34602  # 家常豆腐
  const bare = s.split(/\s+#/)[0].trim()
  const fromUrl = bare.match(RECIPE_ID_RE)?.[1]
  if (fromUrl) return fromUrl
  if (BARE_ID_RE.test(bare)) return bare
  return null
}

function loadEntriesFromFile(filePath) {
  const abs = resolve(filePath)
  let text
  try {
    text = readFileSync(abs, 'utf8')
  } catch (err) {
    throw new Error(`无法读取文件 ${abs}: ${err.message}`)
  }
  return text.split(/\r?\n/)
}

/** 合并命令行与文件条目，解析为去重后的 recipe id 列表（保序）。 */
function collectRecipeIds(inputs, files) {
  const lines = [...inputs]
  for (const f of files) lines.push(...loadEntriesFromFile(f))

  const ids = []
  const seen = new Set()
  for (const line of lines) {
    const id = recipeIdFromInput(line)
    if (!id) {
      const t = String(line).trim()
      if (t && !t.startsWith('#')) {
        console.error(`跳过无法识别的行: ${t}`)
      }
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function canonicalRecipeUrl(id) {
  return `https://www.xiachufang.com/recipe/${id}/`
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function metaContent(html, prop) {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`,
    'i',
  )
  return decodeEntities(html.match(re)?.[1] || html.match(re2)?.[1] || '')
}

function biggerImage(url) {
  if (!url) return ''
  try {
    return new URL(url, 'https://www.xiachufang.com/').href.replace(
      /\/w\/\d+/i,
      '/w/800',
    )
  } catch {
    return url
  }
}

function parseLdRecipe(html) {
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const data = JSON.parse(m[1])
      if (data?.['@type'] === 'Recipe') return data
    } catch {
      // ignore
    }
  }
  return null
}

function ingredientNameFromLine(line) {
  const s = String(line).trim()
  // 「300克豆腐」/「1茶匙（5ml)料酒」→ 尽量取末尾食材名
  const m = s.match(
    /^(?:适量|少许)?(?:\d+(?:\.\d+)?(?:g|kg|ml|mL|斤|两|克|毫升|大勺|小勺|茶匙|汤匙|勺|个|只|块|片|根|颗|粒|碗|杯)?)?(?:（[^）]*）|\([^)]*\))?(.*)$/u,
  )
  const rest = (m?.[1] ?? s).trim()
  return rest || s
}

function stepsFromInstructionText(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  // 移动站常见：0.准备材料,1.切...,2....
  const parts = raw
    .split(/,(?=\d+\.)/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length > 1) {
    return parts.map((p, i) => {
      const body = p.replace(/^\d+\./, '').trim()
      return `${i + 1}. ${body}`
    })
  }
  return raw
    .replace(/\s*(\d+)\./g, '\n$1.')
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function parseRecipe(html, sourceUrl) {
  const hasCaptcha = html.includes('请滑动完成验证')
  const ld = parseLdRecipe(html)
  if (hasCaptcha && !ld) {
    throw new Error('下厨房要求人机验证，请稍后重试')
  }

  const id =
    recipeIdFromInput(sourceUrl) ||
    recipeIdFromInput(
      html.match(
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
      )?.[1] || '',
    )
  const resolved = id ? canonicalRecipeUrl(id) : sourceUrl

  let name =
    ld?.name ||
    metaContent(html, 'og:title') ||
    stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '')
  name = String(name || '').trim()
  if (!name) throw new Error('无法解析菜谱名称')

  let coverUrl = biggerImage(
    (Array.isArray(ld?.image) ? ld.image[0] : ld?.image) ||
      html.match(
        /recipe-cover[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
      )?.[1] ||
      html.match(
        /<div[^>]*class=["'][^"']*cover[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i,
      )?.[1] ||
      metaContent(html, 'og:image'),
  )

  const ingredients = []

  // 桌面站 table
  const ingsTable = html.match(
    /<div[^>]*class=["']ings["'][^>]*>([\s\S]*?)<\/table>/i,
  )?.[1]
  if (ingsTable) {
    for (const row of ingsTable.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
      const n = stripTags(
        row[1].match(/class=["']name["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] || '',
      )
      if (n) ingredients.push(n)
    }
  }

  // 移动站 ing-line
  if (!ingredients.length) {
    const ingsMobile = html.match(
      /id=["']ings["'][\s\S]*?<h3[\s\S]*?用料[\s\S]*?<\/section>/i,
    )?.[0]
    const block = ingsMobile || html
    for (const row of block.matchAll(
      /class=["']ing-name["'][^>]*>([\s\S]*?)<\/div>/gi,
    )) {
      const n = stripTags(row[1])
      if (n) ingredients.push(n)
    }
  }

  // ld+json 兜底
  if (!ingredients.length && Array.isArray(ld?.recipeIngredient)) {
    for (const line of ld.recipeIngredient) {
      const s = String(line).trim()
      if (s) ingredients.push(ingredientNameFromLine(s))
    }
  }

  const steps = []
  const stepsBlock = html.match(
    /<div[^>]*class=["']steps["'][^>]*>([\s\S]*?)<\/ol>/i,
  )?.[1]
  if (stepsBlock) {
    let i = 0
    for (const li of stepsBlock.matchAll(
      /<li[^>]*class=["'][^"']*container[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
    )) {
      i += 1
      const text = stripTags(
        li[1].match(/class=["']text["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '',
      )
      const img = biggerImage(
        li[1].match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '',
      )
      const parts = [`${i}. ${text || '（无文字）'}`]
      if (img) parts.push(`\n![](${img})`)
      steps.push(parts.join(''))
    }
  }
  if (!steps.length && ld?.recipeInstructions) {
    steps.push(...stepsFromInstructionText(ld.recipeInstructions))
  }

  const tags = []
  if (typeof ld?.recipeCategory === 'string' && ld.recipeCategory.trim()) {
    tags.push(ld.recipeCategory.trim())
  }
  if (Array.isArray(ld?.keywords)) {
    for (const k of ld.keywords) {
      const t = String(k)
        .replace(/的做法$/, '')
        .replace(/的家常做法$/, '')
        .replace(/的详细做法$/, '')
        .replace(/怎么做$/, '')
        .replace(/的最正宗做法$/, '')
        .trim()
      if (t && t !== name && !tags.includes(t)) tags.push(t)
    }
  }
  const cats = html.match(
    /<div[^>]*class=["']recipe-cats["'][^>]*>([\s\S]*?)<\/div>/i,
  )?.[1]
  if (cats) {
    for (const a of cats.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = stripTags(a[1])
        .replace(/的做法$/, '')
        .trim()
      if (t && t !== name && !tags.includes(t)) tags.push(t)
    }
  }

  const descParts = []
  if (steps.length) descParts.push(steps.join('\n\n'))
  descParts.push(`> 来源：[下厨房](${resolved})`)

  return {
    name,
    ingredients,
    tags: tags.slice(0, 8),
    description: descParts.join('\n\n'),
    coverUrl,
    sourceUrl: resolved,
  }
}

async function fetchHtml(recipeId) {
  const candidates = [
    {
      url: `https://m.xiachufang.com/recipe/${recipeId}/`,
      ua: UA_MOBILE,
    },
    {
      url: `https://www.xiachufang.com/recipe/${recipeId}/`,
      ua: UA_DESKTOP,
    },
  ]
  let lastError = null
  for (const { url, ua } of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      })
      if (!res.ok) {
        lastError = new Error(`拉取失败 HTTP ${res.status}`)
        continue
      }
      const html = await res.text()
      const captchaOnly =
        html.includes('请滑动完成验证') && !parseLdRecipe(html)
      if (captchaOnly) {
        lastError = new Error('下厨房要求人机验证')
        continue
      }
      if (
        html.length < 800 ||
        (!html.includes('recipeIngredient') &&
          !html.includes('class="ings"') &&
          !html.includes('ing-name') &&
          !html.includes('og:title'))
      ) {
        lastError = new Error('返回内容不是菜谱页')
        continue
      }
      return { html, fetchedUrl: url }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('网络请求失败')
    }
  }
  throw lastError ?? new Error('无法获取菜谱页')
}

async function fetchImageBase64(url) {
  if (!url) return null
  const res = await fetch(url, { headers: { 'User-Agent': UA_DESKTOP } })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 900_000) {
    console.warn('  封面偏大，改存外链')
    return null
  }
  return buf.toString('base64')
}

async function loadAppData(octokit) {
  try {
    const res = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: APP_JSON_PATH,
      ref: BRANCH,
    })
    if (Array.isArray(res.data) || res.data.type !== 'file') {
      throw new Error('app.json 不是文件')
    }
    const content = Buffer.from(res.data.content, 'base64').toString('utf8')
    return { data: JSON.parse(content), sha: res.data.sha }
  } catch (err) {
    if (err.status === 404) {
      return {
        data: {
          recipes: [],
          orders: [],
          availableIngredients: [],
          collabRoomId: 'wte-home',
        },
        sha: null,
      }
    }
    throw err
  }
}

async function putFile(octokit, path, contentBase64, message, sha) {
  return octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: contentBase64,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  })
}

async function uploadThumb(octokit, recipeId, base64) {
  const path = `${THUMBNAIL_DIR}/${recipeId}.jpg`
  let sha
  try {
    const existing = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path,
      ref: BRANCH,
    })
    if (!Array.isArray(existing.data) && existing.data.type === 'file') {
      sha = existing.data.sha
    }
  } catch {
    // new
  }
  await putFile(
    octokit,
    path,
    base64,
    `chore(wte): thumbnail ${recipeId}`,
    sha,
  )
  return path
}

async function main() {
  const { dryRun, files, inputs } = parseArgs(process.argv.slice(2))
  const recipeIds = collectRecipeIds(inputs, files)
  if (!recipeIds.length) usage(1)

  const token = (process.env.GITHUB_TOKEN || '').trim()
  if (!dryRun && !token) {
    console.error('请设置环境变量 GITHUB_TOKEN')
    usage(1)
  }

  const octokit = token ? new Octokit({ auth: token }) : null
  let app = dryRun
    ? { data: { recipes: [], orders: [], availableIngredients: [] }, sha: null }
    : await loadAppData(octokit)

  const now = new Date().toISOString()
  const imported = []

  console.log(`待导入 ${recipeIds.length} 道`)
  for (const xcfId of recipeIds) {
    const url = canonicalRecipeUrl(xcfId)
    console.log(`→ ${url}`)
    const { html, fetchedUrl } = await fetchHtml(xcfId)
    console.log(`  抓取自 ${fetchedUrl}`)
    const parsed = parseRecipe(html, url)
    console.log(`  ${parsed.name} · 食材 ${parsed.ingredients.length} · 标签 ${parsed.tags.length}`)

    const recipeId = randomUUID()
    let thumbnail = parsed.coverUrl || ''
    if (!dryRun && parsed.coverUrl) {
      const b64 = await fetchImageBase64(parsed.coverUrl)
      if (b64) {
        thumbnail = await uploadThumb(octokit, recipeId, b64)
        console.log(`  封面 → ${thumbnail}`)
      } else {
        console.log(`  封面外链 ${thumbnail.slice(0, 60)}…`)
      }
    }

    const recipe = {
      id: recipeId,
      name: parsed.name,
      ingredients: parsed.ingredients,
      thumbnail,
      tags: parsed.tags,
      description: parsed.description,
      createdAt: now,
      updatedAt: now,
    }
    imported.push(recipe)
    app.data.recipes = [...(app.data.recipes || []), recipe]

    const ingSet = new Set(app.data.availableIngredients || [])
    for (const ing of parsed.ingredients) ingSet.add(ing)
    app.data.availableIngredients = [...ingSet].sort((a, b) =>
      a.localeCompare(b, 'zh'),
    )
  }

  if (!imported.length) {
    console.error('没有成功导入任何菜谱')
    process.exit(1)
  }

  if (dryRun) {
    console.log('\n--dry-run 预览：')
    console.log(JSON.stringify(imported, null, 2))
    return
  }

  const body = Buffer.from(
    JSON.stringify(app.data, null, 2),
    'utf8',
  ).toString('base64')
  await putFile(
    octokit,
    APP_JSON_PATH,
    body,
    `chore(wte): import ${imported.length} recipe(s) from xiachufang`,
    app.sha,
  )
  console.log(
    `\n已写入 ${OWNER}/${REPO}@${BRANCH} ${APP_JSON_PATH}（${imported.length} 道）`,
  )
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
