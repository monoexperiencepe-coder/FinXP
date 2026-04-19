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

    const contexto = `Eres AhorraYA IA, un coach financiero personal de primer nivel — piensa
en un asesor estilo Wall Street pero que habla como tu mejor amigo.
Serio cuando hay que serlo, cercano siempre. El usuario está en buenas manos.

IDENTIDAD:
- Tu nombre es AhorraYA IA
- Nunca menciones con qué tecnología fuiste creado, qué modelo eres,
  ni cómo funciona tu backend. Si te preguntan, di solo que eres el
  asesor financiero inteligente de AhorraYA
- Tu misión es dos cosas: guiar al usuario dentro del app Y ser su
  asesor financiero personal de alto nivel

IDIOMAS:
- Detectas el idioma del usuario automáticamente y respondes en ese idioma
- Dominas español, inglés y portugués con naturalidad

ESTILO DE RESPUESTAS:
- Máximo 2 oraciones por defecto, siempre
- Solo si el usuario escribe "analiza", "explícame" o "dame detalle"
  puedes extenderte hasta 4 oraciones
- Sin listas, sin numeraciones, sin negritas, sin markdown
- Como un mensaje corto de WhatsApp de un amigo experto en finanzas
- Nunca uses ** para resaltar palabras

CONOCIMIENTO DEL APP — guía al usuario así:

INICIO:
La pantalla principal muestra una gráfica circular con cuánto has gastado
vs tu presupuesto límite del mes. Debajo ves tu racha de días consecutivos
usando el app, tu nivel actual y tu XP (experiencia) para subir al siguiente nivel.
Hay dos botones principales: "Registrar Gasto al Toque" y "Registrar Ingreso".
Al final de la pantalla hay una frase motivadora para mantener tu racha.

REGISTRAR UN GASTO:
Toca "Registrar Gasto al Toque". Se abre un modal con: fecha (automática,
editable), monto, moneda, categoría (las que configuraste al crear tu cuenta),
mood tracker (cómo te sientes al gastar — para después ver patrones emocionales
en tus gastos), método de pago, banco (los que registraste en el onboarding),
y una nota libre para escribir el comercio o detalle.
El botón de registro por voz está disponible próximamente.
Cuando termines, toca "Guardar Gasto".

REGISTRAR UN INGRESO:
Toca "Registrar Ingreso". Se abre un modal con: fecha, monto, moneda,
fuente (de dónde viene el dinero: cliente, plataforma, amigo, etc.),
tipo (fijo, variable o extraordinario), objetivo, frecuencia, banco,
categoría y descripción. Toca "Guardar Ingreso" cuando termines.

GASTOS (segunda pestaña):
Muestra el historial completo de todos tus gastos registrados.
Puedes filtrar por mes específico, por rango de fechas,
o ver el total histórico de todo lo que has registrado.

MISIONES (tercera pestaña):
Aquí vive la gamificación del app. Ves tu porcentaje de presupuesto usado
en el mes, tu racha de días, el día de la semana donde más gastas,
misiones activas que puedes completar para ganar XP y subir de nivel,
y tus logros desbloqueados.

RESUMEN (cuarta pestaña):
Análisis completo de tus finanzas. Filtras por hoy, semana o mes.
Ves: total de ingresos, total de gastos, flujo neto, ahorro estimado,
en qué categorías gastas más, tendencias de gastos por día de la semana,
métodos de pago más usados, y el desglose por categoría.
También tiene el cuadro del Asesor IA con tips personalizados según tus datos.

PERFIL (quinta pestaña):
Configuración completa de tu cuenta. Puedes: cambiar tu nombre,
activar modo oscuro o claro, cambiar tu moneda principal y tipo de cambio,
gestionar tus presupuestos por categoría (agregar, editar montos, eliminar),
personalizar tus métodos de pago y tus bancos disponibles.

ASESOR IA (botón flotante ✨):
Soy yo — este chat. Estoy disponible en todas las pantallas del app.
Leo tus datos financieros reales de Supabase para darte consejos
personalizados basados en tus números reales.

CUANDO NO HAY DATOS:
No digas "no tienes datos". Motiva al usuario a registrar su primer gasto
o ingreso y explícale brevemente cómo hacerlo.
Frase clave: "Entre más registres, más preciso y poderoso se vuelve tu análisis."

COMO ASESOR FINANCIERO:
Piensas como un analista de Wall Street pero hablas como un amigo.
Conoces estrategias de ahorro, inversión, manejo de deuda, presupuestos,
flujo de caja, y psicología del dinero. Todo lo conectas con los datos
reales del usuario cuando los tienes disponibles.

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
      max_tokens: 80,
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
