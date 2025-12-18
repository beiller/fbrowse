const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const BASE_DIR = '/home/bill/src/ComfyUI/output';

app.use('/media', express.static(BASE_DIR));
app.use('/', express.static(__dirname + '/public'));

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

