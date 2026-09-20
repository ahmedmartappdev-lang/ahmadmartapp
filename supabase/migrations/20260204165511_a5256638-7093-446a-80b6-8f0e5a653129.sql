-- Create function to generate 4-digit OTP for delivery
CREATE OR REPLACE FUNCTION public.generate_delivery_otp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Generate OTP only when status changes to 'out_for_delivery'
  IF NEW.status = 'out_for_delivery' AND (OLD.status IS NULL OR OLD.status <> 'out_for_delivery') THEN
    NEW.delivery_otp := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
  END IF;
  
  -- Set delivered_at timestamp when order is delivered
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status <> 'delivered') THEN
    NEW.delivered_at := NOW();
  END IF;
  
  -- Set picked_up_at timestamp when order is picked up
  IF NEW.status = 'picked_up' AND (OLD.status IS NULL OR OLD.status <> 'picked_up') THEN
    NEW.picked_up_at := NOW();
  END IF;
  
  -- Set confirmed_at timestamp when order is confirmed
  IF NEW.status = 'confirmed' AND (OLD.status IS NULL OR OLD.status <> 'confirmed') THEN
    NEW.confirmed_at := NOW();
  END IF;
  
  -- Set preparing_at timestamp when order starts preparing
  IF NEW.status = 'preparing' AND (OLD.status IS NULL OR OLD.status <> 'preparing') THEN
    NEW.preparing_at := NOW();
  END IF;
  
  -- Set cancelled_at timestamp when order is cancelled
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    NEW.cancelled_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for OTP generation and timestamp updates
DROP TRIGGER IF EXISTS trigger_order_status_updates ON public.orders;
CREATE TRIGGER trigger_order_status_updates
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_delivery_otp();