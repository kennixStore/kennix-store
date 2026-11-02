-- KENNIX: atomic payment confirmation and stock deduction.
CREATE OR REPLACE FUNCTION public.confirm_kennix_paid_order(
  p_order_id BIGINT,
  p_payment_reference TEXT,
  p_amount_kobo BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true);
  END IF;

  IF v_order.payment_reference IS DISTINCT FROM p_payment_reference THEN
    RAISE EXCEPTION 'Payment reference mismatch';
  END IF;

  IF ROUND(v_order.total_amount * 100)::BIGINT <> p_amount_kobo THEN
    RAISE EXCEPTION 'Payment amount mismatch';
  END IF;

  FOR v_item IN
    SELECT variant_id, quantity FROM public.order_items
    WHERE order_id = p_order_id AND variant_id IS NOT NULL
  LOOP
    UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.variant_id
        AND stock_quantity >= v_item.quantity
        AND is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for an item'; END IF;
  END LOOP;

  UPDATE public.orders
    SET payment_status = 'paid',
        status = 'Pending',
        paid_at = NOW()
    WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'already_paid', false);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_kennix_paid_order(BIGINT,TEXT,BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_kennix_paid_order(BIGINT,TEXT,BIGINT) TO service_role;
