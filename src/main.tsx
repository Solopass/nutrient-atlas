import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { reloadForNewVersion } from './lib/lazyPage'
import { ProfileProvider } from './state/profile'

// A preload of a file a newer deploy removed: reload once into the new version (see lib/lazyPage).
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ProfileProvider>
        <App />
      </ProfileProvider>
    </ErrorBoundary>
  </StrictMode>,
)
