

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
                    el2.src = src;
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
            files = data.files;
            renderGrid();
        });
}

function addToCollection(identifier) {
    const collectionId = globalDatabase["currentCollection"]
    let existing = null;
    for (let i = 0; i < globalDatabase["collections"][collectionId]["files"].length; i++) {
        const e = globalDatabase["collections"][collectionId]["files"][i];
        if (e.id == identifier) {
            existing = i
            break;
        }
    }
    if (existing === null) {
        console.log("Adding to fav:", identifier)
        globalDatabase["collections"][collectionId]["files"].push({ "id": 0, "name": identifier, "id": identifier });
    } else {
        console.log("Removing from fav:", identifier)
        globalDatabase["collections"][collectionId]["files"] = globalDatabase["collections"][collectionId]["files"].splice(existing, 1);
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
        if (f.type === 1) {
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            thumb.textContent = `📁 ${f.name}`;
            thumb.onclick = () => fetchList(pathJoin(currentPath, f.name));
            el.appendChild(thumb);

        } else if (isMedia(f.name)) {
            const mediaUrl = `/media${pathJoin(currentPath, f.name)}`;
            //const tag = isImage(f.name) ? 'img' : 'video';
            const tag = 'div'
            const thumb = document.createElement(tag);
            thumb.setAttribute('data-src', mediaUrl);
            thumb.setAttribute('data-tag', isImage(f.name) ? 'img' : 'video');
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

function getHTMLVideoElement(index) {

    return el;
}

function openFullscreen(index) {
    currentIndex = index;
    const file = files[currentIndex];
    const container = document.querySelector('.media-container');
    let el = null;
    if (container.firstChild && container.firstChild.tagName == "VIDEO" && isVideo(file.name)) {
        el = container.firstChild
    }
    else if (container.firstChild && container.firstChild.tagName == "IMG" && isImage(file.name)) {
        el = container.firstChild;
    } else {
        el = isImage(file.name) ? document.createElement('img') : document.createElement('video');
        container.innerHTML = '';
        container.appendChild(el);
    }
    el.src = `/media${pathJoin(currentPath, file.name)}`;
    if (el.tagName === 'VIDEO') {
        el.controls = false;
        el.loop = false;
        el.autoplay = true;
        el.removeEventListener("click", playpauseVideoTap);
        el.addEventListener("click", playpauseVideoTap, false);
        el.addEventListener("contextmenu", () => addToCollection(file.name), false);
        el.addEventListener("ended", playbackEnded, false);
    } else if (el.tagName === 'IMG') {
        setTimeout(() => {
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
    document.exitFullscreen();
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
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchList('/' + parts.join('/'));
    //getHTMLVideoElement().playBackwards();
};

document.getElementById('iBtn').onclick = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    fetchList('/' + parts.join('/'));
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