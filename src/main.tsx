import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ApparenceProvider } from './lib/apparence'
import { LangueProvider } from './lib/langue'

/* La langue enveloppe tout, y compris l'écran de connexion : c'est le premier qu'on voit, et
   il serait étrange qu'il soit le seul à rester en français. */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApparenceProvider>
      <LangueProvider>
        <App />
      </LangueProvider>
    </ApparenceProvider>
  </StrictMode>,
)
