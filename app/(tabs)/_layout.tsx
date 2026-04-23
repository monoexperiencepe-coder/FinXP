import React, { useEffect, useRef, useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useSegments } from 'expo-router';
import { View } from 'react-native';

import ChatIA from '@/components/ChatIA';
import PremiumTeaser from '@/components/PremiumTeaser';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { darkTheme, lightTheme } from '@/constants/theme';
import { Font } from '@/constants/typography';
import {
  canShowPremiumTeaserFromNavigation,
  migrateLegacyPremiumTeaserFlag,
  shouldScheduleFirstLaunchFromPerfil,
  syncPremiumTeaserFromOnboardingFlag,
} from '@/lib/premiumTeaserSchedule';
import { useAppShellStore } from '@/store/useAppShellStore';
import { useFinanceStore } from '@/store/useFinanceStore';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={20} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  const isDark = useFinanceStore((s) => s.theme === 'dark');
  const T = isDark ? darkTheme : lightTheme;
  const [showTeaser, setShowTeaser] = useState(false);
  const preloaderComplete = useAppShellStore((s) => s.preloaderComplete);
  const segments = useSegments();
  const lastSegment = segments[segments.length - 1] ?? '';
  const lastSegmentRef = useRef(lastSegment);
  lastSegmentRef.current = lastSegment;

  useEffect(() => {
    if (!preloaderComplete) return;
    void migrateLegacyPremiumTeaserFlag();
    void syncPremiumTeaserFromOnboardingFlag();
  }, [preloaderComplete]);

  /** Primera vez: tras registrar perfil (onboarding), en Perfil ~10s. */
  useEffect(() => {
    if (!preloaderComplete || showTeaser) return;
    if (lastSegment !== 'perfil') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void shouldScheduleFirstLaunchFromPerfil().then((ok) => {
      if (!ok || cancelled) return;
      timer = setTimeout(() => {
        if (cancelled || lastSegmentRef.current !== 'perfil') return;
        void shouldScheduleFirstLaunchFromPerfil().then((ok2) => {
          if (ok2 && !cancelled) setShowTeaser(true);
        });
      }, 10000);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [preloaderComplete, lastSegment, showTeaser]);

  /** Siguientes veces: al volver a Inicio u otras pestañas (no Perfil), máx. 2/día y espaciado. */
  const teaserNavSegments = ['index', 'gastos', 'resumen', 'misiones'] as const;
  useEffect(() => {
    if (!preloaderComplete || showTeaser) return;
    if (lastSegment === 'perfil') return;
    if (!teaserNavSegments.includes(lastSegment as (typeof teaserNavSegments)[number])) return;
    const seg = lastSegment;
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || lastSegmentRef.current !== seg) return;
      void canShowPremiumTeaserFromNavigation().then((can) => {
        if (can && !cancelled) setShowTeaser(true);
      });
    }, 650);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preloaderComplete, lastSegment, showTeaser]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: T.bg },
          headerTintColor: T.textPrimary,
          headerTitleStyle: { fontFamily: Font.jakarta600, fontSize: 17 },
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: isDark ? '#0F1029' : '#FFFFFF',
            borderTopWidth: 0,
            shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(124,58,237,0.1)',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 1,
            shadowRadius: 16,
            elevation: 16,
            height: 68,
            paddingBottom: 10,
          },
          tabBarActiveTintColor: T.primary,
          tabBarInactiveTintColor: T.textMuted,
          tabBarLabelStyle: {
            fontFamily: Font.manrope500,
            fontSize: 11,
          },
          headerShown: useClientOnlyValue(false, true),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Inicio',
            tabBarLabel: 'Inicio',
            tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          }}
        />
        <Tabs.Screen
          name="gastos"
          options={{
            title: 'Gastos',
            tabBarLabel: 'Gastos',
            tabBarIcon: ({ color }) => <TabBarIcon name="money" color={color} />,
          }}
        />
        <Tabs.Screen
          name="misiones"
          options={{
            title: 'Misiones',
            tabBarLabel: 'Misiones',
            tabBarIcon: ({ color }) => <TabBarIcon name="flag" color={color} />,
          }}
        />
        <Tabs.Screen
          name="resumen"
          options={{
            title: 'Resumen',
            tabBarLabel: 'Resumen',
            tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart" color={color} />,
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: 'Perfil',
            tabBarLabel: 'Perfil',
            tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          }}
        />
      </Tabs>
      <ChatIA />
      <PremiumTeaser visible={showTeaser} onClose={() => setShowTeaser(false)} />
    </View>
  );
}
