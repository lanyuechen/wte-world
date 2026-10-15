import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Recipe } from '../types'

export function RecipeSheet({
  recipe,
  thumbUrl,
  selected,
  onClose,
  onAdd,
  onRemove,
}: {
  recipe: Recipe
  thumbUrl: string
  selected: boolean
  onClose: () => void
  onAdd: () => void
  onRemove?: () => void
}) {
  const tags = recipe.tags.map((t) => t.trim()).filter(Boolean)

  return (
    <div className="recipe-sheet" role="dialog" aria-modal="true" aria-label={recipe.name}>
      <button type="button" className="recipe-sheet-mask" aria-label="关闭" onClick={onClose} />
      <div className="recipe-sheet-panel">
        {thumbUrl ? (
          <div
            className="recipe-sheet-bg"
            style={{ backgroundImage: `url(${thumbUrl})` }}
            aria-hidden
          />
        ) : null}

        <div className="recipe-sheet-handle" aria-hidden />
        <div className="recipe-sheet-scroll">
          <div className="recipe-sheet-body">
            <div className="recipe-sheet-head">
              <div className="recipe-sheet-title">
                <h2>{recipe.name}</h2>
                {tags.length > 0 && (
                  <div className="chips recipe-sheet-chips">
                    {tags.map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <Link
                className="btn text"
                to={`/recipes/${recipe.id}/edit`}
                onClick={onClose}
              >
                编辑
              </Link>
            </div>

            <section className="recipe-sheet-section">
              <h3>食材</h3>
              <div className="chips recipe-sheet-chips">
                {recipe.ingredients.length ? (
                  recipe.ingredients.map((ing) => (
                    <span key={ing} className="chip">
                      {ing}
                    </span>
                  ))
                ) : (
                  <span className="muted">未填写</span>
                )}
              </div>
            </section>

            <section className="recipe-sheet-section">
              <h3>步骤</h3>
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {recipe.description || '_暂无描述_'}
                </ReactMarkdown>
              </div>
            </section>
          </div>
        </div>

        <div className="recipe-sheet-footer">
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
          {selected ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                onRemove?.()
                onClose()
              }}
            >
              移出订单
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                onAdd()
                onClose()
              }}
            >
              加入订单
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
