const { createRequire } = require('node:module');
const path = require('node:path');

const CANVAS_MODULE_NAME = ["@napi-rs", "canvas"].join("/");

function loadCanvasModule() {
  const requireFunc = createRequire(__filename);
  try {
    const canvas = requireFunc(CANVAS_MODULE_NAME);
    console.log("Canvas module loaded successfully");
    const c = canvas.createCanvas(100, 100);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 100, 100);
    console.log("Canvas operation successful");
  } catch (e) {
    console.error("Canvas module load failed:", e.message);
  }
}

async function loadTesseract() {
  try {
    const { createWorker } = await import('tesseract.js');
    console.log("Tesseract module loaded successfully");
  } catch (e) {
    console.error("Tesseract module load failed:", e.message);
  }
}

loadCanvasModule();
loadTesseract();
