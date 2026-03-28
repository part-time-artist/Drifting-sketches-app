// app.js
let windSpeed = 0; // km/h
let windVector = { x: 0, y: 0 }; 
let globalWindAngle = 0;

let strokes = []; 
let isDrawing = false;
let currentPoints = [];

let selectedBrushType = 'watercolor'; // ['watercolor', 'marker', 'pencil']
let strokeWeightVal = 0.5; // (0 to 1) 
let selectedColorStr = '#4A5568';

function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('canvas-container');
  
  fetchWeatherData();
  setInterval(fetchWeatherData, 1000 * 60 * 10); 
  
  setupUI();
}

function draw() {
  clear(); // transparent logic so body background shows
  
  let currentPhysicsWind = {
    x: map(windVector.x, -50, 50, -3, 3), // Max 50km/h mapping
    y: map(windVector.y, -50, 50, -3, 3)
  };
  
  // Render physical strokes
  for (let i = strokes.length - 1; i >= 0; i--) {
    let s = strokes[i];
    
    // Physical weight scalar
    let resistance = map(s.weight, 0, 1, 1.5, 0.05); 
    
    // Perlin noise for organic gentle wind sway
    let nVal = noise(s.cx * 0.005, s.cy * 0.005, frameCount * 0.01);
    let swayAngle = map(nVal, 0, 1, -PI, PI);
    
    let windForceX = currentPhysicsWind.x + (cos(swayAngle) * 0.4);
    let windForceY = currentPhysicsWind.y + (sin(swayAngle) * 0.4);

    s.vx += windForceX * 0.05 * resistance;
    s.vy += windForceY * 0.05 * resistance;
    s.vx *= 0.95; // Aero friction
    s.vy *= 0.95;
    
    s.cx += s.vx;
    s.cy += s.vy;
    s.rotation += (noise(frameCount * 0.005, i) - 0.5) * 0.01 * resistance;

    // Smooth Wrapping Off-Screen
    let padding = s.pgs[0].width / 2; 
    if (s.cx - padding > width) s.cx = -padding;
    else if (s.cx + padding < 0) s.cx = width + padding;
    
    if (s.cy - padding > height) s.cy = -padding;
    else if (s.cy + padding < 0) s.cy = height + padding;

    // Render the cached graphic stroke (3-frame animation loop for 'alive' jitter)
    push();
    translate(s.cx, s.cy);
    rotate(s.rotation);
    imageMode(CENTER);
    let frameIdx = floor(frameCount / 8) % 3; 
    image(s.pgs[frameIdx], 0, 0);
    pop();
  }
  
  // Render live drawing dynamically 
  if (isDrawing && currentPoints.length > 1) {
    drawLiveStroke(currentPoints, selectedBrushType, selectedColorStr, strokeWeightVal);
  }
}

// Map the mouse inputs identically
function mousePressed(e) {
  let bottomZone = windowWidth < 768 ? 260 : 100;
  if (mouseY > height - bottomZone || mouseY < 80) return; 
  isDrawing = true;
  currentPoints = [[mouseX, mouseY]]; 
}

function mouseDragged() {
  if (isDrawing) {
    let last = currentPoints[currentPoints.length - 1];
    let pt = [mouseX, mouseY];
    // Distance simplify for rendering speed
    if (dist(last[0], last[1], pt[0], pt[1]) > 5) {
      currentPoints.push(pt);
    }
  }
}

function mouseReleased() {
  if (isDrawing && currentPoints.length > 2) {
    if (strokes.length > 35) { // Protect memory heavily
      strokes[0].pgs.forEach(pg => pg.remove()); // Free all 3 buffers
      strokes.shift(); 
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let p of currentPoints) {
      if(p[0] < minX) minX = p[0];
      if(p[1] < minY) minY = p[1];
      if(p[0] > maxX) maxX = p[0];
      if(p[1] > maxY) maxY = p[1];
    }
    
    let cx = (minX + maxX) / 2;
    let cy = (minY + maxY) / 2;
    
    // Recenter coords for the internal graphic pad
    let centeredPoints = currentPoints.map(p => [p[0] - cx, p[1] - cy]);
    
    // Graphic padding
    let pad = 150; 
    let w = (maxX - minX) + pad;
    let h = (maxY - minY) + pad;
    
    // Create a 3-frame animation buffer for boiling line effect ("alive" sketch)
    let pgs = [];
    for (let f = 0; f < 3; f++) {
      let pg = createGraphics(w, h);
      pg.translate(w/2, h/2); 
      drawToBuffer(pg, centeredPoints, selectedBrushType, selectedColorStr, strokeWeightVal);
      pgs.push(pg);
    }

    strokes.push({
      pgs: pgs, 
      cx: cx,
      cy: cy,
      vx: 0,
      vy: 0,
      rotation: 0,
      weight: strokeWeightVal,
      color: selectedColorStr,
      brushType: selectedBrushType
    });
  }
  isDrawing = false;
  currentPoints = [];
}

