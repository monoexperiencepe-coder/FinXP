import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
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
import { ScrollView } from 'react-native-gesture-handler';

import { onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { GradientView } from '@/components/ui/GradientView';
import { useTheme } from '@/hooks/useTheme';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { EstadoDeAnimo, MonedaCode } from '@/types';
import { DEFAULT_METODOS_DE_PAGO } from '@/types';

const SECTION = 24;
const SPRING_OPEN = { damping: 26, stiffness: 280 } as const;
const SPRING_CLOSE = { damping: 28, stiffness: 260 } as const;

const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'Diners Club', 'CMR', 'PayPal', 'Otro'] as const;

const EMOCIONES: { key: EstadoDeAnimo | null; label: string; emoji: string }[] = [
  { key: null, label: 'Ninguno', emoji: '⬜' },
  { key: 'CONTENTO', label: 'Contento', emoji: '😊' },
  { key: 'NEUTRAL', label: 'Neutral', emoji: '😐' },
  { key: 'PREOCUPADO', label: 'Preocupado', emoji: '😟' },
  { key: 'MOLESTO', label: 'Molesto', emoji: '😠' },
  { key: 'TRISTE', label: 'Triste', emoji: '😢' },
  { key: 'ANSIOSO', label: 'Ansioso', emoji: '😰' },
  { key: 'ESTRESADO', label: 'Estresado', emoji: '🤯' },
];

const styles = StyleSheet.create({
  sectionLabel: {
    fontFamily: Font.manrope600,
    fontSize: 11,
    letterSpacing: 2,
  },
});

function toDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fechaKeyToDate(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return new Date();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

type Props = {
  open: boolean;
  onDismiss: () => void;
};

type FieldError = 'amount' | 'category' | 'mood' | null;

function useShake() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const trigger = useCallback(() => {
    x.value = withSequence(
      withTiming(-10, { duration: 45, easing: Easing.linear }),
      withTiming(10, { duration: 45, easing: Easing.linear }),
      withTiming(-8, { duration: 45, easing: Easing.linear }),
      withTiming(8, { duration: 45, easing: Easing.linear }),
      withTiming(0, { duration: 45, easing: Easing.linear }),
    );
  }, [x]);
  return { style, trigger };
}

function CategoryCell({
  emoji,
  name,
  selected,
  onPress,
}: {
  emoji: string;
  name: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { T } = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(selected ? 1.05 : 1, { damping: 15, stiffness: 220 });
  }, [scale, selected]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable style={{ width: '33.333%', padding: 4 }} onPress={onPress}>
      <AnimatedRN.View
        style={[
          anim,
          {
            borderWidth: 2,
            borderColor: selected ? T.primary : T.glassBorder,
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 6,
            backgroundColor: selected ? T.primaryBg : T.card,
            minHeight: 88,
            justifyContent: 'center',
          },
        ]}>
        <Text style={{ textAlign: 'center', fontSize: 24 }}>{emoji}</Text>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: Font.manrope500,
            fontSize: 11,
            marginTop: 4,
            textAlign: 'center',
            lineHeight: 14,
            color: T.textSecondary,
          }}>
          {name}
        </Text>
      </AnimatedRN.View>
    </Pressable>
  );
}

function MoodCell({
  emoji,
  label,
  selected,
  onSelect,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { T } = useTheme();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(selected ? 1.3 : 1, { damping: 14, stiffness: 200 });
  }, [scale, selected]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable style={{ width: '25%', padding: 4 }} onPress={onSelect}>
      <AnimatedRN.View
        style={[
          anim,
          {
            borderRadius: 12,
            paddingVertical: 8,
            backgroundColor: selected ? T.primaryBg : 'transparent',
            borderWidth: selected ? 1 : 0,
            borderColor: selected ? T.primaryBorder : 'transparent',
            alignItems: 'center',
          },
        ]}>
        <Text style={{ fontSize: 24 }}>{emoji}</Text>
        <Text
          numberOfLines={2}
          style={{
            marginTop: 4,
            paddingHorizontal: 2,
            textAlign: 'center',
            fontSize: 9,
            color: T.textSecondary,
          }}>
          {label}
        </Text>
      </AnimatedRN.View>
    </Pressable>
  );
}

