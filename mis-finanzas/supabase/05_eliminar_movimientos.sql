-- =====================================================================
--  MIS FINANZAS — Actualización: eliminar movimientos del extracto
--  Permite marcar como «eliminado» un movimiento que vino del banco.
--  Péguelo en SQL Editor → New query → Run (una sola vez).
-- =====================================================================
alter table public.movimientos drop constraint if exists movimientos_clase_check;
alter table public.movimientos add constraint movimientos_clase_check
  check (clase in ('normal', 'traspaso', 'ajuste', 'excluido'));

notify pgrst, 'reload schema';
