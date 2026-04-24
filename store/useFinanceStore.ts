import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { EXPENSE_CATEGORIES } from '@/constants/expenseCategories';
import * as db from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { createId } from '@/lib/ids';
import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  currentWeekKey,
  currentYearMonth,
  toDateKey,
} from '@/lib/dates';
import { convertAmount } from '@/lib/currency';
import { writeDarkModeCache } from '@/lib/preferences';
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
  id: '',
  nombreUsuario: '',
  nivel: 1,
  xpActual: 0,
  xpParaSiguienteNivel: 500,
  rachaActual: 0,
  rachaMaxima: 0,
  ultimoRegistro: undefined,
  totalGastadoSemana: 0,
  totalGastadoMes: 0,
  monedaPrincipal: 'PEN',
  tipoDeCambio: 3.75,
  misionesCompletadas: 0,
  metaMensual: 0,
  metodosDePago: DEFAULT_METODOS_DE_PAGO,
  bancosDisponibles: [...DEFAULT_BANCOS_DISPONIBLES],
};

function sumMonthExpenses(
  expenses: Expense[],
  ym: string,
  display: MonedaCode,
  rate: number,
): number {
  return expenses
    .filter((e) => e.mes === ym)
    .reduce((s, e) => s + convertAmount(e.importe, e.moneda, display, rate), 0);
}

function sumWeekExpenses(
  expenses: Expense[],
  display: MonedaCode,
  rate: number,
  refDate = new Date(),
): number {
  const week = currentWeekKey(refDate);
  return expenses
    .filter((e) => currentWeekKey(new Date(e.fecha)) === week)
    .reduce((s, e) => s + convertAmount(e.importe, e.moneda, display, rate), 0);
}

function bumpRacha(ultimo: string | undefined, prev: number): { rachaActual: number; ultimoRegistro: string } {
  const today = toDateKey(new Date());
  if (!ultimo) return { rachaActual: 1, ultimoRegistro: today };
  if (ultimo === today) return { rachaActual: prev, ultimoRegistro: today };
  const yesterday = addDaysToDateKey(today, -1);
  if (ultimo === yesterday) return { rachaActual: prev + 1, ultimoRegistro: today };
  return { rachaActual: 1, ultimoRegistro: today };
}

