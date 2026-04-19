import fs from 'fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

async function analyzeText() {
  // Load reference and text mask
  const ref = await loadImage(fs.readFileSync('screenshot-A-pattern.png'));
  const mask = await loadImage(fs.readFileSync('maps/pattern-text.png'));
  const gen = await loadImage(fs.readFileSync('preview-compare/rainbow-A/pattern.png'));

  const W = ref.width, H = ref.height;

  const refCanvas = createCanvas(W, H);
  const maskCanvas = createCanvas(W, H);
  const genCanvas = createCanvas(W, H);

  refCanvas.getContext('2d').drawImage(ref, 0, 0);
  maskCanvas.getContext('2d').drawImage(mask, 0, 0);
  genCanvas.getContext('2d').drawImage(gen, 0, 0);

  const refData = refCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const maskData = maskCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const genData = genCanvas.getContext('2d').getImageData(0, 0, W, H).data;

  // Sample text pixels (where mask alpha > 0)
  let textPixelCount = 0;
  let refTextR = 0, refTextG = 0, refTextB = 0;
  let genTextR = 0, genTextG = 0, genTextB = 0;

  for (let i = 0; i < W * H; i++) {
    const maskAlpha = maskData[i * 4 + 3];
    if (maskAlpha > 200) { // Only strong text pixels
      const px = i * 4;
      refTextR += refData[px];
      refTextG += refData[px + 1];
      refTextB += refData[px + 2];
      genTextR += genData[px];
      genTextG += genData[px + 1];
      genTextB += genData[px + 2];
      textPixelCount++;
    }
  }

  if (textPixelCount > 0) {
    const avgRefR = Math.round(refTextR / textPixelCount);
    const avgRefG = Math.round(refTextG / textPixelCount);
    const avgRefB = Math.round(refTextB / textPixelCount);

    const avgGenR = Math.round(genTextR / textPixelCount);
    const avgGenG = Math.round(genTextG / textPixelCount);
    const avgGenB = Math.round(genTextB / textPixelCount);

    console.log(`Text pixels sampled: ${textPixelCount.toLocaleString()}`);
    console.log(`\nReference screenshot text avg color: rgb(${avgRefR}, ${avgRefG}, ${avgRefB})`);
    console.log(`Generated preview text avg color:    rgb(${avgGenR}, ${avgGenG}, ${avgGenB})`);
    console.log(`\nColor difference: ΔR=${Math.abs(avgRefR - avgGenR)}, ΔG=${Math.abs(avgRefG - avgGenG)}, ΔB=${Math.abs(avgRefB - avgGenB)}`);
  }
}

analyzeText();
