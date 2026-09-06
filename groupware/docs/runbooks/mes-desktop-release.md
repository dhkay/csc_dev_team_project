# 런북: MES 현장 PC 앱 릴리스

> 컨테이너 배포(`scripts/deploy/deploy.sh`)와 **완전히 다른 파이프라인**이다.
> 워크플로: `.github/workflows/release-desktop.yml`

## 0. Phase 0 현재 상태

지금은 **번들링이 꺼져 있다.** `src-tauri/tauri.conf.json` 의 `bundle.active` 가 `false` 다.
아이콘 자산과 업데이터 서명키가 아직 없기 때문이고, Phase 0 의 검증 기준은 `tauri dev` 로
창이 뜨는 것까지다.

Phase 1 에서 번들링을 켤 때 함께 해야 하는 일(이 순서대로):

1. 아이콘 생성: `pnpm --filter "@csc/desktop-mes" exec tauri icon <source.png>`
2. `bundle.active` 를 `true` 로
3. 업데이터 서명키 생성과 등록(아래 2절)
4. `tauri.conf.json` 에 `plugins.updater` 블록과 공개키 추가

---

## 1. 릴리스 절차

```bash
# 1. 버전 올리기: 세 곳이 같아야 한다.
#    apps/desktop/mes/package.json          (vite 가 X-Client-Version 으로 주입)
#    apps/desktop/mes/src-tauri/Cargo.toml  (workspace.package.version)
#    apps/desktop/mes/src-tauri/tauri.conf.json
vi apps/desktop/mes/package.json

# 2. 태그 push. 이게 유일한 트리거다.
git tag mes-desktop-v1.4.2
git push origin mes-desktop-v1.4.2
```

워크플로가 잡 둘로 나뉜다.

| 잡 | 러너 | 하는 일 |
|---|---|---|
| `build` | windows-latest (GitHub-hosted) | pnpm install -> 프론트 빌드 -> `tauri build` -> 아티팩트 업로드 |
| `publish` | self-hosted, web-server | 아티팩트 다운로드 -> `~/Releases/<channel>/<version>/` 배치 -> `latest.json` 원자적 교체 |

**왜 둘로 나눴나:** Windows 빌드는 GitHub-hosted 러너가 필요한데 그 러너는 LAN 안의
web-server 에 SSH 로 닿지 않는다. 반대로 self-hosted 러너는 리눅스뿐이라 Windows 빌드를 못 한다.

**왜 태그 트리거인가:** Rust 빌드는 캐시가 있어도 5분에서 15분이다. 브랜치 push 마다 돌리면
`checks.yml` 의 반응성이 무너진다. PR 단계 안전망은 `checks.yml` 의 `desktop-rust` 잡
(리눅스, 라이브러리 crate 만, 번들링 없음)이 담당한다.

---

## 2. 서명 두 종류 (혼동 금지)

| 종류 | 목적 | 없으면 | Phase | 시크릿 |
|---|---|---|---|---|
| **업데이터 서명**(minisign) | Tauri updater 가 번들 무결성 검증 | **자동 업데이트 기능 자체가 성립하지 않음** | 1 필수 | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| **코드 서명**(Authenticode) | Windows SmartScreen 경고 제거 | 설치 시 경고 1회(설치는 가능) | 2 | `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD` |

### 업데이터 키 생성과 보관

```bash
pnpm --filter "@csc/desktop-mes" exec tauri signer generate -w ~/.tauri/mes-desktop.key
```

> **비밀키를 잃으면 기존 설치본 전체가 영구히 업데이트 불가가 된다.**
> 되살릴 방법이 없다. 각 PC 를 사람이 방문해 재설치하는 것 외에는.

보관 규칙:

- **공개키**는 `tauri.conf.json` 에 커밋한다(비밀이 아니다).
- **비밀키**는 GitHub Secrets + **오프라인 백업 2벌**(서로 다른 물리 위치).
- 백업 위치와 담당자를 이 문서가 아니라 팀 시크릿 저장소에 기록한다.

코드 서명 인증서는 조달 리드타임이 있어 Phase 2 로 미룬다. Phase 1 은 미서명 + 사내 배포로
시작하고 SmartScreen 1회 경고를 감수한다.

---

## 3. 채널

디렉터리로 분리한다. DB 도 관리 화면도 필요 없다.

```
~/Releases/
├── dev/
│   ├── latest.json
│   └── 1.4.2/
├── staging/
└── prod/
```

