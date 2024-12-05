import fs from 'fs'
import path from 'path'
import { GistWizOctokit } from '../lib/gistwiz/octokit'

const LOG_DIR = '/var/log/gistwiz'

export async function gists({
  token,
  jsonl = true,
  redisearch = true,
}: {
  token: string;
  jsonl?: boolean;
  redisearch?: boolean;
}): Promise<void> {
  const LOG_PROGRESS_THRESHOLD = 750

  const octokit = GistWizOctokit(token)

  const startTime = Date.now()

  const username = await octokit.username()
  const JSONL_FILE = path.join(LOG_DIR, `${username}.jsonl`)
  const REDISEARCH_FILE = path.join(LOG_DIR, `${username}.redis`)
  const USER_RUN_FILE = path.join(LOG_DIR, `${username}.json`)

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    console.log(`Created directory: ${LOG_DIR}`)
  }

  const metadata = fs.existsSync(USER_RUN_FILE)
    ? JSON.parse(fs.readFileSync(USER_RUN_FILE, "utf8"))
    : { etag: null }
  const previousEtag = metadata.etag

  console.log("\nOutput Targets")
  console.log(`Cache file: ${USER_RUN_FILE}`)
  console.log(`JSONL file: ${JSONL_FILE}`)
  console.log(`Redis file: ${REDISEARCH_FILE}`)

  console.log(`\nAuthenticated as: ${username}`)

  let totalGists;
  try {
    totalGists = await octokit.count()
    console.log(`Total gists available: ${totalGists}`)
  } catch (error: any) {
    console.error(`Error calculating total gists: ${error.message}`)
    process.exit(1)
  }

  console.log(`\nPrevious ETag: ${previousEtag || "None"}`)

  let currentEtag
  try {
    const response = await octokit.request("GET /gists", { per_page: 1 })
    currentEtag = response.headers.etag
    console.log(`Current ETag:  ${currentEtag}`)
  } catch (error: any) {
    console.error(`Error fetching initial ETag: ${error.message}`)
    process.exit(1)
  }

  if (currentEtag === previousEtag) {
    console.error("\nETags Matched: Skipping fetch!")
    process.exit(1)
  }

  console.error("\nCache Missed\n")
  console.log("Starting fetch...")

  let processedCount = 0

  try {
    const iterator = octokit.paginate.iterator(octokit.rest.gists.list, {
      per_page: 100,
    });

    const jsonlOutput = jsonl ? fs.createWriteStream(JSONL_FILE) : null
    const redisearchOutput = redisearch ? fs.createWriteStream(REDISEARCH_FILE) : null

    if (redisearchOutput) {
      redisearchOutput.write(
        `MULTI\nFT.DROPINDEX ${username} DD\nFT.CREATE ${username} ON HASH PREFIX 1 "${username}:" SCHEMA gist_id TEXT username TAG description TEXT\n`
      )
    }

    for await (const { data: gists } of iterator) {
      for (const gist of gists) {
        if (jsonl) {
          jsonlOutput?.write(
            JSON.stringify({ id: gist.id, description: gist.description }) + "\n"
          );
        }
        if (redisearch) {
          redisearchOutput?.write(
            `HSET ${username}:${gist.id} gist_id "${gist.id}" description "${gist.description || ""}"\n`
          )
        }
        processedCount++
      }

      // Log progress at intervals defined by LOG_PROGRESS_THRESHOLD
      if (processedCount % LOG_PROGRESS_THRESHOLD === 0) {
        console.log(`Processed ${processedCount} gists...`)
      }
    }

    // Finalize outputs and confirm files were written
    const fileClosePromises: Promise<void>[] = []

    if (redisearchOutput) {
      redisearchOutput.write("EXEC\n")
      const promise = new Promise<void>((resolve, reject) => {
        redisearchOutput.end(() => {
          if (fs.existsSync(REDISEARCH_FILE)) {
            console.log(`Redisearch output written to: ${REDISEARCH_FILE}`)
            resolve()
          } else {
            console.error(`Failed to write Redisearch output to: ${REDISEARCH_FILE}`)
            reject(new Error("Redisearch file write failed"))
          }
        })
      })
      fileClosePromises.push(promise)
    }

    if (jsonlOutput) {
      const promise = new Promise<void>((resolve, reject) => {
        jsonlOutput.end(() => {
          if (fs.existsSync(JSONL_FILE)) {
            console.log(`JSONL output written to: ${JSONL_FILE}`)
            resolve()
          } else {
            console.error(`Failed to write JSONL output to: ${JSONL_FILE}`)
            reject(new Error("JSONL file write failed"))
          }
        })
      })
      fileClosePromises.push(promise)
    }

    await Promise.all(fileClosePromises)

    console.log(`\nProcessed ${processedCount} gists out of ${totalGists} available.`)
    console.log(`\nElapsed time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`)

    fs.writeFileSync(
      USER_RUN_FILE,
      JSON.stringify({ etag: currentEtag }, null, 2)
    );
    if (fs.existsSync(USER_RUN_FILE)) {
      console.log(`Cache file saved to: ${USER_RUN_FILE}`)
    } else {
      console.error(`Failed to save cache file to: ${USER_RUN_FILE}`)
    }

    process.exit(0)
  } catch (error: any) {
    console.error(`Error during fetch: ${error.message}`)
    process.exit(1)
  }
}