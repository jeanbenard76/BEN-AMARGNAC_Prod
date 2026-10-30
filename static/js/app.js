/**
 * BEN'ARMAGNAC v3.0 — Application Controller
 * Intègre le multi-utilisateurs, la personnalisation des agencements (cartons, casiers, armoires)
 * et synchronise le tout avec le backend VPS / SQLite WAL.
 */

document.addEventListener('DOMContentLoaded', async () => {
    initAuthListeners();
    initNavigation();
    initDateDisplay();
    initMurPicker();
    initTastingModal();
    initEditTastingModal();
    setupFormListeners();
    setupSearchListeners();
    initDashboardChartSelector();
    initIO();
    initCellarConfigListeners();

    // Vérification de la session utilisateur
    await checkUserSession();
});

// ==========================================
// AUTHENTIFICATION & SESSION UTILISATEUR
// ==========================================

async function checkUserSession() {
    try {
        const res = await API.auth.getMe();
        if (res.user) {
            setCurrentUser(res.user);
            await loadAllUserData();
            hideAuthModal();
        } else {
            showAuthModal();
        }
    } catch (e) {
        showAuthModal();
    }
}

function setCurrentUser(user) {
    STATE.currentUser = user;
    const nameEls = document.querySelectorAll('.user-caviste-name');
    nameEls.forEach(el => el.textContent = user.cave_name || 'Ma Cave');
    
    const roleEls = document.querySelectorAll('.user-caviste-role');
    roleEls.forEach(el => el.textContent = user.email);

    const docTitle = document.getElementById('userCellarTitle');
    if (docTitle) docTitle.textContent = user.cave_name || "Livre de Cave";
}

function showAuthModal(tab = 'login') {
    const modal = document.getElementById('authOverlay');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.setProperty('display', 'flex', 'important');
    switchAuthTab(tab);
}

function hideAuthModal() {
    const modal = document.getElementById('authOverlay');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.setProperty('display', 'none', 'important');
    }
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('authLoginForm');
    const registerForm = document.getElementById('authRegisterForm');
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');

    if (tab === 'login') {
        if (loginForm) {
            loginForm.classList.remove('hidden');
            loginForm.style.setProperty('display', 'block', 'important');
        }
        if (registerForm) {
            registerForm.classList.add('hidden');
            registerForm.style.setProperty('display', 'none', 'important');
        }
        if (tabLoginBtn) tabLoginBtn.classList.add('active');
        if (tabRegisterBtn) tabRegisterBtn.classList.remove('active');
    } else {
        if (loginForm) {
            loginForm.classList.add('hidden');
            loginForm.style.setProperty('display', 'none', 'important');
        }
        if (registerForm) {
            registerForm.classList.remove('hidden');
            registerForm.style.setProperty('display', 'block', 'important');
        }
        if (tabLoginBtn) tabLoginBtn.classList.remove('active');
        if (tabRegisterBtn) tabRegisterBtn.classList.add('active');
    }
}

function initAuthListeners() {
    // Événement d'expiration de session
    window.addEventListener('auth:required', () => {
        showToast('Session expirée, veuillez vous reconnecter.', 'error');
        showAuthModal('login');
    });

    // Formulaire de Connexion
    const loginForm = document.getElementById('authLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login_email').value.trim();
            const password = document.getElementById('login_password').value;
            const btn = loginForm.querySelector('button[type=submit]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';

            try {
                const res = await API.auth.login(email, password);
                if (res.user) {
                    setCurrentUser(res.user);
                    hideAuthModal();
                    await loadAllUserData();
                    showToast(`Bienvenue dans votre cave, ${res.user.cave_name} !`, 'success');
                }
            } catch (err) {
                showToast(err.message || 'Erreur de connexion', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Se connecter';
            }
        });
    }

    // Formulaire d'Inscription
    const regForm = document.getElementById('authRegisterForm');
    if (regForm) {
        regForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('reg_email').value.trim();
            const password = document.getElementById('reg_password').value;
            const cave_name = document.getElementById('reg_cave_name').value.trim() || 'Ma Cave';
            const btn = regForm.querySelector('button[type=submit]');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';

            try {
                const res = await API.auth.register(email, password, cave_name);
                if (res.user) {
                    setCurrentUser(res.user);
                    hideAuthModal();
                    await loadAllUserData();
                    showToast(`Votre cave "${res.user.cave_name}" a été créée avec succès !`, 'success');
                }
            } catch (err) {
                showToast(err.message || "Erreur lors de l'inscription", 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer ma cave';
            }
        });
    }

    // Bouton de déconnexion
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await API.auth.logout();
                STATE.currentUser = null;
                STATE.inventory = [];
                STATE.zones = [];
                STATE.tastingLog = [];
                showToast('Vous êtes déconnecté', 'info');
                showAuthModal('login');
            } catch (e) {
                showAuthModal('login');
            }
        });
    }

    // Profil modal
    const btnProfile = document.getElementById('btnUserProfile');
    const profileModal = document.getElementById('profileModal');
    if (btnProfile && profileModal) {
        btnProfile.addEventListener('click', () => {
            if (!STATE.currentUser) return;
            document.getElementById('prof_cave_name').value = STATE.currentUser.cave_name || '';
            document.getElementById('prof_email').value = STATE.currentUser.email || '';
            profileModal.classList.remove('hidden');
        });
    }

    const formProfile = document.getElementById('formProfile');
    if (formProfile) {
        formProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = document.getElementById('prof_cave_name').value.trim();
            const newPw = document.getElementById('prof_password').value.trim();

            try {
                const res = await API.auth.updateProfile(newName, newPw || undefined);
                if (res.user) {
                    setCurrentUser(res.user);
                    document.getElementById('profileModal').classList.add('hidden');
                    showToast('Profil et nom de cave mis à jour !', 'success');
                }
            } catch (err) {
                showToast(err.message || 'Erreur mise à jour', 'error');
            }
        });
    }
}

// ==========================================
// CHARGEMENT & SYNCHRONISATION DES DONNÉES
// ==========================================

