import json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(base, 'public', 'syllabus.json'), encoding='utf-8') as f:
    data = json.load(f)

print(f"総件数: {len(data)}件")

days = ['月', '火', '水', '木', '金', '土']
for d in days:
    cnt = len([x for x in data if x['day'] == d])
    print(f"  {d}曜: {cnt}件")

# 時限なし（period == "" または day == ""）
no_period = [x for x in data if x.get('period') == '']
no_day    = [x for x in data if x.get('day') == '']
print(f"\n時限なし (period=''): {len(no_period)}件")
print(f"曜日なし (day=''):    {len(no_day)}件")

# サンプル表示
if no_period:
    print("\n--- 時限なしサンプル ---")
    for c in no_period[:5]:
        print(json.dumps(c, ensure_ascii=False))
if no_day:
    print("\n--- 曜日なしサンプル ---")
    for c in no_day[:5]:
        print(json.dumps(c, ensure_ascii=False))
