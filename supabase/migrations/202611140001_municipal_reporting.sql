begin;

alter table vecin.pins add column reported_to_municipality boolean not null default false;

create or replace function public.vecin_snapshot()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name))
      from vecin.profiles
    ), '[]'::jsonb),
    'pins', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'authorId', p.author, 'type', p.type, 'title', p.title, 'description', p.description,
        'place', p.place, 'category', p.category, 'location', jsonb_build_object('lon', p.lon, 'lat', p.lat),
        'status', p.status, 'reportedToMunicipality', p.reported_to_municipality, 'startsAt', p.starts_at, 'endsAt', p.ends_at, 'capacity', p.capacity,
        'relatedId', p.related_id, 'createdAt', p.created_at, 'changedAt', p.changed_at, 'imagePath', p.image_path,
        'participants', array(select user_id from vecin.participants where pin_id = p.id),
        'supports', array(select user_id from vecin.supports where pin_id = p.id)
      )) order by p.created_at desc)
      from vecin.pins p where not p.deleted
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'pinId', m.pin_id, 'authorId', m.author, 'body', m.body, 'createdAt', m.created_at))
      from vecin.pins p cross join lateral (
        select id, pin_id, author, body, created_at from vecin.messages
        where pin_id = p.id order by created_at desc, id desc limit 100
      ) m where not p.deleted
    ), '[]'::jsonb),
    'saved', case when auth.uid() is null then '{}'::jsonb else
      jsonb_build_object(auth.uid()::text, array(
        select s.pin_id from vecin.saved s join vecin.pins p on p.id = s.pin_id
        where s.user_id = auth.uid() and not p.deleted
      )) end,
    'flags', '[]'::jsonb
  );
$$;

create function public.vecin_set_municipal_reported(target uuid, reported boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or reported is null then
    raise exception 'Conectează-te pentru a actualiza marcajul.';
  end if;
  update vecin.pins set reported_to_municipality = reported
  where id = target and author = auth.uid() and type = 'report' and not deleted;
  if not found then
    raise exception 'Doar autorul poate actualiza marcajul sesizării.';
  end if;
  update public.vecin_revision set revision = revision + 1 where id = true;
  return public.vecin_snapshot();
end;
$$;

revoke all on function public.vecin_set_municipal_reported(uuid, boolean) from public, anon, authenticated;
grant execute on function public.vecin_set_municipal_reported(uuid, boolean) to authenticated;

commit;
