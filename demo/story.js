"use strict";

const STATION_STORY = {
  opening: {
    place: "平原 · 战后第十八年",
    title: "医院夜班",
    beats: [
      {focus:"wardMeter", from:"hospital", speaker:"", text:"从前，人能借阳光为身体补充能量。战争把天空遮住以后，平原的病房开始按小时分灯。"},
      {focus:"hospital", speaker:"林岚", text:"我刚答应隔壁，今晚会有灯。配电站送来一张断电单。你先过来，陪我看一眼电表。"}
    ]
  },
  ward: {
    place: "中心医院 · 备用回路",
    title: "三格电",
    beats: [
      {focus:"wardMeter", from:"hospital", speaker:"林岚", text:"诊疗一格，病房两格。刚才灯一暗，隔壁那个人把药重新数了一遍。他怕记错。"},
      {focus:"supply", from:"wardMeter", speaker:"林岚", text:"把三格写在工单上。到了配电站，帮我问清楚，这根线上还有谁。"}
    ]
  },
  fork: {
    place: "站外街区 · 两条旧路",
    title: "跟着线路找人",
    beats: [
      {focus:"northMarker", from:"fork", speaker:"配电站录音", text:"北线走灯廊，路宽，可推车。裂砖旁堆着旧铺路板，后面要运货的话，可以先把那一段修好。"},
      {focus:"southMarker", from:"fork", speaker:"旧路牌", text:"南线走泵房，近一些。认反光牌，在门西边扳开门闩。便道仅供步行，运货请手提。"}
    ]
  },
  residents: {
    place: "旧地铁站 · 站口",
    title: "名单上的空站",
    beats: [
      {focus:"scout", speaker:"梁砚", text:"空站那一栏是我填的。那年清退，写上‘空’能让他们留下。后来每次检修，系统也把这里跳过去。"},
      {focus:"seedlings", effect:"carrySeedling", speaker:"阿澄", text:"葛阿姨的窗台种不活了。她把种子给我，我每晚把苗往灯底下挪一格。你们要关的是这盏吗？"},
      {focus:"intake", speaker:"梁砚", text:"配电站有一组电池。我们把它送进照明箱，试亮以后，我去请住户来。那张表该换一张了。"}
    ]
  },
  delivery: {
    place: "配电站 · 取货处",
    title: "一组应急电池",
    beats: [
      {focus:"supply", speaker:"配电员", text:"就这一组，接上线能补一格电。沿灯廊送，或手提走泵房。到了旧站，把它先放在检票区外的接应位。"}
    ]
  },
  intake: {
    place: "旧地铁站 · 检票区外",
    title: "接应位",
    beats: [
      {focus:"batteryRack", speaker:"梁砚", text:"电池先搁这儿。北边的检修闸能让出一条路。我认得闸杆，你去扳到底，再回来接电池。"}
    ]
  },
  machine: {
    place: "旧地铁站 · 检票区",
    title: "空站验票机",
    beats: [
      {focus:"ticketMachine", from:"lever", effect:"raiseGate", speaker:"验票机", text:"检测到闸门开启。开始站台清扫。本站登记人数为零。"},
      {focus:"socket", speaker:"梁砚", text:"橙色警示带亮时先让开。它播完‘无人’会停一会儿，趁那几秒把接头插进照明箱。"}
    ]
  },
  audit: {
    place: "旧地铁站 · 试亮",
    title: "四格电的去向",
    beats: [
      {focus:"power", from:"socket", speaker:"验票机", text:"照明测试通过。站内检测到人员。请补录。"},
      {focus:"seedlings", speaker:"阿澄", text:"值守灯要一格，苗床还要一格。要是灯不够，我把苗抱去室内，葛阿姨留了几个箱子。"},
      {focus:"power", speaker:"林岚 · 对讲机", text:"病房那三格还是要留。你跟梁砚看能不能向邻区借一格，或者修好屋顶镜子，给苗等到早上的光。"}
    ]
  },
  restored: {
    place: "旧地铁站 · 配电完成",
    title: "站台灯又亮了",
    beats: [
      {focus:"seedlings", from:"power", speaker:"阿澄", text:"我把值守灯调低些，照在台阶上。葛阿姨过来就能看见脚下了。"},
      {focus:"acheng", speaker:"梁砚", text:"下趟运苗，我跟你走。我去把工具拿来。明早交接的那一栏，留给我签。"}
    ]
  }
};
