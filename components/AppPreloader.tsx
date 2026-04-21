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

const { width: W } = Dimensions.get('window');
const PERU_RED = '#D91023';
const PROGRESS_W = W * 0.58;
const DURATION_MS = 4000;
const FADE_OUT_MS = 450;

type Props = {
  theme: AppTheme;
  onFinish: () => void;
};

export function AppPreloader({ theme: T, onFinish }: Props) {
  const masterOpacity = useRef(new Animated.Value(1)).current;
  const leftBarX    = useRef(new Animated.Value(-30)).current;
  const rightBarX   = useRef(new Animated.Value(30)).current;
  const barsOpacity = useRef(new Animated.Value(0)).current;
  const orbScale    = useRef(new Animated.Value(0.4)).current;
  const orbOpacity  = useRef(new Animated.Value(0)).current;
  const ring2Opacity= useRef(new Animated.Value(0)).current;
  const gemScale    = useRef(new Animated.Value(0.5)).current;
  const gemOpacity  = useRef(new Animated.Value(0)).current;
  const titleOpacity= useRef(new Animated.Value(0)).current;
  const titleY      = useRef(new Animated.Value(10)).current;
  const subOpacity  = useRef(new Animated.Value(0)).current;
  const badgeOpacity= useRef(new Animated.Value(0)).current;
  const badgeScale  = useRef(new Animated.Value(0.85)).current;
  const progressW   = useRef(new Animated.Value(0)).current;
  const shimmerX    = useRef(new Animated.Value(-100)).current;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const isDark = T.textPrimary === '#FFFFFF';

  useEffect(() => {
    // ── 1. Peru side bars slide in ──────────────────────────────────────
    Animated.parallel([
      Animated.timing(leftBarX,    { toValue: 0, duration: 700, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(rightBarX,   { toValue: 0, duration: 700, easing: Easing.out(Easing.exp), useNativeDriver: true }),
      Animated.timing(barsOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();

    // ── 2. Orb / ring bloom ─────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.spring(orbScale,   { toValue: 1,   friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(orbOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(350),
      Animated.loop(
        Animated.sequence([
          Animated.timing(ring2Opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0.08, duration: 900, useNativeDriver: true }),
        ])
      ),
    ]).start();

    // ── 3. Diamond gem ─────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(gemScale,   { toValue: 1,   friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(gemOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();

    // ── 4. Title ───────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleY,       { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // ── 5. Subtitle ────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(600),
      Animated.timing(subOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // ── 6. Badge ───────────────────────────────────────────────────────
    Animated.sequence([
      Animated.delay(800),
      Animated.parallel([
        Animated.spring(badgeScale,   { toValue: 1,   friction: 7, tension: 100, useNativeDriver: true }),
        Animated.timing(badgeOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();

    // ── 7. Progress bar ────────────────────────────────────────────────
    Animated.timing(progressW, {
      toValue: PROGRESS_W,
      duration: DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    // ── 8. Shimmer sweep on progress ───────────────────────────────────
    Animated.sequence([
      Animated.delay(600),
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerX, {
            toValue: PROGRESS_W + 100,
            duration: 1400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(shimmerX, { toValue: -100, duration: 0, useNativeDriver: true }),
          Animated.delay(900),
        ])
      ),
    ]).start();

    // ── 9. Fade out after duration ─────────────────────────────────────
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

  return (
    <Animated.View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFillObject, { zIndex: 99999, opacity: masterOpacity }]}>

      {/* ── Background ─────────────────────────────────────────────── */}
      <LinearGradient
        colors={isDark ? [T.bg, '#0D0F28', T.surface] : [T.bg, '#F5EDFF', T.surface]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Diagonal accent lines (decorative) ────────────────────── */}
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

      {/* ── LEFT Peru red bar ─────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 7,
          opacity: barsOpacity,
          transform: [{ translateX: leftBarX }],
        }}>
        <LinearGradient
          colors={[`${PERU_RED}00`, PERU_RED, PERU_RED, `${PERU_RED}00`]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── LEFT glow halo ────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: 90,
          opacity: barsOpacity,
        }}>
        <LinearGradient
          colors={[`${PERU_RED}30`, `${PERU_RED}00`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── RIGHT Peru red bar ────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0, top: 0, bottom: 0,
          width: 7,
          opacity: barsOpacity,
          transform: [{ translateX: rightBarX }],
        }}>
        <LinearGradient
          colors={[`${PERU_RED}00`, PERU_RED, PERU_RED, `${PERU_RED}00`]}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── RIGHT glow halo ───────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0, top: 0, bottom: 0,
          width: 90,
          opacity: barsOpacity,
        }}>
        <LinearGradient
          colors={[`${PERU_RED}00`, `${PERU_RED}30`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* ── Main content ──────────────────────────────────────────── */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>

        {/* Outer pulsing ring */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: 100,
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
            width: 160,
            height: 160,
            borderRadius: 80,
            opacity: orbOpacity,
            transform: [{ scale: orbScale }],
            overflow: 'hidden',
          }}>
          <LinearGradient
            colors={[T.primaryBg, `${PERU_RED}18`, T.primaryBg]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flex: 1, borderRadius: 80 }}
          />
        </Animated.View>

        {/* Orb border ring */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 160,
            height: 160,
            borderRadius: 80,
            borderWidth: 1,
            borderColor: T.primaryBorder,
            opacity: orbOpacity,
            transform: [{ scale: orbScale }],
          }}
        />

        {/* Diamond gem */}
        <Animated.Text
          style={{
            fontSize: 62,
            opacity: gemOpacity,
            transform: [{ scale: gemScale }],
            marginBottom: 4,
          }}>
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
          {/* Mini Peruvian flag */}
          <View
            style={{
              flexDirection: 'row',
              width: 26,
              height: 16,
              borderRadius: 3,
              overflow: 'hidden',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(0,0,0,0.15)',
            }}>
            <View style={{ flex: 1, backgroundColor: PERU_RED }} />
            <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />
            <View style={{ flex: 1, backgroundColor: PERU_RED }} />
          </View>
          <Text
            style={{
              fontSize: 12,
              color: T.textSecondary,
              fontFamily: 'Manrope_400Regular',
              letterSpacing: 0.8,
            }}>
            Hecho en Perú
          </Text>
        </Animated.View>

        {/* Progress bar */}
        <View style={{ marginTop: 44, alignItems: 'flex-start' }}>
          {/* Track */}
          <View
            style={{
              width: PROGRESS_W,
              height: 4,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
              borderRadius: 4,
              overflow: 'hidden',
            }}>
            {/* Filled portion — gradient red → purple → cyan */}
            <Animated.View style={{ height: 4, width: progressW, overflow: 'hidden', borderRadius: 4 }}>
              <LinearGradient
                colors={[PERU_RED, T.primary, T.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ width: PROGRESS_W, height: 4 }}
              />
            </Animated.View>

            {/* Shimmer sweep */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                width: 80,
                height: 4,
                transform: [{ translateX: shimmerX }],
              }}>
              <LinearGradient
                colors={['transparent', 'rgba(255,255,255,0.72)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>

          {/* Color dots legend: flag colors */}
          <View style={{ flexDirection: 'row', marginTop: 10, gap: 6, alignSelf: 'center', width: PROGRESS_W }}>
            {[PERU_RED, T.primary, T.secondary].map((c, i) => (
              <View
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: c,
                  opacity: 0.7,
                }}
              />
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
