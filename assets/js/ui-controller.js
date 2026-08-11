// 来場者向け表示フォーマット: 団体名「企画名」(団体名が空なら「企画名」のみ)
function formatExhibitLabel(exhibit) {
    if (!exhibit) return '';
    const org = (exhibit.organization || '').trim();
    const name = (exhibit.eventName || '').trim();
    if (!name) return org;
    return org ? `${org}「${name}」` : `「${name}」`;
}

// 検索文字列の正規化 (全角/半角・大文字/小文字・前後の空白の揺れを吸収する)
function normalizeSearchText(str) {
    if (!str) return '';
    return str.toString().trim().toLowerCase().normalize('NFKC');
}

// HTMLエスケープ: DB由来(展示名・団体名・部屋名等)やURLパラメータ由来の文字列を
// innerHTMLへ挿入する前に必ず通し、XSSを防止する。
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

// 一覧の並び順で使う種別の優先度 (小さいほど上)
const OPTION_TYPE_ORDER = {
    'room': 1, 'area': 2, 'entrance': 3, 'toilet': 4, 'stairs': 5, 'elevator': 6, 'vending': 7
};

const OPTION_TYPE_LABEL = {
    'room': '教室', 'area': '施設・エリア', 'entrance': '出入口',
    'toilet': 'トイレ', 'stairs': '階段', 'elevator': 'エレベーター',
    'vending': '自販機'
};

/**
 * 並び替えボタンの表示ラベル。デスクトップ(CustomSelect)とスマホ(MobileSearchPanel)で
 * 表記が食い違わないよう共通化している。
 * @param {'default'|'floor'|'name'} mode
 */
function getSortModeLabel(mode) {
    if (mode === 'floor') return '順序: 階数';
    if (mode === 'name') return '順序: 名前';
    return '順序: 標準';
}

/**
 * 検索候補が何階にあるかを示すチップ(種別タグの左隣に置く)。
 * 自動検索(最寄り〜)など階数を持たない候補では表示しない。
 * デスクトップ(CustomSelect)とスマホ(MobileSearchPanel)で共通利用。
 */
function buildFloorTagHtml(opt) {
    if (opt.floor === undefined || opt.floor === null) return '';
    return `<span class="option-tag tag-floor">${escapeHtml(String(opt.floor))}F</span>`;
}

// 建物ごとの識別カラー(検索結果アイコンの色分けに使用)
const BUILDING_COLORS = {
    '北館': '#378d44',
    '本館': '#a22bdf',
    '南館': '#b8ba42',
    'アリーナ': '#4ec023',
    '国際ホール': '#693d75' // 國枝記念国際ホール
};

/**
 * ノードがどの建物に属するかを判定する。ロケーションID(code)の接頭辞を最優先とし、
 * それが無い場合は connectionId/名称/展示名のキーワード、最後に座標(x/y)へフォールバックする。
 * editor.html の getBuildingName() とロジックを揃えている(判定基準がズレると色分けの意味がなくなるため)。
 */
function getBuildingName(node) {
    if (!node) return '本館';

    if (node.code && node.code.trim() !== '') {
        const cleanCode = node.code.trim().toUpperCase();
        if (cleanCode.startsWith('KH') || cleanCode.startsWith('STKH') || cleanCode.startsWith('EKH')) return '国際ホール';
        if (cleanCode.startsWith('KA') || cleanCode.startsWith('STKA') || cleanCode.startsWith('EKA')) return 'アリーナ';
        if (cleanCode.startsWith('STN') || cleanCode.startsWith('EN') || cleanCode.startsWith('N')) return '北館';
        if (cleanCode.startsWith('STS') || cleanCode.startsWith('ES') || cleanCode.startsWith('S')) return '南館';
        if (cleanCode.startsWith('STM') || cleanCode.startsWith('EM') || cleanCode.startsWith('M')) return '本館';
        if (cleanCode.startsWith('U')) return '施設外';
    }

    const text = ((node.connectionId || '') + ' ' + (node.name || '') + ' ' + (node.exhibits || []).map(e => e.eventName || '').join(' ')).toLowerCase();
    if (text.includes('kh') || text.includes('國枝') || text.includes('国際')) return '国際ホール';
    if (text.includes('ka') || text.includes('古賀') || text.includes('アリーナ') || text.includes('剣道') || text.includes('柔道') || text.includes('卓球')) return 'アリーナ';
    if (text.includes('north') || text.includes('北館') || text.includes('_n')) return '北館';
    if (text.includes('south') || text.includes('南館') || text.includes('_s')) return '南館';
    if (text.includes('main') || text.includes('本館') || text.includes('_m') || text.includes('吹き抜け') || text.includes('事務室') || text.includes('正面玄関') || text.includes('購買') || text.includes('ラウンジ')) return '本館';
    if (text.includes('施設外') || text.includes('outdoor') || text.includes('キッチンカー')) return '施設外';

    if (node.x !== undefined && node.y !== undefined) {
        if (node.x < 500) return 'アリーナ';
        if (node.x > 850 && node.y > 350) return '本館';
        if (node.y > 450) return '北館';
        if (node.y < 350) return '南館';
    }

    return '本館';
}

// 建物色に応じた検索結果アイコンの style 属性(未知の建物は既定色のまま)
function buildBuildingIconStyle(opt) {
    const color = BUILDING_COLORS[opt.building];
    if (!color) return '';
    return ` style="background:${color}22; color:${color};"`;
}

// ==========================================================================
// 展示企画 横断検索API (なずな祭サイト連携) による絞り込み機能
// マップ側は「条件に一致するロケーションIDの集合」を得るためだけに使う。
// 企画の詳細(name/description/image等)はこの機能では扱わない。
// ==========================================================================

const EXHIBIT_FILTER_FIELDS = ['category', 'genre', 'building', 'floor', 'grade'];

const EXHIBIT_FILTER_OPTIONS = {
    category: [
        { value: '', label: 'すべて' },
        { value: 'class', label: 'クラス企画' },
        { value: 'club', label: '部活動・委員会' },
        { value: 'volunteer', label: '有志企画' }
    ],
    genre: [
        { value: '', label: 'すべて' },
        { value: 'haunted_house', label: 'お化け屋敷' },
        { value: 'escape_game', label: '脱出ゲーム' },
        { value: 'mission_game', label: 'ミッションゲーム' },
        { value: 'riddle', label: '謎解き・クイズ' },
        { value: 'competitive_game', label: '対戦ゲーム' },
        { value: 'cafe', label: '喫茶展示' },
        { value: 'theater_festival', label: '中3演劇祭' },
        { value: 'fair_casino', label: '縁日・カジノ' },
        { value: 'performance', label: '公演' },
        { value: 'club_committee', label: '部活・有志・委員会' },
        { value: 'other', label: 'その他' },
    ],
    building: [
        { value: '', label: 'すべて' },
        { value: 'main', label: '本館' },
        { value: 'north', label: '北館' },
        { value: 'south', label: '南館' },
        { value: 'kunieda', label: '國枝記念国際ホール' },
        { value: 'koga', label: '古賀記念アリーナ' }
    ],
    floor: [
        { value: '', label: 'すべて' },
        { value: '1f', label: '1階' },
        { value: '2f', label: '2階' },
        { value: '3f', label: '3階' },
        { value: '4f', label: '4階' }
    ],
    grade: [
        { value: '', label: 'すべて' },
        { value: '1', label: '1年' },
        { value: '2', label: '2年' },
        { value: '3', label: '3年' },
        { value: '4', label: '4年' },
        { value: '5', label: '5年' },
        { value: '6', label: '6年' },
        { value: 'none', label: '部活・有志など' }
    ]
};

