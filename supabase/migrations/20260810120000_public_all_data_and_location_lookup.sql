-- Migration: Public "All Data" API + Location ID (code) Lookup API
-- Date: 2026-08-10
-- 目的: 外部サイト等から本システムに登録されている全情報を取得できる公開APIを追加する。
--       既存の get_public_floor_data / get_public_order_data と同じパターン
--       (security definer, is_private チェックあり, パスコード不要) に従う。

-- I. 全フロア分の全登録情報を一括取得 (公開)
-- 既存の get_public_floor_data(p_floor_id) と同じ行形状 (floor_id, nodes, edges) を
-- 全フロア分まとめて返す。nodes 配列内の各ノードには展示情報 (exhibits) が含まれる。
create or replace function get_public_all_floor_data()
returns table(floor_id int, nodes jsonb, edges jsonb)
language plpgsql
security definer
as $$
begin
  if coalesce((select (value)::boolean from settings where key = 'is_private'), false) then
    raise exception 'Access Denied: Map is currently private.';
  end if;

  return query select m.floor_id, m.nodes, m.edges from map_data m order by m.floor_id;
end;
$$;

-- J. ロケーションID (code) 指定によるノード情報検索 (公開)
-- 大文字・半角に正規化 (upper/trim) した上で完全一致検索する。
-- 階段・エレベーターなど、複数フロアで同一 code を共有するノードが存在するため
-- (ADR 0006 を参照)、該当行が複数返る場合がある点に注意。
create or replace function get_public_location_by_code(p_code text)
returns table(floor_id int, node jsonb)
language plpgsql
security definer
as $$
begin
  if coalesce((select (value)::boolean from settings where key = 'is_private'), false) then
    raise exception 'Access Denied: Map is currently private.';
  end if;

  if p_code is null or trim(p_code) = '' then
    return;
  end if;

  return query
    select m.floor_id, elem.node
    from map_data m,
         lateral jsonb_array_elements(m.nodes) as elem(node)
    where upper(trim(elem.node ->> 'code')) = upper(trim(p_code));
end;
$$;
