import { useState } from 'react';
import api, { setToken, clearToken } from './api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));
  const [email, setEmail] = useState('test@example.com');
  const [error, setError] = useState('');

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/test-token', { email });
      setToken(res.data.token);
      setIsAuthenticated(true);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Run backend init script?');
    }
  };

  const logout = () => {
    clearToken();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 font-mono">
        <div className="bg-white p-8 rounded border border-slate-200 w-full max-w-sm">
          <h1 className="text-xl font-bold mb-6">Test Login</h1>
          {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-slate-300 p-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <button type="submit" className="w-full bg-slate-900 text-white p-2 rounded hover:bg-slate-800">
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-mono text-sm flex flex-col">
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center">
        <h1 className="font-bold text-lg">Jobs & Tasks</h1>
        <button onClick={logout} className="text-slate-300 hover:text-white px-3 py-1 border border-slate-700 rounded">
          Logout
        </button>
      </header>
      <main className="flex-1 flex overflow-hidden bg-yellow-100">
        {children}
      </main>
    </div>
  );
}
