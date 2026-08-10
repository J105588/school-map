# I-Compass (校内マップシステム)

市川学園文化祭向けのインタラクティブな校内マップ＆ナビゲーションシステムである。
文化祭や学校案内などで、来場者が目的の教室や施設を簡単に見つけられるように設計されている。

## 特徴

### マップ機能 (Visitor Mode)
*   **全フロア統合表示**: 1階〜5階をシームレスに切り替え・表示する。
*   **高度な検索機能**:
    *   **ロケーションID検索**: `N204`, `EN`, `STN-1`, `STN-2` などの識別コードによる隠しキー検索（来場者画面UI上ではロケーションID表記を非表示にし、清潔で読みやすい施設・イベント名を表示）。
    *   **キーワード検索**: 部屋名、企画名などの部分一致検索。
    *   **カテゴリフィルター**: トイレ、自販機、教室など種別ごとの絞り込み。
    *   **優先ソート**: 主要なスポット（エントランス、ホール等）を上位に表示。
*   **ナビゲーション**:
    *   現在地から目的地までの最短ルートを自動計算（ダイクストラ法）。
    *   階をまたぐ移動（階段・エレベーター）に対応。
    *   ステップバイステップのルート案内表示。
*   **UI/UX**:
    *   モバイルファーストなレスポンシブデザイン。
    *   コンパス（羅針盤）をモチーフにしたモダンでプレミアムなデザインテーマ「I-Compassテーマ」。
    *   スムーズなサイドバーナビゲーション。
    *   スムーズなズーム＆パン操作 (D3.js).
    *   **対話型チュートリアル (インタラクティブガイド)**:
        *   初回起動時に自動的に開始し、システムの機能（検索、QRスキャン、自動回転、バリアフリーモードなど）をステップバイステップで案内。
        *   設定メニューからいつでも再起動可能。
    *   **QRコードによる現在地スキャン**:
        *   校内各所のQRコードをカメラでスキャンし、瞬時に現在地をマップに自動セット。
    *   **マップ自動回転機能**:
        *   進行方向が常に「上」を向くようにマップを自動回転 (Heading Up)。
        *   ユーザーが設定でON/OFF切り替え可能（デフォルトON）。
        *   回転時も文字ラベルは常に水平を維持し、可読性を確保。
    *   **バリアフリーモード**:
        *   階段を回避し、エレベーターを優先するルート探索モード。
        *   設定モーダルからON/OFF切り替え可能。
    *   **動的なフロア表示**:
        *   ルートに関係のない中間階を薄く・小さく表示し、視認性を向上。

### URLパラメータによるAPI的拡張 (URL Query Parameters)
本システムは、公式サイト等の外部アプリやQRコード等からパラメータを付与することで、マップの状態（現在地・出発地、ロケーションID、目的地、フロア、動作モード等）をプログラム的・自動的に指定して起動できる。

#### 公式サイト連携・ロケーションID (Location ID / `code`) 規格
教室や各エリア、階層移動手段には固有のロケーションID（例: `N204`, `EN`, `STN-1`）を割り当て可能である。来場者向け画面 `map.html` では画面UI上の冗長なロケーションID表示を排除し、分かりやすい施設名・イベント名を表示しながら、バックグラウンドでのロケーションID検索およびURLパラメータマッチングを維持する。

##### 建築コード（館名プレフィックス）
*   **`N`**: 北館 (North Building)
*   **`S`**: 南館 (South Building)
*   **`M`**: 本館 (Main Building)
*   **`KH`**: 國枝記念国際ホール (Kunieda Memorial International Hall)
*   **`KA`**: 古賀記念アリーナ (Koga Memorial Arena)
*   **`U`**: 施設外 (Outside / Outdoor Facilities)

##### エレベーター・階段専用ロケーションID規格
*   **エレベーター (`E`)**: `EN`, `ES`, `EM`, `EN-1`, `EN-2`
*   **階段 (`ST`)**: `STN-1`, `STN-2`, `STS-1`, `STS-2`, `STM-1`, `STM-2`, `STM-3`

### エディタ機能 (Admin Mode)
`editor.html` からマップデータの作成・編集が可能である。
*   **全フロア ロケーションID・施設対応一覧表 ＆ CSV出力機能（館名判別完全修復）**:
    *   ヘッダー「対応表・CSV」ボタンから開く大型対応一覧表モーダル (`#location-mapping-modal`)。
    *   ロケーションIDプレフィックス（`N`→`北館`, `S`→`南館`, `M`→`本館`, `KH`→`国際ホール`, `KA`→`アリーナ`）を最優先判定キーに設定し、誤った館名表示を100%排除。
    *   全フロア (1F〜4F) のノードデータ（フロア・館名・ロケーションID・施設名・種別・接続ID・イベント・団体名・座標）を一括表示・リアルタイム検索・フロア/種別フィルター。
    *   `[CSVダウンロード]` ボタンにより UTF-8 BOM 付き CSV ファイル (`location_id_mapping.csv`) を即時エクスポート。Excel / Mac Numbers で文字化けせず閲覧・編集可能。
