# 파일 업로드 제한 정책

> **서버 분리**
> - **파일 업로드 / 스토리지** = `file-upload` (FastAPI). presigned URL 발급, 업로드 확인, 다운로드 서빙을 담당하며 **FFmpeg/영상 처리는 하지 않는다.**
> - **영상 처리(FFmpeg/트랜스코딩)** = `video-model` (FastAPI, 마케팅 영상 제작 자동화). 업로드된 영상 객체를 받아 H.264/AAC 등으로 처리한다.
>
> **1차 스토리지(중간/작업) = 서버 로컬 파일시스템** (호스트 `storage/` 폴더를 컨테이너에 마운트).
> 환경마다 인프라가 바뀔 수 있어 `STORAGE_BACKEND` 로 교체한다(local/NAS마운트/오브젝트). R2/S3 가 아니다.
> **2차 = 선별 아카이브(NAS, 조직별)**: 일부 파일만 선택적으로 NAS 에 추가 보관하며 NAS 대상이 조직마다
> 다를 수 있다(미구현, 아래 "스토리지 백엔드" 절 설계 참고). 1차/2차 모두 `StoragePort` 추상화로 자리 확보.
>
> presign/confirm(메타) 은 BFF(서비스토큰)로 중계하지만, **바이트 PUT 과 다운로드 GET 은 브라우저가 file-upload 로 직접**
> 호출한다(BFF 우회). 이 두 경로(`/blob`, `/files`)는 **자신이 붙은 nginx vhost 의 접근 정책을 상속**한다. prod
> groupware(apex)는 공개라 공개되고(그래도 PUT 은 서명 업로드토큰, GET 은 UUID 로 주소지정되는 자산), admin 과 staging 은 사무실 공인 IP allowlist 로 제한된다.

## 파일 크기 제한

| 파일 타입 | 최대 크기 | 지원 형식 |
|-----------|-----------|-----------|
| **이미지** | 10MB | JPEG, PNG, GIF, WebP, SVG |
| **영상** | 50MB | MP4, WebM, MOV, OGG |
| **스토리지 화면 업로드** | 200MB | 형식 제한 없음 |

> 스토리지 상한(`storage_max_upload_size`)이 따로인 이유: 그 값을 올리려고 `max_upload_size` 를
> 올리면 아바타와 마케팅 에셋 경로까지 함께 넓어진다. 브라우저 PUT(`/blob`)은 스트리밍으로
> 저장하므로 본문이 메모리에 통째로 올라가지 않는다. nginx `client_max_body_size` 는 그보다 크게
> (210m) 잡는다.

## 지원 파일 형식

### 이미지
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- SVG (.svg)

### 영상
- MP4 (.mp4)
- WebM (.webm)
- QuickTime (.mov)
- OGG (.ogg)

## 기능별 업로드 갯수 제한

| 기능 | 파일 타입 | 최대 갯수 | 업로드 방식 | 검증 위치 |
|------|----------|----------|------------|----------|
| **단일 영상 업로드** | 영상 | 1개 | 단일 업로드 | 프론트 (단일 API만 호출) |
| **갤러리 이미지** | 이미지 | 5개 | 루프 단일 업로드 | 프론트(개수 상수) + 백엔드(파일 개수 초과 검증) |
| **다중 이미지** | 이미지 | 5개 | 배치 업로드 | 프론트(개수 상수) |
| **배치 업로드 (BFF)** | 전체 | 20개 | 배치 API | BFF (SvelteKit `+server.ts` 핸들러) |
| **배치 업로드 (file-upload)** | 전체 | 50개 | 배치 API | file-upload (Pydantic 스키마 + 설정값) |

## 업로드 플로우 (2-step presign, 로컬 파일시스템)

```
1) Browser → web BFF → file-upload: presign 요청 (JSON: fileName, mimeType, fileSize, scope[, partition]) [서비스토큰, 내부]
   - scope/partition 은 BFF 가 주입(브라우저 비선택) → object_key 로 앱별/조직별 폴더 분리
     (상세, rename 안전성은 아래 "스토리지 디렉터리 구조" 참고)
   - PENDING 에셋 생성
   - presigned_url = {PUBLIC_UPLOAD_BASE_URL}/blob?token=<서명JWT, ~10분>  (브라우저용 공개 URL)
2) Browser → (nginx, vhost 접근정책) file-upload: PUT /blob?token=...  [BFF 우회, 바이트 직송]
   - 토큰 검증(uid/key/mime/size/exp) 후 본문을 {STORAGE_ROOT}/{object_key} 로 기록
3) Browser → web BFF → file-upload: confirm (uploadId) [서비스토큰, 내부]
   - 디스크에 파일 존재 확인 후 PENDING → UPLOADED, access_url(= {base}/files/{id}) 반환
4) 접근(다운로드): Browser → (nginx, vhost 접근정책) file-upload: GET /files/{uploadId}
   - UPLOADED 에셋만, 디스크에서 스트리밍(mime_type + 원본 파일명 Content-Disposition)
5) 영상인 경우 후속 처리:
   - file-upload → video-model: 영상 처리 요청 (HTTP + 서비스 토큰, objectKey 전달)
   - video-model 워커가 스토리지에서 객체를 받아 FFmpeg H.264/AAC 트랜스코딩, `/video-jobs/{job_id}` 폴링
```

