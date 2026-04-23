import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { BadgeVariant } from '@/components/ui/Badge';
import {
  defaultResumenPeriodoPayload,
  ResumenPeriodoModal,
  type ResumenPeriodoPayload,
} from '@/components/ResumenPeriodoModal';
import { GradientView } from '@/components/ui/GradientView';
import {
  chartProjectionFill,
  onPrimaryGradient,
  savingsGradient,
} from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/lib/currency';
import type { MonedaCode } from '@/types';
import {
  buildExpenseTrendBars,
  buildExpenseTrendBarsCustomRange,
  categoryBarColor,
  categorySpendInRange,
  computeResumenInsights,
  paymentMethodSplitInRange,
  pctChangeVsPrevious,
  periodBounds,
  type PeriodFilter,
  sumExpensesInRange,
  sumIncomesInRange,
  topComerciosInRange,
  trendSubtext,
  trendSubtextCustomRange,
  trendSubtextDetailed,
  tryCustomBoundsFromKeys,
} from '@/lib/resumenMetrics';
import { useFinanceStore } from '@/store/useFinanceStore';

const FILTERS: { key: Exclude<PeriodFilter, 'personalizado'>; label: string }[] = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
];

const STORAGE_RESUMEN_RANGO = 'ahorraya_resumen_rango_v1';

type ResumenRangoStored = ResumenPeriodoPayload & { activoPersonalizado?: boolean };

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

function IaBadge() {
  return (
    <View
      style={{
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: onPrimaryGradient.iconGlass,
      }}>
      <Text style={{ fontFamily: Font.manrope600, color: onPrimaryGradient.text, fontSize: 9 }}>IA</Text>
    </View>
  );
}

function TrendChartWeb({
  data,
}: {
  data: { label: string; real: number; proj: number }[];
}) {
  const { T } = useTheme();
  if (Platform.OS !== 'web') {
    return (
      <View
        style={{
          height: 200,
          borderRadius: 12,
          backgroundColor: T.card,
          justifyContent: 'center',
          shadowColor: T.shadowCard,
          ...cardShadow,
        }}>
        <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, textAlign: 'center', paddingHorizontal: 16 }}>
          Gráfico disponible en la versión web
        </Text>
      </View>
    );
  }
  const { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } = require('recharts') as typeof import('recharts');
  return (
    <View
      style={{
        width: '100%',
        height: 200,
        backgroundColor: T.card,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: T.shadowCard,
        ...cardShadow,
      }}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 4 }} barCategoryGap="12%">
          <XAxis
            dataKey="label"
            tick={{ fill: T.textMuted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={[0, 'auto']} />
          <Bar dataKey="real" name="Gastos" fill={T.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="proj" name="Proyección" fill={chartProjectionFill} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
}

function PaymentDonutWeb({
  pieRows,
  centerPct,
  centerLabel,
  total,
  displayMoneda,
}: {
  pieRows: { name: string; value: number; color: string; pct: number; total: number }[];
  centerPct: number;
  centerLabel: string;
  total: number;
  displayMoneda: MonedaCode;
}) {
  const { T } = useTheme();
  if (Platform.OS !== 'web') {
    return (
      <View style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: Font.manrope400, color: T.textMuted }}>Donut en web</Text>
      </View>
    );
  }
  const { PieChart, Pie, Cell } = require('recharts') as typeof import('recharts');
  return (
    <View
      style={{
        width: 200,
        height: 200,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: T.card,
        borderRadius: 16,
        shadowColor: T.shadowCard,
        ...cardShadow,
      }}>
      <PieChart width={200} height={200}>
        <Pie
          data={pieRows}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={65}
          outerRadius={90}
          paddingAngle={1}>
          {pieRows.map((entry) => (
            <Cell key={entry.name} fill={entry.color} stroke="none" />
          ))}
        </Pie>
      </PieChart>
      <View
        style={{
          position: 'absolute',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
        <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 22 }}>{centerPct}%</Text>
        <Text style={{ fontFamily: Font.manrope400, color: T.secondary, fontSize: 12, marginTop: 2 }}>{centerLabel}</Text>
        <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 10, marginTop: 4 }}>
          {formatMoney(total, displayMoneda)}
        </Text>
      </View>
    </View>
  );
}

