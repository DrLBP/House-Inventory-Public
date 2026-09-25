// "My Homes" screen: list of homes/properties, add a new one, reorder.
import { useEffect, useState } from 'react'
import { listHomes, createHome, saveOrder, setHomePhoto } from '../lib/data'
import { navigate } from '../lib/router'
import { Header, MoveButtons, moved, errorText } from '../components'
import { HomeThumb, PickPhotoButton } from '../HomePhoto'

export default function HomesScreen() {
  const [homes, setHomes] = useState(null) // null = still loading
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [photo, setPhoto] = useState(null) // optional outside photo (a file)
  const [saving, setSaving] = useState('')

  useEffect(() => {
    listHomes().then(setHomes).catch((e) => setError(errorText(e)))
  }, [])

  async function handleAdd(event) {
    event.preventDefault()
    setSaving('Saving…')
    try {
      const home = await createHome({ name, address }, homes.length)
      if (photo) {
        setSaving('Saving photo to Google Drive…')
        try {
          await setHomePhoto(home, photo)
        } catch (e) {
          // The home is saved; the photo can be added later from its Edit screen.
          window.alert(`The home was saved, but the photo wasn't: ${e.message}. You can add it later with “Edit”.`)
        }
      }
      navigate(`/home/${home.id}`) // go straight to the new home to add rooms
    } catch (e) {
      setError(errorText(e))
      setSaving('')
    }
  }

  async function handleMove(index, direction) {
    const newOrder = moved(homes, index, direction)
    setHomes(newOrder) // update the screen right away...
    try {
      await saveOrder('homes', newOrder) // ...then save to the database
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <>
      <Header title="My Homes" />
      <main className="content with-nav">
        {error && <p className="error">{error}</p>}
        {homes === null && !error && <p>Loading…</p>}
        {homes?.length === 0 && !adding && (
          <p className="muted">No homes yet. Add your first one below.</p>
        )}

        <ul className="list">
          {homes?.map((home, i) => (
            <li key={home.id} className="row">
              <a className="row-main home-link" href={`#/home/${home.id}`}>
                <HomeThumb home={home} />
                <span className="home-text">
                  <strong>{home.name}</strong>
                  {home.address && <span className="muted">{home.address}</span>}
                </span>
              </a>
              {homes.length > 1 && (
                <MoveButtons index={i} count={homes.length} onMove={handleMove} />
              )}
            </li>
          ))}
        </ul>

        {adding ? (
          <form className="card" onSubmit={handleAdd}>
            <label>
              Home name
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main House" required autoFocus />
            </label>
            <label>
              Address (shown on the insurance report)
              <input value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, City, State ZIP" />
            </label>
            {photo ? (
              <p className="muted">📎 Photo chosen: {photo.name}{' '}
                <button type="button" className="link" onClick={() => setPhoto(null)}>Remove</button>
              </p>
            ) : (
              <PickPhotoButton onPick={setPhoto} label="Add a photo of the home (optional)" />
            )}
            <button type="submit" disabled={Boolean(saving)}>{saving || 'Save home'}</button>
            <button type="button" className="secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        ) : (
          homes && <button onClick={() => setAdding(true)}>+ Add a home</button>
        )}
      </main>
    </>
  )
}
