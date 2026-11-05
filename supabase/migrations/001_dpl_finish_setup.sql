-- DPL finishing migration. Safe to run after the initial setup already completed.
-- Adds a secure, atomic approval function. Does not delete existing registrations.

create sequence if not exists public.dpl_registration_seq start 1;

-- Keep the next number above any registrations that may already have been approved.
do $$
declare v_max bigint;
begin
  select coalesce(max(nullif(regexp_replace(registration_number, '[^0-9]', '', 'g'), '')::bigint), 0)
    into v_max from public.players where status = 'approved';
  if v_max > 0 then perform setval('public.dpl_registration_seq', v_max, true); end if;
end $$;

-- Ensure the public view only contains approved players and exposes no payment data.
create or replace view public.confirmed_players
with (security_barrier = true)
as
select registration_number, first_name, last_name, player_type, photo_path
from public.players
where status = 'approved' and registration_number is not null;

grant select on public.confirmed_players to anon, authenticated;

-- The Edge Function calls this using the service-role key only, after checking admin membership.
create or replace function public.dpl_approve_player(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_number bigint;
  v_reg text;
begin
  -- Serialize approvals so two admins cannot issue the same next number.
  perform pg_advisory_xact_lock(20261105, 1);
  select * into v_player from public.players where id = p_player_id for update;
  if not found then raise exception 'Registration not found'; end if;
  if v_player.status = 'approved' then return v_player.registration_number; end if;
  if v_player.status <> 'pending' then raise exception 'Only pending registrations can be approved'; end if;
  if v_player.payment_screenshot_sha256 is null then raise exception 'Payment screenshot hash is missing'; end if;
  if exists (
    select 1 from public.players p
    where p.payment_screenshot_sha256 = v_player.payment_screenshot_sha256
      and p.status = 'approved' and p.id <> p_player_id
  ) then raise exception 'This payment screenshot was already used for an approved registration'; end if;
  v_number := nextval('public.dpl_registration_seq');
  v_reg := 'DPL' || lpad(v_number::text, 3, '0');
  update public.players
     set status = 'approved', registration_number = v_reg, approved_at = now()
   where id = p_player_id;
  return v_reg;
end;
$$;

revoke all on function public.dpl_approve_player(uuid) from public, anon, authenticated;
grant execute on function public.dpl_approve_player(uuid) to service_role;

-- Bucket-level guardrails: private buckets remain private.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id in ('player-photos','payment-screenshots');

-- Ensure browser users cannot list/read private uploads; admins receive short-lived signed URLs
-- from the protected Edge Functions. Existing admin SELECT policies remain in place.
