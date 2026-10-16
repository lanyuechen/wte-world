import { useEffect, useRef } from 'react'
import { ChipField } from './ChipField'
import type { FilterMode } from '../types'

export function OrderFilterPanel({
  filterMode,
  availableIngredients,
  recipeIngredients,
  onFilterMode,
  onAvailableChange,
  onClose,
}: {
  filterMode: FilterMode
  availableIngredients: string[]
  recipeIngredients: string[]
  onFilterMode: (mode: FilterMode) => void
  onAvailableChange: (ingredients: string[]) => void
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      // 筛选按钮自身由页面 toggle，勿抢关闭
      if (target.closest('.filter-icon-btn')) return
      if (!panelRef.current?.contains(target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="filter-float"
      role="dialog"
      aria-label="已有食材"
    >
      <div className="filter-float-head">
        <h2>已有食材</h2>
        <button type="button" className="filter-float-close" onClick={onClose}>
          完成
        </button>
      </div>

      <div className="filter-mode-list" role="group">
        <button
          type="button"
          className={`filter-mode-card ${filterMode === 'all' ? 'active' : ''}`}
          onClick={() => onFilterMode('all')}
        >
          <strong>完全匹配</strong>
          <span>无需采购，利用家里的食材即可</span>
        </button>
        <button
          type="button"
          className={`filter-mode-card ${filterMode === 'any' ? 'active' : ''}`}
          onClick={() => onFilterMode('any')}
        >
          <strong>部分匹配</strong>
          <span>利用家里剩余食材，再补充采购一些即可</span>
        </button>
      </div>

      <ChipField
        values={availableIngredients}
        onChange={onAvailableChange}
        addLabel="添加食材"
        floatTitle="食材"
        options={recipeIngredients}
      />
    </div>
  )
}
