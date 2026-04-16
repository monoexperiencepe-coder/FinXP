/** Categorías de gasto fijas (emoji + nombre). `id` estable para persistencia. */
export const EXPENSE_CATEGORIES = [
  { id: 'comida-restaurantes', name: 'Comida y restaurantes', emoji: '🍔' },
  { id: 'supermercado', name: 'Supermercado', emoji: '🛒' },
  { id: 'movilidad', name: 'Movilidad', emoji: '🚌' },
  { id: 'suscripciones', name: 'Suscripciones', emoji: '📱' },
  { id: 'ropa-calzado', name: 'Ropa y calzado', emoji: '👕' },
  { id: 'medicina', name: 'Medicina', emoji: '💊' },
  { id: 'servicios-hogar', name: 'Servicios del hogar', emoji: '🏠' },
  { id: 'accesorios-tecnologia', name: 'Accesorios y tecnología', emoji: '💻' },
  { id: 'bares-discotecas', name: 'Bares y discotecas', emoji: '🍻' },
  { id: 'cuidado-personal', name: 'Cuidado personal', emoji: '💈' },
  { id: 'chatarra-golosinas', name: 'Chatarra y golosinas', emoji: '🍬' },
  { id: 'delivery', name: 'Delivery', emoji: '🛵' },
  { id: 'inversiones', name: 'Inversiones', emoji: '📈' },
  { id: 'educacion', name: 'Educación', emoji: '📚' },
  { id: 'otros', name: 'Otros', emoji: '📦' },
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]['id'];

export function getExpenseCategoryById(id: string) {
  return EXPENSE_CATEGORIES.find((c) => c.id === id);
}
