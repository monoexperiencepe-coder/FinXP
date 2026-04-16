import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientView } from '@/components/ui/GradientView';
import { modalOverlayScrim, onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { formatSpanishLongDate } from '@/lib/formatSpanishDate';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { IncomeFrecuencia, IncomeTipo, MonedaCode } from '@/types';

const BANCOS = ['BCP', 'BBVA', 'Interbank', 'Scotiabank', 'Diners Club', 'CMR', 'PayPal', 'Otro'] as const;
const FUENTES = ['Empresa', 'Cliente', 'Plataformas', 'Amigos', 'Familia'] as const;
const TIPOS: IncomeTipo[] = ['Fijo', 'Variable', 'Extraordinario'];
const OBJETIVOS = ['Ahorro', 'Inversión', 'Viaje', 'Pago de deuda'] as const;
const FRECUENCIAS: IncomeFrecuencia[] = ['Diaria', 'Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual'];
const CATEGORIAS = ['Sueldo', 'Inversiones', 'Préstamos', 'Ventas', 'Transferencias', 'Contenido', 'Otros'] as const;

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

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { T } = useTheme();
  return (
    <Pressable onPress={onPress}>
      {active ? (
        <GradientView colors={T.primaryGrad} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontFamily: Font.manrope600, fontSize: 14, color: onPrimaryGradient.text }}>{label}</Text>
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
          <Text style={{ fontFamily: Font.manrope500, fontSize: 14, color: T.textMuted }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function IncomeSheet({ open, onDismiss }: Props) {
  const { T, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const addIncomeToSupabase = useFinanceStore((s) => s.addIncomeToSupabase);
  const monedaPrincipal = useFinanceStore((s) => s.profile.monedaPrincipal);

  const [isVisible, setIsVisible] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [moneda, setMoneda] = useState<MonedaCode>('PEN');
  const [fuente, setFuente] = useState<string>(FUENTES[0]);
  const [tipo, setTipo] = useState<IncomeTipo>(TIPOS[0]);
  const [objetivo, setObjetivo] = useState<string>(OBJETIVOS[0]);
  const [frecuencia, setFrecuencia] = useState<IncomeFrecuencia>('Mensual');
  const [banco, setBanco] = useState<string>(BANCOS[0]);
  const [bancoMenu, setBancoMenu] = useState(false);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS[0]);
  const [descripcion, setDescripcion] = useState('');

  const translateY = useRef(new Animated.Value(560)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setIsVisible(true);
      setMoneda(monedaPrincipal);
      setDate(new Date());
      setAmount('');
      setFuente(FUENTES[0]);
      setTipo(TIPOS[0]);
      setObjetivo(OBJETIVOS[0]);
      setFrecuencia('Mensual');
      setBanco(BANCOS[0]);
      setCategoria(CATEGORIAS[0]);
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
  }, [backdropOpacity, isVisible, monedaPrincipal, onDismiss, open, translateY]);

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
    if (Platform.OS === 'web') {
      Alert.alert('Fecha', 'En web usá el campo YYYY-MM-DD.');
      return;
    }
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        onChange: (_event, selectedDate) => {
          if (selectedDate) setDate(selectedDate);
        },
      });
      return;
    }
    setShowIosPicker((v) => !v);
  };

  const dateLabel = useMemo(() => formatSpanishLongDate(date), [date]);
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
    try {
      await addIncomeToSupabase({
        fecha: date.toISOString(),
        importe: value,
        moneda,
        fuente,
        tipo,
        objetivo,
        frecuencia,
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
            <Text
              style={{
                fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8,
              }}>
              FECHA
            </Text>
            <Pressable onPress={openDatePicker} className="rounded-xl border border-border bg-bg px-4 py-3">
              <Text className="text-base text-text">{dateLabel}</Text>
            </Pressable>
            {Platform.OS === 'web' ? (
              <TextInput
                value={toDateKeyLocal(date)}
                onChangeText={(t) => {
                  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.trim());
                  if (!m) return;
                  const y = Number(m[1]);
                  const mo = Number(m[2]);
                  const d = Number(m[3]);
                  const next = new Date(y, mo - 1, d);
                  if (!Number.isNaN(+next)) setDate(next);
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={T.textMuted}
                className="mt-2 rounded-xl border border-border bg-bg px-4 py-2 text-sm text-text"
                style={Platform.OS === 'web' ? { fontFamily: 'monospace' } : undefined}
              />
            ) : null}
            {Platform.OS === 'ios' && showIosPicker ? (
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_event, selectedDate) => {
                  if (selectedDate) setDate(selectedDate);
                }}
              />
            ) : null}

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>MONTO</Text>
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

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>FUENTE</Text>
            <View className="flex-row flex-wrap gap-2">
              {FUENTES.map((item) => (
                <Pill key={item} label={item} active={fuente === item} onPress={() => setFuente(item)} />
              ))}
            </View>

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>TIPO</Text>
            <View className="flex-row flex-wrap gap-2">
              {TIPOS.map((item) => (
                <Pill key={item} label={item} active={tipo === item} onPress={() => setTipo(item)} />
              ))}
            </View>

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>OBJETIVO</Text>
            <View className="flex-row flex-wrap gap-2">
              {OBJETIVOS.map((item) => (
                <Pill key={item} label={item} active={objetivo === item} onPress={() => setObjetivo(item)} />
              ))}
            </View>

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>
              FRECUENCIA
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {FRECUENCIAS.map((item) => (
                <Pill key={item} label={item} active={frecuencia === item} onPress={() => setFrecuencia(item)} />
              ))}
            </View>

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>BANCO</Text>
            <Pressable
              onPress={() => setBancoMenu(true)}
              className="flex-row items-center justify-between rounded-xl border border-border bg-bg px-4 py-3">
              <Text className="text-base text-text">{banco}</Text>
              <Text className="text-muted">▾</Text>
            </Pressable>

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>CATEGORÍA</Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIAS.map((item) => (
                <Pill key={item} label={item} active={categoria === item} onPress={() => setCategoria(item)} />
              ))}
            </View>

            <View style={{ height: 24 }} />
            <Text style={{ fontFamily: Font.manrope600,
                color: T.textMuted,
                fontSize: 11,
                letterSpacing: 2,
                marginBottom: 8 }}>
              DESCRIPCIÓN
            </Text>
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
                  data={[...BANCOS]}
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
