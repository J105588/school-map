/**
 * UI Controller
 * Manages sidebars, inputs, and coordinates with MapEngine
 */
class UIController {
    constructor(mapEngine) {
        this.engine = mapEngine;
        this.currentFloorId = AppConfig.DEFAULT_FLOOR_ID;

        // Cache DOM
        this.floorTabs = document.getElementById('floor-tabs');
        this.loadingOverlay = document.getElementById('loading-overlay');

        // Mobile UI Elements
        this.sidebar = document.querySelector('.sidebar');
        this.mobileSearchBar = document.getElementById('mobile-search-bar');
        this.mobileSearchTrigger = document.getElementById('mobile-search-trigger');
        this.mobileQrBtn = document.getElementById('mobile-qr-btn');
        this.mobileSettingsBtn = document.getElementById('mobile-settings-btn');
        this.sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
        this.sidebarCloseBtn = document.getElementById('sidebar-close-btn');
        this.routeList = document.getElementById('route-list');
        this.mobileOverlay = document.getElementById('mobile-route-overlay');
        this.mobileRouteContent = document.getElementById('mobile-route-content');
        this.overlayToggleBtn = document.getElementById('overlay-toggle-btn');

        // Mobile Route Summary Bar Elements
        this.mobileSummaryBar = document.getElementById('mobile-route-summary-bar');
        this.summaryStartName = document.getElementById('summary-start-name');
        this.summaryEndName = document.getElementById('summary-end-name');
        this.summaryCloseBtn = document.getElementById('summary-close-btn');

        // Mobile Overlay Toggle & Drag
        if (this.overlayToggleBtn && this.mobileOverlay) {
            this.initDraggableOverlay();
        }

        this.init();

        // Debounce State
        this.lastStepClickTime = 0;
    }

    clearRoute() {
        if (this.startSelect) this.startSelect.select(null, "出発地を選択...");
        if (this.endSelect) this.endSelect.select(null, "目的地を選択...");

        // Clear engine route
        this.engine.path = [];
        this.engine.startNode = null;
        this.engine.draw();

        // Hide mobile overlays
        if (this.mobileOverlay) this.mobileOverlay.classList.add('hidden');
        if (this.mobileSummaryBar) this.mobileSummaryBar.classList.add('hidden');

        // Show bottom search bar again
        if (this.mobileSearchBar) this.mobileSearchBar.classList.remove('hidden');

        // Hide safety warning banner and modal
        const warnBanner = document.getElementById('navigation-warning-banner');
        if (warnBanner) warnBanner.classList.add('hidden');
        const safetyModal = document.getElementById('safety-warning-modal');
        if (safetyModal) safetyModal.classList.add('hidden');

        // Reset route list
        this.updateRouteList([]);
    }

    handleStepClick(node) {
        if (!node) return;

        const now = Date.now();
        if (now - this.lastStepClickTime < 800) {
            // throttle for 800ms
            return;
        }
        this.lastStepClickTime = now;

        this.engine.panToNode(node);
        this.engine.highlightNode(node);
    }

