/**
 * Cloudflare Worker：为下厨房菜谱页提供 CORS 代理。
 * 部署后把地址填到 src/config.ts 的 XCF_PROXY_URL。
 *
 * 请求：GET /?u=https://www.xiachufang.com/recipe/123/
 */

const ALLOW =
  /^https:\/\/(www\.|m\.)?xiachufang\.com\/recipe\/\d+\/?(?:\?.*)?$/i

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
  }
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }
    if (request.method !== 'GET') {
      return new Response('method not allowed', {
        status: 405,
        headers: corsHeaders(),
      })
    }

    const u = new URL(request.url).searchParams.get('u')?.trim() || ''
    if (!ALLOW.test(u)) {
      return new Response('invalid url', { status: 400, headers: corsHeaders() })
    }

    const upstream = await fetch(u, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    })
  },
}
