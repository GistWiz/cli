import { Octokit } from "octokit"
import { exec } from "child_process"
import path from "path"
import fs from "fs"

const LOG_DIR = "/var/log/gistwiz"
const REDIS_CONTAINER = "redis-stack-server" // The name of your Redis container

export async function indexRedisData(token: string): Promise<void> {
  if (!token) {
    console.error("Error: A token must be provided either via --token or the GIST_API_TOKEN environment variable.")
    process.exit(1)
  }

  // Initialize Octokit to fetch the username
  const octokit = new Octokit({ auth: token })
  let username: string

  try {
    username = (await octokit.rest.users.getAuthenticated()).data.login
    console.log(`Authenticated as: ${username}`)
  } catch (error: any) {
    console.error(`Error fetching authenticated user: ${error.message}`)
    process.exit(1)
  }

  // Construct file path
  const redisFile = path.join(LOG_DIR, `${username}.redis`)
  console.log(`\nReading from: ${redisFile}`)
  console.log(`Sending data to Redis container: ${REDIS_CONTAINER}\n`)

  // Check if the redis file exists
  if (!fs.existsSync(redisFile)) {
    console.error(`Error: Redis file not found at ${redisFile}`)
    process.exit(1)
  }

  // Execute the command
  const command = `cat ${redisFile} | docker exec -i ${REDIS_CONTAINER} redis-cli`

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`\nError executing command: ${error.message}`)
      process.exit(1)
    }

    if (stderr) {
      console.error(`\nError: ${stderr}`)
      process.exit(1)
    }

    console.log(`${stdout}`)
    console.log(`Indexing completed successfully`)
    process.exit(0)
  })
}