> 이미지는 confirm 으로 끝난다(즉시 GET 가능). 영상만 video-model 의 FFmpeg 처리를 거친다.
> presign/confirm 은 서비스토큰(내부). PUT/GET 은 vhost 접근 정책 상속(prod apex 는 공개, admin 과 staging 은 공인 IP allowlist) + PUT 은 서명 업로드토큰으로 보호된다.

## 스토리지 디렉터리 구조

`object_key = "{scope}[/{partition}]/{uploadId}"` 로 앱별 폴더에 분리 저장된다. scope/partition 은
BFF 가 주입(브라우저 비선택), 파일명은 항상 서버 UUID(`uploadId`): traversal 차단.

**환경(env)이 1차 구분 = STORAGE_ROOT 루트**, 그 안에서 scope(platform/groupware) → partition(조직):

| env | STORAGE_ROOT | 비고 |
|-----|-------------|------|
| **dev** | 레포 내부 `Storage/dev` (상대경로 `../../../../Storage/dev`) | 로컬 pnpm 전용. `~/Storage` 미적용 예외. file-upload `.env` 로 지정 |
| **staging** | 호스트 `~/Storage/staging` → 컨테이너 `/srv/storage` (마운트) | compose `STORAGE_HOST_DIR` |
| **prod** | 호스트 `~/Storage/prod` → 컨테이너 `/srv/storage` (마운트) | compose `STORAGE_HOST_DIR` |

```
{STORAGE_ROOT = env별 루트}/
├── platform/                         # scope=platform (control-tower: 조직 로고 등)
│   └── <uuid>
└── groupware/                        # scope=groupware (groupware: 조직별 하위 분리)
    └── <orgId>/                      # partition = 불변 orgId (조직명/slug 가변이라 경로 미사용)
        ├── <uuid>                     # 조직 기본
        ├── dept/<deptId>/<uuid>       # 부서(하위조직)별: deptId=불변 departments.id
        ├── personal/<userId>/<uuid>   # 개인
        ├── storage/                   # 스토리지 화면(공통/조직/개인 파일 브라우저)
        │   ├── common/<uuid>          #   공통: 조직 전원 공용
        │   ├── dept/<deptId>/<uuid>   #   조직: 부서별
        │   └── personal/<userId>/<uuid>  # 개인
        └── video-model/...        # AI도구
```

- **env**: 스토리지 1차 구분(루트 자체). object_key 엔 넣지 않는다(루트가 곧 env). dev 만 레포 내부
  `Storage/dev`, staging/prod 는 코드 클론 밖 `~/Storage/{env}`(재배포와 무관하게 보존).
- **scope** ∈ `{platform, groupware}`: 화이트리스트(서비스에서 검증). 임의 폴더 생성 불가.
- **partition**: groupware 필수(조직별 하위 분리), platform 미사용. 반드시 **불변 id**
  (조직명/slug/부서명 은 가변: [multi-tenancy.md](./multi-tenancy.md): 경로에 쓰면 rename 시 파일 고아).
  계층은 슬래시로: 조직(`<orgId>`) → 부서(`dept/<deptId>`) 또는 개인(`personal/<userId>`) 또는 AI도구.
  **전역/조직전체 공용 버킷은 두지 않는다**: "모든 조직 접근"은 물리 버킷이 아니라 권한(플랫폼 ROOT)으로 푼다(아래 접근통제).
- **소유 인덱스(컬럼)**: 경로(object_key) 파싱에 의존하지 않도록 `upload_assets` 에 `scope`/`organization_id`/
  `department_id`/`owner_user_id` 를 컬럼으로 둔다(BFF 가 presign 에 명시 전달). "이 조직/부서의 파일
  집합"을 DB 로 조회: 조직 삭제/아카이브/복구 + 조직 스코프 접근통제의 기준. (로고 등 platform scope,
  영상 산출물처럼 경로에 orgId 가 없는 자산도 이 컬럼으로 귀속된다.)
- **uploadId**: 서버 UUID. access_url=`/files/{uuid}` 라 scope/partition, 조직명 변경과 무관하게 URL 불변.
- 하위 폴더는 업로드 시 자동 생성(스토리지 어댑터가 부모 디렉터리 `mkdir parents`).
- SVG 는 inline 서빙하되 직접 내비게이션 시 스크립트 실행을 CSP 로 차단(`<img>` 로드는 원래 미실행).

