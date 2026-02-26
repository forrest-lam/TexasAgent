import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Gift } from 'lucide-react';
import { useGameStore, ChatMessage } from '../../stores/game-store';

const PRESET_MESSAGES = [
  '快点啊！',
  '等到花儿都谢了',
  '你行不行？',
  '太菜了吧',
  '哈哈哈',
  '服了',
  '运气好',
  'GG',
  '加油！',
  '好牌！',
];

const REACTION_EMOJIS = [
  { emoji: '🥚', label: '扔鸡蛋' },
  { emoji: '🍅', label: '扔番茄' },
  { emoji: '🌹', label: '送鲜花' },
  { emoji: '👍', label: '点赞' },
  { emoji: '💰', label: '打赏' },
];

const AI_RESPONSES: Record<string, string[]> = {
  '快点啊！': ['别催，我在想...', '急什么，好牌需要思考', '耐心点朋友'],
  '等到花儿都谢了': ['花谢了还有下一季', '马上马上', '别急嘛~'],
  '你行不行？': ['看好了', '等着瞧', '别小看我'],
  '太菜了吧': ['只是运气差而已', '下把让你看看', '哼，走着瞧'],
  '哈哈哈': ['笑什么笑', '有什么好笑的', '😤'],
  '服了': ['认输了？', '这才刚开始', '还早呢'],
  '运气好': ['实力实力', '运气也是实力的一部分', '谢谢夸奖'],
  'GG': ['GG', 'Good game!', '再来一局？'],
  '加油！': ['谢谢鼓励', '一起加油！', '💪'],
  '好牌！': ['一般一般', '运气运气', '还行吧'],
};

const AI_GENERIC_RESPONSES = [
  '嗯嗯',
  '有意思',
  '继续继续',
  '看牌说话',
  '好的好的',
  '...',
  '专心打牌吧',
  '😎',
  '🤔',
];

const MINI_MSG_COUNT = 3;

// Default position: bottom-left, same level as ActionPanel
const DEFAULT_POS = { x: 8, y: -1 }; // x from left, y from bottom (in rem)

interface ChatPanelProps {
  isLocal?: boolean;
}

