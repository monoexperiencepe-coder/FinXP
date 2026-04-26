/**
 * ThemePickerModal — widget flotante compacto
 * Aparece una sola vez tras el registro, en la parte inferior.
 * El home queda visible detrás. Al tocar una opción el tema cambia en vivo.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { darkTheme, lightTheme } from '@/constants/theme';
import { markThemePickerShown } from '@/lib/preferences';
import { useFinanceStore } from '@/store/useFinanceStore';

type ThemeOption = 'dark' | 'light';

interface Props {
  visible: boolean;
  onDone: () => void;
}

export function ThemePickerModal({ visible, onDone }: Props) {
  const setTheme   = useFinanceStore((s) => s.setTheme);
  const storeTheme = useFinanceStore((s) => s.theme);
  const [selected, setSelected] = useState<ThemeOption>(storeTheme);

  const backdropOp = useRef(new Animated.Value(0)).current;
  const cardScale  = useRef(new Animated.Value(0.82)).current;
  const cardOp     = useRef(new Animated.Value(0)).current;
  const cardTY     = useRef(new Animated.Value(32)).current;

  // Animaciones escalonadas: primero backdrop, luego la tarjeta sube con spring
  useEffect(() => {
    if (!visible) return;
    backdropOp.setValue(0);
    cardScale.setValue(0.82);
    cardOp.setValue(0);
    cardTY.setValue(32);

    Animated.sequence([
      Animated.timing(backdropOp, {
        toValue: 1, duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(cardOp, {
          toValue: 1, duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 1, duration: 500,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.timing(cardTY, {
          toValue: 0, duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [visible, backdropOp, cardScale, cardOp, cardTY]);

  const handleSelect = (mode: ThemeOption) => {
    setSelected(mode);
    setTheme(mode); // cambia el home detrás en tiempo real
  };

  const handleConfirm = async () => {
    await markThemePickerShown();
    onDone();
  };

  const T = storeTheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      {/* Backdrop sutil — el home se ve detrás */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.30)', opacity: backdropOp }]} />

      {/* Tarjeta centrada */}
      <Animated.View
        style={[
          S.wrapper,
          {
            opacity: cardOp,
            transform: [{ scale: cardScale }, { translateY: cardTY }],
          },
        ]}>
        <View style={[S.card, {
          backgroundColor: T.card,
          borderColor: T.glassBorder,
          ...Platform.select({
            ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 18 },
            android: { elevation: 14 },
            web:     { boxShadow: '0 6px 32px rgba(0,0,0,0.38)' } as object,
            default: {},
          }),
        }]}>

          {/* Handle */}
          <View style={[S.handle, { backgroundColor: T.glassBorder }]} />

          {/* Columna compacta */}
          <View style={S.row}>
            <Text style={[S.question, { color: T.textSecondary }]}>¿Modo día o noche?</Text>

            {/* Opciones en fila */}
            <View style={S.pills}>
              {(['dark', 'light'] as ThemeOption[]).map((mode) => {
                const active = selected === mode;
                const icon   = mode === 'dark' ? '🌙' : '☀️';
                const label  = mode === 'dark' ? 'Noche' : 'Día';
                return (
                  <TouchableOpacity
                    key={mode}
                    activeOpacity={0.75}
                    onPress={() => handleSelect(mode)}
                    style={[
                      S.pill,
                      {
                        backgroundColor: active ? T.primaryBg : T.surface,
                        borderColor:     active ? T.primary   : T.glassBorder,
                        borderWidth:     active ? 1.5 : 1,
                      },
                    ]}>
                    <Text style={S.pillIcon}>{icon}</Text>
                    <Text style={[S.pillLabel, { color: active ? T.primary : T.textSecondary }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Nota: se puede cambiar después */}
            <Text style={[S.hint, { color: T.textSecondary }]}>
              Puedes cambiarlo cuando quieras en tu perfil.
            </Text>

            {/* Confirmar */}
            <TouchableOpacity activeOpacity={0.84} onPress={handleConfirm} style={S.ctaWrap}>
              <LinearGradient
                colors={['#7C3AED', '#5B21B6', '#00D4FF']}
                locations={[0, 0.6, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={S.ctaGrad}>
                <Text style={S.ctaText}>Listo →</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

        </View>
      </Animated.View>
    </Modal>
  );
}

const S = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 280,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 14,
    alignItems: 'center',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: 'center',
  },
  row: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  question: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  pillIcon:  { fontSize: 16 },
  pillLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontWeight: '700',
  },
  ctaWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  ctaGrad: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    backgroundColor: 'rgba(124,58,237,0.14)',
    borderColor: 'rgba(124,58,237,0.34)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
