#!/bin/bash
# DevBox 启动脚本：拉起 OneBoss 服务
# 用法： bash scripts/devbox-start.sh          -> 只跑 HTTP
#        bash scripts/devbox-start.sh service  -> HTTP + worker（start-service.mjs 托管）
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1

# start-service.mjs 默认 PORT=10000，而 Sealos 暴露的是 3000，必须显式固定
export PORT=3000

cd "$HOME/oneboss-ai" || exit 1

pkill -f "start-service.mjs" 2>/dev/null
pkill -f "scripts/worker.ts" 2>/dev/null
pkill -f "next start" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1

MODE="${1:-web}"
if [ "$MODE" = "service" ]; then
  nohup npm run start:service > "$HOME/server.log" 2>&1 &
else
  nohup npm start > "$HOME/server.log" 2>&1 &
fi
echo "started ($MODE, PORT=$PORT) pid $!"
