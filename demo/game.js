"use strict";

const $ = id => document.getElementById(id);
const canvas = $("world");
const ctx = canvas.getContext("2d");
const mapCanvas = $("map");
const mini = mapCanvas.getContext("2d");
const menu = $("menu");
const backgrounds = MAPS.map((map, i) => art.terrain(map, i + 1));
const keys = new Set();
const touchInput = {pointer: null, startX: 0, startY: 0, x: 0, y: 0, moved: false, sprint: false, timer: 0};
const saveKey = "jiezhou-demo-v1";
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const at = pair => ({x: pair[0], y: pair[1]});
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const safe = (fn, otherwise) => { try { return fn(); } catch { return otherwise; } };

function opening() {
  return {
    ch: 1, phase: "hospital", x: 5, y: 14.5, hp: 100, stamina: 100, scrap: 0,
    flags: {}, carry: "", held: [], drop: null, racked: [], final: [],
    quality: [3, 3], towers: {}, specialty: "", allocation: "", shore: "", crew: "follow"
  };
}
function load() {
  const saved = safe(() => JSON.parse(localStorage.getItem(saveKey)), null);
  const goals = saved?.ch === 1 ? CH1_GOALS : CH2_GOALS;
  if (!saved || ![1,2].includes(saved.ch) || !Object.hasOwn(goals, saved.phase)) return opening();
  return {...opening(), ...saved};
}
let state = load();
let checkpoint;
let runtime;
let audioOn = false;
let soundContext;
let dialogueUntil = 0;
let now = 0;
let last = performance.now();
let uiTime = 0;
let rally = null;
const currentMap = () => MAPS[state.ch - 1];
const point = name => at(currentMap().points[name === "stock" ? stockPoint() : name]);
const stockPoint = () => state.allocation === "borrow" ? "stockB" : state.allocation === "mirror" && state.flags.mirror ? "stockC" : "stockA";
const totalBoxes = () => state.phase === "bridgeBoss" ? state.final.length : state.racked.length;

function save(message = "进度已保存") {
  checkpoint = JSON.stringify(state);
  const stored = safe(() => {localStorage.setItem(saveKey, checkpoint); return true;}, false);
  $("save-label").textContent = stored ? message : "本次会话存档";
}
function put(name) {
  Object.assign(state, point(name));
}
function say(speaker, speech, seconds = 5) {
  $("speaker").textContent = speaker;
  $("speech").textContent = speech;
  $("dialogue").hidden = false;
  dialogueUntil = now + seconds;
}
function beep(freq, duration = .09, type = "triangle", volume = .055) {
  if (!audioOn || !soundContext) return;
  const start = soundContext.currentTime;
  const osc = soundContext.createOscillator();
  const gain = soundContext.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq,start);
  osc.frequency.exponentialRampToValueAtTime(freq * .78, start+duration);
  gain.gain.setValueAtTime(volume,start);
  gain.gain.exponentialRampToValueAtTime(.001,start+duration);
  osc.connect(gain);gain.connect(soundContext.destination);
  osc.start(start);osc.stop(start+duration);
}
function newRuntime() {
  runtime = {
    enemies: [], spawn: 0, marks: {}, boss: null, bossTime: 0, bossSpawn: 0,
    effects: [], elapsed: 0, cooldown: 0, invuln: 0, lastSprint: -10, xp: 0, upgrade: "",
    wave: 0, waveGap: 0, cabinet: 70, disabled: 0, towerShots: {}, countdown: 0,
    walking: false, flip: 1, npcX: state.x - .8, npcY: state.y + .5, guard: null,
    cameraX: clamp(state.x * TILE - 240,0,WIDTH*TILE-480),
    cameraY: clamp(state.y * TILE - 144,0,HEIGHT*TILE-288)
  };
  if (state.phase === "stationBoss") setupBoss("station");
  if (state.phase === "bridgeBoss") setupBoss("bridge");
  if (state.phase === "defenseWave") spawnWave(1);
}
function setPhase(phase, store = true) {
  state.phase = phase;
  if (store) save();
  syncHud();
}
function setupBoss(kind) {
  const x = kind === "station" ? 57.5 : 58.5;
  runtime.boss = {kind,x,y:14.2,hp:kind === "station" ? 105 : 132, max:kind === "station" ? 105 : 132,hurt:0};
  runtime.bossTime = 0; runtime.bossSpawn = 0;
  runtime.enemies = [];
}
function beginBoss(kind) {
  setupBoss(kind);
  state.hp = 100;
  state.stamina = 100;
  setPhase(kind === "station" ? "stationBoss" : "bridgeBoss");
  if(kind === "station") say("梁砚","听见广播说「无人」，它会停一下。别让它夹住电池。",6);
  else say("梁砚","先在接应架取苗。摊铺车抬臂时，另一侧能过。",6);
  beep(95,.25);
}
function resetFromCheckpoint() {
  closeMenu();
  state = JSON.parse(checkpoint);
  state.hp = 100; state.stamina = 100;
  newRuntime(); save();
  say("巡线员","已从最近的安全点重新出发。",4);
  syncHud();
}
function openMenu(label, title, copy, options) {
  clearControls();
  $("rally-meter").hidden = true;
  $("modal-label").textContent = label;
  $("modal-title").textContent = title;
  $("modal-text").textContent = copy;
  const actions = $("modal-actions");
  actions.replaceChildren();
  for(const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = option.disabled === true;
    button.append(document.createTextNode(option.title));
    if(option.note){
      const note=document.createElement("small");
      note.textContent=option.note;button.append(note);
    }
    button.addEventListener("click", () => {closeMenu(); option.run?.(); syncHud();});
    actions.append(button);
  }
  if(!menu.open) menu.showModal();
  actions.querySelector("button:not(:disabled)")?.focus();
}
function closeMenu() { if(menu.open) menu.close(); clearControls(); rally=null; $("rally-meter").hidden=true; }
const returnChoice = {title:"返回现场"};

