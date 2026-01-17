/**
 * Map Engine Core Class
 * Handles Canvas rendering, Zoom/Pan logic, and Pathfinding
 */
class MapEngine {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById(containerId);

        // State
        this.currentFloorId = null;
        this.floorsData = {};
        this.images = {};
        this.floorOffsets = {}; // Initialize here to prevent draw error

        // Global Graph for Pathfinding
        this.globalNodes = [];
        this.globalEdges = [];

        // Current Location State
        this.currentLocationNode = null;

        // Viewport Transform (Zoom/Pan)
        this.transform = { k: 1, x: 0, y: 0 };
        this.currentFloorId = AppConfig.DEFAULT_FLOOR_ID || 1;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.rotation = 0; // Rotation State
        this.enableAutoRotation = true; // Default ON (User Request)

        // Accessibility
        this.accessibilityMode = false; // Default OFF

        // Animation
        this.path = [];
        this.animationId = null;
        this.animationOffset = 0;

        // D3 Zoom Behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 5])
            .on('zoom', (e) => {
                this.transform = e.transform;
                this.draw();
            });

        // Init Events
        // Manual listeners removed to avoid conflict with D3

        // Bind Zoom to Canvas
        // Bind Zoom to Canvas
        // Disable D3's default Mouse/Touch actions for Pan (Keep Wheel/Pinch if possible)
        // We will handle Pan manually to correct for Rotation.
        d3.select(this.canvas)
            .call(this.zoom)
            .on("mousedown.zoom", null)   // Remove D3 Mouse Drag
            .on("touchstart.zoom", null)  // Remove D3 Touch Drag
            .on("pointerdown.zoom", null) // Remove D3 Pointer Drag (Critical for Win/Touch)
            .on("dblclick.zoom", null);   // Disable D3 Double Click Zoom


        this.resize();
        window.addEventListener('resize', () => this.resize());

        // --- INPUT HANDLING (Ported from scroll-test.html) ---
        // Simple, standard listeners. No global capture.

        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.dragStart = { x: e.offsetX, y: e.offsetY };
            this.canvas.style.cursor = 'grabbing';
            // console.log("[Input] MouseDown");
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.style.cursor = 'grab';
                // console.log("[Input] MouseUp");
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            e.preventDefault();

            const dx = e.offsetX - this.dragStart.x;
            const dy = e.offsetY - this.dragStart.y;
            this.dragStart = { x: e.offsetX, y: e.offsetY };

