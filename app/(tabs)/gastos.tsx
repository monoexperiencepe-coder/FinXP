import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExpenseCategoryById } from '@/constants/expenseCategories';
import { Font } from '@/constants/typography';
import { modalOverlayScrim, onPrimaryGradient } from '@/constants/theme';
import { GradientView } from '@/components/ui/GradientView';
import { useTheme } from '@/hooks/useTheme';
import { convertAmount, formatMoney } from '@/lib/currency';
import { addMonthsToYearMonth, currentYearMonth, toDateKey } from '@/lib/dates';
import { MOOD_EMOJI } from '@/lib/mood';
import { useFinanceStore } from '@/store/useFinanceStore';
import type { Expense } from '@/types';

const MAX_W = 390;

type VistaTab = 'mes' | 'rango' | 'total';

type DaySection = { title: string; data: Expense[] };
type MonthSection = { title: string; monthTotal: string; data: Expense[] };

function sumExpenses(list: Expense[], moneda: 'PEN' | 'USD', rate: number): number {
  return list.reduce((s, e) => s + convertAmount(e.importe, e.moneda, moneda, rate), 0);
}

function uniqueMonthsFromExpenses(expenses: Expense[]): string[] {
  const set = new Set<string>();
  for (const e of expenses) set.add(e.mes);
  const cur = currentYearMonth();
  if (!set.size) set.add(cur);
  return [...set].sort((a, b) => b.localeCompare(a));
}

function monthLabelPretty(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const raw = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function monthNameUpper(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long' }).toUpperCase();
}

function monthGroupTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const month = new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long' }).toUpperCase();
  return `${month} ${y}`;
}

