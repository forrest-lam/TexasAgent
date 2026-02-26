export type Locale = 'en' | 'zh';

export const locales: Record<Locale, Record<string, string>> = {
  en: {
    // App title
    'app.title': 'TexasAgent',
    'app.subtitle': 'Poker AI',

    // Lobby
    'lobby.singlePlayer': 'Single Player',
    'lobby.singlePlayerDesc': 'Challenge AI opponents',
    'lobby.singlePlayerDetail': 'Play against intelligent AI bots with different personalities — conservative, aggressive, or balanced. Perfect for practice and honing your skills.',
    'lobby.multiplayer': 'Multiplayer',
    'lobby.multiplayerDesc': 'Play with friends online',
    'lobby.multiplayerDetail': 'Create or join rooms, invite friends, and add AI bots to fill empty seats. Real-time competitive poker experience.',
    'lobby.availableRooms': 'Available Rooms',
    'lobby.online': 'Online',
    'lobby.offline': 'Offline',
    'lobby.yourName': 'Your name',
    'lobby.inGame': 'In Game',
    'lobby.waiting': 'Waiting',
    'lobby.join': 'Join',
    'lobby.spectate': 'Watch',
    'lobby.players': 'players',
    'lobby.blinds': 'Blinds',

    // Create Room
    'room.create': 'Create Room',
    'room.name': 'Room Name',
    'room.maxPlayers': 'Max Players',
    'room.blindLevel': 'Blind Level',
    'room.startingChips': 'Starting Chips',
    'room.addAI': 'Add AI',
    'room.startGame': 'Start Game',
    'room.leaveRoom': 'Leave Room',

    // Game
    'game.lobby': 'Lobby',
    'game.log': 'Log',
    'game.noActions': 'No actions yet...',
    'game.waiting': 'Waiting for game to start...',
    'game.round': 'Round',
    'game.pot': 'Pot',

    // Phases
    'phase.preflop': 'Pre-Flop',
    'phase.flop': 'Flop',
    'phase.turn': 'Turn',
    'phase.river': 'River',
    'phase.showdown': 'Showdown',

    // Actions
    'action.fold': 'Fold',
    'action.check': 'Check',
    'action.call': 'Call',
    'action.raise': 'Raise',
    'action.allIn': 'All In',
    'action.raiseTo': 'Raise to',
    'action.cancel': 'Cancel',
    'action.halfPot': '½ Pot',
    'action.threeFourPot': '¾ Pot',
    'action.pot': 'Pot',
    'action.bet': 'Bet',
    'action.minRaise': 'Min',

    // Player
    'player.you': 'You',
    'player.folded': 'Folded',
    'player.allIn': 'All In',

    // Log messages
    'log.gameStarted': '🎴 Game started!',
    'log.newHand': '🎴 New hand started!',
    'log.gameOver': 'Game over! Not enough players.',
    'log.gameRestarted': '🔄 Game restarted!',
    'log.wins': '🏆 {name} wins ${amount} ({hand})',
    'log.action': '{name}: {action}',

    // Game over / restart
    'game.over': 'Game Over',
    'game.overDesc': 'You ran out of chips!',
    'game.victory': 'Victory!',
    'game.victoryDesc': 'You defeated all opponents!',
    'game.restart': 'Restart Game',
    'game.spectating': 'You are watching this game',
    'game.spectators': 'Spectators',
    'game.sitDown': 'Sit Down',
    'game.standUp': 'Stand Up',
    'game.standingUp': 'You will start spectating at the next hand',
    'game.waitingNextRound': 'You will join at the start of the next hand',
    'game.gameOverPlayers': 'Game Over! Not enough players.',

    // LLM Advisor
    'advisor.title': 'AI Advisor',
    'advisor.thinking': 'Analyzing...',
    'advisor.suggest': 'Get Advice',
    'advisor.follow': 'Follow',
    'advisor.noKey': 'API Key not configured',
    'advisor.goSettings': 'Go to Settings',
    'advisor.error': 'Analysis failed',
    'advisor.primary': 'Primary',
    'advisor.alternative': 'Alternative',

    // Settings
    'settings.language': 'Language',
    'settings.back': 'Back',
    'settings.title': 'Settings',
    'settings.llmConfig': 'LLM Configuration',
    'settings.apiKey': 'API Key',
    'settings.apiBaseUrl': 'API Base URL',
    'settings.model': 'Model',
    'settings.save': 'Save',
    'settings.saved': 'Saved!',
    'settings.chips': 'Chips',

    // Auth
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',
    'auth.logout': 'Logout',
    'auth.welcome': 'Welcome',
  },
  zh: {
    // App title
    'app.title': 'TexasAgent',
    'app.subtitle': '扑克AI',

    // Lobby
    'lobby.singlePlayer': '单人模式',
    'lobby.singlePlayerDesc': '挑战AI对手',
    'lobby.singlePlayerDetail': '与拥有不同性格（保守型、激进型、平衡型）的智能AI机器人对战，是练习和提升牌技的最佳方式。',
    'lobby.multiplayer': '多人模式',
    'lobby.multiplayerDesc': '与好友在线对战',
    'lobby.multiplayerDetail': '创建或加入房间，邀请好友，添加AI补位。实时竞技的扑克体验。',
    'lobby.availableRooms': '可用房间',
    'lobby.online': '在线',
    'lobby.offline': '离线',
    'lobby.yourName': '你的名字',
    'lobby.inGame': '游戏中',
    'lobby.waiting': '等待中',
    'lobby.join': '加入',
    'lobby.spectate': '观战',
    'lobby.players': '玩家',
    'lobby.blinds': '盲注',

    // Create Room
    'room.create': '创建房间',
    'room.name': '房间名称',
    'room.maxPlayers': '最大人数',
    'room.blindLevel': '盲注级别',
    'room.startingChips': '初始筹码',
    'room.addAI': '添加AI',
    'room.startGame': '开始游戏',
    'room.leaveRoom': '离开房间',

    // Game
    'game.lobby': '大厅',
    'game.log': '日志',
    'game.noActions': '暂无操作...',
    'game.waiting': '等待游戏开始...',
    'game.round': '回合',
    'game.pot': '奖池',

    // Phases
    'phase.preflop': '翻前',
    'phase.flop': '翻牌',
    'phase.turn': '转牌',
    'phase.river': '河牌',
    'phase.showdown': '摊牌',

    // Actions
    'action.fold': '弃牌',
    'action.check': '过牌',
    'action.call': '跟注',
    'action.raise': '加注',
    'action.allIn': '全押',
    'action.raiseTo': '加注至',
    'action.cancel': '取消',
    'action.halfPot': '½底池',
    'action.threeFourPot': '¾底池',
    'action.pot': '底池',
    'action.bet': '下注',
    'action.minRaise': '最小',

    // Player
    'player.you': '你',
    'player.folded': '已弃牌',
    'player.allIn': '全押',

    // Log messages
    'log.gameStarted': '🎴 游戏开始！',
    'log.newHand': '🎴 新一手开始！',
    'log.gameOver': '游戏结束！玩家不足。',
    'log.gameRestarted': '🔄 游戏已重新开始！',
    'log.wins': '🏆 {name} 赢得 ${amount}（{hand}）',
    'log.action': '{name}：{action}',

    // Game over / restart
    'game.over': '游戏结束',
    'game.overDesc': '你的筹码已耗尽！',
    'game.victory': '胜利！',
    'game.victoryDesc': '你击败了所有对手！',
    'game.restart': '重新开始',
    'game.spectating': '你正在观战此游戏',
    'game.spectators': '观战者',
    'game.sitDown': '坐下',
    'game.standUp': '站起',
    'game.standingUp': '你将在下一轮开始时进入观战',
    'game.waitingNextRound': '你将在下一轮开始时加入游戏',
    'game.gameOverPlayers': '游戏结束！玩家不足。',

    // LLM Advisor
    'advisor.title': 'AI 顾问',
    'advisor.thinking': '分析中...',
    'advisor.suggest': '获取建议',
    'advisor.follow': '一键遵循',
    'advisor.noKey': 'API Key 未配置',
    'advisor.goSettings': '前往设置',
    'advisor.error': '分析失败',
    'advisor.primary': '推荐',
    'advisor.alternative': '备选',

    // Settings
    'settings.language': '语言',
    'settings.back': '返回',
    'settings.title': '设置',
    'settings.llmConfig': 'LLM 配置',
    'settings.apiKey': 'API Key',
    'settings.apiBaseUrl': 'API 地址',
    'settings.model': '模型',
    'settings.save': '保存',
    'settings.saved': '已保存！',
    'settings.chips': '筹码',

    // Auth
    'auth.login': '登录',
    'auth.register': '注册',
    'auth.username': '用户名',
    'auth.password': '密码',
    'auth.noAccount': '没有账号？',
    'auth.hasAccount': '已有账号？',
    'auth.logout': '退出登录',
    'auth.welcome': '欢迎',
  },
};