            this.applyRotatedPan(dx, dy);
        });

        // Touch Events (Basic Support)
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                const rect = this.canvas.getBoundingClientRect();
                this.dragStart = {
                    x: e.touches[0].clientX - rect.left,
                    y: e.touches[0].clientY - rect.top
                };
                // console.log("[Input] TouchStart");
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.isDragging || e.touches.length !== 1) return;
            e.preventDefault(); // Prevent scroll

            const rect = this.canvas.getBoundingClientRect();
            const tx = e.touches[0].clientX - rect.left;
            const ty = e.touches[0].clientY - rect.top;

            const dx = tx - this.dragStart.x;
            const dy = ty - this.dragStart.y;
            this.dragStart = { x: tx, y: ty };

            this.applyRotatedPan(dx, dy);
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => {
            this.isDragging = false;
        });
    }

    // Custom Drag Logic


    applyRotatedPan(dx, dy) {
        // Transform Order: Rotate(θ) -> Translate(tx, ty).
        // To move visual by (dx, dy), we need world translation (dtx, dty) such that:
        // R(θ) * (dtx, dty) = (dx, dy)
        // => (dtx, dty) = R(-θ) * (dx, dy)
        //
        // R(-θ) formula with rad = θ:
        // dtx = dx * cos(θ) + dy * sin(θ)
        // dty = -dx * sin(θ) + dy * cos(θ)

        // VERIFIED LOGIC (from scroll-test.html)
        const rad = this.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        const dtx = dx * cos + dy * sin;
        const dty = -dx * sin + dy * cos;

        // DEBUG LOG (Console)
        // console.log(`[RotPan] Rot:${this.rotation.toFixed(1)} In(${dx.toFixed(1)},${dy.toFixed(1)}) -> Calc(${dtx.toFixed(1)},${dty.toFixed(1)})`);

        // Update Transform
        const newTransform = d3.zoomIdentity
            .translate(this.transform.x + dtx, this.transform.y + dty)
            .scale(this.transform.k);

        this.transform = newTransform;
        this.draw();

        // Sync D3
        this.canvas.__zoom = newTransform;
    }

    resize() {
        if (!this.container) return; // Guard
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
    }

    // --- Data Loading ---

    // Load ALL data at startup to build the graph
    async loadAllData(floorsConfig) {
        this.floorsConfig = floorsConfig;

        // Initialize with default immediately to prevent undefined errors
        this.orderData = AppConfig.DEFAULT_ORDER || { default: 9999, items: {} };
        console.log("[MapCore] Initialized orderData synchronously:", this.orderData);


        // Fetch all JSONs
        const promises = floorsConfig.map(async (conf) => {
            try {
                const response = await fetch(conf.jsonPath);
                const data = await response.json();

                // Tag nodes with floorId
                data.nodes.forEach(n => n.floorId = conf.id);
                // Tag edges with floorId
                data.edges.forEach(e => e.floorId = conf.id);

                this.floorsData[conf.id] = data;

                const img = new Image();
                img.onload = () => {
                    this.draw(); // Redraw when image loads
                };
                img.src = conf.imagePath;
                this.images[conf.id] = img;
            } catch (e) {
                console.error(`Failed to load floor ${conf.id}:`, e);
            }
        });

        // Load Order Data (Try JSON first, fallback to Config)
        // This ensures deployment uses latest JSON, while local dev works if fetch is blocked.
        // Load Order Data (Try JSON first, fallback to Config)
        const orderPromise = fetch(AppConfig.ORDER_FILE || 'JSON/order.json')
            .then(res => {
                if (!res.ok) throw new Error("Fetch failed: " + res.status);
                return res.json();
            })
            .then(data => {
                if (!data) throw new Error("JSON data is empty/null");
                this.orderData = data;
                console.log("[MapCore] Order data loaded from JSON:", this.orderData);
            })
            .catch(e => {
                console.warn("[MapCore] Using embedded default order (JSON load skipped/failed):", e);
                // Re-assign default just in case it was blown away
                this.orderData = AppConfig.DEFAULT_ORDER || { default: 9999, items: {} };
                console.log("[MapCore] Re-applied default orderData:", this.orderData);
            });

        promises.push(orderPromise);

        await Promise.all(promises);
        this.buildGlobalGraph();
    }

    buildGlobalGraph() {
        // We already have globalNodes and globalEdges from loadAllData.
        // Link nodes based on NAME for Stairs and Elevators.

        const connectionMap = {}; // { connectionKey: [nodeId, ...] }

        this.globalNodes.forEach(n => {
            // User requested linking by Name for Stairs/EV
            // Also linking Identical Names for 'entrance' or others if useful?
            // Mainly Stairs and Elevators.
            if (n.name && (n.type === 'stairs' || n.type === 'elevator')) {
                // Key is Name. 
                // Potential issue: "Stairs 1" on Floor 1 vs "Stairs 1" on Floor 3 with no Floor 2 connection?
                // Graph logic handles it (clique).
                const key = n.name;
                if (!connectionMap[key]) connectionMap[key] = [];
                connectionMap[key].push(n);
            }
            // Fallback to connectionId if present (legacy support)
            else if (n.connectionId) {
                if (!connectionMap[n.connectionId]) connectionMap[n.connectionId] = [];
                connectionMap[n.connectionId].push(n);
            }
        });

        // Create Inter-floor edges
        Object.values(connectionMap).forEach(nodes => {
            if (nodes.length > 1) {
                // Connect all nodes with same Name/ID to each other
                for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                        const n1 = nodes[i];
                        const n2 = nodes[j];

                        // Add virtual edge
                        // Dist based on floor difference to prevent illogical skipping (e.g. 1->3->2)
                        // and prefer direct 1->2
                        const f1 = AppConfig.FLOORS.find(f => f.id == n1.floorId);
                        const f2 = AppConfig.FLOORS.find(f => f.id == n2.floorId);
                        const floorDist = (f1 && f2) ? Math.abs(f1.id - f2.id) : 1;

                        let transferType = 'transfer';
                        if (n1.type === 'elevator' && n2.type === 'elevator') transferType = 'elevator';
                        else if (n1.type === 'stairs' && n2.type === 'stairs') transferType = 'stairs';

                        this.globalEdges.push({
                            from: n1.id,
                            to: n2.id,
                            dist: floorDist * 150,
                            type: transferType
                        });
                    }
                }
            }
        });

        // Build Adjacency List Cache
        this.adj = {};
        this.globalNodes.forEach(n => this.adj[n.id] = []);
        this.globalEdges.forEach(e => {
            if (!this.adj[e.from]) this.adj[e.from] = [];
            if (!this.adj[e.to]) this.adj[e.to] = [];
            // Store type in adjacency list for Dijkstra
            this.adj[e.from].push({ to: e.to, dist: e.dist, type: e.type });
            this.adj[e.to].push({ to: e.from, dist: e.dist, type: e.type });
        });
        console.log(`Global Graph Finalized: ${this.globalNodes.length} nodes, ${this.globalEdges.length} edges`);
    }

    // --- Drawing ---

    // Recalculate Floor Stacking based on active route
    updateFloorLayout(pathNodes = []) {
        // 1. Identify Start/End/Intermediate
        let startFloor = null;
        let endFloor = null;
        let intermediates = new Set();

        // Visual State defaults
        this.floorVisuals = {}; // { floorId: { y, scale, opacity } }
        AppConfig.FLOORS.forEach(f => {
            this.floorVisuals[f.id] = { scale: 1.0, opacity: 1.0, y: 0 };
        });

        if (pathNodes.length > 0) {
            const startNode = this.getNode(pathNodes[0]);
            const endNode = this.getNode(pathNodes[pathNodes.length - 1]);

            if (startNode && endNode && startNode.floorId !== endNode.floorId) {
                startFloor = startNode.floorId;
                endFloor = endNode.floorId;

                const minF = Math.min(startFloor, endFloor);
                const maxF = Math.max(startFloor, endFloor);

                // Identify Intermediate Floors
                AppConfig.FLOORS.forEach(f => {
                    if (f.id > minF && f.id < maxF) {
                        intermediates.add(f.id);
                    }
                });
            }
        }

        // 2. Calculate Offsets
        let currentY = 0;
        const defaultGap = AppConfig.FLOOR_GAP || 200;

        // Iterate sorted floors (Top to Bottom, ID Descending usually in config? No, config order matters)
        // loadAllData used: const sortedFloors = [...floorsConfig].sort((a, b) => b.id - a.id);
        // We must follow the SAME stack order.
        const sortedFloors = [...this.floorsConfig].sort((a, b) => b.id - a.id);

        sortedFloors.forEach(conf => {
            const id = conf.id;
            const img = this.images[id];
            const baseHeight = (img && img.height) ? img.height : 1000;

            // Determine Style
            let scale = 1.0;
            let opacity = 1.0;
            let gap = defaultGap;

            if (intermediates.has(id)) {
                // Intermediate: Fade and Shrink
                // User Request: "Make other 2 images closer" -> reduce gap and height effect
                scale = 0.6; // More aggressive shrink
                opacity = 0.3; // "Thin" / Faded
                gap = gap * 0.1; // Virtually no gap to bring floors closer
            }

            // Save Visual State
            this.floorVisuals[id] = {
                scale: scale,
                opacity: opacity,
                y: currentY
            };

            // Calculate Effective Height for Stacking
            // If scaled, we center it visually? Or separate?
            // Simple approach: Advance Y by (Height * Scale) + Gap
            // To align centers properly if scaled:
            // Center of scaled image should be... distinct.
            // Let's just stack them.
            currentY += (baseHeight * scale) + gap;
        });

        this.totalHeight = currentY;

        // 3. Update Node World Coordinates
        this.globalNodes.forEach(node => {
            if (this.floorVisuals[node.floorId]) {
                const vis = this.floorVisuals[node.floorId];
                // Scale relative to origin (0,0 of the floor image)
                node.y = (node.localY * vis.scale) + vis.y;
                if (node.baseX !== undefined) {
                    node.x = node.baseX * vis.scale;
                }
            }
        });
    }

    async switchFloor(floorId) {
        if (!this.floorsData[floorId]) return;

        // Reset layout to normal if switching (assuming path might be cleared or we just want to view this floor)
        // Or should we maintain route view?
        // Typically switching floor via tab implies manual inspection.
        // Let's View Single Floor Mode?
        // For now, allow mixed view.

        this.currentFloorId = floorId;
        this.img = this.images[floorId];

        // Wait for image if not fully loaded (loaded from cache mostly)
        if (!this.img && this.images[floorId]) {
            this.img = this.images[floorId];
        }
        if (this.img && !this.img.complete) {
            await new Promise(r => this.img.onload = r);
        }

        this.fitToScreen();
        this.draw();
    }

    // --- Transforms ---
    fitToScreen() {
        if (!this.img || !this.img.width) return;

        const scaleX = this.canvas.width / this.img.width;
        const scaleY = this.canvas.height / this.img.height;
        const scale = Math.min(scaleX, scaleY) * 0.95;

        const offsetX = (this.canvas.width - this.img.width * scale) / 2;
        const offsetY = (this.canvas.height - this.img.height * scale) / 2;

        this.transform = { k: scale, x: offsetX, y: offsetY };
        this.draw();
    }

    handleMouseDown(e) { /* ... same ... */
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
    }
    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.transform.x += dx;
        this.transform.y += dy;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.draw();
    }
    handleMouseUp() { this.isDragging = false; this.canvas.style.cursor = 'grab'; }
    // Load ALL data at startup to build the graph
    async loadAllData(floorsConfig) {
        this.floorsConfig = floorsConfig;

        // Initialize with default immediately to prevent undefined errors
        this.orderData = AppConfig.DEFAULT_ORDER || { default: 9999, items: {} };
        console.log("[MapCore] Initialized orderData synchronously:", this.orderData);

        // Load Order Data Parallel
        fetch(AppConfig.ORDER_FILE || 'JSON/order.json')
            .then(res => res.ok ? res.json() : Promise.reject(res.status))
            .then(data => {
                this.orderData = data;
                console.log("[MapCore] Order data loaded from JSON:", this.orderData);
            })
            .catch(e => {
                console.warn("[MapCore] Using embedded default order:", e);
                this.orderData = AppConfig.DEFAULT_ORDER || { default: 9999, items: {} };
            });

        this.globalNodes = [];
        this.globalEdges = [];
        this.idMap = new Map();
        this.images = {};
        this.floorOffsets = {}; // { floorId: yOffset }

        // 1. Load Images first to get dimensions
        const imagePromises = floorsConfig.map(conf => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve({ id: conf.id, img });
                img.onerror = () => { console.error(`Failed loading ${conf.imagePath}`); resolve({ id: conf.id, img: null }); };
                img.src = conf.imagePath;
                this.images[conf.id] = img;
            });
        });

        const loadedImages = await Promise.all(imagePromises);

        // 2. Calculate Offsets (Stacking and Cropping)
        let currentY = 0;
        const gap = AppConfig.FLOOR_GAP || 200;

        // Settings for Cropping
        const TARGET_WIDTH = 940;
        this.floorCropX = {}; // { floorId: cropOffsetX }

        // Sort floors descending (3, 2, 1) to stack top-down
        const sortedFloors = [...floorsConfig].sort((a, b) => b.id - a.id);

        sortedFloors.forEach(conf => {
            this.floorOffsets[conf.id] = currentY;
            const img = this.images[conf.id];

            // Calculate Crop X (Center)
            let cropX = 0;
            if (img && img.width > TARGET_WIDTH) {
                cropX = (img.width - TARGET_WIDTH) / 2;
            }
            this.floorCropX[conf.id] = cropX;

            const height = (img && img.height) ? img.height : 1000;
            currentY += height + gap;
        });

        this.totalHeight = currentY;
        this.maxWidth = TARGET_WIDTH;

        // 3. Load JSON and Apply Offsets
        const jsonPromises = floorsConfig.map(async (conf) => {
            try {
                const response = await fetch(conf.jsonPath);
                const data = await response.json();
                const yOffset = this.floorOffsets[conf.id];
                const xCrop = this.floorCropX[conf.id];

                // Nodes
                data.nodes.forEach(node => {
                    const newId = `${conf.id}_${node.id}`;
                    this.idMap.set(newId, {
                        ...node,
                        id: newId,
                        originalId: node.id,
                        floorId: conf.id,
                        x: node.x - xCrop, // Current X
                        baseX: node.x - xCrop, // Base X (Scale 1.0)
                        localY: node.y,     // Store Local Y (Image Space) for dynamic stacking
                        y: node.y + yOffset // Initial World Y
                    });
                    this.globalNodes.push(this.idMap.get(newId));
                });

                // Edges
                let edgesCount = 0;
                data.edges.forEach(edge => {
                    const fromId = `${conf.id}_${edge.from}`;
                    const toId = `${conf.id}_${edge.to}`;

                    if (this.idMap.has(fromId) && this.idMap.has(toId)) {
                        const dist = (typeof edge.dist === 'number') ? edge.dist : 1;
                        this.globalEdges.push({
                            from: fromId,
                            to: toId,
                            dist: dist,
                            floorId: conf.id
                        });
                        edgesCount++;
                    }
                });

                console.log(`Floor ${conf.id}: Loaded ${data.nodes.length} nodes, ${edgesCount} edges`);

            } catch (e) {
                console.error(`Failed to load JSON for ${conf.id}`, e);
            }
        });

        await Promise.all(jsonPromises);
        this.buildGlobalGraph();
        this.updateFloorLayout([]); // Init default layout
        this.draw();
    }

    // Switch floor is now "Focus Floor"
    async switchFloor(floorId) {
        this.currentFloorId = floorId;

        // Pan to floor
        const yOffset = this.floorOffsets[floorId];
        const img = this.images[floorId];
        const height = (img && img.height) ? img.height : 1000;
        const width = (img && img.width) ? img.width : 2000; // fallback width

        // Center view on this floor's center
        const centerX = width / 2;
        const centerY = yOffset + height / 2;

        const k = 0.5; // Zoom level
        const tX = (this.canvas.width / 2) - (centerX * k);
        const tY = (this.canvas.height / 2) - (centerY * k);

        this.transform = d3.zoomIdentity.translate(tX, tY).scale(k);
        d3.select(this.canvas).transition().duration(750)
            .call(this.zoom.transform, this.transform);
    }

    // --- Transforms ---
    // handleWheel, handleTouch etc removed - D3 handles this.

    zoomIn() {
        d3.select(this.canvas).transition().call(this.zoom.scaleBy, 1.2);
    }

    zoomOut() {
        d3.select(this.canvas).transition().call(this.zoom.scaleBy, 0.8);
    }

    // --- Transforms ---
    fitToScreen() {
        // Fit 2F (Middle) default
        this.switchFloor(AppConfig.DEFAULT_FLOOR_ID);

        // Mobile Adjustment: Zoom in a bit more initially for visibility
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                d3.select(this.canvas).transition().duration(500).call(this.zoom.scaleBy, 1.5);
            }, 800);
        }
    }

    fitToPath(pathNodes) {
        if (!pathNodes || pathNodes.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pathNodes.forEach(id => {
            const n = this.getNode(id);
            if (n) {
                minX = Math.min(minX, n.x);
                minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x);
                maxY = Math.max(maxY, n.y);
            }
        });

        // Add padding
        const padding = 100;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const scaleX = this.canvas.width / width;
        const scaleY = this.canvas.height / height;
        let scale = Math.min(scaleX, scaleY);

        // Limit max zoom to avoid extreme closeups on short paths
        scale = Math.min(scale, 2.0);
        scale = Math.max(scale, 0.2);

        // Center view
        // Center view
        const tX = (this.canvas.width / 2) - (cx * scale);
        const tY = (this.canvas.height / 2) - (cy * scale);

        const targetTransform = d3.zoomIdentity.translate(tX, tY).scale(scale);

        // --- Auto Rotation (Heading Up) ---
        let targetRotation = this.rotation;

        // Only calculate target rotation if Auto-Rotation is ENABLED
        if (this.enableAutoRotation && pathNodes.length >= 2) {
            const n1 = this.getNode(pathNodes[0]);
            const n2 = this.getNode(pathNodes[1]);
            if (n1 && n2) {
                const dx = n2.x - n1.x;
                const dy = n2.y - n1.y;
                const rad = Math.atan2(dy, dx);
                const deg = rad * (180 / Math.PI);
                // Target: -90 (Up) + 15 degrees offset
                targetRotation = -90 - deg + 15;
            }
        } else if (!this.enableAutoRotation) {
            // Reset to 0 (North Up) if Auto-Rotation is OFF
            targetRotation = 0;
        }

        // Apply BOTH transitions simultaneously to avoid cancelling
        const selection = d3.select(this.canvas).transition().duration(1000).ease(d3.easeCubicOut);

        // 1. Zoom/Pan Transition
        selection.call(this.zoom.transform, targetTransform);

        // 2. Rotation Transition (Shortest Path)
        const startRotation = this.rotation;

        // Calculate shortest path delta
        let delta = (targetRotation - startRotation) % 360;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const finalRotation = startRotation + delta;

        selection.tween("rotate", () => {
            const interpolate = d3.interpolate(startRotation, finalRotation);
            return (t) => {
                this.rotation = interpolate(t);
                this.draw();
            };
        });
    }

    setRotation(angle, duration = 1000) {
        const startAngle = this.rotation;

        // Shortest path logic
        let delta = (angle - startAngle) % 360;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const targetAngle = startAngle + delta;

        const interpolate = d3.interpolate(startAngle, targetAngle);
        d3.select(this.canvas).transition().duration(duration).ease(d3.easeCubicOut)
            .tween("rotate", () => {
                return (t) => {
                    this.rotation = interpolate(t);
                    this.draw();
                };
            });
    }

    // --- Animation & Effects ---
    panToNode(node) {
        if (!node) return;

        // Ensure floor is active (visibly) - though we draw all floors, this updates currentFloorId
        this.currentFloorId = node.floorId;

        // Pan to Node center
        // Maintain current zoom level, or ensure minimum legibility
        let targetScale = this.transform.k;
        if (targetScale < 0.5) targetScale = 0.8; // Zoom in if too far out

        const tX = (this.canvas.width / 2) - (node.x * targetScale);
        const tY = (this.canvas.height / 2) - (node.y * targetScale);

        this.transform = d3.zoomIdentity.translate(tX, tY).scale(targetScale);
        d3.select(this.canvas).transition().duration(800).ease(d3.easeCubicOut)
            .call(this.zoom.transform, this.transform);
    }

    highlightNode(node) {
        if (!node) return;
        this.activeHighlightNode = node;
        this.highlightStartTime = Date.now();
        this.draw();

        // Loop Effect (Auto-draw handles animation frame if we want continuous,
        // but currently verify just calls draw() on events. 
        // We'll trust the main loop or just trigger a re-draw sequence?)
        // Actually draw() only runs on events. bounce needs animation loop.
        if (this.animationId) cancelAnimationFrame(this.animationId);

        const animate = () => {
            if (Date.now() - this.highlightStartTime < 3000) {
                this.draw();
                this.animationId = requestAnimationFrame(animate);
            } else {
                this.activeHighlightNode = null;
                this.draw();
            }
        };
        animate();
    }

    setCurrentLocation(nodeId) {
        const node = this.getNode(nodeId);
        if (node) {
            this.currentLocationNode = node;
            // Also set as Start default? Or just show it? 
            // User requirement: "Display current location". Implicitly might want to start from there.
            // For now just display. UI Controller can decide to set it as start.
            this.currentFloorId = node.floorId;
            this.draw();
        }
    }

    // Updated Draw includes highlight
    draw() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.save();
        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = '#f5f5f7';
        ctx.fillRect(0, 0, width, height);

        // Transform Order Fix for "Screen-Aligned Dragging":
        // CRITICAL: Rotate around FIXED screen center FIRST, then apply pan/zoom.
        // This ensures panning doesn't affect the rotation pivot.

        // 1. Apply Rotation around FIXED Screen Center
        ctx.translate(width / 2, height / 2);
        ctx.rotate(this.rotation * Math.PI / 180);
        ctx.translate(-width / 2, -height / 2);

        // 2. Apply Pan/Zoom (now works independently of rotation)
        ctx.translate(this.transform.x, this.transform.y);
        ctx.scale(this.transform.k, this.transform.k);

        // Draw Images (Background Maps)
        AppConfig.FLOORS.forEach(f => {
            const img = this.images[f.id];

            // Get Dynamic Visual State
            const vis = this.floorVisuals && this.floorVisuals[f.id] ? this.floorVisuals[f.id] : { y: 0, scale: 1.0, opacity: 1.0 };

            if (img && img.complete) {
                // Use Visual Y, not static offset
                const yOffset = vis.y;
                const xCrop = (this.floorCropX && this.floorCropX[f.id]) || 0;

                // Effective Draw Width/Height (Scaled)
                const baseWidth = Math.min(940, img.width);
                const drawWidth = baseWidth * vis.scale;
                const drawHeight = img.height * vis.scale;

                ctx.save();
                ctx.globalAlpha = vis.opacity;

                ctx.drawImage(img, xCrop, 0, baseWidth, img.height, 0, yOffset, drawWidth, drawHeight);
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 2 * vis.scale;
                ctx.strokeRect(0, yOffset, drawWidth, drawHeight);

                // Floor Label (Upright)
                // Position: Top-Left (-50, +50) relative to image
                // Logic: Move context to label position, un-rotate, draw text.
                const labelX = -50;
                const labelY = yOffset + 50;

                ctx.translate(labelX, labelY);
                ctx.rotate(-this.rotation * Math.PI / 180); // Counter-Rotate

                ctx.fillStyle = `rgba(26, 35, 126, ${0.4 * vis.opacity})`; // Apply Fade 
                ctx.font = 'bold 120px "Cinzel", sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.fillText(f.name, 0, 0); // Draw at local (0,0)

                ctx.restore(); // Restore Rotation/Alpha
            }
        });

        if (this.path && this.path.length > 0) {
            this.drawPath();
            // Draw Markers (Start/End)
            const startNode = this.getNode(this.path[0]);
            const endNode = this.getNode(this.path[this.path.length - 1]);
            this.drawMarker(startNode, 'START', AppConfig.STYLES.node.highlightColor);
            this.drawMarker(endNode, 'GOAL', AppConfig.STYLES.node.highlightColor);
        } else if (this.startNode) {
            this.drawMarker(this.startNode, 'START', AppConfig.STYLES.node.highlightColor);
        }

        // Draw Current Location (Always visible if set)
        if (this.currentLocationNode) {
            // Use a distinct color/label. maybe Green or Blue?
            // "現在地" text.
            this.drawMarker(this.currentLocationNode, '現在地', '#2e7d32'); // Green
        }

        // Draw Highlight Effect (BOUNCING PIN)
        if (this.activeHighlightNode && this.activeHighlightNode.floorId === this.currentFloorId) {
            const n = this.activeHighlightNode;
            const elapsed = Date.now() - this.highlightStartTime;

            // Settings
            const bounceDuration = 2500; // 2 full cycles (at 0.005 freq)
            const waitDuration = 500;
            const fadeDuration = 500;
            const totalDuration = bounceDuration + waitDuration + fadeDuration;

            if (elapsed > totalDuration) return;

            // Opacity Calculation
            let alpha = 1.0;
            if (elapsed > bounceDuration + waitDuration) {
                const fadeElapsed = elapsed - (bounceDuration + waitDuration);
                alpha = 1.0 - (fadeElapsed / fadeDuration);
                alpha = Math.max(0, alpha);
            }

            // Bounce Physics
            let bounceHeight = 0;
            if (elapsed < bounceDuration) {
                // Slower frequency: 0.005 -> Approx 1.25s per bounce cycle
                bounceHeight = Math.abs(Math.sin(elapsed * 0.005)) * 15;
            }

            // Draw Shadow
            const shadowScale = 1 - (bounceHeight / 25);
            ctx.save();
            ctx.globalAlpha = alpha; // Apply Fade

            ctx.translate(n.x, n.y);
            ctx.scale(shadowScale, shadowScale);
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = alpha; // Apply Fade
            this.drawMarker(n, "HERE", '#ffca28', bounceHeight);
            ctx.restore();
        }

        ctx.restore();
        this.drawScreenUI();
    }

    drawScreenUI() {
        const ctx = this.ctx;
        // Draw Current Floor Label (Fixed Top-Left)
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const worldCy = (cy - this.transform.y) / this.transform.k;
        let currentFloorName = "";
        const gap = AppConfig.FLOOR_GAP || 200;

        for (const f of AppConfig.FLOORS) {
            const yOffset = this.floorOffsets[f.id];
            const img = this.images[f.id];
            const h = (img && img.height) ? img.height : 1000;
            if (worldCy >= yOffset - gap / 2 && worldCy < yOffset + h + gap / 2) {
                currentFloorName = f.name;
                break;
            }
        }

        if (currentFloorName) {
            ctx.save();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.shadowBlur = 10;

            ctx.font = 'bold 48px "Cinzel", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 4;
            ctx.strokeText(currentFloorName, 30, 30);
            ctx.fillStyle = '#1a237e';
            ctx.fillText(currentFloorName, 30, 30);
            ctx.restore();
        }
    }

    drawNetwork(edges) {
        if (!edges) return;
        this.ctx.beginPath();
        this.ctx.strokeStyle = AppConfig.STYLES.edge.color;
        this.ctx.lineWidth = 1 / this.transform.k;
        edges.forEach(e => {
            const n1 = this.getNode(e.from);
            const n2 = this.getNode(e.to);
            if (n1 && n2) {
                this.ctx.moveTo(n1.x, n1.y);
                this.ctx.lineTo(n2.x, n2.y);
            }
        });
        this.ctx.stroke();
    }

    drawPath() {
        if (!this.path || this.path.length === 0) return;

        // console.log("DrawPath: Path len =", this.path.length);
        const p0 = this.getNode(this.path[0]);
        // if (p0) console.log("Path[0] coords:", p0.x, p0.y, "Floor:", p0.floorId);

        const style = AppConfig.STYLES.path;
        const ctx = this.ctx;

        // Group path by continuous segments on same floor
        const segments = [];
        let currentSegment = [];

        for (let i = 0; i < this.path.length; i++) {
            const nodeId = this.path[i];
            const node = this.getNode(nodeId);
            if (!node) continue;

            // Check if floor changes from previous
            if (i > 0) {
                const prevNode = this.getNode(this.path[i - 1]);
                if (prevNode && prevNode.floorId !== node.floorId) {
                    // Push current segment
                    if (currentSegment.length > 0) segments.push(currentSegment);
                    currentSegment = [];
                }
            }
            currentSegment.push(node);
        }
        if (currentSegment.length > 0) segments.push(currentSegment);

        // console.log("DrawPath: Segments =", segments.length);

        // Draw Segments
        segments.forEach(seg => {
            if (seg.length === 0) return;

            // Debug: Draw ANY segment even if len=1
            // 1. Shadow/Glow
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].y);
            if (seg.length > 1) {
                for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
            } else {
                ctx.arc(seg[0].x, seg[0].y, 2, 0, Math.PI * 2); // Dot for single point
            }
            ctx.strokeStyle = 'rgba(197, 160, 89, 0.4)';
            ctx.lineWidth = Math.max(5, 12 / this.transform.k);
            ctx.stroke();

            // 2. Main Line
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].y);
            if (seg.length > 1) {
                for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
            }
            ctx.strokeStyle = 'rgba(26, 35, 126, 0.8)';
            ctx.lineWidth = Math.max(2, 5 / this.transform.k);
            ctx.stroke();

            // 3. Dashed overlay
            ctx.beginPath();
            ctx.moveTo(seg[0].x, seg[0].y);
            if (seg.length > 1) {
                for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i].x, seg[i].y);
            }
            ctx.strokeStyle = '#c5a059';
            ctx.lineWidth = Math.max(1, 2 / this.transform.k);
            const dash = Math.max(2, 10 / this.transform.k);
            ctx.setLineDash([dash, dash]);
            ctx.lineDashOffset = -this.animationOffset / this.transform.k;
            ctx.stroke();
            ctx.setLineDash([]);

            // 4. White Waypoint Dots (Intermediate points)
            // Draw for all points in segment, excluding Global Start/End
            const globalStartId = this.path[0];
            const globalEndId = this.path[this.path.length - 1];

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#c62828'; // Red border matching theme or Navy?
            // "White circles", maybe just white filled.
            // Let's us navy border.
            ctx.strokeStyle = '#1a237e';
            ctx.lineWidth = 1;

            seg.forEach(node => {
                // Skip if it's the very first or very last node of the whole path
                if (node.id === globalStartId || node.id === globalEndId) return;

                ctx.beginPath();
                ctx.arc(node.x, node.y, 4, 0, Math.PI * 2); // Small white dot
                ctx.fill();
                ctx.stroke();
            });
        });

        // Draw Bubbles at Transfer Points
        for (let i = 0; i < this.path.length - 1; i++) {
            const n1 = this.getNode(this.path[i]);
            const n2 = this.getNode(this.path[i + 1]);

            if (n1 && n2 && n1.floorId !== n2.floorId) {
                // Direct connection arrow between floors
                this.drawFloorConnectionArrow(n1, n2);

                // Transfer text with name if available
                let depText = `${n2.floorId}階へ`;
                if (n1.name && (n1.type === 'stairs' || n1.type === 'elevator')) {
                    depText = `${n1.name} (${n2.floorId}階へ)`;
                }

                let arrText = `${n1.floorId}階から`;

                // Determine "Path Direction" to avoid collision
                // For n1 (Departure), the path on THIS floor comes from previous node
                const prevNode = (i > 0) ? this.getNode(this.path[i - 1]) : null;
                // For n2 (Arrival), the path on THAT floor goes to next node
                const nextNode = (i + 2 < this.path.length) ? this.getNode(this.path[i + 2]) : null;

                this.drawTransferBubble(n1, depText, true, prevNode);
                this.drawTransferBubble(n2, arrText, false, nextNode);
            }
        }
    }

    drawTransferBubble(node, text, isDeparture, adjacentNode) {
        const ctx = this.ctx;

        // Calculate Size based on Text
        ctx.font = 'bold 13px "M PLUS 1p", sans-serif';
        const textMetrics = ctx.measureText(text || "");
        const textWidth = textMetrics.width;
        const padding = 16;
        const width = text ? Math.max(30, textWidth + padding) : 24;
        const height = 26;

        // 1. Determine Screen Placement (4 Directions)
        let placement = 'right'; // default

        if (adjacentNode) {
            // Vector: Node -> Adjacent (The path line segment)
            const dx = adjacentNode.x - node.x;
            const dy = adjacentNode.y - node.y;
            // Angle in World Radians
            const worldAngle = Math.atan2(dy, dx);
            // Angle in Screen Radians (Apply Rotation)
            // Screen Rotation adds 'this.rotation' to coordinate system?
            // If World is 0 (Right), and Rotation is -90 (Map Rotated Left), Screen shows it Up (-90).
            // So ScreenAngle = WorldAngle + RotationRad.
            const rotRad = this.rotation * Math.PI / 180;
            const screenAngle = worldAngle + rotRad;

            // Normalize to 0-2PI
            let norm = screenAngle % (Math.PI * 2);
            if (norm < 0) norm += Math.PI * 2;
            const deg = norm * 180 / Math.PI;

            // Choose placement to MAXIMIZE angle difference (Perpendicular is best, 180 is ok, 0 is bad)
            // Actually we just want to avoid the quadrant the line is in.
            // If line is 0 deg (Right), we want Top, Bottom, or Left. Left (180) is best?
            // Or if line goes "Out", we want to place bubble away from it.
            // Wait, adjacentNode is where the path *is*. We want bubble *away* from it.
            // So if path is Right, Bubble should be Left? Yes.
            // Or Top/Bottom? Perpendicular (90/270) avoids the line best visually if line is thick.
            // But opposite (180) is safest from overlap.

            // Let's pick the cardinal direction closest to (ScreenAngle + 180).
            // i.e. Opposite to the path direction.

            const opp = (deg + 180) % 360;

            if (opp >= 315 || opp < 45) placement = 'right';
            else if (opp >= 45 && opp < 135) placement = 'bottom'; // Screen Y Down is positive
            else if (opp >= 135 && opp < 225) placement = 'left';
            else placement = 'top';
        }

        ctx.save();
        ctx.translate(node.x, node.y);
        ctx.rotate(-this.rotation * Math.PI / 180); // Align with Screen axes

        // Offset & Tip Drawing
        let tipX = 0, tipY = 0;
        let boxX = 0, boxY = 0;
        const tipSize = 6;
        const boxDist = 25; // Distance from node center to box center/edge

        // Configure based on placement
        if (placement === 'right') {
            ctx.translate(25, 0);
            // Shape logic handled below
        } else if (placement === 'left') {
            // Actually, let's keep translate simple and draw relative
            ctx.translate(-25, 0);
        } else if (placement === 'top') {
            ctx.translate(0, -25);
        } else if (placement === 'bottom') {
            ctx.translate(0, 25);
        }

        const scale = 1 / this.transform.k;
        ctx.scale(scale, scale);

        // Draw Bubble Shape
        ctx.beginPath();

        if (placement === 'right') {
            // Tip at Left (0,0 is now at x=25 relative to node)
            // Wait, previous code: translate(25,0), moveTo(0,0). So tip was at (25,0) relative to node?
            // No, (0,0) is current origin. relative to node it is (25,0).
            // Tip points Left -> back to node. correct.
            ctx.moveTo(0, 0);
            ctx.lineTo(tipSize, -tipSize);
            ctx.lineTo(tipSize, -height / 2);
            ctx.lineTo(width + tipSize, -height / 2); // width is box width
            ctx.lineTo(width + tipSize, height / 2);
            ctx.lineTo(tipSize, height / 2);
            ctx.lineTo(tipSize, tipSize);
            // Text Center
            boxX = tipSize + width / 2; boxY = 0;
        } else if (placement === 'left') {
            // Origin at (-25, 0). Tip points Right -> (0,0) relative to origin
            ctx.moveTo(0, 0);
            ctx.lineTo(-tipSize, -tipSize);
            ctx.lineTo(-tipSize, -height / 2);
            ctx.lineTo(-width - tipSize, -height / 2);
            ctx.lineTo(-width - tipSize, height / 2);
            ctx.lineTo(-tipSize, height / 2);
            ctx.lineTo(-tipSize, tipSize);
            boxX = -tipSize - width / 2; boxY = 0;
        } else if (placement === 'top') {
            // Origin at (0, -25). Tip points Down -> (0,0)
            ctx.moveTo(0, 0);
            ctx.lineTo(-tipSize, -tipSize);
            ctx.lineTo(-width / 2, -tipSize);
            ctx.lineTo(-width / 2, -tipSize - height);
            ctx.lineTo(width / 2, -tipSize - height);
            ctx.lineTo(width / 2, -tipSize);
            ctx.lineTo(tipSize, -tipSize);
            boxX = 0; boxY = -tipSize - height / 2;

        } else if (placement === 'bottom') {
            // Origin at (0, 25). Tip points Up -> (0,0)
            ctx.moveTo(0, 0);
            ctx.lineTo(-tipSize, tipSize);
            ctx.lineTo(-width / 2, tipSize);
            ctx.lineTo(-width / 2, tipSize + height);
            ctx.lineTo(width / 2, tipSize + height);
            ctx.lineTo(width / 2, tipSize);
            ctx.lineTo(tipSize, tipSize);
            boxX = 0; boxY = tipSize + height / 2;
        }

        ctx.closePath();
        ctx.fillStyle = isDeparture ? '#c62828' : '#1565c0';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Text inside bubble
        if (text) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px "M PLUS 1p", sans-serif'; // Japanese friendly font
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // boxX, boxY are center of the bubble box
            ctx.fillText(text, boxX, boxY + 1);
        }

        ctx.restore();

        // Highlight Ring (Always show on node)
        ctx.save();
        ctx.translate(node.x, node.y);
        const ringScale = 1 / this.transform.k;
        ctx.scale(ringScale, ringScale);
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.strokeStyle = isDeparture ? '#c62828' : '#1565c0';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    drawFloorConnectionArrow(n1, n2) {
        // Draw a visible curved arrow connecting the two floor nodes
        const ctx = this.ctx;

        const midX = (n1.x + n2.x) / 2;
        const midY = (n1.y + n2.y) / 2;

        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.hypot(dx, dy);

        let cpX, cpY;

        if (Math.abs(dy) > Math.abs(dx)) {
            // Vertical movement: Bulge X
            const bulge = Math.min(dist * 0.4, 300);
            cpX = midX - bulge;
            cpY = midY;
        } else {
            // Horizontal movement: Bulge Y
            cpX = midX;
            cpY = midY - Math.min(dist * 0.4, 300);
        }

        const gradient = ctx.createLinearGradient(n1.x, n1.y, n2.x, n2.y);
        gradient.addColorStop(0, '#c62828'); // Red (Start)
        gradient.addColorStop(1, '#1565c0'); // Blue (End)

        ctx.save();
        // Path
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.quadraticCurveTo(cpX, cpY, n2.x, n2.y);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.setLineDash([15, 15]);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow at End (n2)
        const angle = Math.atan2(n2.y - cpY, n2.x - cpX);

        ctx.translate(n2.x, n2.y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(-15, -10);
        ctx.lineTo(0, 0);
        ctx.lineTo(-15, 10);
        ctx.fillStyle = '#1565c0'; // Blue tip
        ctx.fill();

        ctx.restore();
    }

    drawMarker(node, label, color, screenOffsetY = 0) {
        if (!node) return;
        const ctx = this.ctx;
        const x = node.x;
        const y = node.y;
        // Marker scale should be consistent, independent of zoom? Or scale with zoom?
        // Usually markers scale with zoom but effectively stay same screen size? 
        // Here we just draw in world space.

        ctx.save();
        ctx.translate(x, y);
        // Counter-Rotate to keep marker upright
        ctx.rotate(-this.rotation * Math.PI / 180);

        // Apply Screen Offset (e.g. Bounce) AFTER rotation so it's always "Up" relative to screen
        if (screenOffsetY !== 0) {
            // Note: Canvas Y is down. To move "Up" on screen, we subtract Y.
            // However, inside drawMarker, the pin is drawn at (0,0) and extends upwards to -32.
            // If screenOffsetY is positive (height), we want to substrate implies moving up.
            // Let's assume input is positive magnitude.
            ctx.translate(0, -screenOffsetY);
        }

        // Inverse scale to keep marker constant size on screen?
        const scale = 1 / this.transform.k;
        ctx.scale(scale, scale);

        // ... Existing Compass Pin Drawing ...
        const pinColor = color;

        ctx.shadowBlur = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';

        // 1. Pin Head (Circle)
        ctx.beginPath();
        ctx.arc(0, -32, 14, 0, Math.PI * 2);
        ctx.fillStyle = pinColor;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 2. Needle/Leg
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -20);
        ctx.lineTo(4, -20);
        ctx.closePath();
        ctx.fillStyle = '#333';
        ctx.fill();

        // 3. Inner Compass Star
        ctx.beginPath();
        ctx.moveTo(0, -38); ctx.lineTo(3, -32); ctx.lineTo(0, -26); ctx.lineTo(-3, -32);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();

        ctx.shadowBlur = 0;

        // Label
        if (label || node.eventName || node.name) {
            let mainText = label || node.eventName || node.name;

            ctx.font = "bold 13px 'Lato', sans-serif";
            const dims = ctx.measureText(mainText);
            const w = dims.width + 20;
            const h = 26;
            const ly = -58;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.roundRect(-w / 2, ly - h / 2, w, h, 4);
            ctx.fill();

            ctx.strokeStyle = pinColor;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = '#2c3e50';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(mainText, 0, ly + 1);
        }
        ctx.restore();
    }

    // --- Pathfinding ---
    setStartMarker(nodeId) {
        console.log("Setting start marker:", nodeId);
        this.startNode = this.getNode(nodeId);
        this.draw();
    }

    calculatePath(startId, endId) {
        console.log(`Calculating path from ${startId} to ${endId}`);
        this.path = [];
        this.startNode = null; // Clear manual start node

        let targetIds = new Set();
        const sNode = this.getNode(startId);

        if (!sNode) {
            console.warn("Start node not found:", startId);
            return [];
        }

        // Special Targets
        if (endId === "NEAREST_MALE" || endId === "NEAREST_FEMALE" || endId === "NEAREST_VENDING") {
            // Search GLOBAL nodes
            if (endId === "NEAREST_VENDING") {
                this.globalNodes.forEach(n => {
                    if (n.type === 'vending') targetIds.add(n.id);
                });
            } else {
                const isMale = endId === "NEAREST_MALE";
                const keyword = isMale ? ["男性", "男子"] : ["女性", "女子"];
                this.globalNodes.forEach(n => {
                    if (n.type === 'toilet' && keyword.some(k => n.name && n.name.includes(k))) {
                        targetIds.add(n.id);
                    }
                });
            }
        } else {
            const eNode = this.getNode(endId);
            if (eNode) targetIds.add(eNode.id);
            else console.warn("End node not found:", endId);
        }

        if (targetIds.size === 0) {
            console.warn("No target nodes found");
            return [];
        }

        // Global Dijkstra
        // Use globalNodes and globalEdges
        // Global Dijkstra (Optimized with MinHeap and Cached Graph)
        // Use this.adj (Adjacency List)

        if (!this.adj || Object.keys(this.adj).length === 0) {
            console.warn("Graph not built properly, rebuilding...");
            this.buildGlobalGraph();
        }

        const dists = {};
        const prev = {};

        // Initialize distances
        // Only init start node dist to 0, others default to undefined (treated as Infinity)
        // This avoids iterating ALL nodes (Optimization)
        dists[sNode.id] = 0;

        const pq = new MinHeap();
        pq.push({ id: sNode.id, dist: 0 });

        let finalDestId = null;
        const visited = new Set(); // Track visited nodes to avoid re-processing

        while (pq.size() > 0) {
            const { id: minId, dist: minDist } = pq.pop();

            if (minDist > (dists[minId] ?? Infinity)) continue; // Stale node
            if (visited.has(minId)) continue;
            visited.add(minId);

            if (targetIds.has(minId)) {
                finalDestId = minId;
                break;
            }

            if (this.adj[minId]) {
                for (const edge of this.adj[minId]) {
                    let weight = edge.dist;

                    // ACCESSIBILITY LOGIC
                    if (this.accessibilityMode) {
                        // Priority: EV > Flat > Stairs
                        // Blocked Edges
                        if (edge.barrierFreeBlocked) continue; // Skip blocked edges

                        if (edge.type === 'elevator') {
                            // Prioritize Elevator (Reduce Cost significantly)
                            weight *= 0.1;
                        } else if (edge.type === 'stairs') {
                            // Avoid Stairs (Increase Cost heavily)
                            weight += 50000;
                        }
                    } else {
                        // Normal Mode: Avoid Elevators slightly to prefer stairs/walking unless necessary? 
                        // Current logic: Avoid elevator if not in accessibility mode.
                        if (edge.type === 'elevator') {
                            weight += 2000; // Penalize heavy to prefer stairs
                        }
                    }

                    const newDist = minDist + weight;
                    if (newDist < (dists[edge.to] ?? Infinity)) {
                        dists[edge.to] = newDist;
                        prev[edge.to] = minId;
                        pq.push({ id: edge.to, dist: newDist });
                    }
                }
            }
        }

        console.log("Dijkstra finished. Found dest?", finalDestId);

        if (finalDestId !== null) {
            let curr = finalDestId;
            while (curr !== undefined) {
                this.path.unshift(curr);
                curr = prev[curr];
            }
        }

        console.log("Path length:", this.path.length);

        this.draw();

        // Auto-fit to path (with Auto-Rotation)
        if (this.path.length > 0) {
            // Use fitToPath instead of fitBounds to ensure Rotation logic triggers!
            this.fitToPath(this.path);
        }

        return this.path;
    }

    // Focus camera on a specific node with zoom
    focusNode(nodeOrId, zoomLevel = 1.5) {
        const node = (typeof nodeOrId === 'string') ? this.getNode(nodeOrId) : nodeOrId;
        if (!node) return;

        // Center the node
        // Transform: screenX = worldX * k + x
        // We want screenX = canvasWidth/2
        // So: canvasWidth/2 = node.x * k + x
        // x = canvasWidth/2 - node.x * k

        const k = zoomLevel;
        const x = this.canvas.width / 2 - node.x * k;
        const y = this.canvas.height / 2 - node.y * k;

        // Smooth Transition using D3
        d3.select(this.canvas).transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity.translate(x, y).scale(k));
    }

    // Auto-zoom/pan to fit specific nodes
    fitBounds(nodes) {
        if (!nodes || nodes.length === 0) return;

        // Calculate Bounding Box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        nodes.forEach(n => {
            if (n && typeof n.x === 'number' && typeof n.y === 'number') {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
                if (n.y < minY) minY = n.y;
                if (n.y > maxY) maxY = n.y;
            }
        });

        // Safety: If no valid nodes found
        if (minX === Infinity || maxX === -Infinity) return;

        // Add Padding
        const padding = 100;
        let targetWidth = maxX - minX + (padding * 2);
        let targetHeight = maxY - minY + (padding * 2);

        // Safety: Prevent Divide by Zero / Infinity
        if (targetWidth <= 0) targetWidth = 500;
        if (targetHeight <= 0) targetHeight = 500;

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Calculate Scale
        // Canvas / Target
        const scaleX = this.canvas.width / targetWidth;
        const scaleY = this.canvas.height / targetHeight;
        let k = Math.min(scaleX, scaleY);

        // Clamp scale robustly
        if (!isFinite(k) || isNaN(k)) k = 1;
        k = Math.min(Math.max(k, 0.2), 3);

        // Calculate Translation
        // center of canavs needs to be at centerX, centerY
        // x = (canvasWidth/2) - (centerX * k)
        const tX = (this.canvas.width / 2) - (centerX * k);
        const tY = (this.canvas.height / 2) - (centerY * k);

        // Final Safety Check before applying
        if (!isFinite(tX) || isNaN(tX) || !isFinite(tY) || isNaN(tY)) {
            console.warn("fitBounds blocked invalid transform:", tX, tY, k);
            return;
        }

        // Animate Transition
        const transform = d3.zoomIdentity.translate(tX, tY).scale(k);
        d3.select(this.canvas).transition().duration(1000).call(this.zoom.transform, transform);
    }

    getNode(id) {
        return this.idMap.get(id);
    }
}

