import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

export const PREMIUM_TEASER_KEY = 'ahorraya_premium_teaser_shown_v2';

const SLIDE_DURATION = 8000;

// ─── Slide content ────────────────────────────────────────────────────────────

const SLIDES = [
  {
    id: 'shared',
    eyebrow: '⏳  PRÓXIMAMENTE',
    icon: '🤝',
    iconGlow: '#7C3AED',
    title: 'Presupuesto\nmancomunado',
    sub: 'Finanzas en pareja o con socios.',
    lines: [
      '👥  Hasta 4 personas por cuenta compartida',
      '📊  Vista unificada de gastos del hogar',
      '🎯  Metas de ahorro en conjunto',
      '🔔  Alertas en tiempo real al registrar un gasto',
    ],
    accent: '#7C3AED',
    orb1: '#5B21B6',
    orb2: '#7C3AED',
  },
  {
    id: 'bot',
    eyebrow: '💎  PLAN PRO',
    icon: '🤖',
    iconGlow: '#00D4FF',
    title: 'Tu asesor financiero\nen WhatsApp',
    sub: 'Controla todo sin abrir la app.',
    lines: [
      '📸  Foto del ticket → gasto registrado al instante',
      '💬  Chat personal con tu bot 24/7',
      '📈  Reportes semanales automáticos',
      '🔐  Privado y cifrado · siempre',
    ],
    accent: '#00D4FF',
    orb1: '#0099BB',
    orb2: '#00D4FF',
  },
  {
    id: 'referral',
    eyebrow: '🎁  PROGRAMA DE REFERIDOS',
    icon: '🤑',
    iconGlow: '#FFD700',
    title: 'Refiere y gana\nsuscripciones gratis',
    sub: 'Comparte AhorraYA con quien quieras.',
    lines: [
      '👤  Invita a un amigo o compañero',
      '🎉  Cada referido activo = 1 mes Pro gratis',
      '♾️  Sin límite — más referidos, más meses',
      '💸  Sin costos ocultos · siempre transparente',
    ],
    accent: '#FFD700',
    orb1: '#78350f',
    orb2: '#FFD700',
  },
];

// ─── Floating orb (purely decorative, behind content) ─────────────────────────

function FloatingOrb({ color, size, x, y, delay = 0 }: {
  color: string; size: number; x: number; y: number; delay?: number;
}) {
  const posX    = useRef(new Animated.Value(x)).current;
  const posY    = useRef(new Animated.Value(y)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0.45, duration: 1000, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(posX, { toValue: x + 50, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(posY, { toValue: y - 40, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(posX, { toValue: x,      duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(posY, { toValue: y,      duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ]),
      ).start();
    }, delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size, height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateX: posX }, { translateY: posY }],
        shadowColor: color,
        shadowOpacity: 0.8,
        shadowRadius: size * 0.5,
        shadowOffset: { width: 0, height: 0 },
        zIndex: 0,
      }}
    />
  );
}

// ─── Animated slide content ───────────────────────────────────────────────────

