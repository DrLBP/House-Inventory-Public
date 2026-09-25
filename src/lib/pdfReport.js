// Insurance-claim PDF report, made ENTIRELY ON THIS PHONE and downloaded
// here only. It is never uploaded anywhere and no sharing link is created.
//
// Layout:
//   1. Cover page: the home's address as the heading, home name, date the
//      report was generated, total estimated value, number of items
//   2. Summary table: each room with item count and value, plus a grand total
//   3. One section per room: room overview photos first, then each item with
//      its photo, details, extra photos, and receipts right below it
//   Footer on every page: "Generated on [date]" and "Page X of Y"
//
// Photo sizes:
//   - "email" version: photos are shrunk so the PDF stays under about 25 MB
//     (the app measures a few photos first and picks a size that fits)
//   - "high" version: the full-size photos at high quality
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { supabase } from './supabase'
import { fetchAll } from './csv'
import { downloadDriveFile } from './google'
import { getThumbUrls } from './thumbs'
import { mainPhotoFirst } from './data'
import { formatMoney, itemTotal, linkLabel } from '../format'

const EMAIL_LIMIT_BYTES = 25 * 1024 * 1024
const EMAIL_BUDGET_BYTES = 21 * 1024 * 1024 // leave room for text and layout
// Photo size steps for the email version, largest first.
const EMAIL_LEVELS = [
  { side: 1400, quality: 0.75 },
  { side: 1100, quality: 0.7 },
  { side: 850, quality: 0.65 },
  { side: 650, quality: 0.6 },
  { side: 500, quality: 0.55 },
]

// Page layout in millimetres (US Letter).
const PAGE_W = 215.9
const PAGE_H = 279.4
const M = 15 // margin
const CONTENT_W = PAGE_W - 2 * M
const BOTTOM = PAGE_H - 18 // keep clear of the footer
const INK = [26, 26, 26]
const INK_2 = [85, 92, 102]
const BRAND = [31, 78, 121]
const RULE = [210, 214, 220]

const itemValue = itemTotal // value each × quantity

// The built-in PDF font only knows Western characters; swap the common
// "fancy" ones and replace anything else, so text never comes out garbled.
function safe(text) {
  if (text == null) return ''
  return String(text)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/›/g, '>')
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '?')
}

