"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");
const RUNTIME_PARTS_DIR = path.join(__dirname, "..", "runtime", "parts");
const RUNTIME_PART_FILES = [
  "server.part01.js",
  "server.part02.js",
  "server.part03.js",
  "server.part04.js",
  "server.part05.js",
  "server.part06.js",
  "server.part07.js"
];

function loadServerRuntimeSource() {
  return RUNTIME_PART_FILES.map((fileName) => {
    const filePath = path.join(RUNTIME_PARTS_DIR, fileName);
    return fs.readFileSync(filePath, "utf8");
  }).join("\n");
}

function compileServerRuntime(targetModule) {
  const source = loadServerRuntimeSource();
  targetModule.filename = path.join(PROJECT_ROOT, "server.runtime.bundle.cjs");
  targetModule.paths = Module._nodeModulePaths(PROJECT_ROOT);
  targetModule._compile(source, targetModule.filename);
}

module.exports = {
  loadServerRuntimeSource,
  compileServerRuntime
};
