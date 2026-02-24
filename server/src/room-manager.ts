import { Room, RoomConfig, Player, AIPersonality, AIEngineType, AI_STARTING_CHIPS } from '@texas-agent/shared';
import { generateId } from '@texas-agent/shared';
import { getRandomAIName } from './ai/rule-based/personalities';

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
  const totalCount = room.players.length + (room.pendingPlayers?.length ?? 0);
  if (totalCount >= room.config.maxPlayers) throw new Error('Room is full');
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

  return room;
}

export function leaveRoom(roomId: string, playerId: string): Room | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.players = room.players.filter(p => p.id !== playerId);
  if (room.pendingPlayers) {
    room.pendingPlayers = room.pendingPlayers.filter(p => p.id !== playerId);
  }

  // Delete room if no human players remain (and no pending humans)
  const humanPlayers = room.players.filter(p => !p.isAI);
  const pendingHumans = (room.pendingPlayers || []).filter(p => !p.isAI);
  if (humanPlayers.length === 0 && pendingHumans.length === 0) {
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

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

/** Force-delete a room (used when only AI players remain) */
export function deleteRoom(roomId: string): void {
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
