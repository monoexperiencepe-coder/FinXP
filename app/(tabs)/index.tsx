import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const INSIGHT_INTERVAL_MS = 3800;
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, RadialGradient as SvgRadialGradient, Stop } from 'react-native-svg';

import { ExpenseFullSheet } from '@/components/ExpenseFullSheet';
import { FirstExpenseWalletModal, markFirstExpenseWalletSkipped, shouldShowFirstExpenseWallet } from '@/components/FirstExpenseWalletModal';
import { IncomeSheet } from '@/components/IncomeSheet';
import { WaBotPromoModal } from '@/components/WaBotPromoModal';
import { GradientView } from '@/components/ui/GradientView';
import { APP_CONTENT_MAX_WIDTH } from '@/constants/layout';
import { onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/lib/currency';
import { currentYearMonth, toDateKey } from '@/lib/dates';
import {
  getPendingJarvisSteps,
  loadJarvisSkipped,
  saveJarvisSkipped,
  type JarvisMissionStep,
  type JarvisMissionStepId,
} from '@/lib/jarvisMissions';
import { markWaPromoShown, readThemePickerShown, readWaPromoShown } from '@/lib/preferences';
import { ThemePickerModal } from '@/components/ThemePickerModal';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { MonedaCode } from '@/types';

function whatsappLinkCodeApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/whatsapp-link-code`;
  }
  const base = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (base) return `${base}/api/whatsapp-link-code`;
  return '/api/whatsapp-link-code';
}

function buildWhatsappTargetsFromApiUrl(rawUrl: string): string[] {
  const fallback = [rawUrl];
  try {
    const u = new URL(rawUrl);
    const phone = (u.searchParams.get('phone') || '').replace(/\D/g, '');
    const text = u.searchParams.get('text') || '';
    if (!phone) return fallback;

    const waScheme = `whatsapp://send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
    const waMe = `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

    // Orden pensado para iOS/Android: app nativa -> wa.me -> api.whatsapp.com
    return [waScheme, waMe, rawUrl];
  } catch {
    return fallback;
  }
}

async function openWhatsAppWithFallback(rawUrl: string): Promise<void> {
  const targets = buildWhatsappTargetsFromApiUrl(rawUrl);
  let lastErr: unknown = null;
  for (const t of targets) {
    try {
      await Linking.openURL(t);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw (lastErr instanceof Error ? lastErr : new Error('No se pudo abrir WhatsApp'));
}

/* ────────────────────────────────────────────────────────────────────────────── */

/* ── Premium donut (nativo) — track según modo ── */
function NativeDonut({ usedPct, arcColor, trackColor }: { usedPct: number; arcColor: string; trackColor: string }) {
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
        <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
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

function WebDonut({ usedPct, arcColor, trackColor }: { usedPct: number; arcColor: string; trackColor: string }) {
  if (Platform.OS !== 'web') return null;
  const chartData = [
    { name: 'Usado', value: usedPct, color: arcColor },
    { name: 'Restante', value: Math.max(0, 100 - usedPct), color: trackColor },
  ];
  const { PieChart, Pie, Cell } = require('recharts') as typeof import('recharts');
  return (
    <View style={{ width: 132, height: 132 }}>
      <PieChart width={132} height={132}>
        <Pie
          data={chartData}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={42}
          outerRadius={55}
          startAngle={90}
          endAngle={-270}
          paddingAngle={0}
          isAnimationActive={false}>
          {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} stroke="none" />)}
        </Pie>
      </PieChart>
    </View>
  );
}

type DailyTopCategory = { cat: string; total: number };

function getCurrentStreak(expenses: Array<{ fecha: string }>): number {
  if (!expenses.length) return 0;
  const daySet = new Set<string>();
  for (const e of expenses) {
    daySet.add(toDateKey(new Date(e.fecha)));
  }
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const key = toDateKey(cursor);
    if (!daySet.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getYesterdaySpent(expenses: Array<{ fecha: string; importe: number }>): number {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterdayKey = toDateKey(d);
  return expenses.reduce((sum, e) => {
    const k = toDateKey(new Date(e.fecha));
    return k === yesterdayKey ? sum + e.importe : sum;
  }, 0);
}

function getWeekSpent(
  expenses: Array<{ fecha: string; importe: number }>,
  offset: 0 | 1 = 0,
): number {
  const now = new Date();
  const day = now.getDay(); // 0 domingo, 1 lunes, ...
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday - offset * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return expenses.reduce((sum, e) => {
    const d = new Date(e.fecha);
    return d >= start && d < end ? sum + e.importe : sum;
  }, 0);
}

function buildYesterdayComparison(params: {
  todaySpent: number;
  yesterdaySpent: number;
  moneda: MonedaCode;
}): string {
  const formatComparisonDelta = (amount: number, currency: MonedaCode): string => {
    const rounded = Math.round(amount * 100) / 100;
    const isInt = Number.isInteger(rounded);
    const num = isInt ? String(rounded) : rounded.toFixed(2);
    if (currency === 'PEN') return `S/${num}`;
    if (currency === 'USD') return `$${num}`;
    return formatMoney(rounded, currency).replace(/\s+/g, '');
  };

  const { todaySpent, yesterdaySpent, moneda } = params;
  if (todaySpent === 0) return 'Registra tu primer gasto para comparar con ayer';
  if (yesterdaySpent <= 0 && todaySpent > 0) return 'Hoy ya registraste gastos 💸';
  if (todaySpent < yesterdaySpent) {
    return `Vas ${formatComparisonDelta(yesterdaySpent - todaySpent, moneda)} menos que ayer 💪`;
  }
  if (todaySpent > yesterdaySpent) {
    return `Vas ${formatComparisonDelta(todaySpent - yesterdaySpent, moneda)} más que ayer 👀`;
  }
  return 'Vas igual que ayer ⚖️';
}

function buildWeeklyComparison(params: {
  currentWeek: number;
  previousWeek: number;
  moneda: MonedaCode;
}): string {
  const formatComparisonDelta = (amount: number, currency: MonedaCode): string => {
    const rounded = Math.round(amount * 100) / 100;
    const isInt = Number.isInteger(rounded);
    const num = isInt ? String(rounded) : rounded.toFixed(2);
    if (currency === 'PEN') return `S/${num}`;
    if (currency === 'USD') return `$${num}`;
    return formatMoney(rounded, currency).replace(/\s+/g, '');
  };

  const { currentWeek, previousWeek, moneda } = params;
  if (currentWeek === 0) return 'Registra gastos para ver tu semana';
  if (previousWeek <= 0 && currentWeek > 0) return 'Ya empezaste la semana 💸';
  if (currentWeek < previousWeek) {
    return `Vas ${formatComparisonDelta(previousWeek - currentWeek, moneda)} menos que la semana pasada 💪`;
  }
  if (currentWeek > previousWeek) {
    return `Vas ${formatComparisonDelta(currentWeek - previousWeek, moneda)} más que la semana pasada 👀`;
  }
  return 'Vas igual que la semana pasada ⚖️';
}

function buildFinancialIdentity(expenses: Array<{ fecha: string; categoria: string; importe: number }>): {
  title: string;
  emoji: string;
  description: string;
} {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 29);

  const recent = expenses.filter((e) => {
    const d = new Date(e.fecha);
    return d >= start && d <= now;
  });

  if (recent.length === 0) {
    return {
      title: 'Explorador',
      emoji: '🧭',
      description: 'Empieza registrando gastos para descubrir tu patrón.',
    };
  }

  let total = 0;
  let comida = 0;
  let transporte = 0;
  for (const e of recent) {
    total += e.importe;
    const cat = (e.categoria || '').toLowerCase();
    if (cat.includes('comida')) comida += e.importe;
    if (cat.includes('transporte')) transporte += e.importe;
  }

  const comidaPct = total > 0 ? (comida / total) * 100 : 0;
  const transportePct = total > 0 ? (transporte / total) * 100 : 0;

  if (comidaPct > 40) {
    return {
      title: 'Food lover financiero',
      emoji: '🍔',
      description: 'Gran parte de tu dinero se está yendo en comida.',
    };
  }
  if (transportePct > 30) {
    return {
      title: 'Movilidad activa',
      emoji: '🚌',
      description: 'Tu transporte pesa bastante en tus gastos.',
    };
  }
  return {
    title: 'Balanceado',
    emoji: '⚖️',
    description: 'Tus gastos están bastante distribuidos.',
  };
}

function buildMonthlyProjection(
  expenses: Array<{ fecha: string; importe: number }>,
  moneda: MonedaCode,
): {
  show: boolean;
  learning: boolean;
  projection: number;
  message: string;
  hint: string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const monthExpenses = expenses.filter((e) => {
    const d = new Date(e.fecha);
    return d.getFullYear() === y && d.getMonth() === m;
  });

  if (monthExpenses.length === 0) {
    return {
      show: false,
      learning: false,
      projection: 0,
      message: '',
      hint: '',
    };
  }

  const monthSpent = monthExpenses.reduce((s, e) => s + e.importe, 0);
  const daysWithExpenses = new Set(monthExpenses.map((e) => toDateKey(new Date(e.fecha)))).size;
  const projection = (monthSpent / Math.max(1, dayOfMonth)) * daysInMonth;

  if (daysWithExpenses < 3) {
    return {
      show: true,
      learning: true,
      projection,
      message: 'Aún estamos aprendiendo tu ritmo 👀',
      hint: '',
    };
  }

  const projectionText = formatMoney(projection, moneda).replace(/\s+/g, '');
  return {
    show: true,
    learning: false,
    projection,
    message: `Si sigues así, cerrarías el mes en ${projectionText} 💸`,
    hint:
      projection > monthSpent * 1.3
        ? 'Tu ritmo podría subir este mes'
        : 'Vas construyendo claridad sobre tu dinero',
  };
}

function calculateDailyControlScore(params: {
  todaySpent: number;
  todayTopCats: DailyTopCategory[];
  todayExpenseCount: number;
  estimatedDailyBudget: number | null;
}): {
  score: number;
  label: string;
  emoji: string;
  description: string;
} {
  const { todaySpent, todayTopCats, todayExpenseCount, estimatedDailyBudget } = params;
  let score = 10;

  // Penaliza si gasta por encima del presupuesto diario estimado.
  if (estimatedDailyBudget && estimatedDailyBudget > 0 && todaySpent > estimatedDailyBudget) {
    const overspendRatio = todaySpent / estimatedDailyBudget;
    score -= Math.min(4.2, (overspendRatio - 1) * 4.5);
  }

  // Penaliza concentración excesiva en una sola categoría.
  if (todaySpent > 0 && todayTopCats.length > 0) {
    const dominantPct = (todayTopCats[0].total / todaySpent) * 100;
    if (dominantPct > 60) {
      score -= Math.min(2.3, ((dominantPct - 60) / 40) * 2.3);
    }
  }

  // Penaliza demasiados gastos pequeños en el día.
  if (todayExpenseCount >= 7) {
    if (estimatedDailyBudget && estimatedDailyBudget > 0 && todaySpent <= estimatedDailyBudget * 0.9) {
      score -= Math.min(1.5, (todayExpenseCount - 6) * 0.22);
    } else {
      score -= Math.min(2.0, (todayExpenseCount - 6) * 0.28);
    }
  }

  // En días sin movimiento, muestra control neutro-alto para no castigar.
  if (todayExpenseCount === 0 && todaySpent === 0) {
    score = Math.max(score, 8.5);
  }

  const clamped = Math.max(1, Math.min(10, Math.round(score)));
  if (clamped >= 8) {
    return {
      score: clamped,
      label: 'Buen control',
      emoji: '💪',
      description: 'Tus decisiones de hoy se ven ordenadas y sostenibles.',
    };
  }
  if (clamped >= 5) {
    return {
      score: clamped,
      label: 'Vas bien',
      emoji: '🙂',
      description: 'Vas en buen camino; con un ajuste pequeño cierras mejor el día.',
    };
  }
  return {
    score: clamped,
    label: 'Día caro',
    emoji: '👀',
    description: 'Hoy hubo presión en tus gastos; mañana toca recuperar control.',
  };
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

function ExpenseSavedFeedbackModal({
  visible,
  onContinue,
  T,
  todaySpentText,
  dominantCategoryLabel,
  dominantPct,
  dynamicMessage,
}: {
  visible: boolean;
  onContinue: () => void;
  T: ReturnType<typeof useTheme>['T'];
  todaySpentText: string;
  dominantCategoryLabel: string;
  dominantPct: number;
  dynamicMessage: string;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    if (!visible) return;
    fade.setValue(0);
    slide.setValue(16);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [visible, fade, slide]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onContinue}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 }}>
        <Pressable onPress={onContinue} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(7,10,22,0.52)' }} />
        <Animated.View
          style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 20,
            backgroundColor: T.surface,
            borderWidth: 1,
            borderColor: T.glassBorder,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 14,
            opacity: fade,
            transform: [{ translateY: slide }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.28,
            shadowRadius: 18,
            elevation: 12,
          }}>
          <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 20 }}>
            🔥 Gasto registrado
          </Text>

          <Text style={{ fontFamily: Font.manrope600, color: T.textSecondary, fontSize: 15, marginTop: 12 }}>
            Hoy llevas {todaySpentText} 💸
          </Text>

          <Text style={{ fontFamily: Font.manrope500, color: T.textSecondary, fontSize: 13, marginTop: 10, lineHeight: 18 }}>
            👀 El {dominantPct}% de tu gasto es en {dominantCategoryLabel}
          </Text>

          <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 13, marginTop: 10, lineHeight: 18 }}>
            💡 {dynamicMessage}
          </Text>

          <Pressable
            onPress={onContinue}
            style={{
              marginTop: 14,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: T.primary,
            }}>
            <Text style={{ fontFamily: Font.jakarta700, color: '#fff', fontSize: 14 }}>Continuar</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
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
  const { T, isDark } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const maxW = Math.min(width, APP_CONTENT_MAX_WIDTH);

  const expenses    = useFinanceStore((s) => s.expenses);
  const incomes     = useFinanceStore((s) => s.incomes);
  const budgets     = useFinanceStore((s) => s.budgets);
  const profile     = useFinanceStore((s) => s.profile);
  const missions    = useFinanceStore((s) => s.missions);
  const loadFromSupabase = useFinanceStore((s) => s.loadFromSupabase);
  const session = useAuthStore((s) => s.session);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const sessionUserId = session?.user?.id ?? null;

  const [expenseSheetOpen,    setExpenseSheetOpen]    = useState(false);
  const [incomeSheetOpen,     setIncomeSheetOpen]     = useState(false);
  const [firstWalletModalOpen, setFirstWalletModalOpen] = useState(false);
  const [expenseFeedbackVisible, setExpenseFeedbackVisible] = useState(false);
  const [pendingExpenseFeedback, setPendingExpenseFeedback] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const streakPulse = useRef(new Animated.Value(0)).current;
  const prevComputedStreakRef = useRef(0);
  const [jarvisSkipped, setJarvisSkipped] = useState<JarvisMissionStepId[]>([]);
  const [jarvisLoaded, setJarvisLoaded] = useState(false);
  const [asistenteWhatsappLoading, setAsistenteWhatsappLoading] = useState(false);
  const asistenteWhatsappLock = useRef(false);
  const [waBotPromoVisible, setWaBotPromoVisible] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  /** El promo WA espera a que termine reveal + modal de tema. */
  const [themePickerGateDone, setThemePickerGateDone] = useState(false);
  /** Evita doble apertura del modal por remount/hidratación. */
  const themePickerScheduledRef = useRef(false);
  /** Evita parpadeo con datos del usuario anterior al cambiar de sesión. */
  const [homeReady, setHomeReady] = useState(false);


  /* ── Announcer de insights ── */
  const [insightIdx, setInsightIdx] = useState(0);
  const insightFade = useRef(new Animated.Value(1)).current;
  const insightSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (session) {
      void loadFromSupabase();
    }
  }, [session, loadFromSupabase]);

  // Espera a que el perfil en store sea del usuario de la sesión actual.
  useEffect(() => {
    if (!session || !sessionUserId) {
      setHomeReady(false);
      return;
    }
    if (profile.id !== sessionUserId) {
      setHomeReady(false);
      return;
    }
    const t = setTimeout(() => setHomeReady(true), 1000);
    return () => clearTimeout(t);
  }, [session, sessionUserId, profile.id]);

  useEffect(() => {
    if (!session) {
      setThemePickerVisible(false);
      setThemePickerGateDone(false);
      themePickerScheduledRef.current = false;
    }
  }, [session]);

  // ── Apertura modal de tema tras entrar al home ───────────────────────────────
  useEffect(() => {
    if (!session || !userId || !homeReady) return;
    if (themePickerScheduledRef.current || themePickerVisible || themePickerGateDone) return;
    themePickerScheduledRef.current = true;
    let cancelled = false;
    let modalTimer: ReturnType<typeof setTimeout> | undefined;

    // Se muestra al terminar el efecto progresivo (unos segundos en total).
    modalTimer = setTimeout(() => {
      void readThemePickerShown(userId).then((shown) => {
        if (cancelled) return;
        if (shown) {
          setThemePickerGateDone(true);
          return;
        }
        setThemePickerVisible(true);
      });
    }, 2200);

    return () => {
      cancelled = true;
      if (modalTimer) clearTimeout(modalTimer);
    };
  }, [session, userId, homeReady, themePickerVisible, themePickerGateDone]);

  useEffect(() => {
    void loadJarvisSkipped().then((ids) => {
      setJarvisSkipped(ids);
      setJarvisLoaded(true);
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setToastVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);


  /* ── WhatsApp bot promo ── */
  useEffect(() => {
    if (!session || !themePickerGateDone) return;

    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        const alreadyShown = await readWaPromoShown();
        if (cancelled || alreadyShown) return;

        const { data: { session: freshSession } } = await supabase.auth.getSession();
        const token = freshSession?.access_token;
        if (!token || cancelled) return;

        const apiUrl = whatsappLinkCodeApiUrl();
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { linked?: boolean };
        if (cancelled) return;
        if (data.linked === false) {
          await markWaPromoShown();
          if (!cancelled) setWaBotPromoVisible(true);
        }
      } catch {
        /* silencioso: el promo no es crítico */
      }
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [session, themePickerGateDone]);

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
  const handleExpenseSavedSuccess = useCallback(() => {
    setPendingExpenseFeedback(true);
  }, []);

  useEffect(() => {
    if (!pendingExpenseFeedback || expenseSheetOpen) return;
    const t = setTimeout(() => {
      setExpenseFeedbackVisible(true);
      setPendingExpenseFeedback(false);
    }, 140);
    return () => clearTimeout(t);
  }, [pendingExpenseFeedback, expenseSheetOpen]);

  const handleAsistenteWhatsapp = useCallback(async () => {
    if (asistenteWhatsappLock.current) return;
    asistenteWhatsappLock.current = true;
    setAsistenteWhatsappLoading(true);
    try {
      console.log('[Asistente IA] before supabase.auth.getSession()');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const token = session?.access_token;
      console.log('[Asistente IA] after getSession()', {
        hasAccessToken: !!token,
        accessTokenLength: token ? token.length : 0,
        sessionError: sessionError?.message ?? null,
      });
      if (!token) {
        Alert.alert(
          'WhatsApp',
          sessionError?.message || 'Iniciá sesión para vincular tu asistente por WhatsApp.',
        );
        return;
      }
      const apiUrl = whatsappLinkCodeApiUrl();
      console.log('[Asistente IA] fetch url', apiUrl);
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      console.log('[Asistente IA] fetch response', { status: res.status, responseText: text });
      let data: { linked?: boolean; code?: string; whatsappUrl?: string; error?: string } = {};
      let parseErr: Error | null = null;
      try {
        data = text ? (JSON.parse(text) as { whatsappUrl?: string; error?: string }) : {};
      } catch (e) {
        parseErr = e instanceof Error ? e : new Error(String(e));
        data = {};
      }
      if (!res.ok) {
        Alert.alert('WhatsApp', data.error || text || `HTTP ${res.status}`);
        return;
      }
      if (parseErr) {
        Alert.alert('WhatsApp', `JSON inválido: ${parseErr.message}\n\n${text.slice(0, 400)}`);
        return;
      }
      const url = data.whatsappUrl;
      if (typeof url !== 'string' || !url) {
        Alert.alert('WhatsApp', `Respuesta inesperada del servidor.\n\n${text.slice(0, 400)}`);
        return;
      }
      if (data.linked === true) {
        console.log('[Asistente IA] linked user -> open direct WhatsApp');
      } else if (data.linked === false) {
        console.log('[Asistente IA] unlinked user -> open WhatsApp with code');
      }
      console.log('[Asistente IA] openURL with fallback', { whatsappUrl: url });
      await openWhatsAppWithFallback(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Asistente IA] catch', e);
      Alert.alert('WhatsApp', msg || 'Intentá de nuevo en un rato.');
    } finally {
      asistenteWhatsappLock.current = false;
      setAsistenteWhatsappLoading(false);
    }
  }, []);

  const handleFirstWalletSkip = useCallback(async () => {
    await markFirstExpenseWalletSkipped();
    setFirstWalletModalOpen(false);
    setExpenseSheetOpen(true);
  }, []);

  const handleWaPromoConnect = useCallback(() => {
    setWaBotPromoVisible(false);
    void handleAsistenteWhatsapp();
  }, [handleAsistenteWhatsapp]);

  /* ── Derived data ── */
  const initial   = useMemo(() => (profile.nombreUsuario?.trim()?.charAt(0) || 'U').toUpperCase(), [profile.nombreUsuario]);
  const mesActual = useMemo(() => currentYearMonth(), []);
  const todayKey  = useMemo(() => toDateKey(new Date()), []);

  const gastadoMes = useMemo(
    () => expenses.filter((e) => e.mes === mesActual).reduce((s, e) => s + e.importe, 0),
    [expenses, mesActual],
  );
  const limiteMes = useMemo(() => budgets.reduce((s, b) => s + b.limiteMonthly, 0), [budgets]);
  const ingresosSalarioMes = useMemo(
    () =>
      incomes
        .filter((i) => i.mes === mesActual && i.tipo === 'Salario')
        .reduce((s, i) => s + i.importe, 0),
    [incomes, mesActual],
  );
  const sueldoRegistrado = useMemo(() => {
    const raw = session?.user?.user_metadata?.sueldo_mensual_fijo;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [session?.user?.user_metadata?.sueldo_mensual_fijo]);
  const sueldoBase = sueldoRegistrado > 0 ? sueldoRegistrado : ingresosSalarioMes;
  const presupuestoRecomendadoMes = sueldoBase > 0 ? sueldoBase * 0.7 : limiteMes;
  const ahorroObjetivoMes = sueldoBase > 0 ? sueldoBase * 0.3 : 0;
  const pctUsado  = presupuestoRecomendadoMes > 0 ? Math.min((gastadoMes / presupuestoRecomendadoMes) * 100, 100) : 0;

  const todaySpent = useMemo(
    () => expenses.filter((e) => toDateKey(new Date(e.fecha)) === todayKey).reduce((s, e) => s + e.importe, 0),
    [expenses, todayKey],
  );
  const todayExpenseCount = useMemo(
    () => expenses.filter((e) => toDateKey(new Date(e.fecha)) === todayKey).length,
    [expenses, todayKey],
  );
  const weekSpent = useMemo(() => getWeekSpent(expenses, 0), [expenses]);
  const previousWeekSpent = useMemo(() => getWeekSpent(expenses, 1), [expenses]);
  const yesterdaySpent = useMemo(() => getYesterdaySpent(expenses), [expenses]);
  const currentStreak = useMemo(() => getCurrentStreak(expenses), [expenses]);
  const currentDayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(1, daysInMonth - currentDayOfMonth + 1);
  const restanteRecomendado = Math.max(0, presupuestoRecomendadoMes - gastadoMes);
  const topeDiarioRecomendado = presupuestoRecomendadoMes > 0 ? restanteRecomendado / daysRemaining : 0;
  const quickSummaryRows = useMemo(
    () => [
      {
        label: 'HOY',
        value: formatMoney(todaySpent, profile.monedaPrincipal),
        accent: '#FF5E7D',
        dim: isDark ? 'rgba(255,94,125,0.15)' : 'rgba(255,94,125,0.08)',
        borderA: isDark ? '33' : '28',
      },
      {
        label: 'SEMANA',
        value: formatMoney(weekSpent, profile.monedaPrincipal),
        accent: '#FFB84D',
        dim: isDark ? 'rgba(255,184,77,0.15)' : 'rgba(255,184,77,0.1)',
        borderA: isDark ? '33' : '28',
      },
      {
        label: 'MES',
        value: formatMoney(gastadoMes, profile.monedaPrincipal),
        subValue: presupuestoRecomendadoMes > 0
          ? `Te quedan ${formatMoney(restanteRecomendado, profile.monedaPrincipal)} · ${formatMoney(topeDiarioRecomendado, profile.monedaPrincipal)}/día`
          : undefined,
        accent: '#7C3AED',
        dim: isDark ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.08)',
        borderA: isDark ? '33' : '28',
      },
    ],
    [
      todaySpent,
      weekSpent,
      gastadoMes,
      profile.monedaPrincipal,
      presupuestoRecomendadoMes,
      restanteRecomendado,
      topeDiarioRecomendado,
      isDark,
    ],
  );
  const todayHeaderDate = `${String(currentDayOfMonth).padStart(2, '0')} ${new Date()
    .toLocaleDateString('es-PE', { month: 'long' })
    .replace('.', '')
    .toUpperCase()}`;

  /* Top 4 categorías de HOY (para resumen rápido en home) */
  const todayTopCats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      if (toDateKey(new Date(e.fecha)) !== todayKey) continue;
      map[e.categoria] = (map[e.categoria] || 0) + e.importe;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cat, total]) => ({ cat, total }));
  }, [expenses, todayKey]);
  const estimatedDailyBudget = useMemo(() => {
    if (presupuestoRecomendadoMes <= 0 || daysInMonth <= 0) return null;
    return presupuestoRecomendadoMes / daysInMonth;
  }, [presupuestoRecomendadoMes, daysInMonth]);
  const dominantTodayCat = todayTopCats[0] ?? null;
  const dominantTodayPct = useMemo(
    () => (todaySpent > 0 && dominantTodayCat ? Math.round((dominantTodayCat.total / todaySpent) * 100) : 0),
    [todaySpent, dominantTodayCat],
  );
  const expenseFeedbackMessage = useMemo(() => {
    const catName = dominantTodayCat?.cat ?? 'esta categoría';
    if (dominantTodayPct > 60) return `Estás concentrando mucho gasto en ${catName}`;
    if (estimatedDailyBudget && todaySpent > estimatedDailyBudget) return 'Hoy ya vas alto en gasto';
    return 'Buen control por ahora 💪';
  }, [dominantTodayPct, dominantTodayCat, estimatedDailyBudget, todaySpent]);

  useEffect(() => {
    if (currentStreak > prevComputedStreakRef.current) {
      streakPulse.setValue(0);
      Animated.sequence([
        Animated.timing(streakPulse, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(streakPulse, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
    prevComputedStreakRef.current = currentStreak;
  }, [currentStreak, streakPulse]);

  const streakScale = streakPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const streakGlow = streakPulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.34] });
  const streakText = useMemo(() => {
    if (currentStreak <= 0) return 'Empieza tu racha hoy 🔥';
    if (currentStreak >= 7) return `🔥 ${currentStreak} días — increíble`;
    return `🔥 ${currentStreak} días seguidos`;
  }, [currentStreak]);
  const financialIdentity = useMemo(() => {
    if (currentStreak >= 7) {
      return {
        title: 'Controlando',
        emoji: '💪',
        description: 'Estás construyendo un hábito financiero fuerte.',
      };
    }
    return buildFinancialIdentity(expenses);
  }, [expenses, currentStreak]);
  const monthlyProjection = useMemo(
    () => buildMonthlyProjection(expenses, profile.monedaPrincipal),
    [expenses, profile.monedaPrincipal],
  );
  const yesterdayComparisonText = useMemo(
    () =>
      buildYesterdayComparison({
        todaySpent,
        yesterdaySpent,
        moneda: profile.monedaPrincipal,
      }),
    [todaySpent, yesterdaySpent, profile.monedaPrincipal],
  );
  const weeklyComparisonText = useMemo(
    () =>
      buildWeeklyComparison({
        currentWeek: weekSpent,
        previousWeek: previousWeekSpent,
        moneda: profile.monedaPrincipal,
      }),
    [weekSpent, previousWeekSpent, profile.monedaPrincipal],
  );
  const dailyControl = useMemo(
    () =>
      calculateDailyControlScore({
        todaySpent,
        todayTopCats,
        todayExpenseCount,
        estimatedDailyBudget,
      }),
    [todaySpent, todayTopCats, todayExpenseCount, estimatedDailyBudget],
  );
  const hasTodaySpendData = todaySpent > 0;
  const donutCenter = useMemo(
    () =>
      hasTodaySpendData
        ? {
            title: 'CONTROL',
            value: `${dailyControl.score}/10`,
            subtitle: `${dailyControl.label} ${dailyControl.emoji}`,
          }
        : {
            title: 'HOY',
            value: 'Sin datos',
            subtitle: 'Registra tu primer gasto',
          },
    [hasTodaySpendData, dailyControl.score, dailyControl.label, dailyControl.emoji],
  );
  const dailyControlPct = hasTodaySpendData ? dailyControl.score * 10 : 18;

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
  /* Batería de insights para el announcer (basados en datos reales de hoy) */
  const todayInsights = useMemo<{ icon: string; text: string }[]>(() => {
    if (todaySpent <= 0 || todayTopCats.length === 0) {
      return [
        { icon: '💡', text: 'Registra tu primer gasto del día para ver tu análisis en vivo.' },
      ];
    }

    const out: { icon: string; text: string }[] = [];
    const fmt = (n: number) => formatMoney(n, profile.monedaPrincipal);

    // 1. Top categoría + su porcentaje
    const top = todayTopCats[0];
    const topPct = Math.round((top.total / todaySpent) * 100);
    if (topPct >= 50) {
      out.push({ icon: '👀', text: `${topPct}% del gasto de hoy es solo en ${top.cat} (${fmt(top.total)})` });
    } else {
      out.push({ icon: catEmoji(top.cat), text: `Tu mayor gasto hoy: ${top.cat} con ${topPct}% del total (${fmt(top.total)})` });
    }

    // 2. Comparativa comida vs transporte
    const comida = todayTopCats.find((x) => x.cat === 'comida')?.total ?? 0;
    const transporte = todayTopCats.find((x) => x.cat === 'transporte')?.total ?? 0;
    if (comida > 0 && transporte > 0) {
      const diff = Math.abs(comida - transporte);
      if (comida > transporte) {
        out.push({ icon: '🍔', text: `Hoy gastás ${Math.round((comida / transporte - 1) * 100)}% más en comida que en transporte (+${fmt(diff)})` });
      } else {
        out.push({ icon: '🚌', text: `Hoy gastás ${Math.round((transporte / comida - 1) * 100)}% más en transporte que en comida (+${fmt(diff)})` });
      }
    } else if (comida > 0 && comida === top.total) {
      out.push({ icon: '🍔', text: `Comida lidera tus gastos hoy con ${topPct}% del total` });
    }

    // 3. Distribución
    if (todayTopCats.length >= 3) {
      const otherPct = 100 - topPct;
      out.push({ icon: '📊', text: `Tus gastos de hoy se dividen en ${todayTopCats.length} categorías — el ${otherPct}% restante está bien distribuido` });
    }

    // 4. Promedio por categoría
    const avg = Math.round(todaySpent / todayTopCats.length);
    out.push({ icon: '📈', text: `Promedio de gasto por categoría hoy: ${fmt(avg)}` });

    // 5. Segunda categoría si existe
    if (todayTopCats.length >= 2) {
      const sec = todayTopCats[1];
      const secPct = Math.round((sec.total / todaySpent) * 100);
      out.push({ icon: catEmoji(sec.cat), text: `Segunda categoría del día: ${sec.cat} con ${secPct}% (${fmt(sec.total)})` });
    }

    return out.length > 0 ? out : [{ icon: '✅', text: 'Buen control hoy. Seguí así.' }];
  }, [todaySpent, todayTopCats, profile.monedaPrincipal]);

  /* Missions summary */
  const pendingMissions  = useMemo(() => missions.filter((m) => !m.completada), [missions]);
  const availableMissions = pendingMissions.slice(0, 3);

  const pendingJarvisSteps = useMemo(
    () =>
      jarvisLoaded
        ? getPendingJarvisSteps({ expenses, incomes, budgets, profile, skipped: jarvisSkipped })
        : [],
    [jarvisLoaded, expenses, incomes, budgets, profile, jarvisSkipped],
  );

  const skipJarvisStep = useCallback(async (id: JarvisMissionStepId) => {
    const next = [...jarvisSkipped, id];
    setJarvisSkipped(next);
    await saveJarvisSkipped(next);
  }, [jarvisSkipped]);

  const onJarvisStepCta = useCallback(
    (step: JarvisMissionStep) => {
      switch (step.id) {
        case 'primer_gasto':
        case 'racha_3_dias':
          void openExpenseFlow();
          break;
        case 'primer_ingreso':
          setIncomeSheetOpen(true);
          break;
        case 'establecer_presupuesto':
          router.push('/(tabs)/resumen' as any);
          break;
        case 'definir_meta':
          router.push('/(tabs)/perfil' as any);
          break;
      }
    },
    [openExpenseFlow, router],
  );

  /* Ciclo del announcer: fade-out + slide-up → cambiar texto → fade-in */
  useEffect(() => {
    if (todayInsights.length <= 1) return;
    const total = todayInsights.length;
    const cycle = setInterval(() => {
      Animated.parallel([
        Animated.timing(insightFade,  { toValue: 0, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(insightSlide, { toValue: -10, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setInsightIdx((prev) => (prev + 1) % total);
        insightSlide.setValue(10);
        Animated.parallel([
          Animated.timing(insightFade,  { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(insightSlide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
      });
    }, INSIGHT_INTERVAL_MS);
    return () => clearInterval(cycle);
  }, [todayInsights.length]);

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

  const premiumGrad = isDark ? (['#1A0B3B', '#0D1040', '#0A1628'] as const) : (['#FFFFFF', '#F6F1FF', '#EDE6FF'] as const);
  const donutTrackColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26,16,53,0.1)';
  const arcColorDonut = !hasTodaySpendData
    ? (isDark ? 'rgba(255,255,255,0.30)' : 'rgba(124,58,237,0.35)')
    : dailyControl.score <= 4
      ? '#FF5E7D'
      : dailyControl.score <= 7
        ? '#FFB84D'
        : '#7C3AED';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <ThemePickerModal
        visible={themePickerVisible}
        onDone={() => {
          setThemePickerVisible(false);
          setThemePickerGateDone(true);
        }}
      />
      <View style={{ flex: 1, maxWidth: maxW, width: '100%', alignSelf: 'center' }}>
        {!homeReady ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator size="small" color={T.primary} />
            <Text style={{ fontFamily: Font.manrope500, fontSize: 12, color: T.textMuted }}>
              Cargando tu inicio...
            </Text>
          </View>
        ) : (
          <>
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
            {/* Avatar con anillo de glow en dark */}
            <View style={{ marginRight: 12 }}>
              <View
                style={{
                  width: 50, height: 50, borderRadius: 25,
                  alignItems: 'center', justifyContent: 'center',
                  ...(isDark
                    ? { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 14, elevation: 10 }
                    : {}),
                }}>
                <GradientView
                  colors={T.primaryGrad}
                  style={{
                    width: 50, height: 50, borderRadius: 25,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: isDark ? 'rgba(157,95,240,0.6)' : T.primaryBorder,
                  }}>
                  <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 20 }}>{initial}</Text>
                </GradientView>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 20, lineHeight: 26 }}>
                ¡Hola, {profile.nombreUsuario || 'Usuario'}! 👋
              </Text>
              <Text style={{ fontFamily: Font.manrope400, color: T.textSecondary, fontSize: 12 }} numberOfLines={1}>
                {motivPhrase}
              </Text>
            </View>
            {/* Notificación / status live dot en dark */}
            {isDark && (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4DF2B1', marginLeft: 8,
                shadowColor: '#4DF2B1', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 6 }}
              />
            )}
          </View>

          {/* ── CARD PREMIUM ── */}
          <View>
          <GradientView
            colors={premiumGrad}
            style={{
              borderRadius: 22,
              marginBottom: 12,
              overflow: 'hidden',
              borderWidth: isDark ? 0 : 1,
              borderColor: isDark ? 'transparent' : T.glassBorder,
              ...Platform.select({
                ios: {
                  shadowColor: '#7C3AED',
                  shadowOffset: { width: 0, height: isDark ? 12 : 8 },
                  shadowOpacity: isDark ? 0.5 : 0.18,
                  shadowRadius: isDark ? 24 : 14,
                },
                android: { elevation: isDark ? 18 : 6 },
                web: {
                  boxShadow: isDark
                    ? '0 12px 40px rgba(124,58,237,0.35)'
                    : '0 8px 24px rgba(124,58,237,0.1)',
                } as object,
              }),
            }}>
            {/* Borde superior con gradiente de acento */}
            <View style={{ height: 2, backgroundColor: 'transparent' }}>
              <GradientView
                colors={isDark ? ['#7C3AED', '#00D4FF', '#4DF2B1'] : ['#8B5CF6', '#38BDF8', '#34D399']}
                style={{ height: 2 }}
              />
            </View>

            {/* Orb decorativo de fondo */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', top: -30, right: -30,
                width: 160, height: 160, borderRadius: 80,
                backgroundColor: isDark ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.08)',
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', bottom: -20, left: 20,
                width: 100, height: 100, borderRadius: 50,
                backgroundColor: isDark ? 'rgba(0,212,255,0.07)' : 'rgba(0,153,187,0.06)',
              }}
            />

            <View style={{ padding: 16 }}>

              {/* ── 1. CONTROL DEL DÍA ─────────────────────────────────── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                {/* Donut */}
                <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ position: 'absolute' }}>
                    {Platform.OS === 'web'
                      ? <WebDonut usedPct={dailyControlPct} arcColor={arcColorDonut} trackColor={donutTrackColor} />
                      : <NativeDonut usedPct={dailyControlPct} arcColor={arcColorDonut} trackColor={donutTrackColor} />}
                  </View>
                  <View style={{ alignItems: 'center', justifyContent: 'center', width: 104, paddingHorizontal: 6 }}>
                    <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.62)' : T.textMuted, fontSize: 9, letterSpacing: 1.2 }}>
                      {donutCenter.title}
                    </Text>
                    <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: hasTodaySpendData ? 24 : 20, lineHeight: hasTodaySpendData ? 26 : 24, textAlign: 'center', letterSpacing: -0.4, marginTop: 1 }}>
                      {donutCenter.value}
                    </Text>
                    <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.52)' : T.textSecondary, fontSize: 10, marginTop: 3, textAlign: 'center', lineHeight: 12 }} numberOfLines={2}>
                      {donutCenter.subtitle}
                    </Text>
                  </View>
                </View>

                {/* Resumen HOY / SEMANA / MES */}
                <View style={{ flex: 1, gap: 5, justifyContent: 'center' }}>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.35)' : T.textMuted, fontSize: 9, letterSpacing: 1.2, marginLeft: 2 }}>
                    Así va tu día
                  </Text>
                  {quickSummaryRows.map((m) => (
                    <View
                      key={m.label}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        minHeight: 32,
                        backgroundColor: m.dim,
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: m.accent + m.borderA,
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 }}>
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: m.accent }} />
                        <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.5)' : T.textMuted, fontSize: 10, letterSpacing: 1 }}>
                          {m.label}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: 8 }}>
                        <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 13 }} numberOfLines={1}>
                          {m.value}
                        </Text>
                        {m.subValue ? (
                          <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.35)' : T.textMuted, fontSize: 9, marginTop: 1, textAlign: 'right' }}>
                            {m.subValue}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                  {presupuestoRecomendadoMes > 0 ? (
                    <Text style={{ fontFamily: Font.manrope600, fontSize: 9, marginLeft: 2, color: currentDayOfMonth >= daysInMonth && gastadoMes <= presupuestoRecomendadoMes ? (isDark ? '#4DF2B1' : '#0B8E52') : (isDark ? 'rgba(255,255,255,0.38)' : T.textMuted) }}>
                      {currentDayOfMonth >= daysInMonth && gastadoMes <= presupuestoRecomendadoMes
                        ? `🎉 Ahorraste ${formatMoney(ahorroObjetivoMes, profile.monedaPrincipal)} este mes`
                        : `Meta: hasta ${formatMoney(presupuestoRecomendadoMes, profile.monedaPrincipal)} · ahorra ${formatMoney(ahorroObjetivoMes, profile.monedaPrincipal)}`}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* ── 2. PROGRESO ────────────────────────────────────────── */}
              <View style={{
                borderRadius: 14,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(124,58,237,0.04)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(124,58,237,0.12)',
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
                gap: 8,
              }}>
                <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.40)' : T.textMuted, fontSize: 10, letterSpacing: 1.2 }}>
                  PROGRESO
                </Text>

                {/* Racha */}
                <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ scale: streakScale }] }}>
                  <Text style={{ fontSize: 14 }}>🔥</Text>
                  <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFD8A6' : T.textPrimary, fontSize: 13 }}>
                    {currentStreak > 0 ? `${currentStreak} días seguidos` : 'Sin racha aún'}
                  </Text>
                  {currentStreak >= 7 && (
                    <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,184,77,0.8)' : T.primary, fontSize: 11 }}>
                      — increíble
                    </Text>
                  )}
                </Animated.View>

                {/* Divider interno */}
                <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(124,58,237,0.08)' }} />

                {/* Ayer */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.38)' : T.textMuted, fontSize: 11, width: 52 }}>
                    vs ayer
                  </Text>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.82)' : T.textPrimary, fontSize: 12, flex: 1 }}>
                    {yesterdayComparisonText}
                  </Text>
                </View>

                {/* Semana */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.38)' : T.textMuted, fontSize: 11, width: 52 }}>
                    vs sem.
                  </Text>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.82)' : T.textPrimary, fontSize: 12, flex: 1 }}>
                    {weeklyComparisonText}
                  </Text>
                </View>
              </View>

              {/* ── 3. PERFIL FINANCIERO ────────────────────────────────── */}
              <View style={{
                borderRadius: 14,
                backgroundColor: isDark ? 'rgba(77,242,177,0.07)' : 'rgba(124,58,237,0.04)',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(77,242,177,0.22)' : 'rgba(124,58,237,0.12)',
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 10,
              }}>
                <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.40)' : T.textMuted, fontSize: 10, letterSpacing: 1.2 }}>
                  PERFIL FINANCIERO
                </Text>
                <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#EFFFF7' : T.textPrimary, fontSize: 14, marginTop: 6 }}>
                  {financialIdentity.emoji} {financialIdentity.title}
                </Text>
                <Text style={{ fontFamily: Font.manrope500, color: isDark ? 'rgba(255,255,255,0.68)' : T.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                  {financialIdentity.description}
                </Text>
              </View>

              {/* ── 4. PROYECCIÓN MENSUAL ───────────────────────────────── */}
              {monthlyProjection.show ? (
                <View style={{
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(0,212,255,0.07)' : 'rgba(0,153,187,0.04)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(0,212,255,0.22)' : 'rgba(0,153,187,0.14)',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 10,
                }}>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.40)' : T.textMuted, fontSize: 10, letterSpacing: 1.2 }}>
                    PROYECCIÓN MENSUAL
                  </Text>
                  <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#E9FBFF' : T.textPrimary, fontSize: 13, marginTop: 6, lineHeight: 18 }}>
                    {monthlyProjection.message}
                  </Text>
                  {!monthlyProjection.learning && monthlyProjection.hint ? (
                    <Text style={{ fontFamily: Font.manrope500, color: isDark ? 'rgba(255,255,255,0.65)' : T.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                      {monthlyProjection.hint}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* ── Separador ─────────────────────────────────────────── */}
              <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(124,58,237,0.12)', marginBottom: 12 }} />

              {/* ── 5. ANNOUNCER (ANÁLISIS EN VIVO) ────────────────────── */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <GradientView
                    colors={isDark ? (['#7C3AED', '#00D4FF'] as const) : ([T.primary, T.primary] as const)}
                    style={{ width: 3, height: 14, borderRadius: 2 }}
                  />
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.35)' : T.textMuted, fontSize: 9, letterSpacing: 1.5 }}>
                    ANÁLISIS EN VIVO
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 3, marginLeft: 'auto' }}>
                    {todayInsights.map((_, di) => (
                      <View key={di} style={{ width: di === insightIdx ? 12 : 4, height: 4, borderRadius: 2, backgroundColor: di === insightIdx ? (isDark ? '#9D5FF0' : T.primary) : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(124,58,237,0.18)') }} />
                    ))}
                  </View>
                </View>
                <Animated.View style={{
                  opacity: insightFade,
                  transform: [{ translateY: insightSlide }],
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: isDark ? 'rgba(157,95,240,0.1)' : 'rgba(124,58,237,0.06)',
                  borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(157,95,240,0.28)' : 'rgba(124,58,237,0.16)',
                  ...Platform.select({
                    ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 3 }, shadowOpacity: isDark ? 0.35 : 0, shadowRadius: 8 },
                    android: {},
                    web: isDark ? { boxShadow: '0 2px 12px rgba(124,58,237,0.2)' } as object : {},
                  }),
                }}>
                  <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: isDark ? 'rgba(157,95,240,0.22)' : 'rgba(124,58,237,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(157,95,240,0.4)' : 'rgba(124,58,237,0.2)' }}>
                    <Text style={{ fontSize: 15 }}>{todayInsights[insightIdx]?.icon ?? '💡'}</Text>
                  </View>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? '#D4C5FF' : T.textPrimary, fontSize: 12, flex: 1, lineHeight: 18 }}>
                    {todayInsights[insightIdx]?.text ?? ''}
                  </Text>
                </Animated.View>
              </View>

              {/* ── 6. CATEGORÍAS DEL DÍA ──────────────────────────────── */}
              <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontFamily: Font.manrope600, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 13, letterSpacing: 2.6, textTransform: 'uppercase' }}>
                  HOY
                </Text>
                <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: isDark ? 'rgba(124,58,237,0.3)' : 'rgba(124,58,237,0.14)', borderWidth: 1, borderColor: isDark ? 'rgba(124,58,237,0.65)' : 'rgba(124,58,237,0.35)' }}>
                  <Text style={{ fontFamily: Font.manrope600, color: isDark ? '#E1D8FF' : T.primary, fontSize: 12, letterSpacing: 0.7 }}>
                    📅 {todayHeaderDate}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 28, lineHeight: 32, letterSpacing: -0.6 }}>
                  {formatMoney(todaySpent, profile.monedaPrincipal)}
                </Text>
                <Text style={{ fontFamily: Font.manrope500, color: isDark ? 'rgba(255,255,255,0.55)' : T.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Total de hoy
                </Text>
              </View>
              {todayTopCats.length > 0 ? (
                <View style={{ gap: 6 }}>
                  {todayTopCats.map((it, idx) => {
                    const barColors = isDark
                      ? (['#7C3AED', '#00D4FF', '#4DF2B1', '#FF5E7D'] as const)
                      : ([T.primary, T.primary, T.primary, '#FF5E7D'] as const);
                    const accent = barColors[idx % 4];
                    const pctOfToday = todaySpent > 0 ? Math.round((it.total / todaySpent) * 100) : 0;
                    return (
                      <View key={it.cat} style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(124,58,237,0.04)',
                        borderRadius: 10,
                        paddingHorizontal: 10, paddingVertical: 7,
                        borderLeftWidth: 2, borderLeftColor: accent,
                        borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(124,58,237,0.08)',
                        borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(124,58,237,0.08)',
                        borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(124,58,237,0.08)',
                      }}>
                        <Text style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{catEmoji(it.cat)}</Text>
                        <Text style={{ fontFamily: Font.manrope600, color: T.textSecondary, fontSize: 12, flex: 1, textTransform: 'capitalize' }}>
                          {it.cat}
                        </Text>
                        <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 12 }}>
                          {formatMoney(it.total, profile.monedaPrincipal)}
                        </Text>
                        <View style={{ backgroundColor: isDark ? `${accent}30` : `${accent}20`, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Text style={{ fontFamily: Font.manrope600, color: accent, fontSize: 9 }}>
                            {pctOfToday}%
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 10, gap: 4 }}>
                  <Text style={{ fontSize: 20 }}>💡</Text>
                  <Text style={{ fontFamily: Font.manrope500, color: T.textMuted, fontSize: 12, textAlign: 'center' }}>
                    Registra tu primer gasto y te mostraré cómo va tu día 💸
                  </Text>
                </View>
              )}

            </View>
          </GradientView>
          </View>

          {/* ── CTAs EN FILA ── */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            {/* GASTO */}
            <Pressable
              onPress={() => void openExpenseFlow()}
              style={{
                flex: 2, borderRadius: 16, overflow: 'hidden',
                shadowColor: '#7C3AED',
                shadowOffset: { width: 0, height: isDark ? 10 : 6 },
                shadowOpacity: isDark ? 0.7 : 0.4,
                shadowRadius: isDark ? 20 : 14,
                elevation: isDark ? 14 : 10,
              }}>
              <GradientView colors={['#8B47FF', '#5B21B6']} style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
                {/* Brillo sutil superior */}
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                  backgroundColor: 'rgba(255,255,255,0.25)',
                }} />
                <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 15 }}>
                  ⚡ REGISTRAR GASTO
                </Text>
                <Text style={{ fontFamily: Font.manrope400, color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1 }}>
                  Rápido y fácil
                </Text>
              </GradientView>
            </Pressable>

            {/* INGRESO */}
            <Pressable
              onPress={() => setIncomeSheetOpen(true)}
              style={{
                flex: 1, height: 60, borderRadius: 16,
                borderWidth: isDark ? 1 : 1,
                borderColor: isDark ? 'rgba(0,212,255,0.35)' : T.primaryBorder,
                backgroundColor: isDark ? 'rgba(0,212,255,0.08)' : T.primaryBg,
                alignItems: 'center', justifyContent: 'center', gap: 2,
                ...(isDark ? {
                  shadowColor: '#00D4FF',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 12,
                  elevation: 8,
                } : {}),
              }}>
              <Text style={{ fontSize: 18 }}>📥</Text>
              <Text style={{ fontFamily: Font.manrope600, color: isDark ? '#00D4FF' : T.primary, fontSize: 11 }}>INGRESO</Text>
            </Pressable>
          </View>

          {/* ── BOTONES DE ACCIÓN ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {(
              [
                { label: 'Ver gastos', emoji: '📊', accent: '#7C3AED', onPress: () => router.push('/(tabs)/gastos' as any) },
                {
                  label: 'Asistente IA',
                  emoji: '🤖',
                  accent: '#00D4FF',
                  onPress: () => { void handleAsistenteWhatsapp(); },
                  loading: asistenteWhatsappLoading,
                },
                { label: 'Conectar banco', emoji: '🏦', accent: '#4DF2B1', onPress: () => {} },
              ] as const
            ).map((btn) => {
              const loading = 'loading' in btn && btn.loading;
              return (
              <Pressable
                key={btn.label}
                onPress={btn.onPress}
                disabled={!!loading}
                style={{
                  flex: 1,
                  backgroundColor: isDark ? `${btn.accent}11` : T.card,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: isDark ? `${btn.accent}30` : T.glassBorder,
                  paddingVertical: 10,
                  alignItems: 'center', gap: 4,
                  opacity: loading ? 0.75 : 1,
                  ...(isDark ? {
                    shadowColor: btn.accent,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                    elevation: 6,
                  } : {}),
                }}>
                {loading ? (
                  <ActivityIndicator size="small" color={btn.accent} />
                ) : (
                <Text style={{ fontSize: 18 }}>{btn.emoji}</Text>
                )}
                <Text style={{ fontFamily: Font.manrope500, color: isDark ? `${btn.accent}CC` : T.textSecondary, fontSize: 10, textAlign: 'center' }}>
                  {btn.label}
                </Text>
              </Pressable>
            ); })}
          </View>

          {/* ── Progreso del jugador ── */}
          <View style={{
            flexDirection: 'row',
            gap: 0,
            marginBottom: 12,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.07)' : T.glassBorder,
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : T.card,
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 12 },
              android: { elevation: isDark ? 6 : 2 },
              web: { boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.06)' } as object,
            }),
          }}>
            {[
              { icon: '🔥', label: 'Racha', value: `${profile.rachaActual} d`, color: '#FF5E7D', accent: 'rgba(255,94,125,0.18)' },
              { icon: '🎖️', label: 'Nivel',  value: `${profile.nivel}`,          color: '#FFD700', accent: 'rgba(255,215,0,0.12)' },
              { icon: '⚡',  label: 'XP',     value: `${profile.xpActual}`,       color: '#9D5FF0', accent: 'rgba(157,95,240,0.15)' },
            ].map((g, i, arr) => (
              <View
                key={g.label}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 10,
                  backgroundColor: isDark ? g.accent : 'transparent',
                  borderRightWidth: i < arr.length - 1 ? 1 : 0,
                  borderRightColor: isDark ? 'rgba(255,255,255,0.07)' : T.glassBorder,
                  gap: 2,
                }}>
                <Text style={{ fontSize: 17 }}>{g.icon}</Text>
                <Text style={{ fontFamily: Font.jakarta700, color: isDark ? g.color : T.textPrimary, fontSize: 14 }}>
                  {g.value}
                </Text>
                <Text style={{ fontFamily: Font.manrope500, color: T.textMuted, fontSize: 9, letterSpacing: 0.8 }}>
                  {g.label.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>

          {/* ── TOP 3 CATEGORÍAS ── */}
          {topCats.length > 0 && (
            <View
              style={{
                backgroundColor: isDark ? T.cardElevated : T.card,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(124,58,237,0.2)' : T.glassBorder,
                padding: 14,
                marginBottom: 12,
                ...(isDark ? {
                  shadowColor: '#7C3AED',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.25,
                  shadowRadius: 16,
                  elevation: 8,
                } : {}),
              }}>
              {/* Header con acento de gradiente */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <GradientView
                  colors={isDark ? ['#7C3AED', '#5B21B6'] : [T.primary, T.primary]}
                  style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                  <Text style={{ fontSize: 13 }}>📈</Text>
                </GradientView>
                <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 14, flex: 1 }}>
                  Top categorías
                </Text>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 2,
                  backgroundColor: isDark ? 'rgba(124,58,237,0.15)' : T.primaryBg,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(124,58,237,0.3)' : T.primaryBorder,
                }}>
                  <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 10 }}>este mes</Text>
                </View>
              </View>

              {topCats.map((item, i) => {
                const barColors = isDark
                  ? ['#7C3AED', '#00D4FF', '#4DF2B1']
                  : [T.primary, T.secondary, T.tertiary];
                return (
                  <View key={item.cat} style={{
                    marginBottom: i < topCats.length - 1 ? 12 : 0,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'transparent',
                    borderRadius: isDark ? 12 : 0,
                    padding: isDark ? 8 : 0,
                    borderWidth: isDark ? 1 : 0,
                    borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'transparent',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: isDark ? `${barColors[i]}22` : T.primaryBg,
                        borderWidth: 1, borderColor: isDark ? `${barColors[i]}33` : T.glassBorder,
                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                      }}>
                        <Text style={{ fontSize: 18 }}>{catEmoji(item.cat)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13 }}>
                            {catLabel(item.cat)}
                          </Text>
                          <Text style={{ fontFamily: Font.jakarta700, color: isDark ? barColors[i] : T.textPrimary, fontSize: 13 }}>
                            {formatMoney(item.total, profile.monedaPrincipal)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 }}>
                          <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 10 }}>
                            {item.count} {item.count === 1 ? 'transacción' : 'transacciones'}
                          </Text>
                          <Text style={{ fontFamily: Font.manrope600, color: barColors[i], fontSize: 10 }}>
                            {item.pct}%
                          </Text>
                        </View>
                      </View>
                    </View>
                    {/* Barra de progreso con glow */}
                    <View style={{ height: 4, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.surface, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{
                        width: `${item.pct}%`, height: '100%',
                        backgroundColor: barColors[i],
                        borderRadius: 2,
                        ...(isDark ? {
                          shadowColor: barColors[i],
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 1,
                          shadowRadius: 4,
                        } : {}),
                      }} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── MISIONES ── */}
          <View
            style={{
              backgroundColor: isDark ? T.cardElevated : T.card,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(124,58,237,0.2)' : T.glassBorder,
              padding: 14,
              ...(isDark ? {
                shadowColor: '#7C3AED',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
                elevation: 8,
              } : {}),
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <GradientView
                colors={isDark ? ['#FF5E7D', '#C8003A'] : [T.primary, T.primary]}
                style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ fontSize: 13 }}>🎯</Text>
              </GradientView>
              <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 14, flex: 1 }}>
                Misiones
              </Text>
              {pendingMissions.length + pendingJarvisSteps.length > 0 && (
                <GradientView
                  colors={isDark ? ['#7C3AED', '#5B21B6'] : [T.primary, T.primary]}
                  style={{ borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: Font.jakarta700, color: '#fff', fontSize: 10 }}>
                    {pendingMissions.length + pendingJarvisSteps.length} disp.
                  </Text>
                </GradientView>
              )}
            </View>

            {pendingJarvisSteps.map((step, ji) => (
              <View
                key={step.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  backgroundColor: isDark ? 'rgba(0,212,255,0.08)' : T.primaryBg,
                  borderRadius: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  marginBottom: ji < pendingJarvisSteps.length - 1 ? 8 : 0,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(0,212,255,0.28)' : T.primaryBorder,
                }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 11,
                  backgroundColor: isDark ? `${step.from}28` : T.cardElevated,
                  borderWidth: 1,
                  borderColor: `${step.from}55`,
                  alignItems: 'center', justifyContent: 'center', marginRight: 10,
                }}>
                  <Text style={{ fontSize: 18 }}>{step.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap', gap: 6 }}>
                    <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13, flexShrink: 1 }} numberOfLines={2}>
                      {step.titulo}
                    </Text>
                    <View style={{
                      paddingHorizontal: 6, paddingVertical: 1,
                      backgroundColor: isDark ? 'rgba(0,212,255,0.15)' : T.cardElevated,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(0,212,255,0.35)' : T.glassBorder,
                    }}>
                      <Text style={{ fontFamily: Font.manrope600, color: isDark ? '#00D4FF' : T.primary, fontSize: 9 }}>GUÍA</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginBottom: 8 }} numberOfLines={3}>
                    {step.detalle}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => void skipJarvisStep(step.id)} hitSlop={6}>
                      <Text style={{ fontFamily: Font.manrope500, color: T.textMuted, fontSize: 11 }}>Omitir</Text>
                    </Pressable>
                    <Pressable onPress={() => onJarvisStepCta(step)} style={{ flex: 1, minWidth: 0 }}>
                      <GradientView
                        colors={[step.from, step.to]}
                        style={{ borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' }}>
                        <Text style={{ fontFamily: Font.jakarta700, color: '#fff', fontSize: 12 }} numberOfLines={1}>
                          {step.ctaIcon} {step.cta}
                        </Text>
                      </GradientView>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}

            {pendingJarvisSteps.length > 0 && (
              <View style={{ marginTop: 8, marginBottom: 10 }}>
                <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : T.surface, marginBottom: 8 }} />
                <Text style={{ fontFamily: Font.manrope600, color: T.textMuted, fontSize: 10, letterSpacing: 0.5 }}>
                  Misiones y desafíos
                </Text>
              </View>
            )}

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
                    backgroundColor: isPlaceholder
                      ? isDark ? 'rgba(255,255,255,0.03)' : T.cardElevated
                      : isDark ? 'rgba(124,58,237,0.1)' : T.primaryBg,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    marginBottom: i < arr.length - 1 ? 8 : 0,
                    borderWidth: 1,
                    borderColor: isPlaceholder
                      ? isDark ? 'rgba(255,255,255,0.06)' : T.glassBorder
                      : isDark ? 'rgba(124,58,237,0.3)' : T.primaryBorder,
                    opacity: isPlaceholder ? 0.55 : 1,
                  }}>
                  {/* Icon container */}
                  <View style={{
                    width: 38, height: 38, borderRadius: 11,
                    backgroundColor: isDark
                      ? isPlaceholder ? 'rgba(255,255,255,0.05)' : 'rgba(124,58,237,0.2)'
                      : T.cardElevated,
                    borderWidth: 1,
                    borderColor: isDark
                      ? isPlaceholder ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.4)'
                      : T.glassBorder,
                    alignItems: 'center', justifyContent: 'center', marginRight: 10,
                  }}>
                    <Text style={{ fontSize: 18 }}>
                      {m.completada ? '✅' : isPlaceholder ? (i === 1 ? '🏦' : '🤖') : '📊'}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: Font.jakarta600, color: isPlaceholder ? T.textMuted : T.textPrimary, fontSize: 13 }} numberOfLines={1}>
                        {m.titulo}
                      </Text>
                      {/* XP badge con glow en dark */}
                      <View style={{
                        marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2,
                        backgroundColor: isDark
                          ? isPlaceholder ? 'rgba(255,255,255,0.05)' : 'rgba(124,58,237,0.25)'
                          : T.primaryBg,
                        borderRadius: 6, borderWidth: 1,
                        borderColor: isDark
                          ? isPlaceholder ? 'transparent' : 'rgba(124,58,237,0.5)'
                          : T.primaryBorder,
                      }}>
                        <Text style={{
                          fontFamily: Font.jakarta700,
                          color: isPlaceholder ? T.textMuted : isDark ? '#9D5FF0' : T.primary,
                          fontSize: 10,
                        }}>
                          +{m.xpRecompensa} XP
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {m.descripcion}
                    </Text>
                    {!isPlaceholder && (
                      <View style={{ height: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.surface, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
                        <GradientView
                          colors={isDark ? ['#7C3AED', '#9D5FF0'] : [T.primary, T.primaryLight]}
                          style={{ width: `${Math.max(pct, 5)}%` as any, height: '100%', borderRadius: 2 }}
                        />
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
        <ExpenseFullSheet
          open={expenseSheetOpen}
          onDismiss={() => setExpenseSheetOpen(false)}
          onSavedSuccess={handleExpenseSavedSuccess}
        />
        <ExpenseSavedFeedbackModal
          visible={expenseFeedbackVisible}
          onContinue={() => setExpenseFeedbackVisible(false)}
          T={T}
          todaySpentText={formatMoney(todaySpent, profile.monedaPrincipal)}
          dominantCategoryLabel={dominantTodayCat?.cat ?? 'sin categoría dominante'}
          dominantPct={dominantTodayPct}
          dynamicMessage={expenseFeedbackMessage}
        />
        <IncomeSheet open={incomeSheetOpen} onDismiss={() => setIncomeSheetOpen(false)} />
        <WaBotPromoModal
          visible={waBotPromoVisible}
          onConnect={handleWaPromoConnect}
          onDismiss={() => setWaBotPromoVisible(false)}
        />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
