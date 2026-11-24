"use strict";

const art = (() => {
  const pitch = .72;
  const skyMargin = 52;
  const foregroundMargin = 24;
  const colors = {
    road: ["#394a53", "#3c4c53", "#3b4e56", "#364750"],
    mud: ["#3c4442", "#414745", "#383f40", "#3e4546"],
    earth: ["#182936", "#1b2b37", "#1d2e3a", "#192a37"]
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
  function polygon(ctx, points, fill) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function gradient(ctx, top, bottom, start, end) {
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, start);
    fill.addColorStop(1, end);
    return fill;
  }
  function surface(width, height) {
    const image = document.createElement("canvas");
    image.width = width;
    image.height = height;
    return image;
  }
  function tree(size) {
    const image = surface(34, 48);
    const ctx = image.getContext("2d");
    ctx.translate(17, 43);
    ctx.scale(size, size);
    box(ctx,-2,-19,4,22,"#40453c");
    box(ctx,-2,-15,1,15,"#7b7055");
    polygon(ctx,[[-13,-12],[-15,-22],[-10,-30],[-4,-33],[2,-42],[10,-36],[16,-25],[13,-14],[3,-9]],"#172b32");
    polygon(ctx,[[-13,-21],[-9,-30],[-4,-32],[2,-41],[8,-35],[10,-28],[6,-20],[-7,-16]],"#39554e");
    polygon(ctx,[[-8,-28],[-3,-33],[2,-38],[6,-33],[4,-28],[-4,-23]],"#527264");
    polygon(ctx,[[3,-23],[12,-29],[16,-24],[13,-15],[4,-10],[-4,-12]],"#274039");
    box(ctx,-5,-29,3,2,"#72917b");
    box(ctx,3,-34,3,2,"#638271");
    return image;
  }
  function crate(ctx, x, y, type = 0, scale = 1) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale,scale);
    box(ctx,-7,3,15,4,"#192b30");
    polygon(ctx,[[-8,-5],[-4,-9],[9,-9],[6,-5]],type?"#8daa7e":"#c29a62");
    polygon(ctx,[[6,-5],[9,-9],[9,0],[6,4]],type?"#38584f":"#694c39");
    box(ctx,-8,-5,14,9,type?"#53795e":"#99744f");
    box(ctx,-8,2,14,2,"#4b4e3c");
    box(ctx,-6,-5,2,7,"#d2bb82"); box(ctx,2,-5,2,7,"#aa9166");
    if(type){box(ctx,-1,-10,4,3,"#b2d48a");box(ctx,0,-12,2,4,"#72985e");}
    ctx.restore();
  }
  function structure([tx,ty,tw,th,kind]) {
    const w = tw*TILE, depth = Math.round(th*TILE*pitch), slant = 13;
    const hospital = kind==="hospital", station = kind==="station", power = kind==="power";
    const glass = kind==="greenhouse", ruined = kind==="ruin";
    const top = 12, eave = top+depth, height = hospital?39:station?34:ruined?22:29, base = eave+height;
    const image = surface(w+slant+3, base+6);
    const ctx = image.getContext("2d");
    const shop = kind==="shop", warehouse = kind==="warehouse";
    const roof = glass?"#679589":station?"#597983":hospital?"#677785":shop?"#746f6a":warehouse?"#526b78":"#526678";
    const wall = glass?"#477068":hospital?"#657480":station?"#48646b":"#485663";
    const trim = glass?"#8abd9b":hospital?"#a0b1ad":station?"#87a79b":power?"#a19b83":"#798c97";
    polygon(ctx,[[w,eave],[w+slant,top],[w+slant,top+height],[w,base]],gradient(ctx,top,base,"#415666","#1a2b38"));
    box(ctx,0,eave,w,height,gradient(ctx,eave,base,wall,"#293a45"));
    box(ctx,0,base-4,w,4,"#1d303b");
    box(ctx,1,base-2,w-2,2,"#586467");
    polygon(ctx,[[0,eave],[slant,top],[w+slant,top],[w,eave]],roof);
    const roofFront=glass?"#537f72":shop?"#635e5d":warehouse?"#4c6570":"#506071";
    polygon(ctx,[[5,eave-5],[slant+4,top+4],[w+slant-5,top+4],[w-5,eave-5]],gradient(ctx,top,eave,glass?"#406b6a":"#384d60",roofFront));
    for(let dx=8;dx<w-5;dx+=glass?10:16){
      pathLine(ctx,dx+slant,top+5,dx,eave-6,glass?"#86b09c":"#6b7b88",glass?2:1);
      pathLine(ctx,dx+slant+2,top+5,dx+2,eave-6,glass?"#4f7d73":"#304354");
      if(glass)box(ctx,dx+2,eave-20,5,10,"#9ec18265");
    }
    if(!glass&&!shop&&!station)for(let i=0;i<Math.floor(w/27);i++){
      const x=12+i*27,y=top+10+rand(tx+i,ty)*Math.max(6,depth-33);
      box(ctx,x+2,y+4,14,9,"#273b4a");box(ctx,x,y,13,8,"#687986");
      box(ctx,x+1,y+1,10,4,"#465763");box(ctx,x+2,y+2,8,1,"#7b8a93");
    }
    if(ruined)for(let i=0;i<6;i++){
      const x=17+rand(tx+i,ty,4)*(w-27),y=top+8+rand(tx,ty+i,5)*(depth-16);
      polygon(ctx,[[x-3,y],[x+4,y-3],[x+8,y+3],[x+4,y+6]],"#203344");
    }
    if(hospital){
      polygon(ctx,[[19,top+18],[30,top+8],[w-7,top+8],[w-19,top+18]],"#80949b");
      box(ctx,19,top+18,w-38,11,"#3e5664");
      for(let x=25;x<w-24;x+=11)box(ctx,x,top+21,7,4,"#9cbbb0");
      box(ctx,18,top+17,w-36,2,"#a2b3b2");
    }
    if(power){
      pathLine(ctx,21,eave-14,w-13,eave-14,"#93856f",3);
      for(const x of [22,w-16]){
        box(ctx,x-3,eave-30,6,17,"#4b616e");
        for(let y=eave-30;y<eave-21;y+=3)box(ctx,x-5,y,10,2,"#b4a58c");
      }
    }
    if(station){
      polygon(ctx,[[18,top+25],[35,top+11],[w-9,top+11],[w-22,top+25]],"#6c9195");
      box(ctx,18,top+25,w-40,5,"#3e626b");
      for(let x=31;x<w-27;x+=16)pathLine(ctx,x+12,top+12,x,top+24,"#97b3a9");
    }
    box(ctx,0,eave-2,w,3,trim);
    box(ctx,0,eave+1,w,2,"#213846");
    const windowY=eave+8;
    for(let x=6;x<w-14;x+=18){
      const lit=rand(tx+x,ty,1)>(ruined?.87:hospital?.22:.43);
      box(ctx,x-2,windowY-2,14,height-12,"#202f3a");
      box(ctx,x,windowY,10,height-16,lit?(glass?"#9bdc93":hospital?"#efd09a":"#cf9965"):"#374955");
      box(ctx,x,windowY,2,height-16,lit?"#f5dcab":"#50626d");
      box(ctx,x+4,windowY,1,height-16,"#536267");
      box(ctx,x-2,base-7,14,2,trim);
      if(lit)glow(ctx,x+4,windowY+height*.22,18,hospital?"#ffd7a0":glass?"#9fdd9c":"#dcab76");
    }
    if(shop){
      for(let x=5;x<w-8;x+=7){
        const tone=(x-5)%14===0;
        polygon(ctx,[[x+3,eave+4],[x+10,eave+4],[x+7,eave+12],[x,eave+12]],tone?"#a38467":"#677d7d");
        box(ctx,x,eave+12,7,2,tone?"#82674e":"#556870");
      }
    }
    if(hospital||station||power){
      const x=Math.floor(w/2);
      box(ctx,x-16,base-26,32,26,"#293d47");
      box(ctx,x-12,base-21,24,20,hospital?"#6e948b":"#526e77");
      box(ctx,x-10,base-18,20,17,"#263b43");
      box(ctx,x-9,base-17,8,14,"#77a79a");
      box(ctx,x+1,base-17,8,14,"#4e7c77");
      box(ctx,x-17,base-26,34,4,trim);
      box(ctx,x-14,base,28,3,"#526366");
      box(ctx,x-16,base+3,32,2,"#334852");
      if(hospital){
        box(ctx,x-13,eave-25,26,17,"#637d82");
        box(ctx,x-12,eave-25,24,15,"#e1e2d6");
        box(ctx,x-2,eave-23,4,11,"#c46c65");
        box(ctx,x-6,eave-19,12,4,"#c46c65");
      } else if(power){
        polygon(ctx,[[x+2,eave-25],[x-6,eave-15],[x-1,eave-15],[x-4,eave-8],[x+8,eave-20],[x+2,eave-20]],"#e6ba75");
      } else {
        box(ctx,x-17,eave-17,34,7,"#244956");
        for(let i=-12;i<14;i+=5)box(ctx,x+i,eave-15,3,3,"#a3cdb0");
      }
    }
    return {x:tx*TILE,y:(ty+th)*TILE,lift:base,image};
  }
  function terrain(map, chapter) {
    const ground = surface(WIDTH*TILE, HEIGHT*TILE);
    const ctx = ground.getContext("2d");
    const reflections = [];
    for(let y=0;y<HEIGHT;y++) for(let x=0;x<WIDTH;x++){
      const px=x*TILE, py=y*TILE, noise=rand(x,y);
      const onRoad=roadAt(map,x+.5,y+.5);
      const water=chapter===2 && x>=27 && x<=51 && y>=11 && y<=18 && !onRoad;
      const set=onRoad?(y>=18&&x>18&&x<45?colors.mud:colors.road):colors.earth;
      box(ctx,px,py,TILE,TILE,water?(noise>.53?"#25475a":"#284c5e"):set[Math.floor(noise*set.length)]);
      if(water){
        box(ctx,px+rand(x,y,3)*8,py+4,6,1,"#3b6571");
        if(noise>.44&&y>11)reflections.push([px+1,py+5+rand(x,y,4)*8,noise]);
      } else {
        for(let i=0;i<6;i++){
          const shade=onRoad?(i<2?"#576569":"#2c424b"):(i<2?"#30434c":"#122735");
          box(ctx,px+rand(x,y,i+13)*13,py+rand(y,x,i+7)*14,1+(i%3),1,shade);
        }
        if(onRoad&&!roadAt(map,x+.5,y-.5))box(ctx,px,py,16,2,"#687b79");
        if(onRoad&&!roadAt(map,x+.5,y+1.5))box(ctx,px,py+14,16,2,"#263742");
        if(!onRoad&&noise>.91){box(ctx,px+5,py+9,7,2,"#496157");box(ctx,px+7,py+6,2,5,"#577360");}
      }
    }
    for(let x=3;x<65;x++){
      if(x%3===0){
        if(roadAt(map,x+.5,15.1))box(ctx,x*TILE,15*TILE,10,2,"#8e886e");
        if(x>=19&&x<46)box(ctx,x*TILE,8.7*TILE,9,1,"#a79a73");
      }
      if(x>=19&&x<45){
        box(ctx,x*TILE,18.3*TILE,16,1,"#60766c");
        box(ctx,x*TILE,21.75*TILE,16,1,"#61786d");
      }
    }
    if(chapter===1){
      for(let x=49;x<64;x++)for(const y of [11.1,16.6]){
        box(ctx,x*TILE,y*TILE,16,9,"#343745");
        box(ctx,x*TILE+5,y*TILE-1,3,11,"#6c5d51");
        box(ctx,x*TILE,y*TILE+1,16,1,"#a59e84");
        box(ctx,x*TILE,y*TILE+7,16,1,"#787969");
      }
    } else {
      for(let x=27;x<=51;x++){
        if(roadAt(map,x+.5,11.5)||!roadAt(map,x+.5,10.5))continue;
        const px=x*TILE,bank=11*TILE;
        box(ctx,px,bank-2,TILE,2,"#a4a6a0");
        box(ctx,px,bank,TILE,11,"#536a73");
        box(ctx,px,bank+8,TILE,3,"#334d5d");
        box(ctx,px,bank+11,TILE,3,"#193747");
        if(x%3===0){
          box(ctx,px+4,bank,6,16,"#415a68");
          box(ctx,px+4,bank,2,15,"#7b9093");
          box(ctx,px+1,bank+16,13,2,"#5b8a8c");
        }
      }
      for(let x=45;x<64;x++)for(const y of [8.5,11.8,16.4,20.2]){
        box(ctx,x*TILE,y*TILE,16,2,"#97a5a4");
        box(ctx,x*TILE,y*TILE+3,4,5,"#486374");
      }
    }
    const scenery = map.buildings.map(structure);
    for(const [tx,ty,tw,th] of map.buildings){
      const x=tx*TILE,y=ty*TILE,w=tw*TILE,h=th*TILE;
      polygon(ctx,[[x,y+h],[x+w,y+h],[x+w+34,y+h+20],[x+18,y+h+20]],"#0b1c2b88");
      polygon(ctx,[[x+w,y],[x+w+24,y+9],[x+w+34,y+h+20],[x+w,y+h]],"#102335a0");
      box(ctx,x,y+h-2,w,7,"#1a2b3b9f");
    }
    const trees = [.59,.77,.97].map(tree);
    for(let x=1;x<WIDTH-1;x++)for(let y=1;y<HEIGHT-1;y++){
      const chance=rand(x,y,6);
      if(chance<.937||roadAt(map,x+.5,y+.5)||map.buildings.some(([a,b,w,h])=>x>=a-1&&x<=a+w&&y>=b-1&&y<=b+h))continue;
      if(chapter===2&&x>=27&&x<=51&&y>=11&&y<=18)continue;
      const px=x*TILE+7,py=y*TILE+9;
      scenery.push({x:px-17,y:py,lift:43,image:trees[Math.floor(rand(x,y,7)*trees.length)]});
      polygon(ctx,[[px-5,py],[px+3,py-3],[px+23,py+6],[px+19,py+11]],"#101e2c94");
    }
    const crates = [0,1].map(type=>{
      const image=surface(24,21);
      crate(image.getContext("2d"),12,13,type);
      return image;
    });
    for(const [x,y,type] of [[15,16,0],[17,12,0],[22,10,0],[40,20,0],[48,12,0],[57,18,1],[10,16,1],[53,10,0]]){
      scenery.push({x:x*TILE-12,y:y*TILE,lift:13,image:crates[type]});
    }
    return {ground, scenery, reflections};
  }
  function drawFloor(ctx, scene, time) {
    const width=WIDTH*TILE, height=HEIGHT*TILE;
    ctx.drawImage(scene.ground,0,0);
    box(ctx,0,-skyMargin/pitch,width,skyMargin/pitch+1,gradient(ctx,-skyMargin/pitch,0,"#081621","#192a37"));
    box(ctx,0,height,width,foregroundMargin/pitch+1,gradient(ctx,height,height+foregroundMargin/pitch,"#192a37","#08141d"));
    for(const [x,y,seed] of scene.reflections){
      const shimmer=Math.sin(seed*28+time*(1.2+seed));
      box(ctx,x+2+shimmer*1.8,y,5+seed*6,1,shimmer>.36?"#82b1b488":"#426a7888");
    }
  }
  function shadow(ctx,x,y,width=10) {
    ctx.beginPath();
    ctx.ellipse(x+width*.4,y+3,width,width*.39,.25,0,Math.PI*2);
    ctx.fillStyle="#0b1826a6";
    ctx.fill();
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
  function robot(ctx,x,y,e,t){
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
  return {pitch,skyMargin,foregroundMargin,box,pathLine,terrain,drawFloor,shadow,person,robot,crate,glow,looks,roadAt};
})();