function SlideContent({ slide, active }: { slide: typeof SLIDES[0]; active: boolean }) {
  const fadeScale  = useRef(new Animated.Value(0.92)).current;
  const fadeOp     = useRef(new Animated.Value(0)).current;
  const iconScale  = useRef(new Animated.Value(0.4)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const titleOp    = useRef(new Animated.Value(0)).current;
  const titleY     = useRef(new Animated.Value(18)).current;
  const subOp      = useRef(new Animated.Value(0)).current;
  const lineOps    = useRef(slide.lines.map(() => new Animated.Value(0))).current;
  const lineYs     = useRef(slide.lines.map(() => new Animated.Value(14))).current;

  useEffect(() => {
    if (!active) {
      fadeScale.setValue(0.92); fadeOp.setValue(0);
      iconScale.setValue(0.4); glowAnim.setValue(0);
      titleOp.setValue(0); titleY.setValue(18);
      subOp.setValue(0);
      lineOps.forEach((v) => v.setValue(0));
      lineYs.forEach((v) => v.setValue(14));
      return;
    }

    const ease = Easing.out(Easing.cubic);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeOp,    { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(fadeScale, { toValue: 1, duration: 350, easing: ease, useNativeDriver: true }),
      ]),
      Animated.spring(iconScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(titleOp, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(titleY,  { toValue: 0, duration: 260, easing: ease, useNativeDriver: true }),
      ]),
      Animated.timing(subOp, { toValue: 1, duration: 220, useNativeDriver: true }),
      ...slide.lines.map((_, i) =>
        Animated.parallel([
          Animated.timing(lineOps[i], { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(lineYs[i],  { toValue: 0, duration: 220, easing: ease, useNativeDriver: true }),
        ]),
      ),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.35, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
  }, [active]);

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] });
  const glowScale   = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] });

  return (
    <Animated.View style={{ flex: 1, opacity: fadeOp, transform: [{ scale: fadeScale }] }}>
      <ScrollView
        contentContainerStyle={S.slideScroll}
        showsVerticalScrollIndicator={false}
        bounces={false}>

        {/* Eyebrow */}
        <Text style={[S.eyebrow, { color: slide.accent }]}>{slide.eyebrow}</Text>

        {/* Icon + glow */}
        <View style={S.iconArea}>
          <Animated.View style={[S.glowRing, {
            borderColor: slide.iconGlow,
            backgroundColor: slide.iconGlow + '18',
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }]} />
          <Animated.View style={[S.iconBox, { transform: [{ scale: iconScale }] }]}>
            <Text style={{ fontSize: 46 }}>{slide.icon}</Text>
          </Animated.View>
        </View>

        {/* Title */}
        <Animated.Text style={[S.title, { opacity: titleOp, transform: [{ translateY: titleY }] }]}>
          {slide.title}
        </Animated.Text>

        {/* Sub */}
        <Animated.Text style={[S.sub, { opacity: subOp }]}>
          {slide.sub}
        </Animated.Text>

        {/* Perks */}
        {slide.lines.length > 0 && (
          <View style={S.perksWrap}>
            {slide.lines.map((line, i) => (
              <Animated.View
                key={i}
                style={[
                  S.perkRow,
                  { opacity: lineOps[i], transform: [{ translateY: lineYs[i] }] },
                ]}>
                <Text style={S.perkText}>{line}</Text>
              </Animated.View>
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { visible: boolean; onClose: () => void; }

export default function PremiumTeaser({ visible, onClose }: Props) {
  const [current, setCurrent] = useState(0);
  const backdropOp  = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressRef  = useRef<Animated.CompositeAnimation | null>(null);
  const isLast = current === SLIDES.length - 1;

  const handleClose = useCallback(async () => {
    progressRef.current?.stop();
    Animated.timing(backdropOp, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => onClose());
    await AsyncStorage.setItem(PREMIUM_TEASER_KEY, 'true');
  }, [onClose]);

  const nextSlide = useCallback(() => {
    if (current < SLIDES.length - 1) setCurrent((p) => p + 1);
    else handleClose();
  }, [current, handleClose]);

  // Backdrop in
  useEffect(() => {
    if (!visible) return;
    setCurrent(0);
    backdropOp.setValue(0);
    Animated.timing(backdropOp, { toValue: 1, duration: 360, useNativeDriver: true }).start();
  }, [visible]);

  // Progress bar
  useEffect(() => {
    if (!visible) return;
    progressRef.current?.stop();
    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1, duration: SLIDE_DURATION,
      easing: Easing.linear, useNativeDriver: false,
    });
    progressRef.current = anim;
    anim.start(({ finished }) => { if (finished) nextSlide(); });
    return () => anim.stop();
  }, [current, visible]);

  const progressW = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const slide  = SLIDES[current];
  const accent = slide?.accent ?? '#7C3AED';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleClose}>
      <Animated.View style={[S.root, { opacity: backdropOp }]}>

        {/* Background orbs — zIndex 0, behind everything */}
        <FloatingOrb color={slide?.orb1 ?? '#5B21B6'} size={200} x={-50}    y={-30}       delay={0} />
        <FloatingOrb color={slide?.orb2 ?? '#7C3AED'} size={150} x={W - 70} y={H * 0.12}  delay={300} />
        <FloatingOrb color={slide?.orb1 ?? '#5B21B6'} size={110} x={W*0.25} y={H * 0.58}  delay={150} />
        <FloatingOrb color={slide?.orb2 ?? '#7C3AED'} size={80}  x={W*0.65} y={H * 0.72}  delay={500} />

        {/* Content layer — zIndex 1 */}
        <View style={S.content}>

          {/* ── Top bar ── */}
          <View style={S.topBar}>
            <View style={S.dots}>
              {SLIDES.map((_, i) => (
                <TouchableOpacity key={i} onPress={() => setCurrent(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Animated.View style={[
                    S.dot,
                    { backgroundColor: i === current ? accent : 'rgba(255,255,255,0.22)' },
                    i === current && { width: 24 },
                  ]} />
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={handleClose} style={S.skipBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[S.skipText, { color: accent }]}>Omitir</Text>
            </TouchableOpacity>
          </View>

          {/* ── Progress bar ── */}
          <View style={S.progressTrack}>
            <Animated.View style={[S.progressFill, { width: progressW, backgroundColor: accent }]} />
          </View>

          {/* ── Slide ── */}
          <View style={S.slideArea}>
            <SlideContent slide={slide} active key={current} />
          </View>

          {/* ── Bottom nav ── */}
          <View style={S.bottomNav}>
            {current > 0 ? (
              <TouchableOpacity onPress={() => setCurrent((p) => p - 1)} style={S.prevBtn}>
                <Text style={S.prevText}>← Atrás</Text>
              </TouchableOpacity>
            ) : <View style={S.prevBtn} />}

            <TouchableOpacity
              style={[S.nextBtn, { backgroundColor: accent, shadowColor: accent }]}
              onPress={nextSlide}
              activeOpacity={0.85}>
              <Text style={S.nextText}>{isLast ? 'Entendido ✓' : 'Siguiente →'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={S.counter}>{current + 1} / {SLIDES.length}</Text>
        </View>

      </Animated.View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060714',
  },
  content: {
    flex: 1,
    paddingTop: 52,
    paddingBottom: 28,
    zIndex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  skipBtn: { paddingVertical: 4 },
  skipText: { fontSize: 13, fontWeight: '700' },

  // Progress
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 24,
    borderRadius: 1,
    marginBottom: 4,
  },
  progressFill: { height: 2, borderRadius: 1 },

  // Slide area — flex, no absolute
  slideArea: { flex: 1 },

  slideScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
    gap: 14,
  },

  // Eyebrow
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textAlign: 'center',
  },

  // Icon
  iconArea: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1.5,
  },
  iconBox: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Text
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 40,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: 'Manrope_400Regular',
  },

  // Perks
  perksWrap: { width: '100%', gap: 8 },
  perkRow: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  perkText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 19,
    fontFamily: 'Manrope_400Regular',
  },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
    marginTop: 12,
  },
  prevBtn: { paddingVertical: 14, paddingHorizontal: 4, minWidth: 72 },
  prevText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  nextBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  nextText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'PlusJakartaSans_700Bold',
  },

  // Counter
  counter: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    marginTop: 10,
  },
});
