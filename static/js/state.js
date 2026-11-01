/**
 * BEN'ARMAGNAC — Central State & Data Stores
 */

const STATE = {
    currentUser: null,
    zones: [],
    inventory: [],
    tastingLog: [],
    
    // UI selections & filter states
    dashboardChartType: 'maturity', // 'maturity' | 'vintages' | 'appellations'
    inventoryGroupMode: 'domaine',  // 'domaine' | 'millesime' | 'appellation'
    charts: { maturity: null, type: null, histMonthly: null, histType: null, histNote: null },
    
    // 3D Scene state
    scene: {
        ref: null,
        camera: null,
        renderer: null,
        controls: null,
        raycaster: new THREE.Raycaster(),
        mouse: new THREE.Vector2(),
        objects: [],
        animId: null
    },
    
    // Leaflet map
    map: null,
    mapMarkers: [],
    
    // Helpers
    pendingImportData: null,
    undoTimers: {},

    // Methods
    getZoneById(id) {
        return this.zones.find(z => z.id === Number(id)) || null;
    },

    getBottlesInZone(zoneId) {
        return this.inventory.filter(b => b.statut === 'En cave' && (b.zone_id === Number(zoneId) || (!b.zone_id && zoneId === this.zones[0]?.id)));
    },

    getBottlesInSlot(zoneId, col, lig, cartonLabel = null) {
        return this.inventory.filter(b => {
            if (b.statut !== 'En cave') return false;
            const matchesZone = (b.zone_id === Number(zoneId)) || (!b.zone_id && zoneId === this.zones[0]?.id);
            if (!matchesZone) return false;
            if (cartonLabel) {
                return b.emplacement?.carton_label === cartonLabel || b.carton_label === cartonLabel;
            }
            return Number(b.emplacement?.col || b.col) === Number(col) &&
                   Number(b.emplacement?.lig || b.lig) === Number(lig);
        });
    }
};

// Sémantique Couleurs Cépages & Terroirs de caractère
const WINE_COLORS = {
    'Rouge':      { hex: '#58111a', hex3d: 0x58111a, css: 'badge-rouge' },
    'Blanc':      { hex: '#8a6218', hex3d: 0xc49b38, css: 'badge-blanc' },
    'Rosé':       { hex: '#9a2847', hex3d: 0xc44569, css: 'badge-rose' },
    'Champagne':  { hex: '#9b7a2d', hex3d: 0xbfa04c, css: 'badge-champagne' },
    'Cidre':      { hex: '#9c5414', hex3d: 0xb86c22, css: 'badge-cidre' },
    'Bière':      { hex: '#986616', hex3d: 0xb87c1e, css: 'badge-biere' },
    'Spiritueux': { hex: '#873e12', hex3d: 0xa84e18, css: 'badge-spiritueux' },
    'Armagnac':   { hex: '#873e12', hex3d: 0xa84e18, css: 'badge-spiritueux' },
    'Cognac':     { hex: '#873e12', hex3d: 0xa84e18, css: 'badge-spiritueux' },
    'Whisky':     { hex: '#873e12', hex3d: 0xa84e18, css: 'badge-spiritueux' },
    'Rhum':       { hex: '#7a330e', hex3d: 0x9e3f14, css: 'badge-spiritueux' }
};

window.STATE = STATE;
window.WINE_COLORS = WINE_COLORS;

