// Daily bullion price scraper — run via GitHub Actions cron.
// Mirrors the selector/proxy logic in js/bullion_fetcher.js, but runs
// server-side: tries a direct fetch first (no CORS restriction in CI),
// falling back to the same public CORS proxies only if that fails.
'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

const SOURCES_PATH = path.join(__dirname, '..', 'js', 'bullion_sources.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'bullion_prices.json');
const MAX_ATTEMPTS = 10;
const REQUEST_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;

const PRICE_SELECTORS = ['#b_pricing_now', '.product-price', '[data-price]', '.price', '.product-pricing', 'span[class*="price"]'];

const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://api.allorigins.cf/raw?url=',
    'https://thingproxy.freeboard.io/fetch/',
    'https://cors-anywhere.herokuapp.com/',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://cors.bridged.cc/',
    'https://corsproxy.io/?',
    'https://yacdn.org/proxy/',
    'https://proxy.cors.sh/',
    'https://cors.eu.org/?u=',
    'https://cors-proxy.fringe.zone/?url=',
    'https://api.allorigins.win/get?url=',
    'https://getproxyapi.com/api/proxy?query=',
    'https://api.crossoriginproxy.com/fetch?u='
];

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePriceFromHtml(html) {
    if (!html) return null;
    try {
        const root = parse(html);
        for (const sel of PRICE_SELECTORS) {
            const el = root.querySelector(sel);
            const text = el && el.text && el.text.trim();
            if (text) return text;
        }
    } catch (e) {
        console.error('[scrape] parse error', e.message);
    }
    return null;
}

async function fetchDirect(url) {
    const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bullion-price-scraper/1.0)' }
    });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    return resp.text();
}

async function fetchViaProxy(url) {
    for (const proxy of CORS_PROXIES) {
        try {
            const resp = await fetch(proxy + encodeURIComponent(url));
            if (!resp.ok) continue;
            const html = await resp.text();
            const price = parsePriceFromHtml(html);
            if (price) return price;
        } catch (e) {
            continue;
        }
    }
    return null;
}

async function fetchPrice(source) {
    try {
        const html = await fetchDirect(source.url);
        const price = parsePriceFromHtml(html);
        if (price) return price;
    } catch (e) {
        console.log(`[scrape] direct fetch failed for ${source.name}: ${e.message}`);
    }
    console.log(`[scrape] falling back to proxies for ${source.name}`);
    return fetchViaProxy(source.url);
}

async function main() {
    const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
    const prices = {};
    let pending = sources.slice();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length > 0; attempt++) {
        console.log(`[scrape] attempt ${attempt}/${MAX_ATTEMPTS} — ${pending.length} remaining`);
        const stillPending = [];

        for (let i = 0; i < pending.length; i++) {
            const source = pending[i];
            const price = await fetchPrice(source);
            if (price) {
                prices[source.name] = { name: source.name, url: source.url, price, fetchedAt: new Date().toISOString() };
                console.log(`[scrape] got ${source.name}: ${price}`);
            } else {
                stillPending.push(source);
                console.log(`[scrape] no price for ${source.name}`);
            }
            if (i < pending.length - 1) await sleep(REQUEST_DELAY_MS);
        }

        pending = stillPending;
        if (pending.length > 0 && attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }

    // Anything still unresolved after all attempts is recorded as Unavailable
    // so the client knows to attempt a live fallback fetch for it.
    for (const source of pending) {
        prices[source.name] = { name: source.name, url: source.url, price: 'Unavailable', fetchedAt: new Date().toISOString() };
    }

    const output = { fetchedAt: new Date().toISOString(), prices };
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');

    const resolved = sources.length - pending.length;
    console.log(`[scrape] done — ${resolved}/${sources.length} prices resolved. Written to ${OUTPUT_PATH}`);
}

main().catch(err => {
    console.error('[scrape] fatal error', err);
    process.exit(1);
});
