import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  InteractionManager,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import LoaderTransicion from '@/components/LoaderTransicion';
import { darkTheme, lightTheme } from '@/constants/theme';
import {
  writeDarkModeCache,
  writeOnboardingCompletedLocal,
  writeOnboardingDraftLocal,
} from '@/lib/preferences';
import { useFinanceStore } from '@/store/useFinanceStore';
import { DEFAULT_BANCOS_DISPONIBLES, type MonedaCode } from '@/types';

// ─── Payment / Currency options ────────────────────────────────────────────────

const DEFAULT_PAYMENT_OPTIONS = [
  'Efectivo', 'Yape', 'Plin', 'Tarjeta de débito', 'Tarjeta de crédito', 'BIM', 'Transferencia',
];

const PAYMENT_EMOJI: Record<string, string> = {
  'Efectivo': '💵', 'Yape': '💜', 'Plin': '💙',
  'Tarjeta de débito': '💳', 'Tarjeta de crédito': '🏦', 'BIM': '📲', 'Transferencia': '↔️',
};

const LEGACY_PAYMENT_METHOD_MAP: Record<string, string> = {
  Suscripciones: 'Tarjeta de débito',
  Crédito: 'Tarjeta de crédito',
};

const normalizePaymentMethodName = (name: string) => LEGACY_PAYMENT_METHOD_MAP[name] ?? name;

const BANK_EMOJI: Record<string, string> = {
  'BCP': '🔵', 'Scotiabank': '🔴', 'Interbank': '🟠',
  'BBVA': '🟦', 'Banco Pichincha': '🟢', 'BanBif': '🟣', 'Mibanco': '🟡',
};

/** Solo estos 4 en pantalla; el resto de `DEFAULT_BANCOS_DISPONIBLES` va en “Más bancos”. */
const ONBOARDING_BANCOS_PRINCIPALES: readonly string[] = ['BCP', 'Scotiabank', 'Interbank', 'BBVA'];
const ONBOARDING_BANCOS_PRINCIPALES_SET = new Set(ONBOARDING_BANCOS_PRINCIPALES);
const ONBOARDING_BANCOS_MAS = DEFAULT_BANCOS_DISPONIBLES.filter((b) => !ONBOARDING_BANCOS_PRINCIPALES_SET.has(b));

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
  { id: 'pareja',        nombre: 'Pareja',       emoji: '💑' },
  { id: 'ropa',          nombre: 'Ropa',         emoji: '👕' },
  { id: 'educacion',     nombre: 'Educación',    emoji: '📚' },
  { id: 'mascotas',      nombre: 'Mascotas',     emoji: '🐾' },
  { id: 'viajes',        nombre: 'Viajes',       emoji: '✈️' },
  { id: 'gaming',        nombre: 'Gaming',       emoji: '🎮' },
  { id: 'otros',         nombre: 'Otros',        emoji: '📦' },
];

type BudgetCatEntry = { id: string; nombre: string; emoji: string };
const BASE_BUDGET_IDS = ['comida', 'vivienda', 'transporte'] as const;

// ─── Mediana por rango (modal de ingreso aproximado) ───────────────────────────

const SALARY_MEDIAN: Record<SalarioId, number> = {
  basico: 850, junior: 1800, medio: 4000, senior: 9000, alto: 15000, custom: 3000,
};

/** Perfil breve (paso 2): contexto para sugerencias futuras en la app (p. ej. presupuestos en inicio). */
type OnboardingLifeSituationId =
  | ''
  | 'dependiente'
  | 'independiente'
  | 'estudiante'
  | 'emprendedor'
  | 'mixto';

const LIFE_SITUATION_OPTIONS: { id: OnboardingLifeSituationId; label: string }[] = [
  { id: '', label: 'Prefiero no decir' },
  { id: 'dependiente', label: 'Empleado/a' },
  { id: 'independiente', label: 'Independiente' },
  { id: 'estudiante', label: 'Estudiante' },
  { id: 'emprendedor', label: 'Emprendedor/a' },
  { id: 'mixto', label: 'Combinación' },
];

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

const STEP_LABELS = [
  'Bienvenida',
  'Tu perfil',
  'Mis ingresos',
  'Gastos del mes',
  'Fuentes',
];
const TOTAL_STEPS = 5;
const TIPO_CAMBIO_DEFAULT = 3.75;

/** Paso 0: mini-cards de contexto (orden: magnitud → creencia → oportunidad). */
type OnboardingStatCard = {
  id: string;
  eyebrow: string;
  value: string;
  description: string;
  accent?: boolean;
  footer?: string;
  /** Barra superior en gradiente (color → transparente). */
  barColors: readonly [string, string];
};

