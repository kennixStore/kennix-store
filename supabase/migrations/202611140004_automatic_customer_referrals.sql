-- KENNIX automatic customer referral codes.
-- Run this migration once in Supabase SQL Editor before using customer referrals.

ALTER TABLE public.kennix_referral_rewards
  ADD COLUMN IF NOT EXISTS referred_phone TEXT;

-- A referred phone can only earn one referral credit for the same code.
CREATE UNIQUE INDEX IF NOT EXISTS kennix_referral_one_credit_per_person
  ON public.kennix_referral_rewards (referral_code, referred_phone)
  WHERE referred_phone IS NOT NULL;

-- Private mapping: normalized phone -> one permanent personal referral code.
CREATE TABLE IF NOT EXISTS public.kennix_customer_referral_profiles (
  phone_key TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL UNIQUE
    REFERENCES public.kennix_referral_codes(code) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kennix_customer_referral_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kennix_customer_referral_profiles FROM anon, authenticated;
GRANT ALL ON public.kennix_customer_referral_profiles TO service_role;

-- Admin-created and customer-generated codes both use the same table.
-- Standard customer reward is ₦300 per unique referred customer (5 = ₦1,500).
ALTER TABLE public.kennix_referral_codes
  ALTER COLUMN reward_amount SET DEFAULT 300;
UPDATE public.kennix_referral_codes
SET reward_amount = 300
WHERE reward_amount IS DISTINCT FROM 300;

CREATE OR REPLACE FUNCTION public.kennix_get_or_create_customer_referral(
  p_phone_key TEXT,
  p_referrer_name TEXT DEFAULT NULL
)
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
  IF p_phone_key IS NULL OR p_phone_key !~ '^234[789][01][0-9]{8}$' THEN
    RAISE EXCEPTION 'A valid normalized Nigerian phone number is required.';
  END IF;

  -- Serialize concurrent first orders for the same customer phone.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_phone_key, 9142026));

  SELECT referral_code INTO existing_code
  FROM public.kennix_customer_referral_profiles
  WHERE phone_key = p_phone_key;

  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;

  LOOP
    new_code := 'KX' || upper(substr(md5(random()::text || clock_timestamp()::text || p_phone_key), 1, 8));
    INSERT INTO public.kennix_referral_codes
      (code, referrer_name, referrer_phone, reward_amount, is_active)
    VALUES
      (new_code, NULLIF(left(coalesce(p_referrer_name, ''), 120), ''),
       p_phone_key, 300, TRUE)
    ON CONFLICT (code) DO NOTHING;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    EXIT WHEN inserted_count = 1;
  END LOOP;

  INSERT INTO public.kennix_customer_referral_profiles (phone_key, referral_code)
  VALUES (p_phone_key, new_code);

  RETURN new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.kennix_get_or_create_customer_referral(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kennix_get_or_create_customer_referral(TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.kennix_customer_referral_profiles IS
  'Private server-only mapping that ensures each normalized customer phone keeps one permanent KENNIX referral code.';
COMMENT ON COLUMN public.kennix_referral_rewards.referred_phone IS
  'Normalized Nigerian phone of the referred customer; used to prevent duplicate referral credits.';
