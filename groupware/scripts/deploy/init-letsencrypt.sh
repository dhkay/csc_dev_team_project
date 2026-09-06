#!/usr/bin/env bash
# cscuniverse.com Let's Encrypt 인증서 최초 발급 부트스트랩 (HTTP-01 webroot).
#
# web-server prod 클론에서 "1회만" 실행한다. 이후 갱신은 certbot 데몬이 자동 처리.
# nginx 는 인증서 파일이 없으면 기동에 실패하므로, 더미(self-signed) 인증서로 먼저
# 띄운 뒤 실제 인증서를 발급받고 교체한다.
#
# 사전 조건(반드시 충족):
#   1) DNS: cscuniverse.com A 레코드 → 사무실 공인 IP (가비아) 전파 완료
#   2) 라우터: 80,443 → 192.168.0.26 포트포워딩 (HTTP-01 검증에 80 인바운드 필수)
#      → 포트 80 은 라우터에서 IP 제한하지 말 것 (LE 검증 서버가 들어와야 함)
#
# 사용:
#   bash scripts/deploy/init-letsencrypt.sh [email]
#   STAGING=1 bash scripts/deploy/init-letsencrypt.sh [email]   # LE 스테이징(레이트리밋 회피 테스트)
set -euo pipefail

# 모노레포 루트 기준 경로 해석 (스크립트 위치 무관하게 동작).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE="$REPO_ROOT/infra/docker/prod/web/docker-compose.yml"

# 단일 인증서(PRIMARY)에 모든 vhost 를 SAN 으로 포함한다. 한 nginx 가 apex/admin/staging 을
# 모두 서빙하고 전부 이 인증서를 참조하므로(conf 의 ssl_certificate live/cscuniverse.com).
#   - cscuniverse.com / www        : prod groupware
#   - admin.cscuniverse.com        : prod control-tower(플랫폼)
#   - api-docs.cscuniverse.com     : prod 통합 API 문서 포털(scalar-gateway)
#   - staging.cscuniverse.com      : staging groupware
#   - staging-admin.cscuniverse.com: staging control-tower(플랫폼)
#   - staging-api-docs.cscuniverse.com: staging 통합 API 문서 포털
# 도메인 추가/변경 시 이 목록만 고치고 재실행하면 certbot 이 인증서를 expand 한다.
DOMAINS=(
  cscuniverse.com
  www.cscuniverse.com
  admin.cscuniverse.com
  api-docs.cscuniverse.com
  staging.cscuniverse.com
  staging-admin.cscuniverse.com
  staging-api-docs.cscuniverse.com
)
PRIMARY="cscuniverse.com"
EMAIL="${1:-csc@csc.kr}"
CERT_DIR="/etc/letsencrypt/live/$PRIMARY"

dc() { docker compose -f "$COMPOSE" "$@"; }

# 0) 접근 허용 목록: repo 에는 example 만 있고 실파일은 서버 전용(gitignore).
#    없으면 example 로 생성한다. 공인 IP 는 직접 교체해야 외부(공인 IP) 접근이 열린다.
#    (미교체 상태여도 사내 LAN(192.168.0.0/24)은 허용되어 office 접속은 동작)
SNIPPET_DIR="$REPO_ROOT/infra/nginx/snippets"
if [ ! -f "$SNIPPET_DIR/cscuniverse-allow.conf" ]; then
  echo "0) 접근 허용 목록 생성 (example → 실파일)"
  cp "$SNIPPET_DIR/cscuniverse-allow.conf.example" "$SNIPPET_DIR/cscuniverse-allow.conf"
  echo "  $SNIPPET_DIR/cscuniverse-allow.conf 의 공인 IP(203.0.113.1)를 실제 사무실 공인 IP로 교체할 것."
fi

echo "1) 더미 인증서 생성 (nginx 기동용)"
dc run --rm --entrypoint sh certbot -c "
  mkdir -p '$CERT_DIR'
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$CERT_DIR/privkey.pem' \
    -out    '$CERT_DIR/fullchain.pem' \
    -subj '/CN=$PRIMARY'"

echo "2) nginx 기동 (포트 80/443 점유, ACME webroot 준비)"
dc up -d nginx
sleep 3

echo "3) 더미 인증서 제거 (certbot 가 깨끗이 발급하도록)"
dc run --rm --entrypoint sh certbot -c "
  rm -rf /etc/letsencrypt/live/$PRIMARY \
         /etc/letsencrypt/archive/$PRIMARY \
         /etc/letsencrypt/renewal/$PRIMARY.conf"

echo "4) 실제 인증서 발급 (HTTP-01)"
staging_arg=""
[ "${STAGING:-0}" = "1" ] && staging_arg="--staging"
domain_args=()
for d in "${DOMAINS[@]}"; do domain_args+=(-d "$d"); done
# certbot 서비스는 entrypoint 가 자동갱신 데몬 루프이므로, 1회 발급 시 --entrypoint certbot 로 덮어쓴다.
dc run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  "${domain_args[@]}" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive $staging_arg

echo "5) nginx 리로드 (실제 인증서 적용)"
dc exec nginx nginx -s reload

echo "6) certbot 자동갱신 데몬 기동"
dc up -d certbot

echo "완료: https://$PRIMARY (허용 IP에서 접속 확인)"
echo "  인증서 위치(named volume certbot_certs): $CERT_DIR"
echo "  갱신: certbot 데몬이 12h 마다 점검, nginx 가 6h 마다 self-reload 로 무중단 반영"
