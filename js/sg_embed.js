// Shared specific gravity embed: lists all materials we have density data for,
// in the same card layout as the bullion price embed, but with no links.
async function embedSpecificGravity() {
    const container = document.getElementById('sg-embedded');
    container.innerHTML = '<div id="sg-loading-message" class="alert alert-info">Loading specific gravity data…</div><div id="sg-list"></div>';

    try {
        let densities = window.specificGravity || window.densityCubiccm || window.relative_sg_wax;
        if (!densities) {
            const resp = await fetch('js/specific_gravity.json');
            densities = resp.ok ? await resp.json() : {};
        }

        const loadingMessage = document.getElementById('sg-loading-message');
        if (loadingMessage) {
            loadingMessage.remove();
        }

        const sgList = document.getElementById('sg-list');
        const entries = Object.entries(densities);
        if (sgList && entries.length > 0) {
            let out = '<div class="row">';
            entries.forEach(([name, sg]) => {
                out += `
                    <div class="col-md-3 mb-2">
                        <div class="card">
                            <div class="card-body p-2">
                                <strong>${name}</strong>
                                <br>
                                <span class="text-muted">${sg} g/cm³</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            out += '</div>';
            sgList.innerHTML = out;
        }
    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="alert alert-danger">Unable to load specific gravity data.</div>';
    }
}
