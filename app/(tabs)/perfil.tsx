import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Font } from '@/constants/typography';
import { avatarRingBorder, logoutRowStyle, modalOverlayScrim, onPrimaryGradient } from '@/constants/theme';
import { GradientView } from '@/components/ui/GradientView';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/lib/currency';
import { useFinanceStore } from '@/store/useFinanceStore';
import { DEFAULT_METODOS_DE_PAGO } from '@/types';

function NombreInlineEditor({
  nombreDraft,
  setNombreDraft,
  onCommit,
}: {
  nombreDraft: string;
  setNombreDraft: (v: string) => void;
  onCommit: () => void;
}) {
  const { T } = useTheme();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Text style={{ color: T.textSecondary, fontSize: 12, marginBottom: 6 }}>Mi nombre</Text>
      {editing ? (
        <TextInput
          value={nombreDraft}
          onChangeText={setNombreDraft}
          onBlur={() => {
            onCommit();
            setEditing(false);
          }}
          onSubmitEditing={() => {
            onCommit();
            setEditing(false);
          }}
          autoFocus
          placeholder="Tu nombre"
          placeholderTextColor={T.textMuted}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: T.primary,
            backgroundColor: T.card,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: T.textPrimary,
            fontSize: 15,
          }}
        />
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: T.glassBorder,
            backgroundColor: T.card,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}>
          <Text style={{ color: T.textPrimary, fontSize: 15 }}>{nombreDraft || 'Toca para editar'}</Text>
        </Pressable>
      )}
    </>
  );
}

function AccordionSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { T } = useTheme();
  const open = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(open, {
      toValue: expanded ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [expanded, open]);

  const maxHeight = open.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 3200],
  });

  const rotate = open.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={{
        marginBottom: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: T.glassBorder,
        backgroundColor: T.card,
        overflow: 'hidden',
        shadowColor: T.shadowCard,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 24,
        elevation: 12,
      }}>
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 14,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: T.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontSize: 18 }}>{icon}</Text>
          </View>
          <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 15 }}>{title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Text style={{ color: T.textMuted, fontSize: 12 }}>▼</Text>
        </Animated.View>
      </Pressable>
      <Animated.View style={{ maxHeight, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, backgroundColor: T.cardElevated }}>{children}</View>
      </Animated.View>
    </View>
  );
}

