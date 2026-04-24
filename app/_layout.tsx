import 'react-native-gesture-handler';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { AppPreloader } from '@/components/AppPreloader';
import { darkTheme, lightTheme } from '@/constants/theme';
import {
  clearLastLogin,
  readDarkModeCache,
  readLastLoginMs,
  readOnboardingLocal,
  readOnboardingRemoteAndSync,
} from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppShellStore } from '@/store/useAppShellStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useFinanceStore } from '@/store/useFinanceStore';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [introDone, setIntroDone] = useState(false);
  const onIntroFinish = useCallback(() => {
    setIntroDone(true);
    useAppShellStore.getState().setPreloaderComplete(true);
  }, []);

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
      const cached = await readDarkModeCache();
      if (cached) useFinanceStore.setState({ theme: cached });
    })();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      await useAuthStore.getState().initialize();

      const lastLogin = await readLastLoginMs();
      if (lastLogin) {
        const daysSinceLogin = (Date.now() - lastLogin) / (1000 * 60 * 60 * 24);
        if (daysSinceLogin > 15) {
          await supabase.auth.signOut();
          await clearLastLogin();
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
        if (await readOnboardingLocal()) {
          router.replace('/(tabs)' as any);
          return;
        }
        const remote = await readOnboardingRemoteAndSync(session.user.id);
        if (remote === true) {
          router.replace('/(tabs)' as any);
        } else {
          router.replace('/onboarding' as any);
        }
        return;
      }

      if (session && !inOnboarding && !inAuthGroup) {
        if (!(await readOnboardingLocal())) {
          const remote = await readOnboardingRemoteAndSync(session.user.id);
          if (remote === false) router.replace('/onboarding' as any);
          // si remote === null (fallo de red), no redirigir
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
    <GestureHandlerRootView
      style={{
        flex: 1,
        // Durante el preloader: look oscuro de marca; luego el tema guardado (día por defecto).
        backgroundColor: !introDone ? darkTheme.bg : T.bg,
      }}>
      <ThemeProvider value={navigationTheme}>
        <StatusBar
          style={!introDone ? 'light' : themeMode === 'dark' ? 'light' : 'dark'}
        />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
        {loaded && initialized && !introDone ? (
          <AppPreloader theme={darkTheme} onFinish={onIntroFinish} />
        ) : null}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
