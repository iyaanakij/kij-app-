#!/bin/bash
# KIJ 同期デーモン — Mac自動起動インストーラー
# 使い方: bash scripts/install-daemon.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
NODE_BIN="$(which node)"
PLIST_LABEL="com.kij.sync-daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
LOG_DIR="$HOME/Library/Logs/kij"

mkdir -p "$LOG_DIR"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$APP_DIR/scripts/cs3-sync-daemon.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/daemon.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/daemon-error.log</string>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
EOF

# 既存のデーモンを停止（存在すれば）
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# 新しいplistをロード（即時起動）
launchctl load "$PLIST_PATH"

echo "✅ KIJ同期デーモンを自動起動に登録しました"
echo "   ログ: $LOG_DIR/daemon.log"
echo "   停止する場合: bash scripts/uninstall-daemon.sh"