function choosePower() {
  if(state.phase === "complete") {
    if(state.ch === 1) {
      openMenu("第一章结算","站台重新开门",
        "梁砚已加入。站口驿站可以接下一份运苗工单。",[
        {title:"进入第二章 · 雨水高架",run:nextChapter},
        returnChoice
      ]);
    } else finish();
    return;
  }
  if (state.ch === 1) {
    openMenu("医院与站台 · 夜间配电","今夜的灯先给谁？",
      "固定线路 3 格，应急电池 1 格。医院至少需要 3 格，站台值守用 1 格，育苗架还要 1 格。",[
      {title:"医院优先 · 3 + 1",note:"医院照明，站台保留值守灯。明早在室内用保温箱接苗。",run:()=>commitPower("hospital")},
      {title:"邻区借电 · 3 + 2",note:state.flags.borrow?"借电已签字。次日有邻区帮工，灯廊少一段照明。":"先去站口左侧的邻区值班台，借 1 格当晚电力。",disabled:!state.flags.borrow,run:()=>commitPower("borrow")},
      {title:"修反射镜 · 夜间 3 + 1",note:state.flags.mirror?"镜面已装好。白天从日光育苗架接货。":"先去站台上方的屋顶零件点，安装反射镜。",disabled:!state.flags.mirror,run:()=>commitPower("mirror")},
      returnChoice
    ]);
  } else {
    openMenu("对岸线路 · 5 格电","额外 1 格电送去哪里？",
      "温室与居民抢修点各保留 2 格。选中的地方今天就能满负荷工作。",[
      {title:"温室先开 · 3 + 2",note:"育苗床立即开启，居民抢修点等待一趟补运。",run:()=>commitPower("grow")},
      {title:"居民抢修先开 · 2 + 3",note:"抢修队立即派工。温室先保温，苗盘安排下一趟补运。",run:()=>commitPower("repair")},
      returnChoice
    ]);
  }
}
function commitPower(choice) {
  if(state.phase !== "power") return;
  if(state.ch === 1){
    state.allocation = choice;
    state.flags.engineer = true;
    state.scrap += 3;
    setPhase("complete");
    say("阿澄","你看，那边有人在灯下面写名字。");
    beep(630,.27);
    openMenu("第一章结算","灯亮起来了",
      "梁砚加入小队，获得 3 废料。选一项入门专长，在下一趟运苗时使用。",[
      {title:"战斗 · 扳手伤害 +1",run:()=>pickSpecialty("combat")},
      {title:"运输 · 满载移速 +0.2 格/秒",run:()=>pickSpecialty("transport")},
      {title:"工程 · 额外获得 1 废料",run:()=>pickSpecialty("engineering")}
    ]);
  } else {
    state.shore = choice;
    state.scrap += 4;
    state.flags.bridge = true;
    setPhase("complete"); beep(780,.28);
    say("梁砚","听，第一辆车过桥了。");
    finish();
  }
}
function pickSpecialty(choice) {
  if(state.specialty) return;
  state.specialty=choice;
  if(choice==="engineering")state.scrap++;
  save(); choosePower();
}
function nextChapter(){
  if(state.ch!==1 || state.phase!=="complete")return;
  state = {...state,ch:2,phase:"collect",x:5,y:14.5,hp:100,stamina:100,carry:"",held:[],drop:null,racked:[],final:[],towers:{},quality:[3,3]};
  newRuntime(); save(); syncHud();
  const line = {hospital:"育苗架昨晚停了一夜。去室内领保温箱。",borrow:"邻区派人帮装苗。灯廊有一段今天要少开一点。",mirror:"日光已经照进育苗架。来这边领苗。"};
  say("驿站值班",line[state.allocation] || "两箱苗都到了，去接货点领吧。");
}
function finish(){
  const first = {hospital:"医院优先",borrow:"邻区借电",mirror:"修反射镜"}[state.allocation] || "保底照明";
  const second=state.shore==="grow"?"温室育苗床先开启。":"居民抢修队先派工。";
  openMenu("第二章结算","第一辆补给车过桥",
    "第一章采用「"+first+"」。两箱幼苗已送达，桥头固定线路已接通。"+second+"\n此次试玩进度保存在当前浏览器。",[
    {title:"返回对岸查看",run:()=>say("巡线员","桥已开放，附近还可以继续走走。")},
    {title:"重新开始",run:confirmReset}
  ]);
}
function farm(){
  if(state.flags.harvest){
    say("叶禾","这一盘先留种。下一季我们就有自己的苗。");
    return;
  }
  if(!state.flags.planted){
    state.flags.planted=true;
    state.flags.plantedAt=Date.now();
    save();beep(480);
    say("叶禾","你种好这一格了。等十五秒，再回来收第一茬。");
    return;
  }
  const remaining=Math.ceil((state.flags.plantedAt+15000-Date.now())/1000);
  if(remaining>0){
    say("叶禾","还要等 "+remaining+" 秒。先去看看驿站院场吧。");
    return;
  }
  state.flags.harvest=true;save();beep(540,.26);
  say("叶禾","第一茬收好了。给那张空桌放一盘。");
}
function court(){
  if(!state.flags.court){
    openMenu("驿站院场","修复羽毛球场","用 2 废料装好网柱和地线。",[
      {title:"修复球场 · 2 废料",disabled:state.scrap<2,run:()=>{
        state.scrap-=2;state.flags.court=true;save();say("阿澄","球场修好啦。来打一组回合？");
      }}, returnChoice
    ]);
    return;
  }
  openMenu("驿站院场","羽毛球练习","指针进入绿色区间时按 E 或点回球。连中 3 球就完成这次练习。",[
    {title:"开始练习",run:()=>startRally(0)},returnChoice
  ]);
}
function startRally(score){
  if(score>=3){
    state.flags.rallyDone=true;save();
    openMenu("驿站院场","完成三个来回","阿澄把球捡回来，又去找了一副好一点的拍子。",[
      {title:"再练一次",run:()=>startRally(0)},returnChoice
    ]);
    return;
  }
  openMenu("羽毛球练习","接住来球 · "+score+"/3","指针进入绿色区间时回球。",[
    {title:"回球",run:()=>hitRally(score)},returnChoice
  ]);
  lastRallyPosition=0;
  rally={start:performance.now()+240,score};
  $("rally-meter").hidden=false;
}
let lastRallyPosition=0;
function hitRally(score){
  const hit=lastRallyPosition>=.58&&lastRallyPosition<=.77;
  beep(hit?590:125);
  if(hit)startRally(score+1);
  else openMenu("羽毛球练习","球落地了","看准指针进入绿色区间，再按回球。",[
    {title:"从第一球重试",run:()=>startRally(0)},returnChoice
  ]);
}
function confirmReset() {
  openMenu("试玩存档","重新开始两章？","这会从医院重新开始，并用新进度替换当前试玩存档。",[
    {title:"确认重新开始",run:()=>{state=opening();newRuntime();save();say("护士","去见林岚。今晚那条备用线还没确认。");syncHud();}},
    returnChoice
  ]);
}

