// One home: edit its name/address, and manage its rooms
// (add, rename, reorder, delete).
import { useEffect, useState } from 'react'
import {
  getHome, updateHome, deleteHome, setHomePhoto, removeHomePhoto,
  listRooms, createRoom, renameRoom, deleteRoom, saveOrder, countItemsByRoom,
} from '../lib/data'
import { navigate } from '../lib/router'
import { Header, MoveButtons, moved, errorText } from '../components'
import { LogoCamera } from '../icons'
import { HomeThumb, PickPhotoButton } from '../HomePhoto'

// One-tap suggestions to speed up setting up a new home.
const COMMON_ROOMS = [
  'Kitchen', 'Living Room', 'Dining Room', 'Master Bedroom', 'Bedroom 2',
  'Bathroom', 'Office', 'Garage', 'Laundry', 'Basement', 'Closet', 'Outdoor / Patio',
]

export default function HomeScreen({ homeId }) {
  const [home, setHome] = useState(null)
  const [rooms, setRooms] = useState([])
  const [counts, setCounts] = useState({}) // items per room
  const [error, setError] = useState('')
  const [newRoom, setNewRoom] = useState('')
  const [editingHome, setEditingHome] = useState(false)
  const [editingRoomId, setEditingRoomId] = useState(null)
  const [roomName, setRoomName] = useState('')

  async function load() {
    try {
      const [h, r] = await Promise.all([getHome(homeId), listRooms(homeId)])
      setHome(h)
      setRooms(r)
      setCounts(await countItemsByRoom(r.map((room) => room.id)))
    } catch (e) {
      setError(errorText(e))
    }
  }
  useEffect(() => { load() }, [homeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run a database change, then reload the list; show any error.
  async function run(action) {
    setError('')
    try {
      await action()
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function addRoom(name) {
    if (!name.trim()) return
    await run(() => createRoom(homeId, name, rooms.length))
    setNewRoom('')
  }

  async function handleMove(index, direction) {
    const newOrder = moved(rooms, index, direction)
    setRooms(newOrder)
    try {
      await saveOrder('rooms', newOrder)
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function handleDeleteRoom(room) {
    const n = counts[room.id] || 0
    const warning = n
      ? `Delete the room "${room.name}" and its ${n} item${n === 1 ? '' : 's'}? ` +
        'This cannot be undone. (Photos already in Google Drive are kept.)'
      : `Delete the room "${room.name}"? This cannot be undone.`
    if (!window.confirm(warning)) return
    await run(() => deleteRoom(room.id))
  }

  async function handleDeleteHome() {
    const typed = window.prompt(
      `This deletes "${home.name}" and ALL of its rooms and items. It cannot be undone. ` +
        '(Photos already in Google Drive are kept.)\n\n' +
        'Type DELETE to confirm.',
    )
    if (typed !== 'DELETE') return
    try {
      await deleteHome(homeId)
      navigate('/')
    } catch (e) {
      setError(errorText(e))
    }
  }

  if (!home) {
    return (
      <>
        <Header title="Home" backTo="/" />
        <main className="content">{error ? <p className="error">{error}</p> : <p>Loading…</p>}</main>
      </>
    )
  }

  const existingNames = new Set(rooms.map((r) => r.name.toLowerCase()))
  const suggestions = COMMON_ROOMS.filter((n) => !existingNames.has(n.toLowerCase()))

  return (
    <>
      <Header title={home.name} backTo="/" />
      <main className="content">
        {error && <p className="error">{error}</p>}

        {/* ----- Home name & address ----- */}
        {editingHome ? (
          <HomeForm
            home={home}
            onPhoto={async (file) => {
              await run(() => setHomePhoto(home, file))
            }}
            onRemovePhoto={async () => {
              if (!window.confirm('Remove this home’s photo? (The Drive copy goes to Drive’s Trash.)')) return
              await run(() => removeHomePhoto(home))
            }}
            onCancel={() => setEditingHome(false)}
            onSave={async (values) => {
              await run(() => updateHome(homeId, values))
              setEditingHome(false)
            }}
          />
        ) : (
          <div className="summary">
            <div className="home-link">
              <HomeThumb home={home} size={64} />
              <div>
                <strong>{home.name}</strong>
                <div className="muted">{home.address || 'No address yet'}</div>
              </div>
            </div>
            <button className="link" onClick={() => setEditingHome(true)}>Edit</button>
          </div>
        )}

        {/* ----- Rooms ----- */}
        <h3>Rooms</h3>
        {rooms.length === 0 && <p className="muted">No rooms yet. Add some below.</p>}
        <ul className="list">
          {rooms.map((room, i) => (
            <li key={room.id} className="row">
              {editingRoomId === room.id ? (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await run(() => renameRoom(room.id, roomName))
                    setEditingRoomId(null)
                  }}
                >
                  <input value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    required autoFocus />
                  <button type="submit">Save</button>
                  <button type="button" className="secondary" onClick={() => setEditingRoomId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <a className="row-main" href={`#/room/${room.id}`}>
                    <strong>{room.name} ›</strong>
                    <span className="muted">
                      {counts[room.id] || 0} item{counts[room.id] === 1 ? '' : 's'}
                    </span>
                  </a>
                  <a className="capture-btn" href={`#/capture/${room.id}`} aria-label={`Add new items in ${room.name}`}
                    title="Add New">
                    <LogoCamera size={22} />
                  </a>
                  <button className="link" onClick={() => { setEditingRoomId(room.id); setRoomName(room.name) }}>
                    Rename
                  </button>
                  <button className="link danger" onClick={() => handleDeleteRoom(room)}>Delete</button>
                  {rooms.length > 1 && (
                    <MoveButtons index={i} count={rooms.length} onMove={handleMove} />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); addRoom(newRoom) }}>
          <input value={newRoom} onChange={(e) => setNewRoom(e.target.value)}
            placeholder="New room name" />
          <button type="submit">Add</button>
        </form>

        {suggestions.length > 0 && (
          <>
            <p className="muted">Quick add:</p>
            <div className="chips">
              {suggestions.map((n) => (
                <button key={n} className="chip" onClick={() => addRoom(n)}>+ {n}</button>
              ))}
            </div>
          </>
        )}

        <button className="link danger delete-home" onClick={handleDeleteHome}>
          Delete this home
        </button>
      </main>
    </>
  )
}

// Small form for editing a home's name and address.
function HomeForm({ home, onSave, onCancel, onPhoto, onRemovePhoto }) {
  const [name, setName] = useState(home.name)
  const [address, setAddress] = useState(home.address || '')
  const [photoBusy, setPhotoBusy] = useState(false)
  const busyWhile = (fn) => async (...args) => {
    setPhotoBusy(true)
    try { await fn(...args) } finally { setPhotoBusy(false) }
  }
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onSave({ name, address }) }}>
      <div className="home-photo-edit">
        <HomeThumb home={home} size={88} />
        <div className="home-photo-actions">
          {photoBusy ? <span className="muted">Saving photo…</span> : (
            <>
              <PickPhotoButton onPick={busyWhile(onPhoto)}
                label={home.photo_thumb_path ? 'Change photo' : 'Add a photo of the home'} />
              {home.photo_thumb_path && (
                <button type="button" className="link danger" onClick={busyWhile(onRemovePhoto)}>Remove photo</button>
              )}
            </>
          )}
        </div>
      </div>
      <label>
        Home name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Address
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <button type="submit">Save</button>
      <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
    </form>
  )
}
