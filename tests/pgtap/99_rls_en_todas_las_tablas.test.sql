-- Prueba global: ninguna tabla del esquema public queda sin RLS (CLAUDE.md: una tabla sin RLS aquí es
-- una filtración de datos clínicos) y nadie usa FORCE ROW LEVEL SECURITY (rompería las funciones
-- security definer y los triggers, que dependen de que el dueño no pase por RLS; ver design.md, D4).
-- Cubre las tablas de las migraciones y la tabla de control `pgmigrations` de node-pg-migrate.
select plan(2);

select is_empty(
  $q$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    order by c.relname
  $q$,
  'toda tabla del esquema public tiene RLS activada'
);

select is_empty(
  $q$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relforcerowsecurity
    order by c.relname
  $q$,
  'ninguna tabla del esquema public usa FORCE ROW LEVEL SECURITY'
);

select * from finish();
