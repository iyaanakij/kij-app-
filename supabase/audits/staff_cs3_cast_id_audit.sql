-- staff.cs3_cast_id 移行前後の監査SQL。
-- 実データ更新はしない。自動反映は shift-sync/scripts/74-audit-staff-cs3-links.js を使う。

-- 1. staff側の同名重複
select
  name,
  count(*) as staff_count,
  array_agg(id order by id) as staff_ids,
  array_agg(cs3_cast_id order by id) filter (where cs3_cast_id is not null) as linked_cs3_cast_ids
from staff
group by name
having count(*) > 1
order by name;

-- 2. publish_rules側の同名・複数CS3 ID
with cast_names as (
  select
    cs3_cast_id,
    nullif(trim(max(cast_name)), '') as cast_name
  from publish_rules
  group by cs3_cast_id
)
select
  cast_name,
  count(*) as cs3_id_count,
  array_agg(cs3_cast_id order by cs3_cast_id) as cs3_cast_ids
from cast_names
where cast_name is not null
group by cast_name
having count(*) > 1
order by cast_name;

-- 3. 完全一致で自動確定できる候補
with rule_casts as (
  select
    cs3_cast_id,
    nullif(trim(max(cast_name)), '') as cast_name,
    count(*) as rule_rows,
    count(*) filter (where enabled) as enabled_rows,
    bool_or(cp4_gid is not null and cp4_gid <> '') as has_cp4,
    bool_or(venrey_cast_id is not null and venrey_cast_id <> '') as has_venrey
  from publish_rules
  group by cs3_cast_id
),
staff_name_counts as (
  select name, count(*) as staff_count
  from staff
  group by name
),
rule_name_counts as (
  select cast_name, count(*) as cs3_id_count
  from rule_casts
  where cast_name is not null
  group by cast_name
)
select
  rc.cs3_cast_id,
  rc.cast_name,
  s.id as staff_id,
  s.name as staff_name,
  rc.enabled_rows,
  rc.has_cp4,
  rc.has_venrey
from rule_casts rc
join staff s on s.name = rc.cast_name
join staff_name_counts snc on snc.name = s.name and snc.staff_count = 1
join rule_name_counts rnc on rnc.cast_name = rc.cast_name and rnc.cs3_id_count = 1
where rc.cast_name is not null
  and s.cs3_cast_id is null
order by rc.cast_name;

-- 4. 要確認候補
with rule_casts as (
  select
    cs3_cast_id,
    nullif(trim(max(cast_name)), '') as cast_name,
    count(distinct nullif(trim(cast_name), '')) as distinct_name_count,
    count(*) filter (where enabled) as enabled_rows,
    bool_or(cp4_gid is not null and cp4_gid <> '') as has_cp4,
    bool_or(venrey_cast_id is not null and venrey_cast_id <> '') as has_venrey
  from publish_rules
  group by cs3_cast_id
),
staff_name_counts as (
  select name, count(*) as staff_count, array_agg(id order by id) as staff_ids
  from staff
  group by name
),
rule_name_counts as (
  select cast_name, count(*) as cs3_id_count
  from rule_casts
  where cast_name is not null
  group by cast_name
)
select
  case
    when rc.cast_name is null or rc.distinct_name_count <> 1 then 'publish_rules_name_conflict_or_blank'
    when snc.staff_count is null then 'staff_name_not_found'
    when snc.staff_count > 1 then 'multiple_staff_same_name'
    when rnc.cs3_id_count > 1 then 'multiple_cs3_ids_same_name'
    else 'manual_review'
  end as reason,
  rc.cs3_cast_id,
  rc.cast_name,
  snc.staff_ids,
  rc.enabled_rows,
  rc.has_cp4,
  rc.has_venrey
from rule_casts rc
left join staff_name_counts snc on snc.name = rc.cast_name
left join rule_name_counts rnc on rnc.cast_name = rc.cast_name
where not (
  rc.cast_name is not null
  and rc.distinct_name_count = 1
  and snc.staff_count = 1
  and rnc.cs3_id_count = 1
)
order by reason, rc.cast_name nulls last, rc.cs3_cast_id;

