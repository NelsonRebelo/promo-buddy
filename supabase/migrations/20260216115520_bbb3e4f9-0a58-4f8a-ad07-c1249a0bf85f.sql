
-- Sessions table for storing OAuth tokens server-side
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  base_url TEXT NOT NULL,
  token_acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow only edge functions (service role) to access
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- No public RLS policies - only service_role can access this table
-- This ensures tokens are never accessible from the frontend

-- Index for quick session lookups
CREATE INDEX idx_sessions_session_id ON public.sessions (session_id);

-- Auto-cleanup expired sessions (older than 24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sessions WHERE token_expires_at < now() - interval '1 hour';
END;
$$;
