-- TEMPORAL (tarea 2.4 de H2): comprueba que el CI se pone en rojo cuando una prueba falla. Se revierte en el commit siguiente.
select plan(1);
select ok(false, 'fallo forzado: este job debe ponerse en rojo');
select * from finish();
