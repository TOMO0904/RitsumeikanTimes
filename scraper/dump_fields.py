import urllib3; urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import sys, re, json, requests, urllib.parse
sys.stdout.reconfigure(encoding='utf-8')

session = requests.Session()
res = session.get("https://syllabus.ritsumei.ac.jp/syllabus/s/?language=ja", verify=False)
fwuid = re.search(r'"fwuid"\s*:\s*"([^"]+)"', urllib.parse.unquote(res.text)).group(1)

msg = {"actions": [{"id": "1;a","descriptor": "aura://ApexActionController/ACTION$execute","callingDescriptor": "UNKNOWN","params": {"classname": "R_SyllabusPublicPageController","method": "getSyllabusRecords","params": {"action": {"lang": "ja","keyword": "","faculty": "26","year": "2026","term": None,"week": ["月"],"period": ["1"],"limits": 1}}}}]}
payload = {"message": json.dumps(msg),"aura.context": json.dumps({"mode":"PROD","fwuid":fwuid,"app":"siteforce:communityApp","uad":True}),"aura.pageURI": "/syllabus/s/","aura.token": "null"}
res2 = session.post("https://syllabus.ritsumei.ac.jp/syllabus/s/sfsites/aura", data=payload, headers={"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8"}, verify=False)
data = json.loads(res2.text.replace("while(1);","",1))
records = data["actions"][0]["returnValue"]["returnValue"]["result"]
print("=== ALL FIELDS ===")
print(json.dumps(records[0], indent=2, ensure_ascii=False))
