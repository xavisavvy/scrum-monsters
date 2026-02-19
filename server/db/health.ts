// server/db/health.ts
import { storage } from "../storage.js";
import { PgStorage } from "../storage.js";

export async function checkDatabaseHealth(): Promise<void> {
  if (!(storage instanceof PgStorage)) {
    console.log("Skipping database health check (using in-memory storage)");
    return;
  }

  try {
    console.log("Checking database health...");
    const sql = storage.getSql();
    await sql`SELECT 1 as health`;
    console.log("Database connection healthy");
  } catch (error) {
    const dbUrl = process.env.DATABASE_URL || "";
    const maskedUrl = maskConnectionString(dbUrl);
    console.error("Database health check failed:");
    console.error(`  Connection: ${maskedUrl}`);
    console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error("");
    console.error("Possible causes:");
    console.error("  - Database server is not running");
    console.error("  - Invalid credentials in DATABASE_URL");
    console.error("  - Network connectivity issues");
    console.error("  - Firewall blocking connection");
    process.exit(1);
  }
}

function maskConnectionString(url: string): string {
  try {
    return url.replace(/:([^:@]+)@/, ":****@");
  } catch {
    return "[invalid URL]";
  }
}
