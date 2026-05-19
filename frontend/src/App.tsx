import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './Auth';
import JobsPage from './JobsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <JobsPage />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
