import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { darkTheme, lightTheme } from '@/constants/theme';
import { Font } from '@/constants/typography';
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

  return (
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
        name="chat"
        options={{
          title: 'IA',
          tabBarLabel: 'IA',
          tabBarIcon: () => <Text style={{ fontSize: 20, marginBottom: -2 }}>✨</Text>,
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
  );
}