    async init() {
        // Mobile Event Listeners
        if (this.mobileSearchTrigger) {
            this.mobileSearchTrigger.addEventListener('click', () => {
                this.sidebar.classList.add('active');
                if (this.sidebar) {
                    this.sidebar.style.transform = ''; // Clear inline drag transform
                }
            });
        }
        if (this.mobileQrBtn) {
            this.mobileQrBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startScanner();
            });
        }
        if (this.mobileSettingsBtn) {
            this.mobileSettingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal) {
                    settingsModal.classList.remove('hidden');
                    // Sync State
                    const toggleRotation = document.getElementById('toggle-rotation');
                    const toggleAccessibility = document.getElementById('toggle-accessibility');
                    if (toggleRotation) toggleRotation.checked = this.engine.enableAutoRotation;
                    if (toggleAccessibility) toggleAccessibility.checked = this.engine.accessibilityMode;
                }
            });
        }
        if (this.sidebarSettingsBtn) {
            this.sidebarSettingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal) {
                    settingsModal.classList.remove('hidden');
                    // Sync State
                    const toggleRotation = document.getElementById('toggle-rotation');
                    const toggleAccessibility = document.getElementById('toggle-accessibility');
                    if (toggleRotation) toggleRotation.checked = this.engine.enableAutoRotation;
                    if (toggleAccessibility) toggleAccessibility.checked = this.engine.accessibilityMode;
                }
            });
        }

        if (this.sidebarCloseBtn) {
            this.sidebarCloseBtn.addEventListener('click', () => {
                this.sidebar.classList.remove('active');
            });
        }
        if (this.summaryCloseBtn) {
            this.summaryCloseBtn.addEventListener('click', () => {
                this.clearRoute();
            });
        }

        if (this.mobileSummaryBar) {
            const summaryContent = this.mobileSummaryBar.querySelector('.summary-content');
            if (summaryContent) {
                summaryContent.addEventListener('click', () => {
                    if (this.sidebar) {
                        this.sidebar.classList.add('active');
                        this.sidebar.style.transform = '';
                    }
                });
            }
        }

        // No floor tabs needed for merged map
        // this.renderFloorTabs();


        // Opening Animation Sequence
        const opening = document.getElementById('opening-overlay');
        const needle = document.querySelector('.compass-needle-large');

        if (opening && needle) {
            // Start Spin
            needle.classList.add('spinning');

            // Wait for spin to finish (approx 2s) then sway
            setTimeout(() => {
                needle.classList.remove('spinning');
                needle.classList.add('swaying');

                // Hide overlay after a bit of swaying
                setTimeout(() => {
                    opening.style.opacity = '0';
                    setTimeout(() => opening.style.display = 'none', 1000);
                }, 1500);
            }, 2000);
        }

        this.showLoading(true);
        try {
            await this.engine.loadAllData(AppConfig.FLOORS);

            // Init Custom Selects
            this.startSelect = new CustomSelect('custom-start-select', (val) => {
                if (val) {
                    const node = this.engine.getNode(val);
                    if (node && node.type === 'entrance_only') {
                        this.showRestrictionWarning('entrance_only');
                    }
                    if (!this.endSelect.value) {
                        this.engine.focusNode(val);
                        this.engine.setStartMarker(val);
                    }
                }
                this.calculateRoute();
            });
            this.endSelect = new CustomSelect('custom-end-select', (val) => {
                if (val) {
                    const node = this.engine.getNode(val);
                    if (node && node.type === 'exit_only') {
                        this.showRestrictionWarning('exit_only');
                    }
                }
                this.calculateRoute();
            });

            this.updateSelects();
            await this.engine.switchFloor(this.currentFloorId);
        } catch (e) {
            console.error(e);
        } finally {
            this.showLoading(false);
        }

        // Event Listeners for Controls
        const fitMap = document.getElementById('fit-map');
        if (fitMap) fitMap.addEventListener('click', () => this.engine.fitToScreen());

        const zoomIn = document.getElementById('zoom-in');
        if (zoomIn) zoomIn.addEventListener('click', () => this.engine.zoomIn());

        const zoomOut = document.getElementById('zoom-out');
        if (zoomOut) zoomOut.addEventListener('click', () => this.engine.zoomOut());

        const rotateLeft = document.getElementById('rotate-left');
        if (rotateLeft) rotateLeft.addEventListener('click', () => this.engine.rotateBy(-30));

        const rotateRight = document.getElementById('rotate-right');
        if (rotateRight) rotateRight.addEventListener('click', () => this.engine.rotateBy(30));

        // Settings Modal Logic
        const settingsBtn = document.getElementById('settings-btn');
        const settingsModal = document.getElementById('settings-modal');
        const closeSettingsBtn = document.getElementById('close-settings-btn');
        const toggleRotation = document.getElementById('toggle-rotation');
        const toggleAccessibility = document.getElementById('toggle-accessibility');

        if (settingsBtn && settingsModal && closeSettingsBtn) {
            // Open Settings
            settingsBtn.addEventListener('click', () => {
                settingsModal.classList.remove('hidden');
                // Sync State
                if (toggleRotation) toggleRotation.checked = this.engine.enableAutoRotation;
                if (toggleAccessibility) toggleAccessibility.checked = this.engine.accessibilityMode;
            });

            // Close Settings
            closeSettingsBtn.addEventListener('click', () => {
                settingsModal.classList.add('hidden');
            });

            // Close on background click
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.classList.add('hidden');
                }
            });
        }

        // Toggle: Auto Rotation
        if (toggleRotation) {
            toggleRotation.addEventListener('change', (e) => {
                this.engine.enableAutoRotation = e.target.checked;
                // If turned OFF, maybe reset rotation to 0 immediately?
                if (!e.target.checked) {
                    this.engine.setRotation(0);
                } else {
                    // Recalculate if path exists to apply rotation?
                    // Just let next navigation handle it, or force update?
                    // For now, simple state change.
                }
            });
        }

        // Toggle: Accessibility
        if (toggleAccessibility) {
            toggleAccessibility.addEventListener('change', (e) => {
                this.engine.accessibilityMode = e.target.checked;
                // Re-calculate route immediately
                if (this.startSelect.value && this.endSelect.value) {
                    this.calculateRoute();
                }
            });
        }

        // Scan Button (Map Controls)
        const scanBtn = document.getElementById('scan-btn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => this.startScanner());
        }
        const closeScanBtn = document.getElementById('close-qr-btn');
        if (closeScanBtn) {
            closeScanBtn.addEventListener('click', () => this.stopScanner());
        }

        // QR Help Logic
        const helpBtn = document.getElementById('qr-help-btn');
        const helpModal = document.getElementById('qr-help-modal');
        const closeHelpBtn = document.getElementById('close-help-btn');

        if (helpBtn && helpModal && closeHelpBtn) {
            helpBtn.addEventListener('click', () => {
                helpModal.classList.remove('hidden');
                helpModal.style.display = 'flex'; // Force flex
            });
            closeHelpBtn.addEventListener('click', () => {
                helpModal.classList.add('hidden');
                helpModal.style.display = 'none';
            });
            // Close on background click
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) {
                    helpModal.classList.add('hidden');
                    helpModal.style.display = 'none';
                }
            });
        }

        // Safety warning modal close event (Mobile Only modal)
        const safetyCloseBtn = document.getElementById('safety-modal-close-btn');
        const safetyModal = document.getElementById('safety-warning-modal');
        if (safetyCloseBtn && safetyModal) {
            safetyCloseBtn.addEventListener('click', () => {
                safetyModal.classList.add('hidden');
            });
            safetyModal.addEventListener('click', (e) => {
                if (e.target === safetyModal) {
                    safetyModal.classList.add('hidden');
                }
            });
        }

        // Restriction warning modal close event
        const restrictionCloseBtn = document.getElementById('restriction-modal-close-btn');
        const restrictionModal = document.getElementById('restriction-warning-modal');
        if (restrictionCloseBtn && restrictionModal) {
            restrictionCloseBtn.addEventListener('click', () => {
                restrictionModal.classList.add('hidden');
            });
            restrictionModal.addEventListener('click', (e) => {
                if (e.target === restrictionModal) {
                    restrictionModal.classList.add('hidden');
                }
            });
        }

        // Check for URL Params (API & State Initialization)
        const params = new URLSearchParams(window.location.search);

        // 1. Accessibility & Auto-rotation Setting
        const accessibleParam = params.get('accessible') || params.get('barrier_free') || params.get('accessibility');
        if (accessibleParam !== null) {
            const isAccessible = ['true', '1', 'yes', 'on'].includes(accessibleParam.toLowerCase());
            this.engine.accessibilityMode = isAccessible;
            const toggleAccessibility = document.getElementById('toggle-accessibility');
            if (toggleAccessibility) toggleAccessibility.checked = isAccessible;
        }

        const autoRotateParam = params.get('auto_rotate') || params.get('rotate') || params.get('autorotate');
        if (autoRotateParam !== null) {
            const isAutoRotate = ['true', '1', 'yes', 'on'].includes(autoRotateParam.toLowerCase());
            this.engine.enableAutoRotation = isAutoRotate;
            const toggleRotation = document.getElementById('toggle-rotation');
            if (toggleRotation) toggleRotation.checked = isAutoRotate;
        }

        // 2. Current Location
        const currentQuery = params.get('current') || params.get('loc');
        let currentResolved = null;
        if (currentQuery) {
            currentResolved = this.resolveNode(currentQuery);
            if (currentResolved) {
                this.engine.setCurrentLocation(currentResolved.id);
            }
        }

        // 3. Start Point
        const startQuery = params.get('start') || params.get('from') || params.get('src');
        let startResolved = null;
        if (startQuery) {
            startResolved = this.resolveStart(startQuery);
        }

        // If start is not defined but current location is, set start to current location
        if (!startResolved && currentResolved) {
            startResolved = {
                value: currentResolved.id,
                title: currentResolved.eventName || currentResolved.name || '現在地'
            };
        }

        // 4. End Point (Destination)
        const endQuery = params.get('end') || params.get('goal') || params.get('dest') || params.get('to');
        let endResolved = null;
        if (endQuery) {
            endResolved = this.resolveDestination(endQuery);
        }

        // 5. Apply navigation / selection state
        if (startResolved && endResolved) {
            if (this.startSelect) this.startSelect.select(startResolved.value, startResolved.title);
            if (this.endSelect) this.endSelect.select(endResolved.value, endResolved.title);
            this.engine.setStartMarker(startResolved.value);
            this.calculateRoute();
        } else if (startResolved) {
            if (this.startSelect) this.startSelect.select(startResolved.value, startResolved.title);
            this.engine.setStartMarker(startResolved.value);
            this.engine.focusNode(startResolved.value);
        } else if (endResolved) {
            if (this.endSelect) this.endSelect.select(endResolved.value, endResolved.title);
            if (!endResolved.value.startsWith('NEAREST_')) {
                this.engine.focusNode(endResolved.value);
            }
        } else {
            // Check floor query parameter if no routing or node focus is active
            const floorParam = params.get('floor');
            if (floorParam) {
                const f = parseInt(floorParam);
                if (!isNaN(f) && AppConfig.FLOORS.some(fl => fl.id === f)) {
                    this.switchFloor(f);
                }
            }
        }

        // Initialize Sidebar Swipe-down Close Gesture
        this.initSidebarSwipe();
    }

    renderFloorTabs() {
        // Obsolete in Single Map Mode
        if (!this.floorTabs) return;
        this.floorTabs.style.display = 'none';
    }

    async switchFloor(floorId) {
        // In merged map, this just pans to the floor
        if (this.currentFloorId === floorId) return;
        this.currentFloorId = floorId;

        // Guard: Check if engine has loaded offsets
        if (this.engine.floorOffsets && this.engine.floorOffsets[floorId] !== undefined) {
            this.engine.switchFloor(floorId);
        } else {
            console.warn(`[UIController] switchFloor(${floorId}) deferred because map data is not fully loaded yet.`);
        }
    }

    // Helper functions for parameter-based API/URL extensions
    normalizeString(str) {
        if (!str) return '';
        return str.toString().trim().toLowerCase().normalize('NFKC');
    }

    resolveNode(query) {
        if (!query) return null;
        const normQuery = this.normalizeString(query);

        // 1. Direct ID check (e.g. "1_101")
        let node = this.engine.getNode(query) || this.engine.getNode(normQuery);
        if (node) return node;

        // 2. Exact match check (case-insensitive and normalized)
        let exactMatches = this.engine.globalNodes.filter(n => {
            const name = this.normalizeString(n.name);
            const eventName = this.normalizeString(n.eventName);
            const org = this.normalizeString(n.organization);
            return name === normQuery || eventName === normQuery || org === normQuery;
        });
        if (exactMatches.length > 0) return exactMatches[0];

        // 3. Partial match check (case-insensitive and normalized)
        let partialMatches = this.engine.globalNodes.filter(n => {
            const name = this.normalizeString(n.name);
            const eventName = this.normalizeString(n.eventName);
            const org = this.normalizeString(n.organization);
            return name.includes(normQuery) || eventName.includes(normQuery) || org.includes(normQuery);
        });
        if (partialMatches.length > 0) return partialMatches[0];

        // 4. Try matching floor local ID (originalId)
        let origMatches = this.engine.globalNodes.filter(n => {
            const origId = this.normalizeString(n.originalId);
            return origId === normQuery;
        });
        if (origMatches.length > 0) return origMatches[0];

        return null;
    }

    resolveStart(query) {
        const node = this.resolveNode(query);
        if (node) {
            if (node.type === 'entrance_only') {
                this.showRestrictionWarning('entrance_only');
            }
            let title = node.eventName || node.name || '出発地';
            if (node.type === 'stairs' || node.type === 'elevator') {
                title += ` (${node.floorId}階)`;
            }
            return {
                value: node.id,
                title: title
            };
        }
        return null;
    }

    resolveDestination(query) {
        if (!query) return null;
        const normQuery = this.normalizeString(query);

        // Check for system auto options (e.g. NEAREST_MALE, NEAREST_FEMALE, NEAREST_VENDING)
        if (normQuery === 'nearest_male' || normQuery === 'nearest-male' || normQuery.includes('男子トイレ') || normQuery.includes('男トイレ') || normQuery.includes('最寄りの男子トイレ')) {
            return { value: 'NEAREST_MALE', title: '最寄りの男子トイレ' };
        }
        if (normQuery === 'nearest_female' || normQuery === 'nearest-female' || normQuery.includes('女子トイレ') || normQuery.includes('女トイレ') || normQuery.includes('最寄りの女子トイレ')) {
            return { value: 'NEAREST_FEMALE', title: '最寄りの女子トイレ' };
        }
        if (normQuery === 'nearest_vending' || normQuery === 'nearest-vending' || normQuery === 'vending' || normQuery.includes('自販機') || normQuery.includes('最寄りの自販機')) {
            return { value: 'NEAREST_VENDING', title: '最寄りの自販機' };
        }

        // Otherwise resolve to a node
        const node = this.resolveNode(query);
        if (node) {
            if (node.type === 'exit_only') {
                this.showRestrictionWarning('exit_only');
            }
            let title = node.eventName || node.name || '目的地';
            if (node.type === 'stairs' || node.type === 'elevator') {
                title += ` (${node.floorId}階)`;
            }
            return {
                value: node.id,
                title: title
            };
        }
        return null;
    }

    updateSelects() {
        // Debug: Check if orderData is available
        console.log('[updateSelects] orderData:', this.engine.orderData);

        // Populate Custom Selects
        const activeNodes = this.engine.globalNodes.filter(n => n.name && n.type !== 'junction');

        // Helper to convert node to option format with custom sortIndex modifier
        const toOption = (n, isStart) => {
            let title = n.eventName || n.name;
            if (n.type === 'stairs' || n.type === 'elevator') {
                title += ` (${n.floorId}階)`;
            }

            // Determine sortIndex
            const sortIndex = (() => {
                const isRestricted = (isStart && n.type === 'exit_only') || (!isStart && n.type === 'entrance_only');
                const isRestrictedPartner = (isStart && n.type === 'entrance_only') || (!isStart && n.type === 'exit_only');

                if (!this.engine.orderData) {
                    if (isRestricted) {
                        return 9999.2;
                    } else if (isRestrictedPartner) {
                        return 9999.1;
                    } else {
                        return 9999;
                    }
                }

                const fullName = `${n.eventName || ''} ${n.name || ''}`.trim();
                const defaultPriority = this.engine.orderData.default || 9999;

                // Collect all matched priorities from orderData.items
                const matchedPriorities = [];
                if (this.engine.orderData.items) {
                    for (const [key, priority] of Object.entries(this.engine.orderData.items)) {
                        if (key && fullName.includes(key)) {
                            matchedPriorities.push(priority);
                        }
                    }
                }

                if (matchedPriorities.length > 0) {
                    const basePriority = Math.min(...matchedPriorities);
                    if (isRestricted) {
                        return basePriority + 0.2;
                    } else if (isRestrictedPartner) {
                        return basePriority + 0.1;
                    } else {
                        return basePriority;
                    }
                } else {
                    // No keyword matched
                    if (isRestricted) {
                        return defaultPriority + 0.2;
                    } else if (isRestrictedPartner) {
                        return defaultPriority + 0.1;
                    } else {
                        return defaultPriority;
                    }
                }
            })();

            return {
                value: n.id,
                title: title,
                org: n.organization || (n.eventName ? '展示場所：' + n.name : ''), // Secondary text
                category: this.getTypeLabel(n.type),
                type: n.type,
                floor: n.floorId,
                sortIndex: sortIndex,
                // Sort Key: Priority to Organization, then Name. Ignore EventName.
                sortKey: (n.organization || n.name || '').trim()
            };
        };

        // Sort initially by Floor and Name
        const sortedActiveNodes = [...activeNodes].sort((a, b) => {
            if (a.floorId !== b.floorId) return a.floorId - b.floorId;
            return a.name.localeCompare(b.name, 'ja', { numeric: true });
        });

        const startOptions = sortedActiveNodes.map(n => toOption(n, true));
        const endOptions = sortedActiveNodes.map(n => toOption(n, false));

        // System Options
        const systemOptions = [
            { value: "NEAREST_MALE", title: "最寄りの男子トイレ", org: "System Auto", category: "AUTO", type: 'toilet', sortKey: 'ZZ_AUTO' },
            { value: "NEAREST_FEMALE", title: "最寄りの女子トイレ", org: "System Auto", category: "AUTO", type: 'toilet', sortKey: 'ZZ_AUTO' },
            { value: "NEAREST_VENDING", title: "最寄りの自販機", org: "System Auto", category: "AUTO", type: 'vending', sortKey: 'ZZ_AUTO' }
        ];

        this.startSelect.setOptions(startOptions);
        this.endSelect.setOptions([...endOptions, ...systemOptions]);
    }

    getTypeLabel(type) {
        const map = {
            'room': '教室', 'toilet': 'トイレ', 'stairs': '階段', 'elevator': 'EV',
            'entrance': '出入口', 'entrance_only': '入口専用', 'exit_only': '出口専用',
            'vending': '自販機', 'area': 'エリア'
        };
        return map[type] || 'Others';
    }

    calculateRoute() {
        const startVal = this.startSelect.value;
        const endVal = this.endSelect.value;

        if (!startVal || !endVal) {
            // Hide mobile overlay if route is cleared
            if (this.mobileOverlay) this.mobileOverlay.classList.add('hidden');
            if (this.mobileSummaryBar) this.mobileSummaryBar.classList.add('hidden');

            // Hide safety warning banner and modal
            const warnBanner = document.getElementById('navigation-warning-banner');
            if (warnBanner) warnBanner.classList.add('hidden');
            const safetyModal = document.getElementById('safety-warning-modal');
            if (safetyModal) safetyModal.classList.add('hidden');
            return;
        }

        const path = this.engine.calculatePath(startVal, endVal);

        // Auto-zoom to fit the entire path
        if (path && path.length > 0) {
            this.engine.fitToPath(path);

            if (window.innerWidth <= 768) {
                // Mobile: Show Modal only if cooldown period (30 minutes) has passed
                const lastWarnTimeStr = localStorage.getItem('last_safety_warning_time');
                const lastWarnTime = lastWarnTimeStr ? parseFloat(lastWarnTimeStr) : 0;
                const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

                if (Date.now() - lastWarnTime > COOLDOWN_MS) {
                    const safetyModal = document.getElementById('safety-warning-modal');
                    if (safetyModal) {
                        safetyModal.classList.remove('hidden');
                        localStorage.setItem('last_safety_warning_time', Date.now().toString());
                    }
                }
                const warnBanner = document.getElementById('navigation-warning-banner');
                if (warnBanner) warnBanner.classList.add('hidden');
            } else {
                // Desktop: Show Map Warning Banner, Hide Safety Modal
                const warnBanner = document.getElementById('navigation-warning-banner');
                if (warnBanner) warnBanner.classList.remove('hidden');
                const safetyModal = document.getElementById('safety-warning-modal');
                if (safetyModal) safetyModal.classList.add('hidden');
            }

            // Mobile: Close Sidebar & Show Overlay
            if (window.innerWidth <= 768 && this.sidebar) {
                this.sidebar.classList.remove('active');
            }

            // Hide bottom search bar during active routing
            if (this.mobileSearchBar) this.mobileSearchBar.classList.add('hidden');

            // Update Mobile Route Summary Bar
            if (this.mobileSummaryBar && this.summaryStartName && this.summaryEndName) {
                const sNode = this.engine.getNode(startVal);
                const eNode = this.engine.getNode(endVal);

                let startText = sNode ? (sNode.eventName || sNode.name) : "出発地";
                let endText = eNode ? (eNode.eventName || eNode.name) : "目的地";

                // Add floor info for extra clarity if nodes exist
                if (sNode) {
                    let startDetail = `${sNode.floorId}F`;
                    const sOrg = sNode.organization || (sNode.eventName ? sNode.name : '');
                    if (sOrg) {
                        startDetail += ` - ${sOrg}`;
                    }
                    startText += ` (${startDetail})`;
                }
                if (eNode) {
                    if (eNode.floorId) {
                        let endDetail = `${eNode.floorId}F`;
                        const eOrg = eNode.organization || (eNode.eventName ? eNode.name : '');
                        if (eOrg) {
                            endDetail += ` - ${eOrg}`;
                        }
                        endText += ` (${endDetail})`;
                    } else if (endVal.startsWith("NEAREST_")) {
                        const labelMap = {
                            "NEAREST_MALE": "最寄男子トイレ",
                            "NEAREST_FEMALE": "最寄女子トイレ",
                            "NEAREST_VENDING": "最寄自販機"
                        };
                        endText = labelMap[endVal] || endText;
                    }
                }

                this.summaryStartName.innerText = startText;
                this.summaryEndName.innerText = endText;
                this.mobileSummaryBar.classList.remove('hidden');
            }

            // Update Mobile Overlay with EXACT content from Route List
            this.updateRouteList(path || []); // Generate standard list first

            if (this.mobileOverlay && this.mobileRouteContent) {
                // Clone the generated list content to Mobile Overlay
                this.mobileRouteContent.innerHTML = '';

                if (this.routeList && this.routeList.children.length > 0) {
                    const ul = document.createElement('ul');
                    ul.className = 'route-list mobile-route-list';

                    Array.from(this.routeList.children).forEach((li) => {
                        const clone = li.cloneNode(true);
                        // Re-attach click handler using stored Node ID
                        const nodeId = li.dataset.nodeId;
                        if (nodeId) {
                            const node = this.engine.getNode(nodeId);
                            if (node) {
                                clone.onclick = () => {
                                    this.handleStepClick(node);
                                };
                            }
                        }
                        ul.appendChild(clone);
                    });
                    this.mobileRouteContent.appendChild(ul);
                }

                this.mobileOverlay.classList.remove('hidden');
                this.mobileOverlay.classList.remove('collapsed'); // Auto-expand on new route
            }
        } else {
            // No route found
            this.updateRouteList([], true); // Render warning card on desktop

            if (startVal && endVal) {
                // Close Sidebar on Mobile to show warning overlay
                if (window.innerWidth <= 768 && this.sidebar) {
                    this.sidebar.classList.remove('active');
                }

                // Hide bottom search bar
                if (this.mobileSearchBar) this.mobileSearchBar.classList.add('hidden');

                // Update Mobile Route Summary Bar to show starting and ending points
                if (this.mobileSummaryBar && this.summaryStartName && this.summaryEndName) {
                    const sNode = this.engine.getNode(startVal);
                    const eNode = this.engine.getNode(endVal);

                    let startText = sNode ? (sNode.eventName || sNode.name) : "出発地";
                    let endText = eNode ? (eNode.eventName || eNode.name) : "目的地";

                    if (sNode) {
                        let startDetail = `${sNode.floorId}F`;
                        const sOrg = sNode.organization || (sNode.eventName ? sNode.name : '');
                        if (sOrg) {
                            startDetail += ` - ${sOrg}`;
                        }
                        startText += ` (${startDetail})`;
                    }
                    if (eNode) {
                        if (eNode.floorId) {
                            let endDetail = `${eNode.floorId}F`;
                            const eOrg = eNode.organization || (eNode.eventName ? eNode.name : '');
                            if (eOrg) {
                                endDetail += ` - ${eOrg}`;
                            }
                            endText += ` (${endDetail})`;
                        } else if (endVal.startsWith("NEAREST_")) {
                            const labelMap = {
                                "NEAREST_MALE": "最寄男子トイレ",
                                "NEAREST_FEMALE": "最寄女子トイレ",
                                "NEAREST_VENDING": "最寄自販機"
                            };
                            endText = labelMap[endVal] || endText;
                        }
                    }

                    this.summaryStartName.innerText = startText;
                    this.summaryEndName.innerText = endText;
                    this.mobileSummaryBar.classList.remove('hidden');
                }

                // Hide safety warning banner and modal since navigation is not active/available
                const warnBanner = document.getElementById('navigation-warning-banner');
                if (warnBanner) warnBanner.classList.add('hidden');
                const safetyModal = document.getElementById('safety-warning-modal');
                if (safetyModal) safetyModal.classList.add('hidden');

                // Render mobile overlay with warning card
                if (this.mobileOverlay && this.mobileRouteContent) {
                    this.mobileRouteContent.innerHTML = `
                        <div class="mobile-route-error-card">
                            <div class="route-error-icon">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V8h2v4z"/>
                                </svg>
                            </div>
                            <div class="route-error-title">経路を案内できません</div>
                            <div class="route-error-desc">お選びいただいた地点間の経路が存在しないか、バリアフリーモードにより通行可能な経路がありません。</div>
                            <div class="route-error-contact">お近くの<strong>スタッフにお気軽にお問い合わせください。</strong></div>
                        </div>
                    `;
                    this.mobileOverlay.classList.remove('hidden');
                    this.mobileOverlay.classList.remove('collapsed');
                }
            } else {
                if (this.mobileOverlay) this.mobileOverlay.classList.add('hidden');
                if (this.mobileSummaryBar) this.mobileSummaryBar.classList.add('hidden');
                if (this.mobileSearchBar) this.mobileSearchBar.classList.remove('hidden');

                // Hide safety warning banner and modal
                const warnBanner = document.getElementById('navigation-warning-banner');
                if (warnBanner) warnBanner.classList.add('hidden');
                const safetyModal = document.getElementById('safety-warning-modal');
                if (safetyModal) safetyModal.classList.add('hidden');
            }
        }
    }

    updateRouteList(pathIds, hasError = false) {
        this.routeList.innerHTML = '';
        if (hasError) {
            this.routeList.innerHTML = `
                <div class="route-error-card">
                    <div class="route-error-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V8h2v4z"/>
                        </svg>
                    </div>
                    <div class="route-error-title">経路を案内できません</div>
                    <div class="route-error-desc">お選びいただいた地点間の経路が存在しないか、バリアフリーモードにより通行可能な経路がありません。</div>
                    <div class="route-error-contact">お近くの<strong>スタッフにお気軽にお問い合わせください。</strong></div>
                </div>
            `;
            return;
        }

        if (!pathIds || pathIds.length === 0) {
            this.routeList.innerHTML = '<div style="padding:20px; text-align:center; color:#95a5a6; font-size:14px;">出発地と目的地を選択してナビを開始</div>';
            return;
        }

        // Add dynamic walking warning item at the top of the route list
        const warningLi = document.createElement('li');
        warningLi.className = 'route-warning-item';
        warningLi.innerHTML = `
            <div class="warning-item-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V8h2v4z"/>
                </svg>
            </div>
            <div class="warning-item-content">
                <strong>歩きスマホ注意</strong><br>
                歩行中のスマホ操作は危険です。立ち止まって安全を確認した上で画面をご覧ください。
            </div>
        `;
        this.routeList.appendChild(warningLi);

        pathIds.forEach((id, index) => {
            const node = this.engine.getNode(id);
            const nextNode = pathIds[index + 1] ? this.engine.getNode(pathIds[index + 1]) : null;
            const prevNode = pathIds[index - 1] ? this.engine.getNode(pathIds[index - 1]) : null;

            const isStart = index === 0;
            const isEnd = index === pathIds.length - 1;
            const isTransfer = (prevNode && prevNode.floorId !== node.floorId) || (nextNode && nextNode.floorId !== node.floorId);

            if (!node.name && !isStart && !isEnd && !isTransfer) return;

            const li = document.createElement('li');
            li.dataset.nodeId = node.id; // Store exact node ID
            li.className = `route-step ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''}`;
            li.className = `route-step ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''}`;
            li.onclick = () => {
                this.handleStepClick(node);
            };

            let title = node.eventName || node.name;
            if (!title && isTransfer) title = "フロア移動";

            let desc = `${node.floorId}階`;
            const orgText = node.organization || (node.eventName ? node.name : '');
            if (orgText) desc += ` - ${orgText}`;

            if (isTransfer) {
                const typeLabel = node.type === 'elevator' ? 'エレベーター' : (node.type === 'stairs' ? '階段' : '移動');
                const nameLabel = node.name || '';
                if (prevNode && prevNode.floorId !== node.floorId) {
                    title = `${typeLabel}で ${node.floorId}階に到着`;
                } else if (nextNode && nextNode.floorId !== node.floorId) {
                    title = `${typeLabel}で ${node.floorId}階 ➔ ${nextNode.floorId}階へ`;
                }
                if (nameLabel) {
                    title = `${nameLabel} (${title})`;
                }
            }

            li.innerHTML = `
                <div class="step-marker"></div>
                <div class="step-content">
                    <div class="step-main">
                        <span class="step-label">${title}</span>
                        <span class="step-detail">${desc}</span>
                    </div>
                </div>
            `;
            this.routeList.appendChild(li);
        });
    }

    initDraggableOverlay() {
        const header = this.mobileOverlay.querySelector('.overlay-header');
        if (!header) return;

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        let hasMoved = false;

        const onStart = (e) => {
            // Only left mouse or touch
            if (e.type === 'mousedown' && e.button !== 0) return;

            // Prevent ghost mouse events after touch
            if (e.type === 'touchstart') {
                e.preventDefault();
            }

            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

            isDragging = true;
            hasMoved = false;
            startX = clientX;
            startY = clientY;

            if (window.innerWidth > 768) {
                const rect = this.mobileOverlay.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                this.mobileOverlay.style.transition = 'none';
                this.mobileOverlay.style.right = 'auto'; // Clear right to allow left positioning
            } else {
                // Mobile: Disable transition for smooth swipe tracking
                this.mobileOverlay.style.transition = 'none';
            }

            document.addEventListener(e.type === 'mousedown' ? 'mousemove' : 'touchmove', onMove, { passive: false });
            document.addEventListener(e.type === 'mousedown' ? 'mouseup' : 'touchend', onEnd);
        };

        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent scrolling

            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMoved = true;

            if (window.innerWidth > 768) {
                this.mobileOverlay.style.left = `${initialLeft + dx}px`;
                this.mobileOverlay.style.top = `${initialTop + dy}px`;
            } else {
                // Mobile: Translate vertically based on drag distance
                const isCollapsed = this.mobileOverlay.classList.contains('collapsed');
                if (isCollapsed && dy < 0) {
                    this.mobileOverlay.style.transform = `translateY(${dy}px)`;
                } else if (!isCollapsed && dy > 0) {
                    this.mobileOverlay.style.transform = `translateY(${dy}px)`;
                }
            }
        };

        const onEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;

            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);

            // Re-enable height transition and restore styles defined in stylesheet
            this.mobileOverlay.style.transition = '';
            this.mobileOverlay.style.transform = '';

            if (window.innerWidth > 768) {
                this.mobileOverlay.style.left = '';
                this.mobileOverlay.style.right = '';
                this.mobileOverlay.style.top = '';
            } else {
                const clientY = e.type === 'touchend' ? e.changedTouches[0].clientY : e.clientY;
                const dy = clientY - startY;

                if (dy < -40) {
                    this.mobileOverlay.classList.remove('collapsed');
                } else if (dy > 40) {
                    this.mobileOverlay.classList.add('collapsed');
                } else if (!hasMoved) {
                    // Treated as Click -> Toggle Collapse
                    this.mobileOverlay.classList.toggle('collapsed');
                }
            }
        };

        header.addEventListener('mousedown', onStart);
        header.addEventListener('touchstart', onStart, { passive: false });
    }

    initSidebarSwipe() {
        const header = document.querySelector('.sidebar-header');
        if (!header || !this.sidebar) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        header.addEventListener('touchstart', (e) => {
            if (window.innerWidth > 768) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            this.sidebar.style.transition = 'none'; // Disable transition for 1:1 tracking
        }, { passive: true });

        header.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const dy = currentY - startY;

            // Only allow pulling down (dy > 0)
            if (dy > 0) {
                this.sidebar.style.transform = `translateY(${dy}px)`;
            }
        }, { passive: true });

        header.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            isDragging = false;
            this.sidebar.style.transition = ''; // Restore CSS transition

            const dy = currentY - startY;
            // If pulled down more than 120px, close sidebar
            if (dy > 120) {
                this.sidebar.classList.remove('active');
            }
            // Reset position inline style (transition handles snapping)
            this.sidebar.style.transform = '';
        });
    }

    showLoading(show) {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = show ? 'flex' : 'none';
        }
    }

    async startScanner() {
        const overlay = document.getElementById('qr-overlay');
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';

        this.video = document.getElementById("qr-video");
        this.canvas = document.getElementById("qr-canvas");
        this.canvasCtx = this.canvas.getContext("2d", { willReadFrequently: true });
        this.isScanning = true;
        this.isScanningLocked = false;

        console.log("[QR] Starting manual camera stream...");

        try {
            // Secure Context check & getUserMedia check
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("NotSupportedError");
            }

            // Request Camera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }
            });

            this.video.srcObject = stream;
            this.video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
            await this.video.play();

            console.log("[QR] Stream playing. Starting loop.");
            requestAnimationFrame(this.tick.bind(this));

        } catch (err) {
            console.error("[QR] Camera Error:", err);
            let msg = "カメラの起動に失敗しました。";
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                msg = "カメラのアクセス権限がありません。\nブラウザの設定を確認してください。";
            } else if (err.message === "NotSupportedError" || err.name === "TypeError") {
                msg = "この接続環境（HTTP接続など）またはブラウザでは、カメラ機能がサポートされていません。\nHTTPS接続でアクセスするか、ローカルホストでお試しください。";
            }
            alert(msg);
            this.stopScanner();
        }
    }

    tick() {
        if (!this.isScanning) return;
        if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) {
            // Wait for video
            requestAnimationFrame(this.tick.bind(this));
            return;
        }

        // Draw video (fill canvas)
        this.canvas.height = this.video.videoHeight;
        this.canvas.width = this.video.videoWidth;
        this.canvasCtx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

        // Scan frame
        // Optimization: Scan only the center region? 
        // jsQR is fast enough for 720p usually. Let's scan full frame for robustness.
        const imageData = this.canvasCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        // jsQR(data, width, height, options)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
            // Log immediately upon detection (for debugging)
            console.log("[QR RAW DETECT]:", code.data);

            if (!this.isScanningLocked) {
                console.log("[QR Success] Found:", code.data);
                this.isScanningLocked = true;

                // Draw a box? (Optional visual feedback)
                // this.drawBox(code.location);

                if (navigator.vibrate) navigator.vibrate(200);
                this.stopScanner();
                this.handleScanSuccess(code.data);
                return; // Stop loop
            }
        }

        requestAnimationFrame(this.tick.bind(this));
    }

    stopScanner() {
        this.isScanning = false;
        this.isScanningLocked = false;

        // Stop stream tracks
        if (this.video && this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }

        // UI
        const overlay = document.getElementById('qr-overlay');
        overlay.classList.add('hidden');
        overlay.style.display = 'none';

        console.log("[QR] Stopped.");
    }

    handleScanSuccess(url) {
        // UI is already closed by stopScanner() in onScanSuccess, 
        // but ensuring it here doesn't hurt.
        const overlay = document.getElementById('qr-overlay');
        if (!overlay.classList.contains('hidden')) {
            this.stopScanner();
        }

        try {
            let currentId = null;
            console.log("[QR] Processing:", url);

            // Parser 1: Standard URL param
            try {
                const dummyBase = "http://dummy.com";
                const urlObj = new URL(url, dummyBase);
                currentId = urlObj.searchParams.get('current');
            } catch (e) { /* ignore */ }

            // Parser 2: Raw ID (e.g. "1_101")
            // Regex: Digit + Underscore + Digit
            if (!currentId && /^\d+_\d+$/.test(url)) {
                currentId = url;
            }

            // Parser 3: Simple "current=..." string check
            if (!currentId && url.indexOf('current=') !== -1) {
                try {
                    currentId = url.split('current=')[1].split('&')[0];
                } catch (e) { }
            }

            if (currentId) {
                console.log("[QR] Found ID:", currentId);
                // Update Location
                // Check if node exists first
                const node = this.engine.getNode(currentId);
                if (node) {
                    if (node.type === 'entrance_only') {
                        this.showRestrictionWarning('entrance_only');
                    }
                    this.engine.setCurrentLocation(currentId);

                    // Update Start Select if exists
                    if (this.startSelect) {
                        const title = node.eventName || node.name || "現在地";
                        this.startSelect.select(currentId, title);
                        this.engine.setStartMarker(currentId);

                        // If we have an End point, recalculate route
                        if (this.endSelect && this.endSelect.value) {
                            this.engine.calculatePath(currentId, this.endSelect.value);
                            // Hide Mobile Overlay if showing route
                            const mobileOverlay = document.querySelector('.mobile-overlay');
                            if (mobileOverlay) mobileOverlay.classList.remove('hidden');
                        }
                    }
                } else {
                    console.warn("[QR] ID not found in map data:", currentId);
                    alert("QRコードの場所が見つかりません (ID: " + currentId + ")");
                }
            } else {
                console.warn("[QR] No ID found in content");
                alert("無効なQRコードです（位置情報が含まれていません）");
            }

        } catch (err) {
            console.error("[QR] Parse Error:", err);
            alert("QRコードの読み取りに失敗しました");
        }
    }

    showRestrictionWarning(type) {
        const modal = document.getElementById('restriction-warning-modal');
        const titleEl = document.getElementById('restriction-modal-title');
        const textEl = document.getElementById('restriction-modal-text');

        if (modal && titleEl && textEl) {
            if (type === 'entrance_only') {
                titleEl.innerText = "【注意】入口専用の地点です";
                textEl.innerHTML = `この地点は<strong>「入口専用」</strong>に指定されています。
                    <div class="restriction-modal-info-box">
                        <strong>■ なずな祭実行委員会からのお知らせ</strong><br>
                        國枝記念国際ホール等の施設では、安全確保と混雑緩和のため、入口と出口が<strong>一方通行</strong>に設定されています。<br><br>
                        現在、<strong>実際にこの場所（入口）にいなければ</strong>選択しないでください。
                    </div>`;
            } else if (type === 'exit_only') {
                titleEl.innerText = "【注意】出口専用の地点です";
                textEl.innerHTML = `この地点は<strong>「出口専用」</strong>に指定されています。
                    <div class="restriction-modal-info-box">
                        <strong>■ なずな祭実行委員会からのお知らせ</strong><br>
                        國枝記念国際ホール等の施設では、安全確保と混雑緩和のため、入口と出口が<strong>一方通行</strong>に設定されています。<br><br>
                        現在、<strong>実際にこの場所（出口）にいなければ</strong>選択しないでください。
                    </div>`;
            }
            modal.classList.remove('hidden');
        }
    }
}

