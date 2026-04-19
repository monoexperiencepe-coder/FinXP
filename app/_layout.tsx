import 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
} from '@expo-google-fonts/manrope';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { darkTheme, lightTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const themeMode = useFinanceStore((s) => s.theme);
  const T = themeMode === 'dark' ? darkTheme : lightTheme;

  const { session, initialized } = useAuthStore();
  const postLoginTransitionPending = useAuthStore((s) => s.postLoginTransitionPending);
  const router = useRouter();
  const segments = useSegments();

  const navigationTheme = useMemo(() => {
    const base = themeMode === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: T.primary,
        background: T.bg,
        card: T.surface,
        text: T.textPrimary,
        border: T.glassBorder,
        notification: T.primary,
      },
    };
  }, [T, themeMode]);

  const [loaded, error] = useFonts({
    PlusJakartaSans_700Bold,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_500Medium,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    void (async () => {
      const savedMode = await AsyncStorage.getItem('ahorraya_dark_mode');
      if (savedMode === 'true') {
        useFinanceStore.setState({ theme: 'dark' });
      } else if (savedMode === 'false') {
        useFinanceStore.setState({ theme: 'light' });
      }
    })();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      await useAuthStore.getState().initialize();

      const lastLogin = await AsyncStorage.getItem('ahorraya_last_login');
      if (lastLogin) {
        const daysSinceLogin = (Date.now() - parseInt(lastLogin, 10)) / (1000 * 60 * 60 * 24);
        if (daysSinceLogin > 15) {
          await supabase.auth.signOut();
          await AsyncStorage.removeItem('ahorraya_last_login');
        }
      }
    };
    void initAuth();
  }, []);

  useEffect(() => {
    if (!initialized || !loaded) return;
    const root = segments[0] as string | undefined;
    const inAuthGroup = root === '(auth)';
    const inOnboarding = root === 'onboarding';

    const checkOnboarding = async () => {
      if (!session && !inAuthGroup) {
        router.replace('/(auth)/login' as any);
        return;
      }

      if (session && inAuthGroup) {
        if (postLoginTransitionPending) {
          return;
        }
        // Verificar onboarding en AsyncStorage primero (rápido)
        const localDone = await AsyncStorage.getItem('ahorraya_onboarding_done');
        if (localDone) {
          router.replace('/(tabs)' as any);
          return;
        }
        // Verificar en Supabase (fuente de verdad)
        try {
          const { data } = await supabase
            .from('user_profiles')
            .select('onboarding_done')
            .eq('id', session.user.id)
            .single();

          if (data?.onboarding_done) {
            await AsyncStorage.setItem('ahorraya_onboarding_done', 'true');
            router.replace('/(tabs)' as any);
          } else {
            router.replace('/onboarding' as any);
          }
        } catch {
          router.replace('/onboarding' as any);
        }
        return;
      }

      if (session && !inOnboarding && !inAuthGroup) {
        const localDone = await AsyncStorage.getItem('ahorraya_onboarding_done');
        if (!localDone) {
          try {
            const { data } = await supabase
              .from('user_profiles')
              .select('onboarding_done')
              .eq('id', session.user.id)
              .single();

            if (data?.onboarding_done) {
              await AsyncStorage.setItem('ahorraya_onboarding_done', 'true');
            } else {
              router.replace('/onboarding' as any);
            }
          } catch {
            // Si falla la consulta, no redirigir
          }
        }
      }
    };

    void checkOnboarding();
  }, [session, initialized, segments, loaded, router, postLoginTransitionPending]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    const unsub = useFinanceStore.persist.onFinishHydration(() => {
      useFinanceStore.getState().ensureWeeklyMissions();
    });
    return unsub;
  }, []);

  if (!loaded || !initialized) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: T.bg }}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
