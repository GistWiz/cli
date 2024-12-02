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
    const job = await queue.add('fetchGistsJob', { token })
    console.log(`Added job ID: ${job.id} to the queue.`)
    process.exit(0)
  } catch (error: any) {
    console.error(`Error adding job to the queue: ${error.message}`)
    process.exit(1)
  } finally {
    if (queue) {
      await queue.close() // Ensures the queue connection is properly closed
      console.log("Queue connection closed.")
    }
  }
}