import type { EstadoDeAnimo } from '@/types';

export const ESTADOS_DE_ANIMO: EstadoDeAnimo[] = [
  'FELIZ',
  'CONTENTO',
  'NEUTRAL',
  'PREOCUPADO',
  'MOLESTO',
  'TRISTE',
  'ANSIOSO',
  'ESTRESADO',
];

export const MOOD_EMOJI: Record<EstadoDeAnimo, string> = {
  FELIZ: '😄',
  CONTENTO: '😊',
  NEUTRAL: '😐',
  PREOCUPADO: '😟',
  MOLESTO: '😠',
  TRISTE: '😢',
  ANSIOSO: '😰',
  ESTRESADO: '🤯',
};

export function moodLabel(m: EstadoDeAnimo): string {
  const labels: Record<EstadoDeAnimo, string> = {
    FELIZ: 'Feliz',
    CONTENTO: 'Contento',
    NEUTRAL: 'Neutral',
    PREOCUPADO: 'Preocupado',
    MOLESTO: 'Molesto',
    TRISTE: 'Triste',
    ANSIOSO: 'Ansioso',
    ESTRESADO: 'Estresado',
  };
  return labels[m];
}
