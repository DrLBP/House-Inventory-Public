// Small reusable pieces shared by several screens.
import { useEffect, useState } from 'react'
import { subscribeToQueue, processQueue } from './lib/queue'
import { House, Search, LayoutGrid, FileText, Settings } from './icons'

// Top bar with an optional Back button, a title, and a Settings link.
export function Header({ title, backTo, showSettings = true }) {
  return (
    <>
    <header className="topbar">
      {backTo ? (
        <a className="back" href={`#${backTo}`} aria-label="Back">‹ Back</a>
      ) : (
        <span />
      )}
      <h2>{title}</h2>
      {showSettings ? (
        <a className="settings" href="#/settings" aria-label="Settings" title="Settings">
          <Settings size={22} strokeWidth={1.75} />
        </a>
      ) : <span />}
    </header>
    <UploadStatus />
    </>
  )
}

// Shows photos waiting to upload, e.g. "Uploading… 3 photos left".
// Hidden when nothing is waiting.
export function UploadStatus({ compact = false }) {
  const [status, setStatus] = useState({ waiting: 0 })
  useEffect(() => subscribeToQueue(setStatus), [])
  if (!status.waiting) return null

  const photos = `${status.waiting} photo${status.waiting === 1 ? '' : 's'}`
  let text
  if (status.uploading) text = `⬆ Uploading… ${photos} left`
  else if (status.error) text = `⏳ ${photos} saved on this phone, waiting to upload. ${status.error}.`
  else text = `⏳ ${photos} waiting to upload`

  // Being offline is normal (photos just wait), so only real problems show in red.
  const problem = status.error && status.error !== 'No internet connection'
  return (
    <div className={`upload-status ${compact ? 'compact' : ''} ${problem ? 'problem' : ''}`}>
      <span>{text}</span>
      {status.error && !status.uploading && (
        <button className="link" onClick={processQueue}>Retry now</button>
      )}
    </div>
  )
}

// Up / down arrows for reordering a list.
export function MoveButtons({ index, count, onMove }) {
  return (
    <span className="move">
      <button className="icon" disabled={index === 0} onClick={() => onMove(index, -1)}
        aria-label="Move up">▲</button>
      <button className="icon" disabled={index === count - 1} onClick={() => onMove(index, 1)}
        aria-label="Move down">▼</button>
    </span>
  )
}

// Returns a copy of the list with item `index` moved one place up (-1) or down (+1).
export function moved(list, index, direction) {
  const copy = [...list]
  const target = index + direction
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

// Friendly text for an error from the database or network.
export function errorText(err) {
  return `Something went wrong: ${err?.message || err}`
}

// Menu along the bottom of the main screens: simple line icons, no words
// (each still has a name for screen readers and a tooltip).
export function BottomNav({ current }) {
  const tabs = [
    { path: '/', label: 'Homes', Icon: House },
    { path: '/search', label: 'Search', Icon: Search },
    { path: '/dashboard', label: 'Dashboard', Icon: LayoutGrid },
    { path: '/reports', label: 'Reports', Icon: FileText },
  ]
  return (
    <nav className="bottom-nav" aria-label="Main menu">
      {tabs.map(({ path, label, Icon }) => (
        <a key={path} href={`#${path}`} className={current === path ? 'on' : ''}
          aria-label={label} title={label} aria-current={current === path ? 'page' : undefined}>
          <span className="nav-icon"><Icon size={24} strokeWidth={1.75} /></span>
        </a>
      ))}
    </nav>
  )
}