- 채널 승격 = 파일 복사 + `latest.json` 갱신.
- 앱은 빌드 시점 `PUBLIC_UPDATE_CHANNEL` 로 기본 엔드포인트를 정하되, **런타임
  `config.json` 의 `updateEndpoint` 가 항상 우선한다.**

### nginx 노출 (Phase 1)

Phase 0 에서는 아직 열지 않았다(배포할 번들이 없다). Phase 1 에서 기존 nginx 컨테이너에
읽기 전용 볼륨 하나를 더 붙인다. 새 서비스, 새 DB, 새 도메인, 새 인증서 SAN 이 전부 0개다.

```yaml
# infra/docker/{staging,prod}/web/docker-compose.yml 의 nginx 서비스
volumes:
  - ${DESKTOP_RELEASE_DIR:-/home/csc/Releases}:/srv/releases:ro
```

```nginx
# infra/nginx/conf.d/cscuniverse.conf 의 443 server 블록 안
location /desktop/ {
    alias /srv/releases/prod/;
    include /etc/nginx/snippets/cscuniverse-allow.conf;  # 사무실/공장 IP 한정
    autoindex off;
    add_header Cache-Control "no-cache" always;          # latest.json 이 캐시되면 안 된다
}
```

---

## 4. 롤백 (가장 오해가 많은 지점)

> **Tauri updater 는 다운그레이드를 하지 않는다.**

`latest.json` 을 이전 버전으로 되돌리면:

| 대상 | 결과 |
|---|---|
| 아직 업데이트 안 한 PC | 구버전에 고정된다 (효과 있음) |
| 이미 올라간 PC | **아무 일도 일어나지 않는다** |

그래서 실질 절차는 2단이다.

1. **확산 중단 (1분)**: `latest.json` 을 직전 정상 버전으로 되돌린다.
   ```bash
   cd ~/Releases/prod
   tmp=$(mktemp)
   printf '{"version":"1.4.1","pub_date":"%s","notes":""}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
   mv "$tmp" latest.json     # 원자적 교체. 제자리에서 쓰면 폴링 중인 PC 가 잘린 JSON 을 받는다
   ```
2. **이미 올라간 PC 복구**: 되돌린 코드로 **버전만 올린 hotfix(N+1)를 재릴리스**한다.
   **버전 번호는 절대 재사용하지 않는다.**

"버전 되돌리면 되겠지" 로 착각한 채 장애를 만나면 현장이 몇 시간 멈춘다.

---

## 5. 폐쇄망 배포

인터넷 없는 공장은 예외가 아니라 기본값에 가깝다. 셋 다 준비되어 있다.

### 5-1. 오프라인 설치 (USB 반입)

릴리스가 GitHub Release 에 이미 올라가므로 추가 작업이 없다. 번들과 `.sig` 를 함께 반입한다.

### 5-2. 사내 업데이트 서버

공장 안 아무 PC 에 `latest.json` + 번들 디렉터리를 두고 정적 서빙하면 성립한다.
updater 는 GET 두 번이 전부라 `python -m http.server` 로도 동작한다. 우리 인프라를 공장에
복제할 필요가 없다.

필요한 것은 각 단말의 `config.json` 한 줄뿐이다.

```jsonc
{ "updateEndpoint": "http://192.168.10.5:8080/latest.json" }
```

### 5-3. 서버 자체가 공장 안 (온프렘 납품)

`config.json` 의 `apiBaseUrl` 을 공장 내 csc-mes 주소로 바꾼다. 바이너리는 동일하다.

### WebView2 런타임

구형 PC 는 WebView2 가 없을 수 있고, 그러면 설치가 실패한다.

- 인터넷 있는 사이트: Evergreen Bootstrapper 를 설치 프로그램에 동봉.
- 폐쇄망: Fixed Version 배포.
- **도입 전 현장 PC 사전 조사 항목이다.**

---

## 6. 릴리스 체크리스트

- [ ] 버전 3곳 일치 (package.json / Cargo.toml / tauri.conf.json)
- [ ] `docs/specs/mes-client-compatibility.md` 의 릴리스 전 체크리스트 통과
- [ ] `MIN_SUPPORTED_CLIENT` 를 올렸다면 그 아래 버전 단말이 현장에 없는지 확인
- [ ] 로컬 스키마 마이그레이션이 있다면 백업 동작을 dev 에서 확인
- [ ] dev 채널로 먼저 올려 최소 1대에서 자동 업데이트 성공 확인
- [ ] 교대 시간을 피해 prod 채널 승격 (교대 중 재시작은 라인을 세운다)
- [ ] 롤백 절차(4절)를 실행할 사람이 대기 중인지
