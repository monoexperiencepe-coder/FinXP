import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import LoaderTransicion from '@/components/LoaderTransicion';
import { darkTheme as T } from '@/constants/theme';
import { prepareSignupFromLoginLocal } from '@/lib/preferences';
import { useAuthStore } from '@/store/useAuthStore';

// ── Partículas (idénticas al onboarding / registro) ───────────────────────────
const PARTICLE_CFG = [
  { xFrac: 0.06, yFrac: 0.78, size: 3.5, dur: 7400, col: 'rgba(196,181,253,0.82)' },
  { xFrac: 0.15, yFrac: 0.68, size: 4.0, dur: 8800, col: 'rgba(0,212,255,0.70)' },
  { xFrac: 0.27, yFrac: 0.86, size: 3.0, dur: 6600, col: 'rgba(167,139,250,0.78)' },
  { xFrac: 0.38, yFrac: 0.60, size: 4.5, dur: 9200, col: 'rgba(196,181,253,0.72)' },
  { xFrac: 0.50, yFrac: 0.75, size: 3.0, dur: 7800, col: 'rgba(221,214,254,0.68)' },
  { xFrac: 0.61, yFrac: 0.83, size: 4.0, dur: 8200, col: 'rgba(0,212,255,0.74)' },
  { xFrac: 0.72, yFrac: 0.66, size: 3.0, dur: 6900, col: 'rgba(196,181,253,0.76)' },
  { xFrac: 0.83, yFrac: 0.90, size: 4.5, dur: 9600, col: 'rgba(167,139,250,0.70)' },
  { xFrac: 0.92, yFrac: 0.72, size: 3.0, dur: 7200, col: 'rgba(0,212,255,0.66)' },
] as const;

