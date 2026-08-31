const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const app = express();


const BASE_DIR = '/home/bill/src/ComfyUI/output';


app.use('/media', express.static(BASE_DIR));
app.use('/', express.static(__dirname + '/public'));
app.use(express.json());

const THUMB_DIR = process.env.FBROWSE_THUMB_DIR || path.join(os.homedir(), '.cache', 'fbrowse', 'thumbs');
fs.mkdirSync(THUMB_DIR, { recursive: true });

const VOTE_FILE = process.env.FBROWSE_VOTE_FILE || path.join(os.homedir(), '.cache', 'fbrowse', 'votes.json');

let votes = new Map();

function loadVotes() {
  try {
    const data = JSON.parse(fs.readFileSync(VOTE_FILE, 'utf8'));
    for (const [k, v] of Object.entries(data)) votes.set(k, v);
  } catch (e) {}
}

function saveVotes() {
  const obj = {};
  for (const [k, v] of votes) if (v.up || v.down || v.my) obj[k] = v;
  const tmp = VOTE_FILE + '.' + process.pid + '.tmp';
  fs.mkdirSync(path.dirname(VOTE_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, VOTE_FILE);
}

loadVotes();

let thumbQueue = [];
let thumbActive = 0;
const thumbPending = new Map();

function nextThumb() {
  if (thumbActive >= 3 || thumbQueue.length === 0) return;
  const task = thumbQueue.shift();
  thumbActive++;
  fs.mkdirSync(THUMB_DIR, { recursive: true });
  execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', task.abs, '-frames:v', '1', '-vf', 'scale=' + task.w + ':-2', '-q:v', '5', '-f', 'image2', task.tmp], (err, so, se) => {
    thumbActive--;
    const waiters = thumbPending.get(task.key) || [];
    thumbPending.delete(task.key);
    if (!err && fs.existsSync(task.tmp)) {
      try { fs.renameSync(task.tmp, task.out); } catch (e) {}
      for (const r of waiters) r.sendFile(task.out, { dotfiles: 'allow' });
    } else {
      try { fs.unlinkSync(task.tmp); } catch (e) {}
      for (const r of waiters) r.status(503).end();
    }
    nextThumb();
  });
}

app.get('/thumb', (req, res) => {
  const rel = decodeURIComponent(req.query.path || '');
  const abs = path.resolve(BASE_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));
  if (!abs.startsWith(BASE_DIR + path.sep)) return res.status(400).end();

  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return res.status(404).end();

    const w = Math.min(Math.max(parseInt(req.query.w) || 300, 64), 1280);
    const key = crypto.createHash('sha1').update(rel + ':' + st.mtimeMs + ':' + st.size + ':' + w).digest('hex');
    const out = path.join(THUMB_DIR, key + '.jpg');

    if (fs.existsSync(out)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(out, { dotfiles: 'allow' });
    }

    if (thumbPending.has(key)) {
      thumbPending.get(key).push(res);
      return;
    }

    thumbPending.set(key, [res]);
    thumbQueue.push({ key, abs, w, tmp: out + '.' + process.pid + '.tmp', out });
    nextThumb();
  });
});


function isImage(name) {
  return name.match(/\.(jpg|jpeg|png|gif)$/i);
}


function isVideo(name) {
  return name.match(/\.(mp4|webm|mov)$/i);
}


function getType(name) {
  return isImage(name) ? 2 : isVideo(name) ? 3 : 4
}


app.get('/list', (req, res) => {
  const queryPath = decodeURIComponent(req.query.path || '/');
  const dirPath = path.join(BASE_DIR, queryPath);


  fs.readdir(dirPath, { withFileTypes: true }, (err, items) => {
    if (err) return res.status(500).json({ error: err.message });
    const files = items.map(item => {
      const rel = (queryPath + '/' + item.name).replace(/\/+/g, '/');
      const v = votes.get(rel) || { up: 0, down: 0, my: 0 };
      return {
        name: item.name,
        type: item.isDirectory() ? 1 : getType(item.name),
        modified: fs.statSync(dirPath + '/' + item.name).mtime.getTime(),
        up: v.up || 0,
        down: v.down || 0,
        my: v.my || 0
      };
    })
    // console.log(files.slice(0, 5));
    files.sort((a, b) => ((b.up - b.down) - (a.up - a.down)) || (a.modified - b.modified) * -1.0)
    //files.reverse();


    res.json({
      currentPath: queryPath,
      files
    });
  });
});


app.post('/vote', (req, res) => {
  const rel = decodeURIComponent((req.body && req.body.path) || '');
  const v = req.body && [1, -1, 0].includes(req.body.v) ? req.body.v : null;
  if (v === null) return res.status(400).json({ error: 'bad vote' });

  const abs = path.resolve(BASE_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));
  if (!abs.startsWith(BASE_DIR + path.sep)) return res.status(400).json({ error: 'bad path' });

  const entry = votes.get(rel) || { up: 0, down: 0, my: 0 };
  if (v === 0) {
    if (entry.my > 0) entry.up -= entry.my;
    else if (entry.my < 0) entry.down += entry.my;
    entry.my = 0;
  } else {
    if (v === 1) {
      if (entry.my < 0) entry.down--; else entry.up++;
    } else {
      if (entry.my > 0) entry.up--; else entry.down++;
    }
    entry.my += v;
  }
  votes.set(rel, entry);
  saveVotes();
  res.json({ up: entry.up, down: entry.down, my: entry.my });
});

app.get('/scored', (req, res) => {
  const out = [];
  for (const [rel, v] of votes) {
    if ((v.up || 0) - (v.down || 0) <= 0) continue;
    const abs = path.resolve(BASE_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));
    if (!abs.startsWith(BASE_DIR + path.sep)) continue;
    try {
      const st = fs.statSync(abs);
      if (!st.isFile()) continue;
      const name = path.basename(rel);
      out.push({ name, path: rel, type: getType(name), modified: st.mtime.getTime(), up: v.up || 0, down: v.down || 0, my: v.my || 0 });
    } catch (e) {}
  }
  out.sort((a, b) => ((b.up - b.down) - (a.up - a.down)) || (a.modified - b.modified) * -1.0);
  res.json({ files: out });
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:3000');
});
