'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','docs','game.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function setup(seed=715,progress={}){
  let value=seed>>>0;const math=Object.create(Math);math.random=()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};
  const sandbox={window:{},Math:math};vm.runInNewContext(source,sandbox);const ends=[],messages=[];
  const game=sandbox.window.createGame({progress,hud(){},save(){},toast(text){messages.push(text);},end(...args){ends.push(args);}});game.reset();return{game,progress,ends,messages};
}
function press(game,key){game.key(key,true);game.key(key,false);}
function click(game,x,y){game.pointer('down',x,y);game.pointer('up',x,y);}
function change(game,edit){const state=game.snapshot();edit(state);assert.equal(game.restore(state),true);}
function cost(tile,y,kit){return y===0?0:1+(tile===1?(kit==='drill'?.5:1.4):tile===7?(kit==='drill'?3.2:6):tile>=3&&tile<=5?(kit==='drill'?1.2:3.4):tile===6?6:0);}
function paths(state,start,grid=state.grid,full=false,blockedSurface=false){
  const dist=Array(120).fill(Infinity),parent=Array(120).fill(-1),open=[start];dist[start]=0;
  while(open.length){open.sort((a,b)=>dist[b]-dist[a]);const at=open.pop(),x=at%10,y=Math.floor(at/10);
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,next=b*10+a;if(a<0||a>=10||b<0||b>=12||blockedSurface&&b===0||grid[b][a]===2||full&&grid[b][a]>=3&&grid[b][a]<=5)continue;const value=dist[at]+cost(grid[b][a],b,state.kit);if(value+1e-9<dist[next]){dist[next]=value;parent[next]=at;open.push(next);}}
  }
  return{dist,path(to){const route=[];for(let at=to;at!==start&&at!==-1;at=parent[at])route.push(at);return route.reverse();}};
}
function walk(game,cells){for(const cell of cells){const s=game.snapshot(),dx=cell%10-s.x,dy=Math.floor(cell/10)-s.y;assert.equal(Math.abs(dx)+Math.abs(dy),1);press(game,dx===1?'ArrowRight':dx===-1?'ArrowLeft':dy===1?'ArrowDown':'ArrowUp');if(game.snapshot().finished||game.snapshot().mode==='surface')break;}}
function planningRun(seed,day,tank=0,bag=0){
  const h=setup(seed,{day,tank,bag,credits:120});let safety=0;
  while(!h.game.snapshot().finished&&safety++<240){
    let s=h.game.snapshot();
    if(s.mode==='surface'){if(h.progress.credits>=14&&day>1)press(h.game,'4');press(h.game,'Enter');continue;}
    const from=s.y*10+s.x,all=paths(s,from,s.grid,false,true),capacity=6+bag*2+(s.kit==='bag'?3:0);let best=null;
    for(let cell=10;cell<120;cell++){
      const tile=s.grid[Math.floor(cell/10)][cell%10];if(tile<3||tile>5||!Number.isFinite(all.dist[cell]))continue;
      const route=all.path(cell),grid=clone(s.grid);let reward=0,ore=0;
      for(const at of route){const t=grid[Math.floor(at/10)][at%10];if(t>=3&&t<=5){reward+=({3:12,4:30,5:60})[t];ore++;}if(t===1||t===7||t>=3&&t<=5)grid[Math.floor(at/10)][at%10]=0;}
      if(s.cargo+ore>capacity)continue;
      const back=paths(s,cell,grid,s.cargo+ore===capacity),returnCost=Math.min(...back.dist.slice(0,10));
      if(all.dist[cell]+returnCost+2>s.oxygen)continue;
      const merit=Math.pow(reward,1.3)/(all.dist[cell]+1);
      if(!best||merit>best.merit)best={route,merit};
    }
    if(best)walk(h.game,best.route);
    else{const back=paths(s,from,s.grid,s.cargo===capacity);let target=0;for(let x=1;x<10;x++)if(back.dist[x]<back.dist[target])target=x;assert(Number.isFinite(back.dist[target]));assert(back.dist[target]<=s.oxygen);walk(h.game,back.path(target));}
  }
  assert(safety<240,'Planner failed to terminate');return h;
}
const gradient={addColorStop(){}};const context=new Proxy({},{get(object,key){if(key==='createLinearGradient'||key==='createRadialGradient')return()=>gradient;return object[key]||(()=>{});},set(object,key,value){object[key]=value;return true;}});