function takeCargo(mode, ids) {
  if(!ids.length) return;
  state.carry = mode;
  state.held = mode === "hand" ? ids.slice(0,1) : ids;
  if(state.drop && ids === state.drop.ids) {
    const left=state.drop.ids.filter(id=>!state.held.includes(id));
    state.drop=left.length?{...state.drop,ids:left}:null;
  }
  if(state.phase==="collect")setPhase("transport");else save();
  beep(340);
}
function stockOptions(ids, dropped = false) {
  openMenu("货物","选择搬运方式","推车一次带两箱。泵房便道较窄，可手提一箱走近路。",[
    {title:"牵引推车",note:"通行宽路，移动较慢。",run:()=>takeCargo("cart",ids)},
    {title:"手提一箱",note:"通过泵房便道，另一箱留在接货处。",run:()=>takeCargo("hand",ids)},
    returnChoice
  ]);
}
function putCargoDown() {
  if(!state.held.length)return;
  if(state.drop) {
    say("巡线员","先把手里的货交到接应架，再回来取停放的货。",4);
    return;
  }
  state.drop={x:state.x,y:state.y,ids:state.held,mode:state.carry};
  state.held=[];state.carry="";save();beep(180);
}
function splitCargo() {
  if(state.carry!=="cart")return;
  if(state.held.length>1 && state.drop){say("巡线员","前面已经停了一箱。先在接应架交货。");return;}
  if(state.held.length>1)state.drop={x:state.x,y:state.y,ids:state.held.slice(1),mode:"hand"};
  state.held=state.held.slice(0,1);state.carry="hand";save();
  say("巡线员","换成手提。推车留在入口。",3);
}
function available() {
  const consumed = state.phase==="bridgeBoss"?state.final:state.racked;
  const omit=new Set([...consumed,...state.held,...(state.drop?.ids||[])]);
  return (state.ch===1?[0]:[0,1]).filter(id=>!omit.has(id));
}
function deposit(where) {
  if(!state.held.length){say("巡线员","接应架空着。先把货带过来。",3);return;}
  if(where==="rack"){
    state.racked=[...new Set([...state.racked,...state.held])];
    state.held=[];state.carry="";beep(520);
    if(state.racked.length===2){
      state.scrap+=2;runtime.xp=0;runtime.upgrade="";runtime.enemies=[];
      setPhase("defensePrep");
      say("梁砚","两箱齐了。作业灯占一格电，剩两格留给防线。",5);
    } else {save();say("梁砚","第一箱到了。还有一箱。",4);}
  } else {
    state.final=[...new Set([...state.final,...state.held])];
    state.held=[];state.carry="";beep(540);
    if(state.final.length===2){runtime.enemies=[];runtime.boss=null;setPhase("power");say("叶禾","两箱都好好的。现在能给它们找个地方长了。");}
    else {save();say("对岸接应","第一箱已入库。回桥头取余下的一箱。",4);}
  }
}
function buildAt(name) {
  const here=state.towers[name];
  const capacity=Object.keys(state.towers).length;
  const option=(kind,title,cost,note)=>({
    title:title+" · "+cost+" 废料",note,disabled:!!here||state.scrap<cost||capacity>=2,
    run:()=>{state.towers[name]={kind,cost};state.scrap-=cost;beep(410);if(state.phase==="defensePrep")save();}
  });
  openMenu("桥头 · 工位","布置防线",
    "现场供电 "+(1+capacity)+"/3。作业灯占 1 格，每个工位设备占 1 格。",[
      option("gun","护路塔",2,"优先射击靠近控制柜的检修机。"),
      option("slow","缓行器",1,"减慢进入范围的检修机。"),
      option("light","临时护路灯",1,"站在灯下补充体力。"),
      ...(here?[{title:"拆除已建设备",run:()=>{state.scrap+=here.cost;delete state.towers[name];if(state.phase==="defensePrep")save();}}]:[]),
      returnChoice
    ]);
}
function defenseConsole() {
  if(runtime.countdown>0){startDefense();return;}
  openMenu("桥头控制柜","准备接电守线","接电后进入 15 秒布防倒计时。也可再次操作控制柜提前开始。",[
    {title:"启动布防倒计时",run:()=>{runtime.countdown=15;beep(262,.2);}},
    returnChoice
  ]);
}
function startDefense() {
  runtime.countdown=0;runtime.cabinet=70;runtime.disabled=0;
  save();setPhase("defenseWave",false);spawnWave(1);
  say("梁砚","检修机从高架和下层都来了。先看控制柜。");
}
function crewMenu(){
  if(!state.flags.engineer && !state.flags.tempEngineer)return;
  openMenu("小队指令","梁砚协助", "命令对当前出勤生效。",[
    {title:"归队",note:"跟随巡线员，修整间隙接应。",run:()=>state.crew="follow"},
    {title:"护货",note:"靠近任务货物，降低抢货机造成的破坏。",run:()=>state.crew="escort"},
    {title:"守位",note:"留在此处，周期性击退靠近的检修机。",run:()=>{state.crew="hold";runtime.guard={x:state.x,y:state.y};}},
    returnChoice
  ]);
}
function interactables() {
  const items=[];
  const add=(key,label,action)=>items.push({...point(key),label,action});
  const ch=state.ch, phase=state.phase;
  if(ch===1){
    if(phase==="hospital")add("hospital","与林岚交谈",()=>{say("林岚","隔壁病床也在等今晚的电。查清楚再签。");setPhase("workorder");});
    if(phase==="workorder")add("supply","领取断电工单",()=>{say("配电站","旧站登记为空。医院接在同一条备用线上。");setPhase("scout");});
    if(phase==="scout")add("scout","核查站台",()=>{state.flags.tempEngineer=true;setPhase("collect");say("梁砚","站里有人，灯下还养着苗。去配电站取一组电池。",6);});
    if(phase==="collect")add("supply","领取应急电池",()=>stockOptions([0]));
    if(["scout","collect","transport"].includes(phase)){
      if(!state.flags.gate)add("gate","打开手动检修门",()=>{state.flags.gate=true;save();beep(290);say("巡线员","检修门会保持开启。推车只能走灯廊。");});
      if(!state.flags.road)add("road","铺好裂砖便道 · 现场有材料",()=>{state.flags.road=true;save();beep(445);say("巡线员","路面已铺好。以后推车经过不会减速。");});
    }
    if(phase==="transport"&&state.held.length)add("intake","运入检票区",()=>beginBoss("station"));
    if(phase==="stationBoss"){
      if(!state.flags.lever)add("lever","释放检修闸",()=>{state.flags.lever=true;beep(440);say("梁砚","检修闸开了。等「无人」广播，再把电池接上。");});
      add("socket","接入应急电池",()=>{
        if(!state.held.length){say("巡线员","先把电池带来。");return;}
        if(runtime.boss && !bossExposed()){say("梁砚","等广播停顿。警示带熄灭后再接。",3);return;}
        runtime.boss=null;runtime.enemies=[];state.held=[];state.carry="";state.drop=null;
        setPhase("power");say("验票机","站内有人。",5);beep(615,.22);
      });
    }
    if(phase==="power"){
      if(!state.flags.borrow)add("borrow","向邻区争取借电",()=>{state.flags.borrow=true;save();say("邻区值班","一格电可以借你。我们这边会提前关一段灯。");});
      if(!state.flags.mirror)add("mirror","修复屋顶反射镜",()=>{state.flags.mirror=true;save();beep(500);say("梁砚","镜子对准了。夜里还是用电，天亮就能接到光。");});
    }
    if(!["hospital","workorder","scout","stationBoss"].includes(phase)){
      for(const key of ["nameA","nameB"])if(!state.flags[key])add(key,"记录住户姓名",()=>{state.flags[key]=true;save();say("住户",key==="nameA"?"把葛阿姨也算上。她在门里歇着。":"我叫陶岑。灯亮了我就来接班。");});
      if(state.flags.nameA && state.flags.nameB && !state.flags.names)add("acheng","把住户名单交给阿澄",()=>{state.flags.names=true;state.scrap++;save();say("阿澄","我把字写大一点。下次送货就认得他们了。");});
    }
  } else {
    if(["collect","transport"].includes(phase) && available().length && !state.held.length)
      add("stock","领取幼苗",()=>stockOptions(available()));
    if(["collect","transport","complete"].includes(phase)&&!state.flags.grower)
      add("yehe","叶禾 · 给明年留一半",()=>openMenu("支线 · 给明年留一半","把当晚的口粮补齐",
        "病房在等吃的，叶禾想留下这批种子。驿站还有一份公共口粮。",[
        {title:"安排口粮送到病房",run:()=>{state.flags.grower=true;save();say("叶禾","病房那份有着落了。我去桥头给你搭把手。");}},
        returnChoice
      ]));
    if(phase==="transport"){
      if(!state.flags.pump)add("pump","点亮泵房作业灯",()=>{state.flags.pump=true;save();enemy("jammer",39,20);say("巡线员","灯亮了。小心从东边来的干扰机。");});
      add("rack","交付幼苗到接应架",()=>deposit("rack"));
    }
    if(["defensePrep","defenseWave"].includes(phase)){
      for(const slot of ["towerA","towerB","towerC"])add(slot,"部署防御设备",()=>buildAt(slot));
    }
    if(phase==="defensePrep")add("console","在控制柜确认守线",defenseConsole);
    if(phase==="bridgeBoss"){
      if(available().length&&!state.held.length)add("reclaim","在桥头取回幼苗",()=>stockOptions(available()));
      add("delivery","把幼苗交给对岸接应",()=>deposit("final"));
    }
    if(phase==="complete"){
      add("court",state.flags.court?"羽毛球练习":"修复羽毛球场",court);
      add("farm",state.flags.harvest?"查看苗床":state.flags.planted?"查看作物":"播种第一格苗床",farm);
    }
    if(state.allocation==="borrow"&&!state.flags.repaid&&!["defenseWave","bridgeBoss"].includes(phase)){
      add("relief","交还邻区的应急电池",()=>{
        state.flags.repaid=true;save();say("邻区值班","借的电收到了。下次有货，我也派个人来。");
      });
    }
  }
  if((state.carry==="cart")&&["transport","bridgeBoss"].includes(phase)){
    for(const [x,y] of [[19,16],[45,17.8],[54,15.3]])items.push({x,y,label:"卸下一箱手提",action:splitCargo});
  }
  if(state.drop&&!state.held.length)items.push({...state.drop,label:"取回停放的货物",action:()=>stockOptions(state.drop.ids,true)});
  if(phase==="power"||phase==="complete")add("power",phase==="power"?"打开配电面板":"查看章节结算",choosePower);
  return items;
}
function nearest() {
  return interactables().filter(item=>distance(item,state)<1.58).sort((a,b)=>distance(a,state)-distance(b,state))[0];
}
function use(item=nearest()) {
  if(menu.open)return;
  if(item){beep(254,.07);item.action();}
  else if(state.held.length)putCargoDown();
  syncHud();
}

