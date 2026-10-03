import type { CardPayload, PrinciplePayload } from './api'
import { parseMedia } from './media'
import { normalize } from './text'
import type { CardKind, RoleAction, Side, Tag, Tags } from './types'

/** Préfixe des cartes de démonstration : elles se suppriment en un clic. */
export const DEMO_PREFIX = '[Démo] '

interface DemoSpec {
  /** Stratégie par défaut. */
  kind?: CardKind
  title: string
  map: string
  side: Side
  roles?: string[]
  zones?: string[]
  categories: string[]
  utilities?: string[]
  risk?: string
  economies?: string[]
  rounds?: string[]
  links?: string[]
  description?: string
  draft?: boolean
  /** Signalée « À revoir » juste après la création. */
  review?: string
  /** Stratégie : action de chaque rôle (nom du rôle → [action, note]). */
  actions?: Record<string, [string, string?]>
  /** Stratégie : stuffs de démo rattachés (titres sans préfixe), lancés par un rôle. */
  stuffs?: { title: string; role?: string }[]
}

// Médias publics et durables (vidéos YouTube de référence, images Wikimedia / Picsum)
// choisis pour vérifier chaque type d'affichage, pas pour leur contenu CS2.
const VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' // Big Buck Bunny (Blender)
const SHORT = 'https://www.youtube.com/shorts/jNQXAC9IVRw' // « Me at the zoo », affiché au format Short
const IMAGE_1 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/800px-Fronalpstock_big.jpg'
const IMAGE_2 = 'https://picsum.photos/id/1015/1280/720.jpg'
const IMGUR = 'https://i.imgur.com/removed.png' // lien d'image mort : doit se dégrader proprement
const WIKI = 'https://fr.wikipedia.org/wiki/Counter-Strike_2'

