// Authoring only. The workbook needs no scripts, macros, add-ons or network access.
// Run in a temporary directory with @oai/artifact-tool available; see docs/verification.md.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const root = process.argv[2];
const outputDir = process.argv[3];
if (!root || !outputDir) throw Error('Usage: build_workbook.mjs REPO_ROOT OUTPUT_DIR');
const scenarios = JSON.parse(await fs.readFile(path.join(root, 'examples/scenarios.json'), 'utf8'));
const expected = JSON.parse(await fs.readFile(path.join(root, 'examples/scenario-results.json'), 'utf8'));
const wb = Workbook.create();
const sheets = Object.fromEntries(['Scorecard','Settings','Events','E1','E2','Slots','Effort','Subgroups'].map(n=>[n,wb.worksheets.add(n)]));
const N=201, SN=31, EN=101;
const headers={
  Settings:['setting','value'],
  Events:Object.keys(scenarios.all_pass.events[0]),
  E1:Object.keys(scenarios.all_pass.E1[0]), E2:Object.keys(scenarios.all_pass.E2[0]),
  Slots:Object.keys(scenarios.all_pass.slots[0]), Effort:Object.keys(scenarios.all_pass.effort[0]),
};
const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const set=(s,c,v)=>sheets[s].getRange(c).values=[[v]];
const formula=(s,c,v)=>sheets[s].getRange(c).formulas=[[v]];
const header=(s,r,last)=>{let q=sheets[s].getRange(`A${r}:${last}${r}`);q.format.fill='#183B4E';q.format.font={name:'Arial',size:10,bold:true,color:'#FFFFFF'};q.format.horizontalAlignment='center';q.format.rowHeight=42;};
for(const [name,s] of Object.entries(sheets)){
  s.showGridLines=false;s.getRange('A1:R205').format.font={name:'Arial',size:10};
  s.getRange('A1:R205').format.columnWidth=18;s.getRange('A1:R205').format.rowHeight=22;
  s.getRange('A1:R205').format.verticalAlignment='center';s.getRange('A1:R205').format.wrapText=true;
  if(headers[name]){s.getRange(`A1:${col(headers[name].length)}1`).values=[headers[name]];header(name,1,col(headers[name].length));s.freezePanes.freezeRows(1);}
}
for(const name of ['E1','E2']){
  const s=sheets[name];s.freezePanes.freezeColumns(1);
  s.getRange(`A2:P${N}`).format.fill='#FFF4D6';set(name,'Q1','input_check');header(name,1,'Q');
  const r=c=>`$${c}$2:$${c}$${N}`;
  const rows=[];
  for(let i=2;i<=N;i++){
    const validList=(c,values)=>`OR(${values.map(v=>`${c}${i}="${v}"`).join(',')})`;
    const suffix=`MID(B${i},IF(LEFT(B${i},2)="V-",3,5),30)`;
    const conditions=[`A${i}<>""`,`COUNTIF(${r('A')},A${i})=1`,
      `OR(LEFT(B${i},2)="V-",LEFT(B${i},4)="SYN-")`,
      `LEN(${suffix})>0`,`ISNUMBER(VALUE(${suffix}))`,`VALUE(${suffix})>=0`,`MOD(VALUE(${suffix}),1)=0`,
      `COUNTIFS(Slots!$A$2:$A$${SN},"${name}",Slots!$B$2:$B$${SN},C${i})=1`,
      `ISNUMBER(SEARCH("|"&D${i}&"|","|"&Settings!$B$9&"|"))`,
      validList('E',['regular','first']),validList('F',['include','duplicate','late']),validList('H',['yes','no']),
      validList('I',['success','failed','unknown','not_sent']),validList('K',['yes','no','none','conflict','unknown']),
      validList('L',['text','emoji','voice','none','unknown']),validList('M',['yes','no','unknown']),validList('N',['yes','no','unknown']),
      `ISNUMBER(O${i})`,`OR(O${i}=0,O${i}=1)`,validList('P',['','soft_yes','forgot','time_place','clash','travel','personal','unknown','silent_but_came']),
      `OR(I${i}<>"success",AND(J${i}<>"",COUNTIFS(${r('J')},J${i},${r('I')},"success")=1))`,
      `OR(I${i}<>"not_sent",J${i}="")`,
      `IF(F${i}="duplicate",AND(COUNTIFS(${r('A')},G${i},${r('B')},B${i},${r('C')},C${i},${r('F')},"include")=1,H${i}="no",I${i}="not_sent",K${i}="none",M${i}="no",N${i}="no",O${i}=0),AND(G${i}="",N${i}<>"unknown",COUNTIFS(${r('B')},B${i},${r('F')},"<>duplicate")=1))`,
      `IF(F${i}="include",AND(H${i}="yes",K${i}<>"conflict",K${i}<>"unknown",M${i}<>"unknown",IF(OR(K${i}="yes",K${i}="no"),AND(M${i}="yes",OR(L${i}="text",L${i}="emoji",L${i}="voice")),L${i}="none")),TRUE)`,
      `IF(F${i}="late",AND(H${i}="no",I${i}="not_sent",K${i}="none",L${i}="none",O${i}=0),TRUE)`,
    ];
    rows.push([`=IF(COUNTA(A${i}:P${i})=0,"",IFERROR(IF(AND(${conditions.join(',')}),"OK","CHECK"),"CHECK"))`]);
  }
  s.getRange(`Q2:Q${N}`).formulas=rows;
  for(const [c,values] of Object.entries({D:['EN','ZH','MS','TA'],E:['regular','first'],F:['include','duplicate','late'],H:['yes','no'],I:['success','failed','unknown','not_sent'],K:['yes','no','none','conflict','unknown'],L:['text','emoji','voice','none','unknown'],M:['yes','no','unknown'],N:['yes','no','unknown'],P:['soft_yes','forgot','time_place','clash','travel','personal','unknown','silent_but_came']}))s.getRange(`${c}2:${c}${N}`).dataValidation={rule:{type:'list',values}};
  s.getRange(`O2:O${N}`).dataValidation={rule:{type:'whole',operator:'between',formula1:0,formula2:1}};
  s.getRange(`A2:D${N}`).setNumberFormat('@');s.getRange(`J2:J${N}`).setNumberFormat('@');
  s.getRange(`Q2:Q${N}`).conditionalFormats.add('containsText',{text:'CHECK',format:{fill:'#FDE4E1',font:{color:'#A12318',bold:true}}});
}
set('Settings','C1','input_check');header('Settings',1,'C');
sheets.Settings.getRange('A1:A14').format.columnWidth=29;sheets.Settings.getRange('B1:B14').format.columnWidth=27;
sheets.Settings.getRange('B2:B14').format.fill='#FFF4D6';
for(let r=2;r<=8;r++){
 let c=`AND(ISNUMBER(B${r}),B${r}>=0${[2,3,4,6,7].includes(r)?`,B${r}<=1`:`,MOD(B${r},1)=0`}${r===2?',B2=1':''}${r===8?',B8>0':''})`;
 formula('Settings',`C${r}`,`=IFERROR(IF(${c},"OK","CHECK"),"CHECK")`);
}
// Accept only exact predefined language sets; prevents unmeasured/duplicate groups.
const languages=['EN','ZH','MS','TA'];
const subsets=[];for(let mask=1;mask<16;mask++){const v=languages.filter((_,i)=>mask&(1<<i));if(v.length>=2)subsets.push(v.join('|'));}
formula('Settings','C9',`=IF(OR(${subsets.map(v=>`B9="${v}"`).join(',')}),"OK","CHECK")`);
for(const r of [10,11]){formula('Settings',`C${r}`,`=IF(OR(B${r}="pending",B${r}="yes",B${r}="no"),"OK","CHECK")`);sheets.Settings.getRange(`B${r}`).dataValidation={rule:{type:'list',values:['pending','yes','no']}};}
formula('Settings','C14','=IF(B14="","CHECK","OK")');
set('Settings','A17','Proposal only');set('Settings','B17','Confirm all values and the operational checklist before sends.');
sheets.Settings.getRange('A17:C18').format.rowHeight=45;

