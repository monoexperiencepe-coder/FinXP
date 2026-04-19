import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuthStore } from '@/store/useAuthStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, loading } = useAuthStore();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

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
      await signUp(email.trim(), password, nombre.trim());
      setError('');
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
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={{ color: T.textSecondary, fontSize: 15 }}>← Volver</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.logo}>🚀</Text>
          <Text style={[styles.title, { color: T.textPrimary }]}>Crear cuenta</Text>
          <Text style={[styles.subtitle, { color: T.textSecondary }]}>Empieza tu journey financiero</Text>
        </View>

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
