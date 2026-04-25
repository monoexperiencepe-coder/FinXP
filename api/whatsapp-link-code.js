/**
 * Genera un código de 6 dígitos para vincular WhatsApp (whatsapp_link_codes) y devuelve wa.me.
 * POST: accessToken en body o Authorization: Bearer.
 * Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, WHATSAPP_BOT_NUMBER
 * No toca api/chat.js.
 */

const { createClient } = require('@supabase/supabase-js');

function getBearerFromRequest(req) {
  const h = req.headers?.authorization;
  if (typeof h === 'string' && h.toLowerCase().startsWith('bearer ')) {
    return h.slice(7).trim() || null;
  }
  return null;
}

function parseJsonBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body;
  return {};
}

function randomSixDigitCode() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('[whatsapp-link-code] faltan SUPABASE_URL, SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Configuración del servidor incompleta' });
  }

  const body = parseJsonBody(req);
  const accessToken = body.accessToken || body.access_token || getBearerFromRequest(req);
  if (!accessToken) {
    return res.status(401).json({ error: 'Falta token' });
  }

  const supabaseAnon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAnon.auth.getUser(accessToken);
  if (authError || !user) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const rawBot = process.env.WHATSAPP_BOT_NUMBER;
  if (rawBot == null || String(rawBot).replace(/\D/g, '').length < 8) {
    console.error('[whatsapp-link-code] WHATSAPP_BOT_NUMBER inválido o vacío');
    return res.status(500).json({ error: 'Configuración de WhatsApp incompleta' });
  }
  const waDigits = String(rawBot).replace(/\D/g, '');

  const supabaseService = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { error: delErr } = await supabaseService
    .from('whatsapp_link_codes')
    .delete()
    .eq('user_id', user.id)
    .is('used_at', null);
  if (delErr) {
    console.error('[whatsapp-link-code] delete prev', delErr);
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let code = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const c = randomSixDigitCode();
    const { error: insErr } = await supabaseService.from('whatsapp_link_codes').insert({
      user_id: user.id,
      code: c,
      expires_at: expiresAt,
      used_at: null,
    });
    if (!insErr) {
      code = c;
      break;
    }
    if (insErr.code === '23505' || (insErr.message && insErr.message.includes('duplicate'))) {
      continue;
    }
    console.error('[whatsapp-link-code] insert', insErr);
    return res.status(500).json({ error: 'No se pudo crear el código' });
  }

  if (!code) {
    return res.status(500).json({ error: 'No se pudo generar un código único' });
  }

  const whatsappUrl = `https://wa.me/${waDigits}?text=${encodeURIComponent(`VINCULAR ${code}`)}`;

  return res.status(200).json({ code, whatsappUrl });
};
