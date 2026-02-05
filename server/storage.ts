import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  users,
  oauthAccounts,
  userProfiles,
  userStats,
  estimationHistory,
  type User,
  type InsertUser,
  type OAuthAccount,
  type InsertOAuthAccount,
  type UserProfile,
  type InsertUserProfile,
  type UserStats,
  type InsertUserStats,
  type EstimationHistory,
  type InsertEstimationHistory,
} from "@shared/schema";

// Extended interface with auth CRUD methods
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;

  // OAuth methods
  getOAuthAccount(provider: string, providerAccountId: string): Promise<OAuthAccount | undefined>;
  findOrCreateOAuthUser(
    provider: string,
    profile: {
      id: string;
      email?: string;
      displayName?: string;
      avatarUrl?: string;
    }
  ): Promise<User>;
  linkOAuthAccount(userId: number, account: InsertOAuthAccount): Promise<OAuthAccount>;
  getUserOAuthAccounts(userId: number): Promise<OAuthAccount[]>;

  // Profile methods
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: number, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;

  // Stats methods
  getUserStats(userId: number): Promise<UserStats | undefined>;
  createUserStats(stats: InsertUserStats): Promise<UserStats>;
  updateUserStats(userId: number, data: Partial<InsertUserStats>): Promise<UserStats | undefined>;
  incrementUserStat(userId: number, stat: keyof InsertUserStats, amount?: number): Promise<UserStats | undefined>;

  // Estimation history methods
  getEstimationHistory(userId: number, limit?: number): Promise<EstimationHistory[]>;
  recordEstimation(entry: InsertEstimationHistory): Promise<EstimationHistory>;
}

