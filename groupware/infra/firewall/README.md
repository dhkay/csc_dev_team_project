# 방화벽 하드닝 (ufw + DOCKER-USER)

web-server / video-ai-server 의 **크로스호스트 Docker 포트를 피어 서버 출처로만 제한**하고 SSH, 공개
포트는 유지한다. "기존 동작 불변"을 위해 **롤백 타이머**로 무장한 뒤 적용하고, 검증 통과 시에만
`--commit`(영속화)한다.

## 왜 ufw 만으로 안 되나

Docker 가 퍼블리시한 포트(`-p 8010:8000` 등)는 iptables DNAT/FORWARD 로 처리돼 **ufw 의 INPUT
규칙을 우회**한다. 그래서 출처 제한은 `ufw allow/deny` 가 아니라 **`DOCKER-USER` 체인**에서
`--ctorigdstport`(퍼블리시된 원본 포트)로 매칭해 수행한다. 두 계층을 함께 쓴다:

- **ufw**: 호스트 서비스(SSH 등) 보호(INPUT). `DEFAULT_FORWARD_POLICY=ACCEPT` 로 Docker 포워딩은 건드리지 않는다.
- **DOCKER-USER**: 크로스호스트 Docker 포트의 출처 제한(실제 핵심). nginx 80/443 은 목록에 없어 **공개 유지**.

## 포트맵

| 역할(`--role`) | 피어(`--peer`) | 피어만 허용 | 로컬만 허용 | 공개 유지 |
|---|---|---|---|---|
| `ai` (192.168.0.28) | web `192.168.0.26` | 8000, 8010(vllm) 8090, 8091(metrics-agent) | 없음 | SSH 22 |
| `web` (192.168.0.26) | ai `192.168.0.28` | 6379, 6380(redis) 8001, 8002, 9001, 9002(file/video) | 8003(language-model) | SSH 22, **80, 443** |

## 사용법

```bash
# 서버에 이 디렉터리(infra/firewall/)를 두고 실행. video-ai-server 먼저 → web-server.
sudo ./harden-firewall.sh --role ai  --peer 192.168.0.26 --rollback 600   # 적용(10분 자동원복 무장)
#   … 아래 "검증" 수행 …
sudo ./harden-firewall.sh --commit                                        # OK 면: 타이머 취소 + 영속화
#   문제 시:
sudo ./harden-firewall.sh --rollback-now                                  # 즉시 원복 (또는 10분 대기)

sudo ./harden-firewall.sh --role ai --peer 192.168.0.26 --dry-run          # 적용 없이 규칙 미리보기
```

web-server 는 `--role web --peer 192.168.0.28` 로 동일 절차.

## 검증 (기존 동작 불변: 롤백 창 안에)

```bash
# 1) SSH 유지: 새 터미널에서
ssh <host> true

# 2) 크로스호스트 정상(피어에서):
#    web-server 에서:  nc -z -w3 192.168.0.28 8010     # 공유 csc-ai-vllm 도달 OK
#    video-ai-server 에서:   nc -z -w3 192.168.0.26 6379 && nc -z -w3 192.168.0.26 8001   # staging redis/file OK
docker logs --since 3m csc-staging-media-worker 2>&1 | grep -iE 'error|refused' || echo "worker 로그 신규 에러 없음"

# 3) 공개 유지(web): 아무 데서나
curl -ksS https://<web-domain> -o /dev/null -w '%{http_code}\n'           # 200대

# 4) 제한 실효(비피어 = 내 PC 등에서): 전부 실패/타임아웃이어야 정상
nc -z -w3 192.168.0.28 8010;  nc -z -w3 192.168.0.26 6379;  nc -z -w3 192.168.0.26 8003
#    서버 로컬에서는 성공:  curl -s localhost:8003 >/dev/null && echo local-ok

# 5) 규칙 확인
sudo iptables -S DOCKER-USER
```

## 영속화 / 내성

- `--commit` 이 `docker-user-firewall.service`(systemd, `After/PartOf=docker.service`)를 설치, enable →
  **재부팅, `systemctl restart docker` 후에도 DOCKER-USER 규칙 재적용**. ufw 는 네이티브로 재부팅 유지.
- 도커 재시작 내성 확인:
  ```bash
  sudo systemctl restart docker && sleep 5 && sudo iptables -S DOCKER-USER   # 규칙 재존재
  ```
- 설정 SSOT: `/etc/docker-user-firewall.conf` (ROLE/PEER/포트). 포트 변경 시 이 파일 수정 후
  `sudo /usr/local/sbin/docker-user-rules.sh apply`.

## 주의

- **롤백 타이머 먼저** 무장되므로, SSH 가 끊겨도 `--rollback` 초(기본 600) 뒤 자동 원복된다.
- IPv6: 피어 통신은 IPv4. v6 노출은 ufw v6 deny(INPUT) + ip6 DOCKER-USER DROP 으로 이중 차단.
- fail2ban 과 공존 가능(자체 f2b 체인은 INPUT 유지). 적용 후 `sudo iptables -S | grep f2b` 로 확인.
- 새 크로스호스트 포트가 생기면 포트맵(`harden-firewall.sh`)과 `/etc/docker-user-firewall.conf` 에 추가.