function CompactStatBadge({ text, variant }: { text: string; variant: BadgeVariant }) {
  const { T } = useTheme();
  const VARIANT_STYLES: Record<BadgeVariant, { bg: string; border: string; text: string }> = {
    green: {
      bg: T.tertiaryBg,
      border: T.tertiaryBg,
      text: T.success,
    },
    red: {
      bg: T.primaryBg,
      border: T.primaryBorder,
      text: T.error,
    },
    gold: {
      bg: T.tertiaryBg,
      border: T.glassBorder,
      text: T.gold,
    },
    purple: {
      bg: T.primaryBg,
      border: T.primaryBorder,
      text: T.primary,
    },
    cyan: {
      bg: T.secondaryBg,
      border: T.secondaryBg,
      text: T.secondary,
    },
    muted: {
      bg: T.cardElevated,
      border: T.glassBorder,
      text: T.textSecondary,
    },
  };
  const v = VARIANT_STYLES[variant];
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: v.bg,
        borderWidth: 1,
        borderColor: v.border,
        maxWidth: '100%',
      }}>
      <Text style={{ fontFamily: Font.manrope600, fontSize: 10, color: v.text }} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function GridStatTile({
  label,
  amount,
  amountColor,
  badgeText,
  badgeVariant,
  backgroundColor,
  borderColor,
  withCardShadow,
}: {
  label: string;
  amount: string;
  amountColor: string;
  badgeText: string;
  badgeVariant: BadgeVariant;
  backgroundColor: string;
  borderColor: string;
  withCardShadow?: boolean;
}) {
  const { T } = useTheme();
  return (
    <View
      style={{
        width: '48%',
        backgroundColor,
        borderRadius: 16,
        padding: 12,
        borderWidth: 1,
        borderColor,
        shadowColor: withCardShadow ? T.shadowCard : 'transparent',
        ...(withCardShadow ? cardShadow : {}),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <Text
          style={{
            fontFamily: Font.manrope500,
            color: T.textMuted,
            fontSize: 10,
            flex: 1,
          }}
          numberOfLines={2}>
          {label}
        </Text>
        <CompactStatBadge text={badgeText} variant={badgeVariant} />
      </View>
      <Text style={{ fontFamily: Font.jakarta700, color: amountColor, fontSize: 20, marginTop: 8 }} numberOfLines={1}>
        {amount}
      </Text>
    </View>
  );
}

export default function ResumenScreen() {
  const { T } = useTheme();
  const expenses = useFinanceStore((s) => s.expenses);
  const incomes = useFinanceStore((s) => s.incomes);
  const profile = useFinanceStore((s) => s.profile);

  const [period, setPeriod] = useState<PeriodFilter>('mes');
  const [modalRangoVisible, setModalRangoVisible] = useState(false);
  const [customPayload, setCustomPayload] = useState<ResumenPeriodoPayload>(() => defaultResumenPeriodoPayload());
  const hidratoRango = useRef(false);
  const refDate = useMemo(() => new Date(), []);
  const display = profile.monedaPrincipal;
  const rate = profile.tipoDeCambio;

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_RESUMEN_RANGO).then((raw) => {
      if (!raw) {
        hidratoRango.current = true;
        return;
      }
      try {
        const o = JSON.parse(raw) as ResumenRangoStored;
        if (o?.from && o?.to && tryCustomBoundsFromKeys(o.from, o.to)) {
          setCustomPayload({
            from: o.from,
            to: o.to,
            presupuesto: typeof o.presupuesto === 'number' && o.presupuesto > 0 ? o.presupuesto : null,
          });
          if (o.activoPersonalizado === true) {
            setPeriod('personalizado');
          }
        }
      } catch {
        /* ignore */
      } finally {
        hidratoRango.current = true;
      }
    });
  }, []);

  /** Al volver a Hoy/Semana/Mes, se desactiva el rango para el próximo arranque (las fechas guardadas siguen sirviendo al abrir el modal). */
  useEffect(() => {
    if (!hidratoRango.current || period === 'personalizado') return;
    void AsyncStorage.setItem(
      STORAGE_RESUMEN_RANGO,
      JSON.stringify({ ...customPayload, activoPersonalizado: false } satisfies ResumenRangoStored),
    );
  }, [period, customPayload]);

  const customBoundsResolved = useMemo(
    () => tryCustomBoundsFromKeys(customPayload.from, customPayload.to),
    [customPayload.from, customPayload.to],
  );

  const bounds = useMemo(() => {
    if (period === 'personalizado' && customBoundsResolved) return customBoundsResolved;
    const preset: Exclude<PeriodFilter, 'personalizado'> =
      period === 'personalizado' ? 'mes' : period;
    return periodBounds(preset, refDate);
  }, [period, customBoundsResolved, refDate]);
  const { start, end, prevStart, prevEnd } = bounds;

  const ingresos = useMemo(
    () => sumIncomesInRange(incomes, start, end, display, rate),
    [display, end, incomes, rate, start],
  );
  const gastos = useMemo(
    () => sumExpensesInRange(expenses, start, end, display, rate),
    [display, end, expenses, rate, start],
  );
  const ingresosPrev = useMemo(
    () => sumIncomesInRange(incomes, prevStart, prevEnd, display, rate),
    [display, incomes, prevEnd, prevStart, rate],
  );
  const gastosPrev = useMemo(
    () => sumExpensesInRange(expenses, prevStart, prevEnd, display, rate),
    [display, expenses, prevEnd, prevStart, rate],
  );

  const pctIngresos = pctChangeVsPrevious(ingresos, ingresosPrev);
  const pctGastos = pctChangeVsPrevious(gastos, gastosPrev);

  const neto = ingresos - gastos;
  const netoPrev = ingresosPrev - gastosPrev;
  const netoBetter = neto >= netoPrev;

  const ahorroPct = ingresos > 0 ? Math.max(0, Math.min(100, ((ingresos - gastos) / ingresos) * 100)) : 0;
  const metaAhorro = 30;
  const superaMeta = ahorroPct >= metaAhorro;

  const trendData = useMemo(() => {
    if (period === 'personalizado' && customBoundsResolved) {
      return buildExpenseTrendBarsCustomRange(
        customBoundsResolved.start,
        customBoundsResolved.end,
        expenses,
        display,
        rate,
      );
    }
    const preset: Exclude<PeriodFilter, 'personalizado'> =
      period === 'personalizado' ? 'mes' : period;
    return buildExpenseTrendBars(preset, refDate, expenses, display, rate);
  }, [customBoundsResolved, display, expenses, period, rate, refDate]);

  const onApplyRango = (p: ResumenPeriodoPayload) => {
    if (!tryCustomBoundsFromKeys(p.from, p.to)) return;
    setCustomPayload(p);
    setPeriod('personalizado');
    setModalRangoVisible(false);
    const stored: ResumenRangoStored = { ...p, activoPersonalizado: true };
    void AsyncStorage.setItem(STORAGE_RESUMEN_RANGO, JSON.stringify(stored));
  };

  const paymentSplit = useMemo(
    () => paymentMethodSplitInRange(expenses, start, end, display, rate, profile.metodosDePago ?? null, T),
    [T, display, end, expenses, profile.metodosDePago, rate, start],
  );
  const paymentPie = useMemo(
    () =>
      paymentSplit.map((r) => ({
        name: r.grupo,
        value: r.total,
        color: r.color,
        pct: r.pct,
        total: r.total,
      })),
    [paymentSplit],
  );
  const paymentTotal = paymentSplit.reduce((s, r) => s + r.total, 0);
  const topMedio = useMemo(() => {
    const sorted = [...paymentSplit].sort((a, b) => b.pct - a.pct)[0];
    return sorted ?? null;
  }, [paymentSplit]);
  const centerLabel =
    topMedio && topMedio.grupo.toLowerCase().includes('efect') ? 'EFECTIVO' : topMedio ? 'DIGITAL' : '—';

  const categorias = useMemo(
    () => categorySpendInRange(expenses, start, end, display, rate),
    [display, end, expenses, rate, start],
  );
  const maxCat = categorias[0]?.total ?? 1;

  const insights = useMemo(
    () => computeResumenInsights(ingresos, gastos, neto, categorias[0] ?? null),
    [categorias, gastos, ingresos, neto],
  );

  const topComercios = useMemo(
    () => topComerciosInRange(expenses, start, end, display, rate, 3),
    [display, end, expenses, rate, start],
  );

  const fmtPct = (p: number | null) => {
    if (p === null) return '—';
    const sign = p >= 0 ? '+' : '';
    return `${sign}${Math.round(p)}%`;
  };

  const badgeIngresos = fmtPct(pctIngresos);
  const badgeGastos = fmtPct(pctGastos);
  const gastosSubieron = pctGastos !== null && pctGastos > 0;

  const presupuestoCap = customPayload.presupuesto;
  const pctPresupuesto =
    period === 'personalizado' && presupuestoCap != null && presupuestoCap > 0
      ? Math.min(100, (gastos / presupuestoCap) * 100)
      : null;

  const ingresosBadgeVariant: BadgeVariant =
    badgeIngresos === '—' ? 'muted' : pctIngresos !== null && pctIngresos >= 0 ? 'green' : 'red';
  const gastosBadgeVariant: BadgeVariant =
    badgeGastos === '—' ? 'muted' : gastosSubieron ? 'red' : 'green';
  const netoBadgeVariant: BadgeVariant = netoBetter ? 'green' : 'red';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <ResumenPeriodoModal
        visible={modalRangoVisible}
        onClose={() => setModalRangoVisible(false)}
        onApply={onApplyRango}
        initial={customPayload}
      />
      <View style={{ flex: 1, maxWidth: 390, width: '100%', alignSelf: 'center' }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}>
          <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 26 }}>Resumen General</Text>
          <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 14, marginTop: 6 }}>
            Análisis detallado de tus finanzas
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            {FILTERS.map((f) => {
              const active = period === f.key;
              return (
                <Pressable key={f.key} onPress={() => setPeriod(f.key)}>
                  {active ? (
                    <GradientView
                      colors={T.primaryGrad}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 999,
                      }}>
                      <Text style={{ fontFamily: Font.jakarta600, color: onPrimaryGradient.text, fontSize: 14 }}>
                        {f.label}
                      </Text>
                    </GradientView>
                  ) : (
                    <View
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 999,
                        backgroundColor: T.card,
                      }}>
                      <Text style={{ fontFamily: Font.jakarta600, color: T.textMuted, fontSize: 14 }}>{f.label}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            <Pressable onPress={() => setModalRangoVisible(true)}>
              {period === 'personalizado' ? (
                <GradientView
                  colors={T.primaryGrad}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                  }}>
                  <Text style={{ fontFamily: Font.jakarta600, color: onPrimaryGradient.text, fontSize: 14 }}>Rango</Text>
                </GradientView>
              ) : (
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: T.card,
                    borderWidth: 1,
                    borderColor: T.glassBorder,
                  }}>
                  <Text style={{ fontFamily: Font.jakarta600, color: T.textMuted, fontSize: 14 }}>Rango</Text>
                </View>
              )}
            </Pressable>
          </View>

          {period === 'personalizado' && customBoundsResolved && (
            <Text style={{ fontFamily: Font.manrope500, color: T.textSecondary, fontSize: 12, marginTop: 10 }}>
              Análisis: {trendSubtextCustomRange(customBoundsResolved.start, customBoundsResolved.end)}
            </Text>
          )}

          {pctPresupuesto != null && presupuestoCap != null && (
            <View
              style={{
                marginTop: 14,
                borderRadius: 16,
                padding: 14,
                backgroundColor: T.card,
                borderWidth: 1,
                borderColor: T.glassBorder,
              }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 14 }}>Presupuesto del período</Text>
                <Text style={{ fontFamily: Font.manrope600, color: T.textMuted, fontSize: 11 }}>
                  {formatMoney(gastos, display)} / {formatMoney(presupuestoCap, display)}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: T.cardElevated, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${pctPresupuesto}%` as `${number}%`,
                    height: '100%',
                    borderRadius: 4,
                    backgroundColor: pctPresupuesto >= 100 ? T.error : pctPresupuesto >= 85 ? T.warning : T.primary,
                  }}
                />
              </View>
              <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginTop: 6 }}>
                {pctPresupuesto >= 100
                  ? 'Superaste el tope definido para este rango.'
                  : `Te queda aprox. ${formatMoney(Math.max(0, presupuestoCap - gastos), display)} bajo el tope.`}
              </Text>
            </View>
          )}

          <GradientView
            colors={T.primaryGrad}
            style={{
              marginTop: 20,
              borderRadius: 16,
              padding: 16,
              shadowColor: T.shadowPrimary,
              ...purpleShadow,
            }}>
            <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 16 }}>
              ✨ Asesor Financiero IA AhorraYA
            </Text>
            <View style={{ marginTop: 14, gap: 14 }}>
              {insights.map((text, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <IaBadge />
                  <Text style={{ flex: 1, fontFamily: Font.manrope400, color: onPrimaryGradient.text, fontSize: 14, lineHeight: 20 }}>
                    {text}
                  </Text>
                </View>
              ))}
            </View>
          </GradientView>

          <View
            style={{
              marginTop: 20,
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              rowGap: 10,
            }}>
            <GridStatTile
              label="TOTAL INGRESOS"
              amount={formatMoney(ingresos, display)}
              amountColor={T.success}
              badgeText={badgeIngresos === '—' ? '—' : `${badgeIngresos} vs ant.`}
              badgeVariant={ingresosBadgeVariant}
              backgroundColor={T.secondaryBg}
              borderColor={T.secondaryBg}
            />
            <GridStatTile
              label="TOTAL GASTOS"
              amount={formatMoney(gastos, display)}
              amountColor={T.error}
              badgeText={badgeGastos === '—' ? '—' : `${badgeGastos} vs ant.`}
              badgeVariant={gastosBadgeVariant}
              backgroundColor={T.primaryBg}
              borderColor={T.primaryBorder}
            />
            <GridStatTile
              label="FLUJO NETO"
              amount={formatMoney(neto, display)}
              amountColor={neto >= 0 ? T.success : T.error}
              badgeText={netoBetter ? '↑ vs ant.' : '↓ vs ant.'}
              badgeVariant={netoBadgeVariant}
              backgroundColor={T.card}
              borderColor={T.glassBorder}
              withCardShadow
            />
            <View
              style={{
                width: '48%',
                borderRadius: 16,
                overflow: 'hidden',
                shadowColor: T.shadowPrimary,
                ...purpleShadow,
              }}>
              <GradientView colors={savingsGradient} style={{ padding: 12, borderRadius: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                  <Text
                    style={{
                      fontFamily: Font.manrope500,
                      color: onPrimaryGradient.textMuted,
                      fontSize: 10,
                      flex: 1,
                    }}
                    numberOfLines={2}>
                    AHORRO ESTIMADO
                  </Text>
                  <CompactStatBadge text={superaMeta ? 'Meta OK' : 'En camino'} variant={superaMeta ? 'green' : 'gold'} />
                </View>
                <Text style={{ fontFamily: Font.jakarta700, color: onPrimaryGradient.text, fontSize: 20, marginTop: 8 }}>
                  {ahorroPct.toFixed(0)}%
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
                  <Text style={{ fontFamily: Font.manrope400, color: onPrimaryGradient.textMuted, fontSize: 11 }}>
                    Meta: {metaAhorro}%
                  </Text>
                  {superaMeta ? (
                    <Text style={{ color: onPrimaryGradient.text, fontSize: 12 }}>↑</Text>
                  ) : (
                    <Text style={{ color: onPrimaryGradient.textMuted, fontSize: 12 }}>→</Text>
                  )}
                </View>
              </GradientView>
            </View>
          </View>

          <View style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 15, marginBottom: 10 }}>
              Dónde más gastas
            </Text>
            {topComercios.length === 0 ? (
              <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 14 }}>
                Sin gastos en este período.
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                {topComercios.map((row, idx) => (
                  <View
                    key={row.comercio}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: T.cardElevated,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 14 }}>
                          {idx + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 14 }} numberOfLines={2}>
                          {row.comercio}
                        </Text>
                        <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginTop: 2 }}>
                          {row.pct}% del total
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 15 }}>
                      {formatMoney(row.total, display)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 16 }}>Tendencia de Gastos</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.primary }} />
                  <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12 }}>Gastos</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chartProjectionFill }} />
                  <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12 }}>Proyección</Text>
                </View>
              </View>
            </View>
            <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12, marginTop: 4 }}>
              {period === 'personalizado' && customBoundsResolved
                ? trendSubtextCustomRange(customBoundsResolved.start, customBoundsResolved.end)
                : trendSubtext(period === 'personalizado' ? 'mes' : period)}
            </Text>
            <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 11, marginTop: 2 }}>
              {trendSubtextDetailed(period)}
            </Text>
            <View style={{ marginTop: 12, overflow: 'hidden' }}>
              <TrendChartWeb data={trendData} />
            </View>
          </View>

          <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 16, marginTop: 24 }}>
            Métodos de Pago
          </Text>
          <PaymentDonutWeb
            pieRows={paymentPie}
            centerPct={topMedio?.pct ?? 0}
            centerLabel={centerLabel}
            total={paymentTotal}
            displayMoneda={display}
          />
          <View style={{ marginTop: 8, gap: 10 }}>
            {paymentSplit.map((r, idx) => (
              <View key={`${r.grupo}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.color }} />
                  <Text style={{ fontFamily: Font.manrope500, color: T.textSecondary, fontSize: 13 }}>{r.grupo}</Text>
                </View>
                <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 13 }}>{r.pct}%</Text>
              </View>
            ))}
            <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12, textAlign: 'right' }}>
              Total {formatMoney(paymentTotal, display)}
            </Text>
          </View>

          <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 16, marginTop: 28 }}>
            Gasto por Categoría
          </Text>
          <View style={{ marginTop: 12, gap: 12 }}>
            {categorias.length === 0 ? (
              <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 14 }}>
                Sin gastos en este período.
              </Text>
            ) : (
              categorias.map((cat, idx) => (
                <View key={cat.categoriaId}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: T.cardElevated,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Text style={{ fontSize: 20 }}>{cat.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: Font.jakarta600, color: T.textPrimary, fontSize: 14 }} numberOfLines={2}>
                          {cat.nombre}
                        </Text>
                        <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 12, marginTop: 2 }}>
                          {cat.count} {cat.count === 1 ? 'gasto' : 'gastos'} este período
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 16 }}>
                      {formatMoney(cat.total, display)}
                    </Text>
                  </View>
                  <View style={{ marginTop: 8, height: 3, borderRadius: 2, backgroundColor: T.cardElevated, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.min(100, (cat.total / maxCat) * 100)}%`,
                        height: 3,
                        borderRadius: 2,
                        backgroundColor: categoryBarColor(idx, T),
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
