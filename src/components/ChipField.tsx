import { useEffect, useMemo, useRef, useState } from 'react'

export function ChipField({
  values,
  onChange,
  addLabel,
  options = [],
  floatTitle,
  className = '',
}: {
  values: string[]
  onChange: (next: string[]) => void
  addLabel: string
  /** 可选历史项，打开添加时展示浮层供点选 */
  options?: string[]
  floatTitle?: string
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const close = () => {
    setDraft('')
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (ev: MouseEvent) => {
      const target = ev.target as Node
      // 仅输入框与浮层算内部；同排空白/已有标签处点击视为外部并关闭
      if (
        inputRef.current?.contains(target) ||
        floatRef.current?.contains(target)
      ) {
        return
      }
      close()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const commitDraft = () => {
    const v = draft.trim()
    if (!v) {
      close()
      return
    }
    if (!values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  const remove = (item: string) => {
    onChange(values.filter((v) => v !== item))
  }

  const toggleOption = (item: string) => {
    onChange(
      values.includes(item)
        ? values.filter((v) => v !== item)
        : [...values, item],
    )
  }

  const filteredOptions = useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return options
    return options.filter((item) => item.toLowerCase().includes(q))
  }, [draft, options])

  const canCreate =
    Boolean(draft.trim()) &&
    !values.includes(draft.trim()) &&
    !options.includes(draft.trim())

  const title = floatTitle ?? addLabel

  return (
    <div className={`form-chip-field ${className}`.trim()}>
      <div className="chips form-chips">
        {values.map((item) => (
          <span key={item} className="chip active chip-editable">
            {item}
            <button
              type="button"
              className="chip-remove"
              aria-label={`删除 ${item}`}
              onClick={() => remove(item)}
            >
              ×
            </button>
          </span>
        ))}
        {open ? (
          <input
            ref={inputRef}
            className="chip-add-input"
            autoFocus
            placeholder={addLabel}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitDraft()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                close()
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="chip chip-dashed"
            onClick={() => {
              setDraft('')
              setOpen(true)
            }}
          >
            + {addLabel}
          </button>
        )}
      </div>

      {open && (
        <div
          ref={floatRef}
          className="form-chip-float"
          role="dialog"
          aria-label={title}
        >
          <div className="form-chip-float-head">
            <h2>{title}</h2>
            <button
              type="button"
              className="form-chip-float-close"
              onClick={close}
            >
              完成
            </button>
          </div>
          {filteredOptions.length === 0 && !canCreate ? (
            <p className="muted form-chip-float-empty">
              {draft.trim()
                ? '没有匹配项，按回车添加'
                : '暂无历史项，直接输入添加'}
            </p>
          ) : (
            <div className="chips form-chip-float-chips">
              {filteredOptions.map((item) => {
                const on = values.includes(item)
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
      )}
    </div>
  )
}
