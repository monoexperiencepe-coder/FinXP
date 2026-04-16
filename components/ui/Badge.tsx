import { Text, View } from 'react-native';

import { Font } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

export type BadgeVariant = 'green' | 'red' | 'gold' | 'purple' | 'cyan' | 'muted';

type Props = {
  text: string;
  variant: BadgeVariant;
};

export function Badge({ text, variant }: Props) {
  const { T } = useTheme();

  const VARIANT_STYLES: Record<BadgeVariant, { bg: string; border: string; text: string }> = {
    green: {
      bg: T.tertiaryBg,
      border: T.tertiaryBg,
      text: T.success,
    },
    red: {
      bg: T.primaryBg,
      border: T.primaryBorder,
      text: T.error,
    },
    gold: {
      bg: T.tertiaryBg,
      border: T.glassBorder,
      text: T.gold,
    },
    purple: {
      bg: T.primaryBg,
      border: T.primaryBorder,
      text: T.primary,
    },
    cyan: {
      bg: T.secondaryBg,
      border: T.secondaryBg,
      text: T.secondary,
    },
    muted: {
      bg: T.cardElevated,
      border: T.glassBorder,
      text: T.textSecondary,
    },
  };

  const v = VARIANT_STYLES[variant];
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: v.bg,
        borderWidth: 1,
        borderColor: v.border,
      }}>
      <Text
        style={{
          fontFamily: Font.manrope600,
          fontSize: 11,
          color: v.text,
        }}>
        {text}
      </Text>
    </View>
  );
}
