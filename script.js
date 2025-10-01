// script.js — Versión original con añadidos: prompt install + mediaSession mejoras mínimas
document.addEventListener('DOMContentLoaded', function () {

  /* =====================
     Config + Storage
     ===================== */
  const CONFIG = {
    YT_MAX_RESULTS: 7,
    API_KEYS: [
      "AIzaSyCzu-Mqx22V83ktalXksUnC1AhtZwzyb-0",
      "AIzaSyBM-uvKMHe5GxNuMpWB45-RWVUGYOGwEyQ",
      "AIzaSyAd6JdvYn7YGMfSY9EaJtCEUGd11tKa6ZI",
      "AIzaSyBr2nxeKaN1q07fMV59zrLEOQx9dzYBsMI",
      "AIzaSyBbnepAY-irFm35H7Qu0NrwISzLCThkBKM",
      "AIzaSyAujlR4Gig8puLuzM-amckcwu5sbMRvIR0",
      "AIzaSyBiGJ9JeOdkrUI7x-qQHyrHpUJAxcwRTvI",
      "AIzaSyC_UCUc3zcffX5_IOPFpqbJyXmUYxKOg9U"
    ],
    STORAGE_PREFIX: 'mp_'
  };

  let STORAGE = {
    recent: JSON.parse(localStorage.getItem(CONFIG.STORAGE_PREFIX + 'recent') || '[]'),
    favorites: JSON.parse(localStorage.getItem(CONFIG.STORAGE_PREFIX + 'fav') || '[]'),
    playlists: JSON.parse(localStorage.getItem(CONFIG.STORAGE_PREFIX + 'playlists') || '{}'),
    keyIndex: parseInt(localStorage.getItem(CONFIG.STORAGE_PREFIX + 'key_index') || '0', 10) || 0
  };
  function saveStorage(){
    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'recent', JSON.stringify(STORAGE.recent));
    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'fav', JSON.stringify(STORAGE.favorites));
    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'playlists', JSON.stringify(STORAGE.playlists));
    localStorage.setItem(CONFIG.STORAGE_PREFIX + 'key_index', STORAGE.keyIndex.toString());
  }
  function getCurrentKeyAndAdvance(advance=false){
    const keys = CONFIG.API_KEYS;
    let idx = STORAGE.keyIndex % keys.length;
    const key = keys[idx];
    if(advance){
      STORAGE.keyIndex = (idx + 1) % keys.length;
      saveStorage();
    }
    return {key, idx};
  }

  /* =====================
     UI helpers
     ===================== */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const modalRoot = $('#modalRoot');
  const toastRoot = $('#toastRoot');

  function showModal({title='', html='', buttons=[]}){
    modalRoot.innerHTML = `<div class="modal-bg"><div class="modal"><div style="font-weight:700;margin-bottom:8px">${title}</div><div id="modalBody">${html}</div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px" id="modalBtns"></div></div></div>`;
    modalRoot.classList.remove('hidden');
    const btnArea = document.getElementById('modalBtns');
    buttons.forEach(btn=>{
      const b = document.createElement('button');
      b.className = 'icon-btn';
      b.textContent = btn.label;
      b.style.padding = '8px 12px';
      b.addEventListener('click', ()=>{ 
        if(btn.onClick) btn.onClick();
        if(btn.close !== false) closeModal();
      });
      btnArea.appendChild(b);
    });

    const modalBg = modalRoot.querySelector('.modal-bg');
    const modalEl = modalRoot.querySelector('.modal');
    if(window.innerWidth <= 480){
      modalEl.style.maxWidth = '100%';
      modalEl.style.minWidth = '100%';
      modalEl.style.height = '60vh';
      modalEl.style.borderRadius = '12px 12px 0 0';
      modalEl.style.margin = '0';
      modalBg.style.alignItems = 'flex-end';
    } else {
      modalEl.style.maxWidth = '';
      modalEl.style.minWidth = '';
      modalEl.style.height = '';
      modalEl.style.borderRadius = '';
      modalBg.style.alignItems = 'center';
    }

    modalBg.addEventListener('click', (ev)=>{
      if(ev.target === modalBg) closeModal();
    });
  }
  function closeModal(){ modalRoot.classList.add('hidden'); modalRoot.innerHTML = ''; }

  function showToast(msg, ms=1800){
    toastRoot.innerHTML = `<div class="toast">${msg}</div>`;
    toastRoot.classList.remove('hidden');
    setTimeout(()=>{ toastRoot.classList.add('hidden'); toastRoot.innerHTML=''; }, ms);
  }

  /* =====================
     Notificaciones & Media Session helpers
     ===================== */

  async function ensureNotificationPermission(){
    if(!('Notification' in window)) return false;
    if(Notification.permission === 'granted') return true;
    if(Notification.permission === 'denied') return false;
    try{
      const p = await Notification.requestPermission();
      return p === 'granted';
    }catch(e){
      return false;
    }
  }

  // Mejorada ligeramente: añade handlers adicionales y soporte a positionState (si está)
  function updateMediaSession(track, playing=false){
    if(!('mediaSession' in navigator)) return;
    try{
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track?.title || 'MiPlayer',
        artist: track?.channel || '',
        album: '',
        artwork: [
          { src: track?.thumb || './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: track?.thumb || './icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', ()=>{ proxyMediaAction('play'); });
      navigator.mediaSession.setActionHandler('pause', ()=>{ proxyMediaAction('pause'); });
      navigator.mediaSession.setActionHandler('previoustrack', ()=>{ proxyMediaAction('prev'); });
      navigator.mediaSession.setActionHandler('nexttrack', ()=>{ proxyMediaAction('next'); });

      // handlers complementarios (si el navegador los soporta)
      try {
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
          const offset = (details && details.seekOffset) ? details.seekOffset : 10;
          try {
            const p = (videoShown && visiblePlayer && visiblePlayer.getCurrentTime) ? visiblePlayer : hiddenPlayer;
            if(p && p.getCurrentTime && p.seekTo){
              p.seekTo(Math.max(0, (p.getCurrentTime() || 0) - offset), true);
            }
          }catch(e){}
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
          const offset = (details && details.seekOffset) ? details.seekOffset : 10;
          try {
            const p = (videoShown && visiblePlayer && visiblePlayer.getCurrentTime) ? visiblePlayer : hiddenPlayer;
            if(p && p.getCurrentTime && p.seekTo){
              p.seekTo((p.getCurrentTime() || 0) + offset, true);
            }
          }catch(e){}
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          try {
            const p = (videoShown && visiblePlayer && visiblePlayer.seekTo) ? visiblePlayer : hiddenPlayer;
            if(p && typeof p.seekTo === 'function' && details && details.seekTime !== undefined){
              p.seekTo(details.seekTime, true);
            }
          }catch(e){}
        });
        navigator.mediaSession.setActionHandler('stop', ()=>{ proxyMediaAction('pause'); });
      } catch(e) {
        // ignore if browser throws for unsupported handlers
      }

      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';

      // actualizar posición si la API está presente
      syncMediaPosition();
    }catch(e){ console.warn('mediaSession error', e); }
  }

  async function showMediaNotification(track, playing){
    if(!('serviceWorker' in navigator)) return;
    const ok = await ensureNotificationPermission();
    if(!ok) return;
    try{
      const reg = await navigator.serviceWorker.ready;
      const title = track?.title || 'MiPlayer';
      const options = {
        body: track?.channel || '',
        tag: 'miplayer-media',
        renotify: true,
        silent: false,
        icon: track?.thumb || './icons/icon-192.png',
        badge: './icons/icon-192.png',
        data: { videoId: track?.videoId, playing: !!playing },
        actions: [
          { action: 'prev', title: 'Anterior' },
          { action: playing ? 'pause' : 'play', title: playing ? 'Pausar' : 'Reproducir' },
          { action: 'next', title: 'Siguiente' }
        ]
      };
      reg.showNotification(title, options);
    }catch(e){
      console.warn('showMediaNotification error', e);
    }
  }

  async function closeMediaNotification(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const reg = await navigator.serviceWorker.ready;
      const notifs = await reg.getNotifications({ tag: 'miplayer-media' });
      notifs.forEach(n => n.close());
    }catch(e){}
  }

  function proxyMediaAction(action){
    if(action === 'play') togglePlayPause();
    else if(action === 'pause') {
      try {
        const p = (videoShown && visiblePlayer && visiblePlayer.getPlayerState) ? visiblePlayer : hiddenPlayer;
        if(p && typeof p.pauseVideo === 'function') p.pauseVideo();
      }catch(e){}
    } else if(action === 'next') playNext();
    else if(action === 'prev') playPrev();
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', (ev)=>{
      const d = ev.data;
      if(!d) return;
      if(d.type === 'media-action'){
        proxyMediaAction(d.action);
      }
    });
  }

  /* =====================
     YouTube search + Player & state (completo)
     ===================== */
  let visiblePlayer = null;
  let hiddenPlayer = null;
  let playersReady = false;
  let pendingPlay = null; // {videoId, autoplay}
  let queue = [];
  let currentIndex = -1;
  let currentTrack = null;
  let isPlaying = false;
  let repeatMode = 'none';
  let shuffle = false;
  let progressTimer = null;
  let videoShown = true;

  // PROMPT INSTALL: manejador beforeinstallprompt
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    // evitar prompt automático
    e.preventDefault();
    deferredInstallPrompt = e;
    // mostrar botón instalar en UI
    const btn = document.getElementById('btnInstall');
    if(btn) btn.style.display = 'inline-flex';
  });
  // click instalar
  const installBtn = document.getElementById('btnInstall');
  if(installBtn){
    installBtn.addEventListener('click', async ()=>{
      if(!deferredInstallPrompt) return;
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if(choice && choice.outcome === 'accepted'){
          showToast('App instalada');
        } else {
          showToast('Instalación cancelada');
        }
        deferredInstallPrompt = null;
        installBtn.style.display = 'none';
      } catch(e) {
        console.warn('install prompt error', e);
      }
    });
  }

  // carga dinámica de la API de YT
  (function loadYT(){ const t = document.createElement('script'); t.src = "https://www.youtube.com/iframe_api"; document.body.appendChild(t); })();

  window.onYouTubeIframeAPIReady = function(){
    visiblePlayer = new YT.Player('ytVisible', {
      width:'100%', height:'100%',
      playerVars:{autoplay:0,controls:1,rel:0,modestbranding:1,playsinline:1},
      events:{onReady:onVisibleReady, onStateChange:onStateChange, onError:onPlayerError}
    });
    const holder = document.createElement('div'); holder.id = 'ytHiddenHolder'; holder.style.display='none'; document.getElementById('ytApiHolder').appendChild(holder);
    hiddenPlayer = new YT.Player(holder.id, {
      width:0, height:0,
      playerVars:{autoplay:0,controls:0,rel:0,modestbranding:1,playsinline:1},
      events:{onReady:onHiddenReady, onStateChange:onStateChange, onError:onPlayerError}
    });
  };

  function onVisibleReady(){ checkPlayersReady(); }
  function onHiddenReady(){ checkPlayersReady(); }
  function checkPlayersReady(){
    if(visiblePlayer && hiddenPlayer){ playersReady = true;
      if(pendingPlay){ try{ loadAndPlayById(pendingPlay.videoId, pendingPlay.autoplay); }catch(e){} pendingPlay = null; }
    }
  }

  function onStateChange(e){
    const s = e.data;
    if(s === YT.PlayerState.PLAYING){
      isPlaying = true; setPlayIcon(true); startProgressTimer(); showMini(true); spinVinyl(true);
      updateMediaSession(currentTrack || {}, true);
      showMediaNotification(currentTrack || {}, true);
    }
    else if(s === YT.PlayerState.PAUSED){
      isPlaying = false; setPlayIcon(false); stopProgressTimer(); spinVinyl(false);
      updateMediaSession(currentTrack || {}, false);
      showMediaNotification(currentTrack || {}, false);
    }
    else if(s === YT.PlayerState.ENDED){
      if(repeatMode === 'one'){ playCurrent(); } else { playNext(); }
    }
  }
  function onPlayerError(e){ console.warn('YT error', e); showToast('Error reproductor'); }

  /* robust loading: if players not ready, set pendingPlay */
  function loadAndPlayById(videoId, autoplay=true, setQueue=true, indexOverride=null){
    if(!videoId) return;
    if(setQueue && indexOverride!==null) currentIndex = indexOverride;
    currentTrack = queue[currentIndex] || {videoId, title:'', channel:'', thumb:''};
    updateNowCard(currentTrack);
    if(!playersReady){
      pendingPlay = {videoId, autoplay};
      showToast('Cargando reproductor...');
      return;
    }
    try{
      const useVisible = videoShown && visiblePlayer && typeof visiblePlayer.loadVideoById === 'function';
      if(useVisible){
        visiblePlayer.loadVideoById({videoId, startSeconds:0});
        if(autoplay) visiblePlayer.playVideo();
      } else {
        hiddenPlayer.loadVideoById({videoId, startSeconds:0});
        if(autoplay) hiddenPlayer.playVideo();
      }
    }catch(e){
      console.warn('loadAndPlay error', e);
      showToast('Error iniciar reproducción');
    }
    addRecent(currentTrack);
    saveStorage();
    updateMediaSession(currentTrack, autoplay);
    ensureNotificationPermission().then(ok => {
      if(ok) showMediaNotification(currentTrack, autoplay);
    });
  }

  function playCurrent(){ if(currentIndex<0 || currentIndex>=queue.length) return; loadAndPlayById(queue[currentIndex].videoId, true, true, currentIndex); }
  function playNext(){
    if(queue.length===0) return;
    if(shuffle) currentIndex = Math.floor(Math.random()*queue.length); else currentIndex++;
    if(currentIndex >= queue.length){
      if(repeatMode === 'all') currentIndex = 0;
      else { currentIndex = queue.length -1; stopPlayback(); return; }
    }
    playCurrent();
  }
  function playPrev(){
    try{
      const p = (videoShown && visiblePlayer && visiblePlayer.getCurrentTime) ? visiblePlayer : hiddenPlayer;
      if(p && p.getCurrentTime && p.seekTo){
        const cur = p.getCurrentTime();
        if(cur > 3){ p.seekTo(0, true); return; }
      }
    }catch(e){}
    currentIndex--;
    if(currentIndex < 0){
      if(repeatMode === 'all') currentIndex = queue.length - 1;
      else currentIndex = 0;
    }
    playCurrent();
  }
  function stopPlayback(){
    try{ visiblePlayer && visiblePlayer.stopVideo && visiblePlayer.stopVideo(); }catch(e){}
    try{ hiddenPlayer && hiddenPlayer.stopVideo && hiddenPlayer.stopVideo(); }catch(e){}
    isPlaying = false; setPlayIcon(false); stopProgressTimer(); spinVinyl(false);
    updateMediaSession(currentTrack || {}, false);
    showMediaNotification(currentTrack || {}, false);
  }
  function togglePlayPause(){ const p = (videoShown && visiblePlayer && visiblePlayer.getPlayerState) ? visiblePlayer : hiddenPlayer; if(!p || typeof p.getPlayerState !== 'function') return; const s = p.getPlayerState(); if(s === YT.PlayerState.PLAYING) p.pauseVideo(); else p.playVideo(); }
  function setPlayIcon(playing){
    $('#playIcon').innerHTML = playing ? `<path d="M6 19h4V5H6v14zM14 5v14h4V5h-4z" fill="#1b0a00"></path>` : `<path d="M5 3v18l15-9L5 3z" fill="#1b0a00"></path>`;
    const miniSvg = $('#miniPlayIcon');
    if(miniSvg) miniSvg.innerHTML = playing ? `<path d="M6 19h4V5H6v14zM14 5v14h4V5h-4z" fill="#111"></path>` : `<path d="M5 3v18l15-9L5 3z" fill="#111"></path>`;
  }
  function startProgressTimer(){ stopProgressTimer(); progressTimer = setInterval(()=>{ try{ const p = (videoShown && visiblePlayer && visiblePlayer.getCurrentTime) ? visiblePlayer : hiddenPlayer; if(!p || !p.getDuration) return; const dur = p.getDuration() || 0; const cur = p.getCurrentTime() || 0; const pct = dur > 0 ? (cur/dur)*100 : 0; $('#progressBar').style.width = pct + '%'; syncMediaPosition(); }catch(e){} }, 400); }
  function stopProgressTimer(){ if(progressTimer) clearInterval(progressTimer); progressTimer=null; }

  /* vinyl spin */
  let vinylInterval = null;
  function spinVinyl(on){
    const el = $('#vinylCover');
    if(!el) return;
    if(on){
      let angle = 0;
      if(vinylInterval) clearInterval(vinylInterval);
      vinylInterval = setInterval(()=>{ angle = (angle+0.9)%360; el.style.transform = `rotate(${angle}deg)`; }, 30);
    } else { if(vinylInterval) clearInterval(vinylInterval); vinylInterval=null; el.style.transform='rotate(0deg)'; }
  }

  /* update UI */
  function updateNowCard(track){
    if(!track) return;
    $('#nowTitle').textContent = track.title || 'No se reproduce';
    $('#nowArtist').textContent = track.channel || '—';
    if(track.thumb) $('#vinylCover').style.backgroundImage = `url('${track.thumb}')`;
    $('#miniThumb').style.backgroundImage = `url('${track.thumb || 'https://dummyimage.com/600x600/222/fff'}')`;
    $('#miniTitle').textContent = track.title || 'No se reproduce';
    $('#miniArtist').textContent = track.channel || '—';
    $('#miniPlayer').classList.remove('hidden');
  }

  /* =====================
     YouTube search with rotation
     ===================== */
  async function youtubeSearch(query, maxResults=CONFIG.YT_MAX_RESULTS){
    if(!query || !query.trim()) return [];
    const q = encodeURIComponent(query);
    for(let i=0;i<CONFIG.API_KEYS.length;i++){
      const {key, idx} = getCurrentKeyAndAdvance(i>0);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${q}&key=${key}`;
      try{
        const res = await fetch(url);
        if(!res.ok) { continue; }
        const data = await res.json();
        STORAGE.keyIndex = idx; saveStorage();
        return (data.items || []).map(it=>({
          videoId: it.id.videoId,
          title: it.snippet.title,
          channel: it.snippet.channelTitle,
          thumb: it.snippet.thumbnails?.high?.url || it.snippet.thumbnails?.default?.url
        }));
      }catch(err){ continue; }
    }
    showToast('No fue posible conectar con YouTube');
    return [];
  }

  /* =====================
     Rendering results & lists
     ===================== */
  let lastResults = [];
  function renderResults(list){
    const area = $('#listArea');
    area.innerHTML = '';
    if(!list || list.length===0){ area.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted)">Sin resultados</div>`; return; }
    list.forEach((tr,i)=>{
      const el = document.createElement('div'); el.className='song';
      const favState = STORAGE.favorites.find(f=>f.videoId===tr.videoId) ? '♥' : '♡';
      el.innerHTML = `
        <div class="thumb" style="background-image:url('${tr.thumb}')"></div>
        <div class="meta"><div class="name">${escapeHtml(tr.title)}</div><div class="sub">${escapeHtml(tr.channel)}</div></div>
        <div class="btns">
          <button class="icon-btn btn-add" title="Añadir a playlist" data-vid="${tr.videoId}"> 
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>
          </button>
          <button class="icon-btn btn-fav local" title="Favorito">${favState}</button>
          <button class="icon-btn btn-play" title="Reproducir" data-vid="${tr.videoId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 3v18l15-9L5 3z" fill="currentColor"></path></svg>
          </button>
        </div>`;
      // play when clicking row (but ignore clicks on the small buttons)
      el.addEventListener('click', (ev)=>{
        if(ev.target.closest('.btn-add') || ev.target.closest('.btn-play') || ev.target.closest('.btn-fav')) return;
        queue = list.slice(); currentIndex = i; currentTrack = queue[currentIndex];
        loadAndPlayById(currentTrack.videoId, true, true, currentIndex);
      });
      // individual play button
      el.querySelector('.btn-play').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        queue = list.slice(); currentIndex = i; currentTrack = queue[currentIndex];
        loadAndPlayById(currentTrack.videoId, true, true, currentIndex);
      });
      // add to playlist
      el.querySelector('.btn-add').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        openAddToPlaylistModal(tr);
      });
      // favorite toggle for result rows
      el.querySelector('.btn-fav').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        toggleFavorite(tr);
        const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
        if(activeTab === 'tab-list'){ renderResults(lastResults); }
        else if(activeTab === 'tab-favorites'){ renderFavorites(); }
        else if(activeTab === 'tab-recientes'){ renderRecents(); }
      });
      area.appendChild(el);
    });
  }

  // escapeHtml
  function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* =====================
     Recents / favorites / playlists
     ===================== */
  function addRecent(track){
    if(!track || !track.videoId) return;
    STORAGE.recent = STORAGE.recent.filter(t=>t.videoId !== track.videoId);
    STORAGE.recent.push(track);
    if(STORAGE.recent.length > 40) STORAGE.recent = STORAGE.recent.slice(-40);
    saveStorage();
  }
  function toggleFavorite(track){
    if(!track || !track.videoId) return;
    const ex = STORAGE.favorites.find(t=>t.videoId===track.videoId);
    if(ex) STORAGE.favorites = STORAGE.favorites.filter(t=>t.videoId!==track.videoId);
    else STORAGE.favorites.push(track);
    saveStorage(); showToast(ex ? 'Quitado de favoritos':'Añadido a favoritos');
  }
  function renderRecents(){
    const area = $('#listArea'); area.innerHTML='';
    if(!STORAGE.recent.length){ area.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted)">No hay recientes</div>`; return; }
    STORAGE.recent.slice().reverse().forEach(tr=>{
      const el = document.createElement('div'); el.className='song';
      const fav = STORAGE.favorites.find(f=>f.videoId===tr.videoId) ? '♥' : '♡';
      el.innerHTML = `<div class="thumb" style="background-image:url('${tr.thumb}')"></div>
         <div class="meta"><div class="name">${escapeHtml(tr.title)}</div><div class="sub">${escapeHtml(tr.channel)}</div></div>
         <div class="btns">
           <button class="icon-btn btn-add" title="Añadir a playlist"> 
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>
           </button>
           <button class="icon-btn btn-fav local">${fav}</button>
           <button class="icon-btn btn-remove" title="Eliminar de recientes">🗑</button>
         </div>`;
      // clicking row plays
      el.addEventListener('click', (ev)=>{ if(ev.target.closest('.btn-add')||ev.target.closest('.btn-fav')||ev.target.closest('.btn-remove')) return; queue=[tr]; currentIndex=0; currentTrack=tr; loadAndPlayById(tr.videoId, true, true, 0); });
      // add to playlist
      el.querySelector('.btn-add').addEventListener('click', (ev)=>{ ev.stopPropagation(); openAddToPlaylistModal(tr); });
      // fav toggle
      el.querySelector('.btn-fav').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleFavorite(tr); renderRecents(); });
      // remove from recents
      el.querySelector('.btn-remove').addEventListener('click', (ev)=>{ ev.stopPropagation(); STORAGE.recent = STORAGE.recent.filter(r=>r.videoId !== tr.videoId); saveStorage(); renderRecents(); showToast('Eliminado de recientes'); });
      area.appendChild(el);
    });
  }
  function renderFavorites(){
    const area = $('#listArea'); area.innerHTML='';
    if(!STORAGE.favorites.length){ area.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted)">No hay favoritos</div>`; return; }
    STORAGE.favorites.slice().reverse().forEach(tr=>{
      const el = document.createElement('div'); el.className='song';
      el.innerHTML = `<div class="thumb" style="background-image:url('${tr.thumb}')"></div>
         <div class="meta"><div class="name">${escapeHtml(tr.title)}</div><div class="sub">${escapeHtml(tr.channel)}</div></div>
         <div class="btns">
           <button class="icon-btn btn-add" title="Añadir a playlist"> 
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path></svg>
           </button>
           <button class="icon-btn btn-fav local">♥</button>
           <button class="icon-btn btn-remove" title="Eliminar de favoritos">🗑</button>
         </div>`;
      // clicking row plays
      el.addEventListener('click', (ev)=>{ if(ev.target.closest('.btn-add')||ev.target.closest('.btn-fav')||ev.target.closest('.btn-remove')) return; queue=[tr]; currentIndex=0; currentTrack=tr; loadAndPlayById(tr.videoId, true, true, 0); });
      // add to playlist
      el.querySelector('.btn-add').addEventListener('click', (ev)=>{ ev.stopPropagation(); openAddToPlaylistModal(tr); });
      // unfav toggle (remove)
      el.querySelector('.btn-fav').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleFavorite(tr); renderFavorites(); });
      // remove from favorites
      el.querySelector('.btn-remove').addEventListener('click', (ev)=>{ ev.stopPropagation(); STORAGE.favorites = STORAGE.favorites.filter(r=>r.videoId !== tr.videoId); saveStorage(); renderFavorites(); showToast('Eliminado de favoritos'); });
      area.appendChild(el);
    });
  }
  function renderPlaylistsUI(){
    const area = $('#listArea'); area.innerHTML='';
    const keys = Object.keys(STORAGE.playlists || {});
    if(keys.length===0){ area.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted)">No hay playlists</div>`; return; }
    keys.forEach(name=>{
      const pl = STORAGE.playlists[name];
      const el = document.createElement('div'); el.className='song';
      el.innerHTML = `<div class="thumb" style="background-image:url('${pl[0]?.thumb || 'https://dummyimage.com/600x600/ddd/222'}')"></div>
        <div class="meta"><div class="name">${escapeHtml(name)}</div><div class="sub">${pl.length} canciones</div></div>
        <div class="btns"><button class="icon-btn btn-open">Abrir</button><button class="icon-btn btn-delete" title="Eliminar playlist">🗑</button></div>`;
      el.querySelector('.btn-open').addEventListener('click', (ev)=>{ ev.stopPropagation(); openPlaylistView(name); });
      el.querySelector('.btn-delete').addEventListener('click', (ev)=>{ ev.stopPropagation(); showModal({title:'Confirmar', html:`<div>Eliminar playlist <b>${escapeHtml(name)}</b>?</div>`, buttons:[{label:'Cancelar'},{label:'Eliminar', onClick: ()=>{ delete STORAGE.playlists[name]; STORAGE.playlists = STORAGE.playlists || {}; saveStorage(); renderPlaylistsUI(); showToast('Eliminada'); }}]}); });
      area.appendChild(el);
    });
  }

  /* add to playlist */
  function openAddToPlaylistModal(track){
    const names = Object.keys(STORAGE.playlists || {});
    const html = `<div style="display:flex;flex-direction:column;gap:8px">
      <div style="font-weight:700">${escapeHtml(track.title)}</div>
      <div class="sub">${escapeHtml(track.channel)}</div>
      <select id="plSelect" style="padding:8px;border-radius:8px;background:#f6f9ff;border:1px solid rgba(16,24,40,0.04)">
        ${names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
      </select>
      <input id="newPlName" placeholder="O crear nueva playlist..." style="padding:8px;border-radius:8px;border:1px solid rgba(16,24,40,0.04)"/>
    </div>`;
    showModal({
      title:'Añadir a playlist',
      html,
      buttons:[
        {label:'Cancelar'},
        {label:'Añadir', onClick: ()=>{
          const newName = document.getElementById('newPlName').value.trim();
          const sel = document.getElementById('plSelect')?.value;
          const name = newName || sel;
          if(!name){ showToast('Escribe o selecciona un nombre'); return; }
          if(!STORAGE.playlists[name]) STORAGE.playlists[name] = [];
          STORAGE.playlists[name].push(track); saveStorage(); showToast('Añadido a '+name);
        }}
      ]
    });
  }

  function openPlaylistView(name){
    const list = STORAGE.playlists[name] || [];
    const html = `<div style="max-height:320px;overflow:auto">
      ${list.map((t, i)=>`
        <div data-i="${i}" class="pl-row" style="display:flex;gap:8px;padding:8px;align-items:center;cursor:pointer">
          <div class="pl-thumb" style="background-image:url('${t.thumb}');background-size:cover"></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700">${escapeHtml(t.title)}</div>
            <div class="sub">${escapeHtml(t.channel)}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="icon-btn btn-play-pl" data-i="${i}" title="Reproducir">▶</button>
            <button class="icon-btn btn-remove-pl" data-i="${i}" title="Eliminar">🗑</button>
          </div>
        </div>`).join('')}
    </div>`;
    showModal({
      title:'Playlist: '+name,
      html,
      buttons:[
        {label:'Cerrar'},
        {label:'Eliminar', onClick: ()=>{
          showModal({title:'Confirmar', html:`<div>Eliminar playlist <b>${escapeHtml(name)}</b>?</div>`, buttons:[
            {label:'Cancelar'}, {label:'Eliminar', onClick: ()=>{ delete STORAGE.playlists[name]; STORAGE.playlists = STORAGE.playlists || {}; saveStorage(); renderPlaylistsUI(); showToast('Eliminada'); }}
          ]});
        }}
      ]
    });
    setTimeout(()=>{
      document.querySelectorAll('.pl-row').forEach((r)=>{
        r.addEventListener('click', ()=>{
          const i = parseInt(r.dataset.i, 10);
          queue = STORAGE.playlists[name].slice();
          currentIndex = i;
          currentTrack = queue[currentIndex];
          playCurrent();
          closeModal();
        });
      });
      document.querySelectorAll('.btn-play-pl').forEach(b=>{
        b.addEventListener('click', (ev)=>{ ev.stopPropagation(); const i = parseInt(b.dataset.i,10); queue = STORAGE.playlists[name].slice(); currentIndex = i; currentTrack = queue[currentIndex]; playCurrent(); closeModal(); });
      });
      document.querySelectorAll('.btn-remove-pl').forEach(b=>{
        b.addEventListener('click', (ev)=>{ ev.stopPropagation(); const i = parseInt(b.dataset.i,10); STORAGE.playlists[name].splice(i,1); saveStorage(); openPlaylistView(name); showToast('Canción eliminada'); });
      });
    }, 60);
  }

  /* create playlist */
  $('#btnCreatePL').addEventListener('click', ()=>{
    showModal({
      title:'Crear playlist',
      html:`<input id="plNameInput" placeholder="Nombre playlist" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(16,24,40,0.04)"/>`,
      buttons:[
        {label:'Cancelar'},
        {label:'Crear', onClick: ()=>{ const nm = $('#plNameInput').value.trim(); if(!nm){ showToast('Nombre requerido'); return; } if(STORAGE.playlists[nm]){ showToast('Ya existe'); return; } STORAGE.playlists[nm]=[]; saveStorage(); renderPlaylistsUI(); showToast('Creada'); }}
      ]
    });
  });

  /* =====================
     Events & behaviors
     ===================== */
  $('#searchBtn').addEventListener('click', onSearch);
  $('#searchInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') onSearch(); });
  $('#playBtn').addEventListener('click', togglePlayPause);
  $('#miniPlay').addEventListener('click', togglePlayPause);
  $('#prevBtn').addEventListener('click', playPrev);
  $('#nextBtn').addEventListener('click', playNext);
  $('#miniPrev').addEventListener('click', playPrev);
  $('#miniNext').addEventListener('click', playNext);
  $('#shuffleBtn').addEventListener('click', ()=>{ shuffle = !shuffle; $('#shuffleBtn').style.opacity = shuffle ? 1 : 0.6; showToast('Aleatorio: '+(shuffle?'ON':'OFF')); });
  $('#repeatBtn').addEventListener('click', ()=>{ repeatMode = repeatMode==='none'?'all':repeatMode==='all'?'one':'none'; $('#repeatBtn').style.opacity = repeatMode==='none'?0.6:1; showToast('Repetir: '+repeatMode); });

  /* minimize */
  function minimize(){ $('#leftCard').classList.add('hidden'); $('#miniPlayer').classList.remove('hidden'); showToast('Minimizado — reproducción continúa'); }
  $('#minimizeBtn').addEventListener('click', minimize);
  $('#btnMinimize').addEventListener('click', minimize);
  $('#miniPlayer').addEventListener('click', ()=>{ $('#leftCard').classList.remove('hidden'); $('#miniPlayer').classList.add('hidden'); });

  /* queue modal */
  $('#btnQueue').addEventListener('click', ()=>{
    if(!queue || !queue.length) return showToast('Cola vacía');
    const html = `<div style="max-height:380px;overflow:auto">${queue.map((t,i)=>`<div data-i="${i}" class="queue-row" style="display:flex;gap:8px;padding:8px;align-items:center;cursor:pointer"><div style="width:44px;height:44px;background-image:url('${t.thumb}');background-size:cover;border-radius:8px"></div><div style="flex:1"><div style="font-weight:700">${escapeHtml(t.title)}</div><div class="sub">${escapeHtml(t.channel)}</div></div><div style="width:48px;text-align:center">${i===currentIndex?'<small>▶</small>':''}</div></div>`).join('')}</div>`;
    showModal({title:'Cola', html, buttons:[{label:'Cerrar'}]});
    setTimeout(()=>{
      document.querySelectorAll('.queue-row').forEach(r=>{
        r.addEventListener('click', ()=>{
          const i = parseInt(r.dataset.i, 10);
          currentIndex = i;
          playCurrent();
          closeModal();
        });
      });
    }, 60);
  });

  /* video toggle */
  $('#btnVideoToggle').addEventListener('click', ()=>{
    videoShown = !videoShown;
    $('#videoBox').style.display = videoShown ? 'block' : 'none';
    if(currentTrack){
      try{
        const cur = (visiblePlayer && visiblePlayer.getCurrentTime) ? visiblePlayer.getCurrentTime() : 0;
        if(!videoShown && hiddenPlayer && hiddenPlayer.loadVideoById){ hiddenPlayer.loadVideoById({videoId: currentTrack.videoId, startSeconds: cur}); hiddenPlayer.playVideo(); visiblePlayer && visiblePlayer.stopVideo && visiblePlayer.stopVideo(); }
        if(videoShown && visiblePlayer && visiblePlayer.loadVideoById){ visiblePlayer.loadVideoById({videoId: currentTrack.videoId, startSeconds: cur}); visiblePlayer.playVideo(); hiddenPlayer && hiddenPlayer.stopVideo && hiddenPlayer.stopVideo(); }
      }catch(e){}
    }
  });

  /* fullscreen */
  $('#btnFullScreen').addEventListener('click', ()=>{
    try{
      let iframe = null;
      if(visiblePlayer && typeof visiblePlayer.getIframe === 'function') iframe = visiblePlayer.getIframe();
      if(iframe){
        if(iframe.requestFullscreen) iframe.requestFullscreen();
        else if(iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
        else window.open('https://www.youtube.com/watch?v=' + (currentTrack?.videoId || ''), '_blank');
      }else{
        if(currentTrack && currentTrack.videoId) window.open('https://www.youtube.com/watch?v=' + currentTrack.videoId, '_blank');
      }
    }catch(e){
      if(currentTrack && currentTrack.videoId) window.open('https://www.youtube.com/watch?v=' + currentTrack.videoId, '_blank');
    }
  });

  /* search: does not autoplay first result */
  async function onSearch(){
    const q = $('#searchInput').value.trim();
    if(!q){ showToast('Escribe para buscar'); return; }
    $('#rightPanel').classList.add('search-active');
    const res = await youtubeSearch(q, CONFIG.YT_MAX_RESULTS);
    lastResults = res;
    if(res.length > 0){
      renderResults(res);
    } else {
      $('#listArea').innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted)">No se encontraron resultados</div>`;
    }
    $('#searchInput').value = '';
    setTimeout(()=>{ $('#rightPanel').classList.remove('search-active'); }, 700);
  }

  /* tabs */
  $$('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      $$('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const id = t.dataset.tab;
      if(id === 'tab-list'){ renderResults(lastResults.length ? lastResults : []); }
      else if(id === 'tab-recientes'){ renderRecents(); }
      else if(id === 'tab-favorites'){ renderFavorites(); }
      else if(id === 'tab-playlists'){ renderPlaylistsUI(); }
    });
  });

  /* initial renders */
  function renderAll(){ renderRecents(); renderPlaylistsUI(); }
  renderAll();

  document.addEventListener('click', (e)=>{ if(!e.target.closest('.search-box')) $('#rightPanel').classList.remove('search-active'); });

  showToast('Listo — busca y toca una fila para reproducir');

  window._mp = {STORAGE, saveStorage, queue};

  /* Visibility handling */
  document.addEventListener('visibilitychange', async ()=>{
    try{
      if(document.hidden){
        if(visiblePlayer && visiblePlayer.getPlayerState && visiblePlayer.getPlayerState() === YT.PlayerState.PLAYING){
          const cur = visiblePlayer.getCurrentTime ? visiblePlayer.getCurrentTime() : 0;
          const vid = currentTrack?.videoId;
          if(vid && hiddenPlayer && hiddenPlayer.loadVideoById){
            hiddenPlayer.loadVideoById({videoId:vid, startSeconds: cur});
            hiddenPlayer.playVideo && hiddenPlayer.playVideo();
            visiblePlayer.stopVideo && visiblePlayer.stopVideo();
          }
        }
      } else {
        if(hiddenPlayer && hiddenPlayer.getPlayerState && hiddenPlayer.getPlayerState() === YT.PlayerState.PLAYING){
          const cur = hiddenPlayer.getCurrentTime ? hiddenPlayer.getCurrentTime() : 0;
          const vid = currentTrack?.videoId;
          if(vid && visiblePlayer && visiblePlayer.loadVideoById){
            visiblePlayer.loadVideoById({videoId:vid, startSeconds: cur});
            visiblePlayer.playVideo && visiblePlayer.playVideo();
            hiddenPlayer.stopVideo && hiddenPlayer.stopVideo();
          }
        }
      }
    }catch(e){ console.warn('visibility transfer error', e); }
  });

  /* helper showMini */
  function showMini(show=true){ if(show) $('#miniPlayer').classList.remove('hidden'); else $('#miniPlayer').classList.add('hidden'); }

  /* =====================
     MEDIA POSITION SYNC (Media Session positionState)
     ===================== */
  function syncMediaPosition(){
    try{
      if(!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
      const p = (videoShown && visiblePlayer && visiblePlayer.getCurrentTime) ? visiblePlayer : hiddenPlayer;
      if(!p || !p.getDuration || !p.getCurrentTime) return;
      const duration = p.getDuration() || 0;
      const position = p.getCurrentTime() || 0;
      if(isFinite(duration) && duration > 0){
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: position
        });
      }
    }catch(e){}
  }

}); // DOMContentLoaded end

/* =====================
   Registro del Service Worker
   ===================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      console.log('Service Worker registrado:', reg.scope);
    }).catch(function(err) {
      console.warn('Service Worker registro falló:', err);
    });
  });
}
