import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GradientView } from '@/components/ui/GradientView';
import { modalOverlayScrim, onPrimaryGradient } from '@/constants/theme';
import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import * as db from '@/lib/database';
import { createId } from '@/lib/ids';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';
import { DEFAULT_BANCOS_DISPONIBLES } from '@/types';

const STORAGE_KEY = 'ahorraya_first_expense_wallet_intro';

const PAYMENT_OPTIONS = [
  'Efectivo',
  'Yape',
  'Plin',
  'Tarjeta de débito',
  'Tarjeta de crédito',
  'BIM',
  'Transferencia',
] as const;

const PAYMENT_EMOJI: Record<string, string> = {
  Efectivo: '💵',
  Yape: '💜',
  Plin: '💙',
  'Tarjeta de débito': '💳',
  'Tarjeta de crédito': '🏦',
  BIM: '📲',
  Transferencia: '↔️',
};

const MAIN_BANKS = ['BCP', 'Scotiabank', 'Interbank', 'BBVA'] as const;
const MAIN_BANKS_SET = new Set<string>(MAIN_BANKS);
const MORE_BANKS = DEFAULT_BANCOS_DISPONIBLES.filter((b) => !MAIN_BANKS_SET.has(b));

export async function shouldShowFirstExpenseWallet(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  return v !== 'done' && v !== 'skipped';
}

export async function markFirstExpenseWalletDone() {
  await AsyncStorage.setItem(STORAGE_KEY, 'done');
}

export async function markFirstExpenseWalletSkipped() {
  await AsyncStorage.setItem(STORAGE_KEY, 'skipped');
}

