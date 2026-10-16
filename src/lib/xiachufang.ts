import { XCF_PROXY_URL } from '../config'

export type XiachufangImport = {
  name: string
  ingredients: string[]
  /** 用料明细（名称+用量），写入步骤前文 */
  ingredientLines: string[]
  tags: string[]
  description: string
  coverUrl: string
  sourceUrl: string
}

const RECIPE_ID_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?xiachufang\.com\/recipe\/(\d+)\/?/i

export function parseXiachufangUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const matched = raw.match(RECIPE_ID_RE)
  if (!matched?.[1]) return null
  return `https://www.xiachufang.com/recipe/${matched[1]}/`
}

function textContent(el: Element | null | undefined) {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function absolutizeImageUrl(src: string) {
  if (!src) return ''
  try {
    const href = new URL(src, 'https://www.xiachufang.com/').href
    return href.replace(/\/w\/\d+/i, '/w/800')
  } catch {
    return src
  }
}

function parseFromDom(doc: Document, sourceUrl: string): XiachufangImport | null {
  const name =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    textContent(doc.querySelector('h1.page-title, .recipe-show h1, h1'))
  if (!name) return null

  const coverRaw =
    doc.querySelector('.cover.image img')?.getAttribute('src') ||
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
    ''
  const coverUrl = absolutizeImageUrl(coverRaw)

  const ingredientLines: string[] = []
  const ingredients: string[] = []
  doc.querySelectorAll('.ings tr').forEach((tr) => {
    const n = textContent(tr.querySelector('.name'))
    const unit = textContent(tr.querySelector('.unit'))
    if (!n) return
    ingredients.push(n)
    ingredientLines.push(unit ? `${n} ${unit}` : n)
  })

  const steps: string[] = []
  doc.querySelectorAll('.steps li.container, .steps ol > li').forEach((li, i) => {
    const text = (li.querySelector('.text')?.innerHTML ?? li.textContent ?? '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    const img = li.querySelector('img')?.getAttribute('src') || ''
    const parts = [`${i + 1}. ${text || '（无文字）'}`]
    if (img) parts.push(`\n![](${absolutizeImageUrl(img)})`)
    steps.push(parts.join(''))
  })

  const tags: string[] = []
  doc.querySelectorAll('.recipe-cats a').forEach((a) => {
    const t = textContent(a)
      .replace(/的做法$/, '')
      .trim()
    if (!t || t === name || tags.includes(t)) return
    tags.push(t)
  })

  if (!ingredients.length && !steps.length) {
    return parseFromLdJson(doc, sourceUrl)
  }

  const descParts: string[] = []
  if (ingredientLines.length) {
    descParts.push('## 用料\n\n' + ingredientLines.map((l) => `- ${l}`).join('\n'))
  }
  if (steps.length) {
    descParts.push('## 步骤\n\n' + steps.join('\n\n'))
  }
  descParts.push(`> 来源：[下厨房](${sourceUrl})`)

  return {
    name,
    ingredients,
    ingredientLines,
    tags: tags.slice(0, 8),
    description: descParts.join('\n\n'),
    coverUrl,
    sourceUrl,
  }
}

function parseFromLdJson(doc: Document, sourceUrl: string): XiachufangImport | null {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')]
  for (const script of scripts) {
    let data: unknown
    try {
      data = JSON.parse(script.textContent || '')
    } catch {
      continue
    }
    if (!data || typeof data !== 'object') continue
    const obj = data as Record<string, unknown>
    if (obj['@type'] !== 'Recipe') continue

    const name = String(obj.name ?? '').trim()
    if (!name) continue

    const rawIngs = Array.isArray(obj.recipeIngredient)
      ? obj.recipeIngredient.map((x) => String(x).trim()).filter(Boolean)
      : []
    // 「一只猪前蹄」这类：尽量拆出食材名（去掉前缀用量）
    const ingredients = rawIngs.map((line) => {
      const m = line.match(
        /^(?:适量|少许|一点点|若干)?(?:\d+(?:\.\d+)?(?:g|kg|ml|mL|斤|两|克|毫升|大勺|小勺|勺|个|只|块|片|根|颗|粒|碗|杯)?)?(.*)$/u,
      )
      const rest = (m?.[1] ?? line).trim()
      return rest || line
    })

    const instructions = String(obj.recipeInstructions ?? '')
      .replace(/\s*(\d+)\./g, '\n$1.')
      .trim()

    const image = Array.isArray(obj.image)
      ? String(obj.image[0] ?? '')
      : String(obj.image ?? '')

    const tags: string[] = []
    if (typeof obj.recipeCategory === 'string' && obj.recipeCategory.trim()) {
      tags.push(obj.recipeCategory.trim())
    }
    if (Array.isArray(obj.keywords)) {
      for (const k of obj.keywords) {
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

    const descParts = [
      rawIngs.length
        ? '## 用料\n\n' + rawIngs.map((l) => `- ${l}`).join('\n')
        : '',
      instructions ? `## 步骤\n\n${instructions}` : '',
      `> 来源：[下厨房](${sourceUrl})`,
    ].filter(Boolean)

    return {
      name,
      ingredients: ingredients.length ? ingredients : rawIngs,
      ingredientLines: rawIngs,
      tags: tags.slice(0, 8),
      description: descParts.join('\n\n'),
      coverUrl: absolutizeImageUrl(image),
      sourceUrl,
    }
  }
  return null
}

export function parseXiachufangHtml(html: string, sourceUrl: string): XiachufangImport {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (doc.body?.innerText?.includes('请滑动完成验证')) {
    throw new Error('下厨房要求人机验证，请稍后再试或改用粘贴网页源码')
  }
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || ''
  const resolvedSource =
    parseXiachufangUrl(canonical) ||
    parseXiachufangUrl(sourceUrl) ||
    sourceUrl
  const parsed =
    parseFromDom(doc, resolvedSource) ?? parseFromLdJson(doc, resolvedSource)
  if (!parsed?.name) {
    throw new Error('未能解析菜谱，请确认链接有效或粘贴完整网页源码')
  }
  return parsed
}

async function fetchHtml(url: string): Promise<string> {
  const path = new URL(url).pathname
  const candidates: string[] = []

  // 本地 Vite 代理（dev / preview）
  candidates.push(`/xcf-proxy${path}`)

  const proxy = XCF_PROXY_URL.trim()
  if (proxy) {
    const sep = proxy.includes('?') ? '&' : '?'
    candidates.push(`${proxy}${sep}u=${encodeURIComponent(url)}`)
  }

  // 尽力而为的公共代理（可能不稳定）
  candidates.push(
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  )

  let lastError: Error | null = null
  for (const endpoint of candidates) {
    try {
      const res = await fetch(endpoint, {
        headers: { Accept: 'text/html,application/xhtml+xml' },
      })
      if (!res.ok) {
        lastError = new Error(`获取失败（${res.status}）`)
        continue
      }
      const html = await res.text()
      if (
        html.length < 500 ||
        (!html.includes('xiachufang') &&
          !html.includes('recipeIngredient') &&
          !html.includes('class="ings"'))
      ) {
        lastError = new Error('返回内容不是菜谱页')
        continue
      }
      return html
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('网络请求失败')
    }
  }
  throw lastError ?? new Error('无法获取菜谱页（跨域限制）')
}

/** 从下厨房链接拉取并解析；失败时抛出可读错误。 */
export async function importFromXiachufangUrl(
  input: string,
): Promise<XiachufangImport> {
  const sourceUrl = parseXiachufangUrl(input)
  if (!sourceUrl) {
    throw new Error('请粘贴有效的下厨房菜谱链接')
  }
  const html = await fetchHtml(sourceUrl)
  return parseXiachufangHtml(html, sourceUrl)
}
