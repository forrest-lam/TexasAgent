import { config as dotenvConfig } from 'dotenv';
import { resolve as pathResolve } from 'path';
dotenvConfig({ path: pathResolve(process.cwd(), '.env') });

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerToClientEvents, ClientToServerEvents, AuthResponse } from '@texas-agent/shared';
import { setupSocketHandlers } from './socket-handler';
import { signToken, authMiddleware, socketAuthMiddleware } from './auth';
import { createUser, authenticateUser, getUserById, updateUserLLMConfig, setUserChips, getAllUsers } from './user-store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : null; // null = use permissive callback below in dev mode

/**
 * In dev mode with no explicit ALLOWED_ORIGINS, accept any origin so that
 * LAN-IP access (e.g. http://192.168.x.x:5173) works out of the box.
 */
const corsOrigin: cors.CorsOptions['origin'] = IS_PROD
  ? '*'
  : ALLOWED_ORIGINS
    ? ALLOWED_ORIGINS
    : (_origin, callback) => callback(null, true);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket authentication
io.use(socketAuthMiddleware);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});
// Leaderboard
app.get('/api/leaderboard', (_req, res) => {
  const allUsers = getAllUsers();
  const leaderboard = allUsers
    .sort((a, b) => b.chips - a.chips)
    .slice(0, 20)
    .map(u => ({
      username: u.username,
      chips: u.chips,
      gamesWon: u.stats.gamesWon,
      gamesPlayed: u.stats.gamesPlayed,
      isLLMBot: u.isLLMBot ?? false,
      isRuleBot: u.isRuleBot ?? false,
    }));
  res.json({ leaderboard });
});


// --- Auth routes ---

function toAuthUser(user: any): AuthResponse['user'] {
  return {
    id: user.id,
    username: user.username,
    chips: user.chips,
    stats: user.stats,
    createdAt: user.createdAt,
    llmConfig: user.llmConfig
      ? { apiBaseUrl: user.llmConfig.apiBaseUrl, model: user.llmConfig.model, hasApiKey: !!user.llmConfig.apiKey }
      : undefined,
  };
}

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  if (username.length < 2 || username.length > 20) {
    res.status(400).json({ error: 'Username must be 2-20 characters' });
    return;
  }
  if (password.length < 4) {
    res.status(400).json({ error: 'Password must be at least 4 characters' });
    return;
  }

  const user = createUser(username, password);
  if (!user) {
    res.status(409).json({ error: 'Username already exists' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: toAuthUser(user) } as AuthResponse);
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const user = authenticateUser(username, password);
  if (!user) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: toAuthUser(user) } as AuthResponse);
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getUserById((req as any).userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: toAuthUser(user) });
});

// --- User settings routes ---

app.put('/api/user/llm-config', authMiddleware, (req, res) => {
  const { apiKey, apiBaseUrl, model } = req.body;
  const success = updateUserLLMConfig((req as any).userId, {
    apiKey: apiKey || '',
    apiBaseUrl: apiBaseUrl || 'https://api.openai.com/v1',
    model: model || 'gpt-4o-mini',
  });
  if (!success) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/user/llm-config', authMiddleware, (req, res) => {
  const user = getUserById((req as any).userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  // Return config but mask the API key
  const config = user.llmConfig;
  res.json({
    apiKey: config?.apiKey ? `${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)}` : '',
    apiBaseUrl: config?.apiBaseUrl || '',
    model: config?.model || '',
    hasApiKey: !!config?.apiKey,
  });
});

// Return full (unmasked) API key for client-side LLM advisor usage
app.get('/api/user/llm-config/full', authMiddleware, (req, res) => {
  const user = getUserById((req as any).userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const config = user.llmConfig;
  res.json({
    apiKey: config?.apiKey || '',
    apiBaseUrl: config?.apiBaseUrl || '',
    model: config?.model || '',
  });
});

// --- LLM proxy route (avoids CORS issues with direct browser→OpenAI calls) ---
app.post('/api/llm/chat', authMiddleware, async (req, res) => {
  const user = getUserById((req as any).userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Resolve API key: user's own key → server shared key (random MiniMax/deepseek)
  const userConfig = user.llmConfig;
  const hasOwnKey = !!(userConfig?.apiKey);
  let apiKey: string;
  let apiBaseUrl: string;
  let model: string;

  if (hasOwnKey) {
    // User has their own key — use their config
    apiKey = userConfig!.apiKey!;
    apiBaseUrl = (userConfig!.apiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    model = userConfig!.model || 'gpt-4o-mini';
  } else {
    // No personal key — use server shared key with random MiniMax-M1-M2.5 / deepseek-v3 assignment
    apiKey = process.env.LLM_API_KEY || '';
    // Randomly pick MiniMax or deepseek
    const usesMiniMax = Math.random() < 0.5;
    if (usesMiniMax) {
      apiBaseUrl = (process.env.LLM_API_BASE_URL_MINIMAX || 'https://api.minimaxi.chat/v1').replace(/\/$/, '');
      model = process.env.LLM_MODEL_MINIMAX || 'MiniMax-M1';
    } else {
      apiBaseUrl = (process.env.LLM_API_BASE_URL_DEEPSEEK || 'https://api.deepseek.com/v1').replace(/\/$/, '');
      model = process.env.LLM_MODEL_DEEPSEEK || 'deepseek-chat';
    }
  }

  if (!apiKey) {
    res.status(400).json({ error: 'No API key configured. Please set your LLM API key in Settings.' });
    return;
  }

  const { messages, max_tokens, temperature } = req.body;
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'Invalid request: messages array required' });
    return;
  }

  const startTime = Date.now();
  console.log(`[LLM Proxy] Request from user=${user.username} model=${model} baseUrl=${apiBaseUrl} messages=${messages.length} max_tokens=${max_tokens || 800}`);

  try {
    const response = await fetch(`${apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: max_tokens || 800,
        temperature: temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.log(`[LLM Proxy] Failed status=${response.status} elapsed=${Date.now() - startTime}ms error=${errText.slice(0, 200)}`);
      res.status(response.status).json({ error: `LLM API error ${response.status}: ${errText}` });
      return;
    }

    const data = await response.json() as any;
    const usage = (data as any).usage ? `prompt=${data.usage.prompt_tokens} completion=${data.usage.completion_tokens} total=${data.usage.total_tokens}` : 'no usage info';
    console.log(`[LLM Proxy] Success elapsed=${Date.now() - startTime}ms ${usage}`);
    res.json(data);
  } catch (err: any) {
    console.error(`[LLM Proxy] Error elapsed=${Date.now() - startTime}ms:`, err.message);
    res.status(502).json({ error: `Failed to reach LLM API: ${err.message}` });
  }
});

// Update chips (for single player mode settlement)
app.put('/api/user/chips', authMiddleware, (req, res) => {
  const { chips } = req.body;
  if (typeof chips !== 'number' || chips < 0) {
    res.status(400).json({ error: 'Invalid chips value' });
    return;
  }
  const success = setUserChips((req as any).userId, chips);
  if (!success) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ ok: true, chips });
});

// Production: serve client static files
if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback — only for non-API routes
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

setupSocketHandlers(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
});
