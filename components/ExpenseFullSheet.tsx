import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AnimatedRN, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { GradientView } from '@/components/ui/GradientView';
import { useTheme } from '@/hooks/useTheme';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { EstadoDeAnimo, MonedaCode } from '@/types';
import { DEFAULT_BANCOS_DISPONIBLES, DEFAULT_METODOS_DE_PAGO } from '@/types';

const SPRING_OPEN = { damping: 26, stiffness: 280 } as const;
const SPRING_CLOSE = { damping: 28, stiffness: 260 } as const;

/** Fuera del componente: evita hooks condicionales y props de sombra inválidas entre plataformas. */
const SHEET_CARD_SHADOW = Platform.select<ViewStyle>({
  web: { boxShadow: '0 -8px 32px rgba(0,0,0,0.22)' },
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
  },
  android: { elevation: 14 },
  default: {},
});

const EMOCIONES: { key: EstadoDeAnimo | null; emoji: string; label: string }[] = [
  { key: null, emoji: '—', label: 'Ninguno' },
  { key: 'CONTENTO', emoji: '😊', label: 'Contento' },
  { key: 'NEUTRAL', emoji: '😐', label: 'Neutral' },
  { key: 'PREOCUPADO', emoji: '😟', label: 'Preocupado' },
  { key: 'MOLESTO', emoji: '😠', label: 'Molesto' },
  { key: 'TRISTE', emoji: '😢', label: 'Triste' },
  { key: 'ANSIOSO', emoji: '😰', label: 'Ansioso' },
  { key: 'ESTRESADO', emoji: '🤯', label: 'Estresado' },
];

function toDateKeyLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaKeyToDate(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatFechaCorta(key: string) {
  return fechaKeyToDate(key).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}

type Props = { open: boolean; onDismiss: () => void };
type FieldError = 'amount' | 'category' | null;

function useShake() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const trigger = useCallback(() => {
    x.value = withSequence(
      withTiming(-9, { duration: 42, easing: Easing.linear }),
      withTiming(9, { duration: 42, easing: Easing.linear }),
      withTiming(-6, { duration: 42, easing: Easing.linear }),
      withTiming(6, { duration: 42, easing: Easing.linear }),
      withTiming(0, { duration: 42, easing: Easing.linear }),
    );
  }, [x]);
  return { style, trigger };
}

