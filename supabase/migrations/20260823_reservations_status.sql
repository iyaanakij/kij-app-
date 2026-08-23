-- 経営KPIダッシュボード向けにキャンセル数を集計できるようにするため、
-- reservationsにstatus列を追加する。
-- 従来はCS3同期側(app/scripts/cs3-sync-daemon.js parseReservations())が
-- CS3側でキャンセル済みの行を保存前に丸ごと除外していたため、キャンセルの履歴が一切残っていなかった。
-- 今後はキャンセル行も status='cancelled' として保存し、通常予約と区別できるようにする。
-- 既存行はすべて確定予約（過去にキャンセル分は保存されていないため）なのでdefault 'confirmed'。
alter table reservations
  add column status text not null default 'confirmed';

create index reservations_status_idx on reservations (status);
