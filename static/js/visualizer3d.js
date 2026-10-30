/**
 * BEN'ARMAGNAC — Visite 3D Dynamique (Three.js)
 * S'adapte à 100% à l'agencement choisi par l'utilisateur :
 * - Empilement de cartons / caisses de vin
 * - Cave traditionnelle à casiers en losange
 * - Étagères à vin en bois
 * - Armoire à vin vitrée réfrigérée
 */

let animationId = null;

function stop3D() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function init3D() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    stop3D();
    if (STATE.scene.renderer) {
        container.innerHTML = '';
        STATE.scene.renderer.dispose();
        STATE.scene.objects = [];
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x221715);
    scene.fog = new THREE.Fog(0x221715, 35, 130);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(0, 24, 46);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 10;
    controls.maxDistance = 75;
    controls.target.set(0, 10, -5);

    // Eclairage Cave
    scene.add(new THREE.HemisphereLight(0xfff0e0, 0x22110c, 1.1));
    
    const spotLight = new THREE.SpotLight(0xffdfa0, 2.8);
    spotLight.position.set(0, 42, 5);
    spotLight.angle = Math.PI / 3.5;
    spotLight.penumbra = 0.6;
    spotLight.castShadow = true;
    scene.add(spotLight);

    const warmPoint = new THREE.PointLight(0xd4af37, 1.8, 50);
    warmPoint.position.set(0, 15, -10);
    scene.add(warmPoint);

    // Sol en pierre de cave
    const floorGeo = new THREE.PlaneGeometry(160, 160);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x181311, roughness: 0.85, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Décor central (tapis, table de dégustation, bouteille)
    createCentralDecor(scene);

    // Initialisation des objets cliquables
    STATE.scene.objects = [];

    // ==========================================
    // GÉNÉRATION DYNAMIQUE SELON LES ZONES DE L'UTILISATEUR
    // ==========================================
    const zones = STATE.zones || [];
    
    if (zones.length === 0) {
        // Zone de repli si aucune zone configurée
        createDiamondWall(scene, { id: 1, name: 'Mur Central', columns: 12, rows: 3, capacity_per_slot: 24 }, 0, -32, 0);
    } else {
        // Placement spatial harmonieux selon le nombre et type de zones
        // Positions prédéfinies autour de la pièce
        const wallSlots = [
            { x: 0,   z: -32, rotY: 0 },             // Mur du fond
            { x: -26, z: -8,  rotY: Math.PI / 2 },    // Mur gauche
            { x: 26,  z: -8,  rotY: -Math.PI / 2 },   // Mur droit
            { x: -16, z: 12,  rotY: Math.PI / 3 },    // Avant-gauche (cartons / armoire)
            { x: 16,  z: 12,  rotY: -Math.PI / 3 }    // Avant-droit (cartons / armoire)
        ];

        zones.forEach((zone, index) => {
            const pos = wallSlots[index % wallSlots.length];
            
            if (zone.type === 'cartons') {
                createCartonStackZone(scene, zone, pos.x, pos.z, pos.rotY);
            } else if (zone.type === 'armoire') {
                createWineCabinetZone(scene, zone, pos.x, pos.z, pos.rotY);
            } else if (zone.type === 'chariot') {
                createBarCartZone(scene, zone, pos.x, pos.z, pos.rotY);
            } else if (zone.type === 'etagere') {
                createShelvesWallZone(scene, zone, pos.x, pos.z, pos.rotY);
            } else {
                // Par défaut : casiers losanges
                createDiamondWall(scene, zone, pos.x, pos.z, pos.rotY);
            }
        });
    }

    STATE.scene.ref = scene;
    STATE.scene.camera = camera;
    STATE.scene.renderer = renderer;
    STATE.scene.controls = controls;

    function animate() {
        const viewEl = document.getElementById('cave3d');
        if (viewEl && !viewEl.classList.contains('hidden')) {
            animationId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        }
    }
    animate();

    let pointerStartPos = { x: 0, y: 0, time: 0 };
    container.addEventListener('pointerdown', (e) => {
        pointerStartPos = { x: e.clientX, y: e.clientY, time: Date.now() };
    }, { passive: true });

    container.addEventListener('pointerup', (e) => {
        const dx = Math.abs(e.clientX - pointerStartPos.x);
        const dy = Math.abs(e.clientY - pointerStartPos.y);
        const dt = Date.now() - pointerStartPos.time;
        // Si touch/clic rapide sans déplacement (vrai tap mobile)
        if (dx < 12 && dy < 12 && dt < 450) {
            onCanvasClick(e, container);
        }
    });
}

// ── Décor central ──
function createCentralDecor(scene) {
    const rug = new THREE.Mesh(
        new THREE.BoxGeometry(14, 0.08, 18),
        new THREE.MeshStandardMaterial({ color: 0x5c0016, roughness: 0.95 })
    );
    rug.position.set(0, 0.04, 0);
    rug.receiveShadow = true;
    scene.add(rug);

    // Table de dégustation fût de chêne
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.7 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 7.5, 20), barrelMat);
    barrel.position.set(0, 3.75, 0);
    barrel.castShadow = true;
    scene.add(barrel);

    // Cerclages métalliques du fût
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
    [1.5, 3.8, 6.0].forEach(ry => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.65, 3.65, 0.35, 20), ringMat);
        ring.position.set(0, ry, 0);
        scene.add(ring);
    });

    // Plateau supérieur
    const topPlate = new THREE.Mesh(
        new THREE.CylinderGeometry(4.2, 4.2, 0.3, 32),
        new THREE.MeshStandardMaterial({ color: 0x2c170d, roughness: 0.5 })
    );
    topPlate.position.set(0, 7.6, 0);
    scene.add(topPlate);

    // Bouteille posée sur la table
    const bottleBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 2.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x112211, roughness: 0.15, metalness: 0.2 })
    );
    bottleBody.position.set(0.6, 8.95, 0.4);
    const bottleNeck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 1.0, 16),
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.6 })
    );
    bottleNeck.position.y = 1.6;
    bottleBody.add(bottleNeck);
    bottleBody.castShadow = true;
    scene.add(bottleBody);
}

