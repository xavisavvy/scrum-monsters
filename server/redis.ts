import Redis from 'ioredis';
import { spawn, execSync } from 'child_process';

let redisClient: Redis | null = null;
let isConnected = false;
let redisProcess: ReturnType<typeof spawn> | null = null;

const REDIS_CONFIG = {
  host: '127.0.0.1',
  port: 6379,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  lazyConnect: true,
};

const CACHE_TTL = {
  LOBBY: 3600,
  PLAYER_SESSION: 7200,
  GAME_STATE: 1800,
};

async function startRedisServer(): Promise<boolean> {
  try {
    execSync('redis-cli ping', { stdio: 'pipe' });
    console.log('🔴 Redis already running');
    return true;
  } catch {
    console.log('🔴 Starting Redis server...');
    try {
      redisProcess = spawn('redis-server', ['--bind', '127.0.0.1', '--port', '6379', '--loglevel', 'warning'], {
        detached: true,
        stdio: 'ignore',
      });
      redisProcess.unref();
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      try {
        execSync('redis-cli ping', { stdio: 'pipe' });
        console.log('✅ Redis server started');
        return true;
      } catch {
        console.log('⚠️  Redis server failed to start');
        return false;
      }
    } catch (error) {
      console.log('⚠️  Could not spawn Redis server');
      return false;
    }
  }
}

export async function initializeRedis(): Promise<boolean> {
  const serverStarted = await startRedisServer();
  if (!serverStarted) {
    return false;
  }

  try {
    redisClient = new Redis({
      ...REDIS_CONFIG,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.log('⚠️  Redis connection failed after 3 attempts - running without cache');
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });

    redisClient.on('connect', () => {
      console.log('🔴 Redis connected');
      isConnected = true;
    });

    redisClient.on('error', (err) => {
      if (isConnected) {
        console.error('Redis error:', err.message);
      }
    });

    redisClient.on('close', () => {
      isConnected = false;
    });

    await redisClient.connect();
    await redisClient.ping();
    console.log('✅ Redis initialized successfully');
    return true;
  } catch (error) {
    console.log('⚠️  Redis not available - running without cache');
    redisClient = null;
    isConnected = false;
    return false;
  }
}

export function getRedisClient(): Redis | null {
  return isConnected ? redisClient : null;
}

export function isRedisConnected(): boolean {
  return isConnected && redisClient !== null;
}

export async function cacheLobby(lobbyId: string, lobbyData: any): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(
      `lobby:${lobbyId}`,
      CACHE_TTL.LOBBY,
      JSON.stringify(lobbyData)
    );
  } catch (error) {
    console.error('Redis cache lobby error:', error);
  }
}

export async function getCachedLobby(lobbyId: string): Promise<any | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(`lobby:${lobbyId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis get lobby error:', error);
    return null;
  }
}

export async function deleteCachedLobby(lobbyId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.del(`lobby:${lobbyId}`);
  } catch (error) {
    console.error('Redis delete lobby error:', error);
  }
}

export async function cachePlayerSession(
  playerId: string,
  sessionData: { lobbyId: string; reconnectToken: string; playerName: string }
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(
      `player:${playerId}`,
      CACHE_TTL.PLAYER_SESSION,
      JSON.stringify(sessionData)
    );
    await client.setex(
      `token:${sessionData.reconnectToken}`,
      CACHE_TTL.PLAYER_SESSION,
      playerId
    );
  } catch (error) {
    console.error('Redis cache player session error:', error);
  }
}

export async function getCachedPlayerSession(playerId: string): Promise<any | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(`player:${playerId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis get player session error:', error);
    return null;
  }
}

export async function getPlayerIdByToken(reconnectToken: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    return await client.get(`token:${reconnectToken}`);
  } catch (error) {
    console.error('Redis get player by token error:', error);
    return null;
  }
}

export async function deletePlayerSession(playerId: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const sessionData = await getCachedPlayerSession(playerId);
    if (sessionData?.reconnectToken) {
      await client.del(`token:${sessionData.reconnectToken}`);
    }
    await client.del(`player:${playerId}`);
  } catch (error) {
    console.error('Redis delete player session error:', error);
  }
}

export async function cacheGameState(lobbyId: string, gameState: any): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(
      `game:${lobbyId}`,
      CACHE_TTL.GAME_STATE,
      JSON.stringify(gameState)
    );
  } catch (error) {
    console.error('Redis cache game state error:', error);
  }
}

export async function getCachedGameState(lobbyId: string): Promise<any | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(`game:${lobbyId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Redis get game state error:', error);
    return null;
  }
}

export async function getAllActiveLobbies(): Promise<string[]> {
  const client = getRedisClient();
  if (!client) return [];

  try {
    const keys = await client.keys('lobby:*');
    return keys.map(key => key.replace('lobby:', ''));
  } catch (error) {
    console.error('Redis get all lobbies error:', error);
    return [];
  }
}

export async function shutdownRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('🔴 Redis connection closed');
    } catch (error) {
      console.error('Redis shutdown error:', error);
    }
    redisClient = null;
    isConnected = false;
  }
}
