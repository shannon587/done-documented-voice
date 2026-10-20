#!/usr/bin/env bash
# Builds deploy/lambda/function.zip for AWS Lambda + Function URL using the AWS Lambda Web Adapter layer.
# The Express app runs unchanged inside Lambda; the adapter turns Function URL events into HTTP on :8080.
set -euo pipefail
cd "$(dirname "$0")/../.."
out=deploy/lambda/out; rm -rf "$out" deploy/lambda/function.zip; mkdir -p "$out/dist"
npx esbuild src/web.ts --bundle --platform=node --target=node20 --format=esm --outfile="$out/dist/web.mjs" \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
cp -r public "$out/public"
cat > "$out/run.sh" <<'RUN'
#!/bin/sh
exec node /var/task/dist/web.mjs
RUN
chmod +x "$out/run.sh"
python3 -c "import shutil; shutil.make_archive('deploy/lambda/function', 'zip', '$out')"
echo "built deploy/lambda/function.zip ($(du -h deploy/lambda/function.zip | cut -f1))"
