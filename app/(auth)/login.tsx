import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import LoaderTransicion from '@/components/LoaderTransicion';
import { darkTheme as T } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, sendMagicLink, loading, setPostLoginTransitionPending } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [error, setError] = useState('');
  const [showLoader, setShowLoader] = useState(false);

  const handleSignIn = async () => {
    setError('');
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }
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
    if (!email.trim()) {
      setError('Ingresa tu email');
      return;
    }
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
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>💎</Text>
          <Text style={[styles.title, { color: T.textPrimary }]}>AhorraYA</Text>
          <Text style={[styles.subtitle, { color: T.textSecondary }]}>Tu finanzas, gamificadas</Text>
        </View>

        <View style={[styles.card, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
          <Text style={[styles.cardTitle, { color: T.textPrimary }]}>
            {mode === 'password' ? 'Iniciar sesión' : 'Magic Link'}
          </Text>

          <TextInput
            style={[
              styles.input,
              { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder },
            ]}
            placeholder="tu@email.com"
            placeholderTextColor={T.textMuted}
            value={email}
            onChangeText={(val) => {
              setError('');
              setEmail(val);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {mode === 'password' && (
            <TextInput
              style={[
                styles.input,
                { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder },
              ]}
              placeholder="Contraseña"
              placeholderTextColor={T.textMuted}
              value={password}
              onChangeText={(val) => {
                setError('');
                setPassword(val);
              }}
              secureTextEntry
            />
          )}

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
            onPress={mode === 'password' ? handleSignIn : handleMagicLink}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>{mode === 'password' ? 'Entrar' : 'Enviar magic link'}</Text>
            )}
          </TouchableOpacity>

        </View>

        <TouchableOpacity onPress={() => router.push('/(auth)/register' as Href)}>
          <Text style={[styles.registerText, { color: T.textSecondary }]}>
            ¿No tienes cuenta? <Text style={{ color: T.primary, fontWeight: '700' }}>Regístrate gratis</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <LoaderTransicion
        visible={showLoader}
        onFinish={() => {
          setShowLoader(false);
          setPostLoginTransitionPending(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 24 },
  logoContainer: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 56 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: 1 },
  subtitle: { fontSize: 15 },
  card: { borderRadius: 20, padding: 24, gap: 16, borderWidth: 1 },
  cardTitle: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
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
    marginTop: 4,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchMode: { alignItems: 'center', paddingVertical: 4 },
  switchText: { fontSize: 14, fontWeight: '600' },
  registerText: { textAlign: 'center', fontSize: 14 },
});
