import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from './components/error-boundary';
import { Toaster } from './components/ui/toaster';

// Auth pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

// Main pages
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProjectListPage } from './pages/projects/ProjectListPage';
import { ProjectDetailPage } from './pages/projects/ProjectDetailPage';
import { ProjectCreatePage } from './pages/projects/ProjectCreatePage';

// Components
import { AuthGuard } from './components/AuthGuard';
import { AppLayout } from './components/layout/AppLayout';

// Placeholder pages for routes not yet implemented
import { NotFoundPage } from './pages/NotFoundPage';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectListPage />} />
            <Route path="projects/new" element={<ProjectCreatePage />} />
            <Route path="projects/:projectId" element={<ProjectDetailPage />} />
            <Route path="projects/:projectId/*" element={<ProjectDetailPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ErrorBoundary>
  );
}

export default App;
