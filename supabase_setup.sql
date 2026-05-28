-- -------------------------------------------------------------
-- I-Compass Supabase セットアップ SQL
-- このスクリプトを Supabase の SQL エディタに貼り付けて実行してください。
-- -------------------------------------------------------------

-- 1. テーブルの作成
create table if not exists map_data (
    floor_id integer primary key,
    nodes jsonb not null,
    edges jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists settings (
    key text primary key,
    value jsonb not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. 行レベルセキュリティ (RLS) の有効化
-- これにより、パブリックの匿名キー (anon) からのテーブルへの直接 SELECT/INSERT/UPDATE を遮断します。
alter table map_data enable row level security;
alter table settings enable row level security;

-- 3. 初期設定値の投入
insert into settings (key, value)
values 
  ('is_private', 'false'::jsonb),
  ('security', '{"admin_passcode": "admin123"}'::jsonb),
  ('order', '{"default": 9999, "items": {}}'::jsonb)
on conflict (key) do nothing;

-- -------------------------------------------------------------
-- 4. データベース関数 (RPC) の作成
-- SECURITY DEFINER 属性を使用し、データベース管理者権限で実行させつつ、
-- 内部ロジックでアクセス可否を判定します。
-- -------------------------------------------------------------

-- A. 公開状態チェック (パブリック)
create or replace function get_map_status()
returns boolean
language plpgsql
security definer
as $$
declare
  v_is_private boolean;
begin
  select (value)::boolean into v_is_private from settings where key = 'is_private';
  return coalesce(v_is_private, false);
end;
$$;

-- B. 一般ユーザー向けフロアデータ取得
create or replace function get_public_floor_data(p_floor_id int)
returns table(floor_id int, nodes jsonb, edges jsonb)
language plpgsql
security definer
as $$
begin
  if (select (value)::boolean from settings where key = 'is_private') then
    raise exception 'Access Denied: Map is currently private.';
  end if;
  
  return query select m.floor_id, m.nodes, m.edges from map_data m where m.floor_id = p_floor_id;
end;
$$;

-- C. 一般ユーザー向け並び順データ取得
create or replace function get_public_order_data()
returns jsonb
language plpgsql
security definer
as $$
begin
  if (select (value)::boolean from settings where key = 'is_private') then
    raise exception 'Access Denied: Map is currently private.';
  end if;
  
  return (select value from settings where key = 'order');
end;
$$;

-- D. 管理者向けフロアデータ取得
create or replace function get_admin_floor_data(p_floor_id int, p_admin_passcode text)
returns table(floor_id int, nodes jsonb, edges jsonb)
language plpgsql
security definer
as $$
begin
  if p_admin_passcode is null or p_admin_passcode != (select value->>'admin_passcode' from settings where key = 'security') then
    raise exception 'Access Denied: Invalid admin passcode.';
  end if;
  
  return query select m.floor_id, m.nodes, m.edges from map_data m where m.floor_id = p_floor_id;
end;
$$;

-- E. 管理者向け並び順データ取得
create or replace function get_admin_order_data(p_admin_passcode text)
returns jsonb
language plpgsql
security definer
as $$
begin
  if p_admin_passcode is null or p_admin_passcode != (select value->>'admin_passcode' from settings where key = 'security') then
    raise exception 'Access Denied: Invalid admin passcode.';
  end if;
  
  return (select value from settings where key = 'order');
end;
$$;

-- F. 管理者向けフロアデータ保存 (Upsert)
create or replace function save_floor_data(p_floor_id int, p_nodes jsonb, p_edges jsonb, p_admin_passcode text)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_admin_passcode is null or p_admin_passcode != (select value->>'admin_passcode' from settings where key = 'security') then
    raise exception 'Access Denied: Invalid admin passcode.';
  end if;
  
  insert into map_data (floor_id, nodes, edges, updated_at)
  values (p_floor_id, p_nodes, p_edges, now())
  on conflict (floor_id) do update
  set nodes = p_nodes, edges = p_edges, updated_at = now();
  
  return true;
end;
$$;

-- G. 管理者向け並び順データ保存
create or replace function save_order_data(p_order jsonb, p_admin_passcode text)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_admin_passcode is null or p_admin_passcode != (select value->>'admin_passcode' from settings where key = 'security') then
    raise exception 'Access Denied: Invalid admin passcode.';
  end if;
  
  insert into settings (key, value, updated_at)
  values ('order', p_order, now())
  on conflict (key) do update
  set value = p_order, updated_at = now();
  
  return true;
end;
$$;

-- H. 公開・非公開状態の切り替え
create or replace function set_map_privacy(p_is_private boolean, p_admin_passcode text)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_admin_passcode is null or p_admin_passcode != (select value->>'admin_passcode' from settings where key = 'security') then
    raise exception 'Access Denied: Invalid admin passcode.';
  end if;
  
  insert into settings (key, value, updated_at)
  values ('is_private', to_jsonb(p_is_private), now())
  on conflict (key) do update
  set value = to_jsonb(p_is_private), updated_at = now();
  
  return true;
end;
$$;
