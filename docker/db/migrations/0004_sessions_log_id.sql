-- 既存の行にも値が入るよう、デフォルト値を付けて列を追加する。以降の行には、アプリが値を振る。
ALTER TABLE sessions ADD COLUMN log_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sessions ALTER COLUMN log_id DROP DEFAULT;
