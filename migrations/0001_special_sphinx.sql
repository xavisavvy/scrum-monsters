ALTER TABLE "user_profiles" ADD COLUMN "total_xp" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "current_level" integer DEFAULT 1 NOT NULL;