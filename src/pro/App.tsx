import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AuthGuard from './components/AuthGuard';
import ProLayout from './components/ProLayout';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              {(contractor) => (
                <ProLayout contractor={contractor}>
                  <Routes>
                    <Route path="/" element={<Dashboard contractor={contractor} />} />
                    <Route path="/quotes" element={<Dashboard contractor={contractor} />} />
                    <Route path="/account" element={<Dashboard contractor={contractor} />} />
                    <Route path="/quote/new" element={<Dashboard contractor={contractor} />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </ProLayout>
              )}
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
