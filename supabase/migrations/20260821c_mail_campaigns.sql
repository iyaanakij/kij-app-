-- CS3顧客データを対象にしたリピーター向けメルマガ配信基盤。
-- 管理画面/API/VPS worker は service_role_key を使うため、RLS有効化のみで
-- anon/authenticated からの直接操作は許可しない。

create table mail_customer_directory (
  phone text primary key,
  cs3_customer_id text,
  email text,
  name text,
  customer_class text,
  media text,
  address text,
  shared_comment text,
  cs3_visit_count integer,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mail_customer_directory_email_idx
  on mail_customer_directory (email)
  where email is not null and email <> '';

create index mail_customer_directory_last_synced_idx
  on mail_customer_directory (last_synced_at desc);

alter table mail_customer_directory enable row level security;

create table customer_visit_recency (
  phone text primary key,
  last_visited_at timestamptz not null,
  visit_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_visit_recency_last_visited_idx
  on customer_visit_recency (last_visited_at desc);

alter table customer_visit_recency enable row level security;

create table mail_campaigns (
  id bigserial primary key,
  subject text not null,
  body_html text not null,
  filter_months integer not null check (filter_months between 1 and 36),
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sending', 'sent', 'failed')),
  requested_by text,
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  queued_at timestamptz,
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create index mail_campaigns_status_idx
  on mail_campaigns (status, created_at);

alter table mail_campaigns enable row level security;

create table mail_campaign_recipients (
  id bigserial primary key,
  campaign_id bigint not null references mail_campaigns(id) on delete cascade,
  phone text not null,
  email text not null,
  name text,
  token text not null unique,
  sent_at timestamptz,
  opened_at timestamptz,
  open_count integer not null default 0,
  first_clicked_at timestamptz,
  click_count integer not null default 0,
  last_error text,
  message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone)
);

create index mail_campaign_recipients_campaign_idx
  on mail_campaign_recipients (campaign_id);

create index mail_campaign_recipients_token_idx
  on mail_campaign_recipients (token);

create index mail_campaign_recipients_sent_idx
  on mail_campaign_recipients (sent_at);

alter table mail_campaign_recipients enable row level security;
