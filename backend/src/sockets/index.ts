import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../services/token.service';

/**
 * Realtime push.
 *
 * Two rules make this safe:
 *
 * 1. The handshake is authenticated with the same access token the REST API
 *    uses. An unauthenticated socket is refused outright — a connection that
 *    can subscribe before proving who it is has no way to be scoped later.
 *
 * 2. Every client is placed in a room named after its own user id, and the
 *    server only ever emits to rooms. Broadcasting financial events to the
 *    default namespace would hand every connected client everyone else's
 *    income, which is the realtime version of forgetting `WHERE user_id = $1`.
 */

export type SocketEvent =
  | 'income:created'
  | 'income:updated'
  | 'income:deleted'
  | 'expense:created'
  | 'expense:updated'
  | 'expense:deleted'
  | 'budget:alert';

const room = (userId: string) => `user:${userId}`;

/**
 * Held at module scope so services can emit without taking a dependency on the
 * HTTP server. It stays null when the app runs without a server attached —
 * under Supertest, for instance — and every emit becomes a silent no-op rather
 * than a crash.
 */
let io: Server | null = null;

export const initSockets = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    // Same ceiling as the JSON body parser: nothing a client sends up this
    // channel should ever be large.
    maxHttpBufferSize: 100_000,
  });

  io.use((socket, next) => {
    // Accept either the socket.io auth payload or a bearer header, so browser
    // and native clients can each use whichever they already have.
    const header = socket.handshake.headers.authorization;
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined);

    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      return next();
    } catch {
      // Deliberately opaque: the client cannot act on the difference between an
      // expired and a forged token, and saying which would help an attacker.
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(room(userId));
    logger.debug({ userId, socketId: socket.id }, 'socket connected');

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  logger.info('Socket.IO ready');
  return io;
};

/** Emits to one user's room. A no-op when no server is attached. */
export const emitToUser = (userId: string, event: SocketEvent, payload: unknown): void => {
  io?.to(room(userId)).emit(event, payload);
};

export const closeSockets = async (): Promise<void> => {
  await io?.close();
  io = null;
};
