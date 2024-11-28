export function totalCountPlugin(octokit: any) {
  octokit.totalCount = async function (endpoint: any, parameters = {}) {
    try {
      // Make a request to the first page to get the `Link` header
      const response = await octokit.request(endpoint, { ...parameters, per_page: 100, page: 1 })
      const linkHeader = response.headers.link

      // If no pagination, return the count from the first page
      if (!linkHeader) {
        return response.data.length
      }

      // Extract the last page number from the `Link` header
      const lastPageMatch = linkHeader.match(/&page=(\d+)>; rel="last"/)
      if (!lastPageMatch) {
        return response.data.length // Fall back to the first page count
      }

      const lastPage = parseInt(lastPageMatch[1], 10)

      // Fetch the last page to count its records
      const lastPageResponse = await octokit.request(endpoint, {
        ...parameters,
        per_page: 100,
        page: lastPage,
      })

      const lastPageCount = lastPageResponse.data.length

      // Correctly calculate the total count
      return (100 * (lastPage - 1)) + lastPageCount
    } catch (error) {
      octokit.log.error(`Failed to calculate total count: ${error.message}`)
      throw error
    }
  }
}