function longDate(d) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
function dateTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
function purchaseDate(d) {
  // Stored as "2024-05-17"; show as May 17, 2024 without time-zone shifts.
  if (!d) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ---------- Loading the data ----------

// Everything needed for one home's report, limited to the chosen rooms.
export async function loadReportData(homeId, roomIds) {
  const [homeRes, rooms] = await Promise.all([
    supabase.from('homes').select('id, name, address, photo_drive_file_id, photo_thumb_path').eq('id', homeId).single(),
    fetchAll(() => supabase.from('rooms').select('id, name, sort_order').eq('home_id', homeId)
      .order('sort_order').order('id')),
  ])
  if (homeRes.error) throw homeRes.error
  const chosen = rooms.filter((r) => roomIds.includes(r.id))
  const ids = chosen.map((r) => r.id)
  const [items, photos] = await Promise.all([
    fetchAll(() => supabase.from('items').select('*').in('room_id', ids).order('created_at').order('id')),
    fetchAll(() => supabase.from('photos')
      .select('id, room_id, item_id, kind, taken_at, drive_file_id, thumb_path, mime_type')
      .in('room_id', ids).order('taken_at').order('id')),
  ])
  return { home: homeRes.data, rooms: chosen, allRoomCount: rooms.length, items, photos }
}

// ---------- Photos ----------

function loadBitmap(blob) {
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

// Re-save a photo as a smaller JPEG for the email version.
async function shrink(blob, { side, quality }) {
  const bitmap = await loadBitmap(blob)
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  return { bytes: new Uint8Array(await out.arrayBuffer()), w, h }
}

// A PDF receipt is shown as a picture of its first page. (The small preview
// is already a picture, so it's left as is.)
async function asPicture(photo, blob, side) {
  if (photo.mime_type !== 'application/pdf' || blob.type === 'image/jpeg') return blob
  const { renderPdfPages } = await import('./pdfPages')
  const { pages } = await renderPdfPages(blob, { maxPages: 1, maxSide: side })
  return pages[0].blob
}

// The photo as JPEG bytes + its size. Falls back to the small preview if the
// full photo is no longer in Drive, and to null if neither is available.
async function preparePhoto(photo, level) {
  let blob = null
  try {
    blob = await downloadDriveFile(photo.drive_file_id)
  } catch (err) {
    if (err.notConnected) throw err
    console.warn('Drive download failed', err)
  }
  if (!blob && photo.thumb_path) {
    const urls = await getThumbUrls([photo.thumb_path])
    if (urls[photo.thumb_path]) {
      blob = await (await fetch(urls[photo.thumb_path])).blob()
    }
  }
  if (!blob) return null
  blob = await asPicture(photo, blob, level === 'high' ? 2400 : 1600)
  // High quality: full size, re-saved at high JPEG quality (re-saving makes
  // sure every photo is in a format the PDF handles reliably).
  return shrink(blob, level === 'high' ? { side: 4000, quality: 0.92 } : level)
}

// Starts preparing upcoming photos in the background (a few at a time) so
// the report builds faster, without holding every photo in memory at once.
function makePhotoLoader(order, level, onProgress) {
  const AHEAD = 3
  const started = new Map()
  let done = 0
  const start = (i) => {
    if (i >= order.length || started.has(i)) return
    started.set(i, preparePhoto(order[i], level).then((r) => {
      done += 1
      onProgress(done, order.length)
      return r
    }))
  }
  const indexOf = new Map(order.map((p, i) => [p.id, i]))
  return async (photo) => {
    const i = indexOf.get(photo.id)
    for (let k = i; k <= i + AHEAD; k++) start(k)
    const result = await started.get(i)
    started.delete(i) // free memory once used
    return result
  }
}

// For the email version: try a few photos and pick the largest size level
// that should keep the whole PDF under the email limit.
async function chooseEmailLevel(photos, onStatus) {
  const sample = photos.slice(0, Math.min(6, photos.length))
  if (!sample.length) return EMAIL_LEVELS[0]
  onStatus('Checking photo sizes…')
  const blobs = []
  for (const p of sample) {
    try {
      const b = await downloadDriveFile(p.drive_file_id)
      if (b) blobs.push(await asPicture(p, b, 1600))
    } catch (err) {
      if (err.notConnected) throw err
    }
  }
  if (!blobs.length) return EMAIL_LEVELS[EMAIL_LEVELS.length - 1]
  for (const level of EMAIL_LEVELS) {
    let total = 0
    for (const b of blobs) total += (await shrink(b, level)).bytes.length
    const estimate = (total / blobs.length) * photos.length
    if (estimate <= EMAIL_BUDGET_BYTES) return level
  }
  return EMAIL_LEVELS[EMAIL_LEVELS.length - 1]
}

// ---------- Building the PDF ----------

// quality: 'email' or 'high'. onStatus(text) reports progress for the screen.
export async function buildReportPdf({ home, rooms, allRoomCount, items, photos }, quality, onStatus) {
  const generatedAt = new Date()
  const itemsByRoom = {}
  for (const i of items) (itemsByRoom[i.room_id] ||= []).push(i)
  const photosByItem = {}
  const overviewsByRoom = {}
  for (const p of photos) {
    if (p.item_id) (photosByItem[p.item_id] ||= []).push(p)
    else (overviewsByRoom[p.room_id] ||= []).push(p)
  }

  // Every photo in the order it will appear in the report.
  const order = []
  for (const room of rooms) {
    order.push(...(overviewsByRoom[room.id] || []))
    for (const item of itemsByRoom[room.id] || []) {
      const ps = photosByItem[item.id] || []
      order.push(...mainPhotoFirst(item, ps.filter((p) => p.kind === 'item')), ...ps.filter((p) => p.kind === 'receipt'))
    }
  }

  const level = quality === 'high' ? 'high' : await chooseEmailLevel(order, onStatus)
  const getPhoto = makePhotoLoader(order, level, (n, total) =>
    onStatus(`Adding photos from Google Drive… ${n} of ${total}`))

  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true })
  doc.setProperties({ title: `Home Inventory - ${safe(home.name)}`, creator: 'Home Inventory app' })
  let y = M

  const setText = (size, style = 'normal', color = INK) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
  }
  const newPage = () => { doc.addPage(); y = M }
  const ensureSpace = (h) => { if (y + h > BOTTOM) newPage() }

  // Draw a photo fitted inside a box (keeps its shape). Returns the height used.
  const drawPhoto = (img, x, top, boxW, boxH) => {
    if (!img) {
      doc.setDrawColor(...RULE)
      doc.rect(x, top, boxW, Math.min(boxH, 30))
      setText(8, 'italic', INK_2)
      doc.text('Photo unavailable', x + 3, top + 6)
      return Math.min(boxH, 30)
    }
    const scale = Math.min(boxW / img.w, boxH / img.h)
    const w = img.w * scale
    const h = img.h * scale
    doc.addImage(img.bytes, 'JPEG', x, top, w, h, undefined, 'NONE')
    return h
  }

  // A row of photos (wraps onto more rows/pages as needed).
  const drawPhotoRow = async (list, boxW, boxH, label) => {
    if (!list.length) return
    const perRow = Math.max(1, Math.floor((CONTENT_W + 4) / (boxW + 4)))
    ensureSpace(6 + boxH)
    if (label) {
      setText(9, 'bold', INK_2)
      doc.text(label, M, y + 3.5)
      y += 6
    }
    for (let i = 0; i < list.length; i += perRow) {
      ensureSpace(boxH + 4)
      let rowH = 0
      const row = list.slice(i, i + perRow)
      for (let k = 0; k < row.length; k++) {
        const img = await getPhoto(row[k])
        rowH = Math.max(rowH, drawPhoto(img, M + k * (boxW + 4), y, boxW, boxH))
      }
      y += rowH + 4
    }
  }

  // ===== 1. Cover page =====
  onStatus('Creating cover page…')
  const total = items.reduce((s, i) => s + itemValue(i), 0)
  setText(11, 'bold', BRAND)
  doc.text('HOME INVENTORY REPORT', M, 40)
  setText(26, 'bold')
  const heading = doc.splitTextToSize(safe(home.address || home.name), CONTENT_W)
  doc.text(heading, M, 55)
  y = 55 + heading.length * 10
  if (home.address) {
    setText(14, 'normal', INK_2)
    doc.text(safe(home.name), M, y)
    y += 10
  }
  // Photo of the home, if one was added
  if (home.photo_drive_file_id) {
    onStatus('Adding the home photo…')
    const img = await preparePhoto(
      { drive_file_id: home.photo_drive_file_id, thumb_path: home.photo_thumb_path }, level,
    )
    if (img) y += drawPhoto(img, M, y, CONTENT_W, 95) + 8
  }
  doc.setDrawColor(...RULE)
  doc.line(M, y, PAGE_W - M, y)
  y += 14
  const coverRow = (label, value) => {
    setText(11, 'normal', INK_2)
    doc.text(label, M, y)
    setText(13, 'bold')
    doc.text(value, M + 70, y)
    y += 10
  }
  coverRow('Report generated', longDate(generatedAt))
  coverRow('Total estimated value', formatMoney(total))
  coverRow('Number of items', String(items.length))
  coverRow('Rooms included', rooms.length === allRoomCount ? `All rooms (${rooms.length})` : `${rooms.length} of ${allRoomCount}`)
  y += 6
  setText(9, 'normal', INK_2)
  const note = doc.splitTextToSize(
    'Estimated value is the replacement value for each item, or its purchase price when no ' +
    'replacement value was recorded. Each photo shows the date and time it was originally taken. ' +
    'Full-size photos and receipts are stored in the owner\'s Google Drive.',
    CONTENT_W,
  )
  doc.text(note, M, y)

  // ===== 2. Summary table =====
  newPage()
  setText(18, 'bold')
  doc.text('Summary by room', M, y + 6)
  y += 12
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: PAGE_H - BOTTOM },
    head: [['Room', 'Items', 'Estimated value']],
    body: rooms.map((r) => {
      const list = itemsByRoom[r.id] || []
      return [safe(r.name), String(list.length), formatMoney(list.reduce((s, i) => s + itemValue(i), 0))]
    }),
    foot: [['Grand total', String(items.length), formatMoney(total)]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 11, cellPadding: 3, textColor: INK, lineColor: RULE },
    headStyles: { fillColor: BRAND, textColor: 255 },
    footStyles: { fillColor: [232, 238, 245], textColor: INK, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right', cellWidth: 25 }, 2: { halign: 'right', cellWidth: 50 } },
  })

  // ===== 3. One section per room =====
  for (const room of rooms) {
    const list = itemsByRoom[room.id] || []
    const overviews = overviewsByRoom[room.id] || []
    newPage()
    setText(20, 'bold', BRAND)
    doc.text(safe(room.name), M, y + 7)
    y += 12
    setText(10, 'normal', INK_2)
    doc.text(
      `${list.length} item${list.length === 1 ? '' : 's'}  |  Estimated value ${formatMoney(list.reduce((s, i) => s + itemValue(i), 0))}`,
      M, y + 3,
    )
    y += 9

    // Room overview photos first, two per row.
    await drawPhotoRow(overviews, (CONTENT_W - 4) / 2, 68, overviews.length ? 'Room overview' : null)

    if (!list.length) {
      setText(10, 'italic', INK_2)
      doc.text('No items recorded in this room.', M, y + 4)
      y += 10
    }

    for (const item of list) {
      const ps = photosByItem[item.id] || []
      const itemPhotos = mainPhotoFirst(item, ps.filter((p) => p.kind === 'item')) // main photo shown large
      const receipts = ps.filter((p) => p.kind === 'receipt')

      // Details (label, value) shown to the right of the main photo.
      const details = [
        ['Category', item.category],
        ['Brand', item.brand],
        ['Model', item.model],
        ['Serial number', item.serial_number],
        ['Purchase date', purchaseDate(item.purchase_date)],
        ['Quantity', (item.quantity || 1) > 1 ? String(item.quantity) : ''],
        ['Purchase price', item.purchase_price != null ? formatMoney(item.purchase_price) + ((item.quantity || 1) > 1 ? ' each' : '') : ''],
        ['Replacement value', item.replacement_value != null ? formatMoney(item.replacement_value) + ((item.quantity || 1) > 1 ? ' each' : '') : ''],
        ['Total value', (item.quantity || 1) > 1 && itemValue(item) ? formatMoney(itemValue(item)) : ''],
        ['Photo taken', ps[0] ? dateTime((itemPhotos[0] || ps[0]).taken_at) : ''],
        ['Product link', item.product_url ? linkLabel(item.product_url) : ''],
      ].filter(([, v]) => v)

      const PHOTO_W = 64
      const PHOTO_MAX_H = 72
      const EXTRA = 36 // size of extra photo boxes
      const RECEIPT_W = 44
      const RECEIPT_H = 58
      const textX = M + PHOTO_W + 6
      const textW = CONTENT_W - PHOTO_W - 6
      const notesLines = item.notes ? doc.splitTextToSize(safe(item.notes), CONTENT_W).length : 0
      const rowsOf = (n, w) => Math.ceil(n / Math.max(1, Math.floor((CONTENT_W + 4) / (w + 4))))

      // Keep each item together on one page: if the whole item (worst case)
      // won't fit in the space left, start it on a new page.
      const itemH =
        16 + Math.max(itemPhotos.length ? PHOTO_MAX_H : 0, details.length * 6) +
        (notesLines ? 9 + notesLines * 4.5 : 0) +
        (itemPhotos.length > 1 ? 6 + rowsOf(itemPhotos.length - 1, EXTRA) * (EXTRA + 4) : 0) +
        (receipts.length ? 6 + rowsOf(receipts.length, RECEIPT_W) * (RECEIPT_H + 4) : 0)
      if (itemH <= BOTTOM - M) ensureSpace(itemH)
      else ensureSpace(16 + PHOTO_MAX_H)

      // Divider + item name
      doc.setDrawColor(...RULE)
      doc.line(M, y, PAGE_W - M, y)
      y += 7
      setText(14, 'bold')
      const title = doc.splitTextToSize(safe(item.name || 'Unnamed item'), CONTENT_W)
      doc.text(title, M, y)
      y += title.length * 6 + 2

      // Main photo on the left
      const top = y
      const mainImg = itemPhotos[0] ? await getPhoto(itemPhotos[0]) : null
      const photoH = itemPhotos[0] ? drawPhoto(mainImg, M, top, PHOTO_W, PHOTO_MAX_H) : 0

      // Details on the right
      let dy = top + 4
      for (const [label, value] of details) {
        setText(9, 'normal', INK_2)
        doc.text(label, textX, dy)
        if (label === 'Product link') {
          // Short, clickable link (the full address is behind it).
          setText(10, 'bold', BRAND)
          doc.textWithLink(`${safe(value)} (link)`, textX + 36, dy, { url: item.product_url })
          dy += 6
          continue
        }
        setText(10, 'bold')
        const lines = doc.splitTextToSize(safe(value), textW - 36)
        doc.text(lines, textX + 36, dy)
        dy += Math.max(6, lines.length * 4.5 + 1.5)
      }
      y = Math.max(top + photoH, dy) + 3

      // Notes, full width
      if (item.notes) {
        const lines = doc.splitTextToSize(safe(item.notes), CONTENT_W)
        ensureSpace(6 + lines.length * 4.5)
        setText(9, 'bold', INK_2)
        doc.text('Notes', M, y + 3)
        setText(10, 'normal')
        doc.text(lines, M, y + 8)
        y += 9 + lines.length * 4.5
      }

      // More photos of the same item, then its receipts
      await drawPhotoRow(itemPhotos.slice(1), EXTRA, EXTRA, 'More photos')
      await drawPhotoRow(receipts, RECEIPT_W, RECEIPT_H, receipts.length === 1 ? 'Receipt' : 'Receipts')
      y += 2
    }
  }

  // ===== Footer on every page =====
  const pages = doc.getNumberOfPages()
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n)
    setText(8, 'normal', INK_2)
    doc.text(`Generated on ${longDate(generatedAt)}  |  ${safe(home.name)}`, M, PAGE_H - 9)
    doc.text(`Page ${n} of ${pages}`, PAGE_W - M, PAGE_H - 9, { align: 'right' })
  }

  onStatus('Finishing…')
  const blob = doc.output('blob')
  const stamp = generatedAt.toISOString().slice(0, 10)
  const fileName = `Home Inventory - ${safe(home.name).replace(/[\\/:*?"<>|]+/g, '-')} - ${stamp}${quality === 'high' ? ' (high quality)' : ''}.pdf`
  return { blob, fileName, tooBigForEmail: blob.size > EMAIL_LIMIT_BYTES }
}
