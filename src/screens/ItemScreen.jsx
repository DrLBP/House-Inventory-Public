// One item: its photos and receipts, all its details (edit + save),
// and deleting photos or the whole item.
import { useEffect, useState } from 'react'
import { getItem, updateItem, deleteItem, deletePhoto, CATEGORIES, itemNeedsDetails, mainPhotoFirst, setCoverPhoto } from '../lib/data'
import { navigate } from '../lib/router'
import { Header, errorText } from '../components'
import { useThumbUrls, Thumb, PhotoViewer, formatDateTime, isPdf } from '../photos'
import { formatItemValue, linkLabel, cleanProductUrl } from '../format'
import AiAssist from '../AiAssist'

// The editable fields, in the order shown on screen.
const EMPTY = {
  name: '', category: '', brand: '', model: '', serial_number: '', quantity: '1', product_url: '',
  purchase_date: '', purchase_price: '', replacement_value: '', notes: '',
}

export default function ItemScreen({ itemId }) {
  const [item, setItem] = useState(undefined) // undefined = loading, null = not found
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(null)

  async function load() {
    try {
      const it = await getItem(itemId)
      setItem(it)
      if (it) {
        const values = {}
        for (const k of Object.keys(EMPTY)) values[k] = it[k] ?? ''
        setForm(values)
      }
    } catch (e) {
      setError(errorText(e))
    }
  }
  useEffect(() => { load() }, [itemId]) // eslint-disable-line react-hooks/exhaustive-deps

  const photos = item?.photos || []
  const urls = useThumbUrls(photos)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const values = {
        ...form,
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
        replacement_value: form.replacement_value === '' ? null : Number(form.replacement_value),
        purchase_date: form.purchase_date || null,
      }
      const warning = await updateItem(item, values)
      await load()
      setNotice(warning || '✅ Saved')
    } catch (e) {
      setError(errorText(e))
    }
    setSaving(false)
  }

  async function handleDeleteItem() {
    const n = photos.length
    if (!window.confirm(
      `Delete this item${n ? ` and its ${n} photo${n === 1 ? '' : 's'}` : ''}? ` +
      'This cannot be undone in the app. (Photos go to Google Drive’s Trash for 30 days.)',
    )) return
    try {
      await deleteItem(item)
      navigate(`/room/${item.room.id}`)
    } catch (e) {
      setError(`Not deleted: ${e.message}. Check your connection and try again.`)
    }
  }

  async function handleDeletePhoto(photo) {
    if (!window.confirm('Delete this photo? The Drive copy goes to Drive’s Trash (recoverable for 30 days).')) return
    try {
      await deletePhoto(photo)
      setViewing(null)
      await load()
    } catch (e) {
      setViewing(null)
      setError(`Not deleted: ${e.message}. Check your connection and try again.`)
    }
  }

  if (!item) {
    return (
      <>
        <Header title="Item" backTo="/" />
        <main className="content">
          {error ? <p className="error">{error}</p> : item === null ? <p>This item no longer exists.</p> : <p>Loading…</p>}
        </main>
      </>
    )
  }

  const oldestPhoto = photos.find((p) => p.kind === 'item')
  const itemPhotos = mainPhotoFirst(item, photos.filter((p) => p.kind === 'item')) // main photo first
  const receipts = photos.filter((p) => p.kind === 'receipt')
  const captureLink = (kind) => `#/capture/${item.room.id}?item=${item.id}&kind=${kind}`
  const totalPreview = {
    quantity: Math.max(1, Math.round(Number(form.quantity) || 1)),
    purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
    replacement_value: form.replacement_value === '' ? null : Number(form.replacement_value),
  }
  const stillNeeds = itemNeedsDetails({
    ...form,
    purchase_price: form.purchase_price === '' ? null : form.purchase_price,
    replacement_value: form.replacement_value === '' ? null : form.replacement_value,
  })

  return (
    <>
      <Header title={item.name || 'Draft item'} backTo={`/room/${item.room.id}`} />
      <main className="content">
        <p className="muted">{item.room.home.name} › {item.room.name}</p>
        {error && <p className="error">{error}</p>}

        <h3>Photos</h3>
        <div className="thumb-grid">
          {itemPhotos.map((p, i) => (
            <Thumb key={p.id} url={urls[p.thumb_path]} size={96} onClick={() => setViewing(p)}
              badge={i === 0 && itemPhotos.length > 1 ? 'Main' : null} />
          ))}
          <a className="thumb add" href={captureLink('item')}>＋<br />Photo</a>
        </div>
        {oldestPhoto && (
          <p className="muted">First photo taken {formatDateTime(oldestPhoto.taken_at)}</p>
        )}

        <h3>Receipts</h3>
        <div className="thumb-grid">
          {receipts.map((p) => (
            <Thumb key={p.id} url={urls[p.thumb_path]} size={96} onClick={() => setViewing(p)}
              badge={isPdf(p) ? 'PDF' : null} />
          ))}
          <a className="thumb add" href={captureLink('receipt')}>＋<br />Receipt</a>
        </div>

        <h3>Details</h3>
        <AiAssist
          photos={photos}
          form={form}
          onApply={(changes) => {
            setForm((f) => ({ ...f, ...changes }))
            setNotice('Suggestions completed')
          }}
        />
        <form className="card wide" onSubmit={handleSave}>
          <label>
            Name
            <input value={form.name} onChange={set('name')} placeholder="e.g. Samsung 65-inch TV" />
          </label>
          <label>
            Category
            <input value={form.category} onChange={set('category')} list="categories"
              placeholder="Choose or type" />
            <datalist id="categories">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <div className="two-col">
            <label>
              Brand
              <input value={form.brand} onChange={set('brand')} />
            </label>
            <label>
              Model
              <input value={form.model} onChange={set('model')} />
            </label>
          </div>
          <label>
            Serial number
            <input value={form.serial_number} onChange={set('serial_number')}
              autoCapitalize="characters" spellCheck={false} />
          </label>
          <label>
            Purchase date
            <input type="date" value={form.purchase_date} onChange={set('purchase_date')} />
          </label>
          <label>
            Quantity
            <input type="number" inputMode="numeric" min="1" step="1" className="qty"
              value={form.quantity} onChange={set('quantity')} />
          </label>
          <div className="two-col">
            <label>
              {Number(form.quantity) > 1 ? 'Purchase price each ($)' : 'Purchase price ($)'}
              <input type="number" inputMode="decimal" min="0" step="0.01"
                value={form.purchase_price} onChange={set('purchase_price')} />
            </label>
            <label>
              {Number(form.quantity) > 1 ? 'Replacement value each ($)' : 'Replacement value ($)'}
              <input type="number" inputMode="decimal" min="0" step="0.01"
                value={form.replacement_value} onChange={set('replacement_value')} />
            </label>
          </div>
          {Number(form.quantity) > 1 && formatItemValue(totalPreview) && (
            <p className="muted">Total value: <strong>{formatItemValue(totalPreview)}</strong></p>
          )}
          <label>
            Product link
            <input type="url" inputMode="url" value={form.product_url} onChange={set('product_url')}
              placeholder="Paste a link to the product (optional)" autoComplete="off" spellCheck={false} />
          </label>
          {form.product_url.trim() && (
            <a className="product-link" href={cleanProductUrl(form.product_url)} target="_blank" rel="noopener noreferrer">
              {linkLabel(cleanProductUrl(form.product_url))} ↗
            </a>
          )}
          <label>
            Notes
            <textarea rows={3} value={form.notes} onChange={set('notes')} />
          </label>
          {stillNeeds && (
            <p className="muted">Tip: add a name and a price or value to take this off the “Needs details” list.</p>
          )}
          {notice && <p className="notice">{notice}</p>}
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button>
        </form>

        <button className="link danger delete-home" onClick={handleDeleteItem}>Delete this item</button>
      </main>

      {viewing && (
        <PhotoViewer
          photo={viewing}
          previewUrl={urls[viewing.thumb_path]}
          onClose={() => setViewing(null)}
          onDelete={() => handleDeletePhoto(viewing)}
          photos={[...itemPhotos, ...receipts]}
          onNavigate={setViewing}
          homeId={item.room.home.id}
          onMoved={async () => { setViewing(null); await load() }}
          isMain={viewing.kind === 'item' && itemPhotos.length > 1 ? viewing.id === itemPhotos[0].id : null}
          onMakeMain={async () => {
            try {
              await setCoverPhoto(item.id, viewing.id)
              setItem((it) => ({ ...it, cover_photo_id: viewing.id })) // keeps unsaved edits in the form
            } catch (e) {
              setError(errorText(e))
            }
          }}
        />
      )}
    </>
  )
}