*   **完全自由な手動属性編集 ＆ 非破壊型自動補正**:
    *   管理者は属性編集パネル（Inspector）から、ノードの種別 (`type`)、部屋名 (`name`)、接続ID (`connectionId`)、ロケーションID (`code`) を100%自由に編集・個別修正可能。

## データベース構造 (Supabase / PostgreSQL)

本システムのデータストアは Supabase（マネージドPostgreSQL）である。マップデータそのものは `jsonb` 型のカラムにフロア単位で丸ごと格納するスキーマレスな構造を採用しており、ノード・エッジの内部構造（属性の追加等）を変更してもテーブル定義側のマイグレーションは不要という設計方針である。

### テーブル一覧

#### `map_data`
フロアごとのマップデータ（ノード・エッジ）を保持する。

| カラム | 型 | 説明 |
|---|---|---|
| `floor_id` | `integer` (PK) | フロアID（1〜4。`assets/js/config.js` の `AppConfig.FLOORS` と対応） |
| `nodes` | `jsonb` | ノード（教室・分岐点・階段等）の配列。構造は下記「ノードのJSON構造」を参照 |
| `edges` | `jsonb` | エッジ（ノード間の通路）の配列。構造は下記「エッジのJSON構造」を参照 |
| `updated_at` | `timestamptz` | 最終更新日時（保存時に自動更新） |

#### `settings`
キー・バリュー方式でシステム全体の設定を保持する。

| カラム | 型 | 説明 |
|---|---|---|
| `key` | `text` (PK) | 設定キー |
| `value` | `jsonb` | 設定値 |
| `updated_at` | `timestamptz` | 最終更新日時 |

現在使用されている `key` は以下の3つ：

| `key` | `value` の構造 | 説明 |
|---|---|---|
| `is_private` | `boolean` | `true` の間、一般ユーザー向け公開APIすべてがアクセス拒否になる（マップの一時非公開化） |
| `security` | `{ "admin_passcode": string }` | エディタ (`editor.html`) のログインに使う管理者パスコード |
| `order` | `{ "default": number, "items": { [キーワード]: number } }` | 検索結果・目的地一覧の並び順優先度。`items` は施設名/団体名に含まれるキーワードと優先度数値のマップ。数値が小さいほど上位表示 |

両テーブルとも Row Level Security (RLS) が有効化されており、匿名キー (anon key) から直接 `SELECT`/`INSERT`/`UPDATE` はできない。すべてのアクセスは下記の RPC 関数（`security definer`）経由に限定される。

### ノードのJSON構造 (`map_data.nodes[]` の各要素)

