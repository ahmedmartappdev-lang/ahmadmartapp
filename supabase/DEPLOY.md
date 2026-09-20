# Supabase deploy checklist

Add Vendor / Add Admin / Add Agent / Add Customer all rely on backend
artifacts that this repo ships in `supabase/` but Supabase does **not**
auto-pick up. Whenever any of those buttons stop working, the cause is
almost always that the artifact below was added in code but never deployed.

## One-time setup

```bash
# 1. Link the local project to your remote Supabase project
supabase link --project-ref <your-project-ref>
```

## Each release

```bash
# 1. Push every SQL migration in supabase/migrations to the linked project
supabase db push

# 2. Deploy edge functions (one per directory under supabase/functions)
supabase functions deploy admin-create-customer
supabase functions deploy create-razorpay-order
supabase functions deploy pay-credit-dues
supabase functions deploy pay-existing-order
supabase functions deploy razorpay-webhook
supabase functions deploy send-otp
supabase functions deploy verify-credit-payment
supabase functions deploy verify-otp
supabase functions deploy verify-razorpay-payment
```

## Which artifact backs which button

| UI button                         | Backed by                                                      |
|-----------------------------------|----------------------------------------------------------------|
| Admin → Vendors → Add Vendor      | RPC `admin_create_vendor` (migrations)                         |
| Admin → Team → Add Admin          | RPC `admin_create_admin` (migrations)                          |
| Admin → Delivery → Add Partner    | RPC `admin_create_delivery_partner` (migrations)               |
| Admin → Orders → Create Order → New customer | Edge function `admin-create-customer`               |
| Delivery → Active → Confirm OTP   | RPC `delivery_complete_order_with_credit` (migrations, 2026-05-18) |

If a button gives a toast like "RPC … not found" or "Edge function … not
deployed", run the commands above against the live project.
