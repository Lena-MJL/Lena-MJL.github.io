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
        'https://cors.eu.org/?u=',
        'https://cors-proxy.fringe.zone/?url=',
        'https://api.allorigins.win/get?url=',
        'https://getproxyapi.com/api/proxy?query=',
        'https://api.crossoriginproxy.com/fetch?u='
    ];

    const defaultDelayMs = 2000;
    // Fallback list used only if js/bullion_sources.json fails to load.
    const fallbackBullionSources = [
        { name: '925 silver', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Sterling-Silver-Grain,-100--------Recycled-Silver-prcode-ASA-000' },
        { name: 'fine silver', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Fine-Silver-Grain,-100-Recycled---Silver-prcode-ASF-000' },
        { name: '9K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/9ct-Casting-Yellow-Grain,-100-----Recycled-Gold-prcode-AAB-000' },
        { name: '14K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/14ct-Ay-Yellow-Grain,-100-Recycled-Gold-prcode-AGE-000' },
        { name: '18K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/18ct-Hcb-Yellow-Grain,-100--------Recycled-Gold-prcode-ALO-000' },
        { name: '22K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/22ct-Yellow-Ds-Grain,-100-Recycled-Gold-prcode-AQA-000' },
        { name: '24K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Fine-Gold-Grain-Minimum-99.96-Au,-100-Recycled-Gold-prcode-ARZ-000' },
        { name: 'palladium', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Palladium-Casting-Pieces-prcode-APAL-000' },
        { name: 'platinum', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Platinum-Hc-Casting-Pieces-prcode-BXB-000' },
        { name: '940 argentium silver', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/Argentium-940-Silver-Casting-Pieces-prcode-BS40-000' },
        { name: '9K white gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/9ct-White-Gold-Casting-Grain,-100-Recycled-Gold-prcode-AAG-000' },
        { name: '9K red gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/9ct-Red-Gold-Casting-Grain,-100-Recycled-Gold-prcode-AAQ-000' },
        { name: '10K gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/10ct-Yellow-Gold-Casting-Grain,-100-Recycled-Gold-prcode-AFA-000' },
        { name: '10K white gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/10ct-White-Gold-Casting-Grain,-100-Recycled-Gold-prcode-ABE-000' },
        { name: '10K red gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/10ct-Ar-Red-Grain,-100-Recycled-Gold-prcode-ABF-000' },
        { name: '14K white gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/14ct-White-Gold-and-Palladium-Casting-Grain,-100-Recycled-Gold-prcode-AGR-000' },
        { name: '14K red gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/14ct-Red-Gold-Casting-Grain-prcode-AGM-000' },
        { name: '18K white gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/18ct-White-Gold-Casting-Grain-100-Recycled-Gold-prcode-ALQ-000' },
        { name: '18K red gold', url: 'https://www.cooksongold.com/Grain-and-Casting-Pieces/18ct-Red-Grain,-100-Recycled-Gold-prcode-ALI-000' }
    ];
    let defaultBullionSources = fallbackBullionSources;
    const sourcesReady = fetch('js/bullion_sources.json')
        .then(r => r.ok ? r.json() : fallbackBullionSources)
        .then(list => { defaultBullionSources = list; return list; })
        .catch(() => fallbackBullionSources);

    const prefetchedUrl = 'data/bullion_prices.json';
    const storageKey = 'bullion_prices_v1';

    // simple logger
    function log(...args) { console.log('[BullionFetcher]', ...args); }

    function formatFetchedAt(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return '';
        return d.toLocaleString(undefined, {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
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
        // Try each proxy until we get valid HTML that contains a price
        log('fetching price for', url);
        for (let proxy of corsProxies) {
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const resp = await fetch(proxyUrl);
                if (!resp.ok) throw new Error(`status ${resp.status}`);
                const text = await resp.text();
                
                // Try to parse price from this response
                const price = parsePriceFromHtml(text);
                if (price) {
                    log('success via proxy', proxy);
                    return { url, price };
                }
                // If no price found, try next proxy
                log('no price found via proxy', proxy);
                continue;
            } catch (e) {
                log('proxy failed', proxy, e.message);
                continue;
            }
        }
        // No proxy returned valid price
        log('no valid price found from any proxy for', url);
        return { url, price: null, error: 'No valid price found from any proxy' };
    }

    async function fetchMultiple(items, delayMs = defaultDelayMs) {
        // items: [{name, url}] or array of urls
        if (items === undefined) { await sourcesReady; items = defaultBullionSources; }
        const results = [];
        const cache = loadCache();

        for (let i = 0; i < items.length; i++) {
            const item = typeof items[i] === 'string' ? { url: items[i], name: items[i] } : items[i];
            // use cached if recent
            const cached = cache[item.url];
            if (cached && Date.now() - cached.t < (1000 * 60 * 60 * 6)) { // 6 hour cache
                results.push({ name: item.name, url: item.url, price: cached.price, cached: true, fetchedAt: new Date(cached.t).toISOString() });
            } else {
                const res = await fetchPrice(item.url);
                const price = res.price || 'Unavailable';
                const now = Date.now();
                results.push({ name: item.name, url: item.url, price, cached: false, fetchedAt: new Date(now).toISOString() });
                if (res.price) {
                    // store in cache
                    cache[item.url] = { price: price, t: now };
                }
                // delay between fetches except after last
                if (i < items.length - 1 && delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
            }
        }

        saveCache(cache);
        // also expose in-memory
        window._bullion_last_prices = results.reduce((m, p) => { m[p.name] = p; return m; }, {});
        return results;
    }

    async function fetchMultipleWithCallback(items, delayMs = defaultDelayMs, callback = null) {
        // items: [{name, url}] or array of urls
        // callback: function(result) called for each price as it's found
        if (items === undefined) { await sourcesReady; items = defaultBullionSources; }
        const results = new Array(items.length); // pre-allocate with correct size to maintain order
        const cache = loadCache();
        const uncachedQueue = []; // queue of {index, item}

        // First pass: process cached items immediately, queue uncached for sequential fetching
        for (let i = 0; i < items.length; i++) {
            const item = typeof items[i] === 'string' ? { url: items[i], name: items[i] } : items[i];
            const cached = cache[item.url];
            
            if (cached && Date.now() - cached.t < (1000 * 60 * 60 * 6)) { // 6 hour cache
                const result = { name: item.name, url: item.url, price: cached.price, cached: true, fetchedAt: new Date(cached.t).toISOString() };
                results[i] = result;
                // call callback immediately for cached
                if (callback) callback(result);
            } else {
                // Queue uncached for sequential fetching
                uncachedQueue.push({ index: i, item });
            }
        }

        // Second pass: process uncached items sequentially with delays
        for (let qIdx = 0; qIdx < uncachedQueue.length; qIdx++) {
            const { index, item } = uncachedQueue[qIdx];

            // Fetch this item
            const res = await fetchPrice(item.url);
            const price = res.price || 'Unavailable';
            const now = Date.now();
            const result = { name: item.name, url: item.url, price, cached: false, fetchedAt: new Date(now).toISOString() };
            results[index] = result;
            if (res.price) {
                cache[item.url] = { price: price, t: now };
            }
            
            // call callback immediately after result is ready
            if (callback) callback(result);
            
            // delay between fetches except after last
            if (qIdx < uncachedQueue.length - 1 && delayMs > 0) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        saveCache(cache);
        // also expose in-memory
        window._bullion_last_prices = results.reduce((m, p) => { m[p.name] = p; return m; }, {});
        return results;
    }

    async function loadPrefetched() {
        try {
            const resp = await fetch(prefetchedUrl, { cache: 'no-store' });
            if (!resp.ok) return null;
            const data = await resp.json();
            return (data && data.prices) ? data.prices : null;
        } catch (e) {
            log('failed to load prefetched prices', e.message);
            return null;
        }
    }

    // Uses the daily-scraped data/bullion_prices.json first; only live-fetches
    // (via fetchMultipleWithCallback, proxies + localStorage cache) whatever
    // is missing or marked Unavailable in that file. Falls back to fetching
    // everything live if the prefetched file itself can't be loaded.
    async function fetchAllWithPrefetch(items, delayMs = defaultDelayMs, callback = null) {
        if (items === undefined) { await sourcesReady; items = defaultBullionSources; }

        const prefetched = await loadPrefetched();
        if (!prefetched) {
            return fetchMultipleWithCallback(items, delayMs, callback);
        }

        const results = new Array(items.length);
        const remaining = []; // {index, item}

        for (let i = 0; i < items.length; i++) {
            const item = typeof items[i] === 'string' ? { url: items[i], name: items[i] } : items[i];
            const found = prefetched[item.name];
            if (found && found.price && found.price !== 'Unavailable') {
                const result = { name: item.name, url: item.url, price: found.price, prefetched: true, fetchedAt: found.fetchedAt };
                results[i] = result;
                if (callback) callback(result);
            } else {
                remaining.push({ index: i, item });
            }
        }

        if (remaining.length === 0) {
            window._bullion_last_prices = results.reduce((m, p) => { m[p.name] = p; return m; }, {});
            return results;
        }

        const liveResults = await fetchMultipleWithCallback(remaining.map(r => r.item), delayMs, callback);
        remaining.forEach((r, k) => { results[r.index] = liveResults[k]; });

        window._bullion_last_prices = results.reduce((m, p) => { m[p.name] = p; return m; }, {});
        return results;
    }

    // expose API
    global.BullionFetcher = {
        fetchPrice,
        fetchMultiple,
        fetchMultipleWithCallback,
        fetchAllWithPrefetch,
        loadPrefetched,
        parsePriceFromHtml,
        loadCache,
        saveCache,
        formatFetchedAt,
        corsProxies,
        _lastCacheKey: storageKey
    };

})(window);