### 스토리지 화면 (공통 / 조직 / 개인 파일 브라우저)

groupware `/[orgSlug]/admin/storage` 가 쓰는 표면이다. **전 조직원**이 들어오며, 세 영역은 전부
한 조직 안에 있다. 공통은 조직 전원 공용, 조직은 부서별, 개인은 본인만이다.

- **스토리지 자산의 표시는 `upload_assets.storage_area`** 다(`COMMON`/`DEPARTMENT`/`PERSONAL`).
  이 값이 NULL 이면 스토리지 화면의 것이 아니다. 아바타, 조직 로고, 마케팅 씬 이미지, 영상 산출물은
  `/uploads/presign` 으로 들어오고 그 경로에는 이 값을 넣을 방법이 없어 **구조적으로** 섞이지 않는다.
- **인가는 BFF 가 판정하고 file-upload 가 집행한다.** BFF 가 세션과 `/user-api/org/directory` 에서
  영역, 지금 보는 부서, 인가된 부서 집합(팀장은 하위 서브트리까지), 조직 관리 권한 여부를 도출해
  요청 본문 스코프로 싣는다. 이때 **`?includeRoot=true` 로 부른다**: 기본 응답은 조직 소유자를
  빼는데(직원조회 화면의 규칙), 그 목록으로 "올린 사람" 을 조인하면 소유자가 올린 파일이
  `알 수 없는 사용자` 로 보인다. file-upload 는 부서 트리를 해석하지 않는다. 대신 서버가 자기 값으로 아는
  것(조직 = 신원 헤더, 개인 영역 = 본인 user id, 대상 행의 실제 소유 컬럼)은 반드시 다시 확인한다.
- **빈 인가 집합은 와일드카드가 아니라 거부다.** 전 부서를 뜻하는 값은 `can_manage_org` 하나뿐이다.
- **스코프 밖 대상은 404** 로 답한다. 403 은 남의 부서에 그 파일이 있다는 사실을 알려 주는 오라클이 된다.
- **삭제는 두 단계**다. 휴지통(`deleted_at`, 바이트 보존)을 거쳐야 영구 삭제가 된다. 영구 삭제는
  바이트를 먼저 지우고 그다음 행을 지운다(반대 순서는 아무도 열거할 수 없는 고아 바이트를 남긴다).
- **확정 전 자산은 목록에 없다.** 목록이 `status='UPLOADED'` 를 걸기 때문이며, 그래서 끊긴 업로드는
  기존 PENDING 수거자가 하루 뒤 조용히 거둔다.
- **업로드 취소는 정리를 앞당길 뿐 정확성의 근거가 아니다.** 화면의 취소 버튼은 보내는 중인 요청을
  그 자리에서 끊고(`AbortSignal` → `xhr.abort()`), 이미 발급받은 자산이 있으면 `discard` 로 지금
  버린다. 그 호출이 실패하거나 탭이 그대로 닫혀도 결과는 같다. 확정되지 않은 자산은 수거자가 거둔다.
  그래서 취소는 서버 응답을 기다리지 않는다(기다리면 네트워크가 끊긴 상황에서 취소 자체가 막힌다).
- **선언한 크기와 정확히 같을 때만 커밋한다.** 업로드가 끊기면 보통 스트림이 예외로 끝나 임시파일이
  지워지지만(`write_stream_atomic`), 앞단이 본문을 일찍 닫으면 짧은 본문이 정상 종료처럼 도착할 수
  있다. 그대로 커밋하면 잘린 파일이 확정 가능해져 목록에 멀쩡해 보이는 깨진 파일이 남는다.
- **스토리지 파일은 기본적으로 조직 밖으로 나가지 않는다.** 서명 다운로드 URL 은 그것을 가진
  누구나 열 수 있어, 한 번 복사되면 로그인 없는 외부 공개가 된다. 그래서 그 주소를 만들지 않고
  (`/uploads/access-urls` 도 스토리지 자산은 건너뛴다), 브라우저가 직접 부르는 `/files/{uuid}` 도
  스토리지 자산이면 거부한다(서명 요구 게이트를 꺼도 마찬가지다). 화면이 파일을 읽는 길은
  `POST /storage/files/{id}/content` 하나이고 그 호출자는 서비스토큰을 가진 web BFF 다.
