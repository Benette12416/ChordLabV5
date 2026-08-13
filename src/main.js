import { createClient } from '@supabase/supabase-js';


(()=>{
'use strict';
const $=id=>document.getElementById(id), uid=()=>Math.random().toString(36).slice(2,9);
const N=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'], FLAT={'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B','Fb':'E'}, SF={'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb'}, KEYS=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const TYPES=[['maj13',[0,4,7,11,14,21]],['m13',[0,3,7,10,14,21]],['maj11',[0,4,7,11,14,17]],['m11',[0,3,7,10,14,17]],['maj9',[0,4,7,11,14]],['m9',[0,3,7,10,14]],['13',[0,4,7,10,14,21]],['11',[0,4,7,10,14,17]],['7#9',[0,4,7,10,15]],['7b9',[0,4,7,10,13]],['m7b5',[0,3,6,10]],['dim7',[0,3,6,9]],['maj7',[0,4,7,11]],['m7',[0,3,7,10]],['add9',[0,4,7,14]],['6/9',[0,4,7,9,14]],['sus4',[0,5,7]],['sus2',[0,2,7]],['9',[0,4,7,10,14]],['7',[0,4,7,10]],['6',[0,4,7,9]],['dim',[0,3,6]],['aug',[0,4,8]],['m',[0,3,7]],['',[0,4,7]]];
const STYLE={worship:'Worship',gospel:'Gospel',jazz:'Jazz',blues:'Blues',neosoul:'Neo Soul'}, WHITE=new Set([0,2,4,5,7,9,11]);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function chord(symbol,beats=4,kind='normal',why='Original harmony'){return{id:uid(),symbol,beats,kind,why}}
const S={
 title:'My Worship Song',key:'G',mode:'major',bpm:72,style:'worship',complexity:3,
 sections:[
  {id:uid(),name:'Intro',chords:[chord('G'),chord('D/F#'),chord('Em7'),chord('Cadd9')]},
  {id:uid(),name:'Verse',chords:[chord('G'),chord('D'),chord('Em'),chord('C')]},
  {id:uid(),name:'Chorus',chords:[chord('G'),chord('D/F#'),chord('Em7'),chord('Cadd9')]},
  {id:uid(),name:'Bridge',chords:[chord('Em7'),chord('C'),chord('G'),chord('D')]}
 ],
 activeSection:null,selected:null,dragging:null,clipboard:null,undo:[],redo:[],voicings:new Map(),
 ctx:null,samples:new Map(),sampleReady:false,pressed:new Set(),midiAccess:null,
 recording:false,recordStart:0,recordEvents:[],recordTimer:null,playTimers:[],metronomeTimer:null,metroBeat:0,
 me:null,currentSongId:null,currentSongOwner:null,currentRole:null,cloudChannel:null,cloudSaveTimer:null,applyingRemote:false,readOnly:false,pendingInvite:null
};
S.activeSection=S.sections[0].id;

function norm(n){if(!n)return'C';n=n[0].toUpperCase()+n.slice(1);return FLAT[n]||n}
function ni(n){return N.indexOf(norm(n))} function pc(m){return((m%12)+12)%12}
function pretty(n,flat=false){return flat&&SF[n]?SF[n]:n} function midiName(m,flat=false){return pretty(N[pc(m)],flat)+(Math.floor(m/12)-1)}
function parse(sym){
 let raw=(sym||'').trim();if(!raw)return null;let [left,bassRaw]=raw.split('/'),m=left.match(/^([A-Ga-g])([#b]?)(.*)$/);if(!m)return null;
 let rootDisp=m[1].toUpperCase()+m[2],root=norm(rootDisp),suf=(m[3]||'').replace(/^min/,'m').replace(/^Maj/,'maj');if(suf==='M7')suf='maj7';
 let t=TYPES.find(x=>x[0]===suf)||TYPES[TYPES.length-1];return{raw,rootDisp,root,suf,bass:bassRaw?norm(bassRaw):null,intervals:t[1],minor:suf.startsWith('m')&&!suf.startsWith('maj'),dominant:/^(7|9|11|13)/.test(suf)}
}
function cdata(sym){let c=parse(sym);if(!c)return{c:null,pcs:[],notes:[]};let r=ni(c.root),flat=c.rootDisp.includes('b'),pcs=c.intervals.map(i=>(r+i)%12);return{c,pcs,notes:pcs.map(p=>pretty(N[p],flat))}}
function transRoot(root,semitones,flat=false){return pretty(N[(ni(root)+semitones+120)%12],flat)}
function scaleFor(key=S.key,mode=S.mode){let pat=mode==='major'?[0,2,4,5,7,9,11]:[0,2,3,5,7,8,10],r=ni(key),flat=key.includes('b');return pat.map(x=>pretty(N[(r+x)%12],flat))}
function roman(sym){let c=parse(sym);if(!c)return'?';let i=scaleFor().map(norm).indexOf(c.root);if(i<0)return'chromatic';return(S.mode==='major'?['I','ii','iii','IV','V','vi','vii°']:['i','ii°','III','iv','v','VI','VII'])[i]}
function quality(c){if(!c)return'major';if(c.dominant)return'dominant';if(c.minor)return'minor';if(c.suf.includes('dim'))return'diminished';return'major'}
function secDom(target,alt=false){let t=parse(target);if(!t)return null;return transRoot(t.root,7,t.rootDisp.includes('b'))+(alt?'7b9':'7')}
function iiOf(target){let t=parse(target);if(!t)return null;return transRoot(t.root,2,t.rootDisp.includes('b'))+'m7'}
function dimApproach(target){let t=parse(target);if(!t)return null;return transRoot(t.root,-1,t.rootDisp.includes('b'))+'dim7'}

function colorSymbol(sym){
 let c=parse(sym);if(!c)return sym,q=quality(c),l=S.complexity;
 const T={worship:{major:['','add9','maj9','6/9'],minor:['m','m7','m9','m11'],dominant:['7','9','13','13']},gospel:{major:['maj7','maj9','6/9','maj13'],minor:['m7','m9','m11','m13'],dominant:['7','9','13','7b9']},jazz:{major:['maj7','maj9','maj11','maj13'],minor:['m7','m9','m11','m13'],dominant:['7','9','7b9','13']},blues:{major:['7','9','7#9','13'],minor:['m7','m9','m9','m11'],dominant:['7','9','7#9','13']},neosoul:{major:['maj7','maj9','6/9','maj13'],minor:['m7','m9','m11','m13'],dominant:['9','13','7#9','13']}};
 let suf=(T[S.style][q]||T[S.style].major)[l-1],slash=c.bass?'/'+pretty(c.bass,c.rootDisp.includes('b')):'';return c.rootDisp+suf+slash
}
function colorWhy(){return S.style==='gospel'?'Adds gospel extensions while preserving the original harmonic direction.':S.style==='jazz'?'Adds jazz 7ths and upper extensions.':S.style==='blues'?'Adds blues-oriented dominant color and tension.':S.style==='neosoul'?'Adds dense neo-soul extensions for smooth voice leading.':'Adds spacious modern-worship color while preserving the basic progression.'}
function passingFor(next){
 if(S.style==='gospel'){if(S.complexity>=4)return[{symbol:iiOf(next),why:`ii chord beginning a ii–V approach into ${next}.`},{symbol:secDom(next,true),why:`Altered secondary dominant resolving into ${next}.`}];if(S.complexity>=3)return[{symbol:secDom(next),why:`Secondary dominant creating stronger pull into ${next}.`}];return[{symbol:dimApproach(next),why:`Diminished passing chord a semitone below ${next}.`}]}
 if(S.style==='jazz')return S.complexity>=3?[{symbol:iiOf(next),why:`ii chord approaching ${next}.`},{symbol:secDom(next,S.complexity>=4),why:`V chord resolving into ${next}.`}]:[{symbol:secDom(next),why:`Secondary dominant into ${next}.`}];
 if(S.style==='blues')return[{symbol:secDom(next,S.complexity>=3),why:`Dominant approach before ${next}.`}];
 if(S.style==='neosoul')return[{symbol:dimApproach(next),why:`Chromatic diminished connector into ${next}.`}];
 return S.complexity>=3?[{symbol:dimApproach(next),why:`Smooth chromatic connector into ${next}.`}]:[]
}

function serializable(){return{title:S.title,key:S.key,mode:S.mode,bpm:S.bpm,style:S.style,complexity:S.complexity,sections:JSON.parse(JSON.stringify(S.sections)),activeSection:S.activeSection,selected:S.selected}}
function applyState(x,record=false){if(record)pushUndo();S.title=x.title||'Untitled';S.key=x.key||'C';S.mode=x.mode||'major';S.bpm=+x.bpm||72;S.style=x.style||'worship';S.complexity=+x.complexity||2;S.sections=JSON.parse(JSON.stringify(x.sections||[]));if(!S.sections.length)S.sections=[{id:uid(),name:'Verse',chords:[chord('C'),chord('G'),chord('Am'),chord('F')]}];S.activeSection=x.activeSection&&S.sections.some(s=>s.id===x.activeSection)?x.activeSection:S.sections[0].id;S.selected=x.selected||null;syncUI();calculateVoicings();render();autosave()}
function pushUndo(){S.undo.push(JSON.stringify(serializable()));if(S.undo.length>60)S.undo.shift();S.redo=[];updateHistoryButtons()}
function undo(){if(!S.undo.length)return;S.redo.push(JSON.stringify(serializable()));let x=JSON.parse(S.undo.pop());applyState(x);updateHistoryButtons();toast('Undo')}
function redo(){if(!S.redo.length)return;S.undo.push(JSON.stringify(serializable()));let x=JSON.parse(S.redo.pop());applyState(x);updateHistoryButtons();toast('Redo')}
function updateHistoryButtons(){$('undo').disabled=!S.undo.length;$('redo').disabled=!S.redo.length}
function autosave(){
 localStorage.setItem('chordlab-v5-autosave',JSON.stringify(serializable()));
 if(S.currentSongId&&S.me&&!S.readOnly&&!S.applyingRemote){
   clearTimeout(S.cloudSaveTimer);
   S.cloudSaveTimer=setTimeout(()=>saveCloud(true),1100);
 }
}
function loadAutosave(){try{let x=JSON.parse(localStorage.getItem('chordlab-v5-autosave'));if(x)applyState(x)}catch(e){}}

function selectedChord(){if(!S.selected)return null;return S.sections.find(s=>s.id===S.selected.sectionId)?.chords.find(c=>c.id===S.selected.chordId)||null}
function candidateRH(sym){let d=cdata(sym);if(!d.pcs.length)return[];let use=d.pcs.length>4?d.pcs.slice(1):d.pcs.slice();if(use.length>4)use=use.slice(-4);let out=[];for(let r=0;r<Math.max(1,use.length);r++){let rot=use.slice(r).concat(use.slice(0,r)),arr=[],a=55;rot.forEach(p=>{let m=a+((p-pc(a)+12)%12);if(arr.length)while(m<=arr[arr.length-1])m+=12;arr.push(m)});while(arr[0]<57)arr=arr.map(n=>n+12);while(arr[arr.length-1]>81)arr=arr.map(n=>n-12);if(arr[0]>=52&&arr[arr.length-1]<=84)out.push(arr)}return out}
function movement(a,b){if(!a?.length||!b?.length)return 0;let x=[...a].sort((a,b)=>a-b),y=[...b].sort((a,b)=>a-b),n=Math.min(x.length,y.length),c=0;for(let i=0;i<n;i++)c+=Math.abs(x[Math.floor(i*x.length/n)]-y[Math.floor(i*y.length/n)]);return c+Math.abs(x.length-y.length)*4}
function lhFor(sym){let c=parse(sym);if(!c)return[];let r=36+ni(c.bass||c.root);while(r<36)r+=12;while(r>50)r-=12;if($('bassist').checked){let d=cdata(sym),choice=d.pcs[d.pcs.length>=4?3:1]??ni(c.root),m=43+((choice-pc(43)+12)%12);while(m>57)m-=12;return[m]}let fifth=r+7;if(fifth>57)fifth-=12;return[r,fifth].sort((a,b)=>a-b)}
function calculateVoicings(){S.voicings.clear();for(const sec of S.sections){let prev=null;for(const c of sec.chords){let cand=candidateRH(c.symbol),rh=cand.length?((!$('voiceLead').checked||!prev)?cand[Math.floor(cand.length/2)]:cand.sort((a,b)=>movement(prev,a)-movement(prev,b))[0]):[],v={lh:lhFor(c.symbol),rh,cost:prev?movement(prev,rh):0};S.voicings.set(c.id,v);prev=rh}}}

function syncUI(){
 $('songTitle').value=S.title;$('key').value=S.key;$('mode').value=S.mode;$('bpm').value=S.bpm;$('complexity').value=S.complexity;$('complexityText').textContent=['','Level 1 — basic','Level 2 — extensions','Level 3 — richer','Level 4 — advanced'][S.complexity];
 document.querySelectorAll('.style').forEach(b=>b.classList.toggle('on',b.dataset.style===S.style))
}
function render(){renderNav();renderSections();renderInspector();updateAccountUI();updateHistoryButtons();$('sectionCount').textContent=`${S.sections.length} sections`;autosave()}
function renderNav(){let el=$('sectionList');el.innerHTML='';S.sections.forEach(sec=>{let row=document.createElement('div');row.className='navrow';let b=document.createElement('button');b.className='btn'+(sec.id===S.activeSection?' active':'');b.textContent=sec.name;b.onclick=()=>{S.activeSection=sec.id;document.getElementById('sec-'+sec.id)?.scrollIntoView({behavior:'smooth',block:'start'});renderNav()};let x=document.createElement('button');x.className='btn ghost';x.textContent='×';x.onclick=()=>deleteSection(sec.id);row.append(b,x);el.appendChild(row)})}
function renderSections(){
 let root=$('sections');root.innerHTML='';
 S.sections.forEach(sec=>{
  let card=document.createElement('div');card.className='card section-card';card.id='sec-'+sec.id;
  let title=document.createElement('div');title.className='section-title';title.innerHTML=`<input value="${esc(sec.name)}"><div class="toolbar"><button class="btn" data-a="reharm">Reharm</button><button class="btn" data-a="play">Play</button><button class="btn" data-a="dup">Duplicate</button></div>`;
  title.querySelector('input').onchange=e=>{pushUndo();sec.name=e.target.value||'Section';renderNav();autosave()};title.querySelector('[data-a=reharm]').onclick=()=>reharmSection(sec);title.querySelector('[data-a=play]').onclick=()=>playSection(sec);title.querySelector('[data-a=dup]').onclick=()=>duplicateSection(sec.id);card.appendChild(title);
  let lane=document.createElement('div');lane.className='lane';lane.ondragover=e=>e.preventDefault();lane.ondrop=e=>{e.preventDefault();if(S.dragging)moveChord(S.dragging.sectionId,S.dragging.chordId,sec.id,null)};
  sec.chords.forEach((c,i)=>{let wrap=document.createElement('div');wrap.className='wrap',b=document.createElement('button');b.draggable=true;b.className='chord'+(c.kind==='passing'?' passing':'')+(S.selected?.chordId===c.id?' selected':'');let d=cdata(c.symbol);b.innerHTML=`<span class="kind">${c.kind==='passing'?'PASS':'CHORD'}</span><div class="chord-name">${esc(c.symbol)}</div><div class="chord-meta">${roman(c.symbol)} · ${c.beats} beat${c.beats==1?'':'s'}</div><div class="chord-notes">${d.notes.join(' · ')}</div><span class="remove">×</span>`;
   b.onclick=e=>{if(e.target.classList.contains('remove'))return removeChord(sec.id,c.id);S.selected={sectionId:sec.id,chordId:c.id};S.activeSection=sec.id;render()};b.ondblclick=()=>{$('editChord').focus();$('editChord').select()};b.ondragstart=e=>{S.dragging={sectionId:sec.id,chordId:c.id};b.classList.add('dragging');e.dataTransfer.effectAllowed='move'};b.ondragend=()=>{S.dragging=null;b.classList.remove('dragging')};b.ondragover=e=>{e.preventDefault();e.stopPropagation();b.classList.add('drop')};b.ondragleave=()=>b.classList.remove('drop');b.ondrop=e=>{e.preventDefault();e.stopPropagation();b.classList.remove('drop');if(S.dragging)moveChord(S.dragging.sectionId,S.dragging.chordId,sec.id,c.id)};wrap.appendChild(b);
   if(i<sec.chords.length-1){let plus=document.createElement('button');plus.className='insert';plus.textContent='+';plus.title='Insert passing chord';plus.onclick=()=>insertPassing(sec.id,i+1);wrap.appendChild(plus)}lane.appendChild(wrap)});
  let add=document.createElement('button');add.className='add';add.textContent='+ Add chord';add.onclick=()=>openChordModal(sec.id);lane.appendChild(add);card.appendChild(lane);root.appendChild(card)
 })
}
function renderInspector(){
 let c=selectedChord();if(!c){$('selectedLabel').textContent='Select a chord';$('editChord').value='';$('lh').textContent=$('rh').textContent='—';$('why').textContent='Select a chord to inspect or edit it.';$('notes').textContent='—';$('movement').textContent='—';renderPiano({lh:[],rh:[]});return}
 let d=cdata(c.symbol),v=S.voicings.get(c.id)||{lh:[],rh:[],cost:0};$('selectedLabel').textContent=c.symbol;$('editChord').value=c.symbol;$('editBeats').value=String(c.beats);$('why').textContent=c.why||'Manual chord';$('notes').textContent=d.notes.join(' ');$('lh').textContent=v.lh.map(m=>midiName(m,d.c?.rootDisp.includes('b'))).join('  ');$('rh').textContent=v.rh.map(m=>midiName(m,d.c?.rootDisp.includes('b'))).join('  ');$('movement').textContent=v.cost===0?'Start':(v.cost<=5?'Very smooth':v.cost<=10?'Smooth':v.cost<=16?'Moderate':'Wide')+` (${v.cost})`;renderPiano(v);updateMidiDetection()
}

function mutate(fn,msg){if(S.readOnly)return toast('This public chord chart is read-only');pushUndo();fn();calculateVoicings();render();if(msg)toast(msg)}
function addSection(name='New Section',prog=['G','D','Em','C']){mutate(()=>{let s={id:uid(),name,chords:prog.map(x=>chord(x))};S.sections.push(s);S.activeSection=s.id},'Section added')}
function deleteSection(id){if(S.sections.length<=1)return toast('Keep at least one section');mutate(()=>{S.sections=S.sections.filter(s=>s.id!==id);if(S.activeSection===id)S.activeSection=S.sections[0].id;if(S.selected?.sectionId===id)S.selected=null},'Section deleted')}
function duplicateSection(id){let s=S.sections.find(x=>x.id===id);if(!s)return;mutate(()=>{let cp={id:uid(),name:s.name+' Copy',chords:s.chords.map(c=>({...c,id:uid()}))},i=S.sections.indexOf(s);S.sections.splice(i+1,0,cp)},'Section duplicated')}
function removeChord(sid,cid){mutate(()=>{let s=S.sections.find(x=>x.id===sid);s.chords=s.chords.filter(c=>c.id!==cid);if(S.selected?.chordId===cid)S.selected=null},'Chord deleted')}
function insertPassing(sid,index){let s=S.sections.find(x=>x.id===sid),next=s?.chords[index],p=next?passingFor(next.symbol)[0]:null;mutate(()=>{let c=chord(p?.symbol||'F#dim7',2,'passing',p?.why||'Manual passing chord');s.chords.splice(index,0,c);S.selected={sectionId:sid,chordId:c.id}},'Passing chord inserted')}
function moveChord(fromSid,cid,toSid,beforeCid){mutate(()=>{let a=S.sections.find(x=>x.id===fromSid),b=S.sections.find(x=>x.id===toSid),i=a.chords.findIndex(c=>c.id===cid);if(i<0)return;let[item]=a.chords.splice(i,1),j=beforeCid?b.chords.findIndex(c=>c.id===beforeCid):-1;if(j<0)j=b.chords.length;b.chords.splice(j,0,item);S.selected={sectionId:toSid,chordId:cid}},'Chord moved')}
function reharmSection(sec){mutate(()=>{let original=sec.chords.filter(x=>x.kind!=='passing'),out=[];original.forEach((x,i)=>{out.push({...x,symbol:colorSymbol(x.symbol),why:colorWhy(),kind:'normal'});if(i<original.length-1)for(const p of passingFor(original[i+1].symbol))if(p.symbol)out.push(chord(p.symbol,Math.min(2,x.beats),'passing',p.why))});sec.chords=out},`${sec.name} reharmonized`)}
function reharmAll(){pushUndo();for(const sec of S.sections){let original=sec.chords.filter(x=>x.kind!=='passing'),out=[];original.forEach((x,i)=>{out.push({...x,symbol:colorSymbol(x.symbol),why:colorWhy(),kind:'normal'});if(i<original.length-1)for(const p of passingFor(original[i+1].symbol))if(p.symbol)out.push(chord(p.symbol,Math.min(2,x.beats),'passing',p.why))});sec.chords=out}calculateVoicings();render();toast('Whole song reharmonized')}

function transposeSymbol(sym,semi){let c=parse(sym);if(!c)return sym,flat=KEYS.includes(S.key)&&S.key.includes('b'),root=transRoot(c.root,semi,flat),bass=c.bass?transRoot(c.bass,semi,flat):null;return root+c.suf+(bass?'/'+bass:'')}
function transposeSong(semi){mutate(()=>{S.sections.forEach(sec=>sec.chords.forEach(c=>c.symbol=transposeSymbol(c.symbol,semi)));let old=ni(S.key),newPc=(old+semi+12)%12,candidates=KEYS.filter(k=>ni(k)===newPc);S.key=candidates.find(k=>S.key.includes('b')?k.includes('b'):!k.includes('b'))||candidates[0]||N[newPc];syncUI()},`Transposed ${semi>0?'+':''}${semi} semitone${Math.abs(semi)==1?'':'s'}`)}
function copyChord(){let c=selectedChord();if(!c)return;S.clipboard=JSON.parse(JSON.stringify(c));toast('Chord copied')}
function pasteChord(){if(!S.clipboard)return toast('Copy a chord first');let sec=S.sections.find(s=>s.id===S.activeSection);if(!sec)return;mutate(()=>{let cp={...JSON.parse(JSON.stringify(S.clipboard)),id:uid(),why:'Pasted chord.'};let i=S.selected&&S.selected.sectionId===sec.id?sec.chords.findIndex(c=>c.id===S.selected.chordId)+1:sec.chords.length;if(i<0)i=sec.chords.length;sec.chords.splice(i,0,cp);S.selected={sectionId:sec.id,chordId:cp.id}},'Chord pasted')}

function detectKeyFromChords(){
 let roots=[];S.sections.forEach(sec=>sec.chords.filter(c=>c.kind!=='passing').forEach(c=>{let p=parse(c.symbol);if(p)roots.push({pc:ni(p.root),minor:p.minor})}));
 if(!roots.length)return null;let best=null;
 for(const key of KEYS)for(const mode of ['major','minor']){let sc=scaleFor(key,mode).map(ni),score=0;roots.forEach(r=>{if(sc.includes(r.pc))score+=2;if(r.pc===ni(key))score+=2;if(mode==='major'&&r.minor&&[sc[1],sc[2],sc[5]].includes(r.pc))score+=1;if(mode==='minor'&&r.minor&&r.pc===ni(key))score+=2});if(!best||score>best.score)best={key,mode,score}}
 return best
}
function applyDetectedKey(){let d=detectKeyFromChords();if(!d)return toast('Could not detect key');mutate(()=>{S.key=d.key;S.mode=d.mode;syncUI()},`Detected ${d.key} ${d.mode}`)}

function openChordModal(sid){$('modalTitle').textContent='Add chord';$('modalBody').innerHTML=`<div class="two"><div><label>Chord</label><input id="mChord" value="Gmaj9"></div><div><label>Beats</label><select id="mBeats"><option>1</option><option>2</option><option selected>4</option><option>8</option></select></div></div><div style="margin-top:8px"><label>Type</label><select id="mKind"><option value="normal">Normal</option><option value="passing">Passing</option></select></div>`;$('modal').classList.add('on');$('modalOk').onclick=()=>{let s=S.sections.find(x=>x.id===sid);mutate(()=>{let c=chord($('mChord').value||'C',+$('mBeats').value,$('mKind').value,$('mKind').value==='passing'?'Manual passing chord.':'Manual chord.');s.chords.push(c);S.selected={sectionId:sid,chordId:c.id}},'Chord added');$('modal').classList.remove('on')}}
function openCommonModal(){let presets=['Intro','Verse','Pre-Chorus','Chorus','Bridge','Instrumental','Outro'];$('modalTitle').textContent='Add common section';$('modalBody').innerHTML=`<label>Section</label><select id="commonName">${presets.map(x=>`<option>${x}</option>`).join('')}</select><div style="margin-top:8px"><label>Starting progression</label><input id="commonProg" value="G D Em C"></div>`;$('modal').classList.add('on');$('modalOk').onclick=()=>{let p=$('commonProg').value.replace(/[|,]+/g,' ').split(/\s+/).filter(Boolean);addSection($('commonName').value,p.length?p:['G','D','Em','C']);$('modal').classList.remove('on')}}

function audio(){if(!S.ctx)S.ctx=new(window.AudioContext||window.webkitAudioContext)();if(S.ctx.state==='suspended')S.ctx.resume();return S.ctx}
async function loadSamples(){try{for(const m of[36,48,60,72,84])for(const layer of['soft','medium','hard']){let r=await fetch(`assets/piano/C${m/12-1}_${layer}.wav`),ab=await r.arrayBuffer();S.samples.set(`${m}_${layer}`,await audio().decodeAudioData(ab))}S.sampleReady=true;$('sampleStatus').textContent='3 velocity layers ready';$('sampleStatus').className='status ok'}catch(e){$('sampleStatus').textContent='Synth fallback';$('sampleStatus').className='status warn';$('soundMode').value='synth'}}
function nearestRoot(m){let roots=[36,48,60,72,84];return roots.sort((a,b)=>Math.abs(a-m)-Math.abs(b-m))[0]}
function layerFor(v){return v<.42?'soft':v<.76?'medium':'hard'}
function playNote(m,d=.75,when=0,vel=.72){let ctx=audio();if($('soundMode').value==='sample'&&S.sampleReady){let r=nearestRoot(m),buf=S.samples.get(`${r}_${layerFor(vel)}`),src=ctx.createBufferSource(),g=ctx.createGain();src.buffer=buf;src.playbackRate.value=Math.pow(2,(m-r)/12);g.gain.value=.18+.35*vel;src.connect(g);g.connect(ctx.destination);src.start(ctx.currentTime+when);src.stop(ctx.currentTime+when+Math.min(d,3));return}let o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.value=440*Math.pow(2,(m-69)/12);g.gain.setValueAtTime(.0001,ctx.currentTime+when);g.gain.exponentialRampToValueAtTime(.05*vel,ctx.currentTime+when+.01);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+when+d);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+when);o.stop(ctx.currentTime+when+d+.03)}
function playChordObj(c){let v=S.voicings.get(c.id)||{lh:[],rh:[]},sec=60/S.bpm*c.beats*.82;[...v.lh,...v.rh].forEach((m,i)=>playNote(m,Math.min(3,sec),0,i<2?.62:.76))}
function stopPlayback(){S.playTimers.forEach(clearTimeout);S.playTimers=[]}
function playSection(sec){stopPlayback();let off=0;for(const c of sec.chords){S.playTimers.push(setTimeout(()=>{S.selected={sectionId:sec.id,chordId:c.id};render();playChordObj(c)},off*1000));off+=60/S.bpm*c.beats}}
function playSong(){stopPlayback();let off=0;for(const sec of S.sections)for(const c of sec.chords){S.playTimers.push(setTimeout(()=>{S.activeSection=sec.id;S.selected={sectionId:sec.id,chordId:c.id};render();playChordObj(c)},off*1000));off+=60/S.bpm*c.beats}}
function clickSound(accent=false){let ctx=audio(),o=ctx.createOscillator(),g=ctx.createGain();o.type='square';o.frequency.value=accent?1300:900;g.gain.setValueAtTime(.06,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.05);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.055)}
function toggleMetronome(){if(S.metronomeTimer){clearInterval(S.metronomeTimer);S.metronomeTimer=null;$('metronome').textContent='Metronome Off';return}S.metroBeat=0;clickSound(true);S.metronomeTimer=setInterval(()=>{S.metroBeat=(S.metroBeat+1)%4;clickSound(S.metroBeat===0)},60000/S.bpm);$('metronome').textContent='Metronome On'}

function renderPiano(v){let p=$('piano');p.innerHTML='';let whites=[];for(let m=36;m<=84;m++)if(WHITE.has(pc(m)))whites.push(m);let ww=100/whites.length;whites.forEach(m=>{let k=document.createElement('div');k.className='white';if(v.lh.includes(m))k.classList.add('lh');if(v.rh.includes(m))k.classList.add('rh');if(S.pressed.has(m))k.classList.add('played');k.innerHTML=`<span class="lab">${midiName(m)}</span>`;k.onclick=()=>playNote(m,.65);p.appendChild(k)});for(let m=36;m<=84;m++){if(WHITE.has(pc(m)))continue;let prev=whites.filter(w=>w<m).pop(),i=whites.indexOf(prev);if(i<0||i>=whites.length-1)continue;let k=document.createElement('div');k.className='black';k.style.width=(ww*.58)+'%';k.style.left=((i+1)*ww-(ww*.29))+'%';if(v.lh.includes(m))k.classList.add('lh');if(v.rh.includes(m))k.classList.add('rh');if(S.pressed.has(m))k.classList.add('played');k.innerHTML=`<span class="lab">${midiName(m)}</span>`;k.onclick=e=>{e.stopPropagation();playNote(m,.65)};p.appendChild(k)}}

async function connectMidi(){if(!navigator.requestMIDIAccess)return toast('Web MIDI is not supported here');try{S.midiAccess=await navigator.requestMIDIAccess();bindMidi();S.midiAccess.onstatechange=bindMidi;let names=[...S.midiAccess.inputs.values()].map(x=>x.name).filter(Boolean);$('midiStatus').textContent=names.length?names.join(', '):'MIDI access granted';$('midiStatus').className='status ok'}catch(e){$('midiStatus').textContent='MIDI permission unavailable';$('midiStatus').className='status bad'}}
function bindMidi(){for(const input of S.midiAccess.inputs.values())input.onmidimessage=onMidi}
function onMidi(e){let[st,note,vel]=e.data,cmd=st&0xf0,now=performance.now();if(cmd===0x90&&vel>0){S.pressed.add(note);playNote(note,.5,0,vel/127);if(S.recording)S.recordEvents.push({t:now-S.recordStart,type:'on',note,vel})}if(cmd===0x80||(cmd===0x90&&vel===0)){S.pressed.delete(note);if(S.recording)S.recordEvents.push({t:now-S.recordStart,type:'off',note,vel:0})}renderInspector()}
function detectChordPCs(pcs){let set=new Set(pcs),best=null;for(let root=0;root<12;root++)for(const [name,ints] of TYPES){if(ints.length<3||ints.length>5)continue;let templ=new Set(ints.map(i=>(root+i)%12)),hits=[...templ].filter(p=>set.has(p)).length,extras=[...set].filter(p=>!templ.has(p)).length,miss=templ.size-hits,score=hits*3-extras*1.2-miss*1.5;if(!best||score>best.score)best={root,name,score,hits,total:templ.size}}if(!best||best.hits<3)return null;return N[best.root]+best.name}
function updateMidiDetection(){let pcs=[...new Set([...S.pressed].map(pc))],det=pcs.length>=3?detectChordPCs(pcs):null;$('detectedChord').textContent=det||'—';let c=selectedChord(),v=c?S.voicings.get(c.id):null;if(!v||!pcs.length){$('score').textContent='0%';$('scoreMeter').style.width='0%';return}let target=new Set([...v.lh,...v.rh].map(pc)),played=new Set(pcs),hits=[...target].filter(x=>played.has(x)).length,extras=[...played].filter(x=>!target.has(x)).length,score=Math.max(0,Math.round(hits/target.size*100-extras*12));$('score').textContent=score+'%';$('scoreMeter').style.width=score+'%'}
function toggleRecord(){if(!S.recording){S.recording=true;S.recordStart=performance.now();S.recordEvents=[];$('recordMidi').innerHTML='<span class="lamp on"></span>Stop';S.recordTimer=setInterval(updateRec,100)}else{S.recording=false;clearInterval(S.recordTimer);$('recordMidi').innerHTML='<span class="lamp"></span>Record';updateRec()}}
function updateRec(){let ms=S.recording?performance.now()-S.recordStart:(S.recordEvents.length?Math.max(...S.recordEvents.map(e=>e.t)):0);let s=ms/1000,m=Math.floor(s/60),r=(s%60).toFixed(1).padStart(4,'0');$('recTime').textContent=String(m).padStart(2,'0')+':'+r;$('recSummary').textContent=`${S.recordEvents.length} MIDI events`}
function clearRec(){S.recording=false;clearInterval(S.recordTimer);S.recordEvents=[];$('recordMidi').innerHTML='<span class="lamp"></span>Record';updateRec()}
function playRecording(){S.recordEvents.filter(e=>e.type==='on').forEach(e=>S.playTimers.push(setTimeout(()=>playNote(e.note,.5,0,e.vel/127),e.t)))}

function readVLQ(view,pos){let v=0,b;do{b=view.getUint8(pos.i++);v=(v<<7)|(b&127)}while(b&128);return v}
function parseMidi(buf){
 let v=new DataView(buf),p=0,str=n=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(v.getUint8(p++));return s};
 if(str(4)!=='MThd')throw Error('Not a MIDI file');let hlen=v.getUint32(p);p+=4,format=v.getUint16(p);p+=2,ntr=v.getUint16(p);p+=2,division=v.getUint16(p);p+=2;p=8+hlen;let events=[],tempo=500000;
 for(let t=0;t<ntr;t++){if(str.call?false:false){}let id='';for(let i=0;i<4;i++)id+=String.fromCharCode(v.getUint8(p++));if(id!=='MTrk')throw Error('Invalid MIDI track');let len=v.getUint32(p);p+=4,end=p+len,tick=0,running=0;
  while(p<end){let ref={i:p},dt=readVLQ(v,ref);p=ref.i;tick+=dt;let status=v.getUint8(p);if(status<0x80)status=running;else{p++;running=status}if(status===0xff){let type=v.getUint8(p++),rr={i:p},l=readVLQ(v,rr);p=rr.i;if(type===0x51&&l===3)tempo=(v.getUint8(p)<<16)|(v.getUint8(p+1)<<8)|v.getUint8(p+2);p+=l;continue}if(status===0xf0||status===0xf7){let rr={i:p},l=readVLQ(v,rr);p=rr.i+l;continue}let cmd=status&0xf0;if(cmd===0x80||cmd===0x90){let note=v.getUint8(p++),vel=v.getUint8(p++);events.push({tick,type:(cmd===0x90&&vel>0)?'on':'off',note,vel})}else if(cmd===0xc0||cmd===0xd0)p++;else p+=2}
 }
 return{format,division,tempo,events}
}
function midiToChords(parsed){let groups=new Map();parsed.events.filter(e=>e.type==='on').forEach(e=>{let q=Math.round(e.tick/Math.max(1,parsed.division/8))*Math.max(1,Math.round(parsed.division/8));if(!groups.has(q))groups.set(q,[]);groups.get(q).push(e.note)});let ticks=[...groups.keys()].sort((a,b)=>a-b),out=[];for(let i=0;i<ticks.length;i++){let notes=groups.get(ticks[i]),sym=detectChordPCs([...new Set(notes.map(pc))]);if(!sym)continue;let next=ticks[i+1]??ticks[i]+parsed.division*4,beats=Math.max(1,Math.round((next-ticks[i])/parsed.division));out.push(chord(sym,Math.min(8,beats),'normal','Detected from imported MIDI notes.'))}return out}
async function importMidi(file){try{let parsed=parseMidi(await file.arrayBuffer()),chs=midiToChords(parsed);if(!chs.length)return toast('No chord groups detected in MIDI');mutate(()=>{let sec={id:uid(),name:'MIDI Import',chords:chs};S.sections.push(sec);S.activeSection=sec.id;S.selected={sectionId:sec.id,chordId:chs[0].id};let bpm=Math.round(60000000/parsed.tempo);if(bpm>=40&&bpm<=220)S.bpm=bpm;let d=detectKeyFromChords();if(d){S.key=d.key;S.mode=d.mode}syncUI()},`Imported ${chs.length} detected chords`)}catch(e){console.error(e);toast('Could not parse this MIDI file')}}
function vlq(n){let a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a}function sb(s){return[...s].map(c=>c.charCodeAt(0))}function u16(n){return[(n>>8)&255,n&255]}function u32(n){return[(n>>24)&255,(n>>16)&255,(n>>8)&255,n&255]}
function midiFile(events,bpm){let ppq=480,us=Math.round(60000000/bpm),trk=[0,255,81,3,(us>>16)&255,(us>>8)&255,us&255],sorted=[...events].sort((a,b)=>a.tick-b.tick||(a.type==='off'?-1:1)),last=0;for(const e of sorted){trk.push(...vlq(Math.max(0,e.tick-last)),e.type==='on'?144:128,e.note,e.type==='on'?Math.max(1,Math.min(127,e.vel||90)):0);last=e.tick}trk.push(0,255,47,0);return[...sb('MThd'),...u32(6),...u16(0),...u16(1),...u16(ppq),...sb('MTrk'),...u32(trk.length),...trk]}
function download(bytes,name,type='application/octet-stream'){let blob=new Blob([new Uint8Array(bytes)],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function safe(s){return(s||'chordlab').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'')||'chordlab'}
function exportSongMidi(){let ppq=480,tick=0,ev=[];for(const sec of S.sections)for(const c of sec.chords){let v=S.voicings.get(c.id)||{lh:[],rh:[]},dur=c.beats*ppq,notes=[...v.lh,...v.rh];notes.forEach(n=>ev.push({tick,type:'on',note:n,vel:88}));notes.forEach(n=>ev.push({tick:tick+dur-8,type:'off',note:n,vel:0}));tick+=dur}download(midiFile(ev,S.bpm),safe(S.title)+'-arrangement.mid','audio/midi')}
function exportPerformance(){if(!S.recordEvents.length)return toast('Record some MIDI first');let msPerTick=(60000/S.bpm)/480,ev=S.recordEvents.map(e=>({tick:Math.round(e.t/msPerTick),type:e.type,note:e.note,vel:e.vel}));download(midiFile(ev,S.bpm),safe(S.title)+'-performance.mid','audio/midi')}

function pdfEscape(s){return String(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function exportPDF(){
 let lines=[S.title,`Key: ${S.key} ${S.mode}    BPM: ${S.bpm}`,''];for(const sec of S.sections){lines.push(sec.name.toUpperCase());let row='';for(const c of sec.chords){let token=`| ${c.symbol} (${c.beats}) `;if((row+token).length>72){lines.push(row+'|');row=''}row+=token}if(row)lines.push(row+'|');lines.push('')}
 let pages=[],per=44;for(let i=0;i<lines.length;i+=per)pages.push(lines.slice(i,i+per));
 let objs=[],add=s=>{objs.push(s);return objs.length},font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),pagesId=0,pageIds=[];
 for(const pageLines of pages){let content='BT /F1 12 Tf 50 790 Td 14 TL ';pageLines.forEach((l,i)=>{if(i)content+='T* ';content+=`(${pdfEscape(l)}) Tj `});content+='ET';let stream=add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),pid=add('PENDING');pageIds.push({pid,stream})}
 pagesId=add('PENDING');let catalog=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
 pageIds.forEach(x=>objs[x.pid-1]=`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${x.stream} 0 R >>`);
 objs[pagesId-1]=`<< /Type /Pages /Kids [${pageIds.map(x=>`${x.pid} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
 let out='%PDF-1.4\n',offs=[0];objs.forEach((o,i)=>{offs.push(out.length);out+=`${i+1} 0 obj\n${o}\nendobj\n`});let xref=out.length;out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offs.length;i++)out+=String(offs[i]).padStart(10,'0')+' 00000 n \n';out+=`trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;download(new TextEncoder().encode(out),safe(S.title)+'-chord-chart.pdf','application/pdf')
}


const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL||'';
const SUPABASE_KEY=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY||'';
const supabase=(SUPABASE_URL&&SUPABASE_KEY)?createClient(SUPABASE_URL,SUPABASE_KEY):null;

async function refreshMe(){
 if(!supabase){S.me=null;updateAccountUI();setCloudStatus('offline','Supabase not configured');return}
 const {data:{user}}=await supabase.auth.getUser();
 S.me=user||null;
 updateAccountUI();
 if(S.me&&S.pendingInvite)await acceptInvite(S.pendingInvite);
}
function updateAccountUI(){
 $('accountBtn').textContent=S.me?(S.me.email||'Account'):'Account';
 $('saveCloud').disabled=!S.me||S.readOnly;
 $('libraryBtn').disabled=!S.me;
 $('shareBtn').disabled=!S.me||!S.currentSongId||S.readOnly;
 $('publicBtn').disabled=!S.me||!S.currentSongId||S.readOnly;
}
function openAccount(){
 $('modalTitle').textContent=S.me?'Cloud Account':'Email Login / Sign Up';
 $('modalOk').style.display='none';
 if(S.me){
  const name=S.me.user_metadata?.display_name||S.me.email||'Musician';
  $('modalBody').innerHTML=`<div class="info"><h3>Signed in with Supabase Auth</h3>
  <p><strong>${esc(name)}</strong></p><p>${esc(S.me.email||'')}</p>
  <p>Cross-device saving and collaboration are enabled.</p></div>
  <div class="toolbar" style="margin-top:8px"><button class="btn red" id="logoutBtn">Log out</button></div>`;
  $('modal').classList.add('on');
  $('logoutBtn').onclick=async()=>{await supabase.auth.signOut();S.me=null;S.currentSongId=null;unsubscribeSong();$('modal').classList.remove('on');$('modalOk').style.display='';updateAccountUI();setCloudStatus('offline','Signed out');toast('Signed out')};
  return;
 }
 $('modalBody').innerHTML=`<div class="stack">
   <div><label>Email</label><input id="authEmail" type="text" autocomplete="email" placeholder="you@example.com"></div>
   <div><label>Display name</label><input id="authName" type="text" autocomplete="name" placeholder="Musician name"></div>
   <div><label>Password</label><input id="authPass" type="password" autocomplete="current-password" placeholder="At least 6 characters"></div>
  </div>
  <div class="toolbar" style="margin-top:8px"><button class="btn primary" id="loginBtn">Login</button><button class="btn green" id="registerBtn">Create account</button><button class="btn ghost" id="resetBtn">Reset password</button></div>
  <div class="note" style="margin-top:8px">Depending on your Supabase Auth settings, new accounts may need to confirm their email before signing in.</div>`;
 $('modal').classList.add('on');
 $('loginBtn').onclick=()=>emailLogin();
 $('registerBtn').onclick=()=>emailRegister();
 $('resetBtn').onclick=()=>sendPasswordReset();
}
async function emailLogin(){
 if(!supabase)return toast('Add Supabase environment variables first');
 const email=$('authEmail').value.trim(),password=$('authPass').value;
 const {data,error}=await supabase.auth.signInWithPassword({email,password});
 if(error)return toast(error.message);
 S.me=data.user;$('modal').classList.remove('on');$('modalOk').style.display='';updateAccountUI();setCloudStatus('live','Cloud connected');toast('Logged in');
 if(S.pendingInvite)await acceptInvite(S.pendingInvite);
}
async function emailRegister(){
 if(!supabase)return toast('Add Supabase environment variables first');
 const email=$('authEmail').value.trim(),password=$('authPass').value,display_name=$('authName').value.trim()||email.split('@')[0];
 const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name}}});
 if(error)return toast(error.message);
 if(data.session){S.me=data.user;$('modal').classList.remove('on');$('modalOk').style.display='';updateAccountUI();toast('Account created')}
 else toast('Account created — check your email to confirm it');
}
async function sendPasswordReset(){
 const email=$('authEmail').value.trim();if(!email)return toast('Enter your email first');
 const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
 toast(error?error.message:'Password reset email sent');
}
function openRecovery(){
 $('modalTitle').textContent='Set a new password';$('modalOk').style.display='none';
 $('modalBody').innerHTML=`<div><label>New password</label><input id="newPassword" type="password"></div><button class="btn primary" id="updatePassword" style="margin-top:8px">Update password</button>`;
 $('modal').classList.add('on');
 $('updatePassword').onclick=async()=>{const {error}=await supabase.auth.updateUser({password:$('newPassword').value});if(error)return toast(error.message);$('modal').classList.remove('on');$('modalOk').style.display='';toast('Password updated')};
}
function cloudPayload(){
 return{title:S.title,data:serializable(),updated_by:S.me?.id||null};
}
async function saveCloud(silent=false){
 if(S.readOnly)return;
 if(!supabase||!S.me){if(!silent)openAccount();return}
 setCloudStatus('syncing','Saving…');
 try{
  let row;
  if(S.currentSongId){
   const {data,error}=await supabase.from('songs').update(cloudPayload()).eq('id',S.currentSongId).select('id,owner_id,is_public,public_slug,updated_at').single();
   if(error)throw error;row=data;
  }else{
   const {data,error}=await supabase.from('songs').insert({...cloudPayload(),owner_id:S.me.id}).select('id,owner_id,is_public,public_slug,updated_at').single();
   if(error)throw error;row=data;S.currentSongId=row.id;S.currentSongOwner=row.owner_id;S.currentRole='owner';subscribeSong(row.id);
  }
  setCloudStatus('live',silent?'Synced':'Saved');
  updateAccountUI();
  if(!silent)toast('Song saved to Supabase');
 }catch(e){setCloudStatus('offline','Save failed');if(!silent)toast(e.message)}
}
async function openLibrary(){
 if(!supabase||!S.me)return openAccount();
 const {data,error}=await supabase.from('songs').select('id,title,owner_id,is_public,public_slug,updated_at').order('updated_at',{ascending:false});
 if(error)return toast(error.message);
 $('modalTitle').textContent='My Cloud Songs';$('modalOk').style.display='none';
 $('modalBody').innerHTML=`<div class="library">${data?.length?data.map(s=>`<div class="library-row"><div><b>${esc(s.title)}</b><small>${s.owner_id===S.me.id?'Owner':'Shared with you'} · ${new Date(s.updated_at).toLocaleString()}</small></div><div class="toolbar"><button class="btn green" data-load="${s.id}">Load</button>${s.owner_id===S.me.id?`<button class="btn red" data-del="${s.id}">Delete</button>`:''}</div></div>`).join(''):'<div class="note">No cloud songs yet.</div>'}</div>`;
 $('modal').classList.add('on');
 $('modalBody').querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>loadCloud(b.dataset.load));
 $('modalBody').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteCloud(b.dataset.del));
}
async function loadCloud(id){
 const {data,error}=await supabase.from('songs').select('id,title,data,owner_id,is_public,public_slug,updated_at').eq('id',id).single();
 if(error)return toast(error.message);
 S.currentSongId=data.id;S.currentSongOwner=data.owner_id;S.readOnly=false;document.body.classList.remove('readonly');
 const {data:member}=await supabase.from('song_members').select('role').eq('song_id',id).eq('user_id',S.me.id).maybeSingle();
 S.currentRole=data.owner_id===S.me.id?'owner':(member?.role||'viewer');
 if(S.currentRole==='viewer'){S.readOnly=true;document.body.classList.add('readonly')}
 S.applyingRemote=true;applyState(data.data);S.applyingRemote=false;
 subscribeSong(id);$('modal').classList.remove('on');$('modalOk').style.display='';updateAccountUI();setCloudStatus('live',S.currentRole==='viewer'?'Viewing shared song':'Live sync');toast('Cloud song loaded');
}
async function deleteCloud(id){
 const {error}=await supabase.from('songs').delete().eq('id',id);if(error)return toast(error.message);
 if(S.currentSongId===id){S.currentSongId=null;S.currentSongOwner=null;unsubscribeSong()}toast('Song deleted');openLibrary();
}
function unsubscribeSong(){if(S.cloudChannel&&supabase){supabase.removeChannel(S.cloudChannel);S.cloudChannel=null}}
function subscribeSong(id){
 if(!supabase||!id)return;unsubscribeSong();
 S.cloudChannel=supabase.channel('song-'+id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'songs',filter:`id=eq.${id}`},payload=>{
   const row=payload.new;if(!row||row.updated_by===S.me?.id)return;
   S.applyingRemote=true;applyState(row.data);S.applyingRemote=false;setCloudStatus('live','Collaborator synced');toast('Collaborator changes synced');
 }).subscribe(status=>{if(status==='SUBSCRIBED')setCloudStatus('live','Realtime connected')});
}
async function createInvite(){
 if(!S.currentSongId)return toast('Save the song first');
 $('modalTitle').textContent='Invite a Collaborator';$('modalOk').style.display='none';
 $('modalBody').innerHTML=`<label>Permission</label><select id="inviteRole"><option value="editor">Editor — can change the song</option><option value="viewer">Viewer — read only</option></select><button class="btn primary" id="makeInvite" style="width:100%;margin-top:8px">Create Invite Link</button><div id="inviteResult" style="margin-top:8px"></div>`;
 $('modal').classList.add('on');
 $('makeInvite').onclick=async()=>{
  const {data,error}=await supabase.from('song_invites').insert({song_id:S.currentSongId,role:$('inviteRole').value,created_by:S.me.id}).select('token,expires_at').single();
  if(error)return toast(error.message);
  const url=`${location.origin}${location.pathname}?invite=${data.token}`;
  $('inviteResult').innerHTML=`<div class="share-link"><input value="${esc(url)}" readonly><button class="btn green" id="copyInvite">Copy</button></div><div class="note" style="margin-top:5px">Invite expires ${new Date(data.expires_at).toLocaleString()}.</div>`;
  $('copyInvite').onclick=()=>copyText(url,'Invite link copied');
 }
}
async function acceptInvite(token){
 if(!supabase)return;S.pendingInvite=token;
 if(!S.me){openAccount();toast('Log in to accept the collaboration invite');return}
 const {data,error}=await supabase.rpc('accept_song_invite',{p_token:token});
 if(error){toast(error.message);return}
 S.pendingInvite=null;
 const u=new URL(location.href);u.searchParams.delete('invite');history.replaceState({},'',u);
 await loadCloud(data);toast('Collaboration invite accepted');
}
async function showCollaborators(){
 if(!S.currentSongId)return toast('Save the song first');
 const {data:members,error}=await supabase.from('song_members').select('user_id,role,created_at').eq('song_id',S.currentSongId);
 if(error)return toast(error.message);
 const ids=[...new Set((members||[]).map(x=>x.user_id))];
 let profiles=[];if(ids.length){const r=await supabase.from('profiles').select('id,display_name').in('id',ids);profiles=r.data||[]}
 const names=Object.fromEntries(profiles.map(p=>[p.id,p.display_name]));
 $('modalTitle').textContent='Collaborators';$('modalOk').style.display='none';
 $('modalBody').innerHTML=`<div class="stack"><div class="member"><div><b>Owner</b><small>${esc(S.currentSongOwner||'')}</small></div></div>${(members||[]).map(m=>`<div class="member"><div><b>${esc(names[m.user_id]||'Musician')}</b><small>${esc(m.role)} · ${esc(m.user_id)}</small></div>${S.currentSongOwner===S.me.id?`<button class="btn red" data-remove="${m.user_id}">Remove</button>`:''}</div>`).join('')||'<div class="note">No collaborators yet.</div>'}</div><div class="toolbar" style="margin-top:8px"><button class="btn primary" id="newInvite">Create invite link</button></div>`;
 $('modal').classList.add('on');
 $('newInvite').onclick=createInvite;
 $('modalBody').querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.from('song_members').delete().eq('song_id',S.currentSongId).eq('user_id',b.dataset.remove);if(error)return toast(error.message);showCollaborators()});
}
async function publicLink(){
 if(!S.currentSongId)return toast('Save the song first');
 const {data:row,error:readErr}=await supabase.from('songs').select('is_public,public_slug').eq('id',S.currentSongId).single();if(readErr)return toast(readErr.message);
 $('modalTitle').textContent='Public Chord Chart';$('modalOk').style.display='none';
 const current=row.is_public&&row.public_slug?`${location.origin}${location.pathname}?public=${row.public_slug}`:'';
 $('modalBody').innerHTML=`<div class="info"><h3>${current?'Public link is active':'Publish a read-only chord chart'}</h3><p>Anyone with the public link can view the chart, but cannot edit it.</p></div>${current?`<div class="share-link" style="margin-top:8px"><input id="publicUrl" value="${esc(current)}" readonly><button class="btn green" id="copyPublic">Copy</button></div><button class="btn red" id="disablePublic" style="margin-top:8px">Disable Public Link</button>`:`<button class="btn primary" id="enablePublic" style="width:100%;margin-top:8px">Create Public Link</button>`}`;
 $('modal').classList.add('on');
 if(current){$('copyPublic').onclick=()=>copyText(current,'Public link copied');$('disablePublic').onclick=async()=>{const {error}=await supabase.from('songs').update({is_public:false}).eq('id',S.currentSongId);if(error)return toast(error.message);publicLink()}}
 else $('enablePublic').onclick=async()=>{const slug=crypto.randomUUID().replaceAll('-','').slice(0,18);const {error}=await supabase.from('songs').update({is_public:true,public_slug:slug}).eq('id',S.currentSongId);if(error)return toast(error.message);publicLink()};
}
async function loadPublic(slug){
 if(!supabase)return;
 const {data,error}=await supabase.from('songs').select('id,title,data,owner_id,updated_at').eq('public_slug',slug).eq('is_public',true).single();
 if(error){toast('Public chord chart not found');return}
 S.currentSongId=data.id;S.currentSongOwner=data.owner_id;S.currentRole='public';S.readOnly=true;document.body.classList.add('readonly');
 S.applyingRemote=true;applyState(data.data);S.applyingRemote=false;
 subscribeSong(data.id);updateAccountUI();setCloudStatus('live','Public read-only chart');
 const banner=document.createElement('div');banner.className='public-banner';banner.textContent='Public read-only chord chart — sign in and use an invite link to collaborate.';document.querySelector('section')?.prepend(banner);
}
function copyText(text,message){navigator.clipboard?.writeText(text).then(()=>toast(message)).catch(()=>{prompt('Copy this link:',text)})}

function localAssistant(prompt){
 let p=prompt.toLowerCase(),changed=[];
 if(p.includes('gospel')){S.style='gospel';changed.push('style → Gospel')}else if(p.includes('jazz')){S.style='jazz';changed.push('style → Jazz')}else if(p.includes('neo soul')||p.includes('neosoul')){S.style='neosoul';changed.push('style → Neo Soul')}else if(p.includes('blues')){S.style='blues';changed.push('style → Blues')}else if(p.includes('worship')){S.style='worship';changed.push('style → Worship')}
 if(p.includes('easy')||p.includes('simple')||p.includes('beginner')){S.complexity=1;changed.push('complexity → 1')}else if(p.includes('advanced')||p.includes('complex')||p.includes('rich')){S.complexity=4;changed.push('complexity → 4')}else if(p.includes('intermediate')){S.complexity=2;changed.push('complexity → 2')}
 let m=p.match(/transpose\s+(up|down)\s+(\d+)/);if(m){let sem=+m[2]*(m[1]==='down'?-1:1);transposeSong(sem);changed.push(`transpose ${sem}`)}
 syncUI();return changed.length?`Local assistant understood: ${changed.join(', ')}. Press Reharmonize to apply the harmony style.`:'Try prompts like “make the chorus advanced gospel”, “make this easier”, “use neo soul color”, or “transpose down 2”.'
}
async function askAI(){
 let prompt=$('aiPrompt').value.trim();if(!prompt)return;pushUndo();$('aiResponse').textContent='Thinking…';
 try{
  const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,song:serializable()})});
  if(!r.ok)throw Error('AI unavailable');
  const out=await r.json();$('aiResponse').textContent=out.message||'AI response received.';
  if(out.action){if(out.action.style&&STYLE[out.action.style])S.style=out.action.style;if(out.action.complexity)S.complexity=Math.max(1,Math.min(4,+out.action.complexity));if(out.action.transpose)transposeSong(+out.action.transpose);if(out.action.reharmonize==='section'){let sec=S.sections.find(s=>s.id===S.activeSection);if(sec)reharmSection(sec)}if(out.action.reharmonize==='song')reharmAll();syncUI();calculateVoicings();render()}
 }catch(e){$('aiResponse').textContent='Cloud AI is not configured, so ChordLab used its local harmony assistant.\n'+localAssistant(prompt);calculateVoicings();render()}
}

function setCloudStatus(mode,text){
 const el=$('cloudIndicator');if(!el)return;
 el.className='cloud-indicator '+mode;
 el.innerHTML='<i></i><span>'+esc(text)+'</span>';
}
function toast(msg){let t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('on'),1800)}

$('modalCancel').onclick=()=>{$('modal').classList.remove('on');$('modalOk').style.display=''};
KEYS.forEach(k=>{let o=document.createElement('option');o.textContent=k;$('key').appendChild(o)});
document.querySelectorAll('.style').forEach(b=>b.onclick=()=>{pushUndo();S.style=b.dataset.style;syncUI();autosave()});
$('complexity').oninput=e=>{S.complexity=+e.target.value;$('complexityText').textContent=['','Level 1 — basic','Level 2 — extensions','Level 3 — richer','Level 4 — advanced'][S.complexity];autosave()};
$('songTitle').onchange=e=>{pushUndo();S.title=e.target.value||'Untitled';autosave()};$('key').onchange=e=>{pushUndo();S.key=e.target.value;calculateVoicings();render()};$('mode').onchange=e=>{pushUndo();S.mode=e.target.value;render()};$('bpm').onchange=e=>{pushUndo();S.bpm=Math.max(40,Math.min(220,+e.target.value||72));autosave()};
$('voiceLead').onchange=()=>{calculateVoicings();render()};$('bassist').onchange=()=>{calculateVoicings();render()};
$('addSection').onclick=()=>addSection();$('addPreset').onclick=openCommonModal;$('reharmSection').onclick=()=>{let s=S.sections.find(x=>x.id===S.activeSection);if(s)reharmSection(s)};$('reharmSong').onclick=reharmAll;$('playSection').onclick=()=>{let s=S.sections.find(x=>x.id===S.activeSection);if(s)playSection(s)};$('playSong').onclick=playSong;$('stop').onclick=stopPlayback;
$('undo').onclick=undo;$('redo').onclick=redo;$('copyChord').onclick=copyChord;$('pasteChord').onclick=pasteChord;$('transposeDown').onclick=()=>transposeSong(-1);$('transposeUp').onclick=()=>transposeSong(1);$('detectKey').onclick=applyDetectedKey;$('metronome').onclick=toggleMetronome;
$('applyEdit').onclick=()=>{let c=selectedChord();if(!c)return;mutate(()=>{c.symbol=$('editChord').value||c.symbol;c.beats=+$('editBeats').value||4;c.why='Manually edited chord.'},'Chord updated')};$('togglePassing').onclick=()=>{let c=selectedChord();if(c)mutate(()=>{c.kind=c.kind==='passing'?'normal':'passing';c.why=c.kind==='passing'?'Manually marked passing chord.':'Normal song chord.'},'Chord type changed')};$('deleteChord').onclick=()=>{if(S.selected)removeChord(S.selected.sectionId,S.selected.chordId)};
$('previewChord').onclick=()=>{let c=selectedChord();if(c)playChordObj(c)};$('connectMidi').onclick=connectMidi;$('recordMidi').onclick=toggleRecord;$('playRecording').onclick=playRecording;$('clearRecording').onclick=clearRec;$('exportPerformance').onclick=exportPerformance;$('exportSongMidi').onclick=exportSongMidi;$('exportPDF').onclick=exportPDF;
$('midiImport').onchange=e=>{if(e.target.files[0])importMidi(e.target.files[0]);e.target.value=''};$('accountBtn').onclick=openAccount;$('saveCloud').onclick=()=>saveCloud(false);$('libraryBtn').onclick=openLibrary;$('shareBtn').onclick=showCollaborators;$('publicBtn').onclick=publicLink;$('askAI').onclick=askAI;
document.addEventListener('keydown',e=>{let mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}if(mod&&e.key.toLowerCase()==='c'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){e.preventDefault();copyChord()}if(mod&&e.key.toLowerCase()==='v'&&document.activeElement.tagName!=='INPUT'&&document.activeElement.tagName!=='TEXTAREA'){e.preventDefault();pasteChord()}});

const cloudBadge=document.createElement('div');cloudBadge.id='cloudIndicator';cloudBadge.className='cloud-indicator offline';cloudBadge.innerHTML='<i></i><span>Local mode</span>';document.querySelector('.brand')?.appendChild(cloudBadge);
syncUI();calculateVoicings();render();loadAutosave();loadSamples();
const params=new URLSearchParams(location.search);
S.pendingInvite=params.get('invite');
if(supabase){
 supabase.auth.onAuthStateChange((event,session)=>{S.me=session?.user||null;updateAccountUI();if(event==='PASSWORD_RECOVERY')openRecovery();if(S.me&&S.pendingInvite)setTimeout(()=>acceptInvite(S.pendingInvite),0)});
}
refreshMe().then(()=>{const publicSlug=params.get('public');if(publicSlug)loadPublic(publicSlug);else if(S.pendingInvite&&S.me)acceptInvite(S.pendingInvite)});

})();
