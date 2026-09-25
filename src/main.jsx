// Starting point of the app: puts the <App /> screen on the page.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Keep the installed app up to date: check for a new version whenever the
// app is opened or brought back to the screen (and hourly while open).
// When one is found, the app reloads itself onto it. Photos waiting to
// upload are stored safely on the phone, so a reload never loses them.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => {})
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
