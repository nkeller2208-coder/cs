import type { CardPayload } from './api'
import { parseMedia } from './media'
import { normalize } from './text'
import type { Side, Tag, Tags } from './types'

/** Préfixe des cartes de démonstration : elles se suppriment en un clic. */
export const DEMO_PREFIX = '[Démo] '

interface DemoSpec {
  title: string
  map: string
  side: Side
  roles?: string[]
  zones?: string[]
  categories: string[]
  utilities?: string[]
  risk?: string
  economies?: string[]
  links?: string[]
  description?: string
  draft?: boolean
  /** Signalée « À revoir » juste après la création. */
  review?: string
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
    title: 'Smoke Window depuis T Spawn',
    map: 'Mirage', side: 'T', roles: ['Central'], zones: ['T Spawn', 'Window'],
    categories: ['Stuff'], utilities: ['Smoke'], risk: 'Passif', economies: ['Full buy'],
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
    description:
      'Test **texte seul** (aucun média) avec mise en forme :\n\n1. Smoke CT et Jungle\n2. Flash au-dessus de Ticket\n3. Entrée simultanée CT + Connector\n\nRéférence : [page Wikipédia de CS2](' + WIKI + ').',
  },
  {
    title: 'Molotov Banana premier round',
    map: 'Inferno', side: 'CT', roles: ['Fixe B'], zones: ['Banana', 'Car'],
    categories: ['Stuff'], utilities: ['Molotov/Incendiaire'], risk: 'Passif', economies: ['Pistol'],
    links: [SHORT],
    description: 'Test **YouTube Short** : le lecteur doit s’afficher en vertical.',
  },
  {
    title: 'Exé B complète',
    map: 'Inferno', side: 'T', roles: ['Extre B', '+1', 'Central'], zones: ['Banana', 'Construction', 'Site B', 'CT Spawn'],
    categories: ['Routine', 'Stuff'], utilities: ['Smoke', 'Flash', 'Molotov/Incendiaire'], risk: 'Agressif', economies: ['Full buy'],
    links: [VIDEO, IMAGE_1, WIKI],
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
    title: 'Flash pop Mid',
    map: 'Ancient', side: 'T', roles: ['Central'], zones: ['Mid'],
    categories: ['Stuff', 'Move solo'], utilities: ['Flash'], risk: 'En réaction', economies: ['Eco'],
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
export function buildDemoCards(tags: Tags): { payload: CardPayload; review?: string }[] {
  const out: { payload: CardPayload; review?: string }[] = []
  for (const s of SPECS) {
    const missing: string[] = []
    const map = tags.maps.find((m) => normalize(m.name) === normalize(s.map) && !m.archived)
    if (!map) continue
    const categories = pick(tags.categories, s.categories, missing, 'catégorie')
    if (!categories.length) continue
    out.push({
      review: s.review,
      payload: {
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
        remember: false,
      },
    })
  }
  return out
}

export function isDemo(title: string) {
  return title.startsWith(DEMO_PREFIX)
}
