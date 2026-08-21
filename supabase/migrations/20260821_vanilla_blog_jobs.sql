-- バニラ（qzin.jp）店長ブログ 一括投稿ジョブキュー。
-- KIJ管理画面（/admin/vanilla-blog）でM版/E版それぞれ1件ずつジョブを作成し、
-- VPS側ワーカー（101-vanilla-blog-worker.js）がbrandに応じた4アカウントへ
-- ログイン→投稿予約フォーム入力→予約投稿を行う。manual_freetext_jobsと同じ規約
-- （status enum, result jsonbでアカウント別結果を保持）に揃える。
create table vanilla_blog_jobs (
  id bigserial primary key,
  brand text not null check (brand in ('M', 'E')),
  title text not null,
  body_html text not null,
  image_storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  result jsonb,           -- { by_account: { <site_id>: { ok, reason, scheduled_at } } }
  error_message text,
  requested_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vanilla_blog_jobs_status_idx on vanilla_blog_jobs (status, created_at);

alter table vanilla_blog_jobs enable row level security;
-- service_role のみ操作可（KIJ側API・VPSワーカー経由のみ。他ジョブテーブルと同方針）
