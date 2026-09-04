-- LOOP A: hardening WhatsApp webhook (idempotencia + rate limits)
-- NO aplicar automáticamente a producción — revisar y aplicar manualmente.

-- Eventos de webhook procesados (idempotency key = message_id de Meta)
create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  wa_id text,
  event_type text not null default 'message',
  status text not null default 'processing',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint whatsapp_webhook_events_message_id_key unique (message_id),
  constraint whatsapp_webhook_events_status_check check (
    status in ('processing', 'processed', 'failed')
  )
);

create index if not exists whatsapp_webhook_events_wa_id_idx
  on public.whatsapp_webhook_events (wa_id);

create index if not exists whatsapp_webhook_events_status_idx
  on public.whatsapp_webhook_events (status);

alter table public.whatsapp_webhook_events enable row level security;

-- Buckets de rate limit por wa_id + acción + ventana de 10 min
create table if not exists public.whatsapp_rate_limits (
  wa_id text not null,
  action text not null,
  window_key text not null,
  attempt_count int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (wa_id, action, window_key)
);

alter table public.whatsapp_rate_limits enable row level security;

-- Solo service role (sin políticas para authenticated)