- **공통 영역은 공개다.** 주소를 아는 사람은 로그인 없이 연다. 다른 페이지에 이미지 주소로 붙여
  넣는 것이 이 영역의 쓰임이라, 파일마다 공유를 켜는 단계를 두지 않는다. 주소는
  `https://<apex>/f/{uploadId}` 이고 그 경로가 **내용을 그대로 내려준다**(안내 페이지를 두면
  `<img src>` 에 넣을 수 없다). 화면의 목록도 공통 파일에는 같은 주소를 쓰므로, 사용자가 보는
  주소가 곧 밖에서 열리는 주소다.
  **공통인지는 열릴 때마다 다시 본다**: 조직과 개인 파일의 id 로 이 경로를 불러도 404 이고,
  확정 전이거나 휴지통에 있어도 404 다. 이유는 구분해 알려 주지 않는다(id 를 넣어 보며 존재를
  알아내는 창구가 되지 않도록). 나중에 이동 기능이 붙어 파일이 공통을 벗어나면 그 순간부터 닫힌다.
  주소가 UUID 라 추측은 안 되지만, **한 번 밖으로 나가면 파일을 지우거나 다른 영역으로 옮기기
  전까지 계속 열린다.** 그것이 이 영역의 계약이다(토큰, 만료, 해지를 두지 않는 이유이기도 하다:
  평범한 주소가 계속 열리므로 그것들은 실효가 없다).

### 조직 스코프 접근통제 (서명 다운로드 토큰: 게이트 OFF 기본)

기본은 GET `/files/{uuid}` 가 vhost 접근 정책만 따른다(UUID 만 알면 서빙). **조직 스코프**로 잠그려면
`require_signed_download`(config, 기본 `false`)를 켠다. 켜지면 GET 이 **서명 접근토큰(`?token=`)** 을 요구한다.

- **발급 = `POST /uploads/access-urls`**(내부, BFF 호출): body `{ ids, organization_id, all_orgs }`.
  file-upload 가 **소유 인덱스(`organization_id`)로 각 자산의 org 를 확인**해 `all_orgs`(플랫폼 ROOT) 이거나
  org 일치일 때만 서명 URL 발급. → 일반 접근은 자기 조직만, **플랫폼 ROOT 만 전 조직**(control-tower BFF 가
  ROOT 세션에서만 `all_orgs=true`). 서명/검증은 `StoragePort.signed_download_url`/`verify_download_token`
  (`upload_url_secret` 재사용, 클레임 `aud=get` 으로 PUT 토큰과 교차사용 차단).
- **기본 ON**: `require_signed_download` 기본값 `True`(env `REQUIRE_SIGNED_DOWNLOAD=false` 로 긴급 비활성).
- **저장 모델 = uploadId**: 조직 로고(`organizations.profile_image_url`)/멤버 아바타(`organization_users.profile_image_url`)
  는 **전체 URL 이 아니라 uploadId(불변)** 를 저장하고, 표시 URL 은 렌더 시 서명 발급한다(마케팅 영상과 동일 패턴).
  기존에 전체 URL 로 저장된 값은 유효하지 않다(재업로드). 업로드 헬퍼(`uploadLogo`/`uploadProfileImage`)는 uploadId 를 반환.
- **web 서명 헬퍼**: `apps/web/*/src/lib/server/upload/`: `signDownload.signFileUrl(url)`(`/files/{uuid}` 에
  `?token=` append-only + 서명 실패 시 맨 URL 폴백), `fileUrl.fileAccessUrl(uploadId)`(uploadId→서명 URL).
  file-upload `signing.sign_download` 와 바이트 동일 포맷(`{uid}.{exp}.{hmac}`), 시크릿은 `UPLOAD_URL_SECRET`(=SERVICE_TOKEN_SECRET).
- **렌더 경계 변환(uploadId→서명 URL)**: control-tower 조직 목록/상세(`orgView.withOrgLogoUrl`), groupware
  admin/tool 레이아웃 + 환경설정(`signUserImages`), 마케팅 saved-plans/channel/asset 로드, 마케팅 영상 결과(`videoProject/videoFinalUrls`).
  편집 폼(조직 로고/아바타 피커)은 제출용 uploadId(`value`) + 표시용 서명 URL(`displayUrl`)을 분리해 받는다.
- **worker 원본 fetch**: `GET /files/{id}` 는 유효 `X-Service-Token`(내부 서비스) 이면 서명 요구를 우회.
- **클라이언트 렌더용 발급(access-urls)**: 서버 렌더로 미리 서명할 수 없는 라이브 편집 케이스는 BFF
  `POST /api/file/upload/access-urls`(file-upload `/uploads/access-urls` 중계, 세션 org 스코프)로 uploadId→서명 URL 을
  받는다. 현재 소비자: video-model 플랜카드(`PlanProposalCard`) 오디오(bgm/효과음) 미리보기. → 클라이언트/서버 통틀어
  미서명 `/files` 빌더는 없다(모두 서명 경유).
- **배포 전 운영 확인(코드 아님)**: (1) 기존에 **전체 URL 로 저장된** 로고/아바타는 uploadId 저장 모델로 바뀌어
  무효 → 재업로드 필요, (2) dev 에서 아바타/로고/마케팅 이미지 표시 스모크 테스트, (3) 이상 시 env
  `REQUIRE_SIGNED_DOWNLOAD=false` 로 즉시 비활성.