set('Events','R1','input_check');header('Events',1,'R');sheets.Events.getRange('A2:Q3').format.fill='#FFF4D6';
for(let i=2;i<=3;i++){
 const eid=`E${i-1}`, tests=[`A${i}="${eid}"`,`B${i}="${i===2?'onePA':'ground'}"`,
 `ISNUMBER(DATEVALUE(C${i}))`,`ISNUMBER(DATEVALUE(D${i}))`,`ISNUMBER(DATEVALUE(E${i}))`,`D${i}<=E${i}`,`E${i}<=C${i}`,
 `LEN(F${i})=5`,`MID(F${i},3,1)=":"`,`VALUE(LEFT(F${i},2))>=0`,`VALUE(LEFT(F${i},2))<=23`,`VALUE(RIGHT(F${i},2))>=0`,`VALUE(RIGHT(F${i},2))<=59`,
 `ISNUMBER(G${i})`,`G${i}=COUNTIF(${eid}!$F$2:$F$${N},"include")`,`G${i}>0`,
 ...['H','I','J'].map(c=>`${c}${i}="yes"`),...['K','L','M','N'].map(c=>`AND(ISNUMBER(${c}${i}),${c}${i}>=0)`),
 ...['K','L','M'].map(c=>`MOD(${c}${i},1)=0`),`L${i}<=K${i}`,`M${i}<=K${i}`,
 `OR(O${i}="primary",O${i}="second")`,`OR(P${i}="yes",P${i}="no",P${i}="unknown")`,`OR(Q${i}="yes",Q${i}="no",Q${i}="unknown")`,
 `COUNTIF(Slots!$A$2:$A$${SN},A${i})>0`,`COUNTIF(Effort!$B$2:$B$${EN},A${i})>0`,
 `OR(SUM(${eid}!O2:O${N})=0,SUMIFS(Effort!$E$2:$E$${EN},Effort!$B$2:$B$${EN},A${i},Effort!$D$2:$D$${EN},"nudge")>0)`];
 formula('Events',`R${i}`,`=IFERROR(IF(AND(${tests.join(',')}),"OK","CHECK"),"CHECK")`);
}
sheets.Events.getRange('C2:F3').setNumberFormat('@');
set('Effort','F1','input_check');header('Effort',1,'F');sheets.Effort.getRange(`A2:E${EN}`).format.fill='#FFF4D6';
for(let i=2;i<=EN;i++)formula('Effort',`F${i}`,`=IF(COUNTA(A${i}:E${i})=0,"",IFERROR(IF(AND(A${i}<>"",COUNTIF($A$2:$A$${EN},A${i})=1,OR(B${i}="E1",B${i}="E2"),OR(C${i}="primary",C${i}="second",C${i}="other"),OR(${['chasing','nudge','reply_logging','reconciliation','setup','handover'].map(v=>`D${i}="${v}"`).join(',')}),ISNUMBER(E${i}),E${i}>=0),"OK","CHECK"),"CHECK"))`);
sheets.Effort.getRange(`D2:D${EN}`).dataValidation={rule:{type:'list',values:['chasing','nudge','reply_logging','reconciliation','setup','handover']}};
sheets.Effort.getRange('D1:D101').format.columnWidth=24;
set('Slots','J1','input_check');header('Slots',1,'J');sheets.Slots.getRange(`A2:E${SN}`).format.fill='#FFF4D6';
for(let i=2;i<=SN;i++){
 formula('Slots',`J${i}`,`=IF(COUNTA(A${i}:E${i})=0,"",IFERROR(IF(AND(OR(A${i}="E1",A${i}="E2"),B${i}<>"",C${i}<>"",D${i}<>"",ISNUMBER(E${i}),E${i}>=0,MOD(E${i},1)=0,COUNTIFS($A$2:$A$${SN},A${i},$B$2:$B$${SN},B${i})=1),"OK","CHECK"),"CHECK"))`);
 const count=(event,attendance)=>`COUNTIFS(${event}!$C$2:$C$${N},B${i},${event}!$F$2:$F$${N},"${attendance?'<>duplicate':'include'}",${event}!$${attendance?'N':'K'}$2:$${attendance?'N':'K'}$${N},"yes")`;
 formula('Slots',`F${i}`,`=IF(A${i}="","",IF(J${i}<>"OK","CHECK",IF(A${i}="E1",${count('E1',false)},${count('E2',false)})))`);
 formula('Slots',`G${i}`,`=IF(A${i}="","",IF(ISNUMBER(F${i}),MAX(0,E${i}-F${i}),"CHECK"))`);
 formula('Slots',`H${i}`,`=IF(A${i}="","",IF(J${i}<>"OK","CHECK",IF(A${i}="E1",${count('E1',true)},${count('E2',true)})))`);
 formula('Slots',`I${i}`,`=IF(A${i}="","",IF(ISNUMBER(H${i}),MAX(0,E${i}-H${i}),"CHECK"))`);
}

