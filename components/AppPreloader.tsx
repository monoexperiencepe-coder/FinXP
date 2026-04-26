import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { AppTheme } from '@/constants/theme';

const { width: W, height: H } = Dimensions.get('window');
const PERU_RED   = '#D91023';
const CYAN       = '#00D4FF';
const VIOLET     = '#C4B5FD';
const PROGRESS_W = W * 0.58;
const DURATION_MS = 4000;
const FADE_OUT_MS = 450;

// ── Ambient particles (same concept as onboarding) ────────────────────────────
const PARTICLE_CFG = [
  { xFrac: 0.06, yFrac: 0.78, size: 3.5, dur: 7400, col: 'rgba(196,181,253,0.82)' },
  { xFrac: 0.15, yFrac: 0.68, size: 4.0, dur: 8800, col: 'rgba(0,212,255,0.70)'   },
  { xFrac: 0.27, yFrac: 0.86, size: 3.0, dur: 6600, col: 'rgba(167,139,250,0.78)' },
  { xFrac: 0.38, yFrac: 0.60, size: 4.5, dur: 9200, col: 'rgba(196,181,253,0.72)' },
  { xFrac: 0.50, yFrac: 0.75, size: 3.0, dur: 7800, col: 'rgba(221,214,254,0.68)' },
  { xFrac: 0.61, yFrac: 0.83, size: 4.0, dur: 8200, col: 'rgba(0,212,255,0.74)'   },
  { xFrac: 0.72, yFrac: 0.66, size: 3.0, dur: 6900, col: 'rgba(196,181,253,0.76)' },
  { xFrac: 0.83, yFrac: 0.90, size: 4.5, dur: 9600, col: 'rgba(167,139,250,0.70)' },
  { xFrac: 0.92, yFrac: 0.72, size: 3.0, dur: 7200, col: 'rgba(0,212,255,0.66)'   },
  { xFrac: 0.43, yFrac: 0.94, size: 3.5, dur: 8400, col: 'rgba(221,214,254,0.72)' },
] as const;

type Props = { theme: AppTheme; onFinish: () => void };

