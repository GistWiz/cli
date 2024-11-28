import Redis from "ioredis"

const redis = new Redis() // Defaults to localhost:6379

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
  const formatted = toEntries(redisResponse.slice(1), toEntries)

  return Object.entries(formatted).map(([key, value]: [string, any]) => ({
    id: value.gist_id,
    url: key.split(":").filter((_, idx) => idx > 0).reverse().concat("https://gist.github.com").reverse().join("/"),
    description: value.description || "No description available",
  }))
}

export async function queryRedis(username: string, searchQuery: string): Promise<void> {
  if (!username || !searchQuery) {
    console.error("Error: Both username and search query are required.")
    process.exit(1)
  }

  try {
    const redisQuery = `(@description:${searchQuery})`
    const redisResponse = await redis.call(
      "FT.SEARCH",
      username,
      redisQuery,
      "RETURN",
      "2",
      "gist_id",
      "description"
    )

    const results = format(redisResponse)

    // Print results as one line per record
    results.forEach((result) => {
      console.log(`${result.id} ${result.url} ${result.description}`)
    })
  } catch (error: any) {
    console.error(`Error querying Redis: ${error.message}`)
    process.exit(1)
  } finally {
    redis.disconnect() // Ensure the Redis connection is closed
  }

  process.exit(0)
}