import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G } from 'react-native-svg';

import { ExpenseFullSheet } from '@/components/ExpenseFullSheet';
import { IncomeSheet } from '@/components/IncomeSheet';
import { Card } from '@/components/ui/Card';
import { GradientView } from '@/components/ui/GradientView';
import { onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/lib/currency';
import { useAuthStore } from '@/store/useAuthStore';
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

function WebDonut({
  chartData,
}: {
  chartData: { name: string; value: number; color: string }[];
}) {
  if (Platform.OS !== 'web') return null;
  const { PieChart, Pie, Cell } = require('recharts') as typeof import('recharts');
  return (
    <View style={{ width: 220, height: 220, alignSelf: 'center' }}>
      <PieChart width={220} height={220}>
        <Pie
          data={chartData}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={80}
          outerRadius={110}
          startAngle={90}
          endAngle={-270}
          paddingAngle={0}>
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} stroke="none" />
          ))}
        </Pie>
      </PieChart>
    </View>
  );
}

function NativeDonut({
  usedPct,
  strokeColor,
  trackColor,
}: {
  usedPct: number;
  strokeColor: string;
  trackColor: string;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 85;
  const stroke = 22;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.min(100, usedPct) / 100) * circumference;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation="-90" origin={`${cx}, ${cy}`}>
        <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={strokeColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

export default function HomeScreen() {
  const { T } = useTheme();
  const expenses = useFinanceStore((s) => s.expenses);
  const incomes = useFinanceStore((s) => s.incomes);
  const budgets = useFinanceStore((s) => s.budgets);
  const profile = useFinanceStore((s) => s.profile);
  const loadFromSupabase = useFinanceStore((s) => s.loadFromSupabase);
  const loadCategories = useFinanceStore((s) => s.loadCategories);
  const session = useAuthStore((s) => s.session);
  const [expenseSheetOpen, setExpenseSheetOpen] = useState(false);
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false);

  useEffect(() => {
    if (session) {
      loadFromSupabase().then(() => {
        loadCategories();
      });
    }
  }, [session]);

  const initial = useMemo(() => (profile.nombreUsuario?.trim()?.charAt(0) || 'U').toUpperCase(), [profile.nombreUsuario]);
  const mesActual = new Date().toISOString().slice(0, 7);
  const gastadoMes = useMemo(
    () => expenses.filter((e) => e.mes === mesActual).reduce((sum, e) => sum + e.importe, 0),
    [expenses, mesActual],
  );
  const limiteMes = useMemo(() => budgets.reduce((sum, b) => sum + b.limiteMonthly, 0), [budgets]);
  const pctUsado = limiteMes > 0 ? Math.min((gastadoMes / limiteMes) * 100, 100) : 0;
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todaySpent = useMemo(
    () => expenses.filter((item) => item.fecha.slice(0, 10) === todayKey).reduce((sum, item) => sum + item.importe, 0),
    [expenses, todayKey],
  );
  const todayIncome = useMemo(
    () => incomes.filter((item) => item.fecha.slice(0, 10) === todayKey).reduce((sum, item) => sum + item.importe, 0),
    [incomes, todayKey],
  );
  const arcStrokePct = pctUsado;
  const weekCategory = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const map: Record<string, number> = {};
    expenses.forEach((item) => {
      const date = new Date(item.fecha);
      if (date >= weekAgo && date <= now) {
        map[item.categoria] = (map[item.categoria] ?? 0) + item.importe;
      }
    });
    const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
    return top?.[0] ?? 'Sin datos';
  }, [expenses]);
  const aiTip = useMemo(() => {
    if (profile.rachaActual > 0) {
      return `Llevas ${profile.rachaActual} días registrando. ¡Seguí así!`;
    }
    if (profile.totalGastadoSemana > 0) {
      return `Esta semana gastaste ${formatMoney(
        profile.totalGastadoSemana,
        profile.monedaPrincipal,
      )}. Tu categoría más usada: ${weekCategory}`;
    }
    return 'Registrá tu primer gasto para ver tus estadísticas';
  }, [profile.rachaActual, profile.totalGastadoSemana, profile.monedaPrincipal, weekCategory]);

  const motivPhrase = useMemo(() => {
    if (profile.nivel <= 2) return 'El primer paso es el mas importante.';
    if (profile.nivel <= 4) return 'El exito es la suma de pequenos esfuerzos.';
    return 'Eres el arquitecto de tu libertad financiera.';
  }, [profile.nivel]);

  const chartData = useMemo(
    () => [
      { name: 'Usado', value: arcStrokePct, color: T.primary },
      { name: 'Restante', value: Math.max(0, 100 - arcStrokePct), color: T.surface },
    ],
    [arcStrokePct, T.primary, T.surface],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, maxWidth: 390, width: '100%', alignSelf: 'center' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  padding: 3,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: T.primaryBorder,
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
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 22 }}>{initial}</Text>
                  </GradientView>
                </View>
              </View>
              <View>
                <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 24 }}>
                  ¡Hola, {profile.nombreUsuario}!
                </Text>
                <Text style={{ fontFamily: Font.manrope400, color: T.textSecondary, fontSize: 13, marginTop: 2 }}>
                  Tus finanzas de hoy
                </Text>
              </View>
            </View>
          </View>

          <GradientView
            colors={T.primaryGrad}
            style={{
              marginTop: 20,
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 12,
              shadowColor: T.shadowPrimary,
              ...purpleShadow,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: onPrimaryGradient.iconGlass,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontSize: 16 }}>✨</Text>
              </View>
              <Text style={{ flex: 1, fontFamily: Font.manrope500, color: onPrimaryGradient.text, fontSize: 13, lineHeight: 20 }}>
                {aiTip}
              </Text>
            </View>
          </GradientView>

          <Card
            style={{
              marginTop: 20,
              paddingVertical: 20,
              alignItems: 'center',
              backgroundColor: T.card,
              borderWidth: 0,
              borderRadius: 24,
              shadowColor: T.shadowCard,
              ...cardShadow,
            }}>
            <View style={{ width: 220, height: 220, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' }}>
              {Platform.OS === 'web' ? (
                <WebDonut chartData={chartData} />
              ) : (
                <NativeDonut usedPct={arcStrokePct} strokeColor={T.primary} trackColor={T.surface} />
              )}
              <View
                pointerEvents="none"
                style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
                <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 26, textAlign: 'center' }}>
                  {formatMoney(gastadoMes, profile.monedaPrincipal)}
                </Text>
                <Text style={{ fontFamily: Font.manrope400, color: T.textSecondary, fontSize: 12, marginTop: 4 }}>
                  gastado este mes
                </Text>
                <Text
                  style={{
                    fontFamily: Font.manrope400,
                    color: T.textSecondary,
                    fontSize: 11,
                    marginTop: 6,
                    textAlign: 'center',
                  }}>
                  {formatMoney(gastadoMes, profile.monedaPrincipal)} gastado de {formatMoney(limiteMes, profile.monedaPrincipal)}{' '}
                  límite
                </Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: T.cardElevated,
              }}>
              <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13 }}>
                🔥 {profile.rachaActual} días
              </Text>
              <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13 }}>
                📊 Nivel {profile.nivel}
              </Text>
              <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13 }}>
                ⚡ {profile.xpActual}/{profile.xpParaSiguienteNivel} XP
              </Text>
            </View>
          </Card>

          <Pressable
            onPress={() => setExpenseSheetOpen(true)}
            style={{
              width: '100%',
              marginTop: 20,
              borderRadius: 16,
              overflow: 'hidden',
              shadowColor: T.shadowPrimary,
              ...purpleShadow,
            }}>
            <GradientView
              colors={T.primaryGrad}
              style={{
                height: 68,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 17 }}>
                ⚡ REGISTRAR GASTO AL TOQUE
              </Text>
              <Text style={{ fontFamily: Font.manrope400, color: onPrimaryGradient.textMuted, fontSize: 12, marginTop: 2 }}>
                Rápido y fácil
              </Text>
            </GradientView>
          </Pressable>

          <Pressable
            onPress={() => setIncomeSheetOpen(true)}
            style={{
              marginTop: 12,
              height: 54,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: T.primaryBorder,
              backgroundColor: T.cardElevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontFamily: Font.jakarta600, color: T.primary, fontSize: 15 }}>REGISTRAR INGRESO</Text>
          </Pressable>

          <View style={{ marginTop: 20, flexDirection: 'row', gap: 12 }}>
            <View
              style={{
                flex: 1,
                borderRadius: 16,
                backgroundColor: T.secondaryBg,
                borderWidth: 1,
                borderColor: T.secondaryBg,
                padding: 14,
              }}>
              <Text style={{ fontFamily: Font.manrope500, color: T.textSecondary, fontSize: 11 }}>Ingresos hoy</Text>
              <Text
                style={{
                  fontFamily: Font.jakarta700,
                  color: todayIncome > 0 ? T.success : T.textMuted,
                  fontSize: 20,
                  marginTop: 4,
                }}>
                {formatMoney(todayIncome, profile.monedaPrincipal)}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                borderRadius: 16,
                backgroundColor: T.primaryBg,
                borderWidth: 1,
                borderColor: T.primaryBorder,
                padding: 14,
              }}>
              <Text style={{ fontFamily: Font.manrope500, color: T.textSecondary, fontSize: 11 }}>Gastos hoy</Text>
              <Text
                style={{
                  fontFamily: Font.jakarta700,
                  color: todaySpent > 0 ? T.error : T.textMuted,
                  fontSize: 20,
                  marginTop: 4,
                }}>
                {formatMoney(todaySpent, profile.monedaPrincipal)}
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 16,
              backgroundColor: T.card,
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: T.glassBorder,
              shadowColor: T.shadowCard,
              ...cardShadow,
            }}>
            <Text style={{ fontFamily: Font.jakarta700, color: T.primaryBorder, fontSize: 32, lineHeight: 32 }}>"</Text>
            <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 15, marginTop: -4 }}>{motivPhrase}</Text>
            <Text style={{ fontFamily: Font.manrope500, color: T.primary, fontSize: 13, marginTop: 8 }}>
              ¡Sigue así, {profile.nombreUsuario}!
            </Text>
          </View>
        </ScrollView>

        <ExpenseFullSheet open={expenseSheetOpen} onDismiss={() => setExpenseSheetOpen(false)} />
        <IncomeSheet open={incomeSheetOpen} onDismiss={() => setIncomeSheetOpen(false)} />
      </View>
    </SafeAreaView>
  );
}
