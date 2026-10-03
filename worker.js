import { Hono } from 'hono';
import * as cheerio from 'cheerio';

const app = new Hono();
const BASE_URL = 'https://rebahin.vidio.in.net';

// Helper: Fetch & Parse HTML
async function fetchHTML(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });
        if (!response.ok) return null;
        const html = await response.text();
        return cheerio.load(html);
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

// Helper: Extract Movies dari layout grid/kisi
function extractMovies($) {
    const movies = [];
    $('.kisi article.kartu').each((i, el) => {
        const title = $(el).find('a.judul').text().trim();
        const link = $(el).find('a.judul').attr('href');
        const slug = link ? link.split('/film/')[1].replace('/', '') : '';
        const poster = $(el).find('img').attr('src');
        const rating = $(el).find('.nilai').text().trim();
        const type = $(el).find('.tanda').text().trim() || 'Info/Trailer';
        const info = $(el).find('.kartu-kaki').text().trim();

        movies.push({ title, slug, poster, rating, type, info });
    });
    return movies;
}

// Route: Root / Beranda
app.get('/', (c) => {
    return c.json({
        success: true,
        message: 'Rebahin Unofficial API is running on Cloudflare Workers',
        endpoints: [
            '/terbaru?page=1',
            '/populer?page=1',
            '/film/:slug'
        ]
    });
});

// Route: Film Terbaru
app.get('/terbaru', async (c) => {
    const page = c.req.query('page') || 1;
    const url = page > 1 ? `${BASE_URL}/terbaru/page/${page}/` : `${BASE_URL}/terbaru/`;
    
    const $ = await fetchHTML(url);
    if (!$) return c.json({ success: false, message: 'Gagal mengambil data' }, 500);

    const movies = extractMovies($);
    return c.json({ success: true, page: Number(page), count: movies.length, data: movies });
});

// Route: Film Populer
app.get('/populer', async (c) => {
    const page = c.req.query('page') || 1;
    const url = page > 1 ? `${BASE_URL}/populer/page/${page}/` : `${BASE_URL}/populer/`;
    
    const $ = await fetchHTML(url);
    if (!$) return c.json({ success: false, message: 'Gagal mengambil data' }, 500);

    const movies = extractMovies($);
    return c.json({ success: true, page: Number(page), count: movies.length, data: movies });
});

// Route: Detail Film
app.get('/film/:slug', async (c) => {
    const slug = c.req.param('slug');
    const url = `${BASE_URL}/film/${slug}/`;

    const $ = await fetchHTML(url);
    if (!$) return c.json({ success: false, message: 'Gagal mengambil data halaman detail' }, 500);

    try {
        const title = $('h1').text().trim();
        const poster = $('.film-kepala img.poster-kecil').attr('src');
        const background = $('.film-sampul img').attr('src');
        
        const genres = [];
        $('p.genre-baris a').each((i, el) => {
            genres.push($(el).text().trim());
        });

        const fakta = [];
        $('ul.fakta li').each((i, el) => {
            fakta.push($(el).text().replace(/\s+/g, ' ').trim());
        });

        const synopsis = $('.sinopsis').text().trim();
        const director = $('p.baris-info').filter((i, el) =>$(el).text().includes('Sutradara')).find('a').text().trim();

        const cast = [];
        $('.blok:contains("Pemeran") .tagar a').each((i, el) => {
            cast.push({
                name: $(el).text().trim(),
                link: $(el).attr('href')
            });
        });

        const watchLink = $('.aksi a.tombol.utama').attr('href');
        const watchId = watchLink ? watchLink.replace('/nonton/', '').replace('/', '') : null;

        return c.json({
            success: true,
            data: { title, poster, background, genres, fakta, director, synopsis, cast, watchId }
        });
    } catch (error) {
        return c.json({ success: false, message: 'Error parsing detail data' }, 500);
    }
});

export default app;
