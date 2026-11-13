begin;

create schema vecin;
revoke all on schema vecin from public, anon, authenticated;

create table vecin.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 40)
);

create table vecin.pins (
  id uuid primary key,
  author uuid not null references vecin.profiles on delete cascade,
  type text not null check (type in ('report', 'activity', 'discussion')),
  title text not null check (char_length(title) between 5 and 100),
  description text not null check (char_length(description) between 10 and 2000),
  category text not null,
  place text not null check (char_length(place) <= 100),
  lon double precision not null check (lon between -180 and 180),
  lat double precision not null check (lat between -90 and 90),
  image_path text unique,
  related_id uuid references vecin.pins on delete set null,
  status text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity integer check (capacity between 1 and 500),
  created_at timestamptz not null default now(),
  changed_at timestamptz,
  deleted boolean not null default false,
  check (
    (type = 'activity' and status in ('active', 'cancelled') and starts_at is not null and ends_at > starts_at)
    or (type = 'report' and status in ('open', 'resolved') and starts_at is null and ends_at is null and capacity is null and (deleted or image_path is not null))
    or (type = 'discussion' and status = 'open' and starts_at is null and ends_at is null and capacity is null and image_path is null)
  )
);

create table vecin.participants (
  pin_id uuid references vecin.pins on delete cascade,
  user_id uuid references vecin.profiles on delete cascade,
  primary key (pin_id, user_id)
);
create table vecin.supports (like vecin.participants including indexes);
alter table vecin.supports
  add foreign key (pin_id) references vecin.pins on delete cascade,
  add foreign key (user_id) references vecin.profiles on delete cascade;
create table vecin.saved (
  user_id uuid references vecin.profiles on delete cascade,
  pin_id uuid references vecin.pins on delete cascade,
  primary key (user_id, pin_id)
);
create table vecin.messages (
  id uuid primary key,
  pin_id uuid not null references vecin.pins on delete cascade,
  author uuid not null references vecin.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index vecin_messages_pin_time on vecin.messages (pin_id, created_at desc);
create table vecin.flags (
  pin_id uuid references vecin.pins on delete cascade,
  user_id uuid references vecin.profiles on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  primary key (pin_id, user_id)
);

alter table vecin.profiles enable row level security;
alter table vecin.pins enable row level security;
alter table vecin.participants enable row level security;
alter table vecin.supports enable row level security;
alter table vecin.saved enable row level security;
alter table vecin.messages enable row level security;
alter table vecin.flags enable row level security;

-- Realtime announces a change. The snapshot still applies access rules per caller.
create table public.vecin_revision (
  id boolean primary key default true check (id),
  revision bigint not null default 0
);
insert into public.vecin_revision default values;
alter table public.vecin_revision enable row level security;
revoke all on public.vecin_revision from public, anon, authenticated;
grant select on public.vecin_revision to anon, authenticated;
create policy "Community revision is readable" on public.vecin_revision for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.vecin_revision;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vecin-photos', 'vecin-photos', true, 1000000, array['image/webp', 'image/png', 'image/jpeg']);

create policy "Upload photos in your folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'vecin-photos' and split_part(name, '/', 1) = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png|jpg)$'
);