async function loadAllUserData() {
    try {
        const [zones, inventory, tastings] = await Promise.all([
            API.zones.getAll(),
            API.inventory.getAll(),
            API.tastings.getAll()
        ]);

        STATE.zones = zones || [];
        STATE.inventory = inventory || [];
        STATE.tastingLog = tastings || [];

        // Mise à jour de l'UI
        initDashboardFilters();
        updateDashboard();
        renderInventoryTable();
        renderHistoryFeed();
        renderCellarZonesList();
        updateZoneDropdowns();
        
        // Si la vue 3D est active, l'initialiser
        if (!document.getElementById('cave3d').classList.contains('hidden')) {
            init3D();
        }
    } catch (e) {
        console.error('Erreur chargement données utilisateur:', e);
        showToast('Erreur de synchronisation avec le serveur', 'error');
    }
}

// ==========================================
// AGENCEMENT DE LA CAVE (GESTION DES ZONES)
// ==========================================

function renderCellarZonesList() {
    const container = document.getElementById('cellarZonesGrid');
    if (!container) return;

    if (STATE.zones.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-boxes"></i>
                <h3>Aucun espace configuré</h3>
                <p>Ajoutez votre premier espace de stockage (cartons, casiers losanges, étagères ou armoire vitrée).</p>
                <button class="btn-primary" onclick="openAddZoneModal()">
                    <i class="fas fa-plus"></i> Créer un espace
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = STATE.zones.map(z => {
        const bottlesInZone = STATE.getBottlesInZone(z.id);
        const count = bottlesInZone.length;
        
        let typeBadge = '';
        let typeIcon = '';
        let typeDesc = '';

        if (z.type === 'cartons') {
            typeBadge = '<span class="zone-type-badge badge-type-cartons"><i class="fas fa-box"></i> Cartons / Caisses</span>';
            typeIcon = '<i class="fas fa-boxes" style="color: #b45309;"></i>';
            typeDesc = `${z.columns} piles × ${z.rows} cartons de haut (~${z.columns * z.rows} cartons)`;
        } else if (z.type === 'armoire') {
            typeBadge = '<span class="zone-type-badge badge-type-armoire"><i class="fas fa-temperature-low"></i> Armoire à vin</span>';
            typeIcon = '<i class="fas fa-door-closed" style="color: #2563eb;"></i>';
            typeDesc = `${z.rows} clayettes coulissantes`;
        } else if (z.type === 'etagere') {
            typeBadge = '<span class="zone-type-badge badge-type-etagere"><i class="fas fa-bars"></i> Étagères droites</span>';
            typeIcon = '<i class="fas fa-align-justify" style="color: #16a34a;"></i>';
            typeDesc = `${z.columns} colonnes × ${z.rows} étagères`;
        } else {
            typeBadge = '<span class="zone-type-badge badge-type-losange"><i class="fas fa-th-large"></i> Casiers Losanges</span>';
            typeIcon = '<i class="fas fa-border-all" style="color: #800020;"></i>';
            typeDesc = `${z.columns} colonnes × ${z.rows} lignes (${z.columns * z.rows} casiers)`;
        }

        return `
            <div class="cellar-zone-card">
                <div class="zone-card-header">
                    <div>
                        <div class="zone-card-title">${escHtml(z.name)}</div>
                        <div style="margin-top: 6px;">${typeBadge}</div>
                    </div>
                    <div style="font-size: 26px;">${typeIcon}</div>
                </div>

                <div class="zone-details-list">
                    <div class="zone-detail-row">
                        <span>Configuration</span>
                        <span>${typeDesc}</span>
                    </div>
                    <div class="zone-detail-row">
                        <span>Bouteilles stockées</span>
                        <span style="color: var(--primary); font-size: 15px;">${count} bouteille(s)</span>
                    </div>
                </div>

                <div class="zone-card-actions">
                    <button class="action-btn" title="Modifier l'espace" onclick="openEditZoneModal(${z.id})">
                        <i class="fas fa-pen"></i> Modifier
                    </button>
                    <button class="action-btn delete-btn" title="Supprimer l'espace" onclick="confirmDeleteZone(${z.id}, '${escHtml(z.name)}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateZoneDropdowns() {
    const zoneSelect = document.getElementById('f_zone');
    const filterZoneSelect = document.getElementById('filterZone');

    const options = STATE.zones.map(z => {
        let iconText = z.type === 'cartons' ? '📦 Cartons' : (z.type === 'armoire' ? '❄️ Armoire' : '🪵 Casiers');
        return `<option value="${z.id}">${escHtml(z.name)} (${iconText})</option>`;
    }).join('');

    if (zoneSelect) {
        zoneSelect.innerHTML = options || '<option value="">Aucun espace configuré</option>';
        onZoneSelectChange();
    }

    if (filterZoneSelect) {
        filterZoneSelect.innerHTML = `<option value="">Tous les espaces</option>${options}`;
    }
}

function onZoneSelectChange() {
    const zoneSelect = document.getElementById('f_zone');
    if (!zoneSelect) return;
    const selectedZoneId = Number(zoneSelect.value);
    const zone = STATE.getZoneById(selectedZoneId);

    const cartonGroup = document.getElementById('placementCartonGroup');
    const gridGroup = document.getElementById('placementGridGroup');
    const armoireGroup = document.getElementById('placementArmoireGroup');

    if (!zone) return;

    if (zone.type === 'cartons') {
        if (cartonGroup) cartonGroup.style.display = 'block';
        if (gridGroup) gridGroup.style.display = 'none';
        if (armoireGroup) armoireGroup.style.display = 'none';

        updateCartonDropdownForDomaine(zone);
    } else if (zone.type === 'armoire') {
        if (cartonGroup) cartonGroup.style.display = 'none';
        if (gridGroup) gridGroup.style.display = 'none';
        if (armoireGroup) armoireGroup.style.display = 'block';

        const clayetteSelect = document.getElementById('f_clayette');
        if (clayetteSelect) {
            let opts = '';
            for (let i = 1; i <= (zone.rows || 6); i++) {
                opts += `<option value="${i}">Clayette ${i} ${i===1?'(Haut)':(i===zone.rows?'(Bas)':'')}</option>`;
            }
            clayetteSelect.innerHTML = opts;
        }
    } else {
        // Losange ou Étagère
        if (cartonGroup) cartonGroup.style.display = 'none';
        if (gridGroup) gridGroup.style.display = 'flex';
        if (armoireGroup) armoireGroup.style.display = 'none';

        const colInput = document.getElementById('f_col');
        const ligInput = document.getElementById('f_lig');
        if (colInput) colInput.max = zone.columns || 14;
        if (ligInput) ligInput.max = zone.rows || 3;
    }
}

function initCellarConfigListeners() {
    const btnAddZone = document.getElementById('btnAddZone');
    const modalZone = document.getElementById('modalZone');
    const formZone = document.getElementById('formZone');

    if (btnAddZone) {
        btnAddZone.addEventListener('click', () => openAddZoneModal());
    }

    // Sélecteur de type visuel dans la modale d'espace
    document.querySelectorAll('.storage-type-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.storage-type-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const type = card.dataset.type;
            document.getElementById('zone_type').value = type;
            adjustZoneFormFields(type);
        });
    });

    if (formZone) {
        formZone.addEventListener('submit', async (e) => {
            e.preventDefault();
            const editId = document.getElementById('zone_edit_id').value;
            const name = document.getElementById('zone_name').value.trim() || 'Mon Espace';
            const type = document.getElementById('zone_type').value;
            const cols = parseInt(document.getElementById('zone_cols').value) || 6;
            const rows = parseInt(document.getElementById('zone_rows').value) || 3;
            const cap = parseInt(document.getElementById('zone_cap').value) || 12;

            try {
                if (editId) {
                    await API.zones.update(editId, { name, type, columns: cols, rows, capacity_per_slot: cap });
                    showToast('Espace modifié avec succès !', 'success');
                } else {
                    await API.zones.create({ name, type, columns: cols, rows, capacity_per_slot: cap });
                    showToast('Nouvel espace de stockage ajouté !', 'success');
                }
                modalZone.classList.add('hidden');
                await loadAllUserData();
            } catch (err) {
                showToast(err.message || 'Erreur lors de la sauvegarde de l\'espace', 'error');
            }
        });
    }

    const zoneSelect = document.getElementById('f_zone');
    if (zoneSelect) {
        zoneSelect.addEventListener('change', onZoneSelectChange);
    }
}

function openAddZoneModal() {
    const modal = document.getElementById('modalZone');
    if (!modal) return;
    document.getElementById('zoneModalTitle').textContent = "Ajouter un espace de stockage";
    document.getElementById('zone_edit_id').value = '';
    document.getElementById('zone_name').value = '';
    
    // Select first type (Cartons)
    const firstType = document.querySelector('.storage-type-card[data-type="cartons"]');
    if (firstType) firstType.click();

    modal.classList.remove('hidden');
}

function openEditZoneModal(zoneId) {
    const zone = STATE.getZoneById(zoneId);
    if (!zone) return;

    const modal = document.getElementById('modalZone');
    document.getElementById('zoneModalTitle').textContent = `Modifier : ${zone.name}`;
    document.getElementById('zone_edit_id').value = zone.id;
    document.getElementById('zone_name').value = zone.name;
    document.getElementById('zone_cols').value = zone.columns;
    document.getElementById('zone_rows').value = zone.rows;
    document.getElementById('zone_cap').value = zone.capacity_per_slot;

    const typeCard = document.querySelector(`.storage-type-card[data-type="${zone.type}"]`);
    if (typeCard) typeCard.click();

    modal.classList.remove('hidden');
}

function adjustZoneFormFields(type) {
    const lblCols = document.getElementById('lblZoneCols');
    const lblRows = document.getElementById('lblZoneRows');
    const lblCap = document.getElementById('lblZoneCap');

    if (type === 'cartons') {
        if (lblCols) lblCols.textContent = "Nombre de piles de cartons";
        if (lblRows) lblRows.textContent = "Hauteur (cartons empilés)";
        if (lblCap) lblCap.textContent = "Bouteilles par carton (ex: 6 ou 12)";
    } else if (type === 'armoire') {
        if (lblCols) lblCols.textContent = "Portes / Sections";
        if (lblRows) lblRows.textContent = "Nombre de clayettes coulissantes";
        if (lblCap) lblCap.textContent = "Capacité moyenne par clayette";
    } else if (type === 'etagere') {
        if (lblCols) lblCols.textContent = "Nombre de colonnes d'étagères";
        if (lblRows) lblRows.textContent = "Nombre de niveaux d'étagères";
        if (lblCap) lblCap.textContent = "Bouteilles par niveau";
    } else {
        if (lblCols) lblCols.textContent = "Nombre de colonnes de casiers";
        if (lblRows) lblRows.textContent = "Nombre de lignes de casiers";
        if (lblCap) lblCap.textContent = "Capacité max par casier losange";
    }
}

async function confirmDeleteZone(zoneId, zoneName) {
    if (!confirm(`Supprimer l'espace "${zoneName}" ? Les bouteilles rangées dans cet espace resteront dans l'inventaire.`)) return;

    try {
        await API.zones.delete(zoneId);
        showToast('Espace supprimé', 'info');
        await loadAllUserData();
    } catch (err) {
        showToast(err.message || 'Erreur suppression', 'error');
    }
}

// ==========================================
// NAVIGATION & INTERFACE
// ==========================================

function navigateToView(target) {
    if (!target) return;

    // Mise à jour sidebar desktop
    document.querySelectorAll('.nav-links li').forEach(l => {
        const match = l.dataset.target === target;
        l.classList.toggle('active', match);
        l.setAttribute('aria-current', match ? 'page' : 'false');
    });

    // Mise à jour bottom-nav mobile
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === target);
    });

    // Affichage de la vue demandée
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
        v.classList.add('hidden');
    });

    const activeView = document.getElementById(target);
    if (activeView) {
        activeView.classList.remove('hidden');
        activeView.classList.add('active');
        if (target === 'inventory') renderInventoryTable();
        if (target === 'historique') renderHistoryFeed();
        if (target === 'map') setTimeout(initMap, 150);
        if (target === 'cave3d') setTimeout(init3D, 80);
        else stop3D();
        if (target === 'cellar-config') renderCellarZonesList();
    }

    // Scroll fluide vers le haut sur mobile
    const content = document.querySelector('.content');
    if (content) content.scrollTop = 0;
}

function initNavigation() {
    // Écoute des clics sur la sidebar et sur la barre mobile
    document.querySelectorAll('.nav-links li, .mobile-nav-item').forEach(el => {
        const handler = () => navigateToView(el.dataset.target);
        el.addEventListener('click', handler);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler();
            }
        });
    });

    // Boutons de la barre supérieure mobile
    const btnMobileAdd = document.getElementById('btnMobileAddWine');
    if (btnMobileAdd) {
        btnMobileAdd.addEventListener('click', () => {
            document.getElementById('btnAddWine')?.click();
        });
    }

    const btnMobileProfile = document.getElementById('btnMobileProfile');
    if (btnMobileProfile) {
        btnMobileProfile.addEventListener('click', () => {
            document.getElementById('btnUserProfile')?.click();
        });
    }
}

function initDateDisplay() {
    const el = document.getElementById('currentDateDisplay');
    if (el) el.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ==========================================
// LIVRE DE CAVE & FORMULAIRES DE VIN
// ==========================================


// ── Gestion "Un Carton par Domaine" ──
function updateCartonDropdownForDomaine(zoneParam = null) {
    const zoneSelect = document.getElementById('f_zone');
    if (!zoneSelect) return;
    const selectedZoneId = Number(zoneSelect.value);
    const zone = zoneParam || STATE.getZoneById(selectedZoneId);
    if (!zone || zone.type !== 'cartons') return;

    const cartonSelect = document.getElementById('f_carton');
    const hintSpan = document.getElementById('cartonDomaineHint');
    if (!cartonSelect) return;

    const currentDomaine = (document.getElementById('f_nom')?.value || '').trim();
    const nbCartons = (zone.columns || 4) * (zone.rows || 3);
    const capPerCarton = zone.capacity_per_slot || 6;

    // Cartographie des cartons existants dans la zone
    const cartonMap = {};
    for (let i = 1; i <= nbCartons; i++) {
        cartonMap[`Carton ${i}`] = {
            domaine: null,
            count: 0,
            bottles: []
        };
    }

    STATE.inventory.filter(b => b.statut === 'En cave' && (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id))).forEach(b => {
        const lbl = b.emplacement?.carton_label;
        if (lbl && cartonMap[lbl]) {
            cartonMap[lbl].count++;
            cartonMap[lbl].bottles.push(b);
            if (!cartonMap[lbl].domaine && b.nom) {
                cartonMap[lbl].domaine = b.nom.trim();
            }
        }
    });

    let opts = '';
    let selectedCarton = null;
    let dedicatedCount = 0;

    // 1. Cartons déjà attribués au domaine actuellement saisi
    if (currentDomaine) {
        for (let i = 1; i <= nbCartons; i++) {
            const lbl = `Carton ${i}`;
            const c = cartonMap[lbl];
            if (c.domaine && c.domaine.toLowerCase() === currentDomaine.toLowerCase()) {
                const free = Math.max(0, capPerCarton - c.count);
                const isFull = free === 0;
                const statusStr = isFull ? '(Complet)' : `(${c.count}/${capPerCarton} blles • ${free} libre${free>1?'s':''})`;
                const sel = !selectedCarton && !isFull ? 'selected' : '';
                if (sel) selectedCarton = lbl;
                opts += `<option value="${lbl}" ${sel}>⭐ ${lbl} — Dédié à "${c.domaine}" ${statusStr}</option>`;
                dedicatedCount++;
            }
        }
    }

    // 2. Cartons vides disponibles pour ce domaine
    for (let i = 1; i <= nbCartons; i++) {
        const lbl = `Carton ${i}`;
        const c = cartonMap[lbl];
        if (c.count === 0) {
            const prefix = (dedicatedCount === 0 && currentDomaine) ? `✨ Nouveau carton pour "${currentDomaine}" : ` : '';
            const sel = !selectedCarton ? 'selected' : '';
            if (sel) selectedCarton = lbl;
            opts += `<option value="${lbl}" ${sel}>${prefix}${lbl} (Vide • ${capPerCarton} places)</option>`;
        }
    }

    // 3. Cartons réservés à d'autres domaines (grisés pour respecter 1 carton par domaine)
    for (let i = 1; i <= nbCartons; i++) {
        const lbl = `Carton ${i}`;
        const c = cartonMap[lbl];
        if (c.count > 0 && (!currentDomaine || !c.domaine || c.domaine.toLowerCase() !== currentDomaine.toLowerCase())) {
            opts += `<option value="${lbl}" disabled>🔒 ${lbl} — Réservé à "${c.domaine || 'Autre'}" (${c.count} blles)</option>`;
        }
    }

    cartonSelect.innerHTML = opts || `<option value="Carton 1">Carton 1</option>`;
    if (hintSpan) {
        if (dedicatedCount > 0) {
            hintSpan.textContent = `${dedicatedCount} carton(s) pour ce domaine`;
        } else if (currentDomaine) {
            hintSpan.textContent = `Nouveau carton attribué`;
        } else {
            hintSpan.textContent = '';
        }
    }
}


function setupFormListeners() {
    const btnAdd = document.getElementById('btnAddWine');
    const modalAdd = document.getElementById('modalAdd');
    const formWine = document.getElementById('formAddWine');
    const btnSaveAndAddAnother = document.getElementById('btnSaveAndAddAnother');

    if (btnAdd && modalAdd) {
        btnAdd.addEventListener('click', () => {
            clearWineForm();
            updateZoneDropdowns();
            document.getElementById('modalTitle').textContent = "Ajouter un vin";
            document.getElementById('edit_bottle_id').value = '';
            modalAdd.classList.remove('hidden');
        });
    }

    if (formWine) {
        formWine.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleWineSubmit(true);
        });
    }

    if (btnSaveAndAddAnother) {
        btnSaveAndAddAnother.addEventListener('click', async () => {
            await handleWineSubmit(false);
        });
    }
}


    // Mise à jour instantanée du carton quand on tape le nom du domaine
    const fNomInput = document.getElementById('f_nom');
    if (fNomInput) {
        fNomInput.addEventListener('input', () => {
            updateCartonDropdownForDomaine();
        });
    }

    // Bouton Estimation Cote iDealwine
    const btnEstimate = document.getElementById('btnIdealwineEstimate');
    if (btnEstimate) {
        btnEstimate.addEventListener('click', async () => {
            const nom = (document.getElementById('f_nom')?.value || '').trim();
            const millesime = (document.getElementById('f_millesime')?.value || '').trim();
            const appellation = (document.getElementById('f_appellation')?.value || '').trim();
            const region = (document.getElementById('f_region')?.value || '').trim();

            if (!nom) {
                showToast('Renseignez d\'abord le nom du domaine pour estimer sa cote', 'info');
                document.getElementById('f_nom')?.focus();
                return;
            }

            btnEstimate.disabled = true;
            btnEstimate.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recherche...';

            try {
                const res = await API.wine.getEstimate(nom, millesime, appellation, region);
                if (res.success) {
                    const priceInput = document.getElementById('f_prix');
                    if (priceInput && (!priceInput.value || Number(priceInput.value) === 0)) {
                        priceInput.value = res.estimate_price;
                    }

                    const hintEl = document.getElementById('idealwineEstimateHint');
                    if (hintEl) {
                        hintEl.style.display = 'block';
                        hintEl.innerHTML = `
                            <span style="color:#059669; font-weight:600;">
                                <i class="fas fa-check-circle"></i> Cote estimée : ~${res.estimate_price} €
                            </span>
                            <span style="color:#6b7280; font-size:10px;">(${res.low_estimate} € - ${res.high_estimate} €)</span>
                            <a href="${res.idealwine_url}" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:600; margin-left:6px; text-decoration:none;">
                                Ouvrir iDealwine <i class="fas fa-external-link-alt" style="font-size:10px;"></i>
                            </a>
                        `;
                    }
                    showToast(`Cote estimée : ~${res.estimate_price} € pour ${nom} ${millesime}`, 'success');
                }
            } catch (err) {
                showToast('Impossible d\'obtenir la cote pour ce flacon', 'error');
            } finally {
                btnEstimate.disabled = false;
                btnEstimate.innerHTML = '<i class="fas fa-search-dollar"></i> Cote iDealwine';
            }
        });
    }

}

function clearWineForm() {
    document.getElementById('f_nom').value = '';
    document.getElementById('f_appellation').value = '';
    document.getElementById('f_millesime').value = new Date().getFullYear() - 2;
    document.getElementById('f_type').value = 'Rouge';
    document.getElementById('f_region').value = 'Bordeaux';
    document.getElementById('f_prix').value = '';
    document.getElementById('f_apogee_debut').value = '';
    document.getElementById('f_apogee_fin').value = '';
    document.getElementById('f_quantite').value = 1;
    document.getElementById('f_col').value = 1;
    document.getElementById('f_lig').value = 1;
    document.getElementById('f_notes').value = '';
}

async function handleWineSubmit(shouldClose) {
    const editId = document.getElementById('edit_bottle_id').value;
    const nom = document.getElementById('f_nom').value.trim();
    if (!nom) {
        showToast('Le nom du domaine ou du vin est obligatoire', 'error');
        return;
    }

    const zoneId = parseInt(document.getElementById('f_zone').value) || (STATE.zones[0]?.id || 1);
    const zone = STATE.getZoneById(zoneId);

    let col = 1, lig = 1, cartonLabel = '';
    if (zone && zone.type === 'cartons') {
        cartonLabel = document.getElementById('f_carton').value || 'Carton 1';
    } else if (zone && zone.type === 'armoire') {
        lig = parseInt(document.getElementById('f_clayette').value) || 1;
    } else {
        col = parseInt(document.getElementById('f_col').value) || 1;
        lig = parseInt(document.getElementById('f_lig').value) || 1;
    }

    const wineData = {
        nom: nom,
        appellation: document.getElementById('f_appellation').value.trim(),
        millesime: parseInt(document.getElementById('f_millesime').value) || null,
        type: document.getElementById('f_type').value,
        region: document.getElementById('f_region').value.trim(),
        prix: parseFloat(document.getElementById('f_prix').value) || 0,
        apogee_debut: parseInt(document.getElementById('f_apogee_debut').value) || null,
        apogee_fin: parseInt(document.getElementById('f_apogee_fin').value) || null,
        quantite: parseInt(document.getElementById('f_quantite').value) || 1,
        emplacement: {
            zone_id: zoneId,
            col: col,
            lig: lig,
            carton_label: cartonLabel,
            mur: 1
        },
        notes: document.getElementById('f_notes').value.trim(),
        statut: 'En cave'
    };

    try {
        if (editId) {
            await API.inventory.update(editId, wineData);
            showToast(`${wineData.nom} mis à jour !`, 'success');
        } else {
            await API.inventory.add(wineData);
            showToast(`${wineData.quantite} bouteille(s) de ${wineData.nom} ajoutée(s) !`, 'success');
        }

        await loadAllUserData();

        if (shouldClose) {
            document.getElementById('modalAdd').classList.add('hidden');
        } else {
            document.getElementById('f_nom').value = '';
            document.getElementById('f_nom').focus();
        }
    } catch (err) {
        showToast(err.message || 'Erreur enregistrement vin', 'error');
    }
}

function openEditWineModal(bottleId) {
    const bottle = STATE.inventory.find(b => b.id === Number(bottleId));
    if (!bottle) return;

    updateZoneDropdowns();
    document.getElementById('modalTitle').textContent = `Modifier : ${bottle.nom}`;
    document.getElementById('edit_bottle_id').value = bottle.id;

    document.getElementById('f_nom').value = bottle.nom || '';
    document.getElementById('f_appellation').value = bottle.appellation || '';
    document.getElementById('f_millesime').value = bottle.millesime || '';
    document.getElementById('f_type').value = bottle.type || 'Rouge';
    document.getElementById('f_region').value = bottle.region || '';
    document.getElementById('f_prix').value = bottle.prix || '';
    document.getElementById('f_apogee_debut').value = bottle.apogee_debut || '';
    document.getElementById('f_apogee_fin').value = bottle.apogee_fin || '';
    document.getElementById('f_quantite').value = 1;
    document.getElementById('f_notes').value = bottle.notes || '';

    const zoneId = bottle.emplacement?.zone_id || bottle.zone_id || (STATE.zones[0]?.id || 1);
    document.getElementById('f_zone').value = zoneId;
    onZoneSelectChange();

    if (bottle.emplacement?.carton_label) {
        const cSelect = document.getElementById('f_carton');
        if (cSelect) cSelect.value = bottle.emplacement.carton_label;
    }
    if (bottle.emplacement?.col) document.getElementById('f_col').value = bottle.emplacement.col;
    if (bottle.emplacement?.lig) {
        document.getElementById('f_lig').value = bottle.emplacement.lig;
        const clSelect = document.getElementById('f_clayette');
        if (clSelect) clSelect.value = bottle.emplacement.lig;
    }

    document.getElementById('modalAdd').classList.remove('hidden');
}

async function deleteBottle(bottleId) {
    if (!confirm('Voulez-vous retirer cette bouteille de la cave ?')) return;

    try {
        await API.inventory.delete(bottleId);
        showToast('Bouteille retirée de la cave', 'info');
        await loadAllUserData();
    } catch (err) {
        showToast(err.message || 'Erreur suppression', 'error');
    }
}

// ── Rendu du tableau d'inventaire ──
function renderInventoryTable() {
    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const filterType = document.getElementById('filterType')?.value || '';
    const filterZone = document.getElementById('filterZone')?.value || '';

    const currentYear = new Date().getFullYear();

    // Filtre des bouteilles actives
    const filtered = STATE.inventory.filter(b => {
        if (b.statut !== 'En cave') return false;
        if (filterType && b.type !== filterType) return false;
        if (filterZone && Number(b.zone_id || b.emplacement?.zone_id) !== Number(filterZone)) return false;
        if (searchTerm) {
            const str = `${b.nom} ${b.appellation} ${b.millesime} ${b.region}`.toLowerCase();
            if (!str.includes(searchTerm)) return false;
        }
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 48px 16px; color: var(--text-muted);">
                    <i class="fas fa-wine-bottle" style="font-size: 32px; opacity: 0.3; margin-bottom: 8px; display: block;"></i>
                    Aucun vin ne correspond à votre recherche.
                </td>
            </tr>
        `;
        return;
    }

    // Regroupement par domaine
    const groups = {};
    filtered.forEach(b => {
        const key = `${b.nom}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
    });

    tbody.innerHTML = Object.entries(groups).map(([domaine, bottles]) => {
        const totalQty = bottles.length;
        const first = bottles[0];
        const badgeClass = WINE_COLORS[first.type]?.css || 'badge-rouge';
        
        // Sous-lignes pour chaque millésime / bouteille
        const detailRows = bottles.map(b => {
            const zone = STATE.getZoneById(b.zone_id || b.emplacement?.zone_id);
            let locString = '';
            if (zone) {
                if (zone.type === 'cartons') {
                    locString = `📦 ${zone.name} — ${b.emplacement?.carton_label || 'Carton'}`;
                } else if (zone.type === 'armoire') {
                    locString = `❄️ ${zone.name} — Clayette ${b.emplacement?.lig || 1}`;
                } else {
                    locString = `🪵 ${zone.name} (C${b.emplacement?.col || 1}, L${b.emplacement?.lig || 1})`;
                }
            } else {
                locString = `Casier (C${b.emplacement?.col || 1}, L${b.emplacement?.lig || 1})`;
            }

            let apogeeBadge = '';
            if (b.apogee_debut && b.apogee_fin) {
                if (currentYear < b.apogee_debut) {
                    apogeeBadge = `<span class="badge" style="background:#eff6ff;color:#1e40af;">À garder (${b.apogee_debut}-${b.apogee_fin})</span>`;
                } else if (currentYear <= b.apogee_fin) {
                    apogeeBadge = `<span class="badge" style="background:#f0fdf4;color:#166534;">À point (${b.apogee_debut}-${b.apogee_fin})</span>`;
                } else {
                    apogeeBadge = `<span class="badge" style="background:#fef2f2;color:#991b1b;">À boire d'urgence</span>`;
                }
            } else {
                apogeeBadge = `<span style="color:#9ca3af;font-size:11px;">Non renseignée</span>`;
            }

            return `
                <tr>
                    <td style="padding-left: 36px; font-weight: 600;">${b.millesime || 'N.V.'}</td>
                    <td>${b.appellation ? escHtml(b.appellation) : '—'}</td>
                    <td>${locString}</td>
                    <td>${b.prix ? b.prix.toFixed(2) + ' €' : '—'}</td>
                    <td>${apogeeBadge}</td>
                    <td class="text-right">
                        <button class="action-btn drink-btn" title="Déguster ce flacon" onclick="openTastingForBottle(${b.id})">
                            <i class="fas fa-wine-glass-alt"></i>
                        </button>
                        <button class="action-btn" title="Modifier" onclick="openEditWineModal(${b.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="action-btn delete-btn" title="Retirer" onclick="deleteBottle(${b.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <tr class="parent-row" onclick="toggleAccordion(this)">
                <td>
                    <i class="fas fa-chevron-right" style="margin-right: 10px;"></i>
                    <strong>${escHtml(domaine)}</strong>
                </td>
                <td><span class="badge ${badgeClass}">${first.type}</span></td>
                <td>${first.region ? escHtml(first.region) : '—'}</td>
                <td><span class="count-badge">${totalQty} bll.</span></td>
                <td colspan="3" style="color: var(--text-muted); font-size: 12px;">Cliquer pour dérouler les millésimes</td>
            </tr>
            <tr class="child-row">
                <td colspan="7" style="padding: 0;">
                    <table class="detail-table">
                        <thead>
                            <tr class="detail-header">
                                <th style="padding-left: 36px;">Millésime</th>
                                <th>Appellation</th>
                                <th>Emplacement</th>
                                <th>Prix</th>
                                <th>Apogée</th>
                                <th class="text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>${detailRows}</tbody>
                    </table>
                </td>
            </tr>
        `;
    }).join('');
}

