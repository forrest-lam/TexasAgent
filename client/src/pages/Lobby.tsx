import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyStore, LLMBotInfo, RuleBotInfo, OnlinePlayer } from '../stores/lobby-store';
import { DEFAULT_ROOM_CONFIG, BLIND_LEVELS, RoomConfig, AIPersonality } from '@texas-agent/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { Gamepad2, Users, Bot, Plus, LogIn, Wifi, WifiOff, Settings, LogOut, Coins, Trophy, Crown, Radio } from 'lucide-react';
import { useI18n } from '../i18n';
import { LanguageSwitch } from '../components/controls/LanguageSwitch';
import SoundToggle from '../components/controls/SoundToggle';
import { playSound, startBGM, stopBGM, isBGMEnabled } from '../services/sound-service';
import { useAuthStore } from '../stores/auth-store';
import { getSocket } from '../services/socket-service';

export default function Lobby() {
  const navigate = useNavigate();
  const { rooms, currentRoom, isConnected, isSpectating, connect, createRoom, joinRoom, spectateRoom, addAI, startGame, startGameConfirmed, inviteLLMBot, removeLLMBot, llmBots, inviteRuleBot, removeRuleBot, ruleBots, setGameTopupRequired, onlinePlayers } = useLobbyStore();
  const { t } = useI18n();
  const { user, logout } = useAuthStore();

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [config, setConfig] = useState<RoomConfig>({ ...DEFAULT_ROOM_CONFIG });
  const [leaderboard, setLeaderboard] = useState<Array<{username: string; chips: number; gamesWon: number; gamesPlayed: number; isLLMBot?: boolean; isRuleBot?: boolean}>>([]);

  useEffect(() => {
    connect();
    if (isBGMEnabled()) startBGM('lobby');
    return () => { stopBGM(); };
  }, []);

  const fetchLeaderboard = () => {
    const API_BASE = import.meta.env.VITE_SERVER_URL ?? (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);
    fetch(`${API_BASE}/api/leaderboard`)
      .then(r => r.json())
      .then(data => { if (data.leaderboard) setLeaderboard(data.leaderboard); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (currentRoom?.status === 'playing') {
      navigate(`/game/${currentRoom.id}`);
    }
  }, [currentRoom?.status, isSpectating]);

  const handleCreateRoom = () => {
    const name = roomName || `${user?.username}'s Room`;
    createRoom(name, config);
    setShowCreate(false);
    playSound('notify');
  };

  const handleSinglePlayer = () => {
    playSound('notify');
    navigate('/game/local');
  };

  // If in a room waiting, show room lobby
  if (currentRoom && currentRoom.status === 'waiting') {
    return <RoomWaitingScreen
      room={currentRoom}
      onAddAI={() => {
        const personalities: AIPersonality[] = ['conservative', 'balanced', 'aggressive'];
        const pick = personalities[Math.floor(Math.random() * personalities.length)];
        addAI(pick, 'rule-based');
      }}
      onStart={startGame}
      onStartConfirmed={startGameConfirmed}
      onLeave={useLobbyStore.getState().leaveRoom}
      isOwner={currentRoom.ownerId === getSocket().id}
      llmBots={llmBots}
      onInviteLLMBot={inviteLLMBot}
      onRemoveLLMBot={removeLLMBot}
      ruleBots={ruleBots}
      onInviteRuleBot={inviteRuleBot}
      onRemoveRuleBot={removeRuleBot}
      user={user}
      setGameTopupRequired={setGameTopupRequired}
    />;
  }

  return (
    <div className="min-h-screen bg-casino-bg relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.05)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(27,94,32,0.08)_0%,transparent_60%)]" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-3 py-2 sm:px-6 sm:py-4 bg-casino-bg/80 backdrop-blur-md border-b border-casino-border/30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg">
            <span className="text-base sm:text-xl">♠</span>
          </div>
          <h1 className="text-lg sm:text-2xl font-bold text-white">
            Texas<span className="text-gold-400">Agent</span>
          </h1>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <LanguageSwitch />
          <SoundToggle />
          <div className="hidden sm:flex items-center gap-2">
            {isConnected ? (
              <Wifi size={14} className="text-green-400" />
            ) : (
              <WifiOff size={14} className="text-red-400" />
            )}
            <span className="text-xs text-gray-400">{isConnected ? t('lobby.online') : t('lobby.offline')}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 bg-white/5 rounded-lg">
            <Coins size={12} className="text-yellow-400 sm:w-3.5 sm:h-3.5" />
            <span className="text-xs sm:text-sm font-medium text-yellow-400">{user?.chips?.toLocaleString()}</span>
          </div>
          <span className="hidden sm:inline text-sm text-white font-medium">{user?.username}</span>
          <button onClick={() => navigate('/settings')} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title={t('settings.title')}>
            <Settings size={16} className="text-gray-400 hover:text-white" />
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title={t('auth.logout')}>
            <LogOut size={16} className="text-gray-400 hover:text-red-400" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="pt-16 sm:pt-24 px-3 sm:px-6 max-w-5xl mx-auto relative z-10 pb-6">
        {/* Mode selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {/* Single Player */}
          <motion.div
            whileHover={{ y: -4, boxShadow: '0 0 30px rgba(212,175,55,0.15)' }}
            className="glass-card rounded-2xl p-5 sm:p-8 cursor-pointer group transition-all"
            onClick={handleSinglePlayer}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-gold-400/20 to-gold-600/20 flex items-center justify-center border border-gold-500/20 shrink-0">
                <Gamepad2 size={24} className="text-gold-400 sm:hidden" />
                <Gamepad2 size={28} className="text-gold-400 hidden sm:block" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-gold-400 transition-colors">{t('lobby.singlePlayer')}</h2>
                <p className="text-xs sm:text-sm text-gray-400">{t('lobby.singlePlayerDesc')}</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              {t('lobby.singlePlayerDetail')}
            </p>
          </motion.div>

          {/* Multiplayer */}
          <motion.div
            whileHover={{ y: -4, boxShadow: '0 0 30px rgba(59,130,246,0.15)' }}
            className="glass-card rounded-2xl p-5 sm:p-8 cursor-pointer group transition-all"
            onClick={() => setShowCreate(true)}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 flex items-center justify-center border border-blue-500/20 shrink-0">
                <Users size={24} className="text-blue-400 sm:hidden" />
                <Users size={28} className="text-blue-400 hidden sm:block" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{t('lobby.multiplayer')}</h2>
                <p className="text-xs sm:text-sm text-gray-400">{t('lobby.multiplayerDesc')}</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
              {t('lobby.multiplayerDetail')}
            </p>
          </motion.div>
        </div>

        {/* Room list */}
        {rooms.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">{t('lobby.availableRooms')}</h3>
            <div className="grid gap-3">
              {rooms.map(room => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-0 sm:justify-between"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-white">{room.name}</h4>
                    <p className="text-xs text-gray-400">
                      {room.players.length}/{room.config.maxPlayers} {t('lobby.players')} · {t('lobby.blinds')} {room.config.smallBlind}/{room.config.bigBlind}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${room.status === 'playing' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                      {room.status === 'playing' ? t('lobby.inGame') : t('lobby.waiting')}
                    </span>
                    {room.status === 'playing' ? (
                      <Button
                        onClick={() => spectateRoom(room.id)}
                        size="sm"
                        className="bg-purple-600 text-white hover:bg-purple-500 cursor-pointer"
                      >
                        <LogIn size={14} className="mr-1" /> {t('lobby.spectate')}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => joinRoom(room.id)}
                        size="sm"
                        className="bg-gold-500 text-black hover:bg-gold-400 cursor-pointer"
                      >
                        <LogIn size={14} className="mr-1" /> {t('lobby.join')}
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Online Players */}
        {onlinePlayers.length > 0 && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-green-400 animate-pulse" />
              <h3 className="text-lg font-semibold text-white">在线玩家</h3>
              <span className="text-xs text-gray-500 ml-1">({onlinePlayers.length})</span>
            </div>
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="flex flex-wrap gap-2 p-4">
                {onlinePlayers.map((player) => (
                  <div
                    key={player.username}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border
                      ${player.status === 'playing'
                        ? 'bg-red-500/10 border-red-500/20 text-red-300'
                        : player.status === 'waiting'
                        ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300'
                        : 'bg-green-500/10 border-green-500/20 text-green-300'
                      }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0
                      ${player.status === 'playing' ? 'bg-red-400' : player.status === 'waiting' ? 'bg-yellow-400' : 'bg-green-400'}`}
                    />
                    <span className="font-medium">{player.username}</span>
                    <span className="text-[10px] opacity-60 font-mono">${player.chips.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 pb-3 flex gap-4 text-[10px] text-gray-600">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"/>大厅</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block"/>等待中</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block"/>游戏中</span>
              </div>
            </div>
          </div>
        )}

      {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-gold-400" />
              <h3 className="text-lg font-semibold text-white">排行榜</h3>
            </div>
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-4 py-2 text-xs text-gray-500 border-b border-casino-border/30">
                <span>排名</span>
                <span>玩家</span>
                <span className="text-right">筹码</span>
                <span className="text-right">胜率</span>
              </div>
              {leaderboard.slice(0, 10).map((entry, index) => {
                const medal = index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
                const winRate = entry.gamesPlayed > 0 ? Math.round(entry.gamesWon / entry.gamesPlayed * 100) : 0;
                return (
                  <div key={entry.username} className={`grid grid-cols-4 gap-2 px-4 py-2.5 text-sm items-center border-b border-casino-border/10 last:border-0 ${index < 3 ? 'bg-gold-500/5' : ''}`}>
                    <span className="font-bold text-base">{medal}</span>
                    <span className="text-white font-medium truncate flex items-center gap-1">{entry.username}{entry.isLLMBot && <span className="text-[9px] text-purple-400 border border-purple-500/30 rounded px-1 py-0 leading-tight">AI</span>}{entry.isRuleBot && <span className="text-[9px] text-emerald-400 border border-emerald-500/30 rounded px-1 py-0 leading-tight">BOT</span>}</span>
                    <span className="text-gold-400 font-mono text-right">${entry.chips.toLocaleString()}</span>
                    <span className="text-gray-400 text-right">{winRate}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Create Room Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-casino-card border-casino-border text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gold-400">{t('room.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-gray-300 text-sm">{t('room.name')}</Label>
              <Input
                value={roomName}
                onChange={e => setRoomName(e.target.value)}
                placeholder={`${user?.username}'s Room`}
                className="mt-1 bg-casino-bg border-casino-border text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">{t('room.maxPlayers')} ({config.maxPlayers})</Label>
              <Slider
                value={[config.maxPlayers]}
                min={2} max={9} step={1}
                onValueChange={([v]) => setConfig({ ...config, maxPlayers: v })}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">{t('room.blindLevel')}</Label>
              <Select
                value={`${config.smallBlind}`}
                onValueChange={v => {
                  const level = BLIND_LEVELS.find(l => `${l.small}` === v);
                  if (level) setConfig({ ...config, smallBlind: level.small, bigBlind: level.big });
                }}
              >
                <SelectTrigger className="mt-1 bg-casino-bg border-casino-border text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-casino-card border-casino-border text-white">
                  {BLIND_LEVELS.map(l => (
                    <SelectItem key={l.small} value={`${l.small}`}>
                      {l.label} ({l.small}/{l.big})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300 text-sm">{t('room.startingChips')} (${config.startingChips})</Label>
              <Slider
                value={[config.startingChips]}
                min={500} max={10000} step={100}
                onValueChange={([v]) => setConfig({ ...config, startingChips: v })}
                className="mt-2"
              />
            </div>
            <Button
              onClick={handleCreateRoom}
              className="w-full bg-gold-500 text-black hover:bg-gold-400 font-bold h-11 cursor-pointer"
            >
              <Plus size={16} className="mr-2" /> {t('room.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomWaitingScreen({ room, onAddAI, onStart, onStartConfirmed, onLeave, isOwner, llmBots, onInviteLLMBot, onRemoveLLMBot, ruleBots, onInviteRuleBot, onRemoveRuleBot, user, setGameTopupRequired }: {
  room: any; onAddAI: () => void; onStart: () => void; onStartConfirmed: () => void; onLeave: () => void; isOwner: boolean;
  llmBots?: LLMBotInfo[]; onInviteLLMBot?: (id: string) => void; onRemoveLLMBot?: (id: string) => void;
  ruleBots?: RuleBotInfo[]; onInviteRuleBot?: (id: string) => void; onRemoveRuleBot?: (id: string) => void;
  user?: any; setGameTopupRequired?: (cb: ((data: { items: { botId: string; botName: string; needed: number }[]; total: number }) => void) | null) => void;
}) {
  const { t } = useI18n();
  const [topupPending, setTopupPending] = useState<{ items: { botId: string; botName: string; needed: number }[]; total: number } | null>(null);
  const minPlayers = 2;
  const canStart = isOwner && room.players.length >= minPlayers;

  // Register game-start topup callback with store
  useEffect(() => {
    if (!setGameTopupRequired) return;
    setGameTopupRequired((data) => {
      setTopupPending(data);
    });
    return () => { setGameTopupRequired(null); };
  }, [setGameTopupRequired]);
  return (
    <div className="min-h-screen bg-casino-bg flex flex-col items-center justify-center px-3 sm:px-4">
      <div className="glass-card rounded-2xl p-5 sm:p-8 max-w-lg w-full space-y-4 sm:space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white text-center">{room.name}</h2>
        <p className="text-center text-gray-400 text-sm">
          {room.players.length}/{room.config.maxPlayers} {t('lobby.players')} · {t('lobby.blinds')} {room.config.smallBlind}/{room.config.bigBlind}
        </p>

        <div className="space-y-2">
          {room.players.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5">
              {p.isLLMBot ? <span className="text-base leading-none">{(llmBots ?? []).find(b => b.id === p.llmBotId)?.emoji ?? '🤖'}</span>
                : p.isRuleBot ? <span className="text-base leading-none">{(ruleBots ?? []).find(b => b.id === p.ruleBotId)?.emoji ?? '🤖'}</span>
                : p.isAI ? <Bot size={16} className="text-purple-400" />
                : <Users size={16} className="text-blue-400" />}
              <span className="text-sm text-white font-medium">{p.name}</span>
              {p.id === room.ownerId && <Crown size={14} className="text-gold-400 ml-auto" title={t('room.owner')} />}
              {p.isLLMBot && isOwner && onRemoveLLMBot && (
                <button onClick={() => onRemoveLLMBot(p.llmBotId)} className="ml-auto text-xs text-red-400 hover:text-red-300 cursor-pointer px-1">✕</button>
              )}
              {p.isRuleBot && isOwner && onRemoveRuleBot && (
                <button onClick={() => onRemoveRuleBot(p.ruleBotId)} className="ml-auto text-xs text-red-400 hover:text-red-300 cursor-pointer px-1">✕</button>
              )}
              {p.isAI && !p.isLLMBot && !p.isRuleBot && <span className="text-xs text-gray-500 ml-auto">{p.aiPersonality}</span>}
            </div>
          ))}
        </div>

        {/* Status message */}
        {room.players.length < minPlayers && (
          <p className="text-center text-yellow-400/80 text-xs">
            {t('room.needMorePlayers', { current: room.players.length, min: minPlayers })}
          </p>
        )}
        {!isOwner && room.players.length >= minPlayers && (
          <p className="text-center text-gray-500 text-xs">{t('room.waitingForOwner')}</p>
        )}

        {/* LLM Bot invite panel */}
        {isOwner && llmBots && llmBots.length > 0 && (
          <div className="border border-casino-border/30 rounded-xl p-3 space-y-2 bg-black/10">
            <p className="text-[11px] text-gray-500 font-medium">邀请 AI 大模型玩家</p>
            <div className="flex flex-wrap gap-2">
              {llmBots.map(bot => {
                const alreadyIn = room.players.some((p: any) => p.llmBotId === bot.id);
                const isFull = room.players.length >= room.config.maxPlayers;
                return (
                  <button
                    key={bot.id}
                    onClick={() => !alreadyIn && !bot.busy && !isFull && onInviteLLMBot?.(bot.id)}
                    disabled={alreadyIn || (bot.busy && !alreadyIn) || isFull}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                      ${alreadyIn
                        ? 'bg-green-500/20 border-green-500/40 text-green-400 cursor-default'
                        : bot.busy
                        ? 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed opacity-50'
                        : isFull
                        ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-gray-400'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300'
                      }`}
                    title={bot.busy && !alreadyIn ? '该模型已在其他房间游戏中' : bot.model}
                  >
                    <span>{bot.emoji}</span>
                    <span>{bot.name}</span>
                    {alreadyIn && <span className="text-[9px] text-green-500">✓</span>}
                    {bot.busy && !alreadyIn && <span className="text-[9px] text-gray-600">忙</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-gray-600">每个AI模型同时只能在一个房间游戏</p>
          </div>
        )}

        {/* Rule Bot invite panel */}
        {isOwner && ruleBots && ruleBots.length > 0 && (
          <div className="border border-casino-border/30 rounded-xl p-3 space-y-2 bg-black/10">
            <p className="text-[11px] text-gray-500 font-medium">邀请规则机器人</p>
            <div className="flex flex-wrap gap-2">
              {ruleBots.map(bot => {
                const alreadyIn = room.players.some((p: any) => p.ruleBotId === bot.id);
                const isFull = room.players.length >= room.config.maxPlayers;
                return (
                  <button
                    key={bot.id}
                    onClick={() => !alreadyIn && !bot.busy && !isFull && onInviteRuleBot?.(bot.id)}
                    disabled={alreadyIn || (bot.busy && !alreadyIn) || isFull}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                      ${alreadyIn
                        ? 'bg-green-500/20 border-green-500/40 text-green-400 cursor-default'
                        : bot.busy
                        ? 'bg-white/5 border-white/10 text-gray-600 cursor-not-allowed opacity-50'
                        : isFull
                        ? 'opacity-40 cursor-not-allowed bg-white/5 border-white/10 text-gray-400'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300'
                      }`}
                    title={bot.busy && !alreadyIn ? '该机器人已在其他房间游戏中' : `${bot.personality} 策略`}
                  >
                    <span>{bot.emoji}</span>
                    <span>{bot.name}</span>
                    {alreadyIn && <span className="text-[9px] text-green-500">✓</span>}
                    {bot.busy && !alreadyIn && <span className="text-[9px] text-gray-600">忙</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-gray-600">规则机器人有独立排行榜账号，每个同时只能在一个房间</p>
          </div>
        )}

        <div className="flex gap-3">
          {isOwner && (
            <Button onClick={onAddAI} variant="outline"
              disabled={room.players.length >= room.config.maxPlayers}
              className="flex-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 cursor-pointer disabled:opacity-50">
              <Bot size={14} className="mr-2" /> {t('room.addAI')}
            </Button>
          )}
          {isOwner && (
            <Button onClick={onStart}
              disabled={!canStart}
              className="flex-1 bg-gold-500 text-black hover:bg-gold-400 font-bold cursor-pointer disabled:opacity-50">
              {t('room.startGame')}
            </Button>
          )}
        </div>
        <Button onClick={onLeave} variant="ghost" className="w-full text-gray-400 hover:text-white cursor-pointer">
          {t('room.leaveRoom')}
        </Button>
      </div>

      {/* Game-start Bot Topup Confirmation Dialog */}
      {topupPending && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) setTopupPending(null); }}>
          <DialogContent className="bg-casino-card border-casino-border text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-gold-400">补充机器人筹码</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {user && user.chips < topupPending.total ? (
                <p className="text-sm text-red-400">
                  你的余额不足（当前 <span className="font-bold text-yellow-400">{user.chips.toLocaleString()}</span> 筹码），无法开始游戏（共需补充 <span className="font-bold">{topupPending.total.toLocaleString()}</span> 筹码）。
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-300">以下机器人筹码不足，开始游戏将从你的余额中扣除：</p>
                  <ul className="space-y-1">
                    {topupPending.items.map(item => (
                      <li key={item.botId} className="flex justify-between text-sm px-2 py-1 bg-white/5 rounded-lg">
                        <span className="text-white">{item.botName}</span>
                        <span className="text-yellow-400 font-mono">+{item.needed.toLocaleString()} 筹码</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between text-sm font-semibold px-2 pt-1 border-t border-casino-border/30">
                    <span className="text-gray-300">共扣除</span>
                    <span className="text-red-400 font-mono">-{topupPending.total.toLocaleString()} 筹码</span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setTopupPending(null)}
                  className="border-white/20 text-gray-300 hover:bg-white/10 cursor-pointer"
                >
                  {user && user.chips < topupPending.total ? '关闭' : '取消'}
                </Button>
                {(!user || user.chips >= topupPending.total) && (
                  <Button
                    onClick={() => {
                      setTopupPending(null);
                      onStartConfirmed();
                    }}
                    className="bg-gold-500 text-black hover:bg-gold-400 font-bold cursor-pointer"
                  >
                    确认开始
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
