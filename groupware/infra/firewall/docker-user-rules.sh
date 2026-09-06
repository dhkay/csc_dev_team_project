#!/usr/bin/env bash
# DOCKER-USER 크로스호스트 포트 출처 제한 (멱등, flush→rebuild).
#
# Docker 가 퍼블리시한 포트는 iptables DNAT/FORWARD 로 처리돼 ufw INPUT 을 우회한다.
# 따라서 출처 제한은 이 DOCKER-USER 체인에서 한다. `--ctorigdstport` 는 DNAT 이전
# 원본(=퍼블리시) 포트를 매칭하므로 컨테이너 내부 포트가 겹쳐도(모두 8000) 정확히 구분한다.
#
# 설정은 /etc/docker-user-firewall.conf (harden-firewall.sh 가 기록):
#   ROLE=ai|web  PEER=<peer ip>  PEER_PORTS="..."  LOCAL_PORTS="..."
# systemd(docker-user-firewall.service)가 도커 기동/재시작 후 `apply` 로 재적용한다.
set -euo pipefail

CONF="${DOCKER_USER_CONF:-/etc/docker-user-firewall.conf}"

load_conf() {
  [ -r "$CONF" ] || { echo "docker-user-rules: missing $CONF" >&2; exit 1; }
  # shellcheck disable=SC1090
  . "$CONF"
  : "${PEER:?}" "${ROLE:?}"
  PEER_PORTS="${PEER_PORTS:-}"
  LOCAL_PORTS="${LOCAL_PORTS:-}"
}

# $1=iptables|ip6tables  $2=loopback cidr(127.0.0.0/8 | ::1)
apply_chain() {
  local ipt="$1" loop="$2"
  "$ipt" -nL DOCKER-USER >/dev/null 2>&1 || "$ipt" -N DOCKER-USER 2>/dev/null || true
  "$ipt" -F DOCKER-USER
  "$ipt" -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
  local p
  for p in $PEER_PORTS; do
    # 피어(IPv4)만 허용: ip6tables 에는 IPv4 PEER 를 넣지 않는다(::1 만 허용, 나머지 DROP).
    if [ "$ipt" = iptables ]; then
      "$ipt" -A DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" -s "$PEER" -j RETURN
    fi
    "$ipt" -A DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" -s "$loop" -j RETURN
    "$ipt" -A DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" -j DROP
  done
  for p in $LOCAL_PORTS; do
    "$ipt" -A DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" -s "$loop" -j RETURN
    "$ipt" -A DOCKER-USER -p tcp -m conntrack --ctorigdstport "$p" -j DROP
  done
  # 그 외 전부 통과: nginx 80/443 등 목록에 없는 포트는 기존 동작 유지.
  "$ipt" -A DOCKER-USER -j RETURN
}

reset_chain() {
  local ipt="$1"
  command -v "$ipt" >/dev/null 2>&1 || return 0
  "$ipt" -F DOCKER-USER 2>/dev/null || true
  "$ipt" -A DOCKER-USER -j RETURN 2>/dev/null || true
}

case "${1:-apply}" in
  apply)
    load_conf
    apply_chain iptables 127.0.0.0/8
    command -v ip6tables >/dev/null 2>&1 && apply_chain ip6tables ::1 || true
    ;;
  flush)
    reset_chain iptables
    reset_chain ip6tables
    ;;
  *)
    echo "usage: $0 apply|flush" >&2; exit 2;;
esac
