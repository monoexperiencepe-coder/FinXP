import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AnimatedRN, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientView } from '@/components/ui/GradientView';
import { modalOverlayScrim, onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { IncomeFrecuencia, IncomeTipo, MonedaCode } from '@/types';
import { DEFAULT_BANCOS_DISPONIBLES } from '@/types';

const DEFAULT_FUENTE = 'Otro';
const DEFAULT_TIPO: IncomeTipo = 'Variable';
const DEFAULT_OBJETIVO = 'Ahorro';
const DEFAULT_FRECUENCIA: IncomeFrecuencia = 'Mensual';

type Props = {
  open: boolean;
  onDismiss: () => void;
};

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

export function IncomeSheet({ open, onDismiss }: Props) {
  const { T, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const addIncomeToSupabase = useFinanceStore((s) => s.addIncomeToSupabase);
  const monedaPrincipal = useFinanceStore((s) => s.profile.monedaPrincipal);
  const profile = useFinanceStore((s) => s.profile);
  const incomeCategories = useFinanceStore((s) => s.incomeCategories);
  const loadIncomeCategories = useFinanceStore((s) => s.loadIncomeCategories);

  const bancosLista = useMemo(() => {
    const list = profile.bancosDisponibles;
    return list?.length ? list : DEFAULT_BANCOS_DISPONIBLES;
  }, [profile.bancosDisponibles]);

  const [isVisible, setIsVisible] = useState(false);
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [moneda, setMoneda] = useState<MonedaCode>('PEN');
  const [banco, setBanco] = useState<string>('');
  const [bancoMenu, setBancoMenu] = useState(false);
  const [categoria, setCategoria] = useState<string>('');
  const [descripcion, setDescripcion] = useState('');

  const translateY = useRef(new Animated.Value(560)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setMoneda(monedaPrincipal);
      setFecha(new Date().toISOString().split('T')[0]);
      setAmount('');
      setBanco(bancosLista[0] ?? '');
      setCategoria('');
      setDescripcion('');
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0.55, duration: 220, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 90 }),
      ]).start();
      return;
    }
    if (isVisible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 560, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          setIsVisible(false);
          onDismiss();
        }
      });
    }
  }, [backdropOpacity, bancosLista, isVisible, monedaPrincipal, onDismiss, open, translateY]);

  useEffect(() => {
    if (incomeCategories.length === 0) {
      void loadIncomeCategories();
    }
    // Intencional: solo al montar el sheet; el efecto de `open` sincroniza la categoría elegida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    if (incomeCategories.length === 0) {
      void loadIncomeCategories();
      return;
    }
    setCategoria((prev) => {
      if (prev && incomeCategories.some((c) => c.nombre === prev)) return prev;
      return incomeCategories[0]?.nombre ?? '';
    });
  }, [open, incomeCategories, loadIncomeCategories]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 560, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsVisible(false);
        onDismiss();
      }
    });
  };

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fechaKeyToDate(fecha),
        mode: 'date',
        onChange: (_event, selectedDate) => {
          if (selectedDate) setFecha(toDateKeyLocal(selectedDate));
        },
      });
      return;
    }
    setShowIosPicker((v) => !v);
  };

  const symbol = moneda === 'PEN' ? 'S/' : '$';

  const onSave = async () => {
    const normalized = amount.replace(',', '.').trim();
    const value = Number(normalized);
    if (!normalized || Number.isNaN(value) || value <= 0) {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }
    if (!categoria) {
      Alert.alert('Categoría', 'Selecciona una categoría');
      return;
    }
    if (!banco?.trim()) {
      Alert.alert('Banco', 'Selecciona un banco');
      return;
    }
    const fd = fechaKeyToDate(fecha);
    const fechaIso = new Date(fd.getFullYear(), fd.getMonth(), fd.getDate(), 12, 0, 0, 0).toISOString();
    try {
      await addIncomeToSupabase({
        fecha: fechaIso,
        importe: value,
        moneda,
        fuente: DEFAULT_FUENTE,
        tipo: DEFAULT_TIPO,
        objetivo: DEFAULT_OBJETIVO,
        frecuencia: DEFAULT_FRECUENCIA,
        banco,
        categoria,
        descripcion: descripcion.trim(),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar el ingreso';
      Alert.alert('Error', msg);
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    dismiss();
  };

  if (!open && !isVisible) return null;

  const labelStyle = {
    fontFamily: Font.manrope600,
    color: T.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  };
  const inputContainerStyle = {
    backgroundColor: T.surface,
    borderColor: T.glassBorder,
    borderWidth: 1,
    borderRadius: 12,
    height: 52,
    overflow: 'hidden' as const,
    justifyContent: 'center' as const,
  };

  return (
    <Modal transparent visible={open || isVisible} animationType="none" onRequestClose={dismiss}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={dismiss}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: modalOverlayScrim,
              opacity: backdropOpacity,
            }}
          />
        </Pressable>
        <Animated.View
          style={{
            transform: [{ translateY }],
            width: '100%',
            maxWidth: 390,
            alignSelf: 'center',
            height: '88%',
            backgroundColor: T.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: 'hidden',
          }}>
          <View className="items-center pt-3">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: T.primaryBorder }} />
            <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 10, marginTop: 6 }}>
              Deslizá hacia abajo para cerrar
            </Text>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            {Platform.OS === 'web' ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>FECHA</Text>
                <View style={inputContainerStyle}>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e: { target: { value: string } }) => setFecha(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'white',
                      fontSize: 16,
                      padding: '12px 0',
                      colorScheme: 'dark',
                    }}
                  />
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Text style={labelStyle}>FECHA</Text>
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
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setFecha(toDateKeyLocal(selectedDate));
                }}
              />
            ) : null}

            <View style={{ height: 24 }} />
            <Text style={labelStyle}>MONTO</Text>
            <View className="flex-row items-center justify-center rounded-2xl border-2 border-border bg-bg px-3 py-3">
              <Text className="mr-1 text-[28px] font-semibold text-text">{symbol}</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={T.textMuted}
                className="min-w-[100px] flex-1 text-center text-[28px] font-semibold text-text"
              />
            </View>

            <View style={{ height: 24 }} />
            <Text style={labelStyle}>MONEDA</Text>
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

            <View style={{ height: 24 }} />
            <Text style={labelStyle}>CATEGORÍA</Text>
            <View className="flex-row flex-wrap">
              {incomeCategories.map((cat) => (
                <CategoryCell
                  key={cat.id}
                  emoji={cat.emoji}
                  name={cat.nombre}
                  selected={categoria === cat.nombre}
                  onPress={() => setCategoria(cat.nombre)}
                />
              ))}
            </View>

            <View style={{ height: 24 }} />
            <Text style={labelStyle}>BANCO</Text>
            {Platform.OS === 'web' ? (
              <View style={{ marginBottom: 16 }}>
                {createElement(
                  'select',
                  {
                    value: banco,
                    onChange: (e: { target: { value: string } }) => setBanco(e.target.value),
                    style: {
                      width: '100%',
                      background: '#1A1F3E',
                      color: 'white',
                      border: '1px solid #2A3050',
                      borderRadius: 12,
                      padding: '12px',
                      fontSize: 15,
                      colorScheme: 'dark',
                    } as object,
                  },
                  createElement('option', { value: '' }, 'Selecciona un banco'),
                  ...(profile.bancosDisponibles?.length
                    ? profile.bancosDisponibles
                    : DEFAULT_BANCOS_DISPONIBLES
                  ).map((b) => createElement('option', { key: b, value: b }, b)),
                )}
              </View>
            ) : (
              <Pressable
                onPress={() => setBancoMenu(true)}
                className="flex-row items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
                <Text className="text-base text-text">{banco || 'Selecciona un banco'}</Text>
                <Text className="text-muted">▾</Text>
              </Pressable>
            )}

            <View style={{ height: 24 }} />
            <Text style={labelStyle}>DESCRIPCIÓN</Text>
            <TextInput
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Nota opcional..."
              placeholderTextColor={T.textMuted}
              className="rounded-xl border border-border bg-bg px-4 py-3 text-base text-text"
            />
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
                <Text style={{ fontFamily: Font.jakarta700, fontSize: 17, color: onPrimaryGradient.text }}>GUARDAR INGRESO</Text>
              </GradientView>
            </Pressable>
          </View>

          <Modal visible={bancoMenu} transparent animationType="fade" onRequestClose={() => setBancoMenu(false)}>
            <Pressable className="flex-1 justify-end " onPress={() => setBancoMenu(false)}>
              <Pressable
                className="mx-4 mb-8 rounded-2xl border border-border bg-bg p-2"
                onPress={(e) => e.stopPropagation()}>
                <FlatList
                  data={[...bancosLista]}
                  keyExtractor={(item) => item}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => {
                        setBanco(item);
                        setBancoMenu(false);
                      }}
                      className="border-b border-border py-3 pl-3 active:bg-card">
                      <Text className="text-base text-text">{item}</Text>
                    </Pressable>
                  )}
                />
              </Pressable>
            </Pressable>
          </Modal>
        </Animated.View>
      </View>
    </Modal>
  );
}
