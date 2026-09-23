CREATE TABLE public.order_management_users (
  email TEXT PRIMARY KEY,
  uuid UUID NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_management_users ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_management_users_enabled ON public.order_management_users (enabled);

