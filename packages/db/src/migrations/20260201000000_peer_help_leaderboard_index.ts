import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>) {
  // Supports the peer help leaderboard, which counts completed requests per
  // helper within a time range.
  await sql`
    create index help_requests_completed_helper_idx
    on help_requests (helper_id, finished_at)
    where status = 'completed'
  `.execute(db);
}

export async function down(db: Kysely<any>) {
  await db.schema.dropIndex('help_requests_completed_helper_idx').execute();
}
