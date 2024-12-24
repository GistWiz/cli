#!/usr/bin/env bun

import { Command } from 'commander'

import { count } from './cmd/count'
import { gists } from './cmd/gists'
import { query } from './cmd/query'
import { queue } from './cmd/queue'
import { serve } from './cmd/serve'
import { worker } from './cmd/start'

const program = new Command()
program
  .name("gistwiz")
  .description("GistWiz is a command-line interface (CLI) for fetching, indexing and searching authenticated GitHub Gists.")
  .version("1.0.0")

program
  .command("gists")
  .description("Fetch Authenticated Gists via the GitHub API")
  .requiredOption("--token <token>", "GitHub API Personal Access Token")
  .option('-q, --queue [queue]', 'Whether to queue the gists job (default: false)', false)
  .action(async (options) => {
    try {
      await options.queue === true
        ? queue({ token: options.token })
        : gists({ token: options.token })
    } catch (error: any) {
      console.error(`Error: ${error.message}`)
      process.exit(1)
    }
  })

program
  .command('serve')
  .description('Start the autocomplete server')
  .option('--port <port>', 'Port to run the server on (default: 3721)', '3721')
  .action(async (options) => {
    const port = Number(options.port)

    if (isNaN(port) || port <= 0) {
      console.error('Invalid port number. Please provide a valid positive number for the port.')
      process.exit(1)
    }

    try {
      await serve(port)
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
      await query(username, text) // Let the function handle output
    } catch (error: any) {
      console.error(`Error executing query: ${error.message}`)
      process.exit(1)
    }
  })

program
  .command("count")
  .description("Records Count of Indexed Gists")
  .requiredOption("--username <username>", "GitHub Username")
  .argument("<number>", "Count")
  .action(async (__count, options) => {
    const { username } = options

    try {
      await count(username, __count, new Date().toISOString())
    } catch (error: any) {
      console.error(`Error: ${error.message}`)
      process.exit(1)
    }
  })

program
  .command("worker")
  .description("Start the worker to process queued fetch jobs")
  .action(async () => await worker())

program.parse()