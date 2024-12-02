import { Queue } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const QUEUE_NAME = 'fetch-gists-for-user-token'

export async function queue(token: string): Promise<void> {
  if (!token) {
    console.error("Error: token is required.")
    process.exit(1)
  }

  let queue: Queue | undefined

  try {
    queue = new Queue(QUEUE_NAME, { connection: { url: REDIS_URL } })

    const job = await queue.upsertJobScheduler('fetch-gists-repeat-every-3m',
      {
        every: 180000,
        immediately: true,
      },
      {
        name: `fetch-gists-for-user-token-${token}`,
        data: { token },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
          removeOnFail: 1000,
        }
      }
    )

    console.log(`recurring job scheduled successfully for ${token} with ID: ${job.id}`)
    process.exit(0)
  } catch (error: any) {
    console.error(`Error adding job to the queue: ${error.message}`)
    process.exit(1)
  } finally {
    if (queue) await queue.close()
  }
}