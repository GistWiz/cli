import { Queue } from 'bullmq'
import ms from 'ms'
import { GistWizOctokit } from '../lib/octokit/plugin/gistwiz-octokit'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const QUEUE_NAME = 'fetch-gists-for-authenticated-user'

const PLAN = {
  '10m': { interval: ms('10m'), attempts: 3 },
  '30m': { interval: ms('30m'), attempts: 7 },
  '60m': { interval: ms('60m'), attempts: 7 },
}

export async function queue(token: string): Promise<void> {
  console.log(`Queueing job for ${token}`)

  const octokit = GistWizOctokit(token)
  const username = await octokit.username()

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