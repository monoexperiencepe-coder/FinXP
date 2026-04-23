/**
 * JarvisGuide — asistente contextual en tiempo real.
 * Detecta el estado del usuario y sugiere el próximo paso financiero.
 * Vive inline en el home, sin modales ni interrupciones.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';

import { GradientView } from '@/components/ui/GradientView';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useFinanceStore } from '@/store/useFinanceStore';

/* ── Storage key ─────────────────────────────────────────────────────────── */
const KEY_SKIPPED = 'ahorraya_jarvis_skipped_v1';

/* ── Step definitions ────────────────────────────────────────────────────── */
type StepId =
  | 'primer_gasto'
  | 'primer_ingreso'
  | 'establecer_presupuesto'
  | 'definir_meta'
  | 'racha_3_dias';

interface JarvisStep {
  id: StepId;
  icon: string;
  titulo: string;
  detalle: string;
  cta: string;
  ctaIcon: string;
  accentFrom: string;
  accentTo: string;
}

const STEPS: JarvisStep[] = [
  {
    id: 'primer_gasto',
    icon: '💸',
    titulo: 'Registrá tu primer gasto',
    detalle: 'Empieza por anotar lo que gastás hoy. Cada registro suma XP y construye tu historial.',
    cta: 'Registrar gasto',
    ctaIcon: '⚡',
    accentFrom: '#7C3AED',
    accentTo: '#5B21B6',
  },
  {
    id: 'primer_ingreso',
    icon: '💼',
    titulo: 'Anotá tu sueldo o ingreso',
    detalle: 'Cuando registrás un ingreso, JARVIS puede calcular tu tasa de ahorro real y darte alertas útiles.',
    cta: 'Registrar ingreso',
    ctaIcon: '📥',
    accentFrom: '#00D4FF',
    accentTo: '#0099BB',
  },
  {
    id: 'establecer_presupuesto',
    icon: '🎯',
    titulo: 'Establecé un presupuesto',
    detalle: 'Define cuánto querés gastar por categoría. JARVIS te alertará cuando te acerques al límite.',
    cta: 'Ir a presupuestos',
    ctaIcon: '📊',
    accentFrom: '#FFB84D',
    accentTo: '#E08000',
  },
  {
    id: 'definir_meta',
    icon: '🏆',
    titulo: 'Define tu meta de ahorro mensual',
    detalle: 'Una meta concreta multiplica tus chances de cumplirla. ¿Cuánto querés ahorrar este mes?',
    cta: 'Establecer meta',
    ctaIcon: '🏆',
    accentFrom: '#4DF2B1',
    accentTo: '#006C4A',
  },
  {
    id: 'racha_3_dias',
    icon: '🔥',
    titulo: 'Mantené tu racha 3 días',
    detalle: 'Registrá al menos un gasto o ingreso hoy. Las rachas desbloquean recompensas y potencian tu XP.',
    cta: 'Registrar ahora',
    ctaIcon: '🔥',
    accentFrom: '#FF5E7D',
    accentTo: '#C8003A',
  },
];