## 스토리지 백엔드 (환경별 인프라 교체 대비)

스토리지 인프라는 환경마다 달라질 수 있다(local FS → NAS → 오브젝트 스토리지). 교체가 한 곳에서
끝나도록 **헥사고날 seam** 으로 설계한다.

- **교체 지점 = `StoragePort`**(outbound Protocol). service/router 는 포트만 알고, 구현(어댑터)을 환경별로 바꾼다.
- **선택 = `STORAGE_BACKEND`**(config) → `app/container.py` 의 `_build_storage()` 팩토리가 어댑터를 결정.
  현재 `local`(`LocalFilesystemStorageAdapter`)만 구현. 새 백엔드는 어댑터 구현 + 이 팩토리에 한 줄.
- **NAS 이전**: NAS 가 마운트 FS 면 **`backend=local` 유지 + `STORAGE_ROOT`(=`STORAGE_HOST_DIR` 마운트)만
  NAS 경로로** 변경. 어댑터 추가 불필요.
- **오브젝트 스토리지(S3/R2)**: `StoragePort` 구현 어댑터 추가 + `_build_storage` 분기 + `STORAGE_BACKEND=s3`.
  presigned PUT/GET URL 이 백엔드 네이티브로 바뀐다(현재 local 은 서명 JWT + `/blob`, `/files`).
  - **서빙 주의(`fs_path`)**: GET `/files/{id}` 는 현재 로컬 경로(`StoragePort.fs_path`)를 `FileResponse`
    로 스트리밍한다. 오브젝트 스토리지는 로컬 경로가 없으므로, 그 백엔드 도입 시 다운로드 서빙을
    **presigned GET 리다이렉트 또는 스트리밍**으로 확장해야 한다(포트에 서빙 메서드 추가 지점).
- 환경 조합은 자유: 예) dev=local(레포 `Storage/dev`), staging=local(NAS 마운트 가능), prod=local→차후 s3/r2.
  **object_key(`{scope}[/{partition}]/{uuid}`), DB, BFF, web 은 백엔드와 무관** 하므로 그대로 둔다.

### 2차 아카이브 (`ArchivePort`): 구현됨(조직 하드 삭제 정리)

위 `STORAGE_BACKEND` 는 **1차(중간/작업) 스토리지**의 교체다. 그와 **별개로** 1차와 직교하는 2차 아카이브
계층을 `ArchivePort`(outbound Protocol)로 둔다. 현재 **조직 하드 삭제(purge) 시 그 조직 자산을 아카이브로
옮긴 뒤 1차에서 삭제**하는 데 쓰인다(고아 방지 + 사후 감사/복구 여지).

- **교체 지점 = `ArchivePort`** + `app/container.py` 의 `_build_archive()` 팩토리(`ARCHIVE_BACKEND`).
  현재 `local`(`LocalFilesystemArchiveAdapter`, `ARCHIVE_ROOT`)만 구현. NAS 는 마운트면 `backend=local` +
  `ARCHIVE_ROOT` 만 NAS 경로로, 오브젝트 스토리지는 어댑터 추가.
- **조직 하드 삭제 흐름**: control-tower `OrganizationService.purgeCompany` 가 user 서버 purge 성공 후
  file-upload `POST /uploads/organizations/{orgId}/archive-and-delete` 를 호출(서비스토큰). file-upload 가
  소유 인덱스(`organization_id`)로 그 조직 UPLOADED 자산을 열거 → 아카이브 복사 → 1차 삭제 →
  메타 `status=ARCHIVED`(행 보존, 멱등). PENDING 은 메타만 삭제. **소프트 삭제(withdraw)는 스토리지 무손상**
  (복구 대비). 정리 실패는 best-effort 로깅(조직 삭제 자체는 확정).
- **미수행(후속): 선별 아카이브/복원**: 업로드물 중 *선별 일부만* 조직별 NAS 로 추가 보관하는 보존정책 잡,
  그리고 아카이브→1차 `restore`(하드 삭제 후 되살리기)는 아직 없다. object_key 의 `groupware/<orgId>/...` +
  `organization_id` 컬럼이 org 라우팅을 이미 운반하므로, 추가 시 `ArchivePort` 에 restore/보존잡만 더하면 된다.

## API 엔드포인트 구조

### file-upload (FastAPI: 업로드/스토리지)

FastAPI `APIRouter` 기준 경로이며 요청/응답 본문은 Pydantic 스키마로 검증한다. (도메인 `upload`)

