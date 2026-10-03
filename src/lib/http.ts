/** Client HTTP de l'API (même origine que le site : le cookie de session suit automatiquement). */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        // Exigé par l'API pour toute modification (protection CSRF).
        'x-requested-with': 'cs2kb',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Serveur injoignable. Vérifie ta connexion.', 0)
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null
  if (!res.ok) throw new ApiError((data as { error?: string } | null)?.error ?? `Erreur ${res.status}`, res.status)
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Erreur inconnue'
  if (typeof e === 'string') return e
  return (e as Error).message ?? 'Erreur inconnue'
}
