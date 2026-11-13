begin;

do $repair$
declare
  definition text := pg_get_functiondef('public.vecin_apply(jsonb)'::regprocedure);
  corrected text;
begin
  if strpos(definition, 'update public.vecin_revision set revision = revision + 1 where id = true;') > 0 then
    return;
  end if;
  corrected := replace(
    definition,
    'update public.vecin_revision set revision = revision + 1;',
    'update public.vecin_revision set revision = revision + 1 where id = true;'
  );
  if corrected = definition then
    raise exception 'Funcția vecin_apply diferă de versiunea așteptată. Verifică definiția înainte de modificare.';
  end if;
  execute corrected;
end;
$repair$;

commit;

select strpos(
  pg_get_functiondef('public.vecin_apply(jsonb)'::regprocedure),
  'update public.vecin_revision set revision = revision + 1 where id = true;'
) > 0 as revision_update_fixed;
