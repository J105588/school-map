-- Migration: Fix Passcode NULL Comparison Vulnerability and Secure Privacy Check
-- Date: 2026-06-03
-- Recreates functions to use NULL-safe comparisons.

-- B. 一般ユーザー向けフロアデータ取得
create or replace function get_public_floor_data(p_floor_id int)
returns table(floor_id int, nodes jsonb, edges jsonb)
language plpgsql
security definer
as $$
begin
  if coalesce((select (value)::boolean from settings where key = 'is_private'), false) then
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
  if coalesce((select (value)::boolean from settings where key = 'is_private'), false) then
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
  if p_admin_passcode is null or p_admin_passcode is distinct from (select value->>'admin_passcode' from settings where key = 'security') then
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
  if p_admin_passcode is null or p_admin_passcode is distinct from (select value->>'admin_passcode' from settings where key = 'security') then
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
  if p_admin_passcode is null or p_admin_passcode is distinct from (select value->>'admin_passcode' from settings where key = 'security') then
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
  if p_admin_passcode is null or p_admin_passcode is distinct from (select value->>'admin_passcode' from settings where key = 'security') then
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
  if p_admin_passcode is null or p_admin_passcode is distinct from (select value->>'admin_passcode' from settings where key = 'security') then
    raise exception 'Access Denied: Invalid admin passcode.';
  end if;
  
  insert into settings (key, value, updated_at)
  values ('is_private', to_jsonb(p_is_private), now())
  on conflict (key) do update
  set value = to_jsonb(p_is_private), updated_at = now();
  
  return true;
end;
$$;
