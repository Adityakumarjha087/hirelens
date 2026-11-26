import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout, RequireAuth } from '@/components/layout';
import { Skeleton } from '@/components/ui/misc';
import { ApiError } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { LoginPage, RegisterPage } from '@/pages/auth/AuthPages';
import { Landing } from '@/pages/Landing';

const lazyNamed = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(async () => ({ default: (await loader())[name] }));

const ResumesPage = lazyNamed(() => import('@/pages/candidate/ResumesPage'), 'ResumesPage');
const JobsPage = lazyNamed(() => import('@/pages/candidate/JobsPage'), 'JobsPage');
const JobDetailPage = lazyNamed(() => import('@/pages/candidate/JobsPage'), 'JobDetailPage');
const MyApplicationsPage = lazyNamed(() => import('@/pages/candidate/JobsPage'), 'MyApplicationsPage');
const FeedbackPage = lazyNamed(() => import('@/pages/candidate/FeedbackPage'), 'FeedbackPage');
const DashboardPage = lazyNamed(() => import('@/pages/recruiter/DashboardPage'), 'DashboardPage');
const JobsListPage = lazyNamed(() => import('@/pages/recruiter/JobsListPage'), 'JobsListPage');
const JobFormPage = lazyNamed(() => import('@/pages/recruiter/JobFormPage'), 'JobFormPage');
const CandidatesPage = lazyNamed(() => import('@/pages/recruiter/CandidatesPage'), 'CandidatesPage');
const PipelinePage = lazyNamed(() => import('@/pages/recruiter/PipelinePage'), 'PipelinePage');
const ApplicationDetailPage = lazyNamed(() => import('@/pages/recruiter/ApplicationDetailPage'), 'ApplicationDetailPage');
const AdminUsersPage = lazyNamed(() => import('@/pages/admin/AdminUsersPage'), 'AdminUsersPage');

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster richColors theme={theme} position="top-right" closeButton />;
}

const Fallback = () => (
  <div className="space-y-4" aria-busy="true">
    <Skeleton className="h-8 w-1/3" />
    <Skeleton className="h-64" />
  </div>
);

export function AppRoutes() {
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/candidate" element={<RequireAuth roles={['CANDIDATE']}><ResumesPage /></RequireAuth>} />
          <Route path="/candidate/applications" element={<RequireAuth roles={['CANDIDATE']}><MyApplicationsPage /></RequireAuth>} />
          <Route path="/candidate/feedback" element={<RequireAuth roles={['CANDIDATE']}><FeedbackPage /></RequireAuth>} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/recruiter" element={<RequireAuth roles={['RECRUITER']}><DashboardPage /></RequireAuth>} />
          <Route path="/recruiter/jobs" element={<RequireAuth roles={['RECRUITER']}><JobsListPage /></RequireAuth>} />
          <Route path="/recruiter/jobs/new" element={<RequireAuth roles={['RECRUITER']}><JobFormPage /></RequireAuth>} />
          <Route path="/recruiter/jobs/:id" element={<RequireAuth roles={['RECRUITER']}><CandidatesPage /></RequireAuth>} />
          <Route path="/recruiter/jobs/:id/edit" element={<RequireAuth roles={['RECRUITER']}><JobFormPage /></RequireAuth>} />
          <Route path="/recruiter/jobs/:id/pipeline" element={<RequireAuth roles={['RECRUITER']}><PipelinePage /></RequireAuth>} />
          <Route path="/recruiter/applications/:id" element={<RequireAuth roles={['RECRUITER']}><ApplicationDetailPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth roles={['ADMIN']}><AdminUsersPage /></RequireAuth>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <ThemedToaster />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
