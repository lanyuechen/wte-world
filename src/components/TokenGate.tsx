import { useState, type ReactNode } from 'react'
import { useApp } from '../context/AppContext'

/** 本机无 Token 时先收集 Token，写入 localStorage 后再进入应用。 */
export function TokenGate({ children }: { children: ReactNode }) {
  const { settings, applyGithubToken, status } = useApp()
  const hasToken = Boolean(settings.github.token.trim())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (hasToken) return children

  const submit = async () => {
    const token = input.trim()
    if (!token) {
      setError('请输入 GitHub Token')
      return
    }
    setBusy(true)
    setError('')
    try {
      await applyGithubToken(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token 保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="token-gate">
      <div className="token-gate-card">
        <p className="token-gate-kicker">家庭共享点餐</p>
        <h1>吃什么</h1>
        <p className="token-gate-lead">
          请输入 GitHub Token 后继续。也可扫描带 Token 的二维码自动写入。
        </p>
        <label className="token-gate-label">
          <span>GitHub Token</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="github_pat_…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </label>
        {(error || status.error) && (
          <p className="token-gate-error">{error || status.error}</p>
        )}
        <button
          type="button"
          className="btn primary btn-block"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? '验证中…' : '进入'}
        </button>
      </div>
    </section>
  )
}
