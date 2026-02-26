import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send } from 'lucide-react';
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

export default function ChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [hasNew, setHasNew] = useState(false);
  const { chatMessages, sendChatMessage, myPlayerId } = useGameStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(chatMessages.length);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Show new message indicator when closed
    if (chatMessages.length > prevCountRef.current && !isOpen) {
      setHasNew(true);
    }
    prevCountRef.current = chatMessages.length;
  }, [chatMessages.length]);

  const handleSend = (msg?: string) => {
    const text = (msg || inputText).trim();
    if (!text) return;
    sendChatMessage(text);
    setInputText('');
  };

  const handleOpen = () => {
    setIsOpen(true);
    setHasNew(false);
  };

  return (
    <div className="fixed bottom-20 right-2 sm:bottom-24 sm:right-4 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="w-72 sm:w-80 bg-casino-card/95 border border-casino-border/50 rounded-2xl backdrop-blur-md shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-casino-border/30">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">聊天</span>
                <span className="text-xs text-gray-500">{chatMessages.length} 条</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X size={14} className="text-gray-400 hover:text-white" />
              </button>
            </div>

            {/* Messages area */}
            <div
              ref={scrollRef}
              className="h-48 overflow-y-auto px-3 py-2 space-y-1.5 scroll-smooth"
            >
              {chatMessages.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-4">暂无消息，发个消息打招呼吧！</p>
              ) : (
                chatMessages.map((msg, i) => (
                  <ChatBubble key={i} msg={msg} isSelf={msg.playerId === myPlayerId} />
                ))
              )}
            </div>

            {/* Preset messages */}
            <div className="px-3 py-1.5 border-t border-casino-border/20">
              <div className="flex flex-wrap gap-1">
                {PRESET_MESSAGES.map(preset => (
                  <button
                    key={preset}
                    onClick={() => handleSend(preset)}
                    className="px-2 py-0.5 text-[10px] sm:text-xs rounded-full bg-white/5 border border-white/10 text-gray-300
                      hover:bg-blue-500/20 hover:border-blue-500/30 hover:text-blue-300 transition-all cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Input area */}
            <div className="flex gap-2 px-3 py-2 border-t border-casino-border/30">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value.slice(0, 50))}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder="发送消息..."
                maxLength={50}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500
                  focus:outline-none focus:border-blue-500/50 focus:bg-white/8"
              />
              <button
                onClick={() => handleSend()}
                disabled={!inputText.trim()}
                className="p-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed
                  text-white transition-colors cursor-pointer"
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <button
        onClick={isOpen ? () => setIsOpen(false) : handleOpen}
        className="relative w-10 h-10 rounded-full bg-casino-card/80 border border-casino-border/50 backdrop-blur-sm
          flex items-center justify-center text-gray-400 hover:text-blue-400 hover:border-blue-500/30
          transition-all cursor-pointer shadow-lg"
      >
        <MessageCircle size={18} />
        {hasNew && !isOpen && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center"
          >
            !
          </motion.span>
        )}
      </button>
    </div>
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
      <div className={`px-2.5 py-1.5 rounded-xl text-xs max-w-[200px] break-words
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
