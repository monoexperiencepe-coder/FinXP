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

import { darkTheme as T } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, loading } = useAuthStore();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleRegister = async () => {
    if (!nombre.trim()) return Alert.alert('Error', 'Ingresa tu nombre');
    if (!email.trim()) return Alert.alert('Error', 'Ingresa tu email');
    if (password.length < 6) return Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres');
    if (password !== confirm) return Alert.alert('Error', 'Las contraseñas no coinciden');

    useAuthStore.setState({ loading: true });
    try {
      console.log('Attempting signup for:', email.trim());
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nombre_usuario: nombre.trim() } },
      });
      console.log('Signup result:', data, error);

      if (error) throw error;

      console.log('Signup successful, redirecting to login');
      router.replace('/(auth)/login' as any);
    } catch (e: any) {
      console.error('Signup error:', e);
      Alert.alert('Error', e.message || 'No se pudo crear la cuenta');
    } finally {
      useAuthStore.setState({ loading: false });
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
                onChangeText={field.setter}
                keyboardType={field.type}
                autoCapitalize={field.type === 'email-address' ? 'none' : 'words'}
                secureTextEntry={'secure' in field ? field.secure : false}
              />
            </View>
          ))}

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
