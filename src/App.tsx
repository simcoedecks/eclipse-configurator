import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import Contractor from './pages/Contractor';
import ProposalPreview from './pages/ProposalPreview';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/configurator" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/contractor" element={<Contractor />} />
        <Route path="/proposal-preview" element={<ProposalPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
