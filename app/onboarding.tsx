import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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

// ─── Module-level constants ────────────────────────────────────────────────────

const DEFAULT_PAYMENT_OPTIONS = [
  'Efectivo', 'Yape', 'Plin', 'Débito', 'Crédito', 'BIM', 'Transferencia',
];

const CATEGORIAS_DEFAULT = [
  { id: '1', nombre: 'Alimentación', emoji: '🍔' },
  { id: '2', nombre: 'Transporte',   emoji: '🚌' },
  { id: '3', nombre: 'Entretenimiento', emoji: '🎬' },
  { id: '4', nombre: 'Salud',        emoji: '💊' },
  { id: '5', nombre: 'Ropa',         emoji: '👕' },
  { id: '6', nombre: 'Servicios',    emoji: '💡' },
  { id: '7', nombre: 'Mascotas',     emoji: '🐾' },
  { id: '8', nombre: 'Otros',        emoji: '📦' },
];

const INCOME_CATEGORIAS_DEFAULT = [
  { id: '1', nombre: 'Sueldo',         emoji: '💼' },
  { id: '2', nombre: 'Inversiones',    emoji: '📈' },
  { id: '3', nombre: 'Préstamos',      emoji: '🏦' },
  { id: '4', nombre: 'Ventas',         emoji: '🛍️' },
  { id: '5', nombre: 'Transferencias', emoji: '↔️' },
  { id: '6', nombre: 'Freelance',      emoji: '💻' },
  { id: '7', nombre: 'Otros',          emoji: '📦' },
];

type CurrencyOption = { code: MonedaCode; symbol: string; name: string; flag: string };
const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'PEN', symbol: 'S/.', name: 'Sol Peruano', flag: '🇵🇪' },
  { code: 'USD', symbol: '$',   name: 'Dólar',       flag: '🇺🇸' },
];

const STEP_LABELS = ['Bienvenida', 'Cómo funciona', 'Tu perfil', 'Presupuestos', 'Ingresos'];
const TOTAL_STEPS = 5;
const TIPO_CAMBIO_DEFAULT = 3.75;