test('v2 snapshots reject legacy and malformed saves without changing permanent progress',()=>{
  const h=setup(1,{credits:230,tank:1,bag:1,day:3});const before=clone(h.game.snapshot()),progress=clone(h.progress);
  assert.equal(h.game.restore({version:1,grid:[]}),false);assert.deepEqual(clone(h.progress),progress);assert.deepEqual(clone(h.game.snapshot()),before);
  const bad=h.game.snapshot();bad.counts=[1,0,0];assert.equal(h.game.restore(bad),false);assert.deepEqual(clone(h.game.snapshot()),before);
});
test('the camp is protected and planning consumes very little oxygen underground',()=>{
  const h=setup();for(let i=0;i<600;i++)h.game.update(.1);assert.equal(h.game.snapshot().oxygen,46);assert.equal(h.ends.length,0);
  press(h.game,'Enter');const before=h.game.snapshot().oxygen;for(let i=0;i<100;i++)h.game.update(.1);assert(Math.abs(h.game.snapshot().oxygen-(before-1))<1e-6);
});
test('each move and extraction has a real oxygen cost; a cleared tunnel is cheaper',()=>{
  const h=setup();press(h.game,'Enter');assert(Math.abs(h.game.snapshot().oxygen-41.6)<1e-8);
  press(h.game,'ArrowRight');assert(Math.abs(h.game.snapshot().oxygen-37.2)<1e-8);press(h.game,'ArrowLeft');assert(Math.abs(h.game.snapshot().oxygen-36.2)<1e-8);
  assert.equal(h.game.snapshot().value,24);
});
test('gas costs oxygen at every crossing; hard rock can be excavated once',()=>{
  const h=setup();press(h.game,'Enter');change(h.game,s=>{s.oxygen=46;s.grid[1][3]=6;s.grid[1][5]=7;});
  press(h.game,'ArrowLeft');assert.equal(h.game.snapshot().oxygen,39);press(h.game,'ArrowRight');press(h.game,'ArrowLeft');assert.equal(h.game.snapshot().oxygen,31);
  press(h.game,'ArrowRight');press(h.game,'ArrowRight');assert.equal(h.game.snapshot().oxygen,23);assert.equal(h.game.snapshot().grid[1][5],0);
});
test('a paid kit is exclusive, charged only on descent, and affects extraction',()=>{
  const h=setup(1,{credits:100});press(h.game,'2');press(h.game,'4');assert.equal(h.progress.credits,100);
  press(h.game,'Enter');assert.equal(h.progress.credits,86);assert.equal(h.game.snapshot().expenses,14);assert.equal(h.game.snapshot().kit,'drill');
  assert(Math.abs(h.game.snapshot().oxygen-43.8)<1e-8);assert.equal(h.game.snapshot().cargo,1);
  const tank=setup(2,{credits:100});press(tank.game,'2');press(tank.game,'Enter');assert(Math.abs(tank.game.snapshot().oxygen-59.6)<1e-8);
  const bag=setup(2,{credits:100});press(bag.game,'3');press(bag.game,'Enter');change(bag.game,s=>{s.cargo=8;s.value=96;s.counts=[8,0,0];});assert.equal(bag.game.snapshot().cargo,8);
});
test('permanent equipment competes for the same limited budget and survives reset',()=>{
  const h=setup(1,{credits:200});click(h.game,125,210);assert.equal(h.progress.tank,1);assert.equal(h.progress.credits,60);
  click(h.game,290,210);assert.equal(h.progress.bag,0);assert.equal(h.progress.credits,60);h.game.reset();assert.equal(h.game.snapshot().oxygen,58);
});
test('bag capacity makes mineral quality a choice instead of unlimited collection',()=>{
  const h=setup();press(h.game,'Enter');change(h.game,s=>{s.cargo=6;s.value=72;s.counts=[6,0,0];s.grid[1][5]=5;});
  const before=h.game.snapshot().oxygen;press(h.game,'ArrowRight');assert.equal(h.game.snapshot().x,4);assert.equal(h.game.snapshot().oxygen,before);
  assert(h.messages.some(message=>message.includes('Un cristal vaut 5 cuivres')));
});
test('an oxygen cache is an optional one-use purchase, never an automatic charge',()=>{
  const h=setup(1,{credits:40});press(h.game,'Enter');change(h.game,s=>{s.x=4;s.y=5;s.oxygen=10;});
  assert.equal(h.progress.credits,40);press(h.game,'Enter');assert.equal(h.progress.credits,20);assert.equal(h.game.snapshot().oxygen,34);assert.equal(h.game.snapshot().grid[5][4],0);
  press(h.game,'Enter');assert.equal(h.progress.credits,20);assert.equal(h.game.snapshot().expenses,20);
});
test('distant taps choose the dominant axis relative to the miner; swipes and keys also work',()=>{
  const h=setup();press(h.game,'Enter');click(h.game,355,120);assert.equal(h.game.snapshot().x,5);
  h.game.pointer('down',200,200);h.game.pointer('up',100,200);assert.equal(h.game.snapshot().x,4);
  click(h.game,194,70);assert.equal(h.game.snapshot().mode,'surface');assert.equal(h.progress.credits,24);
});
test('there are limited dives and a missed net objective ends exactly once',()=>{
  const h=setup(1,{day:2});for(let i=0;i<3;i++){press(h.game,'Enter');press(h.game,'ArrowUp');}
  assert.equal(h.ends.length,1);assert.equal(h.ends[0][3],false);assert.equal(h.game.snapshot().dives,3);assert.equal(h.progress.credits,12);
  for(let i=0;i<10;i++)h.game.update(.1);assert.equal(h.ends.length,1);
});
test('objectives and visible dangerous terrain increase after the introductory sector',()=>{
  const one=setup(2026,{day:1}),four=setup(2026,{day:4});
  const dangers=s=>s.grid.flat().filter(t=>t===6||t===7).length;
  assert(dangers(four.game.snapshot())>dangers(one.game.snapshot()));assert(one.messages[0].includes('90 crédits'));assert(four.messages[0].includes('310 crédits'));
});
test('planning legal paths can win the first three sectors across 36 seeds and always return safely',()=>{
  for(let day=1;day<=3;day++)for(let seed=1;seed<=36;seed++){
    const h=planningRun(seed,day);assert.equal(h.ends.length,1,'end count seed '+seed+' day '+day);assert.equal(h.ends[0][3],true,'unwinnable seed '+seed+' day '+day);
  }
});
test('advanced sectors remain winnable with acquired equipment across 24 seeds',()=>{
  for(const day of [5,8])for(let seed=1;seed<=24;seed++){const h=planningRun(seed,day,3,3);assert.equal(h.ends[0][3],true,'advanced sector '+day+' seed '+seed);}
});
test('a successful net objective unlocks the next sector, and drawing has no gameplay side effects',()=>{
  const h=planningRun(99,1);assert.equal(h.ends[0][3],true);h.game.next();assert.equal(h.progress.day,2);
  const before=JSON.stringify(h.game.snapshot());h.game.draw(context);h.game.draw(context);assert.equal(JSON.stringify(h.game.snapshot()),before);
});
test('oxygen failure keeps banked credits and emits one end event',()=>{
  const h=setup(1,{credits:50});press(h.game,'Enter');change(h.game,s=>{s.oxygen=.001;});for(let i=0;i<20;i++)h.game.update(.1);
  assert.equal(h.ends.length,1);assert.equal(h.ends[0][3],false);assert.equal(h.progress.credits,50);
});