const EXHIBIT_FILTER_FIELD_LABEL = {
    category: 'カテゴリ', genre: 'ジャンル', building: '建物', floor: '階', grade: '学年'
};

const _exhibitSearchCache = new Map();
const EXHIBIT_SEARCH_CACHE_TTL_MS = 90 * 1000; // API推奨(60〜120秒)の範囲内でキャッシュ

/**
 * なずな祭サイトの展示横断検索API (search_exhibits) を呼び、条件に一致する
 * ロケーションID(room_code、正規化済み)の集合を返す。
 * 同一条件の組み合わせは EXHIBIT_SEARCH_CACHE_TTL_MS の間キャッシュする。
 * 通信失敗・タイムアウト時は null を返す(=「絞り込み結果0件」と区別する)。
 */
async function fetchExhibitLocationCodes(filters) {
    const apiConf = AppConfig.EXHIBIT_SEARCH_API;
    if (!apiConf || !apiConf.SUPABASE_URL || !apiConf.SUPABASE_ANON_KEY) return null;

    const params = new URLSearchParams();
    EXHIBIT_FILTER_FIELDS.forEach(field => {
        const value = filters && filters[field];
        if (value) params.set(`p_${field}`, value);
    });
    params.set('p_limit', '200');

    const cacheKey = params.toString();
    const cached = _exhibitSearchCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < EXHIBIT_SEARCH_CACHE_TTL_MS) {
        return cached.codes;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const url = `${apiConf.SUPABASE_URL}/rest/v1/rpc/search_exhibits?${params.toString()}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { apikey: apiConf.SUPABASE_ANON_KEY },
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const rows = await res.json();
        const codes = new Set(
            (Array.isArray(rows) ? rows : [])
                .map(row => normalizeLocationCode(row.room_code))
                .filter(Boolean)
        );
        _exhibitSearchCache.set(cacheKey, { ts: Date.now(), codes });
        return codes;
    } catch (e) {
        console.warn('[fetchExhibitLocationCodes] failed', e);
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 展示企画の条件(カテゴリ/ジャンル/建物/階/学年)による絞り込みトグルボタン+開閉パネル。
 * デスクトップ(CustomSelect)・スマホ(MobileSearchPanel)の両方で、既存の「並び順」ボタンの
 * 左隣に設置して共通利用する。DOM要素(toggleBtn/panelEl)は一度だけ生成し、
 * 呼び出し側が再描画のたびに好きな場所へ差し込み直せるようにしている(状態はこのインスタンスが保持)。
 */
class ExhibitFilterPanel {
    /**
     * @param {(codes: Set<string>|null) => void} onApply 絞り込み確定/解除のたびに呼ばれる
     * @param {string} hostButtonClass トグルボタンに追加するクラス(隣接する並び順ボタンと見た目を揃える)
     */
    constructor(onApply, hostButtonClass) {
        this.onApply = onApply;
        this.filters = { category: '', genre: '', building: '', floor: '', grade: '' };
        this.isOpen = false;

        this.toggleBtn = document.createElement('button');
        this.toggleBtn.type = 'button';
        this.toggleBtn.className = `exhibit-filter-btn ${hostButtonClass || ''}`.trim();
        this.toggleBtn.addEventListener('click', () => this.toggle());

        this.panelEl = document.createElement('div');
        this.panelEl.className = 'exhibit-filter-panel';

        this._buildPanelContent();
        this._refreshToggleButton();
    }

    _activeCount() {
        return EXHIBIT_FILTER_FIELDS.filter(f => this.filters[f]).length;
    }

    _buildPanelContent() {
        const fieldHtml = EXHIBIT_FILTER_FIELDS.map(field => {
            const opts = EXHIBIT_FILTER_OPTIONS[field]
                .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
                .join('');
            return `
                <label class="exhibit-filter-field">
                    <span class="exhibit-filter-field-label">${escapeHtml(EXHIBIT_FILTER_FIELD_LABEL[field])}</span>
                    <select data-field="${field}">${opts}</select>
                </label>
            `;
        }).join('');

        this.panelEl.innerHTML = `
            <div class="exhibit-filter-panel-inner">
                <div class="exhibit-filter-row">${fieldHtml}</div>
                <div class="exhibit-filter-status" data-role="status"></div>
                <div class="exhibit-filter-actions">
                    <button type="button" class="exhibit-filter-reset" data-role="reset">条件をリセット</button>
                    <button type="button" class="exhibit-filter-apply" data-role="apply">この条件で絞り込む</button>
                </div>
            </div>
        `;

        this.statusEl = this.panelEl.querySelector('[data-role="status"]');
        this.applyBtn = this.panelEl.querySelector('[data-role="apply"]');
        this.buildingSelect = this.panelEl.querySelector('select[data-field="building"]');
        this.floorSelect = this.panelEl.querySelector('select[data-field="floor"]');

        EXHIBIT_FILTER_FIELDS.forEach(field => {
            const sel = this.panelEl.querySelector(`select[data-field="${field}"]`);
            sel.addEventListener('change', (e) => {
                this.filters[field] = e.target.value;
                if (field === 'building') this._syncFloorAvailability();
            });
        });

        this.panelEl.querySelector('[data-role="reset"]').addEventListener('click', () => this.reset());
        this.applyBtn.addEventListener('click', () => this.apply());
    }

    // 古賀記念アリーナ(koga)・國枝記念国際ホール(kunieda)は階の概念が無いため、
    // これらが選ばれている間は階フィルターを選べないようにする(なずな祭サイト側の
    // SearchFilter.tsx と同じ挙動)。
    _syncFloorAvailability() {
        if (!this.buildingSelect || !this.floorSelect) return;
        const isFloorless = this.buildingSelect.value === 'kunieda' || this.buildingSelect.value === 'koga';

        this.floorSelect.disabled = isFloorless;
        if (isFloorless && this.floorSelect.value !== '') {
            this.floorSelect.value = '';
            this.filters.floor = '';
        }
    }

    _refreshToggleButton() {
        const count = this._activeCount();
        const icon = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>`;
        this.toggleBtn.innerHTML = `${icon}<span>絞り込み</span>${count > 0 ? `<span class="exhibit-filter-count">${count}</span>` : ''}`;
        this.toggleBtn.classList.toggle('has-active-filter', count > 0);
    }

    // 通常のステータス文言を表示する(スピナーは消す)
    _setStatus(text) {
        this.statusEl.classList.remove('is-loading');
        this.statusEl.textContent = text;
    }

    // 検索中はスピナー付きの表示に切り替える
    _setStatusLoading(text) {
        this.statusEl.classList.add('is-loading');
        this.statusEl.innerHTML = `
            <svg class="exhibit-filter-spinner" viewBox="0 0 24 24" width="14" height="14" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="42" stroke-dashoffset="16"/>
            </svg>
            <span>${escapeHtml(text)}</span>
        `;
    }

    toggle() {
        if (this.isOpen) this.close();
        else this.open();
    }

    open() {
        this.isOpen = true;
        this.panelEl.classList.add('open');
        this.toggleBtn.classList.add('is-open');
    }

    close() {
        this.isOpen = false;
        this.panelEl.classList.remove('open');
        this.toggleBtn.classList.remove('is-open');
    }

    reset() {
        this.filters = { category: '', genre: '', building: '', floor: '', grade: '' };
        EXHIBIT_FILTER_FIELDS.forEach(field => {
            const sel = this.panelEl.querySelector(`select[data-field="${field}"]`);
            if (sel) sel.value = '';
        });
        this._syncFloorAvailability();
        this._setStatus('');
        this._refreshToggleButton();
        if (this.onApply) this.onApply(null);
    }

    async apply() {
        if (this._activeCount() === 0) {
            this._setStatus('');
            this._refreshToggleButton();
            if (this.onApply) this.onApply(null);
            return;
        }

        this._setStatusLoading('検索中...');
        this.applyBtn.disabled = true;
        this.toggleBtn.classList.add('is-loading');

        const codes = await fetchExhibitLocationCodes(this.filters);

        this.applyBtn.disabled = false;
        this.toggleBtn.classList.remove('is-loading');

        if (codes === null) {
            this._setStatus('絞り込みに失敗しました。通信環境をご確認のうえ、もう一度お試しください。');
            return;
        }

        this._setStatus(codes.size > 0
            ? `${codes.size}件のロケーションが該当しました`
            : '該当するロケーションが見つかりませんでした');
        this._refreshToggleButton();
        if (this.onApply) this.onApply(codes);
    }
}

