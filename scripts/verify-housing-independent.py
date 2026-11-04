"""Independent calendar-based oracle; reads official snapshot and TypeScript output only."""
import json, math, pathlib, statistics, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
snapshot = json.loads((ROOT / 'dist/data/housing.json').read_text())
results = json.loads((ROOT / 'build/housing-research/numerical-grid.json').read_text())
checked = 0

def ordinal(m):
    y, m = map(int, m.split('-'))
    return 12*y+m-1

def month(m):
    return '%04d-%02d' % (m//12, m%12+1)

def equal(actual, expected):
    global checked
    checked += 1
    if expected is None:
        assert actual is None, (actual, expected)
    elif isinstance(expected, float):
        assert actual is not None and math.isclose(actual, expected, rel_tol=2e-11, abs_tol=2e-11), (actual, expected)
    else:
        assert actual == expected, (actual, expected)

def correlation(pairs):
    if len(pairs) < 3:
        return None
    a, b = zip(*pairs)
    if max(a) == min(a) or max(b) == min(b):
        return None
    ma, mb = statistics.mean(a), statistics.mean(b)
    return sum((x-ma)*(y-mb) for x,y in pairs)/(sum((x-ma)**2 for x in a)*sum((y-mb)**2 for y in b))**.5

def check_summary(actual, cohort, direction, anchor, horizon):
    values = [o['change'] for o in cohort]
    up, down = sum(v>0 for v in values), sum(v<0 for v in values)
    count = len(values)
    hit = up if direction == 'up' else down
    for k,v in dict(n=count,up=up,down=down,flat=count-up-down,hit=hit,rate=100*hit/count if count else None,
                    mean=statistics.mean(values) if count else None,median=statistics.median(values) if count else None).items():
        equal(actual[k],v)
    sparse = [o for o in cohort if (ordinal(o['month'])-anchor)%horizon == 0]
    hits = sum(o['change']>0 if direction == 'up' else o['change']<0 for o in sparse)
    for k,v in dict(n=len(sparse),hit=hits,rate=100*hits/len(sparse) if sparse else None).items():
        equal(actual['nonOverlapping'][k],v)

for result in results:
    opts=result['options']
    region=next(r for r in snapshot['regions'] if r['id']==opts['region'])
    volume={ordinal(m):v for m,v in region['volume']}
    price={ordinal(m):v for m,v in region['price']}
    rows=[]
    for m in sorted(set(volume)|set(price)):
        past=[volume.get(k) for k in range(m-opts['window'],m)]
        avg=statistics.mean(past) if all(v is not None for v in past) else None
        v,p=volume.get(m),price.get(m)
        deviation=100*(v/avg-1) if v is not None and avg else None
        if deviation is None:
            state='warmup'
        elif v-avg > avg*opts['band']/100+1e-9:
            state='above'
        elif v-avg < -avg*opts['band']/100-1e-9:
            state='below'
        else:
            state='neutral'
        row=dict(month=month(m),volume=v,price=p,average=avg,deviation=deviation,state=state,
                 priceChange=100*(p/price[m-1]-1) if p is not None and price.get(m-1) else None,
                 volumeChange=100*(v/volume[m-1]-1) if v is not None and volume.get(m-1) else None)
        rows.append(row)
    equal(len(result['rows']),len(rows))
    for actual,expected in zip(result['rows'],rows):
        for k,v in expected.items():
            equal(actual[k],v)
    selected=[r for r in rows if opts['start']<=r['month']<=opts['end']]
    for key,x,y in [('levels','volume','price'),('changes','volumeChange','priceChange'),('deviation','deviation','priceChange')]:
        pairs=[(r[x],r[y]) for r in selected if r[x] is not None and r[y] is not None]
        equal(result['relations'][key]['n'],len(pairs))
        equal(result['relations'][key]['r'],correlation(pairs))
    by_month={r['month']:r for r in rows}
    for lag in result['relations']['lags']:
        pairs=[]
        for r in selected:
            later=by_month.get(month(ordinal(r['month'])+lag['lag']))
            if r['deviation'] is not None and later and later['priceChange'] is not None and opts['start']<=later['month']<=opts['end']:
                pairs.append((r['deviation'],later['priceChange']))
        equal(lag['n'],len(pairs))
        equal(lag['r'],correlation(pairs))
    eligible=[r for r in selected if r['state']!='warmup']
    for backtest in result['backtests']:
        h=backtest['horizon']
        outcomes=[]
        for r in eligible:
            entry=ordinal(r['month'])+opts['lag']
            exit=entry+h
            if month(exit)>opts['end'] or any(k not in price for k in range(entry,exit+1)):
                continue
            outcomes.append(dict(month=r['month'],entry=month(entry),exit=month(exit),state=r['state'],change=100*(price[exit]/price[entry]-1)))
        equal(len(backtest['outcomes']),len(outcomes))
        for actual,expected in zip(backtest['outcomes'],outcomes):
            for k,v in expected.items():
                equal(actual[k],v)
        equal(backtest['eligible'],len(eligible))
        equal(backtest['excluded'],len(eligible)-len(outcomes))
        anchor=ordinal(outcomes[0]['month']) if outcomes else 0
        for field,cohort in [('groups',outcomes),('holdout',[o for o in outcomes if o['month']>='2021-01'])]:
            for group in backtest[field]:
                direction='down' if group['state']=='below' else 'up'
                subset=[o for o in cohort if o['state']==group['state']]
                check_summary(group,subset,direction,anchor,h)
                check_summary(group['baseline'],cohort,direction,anchor,h)
                equal(group['lift'],group['rate']-group['baseline']['rate'] if subset and cohort else None)

receipt=dict(checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),combinations=len(results),regions=4,
             windows=[12,36,60],bands=[0,5,10,20],lags=[0,1,2,3],horizons=[1,3,6,12],assertions=checked,
             independentLanguage='Python statistics + calendar dictionaries',status='passed',liveVintageBacktest=False)
(ROOT/'build/housing-research/independent-parity.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt))
