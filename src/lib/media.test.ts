import { describe, expect, it } from 'vitest'
import { parseMedia, parseYoutubeTime, withStart, thumbnailOf } from './media'

describe('parseMedia', () => {
  it('détecte les liens YouTube classiques avec timestamp', () => {
    const m = parseMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&feature=share')!
    expect(m.kind).toBe('youtube')
    expect(m.youtubeId).toBe('dQw4w9WgXcQ')
    expect(m.start).toBe(90)
    expect(m.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s')
    expect(m.url_key).toBe('yt:dQw4w9WgXcQ')
  })

  it('gère youtu.be, les Shorts et les embeds', () => {
    expect(parseMedia('youtu.be/dQw4w9WgXcQ?t=42')!.start).toBe(42)
    const short = parseMedia('https://youtube.com/shorts/abcDEF12345?si=xyz')!
    expect(short.isShort).toBe(true)
    expect(short.url).toBe('https://www.youtube.com/shorts/abcDEF12345')
    expect(parseMedia('https://www.youtube.com/embed/abcDEF12345?start=10')!.start).toBe(10)
    expect(parseMedia('https://m.youtube.com/watch?v=abcDEF12345')!.kind).toBe('youtube')
  })

  it('détecte les images directes et Imgur', () => {
    expect(parseMedia('https://cdn.example.com/a/b.PNG?x=1')!.kind).toBe('image')
    const imgur = parseMedia('https://imgur.com/AbC123x')!
    expect(imgur).toMatchObject({ kind: 'image', url: 'https://i.imgur.com/AbC123x.jpg', url_key: 'imgur:AbC123x' })
    expect(parseMedia('https://i.imgur.com/AbC123x.gifv')!.url).toBe('https://i.imgur.com/AbC123x.gif')
    expect(parseMedia('https://imgur.com/a/AbC123x')!.kind).toBe('link')
  })

  it('traite le reste comme un lien et normalise la clé', () => {
    const m = parseMedia('https://www.csnades.gg/mirage/smokes/window/?utm_source=x#top')!
    expect(m.kind).toBe('link')
    expect(m.url_key).toBe('csnades.gg/mirage/smokes/window')
  })

  it('rejette ce qui n’est pas une URL', () => {
    expect(parseMedia('')).toBeNull()
    expect(parseMedia('hello')).toBeNull()
    expect(parseMedia('javascript:alert(1)')).toBeNull()
  })
})

describe('timestamps', () => {
  it('parse les formats YouTube', () => {
    expect(parseYoutubeTime('75')).toBe(75)
    expect(parseYoutubeTime('1h2m3s')).toBe(3723)
    expect(parseYoutubeTime('abc')).toBeUndefined()
  })
  it('réécrit le lien avec le début', () => {
    const m = withStart(parseMedia('https://youtu.be/dQw4w9WgXcQ')!, 65)
    expect(m.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s')
    expect(withStart(m, undefined).url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })
  it('donne une miniature YouTube', () => {
    expect(thumbnailOf({ kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', url_key: '' })).toBe(
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    )
  })
})

describe('images Cloudflare', () => {
  it('reconnaît une image servie par Cloudflare Images (…/fichier.jpg/public)', () => {
    expect(parseMedia('https://refrag.gg/cdn-cgi/imagedelivery/abc/wordpress/2025/11/x.jpg/public')?.kind).toBe('image')
    expect(parseMedia('https://imagedelivery.net/abc/id/public')?.kind).toBe('image')
    expect(parseMedia('https://refrag.gg/blog/article')?.kind).toBe('link')
  })
})
