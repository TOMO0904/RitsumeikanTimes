import sys, os, re, json, requests, urllib.parse, urllib3, time
sys.stdout.reconfigure(encoding='utf-8')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TOP_PAGE_URL = "https://syllabus.ritsumei.ac.jp/syllabus/s/?language=ja"
API_URL      = "https://syllabus.ritsumei.ac.jp/syllabus/s/sfsites/aura"
FACULTIES = {
    "21": "理工学部",
    "26": "情報理工学部"
}
YEAR         = "2026"
LIMIT        = 501

# 学期の候補リスト（total-ざらい時の分割用）
TERMS = ["春セメスター", "秋セメスター", "前期", "後期", "通年", "夏期集中", "春期集中", "秋期集中"]

# ── トークン取得 ──────────────────────────────
def get_fwuid(session):
    res = session.get(TOP_PAGE_URL, verify=False)
    m = re.search(r'"fwuid"\s*:\s*"([^"]+)"', urllib.parse.unquote(res.text))
    if not m:
        print("❌ fwuid取得失敗"); return None
    fwuid = m.group(1)
    print(f"✅ fwuid取得成功: {fwuid[:10]}...")
    return fwuid

# ── 汎用APIリクエスト ───────────────────────────
def api_request(session, fwuid, week_list, period_list, faculty_code, term=None, label=""):
    ctx = {"mode": "PROD", "fwuid": fwuid, "app": "siteforce:communityApp", "uad": True}
    msg = {
        "actions": [{
            "id": "1;a",
            "descriptor": "aura://ApexActionController/ACTION$execute",
            "callingDescriptor": "UNKNOWN",
            "params": {
                "classname": "R_SyllabusPublicPageController",
                "method":    "getSyllabusRecords",
                "params": {
                    "action": {
                        "lang": "ja", "keyword": "", "faculty": faculty_code,
                        "year": YEAR, "term": term,
                        "week": week_list, "period": period_list,
                        "professionalCareer": None, "limits": LIMIT
                    }
                },
                "cacheable": False, "isContinuation": False
            }
        }]
    }
    payload = {
        "message":      json.dumps(msg),
        "aura.context": json.dumps(ctx),
        "aura.pageURI": "/syllabus/s/",
        "aura.token":   "null"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}
    res = session.post(API_URL, data=payload, headers=headers, verify=False)
    try:
        data = json.loads(res.text.replace("while(1);", "", 1))
        recs = data["actions"][0]["returnValue"]["returnValue"]["result"]
        if label:
            print(f"  [{label}] {len(recs)}件取得{' ⚠️ 上限到達' if len(recs) >= LIMIT else ''}")
        return recs
    except Exception as e:
        print(f"  ❌ パースエラー: {e}")
        return []

# ── R_SlWeekDayPeriod__c から曜日・時限を解析 ──
# 例: "水" → day="水", period=""
# 例: "水3" → day="水", period="3"
# 例: "月1,月3" → 最初のエントリを使用
DAY_CHARS = {'月','火','水','木','金','土','日'}

def parse_wdp(wdp_str):
    """R_SlWeekDayPeriod__c を (day, period) にパース"""
    if not wdp_str:
        return '', ''
    # カンマ区切りの場合、最初だけ使う
    first = wdp_str.split(',')[0].strip()
    if not first:
        return '', ''
    d = first[0] if first[0] in DAY_CHARS else ''
    p = first[1:] if len(first) > 1 else ''
    # 時限は数字1文字のみ (「5,水6」等の複合は最初の数字)
    if p and not p.isdigit():
        p = p[0] if p[0].isdigit() else ''
    return d, p

# ── レコードを正規化して new 件数を返す ────────
# fallback_day/fallback_period: APIレスポンドにWDP情報がない場合のデフォルト
def absorb(recs, fallback_day, fallback_period, faculty_name, all_data, seen_keys):
    new = 0
    for row in recs:
        cid = row.get("Id")
        if not cid:
            continue
        
        # IDが同じでも学部が異なる（跨る）場合があるため、key = (id, faculty) で管理
        key = (cid, faculty_name)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        raw_name = row.get("R_SlCourseName__c", "")
        name = raw_name.split("§")[0].strip() if raw_name else "不明"

        # APIの実際の曜日・時限フィールドを優先して使用
        wdp = row.get("R_SlWeekDayPeriod__c", "")
        actual_day, actual_period = parse_wdp(wdp)
        use_day    = actual_day    if actual_day    else fallback_day
        use_period = actual_period if actual_period else fallback_period

        all_data.append({
            "id":        cid,
            "name":      name,
            "professor": row.get("R_SlPersonalName__c", ""),
            "campus":    row.get("R_SlCampusInfo__c", ""),
            "term":      row.get("R_SlCourseOpenPeriodName__c", ""),
            "day":       use_day,
            "period":    use_period,
            "faculty":   faculty_name
        })
        new += 1
    return new

# ── メイン ───────────────────────────────────
if __name__ == "__main__":
    session = requests.Session()
    fwuid   = get_fwuid(session)
    if not fwuid:
        sys.exit(1)

    all_data = []
    seen_keys = set()

    for f_code, f_name in FACULTIES.items():
        print(f"\n🚀 学部取得開始: {f_name} ({f_code})")
        
        # =============================================
        # フェーズA: 曜日×時限の42スロット巡回
        # =============================================
        weeks   = ["月", "火", "水", "木", "金", "土"]
        periods = ["1", "2", "3", "4", "5", "6", "7"]
        targets = [{"week": w, "period": p} for w in weeks for p in periods]

        print(f"--- フェーズA: 42スロット巡回 ({f_name}) ---")
        for i, t in enumerate(targets, 1):
            recs = api_request(session, fwuid, [t["week"]], [t["period"]], f_code)
            new  = absorb(recs, t["week"], t["period"], f_name, all_data, seen_keys)
            print(f"[{i:2}/{len(targets)}] {t['week']}曜{t['period']}限: {len(recs)}件取得 (新規:{new}件 / 累計:{len(all_data)}件)")
            time.sleep(1) # 少し短縮

        # =============================================
        # フェーズB: 曜日ごとに時限フィルターなしで再クエリ
        # =============================================
        print(f"--- フェーズB: 時限なし授業キャッチ ({f_name}) ---")
        for i, w in enumerate(weeks, 1):
            recs_w = api_request(session, fwuid, [w], [], f_code, label=f"{w}曜・時限なし")
            new    = absorb(recs_w, w, "", f_name, all_data, seen_keys)
            print(f"[B-{i}] {w}曜・時限なし: {len(recs_w)}件取得 (新規:{new}件 / 累計:{len(all_data)}件)")
            time.sleep(1)

    # =============================================
    # JSON書き出し → Next.jsの public フォルダへ
    # =============================================
    out_path = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "public", "syllabus.json")
    )
    # テスト用に出力（既存ファイルを壊さないようにチェックするため）
    test_out_path = out_path + ".tmp"
    with open(test_out_path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 取得完了！ ({len(all_data)}件)")
    print(f"   一時ファイルに出力しました: {test_out_path}")
    
    # 正常に取得できていれば上書き
    if len(all_data) > 100:
        import shutil
        shutil.move(test_out_path, out_path)
        print(f"✅ 正式に更新しました: {out_path}")
    else:
        print(f"⚠️ 取得件数が少なすぎるため、上書きを中止しました。")
