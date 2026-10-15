import { useApp } from '../context/AppContext'

/** 顶部浮动：GitHub 失败提示，不挤占内容布局。 */
export function SyncBanner() {
  const { status, retryPersist, dismissPersistError, syncFromRemote } = useApp()
  if (!status.error) return null

  const onRetry = () => {
    if (status.retry === 'sync') void syncFromRemote()
    else retryPersist()
  }

  return (
    <div className="sync-banner" role="alert">
      <p className="sync-banner-text">{status.error}</p>
      <div className="sync-banner-actions">
        {status.retry && (
          <button
            type="button"
            className="sync-banner-retry"
            disabled={status.syncing}
            onClick={onRetry}
          >
            {status.syncing ? '重试中…' : '重试'}
          </button>
        )}
        <button
          type="button"
          className="sync-banner-dismiss"
          aria-label="关闭"
          onClick={() => dismissPersistError()}
        >
          ×
        </button>
      </div>
    </div>
  )
}
