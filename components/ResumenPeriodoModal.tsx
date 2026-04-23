import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GradientView } from '@/components/ui/GradientView';
import { onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { parseDateKeyLocal, toDateKey } from '@/lib/dates';
import { tryCustomBoundsFromKeys } from '@/lib/resumenMetrics';

export type ResumenPeriodoPayload = { from: string; to: string; presupuesto: number | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  onApply: (p: ResumenPeriodoPayload) => void;
  initial: ResumenPeriodoPayload;
};

function startOfMonthKey(): string {
  const n = new Date();
  return toDateKey(new Date(n.getFullYear(), n.getMonth(), 1));
}

function todayKey(): string {
  return toDateKey(new Date());
}

function lastNDaysKey(n: number): string {
  const t = new Date();
  t.setDate(t.getDate() - (n - 1));
  return toDateKey(t);
}

export function ResumenPeriodoModal({ visible, onClose, onApply, initial }: Props) {
  const { T } = useTheme();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [presupuestoStr, setPresupuestoStr] = useState(
    initial.presupuesto != null && initial.presupuesto > 0 ? String(initial.presupuesto) : '',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFrom(initial.from);
    setTo(initial.to);
    setPresupuestoStr(initial.presupuesto != null && initial.presupuesto > 0 ? String(initial.presupuesto) : '');
    setError(null);
  }, [visible, initial.from, initial.to, initial.presupuesto]);

  const apply = () => {
    const bounds = tryCustomBoundsFromKeys(from, to);
    if (!bounds) {
      setError('Revisá las fechas (YYYY-MM-DD). Desde no puede ser mayor que hasta; máximo 366 días.');
      return;
    }
    const raw = presupuestoStr.replace(',', '.').trim();
    let presupuesto: number | null = null;
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError('El presupuesto debe ser un número ≥ 0 o vacío.');
        return;
      }
      presupuesto = n > 0 ? n : null;
    }
    setError(null);
    onApply({ from: from.trim(), to: to.trim(), presupuesto });
  };

  const preset = (pf: string, pt: string) => {
    setFrom(pf);
    setTo(pt);
    setError(null);
  };

  const inputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.glassBorder,
    backgroundColor: T.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: T.textPrimary,
    fontFamily: Font.manrope500,
    fontSize: 15,
  } as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          padding: 20,
        }}
        onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              borderRadius: 20,
              backgroundColor: T.card,
              borderWidth: 1,
              borderColor: T.glassBorder,
              padding: 18,
              maxWidth: 400,
              width: '100%',
              alignSelf: 'center',
            }}>
            <Text style={{ fontFamily: Font.jakarta700, color: T.textPrimary, fontSize: 18 }}>
              Período y presupuesto
            </Text>
            <Text style={{ fontFamily: Font.manrope400, color: T.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 }}>
              Elegí desde–hasta para calcular ingresos, gastos y categorías. Opcional: tope de gasto del período para comparar con lo real.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              {[
                { label: 'Este mes', pf: startOfMonthKey(), pt: todayKey() },
                { label: '7 días', pf: lastNDaysKey(7), pt: todayKey() },
                { label: '30 días', pf: lastNDaysKey(30), pt: todayKey() },
              ].map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => preset(p.pf, p.pt)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: T.primaryBg,
                    borderWidth: 1,
                    borderColor: T.primaryBorder,
                  }}>
                  <Text style={{ fontFamily: Font.manrope600, color: T.primary, fontSize: 12 }}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontFamily: Font.manrope600, color: T.textSecondary, fontSize: 12, marginTop: 16 }}>Desde (AAAA-MM-DD)</Text>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="2026-04-01"
              placeholderTextColor={T.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ ...inputStyle, marginTop: 6 }}
            />

            <Text style={{ fontFamily: Font.manrope600, color: T.textSecondary, fontSize: 12, marginTop: 12 }}>Hasta (AAAA-MM-DD)</Text>
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="2026-04-22"
              placeholderTextColor={T.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ ...inputStyle, marginTop: 6 }}
            />

            <Text style={{ fontFamily: Font.manrope600, color: T.textSecondary, fontSize: 12, marginTop: 12 }}>
              Presupuesto de gastos del período (opcional)
            </Text>
            <TextInput
              value={presupuestoStr}
              onChangeText={setPresupuestoStr}
              placeholder="Ej. 2000"
              placeholderTextColor={T.textMuted}
              keyboardType="decimal-pad"
              style={{ ...inputStyle, marginTop: 6 }}
            />

            {error && (
              <Text style={{ fontFamily: Font.manrope500, color: T.error, fontSize: 12, marginTop: 10 }}>{error}</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  alignItems: 'center',
                  backgroundColor: T.surface,
                }}>
                <Text style={{ fontFamily: Font.jakarta600, color: T.textSecondary, fontSize: 14 }}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={apply} style={{ flex: 1, borderRadius: 12, overflow: 'hidden' }}>
                <GradientView colors={T.primaryGrad} style={{ paddingVertical: 12, alignItems: 'center' }}>
                  <Text style={{ fontFamily: Font.jakarta600, color: onPrimaryGradient.text, fontSize: 14 }}>Aplicar</Text>
                </GradientView>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

export function defaultResumenPeriodoPayload(): ResumenPeriodoPayload {
  return {
    from: startOfMonthKey(),
    to: todayKey(),
    presupuesto: null,
  };
}
