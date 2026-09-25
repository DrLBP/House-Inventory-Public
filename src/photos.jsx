// Pieces for showing photos: small previews (thumbnails) and the
// full-size photo viewer.
import { useEffect, useRef, useState } from 'react'
import { getThumbUrls } from './lib/thumbs'
import { downloadDriveFile } from './lib/google'
import { listHomeItems, movePhoto, createBlankItem } from './lib/data'
import { navigate } from './lib/router'
import { downloadBlob } from './lib/download'
import { ChevronLeft, ChevronRight } from './icons'
import { kindLabel } from './lib/photoNames'

// Loads signed links for a list of photos' thumbnails: { [thumb_path]: url }.
export function useThumbUrls(photos) {
  const [urls, setUrls] = useState({})
  const key = photos.map((p) => p.thumb_path).join('|')
  useEffect(() => {
    let alive = true
    getThumbUrls(photos.map((p) => p.thumb_path))
      .then((u) => alive && setUrls(u))
      .catch((e) => console.error('Thumbnails failed', e))
    return () => { alive = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}

// A square preview. Shows a grey placeholder while loading (or if no photo).
// `badge` (e.g. "PDF") is shown in the corner.
export function Thumb({ url, size = 64, onClick, label, badge }) {
  const style = { width: size, height: size }
  const inner = !url
    ? <div className="thumb placeholder" style={style} onClick={badge ? undefined : onClick}>{label}</div>
    : <img className="thumb" src={url} alt="" style={style} onClick={badge ? undefined : onClick} loading="lazy" />
  if (!badge) return inner
  return (
    <div className="thumb-wrap" style={style} onClick={onClick}>
      {inner}
      <span className="thumb-badge">{badge}</span>
    </div>
  )
}

export const isPdf = (photo) => photo?.mime_type === 'application/pdf'

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Full-screen viewer. The full-size photo is loaded from Google Drive only
// now, when it's actually opened (the preview shows meanwhile).
// homeId + onMoved turn on the "Move" button (change type, item or room).
// photos + onNavigate turn on the ‹ › arrows (and swiping) to go between
// several photos; onNavigate(photo) is called with the photo to show next.
// isMain (true/false; null = doesn't apply) + onMakeMain show "Use as main photo".
export function PhotoViewer({ photo, previewUrl, onClose, onDelete, homeId, onMoved, photos = [], onNavigate, isMain = null, onMakeMain }) {
  const [fullUrl, setFullUrl] = useState(null)
  const [moving, setMoving] = useState(false)
  const [message, setMessage] = useState('Loading full-size photo from Google Drive…')
  const touchStartX = useRef(null)

  const index = photos.findIndex((p) => p.id === photo.id)
  const canNavigate = onNavigate && photos.length > 1 && index >= 0
  const prev = canNavigate && index > 0 ? photos[index - 1] : null
  const next = canNavigate && index < photos.length - 1 ? photos[index + 1] : null

  // Computer keyboard: ← → go between photos; Escape closes the Move menu
  // if it's open, otherwise closes the photo.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (moving) setMoving(false)
        else onClose()
        return
      }
      if (moving || !canNavigate) return
      if (e.key === 'ArrowLeft' && prev) onNavigate(prev)
      if (e.key === 'ArrowRight' && next) onNavigate(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moving, canNavigate, prev, next, onNavigate, onClose])

  // Swiping left/right on the phone.
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchStartX.current == null || !canNavigate) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (dx > 50 && prev) onNavigate(prev)
    if (dx < -50 && next) onNavigate(next)
  }

  const [pdfPages, setPdfPages] = useState(null) // page pictures for a PDF receipt
  const [pdfBlob, setPdfBlob] = useState(null)

  useEffect(() => {
    let urls = []
    let current = true // false once we've moved on to another photo
    setFullUrl(null)
    setPdfPages(null)
    setPdfBlob(null)
    setMessage(isPdf(photo) ? 'Loading the PDF from Google Drive…' : 'Loading full-size photo from Google Drive…')
    downloadDriveFile(photo.drive_file_id)
      .then(async (blob) => {
        if (!current) return
        if (!blob) return setMessage('This file is no longer in Google Drive (it may be in Drive’s Trash).')
        if (isPdf(photo)) {
          // Show the PDF's pages as pictures (up to 10), plus a download button.
          const { renderPdfPages } = await import('./lib/pdfPages')
          const { pages, pageCount } = await renderPdfPages(blob, { maxPages: 10, maxSide: 1600 })
          if (!current) return
          urls = pages.map((p) => URL.createObjectURL(p.blob))
          setPdfPages(urls)
          setPdfBlob(blob)
          setMessage(pageCount > 10 ? `Showing the first 10 of ${pageCount} pages. Download to see all.` : '')
          return
        }
        urls = [URL.createObjectURL(blob)]
        setFullUrl(urls[0])
        setMessage('')
      })
      .catch((e) => current && setMessage(`Couldn't load the file: ${e.message}`))
    return () => {
      current = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [photo.drive_file_id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="viewer" role="dialog">
      <div className="viewer-top">
        <button className="link light" onClick={onClose}>✕ Close</button>
        <span>
          {canNavigate && <span className="viewer-count">{index + 1} / {photos.length} · </span>}
          {kindLabel(photo.kind)}{isPdf(photo) ? ' (PDF)' : ''} · {formatDateTime(photo.taken_at)}
        </span>
      </div>
      <div className={`viewer-image ${pdfPages ? 'pdf' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {pdfPages
          ? <div className="pdf-pages">{pdfPages.map((u, i) => <img key={u} src={u} alt={`Page ${i + 1}`} />)}</div>
          : (fullUrl || previewUrl) && <img src={fullUrl || previewUrl} alt="" />}
        {message && <p className="viewer-message">{message}</p>}
        {canNavigate && (
          <>
            <button className="viewer-arrow left" disabled={!prev} onClick={() => prev && onNavigate(prev)}
              aria-label="Previous photo">
              <ChevronLeft size={30} strokeWidth={1.75} />
            </button>
            <button className="viewer-arrow right" disabled={!next} onClick={() => next && onNavigate(next)}
              aria-label="Next photo">
              <ChevronRight size={30} strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>
      {(onDelete || onMoved) && (
        <div className="viewer-bottom">
          {pdfBlob && (
            <button className="link light" onClick={() => downloadBlob(pdfBlob, photo.drive_file_name || 'receipt.pdf')}>
              Download PDF
            </button>
          )}
          {isMain === true && <span className="viewer-main">★ Main photo</span>}
          {isMain === false && onMakeMain && (
            <button className="link light" onClick={onMakeMain}>Use as main photo</button>
          )}
          {onMoved && homeId && <button className="link light" onClick={() => setMoving(true)}>Move…</button>}
          {onDelete && <button className="link danger-light" onClick={onDelete}>Delete this photo</button>}
        </div>
      )}
      {moving && (
        <MoveSheet photo={photo} homeId={homeId} onCancel={() => setMoving(false)} onMoved={onMoved} />
      )}
    </div>
  )
}

// The "Move photo" choices.
function MoveSheet({ photo, homeId, onCancel, onMoved }) {
  const [data, setData] = useState(null) // { rooms, items }
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listHomeItems(homeId).then(setData).catch((e) => setError(e.message))
  }, [homeId])

  async function move(change, goToItem = false) {
    setBusy(true)
    setError('')
    try {
      await movePhoto(photo, change)
      onMoved()
      // For a brand-new item, go straight to it so it can be named.
      if (goToItem) navigate(`/item/${change.itemId}`)
    } catch (e) {
      setError(`Not moved: ${e.message}`)
      setBusy(false)
    }
  }

  const here = { itemId: photo.item_id, roomId: photo.room_id }
  const roomName = data?.rooms.find((r) => r.id === photo.room_id)?.name
  const chosen = data?.items.find((i) => i.id === target)

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Move this photo</h3>
        {error && <p className="error">{error}</p>}
        {!data && !error && <p className="muted">Loading…</p>}
        {data && (
          <>
            {photo.kind === 'item' && (
              <button disabled={busy} onClick={() => move({ ...here, kind: 'receipt' })}>
                Make it a receipt (same item)
              </button>
            )}
            {photo.kind === 'receipt' && (
              <button disabled={busy} onClick={() => move({ ...here, kind: 'item' })}>
                Make it an item photo (same item)
              </button>
            )}
            {photo.kind !== 'room_overview' && (
              <button className="secondary" disabled={busy}
                onClick={() => move({ kind: 'room_overview', itemId: null, roomId: photo.room_id })}>
                Use as a room overview photo{roomName ? ` (${roomName})` : ''}
              </button>
            )}

            <button className="secondary" disabled={busy} onClick={async () => {
              setBusy(true)
              try {
                const item = await createBlankItem(photo.room_id)
                await move({ kind: photo.kind === 'receipt' ? 'receipt' : 'item', itemId: item.id, roomId: photo.room_id }, true)
              } catch (e) {
                setError(`Not moved: ${e.message}`)
                setBusy(false)
              }
            }}>
              Move to a new item{roomName ? ` (${roomName})` : ''}
            </button>

            <label>
              Move to another item
              <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
                <option value="">Choose an item…</option>
                {data.rooms.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {data.items.filter((i) => i.room_id === r.id && i.id !== photo.item_id).map((i) => (
                      <option key={i.id} value={i.id}>{i.name || 'Draft item'}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {chosen && (
              <div className="button-row">
                <button disabled={busy} onClick={() => move({ kind: 'item', itemId: chosen.id, roomId: chosen.room_id })}>
                  As a photo
                </button>
                <button disabled={busy} onClick={() => move({ kind: 'receipt', itemId: chosen.id, roomId: chosen.room_id })}>
                  As a receipt
                </button>
              </div>
            )}
            {busy && <p className="muted">Moving… (also updating Google Drive)</p>}
          </>
        )}
        <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
