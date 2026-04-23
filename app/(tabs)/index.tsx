import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, RadialGradient as SvgRadialGradient, Stop } from 'react-native-svg';

import { ExpenseFullSheet } from '@/components/ExpenseFullSheet';
import { FirstExpenseWalletModal, markFirstExpenseWalletSkipped, shouldShowFirstExpenseWallet } from '@/components/FirstExpenseWalletModal';
import { IncomeSheet } from '@/components/IncomeSheet';
import JarvisGuide from '@/components/JarvisGuide';
import { GradientView } from '@/components/ui/GradientView';
import { onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/lib/currency';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';

/* ────────────────────────────────────────────────────────────────────────────── */

/* ── Premium donut (nativo) — track semi-opaco, arco blanco brillante ── */
function NativeDonut({ usedPct, arcColor }: { usedPct: number; arcColor: string }) {
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const r = 50;
  const stroke = 10;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.min(100, usedPct) / 100) * circumference;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <SvgRadialGradient id="glow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={arcColor} stopOpacity="0.25" />
          <Stop offset="100%" stopColor={arcColor} stopOpacity="0" />
        </SvgRadialGradient>
      </Defs>
      <G rotation="-90" origin={`${cx}, ${cy}`}>
        {/* Track */}
        <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        {/* Arc */}
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={arcColor} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

function WebDonut({ usedPct, arcColor }: { usedPct: number; arcColor: string }) {
  if (Platform.OS !== 'web') return null;
  const chartData = [
    { name: 'Usado', value: usedPct, color: arcColor },
    { name: 'Restante', value: Math.max(0, 100 - usedPct), color: 'rgba(255,255,255,0.08)' },
  ];
  const { PieChart, Pie, Cell } = require('recharts') as typeof import('recharts');
  return (
    <View style={{ width: 132, height: 132 }}>
      <PieChart width={132} height={132}>
        <Pie data={chartData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={55} startAngle={90} endAngle={-270} paddingAngle={0}>
          {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="none" />)}
        </Pie>
      </PieChart>
    </View>
  );
}

/* ── Floating toast ── */
function FloatingToast({ message, emoji, onDismiss, T }: {
  message: string;
  emoji: string;
  onDismiss: () => void;
  T: ReturnType<typeof useTheme>['T'];
}) {
  const y = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(y, { toValue: 0, friction: 8, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(y, { toValue: -80, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        maxWidth: 260,
        zIndex: 999,
        opacity,
        transform: [{ translateY: y }],
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: T.card,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: T.glassBorder,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
      }}>
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text style={{ flex: 1, fontFamily: Font.manrope500, fontSize: 12, color: T.textSecondary, lineHeight: 16 }}>{message}</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Text style={{ fontSize: 14, color: T.textMuted }}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

/* ── Metric pill ── */
function MetricPill({ label, value, color, T }: {
  label: string;
  value: string;
  color: string;
  T: ReturnType<typeof useTheme>['T'];
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: T.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: T.glassBorder,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: 'center',
    }}>
      <Text style={{ fontFamily: Font.manrope500, fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontFamily: Font.jakarta700, fontSize: 15, color }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────── */

export default function HomeScreen() {
  const { T } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const maxW = Math.min(width, 390);

  const expenses    = useFinanceStore((s) => s.expenses);
  const incomes     = useFinanceStore((s) => s.incomes);
  const budgets     = useFinanceStore((s) => s.budgets);
  const profile     = useFinanceStore((s) => s.profile);
  const missions    = useFinanceStore((s) => s.missions);
  const getWeekSpent = useFinanceStore((s) => s.getWeekSpent);
  const loadFromSupabase = useFinanceStore((s) => s.loadFromSupabase);
  const loadCategories   = useFinanceStore((s) => s.loadCategories);
  const session = useAuthStore((s) => s.session);

  const [expenseSheetOpen,    setExpenseSheetOpen]    = useState(false);
  const [incomeSheetOpen,     setIncomeSheetOpen]     = useState(false);
  const [firstWalletModalOpen, setFirstWalletModalOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (session) {
      loadFromSupabase().then(() => loadCategories());
    }
  }, [session]);

  useEffect(() => {
    const t = setTimeout(() => setToastVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

  /* ── Expense flow ── */
  const openExpenseFlow = useCallback(async () => {
    if (expenses.length > 0) { setExpenseSheetOpen(true); return; }
    if (await shouldShowFirstExpenseWallet()) { setFirstWalletModalOpen(true); return; }
    setExpenseSheetOpen(true);
  }, [expenses.length]);

  const handleFirstWalletComplete = useCallback(() => {
    setFirstWalletModalOpen(false);
    setExpenseSheetOpen(true);
  }, []);

  const handleFirstWalletSkip = useCallback(async () => {
    await markFirstExpenseWalletSkipped();
    setFirstWalletModalOpen(false);
    setExpenseSheetOpen(true);
  }, []);

  /* ── Derived data ── */
  const initial   = useMemo(() => (profile.nombreUsuario?.trim()?.charAt(0) || 'U').toUpperCase(), [profile.nombreUsuario]);
  const mesActual = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const todayKey  = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const gastadoMes = useMemo(
    () => expenses.filter((e) => e.mes === mesActual).reduce((s, e) => s + e.importe, 0),
    [expenses, mesActual],
  );
  const limiteMes = useMemo(() => budgets.reduce((s, b) => s + b.limiteMonthly, 0), [budgets]);
  const pctUsado  = limiteMes > 0 ? Math.min((gastadoMes / limiteMes) * 100, 100) : 0;

  const todaySpent = useMemo(
    () => expenses.filter((e) => e.fecha.slice(0, 10) === todayKey).reduce((s, e) => s + e.importe, 0),
    [expenses, todayKey],
  );
  const weekSpent = useMemo(() => getWeekSpent(), [getWeekSpent, expenses]);

  /* Top 3 categorías del mes */
  const topCats = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    expenses.filter((e) => e.mes === mesActual).forEach((e) => {
      if (!map[e.categoria]) map[e.categoria] = { total: 0, count: 0 };
      map[e.categoria].total += e.importe;
      map[e.categoria].count += 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3)
      .map(([cat, data]) => ({
        cat,
        total: data.total,
        count: data.count,
        pct: gastadoMes > 0 ? Math.round((data.total / gastadoMes) * 100) : 0,
      }));
  }, [expenses, mesActual, gastadoMes]);

  const CAT_EMOJI: Record<string, string> = {
    comida: '🍔', vivienda: '🏠', transporte: '🚌', salud: '💊',
    servicios: '💡', suscripciones: '📱', ocio: '🎬', pareja: '💑',
    ropa: '👕', educacion: '📚', mascotas: '🐾', viajes: '✈️',
    gaming: '🎮', otros: '📦', delivery: '🛵',
  };
  const catEmoji = (id: string) => CAT_EMOJI[id] ?? '💰';
  const catLabel = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');

  /* Missions summary */
  const pendingMissions  = useMemo(() => missions.filter((m) => !m.completada), [missions]);
  const availableMissions = pendingMissions.slice(0, 3);

  /* Toast message */
  const toastMsg = useMemo(() => {
    if (profile.rachaActual > 0) return { emoji: '🔥', msg: `¡${profile.rachaActual} días seguidos! Seguí así.` };
    return { emoji: '💡', msg: 'Registrá tu primer gasto para ver tus estadísticas.' };
  }, [profile.rachaActual]);

  const motivPhrase = useMemo(() => {
    if (profile.nivel <= 2) return 'El primer paso es el más importante.';
    if (profile.nivel <= 4) return 'El éxito es la suma de pequeños esfuerzos.';
    return 'Eres el arquitecto de tu libertad financiera.';
  }, [profile.nivel]);

  const pctColor = pctUsado >= 90 ? T.error : pctUsado >= 70 ? T.warning : T.primary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, maxWidth: maxW, width: '100%', alignSelf: 'center' }}>
        {toastVisible && (
          <FloatingToast
            emoji={toastMsg.emoji}
            message={toastMsg.msg}
            onDismiss={() => setToastVisible(false)}
            T={T}
          />
        )}

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, paddingTop: 12 }}>

          {/* ── HEADER ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View
              style={{
                width: 46, height: 46, borderRadius: 23,
                borderWidth: 2, borderColor: T.primaryBorder,
                alignItems: 'center', justifyContent: 'center',
                marginRight: 12,
              }}>
              <GradientView
                colors={T.primaryGrad}
                style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 18 }}>{initial}</Text>
              </GradientView>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 20 }}>
                ¡Hola, {profile.nombreUsuario || 'Usuario'}! 👋
              </Text>
              <Text style={{ fontFamily: Font.manrope400, color: T.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {motivPhrase}
              </Text>
            </View>
          </View>

          {/* ── JARVIS GUIDE ── */}
          <JarvisGuide
            onRegisterExpense={() => void openExpenseFlow()}
            onRegisterIncome={() => setIncomeSheetOpen(true)}
            onGoToBudgets={() => router.push('/(tabs)/resumen' as any)}
            onGoToProfile={() => router.push('/(tabs)/perfil' as any)}
          />

          {/* ── CARD PREMIUM ── */}
          <GradientView
            colors={['#1A0B3B', '#0D1040', '#0A1628']}
            style={{
              borderRadius: 22,
              marginBottom: 12,
              overflow: 'hidden',
              ...Platform.select({
                ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24 },
                android: { elevation: 18 },
                web: { boxShadow: '0 12px 40px rgba(124,58,237,0.35)' } as object,
              }),
            }}>
            {/* Borde superior con gradiente de acento */}
            <View style={{ height: 2, backgroundColor: 'transparent' }}>
              <GradientView colors={['#7C3AED', '#00D4FF', '#4DF2B1']} style={{ height: 2 }} />
            </View>

            {/* Orb decorativo de fondo */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', top: -30, right: -30,
                width: 160, height: 160, borderRadius: 80,
                backgroundColor: 'rgba(124,58,237,0.15)',
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', bottom: -20, left: 20,
                width: 100, height: 100, borderRadius: 50,
                backgroundColor: 'rgba(0,212,255,0.07)',
              }}
            />

            <View style={{ padding: 16 }}>
              {/* Fila superior: donut + importe central */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                {/* Donut */}
                <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ position: 'absolute' }}>
                    {Platform.OS === 'web'
                      ? <WebDonut usedPct={pctUsado} arcColor={pctUsado >= 90 ? '#FF5E7D' : pctUsado >= 70 ? '#FFB84D' : '#7C3AED'} />
                      : <NativeDonut usedPct={pctUsado} arcColor={pctUsado >= 90 ? '#FF5E7D' : pctUsado >= 70 ? '#FFB84D' : '#7C3AED'} />}
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 17, textAlign: 'center' }}>
                      {formatMoney(gastadoMes, profile.monedaPrincipal)}
                    </Text>
                    <Text style={{ fontFamily: Font.manrope400, color: 'rgba(255,255,255,0.45)', fontSize: 9, marginTop: 1 }}>
                      GASTADO
                    </Text>
                    {limiteMes > 0 && (
                      <View style={{
                        marginTop: 4, paddingHorizontal: 6, paddingVertical: 2,
                        backgroundColor: 'rgba(124,58,237,0.3)',
                        borderRadius: 6, borderWidth: 1, borderColor: 'rgba(124,58,237,0.5)',
                      }}>
                        <Text style={{ fontFamily: Font.jakarta700, color: '#9D5FF0', fontSize: 9 }}>
                          {Math.round(pctUsado)}% del límite
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Métricas verticales */}
                <View style={{ flex: 1, gap: 6 }}>
                  {[
                    { label: 'HOY', value: formatMoney(todaySpent, profile.monedaPrincipal), accent: '#FF5E7D', dim: 'rgba(255,94,125,0.15)' },
                    { label: 'SEMANA', value: formatMoney(weekSpent, profile.monedaPrincipal), accent: '#FFB84D', dim: 'rgba(255,184,77,0.15)' },
                    { label: 'MES', value: formatMoney(gastadoMes, profile.monedaPrincipal), accent: '#7C3AED', dim: 'rgba(124,58,237,0.15)' },
                  ].map((m) => (
                    <View
                      key={m.label}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: m.dim,
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: m.accent + '33',
                      }}>
                      <Text style={{ fontFamily: Font.manrope600, color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: 1 }}>
                        {m.label}
                      </Text>
                      <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 13 }} numberOfLines={1}>
                        {m.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Separador */}
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 12 }} />

              {/* Gamificación badges */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { icon: '🔥', label: 'RACHA', value: `${profile.rachaActual} días`, glow: '#FF5E7D', bg: 'rgba(255,94,125,0.12)', border: 'rgba(255,94,125,0.3)' },
                  { icon: '🎖️', label: 'NIVEL', value: `${profile.nivel}`, glow: '#FFD700', bg: 'rgba(255,215,0,0.1)', border: 'rgba(255,215,0,0.3)' },
                  { icon: '⚡', label: 'XP', value: `${profile.xpActual}`, glow: '#7C3AED', bg: 'rgba(124,58,237,0.15)', border: 'rgba(124,58,237,0.4)' },
                ].map((g) => (
                  <View
                    key={g.label}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 8,
                      backgroundColor: g.bg,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: g.border,
                      ...Platform.select({
                        ios: { shadowColor: g.glow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 8 },
                        android: { elevation: 4 },
                        default: {},
                      }),
                    }}>
                    <Text style={{ fontSize: 18 }}>{g.icon}</Text>
                    <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 15, marginTop: 2 }}>{g.value}</Text>
                    <Text style={{ fontFamily: Font.manrope500, color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: 1 }}>{g.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </GradientView>

          {/* ── CTAs EN FILA ── */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <Pressable
              onPress={() => void openExpenseFlow()}
              style={{
                flex: 2,
                borderRadius: 16,
                overflow: 'hidden',
                shadowColor: T.shadowPrimary,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 1,
                shadowRadius: 16,
                elevation: 10,
              }}>
              <GradientView colors={T.primaryGrad} style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 15 }}>
                  ⚡ REGISTRAR GASTO
                </Text>
                <Text style={{ fontFamily: Font.manrope400, color: onPrimaryGradient.textMuted, fontSize: 11, marginTop: 1 }}>
                  Rápido y fácil
                </Text>
              </GradientView>
            </Pressable>

            <Pressable
              onPress={() => setIncomeSheetOpen(true)}
              style={{
                flex: 1,
                height: 60,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: T.primaryBorder,
                backgroundColor: T.primaryBg,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}>
              <Text style={{ fontSize: 18 }}>📥</Text>
              <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 11 }}>INGRESO</Text>
            </Pressable>
          </View>

          {/* ── BOTONES DE ACCIÓN ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Ver gastos', emoji: '📊', onPress: () => router.push('/(tabs)/gastos' as any) },
              { label: 'Asistente IA', emoji: '🤖', onPress: () => {} },
              { label: 'Conectar banco', emoji: '🏦', onPress: () => {} },
            ].map((btn) => (
              <Pressable
                key={btn.label}
                onPress={btn.onPress}
                style={{
                  flex: 1,
                  backgroundColor: T.card,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  paddingVertical: 10,
                  alignItems: 'center',
                  gap: 4,
                }}>
                <Text style={{ fontSize: 18 }}>{btn.emoji}</Text>
                <Text style={{ fontFamily: Font.manrope500, color: T.textSecondary, fontSize: 10, textAlign: 'center' }}>{btn.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* ── TOP 3 CATEGORÍAS ── */}
          {topCats.length > 0 && (
            <View
              style={{
                backgroundColor: T.card,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: T.glassBorder,
                padding: 14,
                marginBottom: 12,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 14, flex: 1 }}>
                  📈 Top categorías
                </Text>
                <Text style={{ fontFamily: Font.manrope500, color: T.textMuted, fontSize: 11 }}>este mes</Text>
              </View>
              {topCats.map((item, i) => (
                <View key={item.cat} style={{ marginBottom: i < topCats.length - 1 ? 10 : 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 20, marginRight: 8 }}>{catEmoji(item.cat)}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13 }}>
                          {catLabel(item.cat)}
                        </Text>
                        <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 13 }}>
                          {formatMoney(item.total, profile.monedaPrincipal)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11 }}>
                          {item.count} {item.count === 1 ? 'transacción' : 'transacciones'}
                        </Text>
                        <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 11 }}>
                          {item.pct}%
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ height: 4, backgroundColor: T.surface, borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ width: `${item.pct}%`, height: '100%', backgroundColor: i === 0 ? T.primary : i === 1 ? T.secondary : T.tertiary, borderRadius: 2 }} />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── MISIONES ── */}
          <View
            style={{
              backgroundColor: T.card,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 14,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 14, flex: 1 }}>
                🎯 Misiones
              </Text>
              {pendingMissions.length > 0 && (
                <View style={{ backgroundColor: T.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: Font.jakarta700, color: '#fff', fontSize: 11 }}>
                    {pendingMissions.length} disponible{pendingMissions.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>

            {(availableMissions.length > 0 ? availableMissions : [
              { id: 'p1', titulo: 'Descubrí tus tendencias', descripcion: 'Registrá 3 gastos este mes', xpRecompensa: 25, progreso: 0, meta: 3, completada: false },
              { id: 'p2', titulo: 'Conexión bancaria', descripcion: 'Se desbloquea en Nivel 3', xpRecompensa: 50, progreso: 0, meta: 1, completada: false },
              { id: 'p3', titulo: 'Asistente IA', descripcion: 'Próximamente', xpRecompensa: 30, progreso: 0, meta: 1, completada: false },
            ]).map((m, i, arr) => {
              const pct = m.meta > 0 ? Math.min(100, Math.round((m.progreso / m.meta) * 100)) : 0;
              const isPlaceholder = availableMissions.length === 0 && i > 0;
              return (
                <View
                  key={m.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: isPlaceholder ? T.cardElevated : T.primaryBg,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: i < arr.length - 1 ? 8 : 0,
                    borderWidth: 1,
                    borderColor: isPlaceholder ? T.glassBorder : T.primaryBorder,
                    opacity: isPlaceholder ? 0.6 : 1,
                  }}>
                  <Text style={{ fontSize: 22, marginRight: 10 }}>
                    {m.completada ? '✅' : isPlaceholder ? (i === 1 ? '🏦' : '🤖') : '📊'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: Font.jakarta600, color: isPlaceholder ? T.textMuted : T.textPrimary, fontSize: 13 }} numberOfLines={1}>
                        {m.titulo}
                      </Text>
                      <Text style={{ fontFamily: Font.jakarta700, color: isPlaceholder ? T.textMuted : T.primary, fontSize: 11, marginLeft: 6 }}>
                        +{m.xpRecompensa} XP
                      </Text>
                    </View>
                    <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                      {m.descripcion}
                    </Text>
                    {!isPlaceholder && (
                      <View style={{ height: 3, backgroundColor: T.surface, borderRadius: 2, overflow: 'hidden', marginTop: 5 }}>
                        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: T.primary, borderRadius: 2 }} />
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

        </ScrollView>

        <FirstExpenseWalletModal
          visible={firstWalletModalOpen}
          onComplete={handleFirstWalletComplete}
          onSkip={handleFirstWalletSkip}
        />
        <ExpenseFullSheet open={expenseSheetOpen} onDismiss={() => setExpenseSheetOpen(false)} />
        <IncomeSheet open={incomeSheetOpen} onDismiss={() => setIncomeSheetOpen(false)} />
      </View>
    </SafeAreaView>
  );
}
