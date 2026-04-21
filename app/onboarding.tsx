import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import LoaderTransicion from '@/components/LoaderTransicion';
import { darkTheme as T } from '@/constants/theme';
import * as db from '@/lib/database';
import { createId } from '@/lib/ids';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';
import { DEFAULT_BANCOS_DISPONIBLES, type MonedaCode } from '@/types';

// ─── Payment / Currency options ────────────────────────────────────────────────

const DEFAULT_PAYMENT_OPTIONS = [
  'Efectivo', 'Yape', 'Plin', 'Suscripciones', 'Crédito', 'BIM', 'Transferencia',
];

const PAYMENT_EMOJI: Record<string, string> = {
  'Efectivo': '💵', 'Yape': '💜', 'Plin': '💙',
  'Suscripciones': '📺', 'Crédito': '🏦', 'BIM': '📲', 'Transferencia': '↔️',
};
const NETFLIX_LOGO = require('@/assets/images/netflix.png');

const BANK_EMOJI: Record<string, string> = {
  'BCP': '🔵', 'Scotiabank': '🔴', 'Interbank': '🟠',
  'BBVA': '🟦', 'Banco Pichincha': '🟢', 'BanBif': '🟣', 'Mibanco': '🟡',
};

type CurrencyOption = { code: MonedaCode; symbol: string; name: string; flag: string };
const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'PEN', symbol: 'S/.', name: 'Sol Peruano', flag: '🇵🇪' },
  { code: 'USD', symbol: '$',   name: 'Dólar',       flag: '🇺🇸' },
];

// ─── Salary ranges ─────────────────────────────────────────────────────────────

type SalarioId = 'basico' | 'junior' | 'medio' | 'senior' | 'alto' | 'custom';

const SALARY_RANGES: { id: SalarioId; label: string; sub: string; icon: string }[] = [
  { id: 'basico', label: 'Hasta S/. 1,200',    sub: 'Por debajo del mínimo',          icon: '🌱' },
  { id: 'junior', label: 'S/. 1,200 – 2,500',  sub: 'Sueldo mínimo a básico',         icon: '📊' },
  { id: 'medio',  label: 'S/. 2,500 – 6,000',  sub: 'Profesional en crecimiento',     icon: '💼' },
  { id: 'senior', label: 'S/. 6,000 – 12,000', sub: 'Profesional senior',             icon: '🚀' },
  { id: 'alto',   label: 'S/. 12,000+',         sub: 'Alta dirección o empresario',    icon: '💎' },
  { id: 'custom', label: 'Personalizar sueldo', sub: 'Ingresa un monto aproximado', icon: '✍️' },
];

// ─── Budget category pool (≥21 opciones) ──────────────────────────────────────

const ALL_BUDGET_CATS = [
  { id: 'comida',        nombre: 'Comida',       emoji: '🍔' },
  { id: 'vivienda',      nombre: 'Vivienda',     emoji: '🏠' },
  { id: 'transporte',    nombre: 'Transporte',   emoji: '🚌' },
  { id: 'salud',         nombre: 'Salud',        emoji: '💊' },
  { id: 'servicios',     nombre: 'Servicios',    emoji: '💡' },
  { id: 'suscripciones', nombre: 'Suscripciones',emoji: '📱' },
  { id: 'ocio',          nombre: 'Ocio',         emoji: '🎬' },
  { id: 'ropa',          nombre: 'Ropa',         emoji: '👕' },
  { id: 'educacion',     nombre: 'Educación',    emoji: '📚' },
  { id: 'mascotas',      nombre: 'Mascotas',     emoji: '🐾' },
  { id: 'viajes',        nombre: 'Viajes',       emoji: '✈️' },
  { id: 'gaming',        nombre: 'Gaming',       emoji: '🎮' },
  { id: 'otros',         nombre: 'Otros',        emoji: '📦' },
];

type BudgetCatEntry = { id: string; nombre: string; emoji: string };
const BASE_BUDGET_IDS = ['comida', 'vivienda', 'transporte'] as const;

// ─── Smart recommendations per salary tier ────────────────────────────────────

const SALARY_RECOMMENDED: Record<SalarioId, string[]> = {
  basico: ['comida', 'vivienda', 'transporte', 'servicios', 'salud'],
  junior: ['comida', 'vivienda', 'transporte', 'servicios', 'salud', 'suscripciones', 'ocio'],
  medio:  ['comida', 'vivienda', 'transporte', 'servicios', 'salud', 'suscripciones', 'ocio', 'ropa', 'mascotas'],
  senior: ['comida', 'vivienda', 'transporte', 'servicios', 'salud', 'suscripciones', 'ocio', 'ropa', 'educacion', 'viajes', 'mascotas'],
  alto:   ['comida', 'vivienda', 'transporte', 'servicios', 'salud', 'suscripciones', 'ocio', 'ropa', 'educacion', 'viajes', 'gaming', 'mascotas'],
  custom: [...BASE_BUDGET_IDS],
};

const SALARY_BUDGET_PCT: Record<SalarioId, Partial<Record<string, number>>> = {
  basico: { comida: 0.32, vivienda: 0.28, transporte: 0.14, servicios: 0.09, salud: 0.07 }, // 10% ahorro
  junior: { comida: 0.28, vivienda: 0.27, transporte: 0.13, servicios: 0.08, salud: 0.07, suscripciones: 0.03, ocio: 0.04 }, // 10% ahorro
  medio:  { comida: 0.23, vivienda: 0.28, transporte: 0.10, servicios: 0.07, salud: 0.06, suscripciones: 0.04, ocio: 0.04, ropa: 0.04, mascotas: 0.02 }, // 12% ahorro
  senior: { comida: 0.18, vivienda: 0.27, transporte: 0.08, servicios: 0.07, salud: 0.05, suscripciones: 0.04, ocio: 0.05, ropa: 0.04, educacion: 0.04, viajes: 0.06, mascotas: 0.02 }, // 10% ahorro
  alto:   { comida: 0.14, vivienda: 0.24, transporte: 0.07, servicios: 0.06, salud: 0.05, suscripciones: 0.04, ocio: 0.05, ropa: 0.04, educacion: 0.05, viajes: 0.10, gaming: 0.03, mascotas: 0.02 }, // 15% ahorro
  custom: { comida: 0.30, vivienda: 0.30, transporte: 0.20 }, // 20% ahorro
};

const SALARY_MEDIAN: Record<SalarioId, number> = {
  basico: 850, junior: 1800, medio: 4000, senior: 9000, alto: 15000, custom: 3000,
};

// ─── Income categories ─────────────────────────────────────────────────────────

const INCOME_CATEGORIAS_DEFAULT = [
  { id: '1', nombre: 'Sueldo',         emoji: '💼' },
  { id: '2', nombre: 'Inversiones',    emoji: '📈' },
  { id: '3', nombre: 'Préstamos',      emoji: '🏦' },
  { id: '4', nombre: 'Ventas',         emoji: '🛍️' },
  { id: '5', nombre: 'Transferencias', emoji: '↔️' },
  { id: '6', nombre: 'Freelance',      emoji: '💻' },
  { id: '7', nombre: 'Otros',          emoji: '📦' },
];

