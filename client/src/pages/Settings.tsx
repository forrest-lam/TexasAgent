import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Check } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { useTranslation } from '../i18n';

const API_BASE = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

export default function Settings() {
  const t = useTranslation();
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    // Load current config
    fetch(`${API_BASE}/api/user/llm-config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.apiBaseUrl) setApiBaseUrl(data.apiBaseUrl);
        if (data.model) setModel(data.model);
        // apiKey is masked, we show placeholder
        if (data.hasApiKey) setApiKey(''); // leave empty, placeholder shows it's set
      })
      .catch(() => {});
  }, [token, navigate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = { apiBaseUrl, model };
      if (apiKey) body.apiKey = apiKey; // only send if user typed a new key
      await fetch(`${API_BASE}/api/user/llm-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft size={18} />
          {t('game.lobby')}
        </button>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-white mb-6">{t('settings.title')}</h1>

          {/* User info */}
          <div className="bg-gray-800/80 rounded-xl p-5 border border-gray-700 mb-4">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-white font-medium">{user?.username}</div>
                <div className="text-sm text-gray-400">
                  {t('settings.chips')}: <span className="text-yellow-400 font-medium">{user?.chips?.toLocaleString()}</span>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {t('game.round')}: {user?.stats?.gamesPlayed || 0}
              </div>
            </div>
          </div>

          {/* LLM Config */}
          <div className="bg-gray-800/80 rounded-xl p-5 border border-gray-700 space-y-4">
            <h2 className="text-lg font-semibold text-white">{t('settings.llmConfig')}</h2>

            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('settings.apiKey')}</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={user?.llmConfig?.hasApiKey ? '••••••••(already set)' : 'sk-...'}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('settings.apiBaseUrl')}</label>
              <input
                type="text"
                value={apiBaseUrl}
                onChange={e => setApiBaseUrl(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">{t('settings.model')}</label>
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
              {saved ? t('settings.saved') : t('settings.save')}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
