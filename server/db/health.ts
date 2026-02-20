// server/db/health.ts
import { storage } from "../storage.js";
import { PgStorage } from "../storage.js";
import { dbLogger } from '../logger.js';

export async function checkDatabaseHealth(): Promise<void> {
  if (!(storage instanceof PgStorage)) {
    dbLogger.info("Skipping database health check (using in-memory storage)");
    return;
  }

  try {
    dbLogger.info("Checking database health...");
    const sql = storage.getSql();
    await sql`SELECT 1 as health`;
    dbLogger.info("Database connection healthy");
  } catch (error) {
    const dbUrl = process.env.DATABASE_URL || "";
    const maskedUrl = maskConnectionString(dbUrl);
    dbLogger.error({
      connection: maskedUrl,
      err: error,
      possibleCauses: [
        'Database server not running',
        'Invalid credentials',
        'Network connectivity',
        'Firewall'
      ]
    }, 'Database health check failed');
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
