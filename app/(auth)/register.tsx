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

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, loading } = useAuthStore();
  const backOp = useRef(new Animated.Value(0)).current;
  const backTy = useRef(new Animated.Value(14)).current;
  const headOp = useRef(new Animated.Value(0)).current;
  const headTy = useRef(new Animated.Value(18)).current;
  const cardOp = useRef(new Animated.Value(0)).current;
  const cardTy = useRef(new Animated.Value(22)).current;

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const draft = await readOnboardingDraftLocal<OnboardingDraft>();
      const n = draft?.nombreUsuario?.trim();
      if (n) setNombre(n);
    })();
  }, []);

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

  const handleRegister = async () => {
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (!nombre.trim()) {
      setError('Ingresa tu nombre');
      return;
    }
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }

    try {
      // signUp persiste nombre en user_profiles con columna id (= auth user id), no user_id (useAuthStore).
      await signUp(email.trim(), password, nombre.trim());
      setError('');
      await clearOnboardingResumeStepLocal();
      router.replace('/(auth)/login' as any);
    } catch (err: unknown) {
      console.error('Signup error:', err);
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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: backOp, transform: [{ translateY: backTy }] }}>
          <TouchableOpacity
            onPress={() => {
              void (async () => {
                await writeOnboardingCompletedLocal(false);
                await writeOnboardingResumeStepLocal(ONBOARDING_LAST_STEP_INDEX);
                router.replace('/onboarding' as Href);
              })();
            }}
            style={styles.back}>
            <Text style={{ color: T.textSecondary, fontSize: 15 }}>← Volver</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ opacity: headOp, transform: [{ translateY: headTy }] }}>
          <View style={styles.header}>
            <Text style={styles.logo}>🚀</Text>
            <Text style={[styles.title, { color: T.textPrimary }]}>Crear cuenta</Text>
            <Text style={[styles.subtitle, { color: T.textSecondary }]}>Empieza tu journey financiero</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: cardOp, transform: [{ translateY: cardTy }] }}>
        <View style={[styles.card, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
          {(
            [
              { label: 'Nombre', value: nombre, setter: setNombre, placeholder: 'Tu nombre', type: 'default' as const },
              {
                label: 'Email',
                value: email,
                setter: setEmail,
                placeholder: 'tu@email.com',
                type: 'email-address' as const,
              },
              {
                label: 'Contraseña',
                value: password,
                setter: setPassword,
                placeholder: 'Mínimo 6 caracteres',
                secure: true,
                type: 'default' as const,
              },
              {
                label: 'Confirmar contraseña',
                value: confirm,
                setter: setConfirm,
                placeholder: 'Repite tu contraseña',
                secure: true,
                type: 'default' as const,
              },
            ] as const
          ).map((field) => (
            <View key={field.label} style={{ gap: 6 }}>
              <Text style={[styles.label, { color: T.textSecondary }]}>{field.label}</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder },
                ]}
                placeholder={field.placeholder}
                placeholderTextColor={T.textMuted}
                value={field.value}
                onChangeText={(val) => {
                  setError('');
                  field.setter(val);
                }}
                keyboardType={field.type}
                autoCapitalize={field.type === 'email-address' ? 'none' : 'words'}
                secureTextEntry={'secure' in field ? field.secure : false}
              />
            </View>
          ))}

          {error ? (
            <Text
              style={{
                color: '#FF4D4D',
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 12,
                paddingHorizontal: 8,
              }}>
              {error}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: T.primary }]}
            onPress={handleRegister}
            disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Crear cuenta gratis</Text>}
          </TouchableOpacity>
        </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 20, paddingTop: 60 },
  back: { marginBottom: 8 },
  header: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 48 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14 },
  card: { borderRadius: 20, padding: 24, gap: 14, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  input: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    borderWidth: 1,
  },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
