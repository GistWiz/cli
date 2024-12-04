#!/usr/bin/env bun

import { Command } from 'commander'

import { gists } from './cmd/gists'
import { index } from './cmd/index'
import { queue } from './cmd/queue'
import { query } from './cmd/query'
import { serve } from './cmd/serve'

import { worker } from './cmd/queue/worker'

const program = new Command()

program
  .name("gistwiz")
  .description("GistWiz is a command-line interface (CLI) for fetching, indexing and searching authenticated GitHub Gists.")
  .version("1.0.0")

program
  .command("gists")
  .description("Fetch Authenticated Gists via the GitHub API")
  .requiredOption("--token <token>", "GitHub API Personal Access Token")
  .action(async (options) => await gists({ token: options.token }))

program
  .command("queue")
  .description("Queue a fetch job")
  .requiredOption("--token <token>", "GitHub API Personal Access Token")
  .action(async (options) => {
    try {
      await queue(options.token || process.env.GIST_API_TOKEN);
    } catch (error: any) {
      console.error(`Error queuing job: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command("index")
  .description("Index Redisearch data from logs using a GitHub token")
  .requiredOption("--token <token>", "GitHub API Personal Access Token")
  .action(async (options) => {
    const token = options.token || process.env.GIST_API_TOKEN

    try {
      await index(token)
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
  .command("worker")
  .description("Start the worker to process queued fetch jobs")
  .action(async () => await worker())

program.parse()