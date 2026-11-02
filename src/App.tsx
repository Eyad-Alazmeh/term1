import { Routes, Route } from 'react-router'
import Kiosk from './pages/Kiosk'
import Admin from './pages/Admin'
import Display from './pages/Display'
import Scan from './pages/Scan'
import Cards from './pages/Cards'
import Leave from './pages/Leave'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Kiosk />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/display" element={<Display />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/cards" element={<Cards />} />
      <Route path="/leave" element={<Leave />} />
    </Routes>
  )
}
