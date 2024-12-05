import { createServer, IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import Redis from 'ioredis'
import { format } from '../lib/redis'
import { GistWizOctokit } from '../lib/gistwiz-octokit'

const redis = new Redis()

const corsPreflightRequestHandler = (req: IncomingMessage, res: ServerResponse): boolean => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
  return req.method !== 'OPTIONS'
    ? false
    : (res.writeHead(204), res.end(), true)
}

const escapeRedisQuery = (term: string): string => term.replace(/([@{}[\]])/g, '\\$1')

export async function serve(port: number) {
  const server = createServer(async (req, res) => {
    console.debug('Received request:', req.method, req.url)

    if (corsPreflightRequestHandler(req, res)) {
      return
    }

    const fullUrl = new URL(req.url || '', `http://${req.headers.host}`)
    const pathname = fullUrl.pathname

    console.debug('Parsed pathname:', pathname)
    const regexMatch = /^\/qs\/?$/.test(pathname)
    console.debug('Regex match result:', regexMatch)

    if (regexMatch) {
      const term = decodeURIComponent(fullUrl.searchParams.get('term') || '')
      const token = req.headers['authorization']?.split(/\s+/).pop()

      if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Authorization token is required.' }))
      }

      let query = ''
      let username = ''

      try {
        const octokit = GistWizOctokit(token)
        username = await octokit.username()

        if (!username) {
          console.error('Failed to retrieve username')
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Failed to retrieve username.' }))
        }

        if (!term) {
          console.error('Error: term is required but missing in the request')
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'term parameter is required.' }))
        }

        console.debug('Received search term:', term)

        query = `(@description:${escapeRedisQuery(term)})`
        console.debug(`Executing Redis query: FT.SEARCH ${username} '${query}' RETURN 2 gist_id description`)

        const response = await redis.call(
          'FT.SEARCH',
          username,
          query,
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
        if (error.name === 'ReplyError' && error.message.includes('no such index')) {
          console.warn(`Index for username "${username}" does not exist.`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify([]))
        }

        console.error('Error querying Redis:', error.message, { query, username })
        res.writeHead(500, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Internal Server Error' }))
      }
    } else {
      console.debug('No matching route found for pathname:', pathname)
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not Found' }))
    }
  })

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
}