function toggleAccordion(row) {
    row.classList.toggle('expanded');
    const childRow = row.nextElementSibling;
    if (childRow && childRow.classList.contains('child-row')) {
        childRow.classList.toggle('open');
    }
}

function setupSearchListeners() {
    const sInput = document.getElementById('searchInput');
    const fType = document.getElementById('filterType');
    const fZone = document.getElementById('filterZone');

    if (sInput) sInput.addEventListener('input', () => renderInventoryTable());
    if (fType) fType.addEventListener('change', () => renderInventoryTable());
    if (fZone) fZone.addEventListener('change', () => renderInventoryTable());
}

// ==========================================
// TABLEAU DE BORD (DASHBOARD)
// ==========================================

function updateDashboard() {
    const activeBottles = STATE.inventory.filter(b => b.statut === 'En cave');
    const currentYear = new Date().getFullYear();

    // KPI 1 : Total Bouteilles
    const totalEl = document.getElementById('kpiTotalBottles');
    if (totalEl) totalEl.textContent = activeBottles.length;

    // KPI 2 : Valeur Estimée
    const totalVal = activeBottles.reduce((sum, b) => sum + (b.prix || 0), 0);
    const valEl = document.getElementById('kpiTotalValue');
    if (valEl) valEl.textContent = totalVal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

    // KPI 3 : Prêtes à boire
    const readyCount = activeBottles.filter(b => b.apogee_debut && b.apogee_fin && currentYear >= b.apogee_debut && currentYear <= b.apogee_fin).length;
    const readyEl = document.getElementById('kpiReadyBottles');
    if (readyEl) readyEl.textContent = readyCount;

    // Rendu des graphiques
    renderDashboardCharts(activeBottles);
}

