// Import an inventory file (prepared from another app's report) into a home.
import { useEffect, useRef, useState } from 'react'
import { listHomes } from '../lib/data'
import { readImportFile, runImport } from '../lib/importer'
import { navigate } from '../lib/router'
import { Header, errorText, UploadStatus } from '../components'

export default function ImportScreen() {
  const fileInput = useRef(null)
  const [homes, setHomes] = useState([])
  const [homeId, setHomeId] = useState('')
  const [pkg, setPkg] = useState(null) // { data, summary }
  const [status, setStatus] = useState('')
  const [done, setDone] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { listHomes().then(setHomes).catch((e) => setError(errorText(e))) }, [])

  async function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setDone(null)
    try {
      const loaded = await readImportFile(file)
      setPkg(loaded)
      // Pre-select a home with a similar name, if there is one.
      const want = (loaded.data.home?.name || '').toLowerCase()
      const match = homes.find((h) => want.includes(h.name.toLowerCase()) || h.name.toLowerCase().includes(want))
      setHomeId(match?.id || homes[0]?.id || '')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleImport() {
    const home = homes.find((h) => h.id === homeId)
    if (!window.confirm(
      `Import ${pkg.summary.items} items, ${pkg.summary.rooms} rooms and ${pkg.summary.photos} photos into “${home.name}”?`,
    )) return
    setError('')
    try {
      setDone(await runImport(pkg.data, home, setStatus))
    } catch (err) {
      setError(errorText(err))
    }
    setStatus('')
  }

  return (
    <>
      <Header title="Import" backTo="/settings" />
      <main className="content">
        <UploadStatus />
        <p className="muted">
          Bring in an inventory prepared from another app’s report. Rooms with the same name
          are reused; nothing already in the app is changed.
        </p>
        {error && <p className="error">{error}</p>}

        {!pkg && <button onClick={() => fileInput.current.click()}>Choose import file</button>}
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={handleFile} />

        {pkg && !done && (
          <div className="card wide">
            <div>
              <strong>{pkg.data.source || 'Import file'}</strong>
              <div className="muted">
                {pkg.summary.rooms} rooms · {pkg.summary.items} items · {pkg.summary.photos} photos
              </div>
            </div>
            <label>
              Import into home
              <select value={homeId} onChange={(e) => setHomeId(e.target.value)} disabled={Boolean(status)}>
                {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <button disabled={!homeId || Boolean(status)} onClick={handleImport}>
              {status || 'Import'}
            </button>
            {status && <p className="muted small-print">Keep the app open until the photos are prepared.</p>}
          </div>
        )}

        {done && (
          <div className="notice">
            <p>
              ✅ Imported {done.items} items in {done.rooms} rooms. The {done.photos} photos are now
              uploading to Google Drive in the background. The yellow bar shows progress. Keep the
              app open (or reopen it later) until it disappears.
            </p>
            <button className="secondary" onClick={() => navigate(`/home/${homeId}`)}>Open the home</button>
          </div>
        )}
      </main>
    </>
  )
}
