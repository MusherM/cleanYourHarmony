import * as THREE from 'three';

const canvas=document.querySelector('#world');
const flat=document.querySelector('#flat');
const mode=document.querySelector('#mode');
const chapterNav=document.querySelector('#chapters');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
} catch(error) {
  document.querySelector('#load-status').textContent='此浏览器无法启动 WebGL，请使用平面报告。';
  mode.hidden=true;
}
if(renderer) start();
function start(){
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene();scene.background=new THREE.Color('#060b17');scene.fog=new THREE.FogExp2('#060b17',.014);
const camera=new THREE.PerspectiveCamera(48,1,.1,420);
const hemi=new THREE.HemisphereLight('#b8d7ff','#0a1226',3.2);scene.add(hemi);
const key=new THREE.DirectionalLight('#ffffff',5);key.position.set(-5,10,12);scene.add(key);
const rim=new THREE.DirectionalLight('#547dff',4);rim.position.set(12,2,-5);scene.add(rim);
const cameraLight=new THREE.PointLight('#a6c8ff',65,34,2);scene.add(cameraLight);
const metal=new THREE.MeshStandardMaterial({color:'#aec6e6',metalness:.82,roughness:.23});
const darkMetal=new THREE.MeshStandardMaterial({color:'#17253e',metalness:.7,roughness:.35});
const blue=new THREE.MeshBasicMaterial({color:'#639dff'});
const pale=new THREE.MeshBasicMaterial({color:'#d1e4ff'});
function mesh(geo,material,x,y,z,parent=scene){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);parent.add(m);return m;}
function box(w,h,d,mat,x,y,z,parent){return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent);}
function textureCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
function texture(c){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;}
function panel(c,w,h,x,y,z,parent=scene){return mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture(c),transparent:true,side:THREE.FrontSide,depthWrite:true}),x,y,z,parent);}
const [heroTex,hctx]=textureCanvas(1500,1200);
hctx.fillStyle='#93baff';hctx.font='24px sans-serif';hctx.fillText('CleanYourHarmony',65,180);
hctx.fillStyle='#f0f5ff';hctx.font='500 130px "PingFang SC",sans-serif';hctx.fillText('让清爽，',55,380);hctx.fillText('回到你手中。',55,550);
hctx.font='28px "PingFang SC",sans-serif';hctx.fillStyle='#a5b7d2';hctx.fillText('把干扰留在身后。',65,685);hctx.fillText('进入每一次改变的证据。',65,735);
hctx.strokeStyle='#84b4ff';hctx.lineWidth=2;hctx.strokeRect(65,835,340,82);hctx.fillStyle='#e1ecff';hctx.font='25px sans-serif';hctx.fillText('向下滚动，进入空间',95,887);
const heroGroup=new THREE.Group();scene.add(heroGroup);panel(heroTex,12,9.6,-4,0,1,heroGroup);
const hshape=new THREE.Shape();const outline=[[-2,-2.6],[-.85,-2.6],[-.85,-.55],[.85,-.55],[.85,-2.6],[2,-2.6],[2,2.6],[.85,2.6],[.85,.55],[-.85,.55],[-.85,2.6],[-2,2.6]];outline.forEach(([x,y],i)=>i?hshape.lineTo(x,y):hshape.moveTo(x,y));hshape.closePath();
const hgeo=new THREE.ExtrudeGeometry(hshape,{depth:.75,bevelEnabled:true,bevelThickness:.13,bevelSize:.12,bevelSegments:5,steps:1});hgeo.center();
const logo=mesh(hgeo,metal,4,.4,0,heroGroup);logo.rotation.set(.12,-.45,.1);
const edge=new THREE.LineSegments(new THREE.EdgesGeometry(hgeo,30),new THREE.LineBasicMaterial({color:'#d3e6ff',transparent:true,opacity:.3}));logo.add(edge);
const torus=mesh(new THREE.TorusGeometry(4.15,.025,12,180),blue,4,.4,-.8,heroGroup);torus.rotation.set(.35,.8,.25);
const torus2=mesh(new THREE.TorusGeometry(4.7,.012,8,180),pale,4,.4,-1.2,heroGroup);torus2.rotation.set(1.1,-.5,-.2);
const plinth=mesh(new THREE.CylinderGeometry(3.3,3.5,.28,96),darkMetal,4,-4.3,0,heroGroup);
mesh(new THREE.TorusGeometry(3.35,.025,8,120),blue,4,-4.13,0,heroGroup).rotation.x=Math.PI/2;
// Actual report text is rasterized into GPU textures; no HTML report planes are used in spatial mode.
const source=document.querySelector('#report');
const scope=source.querySelector('.overview'),checks=[...source.querySelectorAll('.check')],limits=source.querySelector('.limits'),next=source.querySelector('.handoff');
const textOf=e=>e?e.innerText.trim():'';
const records=[{title:'验收概览',body:[textOf(source.querySelector('h2')),textOf(source.querySelector('.section-head')),textOf(source.querySelector('.summary')),textOf(source.querySelector('.meta')),textOf(source.querySelector('.demo')),textOf(source.querySelector('.stats'))].filter(Boolean).join('\n\n')},{title:'范围与环境',body:textOf(scope)},...checks.map((c,i)=>({title:`核验 ${i+1} / ${textOf(c.querySelector('.check-name'))}`,body:[textOf(c.querySelector('.status')),textOf(c.querySelector('.check-body'))].join('\n\n')})),{title:'结论边界',body:textOf(limits)+'\n\n'+textOf(next)},{title:'交付协议',body:'记录事实\n以 JSON 记录范围、观察与证据，保留真实的未验证状态。\n\n校验内容\n检查结构、时间与状态一致性，修正错误再生成。\n\n生成交付\n用同一模板呈现结果，让结论与证据一起到达。'}];
function wrap(ctx,text,max){const lines=[];for(const paragraph of text.split('\n')){if(!paragraph.trim()){lines.push('');continue;}let line='';for(const char of paragraph){if(ctx.measureText(line+char).width>max&&line){lines.push(line);line=char;}else line+=char;}lines.push(line);}return lines;}
const exhibits=[];
for(const record of records){const [,ctx]=textureCanvas(1600,1000);ctx.font='28px "PingFang SC",sans-serif';const lines=wrap(ctx,record.body,1400);const pageCount=Math.max(1,Math.ceil(lines.length/16));for(let p=0;p<pageCount;p++){exhibits.push({title:record.title+(pageCount>1?` (${p+1}/${pageCount})`:''),lines:lines.slice(p*16,(p+1)*16)});}}
const stops=[{x:0,z:18,title:'序章'}];
exhibits.forEach((record,i)=>{
const z=-30*(i+1),x=i%2?2.6:-2.6;
const stand=new THREE.Group();stand.position.set(x,0,z);scene.add(stand);
box(17.35,10.35,.3,darkMetal,0,0,-.24,stand);
box(17.4,.035,.06,blue,0,5.15,-.04,stand);box(.035,10.3,.06,blue,-8.65,0,-.04,stand);
box(.12,3,.12,metal,-6,-6.4,-.25,stand);box(.12,3,.12,metal,6,-6.4,-.25,stand);
const [c,ctx]=textureCanvas(1600,1000);ctx.fillStyle='#0c1629';ctx.fillRect(0,0,1600,1000);ctx.fillStyle='#82b3ff';ctx.font='23px sans-serif';ctx.fillText('CleanYourHarmony / 验收档案',90,90);ctx.fillStyle='#f3f7ff';ctx.font='500 48px "PingFang SC",sans-serif';const titleLines=wrap(ctx,record.title,1390);titleLines.slice(0,2).forEach((line,j)=>ctx.fillText(line,85,177+j*55));ctx.fillStyle='#b5c8e2';ctx.font='28px "PingFang SC",sans-serif';record.lines.forEach((line,j)=>ctx.fillText(line,90,290+j*38));ctx.strokeStyle='#354c6b';ctx.beginPath();ctx.moveTo(90,925);ctx.lineTo(1510,925);ctx.stroke();ctx.font='20px sans-serif';ctx.fillStyle='#7091bd';ctx.fillText('记录与证据 / '+String(i+1).padStart(2,'0'),90,965);
panel(c,17,10,0,0,0,stand);
stops.push({x,z:z+17,title:record.title});
// A portal, pedestal and side light keep every document physically situated in the same hall.
box(.13,15,.13,darkMetal,-11,0,z-5);box(.13,15,.13,darkMetal,11,0,z-5);box(22,.13,.13,darkMetal,0,7.5,z-5);
box(.035,13,.035,blue,(i%2?1:-1)*10.9,0,z-4.9);
});
const distance=30*(exhibits.length+2);
const floor=mesh(new THREE.PlaneGeometry(60,distance+80),new THREE.MeshStandardMaterial({color:'#080f20',metalness:.5,roughness:.48}),0,-8,-distance/2+20);floor.rotation.x=-Math.PI/2;
const grid=new THREE.GridHelper(distance+80,Math.round((distance+80)/4),'#345482','#192942');grid.position.set(0,-7.98,-distance/2+20);scene.add(grid);
for(const x of [-11,11]){box(.045,.04,distance,blue,x,-7.95,-distance/2);box(.045,.04,distance,blue,x,7.5,-distance/2);}
// Fixed, deterministic star positions. All points participate in camera perspective.
let seed=317;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};const vertices=[];for(let i=0;i<650;i++)vertices.push((rand()-.5)*70,(rand()-.5)*32,-rand()*distance+20);const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));scene.add(new THREE.Points(starsGeo,new THREE.PointsMaterial({color:'#7da9ed',size:.045,transparent:true,opacity:.7})));
let spatial=false,frame=0,active=0;
const status=document.querySelector('#load-status');status.textContent='';
function targetScroll(index){return index*innerHeight*1.6;}
stops.forEach((stop,i)=>{const b=document.createElement('button');b.textContent=i===0?'序章':String(i).padStart(2,'0');b.title=stop.title;b.setAttribute('aria-label','前往'+stop.title);b.addEventListener('click',()=>scrollTo({top:targetScroll(i),behavior:'smooth'}));chapterNav.append(b);});
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();document.body.style.setProperty('--path-height',(targetScroll(stops.length-1)+innerHeight)+'px');}
function setMode(value){spatial=value;document.body.className=value?'webgl':'reading';flat.inert=value;flat.setAttribute('aria-hidden',String(value));mode.textContent=value?'平面报告':'进入 3D 世界';scrollTo(0,0);resize();}
mode.addEventListener('click',()=>setMode(!spatial));document.querySelector('#home').addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));reduced.addEventListener('change',()=>setMode(!reduced.matches));addEventListener('resize',resize);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();setMode(false);status.textContent='WebGL 上下文中断，已切换平面报告；刷新可重新进入。';});
function draw(time){if(!spatial){requestAnimationFrame(draw);return;}
const raw=Math.max(0,Math.min(stops.length-1,scrollY/(innerHeight*1.6))),index=Math.floor(raw),local=raw-index;
// Reading dwell followed by continuous eased camera travel; no section swaps.
const u=THREE.MathUtils.smoothstep(local,.18,.95),a=stops[index],b=stops[Math.min(index+1,stops.length-1)];
const x=THREE.MathUtils.lerp(a.x,b.x,u),z=THREE.MathUtils.lerp(a.z,b.z,u);
const narrowOffset=Math.max(0,1.65/camera.aspect-1)*15;
camera.position.set(x, .25*Math.sin(raw*Math.PI),z+narrowOffset);camera.lookAt(x,0,z-18);
cameraLight.position.copy(camera.position);logo.rotation.y=-.45+Math.sin(time*.00035)*.08;torus.rotation.z=.25+time*.00003;
renderer.render(scene,camera);active=u>.5?Math.min(index+1,stops.length-1):index;
document.querySelector('#position').textContent=stops[active].title;document.querySelector('#depth').textContent='深度 '+Math.max(0,18-z).toFixed(1)+' m';document.querySelector('#progress').style.width=(raw/(stops.length-1)*100)+'%';[...chapterNav.children].forEach((b,i)=>b.setAttribute('aria-current',String(i===active)));
if(frame++%30===0){canvas.dataset.renderer='THREE.WebGLRenderer';canvas.dataset.revision=THREE.REVISION;canvas.dataset.camera=[camera.position.x,camera.position.y,camera.position.z].map(v=>v.toFixed(2)).join(',');canvas.dataset.drawCalls=renderer.info.render.calls;canvas.dataset.triangles=renderer.info.render.triangles;canvas.dataset.frames=frame;}
requestAnimationFrame(draw);}
resize();setMode(!reduced.matches);requestAnimationFrame(draw);
}