/* ─────────────────────────────────────── */
export function ExpenseFullSheet({ open, onDismiss }: Props) {
  const { T, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const addExpenseToSupabase = useFinanceStore((s) => s.addExpenseToSupabase);
  const categories = useFinanceStore((s) => s.categories);
  const profile = useFinanceStore((s) => s.profile);

  const [isVisible, setIsVisible] = useState(false);

  /** Casi toda la pantalla en móvil para ver el formulario sin scroll en la mayoría de dispositivos. */
  const sheetFrame = useMemo(() => {
    const isWeb = Platform.OS === 'web';
    const edge = isWeb ? 16 : 8;
    const inner = Math.max(0, width - edge * 2);
    const sheetWidth = Math.min(400, Math.max(280, inner || width));
    const peekTop = Math.round(height * 0.045) + insets.top;
    const bottomGap = isWeb ? 12 : 4;
    const maxH = Math.max(280, height - peekTop - bottomGap);
    const sheetHeight = isWeb ? Math.min(maxH, Math.round(height * 0.92)) : maxH;
    return { sheetWidth, sheetHeight, edge, bottomGap };
  }, [width, height, insets.top]);

  const { sheetWidth, sheetHeight, edge, bottomGap } = sheetFrame;
  const snap = sheetHeight;

  const translateY = useSharedValue(snap);
  const backdropOpacity = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const prevOpen = useRef(false);

  // form state
  const [fecha, setFecha] = useState(() => toDateKeyLocal(new Date()));
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [moneda, setMoneda] = useState<MonedaCode>(profile.monedaPrincipal);
  const [categoria, setCategoria] = useState<string>(categories[0]?.nombre ?? '');
  const [mood, setMood] = useState<EstadoDeAnimo | null>(null);
  const [esEsencial, setEsEsencial] = useState(false);

  const medios = useMemo(() => {
    const list = profile.metodosDePago ?? [];
    return list.length > 0 ? list : DEFAULT_METODOS_DE_PAGO;
  }, [profile.metodosDePago]);

  const bancosLista = useMemo(() => {
    const list = profile.bancosDisponibles;
    return list?.length ? list : DEFAULT_BANCOS_DISPONIBLES;
  }, [profile.bancosDisponibles]);

  const [medio, setMedio] = useState(() => medios[0]?.nombre ?? 'Efectivo');
  const [banco, setBanco] = useState(() => bancosLista[0] ?? 'BCP');
  const [bancoMenu, setBancoMenu] = useState(false);
  const [medioMenu, setMedioMenu] = useState(false);
  const [nota, setNota] = useState('');
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const errorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountShake = useShake();
  const categoryShake = useShake();
  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpTranslate = useRef(new Animated.Value(0)).current;
  const amountRef = useRef<TextInput>(null);

  useEffect(() => { if (open) setIsVisible(true); }, [open]);

  const finishClose = useCallback(() => { setIsVisible(false); onDismiss(); }, [onDismiss]);

  const closeSheet = useCallback(() => {
    translateY.value = withSpring(snap, SPRING_CLOSE, (f) => { if (f) runOnJS(finishClose)(); });
    backdropOpacity.value = withTiming(0, { duration: 200 });
  }, [backdropOpacity, finishClose, snap, translateY]);

  const openSheet = useCallback(() => {
    translateY.value = snap;
    backdropOpacity.value = 0;
    translateY.value = withSpring(0, SPRING_OPEN);
    backdropOpacity.value = withTiming(0.52, { duration: 260 });
  }, [backdropOpacity, snap, translateY]);

  useEffect(() => {
    const became = open && !prevOpen.current;
    prevOpen.current = open;
    if (!became) return;
    setMoneda(profile.monedaPrincipal);
    setCategoria(categories[0]?.nombre ?? '');
    setMood(null);
    setEsEsencial(false);
    setMedio(medios[0]?.nombre ?? 'Efectivo');
    setBanco(bancosLista[0] ?? 'BCP');
    setNota('');
    setAmount('');
    setFecha(toDateKeyLocal(new Date()));
    setFieldError(null);
    requestAnimationFrame(() => openSheet());
  }, [open, openSheet, profile.monedaPrincipal, categories, medios, bancosLista]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onStart(() => { dragStartY.value = translateY.value; })
    .onUpdate((e) => { translateY.value = Math.max(0, dragStartY.value + e.translationY); })
    .onEnd((e) => {
      if (translateY.value > snap * 0.22 || e.velocityY > 900) {
        translateY.value = withSpring(snap, SPRING_CLOSE, (f) => { if (f) runOnJS(finishClose)(); });
        backdropOpacity.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withSpring(0, SPRING_OPEN);
      }
    });

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaKeyToDate(fecha),
        mode: 'date',
        onChange: (_e, d) => { if (d) setFecha(toDateKeyLocal(d)); },
      });
    } else {
      setShowIosPicker((s) => !s);
    }
  };

  const flashError = (f: FieldError) => {
    if (errorClearRef.current) clearTimeout(errorClearRef.current);
    setFieldError(f);
    errorClearRef.current = setTimeout(() => setFieldError(null), 2000);
  };

  const playXp = () => new Promise<void>((res) => {
    xpOpacity.setValue(0);
    xpTranslate.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(xpOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.spring(xpTranslate, { toValue: -52, useNativeDriver: true, friction: 8, tension: 90 }),
      ]),
      Animated.timing(xpOpacity, { toValue: 0, duration: 340, delay: 80, useNativeDriver: true }),
    ]).start(() => res());
  });

  const onSave = async () => {
    const normalized = amount.replace(',', '.').trim();
    const value = Number(normalized);
    if (!normalized || Number.isNaN(value) || value <= 0) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      amountShake.trigger();
      flashError('amount');
      return;
    }
    if (!categoria) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      categoryShake.trigger();
      flashError('category');
      return;
    }
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const fd = fechaKeyToDate(fecha);
    const fechaIso = new Date(fd.getFullYear(), fd.getMonth(), fd.getDate(), 12, 0, 0, 0).toISOString();
    try {
      await addExpenseToSupabase({
        categoria, importe: value, estadoDeAnimo: mood,
        descripcion: nota.trim(), esEsencial, fecha: fechaIso,
        medioDePago: medio, banco, moneda,
      });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
      return;
    }
    await playXp();
    closeSheet();
  };

  const symbol = moneda === 'PEN' ? 'S/' : '$';
  const amountHasError = fieldError === 'amount';

  if (!open && !isVisible) return null;

  return (
    <Modal visible={open || isVisible} transparent animationType="none" statusBarTranslucent onRequestClose={closeSheet}>
      <View
        style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: edge, paddingBottom: bottomGap }}
        pointerEvents={open ? 'auto' : 'none'}>

        {/* Backdrop: más suave para que el inicio siga “presente” */}
        <Pressable style={StyleSheet.absoluteFillObject} pointerEvents={open ? 'auto' : 'none'} onPress={closeSheet}>
          <AnimatedRN.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: isDark ? 'rgba(6,7,18,0.55)' : 'rgba(26,16,53,0.45)' },
              backdropStyle,
            ]}
          />
        </Pressable>

        {/* Tarjeta flotante (no full-bleed al ancho de la pantalla) */}
        <AnimatedRN.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            sheetStyle,
            {
              width: sheetWidth,
              alignSelf: 'center',
              height: sheetHeight,
              backgroundColor: T.surface,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: T.glassBorder,
              overflow: 'hidden',
              ...SHEET_CARD_SHADOW,
            },
          ]}>

          {/* ── 1. Gradient top strip ── */}
          <GradientView colors={T.primaryGrad} style={{ height: 3 }} />

          {/* ── 2. Drag handle + header row ── */}
          <GestureDetector gesture={pan}>
            <View style={{ paddingTop: 4, paddingBottom: 6, paddingHorizontal: 16 }}>
              <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 32, height: 3, borderRadius: 2, backgroundColor: T.glassBorder }} />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    backgroundColor: T.primaryBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 8,
                  }}>
                  <Text style={{ fontSize: 17 }}>💸</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Font.jakarta700, fontSize: 17, color: T.textPrimary }}>
                    Nuevo gasto
                  </Text>
                  <Text style={{ fontFamily: Font.manrope400, fontSize: 11, color: T.textMuted }} numberOfLines={1}>
                    ¿Cuánto gastaste?
                  </Text>
                </View>
                {/* Date pill — visible aquí como contexto */}
                {Platform.OS !== 'web' && (
                  <Pressable
                    onPress={openDatePicker}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 20,
                      backgroundColor: T.card,
                      borderWidth: 1,
                      borderColor: T.glassBorder,
                    }}>
                    <Text style={{ fontSize: 12 }}>📅</Text>
                    <Text style={{ fontFamily: Font.manrope500, fontSize: 11, color: T.textSecondary }}>
                      {formatFechaCorta(fecha)}
                    </Text>
                  </Pressable>
                )}
                {Platform.OS === 'web' && (
                  <View
                    style={{
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: T.glassBorder,
                      backgroundColor: T.card,
                      height: 34,
                      justifyContent: 'center',
                      overflow: 'hidden',
                      paddingHorizontal: 6,
                    }}>
                    {createElement('input', {
                      type: 'date',
                      value: fecha,
                      onChange: (e: any) => setFecha(e.target.value),
                      style: {
                        background: 'transparent', border: 'none', outline: 'none',
                        color: T.textSecondary, fontSize: 11, cursor: 'pointer',
                        colorScheme: isDark ? 'dark' : 'light',
                      } as any,
                    })}
                  </View>
                )}
              </View>
            </View>
          </GestureDetector>

          {/* ── 3. MONTO (compacto) ── */}
          <AnimatedRN.View style={[amountShake.style, { paddingHorizontal: 16, marginBottom: 0 }]}>
            <Pressable
              onPress={() => amountRef.current?.focus()}
              style={{
                backgroundColor: T.card,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: amountHasError ? T.error : amountFocused ? T.primary : T.glassBorder,
                paddingVertical: 10,
                paddingLeft: 14,
                paddingRight: 10,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}>
              <Text
                style={{
                  fontFamily: Font.jakarta700,
                  fontSize: 26,
                  color: amountHasError ? T.error : amountFocused ? T.primaryLight : T.textMuted,
                  lineHeight: 32,
                }}>
                {symbol}
              </Text>

              <TextInput
                ref={amountRef}
                value={amount}
                onChangeText={setAmount}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                placeholder="0.00"
                placeholderTextColor={T.textMuted}
                keyboardType="decimal-pad"
                style={{
                  flex: 1,
                  fontFamily: Font.jakarta700,
                  fontSize: 34,
                  color: amountHasError ? T.error : T.textPrimary,
                  minWidth: 88,
                  textAlign: 'center',
                  padding: 0,
                  margin: 0,
                  backgroundColor: 'transparent',
                  lineHeight: 40,
                }}
              />

              {/* PEN | USD en una sola fila */}
              <View
                style={{
                  flexDirection: 'row',
                  borderRadius: 10,
                  backgroundColor: T.surface,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  padding: 2,
                }}>
                {(['PEN', 'USD'] as const).map((m) => {
                  const active = moneda === m;
                  return (
                    <Pressable key={m} onPress={() => setMoneda(m)} style={{ borderRadius: 8 }}>
                      {active ? (
                        <GradientView
                          colors={T.primaryGrad}
                          style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                          <Text style={{ fontFamily: Font.jakarta700, fontSize: 12, color: onPrimaryGradient.text }}>{m}</Text>
                        </GradientView>
                      ) : (
                        <View style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                          <Text style={{ fontFamily: Font.manrope500, fontSize: 12, color: T.textMuted }}>{m}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </AnimatedRN.View>

          {Platform.OS === 'ios' && showIosPicker && (
            <DateTimePicker
              value={fechaKeyToDate(fecha)}
              mode="date"
              display={
                typeof Platform.Version === 'number'
                  ? Platform.Version >= 14
                    ? 'compact'
                    : 'spinner'
                  : parseFloat(String(Platform.Version)) >= 14
                    ? 'compact'
                    : 'spinner'
              }
              themeVariant={isDark ? 'dark' : 'light'}
              onChange={(_, d) => { if (d) setFecha(toDateKeyLocal(d)); }}
            />
          )}

          {/* ── 4. Scrollable form fields ── */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4, flexGrow: 1 }}
            style={{ flex: 1 }}>

            {/* ─── SECCIÓN: ¿En qué? ─── */}
            <SectionLabel
              label="¿EN QUÉ GASTASTE?"
              color={fieldError === 'category' ? T.error : T.textMuted}
            />
            <AnimatedRN.View style={categoryShake.style}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignContent: 'flex-start',
                  gap: 6,
                }}>
                {categories.map((cat) => {
                  const active = categoria === cat.nombre;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCategoria(cat.nombre)}
                      style={{
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 14,
                        borderWidth: active ? 2 : 1,
                        borderColor: active ? T.primary : T.glassBorder,
                        backgroundColor: active ? T.primaryBg : T.card,
                        minWidth: 68,
                        maxWidth: 108,
                        alignSelf: 'flex-start',
                      }}>
                      <Text style={{ fontSize: 20 }}>{cat.emoji}</Text>
                      <Text
                        numberOfLines={2}
                        style={{
                          fontFamily: Font.manrope600,
                          fontSize: 10,
                          marginTop: 3,
                          color: active ? T.primary : T.textMuted,
                          textAlign: 'center',
                          lineHeight: 13,
                          maxWidth: 96,
                        }}>
                        {cat.nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </AnimatedRN.View>

            {/* ─── SECCIÓN: ¿Cómo pagaste? ─── */}
            <Divider T={T} />
            <SectionLabel label="¿CÓMO PAGASTE?" color={T.textMuted} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Font.manrope500, fontSize: 10, color: T.textMuted, marginBottom: 4 }}>
                  Medio
                </Text>
                <Pressable
                  onPress={() => setMedioMenu(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: T.glassBorder,
                    backgroundColor: T.card,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                  }}>
                  <Text style={{ fontFamily: Font.manrope600, fontSize: 14, color: T.textPrimary, flex: 1 }} numberOfLines={1}>
                    {medio}
                  </Text>
                  <Text style={{ color: T.textMuted, fontSize: 10 }}>▾</Text>
                </Pressable>
              </View>

              {/* Banco */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Font.manrope500, fontSize: 10, color: T.textMuted, marginBottom: 4 }}>
                  Banco / Cuenta
                </Text>
                {Platform.OS === 'web'
                  ? createElement('select', {
                      value: banco,
                      onChange: (e: { target: { value: string } }) => setBanco(e.target.value),
                      style: {
                        width: '100%', height: 40,
                        background: T.card, border: `1px solid ${T.glassBorder}`,
                        borderRadius: 12, color: T.textPrimary, fontSize: 14,
                        paddingLeft: 12, cursor: 'pointer',
                        colorScheme: isDark ? 'dark' : 'light', outline: 'none',
                      } as any,
                    },
                    bancosLista.map((b) => createElement('option', { key: b, value: b }, b)),
                  )
                  : (
                    <Pressable
                      onPress={() => setBancoMenu(true)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: T.glassBorder,
                        backgroundColor: T.card,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                      }}>
                      <Text style={{ fontFamily: Font.manrope600, fontSize: 14, color: T.textPrimary, flex: 1 }} numberOfLines={1}>
                        {banco}
                      </Text>
                      <Text style={{ color: T.textMuted, fontSize: 10 }}>▾</Text>
                    </Pressable>
                  )}
              </View>
            </View>

            {/* ─── SECCIÓN: ¿Cómo te sentís? ─── */}
            <Divider T={T} />
            <SectionLabel label="¿CÓMO TE SENTÍS?" color={T.textMuted} />
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, paddingBottom: 0 }}>
              {EMOCIONES.map((item) => {
                const active = mood === item.key;
                return (
                  <Pressable
                    key={String(item.key)}
                    onPress={() => setMood(item.key)}
                    style={{
                      alignItems: 'center',
                      paddingHorizontal: 7,
                      paddingVertical: 5,
                      borderRadius: 12,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? T.primary : T.glassBorder,
                      backgroundColor: active ? T.primaryBg : T.card,
                      minWidth: 48,
                    }}>
                    <Text style={{ fontSize: 18 }}>{item.emoji}</Text>
                    <Text
                      style={{
                        fontFamily: Font.manrope500,
                        fontSize: 8,
                        marginTop: 2,
                        color: active ? T.primary : T.textMuted,
                      }}
                      numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ─── SECCIÓN: ¿Es esencial? ─── */}
            <Divider T={T} />
            <SectionLabel label="¿ES UN GASTO ESENCIAL?" color={T.textMuted} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { key: true, label: 'Esencial', emoji: '🔒' },
                { key: false, label: 'No esencial', emoji: '🎈' },
              ] as const).map((opt) => {
                const active = esEsencial === opt.key;
                return (
                  <Pressable
                    key={String(opt.key)}
                    onPress={() => setEsEsencial(opt.key)}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? T.primary : T.glassBorder,
                      backgroundColor: active ? T.primaryBg : T.card,
                    }}>
                    <Text style={{ fontSize: 14 }}>{opt.emoji}</Text>
                    <Text style={{
                      fontFamily: Font.manrope600,
                      fontSize: 12,
                      color: active ? T.primary : T.textSecondary,
                    }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ─── SECCIÓN: Nota ─── */}
            <Divider T={T} />
            <SectionLabel label="NOTA OPCIONAL" color={T.textMuted} />
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder="Añade un detalle..."
              placeholderTextColor={T.textMuted}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.glassBorder,
                backgroundColor: T.card,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 14,
                color: T.textPrimary,
                fontFamily: Font.manrope400,
                minHeight: 38,
              }}
            />

          </ScrollView>

          {/* ── 5. Footer con botón guardar ── */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: T.glassBorder,
              backgroundColor: T.surface,
              paddingHorizontal: 16,
              paddingTop: 6,
              paddingBottom: Math.max(insets.bottom, 10),
            }}>
            <View style={{ minHeight: 18, position: 'relative', marginBottom: 4 }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute', left: 0, right: 0, bottom: 4,
                  alignItems: 'center', opacity: xpOpacity,
                  transform: [{ translateY: xpTranslate }],
                }}>
                <Text style={{ fontFamily: Font.jakarta700, fontSize: 15, color: T.tertiary }}>+10 XP ✨</Text>
              </Animated.View>
            </View>

            <Pressable
              onPress={onSave}
              style={{
                borderRadius: 18,
                overflow: 'hidden',
                shadowColor: T.shadowPrimary,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 1,
                shadowRadius: 28,
                elevation: 14,
              }}>
              <GradientView
                colors={T.primaryGrad}
                style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: Font.jakarta700, fontSize: 15, color: onPrimaryGradient.text, letterSpacing: 0.5 }}>
                  GUARDAR GASTO
                </Text>
              </GradientView>
            </Pressable>
          </View>

          {/* ── Pickers ── */}
          <BottomPickerModal
            visible={medioMenu}
            items={medios.map((m) => m.nombre)}
            selected={medio}
            onSelect={(v) => { setMedio(v); setMedioMenu(false); }}
            onClose={() => setMedioMenu(false)}
            insets={insets.bottom}
            T={T}
          />
          <BottomPickerModal
            visible={bancoMenu}
            items={bancosLista}
            selected={banco}
            onSelect={(v) => { setBanco(v); setBancoMenu(false); }}
            onClose={() => setBancoMenu(false)}
            insets={insets.bottom}
            T={T}
          />
        </AnimatedRN.View>
      </View>
    </Modal>
  );
}

