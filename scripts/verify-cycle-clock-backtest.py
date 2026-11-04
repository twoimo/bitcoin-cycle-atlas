#!/usr/bin/env python3
"""Independent calendar, closed-target and aggregation checks for an Atlas export."""
import calendar
import datetime as dt
import json
import math
from pathlib import Path
import statistics
import sys

HALVINGS = [(2012, '2012-11-28'), (2016, '2016-07-09'), (2020, '2020-05-11'), (2024, '2024-04-20')]


def months(date, count):
    value = dt.date.fromisoformat(date)
    year, month = divmod(value.year * 12 + value.month - 1 + count, 12)
    return dt.date(year, month + 1, min(value.day, calendar.monthrange(year, month + 1)[1]))


def closed_targets(prices, as_of):
    result = {}
    for (year, start), (_, end) in zip(HALVINGS, HALVINGS[1:]):
        if end > as_of or end not in prices:
            continue
        rows = [(d, p) for d, p in prices.items() if start <= d < end]
        if not rows or rows[0][0] != start:
            continue
        first, last = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
        if len(rows) != (last - first).days:
            continue
        peak, low, run, confirmed, candidate = rows[0], None, 0, False, None
        for row in rows[1:]:
            if row[1] > peak[1]:
                peak, low, run, confirmed = row, None, 0, False
            else:
                if low is None or row[1] < low[1]:
                    low = row
                run = run + 1 if row[1] <= peak[1] * .6 else 0
                confirmed = confirmed or run >= 14
                if confirmed:
                    candidate = (peak, low)
        if candidate:
            result['halving-' + str(year)] = dict(peak=candidate[0][0], trough=candidate[1][0], known=end)
    return result


