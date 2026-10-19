import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { OlDialog } from '../components/OlDialog'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { formatDateTime } from '../lib/datetime'
import { buildIngredientStatus } from '../lib/recipes'
import type { IngredientStatus, Order, Recipe } from '../types'

export function OrderDetailPage() {
  const { id } = useParams()
  const { data, thumbUrl, saveOrder } = useApp()
  const { publishOrderUpdated } = useCollab()
  const [pendingRemove, setPendingRemove] = useState<Recipe | null>(null)
  const order = data.orders.find((o) => o.id === id)

  if (!order) {
    return (
      <section className="order-detail">
        <div className="od-empty">
          <p>订单不存在</p>
          <Link className="od-back" to="/orders">
            返回订单
          </Link>
        </div>
      </section>
    )
  }

  const recipes = order.recipeIds
    .map((rid) => data.recipes.find((r) => r.id === rid))
    .filter((r): r is Recipe => Boolean(r))

  const entries = Object.entries(order.ingredientStatus)
  const needCount = entries.filter(([, s]) => s === 'need').length
  const haveCount = entries.filter(([, s]) => s === 'have').length

  const persistOrder = (next: Order) => {
    void saveOrder(next)
    publishOrderUpdated(next)
  }

  const toggleStatus = (name: string, status: IngredientStatus) => {
    const nextStatus: IngredientStatus = status === 'have' ? 'need' : 'have'
    persistOrder({
      ...order,
      ingredientStatus: { ...order.ingredientStatus, [name]: nextStatus },
      updatedAt: new Date().toISOString(),
    })
  }

  const confirmRemoveDish = () => {
    if (!pendingRemove) return
    const recipeId = pendingRemove.id
    setPendingRemove(null)
    const recipeIds = order.recipeIds.filter((rid) => rid !== recipeId)
    if (!recipeIds.length) {
      persistOrder({
        ...order,
        recipeIds: [],
        ingredientStatus: {},
        updatedAt: new Date().toISOString(),
      })
      return
    }
    persistOrder({
      ...order,
      recipeIds,
      ingredientStatus: buildIngredientStatus(
        data.recipes,
        recipeIds,
        data.availableIngredients,
        order.ingredientStatus,
      ),
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <section className="order-detail">
      <div className="od-status-card">
        <Link className="od-back" to="/orders">
          ← 订单
        </Link>
        <p className="od-status">已生成</p>
        <h1 className="od-title">{order.title}</h1>
        <p className="od-time">{formatDateTime(order.createdAt)}</p>
        <div className="od-stats">
          <span>{recipes.length} 道菜</span>
          <span>{needCount} 项需购</span>
          <span>{haveCount} 项已有</span>
        </div>
      </div>

      <section className="od-card">
        <div className="od-card-head">
          <h2>已点菜品</h2>
          <div className="od-card-head-actions">
            <span>{recipes.length} 份</span>
            <Link className="od-add-btn" to={`/?addTo=${order.id}`}>
              加菜
            </Link>
          </div>
        </div>
        {!recipes.length ? (
          <p className="od-card-empty">暂无菜品，可点击加菜</p>
        ) : (
          <ul className="od-dish-list">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <div className="od-dish">
                  <div className="od-dish-thumb">
                    {recipe.thumbnail ? (
                      <img
                        src={thumbUrl(recipe.thumbnail)}
                        alt={recipe.name}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>{recipe.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="od-dish-body">
                    <h3>{recipe.name}</h3>
                    <p>{recipe.ingredients.join('、') || '暂无食材'}</p>
                  </div>
                  <button
                    type="button"
                    className="od-dish-remove"
                    aria-label={`移除 ${recipe.name}`}
                    onClick={() => setPendingRemove(recipe)}
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="od-card">
        <div className="od-card-head">
          <h2>采购清单</h2>
          <span>
            {needCount > 0 ? `${needCount} 项待购` : '食材已齐'}
          </span>
        </div>
        {!entries.length ? (
          <p className="od-card-empty">暂无食材</p>
        ) : (
          <ul className="od-ing-list">
            {entries.map(([name, status]) => {
              const have = status === 'have'
              return (
                <li key={name} className={have ? 'is-have' : 'is-need'}>
                  <label className="od-ing-row">
                    <input
                      type="checkbox"
                      className="od-ing-check"
                      checked={have}
                      onChange={() => toggleStatus(name, status)}
                    />
                    <span className="od-ing-name">{name}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {pendingRemove && (
        <OlDialog
          titleId="od-remove-dish-title"
          title="移除菜品"
          onClose={() => setPendingRemove(null)}
          actions={
            <>
              <button
                type="button"
                className="ol-btn ghost"
                onClick={() => setPendingRemove(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="ol-btn danger"
                onClick={confirmRemoveDish}
              >
                确认移除
              </button>
            </>
          }
        >
          <p>确认从本单移除「{pendingRemove.name}」？</p>
        </OlDialog>
      )}
    </section>
  )
}
