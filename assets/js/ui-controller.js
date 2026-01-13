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
        this.mobileMenuBtn = document.getElementById('mobile-menu-btn');
        this.sidebarCloseBtn = document.getElementById('sidebar-close-btn');
        this.routeList = document.getElementById('route-list');
        this.mobileOverlay = document.getElementById('mobile-route-overlay');
        this.mobileRouteContent = document.getElementById('mobile-route-content');
        this.overlayToggleBtn = document.getElementById('overlay-toggle-btn');

        // Mobile Overlay Toggle & Drag
        if (this.overlayToggleBtn && this.mobileOverlay) {
            this.initDraggableOverlay();
        }

        this.init();
    }

    async init() {
        // Mobile Event Listeners
        if (this.mobileMenuBtn) {
            this.mobileMenuBtn.addEventListener('click', () => {
                this.sidebar.classList.add('active');
            });
        }
        if (this.sidebarCloseBtn) {
            this.sidebarCloseBtn.addEventListener('click', () => {
                this.sidebar.classList.remove('active');
            });
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
                if (val && !this.endSelect.value) {
                    this.engine.focusNode(val);
                    this.engine.setStartMarker(val);
                }
                this.calculateRoute();
            });
            this.endSelect = new CustomSelect('custom-end-select', (val) => {
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
        const zoomIn = document.getElementById('zoom-in');
        if (zoomIn) zoomIn.addEventListener('click', () => this.engine.zoomIn());

        const zoomOut = document.getElementById('zoom-out');
        if (zoomOut) zoomOut.addEventListener('click', () => this.engine.zoomOut());

        // Accessibility Toggle
        const accessToggle = document.getElementById('accessibility-toggle');
        if (accessToggle) {
            accessToggle.addEventListener('change', (e) => {
                this.engine.setAccessibilityMode(e.target.checked);
                // Re-calculate if route is active
                if (this.startSelect.value && this.endSelect.value) {
                    this.calculateRoute();
                }
            });
        }

        // Fit Map Button
        const fitMapBtn = document.getElementById('fit-map');
        if (fitMapBtn) fitMapBtn.addEventListener('click', () => this.engine.fitToScreen());

        // Initial Layout Check
        if (window.innerWidth <= 768) {
            // Mobile init
        }
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
        this.engine.switchFloor(floorId);
    }

    updateSelects() {
        // Debug: Check if orderData is available
        console.log('[updateSelects] orderData:', this.engine.orderData);

        // Populate Custom Selects
        const nodes = this.engine.globalNodes
            .filter(n => n.name && n.type !== 'junction')
            .sort((a, b) => {
                // Sort by Floor first, then Name (Natural Sort)
                if (a.floorId !== b.floorId) return a.floorId - b.floorId;
                return a.name.localeCompare(b.name, 'ja', { numeric: true });
            });

        const options = nodes.map(n => {
            let title = n.eventName || n.name;
            // Append Floor to Stairs/Elevator for clarity (requested by user)
            if (n.type === 'stairs' || n.type === 'elevator') {
                title += ` (${n.floorId}階)`;
            }

            return {
                value: n.id,
                title: title,
                org: n.organization || (n.eventName ? '展示団体：' + n.name : ''), // Secondary text
                category: this.getTypeLabel(n.type),
                type: n.type,
                floor: n.floorId,
                // Assign Custom Priority (Exact Match)
                sortIndex: (() => {
                    if (!this.engine.orderData) return 9999;

                    // Use Name or EventName (Trimmed)
                    const name = (n.eventName || n.name || '').trim();

                    let minPriority = this.engine.orderData.default || 9999;

                    // Check all keys in orderData.items via Partial Match
                    if (this.engine.orderData.items) {
                        for (const [key, priority] of Object.entries(this.engine.orderData.items)) {
                            // If the Node Name includes the Key (e.g. "Main Entrance" includes "Entrance")
                            if (name.includes(key)) {
                                // console.log(`[Order] Match: "${name}" includes "${key}" -> ${priority}`);
                                if (priority < minPriority) minPriority = priority;
                            }
                        }
                    }
                    return minPriority;
                })()
            };
        });

        // System Options
        const systemOptions = [
            { value: "NEAREST_MALE", title: "最寄りの男子トイレ", org: "System Auto", category: "AUTO", type: 'toilet' },
            { value: "NEAREST_FEMALE", title: "最寄りの女子トイレ", org: "System Auto", category: "AUTO", type: 'toilet' },
            { value: "NEAREST_VENDING", title: "最寄りの自販機", org: "System Auto", category: "AUTO", type: 'vending' }
        ];

        this.startSelect.setOptions(options);
        this.endSelect.setOptions([...options, ...systemOptions]);
    }

    getTypeLabel(type) {
        const map = {
            'room': '教室', 'toilet': 'トイレ', 'stairs': '階段', 'elevator': 'EV',
            'entrance': '入口', 'vending': '自販機', 'area': 'エリア'
        };
        return map[type] || 'Others';
    }

    calculateRoute() {
        const startVal = this.startSelect.value;
        const endVal = this.endSelect.value;

        if (!startVal || !endVal) {
            // Hide mobile overlay if route is cleared
            if (this.mobileOverlay) this.mobileOverlay.classList.add('hidden');
            return;
        }

        const path = this.engine.calculatePath(startVal, endVal);

        // Auto-zoom to fit the entire path
        if (path && path.length > 0) {
            this.engine.fitToPath(path);

            // ... (keep mobile logic)

            // Mobile: Close Sidebar & Show Overlay
            if (window.innerWidth <= 768 && this.sidebar) {
                this.sidebar.classList.remove('active');
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
                                    this.engine.panToNode(node);
                                    this.engine.highlightNode(node);
                                    // Make sure overlay is collapsed so user can see map? 
                                    // User said "show clear UI to re-open".
                                    // Maybe just keep it open? Or let user decide.
                                    // Current visual implies it stays open unless user collapses.
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
            if (this.mobileOverlay) this.mobileOverlay.classList.add('hidden');
        }
    }

    updateRouteList(pathIds) {
        this.routeList.innerHTML = '';
        if (!pathIds || pathIds.length === 0) {
            this.routeList.innerHTML = '<div style="padding:20px; text-align:center; color:#95a5a6; font-size:14px;">出発地と目的地を選択してナビを開始</div>';
            return;
        }

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
            li.onclick = () => {
                this.engine.panToNode(node);
                this.engine.highlightNode(node);
            };

            let title = node.eventName || node.name;
            if (!title && isTransfer) title = "フロア移動";

            let desc = `${node.floorId}階`;
            if (node.organization) desc += ` - ${node.organization}`;

            if (isTransfer) {
                if (prevNode && prevNode.floorId !== node.floorId) title = `${node.floorId}階に到着`;
                else if (nextNode && nextNode.floorId !== node.floorId) title = `${nextNode.floorId}階へ移動`;
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

            const rect = this.mobileOverlay.getBoundingClientRect();
            // We need to work with computed values if style is not set, but rect is safer
            initialLeft = rect.left;
            initialTop = rect.top;

            // Disable transition during drag
            this.mobileOverlay.style.transition = 'none';
            this.mobileOverlay.style.right = 'auto'; // Clear right to allow left positioning

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

            this.mobileOverlay.style.left = `${initialLeft + dx}px`;
            this.mobileOverlay.style.top = `${initialTop + dy}px`;
        };

        const onEnd = (e) => {
            if (!isDragging) return;
            isDragging = false;

            // Re-enable height transition
            this.mobileOverlay.style.transition = 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchend', onEnd);

            if (!hasMoved) {
                // Treated as Click -> Toggle Collapse
                this.mobileOverlay.classList.toggle('collapsed');
            }
        };

        header.addEventListener('mousedown', onStart);
        header.addEventListener('touchstart', onStart, { passive: false });
    }

    showLoading(show) {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = show ? 'flex' : 'none';
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
                    console.log(`[Sort] Comparing: "${a.title}" (${pA}) vs "${b.title}" (${pB})`);
                }

                if (pA !== pB) return pA - pB;

                // Fallback: Type > Name (Floor ignored for grouping)
                const tA = typeOrder[a.type] || 99;
                const tB = typeOrder[b.type] || 99;
                if (tA !== tB) return tA - tB;

                return a.title.localeCompare(b.title, 'ja', { numeric: true });
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