export default function PerfilScreen() {
  const { T, isDark } = useTheme();
  const profile = useFinanceStore((s) => s.profile);
  const missions = useFinanceStore((s) => s.missions);
  const fixedExpenses = useFinanceStore((s) => s.fixedExpenses);
  const creditCards = useFinanceStore((s) => s.creditCards);
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);

  const setNombreUsuario = useFinanceStore((s) => s.setNombreUsuario);
  const setMonedaPrincipal = useFinanceStore((s) => s.setMonedaPrincipal);
  const setTipoDeCambio = useFinanceStore((s) => s.setTipoDeCambio);
  const addFixedExpense = useFinanceStore((s) => s.addFixedExpense);
  const updateFixedExpense = useFinanceStore((s) => s.updateFixedExpense);
  const addCreditCard = useFinanceStore((s) => s.addCreditCard);
  const updateCreditCard = useFinanceStore((s) => s.updateCreditCard);
  const setBudgetCategoryLimit = useFinanceStore((s) => s.setBudgetCategoryLimit);
  const updateMetodoDePago = useFinanceStore((s) => s.updateMetodoDePago);
  const addMetodoDePago = useFinanceStore((s) => s.addMetodoDePago);
  const removeMetodoDePago = useFinanceStore((s) => s.removeMetodoDePago);
  const toggleTheme = useFinanceStore((s) => s.toggleTheme);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const removeCategory = useFinanceStore((s) => s.removeCategory);

  const [openSection, setOpenSection] = useState<string | null>('cuenta');
  const [nombreDraft, setNombreDraft] = useState(profile.nombreUsuario);
  const [tipoCambioDraft, setTipoCambioDraft] = useState(String(profile.tipoDeCambio));
  const [addMetodoOpen, setAddMetodoOpen] = useState(false);
  const [newMetodoDraft, setNewMetodoDraft] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  useEffect(() => {
    setNombreDraft(profile.nombreUsuario);
  }, [profile.nombreUsuario]);

  useEffect(() => {
    setTipoCambioDraft(String(profile.tipoDeCambio));
  }, [profile.tipoDeCambio]);

  const initial = useMemo(
    () => profile.nombreUsuario.trim().charAt(0).toUpperCase() || '?',
    [profile.nombreUsuario],
  );

  const misionesCompletadas = useMemo(() => missions.filter((m) => m.completada).length, [missions]);
  const xpTotalDisplay = useMemo(
    () => profile.xpActual + misionesCompletadas * 30,
    [misionesCompletadas, profile.xpActual],
  );

  const totalFijos = useMemo(
    () => fixedExpenses.reduce((s, f) => s + f.montoMensual, 0),
    [fixedExpenses],
  );

  const toggleSection = useCallback((id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  const onBlurTipoCambio = useCallback(() => {
    const n = Number(tipoCambioDraft.replace(',', '.'));
    if (!Number.isNaN(n) && n > 0) setTipoDeCambio(n);
    else setTipoCambioDraft(String(profile.tipoDeCambio));
  }, [profile.tipoDeCambio, setTipoDeCambio, tipoCambioDraft]);

  const onLogout = useCallback(() => {
    Alert.alert('¿Cerrar sesión?', 'Vas a salir de tu cuenta en este dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => {} },
    ]);
  }, []);

  const handleAddCategory = useCallback(async () => {
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim());
    setNewCatName('');
    setShowCatInput(false);
  }, [newCatName, addCategory]);

  const budgetByCat = useMemo(() => {
    const map: Record<string, number> = {};
    budgets.forEach((b) => {
      map[b.categoria] = b.limiteMonthly;
    });
    return map;
  }, [budgets]);

  const metodosDePagoList = useMemo(
    () => profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO,
    [profile.metodosDePago],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, maxWidth: 390, width: '100%', alignSelf: 'center' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View
              style={{
                padding: 3,
                borderRadius: 999,
                borderWidth: 3,
                borderColor: avatarRingBorder(isDark),
              }}>
              <View
                style={{
                  padding: 2,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: T.primary,
                }}>
                <GradientView
                  colors={T.primaryGrad}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 32 }}>{initial}</Text>
                </GradientView>
              </View>
            </View>

            <Text
              style={{
                fontFamily: Font.jakarta700,
                color: T.textPrimary,
                fontSize: 24,
                textAlign: 'center',
                marginTop: 12,
              }}>
              {profile.nombreUsuario}
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 }}>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: T.primaryBg,
                  borderWidth: 1,
                  borderColor: T.primary,
                }}>
                <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 11 }}>FINXP</Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: T.tertiaryBg,
                  borderWidth: 1,
                  borderColor: T.gold,
                }}>
                <Text style={{ fontFamily: Font.manrope600, color: T.gold, fontSize: 11 }}>Nivel {profile.nivel}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
              <Text style={{ fontSize: 14 }}>📍</Text>
              <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 13 }}>Mi perfil</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'racha', icon: '🔥', value: String(profile.rachaActual), label: 'Racha', suffix: 'días' },
              { key: 'xp', icon: '⚡', value: String(xpTotalDisplay), label: 'XP Total', suffix: null },
              { key: 'mis', icon: '🎯', value: String(misionesCompletadas), label: 'Misiones', suffix: null },
            ].map((item) => (
              <View
                key={item.key}
                style={{
                  flex: 1,
                  minHeight: 96,
                  backgroundColor: T.card,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: T.shadowCard,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 1,
                  shadowRadius: 24,
                  elevation: 12,
                }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: T.cardElevated,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4, gap: 4 }}>
                  <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 26 }}>{item.value}</Text>
                  {item.suffix ? (
                    <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11 }}>{item.suffix}</Text>
                  ) : null}
                </View>
                <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginTop: 4 }}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          <AccordionSection
            title="Configuración de Cuenta"
            icon="⚙️"
            expanded={openSection === 'cuenta'}
            onToggle={() => toggleSection('cuenta')}>
            <NombreInlineEditor
              nombreDraft={nombreDraft}
              setNombreDraft={setNombreDraft}
              onCommit={() => setNombreUsuario(nombreDraft)}
            />

            <View
              style={{
                marginTop: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 4,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>{isDark ? '🌙' : '☀️'}</Text>
                <Text style={{ fontFamily: Font.manrope500, color: T.textPrimary, fontSize: 15 }}>Modo oscuro</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={() => toggleTheme()}
                thumbColor={isDark ? T.primary : T.textMuted}
                trackColor={{ true: T.primaryBg, false: T.cardElevated }}
              />
            </View>

            <Text style={{ color: T.textSecondary, fontSize: 12, marginTop: 14, marginBottom: 6 }}>Moneda principal</Text>
            <View style={{ flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: T.glassBorder, padding: 4, backgroundColor: T.card }}>
              {(['PEN', 'USD'] as const).map((m) => {
                const active = profile.monedaPrincipal === m;
                return (
                  <Pressable key={m} onPress={() => setMonedaPrincipal(m)} style={{ flex: 1 }}>
                    {active ? (
                      <GradientView colors={T.primaryGrad} style={{ borderRadius: 999, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ color: onPrimaryGradient.text, fontWeight: '700', fontSize: 13 }}>{m}</Text>
                      </GradientView>
                    ) : (
                      <View style={{ borderRadius: 999, paddingVertical: 8, alignItems: 'center' }}>
                        <Text style={{ color: T.textMuted, fontWeight: '700', fontSize: 13 }}>{m}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: T.textSecondary, fontSize: 12, marginTop: 14, marginBottom: 6 }}>Tipo de cambio (PEN por USD)</Text>
            <TextInput
              value={tipoCambioDraft}
              onChangeText={setTipoCambioDraft}
              onBlur={onBlurTipoCambio}
              keyboardType="decimal-pad"
              placeholder="3.75"
              placeholderTextColor={T.textMuted}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.glassBorder,
                backgroundColor: T.card,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: T.textPrimary,
                fontSize: 15,
              }}
            />
          </AccordionSection>

          <AccordionSection
            title="Gastos Fijos"
            icon="🏠"
            expanded={openSection === 'fijos'}
            onToggle={() => toggleSection('fijos')}>
            {fixedExpenses.map((f) => (
              <View
                key={f.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 10,
                  marginBottom: 8,
                  gap: 8,
                }}>
                <TextInput
                  value={f.descripcion}
                  onChangeText={(t) => updateFixedExpense(f.id, { descripcion: t })}
                  style={{ flex: 1, color: T.textPrimary, fontSize: 14 }}
                />
                <TextInput
                  value={f.montoMensual === 0 ? '' : String(f.montoMensual)}
                  onChangeText={(t) => {
                    const n = Number(t.replace(',', '.'));
                    if (t === '' || Number.isNaN(n)) updateFixedExpense(f.id, { montoMensual: 0 });
                    else updateFixedExpense(f.id, { montoMensual: n });
                  }}
                  keyboardType="decimal-pad"
                  style={{
                    width: 88,
                    textAlign: 'right',
                    color: T.textMuted,
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: T.glassBorder,
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                  }}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 8 }}>
              <Text style={{ color: T.textSecondary, fontSize: 13 }}>Total mensual</Text>
              <Text style={{ color: T.textPrimary, fontWeight: '700' }}>{formatMoney(totalFijos, profile.monedaPrincipal)}</Text>
            </View>
            <Pressable
              onPress={addFixedExpense}
              style={{
                marginTop: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.primary,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text style={{ color: T.primary, fontWeight: '700' }}>+ Agregar gasto fijo</Text>
            </Pressable>
          </AccordionSection>

          <AccordionSection
            title="Tarjetas"
            icon="💳"
            expanded={openSection === 'tarjetas'}
            onToggle={() => toggleSection('tarjetas')}>
            {creditCards.map((c) => {
              const disponible = Math.max(0, c.lineaTotal - c.gastosMes);
              return (
                <View
                  key={c.id}
                  style={{
                    paddingVertical: 12,
                    marginBottom: 12,
                  }}>
                  <TextInput
                    value={c.nombre}
                    onChangeText={(t) => updateCreditCard(c.id, { nombre: t })}
                    style={{ color: T.textPrimary, fontSize: 15, fontWeight: '600' }}
                  />
                  <Text style={{ color: T.textSecondary, fontSize: 12, marginTop: 4 }}>
                    Línea disponible: {formatMoney(disponible, c.moneda)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
                    <Text style={{ color: T.textSecondary, fontSize: 12 }}>Límite total</Text>
                    <TextInput
                      value={c.lineaTotal === 0 ? '' : String(c.lineaTotal)}
                      onChangeText={(t) => {
                        const n = Number(t.replace(',', '.'));
                        if (t === '' || Number.isNaN(n)) updateCreditCard(c.id, { lineaTotal: 0 });
                        else updateCreditCard(c.id, { lineaTotal: n });
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={T.textMuted}
                      style={{
                        flex: 1,
                        color: T.gold,
                        fontSize: 13,
                        borderWidth: 1,
                        borderColor: T.glassBorder,
                        borderRadius: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        textAlign: 'right',
                      }}
                    />
                  </View>
                </View>
              );
            })}
            <Pressable
              onPress={addCreditCard}
              style={{
                marginTop: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.primary,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text style={{ color: T.primary, fontWeight: '700' }}>+ Agregar tarjeta</Text>
            </Pressable>
          </AccordionSection>

          <AccordionSection
            title="Presupuesto"
            icon="📊"
            expanded={openSection === 'presupuesto'}
            onToggle={() => toggleSection('presupuesto')}>
            <View style={{ gap: 10, marginTop: 12 }}>
              <Text style={[{ color: T.textSecondary, fontSize: 13, fontWeight: '600' }]}>
                Categorías de gastos
              </Text>
              {categories.map((cat) => (
                <View
                  key={cat.id}
                  style={[
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: T.surface,
                    },
                  ]}>
                  <Text style={{ fontSize: 20 }}>{cat.emoji}</Text>
                  <Text style={[{ flex: 1, color: T.textPrimary, fontSize: 14 }]}>{cat.nombre}</Text>
                  <TouchableOpacity onPress={() => void removeCategory(cat.id)}>
                    <Text style={{ color: '#FF4444', fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {showCatInput && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[
                      {
                        flex: 1,
                        height: 44,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        fontSize: 14,
                        backgroundColor: T.surface,
                        color: T.textPrimary,
                        borderWidth: 1,
                        borderColor: T.glassBorder,
                      },
                    ]}
                    placeholder="Nombre de categoría"
                    placeholderTextColor={T.textMuted}
                    value={newCatName}
                    onChangeText={setNewCatName}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[
                      {
                        height: 44,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        backgroundColor: T.primary,
                        justifyContent: 'center',
                      },
                    ]}
                    onPress={() => void handleAddCategory()}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={[
                  {
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: T.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                ]}
                onPress={() => setShowCatInput(!showCatInput)}>
                <Text style={[{ color: T.primary, fontWeight: '600', fontSize: 14 }]}>
                  {showCatInput ? 'Cancelar' : '+ Agregar categoría'}
                </Text>
              </TouchableOpacity>
            </View>
          </AccordionSection>

          <AccordionSection
            title="Métodos de Pago"
            icon="💳"
            expanded={openSection === 'metodos'}
            onToggle={() => toggleSection('metodos')}>
            {metodosDePagoList.map((m) => (
              <View
                key={m.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  marginBottom: 8,
                }}>
                <TextInput
                  value={m.nombre}
                  onChangeText={(t) => updateMetodoDePago(m.id, { nombre: t })}
                  style={{ flex: 1, color: T.textPrimary, fontSize: 14, fontFamily: Font.manrope500 }}
                />
                <Switch
                  value={m.activo}
                  onValueChange={(v) => updateMetodoDePago(m.id, { activo: v })}
                  trackColor={{ false: T.glassBorder, true: T.primaryBg }}
                  thumbColor={m.activo ? T.primary : T.textMuted}
                />
                <Pressable
                  onPress={() => {
                    if (metodosDePagoList.length <= 1) {
                      Alert.alert('No disponible', 'Debe existir al menos un método de pago.');
                      return;
                    }
                    removeMetodoDePago(m.id);
                  }}
                  hitSlop={8}
                  style={{ padding: 6 }}>
                  <Text style={{ fontSize: 18, color: T.error }}>🗑️</Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => {
                setNewMetodoDraft('');
                setAddMetodoOpen(true);
              }}
              style={{
                marginTop: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.primary,
                paddingVertical: 12,
                alignItems: 'center',
              }}>
              <Text style={{ color: T.primary, fontWeight: '700' }}>+ Agregar método</Text>
            </Pressable>
          </AccordionSection>

          <Modal visible={addMetodoOpen} transparent animationType="fade" onRequestClose={() => setAddMetodoOpen(false)}>
            <Pressable
              style={{ flex: 1, backgroundColor: modalOverlayScrim, justifyContent: 'center', padding: 24 }}
              onPress={() => setAddMetodoOpen(false)}>
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: T.surface,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  padding: 18,
                }}>
                <View style={{ alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: T.primaryBorder }} />
                </View>
                <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 16 }}>
                  Nuevo método de pago
                </Text>
                <TextInput
                  value={newMetodoDraft}
                  onChangeText={setNewMetodoDraft}
                  placeholder="Nombre (ej. Yape)"
                  placeholderTextColor={T.textMuted}
                  style={{
                    marginTop: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: T.glassBorder,
                    backgroundColor: T.card,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontFamily: Font.manrope500,
                    fontSize: 15,
                    color: T.textPrimary,
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <Pressable
                    onPress={() => setAddMetodoOpen(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: T.glassBorder,
                      alignItems: 'center',
                    }}>
                    <Text style={{ fontFamily: Font.manrope600, color: T.textMuted, fontSize: 14 }}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const t = newMetodoDraft.trim();
                      if (!t) return;
                      addMetodoDePago(t);
                      setAddMetodoOpen(false);
                      setNewMetodoDraft('');
                    }}
                    style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
                    <GradientView colors={T.primaryGrad} style={{ paddingVertical: 12, alignItems: 'center' }}>
                      <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 14 }}>Agregar</Text>
                    </GradientView>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>

          <Pressable
            style={{
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 16,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: T.primary, fontSize: 20 }}>💬</Text>
              <Text style={{ color: T.textPrimary, fontSize: 15, fontWeight: '600' }}>Soporte & Consultas</Text>
            </View>
            <Text style={{ color: T.textMuted, fontSize: 16 }}>{'>'}</Text>
          </Pressable>

          <Pressable
            onPress={onLogout}
            style={{
              marginTop: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: logoutRowStyle(isDark).backgroundColor,
              borderWidth: 1,
              borderColor: logoutRowStyle(isDark).borderColor,
              borderRadius: 16,
              paddingVertical: 14,
            }}>
            <Text style={{ fontSize: 18 }}>🚪</Text>
            <Text style={{ fontFamily: Font.jakarta600, color: T.error, fontSize: 15 }}>Cerrar Sesión</Text>
          </Pressable>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
