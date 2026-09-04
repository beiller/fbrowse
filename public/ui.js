

/*
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
CONFIG
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
*/


let currentPath = '/';
let files = [];
let currentIndex = -1;
let filterType = null;
let enableFullscreen = false;
let enableLoop = true;
let imgSlideshowDelay = 5000;
let skipImages = true;
let playDirection = 1;
let imgSlideshowTimer = null;
let controlsVisible = false;
let controlsHideTimer = null;
const CONTROLS_HIDE_DELAY = 3000;
const autoFullscreenCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;


/*
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
*/


const setFilterType = (newval) => { filterType = newval }
const getFilterType = () => filterType
const setEnableFullscreen = (newval) => { enableFullscreen = newval }
const getEnableFullscreen = () => enableFullscreen

const loadDelays = new WeakMap();

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        const el = entry.target;

        if (entry.isIntersecting) {
            // Already scheduled? Do nothing
            if (loadDelays.has(el)) return;

            const timeoutId = setTimeout(() => {
                const src = el.getAttribute('data-src');
                if (src) {
                    const tag = el.getAttribute('data-tag');
                    const el2 = document.createElement(tag)
                    
                    el2.onload = (e) => {
                        // console.log('width', e.target.width)
                        // console.log('height', e.target.height)
                        //el.style.width = Math.min(e.target.width+'px';
                        el.style.height = e.target.getBoundingClientRect().height+'px';
                    }
                    el2.onerror = () => {
                        if (el.dataset.retried) return;
                        el.dataset.retried = '1';
                        setTimeout(() => {
                            el.innerHTML = '';
                            const img = document.createElement('img');
                            img.src = src + '&r=1';
                            el.appendChild(img);
                        }, 2000);
                    }
		    if(el2.tagName === 'VIDEO') {
		    } else {
                    	el2.src = src;
		    }
                    el.appendChild(el2);
                    //el.removeAttribute('data-src');
                }
                loadDelays.delete(el);
                // DO NOT unobserve here — we now want to track if it scrolls out
            }, 500);

            loadDelays.set(el, timeoutId);
        } else {
            // Cancel delayed load if it was pending
            const timeoutId = loadDelays.get(el);
            if (timeoutId) {
                clearTimeout(timeoutId);
                loadDelays.delete(el);
                return;
            }

            // If already loaded, unload the media
            if (el.firstChild) {
                //el.setAttribute('data-src', el.src);
                el.removeAttribute('src');
                if (el.firstChild.tagName === 'VIDEO') {
                    el.firstChild.load(); // unload video buffer
                }
                el.innerHTML = '';
            }
        }
    });
}, {
    rootMargin: "200px"
});


function renderToolbar() {
    const crumb = document.getElementById('crumb');
    const label = currentPath === '/' ? '\ud83d\udcc1 /' : '\ud83d\udcc1 ' + currentPath;
    crumb.textContent = label;
    crumb.title = currentPath;
    document.getElementById('upBtn').disabled = currentPath === '/';
    const fB = document.getElementById('fBtn'), vB = document.getElementById('vBtn'), iB = document.getElementById('iBtn');
    fB.classList.toggle('active', !inFavMode && !inPlaylistMode && filterType === null);
    vB.classList.toggle('active', !inFavMode && !inPlaylistMode && filterType === isVideo);
    iB.classList.toggle('active', !inFavMode && !inPlaylistMode && filterType === isImage);
    document.getElementById('favBtn').classList.toggle('active', inFavMode);
    document.getElementById('playBtn').classList.toggle('active', inPlaylistMode);
}


