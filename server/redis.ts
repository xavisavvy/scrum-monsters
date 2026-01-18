import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;
let isConnected = false;

const CACHE_TTL = {
  LOBBY: 3600,
  PLAYER_SESSION: 7200,
  GAME_STATE: 1800,
};

export async function initializeRedis(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log('⚠️  Upstash Redis credentials not configured - running without cache');
    console.log('   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable caching');
    return false;
  }

  try {
    redisClient = new Redis({
      url,
      token,
    });

    await redisClient.ping();
    isConnected = true;
    console.log('✅ Upstash Redis initialized successfully');
    return true;
  } catch (error) {
    console.log('⚠️  Upstash Redis connection failed - running without cache');
    console.error('   Error:', error instanceof Error ? error.message : error);
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
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
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
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
  } catch (error) {
    console.error('Redis get player session error:', error);
    return null;
  }
}

export async function getPlayerIdByToken(reconnectToken: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const playerId = await client.get(`token:${reconnectToken}`);
    return playerId as string | null;
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
    return data ? (typeof data === 'string' ? JSON.parse(data) : data) : null;
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
    console.log('🔴 Upstash Redis connection closed');
    redisClient = null;
    isConnected = false;
  }
}
