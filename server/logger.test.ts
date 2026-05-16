import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

interface MockLogger {
  trace: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  fatal: ReturnType<typeof vi.fn>;
  child: ReturnType<typeof vi.fn>;
}

const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

const createMockLogger = (): MockLogger => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
});

async function loadLoggerModule(options?: {
  nodeEnv?: string;
  logLevel?: string | null;
  randomUUID?: (() => string) | undefined;
  randomBytesHex?: string;
}) {
  vi.resetModules();

  process.env.NODE_ENV = options?.nodeEnv ?? 'test';
  if (options?.logLevel === undefined || options.logLevel === null) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = options.logLevel;
  }

  if (options && 'randomUUID' in options) {
    vi.stubGlobal('crypto', { randomUUID: options.randomUUID });
  } else {
    vi.stubGlobal('crypto', {});
  }

  const captured = {
    config: undefined as Record<string, unknown> | undefined,
  };

  const rootLogger = createMockLogger();
  const httpLogger = createMockLogger();
  const socketLogger = createMockLogger();
  const gameLogger = createMockLogger();
  const dbLogger = createMockLogger();
  const authLogger = createMockLogger();

  rootLogger.child.mockImplementation((bindings?: Record<string, unknown>) => {
    switch (bindings?.component) {
      case 'http':
        return httpLogger;
      case 'socket':
        return socketLogger;
      case 'game':
        return gameLogger;
      case 'db':
        return dbLogger;
      case 'auth':
        return authLogger;
      default:
        return createMockLogger();
    }
  });

  const randomBytes = vi.fn(() => Buffer.from(options?.randomBytesHex ?? '0011223344556677', 'hex'));
  // Minimal mock — logger.ts only imports `randomBytes` from `crypto`.
  // Avoid `vi.importActual('crypto')` because Vite's resolver treats Node
  // built-ins as `__vite-browser-external` placeholders, which crash with
  // `ERR_INVALID_ARG_VALUE` ("must be a file URL"). If logger.ts grows to
  // import more from crypto, extend this mock surface explicitly.
  vi.doMock('crypto', () => ({
    randomBytes,
    default: { randomBytes },
  }));
  vi.doMock('pino', () => {
    const pinoMock = vi.fn((config: Record<string, unknown>) => {
      captured.config = config;
      return rootLogger;
    });

    const stdTimeFunctions = { isoTime: 'isoTime' };

    return {
      __esModule: true,
      default: Object.assign(pinoMock, { stdTimeFunctions }),
      stdTimeFunctions,
    };
  });

  const module = await import('./logger');

  return {
    module,
    captured,
    randomBytes,
    rootLogger,
    httpLogger,
    socketLogger,
    gameLogger,
    dbLogger,
    authLogger,
  };
}

afterEach(() => {
  vi.doUnmock('crypto');
  vi.doUnmock('pino');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();

  process.env.NODE_ENV = originalNodeEnv;
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = originalLogLevel;
  }
});

