-- Fase 2: vínculo WhatsApp ↔ usuario (webhook con service role) + códigos de un solo uso
-- Aplicar en Supabase: SQL editor o `supabase db push`

-- Tabla: vínculo final (un wa_id = un solo usuario; un usuario = un solo wa_id)
create table if not exists public.whatsapp_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wa_id text not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz not null default now(),
  constraint whatsapp_links_wa_id_key unique (wa_id),
  constraint whatsapp_links_user_id_key unique (user_id)
);

-- Tabla: códigos one-shot para "VINCULAR {code}"
create table if not exists public.whatsapp_link_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_link_codes_code_key unique (code)
);

create index if not exists whatsapp_link_codes_user_id_idx on public.whatsapp_link_codes (user_id);

-- RLS: por defecto solo el service role (sin políticas) bypass; si en el futuro
-- insertás códigos desde el cliente, añadí p.ej. insert para authenticated.
alter table public.whatsapp_links enable row level security;
alter table public.whatsapp_link_codes enable row level security;
