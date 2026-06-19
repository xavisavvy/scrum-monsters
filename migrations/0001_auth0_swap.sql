DROP TABLE "oauth_accounts" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth0_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth0_sub_unique" UNIQUE("auth0_sub");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password";
