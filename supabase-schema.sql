-- 店舗
create table stores (
  id serial primary key,
  name text not null
);
insert into stores (name) values ('成田'), ('千葉'), ('西船橋'), ('錦糸町');

-- スタッフ
create table staff (
  id serial primary key,
  name text not null,
  join_date date,
  notes text,
  created_at timestamptz default now()
);

-- スタッフと店舗の関係（掛け持ち対応）
create table staff_stores (
  staff_id integer references staff(id) on delete cascade,
  store_id integer references stores(id) on delete cascade,
  primary key (staff_id, store_id)
);

-- シフト（月次）
create table shifts (
  id serial primary key,
  staff_id integer references staff(id) on delete cascade,
  store_id integer references stores(id) on delete cascade,
  date date not null,
  start_time numeric(4,1) not null, -- e.g. 14.0 for 14:00, 29.0 for next day 5am
  end_time numeric(4,1) not null,
  status text default 'normal', -- normal, x (day off)
  notes text,
  created_at timestamptz default now()
);

-- 予約
create table reservations (
  id serial primary key,
  store_id integer references stores(id) on delete cascade,
  date date not null,
  section text, -- E or M
  row_number integer,
  time integer, -- HHMM format e.g. 1700
  customer_name text,
  phone text,
  confirmed boolean default false,
  communicated boolean default false,
  area text,
  hotel text,
  room_number text,
  category text,
  staff_id integer references staff(id),
  nomination_type text, -- 本 or 写
  course_duration integer, -- minutes
  nude boolean default false,
  option1 text,
  option2 text,
  option3 text,
  membership_fee integer default 0,
  transportation_fee integer default 0,
  extension integer default 0,
  discount integer default 0,
  total_amount integer default 0,
  checkout_time integer, -- HHMM
  notes text,
  media text,
  checked boolean default false,
  created_at timestamptz default now()
);

-- Enable realtime
alter publication supabase_realtime add table shifts;
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table staff;
