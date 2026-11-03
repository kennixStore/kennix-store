-- KENNIX payment proof storage and order tracking
-- Run this entire script in Supabase SQL Editor.

alter table public.orders
  add column if not exists payment_proof_path text,
  add column if not exists payment_submitted_at timestamptz,
  add column if not exists payment_reviewed_at timestamptz,
  add column if not exists payment_review_note text;

-- Private bucket: customers upload through a server-side Edge Function.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

-- Only signed-in admin users can read objects to review receipts.
-- Uploads are performed by the server-side function using the service-role key.
drop policy if exists "KENNIX admins can view payment proofs" on storage.objects;
create policy "KENNIX admins can view payment proofs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-proofs'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'kennix2027@gmail.com'
);