// ==== MOBILE TOUCH SUPPORT ==== //
function touchStarted(e) {
  let bottomZone = windowWidth < 768 ? 260 : 100;
  if (mouseY > height - bottomZone || mouseY < 80) return true; 
  isDrawing = true;
  currentPoints = [[mouseX, mouseY]];
  return false; // Prevent double-click zoom or scrolling
}

function touchMoved() {
  if (isDrawing) {
    let last = currentPoints[currentPoints.length - 1];
    let pt = [mouseX, mouseY];
    if (dist(last[0], last[1], pt[0], pt[1]) > 5) {
      currentPoints.push(pt);
    }
    return false; // Prevent pull-to-refresh
  }
}

function touchEnded() {
  mouseReleased();
  return false;
}

// ====== CUSTOM ORGANIC BRUSH ENGINES ====== //
function drawLiveStroke(pts, type, colStr, weightVal) {
  push();
  let baseThickness = map(weightVal, 0, 1, 4, 25);
  let col = color(colStr);
  
  if (type === 'watercolor') {
    col.setAlpha(120);
    stroke(col);
    strokeWeight(baseThickness);
    noFill();
    strokeJoin(ROUND);
    strokeCap(ROUND);
    beginShape();
    for (let p of pts) vertex(p[0], p[1]);
    endShape();
  } else if (type === 'marker') {
    col.setAlpha(200);
    stroke(col);
    strokeWeight(baseThickness * 1.5); // Thicker for marker
    noFill();
    strokeJoin(BEVEL);
    beginShape();
    for (let p of pts) vertex(p[0], p[1]);
    endShape();
  } else if (type === 'pencil') {
    col.setAlpha(200);
    stroke(col);
    strokeWeight(max(1, baseThickness * 0.3)); 
    noFill();
    beginShape();
    // Rough preview line with noise
    for (let p of pts) {
      vertex(p[0] + random(-2, 2), p[1] + random(-2, 2));
    }
    endShape();
  } else {
    // Failsafe
    stroke(col);
    strokeWeight(baseThickness);
    noFill();
    beginShape();
    for (let p of pts) vertex(p[0], p[1]);
    endShape();
  }
  pop();
}

function drawToBuffer(pg, pts, type, colStr, weightVal) {
  let baseThickness = map(weightVal, 0, 1, 4, 30);
  let col = color(colStr);

  if (type === 'watercolor' || type === 'watercolour') { 
    pg.noFill();
    pg.strokeJoin(ROUND);
    pg.strokeCap(ROUND);
    for (let i = 0; i < 6; i++) {
      col.setAlpha(map(i, 0, 6, 80, 20)); 
      pg.strokeWeight(baseThickness + (i * 4)); 
      pg.stroke(col);
      pg.beginShape();
      for (let p of pts) {
        pg.vertex(p[0] + random(-i, i), p[1] + random(-i, i));
      }
      pg.endShape();
    }
  } 
  else if (type === 'marker') {
    // Continuous offset lines to simulate a flat chisel tip
    pg.noFill();
    col.setAlpha(180); 
    pg.stroke(col);
    pg.strokeJoin(BEVEL);
    pg.strokeCap(PROJECT);
    for (let k = -1; k <= 1; k++) {
      pg.strokeWeight(baseThickness * 1.2);
      pg.beginShape();
      for (let p of pts) {
        // Shift diagonally to create a flat edge effect
        // Slight random offsets for the "boiling" alive jitter
        pg.vertex(p[0] + (k * 3) + random(-0.8, 0.8), p[1] - (k * 3) + random(-0.8, 0.8));
      }
      pg.endShape();
    }
  } 
  else if (type === 'pencil') {
    // Extreme granular graphite texture: violent noise particle spray
    col.setAlpha(200);
    pg.stroke(col);
    pg.strokeCap(SQUARE);
    for (let i = 0; i < pts.length - 1; i++) {
      let p1 = pts[i];
      let p2 = pts[i+1];
      let d = dist(p1[0], p1[1], p2[0], p2[1]);
      let steps = Math.floor(d * 3.0) + 1; // Insanely dense particle mapping
      
      for (let s = 0; s < steps; s++) {
        if (random() > 0.1) { // 90% particle trigger to emulate dark graphite
          let t = s / steps;
          let nx = lerp(p1[0], p2[0], t);
          let ny = lerp(p1[1], p2[1], t);
          
          let scatter = baseThickness * 0.4; // Very wide chaotic scatter
          let drops = floor(random(1, 5)); // Multiple noise points per step = "grit"
          
          for (let p = 0; p < drops; p++) {
            let rx = random(-scatter, scatter);
            let ry = random(-scatter, scatter);
            pg.strokeWeight(random(0.5, 2)); // Tiny varied dot sizes
            pg.point(nx + rx, ny + ry); 
          }
          
          // Ultra-sharp long graphite scratch chunks mixed into the dust
          if (random() > 0.95) {
            pg.strokeWeight(0.5);
            pg.line(nx, ny, nx + random(-6, 6), ny + random(-6, 6));
          }
        }
      }
    }
  } else {
    col.setAlpha(255);
    pg.stroke(col);
    pg.strokeWeight(baseThickness);
    pg.noFill();
    pg.beginShape();
    for (let p of pts) pg.vertex(p[0] + random(-1,1), p[1] + random(-1,1));
    pg.endShape();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Weather Engine
function fetchWeatherData() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        windSpeed = data.current_weather.windspeed;
        let windDirDegrees = data.current_weather.winddirection;
        globalWindAngle = windDirDegrees * (Math.PI / 180);
        windVector.x = Math.sin(globalWindAngle) * windSpeed;
        windVector.y = -Math.cos(globalWindAngle) * windSpeed;
        updateWindUI(windSpeed, windDirDegrees);
      } catch (err) {
        console.error("Weather fetch failed", err);
      }
    }, (err) => {
      windSpeed = 15.5;
      globalWindAngle = 45 * Math.PI / 180;
      updateWindUI(windSpeed, 45);
      windVector.x = Math.sin(globalWindAngle) * windSpeed;
      windVector.y = -Math.cos(globalWindAngle) * windSpeed;
    });
  } else {
    windSpeed = 15.5;
    updateWindUI(windSpeed, 45);
  }
}

