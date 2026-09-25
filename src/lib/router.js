// A tiny "router": decides which screen to show based on the part of the
// web address after the # sign, e.g.  #/home/1234  -> the rooms of home 1234.
// Using the address means the phone's Back button works as expected.
import { useEffect, useState } from 'react'

function currentPath() {
  return window.location.hash.replace(/^#/, '') || '/'
}

// Returns the current path and re-renders the screen whenever it changes.
export function usePath() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

// Go to another screen, e.g. navigate('/home/1234').
export function navigate(path) {
  window.location.hash = path
}