const sgHeaders=['event','dimension','group','metric','numerator','denominator','other_numerator','other_denominator','gap_pp','result'];
sheets.Subgroups.getRange('A1:J1').values=[sgHeaders];header('Subgroups',1,'J');sheets.Subgroups.freezePanes.freezeRows(1);
let gRow=2;
for(const event of ['E1','E2'])for(const [dimension,groups,c] of [['experience',['regular','first'],'E'],['language',languages,'D']])for(const group of groups)for(const metric of ['T1','T4']){
 const r=gRow++, sc=event==='E1'?'B':'C';
 sheets.Subgroups.getRange(`A${r}:D${r}`).values=[[event,dimension,group,metric]];
 const range=c=>`${event}!$${c}$2:$${c}$${N}`;
 const count=(complement,numerator)=>{
  let args=[range('F'),'"include"',range(c),complement?`"<>"&C${r}`:`C${r}`];
  if(metric==='T1')args.push(range('K'),'"yes"');
  if(metric==='T4')args.push(range('I'),'"success"');
  if(numerator){if(metric==='T1')args.push(range('N'),'"yes"');else return `COUNTIFS(${args.join(',')},${range('K')},"yes")+COUNTIFS(${args.join(',')},${range('K')},"no")`;}
  return `COUNTIFS(${args.join(',')})`;
 };
 for(const [cell,comp,num] of [['E',false,true],['F',false,false],['G',true,true],['H',true,false]])formula('Subgroups',`${cell}${r}`,`=${count(comp,num)}`);
 formula('Subgroups',`I${r}`,`=IF(OR(F${r}=0,H${r}=0),"",100*(G${r}/H${r}-E${r}/F${r}))`);
 formula('Subgroups',`J${r}`,`=IF(AND(B${r}="language",NOT(ISNUMBER(SEARCH("|"&C${r}&"|","|"&Settings!$B$9&"|")))),"OUT OF SCOPE",IF(Scorecard!${sc}8<>"PASS","BLOCKED",IF(OR(F${r}<Settings!$B$8,H${r}<Settings!$B$8),"INCONCLUSIVE",IF(ROUND(I${r},10)>100*Settings!$B$7,"FAIL","PASS"))))`);
}
sheets.Subgroups.getRange(`I2:I${gRow-1}`).setNumberFormat('0.0');