// ─── Step metadata ─────────────────────────────────────────────────────────────

const STEP_LABELS = ['Bienvenida', 'Mis ingresos', 'Tu perfil', 'Gastos', 'Presupuestos', 'Fuentes'];
const TOTAL_STEPS = 6;
const TIPO_CAMBIO_DEFAULT = 3.75;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { loadFromSupabase, profile } = useFinanceStore();

  // ── Step & animation ────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const stepOpacity  = useRef(new Animated.Value(1)).current;
  const stepTransY   = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  const [progressTrackW, setProgressTrackW] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // ── Salary ──────────────────────────────────────────────────────────────────
  const [salarioRango, setSalarioRango]           = useState<SalarioId | ''>('');
  const [showApproxModal, setShowApproxModal]     = useState(false);
  const [pendingSalarioId, setPendingSalarioId]   = useState<SalarioId | ''>('');
  const [ingresoAprox, setIngresoAprox]           = useState('');
  const [incomeForProjection, setIncomeForProjection] = useState<number | null>(null);
  const [showSavingsGoalModal, setShowSavingsGoalModal] = useState(false);
  const [savingsGoalInput, setSavingsGoalInput] = useState('');

  // ── Profile ─────────────────────────────────────────────────────────────────
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [moneda, setMoneda] = useState<MonedaCode>('PEN');
  const [profileNameError, setProfileNameError] = useState('');

  // ── Payment methods ──────────────────────────────────────────────────────────
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>(() => {
    const saved = (profile.metodosDePago ?? []).map((m) => m.nombre);
    const all = [...DEFAULT_PAYMENT_OPTIONS];
    for (const m of saved) if (!all.includes(m)) all.push(m);
    return all;
  });
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(['Efectivo']);
  const [newCustomPayment, setNewCustomPayment]               = useState('');
  const [showCustomPaymentInput, setShowCustomPaymentInput]   = useState(false);

  // ── Banks ────────────────────────────────────────────────────────────────────
  const [bankOptions, setBankOptions] = useState<string[]>(() => {
    const saved = profile.bancosDisponibles ?? [];
    const all = [...DEFAULT_BANCOS_DISPONIBLES];
    for (const b of saved) if (!all.includes(b)) all.push(b);
    return all;
  });
  const [selectedBanks, setSelectedBanks] = useState<string[]>(['BCP']);
  const [newCustomBank, setNewCustomBank]             = useState('');
  const [showCustomBankInput, setShowCustomBankInput] = useState(false);

  // ── Budget categories ────────────────────────────────────────────────────────
  const [presupuestos, setPresupuestos]     = useState<Record<string, string>>({});
  const [categoriasList, setCategoriasList] = useState<BudgetCatEntry[]>(() =>
    SALARY_RECOMMENDED.custom
      .map((id) => ALL_BUDGET_CATS.find((c) => c.id === id))
      .filter((c): c is BudgetCatEntry => c != null)
      .map((c) => ({ id: c.id, nombre: c.nombre, emoji: c.emoji })),
  );

  const [pickerCustomName, setPickerCustomName]           = useState('');
  const [showPickerCustomInput, setShowPickerCustomInput] = useState(false);

  // ── Income categories (touch selection) ─────────────────────────────────────
  const [incomeSourceOptions] = useState(INCOME_CATEGORIAS_DEFAULT);
  const [selectedIncomeSourceIds, setSelectedIncomeSourceIds] = useState<string[]>([]);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const [showLoader, setShowLoader] = useState(false);
  const [finishing, setFinishing]   = useState(false);

  // ── Progress bar ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (step + 1) / TOTAL_STEPS,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, progressAnim]);

  // ── Step navigation ───────────────────────────────────────────────────────────
  const goToStep = (n: number) => {
    Animated.timing(stepOpacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setStep(n);
      stepTransY.setValue(18);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.parallel([
        Animated.timing(stepOpacity, { toValue: 1, duration: 270, useNativeDriver: true }),
        Animated.timing(stepTransY, {
          toValue: 0, duration: 270,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // ── Salary selection → auto-populate budgets ──────────────────────────────────
  const applyBudgetRecommendations = (id: SalarioId, income: number) => {
    setIncomeForProjection(income);
    const ids = SALARY_RECOMMENDED[id];
    const newCats = ids
      .map((catId) => ALL_BUDGET_CATS.find((c) => c.id === catId))
      .filter((c): c is BudgetCatEntry => c != null)
      .map((c) => ({ id: c.id, nombre: c.nombre, emoji: c.emoji }));
    setCategoriasList(newCats);
    const pcts = SALARY_BUDGET_PCT[id];
    const amounts: Record<string, string> = {};
    for (const cat of newCats) {
      const pct = pcts[cat.id];
      if (pct) amounts[cat.nombre] = Math.round(income * pct).toString();
    }
    setPresupuestos(amounts);
  };

  const handleSalarioSelect = (id: SalarioId) => {
    setSalarioRango(id);
    setPendingSalarioId(id);
    setIngresoAprox(id === 'custom' ? '' : String(SALARY_MEDIAN[id]));
    setShowApproxModal(true);
  };

  const handleApproxConfirm = () => {
    const id = pendingSalarioId as SalarioId;
    const parsed = parseFloat(ingresoAprox);
    const income = Number.isFinite(parsed) && parsed > 0 ? parsed : SALARY_MEDIAN[id] || 3000;
    applyBudgetRecommendations(id, income);
    setShowApproxModal(false);
  };

  const openSavingsGoalModal = () => {
    const income = incomeForProjection ?? (salarioRango ? SALARY_MEDIAN[salarioRango] : 3000);
    const id = salarioRango || 'custom';
    const pctMap = SALARY_BUDGET_PCT[id];
    const assignedRatio = Object.values(pctMap).reduce<number>((acc, n) => acc + (n ?? 0), 0);
    const baselineSavings = Math.max(income * (1 - assignedRatio), 0);
    setSavingsGoalInput(String(Math.round(baselineSavings)));
    setShowSavingsGoalModal(true);
  };

  const applySavingsGoalAndContinue = () => {
    const id = salarioRango || 'custom';
    const income = incomeForProjection ?? (SALARY_MEDIAN[id] || 3000);
    const rawGoal = parseFloat(savingsGoalInput);
    const savingsGoal = Number.isFinite(rawGoal) ? Math.max(0, Math.min(rawGoal, income * 0.9)) : 0;
    const spendable = Math.max(income - savingsGoal, 0);

    const ids = SALARY_RECOMMENDED[id];
    const newCats = ids
      .map((catId) => ALL_BUDGET_CATS.find((c) => c.id === catId))
      .filter((c): c is BudgetCatEntry => c != null)
      .map((c) => ({ id: c.id, nombre: c.nombre, emoji: c.emoji }));
    setCategoriasList(newCats);

    const pcts = SALARY_BUDGET_PCT[id];
    const weights = newCats.map((cat) => pcts[cat.id] ?? 0).reduce((acc, n) => acc + n, 0);
    const amounts: Record<string, string> = {};
    for (const cat of newCats) {
      const w = pcts[cat.id] ?? 0;
      const ratio = weights > 0 ? (w / weights) : (1 / Math.max(newCats.length, 1));
      amounts[cat.nombre] = Math.round(spendable * ratio).toString();
    }
    setPresupuestos(amounts);
    setIncomeForProjection(income);
    setShowSavingsGoalModal(false);
    goToStep(4);
  };

  // ── Category picker helpers ───────────────────────────────────────────────────
  const isCatSelected = (catId: string) => categoriasList.some((c) => c.id === catId);

  const togglePickerCat = (cat: typeof ALL_BUDGET_CATS[number]) => {
    if (isCatSelected(cat.id)) {
      setCategoriasList((prev) => prev.filter((c) => c.id !== cat.id));
    } else {
      setCategoriasList((prev) => [...prev, { id: cat.id, nombre: cat.nombre, emoji: cat.emoji }]);
    }
  };

  const handleAddPickerCustom = () => {
    const trimmed = pickerCustomName.trim();
    if (!trimmed) return;
    const newId = `custom_${Date.now()}`;
    if (!categoriasList.some((c) => c.nombre.toLowerCase() === trimmed.toLowerCase())) {
      setCategoriasList((prev) => [...prev, { id: newId, nombre: trimmed, emoji: '📦' }]);
    }
    setPickerCustomName('');
    setShowPickerCustomInput(false);
  };

  const handleRemoveCat = (id: string) =>
    setCategoriasList((prev) => prev.filter((c) => c.id !== id));

  // ── Payment / Bank handlers ───────────────────────────────────────────────────
  const togglePaymentMethod = (name: string) =>
    setSelectedPaymentMethods((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name],
    );

  const handleAddCustomPaymentMethod = () => {
    const t = newCustomPayment.trim();
    if (!t) return;
    if (!paymentMethodOptions.includes(t)) setPaymentMethodOptions((p) => [...p, t]);
    if (!selectedPaymentMethods.includes(t)) setSelectedPaymentMethods((p) => [...p, t]);
    setNewCustomPayment('');
    setShowCustomPaymentInput(false);
  };

  const toggleBank = (name: string) =>
    setSelectedBanks((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name],
    );

  const handleAddCustomBank = () => {
    const t = newCustomBank.trim();
    if (!t) return;
    if (!bankOptions.includes(t)) setBankOptions((p) => [...p, t]);
    if (!selectedBanks.includes(t)) setSelectedBanks((p) => [...p, t]);
    setNewCustomBank('');
    setShowCustomBankInput(false);
  };

  const handleProfileContinue = () => {
    if (!nombreUsuario.trim()) {
      setProfileNameError('Debes insertar un nombre o apodo.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setProfileNameError('');
    goToStep(3);
  };

  const toggleIncomeSource = (id: string) => {
    setSelectedIncomeSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ── handleFinish ─────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!user) { router.replace('/(tabs)' as any); return; }
    if (selectedIncomeSourceIds.length === 0) return;
    setFinishing(true);
    try {
      const nombreGuardado = nombreUsuario.trim() || 'Usuario';
      await db.updateProfile(user.id, {
        nombre_usuario:     nombreGuardado,
        moneda_principal:   moneda,
        tipo_de_cambio:     TIPO_CAMBIO_DEFAULT,
        metodos_de_pago:    selectedPaymentMethods,
        bancos_disponibles: selectedBanks,
        onboarding_done:    true,
      });

      await loadFromSupabase();

      useFinanceStore.setState((state) => ({
        profile: {
          ...state.profile,
          nombreUsuario:     nombreGuardado,
          monedaPrincipal:   moneda,
          tipoDeCambio:      TIPO_CAMBIO_DEFAULT,
          metodosDePago:     selectedPaymentMethods.map((n) => ({ id: createId(), nombre: n, activo: true })),
          bancosDisponibles: selectedBanks,
        },
      }));

      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? user.id;

      // Guardar categorías de GASTOS
      try {
        await supabase.from('user_categories').delete().eq('user_id', uid).eq('tipo', 'gasto');
        for (let i = 0; i < categoriasList.length; i++) {
          const cat = categoriasList[i];
          await supabase.from('user_categories').insert({ user_id: uid, nombre: cat.nombre, emoji: cat.emoji, tipo: 'gasto', orden: i + 1 });
        }
      } catch (e) { console.error('Error bloque gastos:', e); }

      // Guardar categorías de INGRESOS
      try {
        await supabase.from('user_categories').delete().eq('user_id', uid).eq('tipo', 'ingreso');
        const selectedIncomeCats = incomeSourceOptions.filter((c) => selectedIncomeSourceIds.includes(c.id));
        for (let i = 0; i < selectedIncomeCats.length; i++) {
          const cat = selectedIncomeCats[i];
          await supabase.from('user_categories').insert({ user_id: uid, nombre: cat.nombre, emoji: cat.emoji, tipo: 'ingreso', orden: i + 1 });
        }
      } catch (e) { console.error('Error bloque ingresos:', e); }

      // Guardar presupuestos
      const mes = new Date().toISOString().slice(0, 7);
      await Promise.all(
        Object.entries(presupuestos)
          .filter(([, val]) => val && parseFloat(val) > 0)
          .map(([cat, lim]) => db.upsertBudget(user.id, cat, parseFloat(lim), mes)),
      );

      await AsyncStorage.setItem('ahorraya_onboarding_done', 'true');
      useFinanceStore.setState({ categories: [], incomeCategories: [] });
      const { loadFromSupabase: sync, loadCategories, loadIncomeCategories } = useFinanceStore.getState();
      await sync();
      await loadCategories();
      if (typeof loadIncomeCategories === 'function') await loadIncomeCategories();

      setFinishing(false);
      setShowLoader(true);
    } catch (e) {
      console.error('Error in handleFinish:', e);
      setFinishing(false);
      await AsyncStorage.setItem('ahorraya_onboarding_done', 'true');
      router.replace('/(tabs)' as any);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const progressFillWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, progressTrackW],
  });
  const currencySymbol = moneda === 'USD' ? '$' : 'S/.';
  const selectedRangeMeta = SALARY_RANGES.find((r) => r.id === salarioRango);
  const projectionIncome = incomeForProjection ?? (salarioRango ? SALARY_MEDIAN[salarioRango] : null);
  const projectedAssigned = useMemo(
    () =>
      categoriasList.reduce((acc, cat) => {
        const val = parseFloat((presupuestos[cat.nombre] ?? '').replace(',', '.'));
        return acc + (Number.isFinite(val) ? val : 0);
      }, 0),
    [categoriasList, presupuestos],
  );
  const projectedSavings = projectionIncome != null ? Math.max(projectionIncome - projectedAssigned, 0) : null;
  const projectedSavingsPct = projectionIncome && projectionIncome > 0 && projectedSavings != null
    ? (projectedSavings / projectionIncome) * 100
    : null;
  const savingsGoalValue = parseFloat(savingsGoalInput);
  const savingsGoalIncomeBase = incomeForProjection ?? (salarioRango ? SALARY_MEDIAN[salarioRango] : 3000);
  const selectedSalaryId = (salarioRango || 'custom') as SalarioId;
  const recommendedSavingsRatio = 1 - Object.values(SALARY_BUDGET_PCT[selectedSalaryId]).reduce<number>((acc, n) => acc + (n ?? 0), 0);
  const recommendedSavingsAmount = Math.max(savingsGoalIncomeBase * recommendedSavingsRatio, 0);
  const recommendedSavingsPct = Math.max(recommendedSavingsRatio * 100, 0);
  const savingsGoalPct = Number.isFinite(savingsGoalValue) && savingsGoalIncomeBase > 0
    ? (savingsGoalValue / savingsGoalIncomeBase) * 100
    : 0;
  const money = (n: number) => Math.round(n).toLocaleString('es-PE');

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[S.container, { backgroundColor: T.bg }]}>

      {/* ── Progress header ───────────────────────────────────────────── */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <Text style={[S.stepLabel, { color: T.textSecondary }]}>{STEP_LABELS[step]}</Text>
          <Text style={[S.stepCount, { color: T.textMuted }]}>
            <Text style={{ color: T.primary, fontWeight: '700' }}>{step + 1}</Text>
            {' / '}{TOTAL_STEPS}
          </Text>
        </View>
        <View
          style={[S.progressTrack, { backgroundColor: T.glassLight }]}
          onLayout={(e) => setProgressTrackW(e.nativeEvent.layout.width)}>
          <Animated.View style={[S.progressFill, { backgroundColor: T.primary, width: progressFillWidth }]} />
        </View>
      </View>

      {/* ── Animated step container ───────────────────────────────────── */}
      <Animated.View style={{ flex: 1, opacity: stepOpacity, transform: [{ translateY: stepTransY }] }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={S.slide}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ───────────── PASO 0 · Bienvenida ───────────────────────── */}
          {step === 0 && (
            <View style={S.stepContent}>

              {/* Hero icon + headline */}
              <View style={S.heroSection}>
                <View style={[S.iconBox, { backgroundColor: T.primaryBg, borderColor: T.primaryBorder, width: 80, height: 80, borderRadius: 24 }]}>
                  <Text style={{ fontSize: 38 }}>💎</Text>
                </View>

                <Text style={[S.heroTitle, { color: T.textPrimary }]}>
                  Incrementa tu ahorro{'\n'}
                  <Text style={{ color: T.primary }}>30%+</Text> sin darte cuenta
                </Text>

                <Text style={{ fontSize: 13, color: T.textMuted, fontWeight: '600', textAlign: 'center', letterSpacing: 0.4 }}>
                  ¿Sabes exactamente en qué gastas tu dinero?
                </Text>

                <Text style={[S.heroSub, { color: T.textSecondary }]}>
                  AhorraYA te ayuda a cambiar para siempre la manera en que manejas tus finanzas — sin esfuerzo extra.
                </Text>
              </View>

              {/* Stat mini-cards */}
              <View style={S.statRow}>
                {/* Card 1 – custom with bold "No." */}
                <View style={[S.statCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                  <Text style={[S.statValue, { color: T.textPrimary }]}>8 de 10</Text>
                  <View style={S.statLabelWrap}>
                    <Text style={[S.statLabel, { color: T.textMuted }]}>{'creen que ganando\nmás ahorrarán más.'}</Text>
                  </View>
                  <Text style={S.statSpoiler}>Spoiler: No.</Text>
                </View>

                {/* Cards 2 & 3 */}
                {[
                  { value: '68%',     label: 'del sueldo\ndesaparece\nsin explicación', accent: false },
                  { value: 'Solo 8%', label: 'ahorra de forma\nconstante.\nSé del grupo.', accent: true },
                ].map((s) => (
                  <View
                    key={s.label}
                    style={[
                      S.statCard,
                      s.accent
                        ? { backgroundColor: T.primaryBg, borderColor: T.primary, borderWidth: 1.5 }
                        : { backgroundColor: T.card, borderColor: T.glassBorder },
                    ]}>
                    <Text style={[S.statValue, { color: s.accent ? T.primary : T.textPrimary }]}>{s.value}</Text>
                    <View style={S.statLabelWrap}>
                      <Text style={[S.statLabel, { color: T.textMuted }]}>{s.label}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Social proof */}
              <View style={[S.socialProof, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                <Text style={{ fontSize: 26, marginRight: 12 }}>🇵🇪</Text>
                <Text style={{ fontSize: 16, color: T.textSecondary, flex: 1, lineHeight: 24, fontFamily: 'Manrope_400Regular' }}>
                  Miles de peruanos ya organizan su dinero con{' '}
                  <Text style={{ color: T.textPrimary, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold' }}>AhorraYA</Text>
                </Text>
              </View>

              <TouchableOpacity style={[S.ctaBtn, { backgroundColor: T.primary }]} onPress={() => goToStep(1)} activeOpacity={0.84}>
                <Text style={S.ctaBtnText}>Empezar ahora →</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 12, color: T.textMuted, textAlign: 'center', marginTop: -8 }}>
                Gratis · Configuración en menos de 3 minutos
              </Text>
            </View>
          )}

          {/* ───────────── PASO 1 · Rango salarial ────────────────────── */}
          {step === 1 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>¿Cuál es tu rango{'\n'}de ingresos?</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  Lo usamos para sugerirte categorías y presupuestos más relevantes para ti.
                </Text>
              </View>

              <View style={{ width: '100%', gap: 10 }}>
                {SALARY_RANGES.map((r) => {
                  const active = salarioRango === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        S.salaryCard,
                        {
                          backgroundColor: active ? T.primaryBg  : T.surface,
                          borderColor:     active ? T.primary    : T.glassBorder,
                          borderWidth:     active ? 1.5 : 1,
                        },
                      ]}
                      onPress={() => handleSalarioSelect(r.id)}
                      activeOpacity={0.8}>
                      <Text style={{ fontSize: 22, width: 34 }}>{r.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.salaryLabel, { color: active ? T.primary : T.textPrimary }]}>{r.label}</Text>
                        <Text style={{ fontSize: 12, color: T.textMuted, marginTop: 1 }}>{r.sub}</Text>
                      </View>
                      <View style={[
                        S.radioCircle,
                        { borderColor: active ? T.primary : T.glassBorder, backgroundColor: active ? T.primary : 'transparent' },
                      ]}>
                        {active && <View style={S.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[S.privacyNote, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
                <Text style={{ fontSize: 12, color: T.textMuted, lineHeight: 18 }}>
                  🔒 Esta información es privada y solo se usa para personalizar tu experiencia. No se comparte con nadie.
                </Text>
              </View>

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(0)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.ctaBtn, { backgroundColor: salarioRango ? T.primary : T.surface, flex: 1 }]}
                  onPress={() => goToStep(2)}
                  disabled={!salarioRango}
                  activeOpacity={0.84}>
                  <Text style={[S.ctaBtnText, { color: salarioRango ? '#fff' : T.textMuted }]}>
                    Continuar →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ───────────── PASO 2 · Tu perfil ─────────────────────────── */}
          {step === 2 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Tu perfil financiero</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  Personaliza la app según tus hábitos reales.
                </Text>
              </View>

              {/* Nombre */}
              <View style={[S.fieldGroup, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
                <Text style={[S.fieldLabel, { color: T.textMuted }]}>¿CÓMO TE LLAMAMOS?</Text>
                <TextInput
                  style={[S.fieldInput, { color: T.textPrimary }]}
                  placeholder="Tu nombre o apodo"
                  placeholderTextColor={T.textMuted}
                  value={nombreUsuario}
                  onChangeText={(val) => {
                    setNombreUsuario(val);
                    if (profileNameError && val.trim()) setProfileNameError('');
                  }}
                  returnKeyType="done"
                />
              </View>
              {profileNameError ? (
                <Text style={{ width: '100%', color: '#f97373', fontSize: 12, marginTop: -8, marginBottom: -2 }}>
                  {profileNameError}
                </Text>
              ) : null}

              {/* Moneda */}
              <View style={{ width: '100%', gap: 10 }}>
                <Text style={[S.label, { color: T.textSecondary }]}>Moneda principal</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {CURRENCY_OPTIONS.map((cur) => {
                    const active = moneda === cur.code;
                    return (
                      <TouchableOpacity
                        key={cur.code}
                        style={[S.currencyCard, { flex: 1, backgroundColor: active ? T.primaryBg : T.surface, borderColor: active ? T.primary : T.glassBorder, borderWidth: active ? 1.5 : 1 }]}
                        onPress={() => setMoneda(cur.code)}
                        activeOpacity={0.8}>
                        <View style={[S.flagBadge, { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: active ? T.primary : T.glassBorder }]}>
                          <Text style={{ fontSize: 22 }}>{cur.flag}</Text>
                        </View>
                        <Text style={[S.currencySymbol, { color: active ? T.primary : T.textPrimary }]}>{cur.symbol}</Text>
                        <Text style={{ fontSize: 12, color: T.textMuted }}>{cur.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Métodos de pago */}
              <View style={{ width: '100%', gap: 12 }}>
                <View style={S.labelRow}>
                  <View>
                    <Text style={[S.label, { color: T.textPrimary, fontSize: 15 }]}>¿Cómo pagas normalmente?</Text>
                    <Text style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Selecciona todos los que usas</Text>
                  </View>
                  {selectedPaymentMethods.length > 0 && (
                    <View style={[S.countBadge, { backgroundColor: T.primaryBg, borderColor: T.primary }]}>
                      <Text style={{ fontSize: 12, color: T.primary, fontWeight: '700' }}>{selectedPaymentMethods.length}</Text>
                    </View>
                  )}
                </View>

                <View style={S.methodGrid}>
                  {paymentMethodOptions.map((m) => {
                    const active = selectedPaymentMethods.includes(m);
                    const emoji = PAYMENT_EMOJI[m] ?? '💳';
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[S.methodCard, { backgroundColor: active ? T.primaryBg : T.card, borderColor: active ? T.primary : T.glassBorder, borderWidth: active ? 1.5 : 1 }]}
                        onPress={() => togglePaymentMethod(m)}
                        activeOpacity={0.75}>
                        {m === 'Suscripciones' ? (
                          <Image
                            source={NETFLIX_LOGO}
                            style={S.netflixLogo}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={{ fontSize: 22 }}>{emoji}</Text>
                        )}
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '400', color: active ? T.primary : T.textSecondary, marginTop: 4, textAlign: 'center' }}>{m}</Text>
                        {active && (
                          <View style={[S.methodCheck, { backgroundColor: T.primary }]}>
                            <Text style={{ fontSize: 8, color: '#fff' }}>✓</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {showCustomPaymentInput ? (
                  <View style={S.inlineRow}>
                    <TextInput
                      style={[S.inlineInput, { flex: 1, backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                      placeholder="Ej: PayPal, Nequi..."
                      placeholderTextColor={T.textMuted}
                      value={newCustomPayment}
                      onChangeText={setNewCustomPayment}
                      onSubmitEditing={handleAddCustomPaymentMethod}
                      returnKeyType="done"
                      autoFocus
                    />
                    <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary }]} onPress={handleAddCustomPaymentMethod}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Agregar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.inlineCancel} onPress={() => setShowCustomPaymentInput(false)}>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[S.addOtherBtn, { borderColor: T.glassBorder }]}
                    onPress={() => setShowCustomPaymentInput(true)}
                    activeOpacity={0.75}>
                    <Text style={{ fontSize: 18, color: T.textMuted }}>＋</Text>
                    <Text style={{ fontSize: 13, color: T.textSecondary, fontWeight: '600' }}>Otro método de pago</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Bancos */}
              <View style={{ width: '100%', gap: 12 }}>
                <View style={S.labelRow}>
                  <View>
                    <Text style={[S.label, { color: T.textPrimary, fontSize: 15 }]}>¿Qué bancos usas?</Text>
                    <Text style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>Para clasificar mejor tus movimientos</Text>
                  </View>
                  {selectedBanks.length > 0 && (
                    <View style={[S.countBadge, { backgroundColor: T.primaryBg, borderColor: T.primary }]}>
                      <Text style={{ fontSize: 12, color: T.primary, fontWeight: '700' }}>{selectedBanks.length}</Text>
                    </View>
                  )}
                </View>

                <View style={S.bankGrid}>
                  {bankOptions.map((b) => {
                    const active = selectedBanks.includes(b);
                    const emoji = BANK_EMOJI[b] ?? '🏦';
                    return (
                      <TouchableOpacity
                        key={b}
                        style={[S.bankCard, { backgroundColor: active ? T.primaryBg : T.card, borderColor: active ? T.primary : T.glassBorder, borderWidth: active ? 1.5 : 1 }]}
                        onPress={() => toggleBank(b)}
                        activeOpacity={0.75}>
                        <Text style={{ fontSize: 20 }}>{emoji}</Text>
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '400', color: active ? T.primary : T.textSecondary, flex: 1 }}>{b}</Text>
                        <View style={[S.radioCircle, { width: 18, height: 18, borderRadius: 9, borderColor: active ? T.primary : T.glassBorder, backgroundColor: active ? T.primary : 'transparent' }]}>
                          {active && <View style={[S.radioInner, { width: 7, height: 7, borderRadius: 3.5 }]} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {showCustomBankInput ? (
                  <View style={S.inlineRow}>
                    <TextInput
                      style={[S.inlineInput, { flex: 1, backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                      placeholder="Ej: Banco de la Nación..."
                      placeholderTextColor={T.textMuted}
                      value={newCustomBank}
                      onChangeText={setNewCustomBank}
                      onSubmitEditing={handleAddCustomBank}
                      returnKeyType="done"
                      autoFocus
                    />
                    <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary }]} onPress={handleAddCustomBank}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Agregar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.inlineCancel} onPress={() => setShowCustomBankInput(false)}>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[S.addOtherBtn, { borderColor: T.glassBorder }]}
                    onPress={() => setShowCustomBankInput(true)}
                    activeOpacity={0.75}>
                    <Text style={{ fontSize: 18, color: T.textMuted }}>＋</Text>
                    <Text style={{ fontSize: 13, color: T.textSecondary, fontWeight: '600' }}>Otro banco</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(1)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.ctaBtn, { backgroundColor: T.primary, flex: 1 }]} onPress={handleProfileContinue} activeOpacity={0.84}>
                  <Text style={S.ctaBtnText}>Continuar →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ───────────── PASO 4 · Qué gastos tienes ───────────────────── */}
          {step === 3 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>¿Qué gastos tienes?</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  Elige las categorías de gasto que aplican a tu vida diaria.
                </Text>
              </View>

              {/* Recommendation badge */}
              {selectedRangeMeta && (
                <View style={[S.suggBadge, { backgroundColor: T.primaryBg, borderColor: T.primaryBorder }]}>
                  <Text style={{ fontSize: 13, color: T.primary }}>
                    💡 Recomendadas para <Text style={{ fontWeight: '700' }}>{selectedRangeMeta.label}</Text>
                  </Text>
                </View>
              )}

              {/* Inline chip grid */}
              <View style={S.chipGrid}>
                {ALL_BUDGET_CATS.map((cat) => {
                  const active = isCatSelected(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        S.catChip,
                        { backgroundColor: active ? T.primaryBg : T.card, borderColor: active ? T.primary : T.glassBorder, borderWidth: active ? 1.5 : 1 },
                      ]}
                      onPress={() => togglePickerCat(cat)}
                      activeOpacity={0.75}>
                      <Text style={{ fontSize: 18 }}>{cat.emoji}</Text>
                      <Text style={{ fontSize: 11, color: active ? T.primary : T.textSecondary, fontWeight: active ? '700' : '400', marginTop: 2, textAlign: 'center' }}>
                        {cat.nombre}
                      </Text>
                      {active && (
                        <View style={[S.chipCheck, { backgroundColor: T.primary }]}>
                          <Text style={{ fontSize: 8, color: '#fff' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                {/* Custom categories added by user */}
                {categoriasList
                  .filter((c) => !ALL_BUDGET_CATS.find((bc) => bc.id === c.id))
                  .map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[S.catChip, { backgroundColor: T.primaryBg, borderColor: T.primary, borderWidth: 1.5 }]}
                      onPress={() => handleRemoveCat(cat.id)}
                      activeOpacity={0.75}>
                      <Text style={{ fontSize: 18 }}>{cat.emoji}</Text>
                      <Text style={{ fontSize: 11, color: T.primary, fontWeight: '700', marginTop: 2, textAlign: 'center' }}>
                        {cat.nombre}
                      </Text>
                      <View style={[S.chipCheck, { backgroundColor: T.primary }]}>
                        <Text style={{ fontSize: 8, color: '#fff' }}>✓</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>

              {/* Custom category CTA */}
              {showPickerCustomInput ? (
                <View style={[S.customCatInputCard, { backgroundColor: T.card, borderColor: T.primary }]}>
                  <Text style={{ fontSize: 15, color: T.textSecondary, marginBottom: 12, fontWeight: '600' }}>
                    💬 ¿Cómo se llama tu categoría?
                  </Text>
                  <View style={S.inlineRow}>
                    <TextInput
                      style={[S.inlineInput, { flex: 1, backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder, fontSize: 16 }]}
                      placeholder="Ej: Delivery, Gym, Garage..."
                      placeholderTextColor={T.textMuted}
                      value={pickerCustomName}
                      onChangeText={setPickerCustomName}
                      onSubmitEditing={handleAddPickerCustom}
                      returnKeyType="done"
                      autoFocus
                    />
                    <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary }]} onPress={handleAddPickerCustom}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Crear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.inlineCancel} onPress={() => setShowPickerCustomInput(false)}>
                      <Text style={{ color: T.textMuted, fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowPickerCustomInput(true)}
                  style={[S.addCustomCatBtn, { borderColor: T.primary, backgroundColor: T.primaryBg }]}
                  activeOpacity={0.8}>
                  <Text style={[S.addCustomCatIcon, { color: T.primary }]}>＋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.addCustomCatTitle, { color: T.primary }]}>
                      ¿No aparece tu gasto?
                    </Text>
                    <Text style={[S.addCustomCatSub, { color: T.textSecondary }]}>
                      Crea una categoría personalizada
                    </Text>
                  </View>
                  <Text style={{ fontSize: 20, color: T.primary }}>→</Text>
                </TouchableOpacity>
              )}

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(2)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.ctaBtn, { backgroundColor: T.primary, flex: 1 }]}
                  onPress={openSavingsGoalModal}
                  activeOpacity={0.84}>
                  <Text style={S.ctaBtnText}>
                    Ver presupuestos ({categoriasList.length}) →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ───────────── PASO 5 · Presupuestos mensuales ───────────────── */}
          {step === 4 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Presupuestos mensuales</Text>
                <View style={S.optionalBadge}>
                  <Text style={{ fontSize: 11, color: T.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
                </View>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  ¿Cuánto quieres destinar a cada área? Editable en cualquier momento.
                </Text>
              </View>

              {selectedRangeMeta && (
                <View style={[S.suggBadge, { backgroundColor: T.primaryBg, borderColor: T.primaryBorder }]}>
                  <Text style={{ fontSize: 13, color: T.primary }}>
                    💡 Sugerido para <Text style={{ fontWeight: '700' }}>{selectedRangeMeta.label}</Text>
                    {' · '}montos editables
                  </Text>
                </View>
              )}

              {projectionIncome != null && projectedSavings != null && (
                <View style={[S.projectionCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                  <Text style={[S.projectionTitle, { color: T.textPrimary }]}>Proyección con tu ingreso</Text>
                  <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 4 }}>
                    Ingreso considerado: <Text style={{ fontWeight: '700', color: T.textPrimary }}>{currencySymbol} {money(projectionIncome)}</Text>
                  </Text>
                  <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>
                    Presupuestado: <Text style={{ fontWeight: '700', color: T.textPrimary }}>{currencySymbol} {money(projectedAssigned)}</Text>
                  </Text>
                  <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 2 }}>
                    Margen de ahorro: <Text style={{ fontWeight: '800', color: projectedSavings > 0 ? '#22c55e' : T.textPrimary }}>
                      {currencySymbol} {money(projectedSavings)}
                      {projectedSavingsPct != null ? ` (${Math.round(projectedSavingsPct)}%)` : ''}
                    </Text>
                  </Text>
                </View>
              )}

              {/* Category list with amount inputs */}
              <View style={{ gap: 8, width: '100%' }}>
                {categoriasList.map((cat) => (
                  <View key={cat.id} style={[S.budgetCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                    <TextInput
                      value={cat.emoji}
                      onChangeText={(val) => setCategoriasList((prev) => prev.map((c) => c.id === cat.id ? { ...c, emoji: val } : c))}
                      style={[S.emojiInput, { backgroundColor: T.surface, borderColor: T.glassBorder, color: T.textPrimary }]}
                      maxLength={2}
                    />
                    <Text style={[S.budgetName, { color: T.textPrimary }]}>{cat.nombre}</Text>
                    <View style={[S.amountWrap, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
                      <Text style={{ fontSize: 12, color: T.textMuted, marginRight: 3 }}>{currencySymbol}</Text>
                      <TextInput
                        style={[S.amountInput, { color: T.textPrimary }]}
                        placeholder="0"
                        placeholderTextColor={T.textMuted}
                        value={presupuestos[cat.nombre] ?? ''}
                        onChangeText={(val) => setPresupuestos((prev) => ({ ...prev, [cat.nombre]: val }))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveCat(cat.id)} style={S.removeBtn}>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Quick-add from picker */}
              <TouchableOpacity
                style={[S.dashedBtn, { borderColor: T.glassBorder }]}
                onPress={() => goToStep(3)}>
                <Text style={{ color: T.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  ← Cambiar categorías
                </Text>
              </TouchableOpacity>

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(3)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.ctaBtn, { backgroundColor: T.primary, flex: 1 }]} onPress={() => goToStep(5)} activeOpacity={0.84}>
                  <Text style={S.ctaBtnText}>Continuar →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ───────────── PASO 6 · Fuentes de ingreso ─────────────────── */}
          {step === 5 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Fuentes de ingreso</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  ¿De dónde viene tu dinero? Elige al menos una fuente.
                </Text>
              </View>

              <View style={S.incomeSourceGrid}>
                {incomeSourceOptions.map((cat) => {
                  const active = selectedIncomeSourceIds.includes(cat.id);
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        S.incomeSourceCard,
                        {
                          backgroundColor: active ? T.primaryBg : T.card,
                          borderColor: active ? T.primary : T.glassBorder,
                          borderWidth: active ? 1.5 : 1,
                        },
                      ]}
                      onPress={() => toggleIncomeSource(cat.id)}
                      activeOpacity={0.8}>
                      <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? T.primary : T.textSecondary, marginTop: 4, textAlign: 'center' }}>
                        {cat.nombre}
                      </Text>
                      {active && (
                        <View style={[S.methodCheck, { backgroundColor: T.primary }]}>
                          <Text style={{ fontSize: 8, color: '#fff' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: 12, color: T.textMuted, width: '100%' }}>
                Seleccionadas: {selectedIncomeSourceIds.length}
              </Text>
              {selectedIncomeSourceIds.length === 0 && (
                <Text style={{ fontSize: 12, color: '#f59e0b', width: '100%' }}>
                  Debes elegir mínimo 1 fuente de ingreso para continuar.
                </Text>
              )}

              <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.primaryBorder }]}>
                <Text style={[S.summaryTitle, { color: T.textPrimary }]}>¡Ya casi listo!</Text>
                <Text style={[S.summarySub, { color: T.textSecondary }]}>
                  Guardaremos tu perfil y las categorías que configuraste. Podrás editarlas desde tu perfil.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  S.finishBtn,
                  { backgroundColor: finishing || selectedIncomeSourceIds.length === 0 ? T.surface : T.primary },
                ]}
                onPress={handleFinish}
                disabled={finishing || selectedIncomeSourceIds.length === 0}
                activeOpacity={0.84}>
                {finishing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color={T.textMuted} />
                    <Text style={[S.finishBtnText, { color: T.textMuted }]}>Guardando tu perfil...</Text>
                  </View>
                ) : (
                  <Text style={S.finishBtnText}>Comenzar a organizar →</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={{ paddingVertical: 8 }} onPress={() => goToStep(4)}>
                <Text style={[S.backText, { color: T.textMuted, textAlign: 'center' }]}>← Volver</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </Animated.View>

      {/* ── Savings goal modal (before budgets 4/5) ─────────────────────── */}
      <Modal
        visible={showSavingsGoalModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSavingsGoalModal(false)}>
        <View style={S.approxBackdrop}>
          <View style={[S.savingsSheet, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
            <Text style={S.savingsIcon}>🎯</Text>
            <Text style={[S.savingsTitle, { color: T.textPrimary }]}>¿Cuánto te gustaría ahorrar?</Text>
            <Text style={[S.savingsSub, { color: T.textSecondary }]}>
              Ajustaremos tus presupuestos recomendados para dejar un margen claro de ahorro.
            </Text>

            <View style={{ width: '100%', marginBottom: 10 }}>
              <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 8, textAlign: 'center', fontWeight: '700' }}>
                Ingreso considerado:{' '}
                <Text style={{ color: T.textPrimary, fontWeight: '800' }}>
                  {currencySymbol} {money(savingsGoalIncomeBase)}
                </Text>
              </Text>
              <Text style={{ fontSize: 14, color: T.primary, marginBottom: 10, textAlign: 'center', fontWeight: '800' }}>
                Recomendado:{' '}
                <Text style={{ color: '#fff', fontWeight: '800' }}>
                  {currencySymbol} {money(recommendedSavingsAmount)} ({Math.round(recommendedSavingsPct)}%)
                </Text>
              </Text>
              <View style={[S.savingsInputWrap, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                <Text style={{ fontSize: 15, color: T.textMuted, marginRight: 6 }}>S/.</Text>
                <TextInput
                  style={[S.savingsInput, { color: T.textPrimary }]}
                  value={savingsGoalInput}
                  onChangeText={setSavingsGoalInput}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={T.textMuted}
                  autoFocus
                />
              </View>
              <View style={S.savingsMarginWrap}>
                <Text style={S.savingsMarginLabel}>Margen de ahorro</Text>
                <Text style={S.savingsMarginValue}>{Math.max(0, Math.round(savingsGoalPct))}%</Text>
              </View>
            </View>

            <Text style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', marginBottom: 14 }}>
              Ese porcentaje se reservará como meta de ahorro mensual.
            </Text>

            <TouchableOpacity
              style={[S.ctaBtn, { backgroundColor: T.primary }]}
              onPress={applySavingsGoalAndContinue}
              activeOpacity={0.84}>
              <Text style={S.ctaBtnText}>Aplicar y continuar →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Approximate income modal ─────────────────────────────────────── */}
      <Modal
        visible={showApproxModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowApproxModal(false)}>
        <View style={S.approxBackdrop}>
          <View style={[S.approxSheet, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
            <Text style={{ fontSize: 22, marginBottom: 6, textAlign: 'center' }}>💰</Text>
            <Text style={[S.approxTitle, { color: T.textPrimary }]}>
              {pendingSalarioId === 'custom' ? 'Ingresa tu monto exacto' : '¿Puedes poner un aproximado?'}
            </Text>
            <Text style={{ fontSize: 13, color: T.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
              {pendingSalarioId === 'custom'
                ? `Usaremos este monto para proyectar{'\n'}presupuestos recomendados para ti.`
                : `Usaremos este monto para sugerirte{'\n'}presupuestos más precisos.`}
            </Text>

            <View style={[S.approxInputWrap, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
              <Text style={{ fontSize: 15, color: T.textMuted, marginRight: 6 }}>S/.</Text>
              <TextInput
                style={[S.approxInput, { color: T.textPrimary }]}
                value={ingresoAprox}
                onChangeText={setIngresoAprox}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={T.textMuted}
                autoFocus
              />
            </View>

            <Text style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
              🔒 Solo tú ves este dato · editable luego
            </Text>

            <TouchableOpacity
              style={[S.ctaBtn, { backgroundColor: T.primary }]}
              onPress={handleApproxConfirm}
              activeOpacity={0.84}>
              <Text style={S.ctaBtnText}>Continuar →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: 12, alignItems: 'center' }}
              onPress={() => {
                applyBudgetRecommendations(pendingSalarioId as SalarioId, SALARY_MEDIAN[pendingSalarioId as SalarioId] || 3000);
                setShowApproxModal(false);
              }}>
              <Text style={{ fontSize: 13, color: T.textMuted }}>
                {pendingSalarioId === 'custom' ? 'Omitir por ahora' : 'Omitir, usar estimado del rango'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LoaderTransicion visible={showLoader} onFinish={() => router.replace('/(tabs)' as any)} />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:     { flex: 1, paddingTop: 52 },
  header:        { paddingHorizontal: 24, paddingBottom: 14, gap: 10 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepLabel:     { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  stepCount:     { fontSize: 13 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill:  { height: 3, borderRadius: 2 },
  slide:         { paddingHorizontal: 24, paddingBottom: 44 },
  stepContent:   { gap: 20, alignItems: 'center', width: '100%', paddingTop: 4 },

  // Hero (step 0)
  heroSection: { alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 4 },
  iconBox:     { width: 72, height: 72, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle:   { fontSize: 30, fontWeight: '800', textAlign: 'center', lineHeight: 40, fontFamily: 'PlusJakartaSans_700Bold' },
  heroSub:     { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: 'Manrope_400Regular' },

  // Stat row
  statRow:   { flexDirection: 'row', gap: 8, width: '100%', alignItems: 'stretch' },
  statCard:  {
    flex: 1,
    minHeight: 128,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  statValue: { fontSize: 18, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 6 },
  statLabelWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  statLabel: { fontSize: 11, textAlign: 'center', lineHeight: 16, fontFamily: 'Manrope_400Regular' },
  statSpoiler: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
  },

  // Social proof
  socialProof: { flexDirection: 'row', alignItems: 'center', width: '100%', borderRadius: 14, borderWidth: 1, padding: 14 },

  // Salary cards (step 1)
  salaryCard:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 12 },
  salaryLabel: { fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_600SemiBold' },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  privacyNote: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14 },

  // Section headers
  sectionTitle: { fontSize: 24, fontWeight: '800', lineHeight: 32, fontFamily: 'PlusJakartaSans_700Bold' },
  sectionSub:   { fontSize: 14, lineHeight: 22, fontFamily: 'Manrope_400Regular' },

  // CTA
  ctaBtn:     { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, width: '100%' },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold' },

  // Nav
  navRow:   { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12 },
  backBtn:  { paddingVertical: 8, paddingRight: 4 },
  backText: { fontSize: 14, fontWeight: '600' },

  // Profile fields
  fieldGroup:     { width: '100%', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 2 },
  fieldLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  fieldInput:     { fontSize: 17, paddingVertical: 4, fontFamily: 'PlusJakartaSans_500Medium' },
  currencyCard:   { borderRadius: 14, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1 },
  flagBadge:      { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  currencySymbol: { fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold' },

  // Labels / pills
  label:          { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  labelRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pillGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  togglePill:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  togglePillText: { fontSize: 13, fontWeight: '600' },

  // Payment method grid
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodCard: {
    width: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
    gap: 2,
  },
  methodCheck: {
    position: 'absolute', top: 5, right: 5,
    width: 14, height: 14, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  netflixLogo: { width: 28, height: 28 },

  // Bank grid
  bankGrid: { gap: 8 },
  bankCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 16,
    gap: 12,
  },

  // Count badge
  countBadge: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  // Add other button
  addOtherBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    paddingVertical: 12, paddingHorizontal: 16,
  },

  // Inline inputs
  inlineRow:    { flexDirection: 'row', gap: 8, width: '100%', alignItems: 'center' },
  inlineInput:  { flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, borderWidth: 1 },
  inlineOk:     { height: 44, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inlineCancel: { height: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  addMoreBtn:   { paddingVertical: 6, paddingHorizontal: 2, alignSelf: 'flex-start' },

  // Budget cards
  budgetCard:   { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  emojiInput:   { width: 42, height: 42, fontSize: 20, textAlign: 'center', borderRadius: 10, borderWidth: 1 },
  budgetName:   { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  amountWrap:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, height: 40, minWidth: 88 },
  amountInput:  { fontSize: 14, flex: 1, textAlign: 'right', minWidth: 56 },
  removeBtn:    { padding: 6, borderRadius: 8 },
  optionalBadge:{ alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.06)' },
  suggBadge:    { width: '100%', borderRadius: 10, borderWidth: 1, padding: 12 },
  projectionCard: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14 },
  projectionTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'PlusJakartaSans_600SemiBold' },
  dashedBtn:    { height: 44, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', width: '100%' },

  // Income cards
  incomeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  incomeName: { flex: 1, fontSize: 15, fontFamily: 'Manrope_500Medium' },
  incomeSourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  incomeSourceCard: {
    width: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    position: 'relative',
  },

  // Summary / finish
  summaryCard:   { width: '100%', borderRadius: 16, padding: 20, borderWidth: 1, gap: 6 },
  summaryTitle:  { fontSize: 17, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold' },
  summarySub:    { fontSize: 14, lineHeight: 22, fontFamily: 'Manrope_400Regular' },
  finishBtn:     { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, width: '100%' },
  finishBtnText: { color: '#fff', fontWeight: '700', fontSize: 17, fontFamily: 'PlusJakartaSans_700Bold' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  catChip: {
    width: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    position: 'relative',
    gap: 4,
  },
  chipCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  speechBubble: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 4,
  },

  // Custom category CTA (prominent button)
  addCustomCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 14,
  },
  addCustomCatIcon: {
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 40,
  },
  addCustomCatTitle: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    lineHeight: 26,
  },
  addCustomCatSub: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'Manrope_400Regular',
  },
  customCatInputCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 2,
    padding: 18,
  },

  // Approximate income modal
  approxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  approxSheet: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  approxTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  approxInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 56,
  },
  approxInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
  },

  // Savings goal modal (compact layout)
  savingsSheet: {
    width: '88%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  savingsIcon: {
    fontSize: 24,
    marginBottom: 6,
    textAlign: 'center',
  },
  savingsTitle: {
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 27,
    marginBottom: 6,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  savingsSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    fontFamily: 'Manrope_400Regular',
  },
  savingsInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 54,
    gap: 8,
  },
  savingsInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  savingsMarginWrap: {
    width: '100%',
    marginTop: 6,
    alignItems: 'center',
  },
  savingsMarginLabel: {
    fontSize: 11,
    color: '#86efac',
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  savingsMarginValue: {
    fontSize: 22,
    color: '#39ff14',
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    lineHeight: 25,
    textShadowColor: 'rgba(57,255,20,0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
