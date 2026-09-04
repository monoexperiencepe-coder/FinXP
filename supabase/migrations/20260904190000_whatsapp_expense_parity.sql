-- LOOP B: paridad gastos WhatsApp + idempotencia financiera + gamificación atómica
-- NO aplicar automáticamente a producción — revisar y aplicar manualmente DESPUÉS de whatsapp_hardening.

-- Claves idempotentes por mensaje Meta (multi-gasto: message_id + expense_index)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_message_id TEXT,
  ADD COLUMN IF NOT EXISTS source_expense_index INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_whatsapp_source_key
  ON public.expenses (user_id, source_message_id, source_expense_index)
  WHERE source_message_id IS NOT NULL;

COMMENT ON COLUMN public.expenses.source_message_id IS 'wamid Meta; idempotencia financiera por mensaje';
COMMENT ON COLUMN public.expenses.source_expense_index IS 'Índice 0-based dentro del mismo mensaje multi-gasto';

-- Gamificación atómica post-gasto (evita lost updates en concurrencia)
CREATE OR REPLACE FUNCTION public.apply_expense_gamification(
  p_user_id UUID,
  p_xp_gain INTEGER,
  p_expense_date_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ultimo DATE;
  v_racha INT;
  v_racha_max INT;
  v_nivel INT;
  v_xp INT;
  v_xp_next INT;
  v_today DATE;
BEGIN
  IF p_user_id IS NULL OR p_xp_gain IS NULL OR p_xp_gain <= 0 THEN
    RETURN;
  END IF;

  v_today := p_expense_date_key::DATE;

  SELECT
    CASE
      WHEN ultimo_registro IS NULL THEN NULL
      ELSE (ultimo_registro AT TIME ZONE 'America/Lima')::DATE
    END,
    COALESCE(racha_actual, 0),
    COALESCE(racha_maxima, 0),
    COALESCE(nivel, 1),
    COALESCE(xp_actual, 0),
    COALESCE(xp_para_siguiente_nivel, 500)
  INTO v_ultimo, v_racha, v_racha_max, v_nivel, v_xp, v_xp_next
  FROM user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_ultimo IS NULL THEN
    v_racha := 1;
  ELSIF v_ultimo = v_today THEN
    NULL;
  ELSIF v_ultimo = v_today - 1 THEN
    v_racha := v_racha + 1;
  ELSE
    v_racha := 1;
  END IF;

  v_racha_max := GREATEST(v_racha_max, v_racha);
  v_xp := v_xp + p_xp_gain;

  WHILE v_xp_next > 0 AND v_xp >= v_xp_next LOOP
    v_xp := v_xp - v_xp_next;
    v_nivel := v_nivel + 1;
    v_xp_next := CASE v_nivel
      WHEN 1 THEN 500
      WHEN 2 THEN 700
      WHEN 3 THEN 1300
      WHEN 4 THEN 500
      WHEN 5 THEN 2000
      ELSE 2500
    END;
  END LOOP;

  UPDATE user_profiles
  SET
    racha_actual = v_racha,
    racha_maxima = v_racha_max,
    nivel = v_nivel,
    xp_actual = v_xp,
    xp_para_siguiente_nivel = v_xp_next,
    ultimo_registro = (p_expense_date_key || 'T12:00:00')::TIMESTAMP AT TIME ZONE 'America/Lima',
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_expense_gamification(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_expense_gamification(UUID, INTEGER, TEXT) TO service_role;