// Custom Select Component
class CustomSelect {
    constructor(id, onChange) {
        this.container = document.getElementById(id);
        if (!this.container) return;

        this.trigger = this.container.querySelector('.select-trigger');
        this.optionsContainer = this.container.querySelector('.select-options');
        this.textSpan = this.container.querySelector('.selection-text');
        this.onChange = onChange;
        this.value = null;
        this.options = [];

        // State
        this.sortBy = 'default'; // 'default' | 'floor' | 'name'
        this.filterText = '';

        this.trigger.addEventListener('click', () => this.toggle());

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) this.close();
        });

        // Init header elements (create once to attach events, but we render inside render() loop usually? 
        // actually easier to render header in render() to make it sticky relative to scrolling content if it's all in one box)
        // Check css: .select-options is the scroll box. So header must be inside it and sticky.
    }

    setOptions(data) {
        this.options = data;
        this.render();
    }

    render() {
        if (!this.optionsContainer) return;
        this.optionsContainer.innerHTML = '';

        // 1. Render Header (Sticky)
        const header = document.createElement('div');
        header.className = 'select-search-header';
        header.onclick = (e) => e.stopPropagation(); // Prevent closing when clicking header

        // Search Input
        const input = document.createElement('input');
        input.type = 'text';
        input.name = 'search_' + this.container.id; // Unique Name
        input.id = 'search-input-' + this.container.id; // Unique ID
        input.setAttribute('aria-label', '検索'); // Label for accessibility
        input.className = 'select-search-input';
        input.placeholder = '検索...';
        input.value = this.filterText;
        input.oninput = (e) => {
            this.filterText = e.target.value.toLowerCase();
            this.renderList(); // Re-render only list ideally, but for now full render is safer? No, focus is lost.
            // We need to separate renderList logic to keep input focus intact.
        };

        // Sort Button
        const sortBtn = document.createElement('button');
        sortBtn.className = 'select-sort-btn';
        const getLabel = (mode) => {
            if (mode === 'floor') return '順序: 階数';
            if (mode === 'name') return '順序: 名前';
            return '順序: 標準'; // default
        };
        sortBtn.innerText = getLabel(this.sortBy);

        sortBtn.onclick = () => {
            if (this.sortBy === 'default') this.sortBy = 'floor';
            else if (this.sortBy === 'floor') this.sortBy = 'name';
            else this.sortBy = 'default';

            sortBtn.innerText = getLabel(this.sortBy);
            this.renderList();
        };

        header.appendChild(input);
        header.appendChild(sortBtn);
        this.optionsContainer.appendChild(header);

        // 2. Container for items
        this.listContainer = document.createElement('div');
        this.optionsContainer.appendChild(this.listContainer);

        this.renderList();

        // Restore focus if needed? (Complex if we re-render input)
        // With current structure, 'render()' is called on setOptions.
        // On input, we should NOT call render(), only update list.
        this._inputEl = input; // Keep ref
        input.focus();
    }

    renderList() {
        if (!this.listContainer) return;
        this.listContainer.innerHTML = '';

        // Filter
        let displayOptions = this.options.filter(opt => {
            if (!this.filterText) return true;
            const term = this.filterText;
            return opt.title.toLowerCase().includes(term) ||
                (opt.org && opt.org.toLowerCase().includes(term));
        });

        // Sort
        // Priority: Auto > Floor > Type > Name
        const typeOrder = { 'room': 1, 'area': 2, 'entrance': 3, 'toilet': 4, 'stairs': 5, 'elevator': 6, 'vending': 7 };

        displayOptions.sort((a, b) => {
            // 0. System Auto Priority
            const isAutoA = a.category === 'AUTO';
            const isAutoB = b.category === 'AUTO';
            if (isAutoA && !isAutoB) return -1;
            if (!isAutoA && isAutoB) return 1;

            if (this.sortBy === 'default') {
                // Priority from JSON
                const pA = a.sortIndex !== undefined ? a.sortIndex : 9999;
                const pB = b.sortIndex !== undefined ? b.sortIndex : 9999;

                // Debug: Log first few comparisons
                if (Math.random() < 0.01) { // Log ~1% to avoid spam
                    // console.log(`[Sort] Comparing: "${a.title}" (${pA}) vs "${b.title}" (${pB})`);
                }

                if (pA !== pB) return pA - pB;

                // Removed Type Priority for Default Mode as per user request
                // "Sort everything by exhibition group (1-1 etc)"
                // const tA = typeOrder[a.type] || 99;
                // const tB = typeOrder[b.type] || 99;
                // if (tA !== tB) return tA - tB;

                // Sort by the stable 'sortKey' (Org or Name), ignoring the display title (Event Name)
                return a.sortKey.localeCompare(b.sortKey, 'ja', { numeric: true });
            }
            else if (this.sortBy === 'floor') {
                // 1. Floor
                if (a.floor !== b.floor) return a.floor - b.floor;

                // 2. Type Priority
                const tA = typeOrder[a.type] || 99;
                const tB = typeOrder[b.type] || 99;
                if (tA !== tB) return tA - tB;

                // 3. Name (Natural)
                return a.title.localeCompare(b.title, 'ja', { numeric: true });
            } else {
                return a.title.localeCompare(b.title, 'ja', { numeric: true });
            }
        });

        if (displayOptions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'select-option';
            empty.style.color = '#999';
            empty.innerText = '該当なし';
            this.listContainer.appendChild(empty);
            return;
        }

        let lastFloor = null;
        let lastType = null;
        let hasShownAutoHeader = false;

        displayOptions.forEach(opt => {
            const isAuto = opt.category === 'AUTO';

            // Group Header (For Floor and Default modes)
            if (this.sortBy === 'floor' || this.sortBy === 'default') {
                // Auto Header (Once)
                if (isAuto && !hasShownAutoHeader) {
                    hasShownAutoHeader = true;
                    lastFloor = 'AUTO';
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'select-group-header';
                    groupHeader.innerText = "自動検索";
                    this.listContainer.appendChild(groupHeader);
                }

                // Floor Header (Only for 'floor' mode)
                else if (this.sortBy === 'floor' && !isAuto && opt.floor !== lastFloor) {
                    lastFloor = opt.floor;
                    lastType = null; // Reset type for new floor

                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'select-group-header';
                    groupHeader.innerText = `${opt.floor}階`;
                    this.listContainer.appendChild(groupHeader);
                }

                // Sub Header: Type (Skip for Auto)
                if (!isAuto && opt.type !== lastType) {
                    lastType = opt.type;
                    const typeLabel = {
                        'room': '教室', 'area': '施設・エリア', 'entrance': '出入口',
                        'toilet': 'トイレ', 'stairs': '階段', 'elevator': 'エレベーター',
                        'vending': '自販機'
                    }[opt.type] || 'その他';

                    const subHeader = document.createElement('div');
                    subHeader.className = 'select-subgroup-header';
                    subHeader.innerText = typeLabel;
                    this.listContainer.appendChild(subHeader);
                }
            }

            const el = document.createElement('div');
            el.className = 'select-option';
            if (opt.value === this.value) el.classList.add('selected');
            el.dataset.value = opt.value;

            const typeClass = opt.category === 'AUTO' ? 'tag-auto' : ('tag-' + (opt.type || 'others'));

            el.innerHTML = `
                <div class="option-main">
                    <span class="option-title">${opt.title}</span>
                    <span class="option-org">${opt.org || ''}</span>
                </div>
                <div class="option-meta">
                    <span class="option-tag ${typeClass}">${opt.category}</span>
                </div>
            `;

            el.addEventListener('click', () => {
                this.select(opt.value, opt.title);
            });

            this.listContainer.appendChild(el);
        });
    }

    toggle() {
        const isOpen = this.optionsContainer.classList.contains('open');
        if (!isOpen) {
            this.optionsContainer.classList.add('open');
            this.trigger.classList.add('active');
            // Reset filter on open? Maybe nice.
            // this.filterText = ''; 
            // this.render(); // Ensure fresh render

            // Wait for display block to focus?
            setTimeout(() => {
                if (this._inputEl) this._inputEl.focus();
            }, 50);
        } else {
            this.close();
        }
    }

    close() {
        this.optionsContainer.classList.remove('open');
        this.trigger.classList.remove('active');
    }

    select(value, label) {
        this.value = value;
        this.textSpan.innerText = label;
        this.close();
        // Update visual selection without re-rendering everything
        if (this.listContainer) {
            Array.from(this.listContainer.children).forEach(child => {
                if (child.dataset.value == value) child.classList.add('selected');
                else child.classList.remove('selected');
            });
        }
        if (this.onChange) this.onChange(value);
    }

    get value() { return this._value; }
    set value(v) { this._value = v; }
}
