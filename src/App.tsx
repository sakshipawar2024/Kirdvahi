import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import { SchoolProvider } from './contexts/SchoolContext';
import { AuthProvider } from './contexts/AuthContext';
import SchoolRouteGuard from './components/SchoolRouteGuard';
import TableOfContents from './components/TableOfContents';
import EntryPage from './components/EntryPage';
import LedgerPage from './components/LedgerPage';
import AccountSummaryPage from './components/AccountSummaryPage';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';
import Footer from './components/Footer';

function App() {
  return (
    <SchoolProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-amber-50">
            <Routes>
              <Route element={<SchoolRouteGuard><Outlet /></SchoolRouteGuard>}>
                <Route path="/" element={<Navigate to="/admin" replace />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/entry"
                  element={
                    <ProtectedRoute>
                      <EntryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/accounts"
                  element={
                    <ProtectedRoute>
                      <TableOfContents />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/account-summary"
                  element={
                    <ProtectedRoute>
                      <AccountSummaryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/ledger/:id"
                  element={
                    <ProtectedRoute>
                      <LedgerPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Route>
            </Routes>
            <Footer />
          </div>
        </Router>
      </AuthProvider>
    </SchoolProvider>
  );
}

export default App;