function daySectionTitle(dateKey: string): string {
  const [y, mo, day] = dateKey.split('-').map(Number);
  const month = new Date(y, mo - 1, 1).toLocaleDateString('es-PE', { month: 'long' }).toUpperCase();
  return `${day} DE ${month}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function groupExpensesByDateDesc(list: Expense[]): DaySection[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    const k = toDateKey(new Date(e.fecha));
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map((k) => ({
    title: daySectionTitle(k),
    data: (map.get(k) ?? []).sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha)),
  }));
}

function groupExpensesByMonthDesc(
  list: Expense[],
  moneda: 'PEN' | 'USD',
  rate: number,
): MonthSection[] {
  const map = new Map<string, Expense[]>();
  for (const e of list) {
    if (!map.has(e.mes)) map.set(e.mes, []);
    map.get(e.mes)!.push(e);
  }
  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return keys.map((ym) => {
    const arr = map.get(ym) ?? [];
    const total = sumExpenses(arr, moneda, rate);
    return {
      title: monthGroupTitle(ym),
      monthTotal: formatMoney(total, moneda),
      data: [...arr].sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha)),
    };
  });
}

function expenseInDateRange(e: Expense, fromKey: string, toKey: string): boolean {
  const k = toDateKey(new Date(e.fecha));
  return k >= fromKey && k <= toKey;
}

const listContentStyle = { paddingBottom: 100, paddingHorizontal: 16 } as const;
const sectionListStyle = { flex: 1 } as const;

const filterDateStyles = StyleSheet.create({
  sectionLabel: {
    fontFamily: Font.manrope600,
    fontSize: 11,
    letterSpacing: 2,
  },
});

export default function GastosScreen() {
  const { T, isDark } = useTheme();
  const expenses = useFinanceStore((s) => s.expenses);
  const profile = useFinanceStore((s) => s.profile);
  const moneda = profile.monedaPrincipal;
  const rate = profile.tipoDeCambio;

  const [vista, setVista] = useState<VistaTab>('mes');
  const [selectedYm, setSelectedYm] = useState(() => currentYearMonth());
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);

  const now = new Date();
  const defaultFrom = useMemo(() => {
    const y = now.getFullYear();
    const m = now.getMonth();
    return toDateKey(new Date(y, m, 1));
  }, []);
  const defaultTo = useMemo(() => toDateKey(now), []);

  const [rangeFromKey, setRangeFromKey] = useState(defaultFrom);
  const [rangeToKey, setRangeToKey] = useState(defaultTo);
  const [rangePicker, setRangePicker] = useState<null | 'from' | 'to'>(null);
  const [rangeDraftDate, setRangeDraftDate] = useState(() => new Date());

  const monthsAvailable = useMemo(() => uniqueMonthsFromExpenses(expenses), [expenses]);

  useEffect(() => {
    if (!monthsAvailable.includes(selectedYm)) {
      setSelectedYm(monthsAvailable[0] ?? currentYearMonth());
    }
  }, [monthsAvailable, selectedYm]);

  const selectedYmSafe = useMemo(() => {
    if (monthsAvailable.includes(selectedYm)) return selectedYm;
    return monthsAvailable[0] ?? currentYearMonth();
  }, [monthsAvailable, selectedYm]);

  const expensesMonth = useMemo(
    () => expenses.filter((e) => e.mes === selectedYmSafe),
    [expenses, selectedYmSafe],
  );

  const totalMonth = useMemo(() => sumExpenses(expensesMonth, moneda, rate), [expensesMonth, moneda, rate]);
  const prevYm = addMonthsToYearMonth(selectedYmSafe, -1);
  const totalPrevMonth = useMemo(
    () => sumExpenses(expenses.filter((e) => e.mes === prevYm), moneda, rate),
    [expenses, prevYm, moneda, rate],
  );
  const pctVsPrev = totalPrevMonth > 0 ? ((totalMonth - totalPrevMonth) / totalPrevMonth) * 100 : null;

  const txCountMonth = expensesMonth.length;
  const catCountMonth = useMemo(() => new Set(expensesMonth.map((e) => e.categoria)).size, [expensesMonth]);

  const sectionsMonth = useMemo(() => groupExpensesByDateDesc(expensesMonth), [expensesMonth]);

  const rangeFiltered = useMemo(() => {
    let from = rangeFromKey;
    let to = rangeToKey;
    if (from > to) {
      const t = from;
      from = to;
      to = t;
    }
    return expenses.filter((e) => expenseInDateRange(e, from, to)).sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
  }, [expenses, rangeFromKey, rangeToKey]);

  const totalRange = useMemo(() => sumExpenses(rangeFiltered, moneda, rate), [rangeFiltered, moneda, rate]);
  const sectionsRange = useMemo(() => groupExpensesByDateDesc(rangeFiltered), [rangeFiltered]);

  const totalHistorico = useMemo(() => sumExpenses(expenses, moneda, rate), [expenses, moneda, rate]);
  const txTotal = expenses.length;
  const monthsDistinct = useMemo(() => new Set(expenses.map((e) => e.mes)).size, [expenses]);
  const promedioPorMes = monthsDistinct > 0 ? totalHistorico / monthsDistinct : 0;

  const mesMasCaro = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const v = convertAmount(e.importe, e.moneda, moneda, rate);
      map.set(e.mes, (map.get(e.mes) ?? 0) + v);
    }
    let bestYm: string | null = null;
    let bestVal = -1;
    for (const [ym, v] of map) {
      if (v > bestVal) {
        bestVal = v;
        bestYm = ym;
      }
    }
    if (!bestYm || bestVal <= 0) return null;
    return { ym: bestYm, label: monthLabelPretty(bestYm), total: bestVal };
  }, [expenses, moneda, rate]);

  const sectionsTotal = useMemo(
    () => groupExpensesByMonthDesc(expenses, moneda, rate),
    [expenses, moneda, rate],
  );

  const openRangePicker = useCallback(
    (which: 'from' | 'to') => {
      const key = which === 'from' ? rangeFromKey : rangeToKey;
      setRangeDraftDate(parseDateKey(key));
      if (Platform.OS === 'android') {
        DateTimePickerAndroid.open({
          value: parseDateKey(key),
          mode: 'date',
          onChange: (_e, d) => {
            if (d) {
              const nk = toDateKey(d);
              if (which === 'from') setRangeFromKey(nk);
              else setRangeToKey(nk);
            }
          },
        });
        return;
      }
      if (Platform.OS === 'web') return;
      setRangePicker(which);
    },
    [rangeFromKey, rangeToKey],
  );

  const applyRangeIosDate = () => {
    const nk = toDateKey(rangeDraftDate);
    if (rangePicker === 'from') setRangeFromKey(nk);
    if (rangePicker === 'to') setRangeToKey(nk);
    setRangePicker(null);
  };

  const renderExpenseRow = useCallback(({ item }: { item: Expense }) => {
    const cat = getExpenseCategoryById(item.categoria);
    const amountColor = item.esEsencial ? T.textPrimary : T.error;
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 12,
          marginBottom: 10,
          borderRadius: 14,
          backgroundColor: T.card,
          borderWidth: 1,
          borderColor: T.glassBorder,
          shadowColor: T.shadowCard,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 12,
        }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: T.cardElevated,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}>
          <Text style={{ fontSize: 18 }}>{cat?.emoji ?? '📦'}</Text>
        </View>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontFamily: Font.jakarta600, fontSize: 14, color: T.textPrimary }}>{item.comercio}</Text>
          {item.descripcion ? (
            <Text
              style={{ fontFamily: Font.manrope400, marginTop: 4, fontSize: 12, color: T.textMuted }}
              numberOfLines={2}>
              {item.descripcion}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: Font.jakarta700, fontSize: 16, color: amountColor }}>
            {formatMoney(item.importe, item.moneda)}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 18 }}>
            {item.estadoDeAnimo ? MOOD_EMOJI[item.estadoDeAnimo] : '⬜'}
          </Text>
        </View>
      </View>
    );
  }, [T]);

  const dateSectionHeader = useCallback((title: string) => (
    <View
      style={{
        paddingTop: 20,
        paddingBottom: 8,
      }}>
      <Text style={{ fontFamily: Font.manrope600, fontSize: 11, letterSpacing: 2, color: T.textMuted }}>
        {title}
      </Text>
    </View>
  ), [T]);

  const pills = useMemo(
    () => (
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 20 }}>
        {(['mes', 'rango', 'total'] as const).map((id) => {
          const on = vista === id;
          const label = id === 'mes' ? 'Mes' : id === 'rango' ? 'Rango' : 'Total';
          return (
            <Pressable key={id} onPress={() => setVista(id)}>
              {on ? (
                <GradientView
                  colors={T.primaryGrad}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                  }}>
                  <Text style={{ fontFamily: Font.jakarta600, fontSize: 14, color: onPrimaryGradient.text }}>{label}</Text>
                </GradientView>
              ) : (
                <View
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 18,
                    borderRadius: 999,
                    backgroundColor: T.card,
                  }}>
                  <Text style={{ fontFamily: Font.jakarta600, fontSize: 14, color: T.textMuted }}>{label}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    ),
    [T, vista],
  );

  const headerTitleRow = useMemo(
    () => (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 8,
          paddingBottom: 4,
        }}>
        <Text style={{ fontFamily: Font.jakarta700, fontSize: 26, color: T.textPrimary, letterSpacing: -0.5 }}>
          Mis Gastos
        </Text>
      </View>
    ),
    [T],
  );

  const listHeaderMes = useMemo(
    () => (
      <View>
        {headerTitleRow}
        {pills}
        <Pressable
          onPress={() => setMonthMenuOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            backgroundColor: T.card,
            borderWidth: 1,
            borderColor: T.glassBorder,
            marginBottom: 16,
          }}>
          <Text style={{ fontFamily: Font.jakarta600, fontSize: 15, color: T.textPrimary }}>
            {monthLabelPretty(selectedYmSafe)}
          </Text>
          <Text style={{ fontFamily: Font.manrope400, fontSize: 14, color: T.textMuted }}>▼</Text>
        </Pressable>

        <View
          style={{
            borderRadius: 20,
            backgroundColor: T.card,
            borderWidth: 1,
            borderColor: T.glassBorder,
            padding: 20,
            marginBottom: 16,
          }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: Font.manrope500,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: T.textMuted,
                }}>
                TOTAL {monthNameUpper(selectedYmSafe)}
              </Text>
              <Text
                style={{
                  fontFamily: Font.jakarta700,
                  marginTop: 8,
                  fontSize: 34,
                  color: T.textPrimary,
                  letterSpacing: -1,
                }}>
                {formatMoney(totalMonth, moneda)}
              </Text>
            </View>
            {pctVsPrev != null ? (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: pctVsPrev <= 0 ? T.tertiaryBg : T.primaryBg,
                }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: pctVsPrev <= 0 ? T.primary : T.error,
                  }}>
                  {pctVsPrev <= 0 ? '↑' : '↓'} {Math.abs(pctVsPrev).toFixed(1)}%
                </Text>
              </View>
            ) : (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: T.cardElevated,
                }}>
                <Text style={{ fontFamily: Font.manrope400, fontSize: 12, color: T.textMuted }}>—</Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
          <View
            style={{
              flex: 1,
              borderRadius: 16,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 16,
            }}>
            <Text style={{ fontFamily: Font.manrope400, fontSize: 12, color: T.textMuted }}>Gastos</Text>
            <Text style={{ fontFamily: Font.jakarta700, marginTop: 6, fontSize: 24, color: T.textPrimary }}>
              {txCountMonth}
            </Text>
            <Text style={{ fontFamily: Font.manrope400, marginTop: 2, fontSize: 11, color: T.textMuted }}>
              transacciones
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              borderRadius: 16,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 16,
            }}>
            <Text style={{ fontFamily: Font.manrope400, fontSize: 12, color: T.textMuted }}>Categorías</Text>
            <Text style={{ fontFamily: Font.jakarta700, marginTop: 6, fontSize: 24, color: T.textPrimary }}>
              {catCountMonth}
            </Text>
            <Text style={{ fontFamily: Font.manrope400, marginTop: 2, fontSize: 11, color: T.textMuted }}>
              usadas
            </Text>
          </View>
        </View>
      </View>
    ),
    [T, headerTitleRow, pills, selectedYmSafe, totalMonth, moneda, pctVsPrev, txCountMonth, catCountMonth],
  );

  const listHeaderRango = useMemo(
    () => (
      <View>
        {headerTitleRow}
        {pills}
        <View style={{ gap: 12, marginBottom: 16 }}>
          <View>
            <Text style={[filterDateStyles.sectionLabel, { color: T.textMuted, marginBottom: 6 }]}>DESDE</Text>
            {Platform.OS === 'web' ? (
              <View
                style={{
                  backgroundColor: T.surface,
                  borderColor: T.glassBorder,
                  borderWidth: 1,
                  borderRadius: 12,
                  height: 52,
                  overflow: 'hidden',
                  justifyContent: 'center',
                }}>
                <input
                  type="date"
                  value={rangeFromKey}
                  onChange={(e: any) => setRangeFromKey(e.target.value)}
                  style={
                    {
                      width: '100%',
                      height: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'white',
                      fontSize: 15,
                      paddingLeft: 16,
                      paddingRight: 16,
                      cursor: 'pointer',
                      colorScheme: 'dark',
                    } as any
                  }
                />
              </View>
            ) : (
              <Pressable
                onPress={() => openRangePicker('from')}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  backgroundColor: T.card,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                }}>
                <Text style={{ fontFamily: Font.jakarta600, fontSize: 15, color: T.textPrimary }}>{rangeFromKey}</Text>
              </Pressable>
            )}
          </View>
          <View>
            <Text style={[filterDateStyles.sectionLabel, { color: T.textMuted, marginBottom: 6 }]}>HASTA</Text>
            {Platform.OS === 'web' ? (
              <View
                style={{
                  backgroundColor: T.surface,
                  borderColor: T.glassBorder,
                  borderWidth: 1,
                  borderRadius: 12,
                  height: 52,
                  overflow: 'hidden',
                  justifyContent: 'center',
                }}>
                <input
                  type="date"
                  value={rangeToKey}
                  onChange={(e: any) => setRangeToKey(e.target.value)}
                  style={
                    {
                      width: '100%',
                      height: '100%',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'white',
                      fontSize: 15,
                      paddingLeft: 16,
                      paddingRight: 16,
                      cursor: 'pointer',
                      colorScheme: 'dark',
                    } as any
                  }
                />
              </View>
            ) : (
              <Pressable
                onPress={() => openRangePicker('to')}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  backgroundColor: T.card,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                }}>
                <Text style={{ fontFamily: Font.jakarta600, fontSize: 15, color: T.textPrimary }}>{rangeToKey}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View
          style={{
            borderRadius: 20,
            backgroundColor: T.card,
            borderWidth: 1,
            borderColor: T.glassBorder,
            padding: 20,
            marginBottom: 16,
          }}>
          <Text
            style={{
              fontFamily: Font.manrope500,
              fontSize: 11,
              letterSpacing: 1.5,
              color: T.textMuted,
            }}>
            TOTAL RANGO
          </Text>
          <Text style={{ fontFamily: Font.jakarta700, marginTop: 8, fontSize: 28, color: T.textPrimary }}>
            {formatMoney(totalRange, moneda)}
          </Text>
          <Text style={{ fontFamily: Font.manrope400, marginTop: 6, fontSize: 12, color: T.textMuted }}>
            {rangeFiltered.length} movimientos
          </Text>
        </View>
      </View>
    ),
    [T, headerTitleRow, pills, rangeFromKey, rangeToKey, openRangePicker, totalRange, moneda, rangeFiltered.length],
  );

  const listHeaderTotal = useMemo(
    () => (
      <View>
        {headerTitleRow}
        {pills}
        <View
          style={{
            borderRadius: 20,
            backgroundColor: T.card,
            borderWidth: 1,
            borderColor: T.glassBorder,
            padding: 20,
            marginBottom: 16,
          }}>
          <Text
            style={{
              fontFamily: Font.manrope500,
              fontSize: 11,
              letterSpacing: 1.5,
              color: T.textMuted,
            }}>
            TOTAL HISTÓRICO
          </Text>
          <Text style={{ fontFamily: Font.jakarta700, marginTop: 8, fontSize: 30, color: T.textPrimary }}>
            {formatMoney(totalHistorico, moneda)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <View
            style={{
              flexGrow: 1,
              minWidth: '30%',
              borderRadius: 16,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 14,
            }}>
            <Text style={{ fontFamily: Font.manrope500, fontSize: 11, letterSpacing: 1.5, color: T.textMuted }}>
              TRANSACCIONES
            </Text>
            <Text style={{ fontFamily: Font.jakarta700, marginTop: 6, fontSize: 24, color: T.textPrimary }}>
              {txTotal}
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              minWidth: '30%',
              borderRadius: 16,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 14,
            }}>
            <Text style={{ fontFamily: Font.manrope500, fontSize: 11, letterSpacing: 1.5, color: T.textMuted }}>
              PROM. · MES
            </Text>
            <Text style={{ fontFamily: Font.jakarta700, marginTop: 6, fontSize: 22, color: T.textPrimary }} numberOfLines={1}>
              {formatMoney(promedioPorMes, moneda)}
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              minWidth: '30%',
              borderRadius: 16,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 14,
            }}>
            <Text style={{ fontFamily: Font.manrope500, fontSize: 11, letterSpacing: 1.5, color: T.textMuted }}>
              MES MÁS CARO
            </Text>
            <Text style={{ fontFamily: Font.jakarta600, marginTop: 6, fontSize: 12, color: T.textPrimary }} numberOfLines={2}>
              {mesMasCaro ? mesMasCaro.label : '—'}
            </Text>
            {mesMasCaro ? (
              <Text style={{ fontFamily: Font.jakarta700, marginTop: 4, fontSize: 14, color: T.primary }}>
                {formatMoney(mesMasCaro.total, moneda)}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    ),
    [T, headerTitleRow, pills, totalHistorico, moneda, txTotal, promedioPorMes, mesMasCaro],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1, maxWidth: MAX_W, alignSelf: 'center', width: '100%' }}>
        {vista === 'mes' ? (
          <SectionList<Expense, DaySection>
            style={sectionListStyle}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={listHeaderMes}
            sections={sectionsMonth}
            keyExtractor={(item) => item.id}
            renderItem={renderExpenseRow}
            renderSectionHeader={({ section: { title } }) => dateSectionHeader(title)}
            ListEmptyComponent={
              <Text style={{ fontFamily: Font.manrope400, paddingVertical: 24, textAlign: 'center', color: T.textMuted }}>
                No hay gastos en este mes.
              </Text>
            }
          />
        ) : null}

        {vista === 'rango' ? (
          <SectionList<Expense, DaySection>
            style={sectionListStyle}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={listHeaderRango}
            sections={sectionsRange}
            keyExtractor={(item) => item.id}
            renderItem={renderExpenseRow}
            renderSectionHeader={({ section: { title } }) => dateSectionHeader(title)}
            ListEmptyComponent={
              <Text style={{ fontFamily: Font.manrope400, paddingVertical: 24, textAlign: 'center', color: T.textMuted }}>
                No hay gastos en el rango seleccionado.
              </Text>
            }
          />
        ) : null}

        {vista === 'total' ? (
          <SectionList<Expense, MonthSection>
            style={sectionListStyle}
            contentContainerStyle={listContentStyle}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={listHeaderTotal}
            sections={sectionsTotal}
            keyExtractor={(item) => item.id}
            renderItem={renderExpenseRow}
            renderSectionHeader={({ section }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 22,
                  paddingBottom: 10,
                }}>
                <Text style={{ fontFamily: Font.manrope600, fontSize: 11, letterSpacing: 2, color: T.textMuted }}>
                  {section.title}
                </Text>
                <Text style={{ fontFamily: Font.jakarta700, fontSize: 14, color: T.textPrimary }}>
                  {section.monthTotal}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={{ fontFamily: Font.manrope400, paddingVertical: 24, textAlign: 'center', color: T.textMuted }}>
                Sin gastos registrados.
              </Text>
            }
          />
        ) : null}
      </View>

      <Modal visible={monthMenuOpen} transparent animationType="fade" onRequestClose={() => setMonthMenuOpen(false)}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: 16,
            backgroundColor: modalOverlayScrim,
          }}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setMonthMenuOpen(false)} />
          <View
            style={{
              zIndex: 1,
              maxWidth: MAX_W,
              width: '100%',
              alignSelf: 'center',
              borderRadius: 16,
              backgroundColor: T.surface,
              borderWidth: 1,
              borderColor: T.glassBorder,
              maxHeight: '55%',
              overflow: 'hidden',
            }}>
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: T.primaryBorder }} />
            </View>
            <Text
              style={{
                padding: 16,
                fontFamily: Font.jakarta700,
                fontSize: 16,
                color: T.textPrimary,
              }}>
              Elegir mes
            </Text>
            <FlatList
              data={monthsAvailable}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setSelectedYm(item);
                    setMonthMenuOpen(false);
                  }}
                  style={{
                    paddingVertical: 16,
                    paddingHorizontal: 18,
                    backgroundColor: item === selectedYmSafe ? T.primaryBg : 'transparent',
                  }}>
                  <Text
                    style={{
                      fontFamily: item === selectedYmSafe ? Font.jakarta700 : Font.manrope400,
                      fontSize: 16,
                      color: T.textPrimary,
                    }}>
                    {monthLabelPretty(item)}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {Platform.OS === 'ios' && rangePicker ? (
        <Modal transparent animationType="slide" visible onRequestClose={() => setRangePicker(null)}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setRangePicker(null)} />
            <View
              style={{
                zIndex: 1,
                backgroundColor: T.surface,
                paddingBottom: 28,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                borderTopWidth: 1,
                borderColor: T.primaryBorder,
              }}>
              <View style={{ alignItems: 'center', paddingTop: 10 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: T.primaryBorder }} />
              </View>
              <DateTimePicker
                value={rangeDraftDate}
                mode="date"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(_, d) => {
                  if (d) setRangeDraftDate(d);
                }}
              />
              <Pressable
                onPress={applyRangeIosDate}
                style={{
                  marginHorizontal: 20,
                  marginTop: 8,
                  borderRadius: 12,
                  overflow: 'hidden',
                  shadowColor: T.shadowPrimary,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 1,
                  shadowRadius: 32,
                  elevation: 16,
                }}>
                <GradientView colors={T.primaryGrad} style={{ paddingVertical: 14, alignItems: 'center' }}>
                  <Text style={{ fontFamily: Font.jakarta700, textAlign: 'center', color: onPrimaryGradient.text }}>
                    Listo
                  </Text>
                </GradientView>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}
