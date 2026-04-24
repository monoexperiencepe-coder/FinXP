import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientView } from '@/components/ui/GradientView';
import { modalOverlayScrim, onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/lib/currency';
import { currentYearMonth } from '@/lib/dates';
import { useFinanceStore } from '@/store/useFinanceStore';

const cardShadow = {
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 1,
  shadowRadius: 24,
  elevation: 12,
} as const;

const purpleShadow = {
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 1,
  shadowRadius: 32,
  elevation: 16,
} as const;

export default function MisionesScreen() {
  const { T } = useTheme();
  const missions = useFinanceStore((s) => s.missions);
  const profile = useFinanceStore((s) => s.profile);
  const expenses = useFinanceStore((s) => s.expenses);
  const budgets = useFinanceStore((s) => s.budgets);
  const incomes = useFinanceStore((s) => s.incomes);

  const [metaInfoOpen, setMetaInfoOpen] = useState(false);

  const mesActual = currentYearMonth();
  const gastadoMes = useMemo(
    () => expenses.filter((e) => e.mes === mesActual).reduce((sum, e) => sum + e.importe, 0),
    [expenses, mesActual],
  );
  const limiteMes = useMemo(() => budgets.reduce((sum, b) => sum + b.limiteMonthly, 0), [budgets]);
  const pctUsado = limiteMes > 0 ? Math.min((gastadoMes / limiteMes) * 100, 100) : 0;
  const monthBudget = limiteMes;
  const monthSpent = gastadoMes;
  const budgetBarColor =
    pctUsado < 70 ? T.success : pctUsado <= 90 ? T.warning : T.error;

  const expensiveDayLabel = useMemo(() => {
    const daySpend: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    expenses.forEach((item) => {
      const day = new Date(item.fecha).getDay();
      daySpend[day] = (daySpend[day] ?? 0) + item.importe;
    });
    const winner = Object.entries(daySpend).sort((a, b) => b[1] - a[1])[0];
    const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return winner && Number(winner[1]) > 0 ? names[Number(winner[0])] : 'Sin datos';
  }, [expenses]);

  const activeMissions = useMemo(() => missions.filter((m) => !m.completada), [missions]);
  const achievements = useMemo(
    () => [
      { id: 'first-expense', emoji: '🧾', label: 'Primer gasto', unlocked: expenses.length > 0 },
      { id: 'streak', emoji: '🔥', label: 'Racha x3', unlocked: profile.rachaActual >= 3 },
      { id: 'income', emoji: '💸', label: 'Primer ingreso', unlocked: incomes.length > 0 },
      { id: 'missions', emoji: '🎯', label: 'Mision cumplida', unlocked: missions.some((m) => m.completada) },
      { id: 'budget', emoji: '🛡️', label: 'Control mensual', unlocked: monthBudget > 0 && monthSpent <= monthBudget },
      { id: 'level5', emoji: '👑', label: 'Nivel 5', unlocked: profile.nivel >= 5 },
    ],
    [expenses.length, incomes.length, missions, monthBudget, monthSpent, profile.nivel, profile.rachaActual],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, maxWidth: 390, width: '100%', alignSelf: 'center' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 }}>
          <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 26 }}>Misiones</Text>
            <View
              style={{
                backgroundColor: T.primaryBg,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: T.primaryBorder,
              }}>
              <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 12 }}>Nivel {profile.nivel}</Text>
            </View>
          </View>

          <GradientView
            colors={T.primaryGrad}
            style={{
              borderRadius: 16,
              padding: 14,
              shadowColor: T.shadowPrimary,
              ...purpleShadow,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text
                style={{
                  fontFamily: Font.manrope500,
                  color: onPrimaryGradient.textMuted,
                  fontSize: 11,
                  letterSpacing: 1.2,
                }}>
                PRESUPUESTO DEL MES
              </Text>
              <Pressable onPress={() => setMetaInfoOpen(true)} hitSlop={8} style={{ padding: 2 }}>
                <Text style={{ fontSize: 14, color: onPrimaryGradient.textMuted }}>ℹ️</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 36, marginTop: 8 }}>
              {Math.round(pctUsado)}%
            </Text>
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: onPrimaryGradient.iconGlass,
                marginTop: 12,
                overflow: 'hidden',
              }}>
              <View
                style={{
                  width: `${Math.min(100, pctUsado)}%`,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: budgetBarColor,
                }}
              />
            </View>
            <Text style={{ fontFamily: Font.manrope400, color: onPrimaryGradient.textMuted, fontSize: 12, marginTop: 10 }}>
              {formatMoney(gastadoMes, profile.monedaPrincipal)} gastado de {formatMoney(limiteMes, profile.monedaPrincipal)} límite
            </Text>
          </GradientView>

          <Modal visible={metaInfoOpen} transparent animationType="fade" onRequestClose={() => setMetaInfoOpen(false)}>
            <Pressable
              style={{ flex: 1, backgroundColor: modalOverlayScrim, justifyContent: 'center', padding: 24 }}
              onPress={() => setMetaInfoOpen(false)}>
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: T.surface,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  padding: 18,
                }}>
                <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 16 }}>
                  ¿Cómo se calcula tu meta?
                </Text>
                <Text style={{ fontFamily: Font.manrope400, color: T.textSecondary, fontSize: 14, marginTop: 12, lineHeight: 22 }}>
                  Tu meta mensual es la suma de todos los presupuestos que configuraste en Perfil → Presupuesto.
                  {'\n\n'}
                  Para cambiarla, ve a Perfil y ajusta los límites por categoría.
                </Text>
                <Pressable
                  onPress={() => setMetaInfoOpen(false)}
                  style={{
                    marginTop: 18,
                    borderRadius: 12,
                    overflow: 'hidden',
                    shadowColor: T.shadowPrimary,
                    ...purpleShadow,
                  }}>
                  <GradientView colors={T.primaryGrad} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 14 }}>Entendido</Text>
                  </GradientView>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          <View style={{ marginTop: 12, flexDirection: 'row', gap: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: T.card,
                borderRadius: 16,
                padding: 12,
                shadowColor: T.shadowCard,
                ...cardShadow,
              }}>
              <Text style={{ fontSize: 30, color: T.warning }}>🔥</Text>
              <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 36, marginTop: 2 }}>
                {profile.rachaActual}
              </Text>
              <Text style={{ fontFamily: Font.manrope600, color: T.textMuted, fontSize: 10, letterSpacing: 2, marginTop: 4 }}>
                DIAS DE RACHA
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: T.card,
                borderRadius: 16,
                padding: 12,
                shadowColor: T.shadowCard,
                ...cardShadow,
              }}>
              <Text style={{ fontSize: 24, color: T.warning }}>⚠️</Text>
              <Text style={{ fontFamily: Font.manrope600, color: T.secondary, fontSize: 10, letterSpacing: 2, marginTop: 2 }}>
                DÍA MÁS CARO
              </Text>
              <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12, marginTop: 8 }}>
                Día con más gastos:
              </Text>
              <Text style={{ fontFamily: Font.jakarta700, color: T.error, fontSize: 18, marginTop: 2 }}>
                {expensiveDayLabel}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 12, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 20 }}>Misiones Activas</Text>
            <View
              style={{
                backgroundColor: T.primaryBg,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: T.primaryBorder,
              }}>
              <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 12 }}>{activeMissions.length}</Text>
            </View>
          </View>
          {missions.map((m) => {
            const progressPct = m.meta > 0 ? Math.min(100, Math.round((m.progreso / m.meta) * 100)) : 0;
            const exp = new Date(m.fechaExpiracion);
            const dias = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000));
            return (
              <View
                key={m.id}
                style={{
                  marginBottom: 10,
                  backgroundColor: T.card,
                  borderRadius: 16,
                  padding: 12,
                  borderLeftWidth: 3,
                  borderLeftColor: T.primary,
                  shadowColor: T.shadowCard,
                  ...cardShadow,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 15 }}>{m.titulo}</Text>
                    <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 13, marginTop: 4 }}>
                      {m.descripcion}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: T.primaryBg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}>
                    <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 11 }}>+{m.xpRecompensa} XP</Text>
                  </View>
                </View>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: T.cardElevated, marginTop: 10, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${progressPct}%`,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: m.completada ? T.primary : T.secondary,
                    }}
                  />
                </View>
                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12 }}>
                    {m.progreso}/{m.meta} · {dias}d restantes
                  </Text>
                  {m.completada ? (
                    <Text style={{ fontFamily: Font.jakarta600, color: T.primary, fontSize: 12 }}>✓ ¡Completada!</Text>
                  ) : null}
                </View>
              </View>
            );
          })}

          <Text style={{ fontFamily: Font.jakarta700, marginTop: 10, color: T.textPrimary, fontSize: 20 }}>Logros</Text>
          <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {achievements.map((achievement) => (
              <View
                key={achievement.id}
                style={{
                  width: '31%',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: achievement.unlocked ? T.primaryBorder : T.glassBorder,
                  backgroundColor: achievement.unlocked ? T.primaryBg : T.card,
                  opacity: achievement.unlocked ? 1 : 0.4,
                  paddingVertical: 14,
                  alignItems: 'center',
                  position: 'relative',
                }}>
                {!achievement.unlocked ? (
                  <Text style={{ position: 'absolute', top: 6, right: 6 }}>🔒</Text>
                ) : null}
                <Text style={{ fontSize: 24 }}>{achievement.emoji}</Text>
                <Text
                  style={{
                    fontFamily: Font.manrope400,
                    color: T.textSecondary,
                    fontSize: 11,
                    marginTop: 8,
                    textAlign: 'center',
                  }}>
                  {achievement.label}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
