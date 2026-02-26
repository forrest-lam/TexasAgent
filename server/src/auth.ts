import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET || 'texas-agent-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

export interface JwtPayload {
  userId: string;
  username: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

// Express middleware
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  (req as any).userId = payload.userId;
  (req as any).username = payload.username;
  next();
}

// Socket.IO middleware — extract user from token in auth handshake
// Allows anonymous (guest) connections for spectating; authenticated for playing
export function socketAuthMiddleware(socket: any, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;
  if (!token) {
    // Allow anonymous connection as guest (spectate-only)
    socket.data.userId = `guest-${socket.id}`;
    socket.data.username = `Guest_${socket.id.slice(0, 6)}`;
    socket.data.isGuest = true;
    return next();
  }

  const payload = verifyToken(token);
  if (!payload) {
    return next(new Error('Invalid token'));
  }

  socket.data.userId = payload.userId;
  socket.data.username = payload.username;
  socket.data.isGuest = false;
  next();
}
