from pathlib import Path
import subprocess,json
OLD_MAIN='20dbfd73e53905c10e50b5e9524da12a979cc22b'
MAIN='851a8c80137e9433d80666df14da70f522ee1028'
PR='99c9692bad01e6f2293dbf2b1f501f68914d9be2'
def show(ref,path):return subprocess.check_output(['git','show',ref+':'+path]).decode()
def normal(s):
 for v in ['1.30.0','1.30.1','1.30.2']:s=s.replace(v,'VERSION')
 return s
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==MAIN
paths=['dist/chart-replay.js','tests/replay-fixed-forecast-ui.test.mjs','scripts/verify-chart-replay-browser.mjs','scripts/verify-forecast-replay-browser.mjs']
for p in paths:assert normal(show(MAIN,p))==normal(show(OLD_MAIN,p)),'Intervening replay edit: '+p
for p in paths+['tests/replay-date-input.test.mjs','scripts/verify-replay-date-browser.mjs','docs/REPLAY_DATE_VALIDATION.md']:
 Path(p).parent.mkdir(parents=True,exist_ok=True);Path(p).write_text(show(PR,p).replace('1.30.1','1.30.2'))
for p in [*Path('dist').glob('*.js'),Path('dist/index.html'),Path('package.json')]:
 t=p.read_text()
 if '1.30.1' in t:p.write_text(t.replace('1.30.1','1.30.2'))
for p in ['dist/atlas-price-chart.js','dist/chart-replay-snapshot.js','dist/chart-replay-renderer.js','dist/chart-replay.css','dist/long-horizon-forecast.js','dist/cycle-milestones-view.js','dist/cycle-interval-overlay.js','dist/data/btc-volume.json','dist/ipo-view.js','dist/ipo-view.css','tests/ipo-view.test.mjs']:
 assert show(MAIN,p)==Path(p).read_text(),'Must preserve latest main bytes: '+p
for p in paths+['tests/replay-date-input.test.mjs','scripts/verify-replay-date-browser.mjs','docs/REPLAY_DATE_VALIDATION.md']:
 assert normal(show(PR,p))==normal(Path(p).read_text()),'No replay behavior changes after tested candidate: '+p
assert json.loads(Path('package.json').read_text())['version']=='1.30.2'
