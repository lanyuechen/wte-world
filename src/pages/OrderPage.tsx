import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { MenuCardShell } from '../components/MenuCardShell'
import { OrderFilterPanel } from '../components/OrderFilterPanel'
import { RecipeCard } from '../components/RecipeCard'
import { RecipeSheet } from '../components/RecipeSheet'
import { useMenuCategoryNav } from '../hooks/useMenuCategoryNav'
import {
  ALL_CATEGORY,
  buildMenuCategories,
  buildMenuSections,
  buildOrderTitle,
} from '../lib/menu'
import { buildIngredientStatus, countRecipeOrders } from '../lib/recipes'
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

  const categories = useMemo(
    () => buildMenuCategories(data.recipes),
    [data.recipes],
  )

  const recipeIngredients = useMemo(() => {
    const set = new Set<string>()
    data.recipes.forEach((r) =>
      r.ingredients.forEach((i) => {
        const v = i.trim()
        if (v) set.add(v)
      }),
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }, [data.recipes])

  const recipeOrderCounts = useMemo(
    () => countRecipeOrders(data.orders),
    [data.orders],
  )

  const sections = useMemo(
    () =>
      buildMenuSections(
        data.recipes,
        categories,
        session.availableIngredients,
        session.filterMode,
        query,
      ),
    [
      data.recipes,
      categories,
      session.availableIngredients,
      session.filterMode,
      query,
    ],
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

  const patch = (partial: Partial<CollabSession>) => {
    patchSession(partial)
  }

  const setAvailableIngredients = (availableIngredients: string[]) => {
    patch({
      availableIngredients,
      ingredientStatus: buildIngredientStatus(
        data.recipes,
        session.selectedRecipeIds,
        availableIngredients,
        session.ingredientStatus,
      ),
    })
  }

  const setSelectedIds = (selectedRecipeIds: string[]) => {
    patch({
      selectedRecipeIds,
      ingredientStatus: buildIngredientStatus(
        data.recipes,
        selectedRecipeIds,
        session.availableIngredients,
        session.ingredientStatus,
      ),
    })
  }

  const addRecipe = (id: string) => {
    if (session.selectedRecipeIds.includes(id)) return
    setSelectedIds([...session.selectedRecipeIds, id])
  }

  const removeRecipe = (id: string) => {
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

  const showCartSheet = cartOpen && selectedRecipes.length > 0

  const toggleAddRecipe = (id: string) => {
    if (session.selectedRecipeIds.includes(id)) removeRecipe(id)
    else addRecipe(id)
  }

  const setFilterMode = (filterMode: FilterMode) => patch({ filterMode })

  const createOrder = () => {
    if (submitting) return
    if (!session.selectedRecipeIds.length) {
      setLocalError('请至少选择一道菜')
      return
    }
    setLocalError('')
    clearError()
    setSubmitting(true)
    const order: Order = {
      id: crypto.randomUUID(),
      title: buildOrderTitle(roomId),
      recipeIds: session.selectedRecipeIds,
      ingredientStatus: buildIngredientStatus(
        data.recipes,
        session.selectedRecipeIds,
        session.availableIngredients,
        session.ingredientStatus,
      ),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    window.setTimeout(() => {
      void saveOrder(order, session.availableIngredients)
      publishOrderCreated(order, session.availableIngredients)
      navigate(`/orders/${order.id}`)
    }, 220)
  }

  const addDishesToOrder = () => {
    if (submitting) return
    if (!targetOrder) {
      createOrder()
      return
    }
    if (!session.selectedRecipeIds.length) {
      setLocalError('请至少选择一道要加的菜')
      return
    }
    setLocalError('')
    clearError()
    setSubmitting(true)
    const recipeIds = [
      ...new Set([...targetOrder.recipeIds, ...session.selectedRecipeIds]),
    ]
    const order: Order = {
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
      updatedAt: new Date().toISOString(),
    }
    window.setTimeout(() => {
      void saveOrder(order, session.availableIngredients)
      publishOrderUpdated(order, session.availableIngredients)
      patchSession({ selectedRecipeIds: [], ingredientStatus: {} })
      navigate(`/orders/${order.id}`)
    }, 220)
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
                        selected={session.selectedRecipeIds.includes(recipe.id)}
                        orderCount={recipeOrderCounts.get(recipe.id) ?? 0}
                        onOpen={() => setDetailRecipe(recipe)}
                        onAdd={() => toggleAddRecipe(recipe.id)}
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
              <h3>已选菜品（{selectedRecipes.length}）</h3>
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
          disabled={!session.selectedRecipeIds.length}
          aria-expanded={showCartSheet}
          onClick={() => {
            if (!session.selectedRecipeIds.length) return
            setCartOpen((v) => !v)
          }}
        >
          <span
            className={`order-cart-icon ${session.selectedRecipeIds.length ? 'has' : ''}`}
          >
            <CartIcon />
            {session.selectedRecipeIds.length > 0 && (
              <i key={session.selectedRecipeIds.length}>
                {session.selectedRecipeIds.length}
              </i>
            )}
          </span>
          <span className="order-cart-text">
            {session.selectedRecipeIds.length
              ? `已选 ${session.selectedRecipeIds.length} 道`
              : '未选菜品'}
          </span>
        </button>
        <button
          className={`order-cart-btn ${submitting ? 'is-loading' : ''}`}
          type="button"
          disabled={!session.selectedRecipeIds.length || submitting}
          onClick={() => {
            setCartOpen(false)
            if (isAddMode) addDishesToOrder()
            else createOrder()
          }}
        >
          {submitting ? '处理中…' : isAddMode ? '加菜' : '下单'}
        </button>
      </div>

      {detailRecipe && (
        <RecipeSheet
          recipe={detailRecipe}
          thumbUrl={thumbUrl(detailRecipe.thumbnail)}
          selected={session.selectedRecipeIds.includes(detailRecipe.id)}
          onClose={() => setDetailRecipe(null)}
          onAdd={() => addRecipe(detailRecipe.id)}
          onRemove={() => removeRecipe(detailRecipe.id)}
          onDelete={() => {
            const id = detailRecipe.id
            if (session.selectedRecipeIds.includes(id)) removeRecipe(id)
            deleteLibraryRecipe(id)
          }}
        />
      )}
    </section>
  )
}
