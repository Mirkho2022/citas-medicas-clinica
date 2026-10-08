-- Humo: el mecanismo de autenticación de pruebas funciona (ver _ayudas.sql y docs/spike-rls-h2.md).
-- El runner envuelve este archivo en una transacción que se revierte; aquí solo va el cuerpo pgTAP.
select plan(7);

select tests.autenticar_como('medico_a');
select tests.volver_a_dueno();
select is(auth.user_id(), tests.sub('medico_a'), 'el token de medico_a se reconoce');
select is(auth.session() -> 'publicMetadata' ->> 'rol', 'medico', 'el rol viaja en publicMetadata.rol');

select tests.autenticar_como('paciente_a');
select tests.volver_a_dueno();
select is(auth.user_id(), tests.sub('paciente_a'), 'se puede cambiar de identidad en la misma sesión');
select is(auth.session() -> 'publicMetadata' ->> 'rol', 'paciente', 'el rol cambia con la identidad');

select tests.autenticar_como('sin_rol');
select tests.volver_a_dueno();
select is(auth.session() -> 'publicMetadata' ->> 'rol', null, 'una identidad sin rol no trae el claim');

select tests.autenticar_como('administrativo');
select is(current_user::text, 'authenticated', 'tras autenticar_como la sesión corre como el rol authenticated');

select throws_ok(
  $q$ select tests.autenticar_como('identidad_que_no_existe') $q$,
  'P0001', null,
  'una identidad inexistente falla'
);

select * from finish();
