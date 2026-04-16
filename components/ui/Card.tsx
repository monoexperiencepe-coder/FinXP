import type { ViewProps } from 'react-native';
import { View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export function Card({ style, children, ...rest }: ViewProps) {
  const { T } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: T.card,
          borderWidth: 0,
          borderRadius: 24,
          padding: 16,
          shadowColor: T.shadowCard,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 1,
          shadowRadius: 24,
          elevation: 12,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
