import { Worker } from 'bullmq'
import { gists } from '../gists'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const QUEUE_NAME = 'fetch-gists-for-user-token'

export async function worker(): Promise<void> {
  const gistWorker = new Worker(
    QUEUE_NAME,
    async (job: any) => {
      try {
        const { token } = job.data
        if (!token) throw new Error('Token is missing from the job data.')

        console.log(`Processing job ID: ${job.id}`)
        console.log(`Fetching gists using token: ${token}`)
        await gists({ token })
        console.log(`Job ID ${job.id} completed successfully.`)
      } catch (error: any) {
        console.error(`Error processing job ID ${job.id}: ${error.message}`)
        throw error
      }
    },
    {
      connection: { url: REDIS_URL }
    }
  );

  gistWorker.on('completed', (job: any) => console.log(`Job ID ${job.id} has been completed.`))
  gistWorker.on('failed', (job: any, err: any) => console.error(`Job ID ${job.id} failed with error: ${err.message}`))

  console.log(`Worker is listening for jobs on queue: ${QUEUE_NAME}`)
}