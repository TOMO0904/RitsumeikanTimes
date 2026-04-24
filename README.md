# Ritsumei Timetable

立命館大学向けのWeb時間割・シラバス検索アプリのリポジトリです。
Next.js と Tailwind CSS を用いて作成されています。

## デプロイ方法 (Node.jsがない環境からVercelへ載せる)

Node.jsがローカルのパソコンにインストールされていない場合でも、以下の手順でWeb上に公開できます！

1. **GitHubアカウントの作成（またはログイン）**: [GitHub](https://github.com/)
2. **新しいリポジトリを作成**: 右上の `+` ボタンから `New repository` を選び、「rits-timetable」などの名前をつけて作成します（PublicでもPrivateでも構いません）。
3. **ファイルのアップロード**: 
   リポジトリ作成後、「uploading an existing file」というリンクをクリックし、デスクトップの `時間割` フォルダの中身（`package.json` や `src` フォルダなど）をすべてドラッグ＆ドロップして「Commit changes」を押します。
4. **Vercelへの連携**:
   [Vercel](https://vercel.com/) にアクセスし、GitHubアカウントでログインします。
   `Add New...` > `Project` を選び、先ほど作成した GitHub リポジトリ（rits-timetable）を `Import` します。
5. **デプロイの実行**:
   Framework Preset が `Next.js` になっていることを確認して「Deploy」ボタンを押します！約1〜2分待てば、世界中からスマホでアクセスできるURLが発行されます。

## Supabase (データベース・ログイン) の設定について

1. [Supabase](https://supabase.com/) にて無料アカウント・新しいProjectを作成します。
2. Projectの `Project URL` と `anon public API Key` を取得します。
3. Vercelの管理画面の「Settings」 > 「Environment Variables」に行き、以下の2つを追加して再度デプロイ（Redeploy）します。
   - `NEXT_PUBLIC_SUPABASE_URL` : (Supabaseで取得したURL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` : (Supabaseで取得したKey)

以上でログイン機能とデータベースが有効になり、自分だけのデータ保存が可能になります！

## ## システム仕様 & 利用サービス詳細

### 1. 利用サービス (エコシステム)
本アプリは以下のクラウドサービスを組み合わせて構築されており、個人利用の範囲では**すべて無料**で運用可能です。

*   **GitHub**: ソースコードの保存・管理
*   **Vercel**: Webサイトの公開（ホスティング）
*   **Supabase**: 時間割データの保存・同期

### 2. 技術スタック
*   **Framework**: Next.js 14, React
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS
*   **Icons**: Lucide-React
*   **Database**: PostgreSQL (Supabase)

### 3. 主な機能仕様
*   **マルチ年度・セメスター管理**: 2026年度〜2029年度に対応。年度はドロップダウン、セメスターはタブで切り替え。
*   **シラバス検索 & スマートフィルタ**: 選択中の学期に合わせた授業を自動抽出。
*   **データ保護 (スナップショット)**: 授業追加時に情報をコピー保存するため、将来シラバスが更新されても時間割データは維持されます。
*   **クラウド同期 (Sync ID)**: 固有のIDで複数デバイス間の同期に対応。
*   **授業コード一括コピー**: 教科書購入時に便利なコード集計機能。

### 4. 運用コスト
*   **総計: 0円 (永久無料)**
*   Vercel Hobby Plan および Supabase Free Tier の範囲内で動作します。
