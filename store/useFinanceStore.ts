import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { EXPENSE_CATEGORIES } from '@/constants/expenseCategories';
import * as db from '@/lib/database';
import { createId } from '@/lib/ids';
import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  currentWeekKey,
  currentYearMonth,
  toDateKey,
} from '@/lib/dates';
import { applyXpToProfile } from '@/lib/xp';
import { useAuthStore } from '@/store/useAuthStore';
import {
  DEFAULT_METODOS_DE_PAGO,
  type AIInsight,
  type Budget,
  type CreditCard,
  type EstadoDeAnimo,
  type Expense,
  type FixedExpense,
  type Income,
  type MetodoDePagoItem,
  type Mission,
  type MonedaCode,
  DEFAULT_BANCOS_DISPONIBLES,
  type UserProfile,
} from '@/types';

const XP_REGISTRAR_GASTO = 10;
const XP_REGISTRAR_INGRESO = 20;

const defaultProfile: UserProfile = {
  id: 'u1',
  nombreUsuario: 'Rubén',
  nivel: 4,
  xpActual: 320,
  xpParaSiguienteNivel: 500,
  rachaActual: 5,
  rachaMaxima: 12,
  ultimoRegistro: toDateKey(new Date()),
  totalGastadoSemana: 0,
  totalGastadoMes: 0,
  monedaPrincipal: 'PEN',
  tipoDeCambio: 3.75,
  misionesCompletadas: 2,
  metodosDePago: DEFAULT_METODOS_DE_PAGO,
  bancosDisponibles: [...DEFAULT_BANCOS_DISPONIBLES],
};

