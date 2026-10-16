import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

type OlDialogProps = {
  titleId: string
  title: string
  children: ReactNode
  actions: ReactNode
  onClose: () => void
  className?: string
}

/** 挂到 body，避免页面滚动/overflow 导致 fixed 弹层偏离视口中心 */
export function OlDialog({
  titleId,
  title,
  children,
  actions,
  onClose,
  className = '',
}: OlDialogProps) {
  return createPortal(
    <div
      className={`ol-dialog ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="ol-dialog-mask"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="ol-dialog-panel">
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="ol-dialog-actions">{actions}</div>
      </div>
    </div>,
    document.body,
  )
}
