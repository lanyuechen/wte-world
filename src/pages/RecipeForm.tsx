import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useApp } from '../context/AppContext'
import { compressImageToJpeg } from '../lib/image'
import type { Recipe } from '../types'

function nowIso() {
  return new Date().toISOString()
}

export function RecipeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, saveRecipe, thumbUrl } = useApp()
  const editing = data.recipes.find((r) => r.id === id)
  const isNew = !id || id === 'new'
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(editing?.name ?? '')
  const [ingredients, setIngredients] = useState<string[]>(
    editing?.ingredients ?? [],
  )
  const [ingredientInput, setIngredientInput] = useState('')
  const [addingIng, setAddingIng] = useState(false)
  const [tags, setTags] = useState<string[]>(editing?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [description, setDescription] = useState(editing?.description ?? '')
  const [descTab, setDescTab] = useState<'edit' | 'preview'>('edit')
  const [thumbnailPreview, setThumbnailPreview] = useState(
    editing?.thumbnail ? thumbUrl(editing.thumbnail) : '',
  )
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  const cancelTo = '/'

  const commitIngredient = () => {
    const v = ingredientInput.trim()
    if (v && !ingredients.includes(v)) {
      setIngredients((prev) => [...prev, v])
    }
    setIngredientInput('')
    setAddingIng(false)
  }

  const commitTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) {
      setTags((prev) => [...prev, t])
    }
    setTagInput('')
    setAddingTag(false)
  }

  const onPickImage = async (file: File | null) => {
    if (!file) return
    try {
      const dataUrl = await compressImageToJpeg(file)
      setThumbnailDataUrl(dataUrl)
      setThumbnailPreview(dataUrl)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片处理失败')
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('请填写名称')
      return
    }
    if (!ingredients.length) {
      setError('请至少添加一种食材')
      return
    }
    setError('')
    const base: Recipe = {
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      ingredients,
      thumbnail: editing?.thumbnail ?? '',
      tags,
      description,
      createdAt: editing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    }
    // 乐观更新：本地先落盘并跳转，GitHub 后台保存
    saveRecipe(base, thumbnailDataUrl)
    navigate('/')
  }

  return (
    <section className="stack recipe-form-page">
      <div className="form-hero">
        <h1>{isNew ? '新建菜谱' : '编辑菜谱'}</h1>
        <Link className="btn text" to={cancelTo}>
          取消
        </Link>
      </div>

      <form className="form-shell" onSubmit={onSubmit}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
        />

        <div className="form-cover-block rise-item">
          <button
            type="button"
            className={`cover-upload ${thumbnailPreview ? 'has-image' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            {thumbnailPreview ? (
              <img src={thumbnailPreview} alt="封面预览" />
            ) : (
              <span className="cover-upload-empty">
                <span className="cover-plus">+</span>
                <span>添加封面</span>
              </span>
            )}
          </button>
          {thumbnailPreview && (
            <button
              type="button"
              className="btn text cover-remove"
              onClick={() => {
                setThumbnailPreview('')
                setThumbnailDataUrl(null)
                if (fileRef.current) fileRef.current.value = ''
              }}
            >
              移除封面
            </button>
          )}
        </div>

        <label className="form-block rise-item" style={{ animationDelay: '40ms' }}>
          <span className="form-label">名称</span>
          <input
            className="input form-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：番茄炒蛋"
            required
          />
        </label>

        <div
          className="form-block rise-item"
          style={{ animationDelay: '80ms' }}
        >
          <div className="form-block-head">
            <span className="form-label">食材</span>
            {ingredients.length > 0 && (
              <span className="muted form-count">{ingredients.length}</span>
            )}
          </div>
          <div className="chips form-chips">
            {ingredients.map((ing) => (
              <button
                key={ing}
                type="button"
                className="chip active"
                onClick={() =>
                  setIngredients((prev) => prev.filter((i) => i !== ing))
                }
              >
                {ing} ×
              </button>
            ))}
            {addingIng ? (
              <input
                className="chip-add-input"
                autoFocus
                placeholder="食材名"
                value={ingredientInput}
                onChange={(e) => setIngredientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitIngredient()
                  }
                  if (e.key === 'Escape') {
                    setIngredientInput('')
                    setAddingIng(false)
                  }
                }}
                onBlur={() => commitIngredient()}
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

        <div
          className="form-block rise-item"
          style={{ animationDelay: '120ms' }}
        >
          <div className="form-block-head">
            <span className="form-label">标签</span>
            {tags.length > 0 && (
              <span className="muted form-count">{tags.length}</span>
            )}
          </div>
          <div className="chips form-chips">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="chip active"
                onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
              >
                {tag} ×
              </button>
            ))}
            {addingTag ? (
              <input
                className="chip-add-input"
                autoFocus
                placeholder="标签名"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitTag()
                  }
                  if (e.key === 'Escape') {
                    setTagInput('')
                    setAddingTag(false)
                  }
                }}
                onBlur={() => commitTag()}
              />
            ) : (
              <button
                type="button"
                className="chip chip-dashed"
                onClick={() => setAddingTag(true)}
              >
                + 添加标签
              </button>
            )}
          </div>
        </div>

        <div
          className="form-block rise-item"
          style={{ animationDelay: '160ms' }}
        >
          <div className="form-block-head">
            <span className="form-label">做法</span>
            <div className="seg-tabs" role="tablist">
              <button
                type="button"
                className={`seg-tab ${descTab === 'edit' ? 'active' : ''}`}
                onClick={() => setDescTab('edit')}
              >
                编辑
              </button>
              <button
                type="button"
                className={`seg-tab ${descTab === 'preview' ? 'active' : ''}`}
                onClick={() => setDescTab('preview')}
              >
                预览
              </button>
            </div>
          </div>
          {descTab === 'edit' ? (
            <textarea
              className="input textarea form-textarea"
              rows={8}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'1. 准备食材\n2. 下锅炒制\n3. 调味出锅'}
            />
          ) : (
            <div className="markdown preview form-md-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {description || '_暂无内容_'}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn primary btn-block form-submit" type="submit">
          {isNew ? '创建菜谱' : '保存修改'}
        </button>
      </form>
    </section>
  )
}
