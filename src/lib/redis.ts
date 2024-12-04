const gistUrl = (id: string): string => {
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

export const format = (response: any): any[] => {
  console.debug('Redis Object Tuples:', response)

  const formatted = toEntries(response.slice(1), toEntries)

  // key, description, id, url
  return Object.entries(formatted).map(([key, value]: [string, any]) => ({
    key,
    description: value.description,
    id: value.gist_id,
    url: gistUrl(key),
  }))
}