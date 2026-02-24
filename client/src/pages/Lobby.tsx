import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLobbyStore } from '../stores/lobby-store';
import { DEFAULT_ROOM_CONFIG, BLIND_LEVELS, RoomConfig, AIPersonality } from '@texas-agent/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { Gamepad2, Users, Bot, Plus, LogIn, Wifi, WifiOff } from 'lucide-react';
import { useI18n } from '../i18n';
import LanguageSwitch from '../components/controls/LanguageSwitch';
import SoundToggle from '../components/controls/SoundToggle';
import { playSound } from '../services/sound-service';

export default function Lobby() {
  const navigate = useNavigate();
  const { rooms, currentRoom, isConnected, playerName, setPlayerName, connect, createRoom, joinRoom, addAI, startGame } = useLobbyStore();
  const { t } = useI18n();

  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [config, setConfig] = useState<RoomConfig>({ ...DEFAULT_ROOM_CONFIG });

  useEffect(() => { connect(); }, []);

  useEffect(() => {
    if (currentRoom?.status === 'playing') {
      navigate(`/game/${currentRoom.id}`);
    }
  }, [currentRoom?.status]);

  const handleCreateRoom = () => {
    const name = roomName || `${playerName}'s Room`;
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
      onAddAI={() => addAI('balanced', 'rule-based')}
      onStart={startGame}
      onLeave={useLobbyStore.getState().leaveRoom}
    />;
  }

  return (
    <div className="min-h-screen bg-casino-bg relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.05)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(27,94,32,0.08)_0%,transparent_60%)]" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-casino-bg/80 backdrop-blur-md border-b border-casino-border/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center shadow-lg">
            <span className="text-xl">♠</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            Texas<span className="text-gold-400">Agent</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitch />
          <SoundToggle />
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi size={14} className="text-green-400" />
            ) : (
              <WifiOff size={14} className="text-red-400" />
            )}
            <span className="text-xs text-gray-400">{isConnected ? t('lobby.online') : t('lobby.offline')}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              className="w-36 h-8 text-xs bg-casino-card border-casino-border text-white"
              placeholder={t('lobby.yourName')}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pt-24 px-6 max-w-5xl mx-auto relative z-10">
        {/* Mode selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Single Player */}
          <motion.div
            whileHover={{ y: -4, boxShadow: '0 0 30px rgba(212,175,55,0.15)' }}
            className="glass-card rounded-2xl p-8 cursor-pointer group transition-all"
            onClick={handleSinglePlayer}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-400/20 to-gold-600/20 flex items-center justify-center border border-gold-500/20">
                <Gamepad2 size={28} className="text-gold-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white group-hover:text-gold-400 transition-colors">{t('lobby.singlePlayer')}</h2>
                <p className="text-sm text-gray-400">{t('lobby.singlePlayerDesc')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t('lobby.singlePlayerDetail')}
            </p>
          </motion.div>

          {/* Multiplayer */}
          <motion.div
            whileHover={{ y: -4, boxShadow: '0 0 30px rgba(59,130,246,0.15)' }}
            className="glass-card rounded-2xl p-8 cursor-pointer group transition-all"
            onClick={() => setShowCreate(true)}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-700/20 flex items-center justify-center border border-blue-500/20">
                <Users size={28} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{t('lobby.multiplayer')}</h2>
                <p className="text-sm text-gray-400">{t('lobby.multiplayerDesc')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed">
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
                  className="glass-card rounded-xl p-4 flex items-center justify-between"
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
                    <Button
                      onClick={() => joinRoom(room.id)}
                      disabled={room.status === 'playing'}
                      size="sm"
                      className="bg-gold-500 text-black hover:bg-gold-400 disabled:opacity-50 cursor-pointer"
                    >
                      <LogIn size={14} className="mr-1" /> {t('lobby.join')}
                    </Button>
                  </div>
                </motion.div>
              ))}
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
                placeholder={`${playerName}'s Room`}
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

function RoomWaitingScreen({ room, onAddAI, onStart, onLeave }: {
  room: any; onAddAI: () => void; onStart: () => void; onLeave: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-casino-bg flex flex-col items-center justify-center px-4">
      <div className="glass-card rounded-2xl p-8 max-w-lg w-full space-y-6">
        <h2 className="text-2xl font-bold text-white text-center">{room.name}</h2>
        <p className="text-center text-gray-400 text-sm">
          {room.players.length}/{room.config.maxPlayers} {t('lobby.players')} · {t('lobby.blinds')} {room.config.smallBlind}/{room.config.bigBlind}
        </p>

        <div className="space-y-2">
          {room.players.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-lg bg-white/5">
              {p.isAI ? <Bot size={16} className="text-purple-400" /> : <Users size={16} className="text-blue-400" />}
              <span className="text-sm text-white font-medium">{p.name}</span>
              {p.isAI && <span className="text-xs text-gray-500 ml-auto">{p.aiPersonality}</span>}
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button onClick={onAddAI} variant="outline"
            disabled={room.players.length >= room.config.maxPlayers}
            className="flex-1 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 cursor-pointer disabled:opacity-50">
            <Bot size={14} className="mr-2" /> {t('room.addAI')}
          </Button>
          <Button onClick={onStart}
            disabled={room.players.length < 2}
            className="flex-1 bg-gold-500 text-black hover:bg-gold-400 font-bold cursor-pointer disabled:opacity-50">
            {t('room.startGame')}
          </Button>
        </div>
        <Button onClick={onLeave} variant="ghost" className="w-full text-gray-400 hover:text-white cursor-pointer">
          {t('room.leaveRoom')}
        </Button>
      </div>
    </div>
  );
}
