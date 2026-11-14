-- KENNIX promotions payment-confirmation safeguards
-- Apply once after the initial promotions/referrals tables exist.

-- Count coupon redemptions only when an order is marked paid.
-- Also reverse the count if a paid order is later moved out of paid status.
CREATE OR REPLACE FUNCTION public.kennix_sync_paid_order_promotions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    IF NEW.coupon_code IS NOT NULL AND NEW.coupon_code <> '' THEN
      UPDATE public.kennix_coupons
      SET usage_count = usage_count + 1
      WHERE code = NEW.coupon_code
        AND (usage_limit IS NULL OR usage_count < usage_limit);

      IF NOT FOUND THEN
        RAISE EXCEPTION 'This coupon has reached its redemption limit. Payment approval was stopped.';
      END IF;
    END IF;

    UPDATE public.kennix_referral_rewards
    SET status = 'approved'
    WHERE order_id = NEW.id AND status = 'pending';
  ELSIF OLD.payment_status = 'paid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
    IF OLD.coupon_code IS NOT NULL AND OLD.coupon_code <> '' THEN
      UPDATE public.kennix_coupons
      SET usage_count = GREATEST(0, usage_count - 1)
      WHERE code = OLD.coupon_code;
    END IF;

    UPDATE public.kennix_referral_rewards
    SET status = 'void'
    WHERE order_id = NEW.id AND status IN ('pending','approved');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kennix_sync_paid_order_promotions ON public.orders;
CREATE TRIGGER kennix_sync_paid_order_promotions
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.kennix_sync_paid_order_promotions();

-- Enforce at database level that referral rewards cannot be approved/paid
-- before the linked order has a confirmed payment.
CREATE OR REPLACE FUNCTION public.kennix_guard_referral_reward_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_payment_status TEXT;
BEGIN
  IF NEW.status IN ('approved','paid') THEN
    SELECT payment_status INTO linked_payment_status
    FROM public.orders WHERE id = NEW.order_id;

    IF linked_payment_status IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'Referral rewards can only be approved after payment is confirmed.';
    END IF;
  END IF;
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := NOW();
  ELSIF NEW.status <> 'paid' THEN
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kennix_guard_referral_reward_payment ON public.kennix_referral_rewards;
CREATE TRIGGER kennix_guard_referral_reward_payment
BEFORE INSERT OR UPDATE OF status, order_id, paid_at ON public.kennix_referral_rewards
FOR EACH ROW
EXECUTE FUNCTION public.kennix_guard_referral_reward_payment();

-- Reconcile any earlier counter increments made when orders were merely created.
UPDATE public.kennix_coupons c
SET usage_count = (
  SELECT COUNT(*)::INTEGER
  FROM public.orders o
  WHERE o.coupon_code = c.code AND o.payment_status = 'paid'
);