// ── 1. ZONE CARTONS & CAISSES DE VIN ──
function createCartonStackZone(scene, zone, x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    const nbPiles = Math.max(2, Math.min(zone.columns || 4, 8));
    const hauteur = Math.max(1, Math.min(zone.rows || 3, 5));
    const boxW = 3.6, boxH = 2.2, boxD = 4.2;
    const spacingX = boxW + 0.3;

    // Palette en bois au sol
    const totalW = nbPiles * spacingX;
    const palletMat = new THREE.MeshStandardMaterial({ color: 0x5a4228, roughness: 0.9 });
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(totalW + 0.6, 0.6, boxD + 0.8), palletMat);
    pallet.position.set(0, 0.3, 0);
    pallet.receiveShadow = true;
    group.add(pallet);

    // Texture simulée carton kraft & caisse bois
    const kraftMat = new THREE.MeshStandardMaterial({ color: 0x9c7247, roughness: 0.85 });
    const woodCrateMat = new THREE.MeshStandardMaterial({ color: 0xb58a57, roughness: 0.75 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xd2a679, roughness: 0.5 });

    let cartonIndex = 1;
    for (let p = 0; p < nbPiles; p++) {
        const px = (p * spacingX) - (totalW / 2) + (boxW / 2);

        for (let h = 0; h < hauteur; h++) {
            const py = 0.6 + (h * boxH) + (boxH / 2);
            const cartonLabel = `Carton ${cartonIndex}`;
            
            // Alternance caisse en bois / carton kraft
            const isWood = (cartonIndex % 2 === 0);
            const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(boxW, boxH, boxD), isWood ? woodCrateMat.clone() : kraftMat.clone());
            boxMesh.position.set(px, py, 0);
            boxMesh.castShadow = true;
            boxMesh.receiveShadow = true;

            // Données utilisateur associées au carton
            boxMesh.userData = {
                type: 'carton',
                zone_id: zone.id,
                zone_name: zone.name,
                carton_label: cartonLabel,
                col: p + 1,
                lig: h + 1
            };
            STATE.scene.objects.push(boxMesh);
            group.add(boxMesh);

            // Ruban adhésif ou lattes de renfort
            const tape = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.02, 0.3, boxD + 0.02), tapeMat);
            tape.position.set(px, py, 0);
            group.add(tape);

            // Bouteilles stockées dans ce carton
            const winesInCarton = STATE.inventory.filter(b => 
                b.statut === 'En cave' &&
                (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
                ((b.emplacement?.carton_label === cartonLabel) || (b.emplacement?.col === p+1 && b.emplacement?.lig === h+1))
            );

            if (winesInCarton.length > 0) {
                const domaineName = winesInCarton[0].nom || 'Grand Vin';

                // Estampillage réaliste du domaine sur le carton
                const stampCanvas = document.createElement('canvas');
                stampCanvas.width = 512;
                stampCanvas.height = 256;
                const sctx = stampCanvas.getContext('2d');
                sctx.fillStyle = isWood ? '#b58a57' : '#9c7247';
                sctx.fillRect(0, 0, 512, 256);
                sctx.strokeStyle = '#2d180d';
                sctx.lineWidth = 6;
                sctx.strokeRect(8, 8, 496, 240);

                sctx.fillStyle = '#1c0f08';
                sctx.font = 'bold 34px "Playfair Display", serif';
                sctx.textAlign = 'center';
                sctx.textBaseline = 'middle';
                sctx.fillText(domaineName.slice(0, 22).toUpperCase(), 256, 95);

                sctx.font = 'bold 20px "Inter", sans-serif';
                sctx.fillStyle = '#4a2816';
                sctx.fillText(`${winesInCarton.length} BOUTEILLE(S)`, 256, 165);

                const stampTex = new THREE.CanvasTexture(stampCanvas);
                const stampMat = new THREE.MeshBasicMaterial({ map: stampTex, side: THREE.DoubleSide });
                const stamp = new THREE.Mesh(new THREE.PlaneGeometry(boxW * 0.88, boxH * 0.72), stampMat);
                stamp.position.set(px, py, boxD / 2 + 0.05);
                stamp.userData = boxMesh.userData;
                STATE.scene.objects.push(stamp);
                group.add(stamp);

                // Pastille lumineuse couleur vin
                const typeCounts = {};
                winesInCarton.forEach(w => { typeCounts[w.type] = (typeCounts[w.type] || 0) + 1; });
                const dominant = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0][0];
                const hexColor = WINE_COLORS[dominant]?.hex3d || 0x800020;

                const badgeMat = new THREE.MeshStandardMaterial({
                    color: hexColor,
                    emissive: hexColor,
                    emissiveIntensity: 0.9,
                    roughness: 0.2
                });
                const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16), badgeMat);
                badge.rotation.x = Math.PI / 2;
                badge.position.set(px + (boxW * 0.32), py + (boxH * 0.26), boxD / 2 + 0.1);
                badge.userData = boxMesh.userData;
                STATE.scene.objects.push(badge);
                group.add(badge);
            }

            cartonIndex++;
        }
    }

    // Panneau indicateur de la zone
    createZoneTitleSign(group, zone.name, 0, 0.6 + (hauteur * boxH) + 1.2, 0);
}

