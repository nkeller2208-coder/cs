import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  /** « true » uniquement en local / tests : connexion par simple email (jamais en production). */
  DEV_LOGIN?: string
}

export interface Me {
  id: string
  role: 'admin' | 'member'
  email: string | null
  display_name: string
  avatar_url: string | null
  created_at: string
}

export type AppEnv = { Bindings: Env; Variables: { me: Me } }
export type Ctx = Context<AppEnv>

export const now = () => new Date().toISOString()

/** Erreur renvoyée telle quelle au client (message en français). */
export function fail(status: 400 | 401 | 403 | 404 | 409 | 429, message: string): never {
  throw new HTTPException(status, { message })
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Liste d'entiers positifs validée (ids venant du client). */
export function ids(v: unknown): number[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
}

export const bool = (v: unknown) => (v ? 1 : 0)

/** SQLite renvoie 0/1 : on reconvertit les colonnes booléennes connues. */
const BOOL_COLS = ['archived', 'pending', 'shows_utility', 'shows_round_type', 'pinned', 'involved']
export function fixBools<T extends Record<string, unknown>>(row: T): T {
  const r: Record<string, unknown> = { ...row }
  for (const k of BOOL_COLS) if (k in r) r[k] = !!r[k]
  return r as T
}

export async function all<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results
}
export async function first<T = Record<string, unknown>>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>()
}
