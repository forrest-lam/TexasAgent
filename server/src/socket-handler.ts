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
      console.log(`[Room] Created: "${room.name}" (${room.id}) by ${username}`);
    });

    // Join room
    socket.on('room:join', (roomId: string) => {
      const user = getUserById(userId);
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }
      try {
        const room = RoomManager.joinRoom(roomId, socket.id, username, user.chips);
        socket.join(room.id);
        playerRooms.set(socket.id, room.id);
        socket.emit('room:joined', room);
        io.to(room.id).emit('room:updated', room);
        broadcastRoomList(io);
        console.log(`[Room] ${username} joined room "${room.name}" (${room.id}) — players: ${room.players.length}`);
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    // Spectate a room that is currently playing
    socket.on('room:spectate', (roomId: string) => {
      const user = getUserById(userId);
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }
      try {
        const room = RoomManager.spectateRoom(roomId, socket.id, username);
        socket.join(room.id);
        playerRooms.set(socket.id, room.id);
        // Send room info and current game state to the spectator
        socket.emit('room:spectating', room);
        // Broadcast updated spectator list to the room
        io.to(room.id).emit('room:updated', room);
        console.log(`[Room] ${username} spectating room "${room.name}" (${room.id})`);
        // Also send current game state (sanitized — no hole cards visible)
        const controller = gameControllers.get(roomId);
        if (controller) {
          const spectatorState = controller.getSanitizedStateForPlayer(socket.id);
          if (spectatorState) {
            socket.emit('game:state', spectatorState);
          }
        }
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    // Spectator clicks "sit down" — register as pending player for next hand
    socket.on('room:sit', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        socket.emit('error', 'Not in a room');
        return;
      }
      const user = getUserById(userId);
      if (!user) {
        socket.emit('error', 'User not found');
        return;
      }
      try {
        const room = RoomManager.sitDown(roomId, socket.id, username, user.chips);
        socket.emit('room:seated');
        io.to(room.id).emit('room:updated', room);
        broadcastRoomList(io);
        console.log(`[Room] ${username} sat down in room "${room.name}" (${room.id}) — players: ${room.players.length}, pending: ${room.pendingPlayers?.length ?? 0}`);

        // If the room is waiting (game paused) and there are enough players to resume,
        // merge pending players and auto-start a new game
        if (room.status === 'waiting') {
          const totalPlayers = room.players.length + (room.pendingPlayers?.length ?? 0);
          if (totalPlayers >= 2) {
            // Merge pending players into the active roster
            if (room.pendingPlayers && room.pendingPlayers.length > 0) {
              for (const pending of room.pendingPlayers) {
                room.players.push(pending);
              }
              room.pendingPlayers = [];
            }
            io.to(room.id).emit('room:updated', room);

            // Create a fresh game controller and start
            let controller = gameControllers.get(roomId);
            if (controller) {
              controller.cleanup();
            }
            controller = new GameController(room, (rId, event, data) => {
              emitGameEvent(io, rId, event, data);
            });
            controller.setOnPlayerKick((playerId) => {
              const playerSocket = io.sockets.sockets.get(playerId);
              if (playerSocket) {
                playerSocket.leave(roomId);
                playerSocket.emit('room:left');
              }
              playerRooms.delete(playerId);
              broadcastRoomList(io);
            });
            controller.setOnPlayerStand((playerId) => {
              const playerSocket = io.sockets.sockets.get(playerId);
              if (playerSocket) {
                playerSocket.emit('room:stood-up');
              }
            });
            controller.setOnRoomEmpty(() => {
              console.log(`[Room] onRoomEmpty triggered for room ${roomId} (auto-restart) — cleaning up controller`);
              controller!.cleanup();
              gameControllers.delete(roomId);

              const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
              if (socketsInRoom && socketsInRoom.size > 0) {
                broadcastRoomList(io);
                return;
              }
              RoomManager.deleteRoom(roomId);
              broadcastRoomList(io);
            });
            gameControllers.set(roomId, controller);
            controller.startGame();
            io.to(room.id).emit('room:updated', room);
            broadcastRoomList(io);

            for (const player of room.players) {
              if (!player.isAI) {
                const personalState = controller.getSanitizedStateForPlayer(player.id);
                if (personalState) {
                  io.to(player.id).emit('game:state', personalState);
                }
              }
            }
          }
        }
      } catch (err: any) {
        socket.emit('error', err.message);
      }
    });

    // Stand up — player will be removed from the game at the start of the next hand
    socket.on('room:stand', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        socket.emit('error', 'Not in a room');
        return;
      }
      const controller = gameControllers.get(roomId);
      if (controller) {
        controller.handlePlayerStand(socket.id);
        socket.emit('room:stood-up');
        console.log(`[Room] ${username} stood up in room ${roomId}`);
      }
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
      // Register kick callback for timed-out players
      controller.setOnPlayerKick((playerId) => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
          playerSocket.leave(roomId);
          playerSocket.emit('room:left');
        }
        playerRooms.delete(playerId);
        broadcastRoomList(io);
      });
      // Register stand callback for auto-stood-up players (e.g. timeout)
      controller.setOnPlayerStand((playerId) => {
        const playerSocket = io.sockets.sockets.get(playerId);
        if (playerSocket) {
          playerSocket.emit('room:stood-up');
        }
      });
      // Register callback for when only AI players remain in the players list
      controller.setOnRoomEmpty(() => {
        // Always cleanup the controller — no point in AI-only games continuing
        console.log(`[Room] onRoomEmpty triggered for room ${roomId} — cleaning up controller`);
        controller.cleanup();
        gameControllers.delete(roomId);

        // Check if there are still spectators (sockets in the room)
        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom && socketsInRoom.size > 0) {
          // Spectators are still watching — keep the room alive in 'waiting' status
          // They can sit down and a new game will auto-start
          broadcastRoomList(io);
          return;
        }
        // No one connected — destroy the room entirely
        RoomManager.deleteRoom(roomId);
        broadcastRoomList(io);
      });
      gameControllers.set(roomId, controller);

      controller.startGame();
      console.log(`[Room] Game started in room "${room.name}" (${room.id}) — ${room.players.length} players`);

      // Broadcast room status update so clients navigate to the game page
      io.to(room.id).emit('room:updated', room);
      broadcastRoomList(io);

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

    // Resync: re-send current game state to a player (e.g. after page reload)
    socket.on('game:resync', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const controller = gameControllers.get(roomId);
      if (!controller) return;

      const personalState = controller.getSanitizedStateForPlayer(socket.id);
      if (personalState) {
        socket.emit('game:state', personalState);
      }
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

  const username = (socket as any).data?.username || socket.id;
  console.log(`[Room] ${username} leaving room ${roomId}`);

  // Leave the socket room FIRST so subsequent broadcasts don't reach the leaving player
  socket.leave(roomId);
  playerRooms.delete(socket.id);
  socket.emit('room:left');

  // If a game is in progress, force-fold the leaving player
  const controller = gameControllers.get(roomId);
  if (controller) {
    controller.handlePlayerLeave(socket.id);
  }

  const room = RoomManager.leaveRoom(roomId, socket.id);

  if (room) {
    // Check if there are still human sockets in the room (players + spectators)
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    const humanPlayers = room.players.filter(p => !p.isAI);
    const pendingHumans = (room.pendingPlayers || []).filter(p => !p.isAI);
    const hasHumanPlayers = humanPlayers.length > 0 || pendingHumans.length > 0;
    const hasHumanSockets = socketsInRoom && socketsInRoom.size > 0;

    if (!hasHumanPlayers && !hasHumanSockets) {
      // No human players and no spectators — destroy the room
      console.log(`[Room] Destroying room ${roomId} — no human players or spectators remaining`);
      if (controller) {
        controller.cleanup();
        gameControllers.delete(roomId);
      }
      RoomManager.deleteRoom(roomId);
    } else {
      io.to(room.id).emit('room:updated', room);
    }
  } else {
    // Room was deleted by RoomManager
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
        // Build a set of player IDs for quick lookup
        const playerIds = new Set(room.players.map(p => p.id));

        // Get all sockets in the room (includes spectators)
        const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom) {
          for (const socketId of socketsInRoom) {
            const isPlayer = playerIds.has(socketId);
            if (isPlayer) {
              // Active player — send their personalized state (with their own cards)
              const playerSocket = io.sockets.sockets.get(socketId);
              const player = room.players.find(p => p.id === socketId);
              if (playerSocket && player && !player.isAI) {
                const personalState = controller.getSanitizedStateForPlayer(socketId);
                if (personalState) {
                  playerSocket.emit(event as 'game:state', personalState);
                }
              }
            } else {
              // Spectator — send sanitized state (no hole cards visible)
              const spectatorSocket = io.sockets.sockets.get(socketId);
              if (spectatorSocket) {
                const spectatorState = controller.getSanitizedStateForPlayer(socketId);
                if (spectatorState) {
                  spectatorSocket.emit(event as 'game:state', spectatorState);
                }
              }
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
      // Send personalized showdown state to each socket
      // (early wins hide other players' cards; real showdowns reveal all)
      const controller2 = gameControllers.get(roomId);
      if (controller2) {
        const gameState = controller2.getSanitizedStateForShowdown(room.players[0]?.id || '');
        if (gameState?.winners) {
          settleChips(roomId, gameState);
        }

        const playerIds2 = new Set(room.players.map(p => p.id));
        const socketsInRoom2 = io.sockets.adapter.rooms.get(roomId);
        if (socketsInRoom2) {
          for (const socketId of socketsInRoom2) {
            const sock = io.sockets.sockets.get(socketId);
            if (!sock) continue;
            const isPlayer2 = playerIds2.has(socketId);
            const player2 = room.players.find(p => p.id === socketId);
            if (isPlayer2 && player2 && player2.isAI) continue; // skip AI sockets
            const personalState = controller2.getSanitizedStateForShowdown(socketId);
            if (personalState) {
              sock.emit('game:ended', personalState);
            }
          }
        }
      }
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
