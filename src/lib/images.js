// Turning a camera frame or a gallery photo into:
//   - a "full" JPEG, about 2000 px on the long side (clear for an insurance
//     adjuster, roughly 0.3–0.8 MB), saved to Google Drive
//   - a tiny "thumb" JPEG, about 320 px (roughly 15–30 KB), saved to Supabase
import exifr from 'exifr'

const FULL_MAX = 2000
const FULL_QUALITY = 0.82
const THUMB_MAX = 320
const THUMB_QUALITY = 0.6

// Draw `source` (a video frame or image) scaled to fit within `maxSide`,
// and return it as a JPEG file (Blob).
function toJpeg(source, srcWidth, srcHeight, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(srcWidth, srcHeight))
  const width = Math.round(srcWidth * scale)
  const height = Math.round(srcHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width, height }) : reject(new Error('Could not process photo'))),
      'image/jpeg',
      quality,
    )
  })
}

async function makeBoth(source, width, height) {
  const full = await toJpeg(source, width, height, FULL_MAX, FULL_QUALITY)
  const thumb = await toJpeg(source, width, height, THUMB_MAX, THUMB_QUALITY)
  return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height }
}

// Photo from the live in-app camera. The date/time is "right now".
export async function processVideoFrame(video) {
  const result = await makeBoth(video, video.videoWidth, video.videoHeight)
  return { ...result, takenAt: new Date().toISOString() }
}

// Photo chosen from the phone's gallery. We read the ORIGINAL date it was
// taken from the photo's hidden information (EXIF) BEFORE shrinking it,
// because shrinking erases that information.
export async function processGalleryFile(file) {
  let takenAt = null
  try {
    const exif = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const date = exif?.DateTimeOriginal || exif?.CreateDate
    if (date instanceof Date && !isNaN(date)) takenAt = date.toISOString()
  } catch {
    // No readable EXIF; fall back below.
  }
  // Fallback: the file's own date (usually when it was saved on the phone).
  if (!takenAt) takenAt = new Date(file.lastModified || Date.now()).toISOString()

  let bitmap
  try {
    // "from-image" turns sideways photos the right way up.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`"${file.name}" isn't a photo format this phone can read (try a JPEG).`)
  }
  const result = await makeBoth(bitmap, bitmap.width, bitmap.height)
  bitmap.close()
  return { ...result, takenAt }
}

// A PDF receipt: the PDF itself is kept as the "full" file (it goes to Drive
// unchanged); a small picture of its first page becomes the preview.
export async function processPdfFile(file) {
  const { renderPdfPages, PDF } = await import('./pdfPages')
  let pages
  try {
    ({ pages } = await renderPdfPages(file, { maxPages: 1, maxSide: THUMB_MAX, quality: THUMB_QUALITY }))
  } catch (e) {
    console.warn('PDF preview failed:', e)
    throw new Error(`"${file.name}" couldn't be opened as a PDF.`)
  }
  return {
    full: file,
    thumb: pages[0].blob,
    width: pages[0].width,
    height: pages[0].height,
    takenAt: new Date(file.lastModified || Date.now()).toISOString(),
    mimeType: PDF,
  }
}
