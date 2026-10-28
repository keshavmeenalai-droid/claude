-- Northgate AlertGuard schema.
-- Run once in Supabase: Dashboard → SQL Editor → paste this file → Run.
-- Every table has Row Level Security on and no policies, so the public anon key
-- cannot read or write anything. The app talks to the database only from the
-- server with the service-role key.

create extension if not exists pgcrypto;

create table if not exists instruments (
  ticker           text primary key,
  yahoo_symbol     text not null,
  name             text,
  exchange         text,
  country          text,
  ccy              text not null default 'USD',
  sector           text,
  industry         text,
  theme            text,
  kind             text not null default 'stock' check (kind in ('stock', 'etf')),
  status           text not null default 'watchlist' check (status in ('held', 'pending', 'watchlist', 'alternate', 'sold')),
  shares           numeric not null default 0 check (shares >= 0),
  avg_cost         numeric check (avg_cost is null or avg_cost >= 0),
  stop_pct         numeric not null default 25 check (stop_pct > 0 and stop_pct < 100),
  stop_price       numeric check (stop_price is null or stop_price >= 0),
  target_shares    numeric,
  ref_price        numeric,
  tranche          text,
  planned_date     date,
  order_type       text,
  qvm              numeric,
  q                numeric,
  v                numeric,
  m                numeric,
  exp_return_pct   numeric,
  monthly_sd       numeric,
  next_earnings    date,
  earnings_note    text,
  thesis_breakers  text[] not null default '{}',
  why              text,
  thesis_broken    boolean not null default false,
  thesis_note      text,
  lockout_until    date,
  opened_at        date,
  last_verdict     text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists quotes (
  symbol          text primary key,
  price           numeric not null,
  prev_close      numeric,
  day_change_pct  numeric,
  ma200           numeric,
  ret_52w         numeric,
  ret_30d         numeric,
  mom12_1         numeric,
  high_52w        numeric,
  low_52w         numeric,
  currency        text not null default 'USD',
  last_date       date not null,
  month_end       jsonb,
  prev_month_end  jsonb,
  closes          jsonb not null default '[]'::jsonb,
  error           text,
  fetched_at      timestamptz not null default now()
);

create table if not exists trades (
  id               bigserial primary key,
  ticker           text not null,
  side             text not null check (side in ('BUY', 'SELL')),
  shares           numeric not null check (shares > 0),
  price            numeric not null check (price > 0),
  ccy              text not null default 'USD',
  fx_usd           numeric not null default 1,
  commission_usd   numeric not null default 0,
  realized_pnl_usd numeric,
  traded_at        date not null default current_date,
  note             text,
  source           text not null default 'manual',
  created_by       text,
  created_at       timestamptz not null default now()
);
create index if not exists trades_ticker_idx on trades (ticker, traded_at desc);

create table if not exists alerts (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  rule_key        text not null,
  dedupe_key      text not null unique,
  ticker          text,
  rule            text not null,
  severity        text not null check (severity in ('EXIT', 'RECHECK', 'NEW_TRADE', 'INFO')),
  title           text not null,
  message         text not null,
  status          text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  acknowledged_by text,
  emailed         boolean not null default false
);
create index if not exists alerts_status_idx on alerts (status, created_at desc);
create index if not exists alerts_rule_key_idx on alerts (rule_key) where status <> 'resolved';

create table if not exists team_members (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text not null unique,
  role           text,
  active         boolean not null default true,
  notify_alerts  boolean not null default true,
  notify_tasks   boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists tasks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  assignee_id      uuid references team_members (id) on delete set null,
  due_date         date,
  recurrence       text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  priority         text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status           text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  last_reminded_on date,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index if not exists tasks_assignee_idx on tasks (assignee_id, status);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists strategy_changes (
  id          bigserial primary key,
  changed_at  timestamptz not null default now(),
  param       text not null,
  old_value   text,
  new_value   text,
  reason      text not null,
  approved_by text not null
);

create table if not exists notifications (
  id         bigserial primary key,
  sent_at    timestamptz not null default now(),
  recipients text[] not null,
  subject    text not null,
  kind       text not null,
  ok         boolean not null,
  error      text
);

create table if not exists portfolio_history (
  date               date primary key,
  growth_usd         numeric not null,
  stocks_usd         numeric not null,
  etf_usd            numeric not null,
  cash_usd           numeric not null,
  unrealized_pnl_usd numeric not null
);

create table if not exists runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  trigger     text not null,
  ok          boolean,
  summary     jsonb
);

alter table instruments       enable row level security;
alter table quotes            enable row level security;
alter table trades            enable row level security;
alter table alerts            enable row level security;
alter table team_members      enable row level security;
alter table tasks             enable row level security;
alter table settings          enable row level security;
alter table strategy_changes  enable row level security;
alter table notifications     enable row level security;
alter table portfolio_history enable row level security;
alter table runs              enable row level security;
