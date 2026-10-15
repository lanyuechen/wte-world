import { Link, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { formatDateTime } from '../lib/datetime'
import type { IngredientStatus, Order } from '../types'

export function OrderDetailPage() {
  const { id } = useParams()
  const { data, thumbUrl, saveOrder } = useApp()
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
    .filter(Boolean)

  const entries = Object.entries(order.ingredientStatus)
  const needCount = entries.filter(([, s]) => s === 'need').length
  const haveCount = entries.filter(([, s]) => s === 'have').length

  const toggleStatus = (name: string, status: IngredientStatus) => {
    const nextStatus: IngredientStatus = status === 'have' ? 'need' : 'have'
    const next: Order = {
      ...order,
      ingredientStatus: { ...order.ingredientStatus, [name]: nextStatus },
      updatedAt: new Date().toISOString(),
    }
    saveOrder(next)
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
          <span>{recipes.length} 份</span>
        </div>
        <ul className="od-dish-list">
          {recipes.map((recipe) =>
            recipe ? (
              <li key={recipe.id}>
                <div className="od-dish">
                  <div className="od-dish-thumb">
                    {recipe.thumbnail ? (
                      <img
                        src={thumbUrl(recipe.thumbnail)}
                        alt={recipe.name}
                      />
                    ) : (
                      <span>{recipe.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="od-dish-body">
                    <h3>{recipe.name}</h3>
                    <p>
                      {recipe.ingredients.slice(0, 4).join('、') || '暂无食材'}
                      {recipe.ingredients.length > 4 ? '…' : ''}
                    </p>
                  </div>
                  <span className="od-dish-qty">x1</span>
                </div>
              </li>
            ) : null,
          )}
        </ul>
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
    </section>
  )
}
