"use strict";

const art = (() => {
  const colors = {
    black: "#111725", road: ["#343e45", "#354147", "#354149", "#313d45"],
    floor: ["#29343f", "#2c3842", "#303a43"], mud: ["#383b3b", "#393d3e", "#353b3d"],
    earth: ["#181f29","#19222b","#1c242d","#1a2128"], roof: "#344952", teal: "#579080"
  };
  function box(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
  }
  function rand(x, y, i = 0) {
    let value = Math.imul(x + i * 313, 1597334677) ^ Math.imul(y + 31, 3812015801);
    value = Math.imul(value ^ value >>> 16, 2246822519);
    return ((value ^ value >>> 13) >>> 0) / 4294967296;
  }
  function roadAt(map, x, y) {
    return map.areas.some(([l,t,r,b]) => x >= l && x < r && y >= t && y < b);
  }
  function pathLine(ctx, x1, y1, x2, y2, color, width = 1) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function tree(ctx, x, y, n) {
    box(ctx,x+3,y+12,12,4,"#111a22");
    box(ctx,x+7,y+9,3,8,"#424344");
    box(ctx,x+4,y+1,10,12,"#202f31");
    box(ctx,x+2,y+5,14,7,"#263836");
    box(ctx,x+5,y+3,7,5,n > .6 ? "#35483d" : "#2b3b38");
    box(ctx,x+8,y+2,3,9,"#394b40");
    box(ctx,x+1,y+10,4,2,"#202c2e");
  }
  function crate(ctx, x, y, type = 0, scale = 1) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale,scale);
    box(ctx,-7,3,15,5,"#111821");
    box(ctx,-7,-5,14,10,type ? "#53715a" : "#956f49");
    box(ctx,-7,-7,14,3,type ? "#729366" : "#bf9266");
    box(ctx,-7,3,14,2,"#392f2c");
    box(ctx,-5,-6,2,10,"#c5ad79"); box(ctx,3,-6,2,10,"#665137");
    if (type) { box(ctx,-2,-8,4,3,"#a4ca86"); box(ctx,-1,-10,2,3,"#537f53"); }
    ctx.restore();
  }
  function building(ctx, [tx,ty,tw,th,kind]) {
    const x=tx*TILE, y=ty*TILE, w=tw*TILE, h=th*TILE;
    const hospital=kind==="hospital", station=kind==="station", power=kind==="power";
    const glass=kind==="greenhouse", ruined=kind==="ruin";
    const cap=glass?"#4f7065":hospital?"#495359":station?"#3d5659":power?"#414852":"#333d47";
    box(ctx,x+5,y+6,w+5,h+5,"#101923");
    box(ctx,x,y,w,h,"#27333e");
    box(ctx,x,y,w,h-18,cap);
    box(ctx,x+4,y+5,w-8,h-27,"#293a42");
    if (glass) {
      box(ctx,x+5,y+6,w-10,h-31,"#395a51");
      for(let dx=10;dx<w-8;dx+=9) box(ctx,x+dx,y+7,2,h-32,"#638278");
    } else {
      for(let dx=9;dx<w-13;dx+=13){
        box(ctx,x+dx,y+8,2,h-34,"#354750");
        if(rand(tx+dx,ty)>.52)box(ctx,x+dx+3,y+11,6,4,"#293940");
      }
    }
    box(ctx,x,y+h-21,w,4,station?"#75948a":hospital?"#80786c":"#59616c");
    box(ctx,x+2,y+h-16,w-4,16,ruined?"#293039":"#384651");
    box(ctx,x+3,y+h-15,w-6,2,"#4a5761");
    for(let wx=x+8;wx<x+w-12;wx+=18){
      const lit=rand(wx, ty,1)>(ruined?.88:.42);
      box(ctx,wx,y+h-11,11,8,"#17232b");
      box(ctx,wx+2,y+h-9,7,4,lit?(station?"#79a389":"#b38c55"):"#333e49");
      if(lit) box(ctx,wx+3,y+h-9,1,4,"#d4bd7b");
    }
    if (hospital || station || power) {
      const dx=Math.floor(x+w/2)-11;
      box(ctx,dx,y+h-19,22,20,"#18262e");
      box(ctx,dx+3,y+h-17,16,4,hospital?"#b57a60":"#9ab69a");
      box(ctx,dx+4,y+h-10,14,9,"#304451");
      box(ctx,dx+10,y+h-10,2,9,"#19222b");
      if(hospital){box(ctx,x+w/2-15,y+14,30,22,"#3c4850");box(ctx,x+w/2-3,y+17,6,16,"#c78471");box(ctx,x+w/2-8,y+22,16,6,"#c78471");}
      if(power){box(ctx,x+w/2-9,y+17,18,18,"#242d36");box(ctx,x+w/2-2,y+19,4,12,"#c1a166");box(ctx,x+w/2-5,y+23,9,4,"#e7bf70");}
    }
    if(ruined){for(let j=0;j<9;j++){const xx=x+6+rand(tx+j,ty)*Math.max(6,w-12), yy=y+8+rand(tx,ty+j)*Math.max(5,h-31);box(ctx,xx,yy,4+(j%3)*3,3,"#1c2831");}}
  }
  function terrain(map, chapter) {
    const bg=document.createElement("canvas"); bg.width=WIDTH*TILE;bg.height=HEIGHT*TILE;
    const ctx=bg.getContext("2d");
    for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++){
      const px=x*TILE, py=y*TILE, noise=rand(x,y);
      const water=chapter===2 && x>=27 && x<=51 && y>=11 && y<=18 && !roadAt(map,x+.5,y+.5);
      const onRoad=roadAt(map,x+.5,y+.5);
      const set=onRoad?(y>=18 && x>18 && x<45?colors.mud:colors.road):colors.earth;
      box(ctx,px,py,16,16,water?(noise>.53?"#223d45":"#233843"):set[Math.floor(noise*set.length)]);
      if(water){
        box(ctx,px+rand(x,y,3)*10,py+4,5,1,"#355561");
        box(ctx,px+5,py+12,8,1,"#2c4a54");
      } else {
        for(let i=0;i<5;i++){
          const shade=onRoad?(i<2?"#424d52":"#2e3a42"):(i<2?"#2c3838":"#141f28");
          box(ctx,px+rand(x,y,i+13)*14,py+rand(y,x,i+7)*14,1+(i%2),1,shade);
        }
        if(onRoad && !roadAt(map,x+.5,y-.5))box(ctx,px,py,16,2,"#52605d");
        if(onRoad && !roadAt(map,x+.5,y+1.5))box(ctx,px,py+14,16,2,"#25353e");
        if(onRoad && noise>.83){box(ctx,px+4,py+5,5,1,"#242e37");box(ctx,px+8,py+6,1,3,"#242e37");}
        if(!onRoad && noise>.92){box(ctx,px+5,py+9,7,2,"#475043");box(ctx,px+7,py+6,2,5,"#536051");}
      }
    }
    for(let x=3;x<65;x++) {
      if(x%3===0){box(ctx,x*16,15*16,10,2,"#77765d"); if(x>=19&&x<46)box(ctx,x*16,8.7*16,9,1,"#9b8a67");}
      if(x>=19&&x<45) {
        box(ctx,x*16,18.3*16,16,1,"#526653");
        box(ctx,x*16,21.75*16,16,1,"#536259");
      }
    }
    if(chapter===1) {
      for(let x=49;x<64;x++){
        box(ctx,x*16,11.1*16,16,1,"#93886a");box(ctx,x*16,16.9*16,16,1,"#93886a");
        box(ctx,x*16,11.7*16,16,4,"#282b39");box(ctx,x*16,16.2*16,16,4,"#282b39");
        box(ctx,x*16+5,11.3*16,3,10,"#5c4b46");box(ctx,x*16+5,15.9*16,3,10,"#5c4b46");
      }
      for(let x=53;x<=58;x+=2){box(ctx,x*16,20*16,20,11,"#526551");box(ctx,x*16+1,20*16+3,18,5,"#7f9061");}
    } else {
      for(let x=45;x<64;x++){
        for(const y of [8.5,11.8,16.4,20.2]) {
          box(ctx,x*16,y*16,16,2,"#829094");
          box(ctx,x*16,y*16+3,4,4,"#455765");
        }
      }
    }
    for(const b of map.buildings) building(ctx,b);
    for(let x=1;x<WIDTH-1;x++) for(let y=1;y<HEIGHT-1;y++){
      if(rand(x,y,6)<.925 || roadAt(map,x+.5,y+.5) || map.buildings.some(([a,b,w,h])=>x>=a-1&&x<=a+w&&y>=b-1&&y<=b+h))continue;
      tree(ctx,x*TILE,y*TILE,rand(x,y,7));
    }
    for(const [x,y,variant] of [[15,16,0],[17,12,0],[22,10,0],[40,20,0],[48,12,0],[57,18,1],[10,16,1],[53,10,0]]) crate(ctx,x*TILE,y*TILE,variant);
    return bg;
  }
  function person(ctx,x,y,look,step=0,flip=1) {
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(flip,1);
    box(ctx,-8,3,16,4,"#141d28");
    box(ctx,-5,-1+step,4,6,"#19232d");box(ctx,1,-1-step,4,6,"#19232d");
    box(ctx,-5,2+step,4,2,"#687473");box(ctx,1,2-step,4,2,"#687473");
    box(ctx,-7,-7,14,8,"#15222b");box(ctx,-5,-7,10,8,look.coat);box(ctx,-6,-5,3,6,look.trim);
    box(ctx,4,-5,3,6,look.coat);box(ctx,5,-2,2,2,look.skin);
    box(ctx,-5,-17,10,11,"#1a2229");box(ctx,-4,-15,8,8,look.skin);
    box(ctx,-5,-17,10,4,look.hair);box(ctx,-5,-14,2,4,look.hair);
    box(ctx,1,-12,1,2,"#303646");box(ctx,4,-13,1,2,"#303646");
    box(ctx,-3,-5,3,3,look.trim);ctx.restore();
  }
  const looks={
    player:{coat:"#cd864e",trim:"#e4c077",skin:"#d3a482",hair:"#524744"},
    sister:{coat:"#808e75",trim:"#b5ad79",skin:"#d2a08f",hair:"#5c4746"},
    engineer:{coat:"#567b88",trim:"#86bbb0",skin:"#b38d72",hair:"#425562"},
    child:{coat:"#9e8c61",trim:"#dbbd6c",skin:"#d1a181",hair:"#443b3f"},
    grower:{coat:"#68805c",trim:"#bfab69",skin:"#d5a77c",hair:"#574a46"}
  };
  function robot(ctx,e,t){
    const x=e.x*TILE,y=e.y*TILE;
    const boss=e.kind==="station"||e.kind==="bridge";
    ctx.save();ctx.translate(Math.round(x),Math.round(y));if(boss)ctx.scale(2.4,2.4);
    const anim=Math.floor(t*6)%2;
    const color=e.kind==="thief"?"#b18f67":e.kind==="jammer"?"#977b9d":"#8b9ba4";
    box(ctx,-10,2,20,5,"#15202a");
    box(ctx,-10,-4,5,9,"#283138");box(ctx,5,-4,5,9,"#283138");
    box(ctx,-10,-3+anim,5,2,"#52616a");box(ctx,5,-3+anim,5,2,"#52616a");
    box(ctx,-7,-11,14,13,"#344550");box(ctx,-6,-10,12,8,color);
    box(ctx,-6,-9,11,2,"#bac3bc");box(ctx,-5,-6,10,4,"#292d38");
    box(ctx,-2,-5,4,2,e.hurt>0?"#fff3c2":boss?"#efbf66":"#e28c79");
    if(e.kind==="thief"){box(ctx,-9,-8,3,5,"#d6ad7f");box(ctx,6,-8,3,5,"#d6ad7f");}
    if(e.kind==="jammer"){box(ctx,1,-15,1,5,"#c8a4ce");box(ctx,0,-16,3,2,"#c8a4ce");}
    if(boss){box(ctx,-10,-14,20,3,"#4e6769");box(ctx,-8,-14,3,2,"#e4b86b");box(ctx,5,-14,3,2,"#e4b86b");}
    ctx.restore();
  }
  function glow(ctx,x,y,r,tint){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,tint+"70");g.addColorStop(.45,tint+"24");g.addColorStop(1,tint+"00");
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  return {box,pathLine,terrain,person,robot,crate,glow,looks,roadAt};
})();
