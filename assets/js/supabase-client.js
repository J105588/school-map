/**
 * I-Compass Supabase Client Integration Module
 * Handles all database communications, security validations, and admin login prompts.
 */

const SupabaseClient = {
    client: null,

    // Initialize Supabase Client
    init() {
        if (this.client) return this.client;

        if (typeof supabase === 'undefined' || !supabase.createClient) {
            console.error("[SupabaseClient] Supabase SDK is not loaded. Make sure the CDN script is included.");
            return null;
        }

        if (!AppConfig.SUPABASE_URL || AppConfig.SUPABASE_URL.includes("your-project")) {
            console.warn("[SupabaseClient] Supabase URL is not configured correctly in config.js.");
            return null;
        }

        // URLの末尾のスラッシュや '/rest/v1' を自動でクレンジングするセーフガード
        let url = AppConfig.SUPABASE_URL.trim().replace(/\/$/, "");
        if (url.endsWith("/rest/v1")) {
            url = url.substring(0, url.length - 8);
        }
        url = url.trim().replace(/\/$/, "");

        this.client = supabase.createClient(url, AppConfig.SUPABASE_ANON_KEY);
        console.log("[SupabaseClient] Supabase initialized successfully.");
        return this.client;
    },

    // RPC: Check if map is private
    async isPrivate() {
        const client = this.init();
        if (!client) return false;

        const { data, error } = await client.rpc('get_map_status');
        if (error) {
            console.error("[SupabaseClient] Failed to fetch map status:", error);
            return false;
        }
        return !!data;
    },

    // RPC: Fetch public floor data
    async getPublicFloorData(floorId) {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('get_public_floor_data', { p_floor_id: floorId });
        if (error) throw error;

        // Match response format (RPC returns array, we extract first item)
        if (data && data.length > 0) {
            return {
                nodes: data[0].nodes || [],
                edges: data[0].edges || []
            };
        }
        return { nodes: [], edges: [] };
    },

    // RPC: Fetch public order data
    async getPublicOrderData() {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('get_public_order_data');
        if (error) throw error;
        return data || { default: 9999, items: {} };
    },

    // RPC: Fetch admin floor data
    async getAdminFloorData(floorId, passcode) {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('get_admin_floor_data', {
            p_floor_id: floorId,
            p_admin_passcode: passcode
        });
        if (error) throw error;

        if (data && data.length > 0) {
            return {
                nodes: data[0].nodes || [],
                edges: data[0].edges || []
            };
        }
        return { nodes: [], edges: [] };
    },

    // RPC: Fetch admin order data
    async getAdminOrderData(passcode) {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('get_admin_order_data', {
            p_admin_passcode: passcode
        });
        if (error) throw error;
        return data || { default: 9999, items: {} };
    },

    // RPC: Save floor data
    async saveFloorData(floorId, nodes, edges, passcode) {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('save_floor_data', {
            p_floor_id: floorId,
            p_nodes: nodes,
            p_edges: edges,
            p_admin_passcode: passcode
        });
        if (error) throw error;
        return data;
    },

    // RPC: Save order data
    async saveOrderData(order, passcode) {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('save_order_data', {
            p_order: order,
            p_admin_passcode: passcode
        });
        if (error) throw error;
        return data;
    },

    // RPC: Set map privacy status
    async setMapPrivacy(isPrivate, passcode) {
        const client = this.init();
        if (!client) throw new Error("Supabase is not initialized");

        const { data, error } = await client.rpc('set_map_privacy', {
            p_is_private: isPrivate,
            p_admin_passcode: passcode
        });
        if (error) throw error;
        return data;
    },

    // Admin Passcode Local Storage management
    getAdminPasscode() {
        return sessionStorage.getItem('i_compass_admin_passcode') || "";
    },

    setAdminPasscode(passcode) {
        sessionStorage.setItem('i_compass_admin_passcode', passcode);
    },

    clearAdminPasscode() {
        sessionStorage.removeItem('i_compass_admin_passcode');
    },

    // UI: Request Admin Passcode
    async promptAdminPasscode() {
        // First check if sessionStorage already has a valid passcode
        const cachedPasscode = this.getAdminPasscode();
        if (cachedPasscode) {
            try {
                // Test with a lightweight call (fetching floor 1 admin data)
                await this.getAdminFloorData(1, cachedPasscode);
                return cachedPasscode; // Validated
            } catch (e) {
                console.warn("[SupabaseClient] Cached passcode was invalid. Clearing...");
                this.clearAdminPasscode();
            }
        }

        return new Promise((resolve) => {
            // Check if dialog already exists
            let overlay = document.getElementById('supabase-login-overlay');
            if (overlay) document.body.removeChild(overlay);

            // Create Overlay Elements
            overlay = document.createElement('div');
            overlay.id = 'supabase-login-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(15, 23, 42, 0.7);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Outfit', 'Inter', sans-serif;
                transition: opacity 0.3s ease;
            `;

            const box = document.createElement('div');
            box.style.cssText = `
                background: rgba(255, 255, 255, 0.85);
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 20px;
                padding: 40px;
                width: 90%;
                max-width: 400px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                text-align: center;
            `;

            // Logo Header
            box.innerHTML = `
                <div style="margin-bottom: 24px; display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: #1a237e; box-shadow: 0 8px 16px rgba(26, 35, 126, 0.2);">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#c5a059" stroke-width="2">
                        <circle cx="12" cy="12" r="9" />
                        <polygon points="12,4 15,12 12,12" fill="#c5a059"></polygon>
                        <polygon points="12,4 9,12 12,12" fill="#ff5252"></polygon>
                        <polygon points="12,20 15,12 12,12" fill="#1a237e"></polygon>
                        <polygon points="12,20 9,12 12,12" fill="#e5c158"></polygon>
                        <circle cx="12" cy="12" r="1.5" fill="white"></circle>
                    </svg>
                </div>
                <h2 style="margin: 0 0 8px 0; color: #0f172a; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">I-Compass 管理者認証</h2>
                <p style="margin: 0 0 24px 0; color: #64748b; font-size: 13px; line-height: 1.5;">マップデータをロード・編集するには、管理者用パスコードを入力してください。</p>
                <div style="position: relative; margin-bottom: 16px;">
                    <input type="password" id="admin-passcode-input" placeholder="パスコードを入力..." style="
                        width: 100%;
                        padding: 14px 16px;
                        border: 1.5px solid #cbd5e1;
                        border-radius: 12px;
                        font-size: 15px;
                        font-family: inherit;
                        outline: none;
                        background: rgba(255, 255, 255, 0.9);
                        box-sizing: border-box;
                        text-align: center;
                        letter-spacing: 2px;
                        transition: all 0.2s ease;
                    " onfocus="this.style.borderColor='#1a237e'; this.style.boxShadow='0 0 0 3px rgba(26, 35, 126, 0.15)';" onblur="this.style.borderColor='#cbd5e1'; this.style.boxShadow='none';">
                </div>
                <div id="login-error-msg" style="color: #ef4444; font-size: 12px; margin-bottom: 16px; display: none; font-weight: 600;"></div>
                <button id="admin-submit-btn" style="
                    width: 100%;
                    padding: 14px;
                    background: #1a237e;
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 6px -1px rgba(26, 35, 126, 0.2);
                    transition: all 0.2s ease;
                " onmouseover="this.style.backgroundColor='#111860';" onmouseout="this.style.backgroundColor='#1a237e';">認証する</button>
            `;

            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const input = document.getElementById('admin-passcode-input');
            const submitBtn = document.getElementById('admin-submit-btn');
            const errorMsg = document.getElementById('login-error-msg');

            const attemptLogin = async () => {
                const entered = input.value.trim();
                if (!entered) return;

                submitBtn.disabled = true;
                submitBtn.innerText = "認証中...";
                errorMsg.style.display = 'none';

                try {
                    // Validate by trying to fetch floor 1 admin data
                    await this.getAdminFloorData(1, entered);

                    // Success!
                    this.setAdminPasscode(entered);
                    document.body.removeChild(overlay);
                    resolve(entered);
                } catch (err) {
                    console.error("[SupabaseClient] Auth failed:", err);
                    submitBtn.disabled = false;
                    submitBtn.innerText = "認証する";
                    errorMsg.innerText = "パスコードが正しくありません。";
                    errorMsg.style.display = 'block';
                    input.value = "";
                    input.focus();
                }
            };

            // Events
            submitBtn.addEventListener('click', attemptLogin);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') attemptLogin();
            });

            input.focus();
        });
    },

    // UI: Display absolute block message when map is private (Visitor view)
    showPrivateMessage() {
        // Clear any existing overlays
        let overlay = document.getElementById('supabase-private-overlay');
        if (overlay) return; // Already showing

        // Create overlay element
        overlay = document.createElement('div');
        overlay.id = 'supabase-private-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Outfit', 'Inter', sans-serif;
            color: #ffffff;
            text-align: center;
            padding: 20px;
            box-sizing: border-box;
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            max-width: 500px;
            padding: 40px;
            border-radius: 24px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(12px);
            box-shadow: 0 30px 50px rgba(0, 0, 0, 0.4);
        `;

        box.innerHTML = `
            <div style="margin-bottom: 28px; display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 255, 255, 0.05); border: 1.5px solid rgba(197, 160, 89, 0.3);">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#c5a059" stroke-width="1.5">
                    <circle cx="12" cy="12" r="9" />
                    <rect x="9" y="11" width="6" height="5" rx="1" stroke="#ff5252" stroke-width="2"/>
                    <path d="M10 11V9a2 2 0 0 1 4 0v2" stroke="#ff5252" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </div>
            <h1 style="margin: 0 0 12px 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">I-Compass</h1>
            <h2 style="margin: 0 0 16px 0; color: #c5a059; font-size: 18px; font-weight: 600;">非公開設定</h2>
            <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                現在、校内マップは非公開に設定されています。<br>
                公開開始までしばらくお待ちください。
            </p>
        `;

        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Hide app-container to prevent showing cached background UI
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.style.display = 'none';

        const openingOverlay = document.getElementById('opening-overlay');
        if (openingOverlay) openingOverlay.style.display = 'none';

        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
};
