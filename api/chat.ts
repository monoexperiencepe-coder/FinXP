import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { historial, accessToken } = req.body as {
    historial?: unknown;
    accessToken?: string;
  };

  if (!accessToken) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const raw = Array.isArray(historial) ? historial : [];
  const messages = raw
    .map((m) => {
      if (!m || typeof m !== 'object') return null;
      const o = m as { role?: unknown; content?: unknown };
      const role = o.role === 'user' || o.role === 'assistant' ? o.role : null;
      const content = typeof o.content === 'string' ? o.content.trim() : '';
      if (!role || !content) return null;
      return { role, content };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => m !== null);

  if (messages.length === 0 || messages[0].role !== 'user') {
    return res.status(400).json({ error: 'Historial inválido' });
  }

  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) {
      return res.status(400).json({ error: 'Historial inválido' });
    }
  }

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return res.status(401).json({ error: 'No autorizado' });

    const userId = user.id;
    const mesActual = new Date().toISOString().slice(0, 7);

    const [gastosRes, ingresosRes, presupuestosRes, perfilRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('user_id', userId).eq('mes', mesActual),
      supabase.from('incomes').select('*').eq('user_id', userId).eq('mes', mesActual),
      supabase.from('budgets').select('*').eq('user_id', userId).eq('mes', mesActual),
      supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
    ]);

    const gastos = gastosRes.data ?? [];
    const ingresos = ingresosRes.data ?? [];
    const presupuestos = presupuestosRes.data ?? [];
    const perfil = perfilRes.data;

    const totalGastos = gastos.reduce((sum: number, g: { importe?: number | string | null }) => {
      return sum + Number(g.importe ?? 0);
    }, 0);
    const totalIngresos = ingresos.reduce((sum: number, i: { monto?: number | string | null }) => {
      return sum + Number(i.monto ?? 0);
    }, 0);
    const flujoNeto = totalIngresos - totalGastos;

    const gastosPorCategoria = gastos.reduce(
      (acc: Record<string, number>, g: { categoria: string; importe?: number | string | null }) => {
        const cat = g.categoria;
        acc[cat] = (acc[cat] ?? 0) + Number(g.importe ?? 0);
        return acc;
      },
      {},
    );

    const resumenPresupuestos = presupuestos.map((p: { categoria: string; limite?: number | string | null }) => ({
      categoria: p.categoria,
      limite: Number(p.limite ?? 0),
      gastado: gastosPorCategoria[p.categoria] ?? 0,
      porcentaje:
        Number(p.limite ?? 0) > 0
          ? Math.round(((gastosPorCategoria[p.categoria] ?? 0) / Number(p.limite)) * 100)
          : 0,
    }));

    const contexto = `Eres un asesor financiero personal amigable y directo llamado "AhorraYA IA". 
Hablas en español, usas un tono cercano y motivador. Eres conciso (máximo 3 párrafos).
Das consejos prácticos y personalizados basados en los datos reales del usuario.
Nunca inventas datos — solo usas los que se te proporcionan.

DATOS FINANCIEROS DEL USUARIO (${mesActual}):
- Nombre: ${perfil?.nombre_usuario || 'Usuario'}
- Moneda: ${perfil?.moneda_principal || 'PEN'}
- Total ingresos este mes: ${totalIngresos.toFixed(2)}
- Total gastos este mes: ${totalGastos.toFixed(2)}
- Flujo neto: ${flujoNeto.toFixed(2)} (${flujoNeto >= 0 ? 'positivo' : 'negativo'})
- Número de transacciones: ${gastos.length} gastos, ${ingresos.length} ingresos

GASTOS POR CATEGORÍA:
${
  Object.entries(gastosPorCategoria)
    .map(([cat, monto]) => `- ${cat}: ${Number(monto).toFixed(2)}`)
    .join('\n') || '- Sin gastos registrados'
}

PRESUPUESTOS:
${
  resumenPresupuestos
    .map(
      (p: { categoria: string; gastado: number; limite: number; porcentaje: number }) =>
        `- ${p.categoria}: gastado ${p.gastado.toFixed(2)} de ${p.limite.toFixed(2)} (${p.porcentaje}%)`,
    )
    .join('\n') || '- Sin presupuestos configurados'
}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: contexto,
      messages,
    });

    const block = response.content[0];
    const respuesta = block?.type === 'text' ? block.text : 'No pude procesar tu consulta.';

    return res.status(200).json({ respuesta });
  } catch (error: unknown) {
    console.error('Error en chatbot:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