```
# 내부(BFF, 서비스토큰)
POST   /uploads/presign                  # presign 요청 (단일): PENDING + 서명 PUT URL (organization_id/department_id 소유 귀속)
POST   /uploads/{upload_id}/confirm       # 업로드 확인 (단일): 디스크 존재 검증 후 UPLOADED + access_url
POST   /uploads/access-urls               # 서명 다운로드 URL 배치 발급 (조직 스코프: all_orgs=플랫폼 ROOT)
POST   /uploads/organizations/{orgId}/archive-and-delete  # 조직 하드 삭제 정리 (control-tower 호출, 아카이브 후 1차 삭제, 멱등)
# 스토리지 화면(web-groupware BFF 만. 신원 헤더 X-Organization-Id / X-User-Id 필수, 본문에 스코프)
POST   /storage/list                      # 영역별 목록(검색/정렬/페이지, trashed=true 면 휴지통)
POST   /storage/usage                     # 영역별 사용 용량과 파일 수
POST   /storage/files/{id}/content        # 인가 후 파일 내용 스트리밍(Range 지원). 서명 URL 을 만들지 않는다
GET    /storage/common/{id}               # 공통 파일 내용(신원 없이). 다른 영역 id 는 404
POST   /storage/presign                   # 스토리지 업로드 주소(영역별 경로 + 소유 컬럼 기록)
POST   /storage/files/{id}/confirm        # 확정(PENDING → UPLOADED). 이 전이 전까지 목록에 없다
POST   /storage/files/{id}/discard        # 업로드 취소(확정 전만). 확정된 파일은 400: 휴지통을 거쳐야 한다
PATCH  /storage/files/{id}                # 이름 변경(저장 경로 불변)
POST   /storage/items/trash|restore|purge # 휴지통 이동 / 복원 / 영구 삭제(바이트 먼저, 그다음 행)
# 브라우저 직접(nginx: vhost 접근정책, ServiceTokenMiddleware 예외)
PUT    /blob?token=<서명JWT>              # 바이트 직접 업로드(스트리밍) → {STORAGE_ROOT}/{object_key}
GET    /files/{upload_id}[?token=…]       # 다운로드 스트리밍 (UPLOADED 만; require_signed_download 시 서명토큰 필수). **스토리지 자산은 거부**
```

> 배치(presign/batch, confirm/batch)는 아직 미구현(단일만). file-upload 는 FFmpeg/트랜스코딩을 수행하지 않는다. 영상 처리는 video-model 로 위임.
> presigned PUT URL 서명 시크릿은 현재 `SERVICE_TOKEN_SECRET` 을 재사용한다(클레임 구조가 달라 서비스토큰과 교차사용 불가). 분리는 추후.

### video-model (FastAPI: 영상 처리)

업로드 완료된 영상의 트랜스코딩/제작 작업과 상태 조회를 담당한다. (도메인 `video`)

```
POST   /video-jobs                       # 영상 처리 작업 등록 (objectKey 기반)
GET    /video-jobs/{job_id}              # 작업 상태/결과 조회 (폴링)
```

### apps/web/control-tower (SvelteKit BFF)

브라우저는 자기 web 서버의 `routes/api/...` 만 호출하고, 해당 핸들러가 file-upload(업로드), video-model(영상 상태)로 중계한다.

```
POST /api/file-upload/image                  # 이미지 Presigned URL 요청        → file-upload
POST /api/file-upload/image/multiple         # 다중 이미지 Presigned URL 배치    → file-upload
POST /api/file-upload/video                  # 영상 Presigned URL 요청          → file-upload
POST /api/file-upload/video/multiple         # 다중 영상 Presigned URL 배치      → file-upload
POST /api/file-upload/confirm                # 업로드 확인 (단일)                → file-upload
POST /api/file-upload/confirm/multiple       # 업로드 확인 (배치)                → file-upload
GET  /api/file-upload/jobs/[jobId]/status    # 영상 처리 상태 폴링               → video-model
```

### apps/web/groupware (SvelteKit BFF)

```
POST /api/file/upload/image                  # 이미지 Presigned URL 요청        → file-upload
POST /api/file/upload/image/multiple         # 다중 이미지 Presigned URL 배치    → file-upload
POST /api/file/upload/video                  # 영상 Presigned URL 요청          → file-upload
POST /api/file/upload/video/multiple         # 다중 영상 Presigned URL 배치      → file-upload
POST /api/file/upload/confirm                # 업로드 확인 (단일)                → file-upload
POST /api/file/upload/confirm/multiple       # 업로드 확인 (배치)                → file-upload
GET  /api/file/upload/jobs/[jobId]/status    # 영상 처리 상태 폴링               → video-model

# 스토리지 화면(공통/조직/개인). 영역과 부서만 브라우저가 정하고 나머지는 세션에서 도출한다.
GET  /api/storage/browse?area=&dept=&sort=&q=&trashed=   # 목록          → file-upload
GET  /api/storage/summary                                # 사용량        → file-upload
POST /api/storage/files/presign?area=&dept=              # 업로드 주소   → file-upload
POST /api/storage/files/confirm                          # 업로드 확인   → file-upload
POST /api/storage/files/discard                          # 업로드 취소   → file-upload
PATCH /api/storage/files/[id]                            # 이름 변경     → file-upload
GET  /api/storage/files/[id]/download?area=&dept=        # 다운로드(바이트 중계) → file-upload

# 공개(인증 없음). 조직 밖 방문자가 닿는 유일한 경로다.
GET  /f/[id]                                             # 공통 파일: 내용을 그대로 내려준다
POST /api/storage/items/[trash|restore|purge]            # 일괄 동작     → file-upload
```

