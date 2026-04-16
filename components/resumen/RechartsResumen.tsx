import { Text, View } from 'react-native';

import type { FlowBarRow } from './chartTypes';

/** Nativo: recharts solo en `.web.tsx`. */

export function ResumenBarFlowChart({ data: _data }: { data: FlowBarRow[] }) {
  return (
    <View style={{ width: '100%', height: 240, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text className="text-center text-sm text-muted">Gráficos de resumen disponibles en la versión web.</Text>
    </View>
  );
}

export function ResumenDonutCategories({
  data: _data,
  centerValue: _centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  centerValue: string;
}) {
  return (
    <View style={{ width: '100%', height: 240, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text className="text-center text-sm text-muted">Gráfico disponible en la versión web.</Text>
    </View>
  );
}

export function ResumenLineIncomes({ data: _data }: { data: { label: string; value: number }[] }) {
  return (
    <View style={{ width: '100%', height: 220, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text className="text-center text-sm text-muted">Gráfico disponible en la versión web.</Text>
    </View>
  );
}

export function ResumenBarMoodHorizontal({ data: _data }: { data: { name: string; avg: number }[] }) {
  return (
    <View style={{ width: '100%', height: 220, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text className="text-center text-sm text-muted">Gráfico disponible en la versión web.</Text>
    </View>
  );
}
