import { useEffect, useRef, useState } from 'react'
import type { Recipe } from '../types'

function AddMark({ selected }: { selected?: boolean }) {
  const mounted = useRef(false)
  const [popKey, setPopKey] = useState(0)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    setPopKey((k) => k + 1)
  }, [selected])

  return (
    <span
      key={popKey}
      className={`menu-add ${selected ? 'on' : ''} ${popKey ? 'is-pop' : ''}`}
      aria-hidden
    >
      {selected ? (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.2 6.6 11.2 12.5 4.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 3.2v9.6M3.2 8h9.6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  )
}

export function RecipeCard({
  recipe,
  thumbUrl,
  selected,
  orderCount = 0,
  onOpen,
  onAdd,
}: {
  recipe: Recipe
  thumbUrl: string
  selected?: boolean
  /** 历史订单中出现的次数 */
  orderCount?: number
  onOpen?: () => void
  onAdd?: () => void
}) {
  const meta = recipe.tags.slice(0, 2).join(' · ')

  return (
    <div className={`recipe-card menu-item ${selected ? 'selected' : ''}`}>
      <button type="button" className="menu-item-main" onClick={onOpen}>
        <div className="card-thumb">
          {thumbUrl ? (
            <img src={thumbUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="thumb-placeholder">
              <span>{recipe.name.slice(0, 1)}</span>
            </div>
          )}
          {orderCount > 0 && (
            <span className="card-order-count" aria-label={`已点 ${orderCount} 次`}>
              {orderCount}次
            </span>
          )}
        </div>
        <div className="card-body">
          <h3>{recipe.name}</h3>
          {meta && <p className="card-meta">{meta}</p>}
          <p className="muted card-ings">
            {recipe.ingredients.slice(0, 4).join(' · ') || '未填食材'}
            {recipe.ingredients.length > 4 ? ' …' : ''}
          </p>
        </div>
      </button>
      <button
        type="button"
        className="menu-add-btn"
        aria-label={selected ? `取消选择${recipe.name}` : `添加${recipe.name}`}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation()
          onAdd?.()
        }}
      >
        <AddMark selected={selected} />
      </button>
    </div>
  )
}
