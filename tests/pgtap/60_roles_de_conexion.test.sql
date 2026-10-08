-- Integración con la aplicación (H2, tareas 8.1 y 8.2): por qué olvidar `set local role authenticated` falla cerrado y
-- qué ve la base de la sesión. lib/db/cliente-autenticado.ts entra como `authenticator` y cambia a `authenticated`.
select plan(11);

-- ---- authenticator: puede cambiar de rol, pero no tiene privilegios propios ----
select ok(pg_has_role('authenticator', 'authenticated', 'MEMBER'), 'authenticator puede cambiar al rol authenticated (set role)');
select ok(not pg_has_role('authenticator', 'authenticated', 'USAGE'), 'pero NO hereda sus privilegios: sin set role no accede a nada');

select is_empty(
  $q$
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('authenticator', c.oid, 'SELECT') or has_table_privilege('authenticator', c.oid, 'INSERT')
        or has_table_privilege('authenticator', c.oid, 'UPDATE') or has_table_privilege('authenticator', c.oid, 'DELETE'))
  $q$,
  'authenticator no tiene privilegios sobre NINGUNA tabla de public (falla cerrada si se omite el set role)'
);
select is_empty(
  $q$
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anonymous', c.oid, 'SELECT') or has_table_privilege('anonymous', c.oid, 'INSERT')
        or has_table_privilege('anonymous', c.oid, 'UPDATE') or has_table_privilege('anonymous', c.oid, 'DELETE'))
  $q$,
  'anonymous no tiene privilegios sobre ninguna tabla de public'
);
select is_empty(
  $q$
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and (has_sequence_privilege('authenticator', c.oid, 'USAGE') or has_sequence_privilege('anonymous', c.oid, 'USAGE'))
  $q$,
  'ni authenticator ni anonymous usan secuencias de public'
);

-- ---- usuario_actual() ----
select is(public.usuario_actual(), null, 'sin sesión, usuario_actual() devuelve nulo y no falla');
select tests.autenticar_como('paciente_a');
select is(public.usuario_actual(), tests.sub('paciente_a'), 'usuario_actual() devuelve el id de Clerk que Postgres validó');
select tests.autenticar_como('medico_a');
select is(public.usuario_actual(), tests.sub('medico_a'), 'y cambia con la identidad de la sesión');
select ok(
  has_function_privilege('authenticated', 'public.usuario_actual()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.usuario_actual()', 'EXECUTE')
  and (select prosecdef from pg_proc where oid = 'public.usuario_actual()'::regprocedure),
  'usuario_actual() es SECURITY DEFINER y solo la ejecuta authenticated'
);

-- La sesión autenticada nunca puede leer la tabla de control de migraciones.
select throws_ok($q$ select 1 from public.pgmigrations $q$, '42501', null, 'authenticated no lee pgmigrations');
select throws_ok($q$ insert into public.pgmigrations (name, run_on) values ('falsa', now()) $q$, '42501', null, 'authenticated no escribe pgmigrations');

select * from finish();
