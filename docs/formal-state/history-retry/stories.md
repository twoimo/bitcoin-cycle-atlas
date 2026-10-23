## 1. History blocked after refresh (before fix only)

Rule broken: After manual refresh finishes, the prior failed history attempt cannot block the requested visible window. A subsequent failed attempt may set a new delay.
Why: A failed refresh retains the previous history retry delay.
This is the only way to get here in the model.

0. Start: Candles displayed
1. Pan to an unloaded period. Now: Loading older candles
2. History request fails. Now: Older candles failed; waiting to retry
3. Tap refresh. Now: Refreshing recent candles
4. Recent request fails; keep saved candles. Now: History blocked after refresh (before fix only)

With refresh retry fix, step 4 (recent request fails; keep saved candles) takes you to: Saved candles; history can retry.
