# I-Compass 公開API仕様

校内マップ「I-Compass」に登録されている情報を、外部サイト（学校公式サイト、なずな祭サイト等）から取得するための公開API。

- 匿名キー（anon key）のみで呼び出せる（管理者パスコード不要）
- 書き込みは一切できない（読み取り専用）
- `settings.is_private` が `true`（マップが非公開設定）の間は、すべての公開APIが例外を返しアクセスを拒否する

なずな祭サイトが提供する `search_exhibits`（展示企画横断検索API）とは逆方向の連携、すなわち「I-Compass側のロケーション・ノード情報を外部サイトへ渡す」用途を担う。実装参考: `assets/js/supabase-client.js`。

| 関数名 | 内容 | 追加時期 |
|---|---|---|
| `get_public_floor_data(p_floor_id int)` | 指定した1フロア分のノード・エッジ情報を取得 | 既存 |
| `get_public_order_data()` | 検索結果の並び順設定を取得 | 既存 |
| `get_public_all_floor_data()` | 全フロア分の全登録情報を一括取得 | 新規（2026-08-10） |
| `get_public_location_by_code(p_code text)` | ロケーションID（`code`）を指定して該当ノードを取得 | 新規（2026-08-10） |

追加分のマイグレーション: `supabase/migrations/20260810120000_public_all_data_and_location_lookup.sql`

## エンドポイント

```
POST {SUPABASE_URL}/rest/v1/rpc/{関数名}
```

`{SUPABASE_URL}` は本サイトの `assets/js/config.js` に記載の `AppConfig.SUPABASE_URL` と同じ値。

### 必須ヘッダー

| ヘッダー名 | 値 |
|---|---|
| `apikey` | 本サイトの Supabase anon key（`AppConfig.SUPABASE_ANON_KEY`）|
| `Content-Type` | `application/json` |

anon key は既に本サイトのクライアントJSに埋め込まれ公開されている値。個別のアカウント発行等は不要だが、値自体の共有方法は別途セキュアな手段（担当者間での直接連携等）で行うこと。書き込み系RPCは別途パスコードで保護されているため、この鍵だけでは登録データを改変できない。

### 呼び出し例（`supabase-js`）

```js
const { data, error } = await supabase.rpc('get_public_all_floor_data');
```

このリポジトリでは `assets/js/supabase-client.js` にラッパーメソッドも用意している（`SupabaseClient.getPublicAllFloorData()` / `SupabaseClient.getPublicLocationByCode(code)`）。

---

## 1. `get_public_all_floor_data()` — 全登録情報の一括取得

「システムに登録されているすべての情報」を1回のリクエストで取得するための入口。既存の `get_public_floor_data(p_floor_id)` をフロア単位でループ呼び出しする代わりに、これ1本で全フロア分を取得できる。パラメータは無し。

### 呼び出し例

```bash
curl -X POST "https://your-project-id.supabase.co/rest/v1/rpc/get_public_all_floor_data" \
  -H "apikey: your-anon-or-public-jwt-key" \
  -H "Content-Type: application/json" \
  -d "{}"
```

### レスポンス

成功時、常に `200 OK` で `floor_id, nodes, edges` を持つ行の配列を返す。`floor_id` の昇順で返る。

```json
[
  {
    "floor_id": 1,
    "nodes": [
      {
        "id": 176434123,
        "x": 320,
        "y": 540,
        "type": "room",
        "name": "204教室",
        "code": "N204",
        "exhibits": [
          { "id": "ex_lz3k9a2b1", "organization": "1年A組", "eventName": "お化け屋敷" },
          { "id": "ex_lz3k9c7f4", "organization": "科学部",   "eventName": "科学実験ショー" }
        ]
      },
      {
        "id": 176434200,
        "x": 100,
        "y": 60,
        "type": "junction",
        "name": ""
      }
    ],
    "edges": [
      { "from": 176434123, "to": 176434200, "dist": 42, "barrierFreeBlocked": false }
    ]
  }
]
```

### `node` の主なフィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number/string | フロア内でのノードID |
| `x`, `y` | number | フロア画像上の座標 |
| `type` | string | `room`/`toilet`/`stairs`/`elevator`/`entrance`/`entrance_only`/`exit_only`/`vending`/`area`/`junction`/`others` |
| `name` | string | 表示部屋名（展示場所としての表示。例: `204教室`）。展示の有無に関わらず変わらない |
| `code` | string（任意） | ロケーションID（例: `N204`）。詳細は [ADR0001](../adr/0001-location-id-integration.md) を参照 |
| `connectionId` | string（任意） | 階段・EVをフロア間で連結するためのID |
| `exhibits` | array（任意） | この場所に登録されている展示の配列。1つの部屋に複数の展示を登録できる（詳細は次項） |

### `exhibits[]` の各要素

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | 展示の一意なID（`ex_` プレフィックス） |
| `organization` | string | 展示団体名称（例: `1年A組`） |
| `eventName` | string | 企画名称（例: `お化け屋敷`） |

**来場者向け表示フォーマット**: map.html 上では `[organization]「eventName」` の形式で表示する（`organization` が空の場合は `「eventName」` のみ）。部屋名（`name`）は「展示場所」として別途、従来通り表示される。

> 注意（マイグレーション時の注意点）: 2026-08-10 以前に登録されたデータは、管理者が editor.html で該当フロアを開いて再保存するまで、DB上には旧形式の単一の `eventName`/`organization` 文字列フィールドがノード直下に残っている場合がある（アプリ側は読み込み時に自動的に `exhibits[0]` へ変換するが、DBの生データを直接参照するクライアントはこの旧フィールドも考慮する必要がある）。

