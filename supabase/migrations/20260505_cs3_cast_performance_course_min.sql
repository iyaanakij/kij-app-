alter table cs3_cast_performance add column if not exists m_hon_course_min     int not null default 0;
alter table cs3_cast_performance add column if not exists e_hon_course_min     int not null default 0;
-- Legacy column names. Current meaning is "写メ＋フリー（非本指名）コース総時間".
alter table cs3_cast_performance add column if not exists m_shashin_course_min int not null default 0;
alter table cs3_cast_performance add column if not exists e_shashin_course_min int not null default 0;