// ─── Component ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { loadFromSupabase, profile } = useFinanceStore();

  // ── Step & animation ────────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const stepOpacity   = useRef(new Animated.Value(1)).current;
  const stepTransY    = useRef(new Animated.Value(0)).current;
  const progressAnim  = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;
  const [progressTrackW, setProgressTrackW] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // ── Profile ─────────────────────────────────────────────────────────────────
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [moneda, setMoneda] = useState<MonedaCode>('PEN');

  // ── Payment methods: catalog + selection ────────────────────────────────────
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<string[]>(() => {
    const saved = (profile.metodosDePago ?? []).map((m) => m.nombre);
    const all = [...DEFAULT_PAYMENT_OPTIONS];
    for (const m of saved) if (!all.includes(m)) all.push(m);
    return all;
  });
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(() => {
    const saved = (profile.metodosDePago ?? []).map((m) => m.nombre);
    return saved.length > 0 ? saved : ['Efectivo', 'Yape'];
  });
  const [newCustomPayment, setNewCustomPayment]       = useState('');
  const [showCustomPaymentInput, setShowCustomPaymentInput] = useState(false);

  // ── Banks: catalog + selection ───────────────────────────────────────────────
  const [bankOptions, setBankOptions] = useState<string[]>(() => {
    const saved = profile.bancosDisponibles ?? [];
    const all = [...DEFAULT_BANCOS_DISPONIBLES];
    for (const b of saved) if (!all.includes(b)) all.push(b);
    return all;
  });
  const [selectedBanks, setSelectedBanks] = useState<string[]>(
    () => (profile.bancosDisponibles ?? []).filter(Boolean),
  );
  const [newCustomBank, setNewCustomBank]       = useState('');
  const [showCustomBankInput, setShowCustomBankInput] = useState(false);

  // ── Budget categories ────────────────────────────────────────────────────────
  const [presupuestos, setPresupuestos]     = useState<Record<string, string>>({});
  const [categoriasList, setCategoriasList] = useState(CATEGORIAS_DEFAULT);
  const [newCatName, setNewCatName]         = useState('');
  const [showCatInput, setShowCatInput]     = useState(false);

  // ── Income categories ────────────────────────────────────────────────────────
  const [incomeCategoriasList, setIncomeCategoriasList] = useState(INCOME_CATEGORIAS_DEFAULT);

  // ── UI ───────────────────────────────────────────────────────────────────────
  const [showLoader, setShowLoader] = useState(false);
  const [finishing, setFinishing]   = useState(false);

  // ── Progress bar animation ───────────────────────────────────────────────────
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (step + 1) / TOTAL_STEPS,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [step, progressAnim]);

  // ── Step navigation with fade + slide ───────────────────────────────────────
  const goToStep = (n: number) => {
    Animated.timing(stepOpacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setStep(n);
      stepTransY.setValue(18);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      Animated.parallel([
        Animated.timing(stepOpacity, { toValue: 1, duration: 270, useNativeDriver: true }),
        Animated.timing(stepTransY, {
          toValue: 0,
          duration: 270,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // ── Payment method handlers ──────────────────────────────────────────────────
  const togglePaymentMethod = (name: string) => {
    setSelectedPaymentMethods((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name],
    );
  };

  const handleAddCustomPaymentMethod = () => {
    const trimmed = newCustomPayment.trim();
    if (!trimmed) return;
    if (!paymentMethodOptions.includes(trimmed))
      setPaymentMethodOptions((prev) => [...prev, trimmed]);
    if (!selectedPaymentMethods.includes(trimmed))
      setSelectedPaymentMethods((prev) => [...prev, trimmed]);
    setNewCustomPayment('');
    setShowCustomPaymentInput(false);
  };

  // ── Bank handlers ────────────────────────────────────────────────────────────
  const toggleBank = (name: string) => {
    setSelectedBanks((prev) =>
      prev.includes(name) ? prev.filter((b) => b !== name) : [...prev, name],
    );
  };

  const handleAddCustomBank = () => {
    const trimmed = newCustomBank.trim();
    if (!trimmed) return;
    if (!bankOptions.includes(trimmed)) setBankOptions((prev) => [...prev, trimmed]);
    if (!selectedBanks.includes(trimmed)) setSelectedBanks((prev) => [...prev, trimmed]);
    setNewCustomBank('');
    setShowCustomBankInput(false);
  };

  // ── Budget category handlers ─────────────────────────────────────────────────
  const handleAddCat = () => {
    if (!newCatName.trim()) return;
    setCategoriasList((prev) => [
      ...prev,
      { id: newCatName.toLowerCase(), nombre: newCatName.trim(), emoji: '📦' },
    ]);
    setNewCatName('');
    setShowCatInput(false);
  };

  const handleRemoveCat = (id: string) => {
    setCategoriasList((prev) => prev.filter((c) => c.id !== id));
  };

  // ── handleFinish ─────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!user) {
      router.replace('/(tabs)' as any);
      return;
    }
    setFinishing(true);
    try {
      const nombreGuardado = nombreUsuario.trim() || 'Usuario';

      await db.updateProfile(user.id, {
        nombre_usuario:    nombreGuardado,
        moneda_principal:  moneda,
        tipo_de_cambio:    TIPO_CAMBIO_DEFAULT,
        metodos_de_pago:   selectedPaymentMethods,
        bancos_disponibles: selectedBanks,
        onboarding_done:   true,
      });

      await loadFromSupabase();

      useFinanceStore.setState((state) => ({
        profile: {
          ...state.profile,
          nombreUsuario:   nombreGuardado,
          monedaPrincipal: moneda,
          tipoDeCambio:    TIPO_CAMBIO_DEFAULT,
          metodosDePago:   selectedPaymentMethods.map((n) => ({
            id: createId(),
            nombre: n,
            activo: true,
          })),
          bancosDisponibles: selectedBanks,
        },
      }));

      const { supabase } = await import('@/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      const sessionUserId = session?.user?.id ?? user.id;

      // Guardar categorías de GASTOS
      try {
        const { error: delGastosError } = await supabase
          .from('user_categories')
          .delete()
          .eq('user_id', sessionUserId)
          .eq('tipo', 'gasto');
        if (delGastosError) console.error('Error borrando gastos:', delGastosError);

        for (let i = 0; i < categoriasList.length; i++) {
          const cat = categoriasList[i];
          const { error: insError } = await supabase.from('user_categories').insert({
            user_id: sessionUserId,
            nombre:  cat.nombre,
            emoji:   cat.emoji,
            tipo:    'gasto',
            orden:   i + 1,
          });
          if (insError) console.error('Error insertando categoría gasto:', cat.nombre, insError);
        }
      } catch (e) {
        console.error('Error bloque gastos:', e);
      }

      // Guardar categorías de INGRESOS
      try {
        const { error: delIngresosError } = await supabase
          .from('user_categories')
          .delete()
          .eq('user_id', sessionUserId)
          .eq('tipo', 'ingreso');
        if (delIngresosError) console.error('Error borrando ingresos:', delIngresosError);

        for (let i = 0; i < incomeCategoriasList.length; i++) {
          const cat = incomeCategoriasList[i];
          const { error: insError } = await supabase.from('user_categories').insert({
            user_id: sessionUserId,
            nombre:  cat.nombre,
            emoji:   cat.emoji,
            tipo:    'ingreso',
            orden:   i + 1,
          });
          if (insError) console.error('Error insertando categoría ingreso:', cat.nombre, insError);
        }
      } catch (e) {
        console.error('Error bloque ingresos:', e);
      }

      // Guardar presupuestos
      const mesActual = new Date().toISOString().slice(0, 7);
      const budgetPromises = Object.entries(presupuestos)
        .filter(([, val]) => val && parseFloat(val) > 0)
        .map(([categoria, limite]) =>
          db.upsertBudget(user.id, categoria, parseFloat(limite), mesActual),
        );
      await Promise.all(budgetPromises);

      await AsyncStorage.setItem('ahorraya_onboarding_done', 'true');

      useFinanceStore.setState({ categories: [], incomeCategories: [] });
      const { loadFromSupabase: syncAll, loadCategories, loadIncomeCategories } =
        useFinanceStore.getState();
      await syncAll();
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

  // ── Derived ──────────────────────────────────────────────────────────────────
  const progressFillWidth = progressAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, progressTrackW],
  });

  const currencySymbol = moneda === 'USD' ? '$' : 'S/.';

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[S.container, { backgroundColor: T.bg }]}>

      {/* ── Fixed progress header ─────────────────────────────────────────── */}
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

      {/* ── Animated step content ─────────────────────────────────────────── */}
      <Animated.View style={{ flex: 1, opacity: stepOpacity, transform: [{ translateY: stepTransY }] }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={S.slide}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">

          {/* ── PASO 0 · Bienvenida ──────────────────────────────────────── */}
          {step === 0 && (
            <View style={S.stepContent}>
              <View style={S.heroSection}>
                <View style={[S.iconBox, { backgroundColor: T.primaryBg, borderColor: T.primaryBorder }]}>
                  <Text style={{ fontSize: 34 }}>💎</Text>
                </View>
                <Text style={[S.heroTitle, { color: T.textPrimary }]}>
                  Claridad financiera,{'\n'}por fin.
                </Text>
                <Text style={[S.heroSub, { color: T.textSecondary }]}>
                  Organiza tus finanzas, crea hábitos consistentes y sigue tu progreso mes a mes.
                </Text>
              </View>

              <View style={[S.card, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                {[
                  { icon: '📊', title: 'Registro rápido',      desc: 'Anota gastos e ingresos en pocos segundos.' },
                  { icon: '🗂️', title: 'Organización clara',   desc: 'Categorías, presupuestos y reportes visuales.' },
                  { icon: '📈', title: 'Progreso visible',      desc: 'Ve cómo evolucionas semana a semana.' },
                  { icon: '✨', title: 'Motivación constante',  desc: 'Misiones y logros refuerzan tus hábitos.' },
                ].map((f) => (
                  <View key={f.title} style={S.featureRow}>
                    <View style={[S.featureIcon, { backgroundColor: T.primaryBg }]}>
                      <Text style={{ fontSize: 17 }}>{f.icon}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[S.featureTitle, { color: T.textPrimary }]}>{f.title}</Text>
                      <Text style={[S.featureDesc,  { color: T.textMuted }]}>{f.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[S.ctaBtn, { backgroundColor: T.primary }]}
                onPress={() => goToStep(1)}
                activeOpacity={0.84}>
                <Text style={S.ctaBtnText}>Empezar →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── PASO 1 · Cómo funciona ───────────────────────────────────── */}
          {step === 1 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Así funciona AhorraYA</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  Una app diseñada para hacer tu vida financiera más simple y consistente.
                </Text>
              </View>

              <View style={{ gap: 10, width: '100%' }}>
                {[
                  {
                    icon: '📝',
                    title: 'Registra',
                    desc:  'Cada gasto e ingreso se guarda con su categoría, medio de pago y banco.',
                  },
                  {
                    icon: '📊',
                    title: 'Visualiza',
                    desc:  'Resúmenes automáticos, gráficos y tendencias mensuales al instante.',
                  },
                  {
                    icon: '🎯',
                    title: 'Presupuesta',
                    desc:  'Define límites por categoría y recibe alertas antes de sobrepasarte.',
                  },
                  {
                    icon: '🔥',
                    title: 'Mantén el hábito',
                    desc:  'Misiones semanales, rachas y logros te mantienen constante. Cada registro suma.',
                  },
                ].map((item) => (
                  <View key={item.title} style={[S.howCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                    <View style={[S.featureIcon, { backgroundColor: T.primaryBg }]}>
                      <Text style={{ fontSize: 19 }}>{item.icon}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[S.howTitle, { color: T.textPrimary }]}>{item.title}</Text>
                      <Text style={[S.howDesc,  { color: T.textSecondary }]}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(0)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.ctaBtn, { backgroundColor: T.primary, flex: 1 }]}
                  onPress={() => goToStep(2)}
                  activeOpacity={0.84}>
                  <Text style={S.ctaBtnText}>Continuar →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── PASO 2 · Tu perfil ───────────────────────────────────────── */}
          {step === 2 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Tu perfil financiero</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  Personaliza la app según tus hábitos y cuentas reales.
                </Text>
              </View>

              {/* Nombre */}
              <View style={[S.fieldGroup, { backgroundColor: T.surface, borderColor: T.glassBorder }]}>
                <Text style={[S.fieldLabel, { color: T.textMuted }]}>NOMBRE</Text>
                <TextInput
                  style={[S.fieldInput, { color: T.textPrimary }]}
                  placeholder="¿Cómo te llamamos?"
                  placeholderTextColor={T.textMuted}
                  value={nombreUsuario}
                  onChangeText={setNombreUsuario}
                  returnKeyType="done"
                />
              </View>

              {/* Moneda */}
              <View style={{ width: '100%', gap: 10 }}>
                <Text style={[S.label, { color: T.textSecondary }]}>Moneda principal</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {CURRENCY_OPTIONS.map((cur) => {
                    const active = moneda === cur.code;
                    return (
                      <TouchableOpacity
                        key={cur.code}
                        style={[
                          S.currencyCard,
                          {
                            flex: 1,
                            backgroundColor: active ? T.primaryBg : T.surface,
                            borderColor:     active ? T.primary   : T.glassBorder,
                            borderWidth:     active ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => setMoneda(cur.code)}
                        activeOpacity={0.8}>
                        <Text style={{ fontSize: 22 }}>{cur.flag}</Text>
                        <Text style={[S.currencySymbol, { color: active ? T.primary : T.textPrimary }]}>
                          {cur.symbol}
                        </Text>
                        <Text style={{ fontSize: 12, color: T.textMuted }}>{cur.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 12, color: T.textMuted, marginLeft: 2 }}>
                  Define el formato principal de la app. Ajustable después en configuración.
                </Text>
              </View>

              {/* Métodos de pago */}
              <View style={{ width: '100%', gap: 10 }}>
                <View style={S.labelRow}>
                  <Text style={[S.label, { color: T.textSecondary }]}>Métodos de pago</Text>
                  <Text style={{ fontSize: 12, color: T.textMuted }}>
                    {selectedPaymentMethods.length} seleccionado{selectedPaymentMethods.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={S.pillGrid}>
                  {paymentMethodOptions.map((m) => {
                    const active = selectedPaymentMethods.includes(m);
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          S.togglePill,
                          {
                            backgroundColor: active ? T.primaryBg : T.surface,
                            borderColor:     active ? T.primary   : T.glassBorder,
                            borderWidth:     active ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => togglePaymentMethod(m)}
                        activeOpacity={0.75}>
                        {active && <Text style={{ fontSize: 11, color: T.primary, marginRight: 4 }}>✓</Text>}
                        <Text style={[S.togglePillText, { color: active ? T.primary : T.textSecondary }]}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {showCustomPaymentInput ? (
                  <View style={S.inlineRow}>
                    <TextInput
                      style={[S.inlineInput, { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                      placeholder="Ej: Nequi, PayPal..."
                      placeholderTextColor={T.textMuted}
                      value={newCustomPayment}
                      onChangeText={setNewCustomPayment}
                      onSubmitEditing={handleAddCustomPaymentMethod}
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary }]} onPress={handleAddCustomPaymentMethod}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Agregar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.inlineCancel} onPress={() => setShowCustomPaymentInput(false)}>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={S.addMoreBtn} onPress={() => setShowCustomPaymentInput(true)}>
                    <Text style={{ color: T.textSecondary, fontSize: 13 }}>+ Otro método</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Bancos */}
              <View style={{ width: '100%', gap: 10 }}>
                <View style={S.labelRow}>
                  <Text style={[S.label, { color: T.textSecondary }]}>Bancos que usas</Text>
                  <Text style={{ fontSize: 12, color: T.textMuted }}>
                    {selectedBanks.length === 0
                      ? 'Ninguno aún'
                      : `${selectedBanks.length} seleccionado${selectedBanks.length !== 1 ? 's' : ''}`}
                  </Text>
                </View>
                <View style={S.pillGrid}>
                  {bankOptions.map((b) => {
                    const active = selectedBanks.includes(b);
                    return (
                      <TouchableOpacity
                        key={b}
                        style={[
                          S.togglePill,
                          {
                            backgroundColor: active ? T.primaryBg : T.surface,
                            borderColor:     active ? T.primary   : T.glassBorder,
                            borderWidth:     active ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => toggleBank(b)}
                        activeOpacity={0.75}>
                        {active && <Text style={{ fontSize: 11, color: T.primary, marginRight: 4 }}>✓</Text>}
                        <Text style={[S.togglePillText, { color: active ? T.primary : T.textSecondary }]}>
                          {b}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {showCustomBankInput ? (
                  <View style={S.inlineRow}>
                    <TextInput
                      style={[S.inlineInput, { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                      placeholder="Ej: Banco de la Nación..."
                      placeholderTextColor={T.textMuted}
                      value={newCustomBank}
                      onChangeText={setNewCustomBank}
                      onSubmitEditing={handleAddCustomBank}
                      returnKeyType="done"
                    />
                    <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary }]} onPress={handleAddCustomBank}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Agregar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.inlineCancel} onPress={() => setShowCustomBankInput(false)}>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={S.addMoreBtn} onPress={() => setShowCustomBankInput(true)}>
                    <Text style={{ color: T.textSecondary, fontSize: 13 }}>+ Otro banco</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(1)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.ctaBtn, { backgroundColor: T.primary, flex: 1 }]}
                  onPress={() => goToStep(3)}
                  activeOpacity={0.84}>
                  <Text style={S.ctaBtnText}>Continuar →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── PASO 3 · Presupuestos ────────────────────────────────────── */}
          {step === 3 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Presupuestos mensuales</Text>
                <View style={S.optionalBadge}>
                  <Text style={{ fontSize: 11, color: T.textMuted, fontWeight: '600' }}>OPCIONAL</Text>
                </View>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  ¿Cuánto quieres gastar por categoría? Editable en cualquier momento.
                </Text>
              </View>

              <View style={{ gap: 8, width: '100%' }}>
                {categoriasList.map((cat) => (
                  <View key={cat.id} style={[S.budgetCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                    <TextInput
                      value={cat.emoji}
                      onChangeText={(val) =>
                        setCategoriasList((prev) =>
                          prev.map((c) => (c.id === cat.id ? { ...c, emoji: val } : c)),
                        )
                      }
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
                        onChangeText={(val) =>
                          setPresupuestos((prev) => ({ ...prev, [cat.nombre]: val }))
                        }
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <TouchableOpacity onPress={() => handleRemoveCat(cat.id)} style={S.removeBtn}>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {showCatInput ? (
                <View style={S.inlineRow}>
                  <TextInput
                    style={[S.inlineInput, { flex: 1, backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                    placeholder="Nueva categoría"
                    placeholderTextColor={T.textMuted}
                    value={newCatName}
                    onChangeText={setNewCatName}
                    onSubmitEditing={handleAddCat}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={[S.inlineOk, { backgroundColor: T.primary }]} onPress={handleAddCat}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Agregar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.inlineCancel} onPress={() => setShowCatInput(false)}>
                    <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[S.dashedBtn, { borderColor: T.glassBorder }]}
                  onPress={() => setShowCatInput(true)}>
                  <Text style={{ color: T.textSecondary, fontSize: 13, fontWeight: '600' }}>
                    + Agregar categoría
                  </Text>
                </TouchableOpacity>
              )}

              <View style={S.navRow}>
                <TouchableOpacity onPress={() => goToStep(2)} style={S.backBtn}>
                  <Text style={[S.backText, { color: T.textMuted }]}>← Atrás</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.ctaBtn, { backgroundColor: T.primary, flex: 1 }]}
                  onPress={() => goToStep(4)}
                  activeOpacity={0.84}>
                  <Text style={S.ctaBtnText}>Continuar →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── PASO 4 · Ingresos ────────────────────────────────────────── */}
          {step === 4 && (
            <View style={S.stepContent}>
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={[S.sectionTitle, { color: T.textPrimary }]}>Fuentes de ingreso</Text>
                <Text style={[S.sectionSub, { color: T.textSecondary }]}>
                  ¿De dónde viene tu dinero? Personaliza tus categorías de ingreso.
                </Text>
              </View>

              <View style={{ gap: 8, width: '100%' }}>
                {incomeCategoriasList.map((cat) => (
                  <View key={cat.id} style={[S.incomeCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                    <TextInput
                      value={cat.emoji}
                      onChangeText={(val) =>
                        setIncomeCategoriasList((prev) =>
                          prev.map((c) => (c.id === cat.id ? { ...c, emoji: val } : c)),
                        )
                      }
                      style={[S.emojiInput, { backgroundColor: T.surface, borderColor: T.glassBorder, color: T.textPrimary }]}
                      maxLength={2}
                    />
                    <TextInput
                      value={cat.nombre}
                      onChangeText={(val) =>
                        setIncomeCategoriasList((prev) =>
                          prev.map((c) => (c.id === cat.id ? { ...c, nombre: val } : c)),
                        )
                      }
                      style={[S.incomeName, { color: T.textPrimary }]}
                      placeholderTextColor={T.textMuted}
                    />
                    <TouchableOpacity
                      style={S.removeBtn}
                      onPress={() =>
                        setIncomeCategoriasList((prev) => prev.filter((c) => c.id !== cat.id))
                      }>
                      <Text style={{ color: T.textMuted, fontSize: 15 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[S.dashedBtn, { borderColor: T.glassBorder }]}
                onPress={() =>
                  setIncomeCategoriasList((prev) => [
                    ...prev,
                    { id: Date.now().toString(), nombre: 'Nueva categoría', emoji: '📦' },
                  ])
                }>
                <Text style={{ color: T.textSecondary, fontSize: 13, fontWeight: '600' }}>
                  + Agregar categoría
                </Text>
              </TouchableOpacity>

              {/* Summary card antes del CTA */}
              <View style={[S.summaryCard, { backgroundColor: T.card, borderColor: T.primaryBorder }]}>
                <Text style={[S.summaryTitle, { color: T.textPrimary }]}>¡Ya casi terminamos!</Text>
                <Text style={[S.summarySub, { color: T.textSecondary }]}>
                  Guardaremos tu perfil y las categorías que configuraste. Podrás editarlo todo desde tu perfil.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  S.finishBtn,
                  { backgroundColor: finishing ? T.surface : T.primary },
                ]}
                onPress={handleFinish}
                disabled={finishing}
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

              <TouchableOpacity style={{ paddingVertical: 8 }} onPress={() => goToStep(3)}>
                <Text style={[S.backText, { color: T.textMuted, textAlign: 'center' }]}>← Volver</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      </Animated.View>

      <LoaderTransicion
        visible={showLoader}
        onFinish={() => router.replace('/(tabs)' as any)}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:    { flex: 1, paddingTop: 52 },
  header:       { paddingHorizontal: 24, paddingBottom: 14, gap: 10 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepLabel:    { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  stepCount:    { fontSize: 13 },
  progressTrack:{ height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  slide:        { paddingHorizontal: 24, paddingBottom: 44 },
  stepContent:  { gap: 20, alignItems: 'center', width: '100%', paddingTop: 4 },

  // Hero
  heroSection: { alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 4 },
  iconBox: {
    width: 72, height: 72, borderRadius: 20, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroTitle: {
    fontSize: 28, fontWeight: '800', textAlign: 'center', lineHeight: 36,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  heroSub: {
    fontSize: 15, textAlign: 'center', lineHeight: 24,
    fontFamily: 'Manrope_400Regular',
  },

  // Section headers
  sectionTitle: {
    fontSize: 24, fontWeight: '800', lineHeight: 32,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  sectionSub: { fontSize: 14, lineHeight: 22, fontFamily: 'Manrope_400Regular' },

  // Feature card (step 0)
  card: { width: '100%', borderRadius: 16, padding: 20, gap: 16, borderWidth: 1 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  featureDesc:  { fontSize: 13, lineHeight: 18 },

  // How-it-works cards (step 1)
  howCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    borderRadius: 14, padding: 16, borderWidth: 1,
  },
  howTitle: { fontSize: 15, fontWeight: '700' },
  howDesc:  { fontSize: 13, lineHeight: 18 },

  // CTA button
  ctaBtn: {
    height: 52, borderRadius: 14, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 24, width: '100%',
  },
  ctaBtnText: {
    color: '#fff', fontWeight: '700', fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },

  // Nav row
  navRow:  { flexDirection: 'row', alignItems: 'center', width: '100%', gap: 12 },
  backBtn: { paddingVertical: 8, paddingRight: 4 },
  backText:{ fontSize: 14, fontWeight: '600' },

  // Field group (floating label style)
  fieldGroup: {
    width: '100%', borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 2,
  },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  fieldInput: {
    fontSize: 17, paddingVertical: 4,
    fontFamily: 'PlusJakartaSans_500Medium',
  },

  // Currency selector
  currencyCard: {
    borderRadius: 14, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1,
  },
  currencySymbol: {
    fontSize: 20, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold',
  },

  // Generic label
  label:    { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Toggle pills (multi-select)
  pillGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  togglePill:    {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  togglePillText: { fontSize: 13, fontWeight: '600' },

  // Inline input row (add custom)
  inlineRow:    { flexDirection: 'row', gap: 8, width: '100%', alignItems: 'center' },
  inlineInput:  { flex: 1, height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 14, borderWidth: 1 },
  inlineOk:     { height: 44, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inlineCancel: { height: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  addMoreBtn:   { paddingVertical: 6, paddingHorizontal: 2, alignSelf: 'flex-start' },

  // Budget card (step 3)
  budgetCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  emojiInput: {
    width: 42, height: 42, fontSize: 20, textAlign: 'center',
    borderRadius: 10, borderWidth: 1,
  },
  budgetName: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 10, height: 40, minWidth: 88,
  },
  amountInput: { fontSize: 14, flex: 1, textAlign: 'right', minWidth: 56 },
  removeBtn:   { padding: 6, borderRadius: 8 },
  optionalBadge: {
    alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8,
    paddingVertical: 3, backgroundColor: 'rgba(255,255,255,0.06)',
  },

  // Dashed "add" button
  dashedBtn: {
    height: 44, borderRadius: 12, borderWidth: 1.5,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', width: '100%',
  },

  // Income card (step 4)
  incomeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  incomeName: { flex: 1, fontSize: 15, fontFamily: 'Manrope_500Medium' },

  // Summary card (step 4)
  summaryCard: { width: '100%', borderRadius: 16, padding: 20, borderWidth: 1, gap: 6 },
  summaryTitle: { fontSize: 17, fontWeight: '800', fontFamily: 'PlusJakartaSans_700Bold' },
  summarySub:   { fontSize: 14, lineHeight: 22, fontFamily: 'Manrope_400Regular' },

  // Finish button
  finishBtn: {
    height: 56, borderRadius: 16, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 24, width: '100%',
  },
  finishBtnText: {
    color: '#fff', fontWeight: '700', fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