const labels={1:"Who's actually coming?",2:'Two-event measurement kit',4:'Human approvals',5:'Pilot outcome',7:'Acceptance test',8:'T0 Successful sends / intended',9:'T1 Attended confirmations / confirmed',10:'T2 Chasing / baseline minutes',11:'T3 Never replied but attended',12:'T4 Deadline replies / successful sends',13:'T6 Subgroup differences',14:'T7 Independent operation',15:'T5 Both lanes (T1–T4)',17:'Diagnostic measure',18:'Intended confirmations',19:'Successful sends',20:'Confirmed by deadline',21:'Confirmed and attended',22:'Deadline replies 1 or 2',23:'Never replied but attended',24:'Chasing minutes incl. nudges',25:'Baseline chasing minutes',26:'Total organiser minutes',27:'Data checks requiring resolution',28:'T0 rate',29:'T1 rate',30:'T2 ratio',31:'T4 rate',33:'Source',34:'Input cells',35:'Capacity',36:'Limits',37:'Shortfalls'};
for(const [r,v] of Object.entries(labels))set('Scorecard',`A${r}`,v);
set('Scorecard','B7','E1');set('Scorecard','C7','E2');set('Scorecard','B17','E1');set('Scorecard','C17','E2');
set('Scorecard','B33',"Implementation plan v1.1, 21 Oct 2026; rules clarified in docs/scoring.md.");
set('Scorecard','B34','Amber cells are editable. Read the organiser guide before use.');
set('Scorecard','B35','200 roster rows/event; 30 role slots; 100 effort entries. Do not append past these ranges.');
set('Scorecard','B36','Synthetic tests validate calculations only. No real event result is included.');
set('Scorecard','B37','Slots shows deadline and actual shortages. Counts are provisional until input checks are resolved.');
for(const r of [33,34,35,36,37]){const note=sheets.Scorecard.getRange(`B${r}`).values[0][0];sheets.Scorecard.getRange(`B${r}:F${r}`).merge();set('Scorecard',`B${r}`,note);sheets.Scorecard.getRange(`A${r}:F${r}`).format.rowHeight=40;}
for(const [event,c,er] of [['E1','B',2],['E2','C',3]]){
 const range=x=>`${event}!$${x}$2:$${x}$${N}`;
 const count=(...pairs)=>`COUNTIFS(${[range('F'),'"include"',...pairs.flatMap(([col,v])=>[range(col),`"${v}"`])].join(',')})`;
 formula('Scorecard',`${c}18`,`=${count()}`);
 formula('Scorecard',`${c}19`,`=${count(['I','success'])}`);
 formula('Scorecard',`${c}20`,`=${count(['K','yes'])}`);
 formula('Scorecard',`${c}21`,`=${count(['K','yes'],['N','yes'])}`);
 formula('Scorecard',`${c}22`,`=${count(['K','yes'],['I','success'])}+${count(['K','no'],['I','success'])}`);
 formula('Scorecard',`${c}23`,`=${count(['M','no'],['N','yes'])}`);
 const minutes=activity=>`SUMIFS(Effort!$E$2:$E$${EN},Effort!$B$2:$B$${EN},"${event}"${activity?`,Effort!$D$2:$D$${EN},"${activity}"`:''})`;
 formula('Scorecard',`${c}24`,`=${minutes('chasing')}+${minutes('nudge')}`);
 formula('Scorecard',`${c}25`,`=IF(ISNUMBER(Events!N${er}),Events!N${er},"")`);
 formula('Scorecard',`${c}26`,`=${minutes()}`);
 formula('Scorecard',`${c}27`,`=COUNTIF(${range('Q')},"CHECK")+COUNTIF(Settings!C2:C14,"CHECK")+IF(Events!R${er}="OK",0,1)+IF(AND(COUNTIF(Events!B2:B3,"onePA")=1,COUNTIF(Events!B2:B3,"ground")=1),0,1)+COUNTIF(Slots!J2:J${SN},"CHECK")+COUNTIF(Effort!F2:F${EN},"CHECK")+IF(COUNTA(${event}!A:A)>COUNTA(${event}!A1:A${N}),1,0)+IF(COUNTA(Slots!A:A)>COUNTA(Slots!A1:A${SN}),1,0)+IF(COUNTA(Effort!A:A)>COUNTA(Effort!A1:A${EN}),1,0)`);
 for(const [row,num,den] of [[28,19,18],[29,21,20],[30,24,25],[31,22,19]])formula('Scorecard',`${c}${row}`,`=IF(OR(${c}${den}="",${c}${den}=0),"",${c}${num}/${c}${den})`);
 formula('Scorecard',`${c}8`,`=IF(${c}27>0,"BLOCKED",IF(${c}18=0,"INCONCLUSIVE",IF(${c}19=${c}18,"PASS","FAIL")))`);
 for(const [row,rateRow,den,threshold] of [[9,29,20,'Settings!$B$3'],[12,31,19,'Settings!$B$6']])formula('Scorecard',`${c}${row}`,`=IF(${c}8<>"PASS","BLOCKED",IF(${c}${den}=0,"INCONCLUSIVE",IF(${c}${rateRow}>=${threshold},"PASS","FAIL")))`);
 formula('Scorecard',`${c}10`,`=IF(${c}27>0,"BLOCKED",IF(${c}25=0,"INCONCLUSIVE",IF(${c}24<=Settings!$B$4*${c}25,"PASS","FAIL")))`);
 formula('Scorecard',`${c}11`,`=IF(${c}8<>"PASS","BLOCKED",IF(${c}23<=Settings!$B$5,"PASS","FAIL"))`);
 const gcount=status=>`COUNTIFS(Subgroups!$A$2:$A$${gRow-1},"${event}",Subgroups!$J$2:$J$${gRow-1},"${status}")`;
 formula('Scorecard',`${c}13`,`=IF(${c}8<>"PASS","BLOCKED",IF(${gcount('FAIL')}>0,"FAIL",IF(${gcount('INCONCLUSIVE')}>0,"INCONCLUSIVE","PASS")))`);
 formula('Scorecard',`${c}14`,`=IF(OR(${c}27>0,Events!P${er}="unknown",Events!Q${er}="unknown"),"BLOCKED",IF(OR(Events!P${er}="no",Events!Q${er}="no",AND(Events!B${er}="ground",Events!O${er}<>"second")),"FAIL","PASS"))`);
 sheets.Scorecard.getRange(`${c}28:${c}31`).setNumberFormat('0.0%');
}
const combined=range=>`IF(COUNTIF(${range},"FAIL")>0,"FAIL",IF(COUNTIF(${range},"BLOCKED")>0,"BLOCKED",IF(COUNTIF(${range},"INCONCLUSIVE")>0,"INCONCLUSIVE","PASS")))`;
formula('Scorecard','B15',`=${combined('B9:C12')}`);
formula('Scorecard','B4','=IFERROR(IF(AND(Settings!B10="yes",Settings!B11="yes",Settings!B12<>"",ISNUMBER(DATEVALUE(Settings!B13)),Settings!B13<Events!D2,Settings!B13<Events!D3),"CONFIRMED","PENDING"),"PENDING")');
formula('Scorecard','B5',`=IF(B4<>"CONFIRMED","BLOCKED",${combined('B8:C14')})`);
sheets.Scorecard.getRange('A1:A37').format.columnWidth=42;sheets.Scorecard.getRange('B1:C37').format.columnWidth=23;
sheets.Scorecard.getRange('D1:F37').format.columnWidth=14;
sheets.Scorecard.getRange('A1:F1').merge();set('Scorecard','A1',"Who's actually coming?");sheets.Scorecard.getRange('A1').format.font={name:'Arial',size:16,bold:true,color:'#183B4E'};
for(const r of [7,17])header('Scorecard',r,'C');
sheets.Scorecard.getRange('A8:C14').format.rowHeight=36;
for(const name of ['Scorecard','Subgroups'])for(const status of ['FAIL','BLOCKED','INCONCLUSIVE'])sheets[name].getUsedRange().conditionalFormats.add('containsText',{text:status,format:{fill:status==='FAIL'?'#FDE4E1':'#FFF4D6',font:{color:status==='FAIL'?'#A12318':'#765408'}}});

