// Port Solace on canvas: the sun-soaked city from above — pastel blocks and terracotta
// roofs, the beach and the glittering sea, traffic and crowds, and over it the HUD with its
// minimap, wanted stars, objective line and dialogue box. The renderer only reads the
// world; the screens (title, pause, busted, wasted) are drawn here but owned by main.js.

import {
  BEACH_X, COLS, PED_NAMES, ROAD, ROWS, SEA_X, VIEW_H, VIEW_W, clamp, dist,
} from './config.js';
import { placeById, streetX, streetY } from './city.js';
import { currentLine, darioSpot } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';

export function createRenderer(canvas) {
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  const ctx = canvas.getContext('2d');

  function draw(world, missions, screen, hasSave) {
    const cam = cameraFor(world);
    drawGround(world, cam);
    drawPlaces(world, cam);
    drawPickups(world, cam);
    drawCars(world, cam);
    drawPeople(world, cam, missions);
    drawTracers(world, cam);
    drawMarker(world, cam, missions);
    drawHUD(world, missions);
    if (screen !== SCREEN_PLAY) drawScreen(world, screen, hasSave);
  }

  function cameraFor(world) {
    const p = world.player;
    return {
      x: clamp(p.x - VIEW_W / 2, 0, Math.max(0, world.city.width - VIEW_W)),
      y: clamp(p.y - VIEW_H / 2, 0, Math.max(0, world.city.height - VIEW_H)),
    };
  }

  function drawGround(world, cam) {
    const { city } = world;
    const t = world.time;
    ctx.fillStyle = '#8fae5f';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Sea first, with slow wave lines, then the sand over its edge.
    const seaGrad = ctx.createLinearGradient(city.sea.x - cam.x, 0, city.width - cam.x, 0);
    seaGrad.addColorStop(0, '#3d9dbd');
    seaGrad.addColorStop(1, '#1f6f9e');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(city.sea.x - cam.x, -cam.y, city.sea.w + 400, city.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 26; i += 1) {
      const wy = ((i * 173 + t * 14) % (city.height + 120)) - 60 - cam.y;
      const wx = city.sea.x - cam.x + 26 + (i % 5) * 130;
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 22, wy - 7, wx + 46, wy);
    }
    ctx.stroke();
    ctx.fillStyle = '#eed49c';
    ctx.fillRect(city.beach.x - cam.x, -cam.y, city.beach.w, city.height);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(city.sea.x - cam.x - 4, -cam.y, 5, city.height);
    // City ground: warm pavement, block aprons, then the streets.
    ctx.fillStyle = '#c9b896';
    ctx.fillRect(city.cityRect.x - cam.x, city.cityRect.y - cam.y, city.cityRect.w, city.cityRect.h);
    for (const block of city.blocks) {
      ctx.fillStyle = block.kind === 'park' ? '#7fae56' : block.kind === 'lot' ? '#9aa0a3' : '#d8cbae';
      ctx.fillRect(block.x - cam.x, block.y - cam.y, block.w, block.h);
    }
    ctx.fillStyle = '#41454e';
    for (let i = 0; i <= COLS; i += 1) {
      ctx.fillRect(streetX(i) - ROAD / 2 - cam.x, city.cityRect.y - cam.y, ROAD, city.cityRect.h);
    }
    for (let j = 0; j <= ROWS; j += 1) {
      ctx.fillRect(city.cityRect.x - cam.x, streetY(j) - ROAD / 2 - cam.y, city.cityRect.w, ROAD);
    }
    // Lane dashes and crosswalks.
    ctx.fillStyle = '#e8c85a';
    for (let i = 0; i <= COLS; i += 1) {
      for (let y = city.cityRect.y + 14; y < city.cityRect.y + city.cityRect.h - 10; y += 46) {
        ctx.fillRect(streetX(i) - 2 - cam.x, y - cam.y, 4, 24);
      }
    }
    for (let j = 0; j <= ROWS; j += 1) {
      for (let x = city.cityRect.x + 14; x < city.cityRect.x + city.cityRect.w - 10; x += 46) {
        ctx.fillRect(x - cam.x, streetY(j) - 2 - cam.y, 24, 4);
      }
    }
    ctx.fillStyle = 'rgba(240,240,240,0.75)';
    for (let i = 0; i <= COLS; i += 1) {
      for (let j = 0; j <= ROWS; j += 1) {
        ctx.fillRect(streetX(i) - ROAD / 2 + 6 - cam.x, streetY(j) - 14 - cam.y, ROAD - 12, 5);
        ctx.fillRect(streetX(i) - ROAD / 2 + 6 - cam.x, streetY(j) + 9 - cam.y, ROAD - 12, 5);
      }
    }
    // Marina piers and moored boats.
    for (const pier of city.piers) {
      ctx.fillStyle = '#8a6b46';
      ctx.fillRect(pier.x - cam.x, pier.y - cam.y, pier.w, pier.h);
      ctx.fillStyle = '#a5825a';
      ctx.fillRect(pier.x - cam.x, pier.y - cam.y, pier.w, 5);
    }
    ctx.fillStyle = '#f4f6f7';
    for (let i = 0; i < 5; i += 1) {
      const bx = SEA_X + 90 + (i % 3) * 150 - cam.x;
      const by = 1520 + i * 150 - cam.y;
      ctx.fillRect(bx, by, 54, 17);
      ctx.fillStyle = '#c94f4f';
      ctx.fillRect(bx + 8, by + 5, 16, 7);
      ctx.fillStyle = '#f4f6f7';
    }
    // Palms: a bent trunk and a star of fronds, swaying a little.
    for (const palm of city.palms) {
      const px = palm.x - cam.x;
      const py = palm.y - cam.y;
      if (px < -30 || py < -30 || px > VIEW_W + 30 || py > VIEW_H + 30) continue;
      ctx.strokeStyle = '#7a5a36';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + 4, py - 9, px + 8, py - 15);
      ctx.stroke();
      ctx.strokeStyle = '#3e8e4f';
      ctx.lineWidth = 3;
      const sway = Math.sin(t * 1.3 + palm.x) * 2;
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2 + palm.y;
        ctx.beginPath();
        ctx.moveTo(px + 8, py - 15);
        ctx.quadraticCurveTo(px + 8 + Math.cos(a) * 11 + sway, py - 19 + Math.sin(a) * 5, px + 8 + Math.cos(a) * 17 + sway, py - 12 + Math.sin(a) * 9);
        ctx.stroke();
      }
    }
  }

  function drawPlaces(world, cam) {
    const { city } = world;
    for (const block of city.blocks) {
      for (const b of block.buildings) {
        const x = b.x - cam.x;
        const y = b.y - cam.y;
        if (x + b.w < -40 || y + b.h < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
        // Long late-afternoon shadow, a side face for height, then the roof.
        ctx.fillStyle = 'rgba(60,40,20,0.25)';
        ctx.fillRect(x + 13, y + 16, b.w, b.h);
        ctx.fillStyle = shade(b.colour, -28);
        ctx.fillRect(x, y + 8, b.w, b.h - 8);
        ctx.fillStyle = b.roof;
        ctx.fillRect(x, y, b.w, b.h - 10);
        ctx.fillStyle = 'rgba(255,255,255,0.20)';
        ctx.fillRect(x + 5, y + 5, b.w - 10, 4);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        const ac = 1 + (b.floors % 3);
        for (let i = 0; i < ac; i += 1) ctx.fillRect(x + 14 + i * 30, y + 16, 15, 10);
        if (b.placeId) {
          const place = placeById(city, b.placeId);
          ctx.fillStyle = '#20303e';
          ctx.fillRect(x + b.w / 2 - 52, y + b.h - 34, 104, 21);
          ctx.fillStyle = '#ffd75e';
          ctx.font = `700 12px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(place.short, x + b.w / 2, y + b.h - 19);
        }
      }
    }
    // Named places get their full name over the door when the player is near.
    const p = world.player;
    for (const place of city.places) {
      if (dist(p.x, p.y, place.door.x, place.door.y) > 300) continue;
      ctx.font = `600 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,16,24,0.55)';
      const w = ctx.measureText(place.name).width + 18;
      ctx.fillRect(place.door.x - cam.x - w / 2, place.door.y - cam.y - 44, w, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(place.name, place.door.x - cam.x, place.door.y - cam.y - 27);
    }
    // Rusty's bay glows when a repaint is on offer.
    const garage = placeById(city, 'garage');
    ctx.fillStyle = 'rgba(83,176,106,0.30)';
    ctx.fillRect(garage.x - 58 - cam.x, garage.y + 10 - cam.y, 52, garage.h - 20);
  }

  function drawPickups(world, cam) {
    const t = world.time;
    for (const pack of world.packages) {
      if (pack.taken) continue;
      const x = pack.x - cam.x;
      const y = pack.y - cam.y + Math.sin(t * 2.4 + pack.id) * 3;
      ctx.fillStyle = `rgba(255,215,94,${0.35 + 0.2 * Math.sin(t * 3 + pack.id)})`;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6b32';
      ctx.fillRect(x - 6, y - 5, 12, 10);
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(x - 6, y - 1, 12, 2);
    }
    const glyphs = { health: '+', armour: 'A', ammo: '≡', cash: '$' };
    const colours = { health: '#e2492f', armour: '#4f7dc9', ammo: '#e0a83c', cash: '#53b06a' };
    for (const pickup of world.pickups) {
      if (pickup.taken) continue;
      const x = pickup.x - cam.x;
      const y = pickup.y - cam.y + Math.sin(t * 2 + pickup.x) * 2.5;
      ctx.fillStyle = colours[pickup.kind];
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(glyphs[pickup.kind], x, y + 4.5);
    }
  }

  function drawCars(world, cam) {
    const t = world.time;
    for (const car of world.cars) {
      const x = car.x - cam.x;
      const y = car.y - cam.y;
      if (x < -70 || y < -70 || x > VIEW_W + 70 || y > VIEW_H + 70) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(car.angle);
      ctx.fillStyle = 'rgba(30,25,15,0.30)';
      roundRect(6 - 23, 6 - 12, 46, 24, 7);
      ctx.fill();
      if (car.missionTarget) {
        ctx.strokeStyle = `rgba(255,215,94,${0.6 + 0.4 * Math.sin(t * 5)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-6, -6, 36, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = car.kind === 'police' ? '#eef1f3' : car.colour;
      roundRect(-23, -12, 46, 24, 7);
      ctx.fill();
      ctx.fillStyle = car.kind === 'police' ? '#23272e' : shade(car.colour, -34);
      roundRect(-9, -10, 19, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#bfe3ee';
      roundRect(3, -9, 6, 18, 2);
      ctx.fill();
      roundRect(-14, -9, 4, 18, 2);
      ctx.fill();
      ctx.fillStyle = '#1c1e22';
      for (const [wx, wy] of [[-15, -13], [13, -13], [-15, 10], [13, 10]]) ctx.fillRect(wx, wy, 8, 4);
      if (car.kind === 'police') {
        const flash = Math.sin(t * 11) > 0;
        ctx.fillStyle = flash ? '#ff4040' : '#4040ff';
        ctx.fillRect(-4, -6, 8, 5);
        ctx.fillStyle = flash ? '#4040ff' : '#ff4040';
        ctx.fillRect(-4, 1, 8, 5);
      }
      if (car.name === 'Vermilion GT') {
        ctx.fillStyle = '#7d130c';
        ctx.fillRect(-24, -11, 5, 22);
      }
      if (car.hp < 55) {
        ctx.fillStyle = `rgba(70,70,70,${0.35 + 0.15 * Math.sin(t * 9 + car.id)})`;
        ctx.beginPath();
        ctx.arc(16, 0, 7 + (55 - car.hp) / 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPeople(world, cam, missions) {
    const t = world.time;
    const person = (x, y, angle, shirt, skin, down, label) => {
      ctx.save();
      ctx.translate(x - cam.x, y - cam.y);
      if (down) ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(30,25,15,0.25)';
      ctx.beginPath();
      ctx.ellipse(3, 4, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 3.4, Math.sin(angle) * 3.4, 5.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (label) {
        ctx.font = `700 10px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10,16,24,0.6)';
        const w = ctx.measureText(label).width + 10;
        ctx.fillRect(x - cam.x - w / 2, y - cam.y - 30, w, 14);
        ctx.fillStyle = '#ffd75e';
        ctx.fillText(label, x - cam.x, y - cam.y - 19.5);
      }
    };
    for (const ped of world.peds) person(ped.x, ped.y, ped.angle, ped.shirt, '#d9a066', ped.state === 'down');
    for (const guard of world.guards) person(guard.x, guard.y, guard.angle, '#3a3f4a', '#c98d5f', guard.state === 'down', guard.state === 'down' ? '' : 'GUARD');
    for (const officer of world.officers) person(officer.x, officer.y, officer.angle, '#274b8f', '#b97f52', officer.state === 'down', officer.state === 'down' ? '' : 'POLICE');
    const spot = darioSpot(world);
    person(spot.x, spot.y, Math.atan2(world.player.y - spot.y, world.player.x - spot.x), '#f2ead8', '#a06a3c', false, 'DARIO');
    const p = world.player;
    if (!p.car) {
      person(p.x, p.y, p.angle, '#0f766e', '#8a5a33', false);
      // The pistol, when the player is aiming or has just fired.
      if (p.shootCd > 0.08) {
        ctx.strokeStyle = '#22242a';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(p.x - cam.x, p.y - cam.y);
        ctx.lineTo(p.x - cam.x + Math.cos(p.angle) * 17, p.y - cam.y + Math.sin(p.angle) * 17);
        ctx.stroke();
      }
    } else {
      // A small arrow over the player's car so it is never lost in traffic.
      ctx.fillStyle = `rgba(255,215,94,${0.75 + 0.25 * Math.sin(t * 4)})`;
      ctx.beginPath();
      ctx.moveTo(p.x - cam.x, p.y - cam.y - 34);
      ctx.lineTo(p.x - cam.x - 8, p.y - cam.y - 46);
      ctx.lineTo(p.x - cam.x + 8, p.y - cam.y - 46);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTracers(world, cam) {
    for (const tr of world.tracers) {
      ctx.strokeStyle = `rgba(255,240,170,${clamp(tr.life / 0.07, 0, 1)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tr.x1 - cam.x, tr.y1 - cam.y);
      ctx.lineTo(tr.x2 - cam.x, tr.y2 - cam.y);
      ctx.stroke();
    }
  }

  function drawMarker(world, cam, missions) {
    const m = missions?.marker;
    if (!m) return;
    const x = m.x - cam.x;
    const y = m.y - cam.y;
    const t = world.time;
    if (x > -40 && x < VIEW_W + 40 && y > -40 && y < VIEW_H + 40) {
      ctx.strokeStyle = `rgba(255,215,94,${0.35 + 0.2 * Math.sin(t * 3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 190);
      ctx.stroke();
      ctx.fillStyle = '#ffd75e';
      ctx.save();
      ctx.translate(x, y - 30 + Math.sin(t * 3) * 4);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
    }
  }

  function drawHUD(world, missions) {
    const p = world.player;
    // Cash and packages, top-left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    roundRectAt(14, 12, 168, 62, 9);
    ctx.fill();
    ctx.fillStyle = '#7be495';
    ctx.font = `800 27px ${FONT}`;
    ctx.fillText(`$${p.cash}`, 26, 47);
    ctx.fillStyle = '#ffd75e';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`▣ ${p.packagesFound}/20 packages`, 26, 66);
    // Health and armour, bottom-left.
    bar(16, VIEW_H - 58, 210, 15, p.health / 100, '#e2492f', `HEALTH ${Math.ceil(p.health)}`);
    bar(16, VIEW_H - 36, 210, 15, p.armour / 100, '#4f7dc9', `ARMOUR ${Math.ceil(p.armour)}`);
    // Weapon and ammo, bottom-right.
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    roundRectAt(VIEW_W - 176, VIEW_H - 58, 162, 44, 9);
    ctx.fill();
    ctx.fillStyle = '#f2f2f2';
    ctx.font = `700 15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(p.car ? 'DRIVING' : 'PISTOL', VIEW_W - 26, VIEW_H - 38);
    ctx.fillStyle = '#ffd75e';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(p.car ? 'F to get out' : `Ammo ${p.ammo}`, VIEW_W - 26, VIEW_H - 21);
    // Objective, top-centre.
    if (missions?.objective) {
      ctx.font = `600 16px ${FONT}`;
      ctx.textAlign = 'center';
      const w = Math.min(640, ctx.measureText(missions.objective).width + 30);
      ctx.fillStyle = 'rgba(10,16,24,0.62)';
      roundRectAt(VIEW_W / 2 - w / 2, 12, w, 34, 9);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(missions.objective, VIEW_W / 2, 35, w - 16);
    }
    // Wanted stars over the minimap.
    drawMinimap(world, missions);
    ctx.font = `800 25px ${FONT}`;
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < world.stars ? (Math.sin(world.time * 6) > -0.4 || i >= world.stars ? '#ffd75e' : '#8a7433') : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', VIEW_W - 18 - (4 - i) * 27, 42);
    }
    ctx.textAlign = 'left';
    // The bust meter, centre-bottom, only while it fills.
    if (p.bust > 0.02) {
      ctx.fillStyle = 'rgba(10,16,24,0.6)';
      roundRectAt(VIEW_W / 2 - 130, VIEW_H - 108, 260, 26, 8);
      ctx.fill();
      ctx.fillStyle = '#e2492f';
      roundRectAt(VIEW_W / 2 - 124, VIEW_H - 102, 248 * p.bust, 14, 6);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('BUSTED', VIEW_W / 2, VIEW_H - 91);
      ctx.textAlign = 'left';
    }
    // The vault bag during the bank job.
    if (missions && missions.loot > 0 && missions.loot < 1) {
      bar(VIEW_W / 2 - 130, VIEW_H - 140, 260, 16, missions.loot, '#ffd75e', `FILLING THE BAG ${Math.floor(missions.loot * 100)}%`);
    }
    if (p.garageT > 0) {
      bar(VIEW_W / 2 - 110, VIEW_H - 140, 220, 16, p.garageT / 2.2, '#53b06a', 'REPAINTING…');
    }
    // Dialogue, bottom-centre.
    const line = missions ? currentLine(missions) : null;
    if (line) {
      ctx.fillStyle = 'rgba(10,16,24,0.78)';
      roundRectAt(VIEW_W / 2 - 320, VIEW_H - 96, 640, 62, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd75e';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText(line.speaker.toUpperCase(), VIEW_W / 2 - 304, VIEW_H - 72);
      ctx.fillStyle = '#ffffff';
      ctx.font = `400 15px ${FONT}`;
      wrapText(line.text, VIEW_W / 2 - 304, VIEW_H - 52, 608, 19, 2);
    }
    // Controls hint, faint, bottom-centre under everything.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `500 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('WASD walk · Arrows drive · F car · Space punch · Click shoot · E talk/use · P pause', VIEW_W / 2, VIEW_H - 8);
    ctx.textAlign = 'left';
  }

  function drawMinimap(world, missions) {
    const MW = 218;
    const MH = 152;
    const MX = VIEW_W - MW - 14;
    const MY = 52;
    const sx = MW / world.city.width;
    const sy = MH / world.city.height;
    ctx.fillStyle = 'rgba(12,22,34,0.78)';
    roundRectAt(MX - 4, MY - 4, MW + 8, MH + 8, 10);
    ctx.fill();
    ctx.fillStyle = '#8fae5f';
    ctx.fillRect(MX, MY, MW, MH);
    ctx.fillStyle = '#3d9dbd';
    ctx.fillRect(MX + SEA_X * sx, MY, (world.city.width - SEA_X) * sx, MH);
    ctx.fillStyle = '#eed49c';
    ctx.fillRect(MX + BEACH_X * sx, MY, (SEA_X - BEACH_X) * sx, MH);
    ctx.strokeStyle = '#41454e';
    ctx.lineWidth = 2;
    for (let i = 0; i <= COLS; i += 1) {
      ctx.beginPath();
      ctx.moveTo(MX + streetX(i) * sx, MY);
      ctx.lineTo(MX + streetX(i) * sx, MY + MH);
      ctx.stroke();
    }
    for (let j = 0; j <= ROWS; j += 1) {
      ctx.beginPath();
      ctx.moveTo(MX, MY + streetY(j) * sy);
      ctx.lineTo(MX + MW, MY + streetY(j) * sy);
      ctx.stroke();
    }
    for (const place of world.city.places) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(MX + place.door.x * sx - 1.5, MY + place.door.y * sy - 1.5, 3, 3);
    }
    for (const car of world.cars) {
      if (car.kind !== 'police') continue;
      ctx.fillStyle = Math.sin(world.time * 8) > 0 ? '#ff5050' : '#4f7dc9';
      ctx.fillRect(MX + car.x * sx - 2, MY + car.y * sy - 2, 4, 4);
    }
    const m = missions?.marker;
    if (m) {
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.arc(MX + m.x * sx, MY + m.y * sy, 3.6 + Math.sin(world.time * 4) * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player, a white arrow that turns with them.
    const p = world.player;
    ctx.save();
    ctx.translate(MX + p.x * sx, MY + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -3.6);
    ctx.lineTo(-4, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawScreen(world, screen, hasSave) {
    const p = world.player;
    if (screen === SCREEN_TITLE) {
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, 'rgba(16,24,44,0.55)');
      grad.addColorStop(0.55, 'rgba(16,24,44,0.25)');
      grad.addColorStop(1, 'rgba(120,40,60,0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd75e';
      ctx.font = `900 84px ${FONT}`;
      ctx.fillText('PORT SOLACE', VIEW_W / 2, 218);
      ctx.fillStyle = '#ff7d9c';
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText('· NEON TIDE ·', VIEW_W / 2, 272);
      ctx.fillStyle = '#ffffff';
      ctx.font = `500 19px ${FONT}`;
      ctx.fillText('An open-world crime story in a sun-soaked harbour city.', VIEW_W / 2, 322);
      ctx.font = `700 21px ${FONT}`;
      ctx.fillText('ENTER — New game', VIEW_W / 2, 402);
      if (hasSave) ctx.fillText('C — Continue your story', VIEW_W / 2, 436);
      ctx.font = `400 16px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('Walk with WASD · drive with the arrows · F steals the car you stand beside', VIEW_W / 2, 492);
      ctx.fillText('Space punches · the mouse aims, a click shoots · E talks and uses · P pauses', VIEW_W / 2, 518);
      ctx.fillText('Five jobs for Dario Fenn wait outside the Solace Diner. Twenty packages hide in the alleys.', VIEW_W / 2, 544);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(10,14,22,0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 44px ${FONT}`;
      ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 10);
      ctx.font = `500 17px ${FONT}`;
      ctx.fillText('P or Enter to keep playing', VIEW_W / 2, VIEW_H / 2 + 26);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_BUSTED) {
      ctx.fillStyle = `rgba(30,40,90,${0.35 + 0.12 * Math.sin(world.time * 9)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5f4a';
      ctx.font = `900 76px ${FONT}`;
      ctx.fillText('BUSTED', VIEW_W / 2, VIEW_H / 2 - 6);
      ctx.fillStyle = '#ffffff';
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText('The police take their fine and your afternoon. Press Enter.', VIEW_W / 2, VIEW_H / 2 + 34);
      ctx.textAlign = 'left';
    } else if (screen === SCREEN_WASTED) {
      ctx.fillStyle = 'rgba(90,12,8,0.45)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8e3d8';
      ctx.font = `900 76px ${FONT}`;
      ctx.fillText('WASTED', VIEW_W / 2, VIEW_H / 2 - 6);
      ctx.fillStyle = '#ffffff';
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText(`Solace General patches you up, for a fee. Cash left: $${p.cash}. Press Enter.`, VIEW_W / 2, VIEW_H / 2 + 34);
      ctx.textAlign = 'left';
    }
  }

  // Small drawing helpers.
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function roundRectAt(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function bar(x, y, w, h, frac, colour, label) {
    ctx.fillStyle = 'rgba(10,16,24,0.6)';
    roundRectAt(x - 2, y - 2, w + 4, h + 4, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRectAt(x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = colour;
    if (frac > 0.01) {
      roundRectAt(x, y, w * clamp(frac, 0, 1), h, 4);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 10.5px ${FONT}`;
    ctx.fillText(label, x + 6, y + h - 3.5);
  }
  function wrapText(text, x, y, maxW, lineH, maxLines) {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        lines += 1;
        if (lines >= maxLines) return;
        line = word;
        y += lineH;
      } else line = test;
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y);
  }
  function shade(hex, amt) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = clamp((n >> 16) + amt, 0, 255);
    const g = clamp(((n >> 8) & 0xff) + amt, 0, 255);
    const b = clamp((n & 0xff) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  return { draw };
}
