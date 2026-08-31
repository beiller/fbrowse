

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
let playDirection = 0;
let imgSlideshowTimer = null;


/*
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
*/


window.localStorage.removeItem('');
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


function fetchList(path) {
    fetch(`/list?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(data => {
            currentPath = data.currentPath;
            files = data.files.map(f => ({ ...f, id: pathJoin(currentPath, f.name) }));
            renderGrid();
        });
}
let inFavMode = false;

function toggleFavouriteView() {
    if (!inFavMode) {
        inFavMode = true;
        fetch('/scored')
            .then(res => res.json())
            .then(data => {
                files = data.files.map(f => ({ ...f, id: f.path }));
                renderGrid();
            });
    } else {
        inFavMode = false;
        fetchList(currentPath);
    }
}

function playpauseVideoTap(click) {
    let thumb = click.target;
    console.log(thumb);
    if (thumb.paused) {
        thumb.play()
    } else {
        thumb.pause()
    }
}

function renderGrid() {
    const grid = document.getElementById('grid');
    grid.innerHTML = '';
    files.forEach((f, i) => {
        const el = document.createElement('div');
        const fileDir = inFavMode ? pathJoin('/', f.id.split('/').slice(0, -1).join('/')) : currentPath;
        if (getFilterType() && !getFilterType()(f.name)) return;
        if (f.type === 1 && !inFavMode) {
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            thumb.textContent = `📁 ${f.name}`;
            thumb.onclick = () => fetchList(pathJoin(fileDir, f.name));
            el.appendChild(thumb);

        } else if (inFavMode && !isMedia(f.name)) {
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
            thumb.onclick = () => openFullscreen(i);
            el.appendChild(thumb);
            observer.observe(thumb);
            addVoteUI(el, f, pathJoin(fileDir, f.name));
        }
        grid.appendChild(el);
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
        if (v === 1) {
            if (s.my < 0) s.down--; else s.up++;
        } else {
            if (s.my > 0) s.up--; else s.down++;
        }
        s.my += v;
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
        paintVotes(el, f);
    }).catch(() => {
        Object.assign(f, prev);
        paintVotes(el, f);
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
    console.log("ended");
    if (playDirection == 1) {
        e.target.removeEventListener("ended", playbackEnded);
        next();
    } else if(playDirection == -1) {
        e.target.removeEventListener("ended", playbackEnded);
        prev();
    } else {
        try {
            e.target.play()
        } catch(e) {
            console.error(e);
        }
    }
}

function getHTMLVideoElement() {
    return document.querySelector('.media-container video');
}

function openFullscreen(index) {
    requestWakeLock();
    currentIndex = index;
    const file = files[currentIndex];
    const fileDir = inFavMode ? pathJoin('/', file.id.split('/').slice(0, -1).join('/')) : currentPath;
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
    el._file = file;
    el.src = `/media${pathJoin(fileDir, file.name)}`;
    if (el.tagName === 'VIDEO') {
        el.controls = false;
        el.loop = false;
        el.autoplay = true;
        el.removeEventListener("click", playpauseVideoTap);
        el.addEventListener("click", playpauseVideoTap, false);
    } else if (el.tagName === 'IMG') {
        imgSlideshowTimer = setTimeout(() => {
            playbackEnded({ target: el });
        }, imgSlideshowDelay)
    }

    document.getElementById('fullscreen').style.display = 'flex';
    if (enableFullscreen) {
        document.getElementById('fullscreen').requestFullscreen();
    }
}
function exitFullscreenMode() {
    const container = document.querySelector('.media-container');
    container.innerHTML = '';
    document.getElementById('fullscreen').style.display = 'none';
    currentIndex = -1;
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    
    releaseWakeLock();
}

function resetPlaylist(index) {
    currentIndex = index || 0
}

function next() {
    for (let i = currentIndex + 1; i < files.length; i++) {
        if (isMedia(files[i].name)) {
            if (skipImages && isImage(files[i].name)) {
                //Im not smart enough
                continue;
            } else {
                return openFullscreen(i);
            }
        }
    }
    if (enableLoop) {
        resetPlaylist(0);
        openFullscreen(currentIndex);
    }
}

function prev() {
    for (let i = currentIndex - 1; i >= 0; i--) {
        if (isMedia(files[i].name)) {
            if (skipImages && isImage(files[i].name)) {
                //Im not smart enough
                continue;
            } else {
                return openFullscreen(i);
            }
        }
    }
    if (enableLoop) {
        resetPlaylist(files.length - 1);
        openFullscreen(currentIndex);
    }
}

document.getElementById('upBtn').onclick = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchList('/' + parts.join('/'));
};

document.getElementById('vBtn').onclick = () => {
    inFavMode = false;
    setFilterType(isVideo);
    renderGrid();
};


document.getElementById('iBtn').onclick = () => {
    inFavMode = false;
    setFilterType(isImage);
    renderGrid();
};

const toggleForwardsRepeat = () => {
    if(playDirection == 0) {
        playDirection = 1
    }
    else if(playDirection == 1) {
        playDirection = 0
    }
}

const toggleSkipImages = () => {
    skipImages = !skipImages
}

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
