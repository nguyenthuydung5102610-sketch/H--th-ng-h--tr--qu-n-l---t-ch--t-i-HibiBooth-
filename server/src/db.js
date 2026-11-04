import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export async function writeAudit(client, userId, action, entityType, entityId, details = {}) {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId ?? null, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details)],
  );
}
