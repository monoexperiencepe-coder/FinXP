import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Font } from '@/constants/typography';
import { avatarRingBorder, logoutRowStyle, onPrimaryGradient } from '@/constants/theme';
import { GradientView } from '@/components/ui/GradientView';
import { useTheme } from '@/hooks/useTheme';
import * as db from '@/lib/database';
import { currentYearMonth } from '@/lib/dates';
import { clearLastLogin, clearOnboardingLocal } from '@/lib/preferences';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';
import { DEFAULT_BANCOS_DISPONIBLES, DEFAULT_METODOS_DE_PAGO } from '@/types';
import type { AppTheme } from '@/constants/theme';

/** Switch nativo en web es un checkbox casi invisible en modo claro; pill accesible con buen contraste. */
function ModoOscuroSwitch({
  value,
  onToggle,
  isDark,
  T,
}: {
  value: boolean;
  onToggle: () => void;
  isDark: boolean;
  T: AppTheme;
}) {
  if (Platform.OS === 'web') {
    const trackOff = '#B8A7C9';
    const trackOn = T.primary;
    const borderOff = 'rgba(74,63,107,0.45)';
    const borderOn = T.primaryDark;
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        onPress={onToggle}
        style={{
          width: 52,
          height: 30,
          borderRadius: 15,
          backgroundColor: value ? trackOn : trackOff,
          borderWidth: 1,
          borderColor: value ? borderOn : borderOff,
          padding: 3,
          justifyContent: 'center',
        }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: '#FFFFFF',
            alignSelf: value ? 'flex-end' : 'flex-start',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.18,
            shadowRadius: 2,
            elevation: 2,
          }}
        />
      </Pressable>
    );
  }

  return (
    <Switch
      value={value}
      onValueChange={onToggle}
      ios_backgroundColor={isDark ? T.cardElevated : '#B8A7C9'}
      trackColor={{
        false: isDark ? T.cardElevated : '#C4B4D6',
        true: isDark ? 'rgba(124,58,237,0.5)' : '#8B5CF6',
      }}
      thumbColor={isDark ? (value ? '#EDE6FF' : T.primary) : '#FFFFFF'}
    />
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
  const { signOut } = useAuthStore();
  const user = useAuthStore((s) => s.user);
  const profile = useFinanceStore((s) => s.profile);
  const missions = useFinanceStore((s) => s.missions);
  const budgets = useFinanceStore((s) => s.budgets);
  const categories = useFinanceStore((s) => s.categories);
  const incomeCategories = useFinanceStore((s) => s.incomeCategories);
  const loadIncomeCategories = useFinanceStore((s) => s.loadIncomeCategories);
  const loadCategories = useFinanceStore((s) => s.loadCategories);

  const setMonedaPrincipal = useFinanceStore((s) => s.setMonedaPrincipal);
  const setTipoDeCambio = useFinanceStore((s) => s.setTipoDeCambio);
  const setBudgetCategoryLimit = useFinanceStore((s) => s.setBudgetCategoryLimit);
  const addMetodoPago = useFinanceStore((s) => s.addMetodoPago);
  const removeMetodoPago = useFinanceStore((s) => s.removeMetodoPago);
  const addBancoDisponible = useFinanceStore((s) => s.addBancoDisponible);
  const removeBancoDisponible = useFinanceStore((s) => s.removeBancoDisponible);
  const loadFromSupabase = useFinanceStore((s) => s.loadFromSupabase);
  const toggleTheme = useFinanceStore((s) => s.toggleTheme);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const removeCategory = useFinanceStore((s) => s.removeCategory);
  const updateCategory = useFinanceStore((s) => s.updateCategory);

  const [openSection, setOpenSection] = useState<string | null>('cuenta');
  const [emojiOverrides, setEmojiOverrides] = useState<Record<string, string>>({});
  const [tipoCambioDraft, setTipoCambioDraft] = useState(String(profile.tipoDeCambio));
  const [newMetodo, setNewMetodo] = useState('');
  const [showMetodoInput, setShowMetodoInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [newBanco, setNewBanco] = useState('');
  const [showBancoInput, setShowBancoInput] = useState(false);
  const [nombreInput, setNombreInput] = useState(profile.nombreUsuario || '');
  const [savingNombre, setSavingNombre] = useState(false);
  const [budgetAmounts, setBudgetAmounts] = useState<Record<string, string>>({});
  const [savingBudgets, setSavingBudgets] = useState(false);
  const [incomeCatsLocal, setIncomeCatsLocal] = useState(incomeCategories);

  useEffect(() => {
    setIncomeCatsLocal(incomeCategories);
  }, [incomeCategories]);

  useEffect(() => {
    setTipoCambioDraft(String(profile.tipoDeCambio));
  }, [profile.tipoDeCambio]);

  useEffect(() => {
    if (profile.nombreUsuario) {
      setNombreInput(profile.nombreUsuario);
    }
  }, [profile.nombreUsuario]);

  useEffect(() => {
    if (openSection !== 'presupuesto') return;
    if (categories.length === 0) void loadCategories();
    if (incomeCategories.length === 0) void loadIncomeCategories();

    const uid = user?.id;
    const mesActual = currentYearMonth();
    const fromStore: Record<string, string> = {};
    budgets.forEach((b) => {
      fromStore[b.categoria] = String(b.limiteMonthly);
    });
    setBudgetAmounts((prev) => ({ ...fromStore, ...prev }));

    if (!uid) return;

    let cancelled = false;
    void (async () => {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase
        .from('budgets')
        .select('categoria, limite')
        .eq('user_id', uid)
        .eq('mes', mesActual);
      if (cancelled || !data) return;
      const next: Record<string, string> = {};
      data.forEach((row: { categoria: string; limite: number | string }) => {
        next[row.categoria] = String(row.limite);
      });
      setBudgetAmounts((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    openSection,
    user?.id,
    budgets,
    categories.length,
    incomeCategories.length,
    loadCategories,
    loadIncomeCategories,
  ]);

  const initial = useMemo(
    () => (profile.nombreUsuario || 'U').trim().charAt(0).toUpperCase() || '?',
    [profile.nombreUsuario],
  );

  const misionesCompletadas = useMemo(() => missions.filter((m) => m.completada).length, [missions]);
  const xpTotalDisplay = useMemo(
    () => profile.xpActual + misionesCompletadas * 30,
    [misionesCompletadas, profile.xpActual],
  );

  const toggleSection = useCallback((id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  }, []);

  const onBlurTipoCambio = useCallback(() => {
    const n = Number(tipoCambioDraft.replace(',', '.'));
    if (!Number.isNaN(n) && n > 0) setTipoDeCambio(n);
    else setTipoCambioDraft(String(profile.tipoDeCambio));
  }, [profile.tipoDeCambio, setTipoDeCambio, tipoCambioDraft]);

  const handleSignOut = async () => {
    try {
      await signOut();
      await clearOnboardingLocal();
      await clearLastLogin();
    } catch (e) {
      console.error('Error signing out:', e);
    }
  };

  const handleAddCategory = useCallback(async () => {
    if (!newCatName.trim()) return;
    await addCategory(newCatName.trim());
    setNewCatName('');
    setShowCatInput(false);
  }, [newCatName, addCategory]);

  const handleAddMetodo = useCallback(async () => {
    if (!newMetodo.trim()) return;
    await addMetodoPago(newMetodo.trim());
    setNewMetodo('');
    setShowMetodoInput(false);
  }, [newMetodo, addMetodoPago]);

  const handleAddBanco = useCallback(async () => {
    if (!newBanco.trim()) return;
    await addBancoDisponible(newBanco.trim());
    setNewBanco('');
    setShowBancoInput(false);
  }, [newBanco, addBancoDisponible]);

  const handleRemoveBanco = useCallback(
    async (nombre: string) => {
      const list = profile.bancosDisponibles?.length ? profile.bancosDisponibles : DEFAULT_BANCOS_DISPONIBLES;
      if (list.length <= 1) {
        Alert.alert('No disponible', 'Debe existir al menos un banco.');
        return;
      }
      await removeBancoDisponible(nombre);
    },
    [profile.bancosDisponibles, removeBancoDisponible],
  );

  const handleGuardarPresupuestos = useCallback(async () => {
    const uid = user?.id;
    if (!uid) {
      Alert.alert('Sin sesión', 'Iniciá sesión para guardar presupuestos.');
      return;
    }
    setSavingBudgets(true);
    try {
      const mes = currentYearMonth();
      for (const [categoria, val] of Object.entries(budgetAmounts)) {
        const n = parseFloat(String(val).replace(',', '.'));
        if (!Number.isNaN(n) && n > 0) {
          await db.upsertBudget(uid, categoria, n, mes);
        }
      }
      await loadFromSupabase();
      Alert.alert('Guardado', 'Presupuestos actualizados.');
    } catch (e) {
      console.error('Error guardando presupuestos:', e);
      Alert.alert('Error', 'No se pudieron guardar los presupuestos.');
    } finally {
      setSavingBudgets(false);
    }
  }, [user?.id, budgetAmounts, loadFromSupabase]);

  const handleSaveNombre = async () => {
    if (!nombreInput.trim()) return;
    setSavingNombre(true);
    try {
      const userId = useAuthStore.getState().user?.id;
      if (userId) {
        await db.updateProfile(userId, { nombre_usuario: nombreInput.trim() });
      }
      useFinanceStore.setState((s) => ({
        profile: { ...s.profile, nombreUsuario: nombreInput.trim() },
      }));
    } catch (e) {
      console.error('Error saving nombre:', e);
    } finally {
      setSavingNombre(false);
    }
  };

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
                <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 11 }}>AhorraYA</Text>
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
            <View style={{ gap: 6 }}>
              <Text style={[{ color: T.textSecondary, fontSize: 13 }]}>Mi nombre</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={[
                    {
                      flex: 1,
                      height: 52,
                      borderRadius: 12,
                      paddingHorizontal: 16,
                      fontSize: 15,
                      backgroundColor: T.surface,
                      color: T.textPrimary,
                      borderWidth: 1,
                      borderColor: T.glassBorder,
                    },
                  ]}
                  value={nombreInput}
                  onChangeText={setNombreInput}
                  placeholder="Tu nombre"
                  placeholderTextColor={T.textMuted}
                />
                <TouchableOpacity
                  style={[
                    {
                      height: 52,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      backgroundColor: T.primary,
                      justifyContent: 'center',
                    },
                  ]}
                  onPress={() => void handleSaveNombre()}
                  disabled={savingNombre}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                    {savingNombre ? '...' : 'Guardar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

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
              <ModoOscuroSwitch
                value={isDark}
                onToggle={() => toggleTheme()}
                isDark={isDark}
                T={T}
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
                      gap: 10,
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: T.surface,
                      borderWidth: 1,
                      borderColor: T.glassBorder,
                    },
                  ]}>
                  <View style={{ alignItems: 'center', width: 44 }}>
                    <TextInput
                      value={emojiOverrides[cat.id] ?? cat.emoji}
                      onChangeText={(nuevoEmoji) => {
                        setEmojiOverrides((prev) => ({ ...prev, [cat.id]: nuevoEmoji }));
                      }}
                      onBlur={() => {
                        void (async () => {
                          const uid = user?.id;
                          if (!uid) return;
                          const raw = (emojiOverrides[cat.id] ?? cat.emoji).trim();
                          const emoji = raw.slice(0, 2) || '📦';
                          try {
                            await updateCategory(cat.id, cat.nombre, emoji);
                            setEmojiOverrides((prev) => {
                              const next = { ...prev };
                              delete next[cat.id];
                              return next;
                            });
                          } catch (e) {
                            console.error('updateCategory emoji:', e);
                          }
                        })();
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        fontSize: 22,
                        textAlign: 'center',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: T.glassBorder,
                        color: T.textPrimary,
                      }}
                      maxLength={2}
                    />
                    <Text style={{ fontSize: 9, color: T.textMuted, textAlign: 'center', marginTop: 2 }}>editar</Text>
                  </View>
                  <Text style={[{ flex: 1, color: T.textPrimary, fontSize: 14 }]}>{cat.nombre}</Text>
                  <TextInput
                    value={budgetAmounts[cat.nombre] ?? ''}
                    onChangeText={(val) => setBudgetAmounts((prev) => ({ ...prev, [cat.nombre]: val }))}
                    placeholder="0"
                    placeholderTextColor={T.textMuted}
                    keyboardType="numeric"
                    style={{
                      width: 90,
                      height: 40,
                      borderRadius: 10,
                      paddingHorizontal: 8,
                      fontSize: 14,
                      backgroundColor: T.surface,
                      color: T.textPrimary,
                      borderWidth: 1,
                      borderColor: T.glassBorder,
                      textAlign: 'center',
                    }}
                  />
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

              <View style={{ height: 1, backgroundColor: T.glassBorder, marginVertical: 16 }} />

              <Text
                style={{
                  color: T.textSecondary,
                  fontSize: 13,
                  fontFamily: Font.jakarta600,
                  marginBottom: 12,
                }}>
                Categorías de ingresos
              </Text>

              {incomeCatsLocal.map((cat) => (
                <View
                  key={cat.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: T.surface,
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: T.glassBorder,
                    gap: 10,
                  }}>
                  <View style={{ alignItems: 'center' }}>
                    <TextInput
                      value={cat.emoji}
                      onChangeText={(val) =>
                        setIncomeCatsLocal((prev) =>
                          prev.map((c) => (c.id === cat.id ? { ...c, emoji: val } : c)),
                        )
                      }
                      onBlur={async () => {
                        if (!user?.id) return;
                        const emoji = cat.emoji.trim().slice(0, 2) || '📦';
                        setIncomeCatsLocal((prev) =>
                          prev.map((c) => (c.id === cat.id ? { ...c, emoji } : c)),
                        );
                        await updateCategory(cat.id, cat.nombre, emoji);
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        fontSize: 22,
                        textAlign: 'center',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: T.glassBorder,
                        color: T.textPrimary,
                      }}
                      maxLength={2}
                    />
                    <Text style={{ fontSize: 9, color: T.textMuted }}>editar</Text>
                  </View>

                  <TextInput
                    value={cat.nombre}
                    onChangeText={(val) =>
                      setIncomeCatsLocal((prev) =>
                        prev.map((c) => (c.id === cat.id ? { ...c, nombre: val } : c)),
                      )
                    }
                    onBlur={async () => {
                      if (!user?.id) return;
                      const nombre = cat.nombre.trim() || 'Sin nombre';
                      setIncomeCatsLocal((prev) =>
                        prev.map((c) => (c.id === cat.id ? { ...c, nombre } : c)),
                      );
                      await updateCategory(cat.id, nombre, cat.emoji);
                    }}
                    style={{
                      flex: 1,
                      color: T.textPrimary,
                      fontSize: 14,
                      backgroundColor: 'transparent',
                    }}
                  />

                  <TouchableOpacity
                    onPress={async () => {
                      await removeCategory(cat.id);
                      setIncomeCatsLocal((prev) => prev.filter((c) => c.id !== cat.id));
                    }}>
                    <Text style={{ color: '#FF4444', fontSize: 18, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                onPress={async () => {
                  const uid = user?.id;
                  if (!uid) {
                    Alert.alert('Sin sesión', 'Iniciá sesión para agregar categorías.');
                    return;
                  }
                  const nueva = await db.addCategoryWithTipo(uid, 'Nueva categoría', '📦', 'ingreso');
                  const row = {
                    id: nueva.id,
                    nombre: nueva.nombre,
                    emoji: nueva.emoji,
                    orden: nueva.orden,
                  };
                  setIncomeCatsLocal((prev) => [...prev, row]);
                  useFinanceStore.setState((s) => ({ incomeCategories: [...s.incomeCategories, row] }));
                }}
                style={{
                  borderWidth: 1,
                  borderColor: T.primary,
                  borderRadius: 12,
                  padding: 12,
                  alignItems: 'center',
                  marginTop: 4,
                  marginBottom: 12,
                  borderStyle: 'dashed',
                }}>
                <Text style={{ color: T.primary, fontSize: 14, fontFamily: Font.jakarta600 }}>
                  + Agregar categoría de ingreso
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  {
                    marginTop: 8,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: T.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: savingBudgets ? 0.7 : 1,
                  },
                ]}
                onPress={() => void handleGuardarPresupuestos()}
                disabled={savingBudgets}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                  {savingBudgets ? 'Guardando…' : 'Guardar presupuestos'}
                </Text>
              </TouchableOpacity>
            </View>
          </AccordionSection>

          <AccordionSection
            title="Métodos de Pago"
            icon="💳"
            expanded={openSection === 'metodos'}
            onToggle={() => toggleSection('metodos')}>
            <View style={{ gap: 10 }}>
              {(profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO).map((m) => (
                <View
                  key={m.id}
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
                  <Text style={[{ flex: 1, color: T.textPrimary, fontSize: 14 }]}>{m.nombre}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      if ((profile.metodosDePago ?? DEFAULT_METODOS_DE_PAGO).length <= 1) {
                        Alert.alert('No disponible', 'Debe existir al menos un método de pago.');
                        return;
                      }
                      void removeMetodoPago(m.nombre);
                    }}>
                    <Text style={{ color: '#FF4444', fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {showMetodoInput && (
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
                    placeholder="Nombre del método"
                    placeholderTextColor={T.textMuted}
                    value={newMetodo}
                    onChangeText={setNewMetodo}
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
                    onPress={() => void handleAddMetodo()}>
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
                onPress={() => setShowMetodoInput(!showMetodoInput)}>
                <Text style={[{ color: T.primary, fontWeight: '600', fontSize: 14 }]}>
                  {showMetodoInput ? 'Cancelar' : '+ Agregar método'}
                </Text>
              </TouchableOpacity>
            </View>
          </AccordionSection>

          <AccordionSection
            title="Bancos"
            icon="🏦"
            expanded={openSection === 'bancos'}
            onToggle={() => toggleSection('bancos')}>
            <View style={{ gap: 10 }}>
              {(profile.bancosDisponibles?.length ? profile.bancosDisponibles : DEFAULT_BANCOS_DISPONIBLES).map((b) => (
                <View
                  key={b}
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
                  <Text style={[{ flex: 1, color: T.textPrimary, fontSize: 14 }]}>{b}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const list = profile.bancosDisponibles?.length
                        ? profile.bancosDisponibles
                        : DEFAULT_BANCOS_DISPONIBLES;
                      if (list.length <= 1) {
                        Alert.alert('No disponible', 'Debe existir al menos un banco.');
                        return;
                      }
                      void handleRemoveBanco(b);
                    }}>
                    <Text style={{ color: '#FF4444', fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {showBancoInput && (
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
                    placeholder="Nombre del banco"
                    placeholderTextColor={T.textMuted}
                    value={newBanco}
                    onChangeText={setNewBanco}
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
                    onPress={() => void handleAddBanco()}>
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
                onPress={() => setShowBancoInput(!showBancoInput)}>
                <Text style={[{ color: T.primary, fontWeight: '600', fontSize: 14 }]}>
                  {showBancoInput ? 'Cancelar' : '+ Agregar banco'}
                </Text>
              </TouchableOpacity>
            </View>
          </AccordionSection>

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
            onPress={() => void handleSignOut()}
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
