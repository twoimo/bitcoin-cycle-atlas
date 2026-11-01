from pathlib import Path
import subprocess, shutil
p=Path('dist/chart-replay.js')
assert subprocess.check_output(['git','hash-object',str(p)],text=True).strip()=='7d657f039f4a89feeeeba2acf20a9863ad1c3975'
s=p.read_text()
anchor='export function mountChartReplay('
helper='''/** Manual date entry is an exact UTC calendar selection, not pointer snapping.
 * Validate domain bounds even if a browser does not expose native validity. */
export function replayDateInputError(value,min,max){
  const calendarDate=text=>{
    if(typeof text!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)||text.startsWith('0000-'))return false;
    const time=Date.parse(text+'T00:00:00Z');
    return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===text;
  };
  if(!value)return '새 시작점 날짜를 입력해 주세요.';
  if(!calendarDate(value))return '존재하는 날짜를 연·월·일로 입력해 주세요.';
  if(!calendarDate(min)||!calendarDate(max)||min>max)return '선택 가능한 실제 봉의 날짜 범위를 확인할 수 없습니다.';
  if(value<min||value>max)return '선택 가능한 날짜는 '+min+' ~ '+max+'입니다. 기존 시작점은 유지됩니다.';
  return '';
}

'''
assert s.count(anchor)==1
s=s.replace(anchor,helper+anchor)
def replace(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
replace('<input type="date" data-cr="date" aria-label="새 시작점 날짜">','<input type="date" data-cr="date" aria-label="새 시작점 날짜" required>')
replace("  const q=key=>panel.querySelector('[data-cr=\"'+key+'\"]');", "  const q=key=>panel.querySelector('[data-cr=\"'+key+'\"]');\n  q('date-hint').id='replay-date-hint-'+symbol;q('date-hint').setAttribute('aria-live','polite');\n  q('date').setAttribute('aria-describedby',q('date-hint').id);")
replace("  function discardDateDraft(){if(dateDraftBase!==null){q('date').value=dateDraftBase;dateDraftBase=null;}}", """  function dateHint(){return atlasAvailable&&['atlas-chart','project-baseline'].includes(q('mode').value)?'선택한 날짜부터 실제 봉을 숨깁니다. 「이 날짜 선택」을 눌러야 적용됩니다.':'선택한 날짜까지의 자료로 예측을 고정합니다. 「이 날짜 선택」을 눌러야 적용됩니다.';}
  function clearDateValidation(){q('date').setCustomValidity?.('');q('date').setAttribute('aria-invalid','false');q('date-hint').textContent=dateHint();}
  function discardDateDraft(){if(dateDraftBase!==null){q('date').value=dateDraftBase;dateDraftBase=null;}clearDateValidation();}""")
replace("  function openDateView(){\n    controller.pause();", "  function openDateView(){\n    controller.pause();clearDateValidation();")
replace("    q('date-hint').textContent=atlasMode?'선택한 날짜부터 실제 봉을 숨깁니다. 「이 날짜 선택」을 눌러야 적용됩니다.':'선택한 날짜까지의 자료로 예측을 고정합니다. 「이 날짜 선택」을 눌러야 적용됩니다.';","    clearDateValidation();")
manual='''  function submitDateStart(){
    const input=q('date');
    if(!active||choice||!archive||input.disabled||q('start').disabled)return;
    clearDateValidation();
    const value=input.value;
    let error=replayDateInputError(value,input.min,input.max);
    if(!error&&input.checkValidity?.()===false)error='유효한 시작점 날짜를 입력해 주세요.';
    // In-range gaps must not silently select a different observed day either.
    if(!error&&nearestOrigin(value)!==value)error='이 날짜의 실제 봉이 없습니다. 다른 날짜를 선택해 주세요.';
    if(error){
      input.setCustomValidity?.(error);input.setAttribute('aria-invalid','true');
      q('date-hint').textContent=error;input.reportValidity?.();
      return;
    }
    return chooseStart(value);
  }
'''
replace('  function randomStart(){',manual+'  function randomStart(){')
replace("  q('start').onclick=()=>void chooseStart(q('date').value);q('date').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void chooseStart(q('date').value);}};", "  q('start').onclick=()=>void submitDateStart();q('date').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void submitDateStart();}};\n  q('date').oninput=clearDateValidation;q('date').onchange=clearDateValidation;")
p.write_text(s)
p=Path('tests/replay-fixed-forecast-ui.test.mjs');s=p.read_text();needle='// Match the existing UI suite:';assert s.count(needle)==1;p.write_text(s.replace(needle,Path('/tmp/date50/ui-tests.mjs').read_text()+needle))
for source,dest in [('date-input.test.mjs','tests/replay-date-input.test.mjs'),('verify-date-browser.mjs','scripts/verify-replay-date-browser.mjs'),('README.md','docs/REPLAY_DATE_VALIDATION.md')]:
 assert not Path(dest).exists(),dest
 shutil.copyfile('/tmp/date50/'+source,dest)
for p in [*Path('dist').glob('*.js'),Path('dist/index.html'),Path('package.json')]:
 s=p.read_text()
 if '1.29.9' in s:p.write_text(s.replace('1.29.9','1.29.10'))
