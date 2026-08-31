

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


let globalDatabase = null;
const GLOBAL_DATABASE_PATH = "";
globalDatabase = window.localStorage.getItem(GLOBAL_DATABASE_PATH)
if (!globalDatabase || true) {
    globalDatabase = {
        "favourites": [
            //{"collection": 0, "name": "Base", "id": ???},
        ], "collections": [
            { "id": 0, "name": "BaseCollection", "files": [] }
        ],
        "currentCollection": 0
    }
} else {
    globalDatabase = JSON.parse(globalDatabase);
}
window.localStorage.setItem(GLOBAL_DATABASE_PATH, JSON.stringify(globalDatabase));

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

function addToCollection(file) {
    const collectionId = globalDatabase["currentCollection"]
    let existing = null;
    for (let i = 0; i < globalDatabase["collections"][collectionId]["files"].length; i++) {
        const e = globalDatabase["collections"][collectionId]["files"][i];
        if (e.id == file.id) {
            existing = i
            break;
        }
    }
    if (existing === null) {
        console.log("Adding to fav:", file.id)
        globalDatabase["collections"][collectionId]["files"].push({ "id": file.id, "name": file.name });
    } else {
        console.log("Removing from fav:", file.id)
        globalDatabase["collections"][collectionId]["files"].splice(existing, 1);
    }
    window.localStorage.setItem(GLOBAL_DATABASE_PATH, JSON.stringify(globalDatabase));
    console.log(globalDatabase);
}
let inFavMode = false;

function toggleFavouriteView() {
    const collectionId = globalDatabase["currentCollection"];

    if (!inFavMode) {
        //currentPath = "/";
        files = globalDatabase["collections"][collectionId]["files"];
        inFavMode = true
        renderGrid();

    } else {
        inFavMode = false
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
            el.addEventListener("contextmenu", () => addToCollection(el._file), false);
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