function writeData(data){
 for(const [name,rows] of Object.entries({Settings:Object.entries(data.settings).map(([setting,value])=>({setting,value})),Events:data.events,E1:data.E1,E2:data.E2,Slots:data.slots,Effort:data.effort})){
  const cols=headers[name], max=name==='Settings'?14:name==='Events'?3:name==='Slots'?SN:name==='Effort'?EN:N;
  const last=name==='Slots'?'E':col(cols.length);
  sheets[name].getRange(`A2:${last}${max}`).clear({applyTo:'contents'});
  if(rows.length){
   const fields=name==='Slots'?cols.slice(0,5):cols;
   const numbers=new Set(['intended_count','baseline_yes','baseline_attended','baseline_chased','baseline_minutes','nudge_count','required','minutes']);
   const values=rows.map(r=>fields.map(k=>{
    const v=r[k]??'';
    if(name==='Settings' && ['t0_min','t1_min','t2_max_ratio','t3_max','t4_min','t6_max_gap','subgroup_min'].includes(r.setting) && k==='value' && v!=='')return Number(v);
    return numbers.has(k)&&v!==''?Number(v):v;
   }));
   sheets[name].getRange(`A2:${col(fields.length)}${rows.length+1}`).values=values;
  }
 }
 wb.recalculate();
}