// Hand rank names
export const handRankNames: Record<Locale, Record<string, string>> = {
  en: {
    'High Card': 'High Card',
    'One Pair': 'One Pair',
    'Two Pair': 'Two Pair',
    'Three of a Kind': 'Three of a Kind',
    'Straight': 'Straight',
    'Flush': 'Flush',
    'Full House': 'Full House',
    'Four of a Kind': 'Four of a Kind',
    'Straight Flush': 'Straight Flush',
    'Royal Flush': 'Royal Flush',
    'Last Standing': 'Last Standing',
  },
  zh: {
    'High Card': '高牌',
    'One Pair': '一对',
    'Two Pair': '两对',
    'Three of a Kind': '三条',
    'Straight': '顺子',
    'Flush': '同花',
    'Full House': '葫芦',
    'Four of a Kind': '四条',
    'Straight Flush': '同花顺',
    'Royal Flush': '皇家同花顺',
    'Last Standing': '最后存活',
  },
};

// Action type names for log
export const actionNames: Record<Locale, Record<string, string>> = {
  en: {
    fold: 'Fold',
    check: 'Check',
    call: 'Call',
    raise: 'Raise',
    'all-in': 'All In',
  },
  zh: {
    fold: '弃牌',
    check: '过牌',
    call: '跟注',
    raise: '加注',
    'all-in': '全押',
  },
};
