'use strict';
const KEY = 'la-botonera.v1';
const $ = id => document.getElementById(id);
let sounds = [], incoming = null, player = null, playerReady = false, pending = null, activeId = null, timer = null, currentClip = null;
const colors = ['#b8a1ff','#ffacb8','#ffc783','#a5ddbb','#94cfff','#e4df8f'];
function notice(message) { $('notice').textContent = message; $('notice').hidden = false; clearTimeout(notice.timeout); notice.timeout = setTimeout(() => $('notice').hidden = true, 6500); }
function videoId(value) {
  let u; try { u = new URL(value); } catch { throw Error('Pegá un enlace válido de YouTube.'); }
  if (!['https:', 'http:'].includes(u.protocol)) throw Error('El enlace debe comenzar con https://.');
  const host = u.hostname.toLowerCase().replace(/^www\./,'');
  let id = '';
  if(host === 'youtu.be') id = u.pathname.split('/')[1];
  else if(['youtube.com','m.youtube.com','music.youtube.com'].includes(host)) id = u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(shorts|embed|live)\//.test(u.pathname) ? u.pathname.split('/')[2] : '';
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id || '')) throw Error('Ese enlace no identifica un video de YouTube.');
  return id;
}
function seconds(value) {
  const s = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(s) && !/^\d+:\d{1,2}(?:\.\d+)?$/.test(s) && !/^\d+:\d{1,2}:\d{1,2}(?:\.\d+)?$/.test(s)) throw Error('Usá segundos o un tiempo como 1:24.');
  const parts = s.split(':').map(Number);
  if (parts.length > 1 && parts.slice(1).some(n => n >= 60)) throw Error('Los segundos y minutos del formato de reloj deben ser menores que 60.');
  return parts.reduce((total,n) => total * 60 + n, 0);
}
function format(value) { const n = Math.round(value * 100)/100; return `${Math.floor(n/60)}:${String(+(n%60).toFixed(2)).padStart(2,'0')}`; }
function validate(data) {
  if (!data || typeof data.name !== 'string' || !data.name.trim() || data.name.length > 60) throw Error('El nombre debe tener entre 1 y 60 caracteres.');
  if (!/^[a-zA-Z0-9_-]{11}$/.test(data.videoId || '')) throw Error('El video no es válido.');
  if (typeof data.start !== 'number' || typeof data.end !== 'number' || !Number.isFinite(data.start) || !Number.isFinite(data.end) || data.start < 0 || data.end <= data.start || data.end > 604800) throw Error('Revisá los tiempos: el final debe ser mayor que el inicio.');
  if (!/^#[a-fA-F0-9]{6}$/.test(data.color || '')) throw Error('Elegí un color válido.');
  return {videoId:data.videoId,name:data.name.trim(),start:data.start,end:data.end,color:data.color};
}
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function persist(next) { try { localStorage.setItem(KEY,JSON.stringify(next)); sounds = next; render(); return true; } catch { notice('No se pudo guardar. Revisá el espacio o los permisos del navegador y exportá tu colección.'); return false; } }
try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(saved)) throw Error(); sounds = saved.map(s => ({...validate(s),id:uid()})); } catch { notice('No pudimos leer la colección guardada. Podés recuperar una copia desde Importar.'); }
function switchView(view) { document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view); document.querySelectorAll('.tab').forEach(el => {el.classList.toggle('active',el.dataset.view === view);el.setAttribute('aria-selected',String(el.dataset.view === view));}); }
document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchView(b.dataset.view));
function newSound() { resetForm(); switchView('edit'); $('url').focus(); }
$('add-first').onclick = newSound; $('empty-add').onclick = newSound;
function render() {
  $('count').textContent = sounds.length;
  const query = $('search').value.toLocaleLowerCase();
  const visible = sounds.filter(s => s.name.toLocaleLowerCase().includes(query));
  $('sound-grid').replaceChildren();
  for(const s of visible) {
    const b = document.createElement('button'); b.className = 'sound-card'; b.style.setProperty('--sound',s.color); b.classList.toggle('playing',s.id === activeId); b.setAttribute('aria-label',`Reproducir ${s.name}, de ${format(s.start)} a ${format(s.end)}`);
    const icon = document.createElement('span'); icon.className = 'play-icon'; icon.textContent = s.id === activeId ? '♫' : '▶';
    const name = document.createElement('strong'); name.textContent = s.name;
    const time = document.createElement('span'); time.textContent = `${format(s.start)} → ${format(s.end)} · ${+(s.end-s.start).toFixed(2)} s`;
    b.append(icon,name,time); b.onclick = () => play(s); $('sound-grid').append(b);
  }
  $('empty').hidden = sounds.length > 0;
  if (sounds.length && !visible.length) { const p = document.createElement('p'); p.textContent = 'No hay sonidos con ese nombre.'; $('sound-grid').append(p); }
  $('edit-list').replaceChildren();
  if(!sounds.length) $('edit-list').textContent = 'Todavía no hay botones. Creá el primero.';
  for (const s of sounds) {
    const row = document.createElement('div'); row.className = 'list-row';
    const dot = document.createElement('span'); dot.className = 'list-dot'; dot.style.background = s.color;
    const name = document.createElement('span'); name.className = 'list-name'; name.textContent = s.name;
    const edit = document.createElement('button'); edit.className = 'icon-button'; edit.textContent = 'Editar'; edit.onclick = () => editSound(s);
    const del = document.createElement('button'); del.className = 'icon-button'; del.textContent = 'Eliminar'; del.setAttribute('aria-label',`Eliminar ${s.name}`); del.onclick = () => { if(confirm(`¿Eliminar “${s.name}”?`)) { if (persist(sounds.filter(x => x.id !== s.id))) {if(activeId === s.id) stop(); if($('edit-id').value === s.id) resetForm();} } };
    row.append(dot,name,edit,del); $('edit-list').append(row);
  }
  const selection = $('share-select').value; $('share-select').replaceChildren(new Option('Seleccioná un sonido…',''));
  sounds.forEach(s => $('share-select').add(new Option(s.name,s.id)));
  $('share-select').value = sounds.some(s => s.id === selection) ? selection : ''; updateShare();
}
$('search').oninput = render;
function readForm() { return validate({videoId:videoId($('url').value),name:$('name').value,start:seconds($('start').value),end:seconds($('end').value),color:$('color').value}); }
function resetForm() { $('sound-form').reset(); $('edit-id').value = ''; $('form-title').textContent = 'Nuevo botón'; updatePreview(); }
function editSound(s) { $('edit-id').value = s.id; $('url').value = `https://www.youtube.com/watch?v=${s.videoId}`; for(const key of ['name','color']) $(key).value = s[key]; $('start').value = format(s.start); $('end').value = format(s.end); $('form-title').textContent = 'Editar botón'; updatePreview(); switchView('edit'); $('url').focus(); }
function updatePreview() { $('preview-name').textContent = $('name').value.trim() || 'Tu próximo clásico'; $('preview-time').textContent = `${$('start').value} → ${$('end').value}`; $('button-preview').style.setProperty('--sound',$('color').value); }
['name','color'].forEach(id => $(id).addEventListener('input',updatePreview));
['start','end'].forEach(id => {
  const input = $(id);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').replace(/^0+/, '').padStart(3, '0');
    input.value = `${digits.slice(0, -2)}:${digits.slice(-2)}`;
    input.setSelectionRange(input.value.length, input.value.length);
    updatePreview();
  });
});
colors.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--swatch',c); b.setAttribute('aria-label',`Usar color ${c}`); b.onclick = () => { $('color').value = c; updatePreview(); }; $('swatches').append(b); });
$('cancel-edit').onclick = resetForm;
$('sound-form').onsubmit = event => { event.preventDefault(); try { const data = readForm(); const id = $('edit-id').value || uid(); const next = sounds.some(s => s.id === id) ? sounds.map(s => s.id === id ? {...data,id} : s) : [...sounds,{...data,id}]; if(persist(next)) { resetForm(); notice('Botón guardado en este navegador.'); switchView('play'); } } catch(e) { notice(e.message); } };
$('preview').onclick = () => { try { play({...readForm(),id:null}); } catch(e) { notice(e.message); } };
function stop() { pending = null; currentClip = null; clearInterval(timer); timer = null; if(playerReady) player.stopVideo(); activeId = null; $('now-playing').textContent = 'Todavía no suena nada'; $('player-status').textContent = 'Reproducción detenida.'; render(); }
$('stop').onclick = stop;
function play(sound) {
  pending = sound; activeId = sound.id; $('now-playing').textContent = sound.name; $('player-status').textContent = playerReady ? 'Cargando fragmento…' : 'Conectando con YouTube…'; render();
  if(playerReady) startPlayback();
  else { loadYouTube(); setTimeout(() => {if(pending && !playerReady) notice('YouTube no responde. Revisá tu conexión o los bloqueadores del navegador.');},12000); }
}
function startPlayback() {
  if(!pending) return; const sound = pending; pending = null; currentClip = sound; clearInterval(timer);
  player.loadVideoById({videoId:sound.videoId,startSeconds:sound.start,endSeconds:sound.end});
}
let apiRequested = false;
function loadYouTube() { if(apiRequested) return; apiRequested = true; const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.onerror = () => {apiRequested = false; notice('No se pudo conectar con YouTube. Revisá tu conexión.');}; document.head.append(script); }
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player('youtube-player',{height:'270',width:'480',playerVars:{playsinline:1,origin:location.origin},events:{
    onReady:() => { playerReady = true; startPlayback(); },
    onStateChange:event => { clearInterval(timer); if(event.data === YT.PlayerState.PLAYING) { $('player-status').textContent = 'Reproduciendo fragmento'; timer = setInterval(() => {if(currentClip && player.getCurrentTime() >= currentClip.end) stop();},100); } if(event.data === YT.PlayerState.ENDED) {activeId=null;$('player-status').textContent='Fragmento terminado.';render();} if(event.data === YT.PlayerState.PAUSED) $('player-status').textContent='En pausa.'; },
    onAutoplayBlocked:() => { $('player-status').textContent = 'Tocá ▶ en el reproductor de YouTube para escuchar.'; },
    onError:event => {clearInterval(timer);activeId=null;render();$('player-status').textContent='No se pudo reproducir este video.';notice([101,150].includes(event.data) ? 'El autor no permite reproducir este video en otras páginas.' : event.data === 153 ? 'YouTube no pudo identificar esta página. Abrí la app publicada en GitHub Pages y revisá los bloqueadores del navegador.' : 'El video no está disponible o no puede reproducirse. Probá con otro enlace.');}
  }});
};
function encode(data) { const bytes = new TextEncoder().encode(JSON.stringify(data)); return btoa(Array.from(bytes,b => String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function decode(value) { if(value.length > 8000) throw Error(); const raw = atob(value.replace(/-/g,'+').replace(/_/g,'/')); return JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c => c.charCodeAt(0)))); }
function updateShare() { const s = sounds.find(s => s.id === $('share-select').value); $('copy').disabled = !s; $('share-link').value = s ? `${location.href.split('#')[0]}#sonido=${encode(validate(s))}` : ''; $('share-details').textContent = s ? `${s.name} · ${format(s.start)} → ${format(s.end)}` : 'Se comparten el video, los tiempos, el nombre y el color.'; }
$('share-select').onchange = updateShare;
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('share-link').value); notice('Enlace copiado. ¡Pasá el chiste!'); } catch { $('share-link').focus(); $('share-link').select(); notice('Seleccionamos el enlace. Copialo con Ctrl+C o desde el menú del dispositivo.'); } };
function readIncoming() { if(!location.hash.startsWith('#sonido=')) return; try {incoming = validate(decode(location.hash.slice(8)));$('incoming').hidden=false;$('incoming-name').textContent=incoming.name;$('incoming-info').textContent=`${format(incoming.start)} → ${format(incoming.end)}`;switchView('share');} catch {incoming=null;$('incoming').hidden=true;notice('El enlace compartido está incompleto o no es válido.');} }
window.addEventListener('hashchange',readIncoming);
$('incoming-play').onclick = () => {if(incoming) play({...incoming,id:null});};
$('incoming-save').onclick = () => {if(incoming && persist([...sounds,{...incoming,id:uid()}])) {notice('Sonido agregado a tu colección.');$('incoming').hidden=true;history.replaceState(null,'',location.pathname+location.search);incoming=null;switchView('play');}};
$('export').onclick = () => { const blob = new Blob([JSON.stringify({version:1,sounds:sounds.map(validate)},null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='mi-botonera.json';a.click();setTimeout(() => URL.revokeObjectURL(url),1000); };
$('import').onchange = async event => { const file=event.target.files[0]; if(!file) return; try {if(file.size>2e6) throw Error('El archivo es demasiado grande.');const data=JSON.parse(await file.text());if(data.version!==1 || !Array.isArray(data.sounds) || data.sounds.length>2000) throw Error('El archivo no es una colección válida.');const imported=data.sounds.map(s=>({...validate(s),id:uid()}));if(persist([...sounds,...imported])) notice(`Se agregaron ${imported.length} botones a tu colección.`);}catch(e){notice(e instanceof SyntaxError ? 'No se pudo leer el archivo JSON.' : e.message);}finally{event.target.value='';} };
render(); updatePreview(); readIncoming();
if(location.protocol === 'file:') notice('Podés armar tu colección acá. Para reproducir YouTube y compartir enlaces con tus amigos, abrí la app publicada en GitHub Pages.');
