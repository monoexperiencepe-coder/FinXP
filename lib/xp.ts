/** XP necesario dentro del nivel actual para pasar al siguiente (por nivel 1-based). */
const XP_TO_NEXT_BY_LEVEL: Record<number, number> = {
  1: 500,
  2: 700,
  3: 1300,
  4: 500, // demo alineado con UI de ejemplo 320/500
  5: 2000,
};

export function xpRequiredForNextLevel(nivel: number): number {
  return XP_TO_NEXT_BY_LEVEL[nivel] ?? 2500;
}

export function applyXpToProfile(input: {
  nivel: number;
  xpActual: number;
  xpParaSiguienteNivel: number;
  gain: number;
}): { nivel: number; xpActual: number; xpParaSiguienteNivel: number } {
  let { nivel, xpActual, xpParaSiguienteNivel, gain } = input;
  xpActual += gain;
  while (xpParaSiguienteNivel > 0 && xpActual >= xpParaSiguienteNivel) {
    xpActual -= xpParaSiguienteNivel;
    nivel += 1;
    xpParaSiguienteNivel = xpRequiredForNextLevel(nivel);
  }
  return { nivel, xpActual, xpParaSiguienteNivel };
}
