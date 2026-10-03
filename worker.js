const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const BASE_URL = 'https://rebahin.vidio.in.net';

// Helper function untuk fetch HTML
async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        return cheerio.load(data);
    } catch (error) {
        console.error("Error fetching URL:", error.message);
        return null;
    }
}

// 1. Endpoint Film Populer
app.get('/populer', async (req, res) => {
    const $ = await fetchHTML(BASE_URL);
    if (!$\vert{}\vert{}$) return res.status(500).json({ error: 'Gagal mengambil data' });

    const results = [];
    // Sesuaikan selector CSS (.item atau class card film di web target)
    $('.item, .ml-item').each((_, element) => {
        const title = $(element).find('.judul, h2, .lazyload').attr('alt') \vert{}\vert{}$(element).find('a').attr('title');
        const link = $(element).find('a').attr('href');
        const poster = $(element).find('img').attr('data-src') \vert{}\vert{}$(element).find('img').attr('src');
        const rating = $(element).find('.rating, .score').text().trim();

        if (title && link) {
            results.push({ title, link, poster, rating });
        }
    });

    res.json({ success: true, data: results });
});

// 2. Endpoint Daftar Film (Semua / Halaman Film)
app.get('/film', async (req, res) => {
    const page = req.query.page || 1;
    const targetUrl = `${BASE_URL}/page/${page}/`; // Sesuaikan struktur pagination web target
    const $ = await fetchHTML(targetUrl);
    if (!$) return res.status(500).json({ error: 'Gagal mengambil data' });

    const results = [];
    $('.item, .ml-item').each((_, element) => {
        const title = $(element).find('a').attr('title');
        const link = $(element).find('a').attr('href');
        const poster = $(element).find('img').attr('data-src') \vert{}\vert{}$(element).find('img').attr('src');

        if (title && link) {
            results.push({ title, link, poster });
        }
    });

    res.json({ success: true, page: Number(page), data: results });
});

// 3. Endpoint Film Terbaru
app.get('/terbaru', async (req, res) => {
    const $ = await fetchHTML(BASE_URL);
    if (!$) return res.status(500).json({ error: 'Gagal mengambil data' });

    const results = [];
    // Biasanya bagian terbaru ada di section khusus di halaman utama
    $('.item, .ml-item').each((_, element) => {
        const title = $(element).find('a').attr('title');
        const link = $(element).find('a').attr('href');
        const poster = $(element).find('img').attr('data-src') \vert{}\vert{}$(element).find('img').attr('src');

        if (title && link) {
            results.push({ title, link, poster });
        }
    });

    res.json({ success: true, data: results });
});

// 4. Endpoint Daftar Genre
app.get('/genre', async (req, res) => {
    const $ = await fetchHTML(BASE_URL);
    if (!$) return res.status(500).json({ error: 'Gagal mengambil data' });

    const genres = [];
    // Ambil dari menu sidebar/dropdown genre
    $('ul.genre-list a, .genres a, .menu-genre a').each((_, element) => {
        const name = $(element).text().trim();
        const link = $(element).attr('href');
        if (name && link) {
            genres.push({ name, link });
        }
    });

    res.json({ success: true, data: genres });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API berjalan di port ${PORT}`);
});
