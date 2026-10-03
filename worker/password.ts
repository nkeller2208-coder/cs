// Hachage des mots de passe : PBKDF2-SHA256 (WebCrypto, disponible nativement dans Workers).
// 100 000 itérations : le maximum accepté par le runtime Cloudflare.
const ITERATIONS = 100_000
const PREFIX = 'pbkdf2-sha256'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `${PREFIX}$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`
}

/** Comparaison en temps constant. Un hash absent est quand même calculé (même durée de réponse). */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [prefix, iter, salt, hash] = (stored ?? '').split('$')
  const valid = prefix === PREFIX && !!salt && !!hash
  const expected = valid ? unb64(hash) : new Uint8Array(32)
  const actual = await derive(password, valid ? unb64(salt) : new Uint8Array(16), valid ? Number(iter) : ITERATIONS)
  let diff = actual.length ^ expected.length
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff |= actual[i] ^ expected[i]
  return valid && diff === 0
}

/** Message d'erreur si le mot de passe ne convient pas, sinon null. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Mot de passe trop court (${PASSWORD_MIN} caractères minimum)`
  if (password.length > PASSWORD_MAX) return 'Mot de passe trop long'
  return null
}
