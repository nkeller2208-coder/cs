// Tests des droits de l'API (équivalent des anciens tests RLS).
// Suppose une base fraîche avec admin@team.gg (admin) et membre@team.gg (membre) sur la liste blanche.
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'

class Client {
  cookie = ''
  async req(method, path, body, { csrf = true, redirect = 'follow' } = {}) {
    const res = await fetch(BASE + '/api' + path, {
      method,
      redirect,
      headers: {
        ...(csrf ? { 'x-requested-with': 'cs2kb' } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.getSetCookie?.() ?? []
    for (const c of set) {
      const [pair] = c.split(';')
      if (pair.startsWith('cs2kb_session=')) this.cookie = pair.endsWith('=') ? '' : pair
    }
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null
    return { status: res.status, data, location: res.headers.get('location') }
  }
  get = (p, o) => this.req('GET', p, undefined, o)
  post = (p, b = {}, o) => this.req('POST', p, b, o)
  put = (p, b = {}) => this.req('PUT', p, b)
  patch = (p, b = {}) => this.req('PATCH', p, b)
  del = (p) => this.req('DELETE', p)
}

let n = 0
function ok(cond, msg) {
  assert.ok(cond, msg)
  n++
}
const expect = (r, status, msg) => ok(r.status === status, `${msg} (attendu ${status}, reçu ${r.status} ${JSON.stringify(r.data)})`)
/** Jeton d'un lien d'inscription (…/inscription/<jeton>). */
const tokenOf = (url) => decodeURIComponent(new URL(url).pathname.split('/inscription/')[1])

const anon = new Client()
const admin = new Client()
const member = new Client()
const intruder = new Client()

// ------------------------------------------------------------ Accès
expect(await anon.get('/cards'), 401, 'anonyme : cartes refusées')
expect(await anon.get('/tags'), 401, 'anonyme : étiquettes refusées')
expect(await intruder.post('/auth/dev', { email: 'intrus@x.gg' }), 403, 'intrus refusé')
expect(await admin.post('/auth/dev', { email: 'admin@team.gg' }, { csrf: false }), 403, 'CSRF : en-tête obligatoire')
expect(await admin.post('/auth/dev', { email: 'admin@team.gg' }), 200, 'admin connecté')
expect(await member.post('/auth/dev', { email: 'MEMBRE@team.gg' }), 200, 'membre connecté (email insensible à la casse)')
const meA = (await admin.get('/auth/me')).data
const meB = (await member.get('/auth/me')).data
ok(meA.role === 'admin' && meB.role === 'member', 'rôles repris de la liste blanche')
ok(meA.display_name === 'Zywoo', 'pseudo repris de la note')

const tags = (await member.get('/tags')).data
const id = (list, name, extra = {}) => list.find((t) => t.name === name && Object.entries(extra).every(([k, v]) => t[k] === v)).id
const mirage = id(tags.maps, 'Mirage')
const inferno = id(tags.maps, 'Inferno')
const stuff = id(tags.categories, 'Stuff')
const position = id(tags.categories, 'Position')
const roundCat = id(tags.categories, 'Round lancé')
const rush = id(tags.round_types, 'Rush')
const smoke = id(tags.utilities, 'Smoke')
const fixeA = id(tags.roles, 'Fixe A', { side: 'CT' })
const central = id(tags.roles, 'Central', { side: 'T' })
const banana = id(tags.zones, 'Banana')
const palace = tags.zones.find((z) => z.name === 'Palace' && z.map_id === mirage).id

// ------------------------------------------------------------ Cartes
const base = { title: 'Smoke CT', map_id: mirage, side: 'CT', description: 'desc', category_ids: [position] }
expect(await member.post('/cards', { ...base, category_ids: [] }), 400, 'catégorie obligatoire')
expect(await member.post('/cards', { ...base, role_ids: [central] }), 400, 'rôle T refusé sur une carte CT')
expect(await member.post('/cards', { ...base, zone_ids: [banana] }), 400, "zone d'une autre map refusée")
expect(await member.post('/cards', { ...base, media: [{ url: 'javascript:alert(1)', kind: 'link', url_key: 'x' }] }), 400, 'lien javascript: refusé')
expect(await member.post('/cards', { ...base, description: 'x'.repeat(20001) }), 400, 'description trop longue refusée')

const c1 = (await member.post('/cards', { ...base, kind: 'stuff', role_ids: [fixeA], zone_ids: [palace], utility_ids: [smoke], media: [{ url: 'https://youtu.be/abc', kind: 'youtube', url_key: 'yt:abc' }] })).data.id
let cards = (await member.get('/cards')).data
let card = cards.find((c) => c.id === c1)
ok(card.utility_ids.length === 1 && card.media.length === 1 && card.zone_ids[0] === palace, 'carte complète enregistrée')
await member.post('/cards', { ...base, id: c1, category_ids: [position], utility_ids: [smoke], round_type_ids: [rush] })
card = (await member.get('/cards')).data.find((c) => c.id === c1)
ok(card.kind === 'strategy' && !card.utility_ids.length && !card.round_type_ids.length && !card.media.length, 'devenue stratégie : utilitaire et round ignorés, médias remplacés')
const rc = (await member.post('/cards', { ...base, side: 'T', category_ids: [roundCat], round_type_ids: [rush] })).data.id
ok((await member.get('/cards')).data.find((c) => c.id === rc).round_type_ids[0] === rush, 'type de round enregistré avec « Round lancé »')
ok((await member.get(`/cards/${c1}/history`)).data.length === 2, 'historique : création + modification')

const draft = (await member.post('/cards', { status: 'draft', title: '' })).data.id
await member.post('/cards', { id: draft, status: 'draft', title: 'wip' })
await member.post('/cards', { id: draft, status: 'draft', title: 'wip 2' })
ok((await member.get(`/cards/${draft}/history`)).data.length === 1, 'brouillon : sauvegardes auto fusionnées')
ok(!(await admin.get('/cards')).data.some((c) => c.id === draft), "admin ne voit pas le brouillon d'un autre")
expect(await admin.post('/cards', { id: draft, status: 'draft', title: 'piraté' }), 403, "admin ne modifie pas le brouillon d'un autre")

const cA = (await admin.post('/cards', { ...base, title: 'Carte admin', side: 'T' })).data.id
expect(await member.post('/cards', { ...base, id: cA, title: 'piraté', side: 'T' }), 403, "membre ne modifie pas la carte d'un autre")
expect(await member.del(`/cards/${cA}`), 403, "membre ne supprime pas la carte d'un autre")
expect(await admin.post('/cards', { ...base, id: c1, title: 'Corrigé par admin', category_ids: [position] }), 200, 'admin modifie une carte publiée')

expect(await admin.post(`/cards/${c1}/flag`, { comment: '' }), 400, 'signalement : commentaire requis')
expect(await admin.post(`/cards/${c1}/flag`, { comment: 'Lineup cassé' }), 200, 'tout membre peut signaler')
ok((await member.get('/cards')).data.find((c) => c.id === c1).status === 'review', 'carte « à revoir »')
expect(await member.post(`/cards/${c1}/resolve`), 200, "l'auteur lève le signalement")

const dupes = (await admin.get('/media/duplicates?key=yt:abc')).data
ok(Array.isArray(dupes), 'anti-doublon répond')

// ------------------------------------------------------------ Stratégies, stuff, actions des rôles
const act = (n) => id(tags.role_actions, n)
const pivotB = id(tags.roles, 'Pivot B', { side: 'CT' })
ok(tags.role_actions.length >= 9 && tags.role_actions.find((a) => a.name === 'Non concerné').involved === false, 'actions des rôles : liste par défaut')
ok(tags.categories.find((c) => c.name === 'Stuff').archived === true, 'ancienne catégorie « Stuff » archivée')
expect(await member.post('/tags/role_actions', { name: 'Piraté' }), 403, 'membre ne modifie pas les actions')
const stuffBase = { kind: 'stuff', title: 'Smoke Window', map_id: mirage, side: 'CT', description: 'd', utility_ids: [smoke] }
expect(await member.post('/cards', { ...stuffBase, utility_ids: [] }), 400, "stuff : type d'utilitaire obligatoire")
expect(await member.post('/cards', { ...stuffBase, category_ids: [] }), 200, 'stuff : catégorie facultative')
const s1 = (await member.post('/cards', stuffBase)).data.id
const sDraft = (await admin.post('/cards', { ...stuffBase, status: 'draft', title: 'Stuff brouillon admin' })).data.id
const sInf = (await member.post('/cards', { ...stuffBase, map_id: inferno, title: 'Molly Banana' })).data.id
const strat = { title: 'Retake B', map_id: mirage, side: 'CT', description: 'd', category_ids: [position] }
expect(await member.post('/cards', { ...strat, role_actions: [{ role_id: central, action_id: act('Lurk') }] }), 400, "action : rôle de l'autre side refusé")
expect(await member.post('/cards', { ...strat, role_actions: [{ role_id: pivotB, action_id: 99999 }] }), 400, 'action inconnue refusée')
expect(await member.post('/cards', { ...strat, stuff_links: [{ stuff_id: rc }] }), 400, 'une stratégie ne se rattache pas comme stuff')
expect(await member.post('/cards', { ...strat, stuff_links: [{ stuff_id: sInf }] }), 400, "stuff d'une autre map refusé")
expect(await member.post('/cards', { ...strat, stuff_links: [{ stuff_id: sDraft }] }), 400, "brouillon d'un autre : non rattachable")
expect(await member.post('/cards', { ...strat, stuff_links: [{ stuff_id: s1, role_id: central }] }), 400, "lanceur de l'autre side refusé")
const st = (await member.post('/cards', {
  ...strat,
  role_actions: [{ role_id: pivotB, action_id: act('Support'), note: 'smoke Window' }, { role_id: fixeA, action_id: act('Non concerné') }],
  stuff_links: [{ stuff_id: s1, role_id: pivotB }],
})).data.id
const sc = (await member.get('/cards')).data.find((c) => c.id === st)
ok(sc.kind === 'strategy' && sc.role_actions.length === 2 && sc.role_ids.join() === String(pivotB), 'rôles concernés déduits des actions (« Non concerné » exclu)')
ok(sc.role_actions.find((a) => a.role_id === pivotB).note === 'smoke Window', 'note de l’action enregistrée')
ok(sc.stuff_links.length === 1 && sc.stuff_links[0].stuff_id === s1 && sc.stuff_links[0].role_id === pivotB, 'stuff rattaché avec son lanceur')
expect(await admin.post('/cards', { ...strat, id: st, role_actions: sc.role_actions, stuff_links: [{ stuff_id: s1, role_id: pivotB }, { stuff_id: sDraft, role_id: null }] }), 200, 'admin rattache son propre brouillon de stuff')
ok((await member.get('/cards')).data.find((c) => c.id === st).stuff_links.length === 1, "brouillon d'autrui rattaché : invisible pour le membre")
await member.post('/cards', { ...strat, id: st, title: 'Retake B v2', role_actions: sc.role_actions, stuff_links: [{ stuff_id: s1, role_id: null }] })
ok((await admin.get('/cards')).data.find((c) => c.id === st).stuff_links.length === 2, 'modification par le membre : le lien qu’il ne voit pas est conservé')
ok((await member.get(`/cards/${st}/history`)).data[0].snapshot.role_actions.length === 2, 'historique : actions des rôles')
await member.post('/cards', { ...stuffBase, id: s1, kind: 'strategy', category_ids: [position], utility_ids: [] })
ok(!(await admin.get('/cards')).data.find((c) => c.id === st).stuff_links.some((l) => l.stuff_id === s1), 'un stuff devenu stratégie est détaché des stratégies')

// Sources
const devil = id(tags.sources, 'Devil')
ok(tags.sources.some((s) => s.name === 'Le Repère'), 'sources par défaut : Devil et Le Repère')
expect(await member.post('/cards', { ...stuffBase, title: 'Source bidon', source_id: 99999 }), 400, 'source inconnue refusée')
const withSource = (await member.post('/cards', { ...stuffBase, title: 'Smoke sourcée', source_id: devil })).data.id
ok((await member.get('/cards')).data.find((c) => c.id === withSource).source_id === devil, 'source enregistrée sur la carte')
const added = (await member.post('/tags/sources/propose', { name: 'Coach Max' })).data
ok(added.name === 'Coach Max' && added.id, 'un membre ajoute une source depuis le formulaire')
ok((await member.post('/tags/sources/propose', { name: 'coach max' })).data.id === added.id, 'source existante renvoyée (pas de doublon)')
expect(await member.post('/tags/sources/propose', { name: '' }), 400, 'source sans nom refusée')
expect(await member.patch(`/tags/sources/${added.id}`, { url: 'https://x.y' }), 403, 'membre ne modifie pas une source')
expect(await admin.patch(`/tags/sources/${added.id}`, { url: 'javascript:alert(1)' }), 400, 'lien de source javascript: refusé')
expect(await admin.patch(`/tags/sources/${added.id}`, { url: 'https://www.youtube.com/@coachmax' }), 200, 'admin ajoute un lien à la source')

// Espace perso : rôles en jeu et profil
expect(await member.req('PUT', '/members/me/roles', { role_ids: [99999] }), 400, 'rôle en jeu inconnu refusé')
expect(await member.req('PUT', '/members/me/roles', { role_ids: [pivotB, central] }), 200, 'mes rôles en jeu enregistrés')
const prof = (await member.get('/members/me/profile')).data
ok([...prof.role_ids].sort().join() === [pivotB, central].sort().join() && Array.isArray(prof.teams), 'profil : rôles en jeu et équipes')
ok((await admin.get('/members')).data.find((m) => m.id === meB.id).role_ids.includes(pivotB), 'rôles en jeu visibles dans la liste des membres')
expect(await anon.get('/members/me/profile'), 401, 'profil : anonyme refusé')

// ------------------------------------------------------------ Étiquettes
expect(await member.post('/tags/maps', { name: 'Vertigo' }), 403, 'membre ne crée pas de map')
const z = (await member.post('/tags/zones/propose', { map_id: mirage, name: 'Chaise' })).data
ok(z.pending === true, 'zone proposée « à valider »')
expect(await member.post('/tags/zones/merge', { source: z.id, target: palace }), 403, 'membre ne fusionne pas')
await member.post('/cards', { ...base, id: c1, title: 'Avec zone', category_ids: [position], zone_ids: [z.id] })
expect(await admin.post('/tags/zones/merge', { source: z.id, target: palace }), 200, 'admin fusionne')
ok((await admin.get('/cards')).data.find((c) => c.id === c1).zone_ids.includes(palace), 'fusion : cartes mises à jour')
expect(await admin.post('/tags/maps', { name: 'Mirage' }), 409, 'doublon de nom refusé')

// ------------------------------------------------------------ Membres
expect(await member.patch(`/members/${meB.id}`, { role: 'admin' }), 403, 'auto-promotion impossible')
expect(await member.get('/allowlist'), 403, 'membre ne voit pas la liste blanche')

// ------------------------------------------------------------ Principes
expect(await member.post('/principles', { title: 'x', sides: ['T'], role_ids: [fixeA] }), 400, 'principe : rôle CT refusé sur side T')
const p = (await member.post('/principles', { title: 'Toujours trader', sides: ['T'], role_ids: [central] })).data.id
expect(await admin.post('/principles', { id: p, title: 'Toujours trader (admin)' }), 200, "admin modifie le principe d'un autre")
expect(await admin.req('PUT', `/principles/${p}/cards/${c1}`), 200, 'rattachement carte ↔ principe')
const pr = (await member.get('/principles')).data.find((x) => x.id === p)
ok(pr.card_ids.includes(c1) && pr.title === 'Toujours trader (admin)', 'principe relu avec sa carte')
const other = new Client()
expect(await other.del(`/principles/${p}`), 401, 'anonyme ne supprime pas')

// ------------------------------------------------------------ Équipes et rôles
expect(await member.post('/teams', { name: 'Pirate' }), 403, 'membre ne crée pas d’équipe')
const alpha = (await admin.post('/teams', { name: 'Alpha', captain_id: meB.id })).data.id
const beta = (await admin.post('/teams', { name: 'Beta' })).data.id
expect(await admin.post('/teams', { name: 'Alpha' }), 409, 'nom d’équipe unique')
let teamsList = (await member.get('/teams')).data
ok(teamsList.find((t) => t.id === alpha).can_manage && !teamsList.find((t) => t.id === beta).can_manage, 'capitaine gère son équipe, pas les autres')

// Le capitaine invite un nouveau joueur : il rejoint l'équipe à sa première connexion.
const inv = (await member.post(`/teams/${alpha}/invites`, { note: 'Recrue', role: 'player' })).data
ok(inv.url && !inv.added, 'capitaine : lien d’invitation créé')
expect(await member.post(`/teams/${beta}/invites`, { note: 'X' }), 403, 'capitaine : pas d’invitation dans une autre équipe')
const recrue = new Client()
expect(await recrue.post('/auth/register', { token: tokenOf(inv.url), display_name: 'Recrue', email: 'recrue@team.gg', password: 'recrue-mdp-123' }), 200, 'recrue inscrite par son lien')
const meR = (await recrue.get('/auth/me')).data
ok(meR.display_name === 'Recrue', 'recrue connectée')
teamsList = (await recrue.get('/teams')).data
ok(teamsList.find((t) => t.id === alpha).members.some((m) => m.member_id === meR.id && m.role === 'player'), 'recrue dans l’équipe Alpha en joueur')
expect(await recrue.post(`/teams/${alpha}/invites`, { note: 'Pote' }), 403, 'joueur ne peut pas inviter')
expect(await recrue.req('PUT', `/teams/${alpha}/members/${meR.id}`, { role: 'captain' }), 403, 'joueur ne se nomme pas capitaine')
expect(await member.req('PUT', `/teams/${alpha}/members/${meB.id}`, { role: 'player' }), 400, 'dernier capitaine ne peut pas se rétrograder')
expect(await member.req('PUT', `/teams/${alpha}/members/${meA.id}`, { role: 'coach' }), 200, 'capitaine nomme un coach')

// ------------------------------------------------------------ Apprentissage du Playbook
const L = (id) => `/learning/cards/${id}`
expect(await recrue.req('PUT', `${L(st)}/team`, { team_id: alpha, status: 'to_learn' }), 403, 'joueur ne met pas une stratégie « à apprendre »')
expect(await member.req('PUT', `${L(st)}/team`, { team_id: beta, status: 'to_learn' }), 403, 'capitaine : pas pour une autre équipe')
expect(await member.req('PUT', `${L(sInf)}/team`, { team_id: alpha, status: 'to_learn' }), 400, 'un stuff ne se met pas « à apprendre »')
expect(await member.req('PUT', `${L(st)}/team`, { team_id: alpha, status: 'bidon' }), 400, 'statut d’équipe invalide')
expect(await member.req('PUT', `${L(st)}/team`, { team_id: alpha, status: 'to_learn' }), 200, 'capitaine met une stratégie « à apprendre »')
ok((await recrue.get('/cards')).data.find((c) => c.id === st).learning.some((l) => l.team_id === alpha && l.status === 'to_learn'), 'le joueur voit la stratégie « à apprendre »')
expect(await recrue.req('PUT', `${L(st)}/rating`, { rating: 6 }), 400, 'note hors échelle refusée')
expect(await recrue.req('PUT', `${L(st)}/rating`, { rating: 3 }), 200, 'joueur note son niveau sur une stratégie')
expect(await recrue.req('PUT', `${L(sInf)}/rating`, { rating: 5 }), 200, 'joueur note son niveau sur un stuff')
ok((await recrue.get('/cards')).data.find((c) => c.id === st).my_rating === 3, 'ma note relue')
ok((await member.get('/cards')).data.find((c) => c.id === st).my_rating === null, 'la note est personnelle')
expect(await recrue.req('PUT', `${L(sDraft)}/rating`, { rating: 2 }), 404, "pas de note sur le brouillon d'un autre")
const tl = (await member.get(`/learning/teams/${alpha}`)).data
ok(tl.can_manage && tl.cards.some((c) => c.card_id === st && c.status === 'to_learn'), 'tableau d’équipe : stratégies suivies')
ok(tl.ratings.some((r) => r.member_id === meR.id && r.card_id === st && r.rating === 3), 'tableau d’équipe : notes des joueurs')
ok(!tl.players.some((p) => p.id === meA.id), 'tableau d’équipe : le coach ne joue pas, il n’est pas noté')
const cl = (await recrue.get(L(st))).data
const clAlpha = cl.teams.find((t) => t.id === alpha)
ok(cl.my_rating === 3 && clAlpha?.status === 'to_learn' && !clAlpha.can_manage, 'fiche : statut d’équipe et ma note (joueur sans droit de gestion)')
ok((await member.get(L(st))).data.teams.find((t) => t.id === alpha).can_manage, 'fiche : le capitaine peut gérer')
expect(await anon.get(`/learning/teams/${alpha}`), 401, 'apprentissage : anonyme refusé')
expect(await recrue.req('PUT', `${L(st)}/rating`, { rating: 0 }), 200, 'note effacée')
ok((await recrue.get('/cards')).data.find((c) => c.id === st).my_rating === null, 'note effacée relue')
expect(await member.req('PUT', `${L(st)}/team`, { team_id: alpha, status: 'learned' }), 200, 'capitaine : stratégie maîtrisée')
expect(await member.req('PUT', `${L(st)}/team`, { team_id: alpha, status: 'none' }), 200, 'capitaine : statut retiré')
ok(!(await recrue.get('/cards')).data.find((c) => c.id === st).learning.length, 'statut retiré relu')

expect(await recrue.del(`/teams/${alpha}/members/${meR.id}`), 200, 'un joueur peut quitter son équipe')
expect(await member.del(`/teams/${alpha}`), 403, 'capitaine ne supprime pas l’équipe')
expect(await admin.del(`/teams/${beta}`), 200, 'admin supprime une équipe')

// ------------------------------------------------------------ Lien d'inscription + email / mot de passe
expect(await admin.get('/auth/discord'), 404, 'Discord supprimé')
expect(await admin.get('/auth/callback'), 404, 'retour Discord supprimé')
ok(!('discord' in (await anon.get('/auth/config')).data), 'config : plus de Discord')
const entry = (await admin.post('/allowlist', { note: 'Invité' })).data.id
expect(await member.post(`/allowlist/${entry}/invite`), 403, 'membre ne génère pas de lien admin')
const { url } = (await admin.post(`/allowlist/${entry}/invite`)).data
ok(new URL(url).pathname.startsWith('/inscription/'), 'lien : page d’inscription')
const token = tokenOf(url)
// Ancien format de lien : redirige vers l'inscription sans connecter.
const legacy = await fetch(`${BASE}/api/auth/invite/${token}`, { redirect: 'manual' })
ok(legacy.status === 302 && legacy.headers.get('location') === `/inscription/${token}` && !legacy.headers.getSetCookie().length, 'ancien lien : redirection sans session')
const info = await anon.get(`/auth/invite/${token}/info`)
ok(info.status === 200 && info.data.mode === 'signup' && info.data.name === 'Invité', 'lien : infos (sans le consommer)')
expect(await anon.get(`/auth/invite/${token}/info`), 200, 'lien : consulter ne le consomme pas')
const guest = new Client()
const reg = (p) => guest.post('/auth/register', { token, display_name: 'Invité', email: 'invite@team.gg', password: 'invite-mdp-123', ...p })
expect(await reg({ password: 'court' }), 400, 'mot de passe trop court refusé')
expect(await reg({ email: 'pas-un-email' }), 400, 'email invalide refusé')
expect(await reg({ email: 'ADMIN@team.gg' }), 409, 'email déjà utilisé par un autre compte refusé')
expect(await reg({ token: 'faux' }), 400, 'jeton inconnu refusé')
expect(await guest.req('POST', '/auth/register', { token, email: 'invite@team.gg', password: 'invite-mdp-123' }, { csrf: false }), 403, 'inscription : CSRF')
expect(await reg({}), 200, 'inscription réussie')
const guestMe = (await guest.get('/auth/me')).data
ok(guestMe?.display_name === 'Invité' && guestMe.role === 'member' && guestMe.email === 'invite@team.gg', 'inscrit et connecté avec son pseudo et son email')
expect(await new Client().post('/auth/register', { token, display_name: 'X', email: 'x@team.gg', password: 'xxxxxxxx1' }), 400, 'lien à usage unique : 2e inscription refusée')
expect(await anon.get(`/auth/invite/${token}/info`), 404, 'lien utilisé : plus valable')
expect(await guest.post('/auth/logout'), 200, 'déconnexion')
expect(await guest.get('/auth/me'), 401, 'session terminée')

// Connexion
expect(await guest.post('/auth/login', { email: 'invite@team.gg', password: 'mauvais' }), 401, 'mauvais mot de passe refusé')
expect(await guest.post('/auth/login', { email: 'inconnu@team.gg', password: 'invite-mdp-123' }), 401, 'email inconnu refusé (même message)')
expect(await guest.req('POST', '/auth/login', { email: 'invite@team.gg', password: 'invite-mdp-123' }, { csrf: false }), 403, 'connexion : CSRF')
expect(await guest.post('/auth/login', { email: 'Invite@Team.gg', password: 'invite-mdp-123' }), 200, 'connexion email + mot de passe (email insensible à la casse)')
ok((await guest.get('/auth/me')).data?.id === guestMe.id, 'connecté au bon compte')
// Anti force brute : 5 échecs → bloqué, même avec le bon mot de passe.
const thief = new Client()
for (let i = 0; i < 5; i++) await thief.post('/auth/login', { email: 'invite@team.gg', password: `essai-${i}` })
expect(await thief.post('/auth/login', { email: 'invite@team.gg', password: 'invite-mdp-123' }), 429, 'compte bloqué après 5 échecs')

// Mot de passe oublié : l'admin génère un nouveau lien pour le membre (débloque aussi le compte).
const { url: resetUrl } = (await admin.post(`/allowlist/${entry}/invite`)).data
const resetInfo = (await anon.get(`/auth/invite/${tokenOf(resetUrl)}/info`)).data
ok(resetInfo.mode === 'reset' && resetInfo.email === 'invite@team.gg', 'lien pour un inscrit : nouveau mot de passe')
const phone = new Client()
expect(await phone.post('/auth/register', { token: tokenOf(resetUrl), email: 'invite@team.gg', password: 'nouveau-mdp-456' }), 200, 'nouveau mot de passe enregistré')
expect(await guest.get('/auth/me'), 401, 'nouveau mot de passe : autres sessions déconnectées')
expect(await guest.post('/auth/login', { email: 'invite@team.gg', password: 'invite-mdp-123' }), 401, 'ancien mot de passe refusé')
expect(await guest.post('/auth/login', { email: 'invite@team.gg', password: 'nouveau-mdp-456' }), 200, 'nouveau mot de passe accepté (compte débloqué)')
ok((await guest.get('/auth/me')).data?.id === guestMe.id, 'même compte après changement de mot de passe')
// Changer son mot de passe depuis l'espace perso
expect(await guest.post('/auth/password', { current: 'faux', password: 'encore-nouveau-789' }), 403, 'changement : mot de passe actuel exigé')
expect(await guest.post('/auth/password', { current: 'nouveau-mdp-456', password: 'court' }), 400, 'changement : nouveau trop court')
expect(await anon.post('/auth/password', { current: 'x', password: 'encore-nouveau-789' }), 401, 'changement : anonyme refusé')
expect(await phone.get('/auth/me'), 200, 'autre appareil connecté')
expect(await guest.post('/auth/password', { current: 'nouveau-mdp-456', password: 'encore-nouveau-789' }), 200, 'mot de passe changé')
expect(await guest.get('/auth/me'), 200, 'changement : session courante conservée')
expect(await phone.get('/auth/me'), 401, 'changement : autres appareils déconnectés')
expect(await new Client().post('/auth/login', { email: 'invite@team.gg', password: 'encore-nouveau-789' }), 200, 'connexion avec le nouveau mot de passe')
const { url: revoked } = (await admin.post(`/allowlist/${entry}/invite`)).data
expect(await anon.get(`/auth/invite/${tokenOf(revoked)}/info`), 200, 'lien actif')
await admin.del(`/allowlist/${entry}/invite`)
expect(await anon.get(`/auth/invite/${tokenOf(revoked)}/info`), 404, 'lien révoqué : refusé')
expect(await admin.del(`/members/${meA.id}`), 400, 'admin ne se retire pas lui-même')
expect(await admin.del(`/members/${guestMe.id}`), 200, 'admin retire un membre')

console.log(`✓ ${n} vérifications de droits OK`)
