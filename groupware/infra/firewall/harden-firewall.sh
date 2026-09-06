#!/usr/bin/env bash
# 방화벽 하드닝 오케스트레이터: ufw(호스트 INPUT) + DOCKER-USER(크로스호스트 Docker 포트 출처 제한).
# "기존 동작 불변"이 최우선: 롤백 타이머로 무장한 뒤 적용하고, 검증 통과 시에만 --commit(영속화).
#
# 사용:
#   sudo ./harden-firewall.sh --role ai  --peer 192.168.0.26 [--rollback 600] [--dry-run]
#   sudo ./harden-firewall.sh --role web --peer 192.168.0.28 [--rollback 600] [--dry-run]
#   sudo ./harden-firewall.sh --commit         # 롤백 타이머 취소 + 영속화(systemd) 설치, enable
#   sudo ./harden-firewall.sh --rollback-now    # 즉시 원복(ufw disable + DOCKER-USER 초기화)
#
# 포트맵(고정):
#   ai  : peer(web)만 → 8000 8090 8091  (8010 vLLM 은 web-server 로 이전됨; ComfyUI 8188 은 로컬 워커만 → allowlist 불요)
#   web : peer(ai)만  → 6379 6380 8001 8002 9001 9002 ; 로컬만 → 8003 8010(127.0.0.1 vLLM) ; 80/443 공개 유지
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SELF_DIR="$(dirname "$SELF")"
PIDFILE=/run/fw-rollback.pid
LOG=/var/log/fw-rollback.log
CONF=/etc/docker-user-firewall.conf
RULES_SRC="$SELF_DIR/docker-user-rules.sh"
RULES_DST=/usr/local/sbin/docker-user-rules.sh
UNIT_SRC="$SELF_DIR/docker-user-firewall.service"
UNIT_DST=/etc/systemd/system/docker-user-firewall.service

ROLE=""; PEER=""; ROLLBACK=600; DRYRUN=0; MODE=apply
while [ $# -gt 0 ]; do
  case "$1" in
    --role) ROLE="${2:-}"; shift 2;;
    --peer) PEER="${2:-}"; shift 2;;
    --rollback) ROLLBACK="${2:-}"; shift 2;;
    --dry-run) DRYRUN=1; shift;;
    --commit) MODE=commit; shift;;
    --rollback-now) MODE=rollback; shift;;
    -h|--help) grep -E '^#' "$SELF" | sed 's/^# \{0,1\}//'; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

need_root() { [ "$(id -u)" = 0 ] || { echo "run as root (sudo)"; exit 1; }; }

port_map() {
  case "$ROLE" in
    ai)  PEER_PORTS="8000 8090 8091"; LOCAL_PORTS="";;
    web) PEER_PORTS="6379 6380 8001 8002 9001 9002"; LOCAL_PORTS="8003 8010";;
    *) echo "--role must be ai|web" >&2; exit 2;;
  esac
}

do_rollback() {
  ufw --force disable || true
  for ipt in iptables ip6tables; do
    command -v "$ipt" >/dev/null 2>&1 || continue
    "$ipt" -F DOCKER-USER 2>/dev/null || true
    "$ipt" -A DOCKER-USER -j RETURN 2>/dev/null || true
  done
  echo "rolled back: ufw disabled, DOCKER-USER reset to default (RETURN)."
}

cancel_timer() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "rollback timer cancelled."
  fi
}

case "$MODE" in
  rollback)
    need_root; cancel_timer; do_rollback; exit 0;;
  commit)
    need_root; cancel_timer
    [ -r "$CONF" ] || { echo "no $CONF — run apply first"; exit 1; }
    install -m 0755 "$RULES_SRC" "$RULES_DST"
    install -m 0644 "$UNIT_SRC" "$UNIT_DST"
    systemctl daemon-reload
    systemctl enable --now docker-user-firewall.service
    systemctl enable ufw >/dev/null 2>&1 || true
    echo "committed: persistence installed (docker-user-firewall.service enabled) + ufw enabled at boot."
    exit 0;;
esac

# ---------- apply ----------
port_map
[ -n "$PEER" ] || { echo "--peer required"; exit 2; }

if [ "$DRYRUN" = 1 ]; then
  echo "== DRY RUN (role=$ROLE peer=$PEER rollback=${ROLLBACK}s) =="
  echo "[ufw] DEFAULT_FORWARD_POLICY=ACCEPT; default deny incoming / allow outgoing; allow 22/tcp; allow in on lo"
  [ "$ROLE" = web ] && echo "[ufw] allow 80/tcp; allow 443/tcp (nginx 공개 유지)"
  echo "[DOCKER-USER] peer($PEER) 만 허용 → 포트: $PEER_PORTS"
  [ -n "$LOCAL_PORTS" ] && echo "[DOCKER-USER] 로컬만 허용 → 포트: $LOCAL_PORTS"
  echo "[DOCKER-USER] 그 외 포트(80/443 등)는 무변경(공개 유지)"
  exit 0
fi

need_root
[ -r "$RULES_SRC" ] || { echo "missing $RULES_SRC (배포 시 함께 전송할 것)"; exit 1; }

# 1) 롤백 타이머 먼저 무장: 세션이 끊겨도 ${ROLLBACK}s 뒤 자동 원복.
nohup bash -c "sleep $ROLLBACK; ufw --force disable; for x in iptables ip6tables; do command -v \$x >/dev/null 2>&1 && { \$x -F DOCKER-USER 2>/dev/null; \$x -A DOCKER-USER -j RETURN 2>/dev/null; }; done" >"$LOG" 2>&1 &
echo $! > "$PIDFILE"
echo ">> rollback armed: 문제가 없으면 ${ROLLBACK}s 안에 'sudo $0 --commit' 실행. (자동 원복 pid $(cat "$PIDFILE"))"

# 2) ufw 베이스라인: Docker FORWARD 는 ACCEPT 로 두고 필터는 DOCKER-USER 가 담당.
sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow in on lo
if [ "$ROLE" = web ]; then ufw allow 80/tcp; ufw allow 443/tcp; fi
ufw --force enable

# 3) DOCKER-USER 규칙: 설정 기록 후 적용.
cat > "$CONF" <<EOF
# managed by harden-firewall.sh: 재적용: /usr/local/sbin/docker-user-rules.sh apply
ROLE=$ROLE
PEER=$PEER
PEER_PORTS="$PEER_PORTS"
LOCAL_PORTS="$LOCAL_PORTS"
EOF
install -m 0755 "$RULES_SRC" "$RULES_DST"
"$RULES_DST" apply

echo ">> applied (role=$ROLE). 이제 검증하세요:"
echo "   - SSH 새 세션 유지 / 피어에서 크로스호스트 nc / 비피어에서 차단 확인"
echo "   - OK → sudo $0 --commit    |    문제 → sudo $0 --rollback-now (또는 ${ROLLBACK}s 대기)"
