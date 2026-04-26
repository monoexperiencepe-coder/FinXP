import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Linking,
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
import { markWaPromoShown, markThemePickerShown, readThemePickerShown, readWaPromoShown } from '@/lib/preferences';
import { ThemePickerModal } from '@/components/ThemePickerModal';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';

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
  const { T, isDark } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const maxW = Math.min(width, APP_CONTENT_MAX_WIDTH);

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
  const [jarvisSkipped, setJarvisSkipped] = useState<JarvisMissionStepId[]>([]);
  const [jarvisLoaded, setJarvisLoaded] = useState(false);
  const [asistenteWhatsappLoading, setAsistenteWhatsappLoading] = useState(false);
  const asistenteWhatsappLock = useRef(false);
  const [waBotPromoVisible, setWaBotPromoVisible] = useState(false);
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  /** El promo de WhatsApp solo corre después de cerrar el modal de tema (o si ya no aplica). */
  const [themePickerGateDone, setThemePickerGateDone] = useState(false);

  // entrance animation refs
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const enterTransY  = useRef(new Animated.Value(28)).current;

  /* ── Announcer de insights ── */
  const [insightIdx, setInsightIdx] = useState(0);
  const insightFade = useRef(new Animated.Value(1)).current;
  const insightSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (session) {
      loadFromSupabase().then(() => loadCategories());
    }
  }, [session]);

  // ── Entrance animation (runs once on mount) ──────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enterTransY,  { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Theme picker (1×): cleanup evita doble timer en Strict Mode / remounts ──
  useEffect(() => {
    if (!session) {
      setThemePickerGateDone(false);
      setThemePickerVisible(false);
      return;
    }
    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;

    void readThemePickerShown().then((shown) => {
      if (cancelled) return;
      if (shown) {
        setThemePickerGateDone(true);
        return;
      }
      showTimer = setTimeout(() => {
        if (!cancelled) setThemePickerVisible(true);
      }, 1200);
    });

    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
    };
  }, [session]);

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


  /* ── WhatsApp bot promo: solo después del modal de tema (o si el tema ya se había elegido) ── */
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
  const pctUsado  = limiteMes > 0 ? Math.min((gastadoMes / limiteMes) * 100, 100) : 0;

  const todaySpent = useMemo(
    () => expenses.filter((e) => toDateKey(new Date(e.fecha)) === todayKey).reduce((s, e) => s + e.importe, 0),
    [expenses, todayKey],
  );
  const weekSpent = useMemo(() => getWeekSpent(), [getWeekSpent, expenses]);

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
  const arcColorDonut = pctUsado >= 90 ? '#FF5E7D' : pctUsado >= 70 ? '#FFB84D' : '#7C3AED';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <ThemePickerModal
        visible={themePickerVisible}
        onDone={() => {
          setThemePickerVisible(false);
          setThemePickerGateDone(true);
        }}
      />
      <Animated.View style={{ flex: 1, opacity: enterOpacity, transform: [{ translateY: enterTransY }] }}>
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
              {/* Fila superior: donut + importe central */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                {/* Donut */}
                <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ position: 'absolute' }}>
                    {Platform.OS === 'web'
                      ? <WebDonut usedPct={pctUsado} arcColor={arcColorDonut} trackColor={donutTrackColor} />
                      : <NativeDonut usedPct={pctUsado} arcColor={arcColorDonut} trackColor={donutTrackColor} />}
                  </View>
                  <View style={{ alignItems: 'center', paddingHorizontal: 6 }}>
                    {limiteMes > 0 ? (
                      /* ── Con presupuesto: muestra % ── */
                      <>
                        <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 20, lineHeight: 22, textAlign: 'center', letterSpacing: -0.5 }}>
                          {Math.round(pctUsado)}%
                        </Text>
                        <Text style={{ fontFamily: Font.manrope400, color: isDark ? 'rgba(255,255,255,0.45)' : T.textMuted, fontSize: 8, marginTop: 1, letterSpacing: 0.5 }}>
                          DEL PRESUPUESTO
                        </Text>
                        <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.35)' : T.textMuted, fontSize: 8, marginTop: 3, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
                          {formatMoney(gastadoMes, profile.monedaPrincipal)} / {formatMoney(limiteMes, profile.monedaPrincipal)}
                        </Text>
                      </>
                    ) : (
                      /* ── Sin presupuesto: promedio diario ── */
                      <>
                        <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 15, lineHeight: 18, textAlign: 'center', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>
                          {formatMoney(
                            gastadoMes > 0 ? gastadoMes / new Date().getDate() : 0,
                            profile.monedaPrincipal,
                          )}
                        </Text>
                        <Text style={{ fontFamily: Font.manrope400, color: isDark ? 'rgba(255,255,255,0.45)' : T.textMuted, fontSize: 8, marginTop: 1, letterSpacing: 0.5 }}>
                          PROMEDIO/DÍA
                        </Text>
                        <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.35)' : T.textMuted, fontSize: 8, marginTop: 3, textAlign: 'center' }}>
                          {new Date().getDate()} días del mes
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                {/* Métricas verticales */}
                <View style={{ flex: 1, gap: 6 }}>
                  {[
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
                      accent: '#7C3AED',
                      dim: isDark ? 'rgba(124,58,237,0.15)' : 'rgba(124,58,237,0.08)',
                      borderA: isDark ? '33' : '28',
                    },
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
                        borderColor: m.accent + m.borderA,
                      }}>
                      <Text style={{ fontFamily: Font.manrope600, color: isDark ? 'rgba(255,255,255,0.45)' : T.textMuted, fontSize: 10, letterSpacing: 1 }}>
                        {m.label}
                      </Text>
                      <Text style={{ fontFamily: Font.jakarta700, color: isDark ? '#FFFFFF' : T.textPrimary, fontSize: 13 }} numberOfLines={1}>
                        {m.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Separador */}
              <View style={{
                height: 1,
                backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(124,58,237,0.12)',
                marginBottom: 12,
              }} />

              {/* ── Review diario ── */}
              <View style={{ gap: 0 }}>
                {/* Cabecera centrada */}
                <View style={{ alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{
                    fontFamily: Font.manrope600,
                    color: isDark ? 'rgba(255,255,255,0.45)' : T.textMuted,
                    fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
                  }}>
                    HOY
                  </Text>
                  <Text style={{
                    fontFamily: Font.jakarta700,
                    color: isDark ? '#FFFFFF' : T.textPrimary,
                    fontSize: 26, lineHeight: 30, letterSpacing: -0.5,
                  }}>
                    {formatMoney(todaySpent, profile.monedaPrincipal)}
                  </Text>
                  <GradientView
                    colors={isDark ? (['#7C3AED', '#00D4FF'] as const) : ([T.primary, T.primary] as const)}
                    style={{ height: 2, borderRadius: 1, width: 40, marginTop: 6 }}
                  />
                </View>

                {/* Filas de categorías */}
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
                          <Text style={{
                            fontFamily: Font.manrope600, color: T.textSecondary,
                            fontSize: 12, flex: 1, textTransform: 'capitalize',
                          }}>
                            {it.cat}
                          </Text>
                          <Text style={{
                            fontFamily: Font.jakarta700,
                            color: isDark ? '#FFFFFF' : T.textPrimary,
                            fontSize: 12,
                          }}>
                            {formatMoney(it.total, profile.monedaPrincipal)}
                          </Text>
                          <View style={{
                            backgroundColor: isDark ? `${accent}30` : `${accent}20`,
                            borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2,
                          }}>
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
                      Aún no registras gastos hoy.{'\n'}Toca ⚡ para empezar.
                    </Text>
                  </View>
                )}

                {/* ── Announcer de insights ── */}
                <View style={{ marginTop: 10 }}>
                  {/* Header del announcer */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6,
                  }}>
                    <GradientView
                      colors={isDark ? (['#7C3AED', '#00D4FF'] as const) : ([T.primary, T.primary] as const)}
                      style={{ width: 3, height: 14, borderRadius: 2 }}
                    />
                    <Text style={{
                      fontFamily: Font.manrope600,
                      color: isDark ? 'rgba(255,255,255,0.35)' : T.textMuted,
                      fontSize: 9, letterSpacing: 1.5,
                    }}>
                      ANÁLISIS EN VIVO
                    </Text>
                    {/* Dots de paginación */}
                    <View style={{ flexDirection: 'row', gap: 3, marginLeft: 'auto' }}>
                      {todayInsights.map((_, di) => (
                        <View
                          key={di}
                          style={{
                            width: di === insightIdx ? 12 : 4,
                            height: 4, borderRadius: 2,
                            backgroundColor: di === insightIdx
                              ? (isDark ? '#9D5FF0' : T.primary)
                              : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(124,58,237,0.18)'),
                          }}
                        />
                      ))}
                    </View>
                  </View>

                  {/* Cuerpo animado */}
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
                    <View style={{
                      width: 30, height: 30, borderRadius: 9,
                      backgroundColor: isDark ? 'rgba(157,95,240,0.22)' : 'rgba(124,58,237,0.1)',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(157,95,240,0.4)' : 'rgba(124,58,237,0.2)',
                    }}>
                      <Text style={{ fontSize: 15 }}>{todayInsights[insightIdx]?.icon ?? '💡'}</Text>
                    </View>
                    <Text style={{
                      fontFamily: Font.manrope600,
                      color: isDark ? '#D4C5FF' : T.textPrimary,
                      fontSize: 12, flex: 1, lineHeight: 18,
                    }}>
                      {todayInsights[insightIdx]?.text ?? ''}
                    </Text>
                  </Animated.View>
                </View>
              </View>
            </View>
          </GradientView>

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
        <ExpenseFullSheet open={expenseSheetOpen} onDismiss={() => setExpenseSheetOpen(false)} />
        <IncomeSheet open={incomeSheetOpen} onDismiss={() => setIncomeSheetOpen(false)} />
        <WaBotPromoModal
          visible={waBotPromoVisible}
          onConnect={handleWaPromoConnect}
          onDismiss={() => setWaBotPromoVisible(false)}
        />
      </View>
      </Animated.View>
    </SafeAreaView>
  );
}