// ── 2. ZONE CASIERS EN LOSANGE (Traditionnelle) ──
function createDiamondWall(scene, zone, x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    const nbCols = Math.max(3, Math.min(zone.columns || 12, 16));
    const nbLignes = Math.max(2, Math.min(zone.rows || 3, 5));
    const slotSize = 2.4;
    const spacing = slotSize * 1.35;

    const totalWidth  = (nbCols  - 1) * spacing;
    const totalHeight = (nbLignes - 1) * spacing;
    const frameWidth  = totalWidth  + slotSize * 2.4;
    const frameHeight = totalHeight + slotSize * 2.4;

    // Encadrement en chêne massif foncé
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x361d10, roughness: 0.8 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, frameHeight, 4.0), woodMat);
    frame.position.y = frameHeight / 2 + 0.5;
    frame.castShadow = true; frame.receiveShadow = true;
    group.add(frame);

    // Moulures latérales
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x4f2b17, roughness: 0.7 });
    [[-frameWidth/2 - 0.2, frameHeight/2 + 0.5], [frameWidth/2 + 0.2, frameHeight/2 + 0.5]].forEach(([tx, ty]) => {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, frameHeight + 0.8, 4.4), trimMat);
        t.position.set(tx, ty, 0); group.add(t);
    });

    const slotGeo = new THREE.BoxGeometry(slotSize, slotSize, 3.6);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x120a05, roughness: 0.95 });

    for (let r = 0; r < nbLignes; r++) {
        for (let c = 0; c < nbCols; c++) {
            const lx = (c * spacing) - (totalWidth / 2);
            const ly = (r * spacing) + slotSize + 0.5;

            const shell = new THREE.Mesh(slotGeo, darkMat.clone());
            shell.position.set(lx, ly, 2.15);
            shell.rotation.z = Math.PI / 4;
            shell.userData = {
                type: 'slot',
                zone_id: zone.id,
                zone_name: zone.name,
                col: c + 1,
                lig: r + 1
            };
            STATE.scene.objects.push(shell);
            group.add(shell);

            const wines = STATE.inventory.filter(b =>
                b.statut === "En cave" &&
                (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
                Number(b.emplacement?.col || b.col) === (c + 1) &&
                Number(b.emplacement?.lig || b.lig) === (r + 1)
            );

            if (wines.length > 0) {
                const maxCap = zone.capacity_per_slot || 24;
                const fillRatio = Math.min(1, wines.length / maxCap);

                const typeCounts = {};
                wines.forEach(w => { typeCounts[w.type] = (typeCounts[w.type] || 0) + 1; });
                const dominant = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0][0];
                const hexColor = WINE_COLORS[dominant]?.hex3d || 0x800020;

                const halfSide = slotSize * 0.85 / 2;
                const fillMat = new THREE.MeshStandardMaterial({
                    color: hexColor, roughness: 0.15, metalness: 0.3,
                    emissive: hexColor, emissiveIntensity: 0.28,
                    transparent: true, opacity: 0.9
                });
                const fill = new THREE.Mesh(new THREE.BoxGeometry(slotSize * 0.85, slotSize * 0.85, 3.8), fillMat);

                const offsetY = halfSide * (1 - fillRatio);
                fill.position.set(lx, ly - offsetY, 2.3);
                fill.rotation.z = Math.PI / 4;
                fill.scale.y = fillRatio;
                fill.userData = shell.userData;
                STATE.scene.objects.push(fill);
                group.add(fill);
            }
        }
    }

    createZoneTitleSign(group, zone.name, 0, frameHeight + 1.2, 0);
}

// ── 3. ZONE ÉTAGÈRES CLASSIQUES EN BOIS ──
function createShelvesWallZone(scene, zone, x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    const nbCols = Math.max(2, Math.min(zone.columns || 6, 10));
    const nbLignes = Math.max(2, Math.min(zone.rows || 4, 6));
    const colW = 3.2, rowH = 2.4, depth = 3.2;

    const totalW = nbCols * colW;
    const totalH = nbLignes * rowH;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.7 });
    
    // Étagères horizontales
    for (let r = 0; r <= nbLignes; r++) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(totalW + 0.4, 0.25, depth), woodMat);
        shelf.position.set(0, (r * rowH) + 0.5, 0);
        group.add(shelf);
    }

    // Montants verticaux
    for (let c = 0; c <= nbCols; c++) {
        const upright = new THREE.Mesh(new THREE.BoxGeometry(0.3, totalH + 0.25, depth), woodMat);
        upright.position.set((c * colW) - (totalW / 2), (totalH / 2) + 0.5, 0);
        group.add(upright);
    }

    // Compartiments cliquables
    for (let r = 0; r < nbLignes; r++) {
        for (let c = 0; c < nbCols; c++) {
            const lx = (c * colW) - (totalW / 2) + (colW / 2);
            const ly = (r * rowH) + (rowH / 2) + 0.5;

            const slotMesh = new THREE.Mesh(
                new THREE.BoxGeometry(colW - 0.2, rowH - 0.2, depth - 0.2),
                new THREE.MeshStandardMaterial({ color: 0x1a0f08, transparent: true, opacity: 0.4 })
            );
            slotMesh.position.set(lx, ly, 0);
            slotMesh.userData = {
                type: 'slot',
                zone_id: zone.id,
                zone_name: zone.name,
                col: c + 1,
                lig: r + 1
            };
            STATE.scene.objects.push(slotMesh);
            group.add(slotMesh);

            // Bouteilles présentes
            const wines = STATE.inventory.filter(b =>
                b.statut === "En cave" &&
                (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
                Number(b.emplacement?.col || b.col) === (c + 1) &&
                Number(b.emplacement?.lig || b.lig) === (r + 1)
            );

            if (wines.length > 0) {
                const dominant = wines[0].type || 'Rouge';
                const hexColor = WINE_COLORS[dominant]?.hex3d || 0x800020;
                
                // Représentation de bouteilles couchées
                for (let b = 0; b < Math.min(wines.length, 6); b++) {
                    const bx = lx - (colW * 0.25) + (b % 3) * 0.7;
                    const by = ly - (rowH * 0.2) + Math.floor(b / 3) * 0.6;
                    
                    const bottle = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.25, 0.25, 1.8, 12),
                        new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.2, emissive: hexColor, emissiveIntensity: 0.3 })
                    );
                    bottle.rotation.x = Math.PI / 2;
                    bottle.position.set(bx, by, 0.3);
                    bottle.userData = slotMesh.userData;
                    STATE.scene.objects.push(bottle);
                    group.add(bottle);
                }
            }
        }
    }

    createZoneTitleSign(group, zone.name, 0, totalH + 1.2, 0);
}


