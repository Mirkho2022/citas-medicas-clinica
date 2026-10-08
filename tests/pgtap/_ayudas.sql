-- Ayudas comunes de la suite pgTAP. scripts/ejecutar-pgtap.ts las carga dentro de la transacción
-- de cada archivo de prueba, que se revierte al terminar: nada de esto persiste en la base.
--
-- Antes de cargar este archivo el runner crea pg_temp.tokens (identidad, sub, rol, jti, jwt) con
-- tokens EdDSA firmados por una clave Ed25519 efímera; la JWK pública va en la opción de arranque
-- pg_session_jwt.jwk de la conexión. Mecanismo y límites: docs/spike-rls-h2.md.

create schema tests;
grant usage on schema tests to authenticated;
grant select on pg_temp.tokens to public;

-- clerk_user_id (claim `sub`) de una identidad de prueba, para sembrar perfiles con el mismo id.
create function tests.sub(p_identidad text) returns text language sql stable as
$$ select distinct t.sub from pg_temp.tokens t where t.identidad = p_identidad $$;

-- Inicia sesión como una identidad de prueba y pasa al rol `authenticated`, como hace
-- lib/db/cliente-autenticado.ts en la aplicación. Se puede llamar varias veces para cambiar de
-- identidad: pg_session_jwt exige un `jti` estrictamente creciente por sesión, por eso cada
-- llamada consume el siguiente `jti`. Una identidad inexistente falla (P0001) y no cambia la sesión.
create function tests.autenticar_como(p_identidad text) returns void language plpgsql as $$
declare
  v_jti int;
  v_jwt text;
begin
  v_jti := coalesce(nullif(current_setting('tests.jti', true), ''), '0')::int + 1;
  select t.jwt into v_jwt from pg_temp.tokens t where t.identidad = p_identidad and t.jti = v_jti;
  if v_jwt is null then
    raise exception 'sin token de prueba para la identidad % (jti %)', p_identidad, v_jti;
  end if;
  reset role;
  perform auth.jwt_session_init(v_jwt);
  perform set_config('tests.jti', v_jti::text, false);
  set local role authenticated;
end
$$;

-- Vuelve al rol dueño (BYPASSRLS) para sembrar o comprobar datos. La identidad de la sesión
-- se conserva: el dueño sí puede llamar a auth.user_id() / auth.session().
create function tests.volver_a_dueno() returns void language plpgsql as $$
begin
  reset role;
end
$$;