> 다운로드는 **BFF 가 바이트를 중계**한다. 서명 주소로 302 를 주면 그 주소가 브라우저 주소창에
> 남아 조직 밖으로 복사될 수 있고, 그 주소는 로그인 없이 열린다. 중계하면 브라우저가 보는 주소는
> 같은 origin 의 `/api/storage/files/{id}/download` 하나뿐이라 남에게 넘겨도 그 사람의 세션에는
> 이 조직의 파일이 없다. 링크는 평범한 `<a href>` 이고 미리보기 `<img src>` 도 같은 주소를 쓰며,
> Range 를 양방향으로 통과시켜 큰 영상도 건너뛰며 재생된다.

## 주의사항

- 파일 크기가 제한을 초과하면 업로드가 거부된다 (file-upload presign 에서 `max_upload_size` 검증,
  스토리지 화면은 `storage_max_upload_size`)
- 영상 파일은 업로드 확인 후 video-model 워커에서 자동 최적화된다 (FFmpeg H.264/AAC 변환)
- 바이트 PUT 과 다운로드 GET 은 붙은 nginx vhost 의 접근 정책을 상속한다. **prod groupware(apex)는 공개**, admin 과 staging 은 공인 IP allowlist 제한. PUT 은 어느 경우든 서명 업로드토큰으로 추가 보호.
- 배치 업로드 시 동일한 타입의 파일만 업로드 가능한다 (타입 혼합 불가)
- object_key/저장 경로는 "스토리지 디렉터리 구조" 참고. 사용자 파일명은 DB 에만 보관(경로 traversal 차단).

## 인프라 제한 설정

### nginx: `/blob`, `/files` 노출 (vhost 접근 정책 상속)

브라우저 직접 PUT/GET 을 위해 file-upload 의 `/blob`, `/files/` 를 nginx 로 노출하되, 각 경로는 **자신이 붙은 server 블록의
접근 정책을 그대로 상속**한다(그 블록의 `include snippets/cscuniverse-allow.conf` 유무 = 제한/공개). prod groupware(apex)는
공개(allowlist include 주석 처리), admin 과 staging 은 사무실 공인 IP allowlist 유지. 업로드 PUT 경로만 본문 한도를 상향한다.
groupware(apex)는 `PUBLIC_UPLOAD_BASE_URL`(apex)과 같은 origin 이지만, **control-tower(admin)는 apex 로 PUT →
cross-origin** 이라 file-upload `ALLOWED_ORIGINS`(CORS)에 admin 도메인을 등록해야 한다(위 설정 절 참고).

```nginx
# infra/nginx/conf.d/cscuniverse.conf (server 블록, allowlist include 아래)
location = /blob {                      # 브라우저 직접 업로드 PUT
    client_max_body_size 100m;          # 영상 50MB + 여유
    proxy_request_buffering off;
    set $fileupload_upstream api-file-service:8000;   # staging: csc-staging-api-file-service:8000
    proxy_pass http://$fileupload_upstream;
}
location /files/ {                      # 브라우저 직접 다운로드 GET
    set $fileupload_upstream api-file-service:8000;
    proxy_pass http://$fileupload_upstream;
}
```

