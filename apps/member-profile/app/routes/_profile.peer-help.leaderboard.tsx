import dayjs from 'dayjs';
import {
  type LoaderFunctionArgs,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { z } from 'zod';

import { track } from '@oyster/core/mixpanel';
import { getPeerHelpLeaderboard } from '@oyster/core/peer-help';
import { Modal, Text } from '@oyster/ui';
import { Select, SelectItem } from '@oyster/ui/select';

import { Leaderboard } from '@/shared/components/leaderboard';
import { Route } from '@/shared/constants';
import { getTimezone } from '@/shared/cookies.server';
import { ensureUserAuthenticated, user } from '@/shared/session.server';

const LEADERBOARD_SIZE = 10;

const LeaderboardSearchParams = z.object({
  timeframe: z.enum(['all_time', 'this_month', 'this_week']).catch('this_week'),
});

type Timeframe = z.infer<typeof LeaderboardSearchParams>['timeframe'];

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await ensureUserAuthenticated(request);
  const memberId = user(session);

  const { searchParams } = new URL(request.url);

  const { timeframe } = LeaderboardSearchParams.parse(
    Object.fromEntries(searchParams)
  );

  const { me, top } = await getPeerHelpLeaderboard({
    limit: LEADERBOARD_SIZE,
    where: {
      finishedAfter: getFinishedAfter(timeframe, getTimezone(request)),
      memberId,
    },
  });

  track({
    event: 'Peer Help Leaderboard Viewed',
    properties: { Timeframe: timeframe },
    request,
    user: memberId,
  });

  return { me, timeframe, top };
}

function getFinishedAfter(timeframe: Timeframe, timezone: string) {
  const now = dayjs().tz(timezone);

  switch (timeframe) {
    case 'all_time':
      return null;

    case 'this_month':
      return now.startOf('month').toDate();

    case 'this_week':
      return now.startOf('week').toDate();
  }
}

const EMPTY_MESSAGE: Record<Timeframe, string> = {
  all_time: 'No one has completed a help request yet. Be the first!',
  this_month: 'No one has helped a peer this month yet. Be the first!',
  this_week: 'No one has helped a peer this week yet. Be the first!',
};

export default function PeerHelpLeaderboardModal() {
  const { me, timeframe, top } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Don't carry the leaderboard's timeframe back to the Peer Help page.
  const closeParams = new URLSearchParams(searchParams);
  closeParams.delete('timeframe');

  return (
    <Modal
      onCloseTo={{
        pathname: Route['/peer-help'],
        search: closeParams.toString(),
      }}
    >
      <Modal.Header>
        <Modal.Title>Peer Help Leaderboard 🏆</Modal.Title>
        <Modal.CloseButton />
      </Modal.Header>

      <Text color="gray-500" variant="sm">
        The members who have helped the most peers. Thank you for giving back!
      </Text>

      <Select
        onValueChange={(value) => {
          setSearchParams(
            (params) => {
              params.set('timeframe', value);

              return params;
            },
            { preventScrollReset: true }
          );
        }}
        value={timeframe}
      >
        <SelectItem value="this_week">This Week</SelectItem>
        <SelectItem value="this_month">This Month</SelectItem>
        <SelectItem value="all_time">All-Time</SelectItem>
      </Select>

      {top.length ? (
        <Leaderboard.List>
          {top.map((position) => {
            return <PositionItem key={position.id} position={position} />;
          })}
        </Leaderboard.List>
      ) : (
        <Text color="gray-500">{EMPTY_MESSAGE[timeframe]}</Text>
      )}

      {me && (
        <div className="border-t border-gray-200 pt-4">
          <Leaderboard.List>
            <PositionItem position={me} />
          </Leaderboard.List>
        </div>
      )}
    </Modal>
  );
}

type Position = ReturnType<typeof useLoaderData<typeof loader>>['top'][number];

function PositionItem({ position }: { position: Position }) {
  return (
    <Leaderboard.Item
      firstName={position.firstName}
      id={position.id}
      isMe={position.me}
      label={
        <Leaderboard.ItemLabel>
          {position.count}{' '}
          <span className="text-sm">
            {position.count === 1 ? 'Peer Helped' : 'Peers Helped'}
          </span>
        </Leaderboard.ItemLabel>
      }
      lastName={position.lastName}
      position={position.rank}
      profilePicture={position.profilePicture || undefined}
    />
  );
}
