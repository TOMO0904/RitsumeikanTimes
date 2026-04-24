-- Supabase SQLエディタで実行してください
-- 同期データを保存するためのテーブルを作成します

CREATE TABLE IF NOT EXISTS timetable_sync (
    sync_id TEXT PRIMARY KEY,       -- 同期用の識別ID (UUIDなど)
    data JSONB NOT NULL,            -- 時間割、メモ、テーマなどの全データ
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security) の設定
-- セキュリティ強化：Sync IDを秘密鍵（パスワード）として機能させます
-- 誰でも全データを「一覧」できないようにし、正しいIDを知っている人だけが一件ずつ操作できるようにします
ALTER TABLE timetable_sync ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（再作成用）
DROP POLICY IF EXISTS "Anyone can select sync data" ON timetable_sync;
DROP POLICY IF EXISTS "Anyone can insert sync data" ON timetable_sync;
DROP POLICY IF EXISTS "Anyone can update sync data" ON timetable_sync;

-- データの取得許可 (SELECT)
-- ヘッダー 'x-sync-id' に自分のIDを含めている場合のみ、その行が表示されるようにします
CREATE POLICY "Select by Sync ID" 
ON timetable_sync FOR SELECT 
TO public 
USING (sync_id = (current_setting('request.headers', true)::json->>'x-sync-id'));

-- データの新規追加許可 (INSERT)
CREATE POLICY "Insert by Sync ID" 
ON timetable_sync FOR INSERT 
TO public 
WITH CHECK (sync_id = (current_setting('request.headers', true)::json->>'x-sync-id'));

-- データの更新許可 (UPDATE)
CREATE POLICY "Update by Sync ID" 
ON timetable_sync FOR UPDATE 
TO public 
USING (sync_id = (current_setting('request.headers', true)::json->>'x-sync-id'))
WITH CHECK (sync_id = (current_setting('request.headers', true)::json->>'x-sync-id'));
