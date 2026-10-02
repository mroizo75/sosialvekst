-- One purchase per Stripe checkout session, so the webhook and the return-page confirmation can both run safely.
create unique index if not exists video_credit_transactions_purchase_session_key
  on public.video_credit_transactions (stripe_session_id)
  where type = 'purchase' and stripe_session_id is not null;
