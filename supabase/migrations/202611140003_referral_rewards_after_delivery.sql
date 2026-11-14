-- KENNIX referral rewards require BOTH confirmed payment and delivery.
-- Run once in Supabase SQL Editor after the promotions/referrals safeguards migration.

CREATE OR REPLACE FUNCTION public.kennix_sync_paid_order_promotions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Coupon usage is counted only on the transition into confirmed payment.
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
  ELSIF OLD.payment_status = 'paid' AND NEW.payment_status IS DISTINCT FROM 'paid' THEN
    IF OLD.coupon_code IS NOT NULL AND OLD.coupon_code <> '' THEN
      UPDATE public.kennix_coupons
      SET usage_count = GREATEST(0, usage_count - 1)
      WHERE code = OLD.coupon_code;
    END IF;
  END IF;

  -- Approve a referral only when payment is confirmed AND fulfilment is Delivered.
  IF NEW.payment_status = 'paid' AND NEW.status = 'Delivered' THEN
    UPDATE public.kennix_referral_rewards
    SET status = 'approved'
    WHERE order_id = NEW.id AND status = 'pending';
  ELSIF (OLD.payment_status = 'paid' AND OLD.status = 'Delivered')
        AND NOT (NEW.payment_status = 'paid' AND NEW.status = 'Delivered') THEN
    UPDATE public.kennix_referral_rewards
    SET status = 'void'
    WHERE order_id = NEW.id AND status IN ('pending','approved');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kennix_sync_paid_order_promotions ON public.orders;
CREATE TRIGGER kennix_sync_paid_order_promotions
AFTER UPDATE OF payment_status, status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.kennix_sync_paid_order_promotions();

CREATE OR REPLACE FUNCTION public.kennix_guard_referral_reward_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_payment_status TEXT;
  linked_order_status TEXT;
BEGIN
  IF NEW.status IN ('approved','paid') THEN
    SELECT payment_status, status
      INTO linked_payment_status, linked_order_status
    FROM public.orders
    WHERE id = NEW.order_id;

    IF linked_payment_status IS DISTINCT FROM 'paid'
       OR linked_order_status IS DISTINCT FROM 'Delivered' THEN
      RAISE EXCEPTION 'Referral rewards can only be approved after payment is confirmed and the order is delivered.';
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

-- Reconcile rewards already recorded in the database.
UPDATE public.kennix_referral_rewards r
SET status = CASE
  WHEN o.payment_status = 'paid' AND o.status = 'Delivered' AND r.status = 'pending' THEN 'approved'
  WHEN NOT (o.payment_status = 'paid' AND o.status = 'Delivered') AND r.status = 'approved' THEN 'pending'
  ELSE r.status
END
FROM public.orders o
WHERE o.id = r.order_id
  AND r.status IN ('pending','approved');