// ── 5. ZONE CHARIOT À SPIRITUEUX & DÉGUSTATION ──
function createBarCartZone(scene, zone, x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    const cartW = 8.0, cartH = 7.5, cartD = 5.0;

    // 4 Roulettes en laiton / métal foncé
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4, metalness: 0.8 });
    const wheelGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 16);
    wheelGeom.rotateZ(Math.PI / 2);
    [
        [-cartW / 2 + 0.6, -cartD / 2 + 0.6],
        [ cartW / 2 - 0.6, -cartD / 2 + 0.6],
        [-cartW / 2 + 0.6,  cartD / 2 - 0.6],
        [ cartW / 2 - 0.6,  cartD / 2 - 0.6]
    ].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(wheelGeom, wheelMat);
        wheel.position.set(wx, 0.4, wz);
        wheel.castShadow = true;
        group.add(wheel);
    });

    // 4 Montants tubulaires laiton doré
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 });
    const legGeom = new THREE.CylinderGeometry(0.12, 0.12, cartH, 16);
    [
        [-cartW / 2 + 0.6, -cartD / 2 + 0.6],
        [ cartW / 2 - 0.6, -cartD / 2 + 0.6],
        [-cartW / 2 + 0.6,  cartD / 2 - 0.6],
        [ cartW / 2 - 0.6,  cartD / 2 - 0.6]
    ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeom, brassMat);
        leg.position.set(lx, cartH / 2 + 0.4, lz);
        leg.castShadow = true;
        group.add(leg);
    });

    // Poignée élégante du chariot
    const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, cartD - 1.2, 16), brassMat);
    handleBar.rotation.x = Math.PI / 2;
    handleBar.position.set(cartW / 2 + 0.4, cartH + 0.4, 0);
    group.add(handleBar);

    // Plateaux en bois noble acajou verni
    const mahoganyMat = new THREE.MeshStandardMaterial({ color: 0x3d1c06, roughness: 0.4 });

    const trayLevels = [
        { lig: 2, y: 1.6, label: "Plateau Inférieur (Réserve spiritueux & bières)" },
        { lig: 1, y: 5.5, label: "Plateau Supérieur (Service / Dégustation)" }
    ];

    trayLevels.forEach(lvl => {
        // Fond de plateau
        const trayMesh = new THREE.Mesh(new THREE.BoxGeometry(cartW, 0.3, cartD), mahoganyMat);
        trayMesh.position.set(0, lvl.y, 0);
        trayMesh.castShadow = true;
        trayMesh.receiveShadow = true;
        group.add(trayMesh);

        // Rambarde dorée autour du plateau
        const rail = new THREE.Mesh(new THREE.BoxGeometry(cartW + 0.1, 0.5, cartD + 0.1), brassMat);
        rail.position.set(0, lvl.y + 0.3, 0);
        group.add(rail);

        // Hitbox interactive pour le plateau
        const hitBox = new THREE.Mesh(
            new THREE.BoxGeometry(cartW, 2.2, cartD),
            new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.05 })
        );
        hitBox.position.set(0, lvl.y + 1.2, 0);
        hitBox.userData = {
            type: 'chariot',
            zone_id: zone.id,
            zone_name: zone.name,
            col: 1,
            lig: lvl.lig,
            label: lvl.label
        };
        STATE.scene.objects.push(hitBox);
        group.add(hitBox);

        // Bouteilles de spiritueux debout sur le plateau
        const winesOnTray = STATE.inventory.filter(b =>
            b.statut === "En cave" &&
            (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
            Number(b.emplacement?.lig || b.lig) === lvl.lig
        );

        const count = Math.min(winesOnTray.length > 0 ? winesOnTray.length : 3, 6);
        for (let i = 0; i < count; i++) {
            const w = winesOnTray[i % Math.max(1, winesOnTray.length)];
            const spiritColor = (w && WINE_COLORS[w.type]?.hex3d) || (lvl.lig === 1 ? 0xb45309 : 0x9a3412);

            // Bouteille / Carafe de spiritueux
            const bBody = new THREE.Mesh(
                new THREE.CylinderGeometry(0.32, 0.35, 1.4, 16),
                new THREE.MeshStandardMaterial({ color: spiritColor, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 })
            );
            bBody.position.set(-cartW / 2 + 1.4 + (i * 1.05), lvl.y + 0.85, (i % 2 === 0 ? 0.6 : -0.6));
            
            // Col et bouchon de carafe doré
            const bNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.6, 12), brassMat);
            bNeck.position.y = 0.95;
            bBody.add(bNeck);
            bBody.castShadow = true;
            bBody.userData = hitBox.userData;
            STATE.scene.objects.push(bBody);
            group.add(bBody);
        }
    });

    createZoneTitleSign(group, zone.name, 0, cartH + 2.0, 0);
}

// ── 4. ZONE ARMOIRE À VIN RÉFRIGÉRÉE VITRÉE ──
function createWineCabinetZone(scene, zone, x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    const nbClayettes = Math.max(3, Math.min(zone.rows || 6, 8));
    const width = 6.0, height = 12.0, depth = 4.2;

    // Structure métallique noire
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.3, metalness: 0.8 });
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMat);
    cabinet.position.set(0, height / 2 + 0.2, 0);
    group.add(cabinet);

    // Éclairage intérieur LED doux
    const ledLight = new THREE.PointLight(0xffeedd, 1.5, 12);
    ledLight.position.set(0, height / 2, depth / 2 - 0.5);
    group.add(ledLight);

    // Porte vitrée transparente avec reflets
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x223344,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.7,
        ior: 1.5
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, height - 0.6, 0.2), glassMat);
    door.position.set(0, height / 2 + 0.2, depth / 2 + 0.1);
    group.add(door);

    // Clayettes en bois coulissantes
    const clayetteMat = new THREE.MeshStandardMaterial({ color: 0x6e4324, roughness: 0.6 });
    const shelfSpacing = (height - 2.0) / nbClayettes;

    for (let k = 0; k < nbClayettes; k++) {
        const sy = 1.2 + (k * shelfSpacing);
        const clayette = new THREE.Mesh(new THREE.BoxGeometry(width - 0.8, 0.2, depth - 0.8), clayetteMat);
        clayette.position.set(0, sy, 0);
        group.add(clayette);

        // Zone cliquable pour cette clayette
        const hitBox = new THREE.Mesh(
            new THREE.BoxGeometry(width - 0.8, shelfSpacing - 0.2, depth - 0.8),
            new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.05 })
        );
        hitBox.position.set(0, sy + (shelfSpacing / 2), 0);
        hitBox.userData = {
            type: 'clayette',
            zone_id: zone.id,
            zone_name: zone.name,
            col: 1,
            lig: k + 1,
            label: `Clayette ${k + 1}`
        };
        STATE.scene.objects.push(hitBox);
        group.add(hitBox);

        // Bouteilles sur la clayette
        const wines = STATE.inventory.filter(b =>
            b.statut === "En cave" &&
            (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
            Number(b.emplacement?.lig || b.lig) === (k + 1)
        );

        if (wines.length > 0) {
            const count = Math.min(wines.length, 5);
            for (let b = 0; b < count; b++) {
                const dominant = wines[b % wines.length].type || 'Rouge';
                const hexColor = WINE_COLORS[dominant]?.hex3d || 0x800020;

                const bottle = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.22, 0.22, 1.6, 12),
                    new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.2, emissive: hexColor, emissiveIntensity: 0.4 })
                );
                bottle.rotation.x = Math.PI / 2;
                bottle.position.set(-1.8 + (b * 0.9), sy + 0.35, 0.2);
                bottle.userData = hitBox.userData;
                STATE.scene.objects.push(bottle);
                group.add(bottle);
            }
        }
    }

    createZoneTitleSign(group, zone.name, 0, height + 1.2, 0);
}

