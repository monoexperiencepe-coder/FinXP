import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { darkTheme } from '@/constants/theme';

interface Props {
  visible: boolean;
  onFinish?: () => void;
}

export default function LoaderTransicion({ visible, onFinish }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
          onFinishRef.current?.();
        });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [visible, opacity, scale, logoOpacity]);

  if (!visible) return null;

  const c = {
    background: darkTheme.surface,
    primary: darkTheme.primary,
    textPrimary: darkTheme.textPrimary,
    textSecondary: darkTheme.textSecondary,
  };

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundColor: c.background,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          opacity,
        },
      ]}>
      <Animated.View style={{ alignItems: 'center', transform: [{ scale }], opacity: logoOpacity }}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>💎</Text>
        <Text
          style={{
            fontSize: 32,
            fontWeight: '900',
            color: c.textPrimary,
            letterSpacing: 1,
          }}>
          AhorraYA
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: c.textSecondary,
            marginTop: 8,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
          Tu finanzas, gamificadas
        </Text>

        <BarraProgreso color={c.primary} />
      </Animated.View>
    </Animated.View>
  );
}

function BarraProgreso({ color }: { color: string }) {
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: 200,
      duration: 1800,
      useNativeDriver: false,
    }).start();
  }, [width]);

  return (
    <View
      style={{
        marginTop: 40,
        width: 200,
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
      <Animated.View
        style={{
          height: 3,
          width,
          backgroundColor: color,
          borderRadius: 2,
        }}
      />
    </View>
  );
}
