import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useApp } from '../context/AppContext'
import { compressImageFromUrl, compressImageToJpeg } from '../lib/image'
import {
  importFromXiachufangUrl,
  parseXiachufangHtml,
  parseXiachufangUrl,
} from '../lib/xiachufang'
import type { Recipe } from '../types'

function nowIso() {
  return new Date().toISOString()
}

type PickerKind = 'ingredients' | 'tags' | null

export function RecipeFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, saveRecipe, thumbUrl, allIngredients } = useApp()
  const editing = data.recipes.find((r) => r.id === id)
  const isNew = !id || id === 'new'
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(editing?.name ?? '')
  const [ingredients, setIngredients] = useState<string[]>(
    editing?.ingredients ?? [],
  )
  const [tags, setTags] = useState<string[]>(editing?.tags ?? [])
  const [picker, setPicker] = useState<PickerKind>(null)
  const [draft, setDraft] = useState('')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [descTab, setDescTab] = useState<'edit' | 'preview'>('edit')
  const [thumbnailPreview, setThumbnailPreview] = useState(
    editing?.thumbnail ? thumbUrl(editing.thumbnail) : '',
  )
  const [thumbnailDataUrl, setThumbnailDataUrl] = useState<string | null>(null)
  const [thumbnailRemote, setThumbnailRemote] = useState(
    editing?.thumbnail?.startsWith('http') ? editing.thumbnail : '',
  )
  const [error, setError] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [showHtmlPaste, setShowHtmlPaste] = useState(false)
  const [htmlPaste, setHtmlPaste] = useState('')

  const cancelTo = '/'

  const applyImport = async (data: {
    name: string
    ingredients: string[]
    tags: string[]
    description: string
    coverUrl: string
  }) => {
    setName(data.name)
    setIngredients(data.ingredients)
    setTags(data.tags)
    setDescription(data.description)
    setDescTab('edit')
    setError('')

    if (!data.coverUrl) return
    setThumbnailRemote(data.coverUrl)
    setThumbnailPreview(data.coverUrl)
    try {
      const dataUrl = await compressImageFromUrl(data.coverUrl)
      setThumbnailDataUrl(dataUrl)
      setThumbnailPreview(dataUrl)
      setThumbnailRemote('')
    } catch {
      // 封面外链可直接展示；保存时写入 https 地址
      setThumbnailDataUrl(null)
    }
  }

  const allTags = useMemo(() => {
    const set = new Set<string>()
    data.recipes.forEach((r) =>
      r.tags.forEach((t) => {
        const v = t.trim()
        if (v) set.add(v)
      }),
    )
    return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }, [data.recipes])

  const openPicker = (kind: PickerKind) => {
    setDraft('')
    setPicker(kind)
  }

  const closePicker = () => {
    setDraft('')
    setPicker(null)
  }

  const commitDraft = () => {
    const v = draft.trim()
    if (!v || !picker) {
      closePicker()
      return
    }
    if (picker === 'ingredients') {
      setIngredients((prev) => (prev.includes(v) ? prev : [...prev, v]))
    } else {
      setTags((prev) => (prev.includes(v) ? prev : [...prev, v]))
    }
    setDraft('')
  }

  const toggleOption = (item: string) => {
    if (picker === 'ingredients') {
      setIngredients((prev) =>
        prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item],
      )
    } else if (picker === 'tags') {
      setTags((prev) =>
        prev.includes(item) ? prev.filter((t) => t !== item) : [...prev, item],
      )
    }
  }

  const filteredOptions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    const source = picker === 'ingredients' ? allIngredients : allTags
    if (!q) return source
    return source.filter((item) => item.toLowerCase().includes(q))
  }, [picker, draft, allIngredients, allTags])

  const onPickImage = async (file: File | null) => {
    if (!file) return
    try {
      const dataUrl = await compressImageToJpeg(file)
      setThumbnailDataUrl(dataUrl)
      setThumbnailPreview(dataUrl)
      setThumbnailRemote('')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片处理失败')
    }
  }

  const onImportLink = async () => {
    if (importing) return
    setImporting(true)
    setError('')
    try {
      const data = await importFromXiachufangUrl(importUrl)
      await applyImport(data)
      setShowHtmlPaste(false)
    } catch (err) {
      setShowHtmlPaste(true)
      setError(
        err instanceof Error
          ? `${err.message}。可改为粘贴网页源码导入`
          : '导入失败，可粘贴网页源码',
      )
    } finally {
      setImporting(false)
    }
  }

  const onImportHtml = async () => {
    if (importing) return
    setImporting(true)
    setError('')
    try {
      const data = parseXiachufangHtml(
        htmlPaste,
        parseXiachufangUrl(importUrl) || '',
      )
      await applyImport(data)
      setShowHtmlPaste(false)
      setHtmlPaste('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '源码解析失败')
    } finally {
      setImporting(false)
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
      thumbnail: thumbnailRemote || editing?.thumbnail || '',
      tags,
      description,
      createdAt: editing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    }
    saveRecipe(base, thumbnailDataUrl)
    navigate('/')
  }

  const renderAddControl = (
    kind: 'ingredients' | 'tags',
    label: string,
  ) => {
    if (picker === kind) {
      return (
        <input
          className="chip-add-input"
          autoFocus
          placeholder={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              closePicker()
            }
          }}
        />
      )
    }
    return (
      <button
        type="button"
        className="chip chip-dashed"
        onClick={() => openPicker(kind)}
      >
        + {label}
      </button>
    )
  }

  const renderFloat = (
    kind: 'ingredients' | 'tags',
    title: string,
    selected: string[],
  ) => {
    if (picker !== kind) return null
    const canCreate =
      draft.trim() &&
      !selected.includes(draft.trim()) &&
      !(kind === 'ingredients' ? allIngredients : allTags).includes(draft.trim())

    return (
      <div className="form-chip-float" role="dialog" aria-label={title}>
        <div className="form-chip-float-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="form-chip-float-close"
            onClick={closePicker}
          >
            完成
          </button>
        </div>
        {filteredOptions.length === 0 && !canCreate ? (
          <p className="muted form-chip-float-empty">
            {draft.trim() ? '没有匹配项，按回车添加' : '暂无历史项，直接输入添加'}
          </p>
        ) : (
          <div className="chips form-chip-float-chips">
            {filteredOptions.map((item) => {
              const on = selected.includes(item)
              return (
                <button
                  key={item}
                  type="button"
                  className={`chip ${on ? 'active' : ''}`}
                  aria-pressed={on}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleOption(item)}
                >
                  {item}
                </button>
              )
            })}
            {canCreate && (
              <button
                type="button"
                className="chip chip-dashed"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitDraft}
              >
                + 添加「{draft.trim()}」
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="recipe-form-page">
      <div className="recipe-form-scroll">
        <div className="form-hero">
          <h1>{isNew ? '新建菜谱' : '编辑菜谱'}</h1>
        </div>

        <form id="recipe-form" className="form-shell" onSubmit={onSubmit}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
        />

        <div className="form-import rise-item">
          <span className="form-label">从下厨房导入</span>
          <div className="form-import-row">
            <input
              className="input form-import-input"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="粘贴下厨房菜谱链接"
              inputMode="url"
              autoComplete="off"
            />
            <button
              type="button"
              className="form-import-btn"
              disabled={importing || !importUrl.trim()}
              onClick={() => void onImportLink()}
            >
              {importing ? '导入中…' : '导入'}
            </button>
          </div>
          {showHtmlPaste && (
            <div className="form-import-html">
              <p className="muted form-import-tip">
                链接拉取失败时：打开菜谱页 → 右键「显示网页源代码」→ 全选复制 →
                粘贴到下方
              </p>
              <textarea
                className="input textarea form-import-html-area"
                rows={4}
                value={htmlPaste}
                onChange={(e) => setHtmlPaste(e.target.value)}
                placeholder="粘贴网页 HTML 源码"
              />
              <button
                type="button"
                className="form-import-btn secondary"
                disabled={importing || !htmlPaste.trim()}
                onClick={() => void onImportHtml()}
              >
                从源码导入
              </button>
            </div>
          )}
        </div>

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
                setThumbnailRemote('')
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
          className="form-block form-chip-field rise-item"
          style={{ animationDelay: '80ms' }}
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
            {renderAddControl('tags', '添加标签')}
          </div>
          {renderFloat('tags', '已有标签', tags)}
        </div>

        <div
          className="form-block form-chip-field rise-item"
          style={{ animationDelay: '120ms' }}
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
            {renderAddControl('ingredients', '添加食材')}
          </div>
          {renderFloat('ingredients', '已有食材', ingredients)}
        </div>

        <div
          className="form-block rise-item"
          style={{ animationDelay: '160ms' }}
        >
          <div className="form-block-head">
            <span className="form-label">步骤</span>
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
        </form>
      </div>

      <div className="form-action-bar">
        <Link className="form-action-cancel" to={cancelTo}>
          取消
        </Link>
        <button
          className="form-action-submit"
          type="submit"
          form="recipe-form"
        >
          {isNew ? '创建菜谱' : '保存修改'}
        </button>
      </div>
    </section>
  )
}