// ── Panneau de titre au-dessus d'une zone ──
function createZoneTitleSign(group, text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1410';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 26), 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const signMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), signMat);
    sign.position.set(x, y, z);
    group.add(sign);
}

// ── Interaction au clic 3D & Vue 2D Complète du Bloc ──
let current2DZoneId = null;
let current2DSelection = { col: 1, lig: 1, carton_label: null, type: 'slot' };

function onCanvasClick(e, container) {
    if (!STATE.scene.camera) return;
    const r = container.getBoundingClientRect();
    STATE.scene.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    STATE.scene.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    STATE.scene.raycaster.setFromCamera(STATE.scene.mouse, STATE.scene.camera);

    const intersects = STATE.scene.raycaster.intersectObjects(STATE.scene.objects);
    if (intersects.length > 0) {
        const d = intersects[0].object.userData;
        if (d && (d.type === 'slot' || d.type === 'carton' || d.type === 'clayette' || d.type === 'chariot')) {
            open2DBlockViewer(d.zone_id, d);
        }
    }
}

// ── Ouverture & Affichage du Bloc en 2D Complet ──
function open2DBlockViewer(zoneId, selection) {
    const defaultZone = (STATE.zones && STATE.zones.length > 0) ? STATE.zones[0] : null;
    current2DZoneId = zoneId || (defaultZone ? defaultZone.id : 1);

    if (selection) {
        current2DSelection = { ...selection };
    } else {
        const z = STATE.getZoneById(current2DZoneId) || defaultZone;
        current2DSelection = {
            col: 1,
            lig: 1,
            carton_label: null,
            type: z ? (z.type === 'cartons' ? 'carton' : (z.type === 'armoire' ? 'clayette' : 'slot')) : 'slot'
        };
    }

    render2DBlockModal();
    const modalEl = document.getElementById('slotModal');
    if (modalEl) modalEl.classList.remove('hidden');
}

function render2DBlockModal() {
    const zone = STATE.getZoneById(current2DZoneId) || STATE.zones[0];
    if (!zone) return;

    // 1. Titre et icône du bloc
    const iconEl = document.getElementById('blockViewerIcon');
    const titleEl = document.getElementById('blockViewerTitle');
    const subEl = document.getElementById('blockViewerSubtitle');

    const typeIcons = {
        losange: '<i class="fas fa-cubes-stacked"></i>',
        etagere: '<i class="fas fa-layer-group"></i>',
        cartons: '<i class="fas fa-boxes-stacked"></i>',
        armoire: '<i class="fas fa-temperature-low"></i>',
        chariot: '<i class="fas fa-cocktail"></i>'
    };
    const typeNames = {
        losange: 'Casiers Losanges',
        etagere: 'Étagères Murales',
        cartons: 'Caisses Bois Brutes au Sol',
        armoire: 'Armoire Réfrigérée EuroCave',
        chariot: 'Chariot à Spiritueux & Bières'
    };

    if (iconEl) iconEl.innerHTML = typeIcons[zone.type] || '<i class="fas fa-th"></i>';
    if (titleEl) titleEl.textContent = `${zone.name} (${typeNames[zone.type] || 'Espace'})`;
    if (subEl) subEl.textContent = "Cliquez sur un casier ou un carton pour voir et gérer son contenu en direct.";

    // 2. Onglets pour basculer facilement entre les différents blocs
    const tabsEl = document.getElementById('blockZoneTabs');
    if (tabsEl) {
        const allStock = STATE.inventory.filter(b => b.statut === "En cave");
        tabsEl.innerHTML = (STATE.zones || []).map(z => {
            const count = allStock.filter(b => b.zone_id === z.id || (!b.zone_id && z.id === STATE.zones[0]?.id)).length;
            const isActive = z.id === zone.id;
            const icon = typeIcons[z.type] || '<i class="fas fa-th"></i>';
            return `
                <button type="button" class="block-zone-tab ${isActive ? 'active' : ''}" onclick="switch2DBlockZone(${z.id})">
                    ${icon} <span>${escHtml(z.name)}</span>
                    <span style="font-weight:700; opacity:0.85; margin-left:4px;">(${count} bll.)</span>
                </button>
            `;
        }).join('');
    }

    // 3. Barre de statistiques du bloc (taux d'occupation, etc.)
    const summaryEl = document.getElementById('blockSummaryBar');
    const zoneStock = STATE.inventory.filter(b => b.statut === "En cave" && (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)));

    if (summaryEl) {
        let statsText = '';
        if (zone.type === 'cartons') {
            const cartonNames = [...new Set(zoneStock.map(b => b.carton_label || b.nom).filter(Boolean))];
            statsText = `<span><strong>${cartonNames.length}</strong> caisses en bois scellées • <strong>${zoneStock.length}</strong> bouteilles</span>`;
        } else if (zone.type === 'armoire') {
            const nbClayettes = zone.rows || 6;
            statsText = `<span><strong>${nbClayettes}</strong> clayettes • <strong>${zoneStock.length}</strong> bouteilles en conservation</span>`;
        } else if (zone.type === 'chariot') {
            statsText = `<span><strong>2</strong> plateaux de dégustation • <strong>${zoneStock.length}</strong> flacons (Spiritueux & Bières)</span>`;
        } else {
            const totalSlots = (zone.columns || 12) * (zone.rows || 3);
            const usedCoords = new Set(zoneStock.map(b => `${b.emplacement?.col || b.col}_${b.emplacement?.lig || b.lig}`)).size;
            const pct = Math.round((usedCoords / totalSlots) * 100) || 0;
            statsText = `<span><strong>${usedCoords} / ${totalSlots}</strong> casiers occupés (${pct}%) • <strong>${zoneStock.length}</strong> bouteilles</span>`;
        }

        const legendHtml = `
            <div style="display: flex; gap: 10px; align-items: center; font-size: 11px; flex-wrap: wrap;">
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#800020;"></span> Rouge</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#854d0e;"></span> Blanc</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#9d174d;"></span> Rosé</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:#c9a84c;"></span> Champagne</span>
                <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;border:1px dashed #9ca3af;background:transparent;"></span> Vide</span>
            </div>
        `;
        summaryEl.innerHTML = `${statsText} ${legendHtml}`;
    }

    // 4. Génération de la grille 2D
    const gridEl = document.getElementById('block2DGrid');
    if (!gridEl) return;

    if (zone.type === 'cartons') {
        render2DCartonsBlock(gridEl, zone, zoneStock);
    } else if (zone.type === 'armoire') {
        render2DArmoireBlock(gridEl, zone, zoneStock);
    } else if (zone.type === 'chariot') {
        render2DChariotBlock(gridEl, zone, zoneStock);
    } else {
        render2DRackBlock(gridEl, zone, zoneStock);
    }

    // 5. Affichage du détail de l'emplacement sélectionné
    renderSelectedSlotDetail(zone, current2DSelection);
}

