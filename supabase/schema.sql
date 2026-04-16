-- Habilitar UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabla de perfiles de usuario (extiende auth.users)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre_usuario TEXT NOT NULL DEFAULT 'Usuario',
  nivel INTEGER NOT NULL DEFAULT 1,
  xp_actual INTEGER NOT NULL DEFAULT 0,
  xp_para_siguiente_nivel INTEGER NOT NULL DEFAULT 100,
  racha_actual INTEGER NOT NULL DEFAULT 0,
  racha_maxima INTEGER NOT NULL DEFAULT 0,
  ultimo_registro TIMESTAMP WITH TIME ZONE,
  moneda_principal TEXT NOT NULL DEFAULT 'PEN',
  tipo_de_cambio DECIMAL(10,4) NOT NULL DEFAULT 3.75,
  misiones_completadas INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'dark',
  metodos_de_pago TEXT[] DEFAULT ARRAY['Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Yape', 'Plin'],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de gastos
CREATE TABLE expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  cuenta TEXT,
  medio_de_pago TEXT,
  banco TEXT,
  categoria TEXT NOT NULL DEFAULT 'Otro',
  comercio TEXT,
  es_esencial BOOLEAN DEFAULT false,
  estado_de_animo TEXT,
  moneda TEXT NOT NULL DEFAULT 'PEN',
  descripcion TEXT,
  importe DECIMAL(12,2) NOT NULL,
  mes TEXT NOT NULL, -- formato: "2024-01"
  xp_ganado INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de ingresos
CREATE TABLE incomes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  monto DECIMAL(12,2) NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'PEN',
  fuente TEXT,
  tipo TEXT,
  objetivo TEXT,
  frecuencia TEXT,
  banco TEXT,
  categoria TEXT,
  descripcion TEXT,
  mes TEXT NOT NULL,
  xp_ganado INTEGER DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de gastos fijos
CREATE TABLE fixed_expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nombre TEXT NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Servicios',
  dia_de_cobro INTEGER DEFAULT 1,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de tarjetas de crédito
CREATE TABLE credit_cards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  banco TEXT NOT NULL,
  nombre TEXT NOT NULL,
  limite DECIMAL(12,2) NOT NULL DEFAULT 0,
  saldo_usado DECIMAL(12,2) NOT NULL DEFAULT 0,
  fecha_cierre INTEGER DEFAULT 15,
  fecha_pago INTEGER DEFAULT 25,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de presupuestos
CREATE TABLE budgets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  categoria TEXT NOT NULL,
  limite DECIMAL(12,2) NOT NULL,
  mes TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, categoria, mes)
);

-- Tabla de misiones
CREATE TABLE missions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'diaria',
  meta DECIMAL(12,2),
  progreso DECIMAL(12,2) DEFAULT 0,
  completada BOOLEAN DEFAULT false,
  xp_recompensa INTEGER DEFAULT 50,
  icono TEXT DEFAULT '🎯',
  fecha_limite TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) - Cada usuario solo ve sus datos
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

-- Policies para user_profiles
CREATE POLICY "Users can view own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Policies para expenses
CREATE POLICY "Users can manage own expenses" ON expenses FOR ALL USING (auth.uid() = user_id);

-- Policies para incomes
CREATE POLICY "Users can manage own incomes" ON incomes FOR ALL USING (auth.uid() = user_id);

-- Policies para fixed_expenses
CREATE POLICY "Users can manage own fixed_expenses" ON fixed_expenses FOR ALL USING (auth.uid() = user_id);

-- Policies para credit_cards
CREATE POLICY "Users can manage own credit_cards" ON credit_cards FOR ALL USING (auth.uid() = user_id);

-- Policies para budgets
CREATE POLICY "Users can manage own budgets" ON budgets FOR ALL USING (auth.uid() = user_id);

-- Policies para missions
CREATE POLICY "Users can manage own missions" ON missions FOR ALL USING (auth.uid() = user_id);

-- Función para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, nombre_usuario)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre_usuario', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para crear perfil automáticamente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Función updated_at automático
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
