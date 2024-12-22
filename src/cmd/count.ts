import Redis from "ioredis"

const redis = new Redis()

export async function count(username: string, count: string): Promise<void> {
  if (!username || !count) {
    console.error("Error: Both username and count are required.")
    process.exit(1)
  }

  try {
    await redis.call("SET", `gistwiz:gists:${username}:count`, count)
    await redis.call("SET", `gistwiz:gists:${username}:updated`, new Date().toISOString())
  } catch (error: any) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  } finally {
    redis.disconnect()
  }

  process.exit(0)
}