CREATE TABLE public.offer_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_session_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  cookie_header TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '12 hours')
);

ALTER TABLE public.offer_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_offer_sessions_session_id ON public.offer_sessions (offer_session_id);

CREATE OR REPLACE FUNCTION public.cleanup_expired_offer_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.offer_sessions WHERE expires_at < now();
END;
$$;
