import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OlDialog } from '../components/OlDialog'
import { useApp } from '../context/AppContext'
import { useCollab } from '../context/CollabContext'
import { formatDateTime } from '../lib/datetime'
import type { Order, Recipe } from '../types'

function needCountOf(order: Order) {
  return Object.values(order.ingredientStatus).filter((s) => s === 'need')
    .length
}

function orderStatus(order: Order) {
  const need = needCountOf(order)
  if (need > 0) return { key: 'need' as const, label: '待采购' }
  return { key: 'ready' as const, label: '食材已齐' }
}

export function OrdersPage() {
  const navigate = useNavigate()
  const { data, removeOrder, thumbUrl } = useApp()
  const { patchSession } = useCollab()
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null)
  const [leavingId, setLeavingId] = useState<string | null>(null)

  const sorted = useMemo(
    () =>
      [...data.orders].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [data.orders],
  )

  const reorder = (order: Order) => {
    const ids = order.recipeIds.filter((id) =>
      data.recipes.some((r) => r.id === id),
    )
    if (!ids.length) {
      alert('原菜品已不存在，无法再来一单')
      return
    }
    patchSession({ selectedRecipeIds: ids })
    navigate('/')
  }

  const confirmRemove = () => {
    if (!pendingDelete || leavingId) return
    const id = pendingDelete.id
    setPendingDelete(null)
    setLeavingId(id)
    window.setTimeout(() => {
      void removeOrder(id)
      setLeavingId(null)
    }, 200)
  }

  return (
    <section className="orders-meituan">
      <header className="ol-head">
        <h1>订单</h1>
      </header>

      {!sorted.length ? (
        <div className="ol-empty">
          <strong>还没有订单</strong>
          <p>去点单页勾选几道菜，生成第一单吧</p>
          <Link className="ol-btn primary" to="/">
            去点单
          </Link>
        </div>
      ) : (
        <div className="ol-list">
          {sorted.map((order, index) => {
            const recipes = order.recipeIds
              .map((rid) => data.recipes.find((r) => r.id === rid))
              .filter((r): r is Recipe => Boolean(r))
            const status = orderStatus(order)
            const need = needCountOf(order)
            const names = recipes.map((r) => r.name)
            const preview = names.slice(0, 2).join('、')
            const more =
              names.length > 2 ? ` 等${names.length}道` : names.length === 1 ? '' : ''

            return (
              <article
                key={order.id}
                className={`ol-card rise-item ${
                  leavingId === order.id ? 'is-leaving' : ''
                }`}
                style={
                  leavingId === order.id
                    ? undefined
                    : { animationDelay: `${Math.min(index, 8) * 40}ms` }
                }
              >
                <Link to={`/orders/${order.id}`} className="ol-card-link">
                  <div className="ol-card-top">
                    <h2 className="ol-shop">{order.title}</h2>
                    <span className={`ol-status is-${status.key}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="ol-card-body">
                    <div className="ol-thumbs">
                      {(recipes.length ? recipes : [null])
                        .slice(0, 3)
                        .map((recipe, i) => (
                          <div
                            key={recipe?.id ?? `ph-${i}`}
                            className="ol-thumb"
                          >
                            {recipe?.thumbnail ? (
                              <img
                                src={thumbUrl(recipe.thumbnail)}
                                alt=""
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span>
                                {(recipe?.name ?? order.title).slice(0, 1)}
                              </span>
                            )}
                          </div>
                        ))}
                      {recipes.length > 3 && (
                        <div className="ol-thumb more">
                          +{recipes.length - 3}
                        </div>
                      )}
                    </div>
                    <div className="ol-summary">
                      <p className="ol-dishes">
                        {preview || '菜品已删除'}
                        {more}
                      </p>
                      <p className="ol-meta">
                        {formatDateTime(order.createdAt)}
                        {need > 0 ? ` · ${need} 项待购` : ''}
                      </p>
                      <p className="ol-count">共 {order.recipeIds.length} 道菜</p>
                    </div>
                  </div>
                </Link>

                <div className="ol-actions">
                  <button
                    type="button"
                    className="ol-btn ghost"
                    onClick={() => setPendingDelete(order)}
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    className="ol-btn outline"
                    onClick={() => reorder(order)}
                  >
                    再来一单
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {pendingDelete && (
        <OlDialog
          titleId="ol-dialog-title"
          title="删除订单"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <button
                type="button"
                className="ol-btn ghost"
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="ol-btn danger"
                onClick={confirmRemove}
              >
                确认删除
              </button>
            </>
          }
        >
          <p>确认删除「{pendingDelete.title}」？删除后不可恢复。</p>
        </OlDialog>
      )}
    </section>
  )
}
