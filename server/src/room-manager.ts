import { Room, RoomConfig, Player, AIPersonality, AIEngineType, AI_STARTING_CHIPS, LLM_BOT_CONFIGS, LLMBotId, RULE_BOT_CONFIGS, RuleBotId } from '@texas-agent/shared';
import { generateId } from '@texas-agent/shared';
import { getRandomAIName } from './ai/rule-based/personalities';
import { llmBotRegistry } from './ai/llm-bot-player';
import { ruleBotRegistry } from './ai/rule-bot-player';
import { getUserById } from './user-store';

const MAX_ROOMS = 50;
const rooms = new Map<string, Room>();

export function createRoom(name: string, config: RoomConfig, creatorId: string, creatorName: string, userChips?: number): Room {
  if (rooms.size >= MAX_ROOMS) {
    throw new Error('Maximum number of rooms reached');
  }

  const room: Room = {
    id: generateId(),
    name,
    config,
    players: [{
      id: creatorId,
      name: creatorName,
      chips: userChips ?? config.startingChips,
      cards: [],
      currentBet: 0,
      totalBet: 0,
      isActive: true,
      isFolded: false,
      isAllIn: false,
      isAI: false,
      seatIndex: 0,
    }],
    status: 'waiting',
    ownerId: creatorId,
    createdAt: Date.now(),
  };

  rooms.set(room.id, room);
  return room;
}

export function joinRoom(roomId: string, playerId: string, playerName: string, userChips?: number): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'playing') throw new Error('Game already in progress');
  if (room.players.length >= room.config.maxPlayers) throw new Error('Room is full');
  if (room.players.find(p => p.id === playerId)) throw new Error('Already in room');

  const seatIndex = getNextAvailableSeat(room);
  room.players.push({
    id: playerId,
    name: playerName,
    chips: userChips ?? room.config.startingChips,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    isActive: true,
    isFolded: false,
    isAllIn: false,
    isAI: false,
    seatIndex,
  });

  return room;
}

/** Allow a player to enter a room as spectator (even when game is in progress) */
export function spectateRoom(roomId: string, playerId: string, playerName: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.players.find(p => p.id === playerId)) throw new Error('Already in room');
  // Also check pending players
  if (room.pendingPlayers?.find(p => p.id === playerId)) throw new Error('Already waiting to join');
  // Track spectator (spectators don't count against maxPlayers)
  if (!room.spectators) room.spectators = [];
  if (!room.spectators.find(s => s.id === playerId)) {
    room.spectators.push({ id: playerId, name: playerName });
  }
  return room;
}

/** Register a spectator as a pending player who will join at the start of the next hand */
export function sitDown(roomId: string, playerId: string, playerName: string, userChips?: number): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.players.find(p => p.id === playerId)) throw new Error('Already playing');
  if (room.pendingPlayers?.find(p => p.id === playerId)) throw new Error('Already waiting to join');
  const totalCount = room.players.length + (room.pendingPlayers?.length ?? 0);
  if (totalCount >= room.config.maxPlayers) throw new Error('Room is full');

  if (!room.pendingPlayers) room.pendingPlayers = [];

  const seatIndex = getNextAvailableSeat(room);
  room.pendingPlayers.push({
    id: playerId,
    name: playerName,
    chips: userChips ?? room.config.startingChips,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    isActive: true,
    isFolded: false,
    isAllIn: false,
    isAI: false,
    seatIndex,
  });

  // Remove from spectators list since they are now a pending player
  if (room.spectators) {
    room.spectators = room.spectators.filter(s => s.id !== playerId);
  }

  return room;
}

export function leaveRoom(roomId: string, playerId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  // If this is an LLM bot, release it
  const leavingPlayer = room.players.find(p => p.id === playerId) ||
    room.pendingPlayers?.find(p => p.id === playerId);
  if (leavingPlayer?.isLLMBot && leavingPlayer.llmBotId) {
    const bot = llmBotRegistry.get(leavingPlayer.llmBotId as LLMBotId);
    bot?.releaseRoom(roomId);
  }
  if (leavingPlayer?.isRuleBot && leavingPlayer.ruleBotId) {
    const bot = ruleBotRegistry.get(leavingPlayer.ruleBotId as RuleBotId);
    bot?.releaseRoom(roomId);
  }

  room.players = room.players.filter(p => p.id !== playerId);
  if (room.pendingPlayers) {
    room.pendingPlayers = room.pendingPlayers.filter(p => p.id !== playerId);
  }
  if (room.spectators) {
    room.spectators = room.spectators.filter(s => s.id !== playerId);
  }

  // Delete room if no human players remain (and no pending humans)
  const humanPlayers = room.players.filter(p => !p.isAI);
  const pendingHumans = (room.pendingPlayers || []).filter(p => !p.isAI);
  if (humanPlayers.length === 0 && pendingHumans.length === 0) {
    // Release all bots in this room
    releaseAllLLMBots(roomId);
    releaseAllRuleBots(roomId);
    rooms.delete(roomId);
    return null;
  }

  return room;
}

