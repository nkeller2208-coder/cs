// Reproduit l'URL Supabase (/rest/v1) devant PostgREST pour les tests locaux.
import http from 'node:http'

const target = Number(process.env.POSTGREST_PORT ?? 3001)
const port = Number(process.env.PROXY_PORT ?? 54321)

http
  .createServer((req, res) => {
    if (!req.url.startsWith('/rest/v1')) {
      res.writeHead(404, { 'access-control-allow-origin': '*' })
      return res.end('{}')
    }
    const upstream = http.request(
      { host: '127.0.0.1', port: target, path: req.url.replace('/rest/v1', '') || '/', method: req.method, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode, r.headers)
        r.pipe(res)
      },
    )
    upstream.on('error', (e) => {
      res.writeHead(502)
      res.end(String(e))
    })
    req.pipe(upstream)
  })
  .listen(port, () => console.log(`proxy :${port} → PostgREST :${target}`))