// In-memory storage implementation (default when no DATABASE_URL)
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private oauthAccounts: Map<number, OAuthAccount>;
  private userProfiles: Map<number, UserProfile>;
  private userStatsMap: Map<number, UserStats>;
  private estimationHistoryList: EstimationHistory[];
  private currentUserId: number;
  private currentOAuthId: number;
  private currentProfileId: number;
  private currentStatsId: number;
  private currentHistoryId: number;

  constructor() {
    this.users = new Map();
    this.oauthAccounts = new Map();
    this.userProfiles = new Map();
    this.userStatsMap = new Map();
    this.estimationHistoryList = [];
    this.currentUserId = 1;
    this.currentOAuthId = 1;
    this.currentProfileId = 1;
    this.currentStatsId = 1;
    this.currentHistoryId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    const user: User = {
      id,
      username: insertUser.username,
      password: insertUser.password || null,
      email: insertUser.email || null,
      displayName: insertUser.displayName || null,
      avatarUrl: insertUser.avatarUrl || null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated: User = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  // OAuth methods
  async getOAuthAccount(provider: string, providerAccountId: string): Promise<OAuthAccount | undefined> {
    return Array.from(this.oauthAccounts.values()).find(
      (acc) => acc.provider === provider && acc.providerAccountId === providerAccountId
    );
  }

  async findOrCreateOAuthUser(
    provider: string,
    profile: { id: string; email?: string; displayName?: string; avatarUrl?: string }
  ): Promise<User> {
    // Check if OAuth account exists
    const existingAccount = await this.getOAuthAccount(provider, profile.id);
    if (existingAccount) {
      const user = await this.getUser(existingAccount.userId);
      if (user) return user;
    }

    // Check if user exists by email
    if (profile.email) {
      const existingUser = await this.getUserByEmail(profile.email);
      if (existingUser) {
        // Link OAuth account to existing user
        await this.linkOAuthAccount(existingUser.id, {
          userId: existingUser.id,
          provider,
          providerAccountId: profile.id,
        });
        return existingUser;
      }
    }

    // Create new user
    const username = profile.email?.split("@")[0] || `${provider}_${profile.id}`;
    const user = await this.createUser({
      username,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    // Link OAuth account
    await this.linkOAuthAccount(user.id, {
      userId: user.id,
      provider,
      providerAccountId: profile.id,
    });

    // Create default profile and stats
    await this.createUserProfile({ userId: user.id });
    await this.createUserStats({ userId: user.id });

    return user;
  }

  async linkOAuthAccount(userId: number, account: InsertOAuthAccount): Promise<OAuthAccount> {
    const id = this.currentOAuthId++;
    const oauthAccount: OAuthAccount = {
      id,
      userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      accessToken: account.accessToken || null,
      refreshToken: account.refreshToken || null,
      expiresAt: account.expiresAt || null,
      createdAt: new Date(),
    };
    this.oauthAccounts.set(id, oauthAccount);
    return oauthAccount;
  }

  async getUserOAuthAccounts(userId: number): Promise<OAuthAccount[]> {
    return Array.from(this.oauthAccounts.values()).filter(
      (acc) => acc.userId === userId
    );
  }

  // Profile methods
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    return Array.from(this.userProfiles.values()).find(
      (profile) => profile.userId === userId
    );
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const id = this.currentProfileId++;
    const userProfile: UserProfile = {
      id,
      userId: profile.userId,
      preferredAvatar: profile.preferredAvatar || null,
      preferredTeam: profile.preferredTeam || null,
      audioEnabled: profile.audioEnabled ?? true,
      musicVolume: profile.musicVolume ?? 0.5,
      sfxVolume: profile.sfxVolume ?? 0.7,
      settings: profile.settings || null,
      totalXP: profile.totalXP ?? 0,
      currentLevel: profile.currentLevel ?? 1,
      updatedAt: new Date(),
    };
    this.userProfiles.set(id, userProfile);
    return userProfile;
  }

  async updateUserProfile(userId: number, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const profile = await this.getUserProfile(userId);
    if (!profile) return undefined;
    const updated: UserProfile = {
      ...profile,
      ...data,
      updatedAt: new Date(),
    };
    this.userProfiles.set(profile.id, updated);
    return updated;
  }

  // Stats methods
  async getUserStats(userId: number): Promise<UserStats | undefined> {
    return Array.from(this.userStatsMap.values()).find(
      (stats) => stats.userId === userId
    );
  }

  async createUserStats(stats: InsertUserStats): Promise<UserStats> {
    const id = this.currentStatsId++;
    const userStatsEntry: UserStats = {
      id,
      userId: stats.userId,
      gamesPlayed: stats.gamesPlayed ?? 0,
      ticketsEstimated: stats.ticketsEstimated ?? 0,
      accuracyScore: stats.accuracyScore ?? 0,
      bossesDefeated: stats.bossesDefeated ?? 0,
      totalDamageDealt: stats.totalDamageDealt ?? 0,
      totalHealing: stats.totalHealing ?? 0,
      revivesPerformed: stats.revivesPerformed ?? 0,
      updatedAt: new Date(),
    };
    this.userStatsMap.set(id, userStatsEntry);
    return userStatsEntry;
  }

  async updateUserStats(userId: number, data: Partial<InsertUserStats>): Promise<UserStats | undefined> {
    const stats = await this.getUserStats(userId);
    if (!stats) return undefined;
    const updated: UserStats = {
      ...stats,
      ...data,
      updatedAt: new Date(),
    };
    this.userStatsMap.set(stats.id, updated);
    return updated;
  }

  async incrementUserStat(userId: number, stat: keyof InsertUserStats, amount: number = 1): Promise<UserStats | undefined> {
    const stats = await this.getUserStats(userId);
    if (!stats) return undefined;
    const currentValue = (stats[stat] as number) || 0;
    return this.updateUserStats(userId, { [stat]: currentValue + amount });
  }

  // Estimation history methods
  async getEstimationHistory(userId: number, limit: number = 50): Promise<EstimationHistory[]> {
    return this.estimationHistoryList
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async recordEstimation(entry: InsertEstimationHistory): Promise<EstimationHistory> {
    const id = this.currentHistoryId++;
    const historyEntry: EstimationHistory = {
      id,
      userId: entry.userId,
      lobbyId: entry.lobbyId || null,
      ticketId: entry.ticketId || null,
      ticketTitle: entry.ticketTitle || null,
      estimatedPoints: entry.estimatedPoints ?? null,
      consensusPoints: entry.consensusPoints ?? null,
      wasInConsensus: entry.wasInConsensus ?? null,
      createdAt: new Date(),
    };
    this.estimationHistoryList.push(historyEntry);
    return historyEntry;
  }
}

// PostgreSQL storage implementation
export class PgStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor(connectionString: string) {
    const client = postgres(connectionString);
    this.db = drizzle(client);
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values({
      username: insertUser.username,
      password: insertUser.password || null,
      email: insertUser.email || null,
      displayName: insertUser.displayName || null,
      avatarUrl: insertUser.avatarUrl || null,
    }).returning();
    return result[0];
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const result = await this.db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  // OAuth methods
  async getOAuthAccount(provider: string, providerAccountId: string): Promise<OAuthAccount | undefined> {
    const result = await this.db.select().from(oauthAccounts)
      .where(and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerAccountId, providerAccountId)
      ))
      .limit(1);
    return result[0];
  }

  async findOrCreateOAuthUser(
    provider: string,
    profile: { id: string; email?: string; displayName?: string; avatarUrl?: string }
  ): Promise<User> {
    // Check if OAuth account exists
    const existingAccount = await this.getOAuthAccount(provider, profile.id);
    if (existingAccount) {
      const user = await this.getUser(existingAccount.userId);
      if (user) return user;
    }

    // Check if user exists by email
    if (profile.email) {
      const existingUser = await this.getUserByEmail(profile.email);
      if (existingUser) {
        // Link OAuth account to existing user
        await this.linkOAuthAccount(existingUser.id, {
          userId: existingUser.id,
          provider,
          providerAccountId: profile.id,
        });
        return existingUser;
      }
    }

    // Create new user
    const username = profile.email?.split("@")[0] || `${provider}_${profile.id}`;
    const user = await this.createUser({
      username,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    // Link OAuth account
    await this.linkOAuthAccount(user.id, {
      userId: user.id,
      provider,
      providerAccountId: profile.id,
    });

    // Create default profile and stats
    await this.createUserProfile({ userId: user.id });
    await this.createUserStats({ userId: user.id });

    return user;
  }

  async linkOAuthAccount(userId: number, account: InsertOAuthAccount): Promise<OAuthAccount> {
    const result = await this.db.insert(oauthAccounts).values({
      userId,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      accessToken: account.accessToken || null,
      refreshToken: account.refreshToken || null,
      expiresAt: account.expiresAt || null,
    }).returning();
    return result[0];
  }

  async getUserOAuthAccounts(userId: number): Promise<OAuthAccount[]> {
    return await this.db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  }

  // Profile methods
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const result = await this.db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    return result[0];
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const result = await this.db.insert(userProfiles).values({
      userId: profile.userId,
      preferredAvatar: profile.preferredAvatar || null,
      preferredTeam: profile.preferredTeam || null,
      audioEnabled: profile.audioEnabled ?? true,
      musicVolume: profile.musicVolume ?? 0.5,
      sfxVolume: profile.sfxVolume ?? 0.7,
      settings: profile.settings || null,
    }).returning();
    return result[0];
  }

  async updateUserProfile(userId: number, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const result = await this.db.update(userProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId))
      .returning();
    return result[0];
  }

  // Stats methods
  async getUserStats(userId: number): Promise<UserStats | undefined> {
    const result = await this.db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    return result[0];
  }

  async createUserStats(stats: InsertUserStats): Promise<UserStats> {
    const result = await this.db.insert(userStats).values({
      userId: stats.userId,
      gamesPlayed: stats.gamesPlayed ?? 0,
      ticketsEstimated: stats.ticketsEstimated ?? 0,
      accuracyScore: stats.accuracyScore ?? 0,
      bossesDefeated: stats.bossesDefeated ?? 0,
      totalDamageDealt: stats.totalDamageDealt ?? 0,
      totalHealing: stats.totalHealing ?? 0,
      revivesPerformed: stats.revivesPerformed ?? 0,
    }).returning();
    return result[0];
  }

  async updateUserStats(userId: number, data: Partial<InsertUserStats>): Promise<UserStats | undefined> {
    const result = await this.db.update(userStats)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userStats.userId, userId))
      .returning();
    return result[0];
  }

  async incrementUserStat(userId: number, stat: keyof InsertUserStats, amount: number = 1): Promise<UserStats | undefined> {
    const stats = await this.getUserStats(userId);
    if (!stats) return undefined;
    const currentValue = (stats[stat] as number) || 0;
    return this.updateUserStats(userId, { [stat]: currentValue + amount });
  }

  // Estimation history methods
  async getEstimationHistory(userId: number, limit: number = 50): Promise<EstimationHistory[]> {
    return await this.db.select()
      .from(estimationHistory)
      .where(eq(estimationHistory.userId, userId))
      .orderBy(desc(estimationHistory.createdAt))
      .limit(limit);
  }

  async recordEstimation(entry: InsertEstimationHistory): Promise<EstimationHistory> {
    const result = await this.db.insert(estimationHistory).values({
      userId: entry.userId,
      lobbyId: entry.lobbyId || null,
      ticketId: entry.ticketId || null,
      ticketTitle: entry.ticketTitle || null,
      estimatedPoints: entry.estimatedPoints ?? null,
      consensusPoints: entry.consensusPoints ?? null,
      wasInConsensus: entry.wasInConsensus ?? null,
    }).returning();
    return result[0];
  }
}

// Create storage instance based on environment
function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    console.log("📦 Using PostgreSQL storage");
    return new PgStorage(process.env.DATABASE_URL);
  }
  console.log("📦 Using in-memory storage (no DATABASE_URL set)");
  return new MemStorage();
}

export const storage = createStorage();
