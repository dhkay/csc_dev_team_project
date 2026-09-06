# 로컬 네트워크 SSH 접속 가이드

## 개요

같은 LAN(로컬 네트워크)에 있을 때, SSH 별칭으로 내부 서버에 바로 접속할 수 있다.
IP 를 외울 필요 없이 `ssh <별칭>` 형태로 접속한다.

> **전제:** 접속하는 클라이언트가 서버와 **같은 사설 네트워크**에 있어야 한다.
> 아래 주소는 모두 RFC1918 사설 IP 로, 외부망에서는 라우팅되지 않는다.

---

## 서버 목록

| 별칭 | 사설 IP | 용도 |
|------|---------|------|
| `web-server` | 192.168.0.26 | 웹/LLM/DB |
| `video-ai-server` | 192.168.0.28 | 영상/GPU 컴퓨트 |

---

## 클라이언트 설정 (`~/.ssh/config`)

각 개발자의 로컬 머신 SSH 설정 파일(`~/.ssh/config`, Windows 는 `C:\Users\<사용자>\.ssh\config`)에 아래 항목을 추가한다.

```ssh-config
# 같은 LAN 내 서버
Host web-server
    HostName 192.168.0.26
    User <접속_계정>
    Port 22

# 영상/GPU 노드
Host video-ai-server
    HostName 192.168.0.28
    User <접속_계정>
    Port 22
```

> `User`, 자격증명(비밀번호/키)은 개인 로컬 설정이므로 **저장소에 커밋하지 않는다.**

---

## 사용법

```bash
ssh web-server        # → 192.168.0.26
ssh video-ai-server   # → 192.168.0.28
```

### 최초 접속 시 호스트 키 등록

처음 접속하면 호스트 키 검증 프롬프트가 뜹니다. `yes` 로 수락하면 `~/.ssh/known_hosts` 에 등록된다.
스크립트/비대화 환경에서는 미리 등록할 수 있다.

```bash
ssh-keyscan -H 192.168.0.26 192.168.0.28 >> ~/.ssh/known_hosts
```

### 접속 시 터미널 탭 제목에 별칭 표시 (선택)

`LocalCommand` 로 접속할 때 터미널 탭/창 제목을 별칭으로 바꿔 두면, 여러 서버에
동시에 접속했을 때 어느 탭이 어느 서버인지 한눈에 구분된다. 서버 변경 없이
로컬 `~/.ssh/config` 만 수정한다.

```ssh-config
Host web-server
    HostName 192.168.0.26
    User <접속_계정>
    Port 22
    PermitLocalCommand yes
    LocalCommand printf "\033]0;web-server\007"
```

> `LocalCommand` 는 로컬 셸로 실행된다. `printf` 가 있는 셸(bash, git-bash, zsh 등)에서
> 동작하며, PowerShell/cmd 에서 Windows 기본 OpenSSH 로 접속하면 `printf` 가 없어
> 동작하지 않는다. 이 경우 git-bash 등에서 접속한다.

### 비밀번호 없이 접속 (공개키 인증)

로컬 공개키를 서버에 등록하면 비밀번호 입력 없이 접속된다.

```bash
ssh-copy-id web-server      # 공개키를 서버 authorized_keys 에 등록
```

> Windows 에 `ssh-copy-id` 가 없으면, 로컬 공개키(`~/.ssh/id_ed25519.pub`) 내용을
> 서버의 `~/.ssh/authorized_keys` 에 직접 추가한다.

---

## 트러블슈팅

| 증상 | 원인 / 대응 |
|------|------------|
| `Host key verification failed` | 호스트 키 미등록: 위 `ssh-keyscan` 으로 등록하거나 프롬프트에서 `yes` |
| `Permission denied (publickey,password)` | 연결은 정상, 인증 실패: 계정/키/비밀번호 확인 |
| `Connection reset` | 짧은 시간 반복 접속으로 인한 rate-limit(fail2ban 등) 가능성: 잠시 후 재시도 |
| `Connection timed out` | 같은 LAN 에 있는지, 서버 전원/네트워크 상태 확인 |

---

## 참고 정보 (설정 시 알아둘 점)

실제 키 등록 과정에서 확인된 환경별 주의사항이다.

### fail2ban 재차단 루프

두 서버 모두 `fail2ban` 이 SSH 인증 실패를 감지하면 클라이언트 IP 를 즉시 차단한다.
계정/비밀번호를 잘못 넣은 시도가 몇 번 쌓이면, 그 이후 정상 시도까지 `Connection reset`/
`timed out`/`aborted by server` 로 막혀 **시도할수록 차단이 길어지는 루프**에 빠집니다.

- 일시 해제: `sudo fail2ban-client set sshd unbanip <클라이언트_IP>` (jail 명이 다르면 `sudo fail2ban-client unban <클라이언트_IP>`)
- 영구 예방(권장): 내부 LAN 대역을 화이트리스트에 등록: 사설망 한정이라 안전

```bash
echo -e '[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 192.168.0.0/24' \
  | sudo tee /etc/fail2ban/jail.d/lan-whitelist.conf
sudo systemctl reload fail2ban
```

> 인증을 반복 시도하는 작업(키 등록 등) 전에는 LAN 화이트리스트가 적용돼 있는지 먼저 확인한다.

### OpenSSH 10.x 와 일부 SSH 라이브러리 핸드셰이크 비호환

OpenSSH 10.x 서버는 구형 KEX/알고리즘을 제거해서, 오래된 SSH 라이브러리(예: PowerShell
`Posh-SSH`/SSH.NET)로는 핸드셰이크가 `aborted`/`timeout` 으로 실패할 수 있다.
이 경우 **OS 기본 OpenSSH 클라이언트(`ssh`)로 등록**한다.

비대화(스크립트) 환경에서 비밀번호 인증이 필요하면, 터미널 없이도 동작하는 `SSH_ASKPASS` 방식을 사용한다.

```bash
ASKPASS="$(mktemp)"
printf '#!/bin/sh\necho "$SSH_PW"\n' > "$ASKPASS" && chmod +x "$ASKPASS"
PUB="$(cat ~/.ssh/id_ed25519.pub)"
SSH_PW='<비밀번호>' SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:0 \
  ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no -o StrictHostKeyChecking=accept-new \
  <계정>@<IP> \
  "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && grep -qxF \"$PUB\" ~/.ssh/authorized_keys || echo \"$PUB\" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys" < /dev/null
rm -f "$ASKPASS"
```

---

## 참고

- 외부망(WAN)에서의 접속, 운영 서버 배포 흐름 등 인프라 상세는 별도 비공개 문서/시크릿으로 관리한다.
- 사설 IP, 포트만 본 문서에 기재하고, 공인 IP, 계정, 키 등 민감 정보는 기재하지 않는다.