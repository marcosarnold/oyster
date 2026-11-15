import { describe, expect, test } from 'bun:test';

import { db } from '@oyster/db';
import { student1 } from '@oyster/db/test/constants';

import { getPeerHelpLeaderboard } from './peer-help';

type Request = {
  finishedAt?: Date;
  helperId: string;
  status: string;
};

/**
 * Creates helpers "2" through "(helperCount + 1)" and the given help requests.
 * Member "1" (from the global test seed) is always the helpee.
 */
async function seed(helperCount: number, requests: Request[]) {
  const helpers = Array.from({ length: helperCount }, (_, i) => {
    return { ...student1, email: `${i + 2}@gmail.com`, id: `${i + 2}` };
  });

  await db
    .insertInto('studentEmails')
    .values(helpers.map(({ email }) => ({ email })))
    .execute();

  await db.insertInto('students').values(helpers).execute();

  await db
    .insertInto('helpRequests')
    .values(
      requests.map((request, i) => {
        return {
          description: 'Help!',
          finishedAt: request.finishedAt,
          helpeeId: student1.id,
          helperId: request.helperId,
          id: `request-${i}`,
          status: request.status,
          type: 'career_advice',
        };
      })
    )
    .execute();
}

function completed(helperId: string, finishedAt = new Date()): Request {
  return { finishedAt, helperId, status: 'completed' };
}

describe(getPeerHelpLeaderboard.name, () => {
  test('Should rank helpers by completed requests only.', async () => {
    await seed(2, [
      completed('2'),
      completed('2'),
      completed('3'),
      // None of these should count.
      { helperId: '3', status: 'in_progress' },
      { finishedAt: new Date(), helperId: '3', status: 'not_completed' },
      { helperId: '3', status: 'open' },
    ]);

    const { me, top } = await getPeerHelpLeaderboard({
      limit: 10,
      where: { finishedAfter: null, memberId: '3' },
    });

    expect(top.map((p) => [p.id, p.count, p.rank, p.me])).toEqual([
      ['2', 2, 1, false],
      ['3', 1, 2, true],
    ]);

    // The member is already in the top list, so it isn't returned separately.
    expect(me).toBeUndefined();
  });

  test('Should respect the time range.', async () => {
    const old = new Date('2020-01-01T00:00:00Z');

    await seed(2, [completed('2', old), completed('2', old), completed('3')]);

    const { top } = await getPeerHelpLeaderboard({
      limit: 10,
      where: { finishedAfter: new Date('2024-01-01'), memberId: '1' },
    });

    expect(top.map((p) => p.id)).toEqual(['3']);
  });

  test('Should include ties at the cutoff and share their rank.', async () => {
    await seed(3, [
      completed('2'),
      completed('2'),
      completed('3'),
      completed('4'),
    ]);

    const { top } = await getPeerHelpLeaderboard({
      limit: 2,
      where: { finishedAfter: null, memberId: '1' },
    });

    expect(top.map((p) => [p.id, p.rank])).toEqual([
      ['2', 1],
      ['3', 2],
      ['4', 2],
    ]);
  });

  test("Should return the member's own position when outside the top.", async () => {
    await seed(3, [
      completed('2'),
      completed('2'),
      completed('2'),
      completed('3'),
      completed('3'),
      completed('4'),
    ]);

    const { me, top } = await getPeerHelpLeaderboard({
      limit: 2,
      where: { finishedAfter: null, memberId: '4' },
    });

    expect(top.map((p) => p.id)).toEqual(['2', '3']);
    expect(me).toMatchObject({ count: 1, id: '4', rank: 3 });
  });

  test("Should not return a position for a member who hasn't helped.", async () => {
    await seed(1, [completed('2')]);

    const { me } = await getPeerHelpLeaderboard({
      limit: 1,
      where: { finishedAfter: null, memberId: '1' },
    });

    expect(me).toBeUndefined();
  });
});
