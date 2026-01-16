import express from "express";
import { Jimp } from "jimp";
import os from "os";
import multer from "multer";
import {
  combineQRParts,
  createBackup,
  decodeQRImage,
  decryptBlock,
} from "./cli";
import encodeQR from "qr";
import { getState, setState } from "./state";

const port = 3000;

const app = express();

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

interface CreateParams {
  secret1: string;
  passphrase1: string;
  secret2: string;
  passphrase2: string;
  secret3: string;
  passphrase3: string;
  httpTargets?: string;
  label?: string;
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

  let targets: string[] | undefined;
  if (params.httpTargets) {
    targets = params.httpTargets.split(",");
    try {
      targets.forEach((n) => new URL(n)); // validate
    } catch {
      res.status(422).json({
        message: "HTTP targets must be a comma separated string of valid URLs",
      });
      return;
    }
  }

  if (
    (params.label && typeof params.label !== "string") ||
    (params.label?.length ?? 0) > 500
  ) {
    res.status(422).json({
      message: "label must be a string no longer than 500 characters",
    });
    return;
  }

  const { image } = await createBackup(
    [
      { message: params.secret1, passphrase: params.passphrase1 },
      { message: params.secret2, passphrase: params.passphrase2 },
      { message: params.secret3, passphrase: params.passphrase3 },
    ],
    targets,
    params.label ?? undefined,
  );

  await image.write(
    `${os.homedir()}/Downloads/simplybacked-${Date.now()}-${Math.random()
      .toString()
      .substring(2, 8)}.bmp`,
  );

  res.json({ message: "Your file was wirtten to the downloads folder" });

  // TODO For some reason this doesn't seem to downlaod so just write the file to the HOME/Dowloads
  // res
  //   .status(200)
  //   .set({
  //     "Content-Type": JimpMime.bmp,
  //     "content-disposition": 'attachment; filename="simplybacked.bmp"',
  //   })
  //   .attachment("simplybacked.bmp")
  //   .send(await image.getBuffer(JimpMime.bmp));
});

app.post("/api-qr-frame", multer().single("image"), async (req, res) => {
  if (!req.file) {
    res.status(422).json({ message: "missing file" });
    return;
  }

  let state = getState();
  const partKeys = Object.keys(state.parts);
  try {
    const before = {
      partKeysLength: partKeys.length,
      httpTargetsLength: state.httpTargets.length,
      httpTargetSecret: state.httpTargetSecret,
    };
    const image = await Jimp.read(req.file.buffer);
    const decoded = decodeQRImage(image.bitmap);

    if (decoded.type === "httpTargets") {
      setState({ ...state, httpTargets: decoded.data });
    } else if (decoded.type === "part") {
      setState({
        ...state,
        parts: {
          ...state.parts,
          [decoded.data.order.toString()]: decoded.data,
        },
      });
    } else if (decoded.type === "text") {
      setState({ ...state, httpTargetSecret: decoded.data });
    }
    state = getState();

    const payload: {
      parts?: number;
      httpTargets?: string[];
      httpTargetQrs?: string[];
      httpTargetSecret?: string;
    } = {};
    const newPartsSize = Object.keys(state.parts).length;

    if (newPartsSize > before.partKeysLength) {
      console.log("got part");
      payload.parts = newPartsSize;
    }

    if (state.httpTargets.length > before.httpTargetsLength) {
      console.log("got http targets part");
      payload.httpTargets = state.httpTargets;
      const qrs = state.httpTargets.map((next) =>
        encodeQR(next, "svg", {
          ecc: "low",
          scale: 4,
        }),
      );
      payload.httpTargetQrs = qrs;
    }

    if (
      state.httpTargetSecret &&
      state.httpTargetSecret !== before.httpTargetSecret
    ) {
      console.log("got http target secret part");
      payload.httpTargetSecret = state.httpTargetSecret;
    }

    res.json(payload);
  } catch {
    res.json({});
  }
});

interface RestoreParams {
  passphrase: string;
}

app.get("/api-state", (req, res) => {
  const state = getState();
  const httpTargetQrs = state.httpTargets.map((next) =>
    encodeQR(next, "svg", {
      ecc: "low",
      scale: 4,
    }),
  );

  res.json({
    parts: Object.keys(state.parts).length,
    httpTargets: state.httpTargets,
    httpTargetQrs,
    httpTargetSecret: state.httpTargetSecret,
  });
});

app.post("/api-restore", async (req, res) => {
  const params = req.body as RestoreParams;

  if (!params.passphrase) {
    res.status(422).json({ message: "incomplete form data" });
    return;
  }
  const state = getState();

  const fullParts = Object.values(state.parts).sort(
    (a, b) => a.order - b.order,
  );

  if (fullParts.length !== 4) {
    res.status(422).json({ message: "missing parts" });
    return;
  }

  const block = combineQRParts(fullParts);

  try {
    const secret = await decryptBlock(params.passphrase, block);
    res.json({ message: secret });
  } catch {
    res.status(422).json({ message: "unable to decrypt block" });
  }
});

app.get("/api-test-init", async (req, res) => {
  const secrets = [
    { message: "the first", passphrase: "pass1" },
    { message: "the second", passphrase: "pass2" },
    { message: "the third", passphrase: "pass3" },
  ];
  const httpTargets = [
    "https://example.com/1",
    "https://example.com/2",
    "https://example.com/3",
  ];
  const label = "My testing label";
  const result = await createBackup(secrets, httpTargets, label);

  setState({
    parts: {
      [1]: JSON.parse(result.parts[0].data),
      [2]: JSON.parse(result.parts[1].data),
      [3]: JSON.parse(result.parts[2].data),
      [4]: JSON.parse(result.parts[3].data),
    },
    httpTargets: ["https://example.com"],
    httpTargetSecret: secrets[1].passphrase,
  });

  res.json({ message: "success" });
});

app.listen(port, () => {
  console.log(`Server running at port ${port}`);
});