function enemy(kind,x,y) {
  runtime.enemies.push({kind,x,y,hp:ENEMIES[kind].hp,cd:0,ready:0,hurt:0,dx:0,dy:0});
}
function enemyGroup(list) {for(const args of list)enemy(...args);}
function spawnWave(wave) {
  runtime.wave=wave;
  runtime.waveGap=0;
  if(wave===1)enemyGroup([["patrol",55,10],["patrol",55,18],["thief",56,14]]);
  else enemyGroup([["patrol",56,9],["thief",55,18],["jammer",57,14]]);
  beep(115,.2);
}
function bossExposed(){return runtime.bossTime%7>=4.4;}
function bossLane(){return Math.floor(runtime.bossTime/7)%2===0?11.6:17.0;}
function hitPlayer(amount){
  if(runtime.invuln>0)return;
  state.hp=Math.max(0,state.hp-amount);
  runtime.invuln=1;
  beep(88,.13,"sawtooth",.035);
  if(state.hp<=0)openMenu("出勤中断","你已撤到安全点","本段可从最近检查点重试，已交付的任务物资会保留。",[
    {title:"从检查点重试",run:resetFromCheckpoint}
  ]);
}
function hitEnemy(e,value){
  e.hp-=value;e.hurt=.15;
  if(e.ready>0&&e.kind==="thief"&&runtime.upgrade==="snare")e.ready=0;
  if(e.hp<=0){
    if(e===runtime.boss){runtime.boss=null;say("巡线员",state.ch===1?"验票机停机。现在能接上线。":"摊铺车停机。把货送进对岸接收区。");beep(410,.25);}
    else {runtime.xp++;beep(190);}
  }
}
function chooseUpgrade(){
  openMenu("局内强化","给电弧扳手加一项改装","改装持续到本次出勤结束。",[
    {title:"过载线圈 · 伤害 +4",run:()=>runtime.upgrade="damage"},
    {title:"宽电极 · 射程 +1 格",run:()=>runtime.upgrade="range"},
    {title:"捕捉线 · 命中打断抢货",run:()=>runtime.upgrade="snare"}
  ]);
}
function updateMovement(dt){
  const keyX=Number(keys.has("KeyD")||keys.has("ArrowRight"))-Number(keys.has("KeyA")||keys.has("ArrowLeft"));
  const keyY=Number(keys.has("KeyS")||keys.has("ArrowDown"))-Number(keys.has("KeyW")||keys.has("ArrowUp"));
  const keyLength=Math.hypot(keyX,keyY);
  const dx=keyLength?keyX/keyLength:touchInput.x;
  const dy=keyLength?keyY/keyLength:touchInput.y;
  const strength=keyLength?1:Math.hypot(dx,dy);
  runtime.walking=strength>0;
  if(dx)runtime.flip=Math.sign(dx);
  let speed=state.carry==="cart"?2.8+(state.specialty==="transport"?.2:0):state.carry==="hand"?3.4:4;
  const sprinting=touchInput.sprint||keys.has("ShiftLeft")||keys.has("ShiftRight");
  if(strength&&!state.carry&&sprinting&&state.stamina>0){
    speed=5.6;state.stamina=Math.max(0,state.stamina-10*dt*strength);runtime.lastSprint=runtime.elapsed;
  }
  if(strength){
    const nx=state.x+dx*speed*dt;
    const ny=state.y+dy*speed*dt;
    if(passable(nx,state.y))state.x=nx;
    if(passable(state.x,ny))state.y=ny;
  }
  if(runtime.elapsed-runtime.lastSprint>1&&isLit())state.stamina=Math.min(100,state.stamina+8*dt);
  let companion=state.crew==="hold"&&runtime.guard?runtime.guard:
    {x:state.x-.78*runtime.flip,y:state.y+.67};
  const distanceTo=distance(companion,{x:runtime.npcX,y:runtime.npcY});
  const speedNpc=distanceTo>6?7:4;
  const factor=Math.min(1,speedNpc*dt/Math.max(.001,distanceTo));
  runtime.npcX+=(companion.x-runtime.npcX)*factor;
  runtime.npcY+=(companion.y-runtime.npcY)*factor;
}
function passable(x,y){
  if(!art.roadAt(currentMap(),x,y))return false;
  if(state.carry==="cart"&&x>=20&&x<43&&y>=18)return false;
  if(state.ch===1&&x>=36&&x<37&&y>=18&&y<22&&!state.flags.gate)return false;
  if(state.ch===1&&state.phase!=="stationBoss"&&["hospital","workorder","scout","collect","transport"].includes(state.phase)&&x>53)return false;
  if(state.ch===1&&state.phase==="stationBoss"&&runtime.boss&&!bossExposed()&&!state.flags.lever&&x>=55.7&&x<56.4&&y>11.8&&y<16.1)return false;
  if(state.ch===2&&["collect","transport","defensePrep","defenseWave"].includes(state.phase)&&x>53.8)return false;
  return true;
}
function lamps(){
  const result=currentMap().lamps.filter(([x])=>!(state.ch===2&&state.allocation==="borrow"&&x===34));
  if(state.ch===2&&state.flags.pump)result.push([33.7,20,2.6]);
  if(state.ch===2)for(const [key,device] of Object.entries(state.towers))if(device.kind==="light"&&runtime.disabled<=0){const p=point(key);result.push([p.x,p.y,2.8]);}
  return result;
}
function isLit(){return lamps().some(([x,y,r])=>Math.hypot(state.x-x,state.y-y)<r);}
function triggerPatrols(){
  const once=(key,condition,group)=>{if(condition&&!runtime.marks[key]){runtime.marks[key]=true;enemyGroup(group);}};
  const ch=state.ch;
  const phase=state.phase;
  if(ch===1&&(phase==="scout"||phase==="transport")){
    once("top",state.x>23&&state.x<38&&state.y<12,[["patrol",30,8.7],["patrol",33,9.6],["thief",36,8.9]]);
    once("bottom",state.x>25&&state.x<37&&state.y>=18,[["patrol",31,20],["thief",34,20.6]]);
  }
  if(ch===2&&phase==="transport"){
    once("top",state.x>24&&state.x<38&&state.y<12,[["patrol",31,8],["patrol",34,10],["thief",38,9]]);
    once("bottom",state.x>24&&state.x<36&&state.y>=18,[["patrol",30,20],["jammer",35,20.5]]);
  }
}
function updateBoss(dt){
  if(!runtime.boss)return;
  const e=runtime.boss;
  runtime.bossTime+=dt;e.hurt=Math.max(0,e.hurt-dt);
  const cycle=runtime.bossTime%7;
  let aim=bossLane();
  if(e.kind==="station")aim=14.2+(Math.floor(runtime.bossTime/7)%2===0?-1:1);
  e.y+=(aim-e.y)*Math.min(1,dt*(cycle<4.4?2.4:1));
  if(cycle>=3.4&&cycle<4.4){
    const hit=e.kind==="bridge"
      ?state.x>54&&Math.abs(state.y-bossLane())<.93
      :state.x>53&&state.x<61&&Math.abs(state.y-e.y)<.96;
    if(hit)hitPlayer(e.kind==="bridge"?16:13);
  }
  const cycleIndex=Math.floor(runtime.bossTime/7);
  if(cycleIndex>runtime.bossSpawn&&runtime.enemies.length<3){
    runtime.bossSpawn=cycleIndex;
    enemy(e.kind==="station"?"thief":"patrol",e.x + .7,e.y+.8);
  }
}
function updateEnemies(dt) {
  const defend=state.phase==="defenseWave";
  const manager=defend?point("console"):null;
  for(const e of runtime.enemies){
    e.hurt=Math.max(0,e.hurt-dt);e.cd=Math.max(0,e.cd-dt);
    const targetsCrate=e.kind==="thief"&&state.held.length>0;
    const target=defend&&manager?manager:targetsCrate?state.drop||state:state;
    const dx=target.x-e.x,dy=target.y-e.y,d=Math.hypot(dx,dy);
    const slowed=runtime.disabled<=0&&Object.entries(state.towers).some(([key,value])=>value.kind==="slow"&&distance(e,point(key))<2.65);
    if(d>1.02 && e.ready<=0){
      const speed=ENEMIES[e.kind].speed*(slowed?.65:1);
      e.x+=dx/d*speed*dt;e.y+=dy/d*speed*dt;
    } else if(e.cd<=0){
      e.ready+=dt;
      const wind=e.kind==="jammer"?2:e.kind==="thief"?1.04:.8;
      if(e.ready>=wind){
        e.ready=0;e.cd=e.kind==="jammer"?6:1.55;
        if(distance(e,target)<1.68){
          if(defend) {
            if(e.kind==="jammer")runtime.disabled=3;
            runtime.cabinet=Math.max(0,runtime.cabinet-(e.kind==="jammer"?9:7));
          }
          else if(targetsCrate && state.ch===2){
            const id=state.held[0];
            state.quality[id]-=state.crew==="escort"?.5:1;
            if(state.quality[id]<=0){
              state.held=state.held.filter(box=>box!==id);
              if(!state.held.length)state.carry="";
              say("梁砚","一箱苗坏了。回最近的接货点补领。",4);
              state.quality[id]=3;
            }
          } else hitPlayer(e.kind==="patrol"?10:7);
        }
      }
    }
  }
  if(runtime.cabinet<=0&&!menu.open){
    openMenu("守线失败","控制柜断电","从布防前重试，接应架上的两箱幼苗会保留。",[
      {title:"重新布防",run:resetFromCheckpoint}
    ]);
  }
}
function shoot(from,e,damage,tint){
  runtime.effects.push({from:{x:from.x,y:from.y},to:{x:e.x,y:e.y},left:.18,tint});
  hitEnemy(e,damage);
}
function updateAttacks(dt){
  runtime.cooldown=Math.max(0,runtime.cooldown-dt);
  const options=[...runtime.enemies];
  if(runtime.boss&&bossExposed()) options.push(runtime.boss);
  const range=runtime.upgrade==="range"?3.5:2.5;
  const near=options.filter(e=>e.hp>0&&distance(e,state)<=range).sort((a,b)=>distance(a,state)-distance(b,state))[0];
  if(near && runtime.cooldown<=0){
    runtime.cooldown=.65;
    shoot(state,near,10+(runtime.upgrade==="damage"?4:0)+(state.specialty==="combat"?1:0),"#e4c97b");
    beep(250,.04,"triangle",.019);
  }
  for(const [key,value] of Object.entries(state.towers)){
    runtime.towerShots[key]=(runtime.towerShots[key]||0)-dt;
    if(value.kind!=="gun" || runtime.disabled>0 || runtime.towerShots[key]>0)continue;
    const p=point(key);
    const target=options.filter(e=>e.hp>0&&distance(e,p)<4.6).sort((a,b)=>distance(a,p)-distance(b,p))[0];
    if(target){runtime.towerShots[key]=.8;shoot(p,target,8,"#a5dbc4");}
  }
  if(state.crew==="hold"&&runtime.guard&&Math.floor(runtime.elapsed)!==Math.floor(runtime.elapsed-dt)){
    const target=options.find(e=>e.hp>0&&distance(e,runtime.guard)<1.8);
    if(target)shoot(runtime.guard,target,6,"#84b8ad");
  }
  runtime.enemies=runtime.enemies.filter(e=>e.hp>0);
  runtime.effects=runtime.effects.map(e=>({...e,left:e.left-dt})).filter(e=>e.left>0);
  if(runtime.xp>=3&&!runtime.upgrade&&!menu.open&&["scout","transport","defenseWave"].includes(state.phase)&&state.hp>0)chooseUpgrade();
}
function advance(dt){
  if(menu.open)return;
  runtime.elapsed+=dt;
  runtime.invuln=Math.max(0,runtime.invuln-dt);
  runtime.disabled=Math.max(0,runtime.disabled-dt);
  updateMovement(dt);triggerPatrols();updateBoss(dt);updateEnemies(dt);
  if(menu.open)return;
  updateAttacks(dt);
  if(state.phase==="defensePrep"&&runtime.countdown>0){
    runtime.countdown-=dt;
    if(runtime.countdown<=0)startDefense();
  }
  if(state.phase==="defenseWave"&&runtime.enemies.length===0){
    runtime.waveGap+=dt;
    if(runtime.waveGap>2.4){
      if(runtime.wave===1)spawnWave(2);
      else beginBoss("bridge");
    }
  }
}

