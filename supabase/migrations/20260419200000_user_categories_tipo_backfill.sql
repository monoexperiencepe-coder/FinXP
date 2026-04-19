-- Asegurar columna tipo y normalizar filas con tipo vacío (Supabase SQL editor / migraciones)
ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'gasto';

UPDATE user_categories SET tipo = 'gasto' WHERE tipo IS NULL OR tipo = '';