/**
 * MinHeap Implementation for Dijkstra Priority Queue
 */
class MinHeap {
    constructor() {
        this.heap = [];
    }
    push(val) {
        this.heap.push(val);
        this._bubbleUp(this.heap.length - 1);
    }
    pop() {
        if (this.heap.length === 0) return null;
        const min = this.heap[0];
        const end = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = end;
            this._sinkDown(0);
        }
        return min;
    }
    size() {
        return this.heap.length;
    }
    _bubbleUp(n) {
        while (n > 0) {
            const parent = Math.floor((n - 1) / 2);
            if (this.heap[n].dist >= this.heap[parent].dist) break;
            [this.heap[n], this.heap[parent]] = [this.heap[parent], this.heap[n]];
            n = parent;
        }
    }
    _sinkDown(n) {
        const length = this.heap.length;
        while (true) {
            let swap = null;
            const left = 2 * n + 1;
            const right = 2 * n + 2;
            if (left < length && this.heap[left].dist < this.heap[n].dist) swap = left;
            if (right < length && this.heap[right].dist < (swap !== null ? this.heap[swap].dist : this.heap[n].dist)) swap = right;
            if (swap === null) break;
            [this.heap[n], this.heap[swap]] = [this.heap[swap], this.heap[n]];
            n = swap;
        }
    }
}
