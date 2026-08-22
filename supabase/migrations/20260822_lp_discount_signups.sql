-- LP（/group/discount/）からの新規リード獲得フォーム。
-- メルマガ登録と引き換えに割引クーポンコードを即時発行する。
-- クーポンコードをキーに来店時のCS3データと突合し mail_customer_directory へ反映する
-- ロジック（Phase 2）は未実装。matched_* 列は将来用に先行追加のみ。

create table lp_discount_signups (
  id bigserial primary key,
  email text not null,
  coupon_code text not null,
  source_lp text not null default 'group_discount',
  ip_address text,
  user_agent text,
  confirmation_sent_at timestamptz,
  confirmation_error text,
  matched_phone text,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email),
  unique (coupon_code)
);

create index lp_discount_signups_created_idx
  on lp_discount_signups (created_at desc);

create index lp_discount_signups_matched_phone_idx
  on lp_discount_signups (matched_phone)
  where matched_phone is not null;

alter table lp_discount_signups enable row level security;
-- service_role のみ操作可（他のmail_campaign_*テーブルと同方針、create policyなし）
