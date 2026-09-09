# Data files (not web-served)

Source data for training, dealers, and reference materials.

## training/

JSON and Excel used by the API and import scripts:

- `training.json`, `customer-training.json`, `chatbot-training.json` — mounted into Docker at `/app/data/`
- `CHATBOT_DATAS.xlsx` — source for `convert-chatbot-excel.js`
- `Engineers Training.xlsx` — source for `sync-engineer-training.ts`
- `BUILDING_DOCUMENT.json` — product/spec reference
- `archive/` — previous version training snapshots (`training-v1.json`)

Import: `cd api && npx ts-node src/scripts/import-training.ts`

Convert Excel: `node api/src/scripts/convert-chatbot-excel.js`

## dealers/

- `ALL DEALERS with pin code.xlsx` — dealer import source
- `tableConvert.com_9r2xq5.md` — dealer table export

## quotations/

PDF quotations and project documents.

## reference/

Machine channel notes, ECOD calibration specifications, and reference images:
- `video-training-notes.txt` — Machine channels, test modes, sales & dispatch notes
- `ecod-settings.txt` — ECOD analyzer channel selection, printer, SMS, and cloud settings

