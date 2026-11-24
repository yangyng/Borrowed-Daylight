"use strict";

const $ = id => document.getElementById(id);
const canvas = $("world");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const mapCanvas = $("map");
const mini = mapCanvas.getContext("2d");
const menu = $("menu");
const storyDialog = $("story");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const scenes = MAPS.map((map, i) => art.terrain(map, i + 1));
const drawQueue = [];
const view = {width:canvas.width,height:canvas.height};
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
let story = null;
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
function cameraTarget(focus = state, scale = 1) {
  const width = view.width / scale, height = view.height / (scale * art.pitch);
  return {
    cameraX: clamp(focus.x * TILE - width / 2, 0, WIDTH * TILE - width),
    cameraY: clamp(focus.y * TILE - height / 2, -art.skyMargin / art.pitch, HEIGHT * TILE + art.foregroundMargin / art.pitch - height)
  };
}
function newRuntime() {
  runtime = {
    enemies: [], spawn: 0, marks: {}, boss: null, bossTime: 0, bossSpawn: 0,
    effects: [], elapsed: 0, cooldown: 0, invuln: 0, lastSprint: -10, xp: 0, upgrade: "",
    wave: 0, waveGap: 0, cabinet: 70, disabled: 0, towerShots: {}, countdown: 0,
    walking: false, flip: 1, npcX: state.x - .8, npcY: state.y + .5, guard: null,
    ...cameraTarget()
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
  if(kind === "station") playStory("machine");
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

function showStoryBeat() {
  const beat = story.scene.beats[story.index];
  story.focus = point(beat.focus);
  story.from = beat.from ? point(beat.from) : null;
  story.effect = beat.effect;
  story.started = now;
  $("story-speaker").textContent = beat.speaker;
  $("story-text").textContent = beat.text;
  $("story-next").textContent = story.index + 1 === story.scene.beats.length ? "返回现场" : "继续";
}
function playStory(id, after) {
  clearControls();
  runtime.walking = false;
  $("dialogue").hidden = true;
  const scene = STATION_STORY[id];
  story = {id, scene, index: 0, after};
  $("story-place").textContent = scene.place;
  $("story-title").textContent = scene.title;
  showStoryBeat();
  storyDialog.showModal();
}
function endStory() {
  if (!story) return;
  const {after} = story;
  story = null;
  storyDialog.close();
  Object.assign(runtime, cameraTarget());
  after?.();
  syncHud();
}
function showOpening() {
  if (state.ch !== 1 || state.phase !== "hospital" || state.flags.openingSeen) return;
  playStory("opening", () => {
    state.flags.openingSeen = true;
    save();
  });
}

function choosePower() {
  if(state.phase === "complete") {
    if(state.ch === 1) {
      if(!state.specialty){offerSpecialty();return;}
      openMenu("旧地铁站 · 配电结算","站台重新开门",
        "梁砚已加入。站口驿站可以接下一份运苗工单。",[
        {title:"前往驿站领取运苗工单",run:nextChapter},
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
    beep(630,.27);
    playStory("restored", offerSpecialty);
  } else {
    state.shore = choice;
    state.scrap += 4;
    state.flags.bridge = true;
    setPhase("complete"); beep(780,.28);
    say("梁砚","听，第一辆车过桥了。");
    finish();
  }
}
function offerSpecialty() {
  openMenu("旧地铁站 · 配电结算","灯亮起来了",
    "梁砚加入小队，获得 3 废料。选一项入门专长，在下一趟运苗时使用。",[
    {title:"战斗 · 扳手伤害 +1",run:()=>pickSpecialty("combat")},
    {title:"运输 · 满载移速 +0.2 格/秒",run:()=>pickSpecialty("transport")},
    {title:"工程 · 额外获得 1 废料",run:()=>pickSpecialty("engineering")}
  ]);
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
  openMenu("雨水高架 · 交付结算","第一辆补给车过桥",
    "昨晚采用「"+first+"」的供电方案。两箱幼苗已送达，桥头固定线路已接通。"+second+"\n进度保存在当前浏览器。",[
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
  openMenu("本地存档","重新开始游戏？","这会从医院重新开始，并用新进度替换当前存档。",[
    {title:"确认重新开始",run:()=>{state=opening();newRuntime();save();showOpening();}},
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
  if(state.phase==="collect"){
    setPhase("transport");
    if(state.ch===1)playStory("delivery");
  } else save();
  beep(340);
}
function stockOptions(ids) {
  const battery = state.ch===1;
  openMenu("货物","选择搬运方式",battery
    ? "这一组电池可用推车走灯廊，也可手提走泵房便道。"
    : "推车一次带两箱。泵房便道较窄，可手提一箱走近路。",[
    {title:"牵引推车",note:"通行宽路，移动较慢。",run:()=>takeCargo("cart",ids)},
    {title:battery?"手提电池":"手提一箱",note:battery?"可通过泵房便道。":"通过泵房便道，另一箱留在接货处。",run:()=>takeCargo("hand",ids)},
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
    if(phase==="hospital")add("hospital","与林岚交谈",()=>{
      setPhase("ward");
      say("林岚","电表在我右上方。灯快灭时，最下面那一格会闪。你去抄一下。");
    });
    if(phase==="ward")add("wardMeter","抄录病房电表",()=>{setPhase("workorder");playStory("ward");});
    if(phase==="workorder")add("supply","领取断电工单",()=>{
      setPhase("relay");
      say("配电员","旧站登记为零，今晚例行断线。你带来的电表号和那张单是同一根线。先去东边分线箱验一下。",7);
    });
    if(phase==="relay")add("fork","检查分线箱",()=>{setPhase("routeSurvey");playStory("fork");});
    if(phase==="routeSurvey"){
      add("northMarker","核对灯廊示廓灯",()=>{
        setPhase("scout");say("巡线员","灯廊能通车。前面有检修机，走到灯下还能恢复体力。",6);
      });
      add("southMarker","核对泵房反光牌",()=>{
        setPhase("scout");say("巡线员","反光牌指向泵房门。沿南路向东走，门闩在西侧。",6);
      });
    }
    if(phase==="scout")add("scout","与梁砚核查站台",()=>{
      state.flags.tempEngineer=true;
      setPhase("collect");
      playStory("residents");
    });
    if(phase==="collect")add("supply","领取应急电池",()=>stockOptions([0]));
    if(["scout","collect","transport"].includes(phase)){
      if(!state.flags.gate)add("gate","打开手动检修门",()=>{state.flags.gate=true;save();beep(290);say("巡线员","检修门会保持开启。推车只能走灯廊。");});
      if(!state.flags.road)add("road","铺好裂砖便道 · 现场有材料",()=>{state.flags.road=true;save();beep(445);say("巡线员","路面已铺好。以后推车经过不会减速。");});
    }
    if(phase==="transport"&&state.held.length)add("intake","把电池放到接应位",()=>{
      state.drop={...point("batteryRack"),ids:state.held,mode:state.carry};
      state.held=[];
      state.carry="";
      runtime.enemies=[];
      setPhase("inspection");
      playStory("intake");
    });
    if(phase==="inspection")add("lever","释放北侧检修闸",()=>{
      state.flags.lever=true;
      beginBoss("station");
    });
    if(phase==="stationBoss"){
      if(!state.flags.lever)add("lever","释放检修闸",()=>{state.flags.lever=true;beep(440);say("梁砚","检修闸开了。等「无人」广播，再把电池接上。");});
      add("socket","接入应急电池",()=>{
        if(!state.held.length){say("巡线员","先把电池带来。");return;}
        if(runtime.boss && !bossExposed()){say("梁砚","等广播停顿。警示带熄灭后再接。",3);return;}
        runtime.boss=null;runtime.enemies=[];state.held=[];state.carry="";state.drop=null;
        state.flags.station=true;
        setPhase("audit");say("验票机","站内检测到人员。请到配电台补录。",5);beep(615,.22);
      });
    }
    if(phase==="audit")add("power","核对两边的用电需求",()=>{setPhase("power");playStory("audit");});
    if(phase==="power"){
      if(!state.flags.borrow)add("borrow","向邻区争取借电",()=>{state.flags.borrow=true;save();say("邻区值班","一格电可以借你。我们这边会提前关一段灯。");});
      if(!state.flags.mirror)add("mirror","修复屋顶反射镜",()=>{state.flags.mirror=true;save();beep(500);say("梁砚","镜子对准了。夜里还是用电，天亮就能接到光。");});
    }
    if(["collect","transport","audit","power","complete"].includes(phase)){
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
  if(state.drop&&!state.held.length&&phase!=="inspection"){
    items.push({...state.drop,label:ch===1?"取回应急电池":"取回停放的货物",action:()=>stockOptions(state.drop.ids)});
  }
  if(phase==="power"||phase==="complete")add("power",phase==="power"?"打开配电面板":"查看工单结算",choosePower);
  return items;
}
function nearest() {
  return interactables().filter(item=>distance(item,state)<1.58).sort((a,b)=>distance(a,state)-distance(b,state))[0];
}
function use(item=nearest()) {
  if(menu.open||story)return;
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
  if(state.ch===1&&x>53&&!["inspection","stationBoss","audit","power","complete"].includes(state.phase))return false;
  if(state.ch===1&&state.phase==="inspection"&&x>=56)return false;
  if(state.ch===1&&state.phase==="stationBoss"&&runtime.boss&&!bossExposed()&&!state.flags.lever&&x>=55.7&&x<56.4&&y>11.8&&y<16.1)return false;
  if(state.ch===2&&["collect","transport","defensePrep","defenseWave"].includes(state.phase)&&x>53.8)return false;
  return true;
}
function lamps(){
  const result=currentMap().lamps.filter(([x])=>!(state.ch===2&&state.allocation==="borrow"&&x===34));
  if(state.ch===1&&state.phase==="complete")result.push([61.6,17.2,3.2]);
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
    const hauling=phase==="transport";
    once(phase+"Top",state.x>23&&state.x<38&&state.y<12,hauling
      ?[["thief",38.5,8.9]]
      :[["patrol",30,8.7],["patrol",33,9.6]]);
    once(phase+"Bottom",state.x>25&&state.x<37&&state.y>=18,hauling
      ?[["thief",34,20.6]]
      :[["patrol",31,20]]);
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
  if(menu.open||story)return;
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

function sprite(draw,x,y,...args) {
  drawQueue.push({draw,x,y,args});
}
function drawPerson(ctx,x,y,look,step,flip,alpha) {
  ctx.globalAlpha=alpha;
  art.person(ctx,x,y,look,step,flip);
}
function person(x,y,look,step,flip,alpha=1) {
  art.shadow(ctx,x,y);
  sprite(drawPerson,x,y,look,step,flip,alpha);
}
function drawScenery(ctx,x,y,prop) {
  ctx.drawImage(prop.image,x,y-prop.lift);
}
function drawLamp(ctx,x,y,softness) {
  const cone=ctx.createLinearGradient(x,y-22,x,y+5);
  cone.addColorStop(0,"#ffe4ac65");
  cone.addColorStop(1,"#ffe4ac00");
  ctx.beginPath();
  ctx.moveTo(x-3,y-22);ctx.lineTo(x+4,y-22);ctx.lineTo(x+16,y+5);ctx.lineTo(x-15,y+5);
  ctx.closePath();ctx.fillStyle=cone;ctx.fill();
  art.glow(ctx,x,y-19,softness,"#ffd99b");
  art.box(ctx,x-3,y-7,7,9,"#293b41");
  art.box(ctx,x-1,y-24,3,23,"#879187");
  art.box(ctx,x+1,y-23,1,22,"#414f52");
  art.box(ctx,x-5,y-25,10,4,"#4c605d");
  art.box(ctx,x-4,y-22,8,3,"#ffd998");
  art.box(ctx,x-2,y-22,5,2,"#fff3cb");
}
function drawLamps(time) {
  for(const [x,y,r] of lamps()) {
    const px=x*TILE,py=y*TILE;
    art.glow(ctx,px,py,r*TILE,"#fbd38f");
    art.glow(ctx,px,py-3,r*TILE*.42,"#f6c478");
    art.shadow(ctx,px,py,5);
    sprite(drawLamp,px,py,19+Math.sin(time*1.25+x)*1.5);
  }
}
function markInteraction(p, selected) {
  const x=p.x*TILE,y=p.y*TILE;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(1,1/art.pitch);
  ctx.strokeStyle=selected?"#d6f9bf":"#7cca9a";ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-6,1);ctx.lineTo(-6,5);ctx.lineTo(-2,5);ctx.moveTo(6,1);ctx.lineTo(6,5);ctx.lineTo(2,5);ctx.stroke();
  ctx.fillStyle=selected?"#e1f0bd":"#b0e1b1";
  const shift=reducedMotion.matches?0:Math.floor(Math.sin(now*4.2)*2);
  ctx.beginPath();ctx.moveTo(-3,-28+shift);ctx.lineTo(3,-28+shift);ctx.lineTo(0,-23+shift);ctx.fill();
  ctx.restore();
}
function drawGate(){
  if(state.ch!==1)return;
  if(!state.flags.gate){
    for(let y=18;y<22;y+=.5)art.box(ctx,36.3*TILE,y*TILE,4,7,"#657079");
    art.box(ctx,36.25*TILE,19.5*TILE,6,4,"#e8bd78");
  }
  if(state.phase==="inspection"||story?.effect==="raiseGate"){
    const open=story?.effect==="raiseGate"?(reducedMotion.matches?1:clamp((now-story.started)/1.1,0,1)):0;
    for(let y=8;y<23-open*15;y+=.55)art.box(ctx,56*TILE,y*TILE,4,8,"#aa8a64");
  } else if(state.phase==="stationBoss" && runtime.boss && !bossExposed()&&!state.flags.lever){
    for(let y=11.8;y<16.1;y+=.55)art.box(ctx,56*TILE,y*TILE,4,8,"#aa8a64");
  }
}
function drawProgress() {
  if(state.ch===1&&state.flags.road){
    for(let x=35;x<41;x++){art.box(ctx,x*TILE,8.1*TILE,15,27,"#646c64");art.box(ctx,x*TILE+2,9.2*TILE,6,2,"#92977d");}
  }
  if(state.ch===2&&state.flags.bridge){
    for(let x=51;x<64;x++)art.box(ctx,x*TILE,13*TILE,15,30,"#66706c");
    const x=(52+(reducedMotion.matches?2:now%8))*TILE;
    sprite(drawCart,x,14*TILE,true);
  }
}
function drawCart(ctx,x,y,trading=false) {
  art.box(ctx,x-10,y-4,22,11,"#574839");art.box(ctx,x-10,y-6,22,4,"#a48660");
  art.box(ctx,x-7,y+4,4,4,"#172734");art.box(ctx,x+7,y+4,4,4,"#172734");
  art.box(ctx,x-6,y+5,2,2,"#687576");art.box(ctx,x+8,y+5,2,2,"#687576");
  if(trading)art.crate(ctx,x,y-6,1);
}
function drawStationFixtures(points) {
  const panel = ([tx,ty], light) => sprite((ctx,x,y)=>{
    art.box(ctx,x-7,y-15,14,19,"#17242d");
    art.box(ctx,x-6,y-14,12,14,"#607779");
    art.box(ctx,x+3,y-13,3,13,"#354d56");
    art.box(ctx,x-4,y-11,8,6,"#15252a");
    art.box(ctx,x-3,y-10,6,3,light);
    art.box(ctx,x-4,y-2,4,2,"#b8a978");
  },tx*TILE,ty*TILE);
  panel(points.wardMeter,state.phase==="hospital"||state.phase==="ward"?"#ebbd77":"#9ac492");
  panel(points.fork,"#bc9971");
  panel(points.northMarker,"#edce8e");
  panel(points.southMarker,"#b7c4ad");
  panel(points.lever,state.flags.lever?"#a6edb4":"#df9b6d");
  const wired=state.flags.station||["audit","power","complete"].includes(state.phase);
  panel(points.socket,wired?"#a6edb4":"#837567");
  panel(points.power,wired?"#a6edb4":"#837567");
  if(wired)art.glow(ctx,points.socket[0]*TILE,points.socket[1]*TILE-9,25,"#c6dd89");
}
function drawTargets(){
  const p=currentMap().points;
  if(state.ch===1){
    drawStationFixtures(p);
    person(p.hospital[0]*TILE,p.hospital[1]*TILE,art.looks.sister,0,-1);
    if(state.phase==="scout"||story?.id==="residents")
      person(p.scout[0]*TILE,p.scout[1]*TILE,art.looks.engineer,0,-1);
    if(story?.effect==="carrySeedling"){
      const elapsed=now-story.started;
      const step=reducedMotion.matches?1:clamp(elapsed/1.65,0,1);
      const x=(p.acheng[0]+(p.seedlings[0]-p.acheng[0])*step)*TILE;
      const y=(p.acheng[1]+(p.seedlings[1]-p.acheng[1])*step)*TILE;
      person(x,y,art.looks.child,step<1?Math.floor(elapsed*9)%3-1:0,-1);
      sprite(art.crate,x-7,y+1,1,.6);
    } else person(p.acheng[0]*TILE,p.acheng[1]*TILE,art.looks.child,0,-1);
    for(let i=0;i<3;i++)sprite(art.crate,(60.55+i*.68)*TILE,19.3*TILE,1,.8);
    if(state.phase==="complete"&&state.allocation==="borrow")art.glow(ctx,61.8*TILE,19.2*TILE,39,"#bef78e");
    if(state.phase==="power"){art.glow(ctx,48.5*TILE,10.1*TILE,22,"#b6c781");art.glow(ctx,59.4*TILE,9*TILE,22,"#c8a36a");}
  } else {
    person(p.yehe[0]*TILE,p.yehe[1]*TILE,art.looks.grower,0,-1);
    if(state.allocation==="borrow")person(14.45*TILE,13.15*TILE,art.looks.child,0,-1);
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
        sprite((ctx,x,y)=>{
          art.box(ctx,x-5,y-14,10,19,"#537676");
          art.box(ctx,x-3,y-14,6,5,device.kind==="gun"?"#d0b979":device.kind==="slow"?"#a0bdc8":"#e2ce91");
          art.box(ctx,x-4,y+3,8,3,"#242e3c");
        },x*TILE,y*TILE);
      }
    }
    if(state.racked.length&&state.phase!=="complete")for(let i=0;i<state.racked.length-state.final.length;i++)sprite(art.crate,(47+i*.65)*TILE,15.5*TILE,1,.85);
  }
  if(available().length&&state.phase==="transport"&&state.ch===2){const p=point("stock");sprite(art.crate,p.x*TILE,p.y*TILE-5,1);}
  if(state.drop){art.shadow(ctx,state.drop.x*TILE,state.drop.y*TILE,7);sprite(art.crate,state.drop.x*TILE,state.drop.y*TILE,state.ch===2?1:0);}
  if(state.held.length){
    const px=state.x*TILE-runtime.flip*(state.carry==="cart"?13:5);
    const py=state.y*TILE+(state.carry==="cart"?5:1);
    sprite((ctx,x,y)=>{
      if(state.carry==="cart")drawCart(ctx,x,y);
      art.crate(ctx,x,y-4,state.ch===2?1:0,state.carry==="cart"?1:.75);
      if(state.held.length>1)art.crate(ctx,x-7,y-7,1,.63);
    },px,py);
  }
}
function drawMachine(ctx,x,y,e,time,exposed) {
  if(exposed)art.glow(ctx,x,y-14,26,"#bddb92");
  art.robot(ctx,x,y,e,time);
  if(e.max){
    art.box(ctx,x-25,y-43,50,4,"#17232b");
    art.box(ctx,x-25,y-43,50*e.hp/e.max,4,exposed?"#a4e6a3":"#e98b69");
  } else if(e.ready>.2){
    art.box(ctx,x-7,y-19,14,2,"#202631");
    art.box(ctx,x-7,y-19,Math.min(14,e.ready*12),2,"#e9a168");
  }
}
function drawHostiles(){
  const time=reducedMotion.matches?0:now;
  if(runtime.boss){
    const cycle=runtime.bossTime%7;
    if(cycle>2.2&&cycle<4.4){
      const y=(runtime.boss.kind==="bridge"?bossLane():runtime.boss.y)*TILE;
      const left=(runtime.boss.kind==="bridge"?54:53)*TILE;
      art.box(ctx,left,y-12,10*TILE,24,cycle<3.4?"#ce785537":"#ff88635b");
      for(let x=left;x<left+160;x+=12)art.pathLine(ctx,x,y-11,x+8,y+11,"#df8d62a8");
      art.pathLine(ctx,left,y-12,left+160,y-12,"#e7956c");art.pathLine(ctx,left,y+12,left+160,y+12,"#e7956c");
    }
    const {x,y}=runtime.boss;
    art.shadow(ctx,x*TILE,y*TILE,22);
    sprite(drawMachine,x*TILE,y*TILE,runtime.boss,time,bossExposed());
  }
  for(const e of runtime.enemies){
    art.shadow(ctx,e.x*TILE,e.y*TILE);
    sprite(drawMachine,e.x*TILE,e.y*TILE,e,time,false);
  }
}
function drawBolts(){
  for(const bolt of runtime.effects) {
    ctx.globalAlpha=bolt.left/.18;
    art.pathLine(ctx,bolt.from.x*TILE,bolt.from.y*TILE-8/art.pitch,bolt.to.x*TILE,bolt.to.y*TILE-7/art.pitch,bolt.tint,2);
    art.glow(ctx,bolt.to.x*TILE,bolt.to.y*TILE-7/art.pitch,12,"#f8d178");
    art.box(ctx,bolt.to.x*TILE-2,bolt.to.y*TILE-8/art.pitch,3,3,"#efe7ac");
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
function drawStoryLighting(elapsed) {
  const {focus, from} = story;
  const moving = !reducedMotion.matches;
  const x=focus.x*TILE,y=focus.y*TILE-8;
  const glow=moving?40+7*Math.sin(elapsed*2):40;
  if(from){
    const startX=from.x*TILE,startY=from.y*TILE-8;
    const charge=moving?clamp(elapsed/1.15,0,1):1;
    const endX=startX+(x-startX)*charge,endY=startY+(y-startY)*charge;
    art.pathLine(ctx,startX,startY,x,y,"#c2bc7d38",2);
    art.pathLine(ctx,startX,startY,endX,endY,"#c6e49caa",2);
    art.glow(ctx,endX,endY,18,"#d6f3a2");
    art.box(ctx,endX-2,endY-2,4,4,"#e2f7bc");
  }
  art.glow(ctx,x,y,glow,"#dbde9e");
}
function drawAtmosphere(time) {
  const fog=ctx.createLinearGradient(0,0,0,canvas.height);
  fog.addColorStop(0,state.ch===1?"#52778958":"#95adb049");
  fog.addColorStop(.33,"#537e8906");
  fog.addColorStop(.66,"#52718800");
  fog.addColorStop(1,"#10253477");
  ctx.fillStyle=fog;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  const centerX=canvas.width/2,centerY=canvas.height/2;
  const vignette=ctx.createRadialGradient(centerX,centerY,Math.min(centerX,centerY)*.65,centerX,centerY,Math.hypot(centerX,centerY));
  vignette.addColorStop(0,"#0b131900");
  vignette.addColorStop(1,"#060d1b84");
  ctx.fillStyle=vignette;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // A small breathing glow high in the frame gives the haze a direction.
  ctx.globalAlpha=.24+Math.sin(time*.43)*.035;
  art.glow(ctx,canvas.width*.31,canvas.height*.12,Math.min(canvas.width,canvas.height)*.66,state.ch===1?"#7eaaa7":"#d4b897");
  ctx.globalAlpha=1;
}
function drawDust(time) {
  for(const [x,y] of lamps())for(let i=0;i<5;i++){
    const px=x*TILE+Math.sin(i*3.9+x+time*.34)*34;
    const py=y*TILE-13+(i*2.1+time*.22)%19;
    ctx.globalAlpha=.2+(Math.sin(i*6+time*.9)+1)*.16;
    art.box(ctx,px,py,i%2===0?1.25:1,1.4,"#fff1bd");
  }
  ctx.globalAlpha=1;
}
function render(dt) {
  const motionTime=reducedMotion.matches?0:now;
  const elapsed=story?now-story.started:0;
  const scale=story&&!reducedMotion.matches?1.08+.18*clamp(elapsed/.9,0,1):1;
  const target=cameraTarget(story?.focus,scale);
  const follow=story&&reducedMotion.matches?1:Math.min(1,dt*(story?3.5:8));
  runtime.cameraX+=(target.cameraX-runtime.cameraX)*follow;
  runtime.cameraY+=(target.cameraY-runtime.cameraY)*follow;
  const visibleWidth=view.width/scale,visibleHeight=view.height/(scale*art.pitch);
  runtime.cameraX=Math.min(runtime.cameraX,WIDTH*TILE-visibleWidth);
  runtime.cameraY=Math.min(runtime.cameraY,HEIGHT*TILE+art.foregroundMargin/art.pitch-visibleHeight);
  const cx=runtime.cameraX,cy=runtime.cameraY;
  const scaleX=canvas.width/visibleWidth,scaleY=canvas.height/visibleHeight;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle="#10202b";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(scaleX,0,0,scaleY,-cx*scaleX,-cy*scaleY);
  const scene=scenes[state.ch-1];
  art.drawFloor(ctx,scene,motionTime);
  drawQueue.length=0;
  for(const prop of scene.scenery){
    if(prop.x+prop.image.width<cx||prop.x>cx+visibleWidth||prop.y+9<cy||prop.y-prop.lift/art.pitch>cy+visibleHeight)continue;
    sprite(drawScenery,prop.x,prop.y,prop);
  }
  drawProgress();drawLamps(motionTime);drawGate();drawTargets();drawHostiles();
  if((state.flags.engineer||state.flags.tempEngineer)&&story?.id!=="residents")
    person(runtime.npcX*TILE,runtime.npcY*TILE,art.looks.engineer,runtime.walking?Math.floor(now*7)%2:0,runtime.flip);
  art.glow(ctx,state.x*TILE,state.y*TILE,37,"#f5d69a");
  const playerAlpha=runtime.invuln>0&&!reducedMotion.matches&&Math.floor(now*10)%2===0?.57:1;
  person(state.x*TILE,state.y*TILE,art.looks.player,runtime.walking?Math.floor(now*10)%3-1:0,runtime.flip,playerAlpha);
  drawQueue.sort((a,b)=>a.y-b.y);
  for(const {draw,x,y,args} of drawQueue){
    ctx.save();ctx.translate(x,y);ctx.scale(1,1/art.pitch);
    draw(ctx,0,0,...args);
    ctx.restore();
  }
  drawBolts();
  drawDust(motionTime);
  if(story)drawStoryLighting(elapsed);
  const active=story?null:nearest();
  if(!story)for(const p of interactables())if(distance(p,state)<15)markInteraction(p,active?.label===p.label&&active?.x===p.x&&active?.y===p.y);
  for(const [x,y,name] of currentMap().labels) {
    ctx.save();ctx.translate(x*TILE,y*TILE);ctx.scale(1,1/art.pitch);
    ctx.font='600 9px ui-monospace, "PingFang SC", monospace';
    ctx.textAlign="center";
    const width=ctx.measureText(name).width;
    art.box(ctx,-width/2-5,-9,width+10,12,"#152733dc");
    art.box(ctx,-width/2-5,2,width+10,1,"#87a69799");
    ctx.fillStyle="#d9e2d5";ctx.fillText(name,0,0);
    ctx.restore();
  }
  ctx.setTransform(1,0,0,1,0,0);
  drawAtmosphere(motionTime);
  const prompt=$("prompt");
  const label=active?.label||(state.held.length?"停放货物":"");
  if(prompt.lastElementChild.textContent!==label)prompt.lastElementChild.textContent=label;
  prompt.hidden=!label||menu.open||!!story;
  if(now>dialogueUntil)$("dialogue").hidden=true;
  drawMap();
}
function getGoal(){return (state.ch===1?CH1_GOALS:CH2_GOALS)[state.phase];}
function goalPoint() {
  const goal=getGoal()[2];
  if(state.ch===1){
    if(state.phase==="routeSurvey"&&state.y>=16)return point("southMarker");
    if(["transport","stationBoss"].includes(state.phase)&&state.drop&&!state.held.length)return state.drop;
  }
  if(state.ch===2&&state.phase==="bridgeBoss"&&state.held.length===0)return point("reclaim");
  if(state.ch===2&&state.phase==="transport"&&!state.held.length&&available().length)return point("stock");
  return point(goal);
}
function syncHud() {
  const goal=getGoal();
  const target=goalPoint();
  if($("goal-title").textContent!==goal[0])$("goal-title").textContent=goal[0];
  $("goal-text").textContent=state.ch===1&&state.phase==="stationBoss"&&!state.held.length
    ?"在接应位取回电池，再趁广播停顿去轨道东端接线。"
    :state.ch===2&&state.phase==="bridgeBoss"&&state.held.length===0?"在桥头接应架取苗，再看预警挑路线。":goal[1];
  $("location").textContent=state.ch===1?(state.x<10?"平原 · 中心医院":state.x<19?"平原 · 配电站":state.x<45?"平原 · 站外街区":"平原 · 旧地铁站"):(state.x<19?"平原 · 驿站":state.x<45?"平原 · 洪沟":"平原 · 雨水高架");
  $("day").textContent=state.ch===1?"战后第十八年 · 夜":"战后第十八年 · 次日";
  $("freight").textContent=state.ch===1?(state.held.length?"电池 ×1":state.drop?"电池已停放":["audit","power","complete"].includes(state.phase)?"已接入":"—"):(state.held.length?("在途 "+state.held.length+"/2"):(totalBoxes()+"/2"));
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
  $("route-hint").textContent=state.phase==="complete"?"工单已结算。":"目标约 "+Math.ceil(distance(state,target))+" 格 · 上方主路，下方泵房便道。";
  let alert="";
  if(runtime.countdown>0) alert="布防 "+Math.ceil(runtime.countdown)+" 秒 · 可通过控制柜提前开战";
  if(state.phase==="defenseWave")alert="第 "+runtime.wave+"/2 波 · 控制柜 "+runtime.cabinet+"/70"+(runtime.disabled>0?" · 设备受干扰":"");
  if(runtime.boss)alert=(state.ch===1?"空站验票机":"断桥摊铺车")+" · "+(bossExposed()?(state.ch===1?"广播「无人」，可接线":"通行窗口"):"留意橙色警示带");
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
  if(story){
    if(event.code==="KeyE"&&!event.repeat){event.preventDefault();$("story-next").click();}
    return;
  }
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
storyDialog.addEventListener("cancel",event=>{event.preventDefault();endStory();});
$("story-skip").addEventListener("click",endStory);
$("story-next").addEventListener("click",()=>{
  if(!story)return;
  if(++story.index===story.scene.beats.length)endStory();
  else showStoryBeat();
});
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
  const px=(event.clientX-bounds.left)*view.width/bounds.width;
  const py=(event.clientY-bounds.top)*view.height/bounds.height;
  if(px<0||px>=view.width||py<0||py>=view.height)return;
  const tap={x:(px+runtime.cameraX)/TILE,y:(py/art.pitch+runtime.cameraY)/TILE};
  const targets=interactables().filter(item=>{
    const height=(tap.y-item.y)*art.pitch;
    return Math.abs(item.x-tap.x)<.95&&height>=-2&&height<=.55;
  });
  const target=targets.sort((a,b)=>distance(a,state)-distance(b,state))[0];
  if(target){
    if(distance(target,state)<1.58)use(target);
    else say("提示","走近后点按目标。",2);
    return;
  }
  if(state.held.length&&Math.hypot(tap.x-state.x,(tap.y-state.y)*art.pitch+.5)<1)use(null);
}
canvas.addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||menu.open||story||touchInput.pointer!==null||event.button!==0)return;
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
  const worldY=y/art.pitch;
  const direction=Math.hypot(x,worldY)||1;
  touchInput.x=x/direction*pull;
  touchInput.y=worldY/direction*pull;
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
showOpening();
const worldSize = new ResizeObserver(([entry]) => {
  const {width, height} = entry.contentRect;
  if (!width || !height) return;
  // Render lighting at display resolution while keeping the logical camera size stable.
  const zoom = Math.max(1.65,width/680,height/380);
  const density = Math.min(devicePixelRatio,1.75,1920/Math.max(width,height));
  view.width=width/zoom;
  view.height=height/zoom;
  canvas.width=Math.max(1,Math.round(width*density));
  canvas.height=Math.max(1,Math.round(height*density));
  ctx.imageSmoothingEnabled = false;
  releaseCanvasTouch();
  Object.assign(runtime, cameraTarget());
  render(0);
});
worldSize.observe(canvas);
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
