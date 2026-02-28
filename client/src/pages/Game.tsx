import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useLobbyStore } from '../stores/lobby-store';
import { DEFAULT_ROOM_CONFIG, RoomConfig } from '@texas-agent/shared';
import { LocalGameEngine, LocalGameOptions } from '../services/local-game';
import { getSocket, connectSocket, reconnectWithToken } from '../services/socket-service';
import PokerTable from '../components/table/PokerTable';
import ActionPanel from '../components/controls/ActionPanel';
import GameLog from '../components/table/GameLog';
import { LanguageSwitch } from '../components/controls/LanguageSwitch';
import SoundToggle from '../components/controls/SoundToggle';
import LLMAdvisor from '../components/controls/LLMAdvisor';
import ChatPanel from '../components/table/ChatPanel';
import { ArrowLeft, RotateCcw, Armchair, LogOut, Eye } from 'lucide-react';
import { useI18n } from '../i18n';
import { playSound, startBGM, stopBGM, isBGMEnabled } from '../services/sound-service';
import { recordAction, recordHandResult, setCurrentRound } from '../services/player-memory';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/auth-store';

export default function Game() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const isLocal = roomId === 'local';
  const localEngine = useRef<LocalGameEngine | null>(null);
  const { gameState, isMyTurn, myPlayerId, gameLog, setGameState, setMyPlayerId, sendAction, addLog, addHandAction, clearGame, initGameListeners } = useGameStore();
  const [started, setStarted] = useState(false);
  const { t } = useI18n();
  const prevPhaseRef = useRef<string | null>(null);
  const prevRoundRef = useRef<number | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const { token, user } = useAuthStore();
  const isGuest = !token;

  // Track player actions for memory
  const prevLastActionRef = useRef<string | null>(null);

  // Play sounds on phase change & turn notification
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;
    if (prevPhaseRef.current && prevPhaseRef.current !== phase) {
      if (phase === 'showdown') {
        // win sound is played from log callback
      } else if (phase !== 'preflop') {
        playSound('deal');
      }
    }
    prevPhaseRef.current = phase;

    // Turn notification
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer?.id === myPlayerId && phase !== 'showdown') {
      playSound('turn');
    }

    // Track current round for memory
    setCurrentRound(gameState.round);

    // Reset hand actions on new round (for local mode; multiplayer resets via game:started)
    if (isLocal && prevRoundRef.current !== null && prevRoundRef.current !== gameState.round && phase !== 'showdown') {
      useGameStore.setState({ handActions: [] });
    }

    // Record actions to player memory (with phase info) — record ALL players for LLM profiling
    if (gameState.lastAction) {
      const actionKey = `${gameState.lastAction.playerId}-${gameState.lastAction.action.type}-${gameState.lastAction.action.amount || 0}`;
      if (actionKey !== prevLastActionRef.current) {
        prevLastActionRef.current = actionKey;
        const player = gameState.players.find(p => p.id === gameState.lastAction!.playerId);
        if (player) {
          recordAction(
            player.id,
            player.name,
            gameState.lastAction.action.type,
            gameState.lastAction.action.amount,
            gameState.pot,
            gameState.phase,
          );
          // Record structured action for LLM advisor (local mode; multiplayer does this in game-store)
          if (isLocal) {
            addHandAction({
              playerName: player.name,
              action: gameState.lastAction.action.type,
              amount: gameState.lastAction.action.amount,
              phase: gameState.phase,
            });
          }
        }
      }
    }

    // Record hand results + settle chips for local mode — track ALL players for LLM profiling
    if (phase === 'showdown' && gameState.winners && prevRoundRef.current !== gameState.round) {
      prevRoundRef.current = gameState.round;
      const winnerIds = new Set(gameState.winners.map(w => w.playerId));
      for (const p of gameState.players) {
        if (p.isActive) {
          recordHandResult(p.id, p.name, winnerIds.has(p.id));
        }
      }

      // Settle chips in local (single player) mode
      if (isLocal) {
        const human = gameState.players.find(p => p.id === 'human');
        if (human) {
          const { user, token, updateUser } = useAuthStore.getState();
          if (user && token) {
            // Update user chips to match current in-game chips
            const API_BASE = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
            const newChips = human.chips;
            fetch(`${API_BASE}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(r => r.json()).then(data => {
              if (data.user) updateUser({ ...data.user, chips: newChips });
            }).catch(() => {});
            // Tell server the new chip count
            fetch(`${API_BASE}/api/user/chips`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ chips: newChips }),
            }).catch(() => {});
          }
        }
      }
    }
  }, [gameState?.phase, gameState?.currentPlayerIndex, gameState?.lastAction, gameState?.winners]);

  useEffect(() => {
    let cleanupGameListeners: (() => void) | undefined;

    // Start BGM when entering the game page — different scene for single/multiplayer
    if (isBGMEnabled()) {
      startBGM(isLocal ? 'singlePlayer' : 'multiplayer');
    }

    if (isLocal) {
      setMyPlayerId('human');
      startLocalGame();
    } else {
      // Connect socket — with token if logged in, without for guest spectating
      const socket = connectSocket(token || undefined);
      setMyPlayerId(socket.id || '');

      // Ensure lobby-store listeners are set up (needed for spectator state)
      useLobbyStore.getState().connect();

      cleanupGameListeners = initGameListeners();

      // Auto-spectate the room if entering via direct link
      const handleConnect = () => {
        setMyPlayerId(socket.id || '');
        if (roomId && roomId !== 'local') {
          // Check if we're already in a room via lobby-store
          const lobbyRoom = useLobbyStore.getState().currentRoom;
          if (!lobbyRoom) {
            // Direct link entry — spectate the room
            socket.emit('room:spectate', roomId);
          } else {
            // Already in the room (came from lobby)
            socket.emit('game:resync');
          }
        }
      };

      if (socket.connected) {
        handleConnect();
      }
      socket.on('connect', handleConnect);

      // If kicked from room (e.g. timeout), navigate back
      socket.on('room:left', () => {
        clearGame();
        navigate(isGuest ? '/login' : '/');
      });
    }

    return () => {
      stopBGM();
      localEngine.current?.cleanup();
      cleanupGameListeners?.();
      const socket = getSocket();
      socket.off('room:left');
      socket.off('connect');
      clearGame();
    };
  }, [roomId, token]);

  const startLocalGame = () => {
    const { user: authUser, token: authToken } = useAuthStore.getState();
    const userChips = authUser?.chips ?? 2000;
    const config: RoomConfig = { ...DEFAULT_ROOM_CONFIG, aiCount: 5 };
    const API_BASE = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
    const options: LocalGameOptions = {
      serverUrl: API_BASE,
      authToken: authToken || undefined,
      maxLLMBots: 2,
      maxRuleBots: 2,
    };
    localEngine.current = new LocalGameEngine(
      config,
      (state) => setGameState(state),
      (msg) => addLog(msg),
      userChips,
      options,
    );
    localEngine.current.start();
    setStarted(true);
  };

  const handleAction = (action: any) => {
    // Play action sound
    const soundMap: Record<string, any> = {
      fold: 'fold', check: 'check', call: 'call', raise: 'raise', 'all-in': 'allIn',
    };
    playSound(soundMap[action.type] || 'chip');

    if (isLocal) {
      localEngine.current?.handleAction(action);
    } else {
      sendAction(action);
    }
  };

  const handleRestart = () => {
    if (isLocal && localEngine.current) {
      localEngine.current.restart();
      playSound('notify');
    }
  };

  const handleBack = () => {
    if (isLocal) {
      localEngine.current?.cleanup();
    } else {
      // Leave the multiplayer room so we don't get stuck
      useLobbyStore.getState().leaveRoom();
    }
    clearGame();
    navigate(isGuest ? '/login' : '/');
  };

  // Check if game is over
  const humanPlayer = gameState?.players.find(p => p.id === myPlayerId);
  const aliveCount = gameState?.players.filter(p => p.chips > 0).length ?? 0;
  const humanBusted = gameState?.phase === 'showdown' && humanPlayer && humanPlayer.chips <= 0;
  const humanWonAll = gameState?.phase === 'showdown' && aliveCount < 2 && humanPlayer && humanPlayer.chips > 0;
  const needsRestart = humanBusted || humanWonAll;

  // Spectator mode: player is watching but not in the game
  const { isSpectating, isSeated, isStandingUp, sitDown, standUp, currentRoom } = useLobbyStore();
  const isSpectator = !isLocal && (isSpectating || (gameState && !gameState.players.find(p => p.id === myPlayerId)));
  const spectators = currentRoom?.spectators ?? [];

  return (
    <div className="h-screen w-full bg-casino-bg overflow-hidden relative">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(27,94,32,0.06)_0%,transparent_70%)]" />

      {/* Top bar */}
      <div className="fixed top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-50 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg
            bg-casino-card/80 border border-casino-border/50 text-gray-400 hover:text-white
            transition-colors backdrop-blur-sm cursor-pointer"
        >
          <ArrowLeft size={14} className="sm:w-4 sm:h-4" />
          <span className="text-[10px] sm:text-xs font-medium">{t('game.lobby')}</span>
        </button>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Restart button for single player */}
          {isLocal && (
            <button
              onClick={handleRestart}
              className="flex items-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg
                bg-casino-card/80 border border-casino-border/50 text-gray-400 hover:text-white
                transition-colors backdrop-blur-sm cursor-pointer"
            >
              <RotateCcw size={12} className="sm:w-3.5 sm:h-3.5" />
              <span className="text-[10px] sm:text-xs font-medium hidden sm:inline">{t('game.restart')}</span>
            </button>
          )}
          <LanguageSwitch />
          <SoundToggle />
        </div>
      </div>

      {/* Game log */}
      <GameLog logs={gameLog} />

      {/* Spectator list (multiplayer only) — positioned below LLM Advisor area */}
      {!isLocal && spectators.length > 0 && (
        <div className="fixed top-[5.5rem] left-2 sm:top-[6.5rem] sm:left-4 z-40">
          <div className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg bg-casino-card/70 border border-casino-border/40 backdrop-blur-sm max-w-[160px] sm:max-w-[200px]">
            <Eye size={12} className="text-gray-500 shrink-0" />
            <span className="text-[10px] sm:text-xs text-gray-400 truncate">
              {t('game.spectators')}: {spectators.map(s => s.name).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Poker table */}
      {gameState ? (
        <>
          <div className="w-full h-full pt-10 pb-2 px-2 sm:p-4">
            <PokerTable gameState={gameState} myPlayerId={myPlayerId} isMultiplayer={!isLocal} />
          </div>

          {/* Game Over overlay */}
          {needsRestart && isLocal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="bg-casino-card/95 border border-casino-border/50 rounded-2xl p-8 text-center space-y-4 max-w-sm mx-4"
              >
                <div className="text-4xl">{humanWonAll ? '🏆' : '💀'}</div>
                <h2 className="text-xl font-bold text-white">{humanWonAll ? t('game.victory') : t('game.over')}</h2>
                <p className="text-sm text-gray-400">{humanWonAll ? t('game.victoryDesc') : t('game.overDesc')}</p>
                <button
                  onClick={handleRestart}
                  className="w-full py-3 rounded-xl bg-gold-500 text-black font-bold text-base
                    hover:bg-gold-400 transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw size={18} />
                  {t('game.restart')}
                </button>
                <button
                  onClick={handleBack}
                  className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300
                    hover:bg-white/10 transition-colors cursor-pointer text-sm"
                >
                  {t('game.lobby')}
                </button>
              </motion.div>
            </motion.div>
          )}

          {/* LLM Advisor */}
          <LLMAdvisor
            gameState={gameState}
            myPlayerId={myPlayerId}
            isMyTurn={isMyTurn || (isLocal && gameState.players[gameState.currentPlayerIndex]?.id === 'human' && gameState.phase !== 'showdown')}
            isLocal={isLocal}
            onAction={handleAction}
          />

          {/* Chat panel — both modes */}
          <ChatPanel isLocal={isLocal} />

          {/* Action panel */}
          <ActionPanel
            gameState={gameState}
            myPlayerId={myPlayerId}
            isMyTurn={isMyTurn || (isLocal && gameState.players[gameState.currentPlayerIndex]?.id === 'human' && gameState.phase !== 'showdown')}
            onAction={handleAction}
            isLocal={isLocal}
            onStandUp={!isLocal ? () => { standUp(); playSound('notify'); } : undefined}
            isStandingUp={isStandingUp}
          />

          {/* Spectator "Sit Down" button */}
          {isSpectator && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent backdrop-blur-md z-50"
            >
              <div className="max-w-md mx-auto text-center space-y-3">
                <p className="text-sm text-gray-400">
                  {isSeated ? t('game.waitingNextRound') : t('game.spectating')}
                </p>
                {!isSeated && (
                  <button
                    onClick={() => {
                      if (isGuest) {
                        setShowLoginDialog(true);
                      } else {
                        sitDown();
                        playSound('notify');
                      }
                    }}
                    className="w-full py-3 rounded-xl bg-gold-500 text-black font-bold text-base
                      hover:bg-gold-400 transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Armchair size={18} />
                    {t('game.sitDown')}
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Stand Up button is now inside ActionPanel to avoid overlap with raise +/- buttons */}
          {/* Shown outside ActionPanel only when not player's turn */}
          {!isLocal && !isSpectator && gameState && !isMyTurn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed bottom-[8.5rem] right-2 sm:bottom-[10rem] sm:right-4 z-50"
            >
              {isStandingUp ? (
                <div className="px-3 py-2 rounded-lg bg-casino-card/80 border border-yellow-500/30 text-yellow-400 text-xs backdrop-blur-sm">
                  {t('game.standingUp')}
                </div>
              ) : (
                <button
                  onClick={() => { standUp(); playSound('notify'); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg
                    bg-casino-card/80 border border-casino-border/50 text-gray-400 hover:text-yellow-400
                    hover:border-yellow-500/30 transition-colors backdrop-blur-sm cursor-pointer"
                >
                  <LogOut size={14} />
                  <span className="text-xs font-medium">{t('game.standUp')}</span>
                </button>
              )}
            </motion.div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mx-auto animate-pulse">
              <span className="text-3xl">♠</span>
            </div>
            <p className="text-gray-400">{t('game.waiting')}</p>
          </div>
        </div>
      )}

      {/* Login Dialog for guest spectators wanting to sit down */}
      <AnimatePresence>
        {showLoginDialog && (
          <LoginDialog
            onClose={() => setShowLoginDialog(false)}
            onSuccess={() => {
              setShowLoginDialog(false);
              // After login, reconnect socket with token, then re-spectate and sit down
              const newToken = useAuthStore.getState().token;
              if (newToken && roomId) {
                const newSocket = reconnectWithToken(newToken);
                // Re-setup listeners on new socket
                const cleanup = initGameListeners();
                newSocket.on('connect', () => {
                  setMyPlayerId(newSocket.id || '');
                  // Re-spectate and then sit
                  newSocket.emit('room:spectate', roomId);
                  newSocket.once('room:spectating', () => {
                    newSocket.emit('room:sit');
                  });
                });
                // Cleanup old listeners handled by effect deps change (token changed)
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Inline login/register dialog for guest spectators */
function LoginDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { login, register, isLoading, error, clearError } = useAuthStore();
  const { t } = useI18n();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = isRegister
      ? await register(username, password)
      : await login(username, password);
    if (success) onSuccess();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-casino-card border border-casino-border rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">{t('game.loginToPlay')}</h2>
          <p className="text-xs text-gray-400 mt-1">{t('game.loginRequired')}</p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-2 text-red-300 text-xs text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-300 mb-1">{t('auth.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-casino-bg border border-casino-border rounded-lg text-white text-sm focus:outline-none focus:border-gold-500"
              required
              minLength={2}
              maxLength={20}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-300 mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-casino-bg border border-casino-border rounded-lg text-white text-sm focus:outline-none focus:border-gold-500"
              required
              minLength={4}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-black font-bold rounded-lg transition-colors cursor-pointer"
          >
            {isLoading ? '...' : isRegister ? t('auth.register') : t('auth.login')}
          </button>
          <p className="text-center text-xs text-gray-400">
            {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
            <button type="button" onClick={() => { setIsRegister(!isRegister); clearError(); }} className="text-gold-400 hover:underline">
              {isRegister ? t('auth.login') : t('auth.register')}
            </button>
          </p>
        </form>
      </motion.div>
    </motion.div>
  );
}
