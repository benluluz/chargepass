import { useState, useCallback } from 'react'

export default function useApi() {
  const [loading, setLoading] = useState(false)

  const request = useCallback(async (method, url, body) => {
    setLoading(true)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'same-origin'
      })
      if (!res.ok) {
        console.error('API error', method, url, res.status, await res.text())
        return null
      }
      return await res.json()
    } catch (e) {
      console.error('Request failed:', e)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const get = useCallback((url) => request('GET', url, undefined), [request])
  const post = useCallback((url, body) => request('POST', url, body), [request])
  const put = useCallback((url, body) => request('PUT', url, body), [request])

  return { get, post, put, loading }
}
