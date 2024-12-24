import { count } from './count'
import { gists } from './gists'
import { Worker } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const QUEUE_NAME = process.env.QUEUE_NAME_GISTS || ''

export const worker = async (): Promise<void> => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: any) => {
      try {
        const { token } = job.data
        if (!token) throw new Error('Token is missing from the job data.')

        console.log(`Processing job ID: ${job.id}`)

        await job.updateData(await gists({ token }))

        console.log(`Job ID ${job.id} completed successfully.`)
      } catch (error: any) {
        console.error(`Error processing job ID ${job.id}: ${error.message}`)
        process.exit(1)
      }
    },
    {
      connection: { url: REDIS_URL }
    }
  )

  worker.on('completed', async (job: any) => {
    await count(job.data.username, job.data.count, job.data.updated)
    console.log(`Job ID ${job.id} has been completed.`, { count: job.data.count })
  })

  worker.on('error', (err: any) => console.error(`Worker encountered an error: ${err.message}`))

  worker.on('failed', (job: any, err: any) => console.error(`Job ID ${job.id} failed with error: ${err.message}`))

  console.log(`Worker is listening for jobs on queue: ${QUEUE_NAME}`)
}