export function AppPreloader({ theme: T, onFinish }: Props) {
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const isDark = T.textPrimary === '#FFFFFF';

  // ── Core preloader values ────────────────────────────────────────────────────
  const masterOpacity = useRef(new Animated.Value(1)).current;
  const leftBarX      = useRef(new Animated.Value(-30)).current;
  const rightBarX     = useRef(new Animated.Value(30)).current;
  const barsOpacity   = useRef(new Animated.Value(0)).current;
  const orbScale      = useRef(new Animated.Value(0.4)).current;
  const orbOpacity    = useRef(new Animated.Value(0)).current;
  const ring2Opacity  = useRef(new Animated.Value(0)).current;
  const gemScale      = useRef(new Animated.Value(0.5)).current;
  const gemOpacity    = useRef(new Animated.Value(0)).current;
  const titleOpacity  = useRef(new Animated.Value(0)).current;
  const titleY        = useRef(new Animated.Value(10)).current;
  const subOpacity    = useRef(new Animated.Value(0)).current;
  const badgeOpacity  = useRef(new Animated.Value(0)).current;
  const badgeScale    = useRef(new Animated.Value(0.85)).current;
  const progressW     = useRef(new Animated.Value(0)).current;
  const shimmerX      = useRef(new Animated.Value(-100)).current;

  // ── From onboarding: orbit rings + background blobs ─────────────────────────
  const orbit1        = useRef(new Animated.Value(0)).current;
  const orbit2        = useRef(new Animated.Value(1)).current;
  const float1        = useRef(new Animated.Value(0)).current;
  const float2        = useRef(new Animated.Value(0)).current;
  const glowPulse     = useRef(new Animated.Value(0)).current;

  // ── Particles ────────────────────────────────────────────────────────────────
  const particleAnims = useRef(PARTICLE_CFG.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // ── 1. Peru side bars ───────────────────────────────────────────────────────
    Animated.parallel([
      Animated.timing(leftBarX,    { toValue: 0, duration: 700, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(rightBarX,   { toValue: 0, duration: 700, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(barsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // ── 2. Orb bloom ────────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(orbScale,   { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(orbOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();

    // ── 3. Pulsing ring ─────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(350),
      Animated.loop(Animated.sequence([
        Animated.timing(ring2Opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(ring2Opacity, { toValue: 0.08, duration: 900, useNativeDriver: true }),
      ])),
    ]).start();

    // ── 4. Diamond gem ──────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(gemScale,   { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(gemOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // ── 5. Title ────────────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleY,       { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // ── 6. Subtitle ─────────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(600),
      Animated.timing(subOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // ── 7. Badge ────────────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.spring(badgeScale,   { toValue: 1, friction: 7, tension: 100, useNativeDriver: true }),
        Animated.timing(badgeOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();

    // ── 8. Progress bar ─────────────────────────────────────────────────────────
    Animated.timing(progressW, {
      toValue: PROGRESS_W,
      duration: DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // ── 9. Shimmer sweep ────────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(600),
      Animated.loop(Animated.sequence([
        Animated.timing(shimmerX, { toValue: PROGRESS_W + 100, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmerX, { toValue: -100, duration: 0, useNativeDriver: true }),
        Animated.delay(900),
      ])),
    ]).start();

    // ── 10. Orbit rings (from onboarding) ───────────────────────────────────────
    Animated.loop(Animated.timing(orbit1, { toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(orbit2, { toValue: 0, duration: 16000, easing: Easing.linear, useNativeDriver: true })).start();

    // ── 11. Background blobs (from onboarding) ──────────────────────────────────
    Animated.loop(Animated.sequence([
      Animated.timing(float1, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(float1, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float2, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(float2, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();

    // ── 12. Glow pulse (from onboarding) ────────────────────────────────────────
    Animated.loop(Animated.sequence([
      Animated.timing(glowPulse, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glowPulse, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();

    // ── 13. Particles (from onboarding) ─────────────────────────────────────────
    particleAnims.forEach((anim, i) => {
      const dur = PARTICLE_CFG[i].dur;
      const startPhase = i / PARTICLE_CFG.length;
      const runLoop = () => {
        anim.setValue(0);
        Animated.timing(anim, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true })
          .start(({ finished }) => { if (finished) runLoop(); });
      };
      anim.setValue(startPhase);
      Animated.timing(anim, { toValue: 1, duration: dur * (1 - startPhase), easing: Easing.linear, useNativeDriver: true })
        .start(({ finished }) => { if (finished) runLoop(); });
    });

    // ── 14. Fade out ────────────────────────────────────────────────────────────
    const t = setTimeout(() => {
      Animated.timing(masterOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onFinishRef.current());
    }, DURATION_MS);

    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const orbit1Rotate = orbit1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const orbit2Rotate = orbit2.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const blob1Y = float1.interpolate({ inputRange: [0, 1], outputRange: [0, -28] });
  const blob2Y = float2.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.40] });

  return (
    <Animated.View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFillObject, { zIndex: 99999, opacity: masterOpacity }]}>

      {/* ── Background gradient (richer: dark has purple-cyan tones, like onboarding) */}
      <LinearGradient
        colors={isDark
          ? [T.bg, '#0D0F28', '#100A22', T.surface]
          : [T.bg, '#F0E8FF', '#E8F6FF', T.surface]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Background blob 1: violet (from onboarding float) ─────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: W * 0.1,
          top: H * 0.12,
          width: 260,
          height: 260,
          borderRadius: 130,
          backgroundColor: isDark ? 'rgba(167,139,250,0.09)' : 'rgba(167,139,250,0.12)',
          transform: [{ translateY: blob1Y }],
        }}
      />

      {/* ── Background blob 2: cyan (from onboarding float) ───────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: W * 0.05,
          bottom: H * 0.18,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: isDark ? 'rgba(0,212,255,0.07)' : 'rgba(0,212,255,0.10)',
          transform: [{ translateY: blob2Y }],
        }}
      />

      {/* ── Diagonal accent lines (decorative) ────────────────────────────────── */}
      <View style={[StyleSheet.absoluteFillObject, { opacity: 0.04 }]} pointerEvents="none">
        {[...Array(7)].map((_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: -100,
              left: i * (W / 5) - 40,
              width: 1,
              height: '140%',
              backgroundColor: T.textPrimary,
              transform: [{ rotate: '15deg' }],
            }}
          />
        ))}
      </View>

      {/* ── Floating ambient particles (from onboarding) ──────────────────────── */}
      {PARTICLE_CFG.map((p, i) => {
        const floatY = particleAnims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, -(H * 0.22)],
        });
        const fadeOut = particleAnims[i].interpolate({
          inputRange: [0, 0.6, 1],
          outputRange: [0, 0.9, 0],
        });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: W * p.xFrac,
              top: H * p.yFrac,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: p.col,
              opacity: fadeOut,
              transform: [{ translateY: floatY }],
            }}
          />
        );
      })}

      {/* ── LEFT Peru red bar ──────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 7,
          opacity: barsOpacity,
          transform: [{ translateX: leftBarX }],
        }}>
        <LinearGradient
          colors={[`${PERU_RED}00`, PERU_RED, PERU_RED, `${PERU_RED}00`]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── LEFT glow halo ────────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 90, opacity: barsOpacity }}>
        <LinearGradient
          colors={[`${PERU_RED}30`, `${PERU_RED}00`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── RIGHT Peru red bar ────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 7,
          opacity: barsOpacity,
          transform: [{ translateX: rightBarX }],
        }}>
        <LinearGradient
          colors={[`${PERU_RED}00`, PERU_RED, PERU_RED, `${PERU_RED}00`]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── RIGHT glow halo ───────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 90, opacity: barsOpacity }}>
        <LinearGradient
          colors={[`${PERU_RED}00`, `${PERU_RED}30`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>

        {/* Glow aura beneath gem (from onboarding) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: 'transparent',
            opacity: glowOpacity,
          }}>
          <LinearGradient
            colors={[`${VIOLET}60`, `${CYAN}30`, 'transparent']}
            start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
            style={{ flex: 1, borderRadius: 110 }}
          />
        </Animated.View>

        {/* Outer orbit ring 1 (from onboarding) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 220,
            height: 220,
            borderRadius: 110,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? `${VIOLET}60` : `${VIOLET}80`,
            transform: [{ rotate: orbit1Rotate }],
            opacity: orbOpacity,
          }}>
          {/* Orbit dot */}
          <View style={{
            position: 'absolute',
            top: -3, left: '50%',
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: VIOLET,
            transform: [{ translateX: -3 }],
          }} />
        </Animated.View>

        {/* Outer orbit ring 2 (from onboarding, opposite direction) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 190,
            height: 190,
            borderRadius: 95,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? `${CYAN}50` : `${CYAN}70`,
            borderStyle: 'dashed',
            transform: [{ rotate: orbit2Rotate }],
            opacity: orbOpacity,
          }}>
          {/* Orbit dot */}
          <View style={{
            position: 'absolute',
            bottom: -3, left: '50%',
            width: 5, height: 5, borderRadius: 2.5,
            backgroundColor: CYAN,
            transform: [{ translateX: -2.5 }],
          }} />
        </Animated.View>

        {/* Outer pulsing ring (original preloader) */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 160,
            height: 160,
            borderRadius: 80,
            borderWidth: 1.5,
            borderColor: PERU_RED,
            opacity: ring2Opacity,
          }}
        />

        {/* Main orb glow */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 130,
            height: 130,
            borderRadius: 65,
            opacity: orbOpacity,
            transform: [{ scale: orbScale }],
            overflow: 'hidden',
          }}>
          <LinearGradient
            colors={[`${VIOLET}30`, `${PERU_RED}18`, `${CYAN}20`]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 65 }}
          />
        </Animated.View>

        {/* Orb border ring */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 130,
            height: 130,
            borderRadius: 65,
            borderWidth: 1,
            borderColor: T.primaryBorder,
            opacity: orbOpacity,
            transform: [{ scale: orbScale }],
          }}
        />

        {/* Diamond gem */}
        <Animated.Text style={{ fontSize: 62, opacity: gemOpacity, transform: [{ scale: gemScale }], marginBottom: 4 }}>
          💎
        </Animated.Text>

        {/* Title */}
        <Animated.Text
          style={{
            fontSize: 38,
            fontWeight: '900',
            color: T.textPrimary,
            letterSpacing: 1,
            fontFamily: 'PlusJakartaSans_700Bold',
            marginTop: 10,
            opacity: titleOpacity,
            transform: [{ translateY: titleY }],
          }}>
          AhorraYA
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text
          style={{
            fontSize: 12,
            color: T.textMuted,
            letterSpacing: 3.5,
            textTransform: 'uppercase',
            fontFamily: 'Manrope_500Medium',
            marginTop: 8,
            opacity: subOpacity,
          }}>
          Tus finanzas, gamificadas
        </Animated.Text>

        {/* Peru badge */}
        <Animated.View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 18,
            opacity: badgeOpacity,
            transform: [{ scale: badgeScale }],
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 24,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)',
            gap: 8,
          }}>
          <View style={{ flexDirection: 'row', width: 26, height: 16, borderRadius: 3, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.15)' }}>
            <View style={{ flex: 1, backgroundColor: PERU_RED }} />
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
            <View style={{ flex: 1, backgroundColor: PERU_RED }} />
          </View>
          <Text style={{ fontSize: 12, color: T.textSecondary, fontFamily: 'Manrope_400Regular', letterSpacing: 0.8 }}>
            Hecho en Perú
          </Text>
        </Animated.View>

        {/* Progress bar */}
        <View style={{ marginTop: 44, alignItems: 'flex-start' }}>
          <View
            style={{
              width: PROGRESS_W,
              height: 4,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
            <Animated.View style={{ height: 4, width: progressW, overflow: 'hidden', borderRadius: 4 }}>
              <LinearGradient
                colors={[PERU_RED, VIOLET, CYAN]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: PROGRESS_W, height: 4 }}
              />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute', top: 0,
                width: 80, height: 4,
                transform: [{ translateX: shimmerX }],
              }}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.72)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>

          {/* Color dots legend */}
          <View style={{ flexDirection: 'row', marginTop: 10, gap: 6, alignSelf: 'center', width: PROGRESS_W }}>
            {[PERU_RED, VIOLET, CYAN].map((c, i) => (
              <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c, opacity: 0.7 }} />
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