---

## 2. `get_public_location_by_code(p_code text)` — ロケーションIDによる検索

ロケーションID（`code`。例: `N204`, `KH101`）を指定して該当するノードを取得する。

### パラメータ

| パラメータ | 説明 |
|---|---|
| `p_code` | ロケーションID。大文字・小文字を区別せず、前後の空白を除去して比較する（`upper(trim(...))`）。未指定・空文字の場合は空配列を返す |

全角文字のNFKC正規化は行っていない（PostgreSQL標準機能の範囲内のため）。半角化が必要な場合は、アプリ本体の `UIController.normalizeString()` と同様に呼び出し側で正規化してから渡すこと。

### 呼び出し例

```bash
curl -X POST "https://your-project-id.supabase.co/rest/v1/rpc/get_public_location_by_code" \
  -H "apikey: your-anon-or-public-jwt-key" \
  -H "Content-Type: application/json" \
  -d '{"p_code": "N204"}'
```

### レスポンス

成功時、常に `200 OK` で `floor_id, node` の行の配列を返す。**通常は1件だが、複数件返ることがある**（下記参照）。

```json
[
  {
    "floor_id": 2,
    "node": {
      "id": 176434123,
      "x": 320,
      "y": 540,
      "type": "room",
      "name": "204教室",
      "code": "N204",
      "exhibits": [
        { "id": "ex_lz3k9a2b1", "organization": "1年A組", "eventName": "お化け屋敷" }
      ]
    }
  }
]
```

### 複数行返るケース（階段・エレベーター）

[ADR0006](../adr/0006-elevator-stairs-location-id-standard.md) の通り、階段・エレベーターは複数フロアにまたがって同一の `code`（例: `STN`, `EN`）を意図的に共有する。そのため、階段・EVの `code` を指定すると、フロアごとに1件ずつ、複数行が返る：

```json
[
  { "floor_id": 1, "node": { "id": 176440001, "type": "stairs", "name": "北階段", "code": "STN", "connectionId": "stairs_north" } },
  { "floor_id": 2, "node": { "id": 176440045, "type": "stairs", "name": "北階段", "code": "STN", "connectionId": "stairs_north" } },
  { "floor_id": 3, "node": { "id": 176440089, "type": "stairs", "name": "北階段", "code": "STN", "connectionId": "stairs_north" } }
]
```

一般の教室・展示スペースの `code` は [ADR0002](../adr/0002-location-id-duplicate-check-and-unassigned-list.md) の重複検出により1件のみに保たれているため、通常は1件のみ返る。

---

## 3. `get_public_floor_data(p_floor_id int)` — 単一フロアの取得（既存）

指定した1フロア分のノード・エッジ情報を取得する。レスポンス形式は `get_public_all_floor_data()` の配列要素1件分（`nodes`/`edges`）と同一。

### 呼び出し例

```bash
curl -X POST "https://your-project-id.supabase.co/rest/v1/rpc/get_public_floor_data" \
  -H "apikey: your-anon-or-public-jwt-key" \
  -H "Content-Type: application/json" \
  -d '{"p_floor_id": 1}'
```

存在しない `floor_id` を指定した場合は空の `nodes`/`edges` を返す（エラーにはならない）。

---

## 4. `get_public_order_data()` — 並び順設定の取得（既存）

検索結果の並び順設定を取得する。パラメータは無し。

```bash
curl -X POST "https://your-project-id.supabase.co/rest/v1/rpc/get_public_order_data" \
  -H "apikey: your-anon-or-public-jwt-key" \
  -H "Content-Type: application/json" \
  -d "{}"
```

---

## キャッシュに関する推奨事項

いずれのRPCも呼び出しの都度Supabaseへ問い合わせを行うシンプルな実装。祭り当日は同一条件への参照が短時間に集中する可能性があるため、呼び出し側での実装においては **`get_public_all_floor_data()` のようなレスポンスが大きいAPIについて、60〜120秒程度クライアント側でキャッシュする** ことを推奨する（登録情報は祭り期間中に頻繁に変わるものではないため、多少の遅延は許容できる）。

## エラー時の挙動（4API共通）

- マップが非公開設定（`is_private = true`）の場合: RPCが例外 `Access Denied: Map is currently private.` を返す（HTTPステータス400番台、`error.message` にメッセージが入る）。
- 存在しない `floor_id` を指定した場合: 空配列（または空の `nodes`/`edges`）を返す（エラーにはならない）。
- 存在しない `code` を指定した場合: 空配列を返す（エラーにはならない）。
- `p_code` が `null` または空文字の場合: 空配列を返す。
- ネットワークエラー・タイムアウト時: HTTPレベルのエラーとして扱うこと。

## 実装（DB側）

`get_public_all_floor_data()` / `get_public_location_by_code(p_code text)` の実体は Supabase の RPC 関数。定義は `supabase/migrations/20260810120000_public_all_data_and_location_lookup.sql` を参照。`get_public_floor_data(p_floor_id int)` / `get_public_order_data()` は既存の公開RPCで、それぞれ従来のマイグレーションに定義がある。

## データモデル・関連ドキュメント

- [ADR0001: ロケーションID（`code`）の導入](../adr/0001-location-id-integration.md)
- [ADR0002: ロケーションIDの重複検出・未設定一覧](../adr/0002-location-id-duplicate-check-and-unassigned-list.md)
- [ADR0006: 階段・EVのロケーションID規格](../adr/0006-elevator-stairs-location-id-standard.md)
- `exhibits[]` によるノードあたり複数展示対応は2026-08-10導入（本ドキュメントの対象範囲）。1つの部屋（ノード）に複数の展示団体・企画を登録できる。
