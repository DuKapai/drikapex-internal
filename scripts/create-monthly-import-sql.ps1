param(
  [Parameter(Mandatory = $true)][string]$InputJson,
  [Parameter(Mandatory = $true)][string]$OutputSql,
  [string]$MappingJson
)

$ErrorActionPreference = 'Stop'
$json = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $InputJson).Path, [System.Text.Encoding]::UTF8)
$parsed = ConvertFrom-Json -InputObject $json
if (@($parsed).Count -eq 0) { throw 'Input contains no rows.' }
$tag = '$import_' + [guid]::NewGuid().ToString('N') + '$'
if ($json.Contains($tag)) { throw 'Unexpected SQL delimiter in input.' }
$mapping = '[]'
if ($MappingJson) {
  $mapping = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MappingJson).Path, [System.Text.Encoding]::UTF8)
  $null = ConvertFrom-Json -InputObject $mapping
}
$mappingTag = '$mapping_' + [guid]::NewGuid().ToString('N') + '$'
if ($mapping.Contains($mappingTag)) { throw 'Unexpected SQL delimiter in mapping.' }
$statement = @'
-- Review this script and take a database backup before running it.
-- Run only after monthly-tasks.sql. Unmatched/ambiguous names remain unassigned.
begin;
create temporary table monthly_import_stage on commit drop as
select *
from jsonb_to_recordset(__JSON__::jsonb) as x(
  source_key text, report_month date, title text, priority text,
  source_assignee text, status text, work_date text, note text
);

create temporary table monthly_import_mapping on commit drop as
select * from jsonb_to_recordset(__MAPPING__::jsonb) as x(source_assignee text, profile_name text);

do $$
begin
  if exists (
    select 1 from monthly_import_mapping m
    where nullif(btrim(m.source_assignee), '') is null
      or nullif(btrim(m.profile_name), '') is null
      or not exists (select 1 from monthly_import_stage s where s.source_assignee = m.source_assignee)
      or (select count(*) from public.profiles p
          where p.status = 'ACTIVE' and p.display_name = m.profile_name) <> 1
  ) or exists (
    select 1 from monthly_import_mapping group by source_assignee having count(*) > 1
  ) then
    raise exception 'Invalid import mapping: check source names and unique active profile names';
  end if;
end $$;

with matches as (
  select s.source_key,
    case when count(distinct p.id) = 1 then (array_agg(distinct p.id))[1] else null end as assignee_id
  from monthly_import_stage s
  left join monthly_import_mapping mapping on mapping.source_assignee = s.source_assignee
  left join public.profiles p on p.status = 'ACTIVE' and nullif(btrim(s.source_assignee), '') is not null
    and (
      (mapping.source_assignee is not null and p.display_name = mapping.profile_name)
      or (mapping.source_assignee is null and (
        lower(btrim(p.display_name)) = lower(btrim(s.source_assignee))
        or lower(btrim(p.username)) = lower(btrim(s.source_assignee))
        or exists (
          select 1 from public.employees e where e.id = p.employee_id
            and lower(btrim(e.full_name)) = lower(btrim(s.source_assignee))
        )
      ))
    )
  group by s.source_key
)
insert into public.monthly_tasks
  (source_key, report_month, title, priority, assignee_id, source_assignee, status, work_date, note, created_by)
select s.source_key, s.report_month, s.title, nullif(s.priority, ''), m.assignee_id,
  nullif(s.source_assignee, ''), nullif(s.status, ''), nullif(s.work_date, '')::date,
  nullif(s.note, ''), null
from monthly_import_stage s join matches m using (source_key)
on conflict (source_key) do nothing;

select t.report_month, count(*) as rows, count(*) filter (where t.assignee_id is null) as unmatched,
  count(*) filter (where t.work_date is not null
    and date_trunc('month', t.work_date)::date <> t.report_month) as date_mismatches
from public.monthly_tasks t join monthly_import_stage s using (source_key)
group by t.report_month order by t.report_month;

select t.source_assignee, count(*) as unmatched_rows
from public.monthly_tasks t join monthly_import_stage s using (source_key)
where t.assignee_id is null
group by t.source_assignee order by unmatched_rows desc;
commit;
'@
$statement = $statement.Replace('__JSON__', $tag + $json + $tag)
$statement = $statement.Replace('__MAPPING__', $mappingTag + $mapping + $mappingTag)
[System.IO.File]::WriteAllText($OutputSql, $statement, [System.Text.UTF8Encoding]::new($false))
Write-Output "SQL prepared. Review it, back up the database, then run in the correct Supabase SQL editor."
