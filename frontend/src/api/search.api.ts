/**
 * Search API — typed wrapper for /api/search/web
 */

import apiClient from './client'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResponse {
  engine: string
  query: string
  results: WebSearchResult[]
}

export const searchApi = {
  async webSearch(query: string, numResults = 5): Promise<WebSearchResponse> {
    const res = await apiClient.post<WebSearchResponse>('/search/web', {
      query,
      num_results: numResults,
    })
    return res.data
  },
}
