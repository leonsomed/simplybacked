import express from "express";
import { Jimp } from "jimp";
import multer from "multer";
import {
  combineQRParts,
  createBackup,
  decodeQRPart,
  decryptBlock,
  Part,
} from "./cli";

const port = 3000;

const app = express();

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

const parts: { [order: string]: Part } = {};

interface CreateParams {
  secret1: string;
  passphrase1: string;
  secret2: string;
  passphrase2: string;
  secret3: string;
  passphrase3: string;
}

app.post("/api-create", async (req, res) => {
  const params = req.body as CreateParams;

  if (
    !params.secret1 ||
    !params.passphrase1 ||
    !params.secret2 ||
    !params.passphrase2 ||
    !params.secret3 ||
    !params.passphrase3
  ) {
    res.status(422).json({ message: "incomplete form data" });
    return;
  }

  await createBackup([
    { message: params.secret1, passphrase: params.passphrase1 },
    { message: params.secret2, passphrase: params.passphrase2 },
    { message: params.secret3, passphrase: params.passphrase3 },
  ]);

  res.json({ success: true });
});

app.post("/api-qr-frame", multer().single("image"), async (req, res) => {
  if (!req.file) {
    res.status(422).json({ message: "missing file" });
    return;
  }

  const partKeys = Object.keys(parts);
  try {
    // TODO do I need to save the file to a bitmap, or just pass the buffer directly?
    const image = await Jimp.read(req.file.buffer);
    await image.write("just-a-test.bmp");
    const image2 = await Jimp.read("just-a-test.bmp");
    const part = decodeQRPart(image2.bitmap);
    parts[part.order.toString()] = part;
    console.log("got part");
  } catch {}
  res.json({ parts: partKeys.length });
});

interface RestoreParams {
  passphrase: string;
}

app.post("/api-restore", async (req, res) => {
  const params = req.body as RestoreParams;

  if (!params.passphrase) {
    res.status(422).json({ message: "incomplete form data" });
    return;
  }

  const fullParts = Object.values(parts).sort((a, b) => a.order - b.order);

  if (fullParts.length !== 4) {
    res.status(422).json({ message: "missing parts" });
    return;
  }

  const block = combineQRParts(fullParts);

  try {
    const secret = await decryptBlock(params.passphrase, block);
    res.json({ secret });
  } catch {
    res.status(422).json({ message: "unable to decrypt block" });
  }
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});
