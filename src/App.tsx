import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { AtelierPage } from './features/atelier/AtelierPage'
import { LoginScreen } from './features/auth/LoginScreen'
import { SetupScreen } from './features/auth/SetupScreen'
import { BibliothequePage } from './features/bibliotheque/BibliothequePage'
import { ComptePage } from './features/compte/ComptePage'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { MorceauxProvider } from './hooks/useMorceaux'

function AppRoutes() {
  const { user, loading, needsSetup } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Chargement…
      </div>
    )
  }

  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<SetupScreen />} />
      </Routes>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginScreen />} />
      </Routes>
    )
  }

  return (
    <MorceauxProvider>
      <NavBar />
      {/* L'atelier a besoin de toute la largeur qu'on veut bien lui donner : une partition
          se lit en long, et la rogner reviendrait à en cacher des mesures. Les autres écrans
          restent dans une colonne lisible. */}
      <main className="mx-auto max-w-6xl px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-8">
        <Routes>
          <Route path="/bibliotheque" element={<BibliothequePage />} />
          <Route path="/atelier/:id" element={<AtelierPage />} />
          <Route path="/compte" element={<ComptePage />} />
          <Route path="*" element={<Navigate to="/bibliotheque" replace />} />
        </Routes>
      </main>
    </MorceauxProvider>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  )
}

export default App