export default function ChatPanel({ isLocal }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const { chatMessages, sendChatMessage, sendReaction, myPlayerId, gameState } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag state — position in px from top-left of viewport
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasDragged = useRef(false);

  // Init default position after mount (so we have window dimensions)
  useEffect(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    setPos({
      x: DEFAULT_POS.x,
      y: window.innerHeight - (Math.abs(DEFAULT_POS.y) + 2.5) * rem,
    });
  }, []);

  const messages = isLocal ? localMessages : chatMessages;

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Reset reaction picker when panel closes
  useEffect(() => {
    if (!isOpen) {
      setShowReactionPicker(false);
      setSelectedTargetId(null);
    }
  }, [isOpen]);

  const getRandomAIResponse = (text: string): string => {
    const specific = AI_RESPONSES[text];
    if (specific) return specific[Math.floor(Math.random() * specific.length)];
    return AI_GENERIC_RESPONSES[Math.floor(Math.random() * AI_GENERIC_RESPONSES.length)];
  };

  const handleSend = (msg?: string) => {
    const text = (msg || inputText).trim();
    if (!text) return;
    if (isLocal) {
      const playerMsg: ChatMessage = {
        playerId: 'human',
        playerName: 'You',
        message: text,
        timestamp: Date.now(),
      };
      setLocalMessages(prev => [...prev.slice(-19), playerMsg]);
      const aiPlayers = gameState?.players.filter(p => p.isAI && !p.isFolded) ?? [];
      if (aiPlayers.length > 0 && Math.random() < 0.6) {
        const responder = aiPlayers[Math.floor(Math.random() * aiPlayers.length)];
        const delay = 800 + Math.random() * 2000;
        setTimeout(() => {
          const aiMsg: ChatMessage = {
            playerId: responder.id,
            playerName: responder.name,
            message: getRandomAIResponse(text),
            timestamp: Date.now(),
          };
          setLocalMessages(prev => [...prev.slice(-19), aiMsg]);
        }, delay);
      }
    } else {
      sendChatMessage(text);
    }
    setInputText('');
  };

  const handleReaction = (emoji: string) => {
    if (!selectedTargetId) return;
    sendReaction(selectedTargetId, emoji);
    setShowReactionPicker(false);
    setSelectedTargetId(null);
  };

  // Other players (excluding self) for reaction targeting
  const otherPlayers = (gameState?.players ?? []).filter(
    p => p.id !== myPlayerId && p.isActive && !p.isFolded
  );

  // ── Drag handlers ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!btnRef.current || !pos) return;
    dragging.current = true;
    hasDragged.current = false;
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    btnRef.current.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    hasDragged.current = true;
    const btnW = btnRef.current?.offsetWidth ?? 48;
    const btnH = btnRef.current?.offsetHeight ?? 36;
    const newX = Math.max(0, Math.min(window.innerWidth - btnW, e.clientX - dragOffset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - btnH, e.clientY - dragOffset.current.y));
    setPos({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    // Only open if it wasn't a drag
    if (!hasDragged.current) {
      setIsOpen(true);
    }
    e.preventDefault();
  }, []);

  const recentMessages = messages.slice(-MINI_MSG_COUNT);

  if (pos === null) return null;

  const btnH = 36; // approximate button height px

  return (
    <>
      {/* ── Recent messages: float above the draggable button ── */}
      {!isOpen && (
        <div
          className="fixed z-30 max-w-[220px] sm:max-w-[260px] pointer-events-none"
          style={{ left: pos.x, top: pos.y - (recentMessages.length * 34 + 8), transition: 'top 0.15s' }}
        >
          <AnimatePresence mode="popLayout">
            {recentMessages.map((msg, i) => {
              const isSelf = msg.playerId === myPlayerId || (isLocal && msg.playerId === 'human');
              return (
                <motion.div
                  key={`${msg.timestamp}-${i}`}
                  initial={{ opacity: 0, y: 10, x: -10 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="mb-1"
                >
                  <div className="inline-flex items-baseline gap-1.5 px-2 py-1 rounded-xl bg-black/70 backdrop-blur-sm border border-white/5 max-w-full">
                    <span className={`text-[10px] font-medium shrink-0 ${isSelf ? 'text-blue-400' : 'text-amber-400'}`}>
                      {isSelf ? '你' : msg.playerName}
                    </span>
                    <span className="text-[11px] text-gray-200 break-words line-clamp-1">{msg.message}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* ── Draggable chat toggle button ── */}
      <motion.button
        ref={btnRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        whileTap={{ scale: 0.95 }}
        className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
          bg-casino-card/80 border border-casino-border/50 backdrop-blur-sm
          text-gray-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors shadow-lg select-none touch-none"
        style={{ left: pos.x, top: pos.y, cursor: dragging.current ? 'grabbing' : 'grab' }}
      >
        <MessageCircle size={14} />
        {messages.length > 0 && (
          <span className="text-[10px] text-gray-500">{messages.length}</span>
        )}
      </motion.button>

      {/* ── Expanded chat panel (overlay) ── */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/30"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg"
            >
              <div className="bg-casino-card/98 border-t border-casino-border/50 rounded-t-2xl backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-casino-border/30">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={14} className="text-blue-400" />
                    <span className="text-sm font-semibold text-white">聊天</span>
                    <span className="text-xs text-gray-500">{messages.length} 条</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Reaction trigger button — only in multiplayer with other players */}
                    {!isLocal && otherPlayers.length > 0 && (
                      <button
                        onClick={() => {
                          setShowReactionPicker(v => !v);
                          setSelectedTargetId(null);
                        }}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors cursor-pointer
                          ${showReactionPicker
                            ? 'bg-pink-500/20 border border-pink-500/40 text-pink-400'
                            : 'bg-white/5 border border-white/10 text-gray-400 hover:text-pink-400 hover:border-pink-500/30'
                          }`}
                      >
                        <Gift size={13} />
                        <span>互动</span>
                      </button>
                    )}
                    <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer">
                      <X size={14} className="text-gray-400 hover:text-white" />
                    </button>
                  </div>
                </div>

                {/* ── Reaction Picker Panel ── */}
                <AnimatePresence>
                  {showReactionPicker && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-b border-casino-border/20"
                    >
                      <div className="px-4 py-3 space-y-2.5 bg-black/20">
                        {/* Step 1: Select target player */}
                        <div>
                          <p className="text-[10px] text-gray-500 mb-1.5">选择对象</p>
                          <div className="flex flex-wrap gap-1.5">
                            {otherPlayers.map(p => (
                              <button
                                key={p.id}
                                onClick={() => setSelectedTargetId(p.id === selectedTargetId ? null : p.id)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border
                                  ${selectedTargetId === p.id
                                    ? 'bg-blue-500/30 border-blue-500/60 text-blue-300'
                                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                                  }`}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Step 2: Select emoji reaction */}
                        <div>
                          <p className="text-[10px] text-gray-500 mb-1.5">
                            {selectedTargetId ? '选择互动' : '先选一个人再扔～'}
                          </p>
                          <div className="flex gap-3">
                            {REACTION_EMOJIS.map(({ emoji, label }) => (
                              <button
                                key={emoji}
                                onClick={() => handleReaction(emoji)}
                                disabled={!selectedTargetId}
                                title={label}
                                className={`flex flex-col items-center gap-0.5 transition-all cursor-pointer
                                  ${selectedTargetId
                                    ? 'hover:scale-125 active:scale-110'
                                    : 'opacity-30 cursor-not-allowed'
                                  }`}
                              >
                                <span className="text-2xl leading-none">{emoji}</span>
                                <span className="text-[9px] text-gray-500">{label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={scrollRef} className="h-52 overflow-y-auto px-4 py-2 space-y-1.5 scroll-smooth">
                  {messages.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-8">暂无消息，发个消息打招呼吧！</p>
                  ) : (
                    messages.map((msg, i) => (
                      <ChatBubble key={i} msg={msg} isSelf={msg.playerId === myPlayerId || (isLocal && msg.playerId === 'human')} />
                    ))
                  )}
                </div>
                <div className="px-4 py-2 border-t border-casino-border/20">
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_MESSAGES.map(preset => (
                      <button
                        key={preset}
                        onClick={() => handleSend(preset)}
                        className="px-2.5 py-1 text-[11px] sm:text-xs rounded-full bg-white/5 border border-white/10 text-gray-300
                          hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-300 transition-all cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 px-4 py-3 border-t border-casino-border/30 pb-safe">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value.slice(0, 50))}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="发送消息..."
                    maxLength={50}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500
                      focus:outline-none focus:border-blue-500/50 focus:bg-white/8"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!inputText.trim()}
                    className="px-3 py-2 rounded-xl bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed
                      text-white transition-colors cursor-pointer"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function ChatBubble({ msg, isSelf }: { msg: ChatMessage; isSelf: boolean }) {
  const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
      <div className="flex items-baseline gap-1 mb-0.5">
        <span className="text-[10px] text-gray-500">{isSelf ? '你' : msg.playerName}</span>
        <span className="text-[9px] text-gray-600">{time}</span>
      </div>
      <div className={`px-2.5 py-1.5 rounded-xl text-xs max-w-[220px] break-words
        ${isSelf
          ? 'bg-blue-600/70 text-white rounded-tr-none'
          : 'bg-white/10 text-gray-200 rounded-tl-none'
        }`}
      >
        {msg.message}
      </div>
    </div>
  );
}