export function ExpenseFullSheet({ open, onDismiss }: Props) {
  const { T, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const addExpenseToSupabase = useFinanceStore((s) => s.addExpenseToSupabase);
  const categories = useFinanceStore((s) => s.categories);
  const profile = useFinanceStore((s) => s.profile);

  const [isVisible, setIsVisible] = useState(false);

  const sheetWidth = Math.min(width, 390);
  const sheetHeight = Math.min(Math.round(height * 0.88), 744);
  /** Desplazamiento para ocultar el sheet por completo */
  const snap = sheetHeight;

  const translateY = useSharedValue(snap);
  const backdropOpacity = useSharedValue(0);
  const dragStartY = useSharedValue(0);

  const prevOpen = useRef(false);

  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const [moneda, setMoneda] = useState<MonedaCode>(profile.monedaPrincipal);
  const [categoria, setCategoria] = useState<string>(categories[0]?.nombre ?? '');
  const [mood, setMood] = useState<EstadoDeAnimo | null>(null);
  const mediosNombres = useMemo(() => {
    const list = (profile.metodosDePago ?? []).map((m) => m.nombre);
    return list.length > 0 ? list : DEFAULT_METODOS_DE_PAGO.map((m) => m.nombre);
  }, [profile.metodosDePago]);
  const [medio, setMedio] = useState<string>(() => mediosNombres[0] ?? 'Efectivo');
  const [banco, setBanco] = useState<string>(BANCOS[0]);
  const [bancoMenu, setBancoMenu] = useState(false);
  const [nota, setNota] = useState('');

  const [fieldError, setFieldError] = useState<FieldError>(null);
  const errorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const amountShake = useShake();
  const categoryShake = useShake();
  const moodShake = useShake();

  const xpOpacity = useRef(new Animated.Value(0)).current;
  const xpTranslate = useRef(new Animated.Value(0)).current;
  const amountRef = useRef<TextInput>(null);

  useEffect(() => {
    if (open) {
      setIsVisible(true);
    }
  }, [open]);

  const finishClose = useCallback(() => {
    setIsVisible(false);
    onDismiss();
  }, [onDismiss]);

  const closeSheet = useCallback(() => {
    translateY.value = withSpring(snap, SPRING_CLOSE, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: 220 });
  }, [backdropOpacity, finishClose, snap, translateY]);

  const openSheet = useCallback(() => {
    translateY.value = snap;
    backdropOpacity.value = 0;
    translateY.value = withSpring(0, SPRING_OPEN);
    backdropOpacity.value = withTiming(0.55, { duration: 260 });
  }, [backdropOpacity, snap, translateY]);

  useEffect(() => {
    const becameOpen = open && !prevOpen.current;
    prevOpen.current = open;
    if (!becameOpen) return;
    setMoneda(profile.monedaPrincipal);
    setCategoria(categories[0]?.nombre ?? '');
    setMood(null);
    setMedio(mediosNombres[0] ?? 'Efectivo');
    setBanco(BANCOS[0]);
    setNota('');
    setAmount('');
    setFecha(new Date().toISOString().split('T')[0]);
    setFieldError(null);
    requestAnimationFrame(() => openSheet());
  }, [open, openSheet, profile.monedaPrincipal, categories, mediosNombres]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-20, 20])
    .onStart(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      translateY.value = next < 0 ? 0 : next;
    })
    .onEnd((e) => {
      const closeThreshold = snap * 0.22;
      if (translateY.value > closeThreshold || e.velocityY > 900) {
        translateY.value = withSpring(snap, SPRING_CLOSE, (finished) => {
          if (finished) runOnJS(finishClose)();
        });
        backdropOpacity.value = withTiming(0, { duration: 220 });
      } else {
        translateY.value = withSpring(0, SPRING_OPEN);
      }
    });

  const onBackdropPress = () => {
    closeSheet();
  };

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaKeyToDate(fecha),
        mode: 'date',
        onChange: (_ev, d) => {
          if (d) setFecha(toDateKeyLocal(d));
        },
      });
    } else {
      setShowIosPicker((s) => !s);
    }
  };

  const flashError = (field: FieldError) => {
    if (errorClearRef.current) clearTimeout(errorClearRef.current);
    setFieldError(field);
    errorClearRef.current = setTimeout(() => setFieldError(null), 2200);
  };

  const playXpBurst = () =>
    new Promise<void>((resolve) => {
      xpOpacity.setValue(0);
      xpTranslate.setValue(0);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(xpOpacity, { toValue: 1, duration: 140, useNativeDriver: true }),
          Animated.spring(xpTranslate, { toValue: -56, useNativeDriver: true, friction: 8, tension: 90 }),
        ]),
        Animated.timing(xpOpacity, { toValue: 0, duration: 380, delay: 100, useNativeDriver: true }),
      ]).start(() => resolve());
    });

  const onSave = async () => {
    const normalized = amount.replace(',', '.').trim();
    const value = Number(normalized);
    if (!normalized || Number.isNaN(value) || value <= 0) {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      amountShake.trigger();
      flashError('amount');
      return;
    }
    if (!categoria) {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      categoryShake.trigger();
      flashError('category');
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const fd = fechaKeyToDate(fecha);
    const fechaIso = new Date(fd.getFullYear(), fd.getMonth(), fd.getDate(), 12, 0, 0, 0).toISOString();
    try {
      await addExpenseToSupabase({
        categoria,
        importe: value,
        estadoDeAnimo: mood,
        descripcion: nota.trim(),
        fecha: fechaIso,
        medioDePago: medio,
        banco,
        moneda,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar el gasto';
      Alert.alert('Error', msg);
      return;
    }

    await playXpBurst();
    closeSheet();
  };

  const onVoicePress = () => {
    Alert.alert('Próximamente', 'Registro por voz estará disponible muy pronto 🎙️');
  };

  const symbol = moneda === 'PEN' ? 'S/' : '$';

  if (!open && !isVisible) {
    return null;
  }

  return (
    <Modal
      visible={open || isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}>
      <View
        style={{ flex: 1, justifyContent: 'flex-end' }}
        pointerEvents={open ? 'auto' : 'none'}>
        <Pressable
          style={{ flex: 1 }}
          pointerEvents={open ? 'auto' : 'none'}
          onPress={onBackdropPress}>
          <AnimatedRN.View
            pointerEvents={open ? 'auto' : 'none'}
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                backgroundColor: 'rgba(57,38,76,0.4)',
              },
              backdropStyle,
            ]}
          />
        </Pressable>

        <AnimatedRN.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            sheetStyle,
            {
              width: sheetWidth,
              alignSelf: 'center',
              height: sheetHeight,
              backgroundColor: T.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: 'hidden',
              flexDirection: 'column',
            },
          ]}>
          <GestureDetector gesture={pan}>
            <View className="items-center justify-start pt-3" style={{ minHeight: 56 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: T.primaryBorder }} />
              <Text style={{ color: T.textMuted, fontSize: 10, marginTop: 6 }}>Deslizá hacia abajo para cerrar</Text>
            </View>
          </GestureDetector>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 12,
            }}
            style={{ flex: 1 }}>
            {Platform.OS === 'web' ? (
              <View style={{ gap: 6 }}>
                <Text style={[styles.sectionLabel, { color: T.textMuted }]}>FECHA</Text>
                <View
                  style={{
                    backgroundColor: T.surface,
                    borderColor: T.glassBorder,
                    borderWidth: 1,
                    borderRadius: 12,
                    height: 52,
                    overflow: 'hidden',
                    justifyContent: 'center',
                  }}>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e: any) => setFecha(e.target.value)}
                    style={
                      {
                        width: '100%',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: T.textPrimary,
                        fontSize: 15,
                        paddingLeft: 16,
                        paddingRight: 16,
                        cursor: 'pointer',
                        colorScheme: isDark ? 'dark' : 'light',
                      } as any
                    }
                  />
                </View>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                <Text style={[styles.sectionLabel, { color: T.textMuted }]}>FECHA</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor: T.surface,
                    borderColor: T.glassBorder,
                    justifyContent: 'center',
                  }}
                  onPress={openDatePicker}>
                  <Text style={{ color: T.textPrimary, fontSize: 15 }}>
                    {fecha
                      ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-PE', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'Seleccionar fecha'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {Platform.OS === 'ios' && showIosPicker ? (
              <DateTimePicker
                value={fechaKeyToDate(fecha)}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => {
                  if (d) setFecha(toDateKeyLocal(d));
                }}
              />
            ) : null}

            <View style={{ height: SECTION }} />

            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>MONTO</Text>
            <AnimatedRN.View style={amountShake.style}>
              <Pressable
                onPress={() => amountRef.current?.focus()}
                className="flex-row items-center justify-center rounded-2xl border-2 bg-bg px-3 py-3"
                style={{
                  borderColor: fieldError === 'amount' ? T.error : amountFocused ? T.primary : T.glassBorder,
                }}>
                <Text style={{ marginRight: 4, fontSize: 28, fontWeight: '600', color: T.textPrimary }}>{symbol}</Text>
                <TextInput
                  ref={amountRef}
                  value={amount}
                  onChangeText={setAmount}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  placeholder="0.00"
                  placeholderTextColor={T.textMuted}
                  keyboardType="numeric"
                  className="min-w-[100px] flex-1 text-center text-[28px] font-semibold"
                  style={{ fontSize: 28, paddingVertical: 4, color: T.textPrimary, fontWeight: '600' }}
                />
              </Pressable>
            </AnimatedRN.View>

            <View style={{ height: SECTION }} />

            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>MONEDA</Text>
            <View
              style={{
                flexDirection: 'row',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: T.glassBorder,
                padding: 4,
                backgroundColor: T.card,
              }}>
              {(['PEN', 'USD'] as const).map((m) => {
                const active = moneda === m;
                return (
                  <Pressable key={m} onPress={() => setMoneda(m)} style={{ flex: 1 }}>
                    {active ? (
                      <GradientView colors={T.primaryGrad} style={{ borderRadius: 999, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ fontFamily: Font.jakarta600, fontSize: 14, color: onPrimaryGradient.text }}>{m}</Text>
                      </GradientView>
                    ) : (
                      <View style={{ borderRadius: 999, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ fontFamily: Font.manrope500, fontSize: 14, color: T.textMuted }}>{m}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: SECTION }} />

            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>
              CATEGORÍA
            </Text>
            <AnimatedRN.View
              style={[
                categoryShake.style,
                fieldError === 'category'
                  ? { borderWidth: 2, borderColor: T.error, borderRadius: 12, padding: 4 }
                  : undefined,
              ]}>
              <View className="flex-row flex-wrap">
                {categories.map((cat) => (
                  <CategoryCell
                    key={cat.id}
                    emoji={cat.emoji}
                    name={cat.nombre}
                    selected={categoria === cat.nombre}
                    onPress={() => setCategoria(cat.nombre)}
                  />
                ))}
              </View>
            </AnimatedRN.View>

            <View style={{ height: SECTION }} />

            <Text style={[styles.sectionLabel, { color: T.textMuted, marginBottom: 8 }]}>¿CÓMO TE SIENTES?</Text>
            <AnimatedRN.View style={moodShake.style}>
              <View className="flex-row flex-wrap">
                {EMOCIONES.map((item) => (
                  <MoodCell
                    key={String(item.key)}
                    emoji={item.emoji}
                    label={item.label}
                    selected={mood === item.key}
                    onSelect={() => setMood(item.key)}
                  />
                ))}
              </View>
            </AnimatedRN.View>

            <View style={{ height: SECTION }} />

            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>
              MEDIO DE PAGO
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(profile.metodosDePago?.length ? profile.metodosDePago : DEFAULT_METODOS_DE_PAGO).map((m) => {
                const nombre = m.nombre;
                const active = medio === nombre;
                return (
                  <Pressable key={m.id} onPress={() => setMedio(nombre)}>
                    {active ? (
                      <GradientView colors={T.primaryGrad} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Text style={{ fontFamily: Font.manrope600, fontSize: 14, color: onPrimaryGradient.text }}>{nombre}</Text>
                      </GradientView>
                    ) : (
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          backgroundColor: T.card,
                          borderWidth: 1,
                          borderColor: T.glassBorder,
                        }}>
                        <Text style={{ fontFamily: Font.manrope500, fontSize: 14, color: T.textMuted }}>{nombre}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View style={{ height: SECTION }} />

            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>BANCO</Text>
            <Pressable
              onPress={() => setBancoMenu(true)}
              className="flex-row items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
              <Text style={{ fontSize: 16, color: T.textPrimary }}>{banco}</Text>
              <Text style={{ color: T.textMuted }}>▾</Text>
            </Pressable>

            <View style={{ height: SECTION }} />

            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>NOTA</Text>
            <TextInput
              value={nota}
              onChangeText={setNota}
              placeholder="Añade un detalle..."
              placeholderTextColor={T.textMuted}
              multiline
              className="min-h-[88px] rounded-xl border border-border bg-bg px-4 py-3 text-base"
              style={{ color: T.textPrimary }}
              textAlignVertical="top"
            />

            <View style={{ height: SECTION }} />

            <Pressable
              onPress={onVoicePress}
              className="items-center rounded-xl border border-border bg-bg py-3 opacity-40 active:opacity-50">
              <Text className="text-xl">🎙️</Text>
              <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 12, color: T.textSecondary }}>
                Registro por voz — Próximamente
              </Text>
            </Pressable>

            <View style={{ height: 16 }} />
          </ScrollView>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: T.glassBorder,
              backgroundColor: T.surface,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
            }}>
            <View className="relative mb-2" style={{ minHeight: 28 }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 8,
                  alignItems: 'center',
                  opacity: xpOpacity,
                  transform: [{ translateY: xpTranslate }],
                }}>
                <Text className="text-lg font-bold text-accent">+10 XP ✨</Text>
              </Animated.View>
            </View>
            <Pressable
              onPress={onSave}
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                shadowColor: T.shadowPrimary,
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 1,
                shadowRadius: 32,
                elevation: 16,
              }}>
              <GradientView colors={T.primaryGrad} style={{ height: 56, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: Font.jakarta700, fontSize: 17, color: onPrimaryGradient.text }}>GUARDAR GASTO</Text>
              </GradientView>
            </Pressable>
          </View>

          <Modal visible={bancoMenu} transparent animationType="fade" onRequestClose={() => setBancoMenu(false)}>
            <Pressable className="flex-1 justify-end " onPress={() => setBancoMenu(false)}>
              <Pressable
                className="mx-4 mb-8 rounded-2xl border border-border bg-bg p-2"
                onPress={(e) => e.stopPropagation()}>
                <FlatList
                  data={[...BANCOS]}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setBanco(item);
                        setBancoMenu(false);
                      }}
                      className="border-b border-border py-3 pl-3 active:bg-card">
                      <Text style={{ fontSize: 16, color: T.textPrimary }}>{item}</Text>
                    </Pressable>
                  )}
                />
              </Pressable>
            </Pressable>
          </Modal>
        </AnimatedRN.View>
      </View>
    </Modal>
  );
}
