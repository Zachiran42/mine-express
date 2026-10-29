/* Mine Express v1.1 — original game code, MIT. Entirely local. */
(function () {
  'use strict';
  const COLS = 10, ROWS = 12, CELL = 33, LEFT = 45, TOP = 66;
  const INK = '#f4eee1', MUTED = '#a4b7b9', GOLD = '#ffc96d', TEAL = '#64dfc5';
  const VALUE = {3: 12, 4: 30, 5: 60};
  const KITS = ['standard', 'tank', 'bag', 'drill'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const integer = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
  const clone = value => JSON.parse(JSON.stringify(value));
  function box(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function text(c, value, x, y, size, color, align) {
    c.fillStyle = color || INK; c.font = `600 ${size}px system-ui, sans-serif`;
    c.textAlign = align || 'left'; c.fillText(value, x, y);
  }
  function gem(c, x, y, color, scale) {
    const k = scale || 1;
    c.beginPath(); c.moveTo(x, y - 9 * k); c.lineTo(x + 8 * k, y - 3 * k);
    c.lineTo(x + 5 * k, y + 6 * k); c.lineTo(x - 5 * k, y + 6 * k); c.lineTo(x - 8 * k, y - 3 * k);
    c.closePath(); c.fillStyle = color; c.fill(); c.strokeStyle = '#ffffff88'; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(x - 6 * k, y - 3 * k); c.lineTo(x + 6 * k, y - 3 * k);
    c.moveTo(x, y - 8 * k); c.lineTo(x + 3 * k, y - 3 * k); c.lineTo(x, y + 5 * k); c.stroke();
  }
  window.createGame = function (api) {
    const p = api.progress;
    let s, touch = null, clock = 0, flash = 0;
    function normalize() {
      p.credits = integer(p.credits, 0, 99999999) ? p.credits : 0;
      p.tank = integer(p.tank, 0, 3) ? p.tank : 0;
      p.bag = integer(p.bag, 0, 3) ? p.bag : 0;
      p.day = integer(p.day, 1, 999) ? p.day : 1;
      p.best = Number.isFinite(p.best) ? Math.max(0, p.best) : 0;
    }
    normalize();
    const baseOxygen = () => 46 + p.tank * 12;
    const oxygenMax = () => baseOxygen() + (s.kit === 'tank' ? 18 : 0);
    const bagMax = () => 6 + p.bag * 2 + (s.kit === 'bag' ? 3 : 0);
    const objective = () => s.day === 1 ? 90 : Math.min(600, 170 + (s.day - 2) * 70);
    const maxDives = () => s.day === 1 ? 4 : 3;
    const net = () => s.earned - s.expenses;
    const upgradePrice = kind => kind === 'tank' ? 140 + p.tank * 100 : 120 + p.bag * 90;
    function moveCost(tile, y) {
      if (y === 0) return 0;
      const drill = s.kit === 'drill';
      return 1 + (tile === 1 ? (drill ? 0.5 : 1.4) : tile === 7 ? (drill ? 3.2 : 6) : tile >= 3 && tile <= 5 ? (drill ? 1.2 : 3.4) : tile === 6 ? 6 : 0);
    }
    function returnCost() {
      if (!s || s.mode === 'surface') return 0;
      const distances = Array(ROWS * COLS).fill(Infinity), open = [{x: s.x, y: s.y, cost: 0}];
      distances[s.y * COLS + s.x] = 0;
      while (open.length) {
        open.sort((a, b) => b.cost - a.cost); const current = open.pop();
        if (current.cost !== distances[current.y * COLS + current.x]) continue;
        if (current.y === 0) return Math.ceil(current.cost * 10) / 10;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const x = current.x + dx, y = current.y + dy;
          if (x < 0 || x >= COLS || y < 0 || y >= ROWS || s.grid[y][x] === 2) continue;
          const tile = s.grid[y][x];
          if (tile >= 3 && tile <= 5 && s.cargo >= bagMax()) continue;
          const cost = current.cost + moveCost(tile, y), key = y * COLS + x;
          if (cost < distances[key]) { distances[key] = cost; open.push({x,y,cost}); }
        }
      }
      return Infinity;
    }
    function hud() { api.hud('OXYGÈNE', Math.max(0, Math.ceil(s.oxygen)), 'SAC', s.cargo + '/' + bagMax(), 'CRÉDITS', p.credits); }
    function generate() {
      const danger = Math.min(0.22, 0.04 + (p.day - 1) * 0.035);
      const grid = Array.from({length: ROWS}, (_, y) => Array.from({length: COLS}, () => {
        if (y === 0) return 0;
        const r = Math.random();
        if (y > 2 && r < 0.07) return 2;
        if (y > 2 && r < 0.07 + danger) return 6;
        if (y > 1 && r < 0.14 + danger) return 7;
        if (r < 0.40 + danger) return y > 7 ? 5 : y > 3 ? 4 : 3;
        return r > 0.94 ? 0 : 1;
      }));
      // A diggable shaft and reachable deposits guarantee that planning has a solution.
      const shaft = [0,3,1,4,0,8,1,4,1,5,0,5];
      for (let y = 0; y < ROWS; y++) grid[y][4] = shaft[y];
      for (let x = 2; x <= 7; x++) grid[1][x] = 3;
      for (let y = 6; y < ROWS; y++) grid[y][5] = 5;
      for (const y of [7,9,11]) grid[y][6] = 5;
      for (const y of [8,10]) grid[y][3] = 4;
      if (p.day > 1) { grid[4][4] = 7; grid[6][4] = 7; }
      grid[8][7] = 8;
      return grid;
    }
    function reset() {
      normalize();
      s = {game: 'mine-express', version: 2, grid: generate(), x: 4, y: 0, oxygen: baseOxygen(),
        cargo: 0, value: 0, counts: [0,0,0], earned: 0, expenses: 0, dives: 0, day: p.day,
        mode: 'surface', kit: 'standard', selectedKit: 'standard', finished: false};
      touch = null; clock = 0; flash = 0; hud();
      api.toast('Objectif : ' + objective() + ' crédits nets en ' + maxDives() + ' descentes. Un seul kit par descente.'); api.save();
    }
    function finish(won, reason) {
      if (s.finished) return; s.finished = true; p.best = Math.max(p.best, Math.max(0, net())); hud(); api.save();
      api.end(won ? 'Extraction maîtrisée !' : 'Secteur abandonné', reason || (won
        ? Math.max(0, net()) + ' crédits nets en ' + s.dives + ' descente(s). Le prochain secteur sera plus exigeant.'
        : 'Votre sac est perdu. Les crédits déjà déposés et les améliorations restent acquis.'), Math.max(0, net()), won);
    }
    function dive() {
      if (s.finished || s.mode !== 'surface') return;
      if (s.dives >= maxDives()) { finish(false, 'Toutes les descentes sont utilisées. Cherchez les minerais de meilleure qualité.'); return; }
      const cost = s.selectedKit === 'standard' ? 0 : 14;
      if (p.credits < cost) { api.toast('Ce kit coûte 14 crédits par descente. Choisissez Standard ou rapportez des minerais.'); return; }
      p.credits -= cost; s.expenses += cost; s.kit = s.selectedKit; s.dives++; s.mode = 'mine'; s.oxygen = oxygenMax();
      api.toast('Chaque pas coûte 1 O₂, plus extraction ou danger. Gardez de quoi remonter.'); move(0,1); api.save();
    }
    function upgrade(kind) {
      if (s.mode !== 'surface' || s.finished) return;
      if (p[kind] >= 3) { api.toast('Amélioration au maximum.'); return; }
      const cost = upgradePrice(kind);
      if (p.credits < cost) { api.toast('Il manque ' + (cost - p.credits) + ' crédits. Les deux équipements partagent votre budget.'); return; }
      p.credits -= cost; p[kind]++; s.oxygen = baseOxygen(); hud(); api.save();
      api.toast(kind === 'tank' ? 'Réserve permanente : +12 O₂.' : 'Sac permanent : +2 places.');
    }
    function chooseKit(index) {
      if (s.mode !== 'surface' || s.finished || !KITS[index]) return;
      s.selectedKit = KITS[index]; api.save();
      api.toast(index ? 'Kit exclusif : 14 crédits seront payés à la descente.' : 'Équipement standard : gratuit.');
    }
    function refill() {
      if (s.mode !== 'mine' || s.finished || s.grid[s.y][s.x] !== 8) return;
      if (s.oxygen > oxygenMax() - 8) { api.toast('Gardez cette cache : votre réserve est encore presque pleine.'); return; }
      if (p.credits < 20) { api.toast('Cette cache demande 20 crédits déjà déposés au camp.'); return; }
      p.credits -= 20; s.expenses += 20; s.oxygen = Math.min(oxygenMax(), s.oxygen + 24); s.grid[s.y][s.x] = 0;
      api.toast('+24 O₂ contre 20 crédits. La cache est maintenant vide.'); hud(); api.save();
    }
    function bank() {
      p.credits += s.value; s.earned += s.value;
      const deposited = s.value; s.cargo = 0; s.value = 0; s.counts = [0,0,0];
      s.mode = 'surface'; s.kit = 'standard'; s.selectedKit = 'standard'; s.oxygen = baseOxygen(); hud(); api.save();
      if (net() >= objective()) { finish(true); return; }
      if (s.dives >= maxDives()) { finish(false, Math.max(0, net()) + ' / ' + objective() + ' crédits nets. Les petits minerais remplissent vite le sac : visez plus profond.'); return; }
      api.toast(deposited + ' crédits déposés. Encore ' + Math.ceil(objective() - net()) + ' nets ; ' + (maxDives() - s.dives) + ' descente(s) restante(s).');
    }
    function move(dx, dy) {
      if (!s || s.finished || s.mode !== 'mine') return;
      const x = s.x + dx, y = s.y + dy;
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return;
      const tile = s.grid[y][x];
      if (tile === 2) { flash = 0.22; api.toast('Paroi indestructible : cherchez un autre passage.'); return; }
      if (tile >= 3 && tile <= 5 && s.cargo >= bagMax()) { api.toast('Sac plein. Un cristal vaut 5 cuivres : choisissez votre récolte puis remontez.'); return; }
      const cost = moveCost(tile, y); s.x = x; s.y = y; s.oxygen = Math.max(0, s.oxygen - cost);
      if (tile >= 3 && tile <= 5) { s.cargo++; s.value += VALUE[tile]; s.counts[tile - 3]++; }
      if (tile === 1 || tile === 7 || tile >= 3 && tile <= 5) s.grid[y][x] = 0;
      if (s.oxygen <= 0 && y > 0) { finish(false, 'Plus assez d’oxygène. Le coût indiqué pour le retour est une réserve à conserver.'); return; }
      if (y === 0) { bank(); return; }
      if (tile === 6) { flash = 0.3; api.toast('Gaz : +6 O₂ à CHAQUE passage. Un détour peut coûter moins cher.'); }
      else if (tile === 8) api.toast('Cache : Espace / Entrée ou bouton en bas pour +24 O₂ contre 20 crédits.');
      const needed = returnCost(); if (s.oxygen <= needed + 3) api.toast('Remontez : retour estimé ' + needed + ' O₂, réserve ' + Math.floor(s.oxygen) + '.');
      hud(); api.save();
    }
    function update(dt) {
      if (!s || s.finished) return;
      dt = clamp(Number(dt) || 0, 0, 0.15); clock += dt; flash = Math.max(0, flash - dt);
      // Planning remains possible: actions dominate consumption, idle drain is deliberately small.
      if (s.mode === 'mine') {
        const before = Math.ceil(s.oxygen); s.oxygen = Math.max(0, s.oxygen - dt * 0.10);
        if (before !== Math.ceil(s.oxygen)) hud();
        if (s.oxygen <= 0) finish(false);
      }
    }
    function draw(c) {
      if (!s) return;
      c.fillStyle = '#101e26'; c.fillRect(0,0,420,600);
      const glow = c.createRadialGradient(210,100,5,210,160,390); glow.addColorStop(0,'#233c42'); glow.addColorStop(1,'#101820');
      c.fillStyle = glow; c.fillRect(0,0,420,600);
      text(c, 'SECTEUR ' + String(s.day).padStart(2,'0') + ' · DESCENTE ' + s.dives + '/' + maxDives(), 28,26,12,TEAL);
      text(c, 'But : ' + objective() + ' crédits nets',28,49,17,INK);
      text(c, Math.max(0,net()) + ' / ' + objective(),392,47,15,GOLD,'right');
      box(c,LEFT-7,TOP-6,CELL*COLS+14,CELL*ROWS+12,10,'#091217','#40545a');
      for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
        const px=LEFT+x*CELL,py=TOP+y*CELL,tile=s.grid[y][x];
        if (y===0) {
          c.fillStyle='#264e44'; c.fillRect(px,py,CELL-1,CELL-1); c.fillStyle='#6ebc80'; c.fillRect(px,py,CELL-1,3);
          if(x===4){box(c,px+6,py+6,20,22,3,'#9dd7af');c.fillStyle='#25473c';c.fillRect(px+13,py+14,7,14);}
        } else if (tile===0 || tile===6 || tile===8) {
          c.fillStyle=tile===6?'#314437':'#15252d'; c.fillRect(px,py,CELL-1,CELL-1);
          if(tile===6){c.fillStyle='#a1cc6b77';for(let i=0;i<3;i++){c.beginPath();c.arc(px+9+i*7,py+18+Math.sin(clock*2+i+x)*4,6,0,Math.PI*2);c.fill();}text(c,'!',px+16,py+22,15,'#e2edaa','center');}
          if(tile===8){box(c,px+8,py+5,16,23,5,'#559ab3','#b7e8f4');text(c,'O₂',px+16,py+20,10,'#effaff','center');}
        } else {
          box(c,px+1,py+1,CELL-3,CELL-3,4,tile===2?'#465463':tile===7?'#5d6470':'#775449');
          c.strokeStyle=tile===2?'#6c7d8b':'#a2735b';c.lineWidth=1;c.beginPath();c.moveTo(px+4,py+7);c.lineTo(px+25,py+7);c.stroke();
          if(tile>=3&&tile<=5) gem(c,px+16,py+16,tile===3?GOLD:tile===4?'#70e4dd':'#be9bff');
          if(tile===2||tile===7){c.strokeStyle=tile===2?'#24313d':'#c6d0d4';c.beginPath();c.moveTo(px+8,py+28);c.lineTo(px+14,py+15);c.lineTo(px+23,py+10);c.stroke();if(tile===2){c.moveTo(px+8,py+8);c.lineTo(px+24,py+25);c.stroke();}}
        }
      }
      if(s.mode==='mine'){
        const px=LEFT+(s.x+.5)*CELL,py=TOP+(s.y+.5)*CELL;
        c.fillStyle='#ffcd7533';c.beginPath();c.arc(px,py,25+Math.sin(clock*3)*2,0,Math.PI*2);c.fill();
        box(c,px-9,py-7,18,18,5,flash?'#ff947b':'#f3b94f');box(c,px-10,py-11,20,7,3,'#e9dfbf');
        c.fillStyle='#fff9cf';c.beginPath();c.arc(px,py-8,3,0,Math.PI*2);c.fill();c.fillStyle='#3b3332';c.fillRect(px-5,py-1,3,3);c.fillRect(px+2,py-1,3,3);
      }
      for(const [i,value,color]of [[0,12,GOLD],[1,30,'#70e4dd'],[2,60,'#be9bff']]){gem(c,41+i*113,486,color,.7);text(c,value+' cr · '+s.counts[i],55+i*113,490,12,MUTED);}
      text(c,'Un pas : 1 O₂ · extraction : +1,4 à +6',28,516,12,MUTED);
      text(c,'Gaz : +6 à chaque passage',28,535,12,'#b8cf92');
      const back=returnCost(),danger=s.mode==='mine'&&s.oxygen<=back+3;
      text(c,'Sac : '+s.value+' cr',392,516,13,GOLD,'right');
      text(c,s.mode==='mine'?'Retour ≥ '+(Number.isFinite(back)?back:'?')+' O₂':'Camp protégé',392,535,13,danger?'#ff9e8c':TEAL,'right');
      if(s.mode==='mine'&&s.grid[s.y][s.x]===8){box(c,28,551,364,36,10,'#376174','#73b9d0');text(c,'RECHARGER : +24 O₂ / 20 CR',210,575,13,INK,'center');}
      else text(c,danger?'REMONTEZ : gardez l’oxygène du retour.':'Touchez une direction dans la mine · glissez',210,575,13,danger?'#ff9e8c':MUTED,'center');
      if(s.mode==='surface'&&!s.finished){
        c.fillStyle='#09151bd9';c.fillRect(28,108,364,351);box(c,36,112,348,350,18,'#183039','#4f716f');
        text(c,'LE CAMP · '+(maxDives()-s.dives)+' DESCENTE(S) RESTANTE(S)',210,139,12,TEAL,'center');
        text(c,'Objectif net : '+Math.max(0,net())+' / '+objective()+' cr',210,165,17,INK,'center');
        for(const [index,kind,title,bonus]of [[0,'tank','Réserve permanente','+12 O₂'],[1,'bag','Sac permanent','+2 places']]){
          const x=53+index*163;box(c,x,181,151,69,10,'#23414a','#43616a');text(c,title,x+75,202,12,INK,'center');text(c,p[kind]>=3?'MAXIMUM':upgradePrice(kind)+' cr · '+bonus,x+75,224,12,GOLD,'center');text(c,'Niveau '+p[kind]+'/3',x+75,242,10,MUTED,'center');
        }
        text(c,'UN SEUL KIT POUR CETTE DESCENTE',210,275,11,MUTED,'center');
        const labels=['Standard','Réserve','Sac','Foreuse'],details=['Normal','+18 O₂','+3 places','Creuse −2,2'];
        for(let i=0;i<4;i++){const x=52+i*80,selected=s.selectedKit===KITS[i];box(c,x,287,76,74,10,selected?'#35584e':'#203b44',selected?TEAL:'#43616a');text(c,labels[i],x+38,309,12,selected?TEAL:INK,'center');text(c,details[i],x+38,329,10,MUTED,'center');text(c,i?'14 cr':'GRATUIT',x+38,349,11,GOLD,'center');}
        box(c,53,379,314,49,12,GOLD);text(c,'DESCENDRE · '+(s.selectedKit==='standard'?'GRATUIT':'14 CR'),210,410,15,'#28302e','center');
        text(c,'Kit payé au départ · un cristal = 60 crédits',210,448,11,MUTED,'center');
      }
    }
    function pointer(type,x,y) {
      if(type==='down'){touch={x,y};return;}if(type==='cancel'){touch=null;return;}
      if(type!=='up'||!touch||!s||s.finished)return;const from=touch;touch=null;const dx=x-from.x,dy=y-from.y;
      if(s.mode==='surface'){
        if(y>=379&&y<=430&&x>=53&&x<=367)dive();
        else if(y>=181&&y<=250&&x>=53&&x<=204)upgrade('tank');
        else if(y>=181&&y<=250&&x>=216&&x<=367)upgrade('bag');
        else if(y>=287&&y<=361&&x>=52&&x<372)chooseKit(Math.floor((x-52)/80));
        return;
      }
      if(Math.max(Math.abs(dx),Math.abs(dy))>=18){if(Math.abs(dx)>Math.abs(dy))move(Math.sign(dx),0);else move(0,Math.sign(dy));return;}
      if(y>=551&&y<=591&&x>=28&&x<=392&&s.grid[s.y][s.x]===8){refill();return;}
      if(x>=LEFT&&x<LEFT+COLS*CELL&&y>=TOP&&y<TOP+ROWS*CELL){
        const rx=x-(LEFT+(s.x+.5)*CELL),ry=y-(TOP+(s.y+.5)*CELL);
        if(Math.max(Math.abs(rx),Math.abs(ry))<CELL*.3)return;
        if(Math.abs(rx)>Math.abs(ry))move(Math.sign(rx),0);else move(0,Math.sign(ry));
      }
    }
    function key(k,down){
      if(!down||!s||s.finished)return;const value=String(k).toLowerCase();
      if(s.mode==='surface'){if([' ','space','enter','arrowdown'].includes(value))dive();else if(['1','2','3','4'].includes(value))chooseKit(Number(value)-1);return;}
      if(['arrowleft','a','q'].includes(value))move(-1,0);else if(['arrowright','d'].includes(value))move(1,0);
      else if(['arrowup','w','z'].includes(value))move(0,-1);else if(['arrowdown','s'].includes(value))move(0,1);
      else if([' ','space','enter','e'].includes(value))refill();
    }
    function snapshot(){return clone(s);}
    function restore(data){
      if(!data||data.game!=='mine-express'||data.version!==2||data.finished!==false)return false;
      if(!Array.isArray(data.grid)||data.grid.length!==ROWS||!data.grid.every((row,y)=>Array.isArray(row)&&row.length===COLS&&row.every(v=>integer(v,0,8)&&(y!==0||v===0))))return false;
      if(!integer(data.x,0,COLS-1)||!integer(data.y,0,ROWS-1)||![0,6,8].includes(data.grid[data.y][data.x]))return false;
      if(!integer(data.day,1,999)||!integer(data.dives,0,data.day===1?4:3)||!['surface','mine'].includes(data.mode)||!KITS.includes(data.kit)||!KITS.includes(data.selectedKit))return false;
      const capacity=6+p.bag*2+(data.kit==='bag'?3:0),maximum=baseOxygen()+(data.kit==='tank'?18:0);
      if(!Number.isFinite(data.oxygen)||data.oxygen<=0||data.oxygen>maximum||!integer(data.cargo,0,capacity)||!integer(data.value,0,capacity*60)||!Array.isArray(data.counts)||data.counts.length!==3||!data.counts.every(v=>integer(v,0,capacity)))return false;
      if(data.counts.reduce((a,b)=>a+b,0)!==data.cargo||data.counts.reduce((a,b,i)=>a+b*[12,30,60][i],0)!==data.value||!integer(data.earned,0,99999999)||!integer(data.expenses,0,99999999))return false;
      if(data.mode==='surface'&&(data.y!==0||data.cargo!==0||data.kit!=='standard')||data.mode==='mine'&&(data.y===0||data.dives===0))return false;
      s=clone(data);touch=null;clock=0;flash=0;hud();return true;
    }
    function next(){p.day=Math.min(999,Math.max(p.day,s.day+1));reset();}
    return{reset,update,draw,pointer,key,snapshot,restore,next};
  };
}());