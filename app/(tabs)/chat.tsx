import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
  timestamp: Date;
}

const SUGERENCIAS = [
  '¿Cómo van mis gastos este mes?',
  '¿En qué estoy gastando más?',
  '¿Cómo puedo ahorrar más?',
  '¿Estoy cumpliendo mis presupuestos?',
];

function chatApiUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/chat`;
  }
  const base = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  if (base) return `${base}/api/chat`;
  return '/api/chat';
}

export default function ChatScreen() {
  const profile = useFinanceStore((s) => s.profile);
  const themeMode = useFinanceStore((s) => s.theme);
  const T = themeMode === 'dark' ? darkTheme : lightTheme;

  const [mensajes, setMensajes] = useState<Mensaje[]>([
    {
      id: '0',
      rol: 'ia',
      texto: `¡Hola ${profile.nombreUsuario || 'Usuario'}! 👋 Soy tu asesor financiero IA. Puedo analizar tus gastos, ingresos y presupuestos para darte recomendaciones personalizadas. ¿En qué te puedo ayudar hoy?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [mensajes]);

  const enviarMensaje = async (texto?: string) => {
    const mensaje = texto || input.trim();
    if (!mensaje || cargando) return;

    setInput('');

    const msgUsuario: Mensaje = {
      id: Date.now().toString(),
      rol: 'usuario',
      texto: mensaje,
      timestamp: new Date(),
    };
    setMensajes((prev) => [...prev, msgUsuario]);
    setCargando(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión');

      const response = await fetch(chatApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: mensaje,
          accessToken: session.access_token,
        }),
      });

      const data = (await response.json()) as { respuesta?: string; error?: string };

      const msgIA: Mensaje = {
        id: (Date.now() + 1).toString(),
        rol: 'ia',
        texto:
          data.respuesta ||
          data.error ||
          (!response.ok ? 'No pude procesar tu consulta. Intenta de nuevo.' : 'No pude procesar tu consulta.'),
        timestamp: new Date(),
      };
      setMensajes((prev) => [...prev, msgIA]);
    } catch {
      const msgError: Mensaje = {
        id: (Date.now() + 1).toString(),
        rol: 'ia',
        texto: 'Ocurrió un error al conectar con el asistente. Verifica tu conexión.',
        timestamp: new Date(),
      };
      setMensajes((prev) => [...prev, msgError]);
    } finally {
      setCargando(false);
    }
  };

  const c = {
    background: T.bg,
    surface: T.surface,
    primary: T.primary,
    textPrimary: T.textPrimary,
    textSecondary: T.textSecondary,
    textMuted: T.textMuted,
    border: T.glassBorder,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <View style={{ paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: c.background }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: c.textPrimary }}>✨ Asesor IA</Text>
        <Text style={{ fontSize: 14, color: c.textSecondary, marginTop: 2 }}>Tu consultor financiero personal</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}>
        {mensajes.map((msg) => (
          <View
            key={msg.id}
            style={{
              alignSelf: msg.rol === 'usuario' ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              marginBottom: 12,
            }}>
            {msg.rol === 'ia' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: c.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 6,
                  }}>
                  <Text style={{ fontSize: 10, color: 'white', fontWeight: '700' }}>IA</Text>
                </View>
                <Text style={{ fontSize: 11, color: c.textMuted }}>AhorraYA IA</Text>
              </View>
            )}
            <View
              style={{
                backgroundColor: msg.rol === 'usuario' ? c.primary : c.surface,
                borderRadius: 16,
                borderBottomRightRadius: msg.rol === 'usuario' ? 4 : 16,
                borderBottomLeftRadius: msg.rol === 'ia' ? 4 : 16,
                padding: 12,
              }}>
              <Text style={{ color: msg.rol === 'usuario' ? T.textInverse : c.textPrimary, fontSize: 15, lineHeight: 22 }}>
                {msg.texto}
              </Text>
            </View>
          </View>
        ))}

        {cargando && (
          <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
            <View style={{ backgroundColor: c.surface, borderRadius: 16, padding: 14 }}>
              <ActivityIndicator size="small" color={c.primary} />
            </View>
          </View>
        )}

        {mensajes.length === 1 && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>Preguntas frecuentes:</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGERENCIAS.map((s, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => void enviarMensaje(s)}
                  style={{
                    backgroundColor: c.surface,
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderWidth: 1,
                    borderColor: c.border,
                  }}>
                  <Text style={{ color: c.textSecondary, fontSize: 13 }}>{s}</Text>
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
          paddingBottom: Platform.OS === 'ios' ? 28 : 12,
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
            borderRadius: 24,
            paddingHorizontal: 16,
            paddingVertical: 10,
            color: c.textPrimary,
            fontSize: 15,
            borderWidth: 1,
            borderColor: c.border,
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
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: input.trim() && !cargando ? c.primary : c.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 18, color: input.trim() && !cargando ? T.textInverse : c.textMuted }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