function mockExpenses(now: Date): Expense[] {
  const ym = currentYearMonth(now);
  const iso = (ymKey: string, day: number) =>
    `${ymKey}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
  const current: Expense[] = [
    {
      id: 'e1',
      fecha: iso(ym, 3),
      cuenta: 'Principal',
      medioDePago: 'Tarjeta',
      banco: 'Interbank',
      categoria: 'delivery',
      comercio: 'Rappi',
      esEsencial: false,
      estadoDeAnimo: 'ANSIOSO',
      moneda: 'PEN',
      descripcion: 'Cena tarde',
      importe: 48.9,
      mes: ym,
      xpGanado: 10,
    },
    {
      id: 'e2',
      fecha: iso(ym, 5),
      cuenta: 'Principal',
      medioDePago: 'Efectivo',
      banco: '',
      categoria: 'supermercado',
      comercio: 'Wong',
      esEsencial: true,
      estadoDeAnimo: 'NEUTRAL',
      moneda: 'PEN',
      descripcion: 'Compra semanal',
      importe: 312.4,
      mes: ym,
      xpGanado: 10,
    },
    {
      id: 'e3',
      fecha: iso(ym, 6),
      cuenta: 'Principal',
      medioDePago: 'Tarjeta',
      banco: 'BBVA',
      categoria: 'comida-restaurantes',
      comercio: 'La Mar',
      esEsencial: false,
      estadoDeAnimo: 'FELIZ',
      moneda: 'PEN',
      descripcion: 'Almuerzo',
      importe: 185,
      mes: ym,
      xpGanado: 10,
    },
    {
      id: 'e4',
      fecha: iso(ym, 8),
      cuenta: 'Principal',
      medioDePago: 'Tarjeta',
      banco: 'Interbank',
      categoria: 'movilidad',
      comercio: 'Uber',
      esEsencial: true,
      estadoDeAnimo: 'ESTRESADO',
      moneda: 'PEN',
      descripcion: 'Aeropuerto',
      importe: 64.5,
      mes: ym,
      xpGanado: 10,
    },
    {
      id: 'e5',
      fecha: iso(ym, 9),
      cuenta: 'Principal',
      medioDePago: 'Tarjeta',
      banco: 'Interbank',
      categoria: 'suscripciones',
      comercio: 'Spotify',
      esEsencial: false,
      estadoDeAnimo: 'CONTENTO',
      moneda: 'PEN',
      descripcion: 'Plan familiar',
      importe: 24.9,
      mes: ym,
      xpGanado: 10,
    },
  ];

  const past: Expense[] = [];
  const backfill: Array<{
    day: number;
    categoria: string;
    comercio: string;
    importe: number;
    mood: EstadoDeAnimo;
  }> = [
    { day: 4, categoria: 'supermercado', comercio: 'Wong', importe: 265, mood: 'NEUTRAL' },
    { day: 12, categoria: 'movilidad', comercio: 'Uber', importe: 52, mood: 'ESTRESADO' },
    { day: 20, categoria: 'comida-restaurantes', comercio: 'Cevichería', importe: 95, mood: 'FELIZ' },
  ];
  for (let back = 1; back <= 5; back++) {
    const ymPast = addMonthsToYearMonth(ym, -back);
    backfill.forEach((row, j) => {
      past.push({
        id: `eh-${back}-${j}`,
        fecha: iso(ymPast, row.day),
        cuenta: 'Principal',
        medioDePago: 'Tarjeta',
        banco: 'Interbank',
        categoria: row.categoria,
        comercio: row.comercio,
        esEsencial: false,
        estadoDeAnimo: row.mood,
        moneda: 'PEN',
        descripcion: 'Mock histórico',
        importe: Math.round(row.importe * (1 + back * 0.04) * 10) / 10,
        mes: ymPast,
        xpGanado: 10,
      });
    });
  }

  return [...current, ...past];
}

function mockIncomes(ym0: string): Income[] {
  const out: Income[] = [];
  for (let i = 0; i < 6; i++) {
    const ym = addMonthsToYearMonth(ym0, -i);
    const iso = `${ym}-01T10:00:00.000Z`;
    out.push({
      id: `i-sal-${ym}`,
      fecha: iso,
      fuente: 'Empresa',
      tipo: 'Salario',
      objetivo: 'Gastos fijos',
      frecuencia: 'Mensual',
      medioDePago: 'Transferencia',
      banco: 'Interbank',
      categoria: 'Salario',
      moneda: 'PEN',
      descripcion: 'Pago mensual',
      importe: 8200 + i * 120,
      mes: ym,
    });
    if (i % 2 === 0) {
      out.push({
        id: `i-plat-${ym}`,
        fecha: `${ym}-14T10:00:00.000Z`,
        fuente: 'Plataformas',
        tipo: 'Freelance',
        objetivo: 'Ahorro',
        frecuencia: 'Mensual',
        medioDePago: 'Transferencia',
        banco: 'Interbank',
        categoria: 'Freelance',
        moneda: 'PEN',
        descripcion: 'Proyectos online',
        importe: 620 + i * 40,
        mes: ym,
      });
    }
    if (i % 3 === 0) {
      out.push({
        id: `i-cli-${ym}`,
        fecha: `${ym}-18T10:00:00.000Z`,
        fuente: 'Cliente',
        tipo: 'Freelance',
        objetivo: 'Gastos variables',
        frecuencia: 'Unico',
        medioDePago: 'Transferencia',
        banco: 'BBVA',
        categoria: 'Servicios',
        moneda: 'PEN',
        descripcion: 'Consultoría',
        importe: 450,
        mes: ym,
      });
    }
  }
  return out;
}

function mockFixed(): FixedExpense[] {
  return [
    {
      id: 'f1',
      descripcion: 'Alquiler',
      responsable: 'Titular',
      moneda: 'PEN',
      categoria: 'servicios-hogar',
      montoMensual: 2200,
    },
    {
      id: 'f2',
      descripcion: 'Internet + luz',
      responsable: 'Titular',
      moneda: 'PEN',
      categoria: 'servicios-hogar',
      montoMensual: 280,
    },
  ];
}

function mockCards(ym: string): CreditCard[] {
  return [
    { id: 'c1', nombre: 'Visa Signature', moneda: 'PEN', lineaTotal: 15000, gastosMes: 4200 },
    { id: 'c2', nombre: 'Amex Gold', moneda: 'USD', lineaTotal: 5000, gastosMes: 890 },
  ];
}

function mockBudgets(ym: string): Budget[] {
  return EXPENSE_CATEGORIES.slice(0, 8).map((cat, i) => ({
    categoria: cat.id,
    limiteMonthly: [800, 1200, 400, 120, 500, 200, 600, 800][i] ?? 300,
    gastadoActual: 0,
    moneda: 'PEN' as MonedaCode,
  }));
}

function mockMissions(): Mission[] {
  const exp = new Date();
  exp.setDate(exp.getDate() + 5);
  return [
    {
      id: 'm1',
      titulo: 'Sin delivery esta semana',
      descripcion: 'Evitá pedidos delivery durante 7 días.',
      xpRecompensa: 50,
      progreso: 0,
      meta: 7,
      completada: false,
      fechaExpiracion: exp.toISOString(),
      tipo: 'dias_sin_categoria',
      categoriaId: 'delivery',
    },
    {
      id: 'm2',
      titulo: 'Registra 5 días seguidos',
      descripcion: 'Registrá al menos un gasto durante 5 días consecutivos.',
      xpRecompensa: 30,
      progreso: 2,
      meta: 5,
      completada: false,
      fechaExpiracion: exp.toISOString(),
      tipo: 'racha_registro',
    },
    {
      id: 'm3',
      titulo: 'Mantén el presupuesto de comida',
      descripcion: 'No superes S/ 500 en comida y restaurantes este mes.',
      xpRecompensa: 40,
      progreso: 0,
      meta: 500,
      completada: false,
      fechaExpiracion: exp.toISOString(),
      tipo: 'presupuesto_categoria',
      categoriaId: 'comida-restaurantes',
    },
    {
      id: 'm4',
      titulo: 'Registra tu primer ingreso',
      descripcion: 'Sumá al menos un ingreso en FinXP.',
      xpRecompensa: 20,
      progreso: 0,
      meta: 1,
      completada: false,
      fechaExpiracion: exp.toISOString(),
      tipo: 'primer_ingreso',
    },
  ];
}

function mockAiInsights(): AIInsight[] {
  const today = new Date().toISOString();
  return [
    {
      id: 'a1',
      tipo: 'comparacion_semanal',
      titulo: 'Semana vs semana anterior',
      descripcion: 'Gastaste ~12% menos que la semana pasada en la misma franja.',
      fecha: today,
      leido: false,
    },
    {
      id: 'a2',
      tipo: 'categoria_crecimiento',
      titulo: 'Delivery en alza',
      descripcion: 'Delivery subió 18% vs el mes anterior: conviene revisar hábitos.',
      fecha: today,
      leido: false,
      accionSugerida: 'Ver presupuesto de delivery',
    },
    {
      id: 'a3',
      tipo: 'proyeccion_presupuesto',
      titulo: 'Proyección de supermercado',
      descripcion: 'A este ritmo, en ~9 días podrías alcanzar tu límite de supermercado.',
      fecha: today,
      leido: true,
    },
  ];
}

function sumMonthExpenses(expenses: Expense[], ym: string): number {
  return expenses.filter((e) => e.mes === ym).reduce((s, e) => s + e.importe, 0);
}

function sumWeekExpenses(expenses: Expense[], refDate = new Date()): number {
  const week = currentWeekKey(refDate);
  return expenses
    .filter((e) => currentWeekKey(new Date(e.fecha)) === week)
    .reduce((s, e) => s + e.importe, 0);
}

function bumpRacha(ultimo: string | undefined, prev: number): { rachaActual: number; ultimoRegistro: string } {
  const today = toDateKey(new Date());
  if (!ultimo) return { rachaActual: 1, ultimoRegistro: today };
  if (ultimo === today) return { rachaActual: prev, ultimoRegistro: today };
  const yesterday = addDaysToDateKey(today, -1);
  if (ultimo === yesterday) return { rachaActual: prev + 1, ultimoRegistro: today };
  return { rachaActual: 1, ultimoRegistro: today };
}

function withBudgetsGastado(expenses: Expense[], budgets: Budget[], ym: string): Budget[] {
  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    if (e.mes !== ym) continue;
    byCat[e.categoria] = (byCat[e.categoria] ?? 0) + e.importe;
  }
  return budgets.map((b) => ({ ...b, gastadoActual: byCat[b.categoria] ?? 0 }));
}

export type MonthCategoryRow = {
  categoriaId: string;
  nombre: string;
  emoji: string;
  spent: number;
  budget: number;
};

type FinanceState = {
  profile: UserProfile;
  expenses: Expense[];
  incomes: Income[];
  fixedExpenses: FixedExpense[];
  creditCards: CreditCard[];
  budgets: Budget[];
  missions: Mission[];
  aiInsights: AIInsight[];
  onboardingCompleted: boolean;
  theme: 'dark' | 'light';

  ensureWeeklyMissions: () => void;
  setTheme: (mode: 'dark' | 'light') => void;
  toggleTheme: () => void;
  setNombreUsuario: (nombreUsuario: string) => void;
  setMonedaPrincipal: (moneda: MonedaCode) => void;
  setTipoDeCambio: (tipoDeCambio: number) => void;
  updateMonthlyGoal: (amount: number) => void;
  updateMetodoDePago: (id: string, patch: Partial<Pick<MetodoDePagoItem, 'nombre' | 'activo'>>) => void;
  addMetodoDePago: (nombre: string) => void;
  removeMetodoDePago: (id: string) => void;
  addMetodoPago: (metodo: string) => Promise<void>;
  removeMetodoPago: (metodo: string) => Promise<void>;
  addBancoDisponible: (nombre: string) => Promise<void>;
  removeBancoDisponible: (nombre: string) => Promise<void>;
  addFixedExpense: () => void;
  updateFixedExpense: (id: string, patch: Partial<Pick<FixedExpense, 'descripcion' | 'montoMensual'>>) => void;
  addCreditCard: () => void;
  updateCreditCard: (id: string, patch: Partial<Pick<CreditCard, 'nombre' | 'lineaTotal'>>) => void;
  setBudgetCategoryLimit: (categoriaId: string, limiteMonthly: number) => void;
  addQuickExpense: (input: {
    categoria: string;
    importe: number;
    estadoDeAnimo: EstadoDeAnimo | null;
    descripcion?: string;
    comercio?: string;
    esEsencial?: boolean;
    fecha?: string;
    cuenta?: string;
    medioDePago?: string;
    banco?: string;
    moneda?: MonedaCode;
  }) => void;
  addIncome: (input: {
    fecha: string;
    importe: number;
    moneda: MonedaCode;
    fuente: string;
    tipo: Income['tipo'];
    objetivo: string;
    frecuencia: Income['frecuencia'];
    banco: string;
    categoria: string;
    descripcion?: string;
  }) => void;
  getMonthRows: (yearMonth?: string) => MonthCategoryRow[];
  getMonthTotals: (yearMonth?: string) => { spent: number; budget: number };
  getWeekSpent: (refDate?: Date) => number;

  syncing: boolean;
  lastSync: string | null;
  loadingCategories: boolean;
  categories: { id: string; nombre: string; emoji: string; orden: number }[];
  loadFromSupabase: () => Promise<void>;
  loadCategories: () => Promise<void>;
  addCategory: (nombre: string, emoji?: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  updateCategory: (id: string, nombre: string, emoji: string) => Promise<void>;
  addExpenseToSupabase: (input: {
    categoria: string;
    importe: number;
    estadoDeAnimo: EstadoDeAnimo | null;
    descripcion?: string;
    comercio?: string;
    fecha?: string;
    medioDePago?: string;
    banco?: string;
    moneda?: MonedaCode;
  }) => Promise<void>;
  addIncomeToSupabase: (input: {
    fecha: string;
    importe: number;
    moneda: MonedaCode;
    fuente: string;
    tipo: Income['tipo'];
    objetivo: string;
    frecuencia: Income['frecuencia'];
    banco: string;
    categoria: string;
    descripcion?: string;
  }) => Promise<void>;
};

const initialYm = currentYearMonth();

const seedState = (): Omit<
  FinanceState,
  | 'ensureWeeklyMissions'
  | 'setTheme'
  | 'setNombreUsuario'
  | 'setMonedaPrincipal'
  | 'setTipoDeCambio'
  | 'updateMonthlyGoal'
  | 'updateMetodoDePago'
  | 'addMetodoDePago'
  | 'removeMetodoDePago'
  | 'addMetodoPago'
  | 'removeMetodoPago'
  | 'addBancoDisponible'
  | 'removeBancoDisponible'
  | 'addFixedExpense'
  | 'updateFixedExpense'
  | 'addCreditCard'
  | 'updateCreditCard'
  | 'setBudgetCategoryLimit'
  | 'addQuickExpense'
  | 'addIncome'
  | 'getMonthRows'
  | 'getMonthTotals'
  | 'getWeekSpent'
  | 'theme'
  | 'toggleTheme'
  | 'syncing'
  | 'lastSync'
  | 'loadingCategories'
  | 'categories'
  | 'loadFromSupabase'
  | 'loadCategories'
  | 'addCategory'
  | 'removeCategory'
  | 'updateCategory'
  | 'addExpenseToSupabase'
  | 'addIncomeToSupabase'
> => {
  const expenses = mockExpenses(new Date());
  let budgets = mockBudgets(initialYm);
  budgets = withBudgetsGastado(expenses, budgets, initialYm);
  const week = sumWeekExpenses(expenses);
  const month = sumMonthExpenses(expenses, initialYm);
  const monthBudgetSum = budgets.reduce((s, b) => s + b.limiteMonthly, 0);
  return {
    profile: {
      ...defaultProfile,
      totalGastadoSemana: week,
      totalGastadoMes: month,
      rachaMaxima: Math.max(defaultProfile.rachaMaxima, defaultProfile.rachaActual),
      metaMensual: monthBudgetSum,
      metodosDePago: defaultProfile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO,
    },
    expenses,
    incomes: mockIncomes(initialYm),
    fixedExpenses: mockFixed(),
    creditCards: mockCards(initialYm),
    budgets,
    missions: mockMissions(),
    aiInsights: mockAiInsights(),
    onboardingCompleted: true,
  };
};

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...seedState(),
      theme: 'dark',
      syncing: false,
      lastSync: null,
      loadingCategories: false,
      categories: [],

      setTheme: (mode) => {
        set({ theme: mode });
        void AsyncStorage.setItem('finxp_dark_mode', mode === 'dark' ? 'true' : 'false');
        void (async () => {
          const userId = useAuthStore.getState().user?.id;
          if (!userId) return;
          try {
            await db.updateProfile(userId, { theme: mode });
          } catch (e) {
            console.error('Error guardando tema:', e);
          }
        })();
      },

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        get().setTheme(next);
      },

      ensureWeeklyMissions: () => {
        // Reservado: regenerar misiones semanales cuando implementemos ventana por semana ISO.
      },

      setNombreUsuario: (nombreUsuario) => {
        const trimmed = nombreUsuario.trim();
        set((s) => ({
          profile: { ...s.profile, nombreUsuario: trimmed || 'Usuario' },
        }));
      },

      setMonedaPrincipal: (moneda) => {
        set((s) => ({
          profile: { ...s.profile, monedaPrincipal: moneda },
          budgets: s.budgets.map((b) => ({ ...b, moneda })),
        }));
      },

      setTipoDeCambio: (tipoDeCambio) => {
        const n = Number(tipoDeCambio);
        if (Number.isNaN(n) || n <= 0) return;
        set((s) => ({
          profile: { ...s.profile, tipoDeCambio: n },
        }));
      },

      updateMonthlyGoal: (amount) => {
        const n = Math.max(0, Number(amount));
        if (Number.isNaN(n)) return;
        set((s) => ({
          profile: { ...s.profile, metaMensual: n },
        }));
      },

      updateMetodoDePago: (id, patch) => {
        set((s) => {
          const list = s.profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO;
          return {
            profile: {
              ...s.profile,
              metodosDePago: list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
            },
          };
        });
      },

      addMetodoDePago: (nombre) => {
        const trimmed = nombre.trim();
        if (!trimmed) return;
        set((s) => {
          const list = [...(s.profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO)];
          list.push({ id: createId(), nombre: trimmed, activo: true });
          return { profile: { ...s.profile, metodosDePago: list } };
        });
      },

      removeMetodoDePago: (id) => {
        set((s) => {
          const list = s.profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO;
          if (list.length <= 1) return s;
          return {
            profile: {
              ...s.profile,
              metodosDePago: list.filter((m) => m.id !== id),
            },
          };
        });
      },

      addMetodoPago: async (metodo) => {
        const { useAuthStore } = await import('./useAuthStore');
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;
        const trimmed = metodo.trim();
        if (!trimmed) return;
        const list = [...(get().profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO)];
        list.push({ id: createId(), nombre: trimmed, activo: true });
        set({ profile: { ...get().profile, metodosDePago: list } });
        const db = await import('@/lib/database');
        await db.updateProfile(userId, { metodos_de_pago: list.map((m) => m.nombre) });
      },

      removeMetodoPago: async (metodo) => {
        const { useAuthStore } = await import('./useAuthStore');
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;
        const list = [...(get().profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO)];
        if (list.length <= 1) return;
        const nuevos = list.filter((m) => m.nombre !== metodo);
        if (nuevos.length === 0) return;
        set({ profile: { ...get().profile, metodosDePago: nuevos } });
        const db = await import('@/lib/database');
        await db.updateProfile(userId, { metodos_de_pago: nuevos.map((m) => m.nombre) });
      },

      addBancoDisponible: async (nombre) => {
        const { useAuthStore } = await import('./useAuthStore');
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;
        const db = await import('@/lib/database');
        const next = await db.addBancoDisponible(userId, nombre);
        if (next) set({ profile: { ...get().profile, bancosDisponibles: next } });
      },

      removeBancoDisponible: async (nombre) => {
        const { useAuthStore } = await import('./useAuthStore');
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;
        const db = await import('@/lib/database');
        const next = await db.removeBancoDisponible(userId, nombre);
        if (next) set({ profile: { ...get().profile, bancosDisponibles: next } });
      },

      addFixedExpense: () => {
        const { profile, fixedExpenses } = get();
        const row: FixedExpense = {
          id: createId(),
          descripcion: 'Nuevo gasto fijo',
          responsable: 'Titular',
          moneda: profile.monedaPrincipal,
          categoria: 'servicios-hogar',
          montoMensual: 0,
        };
        set({ fixedExpenses: [...fixedExpenses, row] });
      },

      updateFixedExpense: (id, patch) => {
        set((s) => ({
          fixedExpenses: s.fixedExpenses.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        }));
      },

      addCreditCard: () => {
        const { profile, creditCards } = get();
        const card: CreditCard = {
          id: createId(),
          nombre: 'Nueva tarjeta',
          moneda: profile.monedaPrincipal,
          lineaTotal: 0,
          gastosMes: 0,
        };
        set({ creditCards: [...creditCards, card] });
      },

      updateCreditCard: (id, patch) => {
        set((s) => ({
          creditCards: s.creditCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        }));
      },

      setBudgetCategoryLimit: (categoriaId, limiteMonthly) => {
        const { budgets, expenses, profile } = get();
        const ym = currentYearMonth();
        const limite = Math.max(0, limiteMonthly);
        const byCat: Record<string, number> = {};
        for (const e of expenses) {
          if (e.mes !== ym) continue;
          byCat[e.categoria] = (byCat[e.categoria] ?? 0) + e.importe;
        }
        const idx = budgets.findIndex((b) => b.categoria === categoriaId);
        if (idx >= 0) {
          set({
            budgets: budgets.map((b, i) =>
              i === idx ? { ...b, limiteMonthly: limite, gastadoActual: byCat[categoriaId] ?? b.gastadoActual } : b,
            ),
          });
        } else {
          set({
            budgets: [
              ...budgets,
              {
                categoria: categoriaId,
                limiteMonthly: limite,
                gastadoActual: byCat[categoriaId] ?? 0,
                moneda: profile.monedaPrincipal,
              },
            ],
          });
        }
      },

      addQuickExpense: ({
        categoria,
        importe,
        descripcion,
        estadoDeAnimo,
        esEsencial,
        comercio,
        fecha,
        cuenta,
        medioDePago,
        banco,
        moneda,
      }) => {
        const { profile, expenses, budgets } = get();
        const fechaIso = fecha ?? new Date().toISOString();
        const fechaDate = new Date(fechaIso);
        const ym = currentYearMonth(fechaDate);
        const expense: Expense = {
          id: createId(),
          fecha: fechaIso,
          cuenta: cuenta ?? 'Principal',
          medioDePago: medioDePago ?? 'Tarjeta',
          banco: banco ?? '',
          categoria,
          comercio:
            comercio?.trim() ||
            (descripcion?.trim() ? descripcion.trim().slice(0, 40) : 'Registro rápido'),
          esEsencial: esEsencial ?? false,
          estadoDeAnimo,
          moneda: moneda ?? profile.monedaPrincipal,
          descripcion: descripcion?.trim() ?? '',
          importe,
          mes: ym,
          xpGanado: XP_REGISTRAR_GASTO,
        };
        const streak = bumpRacha(profile.ultimoRegistro, profile.rachaActual);
        const xp = applyXpToProfile({
          nivel: profile.nivel,
          xpActual: profile.xpActual,
          xpParaSiguienteNivel: profile.xpParaSiguienteNivel,
          gain: XP_REGISTRAR_GASTO,
        });
        const nextExpenses = [expense, ...expenses];
        const nextBudgets = withBudgetsGastado(nextExpenses, budgets, ym);
        set({
          expenses: nextExpenses,
          budgets: nextBudgets,
          profile: {
            ...profile,
            ...streak,
            ...xp,
            rachaMaxima: Math.max(profile.rachaMaxima, streak.rachaActual),
            totalGastadoSemana: sumWeekExpenses(nextExpenses),
            totalGastadoMes: sumMonthExpenses(nextExpenses, currentYearMonth()),
          },
        });
      },

      addIncome: ({ fecha, importe, moneda, fuente, tipo, objetivo, frecuencia, banco, categoria, descripcion }) => {
        const { profile, incomes } = get();
        const ym = currentYearMonth(new Date(fecha));
        const income: Income = {
          id: createId(),
          fecha,
          fuente,
          tipo,
          objetivo,
          frecuencia,
          medioDePago: 'Transferencia',
          banco,
          categoria,
          moneda,
          descripcion: descripcion?.trim() ?? '',
          importe,
          mes: ym,
        };
        const xp = applyXpToProfile({
          nivel: profile.nivel,
          xpActual: profile.xpActual,
          xpParaSiguienteNivel: profile.xpParaSiguienteNivel,
          gain: XP_REGISTRAR_INGRESO,
        });
        set({
          incomes: [income, ...incomes],
          profile: {
            ...profile,
            ...xp,
          },
        });
      },

      loadFromSupabase: async () => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;

        set({ syncing: true });
        try {
          const mesActual = currentYearMonth();
          const prev = get();

          const [expenseRows, incomeRows, fixedRows, cardRows, budgetRows, missionRows, profileRow] = await Promise.all([
            db.getExpenses(userId),
            db.getIncomes(userId),
            db.getFixedExpenses(userId),
            db.getCreditCards(userId),
            db.getBudgets(userId, mesActual),
            db.getMissions(userId),
            db.getProfile(userId),
          ]);

          const expenses = expenseRows.map((e) => db.rowToExpense(e as db.ExpenseDbRow));
          const incomes = incomeRows.map((i) => db.rowToIncome(i as db.IncomeDbRow));
          const monedaPrincipal = db.mapMoneda(
            profileRow?.moneda_principal as string | undefined,
            prev.profile.monedaPrincipal,
          );
          const fixedExpenses = fixedRows.map((r) =>
            db.rowToFixedExpense(
              r as { id: string; nombre: string; monto: number | string; categoria: string },
              monedaPrincipal,
            ),
          );
          const creditCards = cardRows.map((r) =>
            db.rowToCreditCard(
              r as { id: string; nombre: string; limite: number | string; saldo_usado: number | string },
              monedaPrincipal,
            ),
          );
          let budgets = budgetRows.map((r) =>
            db.rowToBudget(r as { categoria: string; limite: number | string }, monedaPrincipal),
          );
          budgets = withBudgetsGastado(expenses, budgets, mesActual);
          const missions = missionRows.map((m) =>
            db.rowToMission(
              m as {
                id: string;
                titulo: string;
                descripcion: string | null;
                tipo: string | null;
                meta: number | string | null;
                progreso: number | string | null;
                completada: boolean | null;
                xp_recompensa: number | null;
                fecha_limite: string | null;
              },
            ),
          );

          const ultimoRegistro = profileRow?.ultimo_registro
            ? String(profileRow.ultimo_registro).slice(0, 10)
            : prev.profile.ultimoRegistro;

          const profile: UserProfile = profileRow
            ? {
                id: userId,
                nombreUsuario:
                  String(profileRow.nombre_usuario ?? '').trim() ||
                  prev.profile.nombreUsuario ||
                  '',
                nivel: profileRow.nivel ?? 1,
                xpActual: profileRow.xp_actual ?? 0,
                xpParaSiguienteNivel: profileRow.xp_para_siguiente_nivel ?? 100,
                rachaActual: profileRow.racha_actual ?? 0,
                rachaMaxima: profileRow.racha_maxima ?? 0,
                ultimoRegistro,
                totalGastadoSemana: sumWeekExpenses(expenses),
                totalGastadoMes: sumMonthExpenses(expenses, mesActual),
                monedaPrincipal,
                tipoDeCambio: Number(profileRow.tipo_de_cambio ?? 3.75),
                misionesCompletadas: profileRow.misiones_completadas ?? 0,
                metaMensual: budgets.reduce((s, b) => s + b.limiteMonthly, 0) || prev.profile.metaMensual,
                metodosDePago: db.metodosDePagoFromDb(profileRow.metodos_de_pago ?? undefined),
                bancosDisponibles: profileRow.bancos_disponibles?.length
                  ? profileRow.bancos_disponibles
                  : [...DEFAULT_BANCOS_DISPONIBLES],
              }
            : { ...prev.profile, id: userId };

          const nextTheme =
            profileRow?.theme === 'light' ? 'light' : profileRow?.theme === 'dark' ? 'dark' : prev.theme;

          set({
            expenses,
            incomes,
            fixedExpenses,
            creditCards,
            budgets,
            missions,
            profile,
            theme: nextTheme,
            syncing: false,
            lastSync: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Error cargando de Supabase:', e);
          set({ syncing: false });
        }
      },

      loadCategories: async () => {
        if (get().loadingCategories) return;
        if (get().categories.length > 0) return;

        const { useAuthStore } = await import('./useAuthStore');
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;

        set({ loadingCategories: true });
        const db = await import('@/lib/database');
        try {
          const cats = await db.getCategories(userId);
          if (cats.length === 0) {
            await db.initDefaultCategories(userId);
            const fresh = await db.getCategories(userId);
            set({ categories: fresh, loadingCategories: false });
          } else {
            set({ categories: cats, loadingCategories: false });
          }
        } catch (e) {
          console.error('Error loading categories:', e);
          set({ loadingCategories: false });
        }
      },

      addCategory: async (nombre, emoji = '📦') => {
        const { useAuthStore } = await import('./useAuthStore');
        const userId = useAuthStore.getState().user?.id;
        if (!userId) return;
        const db = await import('@/lib/database');
        const orden = get().categories.length;
        const newCat = await db.addCategory(userId, nombre, emoji, orden);
        set((state) => ({ categories: [...state.categories, newCat] }));
      },

      removeCategory: async (id) => {
        const db = await import('@/lib/database');
        await db.deleteCategory(id);
        set((state) => ({ categories: state.categories.filter((c) => c.id !== id) }));
      },

      updateCategory: async (id, nombre, emoji) => {
        const db = await import('@/lib/database');
        await db.updateCategory(id, nombre, emoji);
        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? { ...c, nombre, emoji } : c)),
        }));
      },

      addExpenseToSupabase: async ({
        categoria,
        importe,
        descripcion,
        estadoDeAnimo,
        comercio,
        fecha,
        medioDePago,
        banco,
        moneda,
      }) => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) {
          get().addQuickExpense({
            categoria,
            importe,
            descripcion,
            estadoDeAnimo,
            comercio,
            fecha,
            medioDePago,
            banco,
            moneda,
          });
          return;
        }

        const { profile, expenses, budgets } = get();
        const fechaIso = fecha ?? new Date().toISOString();
        const fechaDate = new Date(fechaIso);
        const ym = currentYearMonth(fechaDate);
        const expensePayload: Omit<Expense, 'id'> = {
          fecha: fechaIso,
          cuenta: 'Principal',
          medioDePago: medioDePago ?? 'Tarjeta',
          banco: banco ?? '',
          categoria,
          comercio:
            comercio?.trim() ||
            (descripcion?.trim() ? descripcion.trim().slice(0, 40) : 'Registro rápido'),
          esEsencial: false,
          estadoDeAnimo,
          moneda: moneda ?? profile.monedaPrincipal,
          descripcion: descripcion?.trim() ?? '',
          importe,
          mes: ym,
          xpGanado: XP_REGISTRAR_GASTO,
        };

        let newRow;
        try {
          newRow = await db.addExpense(userId, expensePayload);
        } catch (e) {
          console.error('Error guardando gasto:', e);
          throw e;
        }
        const expense = db.rowToExpense(newRow as db.ExpenseDbRow);
        const streak = bumpRacha(profile.ultimoRegistro, profile.rachaActual);
        const xp = applyXpToProfile({
          nivel: profile.nivel,
          xpActual: profile.xpActual,
          xpParaSiguienteNivel: profile.xpParaSiguienteNivel,
          gain: expense.xpGanado,
        });
        const nextExpenses = [expense, ...expenses];
        const nextBudgets = withBudgetsGastado(nextExpenses, budgets, ym);
        set({
          expenses: nextExpenses,
          budgets: nextBudgets,
          profile: {
            ...profile,
            ...streak,
            ...xp,
            rachaMaxima: Math.max(profile.rachaMaxima, streak.rachaActual),
            totalGastadoSemana: sumWeekExpenses(nextExpenses),
            totalGastadoMes: sumMonthExpenses(nextExpenses, currentYearMonth()),
          },
        });

        const p = get().profile;
        await db.updateProfile(userId, {
          xp_actual: p.xpActual,
          xp_para_siguiente_nivel: p.xpParaSiguienteNivel,
          nivel: p.nivel,
          racha_actual: p.rachaActual,
          racha_maxima: p.rachaMaxima,
          ultimo_registro: p.ultimoRegistro ? `${p.ultimoRegistro}T12:00:00.000Z` : null,
        });
      },

      addIncomeToSupabase: async ({ fecha, importe, moneda, fuente, tipo, objetivo, frecuencia, banco, categoria, descripcion }) => {
        const userId = useAuthStore.getState().user?.id;
        if (!userId) {
          get().addIncome({
            fecha,
            importe,
            moneda,
            fuente,
            tipo,
            objetivo,
            frecuencia,
            banco,
            categoria,
            descripcion,
          });
          return;
        }

        const { profile, incomes } = get();
        const ym = currentYearMonth(new Date(fecha));
        const incomePayload: Omit<Income, 'id'> = {
          fecha,
          fuente,
          tipo,
          objetivo,
          frecuencia,
          medioDePago: 'Transferencia',
          banco,
          categoria,
          moneda,
          descripcion: descripcion?.trim() ?? '',
          importe,
          mes: ym,
        };

        let newRow;
        try {
          newRow = await db.addIncome(userId, incomePayload);
        } catch (e) {
          console.error('Error guardando ingreso:', e);
          throw e;
        }
        const income = db.rowToIncome(newRow as db.IncomeDbRow);
        const xp = applyXpToProfile({
          nivel: profile.nivel,
          xpActual: profile.xpActual,
          xpParaSiguienteNivel: profile.xpParaSiguienteNivel,
          gain: XP_REGISTRAR_INGRESO,
        });
        set({
          incomes: [income, ...incomes],
          profile: {
            ...profile,
            ...xp,
          },
        });

        const p = get().profile;
        await db.updateProfile(userId, {
          xp_actual: p.xpActual,
          xp_para_siguiente_nivel: p.xpParaSiguienteNivel,
          nivel: p.nivel,
        });
      },

      getMonthRows: (yearMonth = currentYearMonth()) => {
        const { expenses, budgets } = get();
        const monthExpenses = expenses.filter((e) => e.mes === yearMonth);
        const byCat: Record<string, number> = {};
        for (const e of monthExpenses) {
          byCat[e.categoria] = (byCat[e.categoria] ?? 0) + e.importe;
        }
        return EXPENSE_CATEGORIES.map((cat) => {
          const b = budgets.find((x) => x.categoria === cat.id);
          return {
            categoriaId: cat.id,
            nombre: cat.name,
            emoji: cat.emoji,
            spent: byCat[cat.id] ?? 0,
            budget: b?.limiteMonthly ?? 0,
          };
        });
      },

      getMonthTotals: (yearMonth = currentYearMonth()) => {
        const rows = get().getMonthRows(yearMonth);
        const spent = rows.reduce((s, r) => s + r.spent, 0);
        const budget = rows.reduce((s, r) => s + r.budget, 0);
        return { spent, budget };
      },

      getWeekSpent: (refDate = new Date()) => sumWeekExpenses(get().expenses, refDate),
    }),
    {
      name: 'finxp-store-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        expenses: state.expenses,
        incomes: state.incomes,
        fixedExpenses: state.fixedExpenses,
        creditCards: state.creditCards,
        budgets: state.budgets,
        missions: state.missions,
        aiInsights: state.aiInsights,
        onboardingCompleted: state.onboardingCompleted,
        theme: state.theme,
      }),
    },
  ),
);
