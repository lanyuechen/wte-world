import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { CollabProvider } from './context/CollabContext'
import { Layout } from './components/Layout'
import { ShareBootstrap } from './components/ShareBootstrap'
import { TokenGate } from './components/TokenGate'
import { RecipeFormPage } from './pages/RecipeForm'
import { OrderPage } from './pages/OrderPage'
import { OrdersPage } from './pages/Orders'
import { OrderDetailPage } from './pages/OrderDetail'
import { SettingsPage } from './pages/Settings'

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <ShareBootstrap />
        <TokenGate>
          <CollabProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<OrderPage />} />
                <Route path="order" element={<Navigate to="/" replace />} />
                <Route path="room/*" element={<Navigate to="/" replace />} />
                <Route path="recipes" element={<Navigate to="/" replace />} />
                <Route path="recipes/new" element={<RecipeFormPage />} />
                <Route path="recipes/:id/edit" element={<RecipeFormPage />} />
                <Route path="recipes/:id" element={<Navigate to="/" replace />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:id" element={<OrderDetailPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </CollabProvider>
        </TokenGate>
      </HashRouter>
    </AppProvider>
  )
}
