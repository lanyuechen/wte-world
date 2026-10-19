export type FlyToCartOptions = {
  from: HTMLElement | DOMRect
  to: HTMLElement
  imageUrl?: string
  label?: string
  onDone?: () => void
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** 从起点缩略图缩小飞入购物车 */
export function flyToCart({
  from,
  to,
  imageUrl,
  label = '',
  onDone,
}: FlyToCartOptions) {
  if (prefersReducedMotion()) {
    onDone?.()
    return
  }

  const fromRect =
    from instanceof HTMLElement ? from.getBoundingClientRect() : from
  const toRect = to.getBoundingClientRect()
  if (fromRect.width < 2 || toRect.width < 2) {
    onDone?.()
    return
  }

  const size = Math.max(
    36,
    Math.min(fromRect.width, fromRect.height, 72),
  )
  const startX = fromRect.left + fromRect.width / 2 - size / 2
  const startY = fromRect.top + fromRect.height / 2 - size / 2
  const endX = toRect.left + toRect.width / 2 - size / 2
  const endY = toRect.top + toRect.height / 2 - size / 2
  const midX = (startX + endX) / 2
  const midY = Math.min(startY, endY) - Math.min(56, Math.abs(startY - endY) * 0.25)

  const el = document.createElement('div')
  el.className = 'fly-to-cart'
  el.setAttribute('aria-hidden', 'true')
  el.style.width = `${size}px`
  el.style.height = `${size}px`

  if (imageUrl) {
    const img = document.createElement('img')
    img.src = imageUrl
    img.alt = ''
    img.referrerPolicy = 'no-referrer'
    el.appendChild(img)
  } else {
    const span = document.createElement('span')
    span.textContent = label.slice(0, 1) || '+'
    el.appendChild(span)
  }

  document.body.appendChild(el)

  const finish = () => {
    el.remove()
    onDone?.()
  }

  const anim = el.animate(
    [
      {
        transform: `translate(${startX}px, ${startY}px) scale(1)`,
        opacity: 1,
      },
      {
        transform: `translate(${midX}px, ${midY}px) scale(0.55)`,
        opacity: 1,
        offset: 0.55,
      },
      {
        transform: `translate(${endX}px, ${endY}px) scale(0.18)`,
        opacity: 0.25,
      },
    ],
    {
      duration: 480,
      easing: 'cubic-bezier(0.4, 0.05, 0.45, 0.95)',
      fill: 'forwards',
    },
  )

  anim.addEventListener('finish', finish)
  anim.addEventListener('cancel', finish)
}
