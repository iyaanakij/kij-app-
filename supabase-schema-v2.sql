-- ① ユーザーロール管理（auth.usersとstaffを紐付け）
create table user_roles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('staff', 'cast')),
  staff_id integer references staff(id) on delete set null,
  created_at timestamptz default now()
);

-- ② シフト申請テーブル
create table shift_requests (
  id serial primary key,
  staff_id integer references staff(id) on delete cascade not null,
  store_id integer references stores(id) on delete cascade not null,
  date date not null,
  start_time numeric(4,1) not null,
  end_time numeric(4,1) not null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  reject_reason text,
  created_at timestamptz default now()
);

-- ③ RLS有効化
alter table user_roles enable row level security;
alter table shift_requests enable row level security;

-- user_roles: 自分のロールのみ参照可能
create policy "users_read_own_role" on user_roles
  for select using (auth.uid() = id);

-- shift_requests: キャストは自分の申請のみ操作可
create policy "cast_manage_own_requests" on shift_requests
  for all using (
    staff_id = (select staff_id from user_roles where id = auth.uid() and role = 'cast')
  );

-- shift_requests: スタッフは全件操作可
create policy "staff_manage_all_requests" on shift_requests
  for all using (
    exists (select 1 from user_roles where id = auth.uid() and role = 'staff')
  );

-- ④ リアルタイム有効化
alter publication supabase_realtime add table shift_requests;

-- ※ Supabaseダッシュボードで以下を設定してください:
-- Authentication > Settings > "Confirm email" → OFF（メール確認なし）
