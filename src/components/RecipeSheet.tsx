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
  return (
    <div className="recipe-sheet" role="dialog" aria-modal="true" aria-label={recipe.name}>
      <button type="button" className="recipe-sheet-mask" aria-label="关闭" onClick={onClose} />
      <div className="recipe-sheet-panel">
        <div className="recipe-sheet-handle" aria-hidden />
        <div className="recipe-sheet-scroll">
          <div className="recipe-sheet-hero">
            {thumbUrl ? (
              <img src={thumbUrl} alt={recipe.name} />
            ) : (
              <div className="thumb-placeholder large">
                <span>{recipe.name.slice(0, 1)}</span>
              </div>
            )}
          </div>
          <div className="recipe-sheet-body">
            <div className="recipe-sheet-head">
              <div>
                <h2>{recipe.name}</h2>
                {recipe.tags.length > 0 && (
                  <p className="recipe-sheet-meta">{recipe.tags.join(' · ')}</p>
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
              <ul className="ing-list">
                {recipe.ingredients.length ? (
                  recipe.ingredients.map((ing) => <li key={ing}>{ing}</li>)
                ) : (
                  <li className="muted">未填写</li>
                )}
              </ul>
            </section>

            <section className="recipe-sheet-section">
              <h3>做法</h3>
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
