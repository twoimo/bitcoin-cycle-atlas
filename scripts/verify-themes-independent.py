"""Independent UTC-calendar oracle. No imports from the TypeScript implementation."""
import datetime, json, math, pathlib
root=pathlib.Path(__file__).resolve().parent.parent
snapshot=json.loads((root/'dist/data/themes.json').read_text())
grid=json.loads((root/'build/theme-materials/numerical-grid.json').read_text())
prices={b[0]:b for b in snapshot['asset']['bars']}
benchmark={b[0]:b for b in snapshot['benchmark']['bars']}
last=max(prices)
checks=0
def equal(a,b):
    global checks
    checks+=1
    if b is None:
        assert a is None,(a,b)
    elif isinstance(b,float):
        assert a is not None and math.isclose(a,b,abs_tol=1e-11,rel_tol=1e-11),(a,b)
    else:
        assert a==b,(a,b)
for decision in grid:
    entry=datetime.date.fromisoformat(decision['asOf'][:10])+datetime.timedelta(days=1)
    for actual in decision['result']:
        h=actual['horizon'];end=entry+datetime.timedelta(days=h);a=prices.get(str(entry));b=prices.get(str(end));path=[prices.get(str(entry+datetime.timedelta(days=d))) for d in range(1,h+1)]
        status='pending' if str(end)>last else 'unavailable' if a is None or b is None or any(p is None for p in path) else 'observed'
        expected=dict(horizon=h,status=status,entryDate=str(entry),exitDate=str(end),entry=a[4] if a else None,exit=None,change=None,benchmarkChange=None,excess=None,adverse=None,favorable=None)
        if status=='observed':
            change=100*(b[4]/a[4]-1);ba=benchmark.get(str(entry));bb=benchmark.get(str(end));bp=[benchmark.get(str(entry+datetime.timedelta(days=d))) for d in range(h+1)]
            reference=100*(bb[4]/ba[4]-1) if ba and bb and all(bp) else None
            expected.update(exit=b[4],change=change,benchmarkChange=reference,excess=change-reference if reference is not None else None,adverse=min([0]+[100*(p[3]/a[4]-1) for p in path]),favorable=max([0]+[100*(p[2]/a[4]-1) for p in path]))
        for key,value in expected.items():equal(actual[key],value)
receipt=dict(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),decisionDates=len(grid),horizons=[1,5,20],windows=len(grid)*3,assertions=checks,status='passed',method='independent Python UTC calendar and raw OHLC dictionaries',predictiveValidity=False)
(root/'build/theme-materials/independent-parity.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
