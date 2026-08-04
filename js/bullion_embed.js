// Shared bullion price embed: fetches prices, updates header cells for matching
// material names, renders the price-card list, and invokes a caller-supplied
// callback whenever prices change so the page can refresh its own calculations.
async function embedBullion(onUpdate) {
    const container = document.getElementById('bullion-embedded');
    container.innerHTML = '<div id="loading-message" class="alert alert-info">Loading bullion prices…</div><div id="prices-list"></div>';

    if (!window.bullionPrices) {
        window.bullionPrices = {};
    }

    const updateHeaders = () => {
        const headerRow = document.getElementById('header-row');
        if (!headerRow) return;
        Array.from(headerRow.children).forEach(th => {
            const name = th.textContent.trim();
            const found = window.bullionPrices[name];
            if (found && found.price && found.price !== 'Unavailable') {
                th.innerHTML = `${name}<div class="small text-muted">${found.price}/g</div>`;
            }
        });
    };

    const renderPriceList = (prices) => {
        const pricesList = document.getElementById('prices-list');
        if (!pricesList || prices.length === 0) return;
        let out = '<div class="row">';
        prices.forEach(r => {
            out += `
                <div class="col-md-3 mb-2">
                    <div class="card">
                        <div class="card-body p-2">
                            <strong>${r.name}</strong>
                            <span class="text-muted"><a href="${r.url}" target="_blank">Product link</a></span>
                            <br>
                            <span class="text-muted">
                                ${r.price === "Unavailable" ? "Unavailable" :
                    r.price + (r.prefetched ? '*' : (r.cached ? '**' : '')) + " per gram"}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        const latestFetchedAt = prices.reduce((max, r) => r.fetchedAt && (!max || r.fetchedAt > max) ? r.fetchedAt : max, null);
        out += `<div class="text-muted small" style="margin-left: 5%;">* means price fetched at ${BullionFetcher.formatFetchedAt(latestFetchedAt)}<br>** means price was cached in the last 6 hours</div></div>`;
        pricesList.innerHTML = out;
    };

    try {
        const onPriceFound = (result) => {
            window.bullionPrices[result.name] = result;
            updateHeaders();
            if (onUpdate) onUpdate();
            renderPriceList(Object.values(window.bullionPrices));
        };

        const results = await BullionFetcher.fetchAllWithPrefetch(undefined, 2000, onPriceFound);

        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) {
            loadingMessage.remove();
        }

        window.bullionPrices = results.reduce((m, v) => { m[v.name] = v; return m; }, {});

        if (onUpdate) onUpdate();
        updateHeaders();
        renderPriceList(results);

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="alert alert-danger">Unable to load bullion prices.</div>';
    }
}
