# UI diagnostic measurements (4acab602)

Exact baseline 1635f87 and changed application 03dcd1b1. Both phase reports are original bytes verified against the independent diagnostic transport receipts. Aggregate and case verdicts are recorded in the accompanying original reports and inventory.json.

| Phase | Viewport | Legend x,y / w×h | Legend overflow px (viewport / plot) | Bar scroll/client | Actions scroll/client | Clipped action viewport controls | Bar y: paused/picking/canceled |
|---|---|---|---:|---:|---:|---|---|
| before | 320×740 | 25,583.5 / 839.11×13 | 544.11 / 544.11 | 161/161 | 617/153 | mode-badge, result, pick, play, next, speed, update-interval, live | 551/551/551 |
| before | 390×844 | 25,687.5 / 839.11×13 | 474.11 / 474.11 | 231/231 | 617/223 | mode-badge, result, pick, play, next, speed, update-interval, live | 655/655/655 |
| before | 768×1024 | 85,870 / 847.11×14 | 164.11 / 213.11 | 349/349 | 617/341 | pick, play, next, speed, update-interval, live | 838/838/838 |
| before | 1024×768 | 85,624 / 847.11×14 | 0 / 0 | 418/418 | 541/410 | speed, update-interval, live | 602/602/602 |
| before | 1440×900 | 429.89,756 / 847.11×14 | 0 / 0 | 418/418 | 541/410 | speed, update-interval, live | 734/734/734 |
| before | 1920×1080 | 909.89,936 / 847.11×14 | 0 / 0 | 418/418 | 541/410 | speed, update-interval, live | 914/914/914 |
| after | 320×740 | 150,131 / 68×44 | 0 / 0 | 294/294 | 413/94 | first, mode-badge, result, pick, play, next | 630/630/630 |
| after | 390×844 | 220,131 / 68×44 | 0 / 0 | 364/364 | 425/164 | mode-badge, result, pick, play, next | 734/734/734 |
| after | 768×1024 | 377.33,127 / 232.67×64 | 0 / 0 | 558/558 | 454/454 | none | 910/910/910 |
| after | 1024×768 | 525.81,117 / 340.19×64 | 0 / 0 | 558/558 | 478/478 | none | 674/674/674 |
| after | 1440×900 | 767.09,117 / 514.91×64 | 0 / 0 | 558/558 | 478/478 | none | 806/806/806 |
| after | 1920×1080 | 1045.48,117 / 716.52×64 | 0 / 0 | 558/558 | 478/478 | none | 986/986/986 |

Mobile action viewport clipping is intentional scrolling with measured hints/arrows; it is distinct from controls inaccessible outside the whole bar. The full native report records all states and input checks. Images and report provenance are listed in inventory.json.
