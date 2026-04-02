#!/bin/bash
# KIJ 同期デーモン — 自動起動アンインストーラー
# 使い方: bash scripts/uninstall-daemon.sh

PLIST_LABEL="com.kij.sync-daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

launchctl unload "$PLIST_PATH" 2>/dev/null && echo "✅ デーモンを停止しました" || echo "デーモンは起動していませんでした"
rm -f "$PLIST_PATH" && echo "✅ 自動起動設定を削除しました"
