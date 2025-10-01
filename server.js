const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const BASE_DIR = '/Volumes/src/ComfyUI/output';

app.use('/media', express.static(BASE_DIR));
app.use('/', express.static(__dirname + '/public'));

function isImage(name) {
  return name.match(/\.(jpg|jpeg|png|gif)$/i);
}

function isVideo(name) {
  return name.match(/\.(mp4|webm|mov)$/i);
}

function getType(name) {
  return isImage(name) ? 1 : isVideo(name) ? 2 : 3
}

app.get('/list', (req, res) => {
  const queryPath = decodeURIComponent(req.query.path || '/');
  const dirPath = path.join(BASE_DIR, queryPath);

  fs.readdir(dirPath, { withFileTypes: true }, (err, items) => {
    if (err) return res.status(500).json({ error: err.message });

    const files = items.map(item => {
      return {
        name: item.name,
        type: item.isDirectory() ? 0 : getType(item.name),
        modified: item.modified
      };
    }).sort((a, b)=>b.type-a.type).reverse()

    res.json({
      currentPath: queryPath,
      files
    });
  });
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:3000');
});

