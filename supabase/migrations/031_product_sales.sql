-- Price per product and one order contact per business, so product posts can close the sale.

alter table public.products
  add column if not exists price numeric(12, 2) check (price is null or price >= 0),
  add column if not exists sale_price numeric(12, 2) check (sale_price is null or sale_price >= 0);

alter table public.workspaces
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists contact_messenger boolean not null default true;
