/**
 * WaBotPromoModal
 * Modal futurista que aparece la primera vez que un usuario sin vincular llega al home.
 * Solo se muestra una vez (flag ahorraya_wa_promo_v1 en AsyncStorage).
 */
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';

import { GradientView } from '@/components/ui/GradientView';
import { Font } from '@/constants/typography';

interface Props {
  visible: boolean;
  onConnect: () => void;
  onDismiss: () => void;
}

const FEATURES = [
  { icon: '💬', text: 'Envía "pollo 15" y listo — sin abrir la app' },
  { icon: '📊', text: 'Consulta tu resumen al instante' },
  { icon: '🔒', text: 'Seguro y vinculado solo a tu cuenta' },
] as const;

export function WaBotPromoModal({ visible, onConnect, onDismiss }: Props) {
  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(56)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scanAnim   = useRef(new Animated.Value(0)).current;
  const float1     = useRef(new Animated.Value(0)).current;
  const float2     = useRef(new Animated.Value(0)).current;
  const glowAnim   = useRef(new Animated.Value(0.4)).current;

  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);
  const rotLoop    = useRef<Animated.CompositeAnimation | null>(null);
  const scanLoop   = useRef<Animated.CompositeAnimation | null>(null);
  const floatLoop1 = useRef<Animated.CompositeAnimation | null>(null);
  const floatLoop2 = useRef<Animated.CompositeAnimation | null>(null);
  const glowLoop   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 7, tension: 55, useNativeDriver: true }),
      ]).start();

      pulseLoop.current = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.13, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      pulseLoop.current.start();

      rotLoop.current = Animated.loop(
        Animated.timing(rotateAnim, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }),
      );
      rotLoop.current.start();

      scanLoop.current = Animated.loop(Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(scanAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
      scanLoop.current.start();

      floatLoop1.current = Animated.loop(Animated.sequence([
        Animated.timing(float1, { toValue: -9, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float1, { toValue: 0,  duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      floatLoop1.current.start();

      floatLoop2.current = Animated.loop(Animated.sequence([
        Animated.delay(700),
        Animated.timing(float2, { toValue: 7,  duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(float2, { toValue: 0,  duration: 2100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      floatLoop2.current.start();

      glowLoop.current = Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.9, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]));
      glowLoop.current.start();
    } else {
      [pulseLoop, rotLoop, scanLoop, floatLoop1, floatLoop2, glowLoop].forEach((r) => r.current?.stop());
      fadeAnim.setValue(0);
      slideAnim.setValue(56);
      pulseAnim.setValue(1);
      rotateAnim.setValue(0);
      scanAnim.setValue(0);
      float1.setValue(0);
      float2.setValue(0);
      glowAnim.setValue(0.4);
    }
  }, [visible]);

  const rotateDeg = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateRev = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const scanY     = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [-54, 54] });

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onDismiss} statusBarTranslucent>
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.88)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: fadeAnim,
          paddingHorizontal: 20,
        }}>

        <Animated.View style={{ width: '100%', maxWidth: 340, transform: [{ translateY: slideAnim }] }}>
          {/* Gradient border wrapper */}
          <GradientView colors={['#7C3AED', '#00D4FF', '#4DF2B1']} style={{ borderRadius: 28, padding: 1.5 }}>
            <View style={{ backgroundColor: '#06061B', borderRadius: 27, overflow: 'hidden' }}>

              {/* BG orbs */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute', top: -50, right: -50,
                  width: 200, height: 200, borderRadius: 100,
                  backgroundColor: 'rgba(124,58,237,0.15)',
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute', bottom: -30, left: -30,
                  width: 160, height: 160, borderRadius: 80,
                  backgroundColor: 'rgba(0,212,255,0.08)',
                }}
              />

              <View style={{ padding: 26, alignItems: 'center' }}>

                {/* ── Icon section ── */}
                <View style={{ height: 130, width: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>

                  {/* Outer rotating dashed ring */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: 120, height: 120, borderRadius: 60,
                      borderWidth: 1.5,
                      borderColor: 'rgba(124,58,237,0.45)',
                      borderStyle: 'dashed',
                      transform: [{ rotate: rotateDeg }],
                    }}
                  />
                  {/* Inner counter-rotating ring */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: 96, height: 96, borderRadius: 48,
                      borderWidth: 1,
                      borderColor: 'rgba(0,212,255,0.35)',
                      borderStyle: 'dashed',
                      transform: [{ rotate: rotateRev }],
                    }}
                  />

                  {/* Glow halo */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: 80, height: 80, borderRadius: 40,
                      backgroundColor: 'transparent',
                      shadowColor: '#7C3AED',
                      shadowOffset: { width: 0, height: 0 },
                      shadowRadius: 28,
                      opacity: glowAnim,
                      shadowOpacity: 1,
                    }}
                  />

                  {/* Main bot icon box */}
                  <Animated.View
                    style={{
                      width: 76, height: 76, borderRadius: 22,
                      backgroundColor: 'rgba(124,58,237,0.2)',
                      borderWidth: 1.5, borderColor: 'rgba(124,58,237,0.55)',
                      alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden',
                      transform: [{ scale: pulseAnim }, { translateY: float1 }],
                    }}>
                    {/* Scan line */}
                    <Animated.View
                      style={{
                        position: 'absolute', height: 2, width: '100%',
                        backgroundColor: 'rgba(0,212,255,0.65)',
                        transform: [{ translateY: scanY }],
                      }}
                    />
                    <Text style={{ fontSize: 38 }}>🤖</Text>
                  </Animated.View>

                  {/* Floating particles */}
                  <Animated.View
                    style={{
                      position: 'absolute', top: 10, left: 22,
                      width: 7, height: 7, borderRadius: 3.5,
                      backgroundColor: '#4DF2B1',
                      shadowColor: '#4DF2B1', shadowOpacity: 1, shadowRadius: 5,
                      transform: [{ translateY: float1 }],
                    }}
                  />
                  <Animated.View
                    style={{
                      position: 'absolute', bottom: 18, right: 20,
                      width: 6, height: 6, borderRadius: 3,
                      backgroundColor: '#00D4FF',
                      shadowColor: '#00D4FF', shadowOpacity: 1, shadowRadius: 4,
                      transform: [{ translateY: float2 }],
                    }}
                  />
                  <Animated.View
                    style={{
                      position: 'absolute', top: 22, right: 18,
                      width: 5, height: 5, borderRadius: 2.5,
                      backgroundColor: '#9D5FF0',
                      shadowColor: '#9D5FF0', shadowOpacity: 1, shadowRadius: 3,
                      transform: [{ translateY: float2 }],
                    }}
                  />
                </View>

                {/* Live badge */}
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: 'rgba(77,242,177,0.1)',
                    borderWidth: 1, borderColor: 'rgba(77,242,177,0.3)',
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4,
                    marginBottom: 16,
                  }}>
                  <View
                    style={{
                      width: 6, height: 6, borderRadius: 3,
                      backgroundColor: '#4DF2B1',
                      shadowColor: '#4DF2B1', shadowOpacity: 1, shadowRadius: 4,
                    }}
                  />
                  <Text style={{ fontFamily: Font.manrope600, color: '#4DF2B1', fontSize: 10, letterSpacing: 0.8 }}>
                    ASISTENTE IA DISPONIBLE
                  </Text>
                </View>

                {/* Title */}
                <Text
                  style={{
                    fontFamily: Font.jakarta700,
                    color: '#FFFFFF',
                    fontSize: 22, lineHeight: 30,
                    textAlign: 'center',
                    marginBottom: 10,
                  }}>
                  Tu asistente está{'\n'}listo para ayudarte
                </Text>

                {/* Subtitle */}
                <Text
                  style={{
                    fontFamily: Font.manrope400,
                    color: 'rgba(255,255,255,0.58)',
                    fontSize: 13, lineHeight: 20,
                    textAlign: 'center',
                    marginBottom: 22,
                  }}>
                  Controla tus finanzas directo desde{' '}
                  <Text style={{ color: '#25D366', fontFamily: Font.manrope600 }}>WhatsApp</Text>
                  {' '}con inteligencia artificial, sin abrir la app.
                </Text>

                {/* Feature rows */}
                <View style={{ width: '100%', gap: 9, marginBottom: 24 }}>
                  {FEATURES.map((f) => (
                    <View
                      key={f.icon}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderRadius: 12, padding: 10,
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
                      }}>
                      <View
                        style={{
                          width: 34, height: 34, borderRadius: 10,
                          backgroundColor: 'rgba(124,58,237,0.22)',
                          borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                        <Text style={{ fontSize: 16 }}>{f.icon}</Text>
                      </View>
                      <Text style={{ fontFamily: Font.manrope400, color: 'rgba(255,255,255,0.72)', fontSize: 12, flex: 1, lineHeight: 17 }}>
                        {f.text}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* CTA button */}
                <Pressable
                  onPress={onConnect}
                  style={{ width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
                  <GradientView
                    colors={['#7C3AED', '#00D4FF']}
                    style={{ height: 54, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                      backgroundColor: 'rgba(255,255,255,0.22)',
                    }} />
                    <Text style={{ fontFamily: Font.jakarta700, color: '#FFFFFF', fontSize: 16 }}>
                      ⚡ Conectar ahora
                    </Text>
                  </GradientView>
                </Pressable>

                {/* Dismiss */}
                <Pressable onPress={onDismiss} hitSlop={12}>
                  <Text style={{ fontFamily: Font.manrope500, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
                    Más tarde
                  </Text>
                </Pressable>

              </View>
            </View>
          </GradientView>
        </Animated.View>

      </Animated.View>
    </Modal>
  );
}
