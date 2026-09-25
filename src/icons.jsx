// Icons. Simple line icons come from the "lucide-react" library (the same
// minimalist style Sortly uses). The camera is our own, drawn to match the
// camera in the app's logo.
export { House, Search, LayoutGrid, FileText, Settings, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react'

// The logo's camera: a rounded body with a bump on top and a round lens.
// Uses the current text color, so it can be white on blue or blue on white.
export function LogoCamera({ size = 22, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect x="9" y="4" width="6" height="3" rx="1" fill="currentColor" />
      <rect x="2" y="6" width="20" height="15" rx="3" fill="currentColor" />
      <circle cx="12" cy="13.5" r="4.2" fill="var(--camera-lens, #1f4e79)" />
    </svg>
  )
}