// ロケーションID(room_code)の比較用正規化。展示検索APIの room_code とローカルの opt.code を
// 大文字/前後空白の揺れなく突き合わせるために使う。
function normalizeLocationCode(code) {
    return (code || '').toString().trim().toUpperCase();
}

/**
 * 検索候補の絞り込みと並べ替え。デスクトップのドロップダウン(CustomSelect)と
 * スマホの検索パネル(MobileSearchPanel)で完全に同じ結果になるよう共通化している。
 *
 * @param {Array} options  候補一覧
 * @param {string} filterText  正規化済みの検索文字列 (normalizeSearchText を通した値)
 * @param {'default'|'floor'|'name'} sortBy
 * @param {Set<string>|null} [allowedCodes]  展示企画の絞り込みパネルで条件が指定されている場合、
 *   一致したロケーションID(正規化済み)の集合。null/undefined なら絞り込みなし。
 */
function filterAndSortOptions(options, filterText, sortBy, allowedCodes) {
    // 全角/半角を正規化し、ロケーションIDも対象に含める。
    // スペース区切りで複数キーワードを入力した場合はすべてを満たすものに絞り込む(AND検索)。
    const terms = filterText ? filterText.split(/\s+/).filter(Boolean) : [];
    const result = options.filter(opt => {
        if (allowedCodes && !allowedCodes.has(normalizeLocationCode(opt.code))) return false;
        if (terms.length === 0) return true;
        const haystack = normalizeSearchText(`${opt.title} ${opt.org || ''} ${opt.code || ''}`);
        return terms.every(term => haystack.includes(term));
    });

    result.sort((a, b) => {
        // 0. System Auto Priority
        const isAutoA = a.category === 'AUTO';
        const isAutoB = b.category === 'AUTO';
        if (isAutoA && !isAutoB) return -1;
        if (!isAutoA && isAutoB) return 1;

        if (sortBy === 'default') {
            // Priority from JSON
            const pA = a.sortIndex !== undefined ? a.sortIndex : 9999;
            const pB = b.sortIndex !== undefined ? b.sortIndex : 9999;

            // 1. sortIndex の数値を直接比較する。管理画面の優先順位パターンは
            //    default(9999)より小さい値で「前の方に出す」設定にも、大きい値で
            //    「通常項目より後ろだが指定した順番で並べる」設定にも使われるため、
            //    数値そのものを比較すればどちらの設定意図も正しく反映できる。
            if (pA !== pB) return pA - pB;

            // 2. sortIndex が完全に同値(主に無設定同士が default 値で並ぶ場合)の時だけ、
            //    種別(部屋→エリア→出入口→…)でグループ化してから名前順に並べる。
            const tA = OPTION_TYPE_ORDER[a.type] || 99;
            const tB = OPTION_TYPE_ORDER[b.type] || 99;
            if (tA !== tB) return tA - tB;

            // 3. Sort by the stable 'sortKey' (Org or Name)
            return a.sortKey.localeCompare(b.sortKey, 'ja', { numeric: true });
        }

        if (sortBy === 'floor') {
            if (a.floor !== b.floor) return a.floor - b.floor;
            const tA = OPTION_TYPE_ORDER[a.type] || 99;
            const tB = OPTION_TYPE_ORDER[b.type] || 99;
            if (tA !== tB) return tA - tB;
            return a.title.localeCompare(b.title, 'ja', { numeric: true });
        }

        return a.title.localeCompare(b.title, 'ja', { numeric: true });
    });

    return result;
}

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
        // select(null, ...) は onChange 経由で calculateRoute() を呼ぶが、その中の
        // モバイル自動遷移ロジック(出発地/目的地どちらかだけ空いたら該当シートを
        // 自動で開く)が、クリア処理の途中(片方だけ消えた瞬間)に誤って発火して
        // しまわないようにガードする。
        this._isClearingRoute = true;
        if (this.startSelect) this.startSelect.select(null, "出発地を選択...");
        if (this.endSelect) this.endSelect.select(null, "目的地を選択...");
        this._isClearingRoute = false;

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

        // 検索パネルが開いたままなら入力欄も空に戻す
        if (this.mobileSearchPanel) this.mobileSearchPanel.syncFields();
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
                this.openMobileSearchEntry();
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
                    // 経路編集: 既に両方埋まっているので、変更頻度の高い目的地から開く
                    this.openMobileSearchEntry('end');
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
                    const nodeId = this.parseSelectValue(val).nodeId;
                    const node = this.engine.getNode(nodeId);
                    if (node && node.type === 'entrance_only') {
                        this.showRestrictionWarning('entrance_only');
                    }
                    if (!this.endSelect.value) {
                        this.engine.focusNode(nodeId);
                        this.engine.setStartMarker(nodeId);
                    }
                } else {
                    if (!this.endSelect.value) {
                        this.engine.setStartMarker(null);
                    }
                }
                this.calculateRoute();
            });
            this.endSelect = new CustomSelect('custom-end-select', (val) => {
                if (val) {
                    const nodeId = this.parseSelectValue(val).nodeId;
                    const node = this.engine.getNode(nodeId);
                    if (node && node.type === 'exit_only') {
                        this.showRestrictionWarning('exit_only');
                    }
                    if (!this.startSelect.value && !val.startsWith('NEAREST_')) {
                        this.engine.focusNode(nodeId);
                        this.engine.setEndMarker(nodeId);
                    }
                } else {
                    if (!this.startSelect.value) {
                        this.engine.setEndMarker(null);
                    }
                }
                this.calculateRoute();
            });

            // スマホでは CustomSelect のドロップダウンを使わず、出発地・目的地を
            // 1画面でまとめて扱う専用パネルに委譲する。
            this.mobileSearchPanel = new MobileSearchPanel(this);
            this.startSelect.onMobileOpen = () => this.mobileSearchPanel.open('start');
            this.endSelect.onMobileOpen = () => this.mobileSearchPanel.open('end');

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

        // 2. Current Location & Location Code Params
        const codeParam = params.get('code') || params.get('location_id') || params.get('locationId');
        const currentParam = params.get('current') || params.get('loc');
        const currentQuery = codeParam || currentParam;
        let currentResolved = null;
        if (currentQuery) {
            currentResolved = this.resolveNode(currentQuery);
            if (currentResolved) {
                this.engine.setCurrentLocation(currentResolved.node.id);
                this.notifyIfAmbiguousExhibits(currentResolved.node);
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
            const { node, exhibitId } = currentResolved;
            const exhibit = exhibitId ? (node.exhibits || []).find(e => e.id === exhibitId) : null;
            startResolved = {
                value: exhibitId ? `${node.id}::${exhibitId}` : node.id,
                title: exhibit ? formatExhibitLabel(exhibit) : (node.name || '現在地')
            };
        }

        // 4. End Point (Destination)
        const endQuery = params.get('end') || params.get('goal') || params.get('dest') || params.get('to');
        let endResolved = null;
        if (endQuery) {
            endResolved = this.resolveDestination(endQuery);
        }

        // Fallback: If codeParam was passed, but neither current/start nor end was resolved, try resolving codeParam as destination if no endQuery was given
        if (codeParam && !currentResolved && !startResolved && !endQuery) {
            endResolved = this.resolveDestination(codeParam);
        }

        // Check for unregistered location code / query warning
        const unmappedQueries = [];
        if (codeParam && !currentResolved && !startResolved && !endResolved) {
            unmappedQueries.push(codeParam);
        } else {
            if (currentParam && !currentResolved && !startResolved) {
                unmappedQueries.push(currentParam);
            }
            if (startQuery && !startResolved) {
                unmappedQueries.push(startQuery);
            }
            if (endQuery && !endResolved) {
                unmappedQueries.push(endQuery);
            }
        }

        if (unmappedQueries.length > 0) {
            const firstUnmapped = unmappedQueries[0];
            this.showNotificationToast(`指定されたロケーションID (${firstUnmapped}) は登録されていません`, 'warning');
        }

        // 5. Apply navigation / selection state
        if (startResolved && endResolved) {
            if (this.startSelect) this.startSelect.select(startResolved.value, startResolved.title);
            if (this.endSelect) this.endSelect.select(endResolved.value, endResolved.title);
            this.engine.setStartMarker(this.parseSelectValue(startResolved.value).nodeId);
            this.calculateRoute();
        } else if (startResolved) {
            if (this.startSelect) this.startSelect.select(startResolved.value, startResolved.title);
            const startNodeId = this.parseSelectValue(startResolved.value).nodeId;
            this.engine.setStartMarker(startNodeId);
            this.engine.focusNode(startNodeId);
        } else if (endResolved) {
            if (this.endSelect) this.endSelect.select(endResolved.value, endResolved.title);
            if (!endResolved.value.startsWith('NEAREST_')) {
                const endNodeId = this.parseSelectValue(endResolved.value).nodeId;
                this.engine.setEndMarker(endNodeId);
                this.engine.focusNode(endNodeId);
                const node = this.engine.getNode(endNodeId);
                if (node) this.engine.highlightNode(node);
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
        return normalizeSearchText(str);
    }

    // 複合値 "nodeId::exhibitId" を分解する。展示を持たないノードやシステム
    // オプション (NEAREST_*) は単なる nodeId 文字列のまま扱う。
    parseSelectValue(val) {
        if (typeof val !== 'string') return { nodeId: val, exhibitId: null };
        const sep = val.indexOf('::');
        if (sep === -1) return { nodeId: val, exhibitId: null };
        return { nodeId: val.slice(0, sep), exhibitId: val.slice(sep + 2) };
    }

    getExhibitForSelectValue(val) {
        const { nodeId, exhibitId } = this.parseSelectValue(val);
        if (!exhibitId) return null;
        const node = this.engine.getNode(nodeId);
        return (node && node.exhibits) ? (node.exhibits.find(ex => ex.id === exhibitId) || null) : null;
    }

    // ノード・展示を検索し、{node, exhibitId} を返す (見つからなければ null)。
    // exhibitId は該当ノードの中で一致した展示 (無ければ先頭展示、展示自体が無ければ null)。
    resolveNode(query) {
        if (!query) return null;
        const normQuery = this.normalizeString(query);
        // 展示が1件だけならその展示を採用する。2件以上ある場合はどれか1件を勝手に
        // 代表として選ばず null を返す（呼び出し側は地点名で表示し、どの展示かは
        // 検索候補一覧から利用者自身に独立した選択肢として選んでもらう）。
        const soleExhibitId = (n) => (n.exhibits && n.exhibits.length === 1) ? n.exhibits[0].id : null;

        // 1. Direct Location ID (code) check (e.g. "N204", "KH101")
        let codeMatches = this.engine.globalNodes.filter(n => {
            return n.code && this.normalizeString(n.code) === normQuery;
        });
        if (codeMatches.length > 0) return { node: codeMatches[0], exhibitId: soleExhibitId(codeMatches[0]) };

        // 2. Direct ID check (e.g. "1_101", or compound "nodeId::exhibitId")
        const { nodeId: directNodeId, exhibitId: explicitExhibitId } = this.parseSelectValue(query);
        let node = this.engine.getNode(directNodeId) || this.engine.getNode(query) || this.engine.getNode(normQuery);
        if (node) return { node, exhibitId: explicitExhibitId || soleExhibitId(node) };

        // 3. Exact match check (case-insensitive and normalized) — node name/code, then each exhibit's org/eventName
        for (const n of this.engine.globalNodes) {
            const name = this.normalizeString(n.name);
            const code = this.normalizeString(n.code);
            if (name === normQuery || code === normQuery) return { node: n, exhibitId: soleExhibitId(n) };
            for (const ex of (n.exhibits || [])) {
                if (this.normalizeString(ex.eventName) === normQuery || this.normalizeString(ex.organization) === normQuery) {
                    return { node: n, exhibitId: ex.id };
                }
            }
        }

        // 4. Partial match check (case-insensitive and normalized)
        for (const n of this.engine.globalNodes) {
            const name = this.normalizeString(n.name);
            const code = this.normalizeString(n.code);
            if (name.includes(normQuery) || code.includes(normQuery)) return { node: n, exhibitId: soleExhibitId(n) };
            for (const ex of (n.exhibits || [])) {
                if (this.normalizeString(ex.eventName).includes(normQuery) || this.normalizeString(ex.organization).includes(normQuery)) {
                    return { node: n, exhibitId: ex.id };
                }
            }
        }

        // 5. Try matching floor local ID (originalId)
        let origMatches = this.engine.globalNodes.filter(n => {
            const origId = this.normalizeString(n.originalId);
            return origId === normQuery;
        });
        if (origMatches.length > 0) return { node: origMatches[0], exhibitId: soleExhibitId(origMatches[0]) };

        return null;
    }

    resolveStart(query) {
        const resolved = this.resolveNode(query);
        if (resolved) {
            const { node, exhibitId } = resolved;
            if (node.type === 'entrance_only') {
                this.showRestrictionWarning('entrance_only');
            }
            const exhibit = exhibitId ? (node.exhibits || []).find(e => e.id === exhibitId) : null;
            let title = exhibit ? formatExhibitLabel(exhibit) : (node.name || '出発地');
            if (node.type === 'stairs' || node.type === 'elevator') {
                title += ` (${node.floorId}階)`;
            }
            return {
                value: exhibitId ? `${node.id}::${exhibitId}` : node.id,
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
        const resolved = this.resolveNode(query);
        if (resolved) {
            const { node, exhibitId } = resolved;
            if (node.type === 'exit_only') {
                this.showRestrictionWarning('exit_only');
            }
            const exhibit = exhibitId ? (node.exhibits || []).find(e => e.id === exhibitId) : null;
            let title = exhibit ? formatExhibitLabel(exhibit) : (node.name || '目的地');
            if (node.type === 'stairs' || node.type === 'elevator') {
                title += ` (${node.floorId}階)`;
            }
            return {
                value: exhibitId ? `${node.id}::${exhibitId}` : node.id,
                title: title
            };
        }
        return null;
    }

    showNotificationToast(message, type = 'warning', durationMs = 6000) {
        let container = document.getElementById('ui-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ui-toast-container';
            container.style.cssText = `
                position: fixed;
                top: 75px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-width: 90%;
                width: 400px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        const borderColor = type === 'error' ? '#dc3545' : (type === 'success' ? '#28a745' : '#e65100');
        const bgColor = type === 'error' ? '#fff5f5' : (type === 'success' ? '#f6ffed' : '#fffbe6');
        const textColor = type === 'error' ? '#c62828' : (type === 'success' ? '#276749' : '#b78103');

        toast.style.cssText = `
            background: ${bgColor};
            border: 1px solid ${borderColor};
            border-left: 4px solid ${borderColor};
            color: ${textColor};
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: bold;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
            display: flex;
            align-items: center;
            justify-content: space-between;
            pointer-events: auto;
            animation: fadeInDown 0.3s ease;
        `;

        toast.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>${escapeHtml(message)}</span>
            </div>
            <button style="background:none; border:none; color:inherit; cursor:pointer; padding:0 4px; font-size:16px; font-weight:bold;" onclick="this.parentElement.remove()">✕</button>
        `;

        container.appendChild(toast);

        if (durationMs > 0) {
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }
            }, durationMs);
        }
    }

    // 同じ地点(ノード)に複数の展示が登録されている場合、QRコード読込・現在地設定では
    // どれか1件を代表として自動選択しない。代わりに利用者へ通知し、検索候補一覧から
    // 目的の展示を独立した選択肢として選び直してもらう。
    notifyIfAmbiguousExhibits(node) {
        if (node && Array.isArray(node.exhibits) && node.exhibits.length > 1) {
            this.showNotificationToast(`「${node.name}」には複数の展示・団体が登録されています。目的地の検索欄から該当する展示をお選びください。`, 'warning');
        }
    }

    updateSelects() {
        // Debug: Check if orderData is available
        console.log('[updateSelects] orderData:', this.engine.orderData);

        // Populate Custom Selects
        const activeNodes = this.engine.globalNodes.filter(n => n.name && n.type !== 'junction');

        // sortIndex computation shared by both the plain-node option and each exhibit option
        const computeSortIndex = (n, isStart) => {
            const isRestricted = (isStart && n.type === 'entrance_only') || (!isStart && n.type === 'exit_only');
            const isRestrictedPartner = (isStart && n.type === 'exit_only') || (!isStart && n.type === 'entrance_only');

            if (!this.engine.orderData) {
                if (isRestricted) return 9999.2;
                if (isRestrictedPartner) return 9999.1;
                return 9999;
            }

            // 表示順は展示の企画名(eventName)ではなく、展示場所(部屋/地点)の名称のみで判断する。
            // 企画名を含めると、部活の企画タイトルにたまたま含まれる文字列が別のパターンに
            // 誤ってマッチし、意図しない優先順位になってしまうため。
            const fullName = (n.name || '').trim();
            const defaultPriority = this.engine.orderData.default || 9999;

            const matchedPriorities = [];
            if (this.engine.orderData.items) {
                for (const [key, priority] of Object.entries(this.engine.orderData.items)) {
                    if (key && fullName.includes(key)) {
                        matchedPriorities.push(priority);
                    }
                }
            }

            const basePriority = matchedPriorities.length > 0 ? Math.min(...matchedPriorities) : defaultPriority;
            if (isRestricted) return basePriority + 0.2;
            if (isRestrictedPartner) return basePriority + 0.1;
            return basePriority;
        };

        // ノードごとに、展示があれば展示ごとに1件、無ければ地点そのもので1件のオプションを生成する
        const buildOptions = (n, isStart) => {
            const building = getBuildingName(n);
            const exhibits = Array.isArray(n.exhibits) ? n.exhibits : [];
            if (exhibits.length === 0) {
                let title = n.name;
                if (n.type === 'stairs' || n.type === 'elevator') {
                    title += ` (${n.floorId}階)`;
                }
                return [{
                    value: n.id,
                    title: title,
                    org: '',
                    code: n.code || '',
                    category: this.getTypeLabel(n.type),
                    type: n.type,
                    floor: n.floorId,
                    building: building,
                    sortIndex: computeSortIndex(n, isStart),
                    sortKey: (n.name || '').trim()
                }];
            }

            return exhibits.map(ex => {
                let title = formatExhibitLabel(ex);
                if (n.type === 'stairs' || n.type === 'elevator') {
                    title += ` (${n.floorId}階)`;
                }
                return {
                    value: `${n.id}::${ex.id}`,
                    title: title,
                    org: '展示場所：' + n.name, // 部屋名(展示場所)としての表示は残す
                    code: n.code || '',
                    category: this.getTypeLabel(n.type),
                    type: n.type,
                    floor: n.floorId,
                    building: building,
                    sortIndex: computeSortIndex(n, isStart),
                    sortKey: (ex.organization || ex.eventName || n.name || '').trim()
                };
            });
        };

        // Sort initially by Floor and Name
        const sortedActiveNodes = [...activeNodes].sort((a, b) => {
            if (a.floorId !== b.floorId) return a.floorId - b.floorId;
            return a.name.localeCompare(b.name, 'ja', { numeric: true });
        });

        const startOptions = sortedActiveNodes.flatMap(n => buildOptions(n, true));
        const endOptions = sortedActiveNodes.flatMap(n => buildOptions(n, false));

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

    // モバイルの検索パネルを、出発地(start)/目的地(end)いずれかの編集状態で開く。
    switchMobileField(target) {
        if (this.mobileSearchPanel) this.mobileSearchPanel.open(target);
    }

    // モバイルの検索ピル/経路要約バーから検索パネルを開く入口。
    // preferred を指定しない場合は、未入力のフィールド(出発地優先)にフォーカスする。
    openMobileSearchEntry(preferred) {
        if (!this.mobileSearchPanel) return;
        let field = preferred;
        if (!field) {
            if (this.startSelect && !this.startSelect.value) field = 'start';
            else field = 'end';
        }
        this.mobileSearchPanel.open(field);
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

            // 検索パネルが開いていれば、片方だけ埋まった状態を入力欄に反映して
            // 未入力側へフォーカスを移す(パネルは開いたまま = 画面遷移が起きない)。
            // clearRoute() による一括クリアの途中(片方だけ空になった瞬間)は
            // 誤って発火しないようガードする。
            if (!this._isClearingRoute && this.mobileSearchPanel && this.mobileSearchPanel.isOpen()) {
                this.mobileSearchPanel.syncFields();
            }
            return;
        }

        const startNodeId = this.parseSelectValue(startVal).nodeId;
        const endNodeId = this.parseSelectValue(endVal).nodeId;
        const path = this.engine.calculatePath(startNodeId, endNodeId);

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

            // Mobile: Close Sidebar & Search Panel, Show Overlay
            if (window.innerWidth <= 768 && this.sidebar) {
                this.sidebar.classList.remove('active');
            }
            // 経路が確定したら検索パネルは役目を終えるので閉じ、地図を全面に出す
            if (this.mobileSearchPanel) this.mobileSearchPanel.close();

            // Hide bottom search bar during active routing
            if (this.mobileSearchBar) this.mobileSearchBar.classList.add('hidden');

            // Update Mobile Route Summary Bar
            const sNode = this.engine.getNode(startNodeId);
            const eNode = this.engine.getNode(endNodeId);
            const sExhibit = this.getExhibitForSelectValue(startVal);
            const eExhibit = this.getExhibitForSelectValue(endVal);

            if (this.mobileSummaryBar && this.summaryStartName && this.summaryEndName) {
                const nearestLabelMap = {
                    "NEAREST_MALE": "最寄男子トイレ",
                    "NEAREST_FEMALE": "最寄女子トイレ",
                    "NEAREST_VENDING": "最寄自販機"
                };
                let startText = sExhibit ? formatExhibitLabel(sExhibit) : (sNode ? sNode.name : "出発地");
                let endText = eExhibit ? formatExhibitLabel(eExhibit) : (eNode ? eNode.name : (nearestLabelMap[endVal] || "目的地"));

                // Add floor info for extra clarity if nodes exist
                if (sNode) {
                    let startDetail = `${sNode.floorId}F`;
                    if (sExhibit) {
                        startDetail += ` - ${sNode.name}`; // 展示場所(部屋名)としての表示は残す
                    }
                    startText += ` (${startDetail})`;
                }
                if (eNode) {
                    let endDetail = `${eNode.floorId}F`;
                    if (eExhibit) {
                        endDetail += ` - ${eNode.name}`;
                    }
                    endText += ` (${endDetail})`;
                }

                this.summaryStartName.innerText = startText;
                this.summaryEndName.innerText = endText;
                this.mobileSummaryBar.classList.remove('hidden');
            }

            // Update Mobile Overlay with EXACT content from Route List
            this.updateRouteList(path || [], false, { start: sExhibit, end: eExhibit }); // Generate standard list first

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
                if (this.mobileSearchPanel) this.mobileSearchPanel.close();

                // Hide bottom search bar
                if (this.mobileSearchBar) this.mobileSearchBar.classList.add('hidden');

                // Update Mobile Route Summary Bar to show starting and ending points
                if (this.mobileSummaryBar && this.summaryStartName && this.summaryEndName) {
                    const sNode = this.engine.getNode(this.parseSelectValue(startVal).nodeId);
                    const eNode = this.engine.getNode(this.parseSelectValue(endVal).nodeId);
                    const sExhibit = this.getExhibitForSelectValue(startVal);
                    const eExhibit = this.getExhibitForSelectValue(endVal);

                    const nearestLabelMap = {
                        "NEAREST_MALE": "最寄男子トイレ",
                        "NEAREST_FEMALE": "最寄女子トイレ",
                        "NEAREST_VENDING": "最寄自販機"
                    };
                    let startText = sExhibit ? formatExhibitLabel(sExhibit) : (sNode ? sNode.name : "出発地");
                    let endText = eExhibit ? formatExhibitLabel(eExhibit) : (eNode ? eNode.name : (nearestLabelMap[endVal] || "目的地"));

                    if (sNode) {
                        let startDetail = `${sNode.floorId}F`;
                        if (sExhibit) {
                            startDetail += ` - ${sNode.name}`;
                        }
                        startText += ` (${startDetail})`;
                    }
                    if (eNode) {
                        let endDetail = `${eNode.floorId}F`;
                        if (eExhibit) {
                            endDetail += ` - ${eNode.name}`;
                        }
                        endText += ` (${endDetail})`;
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
                            <div class="route-error-contact">お近くの<strong>スタッフにお問い合わせください。</strong></div>
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

    updateRouteList(pathIds, hasError = false, endpointExhibits = {}) {
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
                    <div class="route-error-contact">お近くの<strong>スタッフにお問い合わせください。</strong></div>
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

            // 出発地・到着地は選択された展示があればその表示形式 [団体名]「企画名」を優先する。
            // 選択されていない、または経由地(乗換階など)で展示が複数ある場合は、代表1件に
            // 丸めず全展示をそれぞれ独立した行として列挙する。
            const endpointExhibit = (isStart && endpointExhibits.start) || (isEnd && endpointExhibits.end) || null;
            const hasExhibits = Array.isArray(node.exhibits) && node.exhibits.length > 0;
            let titleLines = endpointExhibit
                ? [formatExhibitLabel(endpointExhibit)]
                : (hasExhibits ? node.exhibits.map(ex => formatExhibitLabel(ex)).filter(t => t) : []);
            if (titleLines.length === 0) {
                titleLines = [isTransfer ? "フロア移動" : (node.name || '')];
            }

            let desc = `${node.floorId}階`;
            if (endpointExhibit || hasExhibits) desc += ` - ${node.name}`; // 展示場所(部屋名)としての表示は残す

            if (isTransfer) {
                const typeLabel = node.type === 'elevator' ? 'エレベーター' : (node.type === 'stairs' ? '階段' : '移動');
                const nameLabel = node.name || '';
                let transferTitle;
                if (prevNode && prevNode.floorId !== node.floorId) {
                    transferTitle = `${typeLabel}で ${node.floorId}階に到着`;
                } else if (nextNode && nextNode.floorId !== node.floorId) {
                    transferTitle = `${typeLabel}で ${node.floorId}階 ➔ ${nextNode.floorId}階へ`;
                }
                if (nameLabel) {
                    transferTitle = `${nameLabel} (${transferTitle})`;
                }
                titleLines = [transferTitle];
            }

            li.innerHTML = `
                <div class="step-marker"></div>
                <div class="step-content">
                    <div class="step-main">
                        ${titleLines.map(t => `<span class="step-label">${escapeHtml(t)}</span>`).join('')}
                        <span class="step-detail">${escapeHtml(desc)}</span>
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
                msg = "カメラのアクセス権限がありません。ブラウザの設定を確認してください。";
            } else if (err.message === "NotSupportedError" || err.name === "TypeError") {
                msg = "この接続環境またはブラウザでは、カメラ機能がサポートされていません。HTTPS接続でお試しください。";
            }
            this.stopScanner();
            this.showNotificationToast(msg, 'error');
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
                    this.notifyIfAmbiguousExhibits(node);

                    // Update Start Select if exists
                    if (this.startSelect) {
                        // 展示が2件以上ある場合はどれか1件に決め打ちせず、地点名で表示する
                        const soleExhibit = (node.exhibits && node.exhibits.length === 1) ? node.exhibits[0] : null;
                        const title = soleExhibit ? formatExhibitLabel(soleExhibit) : (node.name || "現在地");
                        const selectValue = soleExhibit ? `${currentId}::${soleExhibit.id}` : currentId;
                        // select() が呼ぶ onChange コールバックが calculateRoute() を実行し、
                        // 経路・経路要約バー・turn-by-turnリストをまとめて正しく更新する。
                        // (以前はここで engine.calculatePath() を直接呼び直しており、
                        //  経路自体は更新されてもリスト・要約バー表示が古いまま残っていた)
                        this.startSelect.select(selectValue, title);
                        this.engine.setStartMarker(currentId);
                    }
                } else {
                    console.warn("[QR] ID not found in map data:", currentId);
                    this.showNotificationToast(`QRコードの場所が見つかりません (ID: ${currentId})`, 'error');
                }
            } else {
                console.warn("[QR] No ID found in content");
                this.showNotificationToast("無効なQRコードです（位置情報が含まれていません）", 'error');
            }

        } catch (err) {
            console.error("[QR] Parse Error:", err);
            this.showNotificationToast("QRコードの読み取りに失敗しました", 'error');
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

        // 展示企画API(カテゴリ/ジャンル/建物/階/学年)による絞り込み。null = 絞り込みなし。
        this.filteredCodes = null;
        this.exhibitFilterPanel = new ExhibitFilterPanel((codes) => {
            this.filteredCodes = codes;
            this.renderList();
        }, 'select-sort-btn');

        // スマホでは自前のドロップダウンを開かず、MobileSearchPanel に処理を委ねる。
        // UIController 側でパネル生成後に設定される。
        this.onMobileOpen = null;

        this.trigger.addEventListener('click', () => this.toggle());

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) this.requestClose();
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
            this.filterText = normalizeSearchText(e.target.value);
            this.renderList(); // Re-render only list ideally, but for now full render is safer? No, focus is lost.
            // We need to separate renderList logic to keep input focus intact.
        };

        // Sort Button
        const sortBtn = document.createElement('button');
        sortBtn.className = 'select-sort-btn';
        sortBtn.innerText = getSortModeLabel(this.sortBy);

        sortBtn.onclick = () => {
            if (this.sortBy === 'default') this.sortBy = 'floor';
            else if (this.sortBy === 'floor') this.sortBy = 'name';
            else this.sortBy = 'default';

            sortBtn.innerText = getSortModeLabel(this.sortBy);
            this.renderList();
        };

        // 絞り込みボタンは並び順ボタンのすぐ左に設置する
        header.appendChild(input);
        header.appendChild(this.exhibitFilterPanel.toggleBtn);
        header.appendChild(sortBtn);

        this.optionsContainer.appendChild(header);

        // 絞り込みパネル(開閉ドロワー): ヘッダー直下・リストの上に配置
        this.exhibitFilterPanel.panelEl.onclick = (e) => e.stopPropagation();
        this.optionsContainer.appendChild(this.exhibitFilterPanel.panelEl);

        // 2. Container for items
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'select-list-container';
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

        // Filter: 全角/半角を正規化し、ロケーションIDも対象に含める。
        // スペース区切りで複数キーワードを入力した場合はすべてを満たすものに絞り込む(AND検索)。
        const terms = this.filterText ? this.filterText.split(/\s+/).filter(Boolean) : [];
        let displayOptions = this.options.filter(opt => {
            if (this.filteredCodes && !this.filteredCodes.has(normalizeLocationCode(opt.code))) return false;
            if (terms.length === 0) return true;
            const haystack = normalizeSearchText(`${opt.title} ${opt.org || ''} ${opt.code || ''}`);
            return terms.every(term => haystack.includes(term));
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

                // 1. sortIndex の数値を直接比較する。管理画面の優先順位パターンは
                //    default(9999)より小さい値で「前の方に出す」設定にも、大きい値で
                //    「通常項目より後ろだが指定した順番で並べる」設定にも使われるため、
                //    数値そのものを比較すればどちらの設定意図も正しく反映できる。
                //    (以前は「priority < default なら明示設定」という前提で一度 type 別に
                //    振り分けていたが、default より大きい値を割り当てたケースがこの前提から
                //    漏れて type 順に埋もれてしまっていた)
                if (pA !== pB) return pA - pB;

                // 2. sortIndex が完全に同値(主に無設定同士が default 値で並ぶ場合)の時だけ、
                //    種別(部屋→エリア→出入口→…)でグループ化してから名前順に並べる。
                const tA = typeOrder[a.type] || 99;
                const tB = typeOrder[b.type] || 99;
                if (tA !== tB) return tA - tB;

                // 3. Sort by the stable 'sortKey' (Org or Name)
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
                // 「自動検索」は階見出しのような大区分ではなく、他の種別小見出し(教室/トイレ等)と
                // 並列の分類のひとつなので、select-group-header(大見出し)ではなく
                // select-subgroup-header(小見出し)で統一する。
                if (isAuto && !hasShownAutoHeader) {
                    hasShownAutoHeader = true;
                    lastFloor = 'AUTO';
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'select-subgroup-header';
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
                    const typeLabel = OPTION_TYPE_LABEL[opt.type] || 'その他';

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
                    <span class="option-title">${escapeHtml(opt.title)}</span>
                    <span class="option-org">${escapeHtml(opt.org || '')}</span>
                </div>
                <div class="option-meta">
                    ${buildFloorTagHtml(opt)}
                    <span class="option-tag ${escapeHtml(typeClass)}">${opt.category}</span>
                </div>
            `;

            el.addEventListener('click', () => {
                this.select(opt.value, opt.title);
            });

            this.listContainer.appendChild(el);
        });
    }

    open() {
        // スマホでは全画面の検索パネルが代わりに開く
        if (window.innerWidth <= 768 && this.onMobileOpen) {
            this.onMobileOpen();
            return;
        }
        if (this.optionsContainer.classList.contains('open')) return;
        this.optionsContainer.classList.add('open');
        this.trigger.classList.add('active');

        // Wait for display block to focus?
        setTimeout(() => {
            if (this._inputEl) this._inputEl.focus();
        }, 50);
    }

    toggle() {
        const isOpen = this.optionsContainer.classList.contains('open');
        if (!isOpen) this.open();
        else this.requestClose();
    }

    // ユーザー操作(×ボタン・候補選択・外側タップ)によるクローズ。
    requestClose() {
        this.close();
    }

    close() {
        this.optionsContainer.classList.remove('open');
        this.trigger.classList.remove('active');
    }

    select(value, label) {
        this.value = value;
        this.textSpan.innerText = label;
        this.requestClose();
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

/**
 * Mobile Search Panel (Fullscreen Google Maps style dual-field search UI)
 */
class MobileSearchPanel {
    constructor(uiController) {
        this.ui = uiController;
        this.panel = document.getElementById('mobile-search-panel');
        if (!this.panel) return;

        this.closeBtn = document.getElementById('msp-close');
        this.inputStart = document.getElementById('msp-input-start');
        this.inputEnd = document.getElementById('msp-input-end');
        this.clearStart = this.panel.querySelector('[data-clear="start"]');
        this.clearEnd = this.panel.querySelector('[data-clear="end"]');
        this.swapBtn = document.getElementById('msp-swap');
        this.toolbarContainer = document.getElementById('msp-toolbar');
        this.listContainer = document.getElementById('msp-list');

        this.activeField = 'end'; // 'start' | 'end'
        this.sortBy = 'default'; // 'default' | 'floor' | 'name' (PC版の CustomSelect と同じ3モード)

        // 展示企画API(カテゴリ/ジャンル/建物/階/学年)による絞り込み。null = 絞り込みなし。
        this.filteredCodes = null;
        this.exhibitFilterPanel = new ExhibitFilterPanel((codes) => {
            this.filteredCodes = codes;
            this.renderList();
        }, 'msp-sort-btn');

        this.initEvents();
        this.renderToolbar();
    }

    initEvents() {
        if (!this.panel) return;

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.inputStart) {
            this.inputStart.addEventListener('focus', () => {
                this.activeField = 'start';
                this.updateActiveFieldUI();
                this.renderList();
            });
            this.inputStart.addEventListener('input', () => {
                this.updateClearButtons();
                this.renderList();
            });
        }

        if (this.inputEnd) {
            this.inputEnd.addEventListener('focus', () => {
                this.activeField = 'end';
                this.updateActiveFieldUI();
                this.renderList();
            });
            this.inputEnd.addEventListener('input', () => {
                this.updateClearButtons();
                this.renderList();
            });
        }

        if (this.clearStart) {
            this.clearStart.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.inputStart) this.inputStart.value = '';
                if (this.ui.startSelect) this.ui.startSelect.select(null, '出発地を選択...');
                this.updateClearButtons();
                if (this.activeField === 'start') this.renderList();
            });
        }

        if (this.clearEnd) {
            this.clearEnd.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.inputEnd) this.inputEnd.value = '';
                if (this.ui.endSelect) this.ui.endSelect.select(null, '目的地を選択...');
                this.updateClearButtons();
                if (this.activeField === 'end') this.renderList();
            });
        }

        if (this.swapBtn) {
            this.swapBtn.addEventListener('click', () => {
                const sVal = this.ui.startSelect ? this.ui.startSelect.value : null;
                const sText = this.ui.startSelect ? this.ui.startSelect.textSpan.innerText : '';
                const eVal = this.ui.endSelect ? this.ui.endSelect.value : null;
                const eText = this.ui.endSelect ? this.ui.endSelect.textSpan.innerText : '';

                if (this.ui.startSelect) this.ui.startSelect.select(eVal, eText || '出発地を選択...');
                if (this.ui.endSelect) this.ui.endSelect.select(sVal, sText || '目的地を選択...');

                this.syncFields();
                this.renderList();
            });
        }
    }

    isOpen() {
        return this.panel && !this.panel.classList.contains('hidden');
    }

    open(field = 'end') {
        if (!this.panel) return;
        this.activeField = field;
        this.panel.classList.remove('hidden');
        this.syncFields();
        this.updateActiveFieldUI();
        this.renderList();

        setTimeout(() => {
            const targetInput = field === 'start' ? this.inputStart : this.inputEnd;
            if (targetInput) {
                targetInput.focus();
                if (typeof targetInput.select === 'function') {
                    targetInput.select();
                }
            }
        }, 100);
    }

    close() {
        if (!this.panel) return;
        this.panel.classList.add('hidden');
        if (this.inputStart) this.inputStart.blur();
        if (this.inputEnd) this.inputEnd.blur();
    }

    syncFields() {
        if (this.inputStart && this.ui.startSelect) {
            this.inputStart.value = this.ui.startSelect.value ? this.ui.startSelect.textSpan.innerText : '';
        }
        if (this.inputEnd && this.ui.endSelect) {
            this.inputEnd.value = this.ui.endSelect.value ? this.ui.endSelect.textSpan.innerText : '';
        }
        this.updateClearButtons();
    }

    updateClearButtons() {
        if (this.clearStart && this.inputStart) {
            this.clearStart.classList.toggle('visible', !!this.inputStart.value);
        }
        if (this.clearEnd && this.inputEnd) {
            this.clearEnd.classList.toggle('visible', !!this.inputEnd.value);
        }
    }

    updateActiveFieldUI() {
        if (!this.panel) return;
        const startGroup = this.panel.querySelector('[data-field="start"]');
        const endGroup = this.panel.querySelector('[data-field="end"]');

        if (startGroup) {
            startGroup.classList.toggle('active', this.activeField === 'start');
        }
        if (endGroup) {
            endGroup.classList.toggle('active', this.activeField === 'end');
        }
    }

    // PC版 (CustomSelect) と同じ並び替え機能をスマホの検索パネルにも用意する。
    // 入力欄の下・結果リストの上という、リストに触れる前に必ず目に入る位置に固定表示する。
    renderToolbar() {
        if (!this.toolbarContainer) return;
        this.toolbarContainer.innerHTML = '';

        const sortBtn = document.createElement('button');
        sortBtn.type = 'button';
        sortBtn.className = 'msp-sort-btn';
        sortBtn.innerText = getSortModeLabel(this.sortBy);

        sortBtn.addEventListener('click', () => {
            if (this.sortBy === 'default') this.sortBy = 'floor';
            else if (this.sortBy === 'floor') this.sortBy = 'name';
            else this.sortBy = 'default';

            sortBtn.innerText = getSortModeLabel(this.sortBy);
            this.renderList();
        });

        // 絞り込みボタンは並び順ボタンのすぐ左に設置する
        this.toolbarContainer.appendChild(this.exhibitFilterPanel.toggleBtn);
        this.toolbarContainer.appendChild(sortBtn);

        // 絞り込みパネル(開閉ドロワー): ツールバー直下・リストの上に配置
        this.toolbarContainer.insertAdjacentElement('afterend', this.exhibitFilterPanel.panelEl);
    }

    renderList() {
        if (!this.listContainer || !this.ui.startSelect || !this.ui.endSelect) return;
        this.listContainer.innerHTML = '';

        const currentInput = this.activeField === 'start' ? this.inputStart : this.inputEnd;
        const currentSelect = this.activeField === 'start' ? this.ui.startSelect : this.ui.endSelect;
        const currentSelectedText = currentSelect && currentSelect.value ? currentSelect.textSpan.innerText : '';

        let rawInput = currentInput ? currentInput.value : '';

        // 編集時（入力欄のテキストが現在選択済みの名称と完全一致している場合）は、
        // ユーザーが新規検索キーワードを入力する前の初期状態とみなして絞り込みを行わず全候補を表示する
        if (rawInput && currentSelectedText && rawInput.trim() === currentSelectedText.trim()) {
            rawInput = '';
        }

        const filterText = normalizeSearchText(rawInput);
        // 出発地(start)を編集中は startSelect、目的地(end)を編集中は endSelect のオプションを使う。
        // 「最寄りの◯◯」自動検索は endSelect にしか存在しないため、常に startSelect を見ていると
        // 目的地選択時にも表示されなくなってしまう。
        const filtered = filterAndSortOptions(currentSelect.options, filterText, this.sortBy, this.filteredCodes);

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'msp-empty';
            empty.innerHTML = `
                <div class="msp-empty-title">検索結果が見つかりません</div>
                <div class="msp-empty-desc">別のキーワードで試してください</div>
            `;
            this.listContainer.appendChild(empty);
            return;
        }

        // グループ分けは PC版 (CustomSelect.renderList) と同じルールに揃える:
        // - 'default': 自動検索の見出し + 種別ごとの小見出し
        // - 'floor'  : 階数の見出し + 種別ごとの小見出し
        // - 'name'   : 見出しなし(名前順に並ぶだけ)
        let lastFloor = null;
        let lastType = null;
        let hasShownAutoHeader = false;

        filtered.forEach(opt => {
            const isAuto = opt.category === 'AUTO';

            if (this.sortBy === 'floor' || this.sortBy === 'default') {
                // 「自動検索」は階見出しのような大区分ではなく、他の種別小見出し(教室/トイレ等)と
                // 並列の分類のひとつなので、msp-list-group(大見出し)ではなく
                // msp-list-subgroup(小見出し)で統一する。
                if (isAuto && !hasShownAutoHeader) {
                    hasShownAutoHeader = true;
                    lastFloor = 'AUTO';
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'msp-list-subgroup';
                    groupHeader.textContent = '自動検索';
                    this.listContainer.appendChild(groupHeader);
                } else if (this.sortBy === 'floor' && !isAuto && opt.floor !== lastFloor) {
                    lastFloor = opt.floor;
                    lastType = null;
                    const groupHeader = document.createElement('div');
                    groupHeader.className = 'msp-list-group';
                    groupHeader.textContent = `${opt.floor}階`;
                    this.listContainer.appendChild(groupHeader);
                }

                if (!isAuto && opt.type !== lastType) {
                    lastType = opt.type;
                    const subHeader = document.createElement('div');
                    subHeader.className = 'msp-list-subgroup';
                    subHeader.textContent = OPTION_TYPE_LABEL[opt.type] || 'その他';
                    this.listContainer.appendChild(subHeader);
                }
            }

            const item = document.createElement('div');
            item.className = 'msp-list-item';

            // タグの表記は PC版 (CustomSelect) の option.category とそろえる。
            const tagClass = isAuto ? 'tag-auto' : `tag-${opt.type || 'others'}`;

            item.innerHTML = `
                <div class="msp-list-item-icon"${buildBuildingIconStyle(opt)}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
                    </svg>
                </div>
                <div class="msp-list-item-info">
                    <div class="msp-list-item-name">${escapeHtml(opt.title)}</div>
                    ${opt.org ? `<div class="msp-list-item-detail">${escapeHtml(opt.org)}</div>` : ''}
                </div>
                <div class="msp-list-item-tags">
                    ${buildFloorTagHtml(opt)}
                    <span class="msp-list-item-tag option-tag ${escapeHtml(tagClass)}">${escapeHtml(opt.category)}</span>
                </div>
            `;

            item.addEventListener('click', () => {
                this.selectOption(opt);
            });

            this.listContainer.appendChild(item);
        });
    }

    selectOption(opt) {
        const select = this.activeField === 'start' ? this.ui.startSelect : this.ui.endSelect;
        if (select) {
            select.select(opt.value, opt.title);
        }
        this.syncFields();

        const otherField = this.activeField === 'start' ? 'end' : 'start';
        const otherSelect = otherField === 'start' ? this.ui.startSelect : this.ui.endSelect;

        if (otherSelect && !otherSelect.value) {
            this.activeField = otherField;
            this.updateActiveFieldUI();
            this.renderList();
            const targetInput = otherField === 'start' ? this.inputStart : this.inputEnd;
            if (targetInput) targetInput.focus();
        } else {
            this.close();
        }
    }
}
