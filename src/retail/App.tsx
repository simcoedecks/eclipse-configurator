import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Admin from './pages/Admin';
import AdminConfigurator from './pages/AdminConfigurator';
import ProposalPreview from './pages/ProposalPreview';
import Scan from './pages/Scan';
import Proposal from './pages/Proposal';
import DealerLanding from './pages/DealerLanding';
import Pro from './pages/Pro';
import ProQuote from './pages/ProQuote';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/configurator" element={<ConfiguratorRoute />} />
        <Route path="/scan/:sessionId" element={<Scan />} />
        <Route path="/proposal/:id" element={<Proposal />} />
        <Route path="/dealer/:slug" element={<DealerLanding />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/configurator" element={<AdminConfigurator />} />
        <Route path="/pro" element={<Pro />} />
        <Route path="/pro/quote" element={<ProQuote />} />
        <Route path="/contractor" element={<Navigate to="/pro" replace />} />
        <Route path="/proposal-preview" element={<ProposalPreview />} />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * /configurator entry — reads optional ?editId=&editToken=&editRole=
 * params produced by the dealer/customer edit-link emails and forwards
 * them to Home as props. Token verification happens inside Home when
 * it loads the submission doc.
 */
function ConfiguratorRoute() {
  const params = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const editId = params.get('editId') || undefined;
  const role = params.get('editRole');
  const editRole = role === 'dealer' || role === 'client' ? role : undefined;
  return <Home skipIntro editSubmissionId={editId} editRole={editRole} />;
}
