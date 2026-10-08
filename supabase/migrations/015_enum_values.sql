-- 015: enum value must be committed before it can be used (kept in its own migration)
alter type public.payout_status add value if not exists 'processing';
