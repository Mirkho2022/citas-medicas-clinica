-- Fundamentos (H2, grupo 3): extensiones, tipos, privilegios base, roles de servicio y rol_actual().
select plan(28);

-- 3.1 Extensiones y tipos
select has_extension('btree_gist', 'btree_gist instalada (restricciones EXCLUDE)');
select has_extension('citext', 'citext instalada (emails sin sensibilidad a mayúsculas)');
select has_extension('pg_session_jwt', 'pg_session_jwt instalada (contexto de usuario para RLS, ADR-0023)');

select enum_has_labels('rol_usuario', array['administrativo', 'medico', 'enfermera', 'paciente'], 'rol_usuario: los cuatro roles');
select enum_has_labels('tipo_documento', array['DNI', 'CE'], 'tipo_documento: DNI y Carné de Extranjería');
select enum_has_labels('estado_cita', array['reservada', 'confirmada', 'atendida', 'cancelada', 'no_asistio'], 'estado_cita');
select enum_has_labels('tipo_turno', array['manana', 'tarde', 'noche'], 'tipo_turno');
select enum_has_labels('estado_notificacion', array['pendiente', 'enviada', 'fallida'], 'estado_notificacion');
select enum_has_labels('tipo_antecedente', array['personal_patologico', 'quirurgico', 'alergico', 'familiar', 'habito_nocivo'], 'tipo_antecedente');

-- 3.2 Roles y privilegios base (design.md, D4).
-- No se asume NOLOGIN: el LOGIN de los roles de servicio se fija por entorno y los branches efímeros
-- copian producción. Lo que se prueba es que no tienen privilegios y que lo nuevo nace cerrado.
select has_role('authenticated', 'el rol authenticated existe');
select has_role('cron_notificaciones', 'el rol cron_notificaciones existe');
select has_role('sync_identidad', 'el rol sync_identidad existe');

select is_empty(
  $q$
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'pgmigrations'
      and grantee in ('authenticated', 'anonymous', 'PUBLIC')
  $q$,
  'nadie salvo el dueño tiene privilegios sobre pgmigrations'
);

-- Objetos creados ahora por el dueño (como hará cada migración) nacen sin privilegios.
create table public.t_prueba_privilegios (id serial primary key, dato text);

select ok(
  not (
    has_table_privilege('authenticated', 'public.t_prueba_privilegios', 'SELECT')
    or has_table_privilege('authenticated', 'public.t_prueba_privilegios', 'INSERT')
    or has_table_privilege('authenticated', 'public.t_prueba_privilegios', 'UPDATE')
    or has_table_privilege('authenticated', 'public.t_prueba_privilegios', 'DELETE')
  ),
  'una tabla nueva no es accesible por authenticated sin GRANT explícito'
);
select ok(
  not has_sequence_privilege('authenticated', 'public.t_prueba_privilegios_id_seq', 'USAGE'),
  'una secuencia nueva no es usable por authenticated sin GRANT explícito'
);
select is_empty(
  $q$
    select d.defaclobjtype, a.privilege_type
    from pg_default_acl d, aclexplode(d.defaclacl) a
    where a.grantee = (select oid from pg_roles where rolname = 'authenticated')
  $q$,
  'authenticated no conserva ningún privilegio por defecto (tablas, secuencias ni funciones)'
);
select ok(
  not has_table_privilege('cron_notificaciones', 'public.t_prueba_privilegios', 'SELECT')
  and not has_table_privilege('sync_identidad', 'public.t_prueba_privilegios', 'SELECT'),
  'los roles de servicio no ven una tabla nueva sin GRANT explícito'
);
select ok(
  not has_table_privilege('anonymous', 'public.t_prueba_privilegios', 'SELECT'),
  'el rol anonymous tampoco ve una tabla nueva'
);

-- 3.3 public.rol_actual() (design.md, D5)
-- Sin sesión inicializada (este archivo aún no ha llamado a tests.autenticar_como) devuelve nulo.
select is(public.rol_actual(), null, 'sin sesión, rol_actual() devuelve nulo y no falla');

select ok(
  has_function_privilege('authenticated', 'public.rol_actual()', 'EXECUTE')
  and not has_function_privilege('anonymous', 'public.rol_actual()', 'EXECUTE'),
  'rol_actual() la ejecuta authenticated y no PUBLIC'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.rol_actual()'::regprocedure),
  'rol_actual() es SECURITY DEFINER (authenticated no tiene USAGE sobre auth)'
);

select tests.autenticar_como('administrativo');
select is(public.rol_actual(), 'administrativo', 'rol_actual() lee el rol administrativo del token');
select tests.autenticar_como('medico_a');
select is(public.rol_actual(), 'medico', 'rol_actual() lee el rol medico del token');
select tests.autenticar_como('enfermera');
select is(public.rol_actual(), 'enfermera', 'rol_actual() lee el rol enfermera del token');
select tests.autenticar_como('paciente_a');
select is(public.rol_actual(), 'paciente', 'rol_actual() lee el rol paciente del token');
select tests.autenticar_como('sin_rol');
select is(public.rol_actual(), null, 'un token sin rol da nulo (las políticas lo deniegan)');

-- Control que documenta el porqué del patrón: una función invoker que lee auth.* falla, y authenticated
-- tampoco puede llamar a auth.* por su nombre.
select tests.volver_a_dueno();
create function public.rol_invoker_prueba() returns text language sql stable
as $f$ select auth.session() -> 'publicMetadata' ->> 'rol' $f$;
grant execute on function public.rol_invoker_prueba() to authenticated;
select tests.autenticar_como('medico_a');
select throws_ok(
  $q$ select public.rol_invoker_prueba() $q$,
  '42501', 'permission denied for schema auth',
  'una función invoker que lee auth.* falla: por eso rol_actual() es SECURITY DEFINER'
);
select throws_ok(
  $q$ select auth.user_id() $q$,
  '42501', 'permission denied for schema auth',
  'authenticated no puede llamar a auth.* por su nombre'
);

select * from finish();
