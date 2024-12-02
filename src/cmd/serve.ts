import { createServer } from 'http'
import { URL } from 'url'
import Redis from 'ioredis'

// Initialize the Redis client
const redis = new Redis() // Defaults to localhost:6379

// Helper function to generate the URL from the result id
const generateUrl = (id: string): string => {
  return id.split(':').filter((_, idx) => idx > 0).reverse().concat('https://gist.github.com').reverse().join('/')
}

function toEntries(keyValueArray: string[], transform: (value: any) => any = (value) => value) {
  return Object.fromEntries(
    keyValueArray.reduce((acc: [string, any][], curr, idx, arr) => {
      if (idx % 2 === 0) {
        acc.push([curr, transform(arr[idx + 1])])
      }
      return acc
    }, [])
  )
}

const format = (redisResponse: any): any[] => {
  console.debug('Raw Redis Response:', redisResponse)

  const formatted = toEntries(redisResponse.slice(1), toEntries)

  return Object.entries(formatted).map(([key, value]: [string, any]) => ({
    key,
    description: value.description,
    id: value.gist_id,
    url: generateUrl(key),
  }))
}

// CORS handler function
const handleCors = (req: any, res: any): boolean => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }

  return false
}

// Create the HTTP server
export async function startServer(port: number) {
  const server = createServer(async (req, res) => {
    // Handle CORS preflight requests
    if (handleCors(req, res)) {
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/qs/')) {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const username = url.pathname.split('/qs/')[1]
      const searchQuery = url.searchParams.get('query')

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

        const redisResponse = await redis.call(
          'FT.SEARCH',
          username,
          redisQuery,
          'RETURN',
          '2',
          'gist_id',
          'description'
        )
        const formattedResults = format(redisResponse)

        console.debug('Final formatted results:', formattedResults)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(formattedResults))
      } catch (error: any) {
        // missing index
        if (error.name === 'ReplyError' && error.message.includes('no such index')) {
          console.warn(`Index for username "${username}" does not exist.`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify([]))
        }

        // all other errors
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