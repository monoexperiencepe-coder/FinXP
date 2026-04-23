import { create } from 'zustand';

/**
 * Estado de la cáscara de la app (no persistido). Sirve para coordinar el preloader
 * con pantallas hijas (p. ej. PremiumTeaser) que viven bajo otras ramas del árbol.
 */
type AppShellState = {
  preloaderComplete: boolean;
  setPreloaderComplete: (value: boolean) => void;
};

export const useAppShellStore = create<AppShellState>((set) => ({
  preloaderComplete: false,
  setPreloaderComplete: (value) => set({ preloaderComplete: value }),
}));