function updateWindUI(speed, dirDegree) {
  const speedEl = document.getElementById('wind-speed');
  const unitEl = document.getElementById('wind-unit');
  const iconCont = document.getElementById('wind-icon-container');
  if(!speedEl) return;
  speedEl.textContent = speed.toFixed(1);
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const val = Math.floor((dirDegree / 22.5) + 0.5);
  const compassDir = directions[(val % 16)];
  unitEl.textContent = `km/h ${compassDir}`;
  if (speed > 5) {
    iconCont.classList.add('animating');
    iconCont.style.animationDuration = `${map(speed, 5, 50, 4, 0.5)}s`;
  } else {
    iconCont.classList.remove('animating');
  }
}

function setupUI() {
  const buttons = document.querySelectorAll('.brush-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      buttons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedBrushType = e.target.dataset.brush;
    });
  });
  
  const colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      colorBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedColorStr = e.target.dataset.color;
      e.target.style.boxShadow = `0 0 0 2px #FFF, 0 0 0 4px ${selectedColorStr}`;
    });
  });

  const exportBtn = document.getElementById('export-btn');
  if(exportBtn) {
    exportBtn.addEventListener('click', () => {
      let exportPg = createGraphics(width, height);
      exportPg.background('#FFFEFC'); 
      exportPg.imageMode(CENTER);
      
      for (let s of strokes) {
        exportPg.push();
        exportPg.translate(s.cx, s.cy);
        exportPg.rotate(s.rotation);
        exportPg.image(s.pgs[0], 0, 0); 
        exportPg.pop();
      }

      // Generate Artwork Statistics Footer
      exportPg.push();
      exportPg.noStroke();
      exportPg.fill(255, 255, 255, 200);
      exportPg.rect(0, height - 80, width, 80);
      
      exportPg.fill('#4A5568');
      exportPg.textFont('monospace');
      exportPg.textAlign(LEFT, CENTER);
      exportPg.textSize(14);
      
      let uniqueBrushes = [...new Set(strokes.map(s => s.brushType))].join(', ');
      let uniqueColorsList = [...new Set(strokes.map(s => s.color))];
      let avgWt = strokes.length > 0 ? (strokes.reduce((sum, s) => sum + s.weight, 0) / strokes.length).toFixed(2) : '0';
      
      let statText = `DRIFTING | Wind: ${windSpeed.toFixed(1)} km/h | Brushes: ${uniqueBrushes || 'None'} | Avg Weight: ${avgWt}`;
      exportPg.text(statText, 30, height - 50);
      
      exportPg.text('Palette: ', 30, height - 25);
      for (let i = 0; i < uniqueColorsList.length; i++) {
        exportPg.fill(uniqueColorsList[i]);
        exportPg.stroke('#4A5568');
        exportPg.strokeWeight(1);
        exportPg.rect(110 + (i * 20), height - 32, 14, 14);
      }
      exportPg.pop();

      // Execute a guaranteed mobile-friendly/desktop save using p5's native Canvas hook directly on the element!
      saveCanvas(exportPg.canvas, 'drifting_artwork', 'png');
      exportPg.remove();
    });
  }

  const slider = document.getElementById('weight-slider');
  if(slider) {
    slider.addEventListener('input', (e) => {
      strokeWeightVal = parseFloat(e.target.value);
      e.target.parentNode.style.setProperty('--val', strokeWeightVal * 100);
    });
    slider.parentNode.style.setProperty('--val', slider.value * 100);
    strokeWeightVal = parseFloat(slider.value);
  }
}
