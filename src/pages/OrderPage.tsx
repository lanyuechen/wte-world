import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { RecipeCard } from '../components/RecipeCard'
import { RecipeSheet } from '../components/RecipeSheet'
import { buildIngredientStatus, filterRecipes } from '../lib/collab'
import type { CollabSession, FilterMode, Order, Recipe } from '../types'

const ALL_CATEGORY = '全部'
const OTHER_CATEGORY = '其他'

function recipeTags(recipe: Recipe) {
  return recipe.tags.map((t) => t.trim()).filter(Boolean)
}

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
  const {
    data,
    thumbUrl,
    allIngredients,
    saveOrder,
    removeRecipe: deleteLibraryRecipe,
  } = useApp()
  const { session, error, patchSession, clearError, roomId } = useCollab()

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(ALL_CATEGORY)
  const [newIng, setNewIng] = useState('')
  const [addingIng, setAddingIng] = useState(false)
  const [localError, setLocalError] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null)

  const commitNewIngredient = () => {
    const v = newIng.trim()
    if (v && !session.availableIngredients.includes(v)) {
      patch({
        availableIngredients: [...session.availableIngredients, v],
      })
    }
    setNewIng('')
    setAddingIng(false)
  }

  const patch = (partial: Partial<CollabSession>) => {
    patchSession(partial)
  }

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    let otherCount = 0
    for (const recipe of data.recipes) {
      const tags = recipeTags(recipe)
      if (!tags.length) {
        otherCount += 1
        continue
      }
      for (const t of tags) {
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }
    const list = [...counts.keys()]
      .sort((a, b) => a.localeCompare(b, 'zh'))
      .map((tag) => ({ tag, count: counts.get(tag) ?? 0 }))
    if (otherCount > 0) {
      list.push({ tag: OTHER_CATEGORY, count: otherCount })
    }
    return list
  }, [data.recipes])

  useEffect(() => {
    if (
      category !== ALL_CATEGORY &&
      !categories.some((c) => c.tag === category)
    ) {
      setCategory(ALL_CATEGORY)
    }
  }, [category, categories])

  const filterActive = session.availableIngredients.length > 0

  const filtered = useMemo(() => {
    if (category === OTHER_CATEGORY) {
      const untagged = data.recipes.filter((r) => !recipeTags(r).length)
      return filterRecipes(
        untagged,
        session.availableIngredients,
        session.filterMode,
        query,
        [],
      )
    }
    const tags = category === ALL_CATEGORY ? [] : [category]
    return filterRecipes(
      data.recipes,
      session.availableIngredients,
      session.filterMode,
      query,
      tags,
    )
  }, [
    data.recipes,
    session.availableIngredients,
    session.filterMode,
    query,
    category,
  ])

  const toggleAvailable = (ing: string) => {
    const availableIngredients = session.availableIngredients.includes(ing)
      ? session.availableIngredients.filter((i) => i !== ing)
      : [...session.availableIngredients, ing]
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

  useEffect(() => {
    if (!session.selectedRecipeIds.length) setCartOpen(false)
  }, [session.selectedRecipeIds.length])

  const toggleAddRecipe = (id: string) => {
    if (session.selectedRecipeIds.includes(id)) removeRecipe(id)
    else addRecipe(id)
  }

  const setFilterMode = (filterMode: FilterMode) => patch({ filterMode })

  const buildOrderTitle = () => {
    const now = new Date()
    const pad = (n: number, len = 2) => String(n).padStart(len, '0')
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const rand =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 4)
        : Math.random().toString(36).slice(2, 6)
    const room = (roomId || 'wte').toUpperCase()
    return `${room}-${stamp}-${rand.toUpperCase()}`
  }

  const createOrder = () => {
    if (!session.selectedRecipeIds.length) {
      setLocalError('请至少选择一道菜')
      return
    }
    setLocalError('')
    clearError()
    const order: Order = {
      id: crypto.randomUUID(),
      title: buildOrderTitle(),
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
    // 本地先写入并立刻跳转，GitHub 在后台串行保存
    void saveOrder(order, session.availableIngredients)
    navigate(`/orders/${order.id}`)
  }

  return (
    <section className="order-page">
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

        {filterOpen && (
          <>
            <button
              type="button"
              className="filter-float-mask"
              aria-label="关闭过滤"
              onClick={() => setFilterOpen(false)}
            />
            <div className="filter-float" role="dialog" aria-label="已有食材">
              <div className="filter-float-head">
                <h2>已有食材</h2>
                <button
                  type="button"
                  className="filter-float-close"
                  onClick={() => {
                    setAddingIng(false)
                    setNewIng('')
                    setFilterOpen(false)
                  }}
                >
                  完成
                </button>
              </div>

              <div className="filter-mode-list" role="group">
                <button
                  type="button"
                  className={`filter-mode-card ${session.filterMode === 'all' ? 'active' : ''}`}
                  onClick={() => setFilterMode('all')}
                >
                  <strong>完全匹配</strong>
                  <span>无需采购，利用家里的食材即可</span>
                </button>
                <button
                  type="button"
                  className={`filter-mode-card ${session.filterMode === 'any' ? 'active' : ''}`}
                  onClick={() => setFilterMode('any')}
                >
                  <strong>部分匹配</strong>
                  <span>利用家里剩余食材，再补充采购一些即可</span>
                </button>
              </div>

              <div className="chips filter-float-chips">
                {allIngredients.map((ing) => (
                  <button
                    key={ing}
                    type="button"
                    className={`chip ${
                      session.availableIngredients.includes(ing) ? 'active' : ''
                    }`}
                    onClick={() => toggleAvailable(ing)}
                  >
                    {ing}
                  </button>
                ))}
                {addingIng ? (
                  <input
                    className="chip-add-input"
                    autoFocus
                    placeholder="食材名"
                    value={newIng}
                    onChange={(e) => setNewIng(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitNewIngredient()
                      }
                      if (e.key === 'Escape') {
                        setNewIng('')
                        setAddingIng(false)
                      }
                    }}
                    onBlur={() => commitNewIngredient()}
                  />
                ) : (
                  <button
                    type="button"
                    className="chip chip-dashed"
                    onClick={() => setAddingIng(true)}
                  >
                    + 添加食材
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="menu-layout">
        <aside className="menu-cats" aria-label="菜谱分类">
          <button
            type="button"
            className={`menu-cat ${category === ALL_CATEGORY ? 'active' : ''}`}
            onClick={() => setCategory(ALL_CATEGORY)}
          >
            全部
          </button>
          {categories.map(({ tag }) => (
            <button
              key={tag}
              type="button"
              className={`menu-cat ${category === tag ? 'active' : ''}`}
              onClick={() => setCategory(tag)}
            >
              {tag}
            </button>
          ))}
        </aside>

        <div className="menu-list">
          <div className="menu-list-head">
            <h2>{category}</h2>
            <Link className="menu-list-add" to="/recipes/new">
              + 菜谱
            </Link>
          </div>
          {!filtered.length ? (
            <div className="menu-empty">
              <strong>没有菜谱</strong>
              <p>先添加一道菜，或换个分类看看</p>
              <Link className="menu-empty-btn" to="/recipes/new">
                添加菜谱
              </Link>
            </div>
          ) : (
            <div className="recipe-list menu-recipes">
              {filtered.map((recipe, index) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  thumbUrl={thumbUrl(recipe.thumbnail)}
                  selected={session.selectedRecipeIds.includes(recipe.id)}
                  onOpen={() => setDetailRecipe(recipe)}
                  onAdd={() => toggleAddRecipe(recipe.id)}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {(localError || error) && (
        <p className="error-text order-error">{localError || error}</p>
      )}

      {cartOpen && selectedRecipes.length > 0 && (
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
          className={`order-cart-info ${cartOpen ? 'is-open' : ''}`}
          disabled={!session.selectedRecipeIds.length}
          aria-expanded={cartOpen}
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
              <i>{session.selectedRecipeIds.length}</i>
            )}
          </span>
          <span className="order-cart-text">
            {session.selectedRecipeIds.length
              ? `已选 ${session.selectedRecipeIds.length} 道`
              : '未选菜品'}
          </span>
        </button>
        <button
          className="order-cart-btn"
          type="button"
          disabled={!session.selectedRecipeIds.length}
          onClick={() => {
            setCartOpen(false)
            createOrder()
          }}
        >
          生成订单
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