function drawLamps() {
  for(const [x,y,r] of lamps()) {
    art.glow(ctx,x*TILE,y*TILE-4,r*TILE,"#c7ae62");
    art.box(ctx,x*TILE-2,y*TILE-10,4,12,"#40575b");
    art.box(ctx,x*TILE-4,y*TILE-10,8,3,"#edd69c");
    art.box(ctx,x*TILE-1,y*TILE-8,3,2,"#e4c481");
  }
}
function markInteraction(p, selected) {
  const x=p.x*TILE,y=p.y*TILE;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));
  ctx.strokeStyle=selected?"#d6f9bf":"#7cca9a";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-6,1);ctx.lineTo(-6,5);ctx.lineTo(-2,5);ctx.moveTo(6,1);ctx.lineTo(6,5);ctx.lineTo(2,5);ctx.stroke();
  ctx.fillStyle=selected?"#e1f0bd":"#b0e1b1";
  const shift=Math.floor(Math.sin(now*4.2)*2);
  ctx.beginPath();ctx.moveTo(-3,-28+shift);ctx.lineTo(3,-28+shift);ctx.lineTo(0,-23+shift);ctx.fill();
  ctx.restore();
}
function drawGate(){
  if(state.ch!==1)return;
  if(!state.flags.gate){
    for(let y=18;y<22;y+=.5)art.box(ctx,36.3*TILE,y*TILE,4,7,"#657079");
    art.box(ctx,36.25*TILE,19.5*TILE,6,4,"#e8bd78");
  }
  if(state.phase==="stationBoss" && runtime.boss && !bossExposed()&&!state.flags.lever){
    for(let y=11.8;y<16.1;y+=.55)art.box(ctx,56*TILE,y*TILE,4,8,"#aa8a64");
  }
}
function drawProgress() {
  if(state.ch===1&&state.flags.road){
    for(let x=35;x<41;x++){art.box(ctx,x*TILE,8.1*TILE,15,27,"#646c64");art.box(ctx,x*TILE+2,9.2*TILE,6,2,"#92977d");}
  }
  if(state.ch===2&&state.flags.bridge){
    for(let x=51;x<64;x++)art.box(ctx,x*TILE,13*TILE,15,30,"#66706c");
    let x=(52+now%8)*TILE;
    art.box(ctx,x-10,14*TILE-8,22,14,"#85634b");art.box(ctx,x-7,14*TILE-6,9,8,"#a99969");
    art.box(ctx,x+5,14*TILE-6,7,9,"#7c9468");
    art.box(ctx,x-6,14*TILE+5,4,3,"#141d26");art.box(ctx,x+7,14*TILE+5,4,3,"#141d26");
  }
}
function drawTargets(){
  const p=currentMap().points;
  const stationPower=state.ch===1 && (state.phase==="complete" || state.flags.station);
  if(state.ch===1){
    art.person(ctx,p.hospital[0]*TILE,p.hospital[1]*TILE,art.looks.sister,0,-1);
    art.person(ctx,p.acheng[0]*TILE,p.acheng[1]*TILE,art.looks.child,0,-1);
    for(let i=0;i<3;i++)art.crate(ctx,(60.55+i*.68)*TILE,19.3*TILE,1,.8);
    if(stationPower)art.glow(ctx,61.8*TILE,17.7*TILE,47,state.allocation==="borrow"?"#bef78e":"#b6c084");
    if(state.phase==="power"){art.glow(ctx,48.5*TILE,10.1*TILE,22,"#b6c781");art.glow(ctx,59.4*TILE,9*TILE,22,"#c8a36a");}
  } else {
    art.person(ctx,p.yehe[0]*TILE,p.yehe[1]*TILE,art.looks.grower,0,-1);
    if(state.allocation==="borrow")art.person(ctx,14.45*TILE,13.15*TILE,art.looks.child,0,-1);
    if(state.allocation==="mirror"&&state.flags.mirror)art.glow(ctx,14*TILE,16.3*TILE,56,"#e4d49a");
    if(state.phase==="complete"){
      const soil=point("farm");
      art.box(ctx,soil.x*TILE-14,soil.y*TILE-6,28,12,"#70584a");
      for(let i=-10;i<13;i+=5)art.box(ctx,soil.x*TILE+i,soil.y*TILE-5,2,10,"#ae8964");
      if(state.flags.planted)for(let i=-9;i<=9;i+=6)art.box(ctx,soil.x*TILE+i,soil.y*TILE-4,3,4,state.flags.harvest?"#afbd78":"#75a562");
      if(state.flags.court){
        const p=point("court");
        ctx.strokeStyle="#a8bd8f";ctx.strokeRect(p.x*TILE-26,p.y*TILE-18,52,24);
        art.pathLine(ctx,p.x*TILE,p.y*TILE-18,p.x*TILE,p.y*TILE+6,"#d4bd87");
      }
    }
    for(const name of ["towerA","towerB","towerC"]){
      const {x,y}=point(name); const device=state.towers[name];
      ctx.strokeStyle=device?"#90b293":"#64847d";ctx.strokeRect(x*TILE-8,y*TILE-8,16,16);
      if(device){
        art.box(ctx,x*TILE-5,y*TILE-9,10,14,"#537676");
        art.box(ctx,x*TILE-3,y*TILE-9,6,5,device.kind==="gun"?"#d0b979":device.kind==="slow"?"#a0bdc8":"#e2ce91");
        art.box(ctx,x*TILE-4,y*TILE+3,8,3,"#242e3c");
      }
    }
    if(state.racked.length&&state.phase!=="complete")for(let i=0;i<state.racked.length-state.final.length;i++)art.crate(ctx,(47+i*.65)*TILE,15.5*TILE,1,.85);
  }
  if(available().length&&state.phase==="transport"&&state.ch===2){const p=point("stock");art.crate(ctx,p.x*TILE,p.y*TILE-5,1);}
  if(state.drop)art.crate(ctx,state.drop.x*TILE,state.drop.y*TILE, state.ch===2?1:0);
  if(state.held.length){
    const px=state.x*TILE-runtime.flip*(state.carry==="cart"?13:5);
    const py=state.y*TILE+(state.carry==="cart"?5:1);
    if(state.carry==="cart"){
      art.box(ctx,px-10,py-1,20,8,"#6a5948");art.box(ctx,px-8,py+5,4,3,"#202d31");art.box(ctx,px+5,py+5,4,3,"#202d31");
    }
    art.crate(ctx,px,py-2,state.ch===2?1:0,state.carry==="cart"?1:.75);
    if(state.held.length>1)art.crate(ctx,px-7,py-7,1,.63);
  }
}
function drawHostiles(){
  if(runtime.boss){
    const cycle=runtime.bossTime%7;
    if(cycle>2.2&&cycle<4.4){
      const y=(runtime.boss.kind==="bridge"?bossLane():runtime.boss.y)*TILE;
      const left=(runtime.boss.kind==="bridge"?54:53)*TILE;
      art.box(ctx,left,y-12,10*TILE,24,cycle<3.4?"#ce785537":"#ff88635b");
      for(let x=left;x<left+160;x+=12)art.pathLine(ctx,x,y-11,x+8,y+11,"#df8d62a8");
      art.pathLine(ctx,left,y-12,left+160,y-12,"#e7956c");art.pathLine(ctx,left,y+12,left+160,y+12,"#e7956c");
    }
    art.robot(ctx,runtime.boss,now);
    const {x,y,hp,max}=runtime.boss;
    art.box(ctx,x*TILE-25,y*TILE-47,50,4,"#17232b");art.box(ctx,x*TILE-25,y*TILE-47,50*hp/max,4,bossExposed()?"#a4e6a3":"#e98b69");
    if(bossExposed())art.glow(ctx,x*TILE,y*TILE-12,23,"#bddb92");
  }
  for(const e of runtime.enemies){
    if(e.ready>.2){
      const x=e.x*TILE,y=e.y*TILE;
      art.box(ctx,x-7,y-19,14,2,"#202631");
      art.box(ctx,x-7,y-19,Math.min(14,e.ready*12),2,"#e9a168");
    }
    art.robot(ctx,e,now);
  }
  for(const bolt of runtime.effects) {
    ctx.globalAlpha=bolt.left/.18;
    art.pathLine(ctx,bolt.from.x*TILE,bolt.from.y*TILE-7,bolt.to.x*TILE,bolt.to.y*TILE-5,bolt.tint,2);
    art.box(ctx,bolt.to.x*TILE-2,bolt.to.y*TILE-7,3,3,"#efe7ac");
    ctx.globalAlpha=1;
  }
}
function drawMap(){
  const w=mapCanvas.width,h=mapCanvas.height;
  mini.clearRect(0,0,w,h);
  const sx=w/WIDTH,sy=h/HEIGHT;
  mini.fillStyle="#101b25";mini.fillRect(0,0,w,h);
  for(const [x,y,r,b] of currentMap().areas){
    mini.fillStyle=y>=18&&x<45?"#354447":"#45575f";
    mini.fillRect(x*sx,y*sy,(r-x)*sx,(b-y)*sy);
  }
  if(state.ch===1&&state.flags.road)art.box(mini,35*sx,8*sy,6*sx,2*sy,"#9aca9f");
  for(const [x,y] of lamps())art.box(mini,x*sx-1.4,y*sy-1.4,3,3,"#c8a575");
  const goal=goalPoint();
  art.box(mini,goal.x*sx-2,goal.y*sy-2,5,5,"#f7bf78");
  art.box(mini,state.x*sx-2,state.y*sy-2,5,5,"#a6edb4");
}
function render(dt) {
  const vx=clamp(state.x*TILE-canvas.width/2,0,WIDTH*TILE-canvas.width);
  const vy=clamp(state.y*TILE-canvas.height/2,0,HEIGHT*TILE-canvas.height);
  runtime.cameraX+=(vx-runtime.cameraX)*Math.min(1,dt*8);
  runtime.cameraY+=(vy-runtime.cameraY)*Math.min(1,dt*8);
  const cx=Math.round(runtime.cameraX),cy=Math.round(runtime.cameraY);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(backgrounds[state.ch-1],cx,cy,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
  ctx.save();ctx.translate(-cx,-cy);
  drawProgress();drawLamps();drawGate();drawTargets();drawHostiles();
  if(state.flags.engineer||state.flags.tempEngineer)art.person(ctx,runtime.npcX*TILE,runtime.npcY*TILE,art.looks.engineer,runtime.walking?Math.floor(now*7)%2:0,runtime.flip);
  art.glow(ctx,state.x*TILE,state.y*TILE,35,"#b7bb83");
  ctx.globalAlpha=runtime.invuln>0&&Math.floor(now*10)%2===0?.53:1;
  art.person(ctx,state.x*TILE,state.y*TILE,art.looks.player,runtime.walking?Math.floor(now*10)%3-1:0,runtime.flip);
  ctx.globalAlpha=1;
  const items=interactables();
  const active=nearest();
  for(const p of items)if(distance(p,state)<15)markInteraction(p,active?.label===p.label&&active?.x===p.x&&active?.y===p.y);
  ctx.font='bold 9px ui-monospace, "PingFang SC", monospace';
  ctx.textAlign="center";
  for(const [x,y,name] of currentMap().labels) {
    const xx=x*TILE,yy=y*TILE;
    const width=ctx.measureText(name).width;
    art.box(ctx,xx-width/2-4,yy-8,width+8,12,"#182733ee");ctx.fillStyle="#d2ddd2";ctx.fillText(name,xx,yy+1);
  }
  ctx.restore();
  const vignette=ctx.createRadialGradient(240,140,112,240,140,290);
  vignette.addColorStop(0,"#0b131900");vignette.addColorStop(1,"#06091180");
  ctx.fillStyle=vignette;ctx.fillRect(0,0,480,288);
  const prompt=$("prompt");
  const label=active?.label||(state.held.length?"停放货物":"");
  if(prompt.lastElementChild.textContent!==label)prompt.lastElementChild.textContent=label;
  prompt.hidden=!label||menu.open;
  if(now>dialogueUntil)$("dialogue").hidden=true;
  drawMap();
}
function getGoal(){return (state.ch===1?CH1_GOALS:CH2_GOALS)[state.phase];}
function goalPoint() {
  const goal=getGoal()[2];
  if(state.ch===2&&state.phase==="bridgeBoss"&&state.held.length===0)return point("reclaim");
  if(state.ch===2&&state.phase==="transport"&&!state.held.length&&available().length)return point("stock");
  return point(goal);
}
function syncHud() {
  const goal=getGoal();
  const target=goalPoint();
  $("chapter-index").textContent=state.ch===1?"第一章 · 平原":"第二章 · 平原";
  $("chapter-title").textContent=currentMap().title;
  if($("goal-title").textContent!==goal[0])$("goal-title").textContent=goal[0];
  $("goal-text").textContent=state.ch===2&&state.phase==="bridgeBoss"&&state.held.length===0?"在桥头接应架取苗，再看预警挑路线。":goal[1];
  $("step1").classList.toggle("current",state.ch===1);$("step2").classList.toggle("current",state.ch===2);
  $("location").textContent=state.ch===1?(state.x<10?"平原 · 中心医院":state.x<19?"平原 · 配电站":state.x<45?"平原 · 站外街区":"平原 · 旧地铁站"):(state.x<19?"平原 · 驿站":state.x<45?"平原 · 洪沟":"平原 · 雨水高架");
  $("day").textContent=state.ch===1?"战后第十八年 · 夜":"战后第十八年 · 次日";
  $("freight").textContent=state.ch===1?(state.held.length?"电池 ×1":state.phase==="power"||state.phase==="complete"?"已接入":"—"):(state.held.length?("在途 "+state.held.length+"/2"):(totalBoxes()+"/2"));
  $("gesture-note").textContent=state.held.length
    ?"拖动画面移动，点按近处标记交互，点自己放下货物。"
    :"拖动画面移动，拖远可冲刺。点按近处标记交互，长按打开小队。";
  $("scrap").textContent=state.scrap;
  $("crew").textContent=1+(state.flags.engineer||state.flags.tempEngineer?1:0)+(state.flags.grower?1:0);
  $("hp").textContent=Math.ceil(state.hp);
  $("stamina").textContent=Math.ceil(state.stamina);
  $("hp-bar").style.width=state.hp+"%";
  $("stamina-bar").style.width=state.stamina+"%";
  $("light-dot").classList.toggle("dark",!isLit());
  $("light-label").textContent=isLit()?"固定照明":"暗区";
  $("route-hint").textContent=state.phase==="complete"?"本章工单已结算。":"目标约 "+Math.ceil(distance(state,target))+" 格 · 上方主路，下方泵房便道。";
  let alert="";
  if(runtime.countdown>0) alert="布防 "+Math.ceil(runtime.countdown)+" 秒 · 可通过控制柜提前开战";
  if(state.phase==="defenseWave")alert="第 "+runtime.wave+"/2 波 · 控制柜 "+runtime.cabinet+"/70"+(runtime.disabled>0?" · 设备受干扰":"");
  if(runtime.boss)alert=(state.ch===1?"空站验票机":"断桥摊铺车")+" · "+(bossExposed()?(state.ch===1?"接线窗口":"通行窗口"):"注意作业预警");
  $("screen-alert").textContent=alert;$("screen-alert").hidden=!alert;
  $("field-note").textContent=state.held.length
    ?(state.carry==="cart"?"推车可走高架。在便道入口可卸箱手提。":"手提货可过便道。交货前留意抢货机。")
    :state.ch===2?"塔与路灯共享桥头供电。已建成的路会保留。":"固定照明能恢复体力。手提灯照亮脚下的路。";
}
function pause(){
  if(menu.open){closeMenu();return;}
  openMenu("暂停","出勤已暂停","触屏拖动移动，拖远冲刺，点按近处标记交互，长按打开小队。\n键盘可用 WASD、E、Shift 和空格。",[
    {title:"继续出勤"},
    {title:"从检查点重试",run:resetFromCheckpoint},
    {title:"重新开始",run:confirmReset}
  ]);
}
const movementKeys=["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ShiftLeft","ShiftRight"];
window.addEventListener("keydown",event=>{
  if(event.code==="Escape"&&!menu.open){event.preventDefault();pause();return;}
  if(menu.open&&rally&&event.code==="KeyE"&&!event.repeat){
    event.preventDefault();
    const score=rally.score;closeMenu();hitRally(score);return;
  }
  if(menu.open)return;
  if(movementKeys.includes(event.code)){event.preventDefault();keys.add(event.code);return;}
  if(event.repeat)return;
  if(event.code==="KeyE"){event.preventDefault();use();}
  if(event.code==="Space"){event.preventDefault();crewMenu();}
});
window.addEventListener("keyup",event=>keys.delete(event.code));
window.addEventListener("blur",clearControls);
document.addEventListener("visibilitychange",()=>{if(document.hidden)clearControls();});
menu.addEventListener("cancel",event=>{event.preventDefault();closeMenu();});
$("pause").addEventListener("click",pause);
$("sound").addEventListener("click",async()=>{
  audioOn=!audioOn;
  if(audioOn){soundContext||=new AudioContext();await soundContext.resume();beep(560,.13);}
  $("sound").setAttribute("aria-pressed",String(audioOn));
  $("sound").textContent=audioOn?"声音开":"声音关";
});
function releaseCanvasTouch(){
  const id=touchInput.pointer;
  touchInput.pointer=null;
  touchInput.x=0;touchInput.y=0;
  touchInput.sprint=false;
  clearTimeout(touchInput.timer);
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
}
function clearControls(){keys.clear();releaseCanvasTouch();}
function canvasTap(event){
  const bounds=canvas.getBoundingClientRect();
  const scale=Math.min(bounds.width/canvas.width,bounds.height/canvas.height);
  const left=bounds.left+(bounds.width-canvas.width*scale)/2;
  const top=bounds.top+(bounds.height-canvas.height*scale)/2;
  const px=(event.clientX-left)/scale;
  const py=(event.clientY-top)/scale;
  if(px<0||px>=canvas.width||py<0||py>=canvas.height)return;
  const tap={x:(px+Math.round(runtime.cameraX))/TILE,y:(py+Math.round(runtime.cameraY))/TILE};
  const targets=interactables().filter(item=>Math.abs(item.x-tap.x)<.95&&tap.y>=item.y-1.85&&tap.y<=item.y+.6);
  const target=targets.sort((a,b)=>distance(a,state)-distance(b,state))[0];
  if(target){
    if(distance(target,state)<1.58)use(target);
    else say("提示","走近后点按目标。",2);
    return;
  }
  if(state.held.length&&distance(tap,{x:state.x,y:state.y-.5})<1)use(null);
}
canvas.addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||menu.open||touchInput.pointer!==null||event.button!==0)return;
  event.preventDefault();
  touchInput.pointer=event.pointerId;
  touchInput.startX=event.clientX;
  touchInput.startY=event.clientY;
  touchInput.moved=false;
  canvas.setPointerCapture(event.pointerId);
  if(state.flags.engineer||state.flags.tempEngineer){
    touchInput.timer=setTimeout(crewMenu,570);
  }
});
canvas.addEventListener("pointermove",event=>{
  if(event.pointerId!==touchInput.pointer)return;
  const x=event.clientX-touchInput.startX;
  const y=event.clientY-touchInput.startY;
  const length=Math.hypot(x,y);
  const deadZone=6;
  if(length>deadZone){
    touchInput.moved=true;
    clearTimeout(touchInput.timer);
  }
  const pull=clamp((length-deadZone)/22,0,1);
  touchInput.x=length===0?0:x/length*pull;
  touchInput.y=length===0?0:y/length*pull;
  touchInput.sprint=length>=52;
});
canvas.addEventListener("pointerup",event=>{
  if(event.pointerId!==touchInput.pointer)return;
  const tap=!touchInput.moved;
  releaseCanvasTouch();
  if(tap)canvasTap(event);
});
for(const eventName of ["pointercancel","lostpointercapture"]){
  canvas.addEventListener(eventName,event=>{if(event.pointerId===touchInput.pointer)releaseCanvasTouch();});
}
newRuntime();
save("本地存档");
syncHud();
if(state.phase==="hospital")say("护士","巡线员，林岚在医院入口等你。",5);
function frame(time){
  const dt=Math.min((time-last)/1000,.04);
  last=time;now+=dt;
  advance(dt);
  if(rally){
    lastRallyPosition=clamp((time-rally.start)/(1550-rally.score*95),0,1);
    $("rally-meter").lastElementChild.style.left=lastRallyPosition*100+"%";
    if(lastRallyPosition>=1){const score=rally.score;closeMenu();hitRally(score);}
  }
  render(dt);
  uiTime+=dt;
  if(uiTime>=.14){syncHud();uiTime=0;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
