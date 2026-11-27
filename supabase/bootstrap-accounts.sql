-- Historical one-time account bootstrap retired. It reset account roles and
-- global permissions and must not be rerun against an existing workspace.
-- Manage accounts through the administration workflow instead.
do $$
begin
  raise exception 'Account bootstrap is retired; use the administration workflow';
end;
$$;
