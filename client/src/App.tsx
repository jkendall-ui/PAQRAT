import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { OfflineBanner } from './components/OfflineBanner';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DiagnosticPage } from './pages/DiagnosticPage';
import { DashboardPage } from './pages/DashboardPage';
import { StudyModePicker } from './pages/StudyModePicker';
import { SessionPage } from './pages/SessionPage';
import { SessionReviewPage } from './pages/SessionReviewPage';
import { LibraryPage } from './pages/LibraryPage';
import { CaseBrowserPage } from './pages/CaseBrowserPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { ProgressPage } from './pages/ProgressPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminQuestionsPage } from './pages/AdminQuestionsPage';
import { AdminImportPage } from './pages/AdminImportPage';
import { AdminMediaPage } from './pages/AdminMediaPage';

import { AuthCallbackPage } from './pages/AuthCallbackPage';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <OfflineBanner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/complete" element={<AuthCallbackPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/diagnostic" element={<DiagnosticPage />} />
                <Route path="/study" element={<StudyModePicker />} />
                <Route path="/study/session/:id" element={<SessionPage />} />
                <Route path="/study/session/:id/review" element={<SessionReviewPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/library/cases" element={<CaseBrowserPage />} />
                <Route path="/library/cases/:caseId" element={<CaseDetailPage />} />
                <Route path="/progress" element={<ProgressPage />} />

                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/questions" element={<AdminQuestionsPage />} />
                  <Route path="/admin/import" element={<AdminImportPage />} />
                  <Route path="/admin/media" element={<AdminMediaPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
