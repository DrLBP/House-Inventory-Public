// Main screen. Decides what to show:
//   - a setup message if Supabase isn't connected yet
//   - the login screen if nobody is logged in
//   - the app itself once logged in
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import Login from './Login'
import { usePath } from './lib/router'
import HomesScreen from './screens/HomesScreen'
import HomeScreen from './screens/HomeScreen'
import SettingsScreen from './screens/SettingsScreen'
import CaptureScreen from './screens/CaptureScreen'
import RoomScreen from './screens/RoomScreen'
import RoomSuggestScreen from './screens/RoomSuggestScreen'
import ItemScreen from './screens/ItemScreen'
import DashboardScreen from './screens/DashboardScreen'
import SearchScreen from './screens/SearchScreen'
import ReportsScreen from './screens/ReportsScreen'
import ImportScreen from './screens/ImportScreen'
import { BottomNav } from './components'
import ConnectionWarning from './ConnectionWarning'
import { startQueue } from './lib/queue'
import { startBackups } from './lib/backup'

// The screen to show, plus the "database paused" warning on top when needed.
export default function App() {
  return (
    <>
      <ConnectionWarning />
      <Screens />
    </>
  )
}

function Screens() {
  // undefined = still checking, null = logged out, object = logged in
  const [session, setSession] = useState(undefined)
  const path = usePath()

  useEffect(() => {
    if (!isSupabaseConfigured) return
    // Check whether this device is already logged in...
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // ...and keep watching for log-ins and log-outs.
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Once logged in, resume uploading any photos still waiting on this phone,
  // and finish any spreadsheet backup that couldn't happen last time.
  useEffect(() => {
    if (session) {
      startQueue()
      startBackups()
    }
  }, [session])

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <h1>Setup needed</h1>
        <p>The app isn't connected to Supabase yet. Add the Supabase settings in Vercel.</p>
      </main>
    )
  }

  if (session === undefined) {
    return <main className="page"><p>Loading…</p></main>
  }

  if (!session) return <Login />

  // Logged in: pick the screen from the address (see lib/router.js).
  const settingsMatch = path.match(/^\/settings(?:\?(.*))?$/)
  if (settingsMatch) {
    const result = new URLSearchParams(settingsMatch[1] || '').get('google')
    return <SettingsScreen result={result} email={session.user.email} />
  }
  // #/capture/<room>  or  #/capture/<room>?item=<item>&kind=item|receipt
  const captureMatch = path.match(/^\/capture\/([\w-]+)(?:\?(.*))?$/)
  if (captureMatch) {
    const params = new URLSearchParams(captureMatch[2] || '')
    const kind = params.get('kind') === 'receipt' ? 'receipt' : 'item'
    return (
      <CaptureScreen
        key={path}
        roomId={captureMatch[1]}
        fixedItemId={params.get('item')}
        fixedKind={params.get('item') ? kind : null}
      />
    )
  }
  const suggestMatch = path.match(/^\/room\/([\w-]+)\/suggest$/)
  if (suggestMatch) return <RoomSuggestScreen key={suggestMatch[1]} roomId={suggestMatch[1]} />
  const roomMatch = path.match(/^\/room\/([\w-]+)$/)
  if (roomMatch) return <RoomScreen key={roomMatch[1]} roomId={roomMatch[1]} />
  const itemMatch = path.match(/^\/item\/([\w-]+)$/)
  if (itemMatch) return <ItemScreen key={itemMatch[1]} itemId={itemMatch[1]} />
  const homeMatch = path.match(/^\/home\/([\w-]+)$/)
  if (homeMatch) return <HomeScreen key={homeMatch[1]} homeId={homeMatch[1]} />
  if (path === '/search') return <><SearchScreen /><BottomNav current="/search" /></>
  if (path === '/import') return <ImportScreen />
  if (path === '/reports') return <><ReportsScreen /><BottomNav current="/reports" /></>
  if (path === '/dashboard') return <><DashboardScreen /><BottomNav current="/dashboard" /></>
  return <><HomesScreen /><BottomNav current="/" /></>
}
