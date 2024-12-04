import { Queue } from 'bullmq'
import { Octokit } from '@octokit/rest';
import ms from 'ms'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const QUEUE_NAME = 'fetch-gists-for-authenticated-user'

const PLAN = {
  '10m': { interval: ms('10m'), attempts: 9 },
  '30m': { interval: ms('30m'), attempts: 14 },
  '60m': { interval: ms('60m'), attempts: 16 },
}

const getUsername = async (token: string): Promise<string> => {
  const octokit = new Octokit({ auth: token })

  try {
    return (await octokit.rest.users.getAuthenticated()).data.login
  } catch (error: any) {
    console.error('Error fetching username from GitHub:', error.message);
    throw new Error('Failed to fetch username');
  }
}

export async function queue(token: string): Promise<void> {
  if (!token) {
    console.error("Error: token is required.")
    process.exit(1)
  }

  const username = await getUsername(token);

  if (!username) {
    console.error('Error: username could not be retrieved.');
    process.exit(1);
  }

  let queue: Queue | undefined

  try {
    queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } })

    const scheduledJob = await queue.upsertJobScheduler(`recurring-job-to-${QUEUE_NAME}`,
      {
        every: ms('10m'),
        immediately: true,
      },
      {
        name: `${QUEUE_NAME}-${username}`,
        data: { token },
        opts: {
          backoff: { type: 'exponential', delay: ms('1s') },
          attempts: PLAN['10m'].attempts,
          removeOnComplete: true,
          removeOnFail: 1000,
        }
      }
    )

    console.debug(`Job scheduled successfully for ${username} with ID: ${scheduledJob.id}`)
    process.exit(0)
  } catch (error: any) {
    console.error(`Error while scheduling job for ${username}: ${error.message}`)
    process.exit(1)
  } finally {
    if (queue) await queue.close()
  }
}