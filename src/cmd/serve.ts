import { createServer } from 'http'
import { URL } from 'url'

import Redis from 'ioredis'
import { Octokit } from '@octokit/rest'
import { retry } from '@octokit/plugin-retry'

import { format } from '../lib/redis'

const GistWizOctoKit = Octokit.plugin(retry)

const redis = new Redis()

const corsPreflightRequestHandler = (req: any, res: any): boolean => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method !== 'OPTIONS') false
  res.writeHead(204)
  res.end()
  return true
}

export async function serve(port: number) {
  const server = createServer(async (req, res) => {
    if (corsPreflightRequestHandler(req, res)) { return }
    if (req.method === 'GET' && req.url?.startsWith('/qs')) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const searchQuery = url.searchParams.get('query')
      const token = req.headers['authorization']?.split(/\s+/).pop()

      const octokit = new GistWizOctoKit({ auth: token, retry: { retries: 3 } })
      const username = await (await octokit.rest.users.getAuthenticated()).data.login

      console.debug('credentials', { token, username })

      if (!username) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'username is required in the path.' }))
      }

      if (!searchQuery) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'query parameter is required.' }))
      }

      console.debug('Received query:', searchQuery)

      try {
        const redisQuery = `(@description:${searchQuery})`
        console.debug(`Executing Redis query: FT.SEARCH ${username} '${redisQuery}' RETURN 2 gist_id description`)

        // execute redis query
        const response = await redis.call(
          'FT.SEARCH',
          username,
          redisQuery,
          'RETURN',
          '2',
          'gist_id',
          'description'
        )
        const formattedResults = format(response)

        console.debug('Final formatted results:', formattedResults)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(formattedResults))
      } catch (error: any) {
        // missing index error
        if (error.name === 'ReplyError' && error.message.includes('no such index')) {
          console.warn(`Index for username "${username}" does not exist.`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify([]))
        }

        console.error('Error querying Redis:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify([]))
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not Found' }))
    }
  })

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
}