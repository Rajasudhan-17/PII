import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FindingsDecisionsPage } from './pages/FindingsDecisionsPage';
import { HumanReviewPage } from './pages/HumanReviewPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { RiskVerificationPage } from './pages/RiskVerificationPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemHealthPage } from './pages/SystemHealthPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Application Routes inside AppLayout */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route
              path="/documents"
              element={
                <ProtectedRoute requiredPermission="DOCUMENT_READ">
                  <DocumentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/findings"
              element={
                <ProtectedRoute requiredPermission="DECISION_READ">
                  <FindingsDecisionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/human-review"
              element={
                <ProtectedRoute requiredPermission="REVIEW_READ">
                  <HumanReviewPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/policies"
              element={
                <ProtectedRoute requiredPermission="POLICY_READ">
                  <PoliciesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/verification"
              element={
                <ProtectedRoute requiredPermission="VERIFICATION_READ">
                  <RiskVerificationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit-logs"
              element={
                <ProtectedRoute requiredPermission="ANALYTICS_READ">
                  <AuditLogsPage />
                </ProtectedRoute>
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/system-health" element={<SystemHealthPage />} />
          </Route>

          {/* Custom 404 Catch-All */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
