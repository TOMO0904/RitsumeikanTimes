import requests
import urllib.parse
import re
import urllib3
import json
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

TOP_PAGE_URL = "https://syllabus.ritsumei.ac.jp/syllabus/s/?language=ja"
session = requests.Session()
res = session.get(TOP_PAGE_URL, verify=False)
decoded = urllib.parse.unquote(res.text)

print(decoded[:500])

fwuid_match = re.search(r'"fwuid"\s*:\s*"([^"]+)"', decoded)
if fwuid_match:
    print("Found fwuid:", fwuid_match.group(1))
else:
    print("fwuid not found in decoded text")

API_URL = "https://syllabus.ritsumei.ac.jp/syllabus/s/sfsites/aura"
aura_context = {"mode":"PROD","fwuid":fwuid_match.group(1),"app":"siteforce:communityApp","uad":True}
message = {"actions":[{"id":"1;a","descriptor":"aura://ApexActionController/ACTION$execute","callingDescriptor":"UNKNOWN","params":{"namespace":"","classname":"R_SyllabusPublicPageController","method":"getSyllabusRecords","params":{"action":{"lang":"ja","keyword":"","faculty":"26","year":"2026","term":None,"week":["月"],"period":["1"],"professionalCareer":None,"limits":501}},"cacheable":False,"isContinuation":False}}]}
payload = {"message": json.dumps(message), "aura.context": json.dumps(aura_context), "aura.pageURI": "/syllabus/s/", "aura.token": "null"}
headers = {"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}

res2 = session.post(API_URL, data=payload, headers=headers, verify=False)
try:
    data = json.loads(res2.text.replace("while(1);", "", 1))
    print("\nAPI Response Code:", res2.status_code)
    print("API Response Content: SUCCESS!! Snippet:", str(data)[:300])
except Exception as e:
    print(f"Error parsing json: {e}, text: {res2.text[:300]}")
