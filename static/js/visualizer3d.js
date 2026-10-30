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

    container.onclick = (e) => onCanvasClick(e, container);
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

// ── Interaction au clic 3D (Raycasting) ──
function onCanvasClick(e, container) {
    if (!STATE.scene.camera) return;
    const r = container.getBoundingClientRect();
    STATE.scene.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    STATE.scene.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    STATE.scene.raycaster.setFromCamera(STATE.scene.mouse, STATE.scene.camera);

    const intersects = STATE.scene.raycaster.intersectObjects(STATE.scene.objects);
    if (intersects.length > 0) {
        const d = intersects[0].object.userData;
        if (d && (d.type === 'slot' || d.type === 'carton' || d.type === 'clayette')) {
            showSlotDetails(d);
        }
    }
}

// ── Modal de détails du casier / carton / clayette cliqué ──
function showSlotDetails(data) {
    const { zone_id, zone_name, col, lig, carton_label, type } = data;

    let wines = [];
    if (carton_label) {
        wines = STATE.inventory.filter(b =>
            b.statut === "En cave" &&
            (b.zone_id === zone_id || (!b.zone_id && zone_id === STATE.zones[0]?.id)) &&
            ((b.emplacement?.carton_label === carton_label) || (b.emplacement?.col === col && b.emplacement?.lig === lig))
        );
    } else {
        wines = STATE.inventory.filter(b =>
            b.statut === "En cave" &&
            (b.zone_id === zone_id || (!b.zone_id && zone_id === STATE.zones[0]?.id)) &&
            Number(b.emplacement?.col || b.col) === Number(col) &&
            Number(b.emplacement?.lig || b.lig) === Number(lig)
        );
    }

    const titleEl = document.getElementById('slotTitle');
    const subtitleEl = document.getElementById('slotSubtitle');
    const contentEl = document.getElementById('slotContent');
    const modalEl = document.getElementById('slotModal');

    if (!modalEl) return;

    let typeLabel = "Casier";
    if (type === 'carton') typeLabel = carton_label || "Carton de vin";
    else if (type === 'clayette') typeLabel = data.label || `Clayette ${lig}`;
    else typeLabel = `Casier (Colonne ${col}, Ligne ${lig})`;

    titleEl.textContent = wines.length > 0 ? `${wines.length} Bouteille(s) — ${typeLabel}` : `${typeLabel} (Vide)`;
    subtitleEl.textContent = `${zone_name || 'Espace de stockage'}`;

    if (wines.length === 0) {
        contentEl.innerHTML = `
            <div style="text-align: center; padding: 32px 16px; color: #9ca3af;">
                <i class="fas fa-wine-bottle" style="font-size: 36px; margin-bottom: 12px; display: block; opacity: 0.4;"></i>
                <p>Aucun vin rangé à cet emplacement.</p>
                <button class="btn-primary" style="margin-top: 14px; font-size: 13px;" onclick="quickAddAtSlot(${zone_id}, ${col}, ${lig}, '${carton_label || ''}')">
                    <i class="fas fa-plus"></i> Ranger un vin ici
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

        contentEl.innerHTML = `
            <div class="slot-popup-content">
                ${Object.values(grouped).map(g => {
                    const w = g.wine;
                    const badgeClass = WINE_COLORS[w.type]?.css || 'badge-rouge';
                    return `
                        <div class="wine-item">
                            <div class="wine-info">
                                <h4>${w.nom} ${w.millesime || ''}</h4>
                                <p>
                                    <span class="badge ${badgeClass}">${w.type}</span>
                                    ${w.appellation ? `<span>${w.appellation}</span>` : ''}
                                    ${w.region ? `<span>• ${w.region}</span>` : ''}
                                    ${w.prix ? `<span>• ${w.prix} €</span>` : ''}
                                </p>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="wine-qty">${g.count} bll.</div>
                                <button class="action-btn drink-btn" title="Déguster une bouteille" onclick="openTastingForBottle(${g.ids[0]})">
                                    <i class="fas fa-wine-glass-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    modalEl.classList.remove('hidden');
}

function quickAddAtSlot(zoneId, col, lig, cartonLabel) {
    closeModalSlot();
    const addBtn = document.getElementById('btnAddWine');
    if (addBtn) addBtn.click();

    setTimeout(() => {
        const zoneSelect = document.getElementById('f_zone');
        if (zoneSelect && zoneId) zoneSelect.value = zoneId;
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

