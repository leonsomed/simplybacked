# This is still a work in progress, use under your own responsibility.

## About

simplybacked is inspired in superbacked, it uses the same underlying encryption (blockcrypt), but without all the heavy frontend dependencies. It is ideal to run in a CLI or via a minimal web UI. It is advised to run simplybacked in an airgap device.

The goal is to improve this project by removing as many dependencies as possible and rely purely on native node and browser APIs. This does mean to wait until there is support for [BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) and possible others. This should not be a concern if running on an airgap device.

## Usage

You would need the version of node listed in .nvmrc or later

```bash
nvm use
npm install
npm start
```

You can now visit http://localhost:3000/create.html or http://localhost:3000/restore.html

## Build

To build simply run:

```bash
npm run build
```

# Local development

```bash
nvm use
npm install
npm run dev
```
