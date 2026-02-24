import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, PlayerAction, AIPersonality, AIEngineType, RoomConfig } from '@texas-agent/shared';
import * as RoomManager from './room-manager';
import { GameController } from './game-controller';
import { getUserById, updateUserChips, updateUserStats } from './user-store';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const gameControllers = new Map<string, GameController>();
const playerRooms = new Map<string, string>();
// Map socket.id → userId for chip settlement
const socketUserMap = new Map<string, string>();

export function setupSocketHandlers(io: IOServer): void {
  io.on('connection', (socket: IOSocket) => {
    const userId = (socket as any).data.userId;
    const username = (socket as any).data.username;
    console.log(`Player connected: ${username} (${socket.id})`);
    socketUserMap.set(socket.id, userId);

    // Room list
    socket.on('room:list', () => {
      socket.emit('room:list', RoomManager.getRoomList());
    });

    // Create room
    socket.on('room:create', (config: RoomConfig & { name: string }) => {
      const user = getUserById(userId);
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }
      const room = RoomManager.createRoom(config.name, config, socket.id, username, user.chips);
      socket.join(room.id);
      playerRooms.set(socket.id, room.id);
      socket.emit('room:joined', room);
      broadcastRoomList(io);
    });

    // Join room
    socket.on('room:join', (roomId: string) => {
      const user = getUserById(userId);
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }
      const room = RoomManager.joinRoom(roomId, socket.id, username, user.chips);
      socket.join(room.id);
      playerRooms.set(socket.id, room.id);
      socket.emit('room:joined', room);
      io.to(room.id).emit('room:updated', room);
      broadcastRoomList(io);
    });

    // Leave room
    socket.on('room:leave', () => {
      handleLeaveRoom(io, socket);
    });

    // Add AI player
    socket.on('room:add-ai', (personality: AIPersonality, engineType: AIEngineType) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        socket.emit('error', 'Not in a room');
        return;
      }
      const room = RoomManager.addAIPlayer(roomId, personality, engineType);
      io.to(room.id).emit('room:updated', room);
      broadcastRoomList(io);
    });

    // Start game
    socket.on('game:start', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        socket.emit('error', 'Not in a room');
        return;
      }

      const room = RoomManager.getRoom(roomId);
      if (!room) {
        socket.emit('error', 'Room not found');
        return;
      }

      if (room.players.length < 2) {
        socket.emit('error', 'Need at least 2 players');
        return;
      }

      // Create game controller
      const controller = new GameController(room, (rId, event, data) => {
        emitGameEvent(io, rId, event, data);
      });
      gameControllers.set(roomId, controller);

      controller.startGame();

      // Send personalized state to each human player (with their own cards visible)
      for (const player of room.players) {
        if (!player.isAI) {
          const personalState = controller.getSanitizedStateForPlayer(player.id);
          if (personalState) {
            io.to(player.id).emit('game:state', personalState);
          }
        }
      }
    });

    // Player action
    socket.on('game:action', (action: PlayerAction) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        socket.emit('error', 'Not in a room');
        return;
      }

      const controller = gameControllers.get(roomId);
      if (!controller) {
        socket.emit('error', 'No active game');
        return;
      }

      controller.handlePlayerAction(socket.id, action);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${username} (${socket.id})`);
      handleLeaveRoom(io, socket);
      socketUserMap.delete(socket.id);
    });
  });
}

function handleLeaveRoom(io: IOServer, socket: IOSocket): void {
  const roomId = playerRooms.get(socket.id);
  if (!roomId) return;

  const room = RoomManager.leaveRoom(roomId, socket.id);
  socket.leave(roomId);
  playerRooms.delete(socket.id);
  socket.emit('room:left');

  if (room) {
    // Clean up game controller if no human players remain
    const humanPlayers = room.players.filter(p => !p.isAI);
    if (humanPlayers.length === 0) {
      const controller = gameControllers.get(roomId);
      if (controller) {
        controller.cleanup();
        gameControllers.delete(roomId);
      }
    }
    io.to(room.id).emit('room:updated', room);
  } else {
    // Room was deleted
    const controller = gameControllers.get(roomId);
    if (controller) {
      controller.cleanup();
      gameControllers.delete(roomId);
    }
  }

  broadcastRoomList(io);
}

function emitGameEvent(io: IOServer, roomId: string, event: string, data: unknown): void {
  const room = RoomManager.getRoom(roomId);
  if (!room) return;

  switch (event) {
    case 'game:started':
    case 'game:state': {
      // Send personalized state to each human player
      const controller = gameControllers.get(roomId);
      if (controller) {
        for (const player of room.players) {
          if (!player.isAI) {
            const personalState = controller.getSanitizedStateForPlayer(player.id);
            if (personalState) {
              io.to(player.id).emit(event as 'game:state', personalState);
            }
          }
        }
      }
      break;
    }
    case 'game:action':
      io.to(roomId).emit('game:action', data as { playerId: string; action: PlayerAction });
      break;
    case 'game:ended': {
      // Settle chips for human players
      const gameState = data as any;
      if (gameState?.winners) {
        settleChips(roomId, gameState);
      }
      io.to(roomId).emit('game:ended', data as any);
      // Send updated user info to each human player
      for (const player of room.players) {
        if (!player.isAI) {
          const uid = socketUserMap.get(player.id);
          if (uid) {
            const user = getUserById(uid);
            if (user) {
              io.to(player.id).emit('user:updated', {
                id: user.id,
                username: user.username,
                chips: user.chips,
                stats: user.stats,
                createdAt: user.createdAt,
              });
            }
          }
        }
      }
      break;
    }
    case 'game:your-turn': {
      const turnData = data as { playerId: string; timeLimit: number };
      io.to(turnData.playerId).emit('game:your-turn', { timeLimit: turnData.timeLimit });
      break;
    }
    case 'room:updated':
      io.to(roomId).emit('room:updated', data as any);
      break;
    case 'error':
      io.to(roomId).emit('error', data as string);
      break;
  }
}

function settleChips(roomId: string, gameState: any): void {
  const room = RoomManager.getRoom(roomId);
  if (!room) return;

  for (const player of room.players) {
    if (player.isAI) continue;
    const uid = socketUserMap.get(player.id);
    if (!uid) continue;

    // Find how much this player won
    const winEntry = gameState.winners?.find((w: any) => w.playerId === player.id);
    const winAmount = winEntry?.amount || 0;

    // Calculate net: won amount - what they bet (totalBet from game state)
    const playerInGame = gameState.players?.find((p: any) => p.id === player.id);
    const totalBet = playerInGame?.totalBet || 0;
    const net = winAmount - totalBet;

    updateUserChips(uid, net);
    updateUserStats(uid, winAmount > 0, net);
  }
}

function broadcastRoomList(io: IOServer): void {
  io.emit('room:list', RoomManager.getRoomList());
}