create function public.vecin_photo_is_unused(object_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select split_part(object_name, '/', 1) = auth.uid()::text
    and not exists (select from vecin.pins where image_path = object_name and not deleted);
$$;
revoke all on function public.vecin_photo_is_unused(text) from public, anon, authenticated;
grant execute on function public.vecin_photo_is_unused(text) to authenticated;

create policy "Read metadata for own uploads" on storage.objects for select to authenticated
using (bucket_id = 'vecin-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy "Delete own unused uploads" on storage.objects for delete to authenticated
using (bucket_id = 'vecin-photos' and public.vecin_photo_is_unused(name));

create function public.vecin_snapshot()
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
        'status', p.status, 'startsAt', p.starts_at, 'endsAt', p.ends_at, 'capacity', p.capacity,
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
revoke all on function public.vecin_snapshot() from public, anon, authenticated;
grant execute on function public.vecin_snapshot() to anon, authenticated;

create function public.vecin_apply(action jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  operation text := action->>'type';
  target uuid := coalesce(action->>'pinId', action->>'id')::uuid;
  item vecin.pins%rowtype;
  input jsonb := action->'input';
  kind text := input->>'type';
  photo text := nullif(input->>'imagePath', '');
  related uuid := (input->>'relatedId')::uuid;
  start_time timestamptz;
  end_time timestamptz;
  max_people integer;
  category_name text := input->>'category';
  old_photo text;
  desired boolean := (action->>'enabled')::boolean;
  nickname text;
begin
  if actor is null then raise exception 'Conectează-te pentru a continua.'; end if;
  select left(btrim(raw_user_meta_data->>'display_name'), 40) into nickname from auth.users where id = actor;
  insert into vecin.profiles (id, name)
  values (actor, case when char_length(nickname) >= 2 then nickname else 'Vecin ' || left(actor::text, 6) end)
  on conflict (id) do nothing;

  if operation = 'deleteMessage' then
    delete from vecin.messages where id = (action->>'messageId')::uuid and author = actor;
    if not found then raise exception 'Poți șterge doar mesajele tale.'; end if;
  elsif operation = 'create' or operation = 'edit' then
    if operation = 'edit' then
      select * into item from vecin.pins where id = target and not deleted for update;
      if not found or item.author <> actor then raise exception 'Doar autorul poate edita acest pin.'; end if;
      if item.type is distinct from kind then raise exception 'Tipul pinului nu se poate schimba.'; end if;
      if item.type = 'activity' and item.starts_at <= now() then raise exception 'Activitatea a început deja.'; end if;
    elsif exists (select from vecin.pins where id = target and author = actor and not deleted) then
      return jsonb_build_object('state', public.vecin_snapshot());
    end if;

    if not coalesce(case kind
      when 'report' then category_name in ('Infrastructură', 'Curățenie', 'Spații verzi', 'Iluminat', 'Accesibilitate')
      when 'activity' then category_name in ('Voluntariat', 'Sport', 'Social', 'Cultură')
      when 'discussion' then category_name in ('Idei pentru cartier', 'Întrebare', 'Recomandări')
      end, false) then raise exception 'Alege o categorie validă.'; end if;
    if jsonb_typeof(input#>'{location,lat}') is distinct from 'number'
      or jsonb_typeof(input#>'{location,lon}') is distinct from 'number' then
      raise exception 'Alege o locație validă.';
    end if;
    if kind = 'activity' then
      start_time := (input->>'startsAt')::timestamptz;
      end_time := (input->>'endsAt')::timestamptz;
      max_people := (input->>'capacity')::integer;
      if start_time is null or end_time is null or start_time <= now() or end_time <= start_time then
        raise exception 'Alege o dată de început în viitor și o dată de sfârșit după început.';
      end if;
      if max_people < (select count(*) from vecin.participants where pin_id = target) then
        raise exception 'Capacitatea este mai mică decât numărul participanților.';
      end if;
    end if;
    if related is not null and (kind <> 'activity' or not exists (
      select from vecin.pins where id = related and type = 'report' and (not deleted or item.related_id = related)
    )) then raise exception 'Sesizarea asociată nu mai este disponibilă.'; end if;
    if kind = 'report' and photo is null then raise exception 'Adaugă o fotografie.'; end if;
    if photo is not null and (
      split_part(photo, '/', 1) <> actor::text or split_part(photo, '/', 2) <> target::text
      or not exists (select from storage.objects where bucket_id = 'vecin-photos' and name = photo for share)
    ) then raise exception 'Fotografia nu este disponibilă.'; end if;

    if operation = 'create' then
      insert into vecin.pins (id, author, type, title, description, category, place, lat, lon,
        image_path, related_id, status, starts_at, ends_at, capacity)
      values (target, actor, kind, btrim(input->>'title'), btrim(input->>'description'), category_name,
        btrim(coalesce(input->>'place', '')), (input#>>'{location,lat}')::double precision, (input#>>'{location,lon}')::double precision,
        photo, related, case when kind = 'activity' then 'active' else 'open' end, start_time, end_time, max_people);
      if kind = 'activity' then insert into vecin.participants values (target, actor); end if;
    else
      if item.image_path is distinct from photo then old_photo := item.image_path; end if;
      update vecin.pins set title = btrim(input->>'title'), description = btrim(input->>'description'),
        category = category_name, place = btrim(coalesce(input->>'place', '')),
        lat = (input#>>'{location,lat}')::double precision, lon = (input#>>'{location,lon}')::double precision,
        image_path = photo, starts_at = start_time, ends_at = end_time, capacity = max_people, changed_at = now()
      where id = target;
    end if;
  else
    select * into item from vecin.pins where id = target and not deleted for update;
    if not found then raise exception 'Acest pin nu mai este disponibil.'; end if;
    if operation in ('resolve', 'cancel', 'delete') and item.author <> actor then
      raise exception 'Doar autorul poate face această modificare.';
    end if;
    case operation
      when 'support' then
        if item.type <> 'report' or item.status <> 'open' or item.author = actor then raise exception 'Nu poți confirma această sesizare.'; end if;
        if coalesce(desired, not exists (select from vecin.supports where pin_id = target and user_id = actor)) then
          insert into vecin.supports values (target, actor) on conflict do nothing;
        else delete from vecin.supports where pin_id = target and user_id = actor;
        end if;
      when 'join' then
        if item.type <> 'activity' or item.status <> 'active' or item.starts_at <= now() or item.author = actor then
          raise exception 'Înscrierile nu sunt disponibile.';
        end if;
        if coalesce(desired, not exists (select from vecin.participants where pin_id = target and user_id = actor)) then
          if not exists (select from vecin.participants where pin_id = target and user_id = actor)
            and item.capacity <= (select count(*) from vecin.participants where pin_id = target) then
            raise exception 'Ultimul loc a fost ocupat.';
          end if;
          insert into vecin.participants values (target, actor) on conflict do nothing;
        else delete from vecin.participants where pin_id = target and user_id = actor;
        end if;
      when 'resolve' then
        if item.type <> 'report' then raise exception 'Acțiunea este disponibilă doar pentru sesizări.'; end if;
        update vecin.pins set status = case status when 'open' then 'resolved' else 'open' end, changed_at = now() where id = target;
      when 'cancel' then
        if item.type <> 'activity' then raise exception 'Acțiunea este disponibilă doar pentru activități.'; end if;
        update vecin.pins set status = 'cancelled', changed_at = now() where id = target;
      when 'delete' then
        old_photo := item.image_path;
        update vecin.pins set deleted = true, image_path = null where id = target;
        delete from vecin.messages where pin_id = target;
        delete from vecin.saved where pin_id = target;
      when 'save' then
        if coalesce(desired, not exists (select from vecin.saved where pin_id = target and user_id = actor)) then
          insert into vecin.saved values (actor, target) on conflict do nothing;
        else delete from vecin.saved where pin_id = target and user_id = actor;
        end if;
      when 'message' then
        insert into vecin.messages (id, pin_id, author, body)
        values ((action->>'id')::uuid, target, actor, btrim(action->>'body')) on conflict do nothing;
      when 'flag' then
        insert into vecin.flags values (target, actor, left(btrim(action->>'reason'), 500)) on conflict do nothing;
      else raise exception 'Acțiune necunoscută.';
    end case;
  end if;

  if operation not in ('save', 'flag') then
    update public.vecin_revision set revision = revision + 1 where id = true;
  end if;
  return jsonb_build_object('state', public.vecin_snapshot(), 'unusedPhoto', old_photo);
end;
$$;
revoke all on function public.vecin_apply(jsonb) from public, anon, authenticated;
grant execute on function public.vecin_apply(jsonb) to authenticated;

commit;
