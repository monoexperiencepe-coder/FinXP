/** Estado de ánimo al registrar un gasto */
export type EstadoDeAnimo =
  | 'FELIZ'
  | 'CONTENTO'
  | 'NEUTRAL'
  | 'PREOCUPADO'
  | 'MOLESTO'
  | 'TRISTE'
  | 'ANSIOSO'
  | 'ESTRESADO';

export type MonedaCode = 'PEN' | 'USD';

export interface Expense {
  id: string;
  fecha: string; // ISO
  cuenta: string;
  medioDePago: string;
  banco: string;
  categoria: string; // ExpenseCategoryId
  comercio: string;
  esEsencial: boolean;
  estadoDeAnimo: EstadoDeAnimo;
  moneda: MonedaCode;
  descripcion: string;
  importe: number;
  mes: string; // YYYY-MM
  xpGanado: number;
}

export type IncomeTipo =
  | 'Salario'
  | 'Freelance'
  | 'Inversion'
  | 'Regalo'
  | 'Otro'
  | 'Fijo'
  | 'Variable'
  | 'Extraordinario';
export type IncomeFrecuencia =
  | 'Unico'
  | 'Diaria'
  | 'Semanal'
  | 'Quincenal'
  | 'Mensual'
  | 'Trimestral'
  | 'Semestral'
  | 'Anual';

export interface Income {
  id: string;
  fecha: string;
  fuente: string;
  tipo: IncomeTipo;
  objetivo: string;
  frecuencia: IncomeFrecuencia;
  medioDePago: string;
  banco: string;
  categoria: string;
  moneda: MonedaCode;
  descripcion: string;
  importe: number;
  mes: string;
}

export interface FixedExpense {
  id: string;
  descripcion: string;
  responsable: string;
  moneda: MonedaCode;
  categoria: string;
  montoMensual: number;
}

export interface CreditCard {
  id: string;
  nombre: string;
  moneda: MonedaCode;
  lineaTotal: number;
  gastosMes: number;
}

export interface Budget {
  categoria: string;
  limiteMonthly: number;
  gastadoActual: number;
  moneda: MonedaCode;
}

/** Métodos de pago configurables (nombre + activo). */
export type MetodoDePagoItem = {
  id: string;
  nombre: string;
  activo: boolean;
};

export const DEFAULT_METODOS_DE_PAGO: MetodoDePagoItem[] = [
  { id: 'mdp-credito', nombre: 'Crédito', activo: true },
  { id: 'mdp-debito', nombre: 'Débito', activo: true },
  { id: 'mdp-efectivo', nombre: 'Efectivo', activo: true },
];

export interface UserProfile {
  id: string;
  nombreUsuario: string;
  nivel: number;
  xpActual: number;
  xpParaSiguienteNivel: number;
  rachaActual: number;
  rachaMaxima: number;
  ultimoRegistro?: string; // YYYY-MM-DD
  totalGastadoSemana: number;
  totalGastadoMes: number;
  monedaPrincipal: MonedaCode;
  tipoDeCambio: number; // PEN por USD o según convención de la app
  misionesCompletadas: number;
  /** Meta mensual editable (pantalla Misiones); si falta, se usa la suma de límites de presupuesto. */
  metaMensual?: number;
  /** Métodos de pago del usuario (p. ej. Crédito, Débito, Efectivo). */
  metodosDePago?: MetodoDePagoItem[];
}

export type MissionTipo =
  | 'dias_sin_categoria'
  | 'racha_registro'
  | 'presupuesto_categoria'
  | 'primer_ingreso'
  | 'otro';

export interface Mission {
  id: string;
  titulo: string;
  descripcion: string;
  xpRecompensa: number;
  progreso: number;
  meta: number;
  completada: boolean;
  fechaExpiracion: string; // ISO
  tipo: MissionTipo;
  /** p. ej. categoría para misión de presupuesto o delivery */
  categoriaId?: string;
}

export interface MoodInsight {
  estadoDeAnimo: EstadoDeAnimo;
  promedioGasto: number;
  totalGastos: number;
  categoriasMasFrecuentes: string[];
}

export type AIInsightTipo = 'comparacion_semanal' | 'categoria_crecimiento' | 'proyeccion_presupuesto' | 'otro';

export interface AIInsight {
  id: string;
  tipo: AIInsightTipo;
  titulo: string;
  descripcion: string;
  fecha: string;
  leido: boolean;
  accionSugerida?: string;
}