/* ─── Shared sub-components ─────────────── */

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        fontFamily: Font.manrope600,
        fontSize: 10,
        letterSpacing: 2,
        color,
        marginBottom: 6,
      }}>
      {label}
    </Text>
  );
}

function Divider({ T }: { T: ReturnType<typeof useTheme>['T'] }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: T.glassBorder,
        marginVertical: 6,
        marginHorizontal: -2,
      }}
    />
  );
}

function BottomPickerModal({
  visible, items, selected, onSelect, onClose, insets, T,
}: {
  visible: boolean;
  items: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  insets: number;
  T: ReturnType<typeof useTheme>['T'];
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,9,24,0.6)' }}
        onPress={onClose}>
        <Pressable
          style={{
            marginHorizontal: 10,
            marginBottom: Math.max(insets + 10, 22),
            borderRadius: 22,
            borderWidth: 1,
            borderColor: T.glassBorder,
            backgroundColor: T.surface,
            overflow: 'hidden',
          }}
          onPress={(e) => e.stopPropagation()}>
          <GradientView colors={T.primaryGrad} style={{ height: 3 }} />
          <FlatList
            data={items}
            keyExtractor={(item) => item}
            renderItem={({ item, index }) => (
              <Pressable
                onPress={() => onSelect(item)}
                style={{
                  paddingVertical: 15,
                  paddingHorizontal: 18,
                  borderBottomWidth: index < items.length - 1 ? 1 : 0,
                  borderBottomColor: T.glassBorder,
                  backgroundColor: selected === item ? T.primaryBg : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Text
                  style={{
                    fontFamily: Font.manrope500,
                    fontSize: 15,
                    color: selected === item ? T.primary : T.textPrimary,
                  }}>
                  {item}
                </Text>
                {selected === item && (
                  <Text style={{ fontSize: 14, color: T.primary }}>✓</Text>
                )}
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
