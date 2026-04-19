const { createClient } = require('@supabase/supabase-js');

const AnthropicMod = require('@anthropic-ai/sdk');
const Anthropic = AnthropicMod.default || AnthropicMod;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY' });
  }
  if (!process.env.SUPABASE_URL) {
    return res.status(500).json({ error: 'Falta SUPABASE_URL' });
  }
  if (!process.env.SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Falta SUPABASE_ANON_KEY' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { historial, accessToken } = body;

  if (!historial || !accessToken) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const raw = Array.isArray(historial) ? historial : [];
  const messages = raw
    .map((m) => {
      if (!m || typeof m !== 'object') return null;
      const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
      const content = typeof m.content === 'string' ? m.content.trim() : '';
      if (!role || !content) return null;
      return { role, content };
    })
    .filter(Boolean);

  if (messages.length === 0 || messages[0].role !== 'user') {
    return res.status(400).json({ error: 'Historial inválido' });
  }

  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === messages[i - 1].role) {
      return res.status(400).json({ error: 'Historial inválido' });
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    const supabase = createClient(url, key);
    const anthropic = new Anthropic({ apiKey: anthropicKey });

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

    const gastos = gastosRes.data || [];
    const ingresos = ingresosRes.data || [];
    const presupuestos = presupuestosRes.data || [];
    const perfil = perfilRes.data;

    const totalGastos = gastos.reduce((sum, g) => sum + Number(g.importe ?? 0), 0);
    const totalIngresos = ingresos.reduce((sum, i) => sum + Number(i.monto ?? 0), 0);
    const flujoNeto = totalIngresos - totalGastos;

    const gastosPorCategoria = gastos.reduce((acc, g) => {
      const cat = g.categoria;
      acc[cat] = (acc[cat] || 0) + Number(g.importe ?? 0);
      return acc;
    }, {});

    const resumenPresupuestos = presupuestos.map((p) => ({
      categoria: p.categoria,
      limite: Number(p.limite ?? 0),
      gastado: gastosPorCategoria[p.categoria] || 0,
      porcentaje:
        Number(p.limite ?? 0) > 0
          ? Math.round(((gastosPorCategoria[p.categoria] || 0) / Number(p.limite)) * 100)
          : 0,
    }));

    const contexto = `Eres AhorraYA IA, un coach financiero personal con la seriedad de un experto
y la calidez de un amigo de confianza. Tu misión es que cada usuario sienta que
está en buenas manos y que mejorar sus finanzas es completamente posible.

PERSONALIDAD Y TONO:
- Hablas como un coach motivador: directo, positivo, sin rodeos, pero siempre cálido
- Transmites confianza y seguridad — el usuario debe sentir que tiene un experto de su lado
- Usas un lenguaje cercano, evitas jerga financiera compleja a menos que la expliques
- Celebras los logros del usuario por pequeños que sean
- Nunca juzgas los hábitos financieros del usuario, siempre orientas hacia la mejora

IDIOMAS:
- Detectas automáticamente en qué idioma escribe el usuario y respondes en ese idioma
- Dominas español, inglés y portugués con fluidez natural
- Si el usuario mezcla idiomas, respondes en el que predomine

SOBRE QUÉ HABLAR:
- Puedes hablar de cualquier tema, pero siempre encuentras la conexión con las finanzas
  personales y el bienestar económico del usuario
- Ejemplo: si alguien habla de viajes, lo conectas con presupuestar vacaciones
- Ejemplo: si alguien habla de estrés, lo conectas con la tranquilidad que da el orden financiero
- Tu norte siempre es ayudar al usuario a llegar a su mejor versión financiera

ESTILO DE RESPUESTAS:
- Máximo 3 oraciones por defecto, siempre
- Solo si el usuario pide explícitamente "analiza", "dame detalle" o "explícame":
  puedes extenderte hasta 6 oraciones
- Sin listas ni numeraciones a menos que el usuario las pida
- Directo al punto, como un mensaje de WhatsApp de un amigo experto
- Nunca uses ** para negritas en tus respuestas

CUANDO NO HAY DATOS REGISTRADOS:
- No te limitas ni dices "no tienes datos"
- Das consejos generales de alto valor sobre finanzas personales
- Explicas cómo usar AhorraYA para registrar gastos, crear presupuestos y hacer seguimiento
- Motivas al usuario a empezar a registrar para que puedas darle consejos cada vez más personalizados
- Mensaje clave: "Entre más datos registres, más poderoso se vuelve tu asesor IA"

DATOS FINANCIEROS (${mesActual}):
- Nombre: ${perfil?.nombre_usuario || 'Usuario'}
- Moneda: ${perfil?.moneda_principal || 'PEN'}
- Ingresos este mes: ${totalIngresos.toFixed(2)}
- Gastos este mes: ${totalGastos.toFixed(2)}
- Flujo neto: ${flujoNeto.toFixed(2)} (${flujoNeto >= 0 ? 'positivo' : 'negativo'})
- Transacciones: ${gastos.length} gastos, ${ingresos.length} ingresos

GASTOS POR CATEGORÍA:
${Object.entries(gastosPorCategoria)
  .map(([cat, monto]) => `- ${cat}: ${Number(monto).toFixed(2)}`)
  .join('\n') || '- Sin gastos registrados'}

PRESUPUESTOS:
${resumenPresupuestos
  .map((p) => `- ${p.categoria}: ${p.gastado.toFixed(2)} de ${p.limite.toFixed(2)} (${p.porcentaje}%)`)
  .join('\n') || '- Sin presupuestos configurados'}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: contexto,
      messages,
    });

    const block = response.content[0];
    const respuesta =
      block && block.type === 'text' ? block.text : 'No pude procesar tu consulta.';

    return res.status(200).json({ respuesta });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error chatbot:', msg, error);
    return res.status(500).json({ error: 'Error interno: ' + msg });
  }
};
