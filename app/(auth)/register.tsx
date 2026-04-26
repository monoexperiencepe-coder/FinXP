import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { darkTheme as T } from '@/constants/theme';
import {
  clearOnboardingResumeStepLocal,
  ONBOARDING_LAST_STEP_INDEX,
  readOnboardingDraftLocal,
  writeOnboardingCompletedLocal,
  writeOnboardingResumeStepLocal,
} from '@/lib/preferences';
import { useAuthStore } from '@/store/useAuthStore';

type OnboardingDraft = { nombreUsuario?: string | null };

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

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, loading } = useAuthStore();
  const { width: W, height: H } = useWindowDimensions();

  // ── entrance animations ────────────────────────────────────────────────────
  const backOp  = useRef(new Animated.Value(0)).current;
  const backTy  = useRef(new Animated.Value(14)).current;
  const headOp  = useRef(new Animated.Value(0)).current;
  const headTy  = useRef(new Animated.Value(18)).current;
  const cardOp  = useRef(new Animated.Value(0)).current;
  const cardTy  = useRef(new Animated.Value(22)).current;
  const blobFloat1 = useRef(new Animated.Value(0)).current;
  const blobFloat2 = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(PARTICLE_CFG.map(() => new Animated.Value(0))).current;

  // ── form state ─────────────────────────────────────────────────────────────
  const [nombre,   setNombre]   = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');

  useEffect(() => {
    void (async () => {
      const draft = await readOnboardingDraftLocal<OnboardingDraft>();
      const n = draft?.nombreUsuario?.trim();
      if (n) setNombre(n);
    })();
  }, []);

  // entrance
  useEffect(() => {
    const up = (op: Animated.Value, ty: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(op, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(ty, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]);
    Animated.parallel([up(backOp, backTy, 0), up(headOp, headTy, 90), up(cardOp, cardTy, 180)]).start();
  }, [backOp, backTy, headOp, headTy, cardOp, cardTy]);

  // blob float
  useEffect(() => {
    const loop = (v: Animated.Value, dur: number, out: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    loop(blobFloat1, 5600, -28).start();
    loop(blobFloat2, 7200, 22).start();
  }, [blobFloat1, blobFloat2]);

  // particles — mount once, loop forever
  useEffect(() => {
    particleAnims.forEach((anim, i) => {
      const dur = PARTICLE_CFG[i].dur;
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: dur, easing: Easing.linear, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ).start();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blob1TransY = blobFloat1.interpolate({ inputRange: [0, 1], outputRange: [0, -28] });
  const blob2TransY = blobFloat2.interpolate({ inputRange: [0, 1], outputRange: [0, 22] });

  // ── form logic ─────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    setError('');
    if (!nombre.trim())         { setError('Ingresa tu nombre'); return; }
    if (!email.trim())          { setError('Ingresa tu email'); return; }
    if (password.length < 6)    { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    if (password !== confirm)   { setError('Las contraseñas no coinciden'); return; }

    try {
      await signUp(email.trim(), password, nombre.trim());
      setError('');
      await clearOnboardingResumeStepLocal();
      router.replace('/(auth)/login' as any);
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (e.message?.includes('already registered')) {
        setError('Este correo ya tiene una cuenta');
      } else if (e.message?.includes('Password should be')) {
        setError('La contraseña debe tener al menos 6 caracteres');
      } else if (e.message?.includes('invalid')) {
        setError('El correo no es válido');
      } else {
        setError('Ocurrió un error al crear la cuenta');
      }
    }
  };

  return (
    <View style={S.root}>

      {/* ── Dark premium background ──────────────────────────────────────── */}
      <View style={[StyleSheet.absoluteFillObject, { overflow: 'hidden', zIndex: 0 }]} pointerEvents="none">
        <LinearGradient
          colors={['#080018', '#0F0028', '#090016']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        {/* Blob: purple top-right */}
        <Animated.View
          style={[S.blob1, { transform: [{ translateY: blob1TransY }] },
            Platform.OS === 'web' && ({ filter: 'blur(88px)' } as object)]}
        />
        {/* Blob: cyan bottom-left */}
        <Animated.View
          style={[S.blob2, { transform: [{ translateY: blob2TransY }] },
            Platform.OS === 'web' && ({ filter: 'blur(80px)' } as object)]}
        />
        {/* Blob: violet center */}
        <View
          style={[S.blob3,
            Platform.OS === 'web' && ({ filter: 'blur(120px)' } as object)]}
        />
        {/* Dot grid (web) */}
        {Platform.OS === 'web' && (
          <View
            style={[StyleSheet.absoluteFillObject,
              { opacity: 0.18, backgroundImage: 'radial-gradient(circle, rgba(196,181,253,0.9) 1px, transparent 1px)', backgroundSize: '28px 28px' } as any]}
          />
        )}
        {/* Particles */}
        {particleAnims.map((anim, i) => {
          const cfg = PARTICLE_CFG[i];
          const travelDist = H * 0.44;
          const pTransY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -travelDist] });
          const pOpacity = anim.interpolate({ inputRange: [0, 0.08, 0.78, 1], outputRange: [0, 1, 1, 0] });
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
                opacity: pOpacity,
                transform: [{ translateY: pTransY }],
              }}
            />
          );
        })}
      </View>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <KeyboardAvoidingView style={{ flex: 1, zIndex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={S.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Back */}
          <Animated.View style={{ opacity: backOp, transform: [{ translateY: backTy }] }}>
            <TouchableOpacity
              style={S.back}
              onPress={() => {
                void (async () => {
                  await writeOnboardingCompletedLocal(false);
                  await writeOnboardingResumeStepLocal(ONBOARDING_LAST_STEP_INDEX);
                  router.replace('/onboarding' as Href);
                })();
              }}>
              <Text style={S.backText}>← Volver</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Header */}
          <Animated.View style={[S.headerWrap, { opacity: headOp, transform: [{ translateY: headTy }] }]}>
            <LinearGradient
              colors={['#DDD6FE', '#7C3AED', '#4C1D95']}
              locations={[0, 0.48, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={S.logoGrad}>
              <Text style={S.logoEmoji}>🚀</Text>
            </LinearGradient>
            <Text style={S.title}>Crear cuenta</Text>
            <Text style={S.subtitle}>Empieza tu journey financiero</Text>
          </Animated.View>

          {/* Card */}
          <Animated.View style={{ opacity: cardOp, transform: [{ translateY: cardTy }] }}>
            <View style={S.card}>

              {(
                [
                  { label: 'Nombre', value: nombre, setter: setNombre, placeholder: 'Tu nombre', type: 'default' as const, icon: '🧑' },
                  { label: 'Email', value: email, setter: setEmail, placeholder: 'tu@email.com', type: 'email-address' as const, icon: '✉️' },
                  { label: 'Contraseña', value: password, setter: setPassword, placeholder: 'Mínimo 6 caracteres', secure: true, type: 'default' as const, icon: '🔒' },
                  { label: 'Confirmar contraseña', value: confirm, setter: setConfirm, placeholder: 'Repite tu contraseña', secure: true, type: 'default' as const, icon: '🔑' },
                ] as const
              ).map((field) => (
                <View key={field.label} style={S.fieldGroup}>
                  <Text style={S.fieldLabel}>{field.label.toUpperCase()}</Text>
                  <View style={S.inputWrap}>
                    <Text style={S.inputIcon}>{field.icon}</Text>
                    <TextInput
                      style={[S.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
                      placeholder={field.placeholder}
                      placeholderTextColor="rgba(196,181,253,0.42)"
                      value={field.value}
                      onChangeText={(val) => { setError(''); field.setter(val); }}
                      keyboardType={field.type}
                      autoCapitalize={field.type === 'email-address' ? 'none' : 'words'}
                      secureTextEntry={'secure' in field ? field.secure : false}
                    />
                  </View>
                </View>
              ))}

              {error ? (
                <View style={S.errorWrap}>
                  <Text style={S.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={S.ctaTouchable}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.84}>
                <LinearGradient
                  colors={['#7C3AED', '#5B21B6', '#00D4FF']}
                  locations={[0, 0.55, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={S.ctaGrad}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={S.ctaText}>Crear cuenta gratis →</Text>}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={S.meta}>Al continuar aceptas nuestros términos de uso</Text>
            </View>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080018' },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 58, paddingBottom: 36, gap: 22, alignItems: 'center' },

  // Background blobs
  blob1: { position: 'absolute', width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(124,58,237,0.42)', top: -80, right: -90 },
  blob2: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(0,212,255,0.28)', bottom: 60, left: -90 },
  blob3: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(109,40,217,0.22)', top: '35%', left: '20%' },

  // Back link
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 15, color: 'rgba(221,214,254,0.82)', fontFamily: 'Manrope_500Medium' },

  // Header
  headerWrap: { alignItems: 'center', gap: 10, width: '100%' },
  logoGrad: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 18 },
      android: { elevation: 10 },
      web: { boxShadow: '0 8px 32px rgba(124,58,237,0.55)' } as object,
      default: {},
    }),
  },
  logoEmoji: { fontSize: 36 },
  title: {
    fontSize: 26, fontWeight: '800', color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(226,232,240,0.88)',
    fontFamily: 'Manrope_500Medium', textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },

  // Card
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: 'rgba(22,24,48,0.82)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.28)',
    borderRadius: 22,
    padding: 22, gap: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.35, shadowRadius: 24 },
      android: { elevation: 10 },
      web: { boxShadow: '0 12px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(124,58,237,0.18)' } as object,
      default: {},
    }),
  },

  // Field
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
  ctaTouchable: { width: '100%', borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  ctaGrad: { height: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', letterSpacing: 0.3 },

  meta: { fontSize: 11, color: 'rgba(196,181,253,0.4)', fontFamily: 'Manrope_400Regular', textAlign: 'center', marginTop: -4 },
});
