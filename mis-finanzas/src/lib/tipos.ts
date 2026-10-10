export type TipoCuenta = 'banco' | 'tarjeta' | 'efectivo';

export interface Cuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  modo: 'importacion' | 'manual';
  banco: string | null;
  numero: string | null;
  formato: string | null;
  saldo_inicial: number;
  fecha_saldo_inicial: string | null;
  linea_credito: number | null;
  dia_corte: number | null;
  dia_pago: number | null;
  activa: boolean;
  orden: number;
}

export interface Categoria {
  id: string;
  nombre: string;
  tipo: 'gasto' | 'ingreso';
  color: string;
  en_presupuesto: boolean;
  activa: boolean;
}

export interface Movimiento {
  id: string;
  cuenta_id: string;
  fecha: string;
  hora: string | null;
  descripcion: string;
  monto_bs: number;
  clase: 'normal' | 'traspaso' | 'ajuste';
  categoria_id: string | null;
  moneda_original: string;
  monto_original: number | null;
  tc_usd: number | null;
  referencia: string | null;
  huella: string;
  importacion_id: string | null;
  regla_id: string | null;
  traspaso_par_id: string | null;
  estado: 'por_revisar' | 'confirmado';
  nota: string | null;
}

export interface Regla {
  id: string;
  texto: string;
  cuenta_id: string | null;
  categoria_id: string | null;
  es_traspaso: boolean;
  cuenta_destino_id: string | null;
  veces: number;
}

export interface Presupuesto {
  id: string;
  categoria_id: string;
  mes: string;
  monto_bs: number;
}

export interface Recurrente {
  id: string;
  nombre: string;
  categoria_id: string | null;
  cuenta_id: string | null;
  monto_estimado: number | null;
  frecuencia: 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual';
  proxima_fecha: string;
  dias_aviso: number;
  texto_reconocer: string | null;
  ultimo_pago: string | null;
  activo: boolean;
}

export interface Importacion {
  id: string;
  cuenta_id: string;
  archivo: string | null;
  desde: string | null;
  hasta: string | null;
  filas: number;
  nuevos: number;
  duplicados: number;
  clasificados: number;
  saldo_banco: number | null;
  saldo_sistema: number | null;
  total_adeudado: number | null;
  pago_minimo: number | null;
  fecha_vencimiento: string | null;
  creado_en: string;
}

export interface ResumenMes {
  mes: string;
  categoria_id: string | null;
  tipo: 'gasto' | 'ingreso';
  total_bs: number;
  total_usd: number;
  cantidad: number;
}

export interface TipoCambio {
  fecha: string;
  bs_por_usd: number;
  origen: string;
  actualizado_en: string;
}

export interface Perfil {
  id: string;
  hogar_id: string;
  nombre: string | null;
  email: string | null;
  rol: string;
  es_superadmin: boolean;
}

export interface Suscripcion {
  hogar_id: string;
  plan: string;
  estado: string;
  vence_el: string;
}
