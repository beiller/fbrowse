const express = require('express');

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');

const app = express();

const BASE_DIR = process.env.FBROWSE_BASE_DIR || '/home/bill/src/ComfyUI/output';
const PORT = parseInt(process.env.FBROWSE_PORT || '3000', 10);

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

// Resolve a client-supplied relative path inside BASE_DIR, or null if it escapes it.
function validRel(rel) {
  if (typeof rel !== 'string') return null;
  const abs = path.resolve(BASE_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));
  return abs === BASE_DIR || abs.startsWith(BASE_DIR + path.sep) ? rel : null;
}

function safeDecode(v) {
  try { return decodeURIComponent(v); } catch (e) { return null; }
}

app.get('/thumb', (req, res) => {
  const rel = safeDecode(req.query.path || '');
  if (rel === null || !validRel(rel)) return res.status(400).end();
  const abs = path.resolve(BASE_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));

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




app.get('/list', async (req, res) => {
  const queryPath = safeDecode(req.query.path || '/');
  if (queryPath === null) return res.status(400).json({ error: 'bad path' });
  const dirPath = path.resolve(BASE_DIR, '.' + (queryPath.startsWith('/') ? queryPath : '/' + queryPath));
  if (dirPath !== BASE_DIR && !dirPath.startsWith(BASE_DIR + path.sep)) {
    return res.status(400).json({ error: 'bad path' });
  }

  let items;
  try {
    items = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch (err) {
    return res.status(err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }

  const stats = await Promise.all(items.map(item =>
    fsp.stat(path.join(dirPath, item.name)).catch(() => null)));

  const files = [];
  items.forEach((item, i) => {
    const st = stats[i];
    if (!st) return; // vanished between readdir and stat
    const rel = (queryPath + '/' + item.name).replace(/\/+/g, '/');
    const v = votes.get(rel) || { up: 0, down: 0, my: 0 };
    files.push({
      name: item.name,
      type: item.isDirectory() ? 1 : getType(item.name),
      modified: st.mtime.getTime(),
      up: v.up || 0,
      down: v.down || 0,
      my: v.my || 0
    });
  });

  files.sort((a, b) => (a.modified - b.modified) * -1.0);

  res.json({
    currentPath: queryPath,
    files
  });
});




app.post('/vote', (req, res) => {
  const body = req.body || {};
  const rel = safeDecode(body.path || '');
  if (rel === null || !validRel(rel)) return res.status(400).json({ error: 'bad path' });
  if (![1, -1, 0].includes(body.v)) return res.status(400).json({ error: 'bad vote' });
  const v = body.v;

  const entry = votes.get(rel) || { up: 0, down: 0, my: 0 };
  if (v === 0) {
    if (entry.my > 0) entry.up -= entry.my;
    else if (entry.my < 0) entry.down += entry.my;
    entry.my = 0;
  } else {
    if (entry.my > 0) entry.up--;
    else if (entry.my < 0) entry.down--;
    if (v === 1) entry.up++; else entry.down++;
    entry.my = v;
  }
  votes.set(rel, entry);
  saveVotes();
  res.json({ up: entry.up, down: entry.down, my: entry.my });
});


app.get('/scored', async (req, res) => {
  const out = [];
  for (const [rel, v] of votes) {
    if ((v.up || 0) - (v.down || 0) <= 0) continue;
    if (!validRel(rel)) continue;
    const abs = path.resolve(BASE_DIR, '.' + (rel.startsWith('/') ? rel : '/' + rel));
    let st;
    try {
      st = await fsp.stat(abs);
    } catch (e) { continue; }
    if (!st.isFile()) continue;
    const name = path.basename(rel);
    out.push({ name, path: rel, type: getType(name), modified: st.mtime.getTime(), up: v.up || 0, down: v.down || 0, my: v.my || 0 });
  }
  out.sort((a, b) => ((b.up - b.down) - (a.up - a.down)) || (a.modified - b.modified) * -1.0);
  res.json({ files: out });
});


const PLAYLISTS_FILE = process.env.FBROWSE_PLAYLISTS_FILE || path.join(os.homedir(), '.cache', 'fbrowse', 'playlists.json');


let playlists = new Map();




function loadPlaylists() {


  try {


    const data = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));


    for (const [k, v] of Object.entries(data)) playlists.set(k, v);


  } catch (e) {}


}




function savePlaylists() {


  const obj = {};


  for (const [k, v] of playlists) obj[k] = v;


  const tmp = PLAYLISTS_FILE + '.' + process.pid + '.tmp';


  fs.mkdirSync(path.dirname(PLAYLISTS_FILE), { recursive: true });


  fs.writeFileSync(tmp, JSON.stringify(obj));


  fs.renameSync(tmp, PLAYLISTS_FILE);


}




loadPlaylists();




function playlistNameOk(name) {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100 &&
    !name.includes('\u0000') && !name.includes('/') && !name.includes('\\');
}


app.get('/playlists', (req, res) => {


  const out = [];


  for (const [name, p] of playlists) out.push({ name, created: p.created || 0, files: p.files || [] });


  out.sort((a, b) => a.name.localeCompare(b.name));


  res.json({ playlists: out });


});



app.post('/playlists', (req, res) => {


  const raw = (req.body && req.body.name) || '';
  const name = safeDecode(raw);
  if (!playlistNameOk(name)) return res.status(400).json({ error: 'bad name' });
  const trimmed = name.trim();
  if (playlists.has(trimmed)) return res.status(409).json({ error: 'exists' });


  playlists.set(trimmed, { name: trimmed, created: Date.now(), files: [] });


  savePlaylists();


  res.json({ ok: true });


});



app.delete('/playlists', (req, res) => {


  const name = safeDecode(req.query.name || '');
  if (name === null || !playlists.has(name)) return res.status(404).json({ error: 'not found' });


  playlists.delete(name);


  savePlaylists();


  res.json({ ok: true });


});



app.post('/playlists/add', (req, res) => {


  const body = req.body || {};
  const name = safeDecode(body.name || '');
  const rel = name === null ? null : validRel(safeDecode(body.path || ''));
  const p = name !== null ? playlists.get(name) : null;
  if (!p || !rel) return res.status(400).json({ error: 'bad request' });


  if (!p.files.includes(rel)) p.files.push(rel);


  savePlaylists();


  res.json({ files: p.files });


});



app.post('/playlists/remove', (req, res) => {


  const body = req.body || {};
  const name = safeDecode(body.name || '');
  const rel = name === null ? null : validRel(safeDecode(body.path || ''));
  const p = name !== null ? playlists.get(name) : null;
  if (!p || !rel) return res.status(400).json({ error: 'bad request' });


  p.files = p.files.filter(f => f !== rel);


  savePlaylists();


  res.json({ files: p.files });


});



app.post('/playlists/move', (req, res) => {


  const body = req.body || {};
  const name = safeDecode(body.name || '');
  const from = parseInt(body.from);
  const to = parseInt(body.to);
  const p = name !== null ? playlists.get(name) : null;


  if (!p || isNaN(from) || isNaN(to) || from < 0 || to < 0 || from >= p.files.length || to >= p.files.length) {


    return res.status(400).json({ error: 'bad request' });


  }


  const [f] = p.files.splice(from, 1);


  p.files.splice(to, 0, f);


  savePlaylists();


  res.json({ files: p.files });


});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});
