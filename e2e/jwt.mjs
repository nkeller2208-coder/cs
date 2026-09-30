import crypto from 'node:crypto'
const secret = 'super-secret-jwt-token-with-at-least-32-characters-long'
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
export function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64(payload)
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`
}
export const anonKey = sign({ role: 'anon', iss: 'supabase', exp: 4102444800 })
if (process.argv[2] === 'anon') console.log(anonKey)
