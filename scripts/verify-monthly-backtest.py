#!/usr/bin/env python3
"""Independently verify a browser-exported monthly backtest with Python stdlib."""
import calendar
import datetime as dt
import json
import math
import statistics
import sys


def equal(actual, expected):
    if expected is None:
        assert actual is None
    else:
        assert math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-9), (actual, expected)


def verify(payload):
    assert payload['kind'] == 'atlas-monthly-backtest-result'
    assert payload['prospectiveScoringEligible'] is False
    prices = dict(payload['evaluationPrices'])
    eligible = {}
    checked = 0
    for row in payload['rows']:
        date = dt.date.fromisoformat(row['asOf'])
        assert date.day == calendar.monthrange(date.year, date.month)[1]
        if row['status'] != 'ready':
            continue
        record = row['record']
        assert record['issuedAt'] is None
        assert record['provenance']['futurePriceRowsConsumed'] is False
        assert record['provenance']['trainingThrough'] == row['asOf']
        assert all(c['publishedAt'] <= row['asOf'] for c in record['modelOptions']['claims'])
        path = record['path']
        assert len(path) == 366
        anchor = prices[row['asOf']]
        equal(path[0]['price'], anchor)
        for i, point in enumerate(path):
            assert point['date'] == (date + dt.timedelta(days=i)).isoformat()
        for result in row['evaluations']:
            horizon = result['horizonDays']
            assert horizon in (30, 90, 180, 365)
            assert result['targetDate'] == (date + dt.timedelta(days=horizon)).isoformat()
            points = path[1:horizon + 1]
            actuals = [(p['price'], prices[p['date']]) for p in points if p['date'] in prices]
            assert len(actuals) == result['observedDays']
            if result['status'] != 'complete':
                assert result['metrics'] is None
                continue
            assert len(actuals) == horizon
            mae = statistics.mean(abs(f - a) for f, a in actuals)
            mape = statistics.mean(abs(f - a) / a for f, a in actuals)
            log = statistics.mean(abs(math.log(f / a)) for f, a in actuals)
            flat = statistics.mean(abs(math.log(anchor / a)) for _, a in actuals)
            endpoint = abs(path[horizon]['price'] - actuals[-1][1]) / actuals[-1][1]
            metrics = result['metrics']
            for key, value in [('meanAbsoluteError', mae), ('meanAbsolutePercentageError', mape), ('meanAbsoluteLogError', log), ('flatMeanAbsoluteLogError', flat), ('endpointAbsolutePercentageError', endpoint), ('skillVersusFlat', 1 - log / flat if flat else None)]:
                equal(metrics[key], value)
            sign = lambda x: (x > 0) - (x < 0)
            direction = sign(path[horizon]['price'] - anchor) == sign(actuals[-1][1] - anchor)
            assert metrics['endpointDirectionCorrect'] == direction
            eligible[(row['asOf'], horizon)] = dict(mae=mae, mape=mape, log=log, flat=flat, endpoint=endpoint, direction=direction)
            checked += 1
    summaries = {}
    for name in ['summary', 'commonOriginSummary']:
        output = []
        for summary in payload[name]:
            h = summary['horizonDays']
            origins = [r['asOf'] for r in payload['rows'] if (r['asOf'], h) in eligible and (name == 'summary' or all((r['asOf'], n) in eligible for n in (30, 90, 180, 365)))]
            assert summary['origins'] == origins
            assert summary['originCount'] == len(origins)
            if not origins:
                assert summary['meanAbsolutePercentageError'] is None
                continue
            cohort = [eligible[(date, h)] for date in origins]
            log = statistics.mean(e['log'] for e in cohort)
            flat = statistics.mean(e['flat'] for e in cohort)
            for key, value in [('meanAbsolutePercentageError', statistics.mean(e['mape'] for e in cohort)), ('meanAbsoluteError', statistics.mean(e['mae'] for e in cohort)), ('endpointAbsolutePercentageError', statistics.mean(e['endpoint'] for e in cohort)), ('skillVersusFlat', 1 - log / flat if flat else None)]:
                equal(summary[key], value)
            assert summary['endpointDirectionCorrectCount'] == sum(e['direction'] for e in cohort)
            output.append(dict(horizonDays=h, completedOrigins=len(origins), mape=summary['meanAbsolutePercentageError'], skillVersusFlat=summary['skillVersusFlat']))
        summaries[name] = output
    return dict(status='pass', method='Python stdlib calendar/datetime/statistics/math; metrics derived directly from exported prices and frozen paths', origins=len(payload['rows']), completedWindows=checked, summaries=summaries, excludes='Forecast skill validity, historical publication/vintage provenance and independent cycle sample size')


if __name__ == '__main__':
    with open(sys.argv[1]) as source:
        print(json.dumps(verify(json.load(source)), ensure_ascii=False, indent=2))
