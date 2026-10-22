import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App'
import { LocalStorageBackend } from './storage/backend'
import { ProgressRepository } from './storage/repository'
import { AppProviders } from './ui/store'

const repo = new ProgressRepository(new LocalStorageBackend())

repo.init().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppProviders repo={repo}>
        <App />
      </AppProviders>
    </StrictMode>,
  )
})
