import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { darkTheme, lightTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useFinanceStore } from '@/store/useFinanceStore';

interface Mensaje {
  id: string;
  rol: 'usuario' | 'ia';
  texto: string;
}

const SUGERENCIAS = [
  '¿Cómo van mis gastos este mes?',
  '¿En qué estoy gastando más?',
  '¿Cómo puedo ahorrar más?',
  '¿Cumplo mis presupuestos?',
];

function chatApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/chat`;
  }
  const base = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (base) return `${base}/api/chat`;
  return '/api/chat';
}

export default function ChatIA() {
  const profile = useFinanceStore((s) => s.profile);
  const themeMode = useFinanceStore((s) => s.theme);
  const T = themeMode === 'dark' ? darkTheme : lightTheme;

  const c = {
    background: T.surface,
    surface: T.cardElevated,
    primary: T.primary,
    textPrimary: T.textPrimary,
    textSecondary: T.textSecondary,
    textMuted: T.textMuted,
    border: T.glassBorder,
  };

  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    {
      id: '0',
      rol: 'ia',
      texto: `¡Hola ${profile.nombreUsuario || 'Usuario'}! 👋 Soy tu asesor financiero IA. ¿En qué te puedo ayudar hoy?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { height } = Dimensions.get('window');

  useEffect(() => {
    if (abierto) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [abierto, mensajes]);

  const pulsarFAB = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    setAbierto(true);
  };

  const enviarMensaje = async (texto?: string) => {
    const mensaje = texto || input.trim();
    if (!mensaje || cargando) return;

    setInput('');

    const nuevoMsgUsuario: Mensaje = {
      id: Date.now().toString(),
      rol: 'usuario',
      texto: mensaje,
    };

    const mensajesActualizados = [...mensajes, nuevoMsgUsuario];
    setMensajes(mensajesActualizados);
    setCargando(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const historial = mensajesActualizados
        .filter((m) => m.id !== '0')
        .map((m) => ({
          role: m.rol === 'usuario' ? ('user' as const) : ('assistant' as const),
          content: m.texto,
        }));

      const response = await fetch(chatApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historial,
          accessToken: session.access_token,
        }),
      });

      const data = (await response.json()) as { respuesta?: string; error?: string };

      setMensajes((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          rol: 'ia',
          texto:
            data.respuesta ||
            data.error ||
            (!response.ok ? 'No pude procesar tu consulta. Intenta de nuevo.' : 'No pude procesar tu consulta.'),
        },
      ]);
    } catch {
      setMensajes((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          rol: 'ia',
          texto: 'Ocurrió un error al conectar. Verifica tu conexión.',
        },
      ]);
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 90,
          right: 20,
          transform: [{ scale: scaleAnim }],
          zIndex: 999,
        }}
        pointerEvents="box-none">
        <TouchableOpacity
          onPress={pulsarFAB}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: c.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 8,
          }}>
          <Text style={{ fontSize: 24 }}>✨</Text>
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              height: height * 0.75,
              backgroundColor: c.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              overflow: 'hidden',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                backgroundColor: c.surface,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: c.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 18 }}>✨</Text>
                </View>
                <View>
                  <Text style={{ color: c.textPrimary, fontWeight: '700', fontSize: 16 }}>Asesor IA</Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>AhorraYA IA</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setAbierto(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ color: c.textPrimary, fontSize: 16, fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={{ flex: 1, paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingVertical: 12 }}
              showsVerticalScrollIndicator={false}>
              {mensajes.map((msg) => (
                <View
                  key={msg.id}
                  style={{
                    alignSelf: msg.rol === 'usuario' ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    marginBottom: 10,
                  }}>
                  <View
                    style={{
                      backgroundColor: msg.rol === 'usuario' ? c.primary : c.surface,
                      borderRadius: 16,
                      borderBottomRightRadius: msg.rol === 'usuario' ? 4 : 16,
                      borderBottomLeftRadius: msg.rol === 'ia' ? 4 : 16,
                      padding: 12,
                    }}>
                    <Text
                      style={{
                        color: msg.rol === 'usuario' ? T.textInverse : c.textPrimary,
                        fontSize: 14,
                        lineHeight: 20,
                      }}>
                      {msg.texto}
                    </Text>
                  </View>
                </View>
              ))}

              {cargando && (
                <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}>
                  <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 14 }}>
                    <ActivityIndicator size="small" color={c.primary} />
                  </View>
                </View>
              )}

              {mensajes.length === 1 && !cargando && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: c.textMuted, fontSize: 11, marginBottom: 8 }}>Prueba preguntando:</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {SUGERENCIAS.map((s, i) => (
                      <TouchableOpacity
                        key={i}
                        onPress={() => void enviarMensaje(s)}
                        style={{
                          backgroundColor: c.surface,
                          borderRadius: 16,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderWidth: 1,
                          borderColor: c.border,
                        }}>
                        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                paddingBottom: Platform.OS === 'ios' ? 24 : 12,
                backgroundColor: c.surface,
                borderTopWidth: 1,
                borderTopColor: c.border,
                gap: 8,
              }}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Pregunta sobre tus finanzas..."
                placeholderTextColor={c.textMuted}
                style={{
                  flex: 1,
                  backgroundColor: c.background,
                  borderRadius: 20,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  color: c.textPrimary,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                  maxHeight: 80,
                }}
                onSubmitEditing={() => void enviarMensaje()}
                returnKeyType="send"
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={() => void enviarMensaje()}
                disabled={!input.trim() || cargando}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: input.trim() && !cargando ? c.primary : c.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Text style={{ fontSize: 16, color: input.trim() && !cargando ? T.textInverse : c.textMuted }}>➤</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}
