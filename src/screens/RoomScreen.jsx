// One room: its overview photos and its items (with previews).
// Also checks Google Drive for photos that were deleted there directly.
import { useEffect, useState } from 'react'
import { getRoomContents, removePhotosMissingFromDrive, deletePhoto, createBlankItem, coverPhoto, markRoomReviewed } from '../lib/data'
import { navigate } from '../lib/router'
import { listRoomPhotoIdsInDrive } from '../lib/google'
import { Header, errorText } from '../components'
import { useThumbUrls, Thumb, PhotoViewer } from '../photos'
import { formatMoney, itemTotal, formatItemValue } from '../format'
import { LogoCamera } from '../icons'
import { currentJob } from '../lib/bulkAi'

export default function RoomScreen({ roomId }) {
  const [data, setData] = useState(null) // { room, items, overviews }
  const [error, setError] = useState('')
  const [missing, setMissing] = useState([]) // photos deleted directly in Drive
  const [viewing, setViewing] = useState(null) // overview photo being viewed

  async function load() {
    try {
      const contents = await getRoomContents(roomId)
      setData(contents)
      checkDrive(contents) // in the background
    } catch (e) {
      setError(errorText(e))
    }
  }
  useEffect(() => { load() }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compare the app's photos with what's actually in this room's Drive folder.
  async function checkDrive({ items, overviews }) {
    try {
      const inDrive = await listRoomPhotoIdsInDrive(roomId)
      const all = [...overviews, ...items.flatMap((i) => i.photos)]
      setMissing(all.filter((p) => !inDrive.has(p.drive_file_id)))
    } catch (e) {
      // Offline or Drive not connected: just skip the check this time.
      console.warn('Drive check skipped', e)
    }
  }

  async function handleRemoveMissing() {
    try {
      await removePhotosMissingFromDrive(missing, data.items)
      setMissing([])
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const allPhotos = data ? [...data.overviews, ...data.items.map((i) => coverPhoto(i)).filter(Boolean)] : []
  const urls = useThumbUrls(allPhotos)

  if (!data) {
    return (
      <>
        <Header title="Room" backTo="/" />
        <main className="content">{error ? <p className="error">{error}</p> : <p>Loading…</p>}</main>
      </>
    )
  }

  const { room, items, overviews } = data
  const total = items.reduce((sum, i) => sum + itemTotal(i), 0)

  return (
    <>
      <Header title={room.name} backTo={`/home/${room.home.id}`} />
      <main className="content">
        {error && <p className="error">{error}</p>}

        {missing.length > 0 && (
          <div className="sync-warning">
            <p>
              <strong>{missing.length} photo{missing.length === 1 ? ' was' : 's were'} deleted in Google Drive.</strong>{' '}
              Remove {missing.length === 1 ? 'it' : 'them'} from the app too? Items with no photos
              and no details left will also be removed; items with details keep them.
            </p>
            <div className="button-row">
              <button onClick={handleRemoveMissing}>Remove</button>
              <button className="secondary" onClick={() => setMissing([])}>Keep</button>
            </div>
          </div>
        )}

        <div className="summary">
          <div>
            <strong>{items.length} item{items.length === 1 ? '' : 's'}</strong>
            <div className="muted">Estimated value {formatMoney(total)}</div>
          </div>
          <a className="button-link" href={`#/capture/${room.id}`}>
            <LogoCamera size={20} /> Add New
          </a>
        </div>

        <h3>Room overview</h3>
        {overviews.length === 0 ? (
          <p className="muted">No overview photos yet.</p>
        ) : (
          <div className="thumb-strip">
            {overviews.map((p) => (
              <Thumb key={p.id} url={urls[p.thumb_path]} size={88} onClick={() => setViewing(p)} />
            ))}
          </div>
        )}

        <div className="items-head">
          <h3>Items</h3>
          {items.length > 0 && (
            <a className="button-link secondary-link small" href={`#/room/${room.id}/suggest`}>
              {currentJob()?.roomId === room.id ? '✨ Review suggestions' : '✨ Suggest for items'}
            </a>
          )}
        </div>
        {items.length === 0 && <p className="muted">No items yet.</p>}
        <ul className="list">
          {items.map((item) => {
            const cover = coverPhoto(item)
            const value = formatItemValue(item)
            return (
              <li key={item.id}>
                <a className="row item-row" href={`#/item/${item.id}`}>
                  <Thumb url={cover && urls[cover.thumb_path]} label={cover ? '' : 'No photo'} />
                  <span className="row-main">
                    <strong>{item.name || 'Draft item'}{item.quantity > 1 ? ` (×${item.quantity})` : ''}</strong>
                    <span className="muted">
                      {[item.category, value].filter(Boolean).join(' · ') ||
                        `${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  {item.needs_details && <span className="badge">Needs details</span>}
                </a>
              </li>
            )
          })}
        </ul>
        <button className="secondary add-item" onClick={async () => {
          try {
            const item = await createBlankItem(room.id)
            navigate(`/item/${item.id}`)
          } catch (e) {
            setError(errorText(e))
          }
        }}>
          + Add item
        </button>

        <p className="reviewed-note">
          {room.reviewed_at ? `Last reviewed ${new Date(room.reviewed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : 'Not reviewed yet'}
          {' · '}
          <button className="link" onClick={async () => {
            try {
              await markRoomReviewed(room.id)
              await load()
            } catch (e) {
              setError(errorText(e))
            }
          }}>
            Mark reviewed today
          </button>
        </p>
      </main>

      {viewing && (
        <PhotoViewer
          photo={viewing}
          previewUrl={urls[viewing.thumb_path]}
          onClose={() => setViewing(null)}
          photos={overviews}
          onNavigate={setViewing}
          homeId={room.home.id}
          onMoved={async () => { setViewing(null); await load() }}
          onDelete={async () => {
            if (!window.confirm('Delete this room overview photo? The Drive copy goes to Drive’s Trash.')) return
            try {
              await deletePhoto(viewing)
              setViewing(null)
              await load()
            } catch (e) {
              setError(errorText(e))
              setViewing(null)
            }
          }}
        />
      )}
    </>
  )
}
