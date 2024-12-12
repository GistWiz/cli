import ms from 'ms'
import { GistWizOctokit } from '../lib/octokit/plugin/gistwiz-octokit'
import { Queue } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const QUEUE_NAME = process.env.QUEUE_NAME_GISTS || ''

export async function queue({ token }: { token: string }): Promise<void> {
  const octokit = GistWizOctokit(token)
  const username = await octokit.username()

  if (!username) {
    console.error('Error: username could not be retrieved.');
    process.exit(1);
  }

  let queue: Queue | undefined

  try {
    queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } })

    const scheduledJob = await queue.upsertJobScheduler(`${QUEUE_NAME}-${username}`,
      {
        every: ms('10m'),
        immediately: true,
      },
      {
        name: `${QUEUE_NAME}-${username}`,
        data: { token },
        opts: {}
      }
    )

    console.debug(`Job scheduled successfully for ${username} with ID: ${scheduledJob.id}`)
    process.exit(0)
  } catch (error: any) {
    console.error(`Error while scheduling job for ${username}: ${error.message}`)
    process.exit(1)
  }
}