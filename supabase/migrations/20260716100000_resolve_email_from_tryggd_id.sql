-- Returns the auth email for a given Tryggd ID (username).
-- SECURITY DEFINER so it can access auth.users without requiring the caller to be authenticated.
-- Callable via anon key from the login screen before authentication.

CREATE OR REPLACE FUNCTION public.resolve_email_from_tryggd_id(p_tryggd_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT u.email INTO v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(p.username) = lower(trim(p_tryggd_id))
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- Allow anon and authenticated roles to call this function
GRANT EXECUTE ON FUNCTION public.resolve_email_from_tryggd_id(text) TO anon, authenticated;
