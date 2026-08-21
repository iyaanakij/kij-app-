-- メルマガのリンク別クリック計測。既存のmail_campaign_recipients.click_countは
-- 受信者ごとの合算のみで、1通に複数リンクがある場合にどのリンクが押されたか
-- 区別できない。クリックイベントを1行ずつ記録し、リンク単位・受信者単位どちらの
-- 集計にも使えるようにする。

create table mail_campaign_link_clicks (
  id bigserial primary key,
  campaign_id bigint not null references mail_campaigns(id) on delete cascade,
  recipient_id bigint not null references mail_campaign_recipients(id) on delete cascade,
  url text not null,
  clicked_at timestamptz not null default now()
);

create index mail_campaign_link_clicks_campaign_idx
  on mail_campaign_link_clicks (campaign_id, url);

create index mail_campaign_link_clicks_recipient_idx
  on mail_campaign_link_clicks (recipient_id);

alter table mail_campaign_link_clicks enable row level security;
-- service_role のみ操作可（他のmail_campaign_*テーブルと同方針）
