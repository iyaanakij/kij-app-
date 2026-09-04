-- /shift ページでスタッフを手動非表示にする機能用（2026-09-04追加）。
-- 日付の非表示（クライアント側localStorage、月・エリア単位でスコープ）とは異なり、
-- こちらは「月を跨いでも状態が保持される」「該当スタッフのシフトが新規に入る(status='normal')と
-- 自動的に再表示される」という要件のため、staffテーブルにフラグを持たせサーバー側で管理する。
-- 全店舗共通の1フラグ（特定店舗だけ非表示にする機能ではない）。
alter table staff add column if not exists hidden boolean not null default false;

-- shiftsへの書き込みは本アプリのクライアント操作だけでなく、
-- VPS上のCS3同期スクリプト（shift-sync）からも直接行われるため、
-- 特定の書き込み経路に依存しないようDBトリガーで統一的に「シフトが来たら自動再表示」を実現する。
create or replace function unhide_staff_on_normal_shift()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'normal' then
    update staff set hidden = false where id = new.staff_id and hidden = true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_unhide_staff_on_normal_shift on shifts;
create trigger trg_unhide_staff_on_normal_shift
  after insert or update of staff_id, status on shifts
  for each row
  execute function unhide_staff_on_normal_shift();
