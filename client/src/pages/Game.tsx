import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/game-store';
import { useLobbyStore } from '../stores/lobby-store';
import { DEFAULT_ROOM_CONFIG, RoomConfig } from '@texas-agent/shared';
import { LocalGameEngine } from '../services/local-game';
import { getSocket } from '../services/socket-service';
import PokerTable from '../components/table/PokerTable';
import ActionPanel from '../components/controls/ActionPanel';
import GameLog from '../components/table/GameLog';
import LanguageSwitch from '../components/controls/LanguageSwitch';
import SoundToggle from '../components/controls/SoundToggle';
import LLMAdvisor from '../components/controls/LLMAdvisor';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import { playSound } from '../services/sound-service';
import { recordAction, recordHandResult, setCurrentRound } from '../services/player-memory';
import { motion } from 'framer-motion';

export default function Game() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const isLocal = roomId === 'local';
  const localEngine = useRef<LocalGameEngine | null>(null);
  const { gameState, isMyTurn, myPlayerId, gameLog, setGameState, setMyPlayerId, sendAction, addLog, clearGame, initGameListeners } = useGameStore();
  const [started, setStarted] = useState(false);
  const { t } = useI18n();
  const prevPhaseRef = useRef<string | null>(null);
  const prevRoundRef = useRef<number | null>(null);

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

    // Record actions to player memory (with phase info)
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
        }
      }
    }

    // Record hand results
    if (phase === 'showdown' && gameState.winners && prevRoundRef.current !== gameState.round) {
      prevRoundRef.current = gameState.round;
      const winnerIds = new Set(gameState.winners.map(w => w.playerId));
      for (const p of gameState.players) {
        if (p.isActive) {
          recordHandResult(p.id, p.name, winnerIds.has(p.id));
        }
      }
    }
  }, [gameState?.phase, gameState?.currentPlayerIndex, gameState?.lastAction, gameState?.winners]);

  useEffect(() => {
    if (isLocal) {
      setMyPlayerId('human');
      startLocalGame();
    } else {
      const socket = getSocket();
      setMyPlayerId(socket.id || '');
      initGameListeners();
      socket.on('connect', () => {
        setMyPlayerId(socket.id || '');
      });
    }

    return () => {
      localEngine.current?.cleanup();
      clearGame();
    };
  }, [roomId]);

  const startLocalGame = () => {
    const config: RoomConfig = { ...DEFAULT_ROOM_CONFIG, aiCount: 5 };
    localEngine.current = new LocalGameEngine(
      config,
      (state) => setGameState(state),
      (msg) => addLog(msg)
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
    localEngine.current?.cleanup();
    clearGame();
    navigate('/');
  };

  // Check if game is over
  const humanPlayer = gameState?.players.find(p => p.id === myPlayerId);
  const aliveCount = gameState?.players.filter(p => p.chips > 0).length ?? 0;
  const humanBusted = gameState?.phase === 'showdown' && humanPlayer && humanPlayer.chips <= 0;
  const humanWonAll = gameState?.phase === 'showdown' && aliveCount < 2 && humanPlayer && humanPlayer.chips > 0;
  const needsRestart = humanBusted || humanWonAll;

  return (
    <div className="h-screen w-screen bg-casino-bg overflow-hidden relative">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(27,94,32,0.06)_0%,transparent_70%)]" />

      {/* Top bar */}
      <div className="fixed top-4 left-4 right-4 z-50 flex items-center justify-between">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 rounded-lg
            bg-casino-card/80 border border-casino-border/50 text-gray-400 hover:text-white
            transition-colors backdrop-blur-sm cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span className="text-xs font-medium">{t('game.lobby')}</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Restart button for single player */}
          {isLocal && (
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 px-3 py-2 rounded-lg
                bg-casino-card/80 border border-casino-border/50 text-gray-400 hover:text-white
                transition-colors backdrop-blur-sm cursor-pointer"
            >
              <RotateCcw size={14} />
              <span className="text-xs font-medium">{t('game.restart')}</span>
            </button>
          )}
          <LanguageSwitch />
          <SoundToggle />
        </div>
      </div>

      {/* Game log */}
      <GameLog logs={gameLog} />

      {/* Poker table */}
      {gameState ? (
        <>
          <div className="w-full h-full p-4">
            <PokerTable gameState={gameState} myPlayerId={myPlayerId} />
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
          />

          {/* Action panel */}
          <ActionPanel
            gameState={gameState}
            myPlayerId={myPlayerId}
            isMyTurn={isMyTurn || (isLocal && gameState.players[gameState.currentPlayerIndex]?.id === 'human' && gameState.phase !== 'showdown')}
            onAction={handleAction}
          />
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
    </div>
  );
}
