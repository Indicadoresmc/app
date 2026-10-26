-- Ejecutar una sola vez en Supabase SQL Editor.
-- Targets de productividad editables desde el panel de administrador.
-- Si una clave no está en la tabla, la app usa el valor de siempre.
create table if not exists public.targets (
  clave text primary key,
  valor numeric not null check (valor > 0),
  actualizado_en timestamptz not null default now()
);
alter table public.targets enable row level security;
grant select,insert,update,delete on public.targets to authenticated;
drop policy if exists targets_select on public.targets;
create policy targets_select on public.targets for select to authenticated using (true);
drop policy if exists targets_admin on public.targets;
create policy targets_admin on public.targets for all to authenticated using (exists(select 1 from public.perfiles p where p.auth_user_id=auth.uid() and p.rol='administrador')) with check (exists(select 1 from public.perfiles p where p.auth_user_id=auth.uid() and p.rol='administrador'));
