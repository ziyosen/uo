import { Hono } from 'hono';
import * as cheerio from 'cheerio';

const app = new Hono();
const BASE_URL = 'https://rebahin.vidio.in.net';
const CACHE_TTL = 600; // detik (10 menit)

// ---------- Helper: Fetch & Parse HTML dengan timeout ----------
async function fetchHTML(url, { timeout = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      // Cache di sisi Cloudflare edge (fetch cache)
      cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
    });
    if (!response.ok) {
      console.error('Upstream not ok:', response.status, url);
      return null;
    }
    const html = await response.text();
    return cheerio.load(html);
  } catch (error) {
    console.error('Fetch error:', error?.name, error?.message, url);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Helper: Extract Movies dari layout grid/kisi ----------
function extractMovies($) {
  const movies = [];
  $('.kisi article.kartu').each((i, el) => {
    const $el = $(el);
    const $judul = $el.find('a.judul');
    const link = $judul.attr('href') || '';
    const slug = link.includes('/film/')
      ? link.split('/film/')[1].replace(/\/$/, '')
      : '';
    movies.push({
      title: $judul.text().trim(),
      slug,
      poster: $el.find('img').attr('src') || null,
      rating: $el.find('.nilai').text().trim(),
      type: $el.find('.tanda').text().trim() || 'Info/Trailer',
      info: $el.find('.kartu-kaki').text().trim(),
    });
  });
  return movies;
}

// ---------- Helper: Cache wrapper untuk route GET ----------
async function withCache(c, handler) {
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, { method: 'GET' });

  // Coba ambil dari cache
  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set('x-cache', 'HIT');
    return res;
  }

  // Jalankan handler -> dapatkan Response
  let res = await handler();

  // Hanya cache kalau sukses (2xx)
  if (res.status >= 200 && res.status < 300) {
    res = new Response(res.body, res);
    res.headers.set(
      'Cache-Control',
      `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`
    );
    res.headers.set('x-cache', 'MISS');
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  } else {
    res.headers.set('x-cache', 'BYPASS');
  }

  return res;
}

// ---------- Route: Root ----------
app.get('/', (c) => {
  return c.json({
    success: true,
    message: 'Rebahin Unofficial API is running on Cloudflare Workers',
    endpoints: ['/terbaru?page=1', '/populer?page=1', '/film/:slug'],
  });
});

// ---------- Route: Film Terbaru ----------
app.get('/terbaru', (c) =>
  withCache(c, async () => {
    const page = c.req.query('page') || 1;
    const url =
      page > 1
        ? `${BASE_URL}/terbaru/page/${page}/`
        : `${BASE_URL}/terbaru/`;

    const $ = await fetchHTML(url);
    if (!$)
      return c.json({ success: false, message: 'Gagal mengambil data' }, 502);

    const movies = extractMovies($);
    return c.json({
      success: true,
      page: Number(page),
      count: movies.length,
      data: movies,
    });
  })
);

// ---------- Route: Film Populer ----------
app.get('/populer', (c) =>
  withCache(c, async () => {
    const page = c.req.query('page') || 1;
    const url =
      page > 1
        ? `${BASE_URL}/populer/page/${page}/`
        : `${BASE_URL}/populer/`;

    const $ = await fetchHTML(url);
    if (!$)
      return c.json({ success: false, message: 'Gagal mengambil data' }, 502);

    const movies = extractMovies($);
    return c.json({
      success: true,
      page: Number(page),
      count: movies.length,
      data: movies,
    });
  })
);

// ---------- Route: Detail Film ----------
app.get('/film/:slug', (c) =>
  withCache(c, async () => {
    const slug = c.req.param('slug');
    const url = `${BASE_URL}/film/${slug}/`;

    const $ = await fetchHTML(url);
    if (!$)
      return c.json(
        { success: false, message: 'Gagal mengambil data halaman detail' },
        502
      );

    try {
      const title = $('h1').first().text().trim();
      const poster = $('.film-kepala img.poster-kecil').attr('src') || null;
      const background = $('.film-sampul img').attr('src') || null;

      const genres = [];
      $('p.genre-baris a').each((i, el) => {
        genres.push($(el).text().trim());
      });

      const fakta = [];
      $('ul.fakta li').each((i, el) => {
        fakta.push($(el).text().replace(/\s+/g, ' ').trim());
      });

      const synopsis = $('.sinopsis').text().replace(/\s+/g, ' ').trim();

      // Cari blok "Sutradara" secara efisien tanpa :contains
      let director = '';
      $('p.baris-info').each((i, el) => {
        const $el = $(el);
        if ($el.text().includes('Sutradara')) {
          director = $el.find('a').first().text().trim();
          return false; // break
        }
      });

      // Cari blok "Pemeran" (cast) tanpa :contains
      const cast = [];
      $('.blok').each((i, el) => {
        const $el = $(el);
        const heading = $el.find('h3, .judul-blok, .blok-judul').text();
        if (heading.includes('Pemeran') || $el.text().includes('Pemeran')) {
          $el.find('.tagar a').each((j, a) => {
            cast.push({
              name: $(a).text().trim(),
              link: $(a).attr('href') || null,
            });
          });
          return false; // break setelah blok Pemeran ditemukan
        }
      });

      const watchLink = $('.aksi a.tombol.utama').attr('href') || null;
      const watchId = watchLink
        ? watchLink.replace('/nonton/', '').replace(/\/$/, '')
        : null;

      return c.json({
        success: true,
        data: {
          title,
          poster,
          background,
          genres,
          fakta,
          director,
          synopsis,
          cast,
          watchId,
        },
      });
    } catch (error) {
      console.error('Parse error:', error);
      return c.json(
        { success: false, message: 'Error parsing detail data' },
        500
      );
    }
  })
);

// ---------- 404 fallback ----------
app.notFound((c) =>
  c.json({ success: false, message: 'Endpoint tidak ditemukan' }, 404)
);

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ success: false, message: 'Internal error' }, 500);
});

export default app;
