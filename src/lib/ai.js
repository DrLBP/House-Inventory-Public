// AI assist (Claude): suggestions from photos, and current-price lookups.
// Photos are fetched from Drive, shrunk to the size Claude works best with,
// and sent to OUR server (/api/ai/...), which holds the AI key.
import { supabase } from './supabase'
import { downloadDriveFile } from './google'
import { CATEGORIES } from './data'

const MAX_SIDE = 1568 // larger images are scaled down by the AI anyway
const MAX_IMAGES = 5

async function toBase64Jpeg(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  return blobToBase64(out)
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

async function callServer(path, body) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify(body),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(result.error || `Server error ${res.status}`)
  return result
}

// photos: the item's photos (item photos first, then receipts).
// current: the details currently in the form.
export async function suggestDetails(photos, current, onStatus) {
  const chosen = [
    ...photos.filter((p) => p.kind === 'item'),
    ...photos.filter((p) => p.kind === 'receipt'),
  ].slice(0, MAX_IMAGES)
  const images = []
  const BUDGET = 3_800_000 // stay under the server's ~4.5 MB request limit
  const used = () => images.reduce((s, x) => s + x.data.length, 0)
  for (let i = 0; i < chosen.length && used() < BUDGET; i++) {
    onStatus(`Preparing photo ${i + 1} of ${chosen.length}…`)
    const blob = await downloadDriveFile(chosen[i].drive_file_id)
    if (!blob) continue
    if (chosen[i].mime_type === 'application/pdf') {
      // Claude reads PDFs directly (text and images). Very large PDFs are
      // sent as a picture of the first page instead.
      if (blob.size <= 2.5 * 1024 * 1024) {
        images.push({ kind: chosen[i].kind, format: 'pdf', data: await blobToBase64(blob) })
      } else {
        const { renderPdfPages } = await import('./pdfPages')
        const { pages } = await renderPdfPages(blob, { maxPages: 1, maxSide: MAX_SIDE })
        images.push({ kind: chosen[i].kind, data: await toBase64Jpeg(pages[0].blob) })
      }
    } else {
      images.push({ kind: chosen[i].kind, data: await toBase64Jpeg(blob) })
    }
  }
  while (images.length > 1 && used() > BUDGET) images.pop()
  if (!images.length) throw new Error('No photos could be loaded from Google Drive for this item.')
  onStatus('Claude is looking at the photos… (about 10–40 seconds)')
  return callServer('/api/ai/suggest', { images, current, categories: CATEGORIES })
}

export async function lookUpPrice(item, onStatus) {
  onStatus('Searching the web for the current price… (about 15–50 seconds)')
  return callServer('/api/ai/price', { item })
}
