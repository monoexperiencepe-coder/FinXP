import { LinearGradient } from 'expo-linear-gradient';
import type { ViewProps } from 'react-native';
import { Platform, View } from 'react-native';

type Props = ViewProps & {
  colors: readonly [string, string, ...string[]] | string[];
};

export function GradientView({ colors, style, children, ...props }: Props) {
  const c = [...colors];
  const first = c[0] ?? '#000000';
  if (Platform.OS === 'web') {
    return (
      <View style={[style, { backgroundColor: first }]} {...props}>
        {children}
      </View>
    );
  }
  return (
    <LinearGradient
      colors={c as [string, string, ...string[]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
      {...props}>
      {children}
    </LinearGradient>
  );
}
