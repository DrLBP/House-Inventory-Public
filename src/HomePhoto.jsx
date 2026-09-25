// The outside photo of a home: a small preview (or a house icon if there's
// none), and a button to choose/take one.
import { useRef } from 'react'
import { useThumbUrls, Thumb } from './photos'
import { House, ImagePlus } from './icons'

export function HomeThumb({ home, size = 56 }) {
  const urls = useThumbUrls(home.photo_thumb_path ? [{ thumb_path: home.photo_thumb_path }] : [])
  const url = urls[home.photo_thumb_path]
  if (url) return <Thumb url={url} size={size} />
  return (
    <div className="thumb placeholder home-placeholder" style={{ width: size, height: size }}>
      <House size={size * 0.45} strokeWidth={1.5} />
    </div>
  )
}

// Opens the phone's camera or gallery. Calls onPick(file).
export function PickPhotoButton({ onPick, label = 'Add a photo of the home', disabled }) {
  const input = useRef(null)
  return (
    <>
      <button type="button" className="secondary icon-button" disabled={disabled}
        onClick={() => input.current.click()}>
        <ImagePlus size={20} strokeWidth={1.75} /> {label}
      </button>
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => {
          const file = e.target.files[0]
          e.target.value = ''
          if (file) onPick(file)
        }} />
    </>
  )
}
