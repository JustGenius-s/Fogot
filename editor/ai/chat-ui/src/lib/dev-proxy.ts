/**
 * Dev-only CORS proxy helpers.
 *
 * Custom provider endpoints are arbitrary hosts, so the browser blocks direct
 * `fetch()` to them from the Vite dev server (different origin → CORS). In
 * production the chat UI runs inside the editor webview where these requests
 * are allowed, so the rewrite only happens in dev.
 *
 * The matching server middleware lives in `vite.config.ts` (`/__cors`), which
 * forwards the request from Node where CORS does not apply.
 */

/**
 * Route an absolute URL through the dev CORS proxy when running under Vite dev.
 * Returns the URL unchanged in production builds.
 */
export function devProxiedUrl(url: string): string {
  if (import.meta.env.DEV && /^https?:\/\//i.test(url)) {
    return `/__cors?target=${encodeURIComponent(url)}`
  }
  return url
}

/**
 * Drop-in `fetch` replacement that routes absolute http(s) URLs through the dev
 * CORS proxy. Used by AI SDK providers (chat streaming) and direct API calls.
 */
export function devProxiedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!import.meta.env.DEV) {
    return fetch(input, init)
  }

  if (typeof input === 'string') {
    return fetch(devProxiedUrl(input), init)
  }
  if (input instanceof URL) {
    return fetch(devProxiedUrl(input.href), init)
  }
  if (/^https?:\/\//i.test(input.url)) {
    return fetch(new Request(devProxiedUrl(input.url), input), init)
  }
  return fetch(input, init)
}
