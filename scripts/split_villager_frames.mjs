import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const spriteRoot = path.resolve("public/sprites/villager");
const frameCount = 5;
const directions = ["walkingdown", "walkingleft", "walkingup"];

let outputCount = 0;

for (let villagerNumber = 1; villagerNumber <= 10; villagerNumber += 1) {
  const villager = `villager_${String(villagerNumber).padStart(2, "0")}`;

  for (const direction of directions) {
    const source = path.join(spriteRoot, `${villager}_${direction}_keyed.png`);
    const outputDirectory = path.join(spriteRoot, villager, direction);
    const metadata = await sharp(source).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read dimensions from ${source}`);
    }

    await fs.mkdir(outputDirectory, { recursive: true });

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const left = Math.floor((frameIndex * metadata.width) / frameCount);
      const right = Math.floor(((frameIndex + 1) * metadata.width) / frameCount);
      const output = path.join(
        outputDirectory,
        `frame_${String(frameIndex + 1).padStart(2, "0")}.png`,
      );

      await sharp(source)
        .extract({ left, top: 0, width: right - left, height: metadata.height })
        .png()
        .toFile(output);

      outputCount += 1;
    }
  }
}

console.log(`Created ${outputCount} villager animation frames.`);
