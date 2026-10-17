#!/bin/sh
# One-shot bootstrap: imports the credentials and every workflow in
# /workflows, then publishes the workflows whose JSON says "active": true.
# Safe to re-run; imports overwrite by id.
set -e
node /bootstrap/render-credentials.js /bootstrap/credentials.json /tmp/credentials.json
n8n import:credentials --input=/tmp/credentials.json
rm -f /tmp/credentials.json
n8n import:workflow --separate --input=/workflows
for id in $(node -e 'const fs=require("fs");for(const f of fs.readdirSync("/workflows").filter(f=>f.endsWith(".json"))){const w=JSON.parse(fs.readFileSync("/workflows/"+f));if(w.active)console.log(w.id)}'); do
  n8n publish:workflow --id="$id"
done
echo "n8n bootstrap: credentials and workflows imported and published"
