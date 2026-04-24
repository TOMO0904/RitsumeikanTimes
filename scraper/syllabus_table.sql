-- Supabase SQLエディタで実行して、シラバス保存用のテーブルを作成してください

CREATE TABLE syllabus (
    course_id TEXT PRIMARY KEY,    -- 授業の固有ID (例: a0ifD000003RvURQA0)
    name TEXT NOT NULL,            -- 授業名 (例: Modern World History)
    professor TEXT,                -- 担当教員名 (例: 松坂 裕晃)
    campus TEXT,                   -- キャンパス (例: 衣笠)
    term TEXT,                     -- 開講時期 (例: 秋セメスター)
    day TEXT,                      -- 曜日 (例: 月)
    period TEXT,                   -- 時限 (例: 1)
    
    -- 自動で作成日時と更新日時を記録
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- データを見るための権限設定（RLSの無効化、または読み取り許可）
-- ※今回はアプリ開発をスムーズにするため、誰でも読み取れるようにします
ALTER TABLE syllabus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "シラバスは誰でも検索可能" 
ON syllabus FOR SELECT 
TO public 
USING (true);

-- API（サービスキー）による追記（Upsert）はRLSをバイパスできるため、
-- 特に追加のINSERTポリシーは不要です。