const SPECS: DemoSpec[] = [
  {
    kind: 'stuff',
    title: 'Smoke Window depuis T Spawn',
    map: 'Mirage', side: 'T', roles: ['Central'], zones: ['T Spawn', 'Window'],
    categories: [], utilities: ['Smoke'], risk: 'Passif', economies: ['Full buy'],
    links: [`${VIDEO}&t=30s`],
    description: 'Test **vidéo YouTube** avec début à 0:30.\n- Se placer contre le mur du spawn\n- Viser le coin de l’antenne\n- *Jumpthrow*',
  },
  {
    title: 'Position Jungle agressive',
    map: 'Mirage', side: 'CT', roles: ['Fixe A'], zones: ['Jungle', 'Connector'],
    categories: ['Position'], risk: 'Semi-agressif', economies: ['Full buy', 'Force buy'],
    links: [IMAGE_2],
    description: 'Test **image directe** (Picsum). Tenir mid depuis Jungle, reculer après le premier contact.',
  },
  {
    title: 'Retake A à trois',
    map: 'Mirage', side: 'CT', roles: ['Fixe A', 'Pivot A', 'AWP'], zones: ['Site A', 'Ticket', 'Connector'],
    categories: ['Retake', 'Routine'], risk: 'En réaction',
    actions: {
      'Fixe A': ['Entry', 'entre en premier par CT'],
      'Pivot A': ['Trade', 'suit le Fixe A, flash au-dessus de Ticket'],
      AWP: ['Support', 'reste Jungle pour couper le mid'],
      'Pivot B': ['Rotation', 'arrive par Connector'],
      'Fixe B': ['Non concerné', 'garde B'],
    },
    description:
      'Test **texte seul** (aucun média) avec mise en forme :\n\n1. Smoke CT et Jungle\n2. Flash au-dessus de Ticket\n3. Entrée simultanée CT + Connector\n\nRéférence : [page Wikipédia de CS2](' + WIKI + ').',
  },
  {
    kind: 'stuff',
    title: 'Molotov Banana premier round',
    map: 'Inferno', side: 'CT', roles: ['Fixe B'], zones: ['Banana', 'Car'],
    categories: [], utilities: ['Molotov/Incendiaire'], risk: 'Passif', economies: ['Pistol'],
    links: [SHORT],
    description: 'Test **YouTube Short** : le lecteur doit s’afficher en vertical.',
  },
  {
    title: 'Exé B complète',
    map: 'Inferno', side: 'T', roles: ['Extre B', '+1', 'Central'], zones: ['Banana', 'Construction', 'Site B', 'CT Spawn'],
    categories: ['Routine'], risk: 'Agressif', economies: ['Full buy'],
    links: [VIDEO, IMAGE_1, WIKI],
    actions: {
      'Extre B': ['Entry', 'premier sur le site par Banana'],
      '+1': ['Trade', 'flash pour l’Extre B'],
      Central: ['Support', 'smoke CT + molly Coffins'],
      'Extre A': ['Lurk', 'reste Apps pour couper la rotation'],
      AWP: ['Info', 'tient le mid'],
    },
    description: 'Test **plusieurs médias** : vidéo, image Wikimedia et lien externe, dans cet ordre.',
  },
  {
    title: 'Prise de Long A',
    map: 'Dust II', side: 'T', roles: ['Extre A'], zones: ['Long Doors', 'Long A'],
    categories: ['Prise de zone'], risk: 'Semi-agressif', economies: ['Force buy'],
    links: [WIKI],
    description: 'Test **lien externe** : doit afficher un bouton « Ouvrir ».',
  },
  {
    title: 'AWP Outside',
    map: 'Nuke', side: 'CT', roles: ['AWP'], zones: ['Outside', 'Silo'],
    categories: ['Position'], risk: 'Agressif',
    links: [IMAGE_1],
    description: 'Test **image Wikimedia**.',
  },
  {
    kind: 'stuff',
    title: 'Flash pop Mid',
    map: 'Ancient', side: 'T', roles: ['Central'], zones: ['Mid'],
    categories: [], utilities: ['Flash'], risk: 'En réaction', economies: ['Eco'],
    links: [`${VIDEO}&t=1m5s`, IMGUR],
    description: 'Test **image cassée** : le second média pointe vers une image supprimée ; la carte doit rester lisible.',
    review: 'Test : lineup cassé après le dernier patch',
  },
  {
    title: 'Reprise de Mid',
    map: 'Anubis', side: 'CT', roles: ['Pivot B'], zones: ['Mid', 'Bridge'],
    categories: ['Reprise de zone'],
    description: 'Test **carte minimale** : pas de média, pas de risque, pas d’économie.',
  },
  {
    title: 'Rush B fumé',
    map: 'Mirage', side: 'T', roles: ['Extre B', '+1'], zones: ['Apartments', 'Site B'],
    categories: ['Round lancé'], rounds: ['Rush'], risk: 'Agressif', economies: ['Full buy'],
    actions: {
      'Extre B': ['Entry'],
      '+1': ['Trade'],
      Central: ['Support', 'smoke Window avant le rush'],
      AWP: ['Fight', 'prend le duel Short'],
      'Extre A': ['Lurk', 'fake A puis rejoint'],
    },
    stuffs: [{ title: 'Smoke Window depuis T Spawn', role: 'Central' }],
    links: [`${VIDEO}&t=2m`],
    description: 'Test **round lancé** (type Rush) : 5 joueurs Apps, smokes Short et Kitchen, flashs au-dessus.',
  },
  {
    title: 'Déclic mid après info',
    map: 'Inferno', side: 'T', roles: ['Central'], zones: ['Top Mid', 'Second Mid'],
    categories: ['Round lancé'], rounds: ['Déclic', 'Default'], risk: 'En réaction',
    description: 'Test **round lancé** (Default puis Déclic) : on joue lent, le déclic part sur la première info mid.',
  },
  {
    title: 'Post-plant B Site',
    map: 'Mirage', side: 'T', roles: ['Extre B'], zones: ['Site B', 'Market', 'Apartments'],
    categories: ['Post-plant'], risk: 'Passif',
    links: [IMAGE_2],
    description: 'Test **post-plant** : un joueur Apps, un joueur Market-side, crossfire sur le defuse.',
  },
  {
    title: 'Brouillon de test',
    map: 'Train', side: 'T', categories: ['Position'],
    description: 'Test **brouillon** : visible uniquement dans « Mes brouillons ».',
    draft: true,
  },
]

function pick<T extends Tag>(list: T[], names: string[] | undefined, missing: string[], label: string): number[] {
  return (names ?? []).flatMap((n) => {
    const t = list.find((x) => normalize(x.name) === normalize(n) && !x.archived)
    if (!t) missing.push(`${label} « ${n} »`)
    return t ? [t.id] : []
  })
}

/** Construit les cartes de démo à partir des étiquettes existantes (les étiquettes absentes sont ignorées). */
export interface DemoCard {
  payload: CardPayload
  review?: string
  /** Stuffs à rattacher une fois créés (titres complets, avec préfixe). */
  stuffs?: { title: string; role_id: number | null }[]
}

