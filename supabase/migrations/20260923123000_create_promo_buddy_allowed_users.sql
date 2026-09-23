CREATE TABLE public.promo_buddy_allowed_users (
  email TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_buddy_allowed_users ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_promo_buddy_allowed_users_enabled ON public.promo_buddy_allowed_users (enabled);
