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

// Sémantique Couleurs WCAG AA
const WINE_COLORS = {
    'Rouge':      { hex: '#800020', hex3d: 0x800020, css: 'badge-rouge' },
    'Blanc':      { hex: '#854d0e', hex3d: 0xeab308, css: 'badge-blanc' },
    'Rosé':       { hex: '#9d174d', hex3d: 0xf472b6, css: 'badge-rose' },
    'Champagne':  { hex: '#c9a84c', hex3d: 0xc9a84c, css: 'badge-champagne' },
    'Cidre':      { hex: '#b45309', hex3d: 0xb45309, css: 'badge-cidre' },
    'Bière':      { hex: '#d97706', hex3d: 0xd97706, css: 'badge-biere' },
    'Spiritueux': { hex: '#9a3412', hex3d: 0x9a3412, css: 'badge-spiritueux' },
    'Armagnac':   { hex: '#b45309', hex3d: 0xb45309, css: 'badge-spiritueux' },
    'Cognac':     { hex: '#b45309', hex3d: 0xb45309, css: 'badge-spiritueux' },
    'Whisky':     { hex: '#b45309', hex3d: 0xb45309, css: 'badge-spiritueux' },
    'Rhum':       { hex: '#92400e', hex3d: 0x92400e, css: 'badge-spiritueux' }
};

window.STATE = STATE;
window.WINE_COLORS = WINE_COLORS;

