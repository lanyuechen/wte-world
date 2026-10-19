import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { MenuCardShell } from '../components/MenuCardShell'
import { OrderFilterPanel } from '../components/OrderFilterPanel'
import { RecipeCard } from '../components/RecipeCard'
import { RecipeSheet } from '../components/RecipeSheet'
import { useMenuCategoryNav } from '../hooks/useMenuCategoryNav'
import { flyToCart } from '../lib/flyToCart'
import {
  ALL_CATEGORY,
  buildMenuCategories,
  buildMenuSections,
  buildOrderTitle,
  navCategoriesFromSections,
} from '../lib/menu'
import {
  buildIngredientStatus,
  collectRecipeIngredients,
  countRecipeOrders,
} from '../lib/recipes'
import type { CollabSession, FilterMode, Order, Recipe } from '../types'

function FilterIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5z" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h7.8a1.5 1.5 0 0 0 1.5-1.2L20 8H7" />
    </svg>
  )
}

const SUBMIT_DELAY_MS = 220

export function OrderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    data,
    thumbUrl,
    saveOrder,
    removeRecipe: deleteLibraryRecipe,
  } = useApp()
  const {
    session,
    error,
    patchSession,
    publishOrderCreated,
    publishOrderUpdated,
    clearError,
    roomId,
  } = useCollab()

  const addToOrderId = searchParams.get('addTo')?.trim() ?? ''
  const targetOrder = useMemo(
    () => data.orders.find((o) => o.id === addToOrderId) ?? null,
    [data.orders, addToOrderId],
  )
  const isAddMode = Boolean(targetOrder)

  const [query, setQuery] = useState('')
  const [localError, setLocalError] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** 飞入中：按钮可先亮勾，数字等落地后再加 */
  const [pendingAdds, setPendingAdds] = useState(() => new Set<string>())
  const cartIconRef = useRef<HTMLSpanElement>(null)
  const selectedIdsRef = useRef(session.selectedRecipeIds)
  selectedIdsRef.current = session.selectedRecipeIds

  const allCategories = useMemo(
    () => buildMenuCategories(data.recipes),
    [data.recipes],
  )

  const recipeIngredients = useMemo(
    () => collectRecipeIngredients(data.recipes),
    [data.recipes],
  )

  const recipeOrderCounts = useMemo(
    () => countRecipeOrders(data.orders),
    [data.orders],
  )

  const selectedIdSet = useMemo(
    () => new Set(session.selectedRecipeIds),
    [session.selectedRecipeIds],
  )

  const sections = useMemo(
    () =>
      buildMenuSections(
        data.recipes,
        allCategories,
        session.availableIngredients,
        session.filterMode,
        query,
      ),
    [
      data.recipes,
      allCategories,
      session.availableIngredients,
      session.filterMode,
      query,
    ],
  )

  const categories = useMemo(
    () => navCategoriesFromSections(sections),
    [sections],
  )

  const {
    activeCategory,
    catBar,
    menuListRef,
    menuCatsRef,
    scrollDirRef,
    bindCatBtn,
    selectCategory,
    onMenuListScroll,
    enableCategorySpyFromUser,
  } = useMenuCategoryNav(sections, categories)

  const filterActive = session.availableIngredients.length > 0

  const patchWithStatus = (
    partial: Partial<CollabSession> & {
      selectedRecipeIds?: string[]
      availableIngredients?: string[]
    },
  ) => {
    const selectedRecipeIds =
      partial.selectedRecipeIds ?? session.selectedRecipeIds
    const availableIngredients =
      partial.availableIngredients ?? session.availableIngredients
    patchSession({
      ...partial,
      ingredientStatus: buildIngredientStatus(
        data.recipes,
        selectedRecipeIds,
        availableIngredients,
        session.ingredientStatus,
      ),
    })
  }

  const setAvailableIngredients = (availableIngredients: string[]) => {
    patchWithStatus({ availableIngredients })
  }

  const setSelectedIds = (selectedRecipeIds: string[]) => {
    patchWithStatus({ selectedRecipeIds })
  }

  const clearPendingAdd = (id: string) => {
    setPendingAdds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const commitAddRecipe = (id: string) => {
    clearPendingAdd(id)
    const prev = selectedIdsRef.current
    if (prev.includes(id)) return
    setSelectedIds([...prev, id])
    cartIconRef.current?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.18)' },
        { transform: 'scale(1)' },
      ],
      { duration: 320, easing: 'ease' },
    )
  }

  const playFlyToCart = (
    id: string,
    origin: HTMLElement | null | undefined,
    onDone: () => void,
  ) => {
    const cart = cartIconRef.current
    const recipe = data.recipes.find((r) => r.id === id)
    if (!origin || !cart || !recipe) {
      onDone()
      return
    }
    flyToCart({
      from: origin,
      to: cart,
      imageUrl: thumbUrl(recipe.thumbnail) || undefined,
      label: recipe.name,
      onDone,
    })
  }

  const addRecipe = (id: string, origin?: HTMLElement | null) => {
    if (selectedIdSet.has(id) || pendingAdds.has(id)) return
    setPendingAdds((prev) => new Set(prev).add(id))
    playFlyToCart(id, origin, () => commitAddRecipe(id))
  }

  const removeRecipe = (id: string) => {
    clearPendingAdd(id)
    const next = session.selectedRecipeIds.filter((x) => x !== id)
    setSelectedIds(next)
    if (!next.length) setCartOpen(false)
  }

  const selectedRecipes = useMemo(
    () =>
      session.selectedRecipeIds
        .map((id) => data.recipes.find((r) => r.id === id))
        .filter((r): r is Recipe => Boolean(r)),
    [session.selectedRecipeIds, data.recipes],
  )

  const selectedCount = session.selectedRecipeIds.length
  const showCartSheet = cartOpen && selectedCount > 0

  const toggleAddRecipe = (id: string, origin?: HTMLElement | null) => {
    if (pendingAdds.has(id)) return
    if (selectedIdSet.has(id)) removeRecipe(id)
    else addRecipe(id, origin)
  }

  const isRecipePicked = (id: string) =>
    selectedIdSet.has(id) || pendingAdds.has(id)

  const setFilterMode = (filterMode: FilterMode) =>
    patchSession({ filterMode })

  const finishSubmit = (
    order: Order,
    mode: 'create' | 'add',
  ) => {
    window.setTimeout(() => {
      void saveOrder(order, session.availableIngredients)
      if (mode === 'create') {
        publishOrderCreated(order, session.availableIngredients)
      } else {
        publishOrderUpdated(order, session.availableIngredients)
        patchSession({ selectedRecipeIds: [], ingredientStatus: {} })
      }
      navigate(`/orders/${order.id}`)
    }, SUBMIT_DELAY_MS)
  }

  const submitSelection = () => {
    if (submitting) return
    if (!selectedCount) {
      setLocalError(isAddMode ? '请至少选择一道要加的菜' : '请至少选择一道菜')
      return
    }
    setLocalError('')
    clearError()
    setSubmitting(true)
    setCartOpen(false)

    const now = new Date().toISOString()
    if (isAddMode && targetOrder) {
      const recipeIds = [
        ...new Set([...targetOrder.recipeIds, ...session.selectedRecipeIds]),
      ]
      finishSubmit(
        {
          ...targetOrder,
          recipeIds,
          ingredientStatus: buildIngredientStatus(
            data.recipes,
            recipeIds,
            session.availableIngredients,
            {
              ...targetOrder.ingredientStatus,
              ...session.ingredientStatus,
            },
          ),
          updatedAt: now,
        },
        'add',
      )
      return
    }

    finishSubmit(
      {
        id: crypto.randomUUID(),
        title: buildOrderTitle(roomId),
        recipeIds: session.selectedRecipeIds,
        ingredientStatus: buildIngredientStatus(
          data.recipes,
          session.selectedRecipeIds,
          session.availableIngredients,
          session.ingredientStatus,
        ),
        createdAt: now,
        updatedAt: now,
      },
      'create',
    )
  }

  return (
    <section className="order-page">
      {isAddMode && targetOrder && (
        <div className="order-add-banner">
          <span>
            为订单加菜：<strong>{targetOrder.title}</strong>
          </span>
          <Link className="order-add-cancel" to={`/orders/${targetOrder.id}`}>
            取消
          </Link>
        </div>
      )}

      <div className={`search-block ${filterOpen ? 'is-open' : ''}`}>
        <div className="search-row">
          <input
            className="input search-input"
            placeholder="搜索菜名"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="filter-anchor">
            <button
              type="button"
              className={`filter-icon-btn ${filterActive ? 'active' : ''}`}
              aria-expanded={filterOpen}
              aria-haspopup="dialog"
              aria-label="食材过滤"
              onClick={() => setFilterOpen((v) => !v)}
            >
              <FilterIcon />
              {filterActive && <span className="filter-dot" aria-hidden />}
            </button>
          </div>
        </div>

        {filterOpen && (
          <OrderFilterPanel
            filterMode={session.filterMode}
            availableIngredients={session.availableIngredients}
            recipeIngredients={recipeIngredients}
            onFilterMode={setFilterMode}
            onAvailableChange={setAvailableIngredients}
            onClose={() => setFilterOpen(false)}
          />
        )}
      </div>

      <div className="menu-layout">
        <aside ref={menuCatsRef} className="menu-cats" aria-label="菜谱分类">
          {catBar.ready && (
            <i
              className="menu-cat-indicator"
              aria-hidden
              style={{
                transform: `translateY(${catBar.top}px)`,
                height: catBar.height,
              }}
            />
          )}
          <button
            type="button"
            ref={bindCatBtn(ALL_CATEGORY)}
            className={`menu-cat ${activeCategory === ALL_CATEGORY ? 'active' : ''}`}
            onClick={() => selectCategory(ALL_CATEGORY)}
          >
            全部
          </button>
          {categories.map(({ tag }) => (
            <button
              key={tag}
              type="button"
              ref={bindCatBtn(tag)}
              className={`menu-cat ${activeCategory === tag ? 'active' : ''}`}
              onClick={() => selectCategory(tag)}
            >
              {tag}
            </button>
          ))}
        </aside>

        <div
          ref={menuListRef}
          className="menu-list"
          onScroll={onMenuListScroll}
          onWheel={enableCategorySpyFromUser}
          onTouchStart={enableCategorySpyFromUser}
          onPointerDown={enableCategorySpyFromUser}
        >
          {!sections.length ? (
            <div className="menu-empty">
              <strong>没有菜谱</strong>
              <p>先添加一道菜，或换个分类看看</p>
              <Link className="menu-empty-btn" to="/recipes/new">
                添加菜谱
              </Link>
            </div>
          ) : (
            sections.map(({ tag, recipes }) => (
              <section key={tag} className="menu-section">
                <div className="menu-list-head">
                  <h2>{tag}</h2>
                  <Link className="menu-list-add" to="/recipes/new">
                    + 菜谱
                  </Link>
                </div>
                <div className="menu-recipes">
                  {recipes.map((recipe) => (
                    <MenuCardShell
                      key={`${tag}-${recipe.id}`}
                      rootRef={menuListRef}
                      scrollDirRef={scrollDirRef}
                    >
                      <RecipeCard
                        recipe={recipe}
                        thumbUrl={thumbUrl(recipe.thumbnail)}
                        selected={isRecipePicked(recipe.id)}
                        orderCount={recipeOrderCounts.get(recipe.id) ?? 0}
                        onOpen={() => setDetailRecipe(recipe)}
                        onAdd={(origin) => toggleAddRecipe(recipe.id, origin)}
                      />
                    </MenuCardShell>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {(localError || error) && (
        <p className="error-text order-error">{localError || error}</p>
      )}

      {showCartSheet && (
        <>
          <button
            type="button"
            className="order-cart-mask"
            aria-label="关闭已选列表"
            onClick={() => setCartOpen(false)}
          />
          <div className="order-cart-sheet" role="dialog" aria-label="已选菜品">
            <div className="order-cart-sheet-head">
              <h3>已选菜品（{selectedCount}）</h3>
              <button
                type="button"
                className="order-cart-sheet-clear"
                onClick={() => {
                  setSelectedIds([])
                  setCartOpen(false)
                }}
              >
                清空
              </button>
            </div>
            <ul className="order-cart-sheet-list">
              {selectedRecipes.map((recipe) => (
                <li key={recipe.id}>
                  <div className="order-cart-sheet-item">
                    <div className="order-cart-sheet-thumb">
                      {recipe.thumbnail ? (
                        <img
                          src={thumbUrl(recipe.thumbnail)}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span>{recipe.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="order-cart-sheet-body">
                      <p>{recipe.name}</p>
                    </div>
                    <button
                      type="button"
                      className="order-cart-sheet-remove"
                      aria-label={`移除 ${recipe.name}`}
                      onClick={() => removeRecipe(recipe.id)}
                    >
                      移除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="order-cart-bar">
        <button
          type="button"
          className="order-cart-info"
          disabled={!selectedCount}
          aria-expanded={showCartSheet}
          onClick={() => {
            if (!selectedCount) return
            setCartOpen((v) => !v)
          }}
        >
          <span
            ref={cartIconRef}
            className={`order-cart-icon ${selectedCount ? 'has' : ''}`}
          >
            <CartIcon />
            {selectedCount > 0 && <i key={selectedCount}>{selectedCount}</i>}
          </span>
          <span className="order-cart-text">
            {selectedCount ? `已选 ${selectedCount} 道` : '未选菜品'}
          </span>
        </button>
        <button
          className={`order-cart-btn ${submitting ? 'is-loading' : ''}`}
          type="button"
          disabled={!selectedCount || submitting}
          onClick={submitSelection}
        >
          {submitting ? '处理中…' : isAddMode ? '加菜' : '下单'}
        </button>
      </div>

      {detailRecipe && (
        <RecipeSheet
          recipe={detailRecipe}
          thumbUrl={thumbUrl(detailRecipe.thumbnail)}
          selected={isRecipePicked(detailRecipe.id)}
          onClose={() => setDetailRecipe(null)}
          onAdd={(origin) => addRecipe(detailRecipe.id, origin)}
          onRemove={() => removeRecipe(detailRecipe.id)}
          onDelete={() => {
            const id = detailRecipe.id
            if (isRecipePicked(id)) removeRecipe(id)
            deleteLibraryRecipe(id)
          }}
        />
      )}
    </section>
  )
}
