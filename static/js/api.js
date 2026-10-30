/**
 * BEN'ARMAGNAC — API Client
 * Gère toutes les communications REST avec le backend Flask / VPS
 */

const API = {
    async request(url, options = {}) {
        options.headers = options.headers || {};
        if (!(options.body instanceof FormData)) {
            options.headers['Content-Type'] = 'application/json';
        }

        try {
            const res = await fetch(url, options);
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                if (res.status === 401 && !url.includes('/api/auth/login') && !url.includes('/api/auth/register') && !url.includes('/api/auth/me')) {
                    // Session expired or unauthenticated
                    window.dispatchEvent(new CustomEvent('auth:required'));
                }
                const errorMsg = data.error || `Erreur ${res.status}`;
                throw new Error(errorMsg);
            }
            return data;
        } catch (err) {
            console.error(`API Error on ${url}:`, err);
            throw err;
        }
    },

    // ── Authentification ──
    auth: {
        async register(email, password, cave_name) {
            return API.request('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({ email, password, cave_name })
            });
        },

        async login(email, password) {
            return API.request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
        },

        async logout() {
            return API.request('/api/auth/logout', { method: 'POST' });
        },

        async getMe() {
            return API.request('/api/auth/me', { method: 'GET' });
        },

        async updateProfile(cave_name, password) {
            return API.request('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({ cave_name, password })
            });
        }
    },

    // ── Espaces de stockage & Agencement ──
    zones: {
        async getAll() {
            return API.request('/api/zones', { method: 'GET' });
        },

        async create(zone) {
            return API.request('/api/zones', {
                method: 'POST',
                body: JSON.stringify(zone)
            });
        },

        async update(id, zone) {
            return API.request(`/api/zones/${id}`, {
                method: 'PUT',
                body: JSON.stringify(zone)
            });
        },

        async delete(id) {
            return API.request(`/api/zones/${id}`, { method: 'DELETE' });
        }
    },

    // ── Livre de Cave / Inventaire ──
    inventory: {
        async getAll() {
            return API.request('/api/inventory', { method: 'GET' });
        },

        async add(bottleData) {
            return API.request('/api/inventory', {
                method: 'POST',
                body: JSON.stringify(bottleData)
            });
        },

        async update(id, bottleData) {
            return API.request(`/api/inventory/${id}`, {
                method: 'PUT',
                body: JSON.stringify(bottleData)
            });
        },

        async delete(id) {
            return API.request(`/api/inventory/${id}`, { method: 'DELETE' });
        },

        async import(data) {
            return API.request('/api/inventory/import', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        }
    },

    // ── Journal des Dégustations ──
    tastings: {
        async getAll() {
            return API.request('/api/tastings', { method: 'GET' });
        },

        async add(tastingData) {
            return API.request('/api/tastings', {
                method: 'POST',
                body: JSON.stringify(tastingData)
            });
        },

        async update(id, tastingData) {
            return API.request(`/api/tastings/${id}`, {
                method: 'PUT',
                body: JSON.stringify(tastingData)
            });
        },

        async delete(id) {
            return API.request(`/api/tastings/${id}`, { method: 'DELETE' });
        }
    },

    // ── Cote iDealwine & Estimation ──
    wine: {
        async getEstimate(nom, millesime, appellation, region) {
            const params = new URLSearchParams({
                nom: nom || '',
                millesime: millesime || '',
                appellation: appellation || '',
                region: region || ''
            });
            return API.request(`/api/wine/idealwine-estimate?${params.toString()}`, { method: 'GET' });
        }
    },

    // ── Export complet ──
    export: {
        async getExportData() {
            return API.request('/api/export', { method: 'GET' });
        }
    }
};

window.API = API;

