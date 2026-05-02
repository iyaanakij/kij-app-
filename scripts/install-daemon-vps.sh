#!/bin/bash
# KIJ 同期デーモン — VPS (ConoHa / systemd) インストーラー
# 使い方: bash scripts/install-daemon-vps.sh <VPS_IP> [VPS_USER]
#
# 前提:
#   - VPS に /opt/shift-sync が存在し node / npm が使える
#   - VPS の /opt/shift-sync/node_modules に @supabase/supabase-js が入っている
#   - VPS の /opt/shift-sync/.env に以下を追記済みであること（まだなら Step 0 参照）

set -e

VPS_IP="${1:?VPS_IP を第1引数に指定してください}"
VPS_USER="${2:-kokikato}"
VPS_BASE="/opt/shift-sync"
SERVICE_NAME="kij-reservation-daemon"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
SHIFT_SYNC_DIR="$(dirname "$APP_DIR")/shift-sync"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " KIJ 同期デーモン VPS インストール"
echo " VPS: ${VPS_USER}@${VPS_IP}:${VPS_BASE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Step 0: VPS .env に必要キーが存在するかチェック ─────────────────
REQUIRED_KEYS=(
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  CS3_LOGIN_ID
  CS3_PASSWORD
  SYNC_SECRET
)

echo ""
echo "⚠️  Step 0: VPS の ${VPS_BASE}/.env に以下のキーが必要です（値は表示しません）"
for key in "${REQUIRED_KEYS[@]}"; do
  echo "     - $key"
done
echo ""
echo "   VPS ${VPS_BASE}/.env のキー存在チェック中..."
missing=0
for key in "${REQUIRED_KEYS[@]}"; do
  if ssh "${VPS_USER}@${VPS_IP}" "grep -q '^${key}=' ${VPS_BASE}/.env 2>/dev/null"; then
    echo "   ✅ $key"
  else
    echo "   ❌ $key （未設定）"
    missing=1
  fi
done
echo ""
if [[ "$missing" -eq 1 ]]; then
  echo "❌ 未設定のキーがあります。ssh でログインして ${VPS_BASE}/.env を編集してから再実行してください。"
  exit 1
fi
echo "✅ 全キー確認済み。インストールを続行します。"

# ─── Step 1: デーモンスクリプトを VPS に転送 ─────────────────────────
echo ""
echo "📤 Step 1: デーモンスクリプトを転送中..."
scp "$SCRIPT_DIR/cs3-sync-daemon.js" "${VPS_USER}@${VPS_IP}:${VPS_BASE}/scripts/cs3-sync-daemon.js"
echo "✅ 転送完了"

# ─── Step 2: 95 バッチが VPS に存在するか確認 ────────────────────────
echo ""
echo "📤 Step 2: 95-cs3-cast-performance-batch.js を転送中..."
scp "$SHIFT_SYNC_DIR/scripts/95-cs3-cast-performance-batch.js" \
    "${VPS_USER}@${VPS_IP}:${VPS_BASE}/scripts/95-cs3-cast-performance-batch.js"
echo "✅ 転送完了"

# ─── Step 3: systemd サービスファイルを作成 ──────────────────────────
echo ""
echo "⚙️  Step 3: systemd サービス設定中..."

NODE_BIN=$(ssh "${VPS_USER}@${VPS_IP}" "which node || which nodejs")

ssh -T "${VPS_USER}@${VPS_IP}" bash <<EOF
set -e

# data ディレクトリ確認
mkdir -p ${VPS_BASE}/data

# ログディレクトリ
mkdir -p /var/log/shift-sync

cat > /etc/systemd/system/${SERVICE_NAME}.service <<UNIT
[Unit]
Description=KIJ CS3 Reservation Sync Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${VPS_USER}
WorkingDirectory=${VPS_BASE}
ExecStart=${NODE_BIN} ${VPS_BASE}/scripts/cs3-sync-daemon.js
Restart=on-failure
RestartSec=15
StandardOutput=append:/var/log/shift-sync/daemon.log
StandardError=append:/var/log/shift-sync/daemon-error.log

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

echo "✅ systemd サービス登録・起動完了"
echo ""
echo "状態確認:"
systemctl status ${SERVICE_NAME} --no-pager -l | head -20
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ VPS デーモン移設完了"
echo ""
echo "確認コマンド（VPS上）:"
echo "  systemctl status ${SERVICE_NAME}"
echo "  tail -f /var/log/shift-sync/daemon.log"
echo ""
echo "Mac デーモンを停止する場合:"
echo "  bash scripts/uninstall-daemon.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