export function buildDemoCards(tags: Tags): DemoCard[] {
  const out: DemoCard[] = []
  for (const s of SPECS) {
    const missing: string[] = []
    const map = tags.maps.find((m) => normalize(m.name) === normalize(s.map) && !m.archived)
    if (!map) continue
    const kind = s.kind ?? 'strategy'
    const categories = pick(tags.categories, s.categories, missing, 'catégorie')
    if (kind === 'strategy' && !categories.length) continue
    const sideRoles = tags.roles.filter((r) => r.side === s.side && !r.archived)
    const roleId = (name: string) => sideRoles.find((r) => normalize(r.name) === normalize(name))?.id ?? null
    const roleActions: RoleAction[] = Object.entries(s.actions ?? {}).flatMap(([role, [action, note]]) => {
      const role_id = roleId(role)
      const act = tags.role_actions.find((a) => normalize(a.name) === normalize(action) && !a.archived)
      return role_id && act ? [{ role_id, action_id: act.id, note: note ?? '' }] : []
    })
    out.push({
      review: s.review,
      stuffs: (s.stuffs ?? []).map((x) => ({ title: (DEMO_PREFIX + x.title).slice(0, 100), role_id: x.role ? roleId(x.role) : null })),
      payload: {
        kind,
        title: (DEMO_PREFIX + s.title).slice(0, 100),
        description: s.description ?? '',
        map_id: map.id,
        side: s.side,
        risk_id: pick(tags.risks, s.risk ? [s.risk] : [], missing, 'risque')[0] ?? null,
        status: s.draft ? 'draft' : 'published',
        media: (s.links ?? []).map((l) => {
          const m = parseMedia(l)!
          return { url: m.url, kind: m.kind, url_key: m.url_key }
        }),
        role_ids: pick(tags.roles.filter((r) => r.side === s.side), s.roles, missing, 'rôle'),
        category_ids: categories,
        zone_ids: pick(tags.zones.filter((z) => z.map_id === map.id), s.zones, missing, 'zone'),
        utility_ids: pick(tags.utilities, s.utilities, missing, 'utilitaire'),
        economy_ids: pick(tags.economies, s.economies, missing, 'économie'),
        round_type_ids: pick(tags.round_types, s.rounds, missing, 'type de round'),
        role_actions: roleActions,
        stuff_links: [],
        remember: false,
      },
    })
  }
  return out
}

export function isDemo(title: string) {
  return title.startsWith(DEMO_PREFIX)
}

interface DemoPrinciple {
  title: string
  theme: string
  summary: string
  body: string
  sides?: Side[]
  maps?: string[]
  roles?: string[]
  categories?: string[]
  rounds?: string[]
  pinned?: boolean
  /** Cartes de démo à rattacher explicitement (titres sans préfixe). */
  cards?: string[]
}

const PRINCIPLES: DemoPrinciple[] = [
  {
    title: 'Toujours jouer en trade',
    theme: 'Duels & trades',
    summary: 'Un joueur ne prend jamais un duel seul si un coéquipier ne peut pas le trader dans la seconde.',
    body: 'Test **principe général** (aucune étiquette) : il ne s’affiche pas automatiquement sur les cartes, seulement sur celles qui lui sont rattachées.\n\n- Distance de trade : deux secondes maximum\n- Le second joueur annonce sa position avant l’entrée',
    pinned: true,
    cards: ['Exé B complète', 'Rush B fumé'],
  },
  {
    title: 'Un rush se déclenche sur une info, pas sur un timer',
    theme: 'Fondamentaux',
    summary: 'On lance le rush quand l’info confirme un site faible, jamais « parce qu’il reste 40 secondes ».',
    body: 'Test **principe par étiquettes** : side T + catégorie Round lancé. Il apparaît automatiquement sur toutes les cartes « Round lancé » côté T.',
    sides: ['T'],
    categories: ['Round lancé'],
  },
  {
    title: 'Post-plant : jouer le temps, pas les kills',
    theme: 'Post-plant & retake',
    summary: 'Après la pose, on se cache du defuse et on attend que le CT s’engage.',
    body: 'Test **principe par étiquettes** : catégorie Post-plant, side T.\n\n1. Crossfire sur la bombe\n2. Molotov au dernier moment\n3. Pas de peek sec',
    sides: ['T'],
    categories: ['Post-plant'],
  },
  {
    title: 'AWP CT : un tir, puis on change d’angle',
    theme: 'Positionnement',
    summary: 'Après chaque tir, l’AWP se repositionne : l’adversaire connaît son angle.',
    body: 'Test **principe par rôle** : rôle AWP (CT) sur toutes les maps.',
    sides: ['CT'],
    roles: ['AWP'],
  },
]

/** Principes de démonstration (titres préfixés) et cartes à rattacher par titre. */
export function buildDemoPrinciples(tags: Tags): { payload: PrinciplePayload; cardTitles: string[] }[] {
  return PRINCIPLES.map((p) => {
    const missing: string[] = []
    const theme = tags.principle_themes.find((t) => normalize(t.name) === normalize(p.theme))
    const sides = p.sides ?? []
    return {
      cardTitles: (p.cards ?? []).map((t) => DEMO_PREFIX + t),
      payload: {
        title: DEMO_PREFIX + p.title,
        summary: p.summary,
        body: p.body,
        theme_id: theme?.id ?? null,
        sides,
        pinned: !!p.pinned,
        map_ids: pick(tags.maps, p.maps, missing, 'map'),
        role_ids: pick(tags.roles.filter((r) => !sides.length || sides.includes(r.side)), p.roles, missing, 'rôle'),
        category_ids: pick(tags.categories, p.categories, missing, 'catégorie'),
        round_type_ids: pick(tags.round_types, p.rounds, missing, 'type de round'),
      },
    }
  })
}