describe('logger configuration', () => {
  it('uses pretty transport outside production and defaults to debug level', async () => {
    const { captured } = await loadLoggerModule({ nodeEnv: 'development', logLevel: null });

    expect(captured.config?.level).toBe('debug');
    expect(captured.config?.timestamp).toBe('isoTime');
    expect(captured.config?.redact).toEqual({
      paths: [
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        '*.password',
        '*.token',
        '*.secret',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      censor: '[REDACTED]',
    });
    expect(captured.config?.transport).toEqual({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    });
  });

  it('uses production defaults without pretty transport and respects LOG_LEVEL', async () => {
    const { captured } = await loadLoggerModule({ nodeEnv: 'production', logLevel: 'warn' });

    expect(captured.config?.level).toBe('warn');
    expect(captured.config?.transport).toBeUndefined();
  });
});

describe('logger helpers', () => {
  it('creates scoped child loggers and emits structured game and socket events', async () => {
    const { gameLogger, module, socketLogger } = await loadLoggerModule();

    const lobbyLogger = createMockLogger();
    const playerLogger = createMockLogger();
    gameLogger.child.mockReturnValueOnce(lobbyLogger).mockReturnValueOnce(playerLogger).mockReturnValueOnce(lobbyLogger);

    expect(module.createLobbyLogger('LOBBY1')).toBe(lobbyLogger);
    expect(module.createPlayerLogger('player-1', 'Alice')).toBe(playerLogger);

    expect(gameLogger.child).toHaveBeenNthCalledWith(1, { lobbyCode: 'LOBBY1' });
    expect(gameLogger.child).toHaveBeenNthCalledWith(2, {
      playerId: 'player-1',
      playerName: 'Alice',
    });

    module.logGameEvent('combat:boss_damaged', { damage: 42 });
    expect(gameLogger.info).toHaveBeenCalledWith({
      event: 'combat:boss_damaged',
      damage: 42,
    });

    module.logGameEvent('session:phase_changed', { phase: 'battle' }, 'LOBBY1');
    expect(gameLogger.child).toHaveBeenNthCalledWith(3, { lobbyCode: 'LOBBY1' });
    expect(lobbyLogger.info).toHaveBeenCalledWith({
      event: 'session:phase_changed',
      phase: 'battle',
    });

    module.logSocketEvent('session:player_joined', { lobbyCode: 'LOBBY1' }, 'socket-1');
    expect(socketLogger.info).toHaveBeenCalledWith({
      event: 'session:player_joined',
      socketId: 'socket-1',
      lobbyCode: 'LOBBY1',
    });
  });
});

describe('httpLoggerMiddleware', () => {
  it('uses the incoming request id and logs successful requests', async () => {
    const { httpLogger, module } = await loadLoggerModule();
    const requestLogger = createMockLogger();
    const finishHandlers: Array<() => void> = [];

    httpLogger.child.mockReturnValue(requestLogger);

    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      get: vi.fn().mockReturnValue('123'),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandlers.push(handler);
        }
      }),
    };
    const req = {
      method: 'GET',
      url: '/api/lobbies',
      headers: {
        'x-request-id': 'req-123',
        'user-agent': 'vitest',
      },
      ip: '127.0.0.1',
      connection: {
        remoteAddress: '10.0.0.1',
      },
    };
    const next = vi.fn();

    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(145);

    module.httpLoggerMiddleware()(req as unknown as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'req-123');
    expect(httpLogger.child).toHaveBeenCalledWith({ requestId: 'req-123' });
    expect(requestLogger.debug).toHaveBeenCalledWith({
      msg: 'Request started',
      method: 'GET',
      url: '/api/lobbies',
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });
    expect(next).toHaveBeenCalledTimes(1);

    finishHandlers[0]();

    expect(requestLogger.info).toHaveBeenCalledWith({
      msg: 'Request completed',
      method: 'GET',
      url: '/api/lobbies',
      statusCode: 200,
      duration: 45,
      contentLength: '123',
    });
  });

  it('falls back to crypto.randomUUID and warns for client errors', async () => {
    const { httpLogger, module } = await loadLoggerModule({
      randomUUID: () => 'generated-request-id',
    });
    const requestLogger = createMockLogger();
    const finishHandlers: Array<() => void> = [];

    httpLogger.child.mockReturnValue(requestLogger);

    const res = {
      statusCode: 404,
      setHeader: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandlers.push(handler);
        }
      }),
    };
    const req = {
      method: 'POST',
      url: '/api/missing',
      headers: {},
      connection: {
        remoteAddress: '10.0.0.2',
      },
    };

    vi.spyOn(Date, 'now').mockReturnValueOnce(200).mockReturnValueOnce(260);

    module.httpLoggerMiddleware()(req as unknown as Request, res as unknown as Response, vi.fn());
    finishHandlers[0]();

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', 'generated-request-id');
    expect(requestLogger.debug).toHaveBeenCalledWith({
      msg: 'Request started',
      method: 'POST',
      url: '/api/missing',
      userAgent: undefined,
      ip: '10.0.0.2',
    });
    expect(requestLogger.warn).toHaveBeenCalledWith({
      msg: 'Request completed',
      method: 'POST',
      url: '/api/missing',
      statusCode: 404,
      duration: 60,
      contentLength: undefined,
    });
  });

  it('logs server errors at error level and falls back to randomBytes when no crypto.randomUUID is available', async () => {
    const { httpLogger, module } = await loadLoggerModule();
    const requestLogger = createMockLogger();
    const finishHandlers: Array<() => void> = [];

    httpLogger.child.mockReturnValue(requestLogger);

    const res = {
      statusCode: 503,
      setHeader: vi.fn(),
      get: vi.fn().mockReturnValue('0'),
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'finish') {
          finishHandlers.push(handler);
        }
      }),
    };
    const req = {
      method: 'DELETE',
      url: '/api/lobbies/ABC123',
      headers: {},
      connection: {
        remoteAddress: '10.0.0.3',
      },
    };

    vi.spyOn(Date, 'now').mockReturnValueOnce(300).mockReturnValueOnce(375);

    module.httpLoggerMiddleware()(req as unknown as Request, res as unknown as Response, vi.fn());
    finishHandlers[0]();

    // With no x-request-id header and no crypto.randomUUID, the middleware must
    // fall back to randomBytes(8).toString('hex') — a 16-char lowercase hex string.
    // This pins the security-sensitive fallback added when Math.random() was removed.
    const setHeaderCall = res.setHeader.mock.calls.find(([name]) => name === 'X-Request-ID');
    expect(setHeaderCall).toBeDefined();
    const requestId = setHeaderCall?.[1] as string;
    expect(requestId).toMatch(/^[0-9a-f]{16}$/);
    expect(httpLogger.child).toHaveBeenCalledWith({ requestId });
    expect(requestLogger.error).toHaveBeenCalledWith({
      msg: 'Request completed',
      method: 'DELETE',
      url: '/api/lobbies/ABC123',
      statusCode: 503,
      duration: 75,
      contentLength: '0',
    });
  });
});
