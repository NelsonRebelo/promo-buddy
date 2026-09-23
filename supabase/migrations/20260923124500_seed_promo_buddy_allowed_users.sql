INSERT INTO public.promo_buddy_allowed_users (email, enabled)
VALUES
  ('nelson.rebelo@olx.com', true),
  ('rita.galvao@olx.com', true),
  ('sandrine.correia@olx.com', true)
ON CONFLICT (email) DO UPDATE SET enabled = EXCLUDED.enabled;
