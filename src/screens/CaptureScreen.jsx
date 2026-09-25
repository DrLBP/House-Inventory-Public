// Quick Capture: a live camera for one room. Tap the big button to take
// photo after photo. Each photo becomes a draft item (or, in "Room overview"
// mode, a photo of the whole room). Photos go into the upload queue, which
// saves them on the phone first and uploads them in the background.
//
// Opened from an item's screen ("+ Photo" / "+ Receipt"), every photo is
// added to THAT item instead (fixedItemId + fixedKind).
import { useEffect, useRef, useState } from 'react'
import { getRoomWithHome } from '../lib/data'
import { processVideoFrame, processGalleryFile, processPdfFile } from '../lib/images'
import { addToQueue } from '../lib/queue'
import { UploadStatus } from '../components'

export default function CaptureScreen({ roomId, fixedItemId = null, fixedKind = null }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const galleryRef = useRef(null)
  const [room, setRoom] = useState(null)
  const [cameraError, setCameraError] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState(fixedKind || 'item') // 'item', 'receipt' or 'room_overview'
  const [sameItem, setSameItem] = useState(false)
  const [currentItem, setCurrentItem] = useState(null) // { id, photos }
  const [taken, setTaken] = useState(0)
  const [recent, setRecent] = useState([]) // small previews from this session
  const [flash, setFlash] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getRoomWithHome(roomId).then(setRoom).catch((e) => setError(e.message))
  }, [roomId])

  // ----- Camera on/off -----
  async function startCamera() {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' }, // back camera
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (e) {
      setCameraError(
        e.name === 'NotAllowedError'
          ? 'Camera permission was blocked. In Chrome: tap the icon left of the address bar → Permissions → Camera → Allow. You can still use "Gallery".'
          : `Camera could not start (${e.message}). You can still use "Gallery".`,
      )
    }
  }
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }
  useEffect(() => {
    startCamera()
    // Turn the camera off when the app is in the background, back on when it returns.
    const onVisibility = () => (document.hidden ? stopCamera() : startCamera())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stopCamera()
      setRecent((list) => { list.forEach((r) => URL.revokeObjectURL(r.url)); return [] })
    }
  }, [])

  // Which item should the next photo belong to?
  function nextItemId() {
    if (fixedItemId) return fixedItemId
    if (mode === 'room_overview') return null
    if (sameItem && currentItem) return currentItem.id
    return crypto.randomUUID()
  }

  // Put a processed photo into the upload queue and update the screen.
  async function save(photo, itemId) {
    await addToQueue({
      id: crypto.randomUUID(),
      kind: mode,
      roomId,
      itemId,
      takenAt: photo.takenAt,
      full: photo.full,
      thumb: photo.thumb,
      width: photo.width,
      height: photo.height,
      mimeType: photo.mimeType || 'image/jpeg',
    })
    if (itemId) {
      setCurrentItem((cur) =>
        cur && cur.id === itemId ? { ...cur, photos: cur.photos + 1 } : { id: itemId, photos: 1 },
      )
    }
    setTaken((n) => n + 1)
    const url = URL.createObjectURL(photo.thumb)
    setRecent((list) => {
      const next = [{ url, key: url }, ...list]
      next.slice(8).forEach((r) => URL.revokeObjectURL(r.url))
      return next.slice(0, 8)
    })
  }

  async function takePhoto() {
    const video = videoRef.current
    if (!video?.videoWidth || busy) return
    setBusy(true)
    setError('')
    setFlash(true)
    setTimeout(() => setFlash(false), 120)
    navigator.vibrate?.(25)
    try {
      await save(await processVideoFrame(video), nextItemId())
    } catch (e) {
      setError(`Photo not saved: ${e.message}`)
    }
    setBusy(false)
  }

  async function handleGallery(event) {
    const files = [...event.target.files]
    event.target.value = '' // allow choosing the same files again later
    if (!files.length) return
    setBusy(true)
    setError('')
    // With "Same item" on, all chosen photos go to one item; otherwise one item each.
    const sharedId = fixedItemId || (mode === 'item' && sameItem ? (currentItem?.id || crypto.randomUUID()) : null)
    for (const file of files) {
      try {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        if (isPdf && mode !== 'receipt') throw new Error('PDFs can only be added as receipts.')
        const processed = isPdf ? await processPdfFile(file) : await processGalleryFile(file)
        await save(processed, mode === 'room_overview' ? null : sharedId || crypto.randomUUID())
      } catch (e) {
        setError(e.message)
      }
    }
    setBusy(false)
  }

  const backTo = fixedItemId ? `#/item/${fixedItemId}` : `#/room/${roomId}`

  return (
    <div className="capture">
      <video ref={videoRef} autoPlay playsInline muted className="viewfinder" />
      {flash && <div className="flash" />}

      <div className="capture-top">
        <a className="capture-close" href={backTo} aria-label="Done">✕ Done</a>
        <div className="capture-title">
          <strong>{room?.name || '…'}</strong>
          <span>{fixedItemId ? (mode === 'receipt' ? 'Adding receipts to item' : 'Adding photos to item') : room?.home.name}</span>
        </div>
        <span className="capture-count">{taken} taken</span>
      </div>

      <div className="capture-messages">
        {cameraError && <p className="capture-error">{cameraError}</p>}
        {error && <p className="capture-error">{error}</p>}
        <UploadStatus compact />
      </div>

      <div className="capture-bottom">
        {!fixedItemId && <div className="mode-switch">
          <button className={mode === 'item' ? 'on' : ''} onClick={() => setMode('item')}>Items</button>
          <button className={mode === 'room_overview' ? 'on' : ''} onClick={() => setMode('room_overview')}>
            Room overview
          </button>
        </div>}

        {mode === 'item' && !fixedItemId && (
          <label className="same-item">
            <span className="same-item-main">
              <input
                type="checkbox"
                checked={sameItem}
                onChange={(e) => setSameItem(e.target.checked)}
              />
              Same item
            </span>
            <span className="same-item-hint">
              {sameItem && currentItem
                ? `next photo adds to this item (${currentItem.photos} so far)`
                : 'off: each photo is a new item'}
            </span>
          </label>
        )}

        <div className="shutter-row">
          <button className="gallery-btn" onClick={() => galleryRef.current.click()} disabled={busy}>
            {mode === 'receipt' ? 'Photo / PDF' : 'Gallery'}
          </button>
          <button className="shutter" onClick={takePhoto} disabled={busy || !!cameraError} aria-label="Take photo" />
          <div className="recent">
            {recent[0] && <img src={recent[0].url} alt="Last photo" />}
          </div>
        </div>
        <input ref={galleryRef} type="file" multiple hidden onChange={handleGallery}
          accept={mode === 'receipt' ? 'image/*,application/pdf' : 'image/*'} />
      </div>
    </div>
  )
}