// ── Grille 2D pour Casiers Losanges & Étagères ──
function render2DRackBlock(gridEl, zone, zoneStock) {
    const cols = zone.columns || 12;
    const rows = zone.rows || 3;
    const maxCap = zone.capacity_per_slot || 24;

    gridEl.className = 'block-2d-grid';
    gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(48px, 1fr))`;
    gridEl.innerHTML = '';

    for (let lig = rows; lig >= 1; lig--) {
        for (let col = 1; col <= cols; col++) {
            const wines = zoneStock.filter(b => Number(b.emplacement?.col || b.col) === col && Number(b.emplacement?.lig || b.lig) === lig);
            const isSelected = (current2DSelection.col === col && current2DSelection.lig === lig && current2DSelection.type !== 'carton');

            const cell = document.createElement('div');
            cell.className = `casier-2d-cell ${wines.length === 0 ? 'empty' : 'full'} ${isSelected ? 'selected' : ''}`;
            cell.title = `Casier Colonne ${col}, Ligne ${lig} (${wines.length} bouteille${wines.length > 1 ? 's' : ''})`;

            if (wines.length > 0) {
                const typeCounts = {};
                wines.forEach(w => { typeCounts[w.type] = (typeCounts[w.type] || 0) + 1; });
                const dominant = Object.entries(typeCounts).sort((a,b) => b[1] - a[1])[0][0];
                const colHex = WINE_COLORS[dominant]?.hex || '#800020';
                const fillPct = Math.min(100, Math.max(20, Math.round((wines.length / maxCap) * 100)));
                cell.style.background = `linear-gradient(to top, ${colHex}dd ${fillPct}%, rgba(255,255,255,0.06) ${fillPct}%)`;
                cell.style.borderColor = colHex;
            }

            cell.innerHTML = `
                <span class="casier-coord">C${col}/L${lig}</span>
                <span class="casier-badge-count">${wines.length > 0 ? wines.length : '+'}</span>
            `;

            cell.onclick = () => {
                select2DSlot(zone, col, lig, null, 'slot');
            };

            gridEl.appendChild(cell);
        }
    }
}

// ── Grille 2D pour Caisses en Bois Brutes Non Ouvertes au Sol ──
function render2DCartonsBlock(gridEl, zone, zoneStock) {
    gridEl.className = 'carton-2d-grid';
    gridEl.style.gridTemplateColumns = `repeat(auto-fill, minmax(190px, 1fr))`;
    gridEl.innerHTML = '';

    // Regrouper par carton_label ou domaine
    const cartonsMap = {};
    zoneStock.forEach(b => {
        const label = b.carton_label || b.nom || 'Caisse Bois Scellée';
        if (!cartonsMap[label]) cartonsMap[label] = [];
        cartonsMap[label].push(b);
    });

    // Afficher chaque caisse fermée avec estampillage au fer rouge
    Object.entries(cartonsMap).forEach(([label, wines]) => {
        const isSelected = (current2DSelection.carton_label === label);
        const dominant = wines[0]?.type || 'Rouge';
        const millesime = wines[0]?.millesime || '';
        const appellation = wines[0]?.appellation || 'Grand Vin de Propriété';

        const box = document.createElement('div');
        box.className = `carton-2d-crate ${isSelected ? 'selected' : ''}`;

        box.innerHTML = `
            <div class="crate-brand-header">
                <span>⚜ Grand Vin ⚜</span>
                <span>Caisse Scellée</span>
            </div>
            <div class="crate-brand-title">
                ${escHtml(label)}
            </div>
            <div style="text-align:center; font-size:10px; font-weight:700; color:#4a2810; opacity:0.85; margin:2px 0;">
                ${escHtml(appellation)}${millesime ? ' • ' + millesime : ''}
            </div>
            <div class="crate-brand-footer">
                <span><i class="fas fa-lock" style="font-size:9px; margin-right:3px;"></i> Non ouverte</span>
                <span style="font-weight:800; font-size:11px;">${wines.length} bll. (${dominant})</span>
            </div>
        `;

        box.onclick = () => {
            select2DSlot(zone, wines[0]?.emplacement?.col || 1, wines[0]?.emplacement?.lig || 1, label, 'carton');
        };

        gridEl.appendChild(box);
    });

    // Emplacement pour ajouter une caisse supplémentaire
    const addBox = document.createElement('div');
    addBox.className = 'crate-empty-add';
    addBox.innerHTML = `
        <i class="fas fa-plus-circle" style="font-size:26px; margin-bottom:8px; opacity:0.75;"></i>
        <div style="font-size:13px; font-weight:700;">Nouvelle Caisse</div>
        <div style="font-size:11px; opacity:0.8; margin-top:2px;">(1 caisse brute par domaine)</div>
    `;
    addBox.onclick = () => {
        quickAddAtSlot(zone.id, 1, 1, '');
    };
    gridEl.appendChild(addBox);
}

// ── Grille 2D pour Chariot à Spiritueux & Bières ──
function render2DChariotBlock(gridEl, zone, zoneStock) {
    gridEl.className = 'chariot-2d-frame';
    gridEl.innerHTML = '';

    const levels = [
        { lig: 1, title: 'Plateau Supérieur — Dégustation Active & Service', icon: 'fa-cocktail' },
        { lig: 2, title: 'Plateau Inférieur — Réserve de Spiritueux & Bières', icon: 'fa-archive' }
    ];

    levels.forEach(lvl => {
        const wines = zoneStock.filter(b => Number(b.emplacement?.lig || b.lig) === lvl.lig);
        const isSelected = (Number(current2DSelection.lig) === lvl.lig && current2DSelection.type === 'chariot');

        const tray = document.createElement('div');
        tray.className = `chariot-tray ${isSelected ? 'selected' : ''}`;

        let bottlesHtml = '';
        if (wines.length === 0) {
            bottlesHtml = `<div style="font-size:11px; color:#cbd5e1; font-style:italic; padding:6px 0;">Plateau vide • Touchez pour ajouter vos flacons de spiritueux ou bières</div>`;
        } else {
            bottlesHtml = `
                <div class="chariot-bottles-grid">
                    ${wines.map(w => {
                        const bClass = WINE_COLORS[w.type]?.css || 'badge-spiritueux';
                        return `
                            <div style="background:rgba(0,0,0,0.4); border:1px solid rgba(212,175,55,0.4); border-radius:8px; padding:6px 10px; min-width:120px; flex:1;">
                                <div style="font-weight:700; font-size:12px; color:#fef3c7; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                    ${escHtml(w.nom)} ${w.millesime || ''}
                                </div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                                    <span class="badge ${bClass}" style="font-size:9px;">${escHtml(w.type)}</span>
                                    <span style="font-size:11px; font-weight:700; color:#d4af37;">${w.prix ? w.prix + ' €' : ''}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        tray.innerHTML = `
            <div class="chariot-tray-header">
                <span><i class="fas ${lvl.icon}" style="color:#d4af37; margin-right:6px;"></i> ${lvl.title}</span>
                <span style="font-size:11px; opacity:0.85;">${wines.length} flacon${wines.length > 1 ? 's' : ''}</span>
            </div>
            ${bottlesHtml}
        `;

        tray.onclick = () => {
            select2DSlot(zone, 1, lvl.lig, null, 'chariot');
        };

        gridEl.appendChild(tray);
    });
}

// ── Grille 2D pour Armoire EuroCave ──
function render2DArmoireBlock(gridEl, zone, zoneStock) {
    gridEl.className = 'armoire-2d-frame';
    gridEl.innerHTML = '';

    const nbClayettes = zone.rows || 6;
    for (let k = 1; k <= nbClayettes; k++) {
        const wines = zoneStock.filter(b => Number(b.emplacement?.lig || b.lig) === k);
        const isSelected = (current2DSelection.lig === k && current2DSelection.type === 'clayette');

        const row = document.createElement('div');
        row.className = `clayette-2d-row ${isSelected ? 'selected' : ''}`;

        const wineNames = [...new Set(wines.map(w => `${w.nom} ${w.millesime || ''}`))].slice(0, 2).join(', ');

        row.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-weight:700; font-size:13px; font-family:'Playfair Display',serif;">Clayette ${k}</span>
                <span style="font-size:11px; opacity:0.8;">${wineNames ? '— ' + escHtml(wineNames) : '(Vide)'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; font-weight:700;">${wines.length} bll.</span>
                <i class="fas fa-chevron-right" style="font-size:10px; opacity:0.5;"></i>
            </div>
        `;

        row.onclick = () => {
            select2DSlot(zone, 1, k, null, 'clayette');
        };

        gridEl.appendChild(row);
    }
}

// ── Sélection d'un casier dans la vue 2D ──
function select2DSlot(zone, col, lig, carton_label, type) {
    current2DSelection = { col, lig, carton_label, type };
    render2DBlockModal();
}

function switch2DBlockZone(zoneId) {
    current2DZoneId = zoneId;
    const z = STATE.getZoneById(zoneId);
    current2DSelection = {
        col: 1,
        lig: 1,
        carton_label: null,
        type: z ? (z.type === 'cartons' ? 'carton' : (z.type === 'armoire' ? 'clayette' : 'slot')) : 'slot'
    };
    render2DBlockModal();
}

// ── Panneau de détail des bouteilles d'un emplacement ──
function renderSelectedSlotDetail(zone, sel) {
    const panel = document.getElementById('blockSlotDetailPanel');
    if (!panel) return;

    let wines = [];
    if (sel.carton_label) {
        wines = STATE.inventory.filter(b =>
            b.statut === "En cave" &&
            (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
            (b.carton_label === sel.carton_label || b.nom === sel.carton_label)
        );
    } else {
        wines = STATE.inventory.filter(b =>
            b.statut === "En cave" &&
            (b.zone_id === zone.id || (!b.zone_id && zone.id === STATE.zones[0]?.id)) &&
            Number(b.emplacement?.col || b.col) === Number(sel.col) &&
            Number(b.emplacement?.lig || b.lig) === Number(sel.lig)
        );
    }

    let titleLabel = `Casier Colonne ${sel.col}, Ligne ${sel.lig}`;
    if (sel.type === 'carton') titleLabel = `Caisse Bois Scellée : ${sel.carton_label || 'Vin en caisse'}`;
    else if (sel.type === 'clayette') titleLabel = `Clayette ${sel.lig} (${zone.name})`;
    else if (sel.type === 'chariot') titleLabel = `${zone.name} — ${sel.lig === 1 ? 'Plateau Supérieur' : 'Plateau Inférieur'}`;

    let contentHtml = '';
    if (wines.length === 0) {
        contentHtml = `
            <div style="text-align: center; padding: 24px 12px; color: #64748b;">
                <i class="fas fa-wine-bottle" style="font-size: 32px; margin-bottom: 8px; opacity: 0.3; display: block;"></i>
                <div style="font-weight: 600; font-size: 14px;">Emplacement vide</div>
                <p style="font-size: 12px; margin: 4px 0 12px 0;">Aucune bouteille n'est rangée dans cet emplacement pour le moment.</p>
                <button type="button" class="btn-primary" style="font-size: 12px; padding: 6px 14px;" onclick="quickAddAtSlot(${zone.id}, ${sel.col}, ${sel.lig}, '${sel.carton_label || ''}')">
                    <i class="fas fa-plus"></i> Ranger une bouteille ici
                </button>
            </div>
        `;
    } else {
        // Regroupement des bouteilles identiques
        const grouped = {};
        wines.forEach(w => {
            const key = `${w.nom}_${w.millesime}_${w.appellation}`;
            if (!grouped[key]) grouped[key] = { wine: w, count: 0, ids: [] };
            grouped[key].count++;
            grouped[key].ids.push(w.id);
        });

        contentHtml = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${Object.values(grouped).map(g => {
                    const w = g.wine;
                    const badgeClass = WINE_COLORS[w.type]?.css || 'badge-rouge';
                    return `
                        <div class="wine-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#ffffff; border-radius:10px; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                            <div class="wine-info" style="flex:1;">
                                <h4 style="font-family:'Playfair Display',serif; font-size:15px; margin:0 0 4px 0; color:var(--text-main); font-weight:700;">
                                    ${escHtml(w.nom)} ${w.millesime || ''}
                                </h4>
                                <p style="margin:0; font-size:12px; color:#64748b; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                                    <span class="badge ${badgeClass}" style="font-size:10px;">${escHtml(w.type)}</span>
                                    ${w.appellation ? `<span>${escHtml(w.appellation)}</span>` : ''}
                                    ${w.region ? `<span>• ${escHtml(w.region)}</span>` : ''}
                                    ${w.prix ? `<span style="font-weight:600; color:#334155;">• ${w.prix} €</span>` : ''}
                                </p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="wine-qty" style="font-size:13px; font-weight:700; color:var(--primary); background:rgba(128,0,32,0.08); padding:4px 10px; border-radius:12px;">${g.count} bll.</div>
                                <button type="button" class="action-btn drink-btn" title="Déguster une bouteille" onclick="openTastingForBottle(${g.ids[0]})">
                                    <i class="fas fa-wine-glass-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
                <div style="display:flex; justify-content:flex-end; margin-top:6px;">
                    <button type="button" class="btn-secondary" style="font-size:12px; padding:5px 12px;" onclick="quickAddAtSlot(${zone.id}, ${sel.col}, ${sel.lig}, '${sel.carton_label || ''}')">
                        <i class="fas fa-plus"></i> Ajouter une autre bouteille dans ce casier
                    </button>
                </div>
            </div>
        `;
    }

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 700; font-size: 14px; color: var(--primary);"><i class="fas fa-map-pin"></i> ${titleLabel}</span>
                <span style="font-size: 12px; color: #64748b;">(${wines.length} bouteille${wines.length > 1 ? 's' : ''})</span>
            </div>
        </div>
        ${contentHtml}
    `;
}

function quickAddAtSlot(zoneId, col, lig, cartonLabel) {
    closeModalSlot();
    const addBtn = document.getElementById('btnAddWine');
    if (addBtn) addBtn.click();

    setTimeout(() => {
        const zoneSelect = document.getElementById('f_zone');
        if (zoneSelect && zoneId) {
            zoneSelect.value = zoneId;
            zoneSelect.dispatchEvent(new Event('change'));
        }
        const colInput = document.getElementById('f_col');
        if (colInput && col) colInput.value = col;
        const ligInput = document.getElementById('f_lig');
        if (ligInput && lig) ligInput.value = lig;
        const cartonInput = document.getElementById('f_carton');
        if (cartonInput && cartonLabel) cartonInput.value = cartonLabel;
    }, 200);
}

function closeModalSlot() {
    const modalEl = document.getElementById('slotModal');
    if (modalEl) modalEl.classList.add('hidden');
}

window.init3D = init3D;
window.stop3D = stop3D;
window.closeModalSlot = closeModalSlot;
window.quickAddAtSlot = quickAddAtSlot;
window.open2DBlockViewer = open2DBlockViewer;
window.switch2DBlockZone = switch2DBlockZone;
window.select2DSlot = select2DSlot;

// ── Navigation Caméra 3D fluide pour mobile & desktop ──
let camAnimId = null;
function focus3DCamera(viewName, btnEl) {
    if (!STATE.scene.camera || !STATE.scene.controls) return;
    const cam = STATE.scene.camera;
    const ctrl = STATE.scene.controls;

    if (btnEl) {
        document.querySelectorAll('.btn-c3d-nav').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active');
    }

    const views = {
        overview: { cam: { x: 0, y: 30, z: 40 }, target: { x: 0, y: 8, z: -6 } },
        casiers:  { cam: { x: 0, y: 15, z: -8 },  target: { x: 0, y: 12, z: -32 } },
        cartons:  { cam: { x: -12, y: 12, z: 24 }, target: { x: -16, y: 4, z: 12 } },
        chariot:  { cam: { x: 12, y: 10, z: 22 },  target: { x: 16, y: 5, z: 12 } },
        armoire:  { cam: { x: 20, y: 14, z: 2 },   target: { x: 26, y: 10, z: -8 } }
    };

    const targetView = views[viewName] || views.overview;
    if (camAnimId) cancelAnimationFrame(camAnimId);

    let progress = 0;
    const startCam = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const startTarget = { x: ctrl.target.x, y: ctrl.target.y, z: ctrl.target.z };

    function step() {
        progress += 0.065;
        if (progress > 1) progress = 1;
        const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        cam.position.set(
            startCam.x + (targetView.cam.x - startCam.x) * ease,
            startCam.y + (targetView.cam.y - startCam.y) * ease,
            startCam.z + (targetView.cam.z - startCam.z) * ease
        );
        ctrl.target.set(
            startTarget.x + (targetView.target.x - startTarget.x) * ease,
            startTarget.y + (targetView.target.y - startTarget.y) * ease,
            startTarget.z + (targetView.target.z - startTarget.z) * ease
        );
        ctrl.update();
        if (progress < 1) {
            camAnimId = requestAnimationFrame(step);
        } else {
            camAnimId = null;
        }
    }
    step();
}
window.focus3DCamera = focus3DCamera;