export function addAIPlayer(roomId: string, personality: AIPersonality, engineType: AIEngineType): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.players.length >= room.config.maxPlayers) throw new Error('Room is full');

  const seatIndex = getNextAvailableSeat(room);
  const aiPlayer: Player = {
    id: `ai-${generateId()}`,
    name: getRandomAIName(personality),
    chips: AI_STARTING_CHIPS,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    isActive: true,
    isFolded: false,
    isAllIn: false,
    isAI: true,
    aiPersonality: personality,
    aiEngineType: engineType,
    seatIndex,
  };

  room.players.push(aiPlayer);
  return room;
}

/**
 * Invite a named LLM bot into a room.
 * Throws if bot is already in another room, or room is full.
 */
export function inviteLLMBot(roomId: string, botId: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.players.length >= room.config.maxPlayers) throw new Error('Room is full');

  if (!llmBotRegistry.isValidBotId(botId)) throw new Error(`Unknown LLM bot: ${botId}`);

  const bot = llmBotRegistry.get(botId as LLMBotId)!;

  // Check if already in this room
  if (room.players.find(p => p.llmBotId === botId)) throw new Error('Bot already in this room');

  // Check if busy in another room
  if (bot.isBusy) throw new Error(`${bot.name} is already in another game`);

  // Get bot's stored chips from user store
  const botProfile = getUserById(botId);
  const chips = botProfile?.chips ?? 5000;

  const seatIndex = getNextAvailableSeat(room);
  const botPlayer: Player = {
    id: botId,
    name: bot.name,
    chips,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    isActive: true,
    isFolded: false,
    isAllIn: false,
    isAI: true,
    isLLMBot: true,
    llmBotId: botId,
    aiPersonality: bot.personality,
    aiEngineType: 'llm',
    seatIndex,
  };

  bot.occupyRoom(roomId);
  room.players.push(botPlayer);
  return room;
}

/**
 * Remove an LLM bot from a room (before game start).
 */
export function removeLLMBot(roomId: string, botId: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');

  const bot = llmBotRegistry.get(botId as LLMBotId);
  if (bot) bot.releaseRoom(roomId);

  room.players = room.players.filter(p => p.llmBotId !== botId);
  return room;
}

/**
 * Invite a named rule-based bot into a room.
 */
export function inviteRuleBot(roomId: string, botId: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.players.length >= room.config.maxPlayers) throw new Error('Room is full');

  if (!ruleBotRegistry.isValidBotId(botId)) throw new Error(`Unknown rule bot: ${botId}`);

  const bot = ruleBotRegistry.get(botId as RuleBotId)!;

  if (room.players.find(p => p.ruleBotId === botId)) throw new Error('Bot already in this room');
  if (bot.isBusy) throw new Error(`${bot.name} is already in another game`);

  const botProfile = getUserById(botId);
  const chips = botProfile?.chips ?? 2000;

  const seatIndex = getNextAvailableSeat(room);
  const botPlayer: Player = {
    id: botId,
    name: bot.name,
    chips,
    cards: [],
    currentBet: 0,
    totalBet: 0,
    isActive: true,
    isFolded: false,
    isAllIn: false,
    isAI: true,
    isRuleBot: true,
    ruleBotId: botId,
    aiPersonality: bot.personality,
    aiEngineType: 'rule-based',
    seatIndex,
  };

  bot.occupyRoom(roomId);
  room.players.push(botPlayer);
  return room;
}

/**
 * Remove a rule-based bot from a room (before game start).
 */
export function removeRuleBot(roomId: string, botId: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');

  const bot = ruleBotRegistry.get(botId as RuleBotId);
  if (bot) bot.releaseRoom(roomId);

  room.players = room.players.filter(p => p.ruleBotId !== botId);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

/** Force-delete a room (used when only AI players remain) */
export function deleteRoom(roomId: string): void {
  releaseAllLLMBots(roomId);
  releaseAllRuleBots(roomId);
  rooms.delete(roomId);
}

export function getRoomList(): Room[] {
  return Array.from(rooms.values()).map(room => ({
    ...room,
    players: room.players.map(p => ({
      ...p,
      cards: [],
    })),
  }));
}

export function getRoomByPlayerId(playerId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.players.find(p => p.id === playerId)) return room;
    if (room.pendingPlayers?.find(p => p.id === playerId)) return room;
  }
  return undefined;
}

/** Release all LLM bots occupying a given room */
function releaseAllLLMBots(roomId: string) {
  for (const bot of llmBotRegistry.getAll()) {
    bot.releaseRoom(roomId);
  }
}

/** Release all rule-based bots occupying a given room */
function releaseAllRuleBots(roomId: string) {
  for (const bot of ruleBotRegistry.getAll()) {
    bot.releaseRoom(roomId);
  }
}

function getNextAvailableSeat(room: Room): number {
  const taken = new Set(room.players.map(p => p.seatIndex));
  if (room.pendingPlayers) {
    for (const p of room.pendingPlayers) taken.add(p.seatIndex);
  }
  for (let i = 0; i < room.config.maxPlayers; i++) {
    if (!taken.has(i)) return i;
  }
  return room.players.length + (room.pendingPlayers?.length ?? 0);
}
