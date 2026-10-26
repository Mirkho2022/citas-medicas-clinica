-- H7 grupo 2, tarea 2.6 (turnos-y-dashboard): toda vista del esquema public es security_invoker. Ver design.md, D1.
-- Es el equivalente, para vistas, de 99_rls_en_todas_las_tablas: una vista normal se ejecuta con los privilegios de su dueño
-- (neondb_owner, con BYPASSRLS) y se saltaría la RLS de las tablas que lee; una vista futura que omita
-- `with (security_invoker = true)` rompe la suite en vez de abrir un hueco en silencio. Una vista materializada no admite la
-- opción y guarda los datos ya leídos sin RLS, así que tampoco se permite ninguna en public. Se ignoran las vistas que crea una
-- extensión (no son del proyecto).
select plan(4);

create function pg_temp.vistas_sin_security_invoker() returns text[] language sql as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('v', 'm')
    and not coalesce(c.reloptions @> array['security_invoker=true'], false)
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
$$;

select is(pg_temp.vistas_sin_security_invoker(), '{}'::text[],
  'toda vista del esquema public tiene security_invoker=true en reloptions y no hay vistas materializadas');

select cmp_ok(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v' and c.relname in ('citas_por_reasignar', 'turnos_enfermeria_con_aviso')),
  '=', 2, 'control: la comprobación mira las vistas que existen (citas_por_reasignar y turnos_enfermeria_con_aviso están ahí)');

-- La comprobación detecta una vista que olvida la opción (se revierte con la transacción de la prueba).
create view public.vista_de_prueba_sin_invoker as select 1 as uno;
select is(pg_temp.vistas_sin_security_invoker(), array['vista_de_prueba_sin_invoker'],
  'una vista creada sin security_invoker es detectada');

-- ... y una vista con la opción desactivada explícitamente también.
drop view public.vista_de_prueba_sin_invoker;
create view public.vista_de_prueba_invoker_falso with (security_invoker = false) as select 1 as uno;
select is(pg_temp.vistas_sin_security_invoker(), array['vista_de_prueba_invoker_falso'],
  'una vista con security_invoker = false también es detectada');

select * from finish();
