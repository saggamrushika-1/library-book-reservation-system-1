-- Run once in Supabase SQL Editor. The server uses a private service role key.
create extension if not exists pgcrypto;
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  author text not null check (length(trim(author)) between 1 and 150),
  isbn text unique,
  category text not null default 'General',
  total_copies integer not null default 1 check (total_copies > 0),
  available_copies integer not null default 1 check (available_copies >= 0 and available_copies <= total_copies),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  borrower_name text not null check (length(trim(borrower_name)) between 2 and 100),
  borrower_email text not null check (length(trim(borrower_email)) <= 254),
  status text not null default 'requested' check (status in ('requested','issued','returned','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists books_search_idx on public.books using gin (to_tsvector('english', title || ' ' || author || ' ' || category));
create index if not exists reservations_book_status_idx on public.reservations(book_id, status);
create index if not exists reservations_email_idx on public.reservations(lower(borrower_email));
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists books_updated_at on public.books;
create trigger books_updated_at before update on public.books for each row execute function public.set_updated_at();
drop trigger if exists reservations_updated_at on public.reservations;
create trigger reservations_updated_at before update on public.reservations for each row execute function public.set_updated_at();
-- All access is through the Express server's service key; clients must never connect directly.
alter table public.books enable row level security;
alter table public.reservations enable row level security;
-- No anon policies are intentionally created. The server validates each request.
insert into public.books(title,author,isbn,category,total_copies,available_copies)
values ('The Hobbit','J. R. R. Tolkien','9780547928227','Fantasy',3,3),('A Brief History of Time','Stephen Hawking','9780553380163','Science',2,2),('The Blue Umbrella','Ruskin Bond','9788171673407','Fiction',4,4)
on conflict (isbn) do nothing;
