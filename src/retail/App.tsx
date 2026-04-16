import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import ProposalPreview from './pages/ProposalPreview';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/configurator" element={<Home skipIntro />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/contractor" element={
          <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
            <div className="text-center p-8">
              <h2 className="text-xl font-bold mb-2">Contractor Portal Has Moved</h2>
              <p className="text-gray-600 mb-4">The contractor portal is now at a dedicated site.</p>
              <a href="https://pro.eclipsepergola.ca" className="text-[#C5A059] underline font-medium">Go to Eclipse Pro →</a>
            </div>
          </div>
        } />
        <Route path="/proposal-preview" element={<ProposalPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