type Props = {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

export function FirstExpenseWalletModal({ visible, onComplete, onSkip }: Props) {
  const { T } = useTheme();
  const user = useAuthStore((s) => s.user);
  const profile = useFinanceStore((s) => s.profile);
  const loadFromSupabase = useFinanceStore((s) => s.loadFromSupabase);

  const [payments, setPayments] = useState<string[]>(['Efectivo']);
  const [banks, setBanks] = useState<string[]>(['BCP']);
  const [showMoreBanks, setShowMoreBanks] = useState(false);
  const [customPay, setCustomPay] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [saving, setSaving] = useState(false);

  const syncFromProfile = useCallback(() => {
    const payNames = (profile.metodosDePago ?? []).map((m) => m.nombre).filter(Boolean);
    setPayments(payNames.length > 0 ? payNames : ['Efectivo']);
    const b = profile.bancosDisponibles ?? [];
    setBanks(b.length > 0 ? [...b] : ['BCP']);
  }, [profile.metodosDePago, profile.bancosDisponibles]);

  useEffect(() => {
    if (!visible) return;
    syncFromProfile();
  }, [visible, syncFromProfile]);

  const toggle = (list: string[], setList: (v: string[]) => void, name: string) => {
    if (list.includes(name)) {
      if (list.length <= 1) return;
      setList(list.filter((x) => x !== name));
    } else {
      setList([...list, name]);
    }
  };

  const addCustomPayment = () => {
    const t = customPay.trim();
    if (!t || payments.some((p) => p.toLowerCase() === t.toLowerCase())) return;
    setPayments((p) => [...p, t]);
    setCustomPay('');
  };

  const addCustomBank = () => {
    const t = customBank.trim();
    if (!t || banks.some((b) => b.toLowerCase() === t.toLowerCase())) return;
    setBanks((b) => [...b, t]);
    setCustomBank('');
  };

  const onSave = async () => {
    if (payments.length === 0 || banks.length === 0) return;
    setSaving(true);
    try {
      const uid = user?.id;
      if (uid) {
        await db.updateProfile(uid, {
          metodos_de_pago: payments,
          bancos_disponibles: banks,
        });
        await loadFromSupabase();
      }
      useFinanceStore.setState((state) => ({
        profile: {
          ...state.profile,
          metodosDePago: payments.map((nombre) => ({ id: createId(), nombre, activo: true })),
          bancosDisponibles: banks,
        },
      }));
      await markFirstExpenseWalletDone();
      onComplete();
    } catch (e) {
      console.error('FirstExpenseWalletModal save:', e);
    } finally {
      setSaving(false);
    }
  };

  const chip = (label: string, active: boolean, onPress: () => void, emoji?: string) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? T.primary : T.glassBorder,
        backgroundColor: active ? T.primaryBg : T.cardElevated,
        marginRight: 6,
        marginBottom: 6,
      }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? T.primary : T.textSecondary, textAlign: 'center' }}>
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </Pressable>
  );

  const sectionLabel = {
    fontFamily: Font.manrope600,
    color: T.textMuted,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 8,
  };

  const masBanksCount = useMemo(() => MORE_BANKS.length, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
        <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: modalOverlayScrim }]} onPress={onSkip} />
        <View
          style={{
            zIndex: 1,
            maxHeight: '88%',
            maxWidth: 400,
            width: '100%',
            alignSelf: 'center',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: T.primaryBorder,
            backgroundColor: T.surface,
            overflow: 'hidden',
            ...Platform.select({
              ios: { shadowColor: T.primary, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 28 },
              android: { elevation: 18 },
              web: {
                boxShadow: `0 0 0 1px ${T.primaryBorder}, 0 24px 48px ${T.shadowPrimary}`,
              } as object,
              default: {},
            }),
          }}>
          <View style={{ height: 3, width: '100%' }}>
            <GradientView colors={T.primaryGrad} style={{ flex: 1 }} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 18 }}>
            <Text style={{ fontSize: 28, textAlign: 'center' }}>✨</Text>
            <Text
              style={{
                fontFamily: Font.jakarta700,
                fontSize: 20,
                color: T.textPrimary,
                textAlign: 'center',
                marginTop: 8,
                letterSpacing: -0.4,
              }}>
              Tu billetera
            </Text>
            <Text style={{ fontFamily: Font.manrope400, fontSize: 13, color: T.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
              Antes de tu primer gasto, elegí cómo pagás y en qué bancos movés plata. Podés cambiarlo después en Perfil.
            </Text>

            <View style={{ height: 20 }} />
            <Text style={sectionLabel}>MÉTODOS DE PAGO QUE USÁS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {PAYMENT_OPTIONS.map((p) => chip(p, payments.includes(p), () => toggle(payments, setPayments, p), PAYMENT_EMOJI[p]))}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              <TextInput
                value={customPay}
                onChangeText={setCustomPay}
                placeholder="Otro medio…"
                placeholderTextColor={T.textMuted}
                onSubmitEditing={addCustomPayment}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: T.textPrimary,
                  fontSize: 14,
                }}
              />
              <Pressable
                onPress={addCustomPayment}
                style={{ paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.primaryBg, justifyContent: 'center', borderWidth: 1, borderColor: T.primaryBorder }}>
                <Text style={{ fontWeight: '800', color: T.primary, fontSize: 13 }}>＋</Text>
              </Pressable>
            </View>

            <View style={{ height: 22 }} />
            <Text style={sectionLabel}>BANCOS QUE USÁS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {MAIN_BANKS.map((b) => chip(b, banks.includes(b), () => toggle(banks, setBanks, b)))}
            </View>
            {masBanksCount > 0 ? (
              <Pressable onPress={() => setShowMoreBanks((v) => !v)} style={{ marginTop: 6, marginBottom: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: T.primary }}>
                  {showMoreBanks ? '▴ Menos bancos' : `▾ Más bancos (${masBanksCount})`}
                </Text>
              </Pressable>
            ) : null}
            {showMoreBanks ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {MORE_BANKS.map((b) => chip(b, banks.includes(b), () => toggle(banks, setBanks, b)))}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              <TextInput
                value={customBank}
                onChangeText={setCustomBank}
                placeholder="Otro banco…"
                placeholderTextColor={T.textMuted}
                onSubmitEditing={addCustomBank}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: T.glassBorder,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: T.textPrimary,
                  fontSize: 14,
                }}
              />
              <Pressable
                onPress={addCustomBank}
                style={{ paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.primaryBg, justifyContent: 'center', borderWidth: 1, borderColor: T.primaryBorder }}>
                <Text style={{ fontWeight: '800', color: T.primary, fontSize: 13 }}>＋</Text>
              </Pressable>
            </View>

            <View style={{ height: 22 }} />
            <Pressable onPress={onSkip} disabled={saving} style={{ alignSelf: 'center', paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, color: T.textMuted, textDecorationLine: 'underline' }}>Omitir por ahora</Text>
            </Pressable>

            <Pressable onPress={onSave} disabled={saving || payments.length === 0 || banks.length === 0} style={{ marginTop: 6, borderRadius: 16, overflow: 'hidden' }}>
              <GradientView colors={T.primaryGrad} style={{ height: 52, alignItems: 'center', justifyContent: 'center', opacity: saving || payments.length === 0 || banks.length === 0 ? 0.55 : 1 }}>
                {saving ? (
                  <ActivityIndicator color={onPrimaryGradient.text} />
                ) : (
                  <Text style={{ fontFamily: Font.jakarta700, fontSize: 16, color: onPrimaryGradient.text }}>LISTO · REGISTRAR GASTO</Text>
                )}
              </GradientView>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
