import { pgTable, text, serial, integer, boolean, timestamp, json, real, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - extended with auth fields
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password"), // Nullable for OAuth-only users
  email: text("email").unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// OAuth accounts - links external providers to users (many-to-one)
export const oauthAccounts = pgTable("oauth_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'google' | 'github'
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User profiles - game preferences and settings
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  preferredAvatar: text("preferred_avatar"), // Default avatar class
  preferredTeam: text("preferred_team"), // 'developers' | 'qa' | 'spectators'
  audioEnabled: boolean("audio_enabled").default(true),
  musicVolume: real("music_volume").default(0.5),
  sfxVolume: real("sfx_volume").default(0.7),
  settings: json("settings").$type<Record<string, unknown>>(), // Extensible settings
  totalXP: integer("total_xp").default(0).notNull(),
  currentLevel: integer("current_level").default(1).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User stats - gameplay metrics
export const userStats = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  gamesPlayed: integer("games_played").default(0).notNull(),
  ticketsEstimated: integer("tickets_estimated").default(0).notNull(),
  accuracyScore: real("accuracy_score").default(0), // Percentage of times in consensus
  bossesDefeated: integer("bosses_defeated").default(0).notNull(),
  totalDamageDealt: integer("total_damage_dealt").default(0).notNull(),
  totalHealing: integer("total_healing").default(0).notNull(),
  revivesPerformed: integer("revives_performed").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Estimation history - per-ticket tracking
export const estimationHistory = pgTable("estimation_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lobbyId: text("lobby_id"),
  ticketId: text("ticket_id"),
  ticketTitle: text("ticket_title"),
  estimatedPoints: integer("estimated_points"),
  consensusPoints: integer("consensus_points"),
  wasInConsensus: boolean("was_in_consensus"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sessions table for PostgreSQL session store
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

// Class mastery progress - per-class XP tracking
export const classMasteryProgress = pgTable("class_mastery_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  avatarClass: text("avatar_class").notNull(),
  classXP: integer("class_xp").default(0).notNull(),
  currentTier: text("current_tier").default('Novice').notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserClass: unique().on(table.userId, table.avatarClass),
}));

// Schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  email: true,
  displayName: true,
  avatarUrl: true,
});

export const insertOAuthAccountSchema = createInsertSchema(oauthAccounts).pick({
  userId: true,
  provider: true,
  providerAccountId: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  userId: true,
  preferredAvatar: true,
  preferredTeam: true,
  audioEnabled: true,
  musicVolume: true,
  sfxVolume: true,
  settings: true,
  totalXP: true,
  currentLevel: true,
});

export const insertUserStatsSchema = createInsertSchema(userStats).pick({
  userId: true,
  gamesPlayed: true,
  ticketsEstimated: true,
  accuracyScore: true,
  bossesDefeated: true,
  totalDamageDealt: true,
  totalHealing: true,
  revivesPerformed: true,
});

export const insertEstimationHistorySchema = createInsertSchema(estimationHistory).pick({
  userId: true,
  lobbyId: true,
  ticketId: true,
  ticketTitle: true,
  estimatedPoints: true,
  consensusPoints: true,
  wasInConsensus: true,
});

export const insertClassMasteryProgressSchema = createInsertSchema(classMasteryProgress).pick({
  userId: true,
  avatarClass: true,
  classXP: true,
  currentTier: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertOAuthAccount = z.infer<typeof insertOAuthAccountSchema>;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;
export type UserStats = typeof userStats.$inferSelect;

export type InsertEstimationHistory = z.infer<typeof insertEstimationHistorySchema>;
export type EstimationHistory = typeof estimationHistory.$inferSelect;

export type InsertClassMasteryProgress = z.infer<typeof insertClassMasteryProgressSchema>;
export type ClassMasteryProgress = typeof classMasteryProgress.$inferSelect;
