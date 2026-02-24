import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';
import { useTranslation } from '../i18n';
import { LanguageSwitch } from '../components/controls/LanguageSwitch';

export default function Login() {
  const t = useTranslation();
  const navigate = useNavigate();
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = isRegister
      ? await register(username, password)
      : await login(username, password);
    if (success) navigate('/');
  };

  const toggleMode = () => {
    setIsRegister(!isRegister);
    clearError();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitch />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-1">🃏 TexasAgent</h1>
          <p className="text-gray-400">{t('app.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800/80 rounded-xl p-6 border border-gray-700 space-y-4">
          <h2 className="text-xl font-semibold text-white text-center">
            {isRegister ? t('auth.register') : t('auth.login')}
          </h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 text-red-300 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1">{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
              minLength={2}
              maxLength={20}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
              minLength={4}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {isLoading ? '...' : isRegister ? t('auth.register') : t('auth.login')}
          </button>

          <p className="text-center text-sm text-gray-400">
            {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
            <button type="button" onClick={toggleMode} className="text-blue-400 hover:underline">
              {isRegister ? t('auth.login') : t('auth.register')}
            </button>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
