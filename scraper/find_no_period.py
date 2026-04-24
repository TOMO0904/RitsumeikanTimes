import sys, re, json, requests, urllib.parse, urllib3
sys.stdout.reconfigure(encoding='utf-8')
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

session = requests.Session()
res = session.get("https://syllabus.ritsumei.ac.jp/syllabus/s/?language=ja", verify=False)
fwuid = re.search(r'"fwuid"\s*:\s*"([^"]+)"', urllib.parse.unquote(res.text)).group(1)
print(f"fwuid: {fwuid[:12]}...")

# 時限なし授業を探す: week=["水"], period=[] で検索
def query(week_list, period_list, keyword="", label=""):
    msg = {"actions": [{"id": "1;a",
        "descriptor": "aura://ApexActionController/ACTION$execute",
        "callingDescriptor": "UNKNOWN",
        "params": {"classname": "R_SyllabusPublicPageController",
            "method": "getSyllabusRecords",
            "params": {"action": {"lang": "ja", "keyword": keyword,
                "faculty": "26", "year": "2026", "term": None,
                "week": week_list, "period": period_list,
                "professionalCareer": None, "limits": 50}}}}]}
    payload = {"message": json.dumps(msg),
        "aura.context": json.dumps({"mode":"PROD","fwuid":fwuid,"app":"siteforce:communityApp","uad":True}),
        "aura.pageURI": "/syllabus/s/", "aura.token": "null"}
    res2 = session.post("https://syllabus.ritsumei.ac.jp/syllabus/s/sfsites/aura",
        data=payload, headers={"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"}, verify=False)
    data = json.loads(res2.text.replace("while(1);","",1))
    recs = data["actions"][0]["returnValue"]["returnValue"]["result"]
    print(f"\n=== {label} → {len(recs)}件 ===")
    for r in recs[:5]:
        wdp = r.get("R_SlWeekDayPeriod__c", "")
        name = r.get("R_SlCourseName__c", "").split("§")[0].strip()[:40]
        print(f"  WeekDayPeriod='{wdp}' | {name}")
    return recs

# 水曜を時限指定なしで取得
recs_no_period = query(["水"], [], label="水曜・時限なし(period=[])")

# 水曜を全時限で取得した IDセット
ids_with_period = set()
for p in ["1","2","3","4","5","6","7"]:
    r2 = query(["水"], [p], label=f"水曜{p}限")
    for rec in r2:
        ids_with_period.add(rec["Id"])

# period=[] で返ってきた中で、通常の時限クエリに含まれなかったもの
irregular = [r for r in recs_no_period if r["Id"] not in ids_with_period]
print(f"\n=== 通常クエリに含まれなかった時限なし授業: {len(irregular)}件 ===")
for r in irregular:
    wdp = r.get("R_SlWeekDayPeriod__c", "")
    name = r.get("R_SlCourseName__c", "").split("§")[0].strip()[:50]
    print(f"  WeekDayPeriod='{wdp}' | {name}")