export default function LoginScreen() {
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();
  const { signIn, sendMagicLink, loading, setPostLoginTransitionPending } = useAuthStore();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [mode] = useState<'password' | 'magic'>('password');
  const [error,    setError]    = useState('');
  const [showLoader, setShowLoader] = useState(false);

  // ── Animaciones de fondo ──────────────────────────────────────────────────
  const blobFloat1    = useRef(new Animated.Value(0)).current;
  const blobFloat2    = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(PARTICLE_CFG.map(() => new Animated.Value(0))).current;

  // ── Animación de entrada ──────────────────────────────────────────────────
  const enterOp = useRef(new Animated.Value(0)).current;
  const enterTY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    // Blobs flotantes
    const loop = (v: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    loop(blobFloat1, 5600).start();
    loop(blobFloat2, 7200).start();

    // Partículas
    particleAnims.forEach((anim, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: PARTICLE_CFG[i].dur, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ).start();
    });

    // Entrada de contenido
    Animated.parallel([
      Animated.timing(enterOp, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(enterTY, { toValue: 0, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blob1TY = blobFloat1.interpolate({ inputRange: [0, 1], outputRange: [0, -28] });
  const blob2TY = blobFloat2.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });

  // ── Lógica de auth (sin cambios) ─────────────────────────────────────────
  const goToSignupOnboarding = async () => {
    await prepareSignupFromLoginLocal();
    router.push('/onboarding' as Href);
  };

  const handleSignIn = async () => {
    setError('');
    if (!email.trim()) { setError('Ingresa tu email'); return; }
    try {
      await signIn(email.trim(), password);
      setError('');
      setPostLoginTransitionPending(true);
      setShowLoader(true);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (e.message?.includes('Invalid login credentials')) {
        setError('Usuario o contraseña incorrectos');
      } else if (e.message?.includes('Email not confirmed')) {
        setError('Confirma tu correo antes de ingresar');
      } else if (e.message?.includes('Too many requests')) {
        setError('Demasiados intentos. Espera unos minutos');
      } else {
        setError('Ocurrió un error. Intenta de nuevo');
      }
    }
  };

  const handleMagicLink = async () => {
    setError('');
    if (!email.trim()) { setError('Ingresa tu email'); return; }
    try {
      await sendMagicLink(email.trim());
      setError('');
      Alert.alert('¡Revisa tu email!', 'Te enviamos un enlace mágico para entrar sin contraseña 🪄');
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (e.message?.includes('Too many requests')) {
        setError('Demasiados intentos. Espera unos minutos');
      } else {
        setError('Ocurrió un error. Intenta de nuevo');
      }
    }
  };

  return (
    <View style={S.root}>

      {/* ── Fondo premium ────────────────────────────────────────────── */}
      <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', zIndex: 0 }]} pointerEvents="none">
        <LinearGradient
          colors={['#080018', '#0F0028', '#090016']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Blobs */}
        <Animated.View style={[S.blob1, { transform: [{ translateY: blob1TY }] },
          Platform.OS === 'web' && ({ filter: 'blur(88px)' } as object)]} />
        <Animated.View style={[S.blob2, { transform: [{ translateY: blob2TY }] },
          Platform.OS === 'web' && ({ filter: 'blur(80px)' } as object)]} />
        <View style={[S.blob3,
          Platform.OS === 'web' && ({ filter: 'blur(120px)' } as object)]} />
        {/* Cuadrícula de puntos (web) */}
        {Platform.OS === 'web' && (
          <View style={[StyleSheet.absoluteFillObject,
            { opacity: 0.18, backgroundImage: 'radial-gradient(circle, rgba(196,181,253,0.9) 1px, transparent 1px)', backgroundSize: '28px 28px' } as any]} />
        )}
        {/* Partículas */}
        {particleAnims.map((anim, i) => {
          const cfg = PARTICLE_CFG[i];
          const travelDist = H * 0.44;
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: cfg.xFrac * W,
                top: cfg.yFrac * H,
                width: cfg.size,
                height: cfg.size,
                borderRadius: cfg.size / 2,
                backgroundColor: cfg.col,
                opacity: anim.interpolate({ inputRange: [0, 0.08, 0.78, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -travelDist] }) }],
              }}
            />
          );
        })}
      </View>

      {/* ── Contenido ────────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1, zIndex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={S.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          <Animated.View style={{ opacity: enterOp, transform: [{ translateY: enterTY }], gap: 24, alignItems: 'center', width: '100%' }}>

            {/* Logo */}
            <View style={S.logoWrap}>
              <LinearGradient
                colors={['#DDD6FE', '#7C3AED', '#4C1D95']}
                locations={[0, 0.48, 1]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={S.logoGrad}>
                <Text style={S.logoEmoji}>💎</Text>
              </LinearGradient>
              <Text style={S.title}>AhorraYA</Text>
              <Text style={S.subtitle}>Tus finanzas, gamificadas</Text>
            </View>

            {/* Card */}
            <View style={S.card}>
              <Text style={S.cardTitle}>
                {mode === 'password' ? 'Iniciar sesión' : 'Magic Link'}
              </Text>

              {/* Email */}
              <View style={S.fieldGroup}>
                <Text style={S.fieldLabel}>EMAIL</Text>
                <View style={S.inputWrap}>
                  <Text style={S.inputIcon}>✉️</Text>
                  <TextInput
                    style={[S.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                    placeholder="tu@email.com"
                    placeholderTextColor="rgba(196,181,253,0.42)"
                    value={email}
                    onChangeText={(v) => { setError(''); setEmail(v); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Contraseña */}
              {mode === 'password' && (
                <View style={S.fieldGroup}>
                  <Text style={S.fieldLabel}>CONTRASEÑA</Text>
                  <View style={S.inputWrap}>
                    <Text style={S.inputIcon}>🔒</Text>
                    <TextInput
                      style={[S.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                      placeholder="Tu contraseña"
                      placeholderTextColor="rgba(196,181,253,0.42)"
                      value={password}
                      onChangeText={(v) => { setError(''); setPassword(v); }}
                      secureTextEntry
                    />
                  </View>
                </View>
              )}

              {/* Error */}
              {error ? (
                <View style={S.errorWrap}>
                  <Text style={S.errorText}>{error}</Text>
                </View>
              ) : null}

              {/* Botón principal */}
              <TouchableOpacity
                activeOpacity={0.84}
                style={S.ctaTouchable}
                onPress={mode === 'password' ? handleSignIn : handleMagicLink}
                disabled={loading}>
                <LinearGradient
                  colors={['#7C3AED', '#5B21B6', '#00D4FF']}
                  locations={[0, 0.55, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={S.ctaGrad}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={S.ctaText}>{mode === 'password' ? 'Entrar →' : 'Enviar magic link →'}</Text>}
                </LinearGradient>
              </TouchableOpacity>

            </View>

            {/* Registrarse */}
            <TouchableOpacity activeOpacity={0.75} onPress={() => void goToSignupOnboarding()}>
              <Text style={S.registerText}>
                ¿No tienes cuenta?{' '}
                <Text style={{ color: '#A78BFA', fontWeight: '700', fontFamily: 'PlusJakartaSans_700Bold' }}>
                  Regístrate gratis
                </Text>
              </Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LoaderTransicion
        visible={showLoader}
        onFinish={() => {
          setShowLoader(false);
          setPostLoginTransitionPending(false);
        }}
      />
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080018' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 48, gap: 0, alignItems: 'center' },

  // Background blobs
  blob1: { position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(124,58,237,0.42)', top: -80, right: -90 },
  blob2: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(0,212,255,0.28)', bottom: 60, left: -90 },
  blob3: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(109,40,217,0.22)', top: '35%', left: '20%' },

  // Logo section
  logoWrap: { alignItems: 'center', gap: 10, marginBottom: 8 },
  logoGrad: {
    width: 76, height: 76, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios:     { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 18 },
      android: { elevation: 10 },
      web:     { boxShadow: '0 8px 32px rgba(124,58,237,0.55)' } as object,
      default: {},
    }),
  },
  logoEmoji: { fontSize: 38 },
  title: {
    fontSize: 30, fontWeight: '800', color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(226,232,240,0.85)',
    fontFamily: 'Manrope_500Medium',
  },

  // Card
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: 'rgba(22,24,48,0.82)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.28)',
    borderRadius: 22,
    padding: 22, gap: 14,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 24 },
      android: { elevation: 10 },
      web:     { boxShadow: '0 12px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,58,237,0.18)' } as object,
      default: {},
    }),
  },
  cardTitle: {
    fontSize: 20, fontWeight: '800', color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold', marginBottom: 2,
  },

  // Fields
  fieldGroup: { gap: 5 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.0,
    color: 'rgba(221,214,254,0.72)',
    fontFamily: 'PlusJakartaSans_700Bold',
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(196,181,253,0.28)',
    borderRadius: 14, paddingHorizontal: 14, height: 50, gap: 10,
  },
  inputIcon: { fontSize: 18 },
  input: {
    flex: 1, fontSize: 16, color: '#FFFFFF',
    fontFamily: 'Manrope_500Medium', height: 50,
  },

  // Error
  errorWrap: {
    backgroundColor: 'rgba(255,77,77,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,77,77,0.3)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
  },
  errorText: { color: '#FF6B6B', fontSize: 13, textAlign: 'center', fontFamily: 'Manrope_500Medium' },

  // CTA
  ctaTouchable: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 2 },
  ctaGrad: { height: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.3 },

  // Register link
  registerText: {
    fontSize: 14, color: 'rgba(226,232,240,0.72)',
    fontFamily: 'Manrope_400Regular', textAlign: 'center',
  },
});
