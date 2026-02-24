import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, PlayerAction, AIPersonality, AIEngineType, RoomConfig } from '@texas-agent/shared';
import * as RoomManager from './room-manager';
import { GameController } from './game-controller';

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>;
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const gameControllers = new Map<string, GameController>();
const playerNames = new Map<string, string>();
const playerRooms = new Map<string, string>();

export function setupSocketHandlers(io: IOServer): void {
  io.on('connection', (socket: IOSocket) => {
    console.log(`Player connected: ${socket.id}`);

    // Room list
    socket.on('room:list', () => {
      socket.emit('room:list', RoomManager.getRoomList());
    });

    // Create room
    socket.on('room:create', (config: RoomConfig & { name: string }) => {
      const playerName = playerNames.get(socket.id) || `Player_${socket.id.slice(0, 6)}`;
      const room = RoomManager.createRoom(config.name, config, socket.id, playerName);
      socket.join(room.id);
      playerRooms.set(socket.id, room.id);
      socket.emit('room:joined', room);
      broadcastRoomList(io);
    });

    // Join room
    socket.on('room:join', (roomId: string, name: string) => {
      playerNames.set(socket.id, name);
      const room = RoomManager.joinRoom(roomId, socket.id, name);
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
      console.log(`Player disconnected: ${socket.id}`);
      handleLeaveRoom(io, socket);
      playerNames.delete(socket.id);
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
    case 'game:ended':
      io.to(roomId).emit('game:ended', data as any);
      break;
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

function broadcastRoomList(io: IOServer): void {
  io.emit('room:list', RoomManager.getRoomList());
}