function initDashboardChartSelector() {
    document.querySelectorAll('.dash-chart-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dash-chart-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            STATE.dashboardChartType = btn.dataset.chart;
            const activeBottles = STATE.inventory.filter(b => b.statut === 'En cave');
            renderDashboardCharts(activeBottles);
        });
    });
}

function renderDashboardCharts(stock) {
    const maturityCanvas = document.getElementById('maturityChart');
    const typeCanvas = document.getElementById('typeChart');

    if (typeCanvas) {
        // Types de vin donut
        const typeCounts = { Rouge: 0, Blanc: 0, Rosé: 0, Champagne: 0, Cidre: 0 };
        stock.forEach(b => { if (typeCounts[b.type] !== undefined) typeCounts[b.type]++; });

        if (STATE.charts.type) STATE.charts.type.destroy();
        STATE.charts.type = new Chart(typeCanvas, {
            type: 'doughnut',
            data: {
                labels: Object.keys(typeCounts),
                datasets: [{
                    data: Object.values(typeCounts),
                    backgroundColor: ['#800020', '#854d0e', '#9d174d', '#c9a84c', '#b45309'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    if (maturityCanvas) {
        if (STATE.charts.maturity) STATE.charts.maturity.destroy();

        if (STATE.dashboardChartType === 'vintages') {
            // Distribution par millésime
            const vintCounts = {};
            stock.forEach(b => {
                if (b.millesime) vintCounts[b.millesime] = (vintCounts[b.millesime] || 0) + 1;
            });
            const labels = Object.keys(vintCounts).sort();
            const data = labels.map(l => vintCounts[l]);

            STATE.charts.maturity = new Chart(maturityCanvas, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ label: 'Bouteilles', data, backgroundColor: '#800020', borderRadius: 4 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        } else {
            // Par apogée
            const currentYear = new Date().getFullYear();
            const apogeeGroups = { 'À boire d\'urgence': 0, 'À point': 0, 'À garder': 0, 'Non renseignée': 0 };

            stock.forEach(b => {
                if (!b.apogee_debut || !b.apogee_fin) apogeeGroups['Non renseignée']++;
                else if (currentYear > b.apogee_fin) apogeeGroups['À boire d\'urgence']++;
                else if (currentYear >= b.apogee_debut) apogeeGroups['À point']++;
                else apogeeGroups['À garder']++;
            });

            STATE.charts.maturity = new Chart(maturityCanvas, {
                type: 'bar',
                data: {
                    labels: Object.keys(apogeeGroups),
                    datasets: [{
                        label: 'Flacons',
                        data: Object.values(apogeeGroups),
                        backgroundColor: ['#ef4444', '#10b981', '#3b82f6', '#9ca3af'],
                        borderRadius: 6
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
        }
    }
}

function initDashboardFilters() {}

// ==========================================
// DÉGUSTATIONS (HISTORIQUE)
// ==========================================

let currentTastingRating = null;
let currentTastingTags = new Set();

function initTastingModal() {
    const modal = document.getElementById('modalTasting');
    const closeBtn = document.getElementById('btnCloseTasting');
    const confirmBtn = document.getElementById('btnConfirmTasting');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            await submitTasting();
        });
    }

    // Étoiles de notation
    document.querySelectorAll('#modalTasting .star').forEach(star => {
        star.addEventListener('click', () => {
            const val = parseFloat(star.dataset.val);
            currentTastingRating = val;
            highlightStars(val);
        });
    });

    // Zone upload photo
    const photoInput = document.getElementById('t_photo');
    if (photoInput) {
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const prev = document.getElementById('photoPreview');
                if (prev) {
                    prev.src = ev.target.result;
                    prev.style.display = 'block';
                }
            };
            reader.readAsDataURL(file);
        });
    }
}

function openTastingForBottle(bottleId) {
    const bottle = STATE.inventory.find(b => b.id === Number(bottleId));
    if (!bottle) return;

    document.getElementById('tasting_bottle_id').value = bottle.id;
    document.getElementById('tastingWineName').textContent = `${bottle.nom} ${bottle.millesime || ''}`;
    document.getElementById('tastingWineMeta').textContent = `${bottle.type} • ${bottle.appellation || bottle.region || 'Sans appellation'}`;

    document.getElementById('t_date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('t_comment').value = '';
    currentTastingRating = 4;
    highlightStars(4);

    const prev = document.getElementById('photoPreview');
    if (prev) prev.style.display = 'none';

    document.getElementById('modalTasting').classList.remove('hidden');
}

function highlightStars(val) {
    document.querySelectorAll('#modalTasting .star').forEach(s => {
        const starVal = parseFloat(s.dataset.val);
        if (starVal <= val) s.classList.add('active');
        else s.classList.remove('active');
    });
    const starDisplay = document.getElementById('starDisplay');
    if (starDisplay) starDisplay.textContent = `${val} / 5`;
}

async function submitTasting() {
    const bottleId = document.getElementById('tasting_bottle_id').value;
    const bottle = STATE.inventory.find(b => b.id === Number(bottleId));
    if (!bottle) return;

    const photoPrev = document.getElementById('photoPreview');
    const photoData = (photoPrev && photoPrev.style.display !== 'none') ? photoPrev.src : null;

    const tastingData = {
        bottle_id: bottle.id,
        bottle_ref: {
            nom: bottle.nom,
            appellation: bottle.appellation,
            millesime: bottle.millesime,
            type: bottle.type,
            region: bottle.region,
            prix: bottle.prix
        },
        date_consommation: document.getElementById('t_date').value || new Date().toISOString().slice(0, 10),
        note: currentTastingRating || null,
        commentaire: document.getElementById('t_comment').value.trim(),
        photo_base64: photoData,
        tags: Array.from(currentTastingTags)
    };

    try {
        await API.tastings.add(tastingData);
        document.getElementById('modalTasting').classList.add('hidden');
        showToast(`Dégustation de ${bottle.nom} enregistrée !`, 'success');
        await loadAllUserData();
    } catch (err) {
        showToast(err.message || 'Erreur enregistrement dégustation', 'error');
    }
}

function renderHistoryFeed() {
    const feed = document.getElementById('historyFeed');
    if (!feed) return;

    if (STATE.tastingLog.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-glass-cheers"></i>
                <h3>Aucune dégustation enregistrée</h3>
                <p>Ouvrez votre livre de cave et cliquez sur le verre à vin d'un flacon pour noter votre première dégustation.</p>
            </div>
        `;
        return;
    }

    feed.innerHTML = STATE.tastingLog.map(t => {
        const b = t.bottle_ref || {};
        const starsHtml = '★'.repeat(Math.round(t.note || 0)) + '☆'.repeat(5 - Math.round(t.note || 0));
        
        return `
            <div class="card" style="margin-bottom: 16px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div>
                        <h3 style="font-family:'Playfair Display',serif; font-size: 18px; margin-bottom: 4px;">
                            ${escHtml(b.nom || 'Vin')} ${b.millesime || ''}
                        </h3>
                        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                            ${b.type ? `<span class="badge ${WINE_COLORS[b.type]?.css || 'badge-rouge'}">${b.type}</span>` : ''}
                            ${b.appellation ? `<span>${escHtml(b.appellation)}</span>` : ''}
                            <span>• Dégusté le ${t.date_consommation}</span>
                        </p>
                    </div>
                    <div style="color: #f59e0b; font-size: 18px; font-weight: 700;">
                        ${starsHtml}
                    </div>
                </div>

                ${t.commentaire ? `<p style="font-size: 14px; margin-top: 10px; color: #374151; font-style: italic;">« ${escHtml(t.commentaire)} »</p>` : ''}
                
                ${t.photo_base64 ? `
                    <div style="margin-top: 12px;">
                        <img src="${t.photo_base64}" style="max-height: 160px; border-radius: 8px; border: 1px solid var(--border);" alt="Photo dégustation">
                    </div>
                ` : ''}
                
                <div style="display: flex; justify-content: flex-end; margin-top: 12px; gap: 8px;">
                    <button class="action-btn delete-btn" title="Supprimer la dégustation" onclick="deleteTasting('${t.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteTasting(id) {
    if (!confirm('Supprimer cette note de dégustation ?')) return;
    try {
        await API.tastings.delete(id);
        showToast('Dégustation supprimée', 'info');
        await loadAllUserData();
    } catch (err) {
        showToast(err.message || 'Erreur suppression', 'error');
    }
}

function initEditTastingModal() {}

// ==========================================
// IMPORT & EXPORT DE LA CAVE
// ==========================================

function initIO() {
    // Export JSON
    const btnExport = document.getElementById('btnExport');
    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            try {
                const data = await API.export.getExportData();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cave_backup_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Sauvegarde de la cave exportée avec succès !', 'success');
            } catch (err) {
                showToast('Erreur lors de l\'exportation', 'error');
            }
        });
    }

    // Import JSON
    const fileImport = document.getElementById('fileImport');
    if (fileImport) {
        fileImport.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const parsed = JSON.parse(event.target.result);
                    if (!confirm('Importer ces vins dans votre cave actuelle ?')) return;

                    const res = await API.inventory.import(parsed);
                    showToast(`${res.bottles_imported} flacon(s) importé(s) avec succès !`, 'success');
                    await loadAllUserData();
                } catch (err) {
                    showToast('Fichier JSON invalide', 'error');
                }
            };
            reader.readAsText(file);
        });
    }
}

// ==========================================
// CARTE DES VIGNOBLES (LEAFLET)
// ==========================================

function initMap() {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer || STATE.map) return;

    STATE.map = L.map('mapContainer').setView([46.603354, 1.888334], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(STATE.map);

    updateMapMarkers();
}

function updateMapMarkers() {
    if (!STATE.map) return;

    // Coordonnées approximatives des grandes régions viticoles
    const REGION_COORDS = {
        'Bordeaux': [44.8378, -0.5792],
        'Bourgogne': [47.0525, 4.8378],
        'Champagne': [49.2583, 4.0317],
        'Vallée du Rhône': [44.9333, 4.8917],
        'Rhône': [44.9333, 4.8917],
        'Alsace': [48.0794, 7.3585],
        'Loire': [47.3833, 0.6833],
        'Vallée de la Loire': [47.3833, 0.6833],
        'Beaujolais': [46.1667, 4.6667],
        'Provence': [43.5297, 5.4474],
        'Languedoc': [43.6108, 3.8767],
        'Roussillon': [42.6986, 2.8956],
        'Jura': [46.6753, 5.5562],
        'Savoie': [45.5646, 5.9178],
        'Sud-Ouest': [43.9000, 0.2000]
    };

    const regionCounts = {};
    STATE.inventory.filter(b => b.statut === 'En cave').forEach(b => {
        if (b.region) {
            regionCounts[b.region] = (regionCounts[b.region] || 0) + 1;
        }
    });

    Object.entries(regionCounts).forEach(([reg, count]) => {
        const coords = REGION_COORDS[reg];
        if (coords) {
            L.circleMarker(coords, {
                color: '#800020',
                fillColor: '#800020',
                fillOpacity: 0.7,
                radius: Math.min(25, 8 + count * 2)
            }).addTo(STATE.map).bindPopup(`<b>${reg}</b><br>${count} flacon(s) en cave`);
        }
    });
}

// ==========================================
// UTILITAIRES & TOASTS
// ==========================================

function initMurPicker() {}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background: #1f2937; color: white; padding: 12px 20px; border-radius: 8px;
        margin-top: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex;
        align-items: center; gap: 10px; font-size: 14px; animation: fadeIn 0.3s ease;
        border-left: 4px solid ${type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#3b82f6')};
    `;
    toast.innerHTML = `<span>${escHtml(msg)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

window.openAddZoneModal = openAddZoneModal;
window.openEditZoneModal = openEditZoneModal;
window.confirmDeleteZone = confirmDeleteZone;
window.openTastingForBottle = openTastingForBottle;
window.openEditWineModal = openEditWineModal;
window.deleteBottle = deleteBottle;
window.deleteTasting = deleteTasting;
window.toggleAccordion = toggleAccordion;
window.switchAuthTab = switchAuthTab;
window.showToast = showToast;

