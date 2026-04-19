import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

import * as db from '@/lib/database';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nombreUsuario: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    set({ session, user: session?.user ?? null, initialized: true });

    supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({ session: nextSession, user: nextSession?.user ?? null });
    });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await AsyncStorage.setItem('ahorraya_last_login', Date.now().toString());
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password, nombreUsuario) => {
    set({ loading: true });
    try {
      const nombre = nombreUsuario.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { nombre_usuario: nombre },
        },
      });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid && nombre) {
        await db.updateProfile(uid, { nombre_usuario: nombre });
      }
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null });
  },

  sendMagicLink: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
  },
}));