const ONBOARDING_STAT_CARDS: OnboardingStatCard[] = [
  {
    id: 'leak',
    eyebrow: 'Realidad',
    value: '68%',
    description: 'Del sueldo desaparece\nsin explicación.',
    barColors: ['rgba(0,212,255,0.95)', 'rgba(0,212,255,0)'],
  },
  {
    id: 'myth',
    eyebrow: 'Creencia común',
    value: '8 de 10',
    description: 'Creen que ganando más\nahorrarán más.',
    footer: 'Spoiler: no.',
    barColors: ['rgba(200,184,255,0.9)', 'rgba(200,184,255,0)'],
  },
  {
    id: 'elite',
    eyebrow: 'Oportunidad',
    value: 'Solo 8%',
    description: 'Ahorra de forma profesional.\nSé del grupo.',
    accent: true,
    barColors: ['#C4B5FD', 'rgba(196,181,253,0)'],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  /** Ancho útil bajo el padding horizontal de `S.slide` (24×2). */
  const gastosGridInnerW = windowWidth - 48;
  /** Espacio horizontal entre chips (columnas), ajustado al ancho de celda. */
  const GASTOS_COL_GAP_H = 4;
  /** Aire entre filas (chips con 2 líneas de texto = algo más de alto). */
  const GASTOS_ROW_GAP_V = 7;
  /** 4 columnas en pantallas anchas; 3 en típico móvil; 2 en muy estrecho = nombre completo. */
  const GASTOS_COL_COUNT = windowWidth >= 400 ? 4 : windowWidth >= 340 ? 3 : 2;
  const gastosColWidth =
    (gastosGridInnerW - GASTOS_COL_GAP_H * (GASTOS_COL_COUNT - 1)) / GASTOS_COL_COUNT;
  const { profile } = useFinanceStore();
  const statCardsStacked = windowWidth < 420;
  const statCardEnterAnim = useRef(
    ONBOARDING_STAT_CARDS.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(18),
    })),
  ).current;

  // ── Gastos step: per-chip reveal + glow ─────────────────────────────────
  const catChipAnims = useRef(
    ALL_BUDGET_CATS.map(() => ({
      opacity:    new Animated.Value(0),
      scale:      new Animated.Value(0.82),
      glow:       new Animated.Value(0),
    })),
  ).current;
  // ── Step & animation ────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const stepOpacity  = useRef(new Animated.Value(1)).current;
  const stepTransY   = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  const [progressTrackW, setProgressTrackW] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  /** Para scroll al pie tras el modal de sueldo (web/iOS/Android). */
  const scrollViewportH = useRef(0);
  const scrollContentH = useRef(0);

  useEffect(() => {
    if (step !== 0) {
      statCardEnterAnim.forEach((a) => {
        a.opacity.setValue(0);
        a.translateY.setValue(18);
      });
      return;
    }
    statCardEnterAnim.forEach((a) => {
      a.opacity.setValue(0);
      a.translateY.setValue(18);
    });
    Animated.stagger(
      90,
      statCardEnterAnim.map((a) =>
        Animated.parallel([
          Animated.timing(a.opacity, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(a.translateY, {
            toValue: 0,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ),
    ).start();
  }, [step, statCardEnterAnim]);

  // ── Salary ──────────────────────────────────────────────────────────────────
  const [salarioRango, setSalarioRango]           = useState<SalarioId | ''>('');
  const [showApproxModal, setShowApproxModal]     = useState(false);
  const [pendingSalarioId, setPendingSalarioId]   = useState<SalarioId | ''>('');
  const [ingresoAprox, setIngresoAprox]           = useState('');

  // ── Theme selection (onboarding) ────────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(false);
  const T = isDarkMode ? darkTheme : lightTheme;

  // ── Profile ─────────────────────────────────────────────────────────────────
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [moneda, setMoneda] = useState<MonedaCode>('PEN');
  const [profileNameError, setProfileNameError] = useState('');
  const [lifeSituation, setLifeSituation] = useState<OnboardingLifeSituationId>('');

  // ── Payment methods ──────────────────────────────────────────────────────────
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>(() => {
    const saved = (profile.metodosDePago ?? []).map((m) => normalizePaymentMethodName(m.nombre));
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
  const [showMoreBanks, setShowMoreBanks]             = useState(false);

  const bancosPersonalizados = useMemo(
    () => bankOptions.filter((b) => !DEFAULT_BANCOS_DISPONIBLES.includes(b)),
    [bankOptions],
  );
  const masBancosCount = ONBOARDING_BANCOS_MAS.length + bancosPersonalizados.length;

  // ── Budget categories ────────────────────────────────────────────────────────
  const [categoriasList, setCategoriasList] = useState<BudgetCatEntry[]>([]);

  const [pickerCustomName, setPickerCustomName]           = useState('');
  const [showPickerCustomInput, setShowPickerCustomInput] = useState(false);
  const [gastosSelectionHint, setGastosSelectionHint]     = useState('');

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

  // ── Gastos step: auto-reveal chips on enter ──────────────────────────────────
  useEffect(() => {
    if (step !== 3) return;
    // Si vuelve con categorías ya elegidas → chips visibles de inmediato
    if (categoriasList.length > 0) {
      catChipAnims.forEach((a) => { a.opacity.setValue(1); a.scale.setValue(1); a.glow.setValue(0); });
      return;
    }
    // Primer visit: resetear y animar con stagger tras el fade-in del paso
    catChipAnims.forEach((a) => { a.opacity.setValue(0); a.scale.setValue(0.82); a.glow.setValue(0); });
    const t = setTimeout(() => {
      Animated.stagger(
        55,
        catChipAnims.map((a) =>
          Animated.parallel([
            Animated.timing(a.opacity, {
              toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.spring(a.scale, {
              toValue: 1, friction: 6, tension: 180, useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(a.glow, { toValue: 1, duration: 1, useNativeDriver: true }),
              Animated.timing(a.glow, { toValue: 0, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]),
          ]),
        ),
      ).start();
    }, 340); // esperar al fade-in del paso (270ms) + buffer
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ── Step navigation ───────────────────────────────────────────────────────────
  const goToStep = (n: number) => {
    Animated.timing(stepOpacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setStep(n);
      if (n === 3) setGastosSelectionHint('');
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

  const handleSalarioSelect = (id: SalarioId) => {
    setSalarioRango(id);
    setPendingSalarioId(id);
    setIngresoAprox(id === 'custom' ? '' : String(SALARY_MEDIAN[id]));
    setShowApproxModal(true);
  };

  const scrollToBottomOfScrollView = () => {
    const vh = scrollViewportH.current;
    const ch = scrollContentH.current;
    if (vh <= 0 || ch <= 0) {
      scrollRef.current?.scrollToEnd({ animated: true });
      return;
    }
    const y = Math.max(0, ch - vh);
    scrollRef.current?.scrollTo({ y, animated: true });
  };

  /** Tras cerrar el modal de sueldo: espera al fade y hace scroll suave al Continuar del paso ingresos. */
  const scrollToIncomeContinueAfterApprox = () => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        scrollToBottomOfScrollView();
        requestAnimationFrame(() => scrollToBottomOfScrollView());
        setTimeout(() => scrollToBottomOfScrollView(), 90);
        setTimeout(() => scrollToBottomOfScrollView(), 280);
      }, 320);
    });
  };

  const handleApproxConfirm = () => {
    setShowApproxModal(false);
    scrollToIncomeContinueAfterApprox();
  };

  /** Gastos (elige categorías) → fuentes de ingreso. */
  const goGastosToFuentesStep = () => {
    if (categoriasList.length === 0) {
      setGastosSelectionHint('Elige al menos una categoría de tus gastos mensuales para continuar.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setGastosSelectionHint('');
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
    setGastosSelectionHint('');
  };

  const handleAddPickerCustom = () => {
    const trimmed = pickerCustomName.trim();
    if (!trimmed) return;
    const newId = `custom_${Date.now()}`;
    if (!categoriasList.some((c) => c.nombre.toLowerCase() === trimmed.toLowerCase())) {
      setCategoriasList((prev) => [...prev, { id: newId, nombre: trimmed, emoji: '📦' }]);
      setGastosSelectionHint('');
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
    setShowMoreBanks(true);
  };

  const handleProfileContinue = () => {
    if (!nombreUsuario.trim()) {
      setProfileNameError('Debes insertar un nombre o apodo.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setProfileNameError('');
    goToStep(2);
  };

  const toggleIncomeSource = (id: string) => {
    setSelectedIncomeSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ── handleFinish ─────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (selectedIncomeSourceIds.length === 0) return;
    setFinishing(true);
    try {
      const nombreGuardado = nombreUsuario.trim() || 'Usuario';
      const themeMode: 'light' | 'dark' = isDarkMode ? 'dark' : 'light';
      const selectedIncomeCats = incomeSourceOptions.filter((c) => selectedIncomeSourceIds.includes(c.id));

      // Fase 2: solo persistencia local (sin tocar Supabase aún).
      await writeOnboardingCompletedLocal(true);
      await writeOnboardingDraftLocal({
        nombreUsuario: nombreGuardado,
        monedaPrincipal: moneda,
        tipoDeCambio: TIPO_CAMBIO_DEFAULT,
        metodosDePago: selectedPaymentMethods,
        bancosDisponibles: selectedBanks,
        lifeSituation,
        salarioRango,
        ingresoAprox: Number.parseFloat(ingresoAprox) || null,
        categoriasGasto: categoriasList,
        categoriasIngreso: selectedIncomeCats.map((c, i) => ({
          id: c.id,
          nombre: c.nombre,
          emoji: c.emoji,
          orden: i + 1,
        })),
        onboardingDoneLocalAt: new Date().toISOString(),
      });

      useFinanceStore.setState((state) => ({
        ...state,
        theme: themeMode,
      }));
      void writeDarkModeCache(themeMode);

      setFinishing(false);
      router.replace('/(auth)/register' as any);
    } catch (e) {
      console.error('Error in handleFinish:', e);
      setFinishing(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const progressFillWidth = progressAnim.interpolate({
    inputRange: [0, 1], outputRange: [0, progressTrackW],
  });
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
          onLayout={(e) => {
            scrollViewportH.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, h) => {
            scrollContentH.current = h;
          }}
          contentContainerStyle={[S.slide, step === 3 && S.slideGastosTight]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={step !== 3}
          keyboardShouldPersistTaps="handled">

          {/* ───────────── PASO 0 · Bienvenida ───────────────────────── */}
          {step === 0 && (
            <View style={S.stepContent}>

              {/* Hero icon + headline */}
              <View style={S.heroSection}>
                <View
                  style={[
                    S.heroIconOuter,
                    Platform.select({
                      ios: {
                        shadowColor: '#CBA6FF',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.75,
                        shadowRadius: 16,
                      },
                      android: { elevation: 10 },
                      web: {
                        boxShadow: [
                          '0 0 0 1px rgba(203,166,255,0.95)',
                          '0 0 22px rgba(124,58,237,0.75)',
                          '0 0 48px rgba(124,58,237,0.35)',
                        ].join(', '),
                      } as object,
                      default: {},
                    }),
                  ]}>
                  <LinearGradient
                    colors={['#E9D5FF', T.primaryLight, T.primary, '#5B21B6']}
                    locations={[0, 0.3, 0.72, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={S.heroIconNeonRing}>
                    <View style={[S.heroIconInner, { backgroundColor: T.cardElevated }]}>
                      <LinearGradient
                        colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0)']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={S.heroIconInnerShine}
                      />
                      <Text style={S.heroIconEmoji}>💎</Text>
                    </View>
                  </LinearGradient>
                </View>

                <Text style={[S.heroTitle, { color: T.textPrimary }]}>
                  Aumenta tu ahorro hasta 30% con un sistema simple
                </Text>

                <Text style={{ fontSize: 13, color: T.textMuted, fontWeight: '600', textAlign: 'center', letterSpacing: 0.4 }}>
                  ¿Sabes exactamente en qué gastas tu dinero?
                </Text>

                <Text style={[S.heroSub, { color: T.textSecondary }]}>
                  AhorraYA te ayuda a cambiar para siempre la manera en que manejas tus finanzas — sin esfuerzo extra.
                </Text>
              </View>

              {/* Insight deck — capa editorial + gradientes + entrada escalonada */}
              <View
                style={[
                  S.statDeck,
                  {
                    borderColor: T.glassBorder,
                    backgroundColor: T.surface,
                  },
                  Platform.select({
                    ios: {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 14 },
                      shadowOpacity: 0.28,
                      shadowRadius: 28,
                    },
                    android: { elevation: 10 },
                    web: {
                      boxShadow: `0 24px 64px ${T.shadowDark}, 0 0 0 1px ${T.glassBorder}`,
                    } as object,
                    default: {},
                  }),
                ]}>
                <View style={S.statDeckHeader}>
                  <Text style={[S.statDeckKicker, { color: T.secondary }]}>Contexto</Text>
                  <Text style={[S.statDeckTitle, { color: T.textPrimary }]}>
                    Tres señales que explican por qué cuesta ahorrar
                  </Text>
                  <View style={[S.statDeckRule, { backgroundColor: T.glassBorder }]} />
                </View>

                <View style={[S.statRow, statCardsStacked && S.statRowStacked]}>
                  {ONBOARDING_STAT_CARDS.map((card, index) => {
                    const accent = !!card.accent;
                    const anim = statCardEnterAnim[index];
                    const idx = String(index + 1).padStart(2, '0');

                    const innerContent = (
                      <>
                        <LinearGradient
                          colors={card.barColors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={S.statCardGlowBar}
                        />
                        <View style={[S.statCardInner, statCardsStacked && S.statCardInnerStacked]}>
                          <View style={[S.statCardMetaRow, statCardsStacked && S.statCardMetaRowStacked]}>
                            <Text
                              style={[S.statEyebrow, { color: accent ? T.secondary : T.textMuted }]}
                              numberOfLines={1}>
                              {card.eyebrow}
                            </Text>
                            <Text style={[S.statIndex, { color: T.textMuted }]}>{idx}</Text>
                          </View>
                          <Text
                            style={[
                              S.statValuePremium,
                              { color: T.textPrimary },
                              accent && S.statValuePremiumAccent,
                              statCardsStacked && S.statValuePremiumStacked,
                            ]}>
                            {card.value}
                          </Text>
                          <Text
                            style={[
                              S.statLabelPremium,
                              { color: T.textSecondary },
                              statCardsStacked && S.statLabelStacked,
                            ]}>
                            {card.description}
                          </Text>
                          {card.footer ? (
                            <View
                              style={[
                                S.statFooterPillPremium,
                                {
                                  backgroundColor: accent ? 'rgba(0,212,255,0.12)' : T.glassLight,
                                  borderColor: accent ? 'rgba(0,212,255,0.35)' : T.primaryBorder,
                                },
                                statCardsStacked && S.statFooterPillStacked,
                              ]}>
                              <Text
                                style={[
                                  S.statFooterTextPremium,
                                  { color: accent ? T.secondary : T.primary },
                                ]}>
                                {card.footer}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </>
                    );

                    const shellStyle = [
                      S.statCardPremiumShell,
                      accent
                        ? { borderColor: T.primary, borderWidth: 1.5 }
                        : { borderColor: T.glassBorder, borderWidth: 1 },
                    ];

                    return (
                      <Animated.View
                        key={card.id}
                        style={[
                          {
                            opacity: anim.opacity,
                            transform: [{ translateY: anim.translateY }],
                          },
                          statCardsStacked ? S.statAnimSlotStacked : S.statAnimSlotRow,
                        ]}>
                        {accent ? (
                          <LinearGradient
                            colors={['rgba(124,58,237,0.42)', T.cardElevated, T.card]}
                            locations={[0, 0.55, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[shellStyle, S.statCardOverflow]}>
                            {innerContent}
                          </LinearGradient>
                        ) : (
                          <View style={[shellStyle, S.statCardOverflow, { backgroundColor: T.cardElevated }]}>
                            {innerContent}
                          </View>
                        )}
                      </Animated.View>
                    );
                  })}
                </View>
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

          {/* ───────────── PASO 3 · Rango salarial (3/5) ───────────────── */}
          {step === 2 && (
            <View style={[S.stepContent, S.stepIncomeLayout]}>
              <View style={{ width: '100%', gap: 4 }}>
                <Text style={[S.sectionTitleIncome, { color: T.textPrimary }]}>¿Cuál es tu rango de ingresos?</Text>
                <Text style={[S.sectionSubIncome, { color: T.textSecondary }]}>
                  Nos ayuda a contextualizar la app; tus montos reales los verás al registrar gastos.
                </Text>
              </View>

              <View style={{ width: '100%', gap: 6 }}>
                {SALARY_RANGES.map((r) => {
                  const active = salarioRango === r.id;
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        S.salaryCard,
                        S.salaryCardIncome,
                        {
                          backgroundColor: active ? T.primaryBg  : T.surface,
                          borderColor:     active ? T.primary    : T.glassBorder,
                          borderWidth:     active ? 1.5 : 1,
                        },
                      ]}
                      onPress={() => handleSalarioSelect(r.id)}
                      activeOpacity={0.8}>
                      <Text style={S.salaryIconIncome}>{r.icon}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[S.salaryLabel, S.salaryLabelIncome, { color: active ? T.primary : T.textPrimary }]}>{r.label}</Text>
                        <Text style={[S.salarySubIncome, { color: T.textMuted }]} numberOfLines={1}>{r.sub}</Text>
                      </View>
                      <View style={[
                        S.radioCircle,
                        S.radioCircleIncome,
                        { borderColor: active ? T.primary : T.glassBorder, backgroundColor: active ? T.primary : 'transparent' },
                      ]}>
                        {active && <View style={[S.radioInner, S.radioInnerIncome]} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[S.privacyNote, S.privacyNoteIncome, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
                <Text style={[S.privacyTextIncome, { color: T.textMuted }]}>
                  🔒 Solo para personalizar la app · no se comparte.
                </Text>
              </View>

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(1)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.ctaBtn, { backgroundColor: salarioRango ? T.primary : T.surface, flex: 1 }]}
                  onPress={() => goToStep(3)}
                  disabled={!salarioRango}
                  activeOpacity={0.84}>
                  <Text style={[S.ctaBtnText, { color: salarioRango ? '#fff' : T.textMuted }]}>
                    Continuar →
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ───────────── PASO 2 · Tu perfil + tema ──────────────────── */}
          {step === 1 && (
            <View style={[S.stepContent, S.stepProfileLayout]}>
              <View style={S.profileColumn}>

                {/* Encabezado */}
                <View style={S.profileHeaderCenter}>
                  <Text style={[S.sectionTitleIncome, { color: T.textPrimary }]}>Tu perfil</Text>
                  <Text style={[S.sectionSubIncome, { color: T.textSecondary }]}>
                    Nombre, situación, moneda y apariencia.
                  </Text>
                </View>

                {/* Nombre */}
                <View style={[S.fieldGroup, S.fieldGroupProfile, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
                  <Text style={[S.fieldLabel, S.fieldLabelProfile, { color: T.textMuted }]}>Nombre o apodo</Text>
                  <TextInput
                    style={[S.fieldInput, S.fieldInputProfile, { color: T.textPrimary }]}
                    placeholder="Cómo te llamamos"
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
                  <Text style={[S.profileSectionMeta, { width: '100%', color: '#f97373', marginTop: -4 }]}>
                    {profileNameError}
                  </Text>
                ) : null}

                {/* Situación (contexto para sugerencias después en la app) */}
                <View style={{ width: '100%', gap: 5 }}>
                  <View style={S.profileSectionHeader}>
                    <Text style={[S.profileSectionTitle, { color: T.textPrimary }]}>Tu día a día</Text>
                    <Text style={[S.profileSectionMeta, { color: T.textMuted }]}>
                      Opcional · mejora sugerencias cuando tengas más contexto en la app
                    </Text>
                  </View>
                  <View style={S.profileLifeChipsWrap}>
                    {LIFE_SITUATION_OPTIONS.map((opt) => {
                      const active = lifeSituation === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id || 'none'}
                          onPress={() => setLifeSituation(opt.id)}
                          activeOpacity={0.82}
                          style={[
                            S.profileLifeChip,
                            {
                              borderColor: active ? T.primary : T.glassBorder,
                              backgroundColor: active ? T.primaryBg : T.surface,
                            },
                          ]}>
                          <Text
                            style={[
                              S.profileLifeChipLabel,
                              { color: active ? T.primary : T.textSecondary },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Moneda */}
                <View style={{ width: '100%', gap: 6 }}>
                  <View style={S.profileSectionHeader}>
                    <Text style={[S.profileSectionTitle, { color: T.textPrimary }]}>Moneda principal</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {CURRENCY_OPTIONS.map((cur) => {
                      const active = moneda === cur.code;
                      return (
                        <TouchableOpacity
                          key={cur.code}
                          style={[S.currencyCard, S.currencyCardProfile, { flex: 1, backgroundColor: active ? T.primaryBg : T.surface, borderColor: active ? T.primary : T.glassBorder, borderWidth: 1 }]}
                          onPress={() => setMoneda(cur.code)}
                          activeOpacity={0.8}>
                          <View style={[S.flagBadge, S.flagBadgeProfile, { backgroundColor: T.cardHigh, borderColor: active ? T.primary : T.glassBorder }]}>
                            <Text style={{ fontSize: 18 }}>{cur.flag}</Text>
                          </View>
                          <Text style={[S.currencySymbol, S.currencySymbolProfile, { color: active ? T.primary : T.textPrimary }]}>{cur.symbol}</Text>
                          <Text style={[S.profileSectionMeta, { color: T.textMuted }]}>{cur.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Selector de tema con preview */}
                <View style={{ width: '100%', gap: 8 }}>
                  <View style={S.profileSectionHeader}>
                    <Text style={[S.profileSectionTitle, { color: T.textPrimary }]}>Apariencia</Text>
                    <Text style={[S.profileSectionMeta, { color: T.textMuted }]}>
                      {isDarkMode ? '🌙 Modo noche' : '☀️ Modo día'}
                    </Text>
                  </View>

                  {/* Cards de selección de tema */}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {/* Noche */}
                    <TouchableOpacity
                      style={[
                        S.themePickerCard,
                        isDarkMode
                          ? { borderColor: T.primary, borderWidth: 1.5, ...Platform.select({ ios: { shadowColor: T.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 5 }, web: { boxShadow: `0 0 16px ${T.shadowPrimary}` } as object, default: {} }) }
                          : { borderColor: T.glassBorder, borderWidth: 1 },
                        { backgroundColor: darkTheme.bg },
                      ]}
                      onPress={() => setIsDarkMode(true)}
                      activeOpacity={0.8}>
                      {/* Mini preview noche */}
                      <View style={S.themePreviewScreen}>
                        <View style={[S.themePreviewHeader, { backgroundColor: darkTheme.surface, borderBottomColor: darkTheme.glassBorder }]}>
                          <View style={[S.themePreviewDot, { backgroundColor: darkTheme.primary }]} />
                          <View style={[S.themePreviewBar, { backgroundColor: darkTheme.glassBorder, width: '45%' }]} />
                        </View>
                        <View style={{ flex: 1, padding: 5, gap: 3 }}>
                          <View style={[S.themePreviewCard, { backgroundColor: darkTheme.card, borderColor: darkTheme.glassBorder }]}>
                            <View style={[S.themePreviewDot, { backgroundColor: '#4DF2B1', width: 5, height: 5 }]} />
                            <View style={[S.themePreviewBar, { backgroundColor: darkTheme.textMuted, width: '60%' }]} />
                          </View>
                          <View style={[S.themePreviewCard, { backgroundColor: darkTheme.cardElevated, borderColor: darkTheme.glassBorder }]}>
                            <View style={[S.themePreviewDot, { backgroundColor: darkTheme.primary, width: 5, height: 5 }]} />
                            <View style={[S.themePreviewBar, { backgroundColor: darkTheme.textMuted, width: '45%' }]} />
                          </View>
                          <View style={[S.themePreviewBar, { backgroundColor: darkTheme.primary, height: 9, borderRadius: 5, width: '80%', alignSelf: 'center', marginTop: 2 }]} />
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isDarkMode ? darkTheme.primary : darkTheme.textMuted }}>🌙 Noche</Text>
                        {isDarkMode && <View style={[S.themeCheckDot, { backgroundColor: darkTheme.primary }]}><Text style={{ fontSize: 7, color: '#fff' }}>✓</Text></View>}
                      </View>
                    </TouchableOpacity>

                    {/* Día */}
                    <TouchableOpacity
                      style={[
                        S.themePickerCard,
                        !isDarkMode
                          ? { borderColor: lightTheme.primary, borderWidth: 1.5, ...Platform.select({ ios: { shadowColor: lightTheme.shadowPrimary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 5 }, web: { boxShadow: `0 0 16px ${lightTheme.shadowPrimary}` } as object, default: {} }) }
                          : { borderColor: 'rgba(200,190,220,0.35)', borderWidth: 1 },
                        { backgroundColor: lightTheme.bg },
                      ]}
                      onPress={() => setIsDarkMode(false)}
                      activeOpacity={0.8}>
                      {/* Mini preview día */}
                      <View style={[S.themePreviewScreen, { backgroundColor: lightTheme.bg }]}>
                        <View style={[S.themePreviewHeader, { backgroundColor: lightTheme.surface, borderBottomColor: lightTheme.glassBorder }]}>
                          <View style={[S.themePreviewDot, { backgroundColor: lightTheme.primary }]} />
                          <View style={[S.themePreviewBar, { backgroundColor: lightTheme.glassBorder, width: '45%' }]} />
                        </View>
                        <View style={{ flex: 1, padding: 5, gap: 3 }}>
                          <View style={[S.themePreviewCard, { backgroundColor: lightTheme.card, borderColor: lightTheme.glassBorder }]}>
                            <View style={[S.themePreviewDot, { backgroundColor: lightTheme.tertiary, width: 5, height: 5 }]} />
                            <View style={[S.themePreviewBar, { backgroundColor: lightTheme.textMuted, width: '60%' }]} />
                          </View>
                          <View style={[S.themePreviewCard, { backgroundColor: lightTheme.cardElevated, borderColor: lightTheme.glassBorder }]}>
                            <View style={[S.themePreviewDot, { backgroundColor: lightTheme.primary, width: 5, height: 5 }]} />
                            <View style={[S.themePreviewBar, { backgroundColor: lightTheme.textMuted, width: '45%' }]} />
                          </View>
                          <View style={[S.themePreviewBar, { backgroundColor: lightTheme.primary, height: 9, borderRadius: 5, width: '80%', alignSelf: 'center', marginTop: 2 }]} />
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: !isDarkMode ? lightTheme.primary : '#9B8FBF' }}>☀️ Día</Text>
                        {!isDarkMode && <View style={[S.themeCheckDot, { backgroundColor: lightTheme.primary }]}><Text style={{ fontSize: 7, color: '#fff' }}>✓</Text></View>}
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Nota al pie */}
                <Text style={{ fontSize: 11, color: T.textMuted, textAlign: 'center', lineHeight: 16 }}>
                  Puedes cambiar la apariencia después en Ajustes.
                </Text>

                {/* Navegación */}
                <View style={S.profileNavRow}>
                  <TouchableOpacity
                    onPress={() => goToStep(0)}
                    style={[S.profileBackSq, { borderColor: T.glassBorder, backgroundColor: T.surface }]}
                    accessibilityLabel="Atrás"
                    activeOpacity={0.75}>
                    <Text style={{ fontSize: 18, color: T.textMuted }}>←</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.profileCtaBtn, { backgroundColor: T.primary }]} onPress={handleProfileContinue} activeOpacity={0.84}>
                    <Text style={[S.ctaBtnText, { fontSize: 15 }]}>Continuar →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ───────────── PASO 4 · Gastos del mes (sin scroll: grid compacta) ─ */}
          {step === 3 && (
            <View style={[S.stepContent, S.stepGastosLayout]}>
              <View style={S.gastosScrollFreeTop}>
                {/* Encabezado — una sola frase, menos altura */}
                <View style={{ width: '100%' }}>
                  <Text
                    style={[S.gastosIntroTitle, { color: T.textPrimary }]}
                    numberOfLines={1}
                    {...(Platform.OS !== 'web' ? { adjustsFontSizeToFit: true } : {})}>
                    Gastos de <Text style={{ color: T.primary }}>cada mes</Text>
                  </Text>
                  <Text
                    style={[
                      S.gastosIntroSub,
                      {
                        color: T.textSecondary,
                        marginTop: 4,
                        width: '100%',
                        ...(Platform.OS === 'web'
                          ? {}
                          : {
                              textShadowColor: isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(124,58,237,0.2)',
                              textShadowOffset: { width: 0, height: 0.5 },
                              textShadowRadius: isDarkMode ? 3 : 2,
                            }),
                      },
                    ]}>
                    Toca las que apliquen.
                  </Text>
                  <Text
                    style={[S.gastosLaterEditNote, { color: T.textMuted }]}
                    numberOfLines={3}>
                    Podrás cambiar estas categorías después si tienes gastos nuevos o ya no usas algunas.
                  </Text>
                </View>

                {gastosSelectionHint ? (
                  <View style={[S.gastosHintBanner, { borderColor: T.warning, backgroundColor: 'rgba(255,184,77,0.12)' }]}>
                    <Text style={{ fontSize: 11, color: T.warning, textAlign: 'center', lineHeight: 16, fontWeight: '600' }}>
                      {gastosSelectionHint}
                    </Text>
                  </View>
                ) : null}

                {/* 3–4 columnas, fila emoji+texto → poca altura total */}
                <View style={[S.gastosCardGrid, { columnGap: GASTOS_COL_GAP_H, rowGap: GASTOS_ROW_GAP_V }]}>
                  {ALL_BUDGET_CATS.map((cat, index) => {
                    const active = isCatSelected(cat.id);
                    const anim = catChipAnims[index];
                    return (
                      <Animated.View
                        key={cat.id}
                        style={[
                          S.gastosCardSlot,
                          { width: gastosColWidth, opacity: anim.opacity, transform: [{ scale: anim.scale }] },
                        ]}>
                        <Animated.View
                          pointerEvents="none"
                          style={[StyleSheet.absoluteFillObject, { borderRadius: 20, backgroundColor: 'rgba(167,139,250,0.35)', opacity: anim.glow }]}
                        />
                        <TouchableOpacity
                          style={[
                            S.gastosCard,
                            active
                              ? { borderColor: T.primary, borderWidth: 1.5, backgroundColor: T.primaryBg,
                                  ...Platform.select({
                                    ios: { shadowColor: T.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.28, shadowRadius: 8 },
                                    android: { elevation: 4 },
                                    // Web: evitar `inset` + sombras apiladas (pueden fallar al re-render al tocar un chip)
                                    web: { boxShadow: `0 3px 12px ${T.shadowPrimary}` } as object,
                                    default: {},
                                  }) }
                              : {
                                  borderColor: T.glassBorder,
                                  borderWidth: 1,
                                  backgroundColor: T.cardElevated,
                                  ...Platform.select({
                                    ios: { shadowColor: '#0b1020', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.22, shadowRadius: 5 },
                                    android: { elevation: 2 },
                                    web: { boxShadow: '0 2px 10px rgba(0,0,0,0.2)' } as object,
                                    default: {},
                                  }),
                                },
                          ]}
                          onPress={() => togglePickerCat(cat)}
                          activeOpacity={0.72}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          accessibilityRole="button">
                          <View style={S.gastosCardCol}>
                            <Text style={S.gastosCardEmojiTop} allowFontScaling={false}>
                              {cat.emoji}
                            </Text>
                            <Text
                              style={[S.gastosCardLabel, { color: active ? T.primary : T.textPrimary }]}
                              numberOfLines={2}
                              ellipsizeMode="tail"
                              allowFontScaling>
                              {cat.nombre}
                            </Text>
                          </View>
                          {active && (
                            <View style={[S.gastosCardCheck, { backgroundColor: T.primary }]}>
                              <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>✓</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}

                  {categoriasList
                    .filter((c) => !ALL_BUDGET_CATS.find((bc) => bc.id === c.id))
                    .map((cat) => (
                      <View key={cat.id} style={[S.gastosCardSlot, { width: gastosColWidth }]}>
                        <TouchableOpacity
                          style={[
                            S.gastosCard,
                            {
                              borderColor: T.primary,
                              borderWidth: 1.5,
                              backgroundColor: T.primaryBg,
                              ...Platform.select({
                                ios: { shadowColor: T.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 7 },
                                android: { elevation: 3 },
                                web: { boxShadow: `0 2px 10px ${T.shadowPrimary}` } as object,
                                default: {},
                              }),
                            },
                          ]}
                          onPress={() => handleRemoveCat(cat.id)}
                          activeOpacity={0.72}
                          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                          accessibilityRole="button">
                          <View style={S.gastosCardCol}>
                            <Text style={S.gastosCardEmojiTop} allowFontScaling={false}>
                              {cat.emoji}
                            </Text>
                            <Text
                              style={[S.gastosCardLabel, { color: T.primary }]}
                              numberOfLines={2}
                              ellipsizeMode="tail"
                              allowFontScaling>
                              {cat.nombre}
                            </Text>
                          </View>
                          <View style={[S.gastosCardCheck, { backgroundColor: T.primary }]}>
                            <Text style={{ fontSize: 8, color: '#fff', fontWeight: '800' }}>✓</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ))}
                </View>
              </View>

              <View style={S.gastosFooterStack}>
                {showPickerCustomInput ? (
                  <View style={[S.customCatInputCard, S.customCatInputCardGastos, S.gastosFooterCard, { backgroundColor: T.card, borderColor: T.primary }]}>
                    <Text style={{ fontSize: 13, color: T.textSecondary, marginBottom: 8, fontWeight: '600' }}>
                      Nombre de la categoría
                    </Text>
                    <View style={S.inlineRow}>
                      <TextInput
                        style={[S.inlineInput, { flex: 1, backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder, fontSize: 14, height: 40 }]}
                        placeholder="Ej: Delivery, gym..."
                        placeholderTextColor={T.textMuted}
                        value={pickerCustomName}
                        onChangeText={setPickerCustomName}
                        onSubmitEditing={handleAddPickerCustom}
                        returnKeyType="done"
                        autoFocus
                      />
                      <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary, height: 40 }]} onPress={handleAddPickerCustom}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Crear</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={S.inlineCancel} onPress={() => setShowPickerCustomInput(false)}>
                        <Text style={{ color: T.textMuted, fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowPickerCustomInput(true)}
                    style={[S.addCustomCatBtn, S.addCustomCatBtnGastos, S.gastosFooterCard, { borderColor: T.primary, backgroundColor: T.primaryBg }]}
                    activeOpacity={0.8}>
                    <Text style={[S.addCustomCatIcon, S.addCustomCatIconGastos, { color: T.primary }]}>＋</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[S.addCustomCatTitle, S.addCustomCatTitleGastos, { color: T.primary }]} numberOfLines={1}>
                        Añade categoría
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, color: T.primary }}>→</Text>
                  </TouchableOpacity>
                )}

                <View style={S.gastosNavRowFoot}>
                  <TouchableOpacity
                    onPress={() => goToStep(2)}
                    style={[S.gastosBackFoot, { borderColor: T.glassBorder, backgroundColor: T.surface }]}
                    activeOpacity={0.75}>
                    <Text style={{ fontSize: 18, color: T.textMuted }}>←</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.gastosCtaBtn, { backgroundColor: categoriasList.length > 0 ? T.primary : T.surface, borderWidth: categoriasList.length > 0 ? 0 : 1, borderColor: T.glassBorder }]}
                    onPress={goGastosToFuentesStep}
                    activeOpacity={0.84}>
                    <Text style={[S.ctaBtnText, { fontSize: 14 }, categoriasList.length === 0 && { color: T.textMuted }]}>
                      Continuar{categoriasList.length > 0 ? ` (${categoriasList.length})` : ''} →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          )}

          {/* ───────────── PASO 5 · Fuentes de ingreso ─────────────────── */}
          {step === 4 && (
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
                  Guardamos tu perfil y categorías. El siguiente paso es registrar gastos: así la app entiende tu mes y
                  podrá sugerirte presupuestos con sentido.
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
                  <Text style={S.finishBtnText}>Ir a registrar gastos →</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={{ paddingVertical: 8 }} onPress={() => goToStep(3)}>
                <Text style={[S.backText, { color: T.textMuted, textAlign: 'center' }]}>← Volver</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </Animated.View>

      {/* ── Approximate income modal ─────────────────────────────────────── */}
      <Modal
        visible={showApproxModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowApproxModal(false)}>
        <View style={S.approxBackdrop}>
          <View style={[S.approxSheet, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
            <Text style={{ fontSize: 20, marginBottom: 4, textAlign: 'center' }}>💰</Text>
            <Text style={[S.approxTitle, { color: T.textPrimary }]}>
              {pendingSalarioId === 'custom' ? 'Ingresa tu monto exacto' : '¿Puedes poner un aproximado?'}
            </Text>
            <Text style={{ fontSize: 12, color: T.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 18 }}>
              {pendingSalarioId === 'custom'
                ? 'Referencia interna para ordenar la experiencia; podrás afinar todo con tus registros reales.'
                : 'Referencia aproximada para la app; luego tus gastos e ingresos reales marcarán el ritmo.'}
            </Text>

            <View
              style={[
                S.approxInputOuter,
                Platform.OS === 'ios' && {
                  shadowColor: T.primary,
                  shadowOpacity: 0.22,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 3 },
                },
                Platform.OS === 'android' && { elevation: 5 },
                Platform.OS === 'web' && {
                  boxShadow: `0 2px 0 0 ${T.primaryBorder}, 0 8px 24px ${T.shadowPrimary}`,
                },
              ]}>
              <View style={[S.approxInputInner, { backgroundColor: T.surface, borderColor: T.primary }]}>
                <Text style={[S.approxPrefix, { color: T.textMuted }]}>S/.</Text>
                <TextInput
                  style={[
                    S.approxInput,
                    { color: T.textPrimary },
                    Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
                  ]}
                  value={ingresoAprox}
                  onChangeText={setIngresoAprox}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={T.textMuted}
                  autoFocus
                  underlineColorAndroid="transparent"
                  selectionColor="rgba(124,58,237,0.35)"
                />
              </View>
            </View>

            <Text style={{ fontSize: 9, color: T.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 16, opacity: 0.5 }}>
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
                setShowApproxModal(false);
                scrollToIncomeContinueAfterApprox();
              }}>
              <Text style={{ fontSize: 11, color: T.textMuted, opacity: 0.5 }}>
                {pendingSalarioId === 'custom' ? 'Omitir por ahora' : 'Omitir, usar estimado del rango'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LoaderTransicion visible={showLoader} onFinish={() => router.replace('/(tabs)/perfil' as any)} />
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
  /** Menos relleno inferior en gastos (grid ya ocupa sitio). */
  slideGastosTight: { paddingBottom: 12, flexGrow: 1 },
  stepContent:   { gap: 20, alignItems: 'center', width: '100%', paddingTop: 4 },
  stepIncomeLayout: { gap: 12, paddingTop: 0 },
  stepProfileLayout: { gap: 10, paddingTop: 0 },

  // Theme picker (onboarding step 2)
  themePickerCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden' as const,
    gap: 8,
    padding: 8,
  },
  themePreviewScreen: {
    height: 100,
    borderRadius: 10,
    overflow: 'hidden' as const,
    backgroundColor: darkTheme.bg,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.12)',
  },
  themePreviewHeader: {
    height: 18,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 5,
    gap: 4,
    borderBottomWidth: 1,
  },
  themePreviewDot: { width: 6, height: 6, borderRadius: 3 },
  themePreviewBar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(124,58,237,0.2)' },
  themePreviewCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    borderRadius: 6,
    padding: 5,
    borderWidth: 1,
  },
  themeCheckDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  profileColumn: {
    width: '100%',
    maxWidth: 392,
    alignSelf: 'center',
    alignItems: 'stretch',
    gap: 10,
  },
  profileHeaderCenter: { width: '100%', alignItems: 'center', gap: 4 },
  profileSectionHeader: { width: '100%', alignItems: 'center', gap: 2, marginBottom: 2 },
  profileSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center' as const,
    letterSpacing: 0.15,
  },
  profileSectionMeta: { fontSize: 10, textAlign: 'center' as const },
  profileLifeChipsWrap: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 5,
    rowGap: 5,
    width: '100%',
  },
  profileLifeChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 0,
    flexGrow: 1,
    flexBasis: '31%',
    maxWidth: '48%',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 30,
  },
  profileLifeChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center' as const,
    lineHeight: 13,
    paddingHorizontal: 2,
  },
  profileNavRow: { flexDirection: 'row', width: '100%', gap: 10, alignItems: 'center', marginTop: 4 },
  profileBackSq: {
    width: 48,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  profileCtaBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    minWidth: 0,
    maxWidth: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  stepGastosLayout: { gap: 4, paddingTop: 0, width: '100%' as const, alignItems: 'stretch' as const },
  gastosScrollFreeTop: { width: '100%', gap: 4 },

  // Gastos: encabezado bajo
  gastosIntroTitle: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    textAlign: 'center',
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  gastosIntroSub: {
    fontSize: 11,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 15,
  },
  gastosLaterEditNote: {
    marginTop: 6,
    fontSize: 10,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: 6,
    opacity: 0.92,
  },
  gastosCountBadge: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  gastosHintBanner: {
    width: '100%',
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  gastosFooterStack: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    alignItems: 'stretch',
    gap: 6,
    marginTop: 0,
  },
  gastosFooterCard: { width: '100%', borderRadius: 12, overflow: 'hidden' as const },
  gastosNavRowFoot: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gastosBackFoot: {
    width: 52,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gastosCtaBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    minWidth: 0,
    maxWidth: 300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  // Hero (step 0)
  heroSection: { alignItems: 'center', gap: 12, paddingTop: 4, paddingBottom: 4 },
  heroIconOuter: { marginBottom: 6 },
  /** Borde fino tipo neón: ~1px de gradiente visible alrededor del relleno. */
  heroIconNeonRing: {
    width: 74,
    height: 74,
    borderRadius: 24,
    padding: 1,
  },
  heroIconInner: {
    flex: 1,
    borderRadius: 23,
    overflow: 'hidden' as const,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconInnerShine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '52%',
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
  },
  heroIconEmoji: {
    fontSize: 31,
    lineHeight: 34,
    zIndex: 1,
    textShadowColor: 'rgba(203,166,255,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  heroTitle:   {
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 38,
    fontFamily: 'PlusJakartaSans_700Bold',
    maxWidth: 400,
    alignSelf: 'center',
    letterSpacing: -0.6,
  },
  heroSub:     { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: 'Manrope_400Regular', maxWidth: 400, alignSelf: 'center' },

  // Stat insight deck (paso 0)
  statDeck: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 22,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 14,
    gap: 14,
  },
  statDeckHeader: { width: '100%', gap: 6, paddingHorizontal: 2 },
  statDeckKicker: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 2.2,
    textTransform: 'uppercase' as const,
  },
  statDeckTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  statDeckRule: { height: 1, width: 44, borderRadius: 1, marginTop: 2, opacity: 0.85 },

  statRow: { flexDirection: 'row', gap: 10, width: '100%', alignItems: 'stretch' },
  statRowStacked: { flexDirection: 'column', gap: 10 },

  statAnimSlotRow: { flex: 1, minWidth: 0 },
  statAnimSlotStacked: { width: '100%' },

  statCardPremiumShell: {
    borderRadius: 18,
    minHeight: 148,
  },
  statCardOverflow: { overflow: 'hidden' as const },
  statCardGlowBar: { width: '100%', height: 3 },
  statCardInner: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
    alignItems: 'stretch',
  },
  statCardInnerStacked: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  statCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 8,
    marginBottom: 2,
  },
  statCardMetaRowStacked: { marginBottom: 4 },
  statEyebrow: {
    flex: 1,
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 1.35,
    textTransform: 'uppercase' as const,
  },
  statIndex: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    letterSpacing: 0.8,
    opacity: 0.85,
  },
  statValuePremium: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: -1.1,
    lineHeight: 30,
    textAlign: 'center' as const,
  },
  statValuePremiumAccent: {
    textShadowColor: 'rgba(124,58,237,0.45)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  statValuePremiumStacked: { fontSize: 28, lineHeight: 32, textAlign: 'left' as const },
  statLabelPremium: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  statLabelStacked: { textAlign: 'left', alignSelf: 'stretch' },
  statFooterPillPremium: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
  },
  statFooterPillStacked: { alignSelf: 'flex-start' },
  statFooterTextPremium: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: 0.15,
  },

  // Social proof
  socialProof: { flexDirection: 'row', alignItems: 'center', width: '100%', borderRadius: 14, borderWidth: 1, padding: 14 },

  // Salary cards (step 1)
  salaryCard:  { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 14, gap: 12 },
  salaryCardIncome: { paddingVertical: 9, paddingHorizontal: 11, gap: 9, borderRadius: 12 },
  salaryIconIncome: { fontSize: 18, width: 28, textAlign: 'center' as const },
  salaryLabelIncome: { fontSize: 13 },
  salarySubIncome: { fontSize: 10, lineHeight: 14, marginTop: 1 },
  radioCircleIncome: { width: 18, height: 18, borderRadius: 9 },
  radioInnerIncome: { width: 6, height: 6, borderRadius: 3 },
  salaryLabel: { fontSize: 15, fontWeight: '700', fontFamily: 'PlusJakartaSans_600SemiBold' },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner:  { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  privacyNote: { width: '100%', borderRadius: 12, borderWidth: 1, padding: 14 },
  privacyNoteIncome: { paddingVertical: 9, paddingHorizontal: 11 },
  privacyTextIncome: { fontSize: 11, lineHeight: 15 },
  sectionTitleIncome: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    textAlign: 'center' as const,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  sectionSubIncome: { fontSize: 12, lineHeight: 17, textAlign: 'center' as const, fontFamily: 'Manrope_400Regular' },

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
  fieldGroupProfile: { paddingHorizontal: 12, paddingTop: 7, paddingBottom: 6, borderRadius: 8 },
  fieldLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  fieldLabelProfile: { fontSize: 9, letterSpacing: 0.55 },
  fieldInput:     { fontSize: 17, paddingVertical: 4, fontFamily: 'PlusJakartaSans_500Medium' },
  fieldInputProfile: { fontSize: 16, paddingVertical: 2 },
  currencyCard:   { borderRadius: 14, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1 },
  currencyCardProfile: { paddingVertical: 10, paddingHorizontal: 10, gap: 4, borderRadius: 8 },
  flagBadge:      { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flagBadgeProfile: { width: 32, height: 32, borderRadius: 8 },
  currencySymbol: { fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold' },
  currencySymbolProfile: { fontSize: 17 },

  // Labels / pills
  label:          { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  labelRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pillGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  togglePill:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  togglePillText: { fontSize: 13, fontWeight: '600' },

  // Payment method grid
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodGridProfile: { gap: 6 },
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
  methodCardProfile: { paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  methodCheck: {
    position: 'absolute', top: 5, right: 5,
    width: 14, height: 14, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },

  // Bank grid
  bankGrid: { gap: 8 },
  bankGridProfile: { gap: 6 },
  bankCardProfile: { paddingVertical: 9, paddingHorizontal: 11, gap: 8, borderRadius: 8 },
  banksExpandProfile: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 8 },
  banksExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
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
  addOtherBtnProfile: { paddingVertical: 9, paddingHorizontal: 12, gap: 6, borderRadius: 8 },
  countBadgeProfile: { width: 24, height: 24, borderRadius: 12 },
  countBadgeTextProfile: { fontSize: 11 },

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
  suggBadgeGastos: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 9 },

  // Gastos: chips tipo nube; columnGap/rowGap se pasan inline (col estrecho, filas más separadas)
  gastosCardGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    width: '100%' as const,
    justifyContent: 'flex-start' as const,
  },
  gastosCardSlot: { position: 'relative' as const },
  gastosCard: {
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'center' as const,
    width: '100%' as const,
    minHeight: 52,
    alignItems: 'center' as const,
  },
  /** Emoji arriba + label abajo: más ancho para el nombre en móvil. */
  gastosCardCol: {
    width: '100%' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 1,
    paddingTop: 1,
    paddingRight: 8,
  },
  gastosCardEmojiTop: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center' as const,
    marginBottom: 1,
  },
  gastosCardLabel: {
    width: '100%' as const,
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    textAlign: 'center' as const,
    lineHeight: 14,
  },
  gastosCardCheck: {
    position: 'absolute' as const,
    top: 4,
    right: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
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
  addCustomCatBtnGastos: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  addCustomCatIcon: {
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 40,
  },
  addCustomCatIconGastos: { fontSize: 20, lineHeight: 22 },
  addCustomCatTitle: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
    lineHeight: 26,
  },
  addCustomCatTitleGastos: { fontSize: 13, lineHeight: 17 },
  addCustomCatSub: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: 'Manrope_400Regular',
  },
  addCustomCatSubGastos: { fontSize: 11, marginTop: 1 },
  customCatInputCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 2,
    padding: 18,
  },
  customCatInputCardGastos: { borderRadius: 14, borderWidth: 1.5, padding: 12 },

  // Approximate income modal (compact width)
  approxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingHorizontal: 40,
  },
  approxSheet: {
    width: '100%',
    maxWidth: 300,
    alignSelf: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  approxTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  approxInputOuter: {
    width: '100%',
    borderRadius: 12,
  },
  approxInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 2,
    paddingLeft: 12,
    paddingRight: 10,
    overflow: 'hidden',
  },
  approxPrefix: {
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
    minWidth: 28,
  },
  approxInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
    padding: 0,
    margin: 0,
    ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
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
