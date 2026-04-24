import sys, os, re, json, requests, urllib.parse
sys.stdout.reconfigure(encoding='utf-8')

session = requests.Session()
response_top = session.get("https://syllabus.ritsumei.ac.jp/syllabus/s/?language=ja", verify=True)
decoded_text = urllib.parse.unquote(response_top.text)
fwuid = re.search(r'"fwuid"\s*:\s*"([^"]+)"', decoded_text).group(1)

message = {
    "actions": [{
        "id": "1;a",
        "descriptor": "aura://ApexActionController/ACTION$execute",
        "params": {
            "classname": "R_SyllabusPublicPageController",
            "method": "getSyllabusRecords",
            "params": {
                "action": {
                    "lang": "ja",
                    "keyword": "",
                    "faculty": "26",
                    "year": "2026",
                    "term": None,
                    "week": ["月"],
                    "period": ["1"],
                    "limits": 1
                }
            }
        }
    }]
}
payload = {
    "message": json.dumps(message),
    "aura.context": json.dumps({"mode": "PROD", "fwuid": fwuid, "app": "siteforce:communityApp", "uad": True}),
    "aura.pageURI": "/syllabus/s/",
    "aura.token": "null"
}
headers = {"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}
response = session.post("https://syllabus.ritsumei.ac.jp/syllabus/s/sfsites/aura", data=payload, headers=headers, verify=False)

data = json.loads(response.text.replace("while(1);", "", 1))
result = data.get("actions", [])[0].get("returnValue", {}).get("returnValue", {}).get("result", [])
if result: print(json.dumps(result[0], indent=2, ensure_ascii=False))
