-- KENNIX visitor-first referral codes.
-- A visitor receives one code on their first site visit; no purchase or account is required.

CREATE TABLE IF NOT EXISTS public.kennix_visitor_referral_profiles (
  visitor_id UUID PRIMARY KEY,
  referral_code TEXT NOT NULL UNIQUE
    REFERENCES public.kennix_referral_codes(code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kennix_visitor_referral_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kennix_visitor_referral_profiles FROM anon, authenticated;
GRANT ALL ON public.kennix_visitor_referral_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.kennix_get_or_create_visitor_referral(p_visitor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_code TEXT;
  new_code TEXT;
  inserted_count INTEGER;
BEGIN
  IF p_visitor_id IS NULL THEN
    RAISE EXCEPTION 'A visitor identifier is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_visitor_id::TEXT, 9142027));

  SELECT referral_code INTO existing_code
  FROM public.kennix_visitor_referral_profiles
  WHERE visitor_id = p_visitor_id;

  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;

  LOOP
    new_code := 'KX' || upper(substr(md5(random()::TEXT || clock_timestamp()::TEXT || p_visitor_id::TEXT), 1, 8));
    INSERT INTO public.kennix_referral_codes
      (code, referrer_name, referrer_phone, reward_amount, is_active)
    VALUES
      (new_code, 'KENNIX customer', NULL, 300, TRUE)
    ON CONFLICT (code) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    EXIT WHEN inserted_count = 1;
  END LOOP;

  INSERT INTO public.kennix_visitor_referral_profiles (visitor_id, referral_code)
  VALUES (p_visitor_id, new_code);

  RETURN new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.kennix_get_or_create_visitor_referral(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kennix_get_or_create_visitor_referral(UUID) TO service_role;

COMMENT ON TABLE public.kennix_visitor_referral_profiles IS
  'Private server-only mapping that gives each KENNIX website visitor one persistent referral code per browser.';