```json
{
  "id": 176434123,
  "x": 320,
  "y": 540,
  "type": "room",
  "name": "204教室",
  "code": "N204",
  "connectionId": "",
  "barrierFreeBlocked": false,
  "exhibits": [
    { "id": "ex_lz3k9a2b1", "organization": "1年A組", "eventName": "お化け屋敷" }
  ]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | number/string | 必須 | フロア内で一意なノードID |
| `x`, `y` | number | 必須 | フロア画像上の座標 |
| `type` | string | 必須 | `junction`(廊下・分岐点) / `room`(教室) / `toilet` / `stairs` / `elevator` / `entrance` / `entrance_only`(入口専用) / `exit_only`(出口専用) / `vending`(自販機) / `area`(エリア) / `others` |
| `name` | string | 必須 | 表示部屋名（「展示場所」として来場者にも表示される。展示の有無に関わらず不変） |
| `code` | string | 任意 | ロケーションID（例: `N204`）。詳細は `docs/adr/0001` を参照。同一フロア/全フロアでの重複は原則不可（階段・EVのみ例外、`docs/adr/0006`） |
| `connectionId` | string | 任意 | 階段・EVをフロア間で連結するための識別子 |
| `barrierFreeBlocked` | boolean | 任意 | `true` の場合、バリアフリー経路探索でこのノードを通行不可として扱う |
| `exhibits` | array | 任意 | この場所に登録されている展示の配列。**1つの部屋（ノード）に複数の展示を登録できる**。各要素は `{ id, organization, eventName }`。来場者向け表示は `[organization]「eventName」` 形式（`organization` が空なら `「eventName」` のみ） |

> 旧バージョンでは `eventName`/`organization` が1件のみのトップレベル単一文字列フィールドだった。現在はアプリ側の読み込み処理で自動的に `exhibits[0]` へ変換され、旧フィールドは削除される（詳細は `docs/api/public-api.md` の移行時の注意点を参照）。

### エッジのJSON構造 (`map_data.edges[]` の各要素)

```json
{ "from": 176434123, "to": 176434200, "dist": 42, "barrierFreeBlocked": false }
```

| フィールド | 型 | 説明 |
|---|---|---|
| `from`, `to` | number/string | 接続する2つのノードID（同一フロア内） |
| `dist` | number | 経路探索（ダイクストラ法）で使う距離コスト |
| `barrierFreeBlocked` | boolean | `true` の場合、バリアフリーモードではこのエッジを通行不可として扱う |

フロアをまたぐ移動（階段・EV）はDB上にエッジとして保存されているわけではなく、`assets/js/map-core.js` がロード時に `code`/`connectionId`/`name` を突き合わせて仮想的な階間エッジ（ゴーストグラフ）を動的に構築する（詳細は `CONTEXT.md` の「階層間垂直接続判定アルゴリズム」を参照）。

### RPC関数一覧 (`supabase/supabase_setup.sql` + `supabase/migrations/`)

すべて `language plpgsql`, `security definer` で定義されており、匿名キーからの直接テーブルアクセスを禁止する代わりに、関数内部でアクセス制御ロジック（非公開判定・パスコード照合）を実行する。

| 関数名 | 認証 | 用途 |
|---|---|---|
| `get_map_status()` | 不要（公開） | マップが非公開設定かどうかを返す（`boolean`） |
| `get_public_floor_data(p_floor_id int)` | 不要（公開） | 指定フロア1件分の `nodes`/`edges` を取得 |
| `get_public_order_data()` | 不要（公開） | 検索結果の並び順設定 (`order`) を取得 |
| `get_public_all_floor_data()` | 不要（公開） | **全フロア分の `nodes`/`edges` を一括取得**（2026-08-10追加） |
| `get_public_location_by_code(p_code text)` | 不要（公開） | ロケーションID (`code`) 指定でノードを検索（2026-08-10追加。階段/EVは複数行返る場合あり） |
| `get_admin_floor_data(p_floor_id int, p_admin_passcode text)` | 管理者パスコード | エディタ用: 指定フロアのデータを取得 |
| `get_admin_order_data(p_admin_passcode text)` | 管理者パスコード | エディタ用: 並び順設定を取得 |
| `save_floor_data(p_floor_id int, p_nodes jsonb, p_edges jsonb, p_admin_passcode text)` | 管理者パスコード | エディタ用: フロアデータを upsert 保存 |
| `save_order_data(p_order jsonb, p_admin_passcode text)` | 管理者パスコード | エディタ用: 並び順設定を保存 |
| `set_map_privacy(p_is_private boolean, p_admin_passcode text)` | 管理者パスコード | マップの公開/非公開を切り替え |

公開系（`get_public_*`）はすべて `settings.is_private` が `true` の間、例外 `Access Denied: Map is currently private.` を投げてアクセスを拒否する。管理者系（`get_admin_*`/`save_*`/`set_map_privacy`）は `p_admin_passcode` が `settings.security.admin_passcode` と一致しない場合に `Access Denied: Invalid admin passcode.` を投げる（`is distinct from` によるNULLセーフ比較）。

外部サイト等からの利用を想定した公開APIの詳細（リクエスト/レスポンス例、curlサンプル、エラーケース）は **`docs/api/public-api.md`** に別途まとめてある。

### マイグレーション運用ルール

スキーマ変更（RPC関数の追加・変更を含む）は `supabase/supabase_setup.sql` を直接書き換えず、`supabase/migrations/` 配下に `YYYYMMDDHHMMSS_変更内容.sql` 形式の新規ファイルを追加する形で行う（Supabase SQLエディタで順番に実行する運用）。現在のマイグレーション一覧：

*   `20260603231500_fix_passcode_null_comparison.sql`: パスコード比較のNULL安全化・セキュリティ修正
*   `20260810120000_public_all_data_and_location_lookup.sql`: 全データ一括取得API・ロケーションID検索APIの追加

### データ投入・移行スクリプト

*   `migrate-to-supabase.js`: 旧バージョン（ローカル `JSON/` ディレクトリでデータを管理していた時代）から Supabase へ一括移行するための対話式Node.jsスクリプト。現行運用では使用しない（過去の移行作業の記録として残置）。
*   `supabase_insert_data.sql`: 移行時に生成されたマップデータの初期投入用SQL（過去のスナップショット。現在の正データはSupabase上の `map_data` テーブルそのもの）。

## 動作環境

本システムはモダンブラウザ（Chrome, Safari, Edge, Firefox）で動作する。
ES Modules (`import/export`) および `fetch` API を使用しているため、ローカルで動作させる場合は簡易的なWebサーバーが必要である。

### ローカルでの起動方法 (例: Python)

```bash
# プロジェクトリポジトリに移動
cd school-map

