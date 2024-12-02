#!/usr/bin/env bun

import { Command } from "commander"
import { fetchGists } from "./cmd/fetch"
import { indexRedisData } from "./cmd/index"
import { startServer } from "./cmd/serve"
import { queryRedis } from "./cmd/query"
import { queue } from "./cmd/queue"
import { worker } from "./cmd/queue/worker"

const program = new Command()

program
  .name("gistwiz")
  .description("CLI tool for managing gists")
  .version("1.0.0")

program
  .command("fetch")
  .description("Fetch gists from GitHub")
  .option("--token <token>", "GitHub token")
  .option("--jsonl", "Output in JSONL format")
  .option("--redisearch", "Output in Redisearch format")
  .action(async (options) => {
    await fetchGists({
      token: options.token || process.env.GIST_API_TOKEN,
      jsonl: options.jsonl,
      redisearch: options.redisearch,
    })
  })

program
  .command("index")
  .description("Index Redisearch data from logs using a GitHub token")
  .option("--token <token>", "GitHub token (or set via GIST_API_TOKEN environment variable)")
  .action(async (options) => {
    const token = options.token || process.env.GIST_API_TOKEN

    try {
      await indexRedisData(token)
    } catch (error: any) {
      console.error(`Unexpected error: ${error.message}`)
      process.exit(1)
    }
  })

program
  .command('serve')
  .description('Start the autocomplete server')
  .option('--port <port>', 'Port to run the server on (default: 3721)', '3721')
  .action(async (options) => {
    const port = Number(options.port);

    if (isNaN(port) || port <= 0) {
      console.error('Invalid port number. Please provide a valid positive number for the port.');
      process.exit(1);
    }

    try {
      await startServer(port)
    } catch (error: any) {
      console.error(`Error starting server: ${error.message}`)
      process.exit(1)
    }
  })

program
  .command("query")
  .description("Query Redisearch for indexed gists")
  .requiredOption("--username <username>", "Redisearch username to query")
  .argument("<text>", "Search text")
  .action(async (text, options) => {
    const { username } = options

    try {
      await queryRedis(username, text) // Let the function handle output
    } catch (error: any) {
      console.error(`Error executing query: ${error.message}`)
      process.exit(1)
    }
  })

program
  .command("worker")
  .description("Start the worker to process queued fetch jobs")
  .action(async () => await worker())

program
  .command("queue")
  .description("Queue a fetch job")
  .option("--token <token>", "GitHub token (required)")
  .action(async (options) => {
    try {
      await queue(options.token || process.env.GIST_API_TOKEN);
    } catch (error: any) {
      console.error(`Error queuing job: ${error.message}`);
      process.exit(1);
    }
  });


program.parse()