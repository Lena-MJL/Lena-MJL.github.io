// Shared bullion fetcher for static pages
// Exposes window.BullionFetcher with methods to fetch prices for product URLs
(function (global) {
    const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://api.allorigins.cf/raw?url=',
        'https://thingproxy.freeboard.io/fetch/',
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://cors.bridged.cc/',
        'https://corsproxy.io/?',
        'https://yacdn.org/proxy/',
        'https://proxy.cors.sh/',
        'https://cors.eu.org/?u='
    ];

    const defaultDelayMs = 4000;
    const defaultBullionSources = [
            { name: '925 silver', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Sterling-Silver-Grain,-100--------Recycled-Silver-prcode-ASA-000' },
            { name: 'fine silver', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Fine-Silver-Grain,-100-Recycled---Silver-prcode-ASF-000' },
            { name: '9K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/9ct-Casting-Yellow-Grain,-100-----Recycled-Gold-prcode-AAB-000' },
            { name: '14K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/14ct-Ay-Yellow-Grain,-100-Recycled-Gold-prcode-AGE-000' },
            { name: '18K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/18ct-Hcb-Yellow-Grain,-100--------Recycled-Gold-prcode-ALO-000' },
            { name: '22K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/22ct-Yellow-Ds-Grain,-100-Recycled-Gold-prcode-AQA-000'},
            { name: '24K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Fine-Gold-Grain-Minimum-99.96-Au,-100-Recycled-Gold-prcode-ARZ-000' },
            { name: 'palladium', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Palladium-Casting-Pieces-prcode-APAL-000' },
            { name: 'platinum', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Platinum-Hc-Casting-Pieces-prcode-BXB-000' }
        ];
    const storageKey = 'bullion_prices_v1';

    // simple logger
    function log(...args) { console.log('[BullionFetcher]', ...args); }

    async function fetchViaProxies(url) {
        for (let proxy of corsProxies) {
            try {
                // some proxies expect prefix, some expect full query param; here we use prefix+encoded
                const proxyUrl = proxy + encodeURIComponent(url);
                const resp = await fetch(proxyUrl);
                if (!resp.ok) throw new Error(`status ${resp.status}`);
                const text = await resp.text();
                return text;
            } catch (e) {
                log('proxy failed', proxy, e.message);
                continue;
            }
        }
        return null;
    }

    function parsePriceFromHtml(html) {
        if (!html) return null;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // selectors - prioritize id
            const selectors = ['#b_pricing_now', '.product-price', '[data-price]', '.price', '.product-pricing', 'span[class*="price"]'];
            for (let sel of selectors) {
                const el = doc.querySelector(sel);
                if (el && el.textContent.trim()) return el.textContent.trim();
            }
        } catch (e) {
            log('parse error', e.message);
        }
        return null;
    }

    function saveCache(cache) {
        try { localStorage.setItem(storageKey, JSON.stringify(cache)); } catch (e) { /* ignore */ }
    }

    function loadCache() {
        try {
            const cache = JSON.parse(localStorage.getItem(storageKey) || '{}');
            const now = Date.now();
            const oneDayMs = 1000 * 60 * 60 * 24; // 24 hours
            let dirty = false;
            
            // Remove entries older than 24 hours
            for (let url in cache) {
                if (cache[url].t && now - cache[url].t > oneDayMs) {
                    delete cache[url];
                    dirty = true;
                }
            }
            
            // Save cleaned cache if any entries were removed
            if (dirty) saveCache(cache);
            
            return cache;
        } catch (e) { return {}; }
    }

    async function fetchPrice(url) {
        const html = await fetchViaProxies(url);
        if (!html) return { url, price: null, error: 'Fetch failed' };
        const price = parsePriceFromHtml(html) || null;
        return { url, price };
    }

    async function fetchMultiple(items = defaultBullionSources, delayMs = defaultDelayMs) {
        // items: [{name, url}] or array of urls
        const results = [];
        const cache = loadCache();

        for (let i = 0; i < items.length; i++) {
            const item = typeof items[i] === 'string' ? { url: items[i], name: items[i] } : items[i];
            // use cached if recent
            const cached = cache[item.url];
            if (cached && Date.now() - cached.t < (1000 * 60 * 60)) { // 1 hour cache
                results.push({ name: item.name, url: item.url, price: cached.price, cached: true });
            } else {
                const res = await fetchPrice(item.url);
                const price = res.price || 'Unavailable';
                results.push({ name: item.name, url: item.url, price, cached: false });
                // store in cache
                cache[item.url] = { price, t: Date.now() };
                // delay between fetches except after last
                if (i < items.length - 1 && delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
            }
        }

        saveCache(cache);
        // also expose in-memory
        window._bullion_last_prices = results.reduce((m, p) => { m[p.name] = p; return m; }, {});
        return results;
    }

    // expose API
    global.BullionFetcher = {
        fetchPrice,
        fetchMultiple,
        parsePriceFromHtml,
        loadCache,
        saveCache,
        corsProxies,
        _lastCacheKey: storageKey
    };

})(window);
