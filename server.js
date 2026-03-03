"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const CHUNKS_DIR = path.join(__dirname, "src", "server", "chunks");
const CHUNK_FILES = [
  "server.part01.js",
  "server.part02.js",
  "server.part03.js",
  "server.part04.js",
  "server.part05.js",
  "server.part06.js",
  "server.part07.js"
];

const source = CHUNK_FILES.map((fileName) => {
  const filePath = path.join(CHUNKS_DIR, fileName);
  return fs.readFileSync(filePath, "utf8");
}).join("\n");

module.filename = path.join(__dirname, "server.runtime.bundle.cjs");
module.paths = Module._nodeModulePaths(__dirname);
module._compile(source, module.filename);