function withBudgetsGastado(
  expenses: Expense[],
  budgets: Budget[],
  ym: string,
  display: MonedaCode,
  rate: number,
): Budget[] {
  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    if (e.mes !== ym) continue;
    const v = convertAmount(e.importe, e.moneda, display, rate);
    byCat[e.categoria] = (byCat[e.categoria] ?? 0) + v;
  }
  return budgets.map((b) => ({
    ...b,
    gastadoActual: convertAmount(byCat[b.categoria] ?? 0, display, b.moneda, rate),
  }));
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
  incomeCategories: { id: string; nombre: string; emoji: string; orden: number }[];
  loadFromSupabase: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadIncomeCategories: () => Promise<void>;
  addCategory: (nombre: string, emoji?: string) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  updateCategory: (id: string, nombre: string, emoji: string) => Promise<void>;
  addExpenseToSupabase: (input: {
    categoria: string;
    importe: number;
    estadoDeAnimo: EstadoDeAnimo | null;
    descripcion?: string;
    comercio?: string;
    esEsencial?: boolean;
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
  | 'incomeCategories'
  | 'loadFromSupabase'
  | 'loadCategories'
  | 'loadIncomeCategories'
  | 'addCategory'
  | 'removeCategory'
  | 'updateCategory'
  | 'addExpenseToSupabase'
  | 'addIncomeToSupabase'
> => {
  return {
    profile: {
      ...defaultProfile,
      metodosDePago: defaultProfile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO,
    },
    expenses: [],
    incomes: [],
    fixedExpenses: [],
    creditCards: [],
    budgets: [],
    missions: [],
    aiInsights: [],
    onboardingCompleted: false,
  };
};

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...seedState(),
      theme: 'light',
      syncing: false,
      lastSync: null,
      loadingCategories: false,
      categories: [],
      incomeCategories: [],

      setTheme: (mode) => {
        set({ theme: mode });
        void writeDarkModeCache(mode);
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
        set((s) => {
          const rate = s.profile.tipoDeCambio;
          if (s.profile.monedaPrincipal === moneda) {
            return { profile: { ...s.profile, monedaPrincipal: moneda } };
          }
          const budgets = s.budgets.map((b) => ({
            ...b,
            limiteMonthly: convertAmount(b.limiteMonthly, b.moneda, moneda, rate),
            gastadoActual: convertAmount(b.gastadoActual, b.moneda, moneda, rate),
            moneda,
          }));
          const fixedExpenses = s.fixedExpenses.map((f) => ({
            ...f,
            montoMensual: convertAmount(f.montoMensual, f.moneda, moneda, rate),
            moneda,
          }));
          const creditCards = s.creditCards.map((c) => ({
            ...c,
            lineaTotal: convertAmount(c.lineaTotal, c.moneda, moneda, rate),
            gastosMes: convertAmount(c.gastosMes, c.moneda, moneda, rate),
            moneda,
          }));
          const metaMensual = s.profile.metaMensual != null
            ? convertAmount(s.profile.metaMensual, s.profile.monedaPrincipal, moneda, rate)
            : s.profile.metaMensual;
          return {
            profile: { ...s.profile, monedaPrincipal: moneda, metaMensual },
            budgets,
            fixedExpenses,
            creditCards,
          };
        });
        void (async () => {
          const userId = useAuthStore.getState().user?.id;
          if (!userId) return;
          try {
            await db.updateProfile(userId, { moneda_principal: moneda });
          } catch (e) {
            console.error('Error guardando moneda principal:', e);
          }
        })();
      },

      setTipoDeCambio: (tipoDeCambio) => {
        const n = Number(tipoDeCambio);
        if (!Number.isFinite(n) || n <= 0) return;
        set((s) => ({
          profile: { ...s.profile, tipoDeCambio: n },
        }));
        void (async () => {
          const userId = useAuthStore.getState().user?.id;
          if (!userId) return;
          try {
            await db.updateProfile(userId, { tipo_de_cambio: n });
          } catch (e) {
            console.error('Error guardando tipo de cambio:', e);
          }
        })();
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
        const limite = Math.max(0, Number.isFinite(limiteMonthly) ? limiteMonthly : 0);
        const display = profile.monedaPrincipal;
        const rate = profile.tipoDeCambio;
        const byCatDisplay: Record<string, number> = {};
        for (const e of expenses) {
          if (e.mes !== ym) continue;
          byCatDisplay[e.categoria] =
            (byCatDisplay[e.categoria] ?? 0) + convertAmount(e.importe, e.moneda, display, rate);
        }
        const idx = budgets.findIndex((b) => b.categoria === categoriaId);
        if (idx >= 0) {
          set({
            budgets: budgets.map((b, i) => {
              if (i !== idx) return b;
              const gastadoDisplay = byCatDisplay[categoriaId] ?? 0;
              const gastadoActual = convertAmount(gastadoDisplay, display, b.moneda, rate);
              return { ...b, limiteMonthly: limite, gastadoActual };
            }),
          });
        } else {
          const gastadoDisplay = byCatDisplay[categoriaId] ?? 0;
          set({
            budgets: [
              ...budgets,
              {
                categoria: categoriaId,
                limiteMonthly: limite,
                gastadoActual: gastadoDisplay,
                moneda: display,
              },
            ],
          });
        }
        void (async () => {
          const userId = useAuthStore.getState().user?.id;
          if (!userId) return;
          try {
            await db.upsertBudget(userId, categoriaId, limite, ym);
          } catch (e) {
            console.error('Error guardando presupuesto:', e);
          }
        })();
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
        const display = profile.monedaPrincipal;
        const rate = profile.tipoDeCambio;
        const nextExpenses = [expense, ...expenses];
        const nextBudgets = withBudgetsGastado(nextExpenses, budgets, ym, display, rate);
        set({
          expenses: nextExpenses,
          budgets: nextBudgets,
          profile: {
            ...profile,
            ...streak,
            ...xp,
            rachaMaxima: Math.max(profile.rachaMaxima, streak.rachaActual),
            totalGastadoSemana: sumWeekExpenses(nextExpenses, display, rate),
            totalGastadoMes: sumMonthExpenses(nextExpenses, currentYearMonth(), display, rate),
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
          const rateLoad = Number(profileRow?.tipo_de_cambio ?? prev.profile.tipoDeCambio ?? 3.75);
          budgets = withBudgetsGastado(expenses, budgets, mesActual, monedaPrincipal, rateLoad);
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
                totalGastadoSemana: sumWeekExpenses(expenses, monedaPrincipal, rateLoad),
                totalGastadoMes: sumMonthExpenses(expenses, mesActual, monedaPrincipal, rateLoad),
                monedaPrincipal,
                tipoDeCambio: Number(profileRow.tipo_de_cambio ?? 3.75),
                misionesCompletadas: profileRow.misiones_completadas ?? 0,
                metaMensual: budgets.reduce((s, b) => s + b.limiteMonthly, 0) || 0,
                metodosDePago: db.metodosDePagoFromDb(profileRow.metodos_de_pago ?? undefined),
                bancosDisponibles: profileRow.bancos_disponibles?.length
                  ? profileRow.bancos_disponibles
                  : [...DEFAULT_BANCOS_DISPONIBLES],
              }
            : { ...prev.profile, id: userId };

          const tRaw = profileRow?.theme;
          const nextTheme: 'light' | 'dark' =
            tRaw === 'light'
              ? 'light'
              : tRaw === 'dark'
                ? 'dark'
                : tRaw == null || String(tRaw).trim() === ''
                  ? 'light'
                  : prev.theme;

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
          await get().loadCategories();
          await get().loadIncomeCategories();
        } catch (e) {
          console.error('Error cargando de Supabase:', e);
          set({ syncing: false });
        }
      },

      loadCategories: async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        set({ loadingCategories: true });
        try {
          const { data, error } = await supabase
            .from('user_categories')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('tipo', 'gasto')
            .order('orden', { ascending: true });
          if (error) throw error;
          const rows = data ?? [];
          const categories = rows.map((r: { id: string; nombre: string; emoji: string; orden: number | null }) => ({
            id: r.id,
            nombre: r.nombre,
            emoji: r.emoji,
            orden: typeof r.orden === 'number' ? r.orden : Number(r.orden) || 0,
          }));
          set({ categories, loadingCategories: false });
        } catch (e) {
          console.error('Error loadCategories:', e);
          set({ loadingCategories: false });
        }
      },

      loadIncomeCategories: async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        try {
          const { data, error } = await supabase
            .from('user_categories')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('tipo', 'ingreso')
            .order('orden', { ascending: true });
          if (error) throw error;
          const rows = data ?? [];
          const incomeCategories = rows.map((r: { id: string; nombre: string; emoji: string; orden: number | null }) => ({
            id: r.id,
            nombre: r.nombre,
            emoji: r.emoji,
            orden: typeof r.orden === 'number' ? r.orden : Number(r.orden) || 0,
          }));
          set({ incomeCategories });
        } catch (e) {
          console.error('Error loadIncomeCategories:', e);
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
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id),
          incomeCategories: state.incomeCategories.filter((c) => c.id !== id),
        }));
      },

      updateCategory: async (id, nombre, emoji) => {
        const db = await import('@/lib/database');
        await db.updateCategory(id, nombre, emoji);
        set((state) => ({
          categories: state.categories.map((c) => (c.id === id ? { ...c, nombre, emoji } : c)),
          incomeCategories: state.incomeCategories.map((c) => (c.id === id ? { ...c, nombre, emoji } : c)),
        }));
      },

      addExpenseToSupabase: async ({
        categoria,
        importe,
        descripcion,
        estadoDeAnimo,
        comercio,
        esEsencial,
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
            esEsencial,
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
          esEsencial: esEsencial ?? false,
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
        const display = profile.monedaPrincipal;
        const rate = profile.tipoDeCambio;
        const nextExpenses = [expense, ...expenses];
        const nextBudgets = withBudgetsGastado(nextExpenses, budgets, ym, display, rate);
        set({
          expenses: nextExpenses,
          budgets: nextBudgets,
          profile: {
            ...profile,
            ...streak,
            ...xp,
            rachaMaxima: Math.max(profile.rachaMaxima, streak.rachaActual),
            totalGastadoSemana: sumWeekExpenses(nextExpenses, display, rate),
            totalGastadoMes: sumMonthExpenses(nextExpenses, currentYearMonth(), display, rate),
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

      getWeekSpent: (refDate = new Date()) => {
        const { expenses, profile } = get();
        return sumWeekExpenses(expenses, profile.monedaPrincipal, profile.tipoDeCambio, refDate);
      },
    }),
    {
      name: 'ahorraya-store-v2',
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
