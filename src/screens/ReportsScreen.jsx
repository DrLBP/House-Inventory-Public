// Reports & exports:
//   - Spreadsheet (CSV) of all items, downloaded to this phone
//   - Insurance PDF report for one home (all rooms or chosen rooms),
//     made on this phone and downloaded here only (never uploaded/shared)
//   - Full backup zip: every photo + all details
import { useEffect, useState } from 'react'
import { listHomes, listRooms } from '../lib/data'
import { buildInventoryCsv } from '../lib/csv'
import { downloadBlob, formatBytes } from '../lib/download'
import { Header, errorText } from '../components'

export default function ReportsScreen() {
  const [homes, setHomes] = useState(null)
  const [homeId, setHomeId] = useState('')
  const [rooms, setRooms] = useState([])
  const [chosen, setChosen] = useState(new Set())
  const [error, setError] = useState('')
  const [csvBusy, setCsvBusy] = useState(false)
  const [csvDone, setCsvDone] = useState('')
  const [pdfStatus, setPdfStatus] = useState('') // progress text while building
  const [pdfResult, setPdfResult] = useState(null) // { blob, fileName, tooBigForEmail, quality }
  const [zipStatus, setZipStatus] = useState('')
  const [zipResult, setZipResult] = useState(null) // { blob, fileName, missingCount }

  useEffect(() => {
    listHomes()
      .then((h) => {
        setHomes(h)
        if (h[0]) setHomeId(h[0].id)
      })
      .catch((e) => setError(errorText(e)))
  }, [])

  // Load the chosen home's rooms; all rooms are ticked to start with.
  useEffect(() => {
    if (!homeId) return
    setPdfResult(null)
    listRooms(homeId)
      .then((r) => {
        setRooms(r)
        setChosen(new Set(r.map((room) => room.id)))
      })
      .catch((e) => setError(errorText(e)))
  }, [homeId])

  async function handleCsv() {
    setCsvBusy(true)
    setError('')
    setCsvDone('')
    try {
      const { csv, itemCount } = await buildInventoryCsv()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadBlob(new Blob([csv], { type: 'text/csv' }), `Home Inventory - all items - ${stamp}.csv`)
      setCsvDone(`✅ Downloaded (${itemCount} items). Look in your phone’s Downloads.`)
    } catch (e) {
      setError(errorText(e))
    }
    setCsvBusy(false)
  }

  function toggleRoom(id) {
    setPdfResult(null)
    setChosen((set) => {
      const next = new Set(set)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handlePdf(quality) {
    setError('')
    setPdfResult(null)
    setPdfStatus('Loading items…')
    try {
      // The PDF tools are only loaded when needed, keeping the app quick to open.
      const { loadReportData, buildReportPdf } = await import('../lib/pdfReport')
      const data = await loadReportData(homeId, rooms.filter((r) => chosen.has(r.id)).map((r) => r.id))
      const result = await buildReportPdf(data, quality, setPdfStatus)
      downloadBlob(result.blob, result.fileName)
      setPdfResult({ ...result, quality })
    } catch (e) {
      setError(
        e.notConnected
          ? 'Google Drive is not connected, so the photos can’t be added. Connect it in Settings.'
          : `The report couldn’t be created: ${e.message}`,
      )
    }
    setPdfStatus('')
  }

  async function handleZip() {
    setError('')
    setZipResult(null)
    setZipStatus('Checking what to include…')
    try {
      const { loadBackupData, buildBackupZip } = await import('../lib/zipBackup')
      const data = await loadBackupData()
      const mb = Math.round(data.totalBytes / 1024 / 1024)
      if (!window.confirm(
        `This will download ${data.photos.length} photos (about ${mb} MB) and save them with all ` +
        'item details as one zip file on this phone. Use Wi-Fi for large backups. Continue?',
      )) {
        setZipStatus('')
        return
      }
      const result = await buildBackupZip(data, setZipStatus)
      downloadBlob(result.blob, result.fileName)
      setZipResult(result)
    } catch (e) {
      setError(
        e.notConnected
          ? 'Google Drive is not connected, so the photos can’t be added. Connect it in Settings.'
          : `The backup couldn’t be created: ${e.message}`,
      )
    }
    setZipStatus('')
  }

  const busy = Boolean(pdfStatus) || Boolean(zipStatus)
  const allChosen = rooms.length > 0 && chosen.size === rooms.length

  return (
    <>
      <Header title="Reports" />
      <main className="content with-nav">
        {error && <p className="error">{error}</p>}

        {/* ----- Insurance PDF ----- */}
        <h3>Insurance report (PDF)</h3>
        <p className="muted">
          A printable report with a cover page, a summary by room, and every item with its
          photos, details and receipts. It’s made on this phone and saved to your Downloads.
          It is never uploaded or shared.
        </p>

        {homes?.length === 0 && <p className="muted">Add a home first.</p>}
        {homes?.length > 0 && (
          <div className="card wide">
            {homes.length > 1 && (
              <label>
                Home
                <select value={homeId} onChange={(e) => setHomeId(e.target.value)} disabled={busy}>
                  {homes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </label>
            )}

            <div>
              <div className="rooms-head">
                <strong>Rooms</strong>
                <button className="link" disabled={busy} onClick={() => {
                  setPdfResult(null)
                  setChosen(allChosen ? new Set() : new Set(rooms.map((r) => r.id)))
                }}>
                  {allChosen ? 'Select none' : 'Select all'}
                </button>
              </div>
              {rooms.length === 0 && <p className="muted">This home has no rooms yet.</p>}
              <div className="room-checks">
                {rooms.map((r) => (
                  <label key={r.id} className="check">
                    <input type="checkbox" checked={chosen.has(r.id)} disabled={busy}
                      onChange={() => toggleRoom(r.id)} />
                    {r.name}
                  </label>
                ))}
              </div>
            </div>

            <button disabled={busy || chosen.size === 0} onClick={() => handlePdf('email')}>
              Create PDF (email size)
            </button>
            <button className="secondary" disabled={busy || chosen.size === 0} onClick={() => handlePdf('high')}>
              Create high-quality PDF
            </button>
            <p className="muted small-print">
              Email size keeps the file under about 25 MB so it can be emailed. The high-quality
              version uses full-size photos and can be much larger. For a big home, a computer
              handles it best.
            </p>

            {busy && <p className="notice">⏳ {pdfStatus}<br /><span className="muted">Keep the app open until it’s done.</span></p>}

            {pdfResult && (
              <div className={pdfResult.tooBigForEmail && pdfResult.quality === 'email' ? 'sync-warning' : 'notice'}>
                <p>
                  ✅ Report saved to your Downloads: <strong>{pdfResult.fileName}</strong>{' '}
                  ({formatBytes(pdfResult.blob.size)}).
                </p>
                {pdfResult.quality === 'email' && pdfResult.tooBigForEmail && (
                  <p>
                    It’s still over 25 MB, which most email services won’t accept. Try
                    creating separate reports for a few rooms at a time.
                  </p>
                )}
                {pdfResult.quality === 'email' && !pdfResult.tooBigForEmail && (
                  <p className="muted">Small enough to email. Need sharper photos? Tap “Create high-quality PDF”.</p>
                )}
                <button className="secondary" onClick={() => downloadBlob(pdfResult.blob, pdfResult.fileName)}>
                  Download again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ----- Spreadsheet ----- */}
        <h3>Spreadsheet (CSV)</h3>
        <p className="muted">
          All items in every home, one row per item, with photo file names. Opens in Excel,
          Google Sheets or Numbers.
        </p>
        <button disabled={csvBusy || busy} onClick={handleCsv}>
          {csvBusy ? 'Preparing…' : 'Download spreadsheet'}
        </button>
        {csvDone && <p className="notice">{csvDone}</p>}

        {/* ----- Full backup ----- */}
        <h3>Full backup (zip)</h3>
        <p className="muted">
          Every photo and receipt at full size, plus all item details, in one zip file
          saved to this phone. The folders match your Google Drive. Keep it somewhere
          private, like a USB drive or a personal cloud folder.
        </p>
        <button disabled={busy} onClick={handleZip}>Download full backup</button>
        {zipStatus && <p className="notice">⏳ {zipStatus}<br /><span className="muted">Keep the app open until it’s done.</span></p>}
        {zipResult && (
          <div className="notice">
            <p>
              ✅ Saved to your Downloads: <strong>{zipResult.fileName}</strong> ({formatBytes(zipResult.blob.size)}).
            </p>
            {zipResult.missingCount > 0 && (
              <p>{zipResult.missingCount} photo(s) weren’t found in Google Drive; they’re listed in README.txt.</p>
            )}
            <button className="secondary" onClick={() => downloadBlob(zipResult.blob, zipResult.fileName)}>
              Download again
            </button>
          </div>
        )}
      </main>
    </>
  )
}
