-- Agregar columna tipo a user_categories para diferenciar gastos e ingresos
ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'gasto';

-- Las categorías existentes sin tipo quedan como 'gasto'
UPDATE user_categories SET tipo = 'gasto' WHERE tipo IS NULL;
