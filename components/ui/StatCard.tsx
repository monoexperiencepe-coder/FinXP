import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

import { Card } from './Card';

type Props = {
  label: string;
  value: string;
  icon?: string;
  /** Color del acento del ícono (token del tema) */
  color?: string;
  accessoryRight?: ReactNode;
};

export function StatCard({ label, value, icon, color, accessoryRight }: Props) {
  const { T } = useTheme();
  const accent = color ?? T.primary;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
        {icon ? (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: T.cardElevated,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: T.glassBorder,
            }}>
            <Text style={{ fontSize: 22 }}>{icon}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Font.manrope400, fontSize: 12, color: T.textMuted }}>{label}</Text>
          <Text
            style={{
              marginTop: 4,
              fontFamily: Font.jakarta700,
              fontSize: 22,
              color: accent,
            }}>
            {value}
          </Text>
        </View>
      </View>
      {accessoryRight ? <View style={{ alignSelf: 'flex-start' }}>{accessoryRight}</View> : null}
    </Card>
  );
}