await fs.mkdir(outputDir,{recursive:true});
const verification=[];
for(const [name,data] of Object.entries(scenarios)){
 writeData(data);
 const exp=expected[name];
 if(sheets.Scorecard.getRange('B5').values[0][0]!==exp.gate)console.log(JSON.stringify({name,score:sheets.Scorecard.getRange('B27:C27').values,roster:sheets.E1.getRange('Q2:Q3').values,settings:sheets.Settings.getRange('A2:C14').values,events:sheets.Events.getRange('R2:R3').values}));
 assert.equal(sheets.Scorecard.getRange('B5').values[0][0],exp.gate,`${name}: gate`);
 assert.equal(sheets.Scorecard.getRange('B15').values[0][0],exp.T5.status,`${name}: T5`);
 for(let e=0;e<2;e++)for(const [test,row] of [['T0',8],['T1',9],['T2',10],['T3',11],['T4',12],['T6',13],['T7',14]]){
  assert.equal(sheets.Scorecard.getRange(`${e?'C':'B'}${row}`).values[0][0],exp.events[e].tests[test].status,`${name}: E${e+1} ${test}`);
 }
 const groupRows=sheets.Subgroups.getRange(`A2:J${gRow-1}`).values;
 const slotRows=sheets.Slots.getRange(`A2:I${SN}`).values;
 for(const event of exp.events){
  for(const g of event.subgroups){
   const row=groupRows.find(r=>r[0]===event.event_id&&r[1]===g.dimension&&r[2]===g.group&&r[3]===g.metric);
   assert.deepEqual(row.slice(4,8),[g.numerator,g.denominator,g.complement_numerator,g.complement_denominator],`${name}: subgroup counts`);
   assert.equal(row[9],g.status,`${name}: subgroup status`);
   if(g.gap_pp!==null)assert.ok(Math.abs(row[8]-g.gap_pp)<1e-9,`${name}: subgroup gap`);
  }
  for(const role of event.roles){
   const row=slotRows.find(r=>r[0]===event.event_id&&r[1]===role.slot_id);
   assert.deepEqual(row.slice(5,9),[role.confirmed,role.shortfall,role.attended,role.actual_shortfall],`${name}: role shortfalls`);
  }
 }
 if(name==='all_pass'){
  assert.equal(sheets.Scorecard.getRange('B26').values[0][0],65);
  assert.equal(sheets.Slots.getRange('G2').values[0][0],0);
 }
 if(name==='dropped_messages')assert.equal(sheets.Scorecard.getRange('B28').values[0][0],.9);
 verification.push({scenario:name,gate:exp.gate,checks:'T0–T7 match independent Python scorer'});
}
// Boundary input changes are evaluated in the same workbook, not hardcoded outputs.
writeData(scenarios.all_pass);
set('E1','N2','');wb.recalculate();assert.equal(sheets.Scorecard.getRange('B5').values[0][0],'BLOCKED');
writeData(scenarios.all_pass);
set('Events','N2',0);wb.recalculate();assert.equal(sheets.Scorecard.getRange('B10').values[0][0],'INCONCLUSIVE');
writeData(scenarios.all_pass);
const lastRoster=sheets.E1.getRange('A61:P61').values;
sheets.E1.getRange('A61:P61').clear({applyTo:'contents'});sheets.E1.getRange('A201:P201').values=lastRoster;
wb.recalculate();assert.equal(sheets.Scorecard.getRange('B5').values[0][0],'PASS');
writeData(scenarios.all_pass);
set('E1','A202','OVERFLOW');wb.recalculate();assert.equal(sheets.Scorecard.getRange('B5').values[0][0],'BLOCKED');
sheets.E1.getRange('A202').clear({applyTo:'contents'});
// Capture sample views for visual QA, then restore a blank template for delivery.
writeData(scenarios.all_pass);
for(const [name,range] of [['Scorecard','A1:C31'],['Settings','A1:C18'],['Events','A1:I3'],['Events','J1:R3'],['E1','A1:H7'],['E1','I1:Q7'],['E2','A1:H7'],['E2','I1:Q7'],['Slots','A1:J6'],['Effort','A1:F8'],['Subgroups','A1:J15']]){
 const png=await wb.render({sheetName:name,range,scale:1,format:'png'});
 await fs.writeFile(path.join(outputDir,`${name}-${range.replace(':','-')}.png`),new Uint8Array(await png.arrayBuffer()));
}
const blank=structuredClone(scenarios.all_pass);
blank.settings.thresholds_approved='pending';blank.settings.operations_approved='pending';blank.settings.approved_by='';blank.settings.approved_on='';
blank.events=blank.events.map((e,i)=>Object.fromEntries(Object.keys(e).map(k=>[k,k==='event_id'?`E${i+1}`:k==='lane'?(i?'ground':'onePA'):['roster_frozen','records_complete','effort_complete'].includes(k)?'no':['independent','no_parallel_list'].includes(k)?'unknown':''])));
blank.E1=[];blank.E2=[];blank.slots=[];blank.effort=[];writeData(blank);
assert.equal(sheets.Scorecard.getRange('B5').values[0][0],'BLOCKED');
const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:50},summary:'Formula error scan'});
const finalPreview=await wb.render({sheetName:'Scorecard',range:'A1:F37',scale:1,format:'png'});
await fs.writeFile(path.join(outputDir,'blank-scorecard.png'),new Uint8Array(await finalPreview.arrayBuffer()));
await fs.writeFile(path.join(outputDir,'formula-error-scan.txt'),errors.ndjson);
await fs.writeFile(path.join(outputDir,'workbook-verification.json'),JSON.stringify({scenarios:verification,detailParity:'Subgroup counts, gaps and statuses; role confirmations, attendance and shortfalls',boundaries:['missing attendance blocks','zero baseline inconclusive','last supported row 201 scores','row 202 overflow blocks','blank template blocked']},null,2)+'\n');
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(path.join(outputDir,'Pilot_Measurement_Kit.xlsx'));
console.log(JSON.stringify({exported:path.join(outputDir,'Pilot_Measurement_Kit.xlsx'),scenarioParity:verification.length,formulaScan:errors.ndjson}));
