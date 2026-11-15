import { db } from '../shared/db';
import { IS_PRODUCTION } from '../shared/env';

/**
 * Adds mock completed help requests for existing members so the Peer Help
 * leaderboard has data to show locally. Safe to re-run: it removes the mock
 * rows it created previously (ids prefixed with "mock-help-").
 *
 * Usage: `bun db:seed:peer-help` (from the repo root).
 */

if (IS_PRODUCTION) {
  throw new Error('Cannot seed mock data in production.');
}

const PREFIX = 'mock-help-';
const TYPES = ['career_advice', 'mock_interview', 'resume_review'];
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const members = await db
    .selectFrom('students')
    .select('id')
    .orderBy('createdAt', 'asc')
    .limit(15)
    .execute();

  if (members.length < 2) {
    throw new Error('Need at least 2 members. Run `bun db:seed` first.');
  }

  await db
    .deleteFrom('helpRequests')
    .where('id', 'like', `${PREFIX}%`)
    .execute();

  const [helpee, ...helpers] = members;
  const rows = [];

  // Helper i completes (n - i + 1) requests, spaced ~9 days apart, so the
  // week / month / all-time views produce different rankings. With enough
  // members, the later helpers fall outside the top 10 to exercise the pinned
  // "your position" row, and a couple of helpers tie.
  helpers.forEach((helper, i) => {
    const count = Math.max(1, Math.ceil((helpers.length - i) / 1.5));

    for (let j = 0; j < count; j++) {
      const finishedAt = new Date(Date.now() - j * 9 * DAY - i * DAY);

      rows.push({
        createdAt: new Date(finishedAt.getTime() - DAY),
        description: 'Mock help request for leaderboard testing.',
        finishedAt,
        helpeeId: helpee.id,
        helperId: helper.id,
        id: `${PREFIX}${i}-${j}`,
        status: 'completed',
        type: TYPES[(i + j) % TYPES.length],
      });
    }

    // Requests that must NOT be counted.
    rows.push({
      description: 'Mock in-progress request.',
      helpeeId: helpee.id,
      helperId: helper.id,
      id: `${PREFIX}${i}-in-progress`,
      status: 'in_progress',
      type: 'career_advice',
    });
  });

  await db.insertInto('helpRequests').values(rows).execute();

  console.log(
    `Inserted ${rows.length} mock help requests across ${helpers.length} helpers. ✅`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.destroy());