### file-upload (pydantic-settings)
- `STORAGE_ROOT`(컨테이너 `/srv/storage`) ← 호스트는 **코드 클론 밖 `~/Storage/{env}`**(`STORAGE_HOST_DIR` 로 지정, 오버라이드 가능, 예: NAS). 재배포(git reset/clean)와 무관하게 업로드물 보존. `PUBLIC_UPLOAD_BASE_URL`(공개 베이스), `UPLOAD_URL_SECRET`(= `SERVICE_TOKEN_SECRET` 재사용)
- `ARCHIVE_BACKEND`(기본 `local`) + `ARCHIVE_ROOT`(2차 아카이브 루트, 컨테이너 경로): 조직 하드 삭제 정리본 보관. 1차와 별개 마운트(예: NAS) 권장. staging/prod 는 코드 클론 밖 영속 경로로.
- `REQUIRE_SIGNED_DOWNLOAD`(기본 `true`): GET `/files/{id}` 서명토큰 강제(조직 스코프). 서버 렌더 경로는 전부 서명 URL 전환됨. env=false 로 긴급 비활성. `DOWNLOAD_URL_TTL_SECONDS`(기본 3600): 서명 다운로드 토큰 TTL.
- `ALLOWED_ORIGINS`(CORS): 브라우저 직접 PUT(`/blob`)은 web 앱과 cross-origin일 수 있어 허용 목록 필요. 특히 **control-tower(admin 서브도메인)는 `PUBLIC_UPLOAD_BASE_URL`(apex)로 PUT → cross-origin** 이므로 apex+admin 도메인을 모두 등록한다. prod: `https://cscuniverse.com,https://www.cscuniverse.com,https://admin.cscuniverse.com` / staging: `https://staging.cscuniverse.com,https://staging-admin.cscuniverse.com`. dev(local): web dev 호스트(localhost:5173/5174, admin.localhost:5174).
- `max_upload_size` = 50MB(영상 기준). 이미지 10MB / 영상 50MB 정책.
- `storage_max_upload_size` = 200MB: 스토리지 화면 전용 상한(일반 파일 저장소라 다른 경로보다 크다).
  브라우저 PUT 은 스트리밍 저장이라 본문이 메모리에 통째로 올라가지 않으며, nginx `/blob` 위치의
  `client_max_body_size` 를 이 값보다 크게(210m) 잡아야 한다.
- DB 마이그레이션: 컨테이너 기동 시 `alembic upgrade head` 자동 적용(`upload_assets`: 소유 인덱스 컬럼 `0003_asset_ownership`, 수거 조회 인덱스 `0004_pending_reap_index`, 스토리지 화면 컬럼 `0005_storage_columns` 포함).
- `PENDING_REAP_AFTER_HOURS`(기본 24) + `PENDING_REAP_BATCH_LIMIT`(기본 500) + `REDIS_URL`(전용 논리 db 4): 확정되지 않은 자산 수거자 설정. 아래 절 참고.

### PENDING 수거 (확정되지 않은 자산 정리)

**확정(`PENDING → UPLOADED`)은 그 자산을 참조할 행을 만드는 쪽이 한다.** 브라우저는 presign + PUT
까지만 하고(`uploadBlob(..., { confirm: false })`), 소비 서버가 참조 행을 만든 뒤 확정한다. 그래서
그 쓰기가 실패하면 자산은 `PENDING` 으로 남는다. 브라우저가 미리 확정하면 참조 없는 `UPLOADED` 가
남는데, 그건 아무도 거둘 수 없다(참조 여부를 아는 것은 소비 서버이고 이 서버가 아니다).
계약: [marketing-write-consistency.md](../../docs/specs/marketing-write-consistency.md).

| 항목 | 내용 |
|------|------|
| 거두는 대상 | `status='PENDING' AND created_at < now() - TTL` 인 자산의 **바이트 + 메타 행** |
| 거두지 않는 것 | `UPLOADED`, `ARCHIVED`. 어떤 경우에도 손대지 않는다(소유권 경계) |
| TTL | `PENDING_REAP_AFTER_HOURS`(기본 24). 진행 중 업로드를 거두지 않을 만큼 넉넉히 |
| 한 번에 | `PENDING_REAP_BATCH_LIMIT`(기본 500). 응답 `has_more` 가 남은 후보 유무를 알린다 |
| 주기 실행 | `api-file-service-worker` 컨테이너(같은 이미지, `arq app.worker.WorkerSettings`), 매일 03:00 |
| 수동 실행 | `POST /uploads/reap-pending`(내부, 서비스토큰). 즉시 정리해야 하는 운영 상황에서 사용 |

두 진입점이 같은 서비스 메서드를 부른다(`UploadService.reap_pending_assets`). 워커는 컨테이너 안에서
직접 부르므로 HTTP 를 거치지 않는다.
- (영상 트랜스코딩 한도/코덱 설정은 video-model 가 관리)

### csc-control-tower (조직 하드 삭제 → file-upload 정리)
- `FILE_UPLOAD_API_URL`: control-tower 가 조직 purge 후 `POST /uploads/organizations/{id}/archive-and-delete` 를 호출할 file-upload 내부 URL(dev 폴백 `http://localhost:8001`, 배포는 Docker network 내부 주소). 서비스토큰 클레임 `csc-control-tower`(file-upload `ALLOWED_SERVICES` 에 이미 포함).

### SvelteKit (apps/web/control-tower, apps/web/groupware)
```javascript
// svelte.config.js: 파일은 스토리지로 직접 업로드하고 BFF는 JSON 메타데이터만 처리하므로 대폭 축소 가능
adapter: adapter({
  bodySizeLimit: 10 * 1024 * 1024  // 10MB (파일은 오브젝트 스토리지로 직접 업로드)
})
```

### Docker 빌드 캐시
- `svelte.config.js` 변경 시 자동으로 재빌드되도록 Dockerfile 최적화
- CI/CD 빌드 실패 시 자동으로 `--no-cache` 재시도
