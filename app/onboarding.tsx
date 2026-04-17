import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { darkTheme as T } from '@/constants/theme';
import { createId } from '@/lib/ids';
import * as db from '@/lib/database';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';

const METODOS = ['Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Yape', 'Plin', 'Transferencia'];

const CATEGORIAS_DEFAULT = [
  { id: 'alimentacion', nombre: 'Alimentación', emoji: '🍔' },
  { id: 'transporte', nombre: 'Transporte', emoji: '🚌' },
  { id: 'entretenimiento', nombre: 'Entretenimiento', emoji: '🎮' },
  { id: 'salud', nombre: 'Salud', emoji: '💊' },
  { id: 'ropa', nombre: 'Ropa', emoji: '👕' },
  { id: 'educacion', nombre: 'Educación', emoji: '📚' },
  { id: 'hogar', nombre: 'Hogar', emoji: '🏠' },
  { id: 'servicios', nombre: 'Servicios', emoji: '💡' },
  { id: 'otros', nombre: 'Otros', emoji: '📦' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { loadFromSupabase, profile } = useFinanceStore();
  const [step, setStep] = useState(0);

  const [nombre, setNombre] = useState('');
  const [moneda, setMoneda] = useState('PEN');
  const [tipoCambio, setTipoCambio] = useState('3.75');
  const [metodosSeleccionados, setMetodosSeleccionados] = useState<string[]>(() => {
    const nombres = (profile.metodosDePago ?? []).map((m) => m.nombre);
    return nombres.length > 0 ? nombres : ['Efectivo', 'Yape'];
  });

  const [presupuestos, setPresupuestos] = useState<Record<string, string>>({});
  const [categoriasList, setCategoriasList] = useState(CATEGORIAS_DEFAULT);
  const [newCatName, setNewCatName] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);

  const totalSteps = 4;

  const handleAddCat = () => {
    if (!newCatName.trim()) return;
    const newCat = { id: newCatName.toLowerCase(), nombre: newCatName.trim(), emoji: '📦' };
    setCategoriasList((prev) => [...prev, newCat]);
    setNewCatName('');
    setShowCatInput(false);
  };

  const handleRemoveCat = (id: string) => {
    setCategoriasList((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleMetodo = (metodo: string) => {
    setMetodosSeleccionados((prev) =>
      prev.includes(metodo) ? prev.filter((m) => m !== metodo) : [...prev, metodo],
    );
  };

  const metodosPills = useMemo(() => {
    const fromProfile = (profile.metodosDePago ?? []).map((m) => m.nombre);
    return [...new Set([...METODOS, ...fromProfile])];
  }, [profile.metodosDePago]);

  const handleFinish = async () => {
    if (!user) {
      console.error('No user found');
      router.replace('/(tabs)' as any);
      return;
    }
    try {
      console.log('Saving profile for user:', user.id);

      await db.updateProfile(user.id, {
        nombre_usuario: nombre || 'Usuario',
        moneda_principal: moneda,
        tipo_de_cambio: parseFloat(tipoCambio) || 3.75,
        metodos_de_pago: metodosSeleccionados,
        onboarding_done: true,
      });
      useFinanceStore.setState((state) => ({
        profile: {
          ...state.profile,
          metodosDePago: metodosSeleccionados.map((nombre) => ({
            id: createId(),
            nombre,
            activo: true,
          })),
        },
      }));
      console.log('Profile saved');

      await db.initDefaultCategories(user.id);
      const existingCats = await db.getCategories(user.id);
      if (existingCats.length === 0) {
        const { supabase } = await import('@/lib/supabase');
        await supabase.from('user_categories').insert(
          categoriasList.map((c, i) => ({ user_id: user.id, nombre: c.nombre, emoji: c.emoji, orden: i })),
        );
      }

      const mesActual = new Date().toISOString().slice(0, 7);
      const budgetPromises = Object.entries(presupuestos)
        .filter(([_, val]) => val && parseFloat(val) > 0)
        .map(([categoria, limite]) => db.upsertBudget(user.id, categoria, parseFloat(limite), mesActual));
      await Promise.all(budgetPromises);
      console.log('Budgets saved');

      await AsyncStorage.setItem('finxp_onboarding_done', 'true');
      await loadFromSupabase();
      router.replace('/(tabs)' as any);
    } catch (e) {
      console.error('Error in handleFinish:', e);
      await AsyncStorage.setItem('finxp_onboarding_done', 'true');
      router.replace('/(tabs)' as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i === step ? T.primary : T.textMuted }]} />
        ))}
      </View>

      {/* PANTALLA 1 - Bienvenida */}
      {step === 0 && (
        <ScrollView contentContainerStyle={styles.slide} showsVerticalScrollIndicator={false}>
          <Text style={styles.bigEmoji}>💎</Text>
          <Text style={[styles.title, { color: T.textPrimary }]}>Bienvenido a FinXP</Text>
          <Text style={[styles.subtitle, { color: T.textSecondary }]}>
            La app que convierte tus finanzas personales en un juego. Registra gastos, sube de nivel y gana recompensas por tener
            buenas finanzas.
          </Text>
          <View style={[styles.featureCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
            {[
              { emoji: '⚡', text: 'Registra gastos en segundos' },
              { emoji: '🎮', text: 'Gana XP y sube de nivel' },
              { emoji: '📊', text: 'Visualiza tus finanzas al instante' },
              { emoji: '🎯', text: 'Cumple misiones y logros' },
            ].map((f) => (
              <View key={f.text} style={styles.featureRow}>
                <Text style={{ fontSize: 20 }}>{f.emoji}</Text>
                <Text style={[styles.featureText, { color: T.textSecondary }]}>{f.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={[styles.btn, { backgroundColor: T.primary }]} onPress={() => setStep(1)}>
            <Text style={styles.btnText}>Empezar →</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* PANTALLA 2 - Cómo funciona */}
      {step === 1 && (
        <ScrollView contentContainerStyle={styles.slide} showsVerticalScrollIndicator={false}>
          <Text style={styles.bigEmoji}>🚀</Text>
          <Text style={[styles.title, { color: T.textPrimary }]}>¿Cómo funciona?</Text>
          <View style={{ gap: 16, width: '100%' }}>
            {[
              { emoji: '⚡', title: 'Gana XP', desc: 'Cada gasto que registras te da 10 XP. Cada ingreso 20 XP.' },
              { emoji: '📈', title: 'Sube de nivel', desc: 'Acumula XP para subir de nivel y desbloquear logros.' },
              { emoji: '🔥', title: 'Mantén tu racha', desc: 'Registra algo cada día para mantener tu racha activa.' },
              { emoji: '🎯', title: 'Completa misiones', desc: 'Misiones diarias y semanales con recompensas de XP.' },
            ].map((item) => (
              <View key={item.title} style={[styles.howCard, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.howTitle, { color: T.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.howDesc, { color: T.textSecondary }]}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setStep(0)}>
              <Text style={[styles.backText, { color: T.textMuted }]}>← Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: T.primary, flex: 1, marginLeft: 12 }]} onPress={() => setStep(2)}>
              <Text style={styles.btnText}>Continuar →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* PANTALLA 3 - Tu perfil */}
      {step === 2 && (
        <ScrollView contentContainerStyle={styles.slide} showsVerticalScrollIndicator={false}>
          <Text style={styles.bigEmoji}>👤</Text>
          <Text style={[styles.title, { color: T.textPrimary }]}>Tu perfil</Text>
          <View style={{ gap: 14, width: '100%' }}>
            <View style={{ gap: 6 }}>
              <Text style={[styles.label, { color: T.textSecondary }]}>¿Cómo te llamamos?</Text>
              <TextInput
                style={[styles.input, { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                placeholder="Tu nombre"
                placeholderTextColor={T.textMuted}
                value={nombre}
                onChangeText={setNombre}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={[styles.label, { color: T.textSecondary }]}>Moneda principal</Text>
              <View style={styles.pillRow}>
                {['PEN', 'USD', 'EUR'].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: moneda === m ? T.primary : T.surface,
                        borderColor: moneda === m ? T.primary : T.glassBorder,
                      },
                    ]}
                    onPress={() => setMoneda(m)}>
                    <Text style={[styles.pillText, { color: moneda === m ? '#fff' : T.textSecondary }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {moneda !== 'USD' && (
              <View style={{ gap: 6 }}>
                <Text style={[styles.label, { color: T.textSecondary }]}>Tipo de cambio (1 USD = ?)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                  placeholder="3.75"
                  placeholderTextColor={T.textMuted}
                  value={tipoCambio}
                  onChangeText={setTipoCambio}
                  keyboardType="decimal-pad"
                />
              </View>
            )}
            <View style={{ gap: 8 }}>
              <Text style={[styles.label, { color: T.textSecondary }]}>Métodos de pago que usas</Text>
              <View style={styles.pillRow}>
                {metodosPills.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: metodosSeleccionados.includes(m) ? T.primary : T.surface,
                        borderColor: metodosSeleccionados.includes(m) ? T.primary : T.glassBorder,
                      },
                    ]}
                    onPress={() => toggleMetodo(m)}>
                    <Text style={[styles.pillText, { color: metodosSeleccionados.includes(m) ? '#fff' : T.textSecondary }]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => setStep(1)}>
              <Text style={[styles.backText, { color: T.textMuted }]}>← Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: T.primary, flex: 1, marginLeft: 12 }]} onPress={() => setStep(3)}>
              <Text style={styles.btnText}>Continuar →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* PANTALLA 4 - Presupuestos */}
      {step === 3 && (
        <ScrollView contentContainerStyle={[styles.slide, { paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.bigEmoji}>🎯</Text>
          <Text style={[styles.title, { color: T.textPrimary }]}>Tus presupuestos</Text>
          <Text style={[styles.subtitle, { color: T.textSecondary }]}>
            ¿Cuánto quieres gastar por categoría este mes? (puedes saltarte esto)
          </Text>
          <View style={{ gap: 10, width: '100%' }}>
            {categoriasList.map((cat) => (
              <View key={cat.id} style={[styles.budgetRow, { backgroundColor: T.card, borderColor: T.glassBorder }]}>
                <Text style={{ fontSize: 22 }}>{cat.emoji}</Text>
                <Text style={[styles.budgetLabel, { color: T.textPrimary }]}>{cat.nombre}</Text>
                <TextInput
                  style={[styles.budgetInput, { backgroundColor: T.surface, color: T.textPrimary, borderColor: T.glassBorder }]}
                  placeholder="0"
                  placeholderTextColor={T.textMuted}
                  value={presupuestos[cat.nombre] || ''}
                  onChangeText={(val) => setPresupuestos((prev) => ({ ...prev, [cat.nombre]: val }))}
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity onPress={() => handleRemoveCat(cat.id)} style={{ paddingLeft: 8 }}>
                  <Text style={{ color: '#FF4444', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {showCatInput && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, width: '100%' }}>
              <TextInput
                style={[
                  {
                    flex: 1,
                    height: 44,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    fontSize: 14,
                    backgroundColor: T.surface,
                    color: T.textPrimary,
                    borderWidth: 1,
                    borderColor: T.glassBorder,
                  },
                ]}
                placeholder="Nueva categoría"
                placeholderTextColor={T.textMuted}
                value={newCatName}
                onChangeText={setNewCatName}
              />
              <TouchableOpacity
                style={[
                  { height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: T.primary, justifyContent: 'center' },
                ]}
                onPress={handleAddCat}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={[
              {
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: T.primary,
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 8,
                width: '100%',
              },
            ]}
            onPress={() => setShowCatInput(!showCatInput)}>
            <Text style={{ color: T.primary, fontWeight: '600', fontSize: 14 }}>
              {showCatInput ? 'Cancelar' : '+ Agregar categoría'}
            </Text>
          </TouchableOpacity>
          <View style={[styles.navRow, { marginTop: 20 }]}>
            <TouchableOpacity onPress={() => setStep(2)}>
              <Text style={[styles.backText, { color: T.textMuted }]}>← Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: T.primary, flex: 1, marginLeft: 12 }]} onPress={handleFinish}>
              <Text style={styles.btnText}>¡Empezar! 🚀</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  slide: { paddingHorizontal: 24, alignItems: 'center', gap: 20 },
  bigEmoji: { fontSize: 64 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  featureCard: { width: '100%', borderRadius: 16, padding: 20, gap: 14, borderWidth: 1 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { fontSize: 14 },
  howCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 16, borderWidth: 1 },
  howTitle: { fontSize: 15, fontWeight: '700' },
  howDesc: { fontSize: 13, marginTop: 2 },
  btn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, width: '100%' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  navRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 8 },
  backText: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', marginLeft: 4 },
  input: { height: 52, borderRadius: 12, paddingHorizontal: 16, fontSize: 15, borderWidth: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '600' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 12, borderWidth: 1 },
  budgetLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  budgetInput: {
    width: 80,
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 14,
    borderWidth: 1,
    textAlign: 'right',
  },
});