function fetchList(path) {
    fetch(`/list?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            currentPath = data.currentPath;
            files = data.files.map(f => ({ ...f, id: pathJoin(currentPath, f.name) }));
            renderGrid();
            renderToolbar();
        });
}
let inFavMode = false;
let inPlaylistMode = false;
let playlistName = null;

function toggleFavouriteView() {
    if (!inFavMode) {
        inPlaylistMode = false;
        playlistName = null;
        inFavMode = true;
        fetch('/scored')
            .then(res => res.json())
            .then(data => {
                files = data.files.map(f => ({ ...f, id: f.path }));
                renderGrid();
                renderToolbar();
            });
    } else {
        inFavMode = false;
        fetchList(currentPath);
    }
}

document.getElementById('favBtn').onclick = toggleFavouriteView;

function togglePlayPause() {
    const v = getHTMLVideoElement();
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
    setControlsVisible(true);
}

function scheduleControlsHide() {
    if (controlsHideTimer) clearTimeout(controlsHideTimer);
    controlsHideTimer = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
}

function setControlsVisible(show) {
    const c = document.querySelector('.controls');
    if (!c) return;
    controlsVisible = show;
    c.classList.toggle('hidden', !show);
    const pb = document.querySelector('.plpick-fsbtn');
    if (pb) pb.classList.toggle('hidden', !show);
    if (show) { scheduleControlsHide(); }
    else if (controlsHideTimer) { clearTimeout(controlsHideTimer); controlsHideTimer = null; }
}

function onOverlayClick(e) {
    if (e.target.closest && e.target.closest('.controls')) return;
    if (e.target.closest && e.target.closest('button')) return;
    const mc = e.target.closest && e.target.closest('.media-container');
    if (mc) {
        const v = getHTMLVideoElement();
        if (v) { togglePlayPause(); }
        else { next(); }
        return;
    }
    setControlsVisible(!controlsVisible);
}

function onActivity() {
    if (controlsVisible) scheduleControlsHide();
}

function fileDirOf(f) {
    if (inPlaylistMode || inFavMode) return pathJoin('/', f.id.split('/').slice(0, -1).join('/'));
    return currentPath;
}


function renderGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    files.forEach((f, i) => {
        const el = document.createElement('div');
        const fileDir = fileDirOf(f);
        if (getFilterType() && !getFilterType()(f.name)) return;
        if (f.type === 1 && !inFavMode) {
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            thumb.textContent = `📁 ${f.name}`;
            thumb.onclick = () => fetchList(pathJoin(fileDir, f.name));
            el.appendChild(thumb);

        } else if ((inFavMode || inPlaylistMode) && !isMedia(f.name)) {
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            thumb.textContent = `${f.name} (missing?)`;
            el.appendChild(thumb);

        } else if (isMedia(f.name)) {
            const mediaUrl = `/media${pathJoin(fileDir, f.name)}`;
            //const tag = isImage(f.name) ? 'img' : 'video';
            const tag = 'div'
            const thumb = document.createElement(tag);
            if (isVideo(f.name)) {
                thumb.setAttribute('data-src', `/thumb?path=${encodeURIComponent(pathJoin(fileDir, f.name))}`);
            } else {
                thumb.setAttribute('data-src', mediaUrl);
            }
            thumb.setAttribute('data-tag', 'img');
            thumb.className = 'thumb';
            if (inPlaylistMode) {
                const idx = playlistItems.findIndex(p => p.id === f.id);
                if (idx >= 0) { thumb.draggable = true; thumb.dataset.idx = String(idx); }
            }
            thumb.onclick = () => openFullscreen(i);
            el.appendChild(thumb);
            observer.observe(thumb);
            addVoteUI(el, f, pathJoin(fileDir, f.name));
            if (inPlaylistMode) {
                const idx = playlistItems.findIndex(p => p.id === f.id);
                if (idx >= 0) addRemoveFromPlaylistUI(el, idx);
            } else {
                addAddToPlaylistUI(el, pathJoin(fileDir, f.name));
            }
        }
        if (el.childNodes.length > 0) grid.appendChild(el);
    });
}

function isImage(name) {
    return name.match(/\.(jpg|jpeg|png|gif)$/i);
}

function isVideo(name) {
    return name.match(/\.(mp4|webm|mov)$/i);
}

function isMedia(name) {
    return isImage(name) || isVideo(name);
}

function pathJoin(p1, p2) {
    return (p1 + '/' + p2).replace(/\/+/g, '/');
}


function nextVoteState(cur, v) {
    const s = { up: cur.up || 0, down: cur.down || 0, my: cur.my || 0 };
    if (v === 0) {
        if (s.my > 0) s.up -= s.my;
        else if (s.my < 0) s.down += s.my;
        s.my = 0;
    } else {
        if (s.my > 0) s.up--;
        else if (s.my < 0) s.down--;
        if (v === 1) s.up++; else s.down++;
        s.my = v;
    }
    return s;
}


function paintVotes(el, f) {
    const my = f.my || 0;
    el._voteUp.classList.toggle('active', my > 0);
    el._voteDown.classList.toggle('active', my < 0);
    el._voteUp.textContent = '\u25b2' + (my > 0 ? '\u00d7' + my : '');
    el._voteDown.textContent = '\u25bc' + (my < 0 ? '\u00d7' + -my : '');
    const net = (f.up || 0) - (f.down || 0);
    el._voteScore.textContent = net > 0 ? '+' + net : String(net);
    el._voteScore.classList.toggle('show', net !== 0);
}


function resortFiles() {
    files.sort((a, b) => ((b.up - b.down) - (a.up - a.down)) || (a.modified - b.modified) * -1.0);
}


function castVote(f, v, el) {
    const key = el._voteKey;
    const prev = { up: f.up || 0, down: f.down || 0, my: f.my || 0 };
    const next = nextVoteState(prev, v);
    Object.assign(f, next);
    paintVotes(el, f);
    fetch('/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: key, v })
    }).then(r => r.json()).then(data => {
        Object.assign(f, data);
        if (inFavMode) { resortFiles(); renderGrid(); } else { paintVotes(el, f); }
    }).catch(() => {
        Object.assign(f, prev);
        if (inFavMode) { resortFiles(); renderGrid(); } else { paintVotes(el, f); }
        alert('Vote failed');
    });
}


function addVoteUI(el, f, key) {
    const box = document.createElement('div');
    box.className = 'votebox';
    const upB = document.createElement('button');
    upB.className = 'up';
    upB.textContent = '\u25b2';
    const downB = document.createElement('button');
    downB.className = 'down';
    downB.textContent = '\u25bc';
    upB.onclick = (e) => { e.stopPropagation(); castVote(f, 1, el); };
    downB.onclick = (e) => { e.stopPropagation(); castVote(f, -1, el); };
    box.appendChild(upB);
    box.appendChild(downB);
    const score = document.createElement('div');
    score.className = 'votescore';
    el.appendChild(box);
    el.appendChild(score);
    el._voteKey = key;
    el._voteUp = upB;
    el._voteDown = downB;
    el._voteScore = score;
    paintVotes(el, f);
}


const playbackEnded = (e) => {
    const t = e.target;
    if (t.tagName === 'IMG') {
        next();
        return;
    }
    next();
}

function getHTMLVideoElement() {
    return document.querySelector('.media-container video');
}

function openFullscreen(index) {
    requestWakeLock();
    currentIndex = index;
    const file = files[currentIndex];
    const fileDir = fileDirOf(file);
    const container = document.querySelector('.media-container');
    let el = null;
    if (container.firstChild && container.firstChild.tagName == "VIDEO" && isVideo(file.name)) {
        el = container.firstChild
    }
    else if (container.firstChild && container.firstChild.tagName == "IMG" && isImage(file.name)) {
        el = container.firstChild;
    } else {
        el = isImage(file.name) ? document.createElement('img') : document.createElement('video');
        if (el.tagName === 'VIDEO') {
            el.addEventListener("ended", playbackEnded, false);
        }
        container.innerHTML = '';
        container.appendChild(el);
    }
    if (imgSlideshowTimer !== null) {
        clearTimeout(imgSlideshowTimer);
        imgSlideshowTimer = null;
    }
    el.src = `/media${pathJoin(fileDir, file.name)}`;
    if (el.tagName === 'VIDEO') {
        el.controls = false;
        el.loop = playDirection === 1;
        el.autoplay = true;
    } else if (el.tagName === 'IMG') {
        imgSlideshowTimer = setTimeout(() => {
            playbackEnded({ target: el });
        }, imgSlideshowDelay)
    }

    if (!inPlaylistMode) {
        const plb = document.createElement('button');
        plb.className = 'plpick-fsbtn';
        plb.textContent = '+\u2615';
        plb.title = 'Add to playlist';
        plb.onclick = (e) => { e.stopPropagation(); openPlaylistPicker(pathJoin(fileDir, file.name), plb); };
        container.appendChild(plb);
    }

    const rb = document.getElementById('repeatBtn');
    if (rb) rb.classList.toggle('active', playDirection === 1);
    document.getElementById('fullscreen').style.display = 'flex';
    setControlsVisible(true);
    if (enableFullscreen || autoFullscreenCoarse) {
        const p = document.getElementById('fullscreen').requestFullscreen();
        if (p && p.catch) p.catch(() => {});
    }
}
function exitFullscreenMode() {
    const container = document.querySelector('.media-container');
    container.innerHTML = '';
    if (imgSlideshowTimer !== null) { clearTimeout(imgSlideshowTimer); imgSlideshowTimer = null; }
    setControlsVisible(false);
    document.getElementById('fullscreen').style.display = 'none';
    currentIndex = -1;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    releaseWakeLock();
}

function next() {
    for (let i = currentIndex + 1; i < files.length; i++) {
        if (!isMedia(files[i].name)) continue;
        if (skipImages && isImage(files[i].name)) continue;
        return openFullscreen(i);
    }
    if (enableLoop) {
        for (let i = 0; i < files.length; i++) {
            if (!isMedia(files[i].name)) continue;
            if (skipImages && isImage(files[i].name)) continue;
            return openFullscreen(i);
        }
    }
}

function prev() {
    for (let i = currentIndex - 1; i >= 0; i--) {
        if (!isMedia(files[i].name)) continue;
        if (skipImages && isImage(files[i].name)) continue;
        return openFullscreen(i);
    }
    if (enableLoop) {
        for (let i = files.length - 1; i >= 0; i--) {
            if (!isMedia(files[i].name)) continue;
            if (skipImages && isImage(files[i].name)) continue;
            return openFullscreen(i);
        }
    }
}

document.getElementById('upBtn').onclick = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchList('/' + parts.join('/'));
};

const exitSpecialViews = () => {
    inFavMode = false;
    inPlaylistMode = false;
    playlistName = null;
};

document.getElementById('vBtn').onclick = () => {
    exitSpecialViews();
    setFilterType(isVideo);
    renderGrid();
    renderToolbar();
};


document.getElementById('iBtn').onclick = () => {
    exitSpecialViews();
    setFilterType(isImage);
    renderGrid();
    renderToolbar();
};


document.getElementById('fBtn').onclick = () => {
    exitSpecialViews();
    setFilterType(null);
    renderGrid();
    renderToolbar();
};

const toggleForwardsRepeat = () => {
    playDirection = playDirection === 1 ? 0 : 1;
    const b = document.getElementById('repeatBtn');
    if (b) b.classList.toggle('active', playDirection === 1);
    const v = getHTMLVideoElement();
    if (v) v.loop = playDirection === 1;
}

const toggleSkipImages = () => {
    skipImages = !skipImages
}

const fsEl = document.getElementById('fullscreen');
fsEl.addEventListener('click', onOverlayClick);
fsEl.addEventListener('mousemove', onActivity);
fsEl.addEventListener('touchmove', onActivity, { passive: true });
let fsTouchStart = null;
fsEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) fsTouchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
fsEl.addEventListener('touchend', (e) => {
    if (!fsTouchStart) return;
    const t = e.changedTouches[0];
    const moved = Math.hypot(t.clientX - fsTouchStart.x, t.clientY - fsTouchStart.y);
    fsTouchStart = null;
    if (moved > 15) return;
    const fake = { target: document.elementFromPoint(t.clientX, t.clientY) || fsEl };
    if (fake.target.closest && fake.target.closest('.controls')) return;
    if (fake.target.closest && fake.target.closest('button')) return;
    const mc = fake.target.closest && fake.target.closest('.media-container');
    if (mc) {
        const v = getHTMLVideoElement();
        if (v) { togglePlayPause(); }
        else { next(); }
        return;
    }
    setControlsVisible(!controlsVisible);
}, { passive: true });

document.addEventListener('keydown', (e) => {
    if (document.getElementById('fullscreen').style.display !== 'flex') return;
    switch (e.key) {
        case 'Escape': exitFullscreenMode(); break;
        case 'ArrowLeft': prev(); break;
        case 'ArrowRight': next(); break;
        case ' ': e.preventDefault(); togglePlayPause(); break;
    }
});

document.getElementById('playBtn').onclick = () => {
    if (inPlaylistMode) {
        inPlaylistMode = false;
        playlistName = null;
        fetchList(currentPath);
    } else {
        openPlaylistPicker(null, null);
    }
    renderToolbar();
};


let playlistItems = [];

function enterPlaylist(name) {
    fetch('/playlists')
        .then(r => r.json())
        .then(data => {
            const p = data.playlists.find(x => x.name === name);
            if (!p) return;
            inFavMode = false;
            inPlaylistMode = true;
            playlistName = name;
            setFilterType(null);
            playlistItems = p.files.map(rel => ({ id: rel, name: rel.split('/').pop() }));
            files = playlistItems.slice();
            renderGrid();
            renderToolbar();
        });
}


function addAddToPlaylistUI(el, key) {
    const b = document.createElement('button');
    b.className = 'pladd';
    b.textContent = '+';
    b.onclick = (e) => { e.stopPropagation(); openPlaylistPicker(key, b); };
    el.appendChild(b);
}


function addRemoveFromPlaylistUI(el, idx) {
    const b = document.createElement('button');
    b.className = 'plrem';
    b.textContent = '\u2715';
    b.onclick = (e) => { e.stopPropagation(); removeFromPlaylist(playlistName, playlistItems[idx].id); };
    el.appendChild(b);
}


function removeFromPlaylist(name, rel) {
    fetch('/playlists/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: rel })
    }).then(r => r.json()).then(data => {
        playlistItems = data.files.map(rel2 => ({ id: rel2, name: rel2.split('/').pop() }));
        files = playlistItems.slice();
        renderGrid();
    });
}


function addToPlaylist(name, rel) {
    fetch('/playlists/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: rel })
    }).then(r => r.json()).then(data => {
        if (inPlaylistMode && playlistName === name) {
            playlistItems = data.files.map(rel2 => ({ id: rel2, name: rel2.split('/').pop() }));
            files = playlistItems.slice();
            renderGrid();
        }
    });
}


function openPlaylistPicker(targetRel, targetEl) {
    const isDrop = !!targetRel;
    const ov = document.createElement('div');
    ov.className = 'plpick-ov' + (isDrop ? ' plpick-ov-drop' : '');
    const box = document.createElement('div');
    box.className = 'plpick-box';
    const title = document.createElement('div');
    title.className = 'plpick-title';
    title.textContent = targetRel ? 'Add to playlist' : 'Playlists';
    box.appendChild(title);
    const list = document.createElement('div');
    list.className = 'plpick-list';
    box.appendChild(list);
    const row = document.createElement('div');
    row.className = 'plpick-row';
    const inp = document.createElement('input');
    inp.placeholder = 'New playlist name';
    const createB = document.createElement('button');
    createB.textContent = 'Create';
    createB.onclick = () => {
        const n = inp.value.trim();
        if (!n) return;
        fetch('/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
            .then(r => r.json()).then(() => {
                inp.value = '';
                renderList();
                if (targetRel) addToPlaylist(n, targetRel);
            }).catch(async () => {
                let msg = 'Could not create playlist';
                try {
                    const d = await fetch('/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) }).then(r => r.json());
                    if (d.error) msg = 'Could not create playlist: ' + d.error;
                } catch (e) {}
                alert(msg);
            });
    };
    row.appendChild(inp);
    row.appendChild(createB);
    box.appendChild(row);
    const closeB = document.createElement('button');
    closeB.className = 'plpick-close';
    closeB.textContent = 'Close';
    closeB.onclick = () => ov.remove();
    box.appendChild(closeB);
    ov.appendChild(box);
    ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
    if (isDrop) {
        const r = targetEl.getBoundingClientRect();
        const bw = box.offsetWidth, bh = box.offsetHeight;
        let left = Math.min(r.right - bw, window.innerWidth - bw - 8);
        left = Math.max(8, left);
        let top = r.bottom + 4;
        if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - 4);
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        const cleanup = () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onDown);
        };
        const onKey = (e) => { if (e.key === 'Escape') { cleanup(); ov.remove(); } };
        const onDown = (e) => { if (!box.contains(e.target)) { cleanup(); ov.remove(); } };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
    }

    function renderList() {
        list.innerHTML = '';
        fetch('/playlists').then(r => r.json()).then(data => {
            for (const p of data.playlists) {
                const item = document.createElement('div');
                item.className = 'plpick-item';
                const nm = document.createElement('span');
                nm.textContent = p.name + ' (' + p.files.length + ')';
                nm.onclick = () => { ov.remove(); enterPlaylist(p.name); };
                const addB = document.createElement('button');
                addB.textContent = '+';
                addB.disabled = !targetRel || p.files.includes(targetRel);
                addB.onclick = () => addToPlaylist(p.name, targetRel);
                const delB = document.createElement('button');
                delB.textContent = 'del';
                delB.onclick = () => {
                    if (!confirm('Delete playlist ' + p.name + '?')) return;
                    fetch('/playlists?name=' + encodeURIComponent(p.name), { method: 'DELETE' })
                        .then(r => r.json()).then(renderList);
                };
                item.appendChild(nm);
                item.appendChild(addB);
                item.appendChild(delB);
                list.appendChild(item);
            }
        });
    }
    renderList();
}


const gridEl = document.getElementById('grid');
let dragIdx = null;

gridEl.addEventListener('dragstart', (e) => {
    const t = e.target.closest && e.target.closest('.thumb[data-idx]');
    if (!t) return;
    dragIdx = parseInt(t.dataset.idx);
    e.dataTransfer.effectAllowed = 'move';
});

gridEl.addEventListener('dragover', (e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    const t = e.target.closest && e.target.closest('.thumb[data-idx]');
    if (!t) return;
    const r = t.getBoundingClientRect();
    const before = (e.clientX - r.left) < r.width / 2;
    t.classList.toggle('drop-before', before);
    t.classList.toggle('drop-after', !before);
});

gridEl.addEventListener('dragleave', (e) => {
    const t = e.target.closest && e.target.closest('.thumb');
    if (t) t.classList.remove('drop-before', 'drop-after');
});

gridEl.addEventListener('drop', (e) => {
    if (dragIdx === null) return;
    e.preventDefault();
    const from = dragIdx;
    dragIdx = null;
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('drop-before', 'drop-after'));
    const t = e.target.closest && e.target.closest('.thumb[data-idx]');
    if (!t) return;
    let to = parseInt(t.dataset.idx);
    const r = t.getBoundingClientRect();
    if ((e.clientX - r.left) >= r.width / 2) to++;
    if (from < to) to--;
    if (to === from) return;
    const a = playlistItems.splice(from, 1)[0];
    playlistItems.splice(to, 0, a);
    files = playlistItems.slice();
    renderGrid();
    fetch('/playlists/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playlistName, from, to })
    }).catch(() => enterPlaylist(playlistName));
});


fetchList('/');


// The wake lock sentinel.
let wakeLock = null;

// Function that attempts to request a wake lock.
const requestWakeLock = async () => {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      console.log('Wake Lock was released');
    });
    console.log('Wake Lock is active');
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
};

// Function that attempts to release the wake lock.
const releaseWakeLock = async () => {
  if (!wakeLock) {
    return;
  }
  try {
    await wakeLock.release();
    wakeLock = null;
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
};    
