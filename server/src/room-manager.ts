import { Room, RoomConfig, Player, AIPersonality, AIEngineType } from '@texas-agent/shared';
import { generateId } from '@texas-agent/shared';
import { getRandomAIName } from './ai/rule-based/personalities';

const MAX_ROOMS = 50;
const rooms = new Map<string, Room>();

export function createRoom(name: string, config: RoomConfig, creatorId: string, creatorName: string): Room {
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
      chips: config.startingChips,
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

export function joinRoom(roomId: string, playerId: string, playerName: string): Room {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'playing') throw new Error('Game already in progress');
  if (room.players.length >= room.config.maxPlayers) throw new Error('Room is full');
  if (room.players.find(p => p.id === playerId)) throw new Error('Already in room');

  const seatIndex = getNextAvailableSeat(room);
  room.players.push({
    id: playerId,
    name: playerName,
    chips: room.config.startingChips,
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

  if (room.players.filter(p => !p.isAI).length === 0) {
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
    chips: room.config.startingChips,
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
  }
  return undefined;
}

function getNextAvailableSeat(room: Room): number {
  const taken = new Set(room.players.map(p => p.seatIndex));
  for (let i = 0; i < room.config.maxPlayers; i++) {
    if (!taken.has(i)) return i;
  }
  return room.players.length;
}
