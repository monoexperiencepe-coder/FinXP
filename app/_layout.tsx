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
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import '../global.css';

import { AppPreloader } from '@/components/AppPreloader';
import { darkTheme, lightTheme } from '@/constants/theme';
import {
  clearLastLogin,
  readLastLoginMs,
  readOnboardingRemoteAndSync,
  writeOnboardingCompletedLocal,
} from '@/lib/preferences';
import { resolveBootstrapRouteTarget, resolveOnboardingCompletedForRouting } from '@/lib/bootstrapRouting';
import { CANONICAL_PRODUCTION_ORIGIN, shouldRedirectToCanonical } from '@/lib/siteUrl';
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
  const [sessionValidated, setSessionValidated] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [onboardingCompletedResolved, setOnboardingCompletedResolved] = useState<boolean | null>(null);
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
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const { origin, pathname, search, hash } = window.location;
    if (!shouldRedirectToCanonical(origin)) return;
    const target = `${CANONICAL_PRODUCTION_ORIGIN.replace(/\/$/, '')}${pathname}${search}${hash}`;
    window.location.replace(target);
  }, []);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  // Evita arrastrar el tema de una cuenta previa al cerrar sesión.
  useEffect(() => {
    if (!initialized) return;
    if (!session) {
      useFinanceStore.setState((s) => ({
        ...s,
        profile: { ...s.profile, id: '', nombreUsuario: '' },
        expenses: [],
        incomes: [],
        fixedExpenses: [],
        creditCards: [],
        budgets: [],
        missions: [],
        aiInsights: [],
        categories: [],
        incomeCategories: [],
        onboardingCompleted: false,
        syncing: false,
        lastSync: null,
        theme: 'dark',
      }));
    }
  }, [initialized, session]);

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
    if (!initialized) {
      setSessionValidated(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      // Sin sesión local no hay nada que validar contra backend.
      if (!session) {
        if (!cancelled) setSessionValidated(true);
        return;
      }

      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !user) {
        // Sesión local huérfana: cerrar sesión sin borrar flags de onboarding ni lastLogin.
        await supabase.auth.signOut();

        const currentTheme = useFinanceStore.getState().theme;
        void useFinanceStore.persist.clearStorage();
        useFinanceStore.setState((s) => ({
          ...s,
          profile: { ...s.profile, id: '', nombreUsuario: '' },
          expenses: [],
          incomes: [],
          fixedExpenses: [],
          creditCards: [],
          budgets: [],
          missions: [],
          aiInsights: [],
          categories: [],
          incomeCategories: [],
          onboardingCompleted: false,
          syncing: false,
          lastSync: null,
          theme: currentTheme,
        }));
        useAuthStore.setState({
          session: null,
          user: null,
          postLoginTransitionPending: false,
        });
        router.replace('/(auth)/login' as any);
      }

      if (!cancelled) setSessionValidated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, session, router]);

  useEffect(() => {
    if (!initialized || !sessionValidated) {
      setBootstrapReady(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const userId = session?.user?.id ?? null;
      let completed = await resolveOnboardingCompletedForRouting({ userId });
      if (userId && !completed) {
        const remote = await readOnboardingRemoteAndSync(userId);
        if (remote === true) {
          await writeOnboardingCompletedLocal(true);
          completed = true;
        }
      }
      if (!cancelled) {
        setOnboardingCompletedResolved(completed);
        setBootstrapReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, sessionValidated, session?.user?.id]);

  useEffect(() => {
    if (!initialized || !loaded || !sessionValidated || !introDone || !bootstrapReady) return;
    if (onboardingCompletedResolved == null) return;

    const root = segments[0] as string | undefined;
    const target = resolveBootstrapRouteTarget({
      hasSession: !!session,
      onboardingCompleted: onboardingCompletedResolved,
      rootSegment: root,
      postLoginTransitionPending,
    });

    if (target === 'onboarding') router.replace('/onboarding' as any);
    else if (target === 'login') router.replace('/(auth)/login' as any);
    else if (target === 'home') router.replace('/(tabs)' as any);
  }, [
    session,
    initialized,
    segments,
    loaded,
    router,
    postLoginTransitionPending,
    introDone,
    bootstrapReady,
    onboardingCompletedResolved,
  ]);

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

  if (!loaded || !initialized || !sessionValidated) {
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
