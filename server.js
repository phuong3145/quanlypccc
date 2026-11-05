const express = require('express');
const path = require('path');
const app = require('./api/index');

const server = express();
server.use(express.static(path.join(__dirname, 'public')));
server.use(app);
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`http://localhost:${port}`));
