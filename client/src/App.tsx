import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth-store';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import Login from './pages/Login';
import Settings from './pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user, isLoading, restoreSession } = useAuthStore();

  useEffect(() => {
    if (token && !user) restoreSession();
  }, [token, user, restoreSession]);

  if (!token) return <Navigate to="/login" replace />;
  if (isLoading && !user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/game/:roomId?" element={<ProtectedRoute><Game /></ProtectedRoute>} />
    </Routes>
  );
}

export default App;
