/**
-- I-Compass Supabase Migration Script
-- 実行方法: node migrate-to-supabase.js
-- ※このスクリプトは外部ライブラリを必要とせず、Node.js 18+ の標準 fetch API で動作します。
**/

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log("=========================================");
    console.log("   I-Compass Supabase 移行スクリプト");
    console.log("=========================================");

    const supabaseUrl = (await askQuestion("Supabase Project URL (例: https://xxxx.supabase.co): ")).trim();
    const serviceRoleKey = (await askQuestion("Supabase Service Role Key (※秘密キー。RLSをバイパスして書込するのに必要): ")).trim();
    const adminPasscode = (await askQuestion("管理者用パスコードを設定 (デフォルト: admin123): ")).trim() || "admin123";

    if (!supabaseUrl || !serviceRoleKey) {
        console.error("エラー: URLとService Role Keyは必須です。");
        process.exit(1);
    }

    // 1. JSON ファイルの有無を確認
    const jsonDir = path.join(__dirname, 'JSON');
    if (!fs.existsSync(jsonDir)) {
        console.error(`エラー: 'JSON' ディレクトリが見つかりません: ${jsonDir}`);
        process.exit(1);
    }

    // 2. 設定テーブル用のデータを挿入
    console.log("\n[1/3] セキュリティ設定とデフォルト値を保存中...");
    try {
        const securitySettings = {
            admin_passcode: adminPasscode
        };

        const settingsToUpload = [
            { key: 'is_private', value: false },
            { key: 'security', value: securitySettings }
        ];

        for (const item of settingsToUpload) {
            const res = await fetch(`${supabaseUrl}/rest/v1/settings`, {
                method: 'POST',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify(item)
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Settings '${item.key}' upload failed: ${res.status} - ${errText}`);
            }
            console.log(`  - 設定 '${item.key}' をアップロードしました`);
        }
    } catch (e) {
        console.error("エラー:", e.message);
        process.exit(1);
    }

    // 3. order.json を読み込んで settings に保存
    console.log("\n[2/3] 表示順序設定 (order.json) をアップロード中...");
    try {
        const orderPath = path.join(jsonDir, 'order.json');
        if (fs.existsSync(orderPath)) {
            const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
            const res = await fetch(`${supabaseUrl}/rest/v1/settings`, {
                method: 'POST',
                headers: {
                    'apikey': serviceRoleKey,
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates'
                },
                body: JSON.stringify({
                    key: 'order',
                    value: orderData
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`order.json upload failed: ${res.status} - ${errText}`);
            }
            console.log("  - order.json のデータを設定テーブルに保存しました");
        } else {
            console.warn("  - 警告: JSON/order.json が見つからないため、このステップをスキップします");
        }
    } catch (e) {
        console.error("エラー:", e.message);
        process.exit(1);
    }

    // 4. 各階のマップデータを読み込んで map_data に保存
    console.log("\n[3/3] 各階のマップデータをアップロード中...");
    const floorFiles = [
        { id: 1, file: '1.json' },
        { id: 2, file: '2.json' },
        { id: 3, file: '3.json' },
        { id: 4, file: '4.json' }
    ];

    for (const f of floorFiles) {
        const filePath = path.join(jsonDir, f.file);
        if (fs.existsSync(filePath)) {
            try {
                const floorData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const payload = {
                    floor_id: f.id,
                    nodes: floorData.nodes || [],
                    edges: floorData.edges || []
                };

                const res = await fetch(`${supabaseUrl}/rest/v1/map_data`, {
                    method: 'POST',
                    headers: {
                        'apikey': serviceRoleKey,
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'resolution=merge-duplicates'
                    },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(`Floor ${f.id} data upload failed: ${res.status} - ${errText}`);
                }
                console.log(`  - フロア ${f.id} (${f.file}) のデータをアップロードしました`);
            } catch (e) {
                console.error(`エラー (フロア ${f.id}):`, e.message);
            }
        } else {
            console.log(`  - 情報: ${f.file} が見つからないためスキップします`);
        }
    }

    console.log("\n=========================================");
    console.log(" 🎉 Supabase へのデータ移行が完了しました！");
    console.log("=========================================");
    console.log("\n次の手順を行ってください：");
    console.log("1. assets/js/config.js に以下の情報を追加・編集してください。");
    console.log(`   SUPABASE_URL: "${supabaseUrl}"`);
    console.log("   SUPABASE_ANON_KEY: \"(あなたのプロジェクトの anon public キー)\"");
    console.log("2. 動作確認後、ローカルの 'JSON' ディレクトリを削除してください。");
    console.log("=========================================");

    rl.close();
}

main();