def verify_history(payload, prices, actuals):
    assessments = payload['originAssessments']
    origins = [a['origin'] for a in assessments]
    assert len(origins) == len(set(origins)) == payload['requestedOriginCount']
    if payload['policy']['originSelection'].startswith('Every completed'):
        expected = []
        for year in range(int(min(prices)[:4]), int(payload['asOf'][:4]) + 1):
            for month in (3, 6, 9, 12):
                date = dt.date(year, month, calendar.monthrange(year, month)[1]).isoformat()
                if min(prices) <= date <= payload['asOf']:
                    expected.append(date)
        assert origins == expected
    for a in assessments:
        origin = a['origin']
        available = {d: p for d, p in prices.items() if d <= origin}
        known = closed_targets(available, origin)
        assert a['referenceKnownAts'] == [t['known'] for t in known.values()]
        assert a['referenceCountAtOrigin'] == len(known)
        assert all(d <= origin for d in a['referenceKnownAts'])
        for key in ('peakConfirmedAt', 'troughConfirmedAt'):
            assert a[key] is None or a[key] <= origin
        starts = [d for _, d in HALVINGS if d <= origin]
        if not starts:
            assert a['baselinePeak'] is None and a['adjustedPeak'] is None
        elif a['referencePeakDate']:
            start = starts[-1]
            prefix = [(d, p) for d, p in available.items() if d >= start]
            assert max(prefix, key=lambda r: r[1])[0] == a['referencePeakDate']
            assert months(a['referencePeakDate'], 48).isoformat() == a['baselinePeak']
            assert months(a['baselinePeak'], 12).isoformat() == a['baselineTrough']
        if not a['calibrationAvailable']:
            assert a['adjustedPeak'] is None and a['adjustedTrough'] is None and a['appliedShiftDays'] is None
        else:
            assert known and a['peakConfirmedAt'] and a['trainingThrough'] == origin
            for key, baseline in [('adjustedPeak', 'baselinePeak'), ('adjustedTrough', 'baselineTrough')]:
                assert (dt.date.fromisoformat(a[baseline]) + dt.timedelta(days=a['appliedShiftDays'])).isoformat() == a[key]
    baseline_groups = {}
    for row in payload['baselineRecords']:
        a = next(a for a in assessments if a['origin'] == row['origin'])
        assert a['status'] in ('paired', 'baseline-only')
        target = actuals[row['cycleId']]
        assert target[row['type']] == row['targetDate'] and target['known'] == row['targetKnownAt']
        baseline = a['baselinePeak'] if row['type'] == 'peak' else a['baselineTrough']
        assert row['baselineDate'] == baseline
        error = (dt.date.fromisoformat(baseline) - dt.date.fromisoformat(row['targetDate'])).days
        assert error == row['baselineErrorDays']
        group = baseline_groups.setdefault(row['targetId'], {})
        assert row['origin'] not in group
        group[row['origin']] = abs(error)
    paired_set = {(r['targetId'], r['origin']) for r in payload['records']}
    expected_pair = {(r['targetId'], r['origin']) for r in payload['baselineRecords']
                     if next(a for a in assessments if a['origin'] == r['origin'])['status'] == 'paired'}
    assert paired_set == expected_pair
    coverage = payload['coverageStats']
    assert coverage['historicalCycleCount'] == len(actuals)
    assert coverage['baselineCycleCount'] == len({r['cycleId'] for r in payload['baselineRecords']})
    assert coverage['pairedCycleCount'] == len({r['cycleId'] for r in payload['records']})
    for status, field in [('paired', 'pairedOrigins'), ('baseline-only', 'baselineOnlyOrigins'), ('unavailable', 'unavailableOrigins'), ('pending', 'pendingOrigins'), ('invalid', 'invalidOrigins')]:
        assert coverage[field] == sum(a['status'] == status for a in assessments)
    assert coverage['insufficientOrigins'] == sum(not a['calibrationAvailable'] for a in assessments)
    assert len(payload['historicalTargets']) == 2 * len(actuals)
    for t in payload['historicalTargets']:
        assert t['targetDate'] == actuals[t['cycleId']][t['type']]
        assert t['targetKnownAt'] == actuals[t['cycleId']]['known']
        members = [a for a in assessments if a['targetCycleId'] == t['cycleId']]
        assert t['origins'] == members
        baseline = baseline_groups.get(t['targetId'], {})
        paired = [r for r in payload['records'] if r['targetId'] == t['targetId']]
        assert t['originCount'] == len(members)
        assert t['baselineOriginCount'] == len(baseline)
        assert t['pairedOriginCount'] == len(paired)
        assert t['insufficientOriginCount'] == sum(not a['calibrationAvailable'] for a in members)
        assert (t['baselineMaeDays'] is None) == (not baseline)
        if baseline:
            assert math.isclose(t['baselineMaeDays'], statistics.mean(baseline.values()))
        if paired:
            assert math.isclose(t['pairedBaselineMaeDays'], statistics.mean(abs(r['baselineErrorDays']) for r in paired))
            assert math.isclose(t['adjustedMaeDays'], statistics.mean(abs(r['adjustedErrorDays']) for r in paired))
        else:
            assert t['pairedBaselineMaeDays'] is None and t['adjustedMaeDays'] is None
    for t in payload['baselineSummary']:
        selected = [h for h in payload['historicalTargets'] if h['type'] == t['type'] and h['baselineOriginCount']]
        assert t['uniqueTargetCount'] == t['uniqueCycleCount'] == len(selected)
        if selected:
            assert math.isclose(t['baselineMaeDays'], statistics.mean(h['baselineMaeDays'] for h in selected))
        else:
            assert t['baselineMaeDays'] is None
    assert payload['excluded'] == [a for a in assessments if a['status'] != 'paired']
    return dict(origins=len(origins), baselineRecords=len(payload['baselineRecords']), coverage=coverage, baselineSummary=payload['baselineSummary'])


