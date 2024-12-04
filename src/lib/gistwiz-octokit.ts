import { Octokit } from "@octokit/rest"
import { retry } from "@octokit/plugin-retry"
import { throttling } from "@octokit/plugin-throttling"
import { version } from '../../package.json'

interface OctokitExtended extends Octokit {
  count: () => Promise<number>;
  username: () => Promise<string>;
}

const GistWizOctokitPlugin = (octokit: OctokitExtended) => {
  octokit.count = async () => {
    try {
      // request the first page to get the `Link` header
      const response = await octokit.request("GET /gists", { ...{}, per_page: 100, page: 1 })
      const linkHeader = response.headers.link

      // If no pagination, return the count from the first page
      if (!linkHeader) return response.data.length
      // Extract the last page number from the `Link` header
      const lastPageMatch = linkHeader.match(/&page=(\d+)>; rel="last"/)
      if (!lastPageMatch) return response.data.length // Fall back to the first page count
      const lastPage = parseInt(lastPageMatch[1], 10)

      // Fetch the last page to count its records
      const lastPageResponse = await octokit.request("GET /gists", { ...{}, per_page: 100, page: lastPage })
      const lastPageCount = lastPageResponse.data.length

      // Correctly calculate the total count
      return (100 * (lastPage - 1)) + lastPageCount
    } catch (error: any) {
      octokit.log.error(`Failed to calculate total count: ${error.message}`)
      throw error
    }
  }

  octokit.username = async () => {
    try {
      return (await octokit.rest.users.getAuthenticated()).data.login
    } catch (error: any) {
      octokit.log.error(`Failed to get username: ${error.message}`)
      throw error
    }
  }
}

export const GistWizOctokit = (token: string) => new (Octokit.plugin(throttling, retry, GistWizOctokitPlugin as any))({
  auth: token,
  userAgent: `GistWizOctokit v${version}`,
  throttle: {
    onRateLimit: (retryAfter) => {
      console.error(`Rate limit exceeded. Retrying in ${retryAfter}s`)
      return true
    },
    onSecondaryRateLimit: (retryAfter) => {
      console.error(`Secondary rate limit hit. Retrying in ${retryAfter}s`)
      return true
    },
  },
  retry: { retries: 3 },
})