# HTTPサーバーを起動
python -m http.server 8000

# ブラウザでアクセス
# マップ: http://localhost:8000/map.html
# エディタ: http://localhost:8000/editor.html
# QRコード生成: http://localhost:8000/qr.html
```

## ファイル構成

### 画面 (エントリーポイント)
*   `index.html`: `map.html` への自動リダイレクト用ファイル
*   `map.html`: 一般利用者向けマップ画面。DBが非公開設定の場合、スクリプト読み込み前にブロックする軽量な事前チェックを内蔵
*   `editor.html`: 管理者向けマップデータ編集画面（パスコード認証必須）。ノード/エッジの作成・編集、展示情報の複数登録、ロケーションID管理、CSV/JSON入出力、Supabase直接保存などを担う単一HTMLファイル
*   `qr.html`: 各地点のQRコード・案内プラカードを一括生成する管理者向け画面

### JavaScript (`assets/js/`)
*   `config.js`: `AppConfig`（Supabase接続情報、フロア定義、表示スタイル定数）
*   `supabase-client.js`: `SupabaseClient` — 全RPC呼び出しのラッパーおよび管理者パスコード認証UI
*   `map-core.js`: `MapEngine` — Canvas描画、ズーム/パン、フロア間ゴーストグラフ構築、ダイクストラ法による経路探索
*   `ui-controller.js`: `UIController`/`CustomSelect` — サイドバー、検索・目的地選択、ルート案内表示、URLパラメータ解析
*   `tutorial.js`: 初回起動時の対話型チュートリアル制御

### スタイル (`assets/css/`)
*   `style.css`: 全画面共通のデザインテーマ（配色トークン、コンポーネントスタイル）
*   `qr-button.css`: QRスキャンボタン関連スタイル

### データベース・API
*   `supabase/supabase_setup.sql`: 初期セットアップ用SQL（テーブル定義・初期RPC関数群）。新規スキーマ変更はここを直接編集せず `migrations/` に追加する
*   `supabase/migrations/`: 増分マイグレーションSQL（詳細は上記「データベース構造」章を参照）
*   `migrate-to-supabase.js` / `supabase_insert_data.sql`: 過去のJSONファイルベース運用からの移行に使用したスクリプト（現行運用では不使用）
*   `docs/api/public-api.md`: 外部連携向け公開APIの詳細仕様（リクエスト/レスポンス例、エラーケース）

### ドキュメント
*   `CONTEXT.md`: システムのドメインモデル・用語集・パラメータ仕様
*   `docs/adr/0001-location-id-integration.md`: ロケーションID連携の建築決定記録 (ADR 0001)
*   `docs/adr/0002-location-id-duplicate-check-and-unassigned-list.md`: 重複検出および未設定一覧機能の建築決定記録 (ADR 0002)
*   `docs/adr/0003-rapid-unassigned-location-id-editing-flow.md`: 全フロア未設定ID一括表示と即時属性編集入力フローの建築決定記録 (ADR 0003)
*   `docs/adr/0004-floating-unassigned-location-id-window.md`: 画面左フローティング未設定ID一覧ウィンドウの建築決定記録 (ADR 0004)
*   `docs/adr/0005-building-floor-location-id-counter-window.md`: 館・フロア別ID使用最大番号＆推奨採番カウンターウィンドウの建築決定記録 (ADR 0005)
*   `docs/adr/0006-elevator-stairs-location-id-standard.md`: エレベーター・階段専用ロケーションID規格と既存データ自動補正の建築決定記録 (ADR 0006)

### その他
*   `assets/favicon.svg`, `assets/`: 静的リソース
*   `images/`: フロア図面画像
*   `location_id_mapping_20260808.csv`: ロケーションID対応表のエクスポート例（`editor.html` の「対応表・CSV」機能で生成されるものと同形式）

## Copyright

&copy; 2026 市川学園 & Junxiang Jin. All rights reserved.