/* ── Props ────────────────────────────────────────────────────────────────── */
interface Props {
  onRegisterExpense: () => void;
  onRegisterIncome: () => void;
  onGoToBudgets: () => void;
  onGoToProfile: () => void;
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function JarvisGuide({ onRegisterExpense, onRegisterIncome, onGoToBudgets, onGoToProfile }: Props) {
  const { T } = useTheme();
  const expenses  = useFinanceStore((s) => s.expenses);
  const incomes   = useFinanceStore((s) => s.incomes);
  const budgets   = useFinanceStore((s) => s.budgets);
  const profile   = useFinanceStore((s) => s.profile);

  const [skipped, setSkipped] = useState<StepId[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(true);

  /* Pulsing dot */
  const pulse = useRef(new Animated.Value(1)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse, { toValue: 1.6, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulse, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(dotOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(600),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  /* Load skipped from storage */
  useEffect(() => {
    AsyncStorage.getItem(KEY_SKIPPED).then((val) => {
      if (val) setSkipped(JSON.parse(val) as StepId[]);
      setLoaded(true);
    });
  }, []);

  const skip = async (id: StepId) => {
    const next = [...skipped, id];
    setSkipped(next);
    await AsyncStorage.setItem(KEY_SKIPPED, JSON.stringify(next));
  };

  /* Determine which steps are pending */
  const pendingSteps = useMemo(() => {
    const hasBudgetLimit = budgets.some((b) => b.limiteMonthly > 0);
    const hasMeta = (profile.metaMensual ?? 0) > 0;

    const all: { id: StepId; done: boolean }[] = [
      { id: 'primer_gasto',          done: expenses.length > 0 },
      { id: 'primer_ingreso',        done: incomes.length > 0 },
      { id: 'establecer_presupuesto',done: hasBudgetLimit },
      { id: 'definir_meta',          done: hasMeta },
      { id: 'racha_3_dias',          done: profile.rachaActual >= 3 },
    ];

    return all
      .filter(({ id, done }) => !done && !skipped.includes(id))
      .map(({ id }) => STEPS.find((s) => s.id === id)!)
      .filter(Boolean);
  }, [expenses, incomes, budgets, profile, skipped]);

  const [stepIdx, setStepIdx] = useState(0);

  // reset index if it goes out of bounds
  const safeIdx = Math.min(stepIdx, Math.max(0, pendingSteps.length - 1));
  const step = pendingSteps[safeIdx];

  const totalCompleted = STEPS.length - pendingSteps.length - skipped.filter(id => {
    const stepDef = STEPS.find(s => s.id === id);
    if (!stepDef) return false;
    // Don't count "skipped but done" as extra
    return true;
  }).length;

  const completedCount = STEPS.length - pendingSteps.length;

  if (!loaded || !step) return null;

  const handleCta = () => {
    switch (step.id) {
      case 'primer_gasto':
      case 'racha_3_dias':
        onRegisterExpense(); break;
      case 'primer_ingreso':
        onRegisterIncome(); break;
      case 'establecer_presupuesto':
        onGoToBudgets(); break;
      case 'definir_meta':
        onGoToProfile(); break;
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {/* ── Card ── */}
      <View
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(124,58,237,0.25)',
          backgroundColor: '#0F1029',
          ...Platform.select({
            ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
            android: { elevation: 12 },
            web: { boxShadow: '0 8px 32px rgba(124,58,237,0.2)' } as object,
          }),
        }}>

        {/* Top accent bar */}
        <GradientView
          colors={[step.accentFrom, step.accentTo]}
          style={{ height: 2 }}
        />

        <View style={{ padding: 14 }}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            {/* Live dot */}
            <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
              <Animated.View
                style={{
                  position: 'absolute',
                  width: 18, height: 18, borderRadius: 9,
                  backgroundColor: step.accentFrom + '33',
                  transform: [{ scale: pulse }],
                  opacity: dotOpacity,
                }}
              />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: step.accentFrom }} />
            </View>

            <Text style={{ fontFamily: Font.manrope600, color: step.accentFrom, fontSize: 10, letterSpacing: 1.5, flex: 1 }}>
              JARVIS · SIGUIENTE PASO
            </Text>

            {/* Step counter */}
            <View style={{
              paddingHorizontal: 8, paddingVertical: 3,
              backgroundColor: 'rgba(255,255,255,0.07)',
              borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
            }}>
              <Text style={{ fontFamily: Font.jakarta700, color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>
                {completedCount}/{STEPS.length}
              </Text>
            </View>

            {/* Collapse toggle */}
            <Pressable onPress={() => setExpanded((e) => !e)} style={{ marginLeft: 8, padding: 4 }} hitSlop={8}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>{expanded ? '−' : '+'}</Text>
            </Pressable>
          </View>

          {/* Content (collapsible) */}
          {expanded && (
            <>
              {/* Icon + Title */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <View style={{
                  width: 44, height: 44, borderRadius: 14,
                  backgroundColor: step.accentFrom + '22',
                  borderWidth: 1, borderColor: step.accentFrom + '44',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 22 }}>{step.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 15, lineHeight: 20 }}>
                    {step.titulo}
                  </Text>
                  <Text style={{ fontFamily: Font.manrope400, color: 'rgba(200,208,224,0.75)', fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                    {step.detalle}
                  </Text>
                </View>
              </View>

              {/* Progress dots */}
              <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', marginBottom: 12 }}>
                {STEPS.map((s, i) => {
                  const isDone = !pendingSteps.find((p) => p.id === s.id);
                  const isCurrent = s.id === step.id;
                  return (
                    <View
                      key={s.id}
                      style={{
                        height: 3,
                        flex: 1,
                        borderRadius: 2,
                        backgroundColor: isDone
                          ? step.accentFrom
                          : isCurrent
                            ? step.accentFrom + '66'
                            : 'rgba(255,255,255,0.1)',
                      }}
                    />
                  );
                })}
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* CTA */}
                <Pressable
                  onPress={handleCta}
                  style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
                  <GradientView
                    colors={[step.accentFrom, step.accentTo]}
                    style={{
                      height: 42,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}>
                    <Text style={{ fontSize: 14 }}>{step.ctaIcon}</Text>
                    <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 13 }}>
                      {step.cta}
                    </Text>
                  </GradientView>
                </Pressable>

                {/* Skip / Next */}
                {pendingSteps.length > 1 && (
                  <Pressable
                    onPress={() => setStepIdx((i) => (i + 1) % pendingSteps.length)}
                    style={{
                      height: 42, paddingHorizontal: 12,
                      borderRadius: 12, borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.12)',
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: Font.manrope500 }}>
                      Ver otro →
                    </Text>
                  </Pressable>
                )}

                {/* Dismiss */}
                <Pressable
                  onPress={() => void skip(step.id)}
                  style={{
                    width: 42, height: 42,
                    borderRadius: 12, borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>✕</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
