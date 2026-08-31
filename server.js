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

const THUMB_DIR = process.env.FBROWSE_THUMB_DIR || path.join(os.homedir(), '.cache', 'fbrowse', 'thumbs');
fs.mkdirSync(THUMB_DIR, { recursive: true });

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
      return {
        name: item.name,
        type: item.isDirectory() ? 1 : getType(item.name),
        modified: fs.statSync(dirPath + '/' + item.name).mtime.getTime()
      };
    })
    // console.log(files.slice(0, 5));
    files.sort((a, b) => (a.modified - b.modified) * -1.0)
    //files.reverse();


    res.json({
      currentPath: queryPath,
      files
    });
  });
});


app.listen(3000, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:3000');
});