def verify(payload):
    assert payload['kind'] == 'atlas-cycle-clock-backtest'
    assert payload['policy']['futureOutcomesUsedInPrediction'] is False
    assert payload['policy']['historicalVintageAvailable'] is False
    assert payload['policy']['sufficientForPredictiveSuperiorityClaim'] is False
    prices = dict(payload['evaluationPrices'])
    assert list(prices) == sorted(prices)
    assert max(prices) == payload['asOf']
    assert all(math.isfinite(p) and p > 0 for p in prices.values())
    actuals = closed_targets(prices, payload['asOf'])
    groups = {}
    for row in payload['records']:
        target = actuals[row['cycleId']]
        assert row['targetId'] == row['cycleId'] + ':' + row['type']
        assert row['targetDate'] == target[row['type']]
        assert row['targetKnownAt'] == target['known']
        assert row['trainingThrough'] == row['origin'] < row['targetDate'] < row['targetKnownAt'] <= payload['asOf']
        era_start = max(date for _, date in HALVINGS if date <= row['origin'])
        prefix = [(date, price) for date, price in prices.items() if era_start <= date <= row['origin']]
        assert max(prefix, key=lambda x: x[1])[0] == row['referencePeakDate']
        peak_date = months(row['referencePeakDate'], 48)
        baseline = peak_date if row['type'] == 'peak' else months(peak_date.isoformat(), 12)
        assert isinstance(row['appliedShiftDays'], int) and abs(row['appliedShiftDays']) <= 180
        adjusted = baseline + dt.timedelta(days=row['appliedShiftDays'])
        assert baseline.isoformat() == row['baselineDate']
        assert adjusted.isoformat() == row['adjustedDate']
        observed = dt.date.fromisoformat(row['targetDate'])
        baseline_error, adjusted_error = (baseline - observed).days, (adjusted - observed).days
        assert (baseline_error, adjusted_error) == (row['baselineErrorDays'], row['adjustedErrorDays'])
        group = groups.setdefault(row['targetId'], {})
        assert row['origin'] not in group
        group[row['origin']] = (abs(baseline_error), abs(adjusted_error))
    grouped = []
    for group in payload['targets']:
        origins = groups[group['targetId']]
        assert group['originCount'] == len(origins)
        baseline = statistics.mean(b for b, a in origins.values())
        adjusted = statistics.mean(a for b, a in origins.values())
        assert math.isclose(group['baselineMaeDays'], baseline)
        assert math.isclose(group['adjustedMaeDays'], adjusted)
        grouped.append(dict(targetId=group['targetId'], cycle=group['cycleId'], type=group['type'], origins=len(origins), baseline=baseline, adjusted=adjusted))
    summaries = []
    for summary in payload['summary']:
        relevant = [g for g in grouped if g['type'] == summary['type']]
        assert summary['uniqueTargetCount'] == len(relevant)
        assert summary['uniqueCycleCount'] == len({g['cycle'] for g in relevant})
        if relevant:
            baseline = statistics.mean(g['baseline'] for g in relevant)
            adjusted = statistics.mean(g['adjusted'] for g in relevant)
            assert math.isclose(summary['baselineMaeDays'], baseline)
            assert math.isclose(summary['adjustedMaeDays'], adjusted)
            assert math.isclose(summary['improvementDays'], baseline - adjusted)
        else:
            assert summary['baselineMaeDays'] is None and summary['adjustedMaeDays'] is None
        summaries.append(summary)
    assert payload['uniqueCycleCount'] == len({g['cycle'] for g in grouped})
    assert payload['scoredOriginCount'] == len({r['origin'] for r in payload['records']})
    assert len({r['origin'] for r in payload['excluded']}) == len(payload['excluded'])
    history = verify_history(payload, prices, actuals) if payload['version'] >= 2 else None
    return dict(status='pass', history=history, method='Python stdlib calendar/date arithmetic, independent closed-era persistent-drawdown target scan, and hierarchical mean absolute errors',
                records=len(payload['records']), uniqueCycles=payload['uniqueCycleCount'], scoredOrigins=payload['scoredOriginCount'], excludedOrigins=len(payload['excluded']), targets=grouped, summary=summaries,
                excludes='An independent implementation of the entire smoothed calibration rule, historical issuance/vintage verification and predictive-superiority inference')


if __name__ == '__main__':
    raw = Path(sys.argv[1]).read_bytes()
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('Clock export exceeds 8MiB')
    print(json.dumps(verify(json.loads(raw)), ensure_ascii=False, indent=2))
