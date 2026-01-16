import { Block, decrypt, encrypt, Secret } from "blockcrypt";
import encodeQR from "qr";
import { Bitmap, Jimp, loadFont } from "jimp";
import { SANS_16_BLACK, SANS_32_BLACK } from "jimp/fonts";
import argon2 from "./argon2";
import decodeQR from "qr/decode.js";

type HttpTargetsPart = string[];

interface PartWrapper {
  type: "part";
  data: Part;
}

interface TextPartWrapper {
  type: "text";
  data: string;
}

interface HttpTargetsPartWrapper {
  type: "httpTargets";
  data: HttpTargetsPart;
}

type QRDecoded = PartWrapper | TextPartWrapper | HttpTargetsPartWrapper;

function parseQRData(data: string): Payload {
  if (!data) {
    throw new Error("Nullish QR data");
  }

  const parsed = JSON.parse(data);

  if (!parsed.salt && typeof parsed.salt !== "string") {
    throw new Error("Payload missing salt");
  }

  if (!parsed.iv && typeof parsed.iv !== "string") {
    throw new Error("Payload missing iv");
  }

  if (!parsed.headers && typeof parsed.headers !== "string") {
    throw new Error("Payload missing headers");
  }

  if (!parsed.data && typeof parsed.data !== "string") {
    throw new Error("Payload missing data");
  }

  return {
    salt: parsed.salt,
    iv: parsed.iv,
    headers: parsed.headers,
    data: parsed.data,
  };
}

function parseQRPartData(data: string): QRDecoded {
  if (!data) {
    throw new Error("Nullish QR Part data");
  }

  let parsed;

  try {
    parsed = JSON.parse(data);
  } catch {
    if (typeof data === "string") {
      return { type: "text", data };
    }
  }

  try {
    if (
      Array.isArray(parsed) &&
      ((parsed[0] === "skip" && parsed.length === 1) ||
        parsed.map((n) => new URL(n)))
    ) {
      return { type: "httpTargets", data: parsed };
    }
  } catch (e) {
    console.error(e);
    throw new Error("Invalid QR");
  }

  if (!parsed.order && typeof parsed.order !== "number") {
    throw new Error("Payload missing order");
  }

  if (!parsed.base64 && typeof parsed.base64 !== "string") {
    throw new Error("Payload missing base64");
  }

  return {
    type: "part",
    data: {
      base64: parsed.base64,
      order: parsed.order,
    },
  };
}

interface Payload {
  salt: string;
  iv: string;
  headers: string;
  data: string;
}

export interface Part {
  base64: string;
  order: number;
}

export async function createBackup(
  blockcryptSecrets: Secret[],
  httpTargets: string[] | undefined,
  label: string | undefined,
) {
  // TODO 3rd param: not sure what it means, but superbacked passes a hard-coded value of 48 https://github.com/superbacked/superbacked/blob/a2a34b06a402f2e4599ab0b6aabbad80cc95b1c4/src/create.ts#L213
  // TODO 4th param: not quite sure what it means you can figure out the right dataLength by printing it in this line it has to be a multiple of 64 https://github.com/superbacked/blockcrypt/blob/ae4040826b708d1d8a85ce0c98442d626abe26d5/src/index.ts#L129
  // throw new Error(`Data too long for data length ${unpaddedDataLength} > ${dataLength}`);
  let block: Block;
  let dataLengthMultiplier = 10;

  while (true) {
    try {
      block = await encrypt(
        blockcryptSecrets,
        argon2,
        48,
        64 * dataLengthMultiplier,
      );
      break;
    } catch (e) {
      if ((e as Error)?.message !== "Data too long for data length") {
        throw e;
      }
      dataLengthMultiplier += 1;

      if (dataLengthMultiplier > 20) {
        throw new Error("Reached the max data length multipler");
      }

      continue;
    }
  }

  const payload: Payload = {
    salt: block.salt.toString("base64"),
    iv: block.iv.toString("base64"),
    headers: block.headers.toString("base64"),
    data: block.data.toString("base64"),
  };

  // encode block as QR code
  const base64Data = Buffer.from(JSON.stringify(payload)).toString("base64");
  const partitionSize = base64Data.length / 4;

  // start image generation
  const backgroundImage = new Jimp({
    width: 1000,
    height: 2000,
    color: 0xffffffff,
  });
  const font = await loadFont(SANS_16_BLACK);
  const fontLarge = await loadFont(SANS_32_BLACK);

  if (label) {
    backgroundImage.print({
      font,
      x: 50,
      y: 100,
      text: label,
    });
  }

  const qrcodeBuffer = encodeQR(
    JSON.stringify(httpTargets ?? ["skip"]),
    "gif",
    {
      ecc: "high",
      scale: 4,
    },
  );
  const firstQrImg = await Jimp.read(Buffer.from(qrcodeBuffer));
  backgroundImage.composite(
    firstQrImg,
    (backgroundImage.width / 4) * 3 - firstQrImg.width / 2,
    50,
  );
  backgroundImage.print({
    font: fontLarge,
    x: 5 + (backgroundImage.width / 4) * 3,
    y: 20,
    text: (1).toString(),
  });

  const parts = [
    {
      data: JSON.stringify({
        base64: base64Data.substring(partitionSize * 0, partitionSize * 1),
        order: 1,
      }),
      x: 0,
      y: firstQrImg.height + 50,
    },
    {
      data: JSON.stringify({
        base64: base64Data.substring(partitionSize * 1, partitionSize * 2),
        order: 2,
      }),
      x: 500,
      y: firstQrImg.height + 50,
    },
    {
      data: JSON.stringify({
        base64: base64Data.substring(partitionSize * 2, partitionSize * 3),
        order: 3,
      }),
      x: 0,
      y: firstQrImg.height + 550,
    },
    {
      data: JSON.stringify({
        base64: base64Data.substring(partitionSize * 3, base64Data.length),
        order: 4,
      }),
      x: 500,
      y: firstQrImg.height + 550,
    },
  ];

  let i = 0;
  let partHeight = 0;
  for (const part of parts) {
    i++;
    const qrcodeBuffer = encodeQR(part.data, "gif", {
      ecc: "high",
      scale: 4,
    });
    const img = await Jimp.read(Buffer.from(qrcodeBuffer));

    partHeight = img.height;
    backgroundImage.composite(
      img,
      part.x + (backgroundImage.width / 2 - img.width) / 2,
      part.y + (backgroundImage.width / 2 - img.height) / 2,
    );
    backgroundImage.print({
      font: fontLarge,
      x: 25 + part.x + img.width / 2,
      y: 10 + part.y,
      text: (i + 1).toString(),
    });
  }

  backgroundImage.crop({
    w: backgroundImage.width,
    h: parts[parts.length - 1].y + partHeight + 100,
    x: 0,
    y: 0,
  });

  return { parts, image: backgroundImage };
}

export function decodeQRImage(bitmap: Bitmap): QRDecoded {
  const decodedQR = decodeQR(bitmap);
  return parseQRPartData(decodedQR);
}

export function combineQRParts(parts: Part[]): Payload {
  let base64data = "";
  for (const part of parts) {
    base64data += part.base64;
  }
  const json = Buffer.from(base64data, "base64").toString("utf8");
  return parseQRData(json);
}

export async function decryptBlock(
  passphrase: string,
  block: Payload,
): Promise<string> {
  const message = await decrypt(
    passphrase,
    Buffer.from(block.salt, "base64"),
    Buffer.from(block.iv, "base64"),
    Buffer.from(block.headers, "base64"),
    Buffer.from(block.data, "base64"),
    argon2,
  );

  return message.toString();
}
