# 멀티테넌시 아키텍처 (조직/테넌트 + 다중 ROOT)

## 왜 이 문서인가

csc("AI Agent 통합 플랫폼")는 우리 조직 전용이 아니라 **외부 조직에 납품**될 수 있다.
따라서 **조직(테넌트)이 여러 개**, **ROOT/관리자도 조직마다** 존재할 수 있어야 한다. 본 문서는
그 타깃 아키텍처와 단계별(Phase 0~3) 로드맵, 그리고 "지금 결정해야 나중에 후회 없는" 항목을 기록한다.

> **유저 2계층 모델 (현행):**
> ```
> 플랫폼 → 관리자유저(admin_users): 루트 1 + 일반관리자 N        (벤더 운영자, control-tower)
> 조직   → 조직유저(organization_users): 조직 루트관리자 1 + 조직 일반관리자 N  (조직 관리, groupware)
> ```
> 구 `platform_admins`→`admin_users`, `users`→`organization_users` 로 리네임됐다. 조직유저가 부여된
> **엔타이틀먼트(기능/AI도구 접근권)** 에 따라 기능, AI도구에 접근한다(아래 "엔타이틀먼트" 절).
>
> **서비스 계층은 제거됐다**: 구 `services`/`service_users`/`labels`/`service_user_labels` 는 거의
> 미사용 스캐폴딩이라 모델을 헷갈리게 해서 드롭했다(마이그레이션 `0010`). **일반 사용자(실제 서비스의
> 최종 사용자) 계층은 향후 실제 서비스가 도입될 때 그 형태에 맞춰 다시 추가**한다.

> 관련: [system-architecture.md](./system-architecture.md)(DB 소유권), [auth-process-flow.md](./auth-process-flow.md),
> [security-architecture.md](./security-architecture.md), [database-migration-workflow.md](./database-migration-workflow.md).

---

## 핵심 결정 (요약)

| 항목 | 결정 | 이유 |
|------|------|------|
| **격리 모델** | shared-schema + `organization_id` 행 판별자 | 테넌트=고객 분리는 행 단위. DB-per-tenant 는 마이그레이션/백업/모니터링 N배라 채택하지 않는다. |
| **조직 테이블 위치** | `userdb` | 인증 게이트키퍼(`user` 서버)가 테넌시를 해석. 타 서비스는 토큰 클레임으로 스코프. |
| **테넌시 전달** | **Access Token 의 `organizationId` 클레임** | 다운스트림은 클레임만 신뢰하고 자기 DB 행을 필터링: 크로스-DB JOIN 금지 규칙 유지. |
| **역할 모델** | 사용자당 **단일 조직** + 단일 `role` | 납품된 조직의 사용자는 서로 다른 계정. 멀티-조직 멤버십은 확장 경로(아래). |
| **루트 자리 이동** | 조직당 ROOT 1명 고정. 바꿀 때는 **이양(기존 조직원 승격)** 또는 **교체(신규 계정 생성)** 로 한 트랜잭션 안에서 강등과 승격을 함께 처리. 강등 대상이 **대표(REPRESENTATIVE)면 직책도 함께 해임** | 루트의 이메일을 다른 사람 주소로 바꾸는 방식은 계정을 합치지 못한다(그 사람의 부서/권한/이력은 원래 계정에 남고 로그인만 옮겨 가 한 사람이 계정 둘을 갖는다). 중간 상태가 커밋되면 ROOT 가 둘이거나 없으므로 트랜잭션이 필요하고, 권한이 바뀐 두 계정은 token_version bump 로 재로그인시킨다. **대표를 남기면 `hasRootAuthority` 로 루트 권한이 그대로 유지되어 이양이 무의미해진다.** 플랫폼 운영자가 특정 조직의 루트를 맡는 경우도 교체 경로다(admin_users 와 organization_users 는 별개 테이블이라 같은 이메일로 두 계정을 두며 로그인 경로도 갈린다). control-tower 조직 상세에서 수행(`/platform/organizations/:id/root-admin/transfer`, `/replace`). |
| **플랫폼(벤더) 구분** | **별도 `admin_users` 테이블** (organization_users 와 분리, 조직 없음) | 벤더 운영자는 조직유저와 다른 액터. 같은 테이블에 섞으면 동일 이메일이 PLATFORM/TENANT 두 행으로 충돌(시더, 로그인 모호). 권한 판정은 토큰 `organizationType==='PLATFORM' && role∈(ROOT,ADMIN)` 유지. |
| **엔타이틀먼트** | userdb `features`/`ai_tools` 카탈로그 + 조직 grant(`organization_features`/`organization_ai_tools`) + 부서 부여(`department_ai_tools`)/유저 부여(`organization_user_*`) | **기능**: 조직 grant + `applies_to_all`(전원 일괄) 또는 유저 토글. **AI도구**: 조직 grant = 플랫폼→조직 **사용 인가(availability)** 만(`applies_to_all` 없음), 실제 사용 여부는 **조직이 내부에서** 부서 부여(하위 상속) OR 유저 부여로 결정(권한과는 별개 메커니즘: 자체 테이블, resolve). **ROOT/대표(`representative`)는 조직 보유 도구 전부**. 외부 조직도 도구를 인가받으면 그 조직이 부서/유저에 부여해 사용. |
| **플랫폼 관리자 옵션** | userdb `admin_features` 카탈로그 + `admin_user_features` grant: **조직 엔타이틀먼트와 별도 테이블** | 관리자유저(`admin_users`)의 관리 영역 접근권. 두 액터(벤더 운영자 vs 조직유저)가 권한 축이 달라 `organization_*` 를 재사용하지 않는다. ROOT=전체, ADMIN=grant∩active. 추가/부여는 ROOT 만. 토큰 `adminFeatures` 로 인가. |
| **앱 매핑** | control-tower = 벤더 플랫폼 관리(조직 CRUD/조직별 ROOT 발급, `admin_users`), groupware = 테넌트 제품(`organization_users`) | 두 web 앱(ADMIN_USER vs WEB_USER) 분리와 일치. 로그인 경로가 테이블별로 분기(`/18` vs `/11`). |
| **이메일 유일성** | `organization_users`, `admin_users` 모두 **email 전역 unique** | 로그인은 이메일과 비밀번호만 받고 조직은 인증 이후 토큰으로 정해진다. 조직 범위 유일은 로그인 전에 조직을 알 수 있는 제품(조직별 서브도메인, 조직코드 입력)에서만 성립하며, 한 사람은 한 조직에만 속하므로 이점 없이 로그인 모호성만 남는다(마이그레이션 `0032`). |

> **userType(APP/WEB/ADMIN_USER)** 는 클라이언트 audience 구분이며 **조직과 직교**한다. 테넌시는 `organization_id`가 담당.
> **관리자유저는 `organization_users`/`organizations` 에 존재하지 않는다**: 별도 `admin_users` 테이블. 토큰의 `principalType`(ADMIN_USER / ORGANIZATION_USER)이 refresh/find-data 의 조회 테이블을 라우팅한다(두 테이블 id 시퀀스가 독립이라 필수).

---

## 데이터 모델 (타깃, userdb)

```
organizations            # TENANT 만 존재(PLATFORM 행은 두지 않는다. 마이그레이션 0006 에서 제거)
  id (pk), slug (unique), name, type(PLATFORM|TENANT), status(ACTIVE|SUSPENDED|WITHDRAWN), created_at, updated_at

organization_users       # 조직유저: 조직 관리 주체(구 users)
  ... 기존 필드 ...
  name                                      # 이름 = 유일한 이름 필드(표시 이름). 중복 허용(동명이인): 아래 참고
  organization_id  FK -> organizations.id  (NOT NULL)
  role(ROOT|ADMIN)                          # 조직 루트관리자 / 조직 일반관리자 (EMPLOYEE 폐기)
  UNIQUE (email)                            # 로그인 ID 는 전역 유일(구 (organization_id, email) 복합)

admin_users              # 관리자유저(벤더 운영자): 조직 없음(구 platform_admins)
  id (pk), email (UNIQUE 전역), password_hash, name,
  role(ROOT|ADMIN), status, token_version, failed_login_attempts, locked_until,
  last_login_at, created_at, updated_at

# ── 엔타이틀먼트 (기능/AI도구 접근권) ──
features / ai_tools      # 카탈로그(글로벌 공유): id(pk), key(unique), name, description, is_active, sort_order
  features:  notice / user-management / roles / content / stats / settings / audit-log / billing
  ai_tools:  video-model   # + provisioning('PER_ORG'|'COMMON') 컬럼. 현재 마케팅 영상 제작 하나(PER_ORG). AI 어시스턴트는 AI 도구가 아니라 별개(아래 "AI 도구 프로비저닝" 참고)

organization_features / organization_ai_tools    # 조직 grant (플랫폼→조직)
  PK(organization_id, x_id), organization_id FK->organizations.id, x_id FK->카탈로그.id
  granted_by(admin_users.id, 감사용), granted_at
  organization_features 만: applies_to_all bool   # true=조직 전원 일괄 / false=지정 유저만(아래 토글)
  # organization_ai_tools 는 할당(availability)만. applies_to_all 없음(마이그레이션 0022 에서 드롭).
  #   조직 내 사용은 조직이 내부에서 결정(권한과는 별개 메커니즘): department_ai_tools(부서 부여, 하위 상속) OR organization_user_ai_tools(유저 부여).

department_ai_tools    # 부서 AI도구 부여 (조직→부서, 하위 구성원이 상속)
  PK(department_id, ai_tool_id), FK(organization_id, ai_tool_id)->organization_ai_tools   # 조직 할당 범위 내만

organization_user_features / organization_user_ai_tools    # 유저 부여 (조직→유저, presence=enabled)
  PK(user_id, x_id), user_id FK->organization_users.id
  FK(organization_id, x_id)->organization_x   # 2단계 불변식: 조직 grant 범위 내만
  FK(user_id, organization_id)->organization_users(id, organization_id)   # org 일치 보장

# ── 플랫폼 관리자 옵션 (admin_users 전용: 위 조직 엔타이틀먼트와 별개 테이블) ──
admin_features           # 카탈로그(글로벌): id(pk), key(unique), name, description, is_active, sort_order
  key:  org-management / ai-tools-management   # 플랫폼 관리 영역(사이드바)과 1:1, 확장 가능
admin_user_features      # 관리자 grant (admin_users → admin_features, presence=enabled)
  PK(admin_user_id, admin_feature_id), FK->admin_users.id / admin_features.id (cascade)
  granted_by(감사용), granted_at
```

- 관리자유저는 `admin_users` 1행(환경변수 `PLATFORM_ROOT_EMAIL/PASSWORD` 로 시드). 조직(`organizations`)에 귀속되지 않는다.
- 각 납품 조직은 `organizations` 의 `type=TENANT` 1행 + `organization_users` 의 ROOT/ADMIN.
- `org_type_enum` 의 `PLATFORM` 값은 토큰 클레임 문자열로만 남는다(조직 행으로는 쓰지 않음, vestigial).

### 이름(name): 유일한 이름 필드
- **표시명(구 `nickname`) 컬럼은 없다**(마이그레이션 `0030` 에서 두 테이블 모두 드롭, 갈린 행은 nickname 을 name 으로 승격). 이전에는 생성/사용자관리 편집이 `nickname=name` 으로 맞추고 환경설정의 자가 편집만 갈라져, 같은 사람이 로그/멤버목록/플랫폼에서는 `name`, 워크스페이스 앱바/내정보에서는 `nickname` 으로 보였다. 이름 필드를 하나로 줄여 그 분기를 제거했다.
- **편집 주체 3곳(모두 같은 컬럼)**: 본인(groupware 환경설정 `PATCH /user-api/me`: 전 역할 공통), 조직 관리자(사용자관리 멤버 편집), 플랫폼(control-tower 조직 상세 → `PATCH /platform/organizations/:id/root-admin` → user `PATCH /internal/organizations/:id/root-admin`). 조직 생성 시 넣는 ROOT 이름도 이 경로로 사후 정정한다.
- **조직 내 이름 중복 허용**: 구 `organization_users_org_name_uq` 를 해제했다(표시 이름이라 동명이인이 정상). 로그인 ID 는 email 이고 로그/필터의 사람 식별은 id 기준이라 중복이 모호함을 만들지 않는다. 따라서 이름 중복 도메인 에러도 없다(`DUPLICATE_NAME` 폐기, email 중복만 409).
- 이름 변경은 **세션을 무효화하지 않는다**(비밀번호 재설정과 다르다). 토큰 클레임 `name` 은 다음 갱신에 반영되지만, 로그 화면은 `actor_id` 로 이름을 조회하므로 표시가 즉시 따라간다.
- **사람을 지목하는 화면은 이름 옆에 이메일(로그인 ID, 전역 유일)을 함께 보여준다**: 동명이인이 허용되므로 이름만으로는 원장에서 사람이 확정되지 않고, 개명으로 남을 사칭할 여지도 생긴다. 인가는 전부 id 기준이라 권한 문제는 아니고 표기의 사회공학 방어다. 조회 규칙 SSOT 는 `lib/features/members/lib/roster.ts`(`createMemberIdentityLookup` + `formatMemberLabel`), 적재는 `lib/server/marketing/roster.ts`. 넓은 자리(활동 로그 표/필터, 사용자관리 목록, 조직 관리 상세)는 이메일을 함께 적고, 좁은 자리(보관함 카드 배지, 조직도 트리 행)는 `title` 툴팁으로 붙인다.

### 엔타이틀먼트 (유효 접근권)
- **기능(feature) 유효 접근 = 조직 grant 존재 AND (`applies_to_all` OR 유저 토글 존재) AND 카탈로그 `is_active`.** 조직에 `organization_features(applies_to_all=true)` 1행이면 조직 전원.
- **AI도구 유효 접근 = 조직 grant(사용 인가/availability) 존재 AND (부서 부여 OR 유저 부여) AND 카탈로그 `is_active`.** `organization_ai_tools` 는 플랫폼이 조직에 도구를 인가하는 것만(`applies_to_all` 없음), **누가 쓰는지는 조직이 내부에서** `department_ai_tools`(부서→하위 상속) 또는 `organization_user_ai_tools`(유저 직접)로 정한다(권한과는 별개 메커니즘: 자체 테이블, resolve, 부서 상속 계산만 공유). **단 ROOT/대표(직책 `position=REPRESENTATIVE`)는 조직 보유 도구 전부 접근**(부여 불문: 백엔드 `resolveEffectiveForUser` 우회, 대표 판정은 호출부가 직책으로 계산해 넘김). 외부 조직도 도구를 인가받으면 그 조직이 부서/유저에 부여해 사용한다.
- **권한(permission) 유효 접근 = 부서 조상 체인 부여 ∪ 멤버 직접 부여** (features/aiTools 와 별개 카탈로그 `permissions`). 부서 부여는 하위 소속 조직원이 상속, 토큰 클레임 `permissions[]`. 현재 권한 카탈로그는 시스템관리(`system-management`) 하나(부서/멤버 모두 부여 가능). 대표는 권한이 아닌 **직책(position)** 으로 이전됨(아래).
  - **직책(position) = 권한/AI도구와 분리된 별도 차원.** `organization_users.position` **단일 컬럼**(유저당 하나)이라 대표↔팀장 상호배제가 구조적으로 보장된다. 토큰 클레임 `position`. 카탈로그/게이팅 SSOT 는 `@csc/entitlements`(`OrgPosition`, `ROOT_ROLE_ONLY_POSITION_KEYS`, `DEPARTMENT_REQUIRED_POSITION_KEYS`).
    - **대표(`REPRESENTATIVE`) = 사실상 ROOT 와 동등한 권한자**(`hasRootAuthority` = ROOT ∨ `position=REPRESENTATIVE`). 조직 관리 전권 + 조직 보유 AI도구 전부(`resolveEffectiveForUser` 우회) + 시스템관리 부여 가능. **role 도 permission 도 아닌 직책**: 인가 판정에서만 ROOT 와 동급. 임명/해임은 **ROOT(개발관리자)만**(`ROOT_ROLE_ONLY_POSITION_KEYS`: 대표가 대표를 만드는 무한 증식 차단). (UI 표기: 조직 ROOT = **개발관리자**.)
    - **팀장(`TEAM_LEADER`) = 소속 부서의 리더.** 순수 조직상 직책(권한 변화 없음). **부서 배치 필수 + 부서당 1명**(DB 부분유니크 `org_users_dept_team_leader_uq` + CHECK `org_users_team_leader_dept_chk`). 임명은 조직 관리 권한자(루트 권한자 ∨ system-management). 부서가 바뀌면 팀장 직책은 자동 해제(`updateMemberDepartmentRecord`).
    - 집행: 백엔드 `PositionManagementService.setMemberPosition`(대표=ROOT 전용, 팀장 부서/부서당1명 검증 + 부분유니크 경합 backstop) + 프론트 직책 UI 비활성(`isRootRoleOnlyPosition` + `isRootRole` / 부서, 기존팀장 라이브 힌트) 이중. HTTP: `POST /user-api/org/members/:id/position`.
  - **조직 관리 권한(조직도/사용자/권한/AI도구/직책 편집) = 루트 권한자(ROOT/대표) 또는 `system-management` 보유**(`resolveOrgManagementOrgId` / web `canManageOrg` 동형).
  - **ROOT 전용 부여 권한**(`ROOT_ONLY_GRANT_PERMISSION_KEYS` = 시스템관리: 시스템관리 보유자(비-루트권한)는 부여 불가, 권한 상승 차단): `system-management` 부여/회수 = **루트 권한자(ROOT/대표)**. 집행: 백엔드 `PermissionManagementService.assertRootOnlyGrantAllowed` + 프론트 부여 UI 비활성(`isRootOnlyGrantPermission` + `hasRootAuthority` prop) 이중.
- 카탈로그, grant 는 모두 **userdb**(인증 게이트키퍼가 접근을 결정, 토큰에 실음). 구 groupwaredb 엔타이틀먼트는 마이그레이션으로 userdb 로 이전됐다(`features`/`ai_tools` key 재시드).
- 조직 관리 화면(groupware `조직 관리`)의 **권한, AI도구 부여는 스테이징 후 하단 저장 바로 일괄 반영**(저장 전 화면 이탈 시 폐기 → baseline 복원, 되돌리기 버튼 제공). 유저 부서 배치도 동일 스테이징. 대상 유저의 실제 접근(사이드바/게이팅)은 토큰 클레임이라 **재로그인/리프레시로 반영**(staleness ≤ 쿠키 maxAge).

### 카탈로그 key = 코드 SSOT (enum) + 부팅 동기화
- **결정:** `features`/`ai_tools` 의 **key 집합은 코드가 진실원**이다. 각 기능/AI도구가 서비스 급(라우팅/BFF/백엔드 통합이 따라오는 코드 강결합)이라 key 는 배포로만 바뀐다. SSOT 는 **공유 커널 `@csc/entitlements`**(`packages/entitlements`: zero-dep 순수 TS, 프레임워크/ORM 없음): `FeatureKey`/`AiToolKey` enum + `FEATURE_CATALOG`/`AI_TOOL_CATALOG` 시드 메타 + UI 라벨(`FEATURE_LABELS`/`AI_TOOL_LABELS`) + 가드(`toFeatureKeys`/`toAiToolKeys`). 토큰을 발급하는 user(`core/domain/types/entitlement-catalog.ts` 가 이 패키지를 재노출)와 소비하는 web(groupware `permissionStore/permissions.ts` 의 `Permission`=`FeatureKey` 별칭, control-tower `ai-tools/types.ts`)이 같은 출처를 공유한다. 토큰 클레임(`features`/`aiTools`), `EffectiveEntitlements` 는 이 enum 으로 타입을 좁혀 인가 경로가 컴파일 타임에 닫힌 집합으로 검증되고, DB/토큰 경계에서 `toFeatureKeys`/`toAiToolKeys` 로 미지 key 를 제거한다.
- **테이블 = 런타임 투영:** `ai_tools`/`features` 테이블은 FK grant 대상이자 편집 가능한 메타(name/slug/is_active/sort_order)의 저장소. key 만 enum 으로 고정.
- **동기화 = `CatalogSeederService`(부팅, best-effort):** 누락 key 삽입(`ON CONFLICT DO NOTHING`: 기존 name/slug 보존) + 코드에서 사라진 key 비활성화(soft, is_active=false: 행/grant 보존, 비파괴). 따라서 **새 기능/AI도구 추가 = enum + 시드 한 줄(시드 전용 마이그레이션 불필요)**, 제거 = enum 에서 빼면 다음 부팅에 비활성화.
### AI 도구 프로비저닝 (개별 부여 PER_ORG vs 전체 공통 COMMON)
- **AI 도구는 프로비저닝 모드를 갖는다**: `ai_tools.provisioning`(`'PER_ORG'`|`'COMMON'`, 값 집합 SSOT = `@csc/entitlements` `ProvisioningMode`). **DB 컬럼이 SSOT**(플랫폼 관리자가 런타임 토글, control-tower AI도구 편집), 카탈로그(`AI_TOOL_CATALOG`)의 provisioning 은 신규 도구 insert 기본값(시더 `onConflictDoNothing` 이라 기존 행 미갱신).
  - **PER_ORG**: 조직마다 개별 부여(`organization_ai_tools` grant). 조직 상세에서 토글. 토큰 해석은 기존대로(조직 grant + 부서/유저 or 루트/대표 우회).
  - **COMMON**: 전 조직에 공통 제공: grant 행 없이 **모든 조직 유저 토큰 `aiTools` 에 자동 포함**(`entitlement.adapter` resolveEffectiveForUser 가 `is_active AND provisioning=COMMON` 을 union). 조직 상세 부여 UI 에는 읽기전용 "공통 제공" 배지로만 표시(토글 불가), `setOrganizationAiToolsRecord` 도 COMMON 키를 걸러 grant 행을 만들지 않는다(UI+서버 이중 방어).
  - 현재 카탈로그는 `video-model`(PER_ORG) 하나. COMMON 멤버는 아직 없음(메커니즘만 준비: 향후 공통 도구 대비).
- **AI 어시스턴트는 AI 도구가 아니다(별개).** `ai-assistant`(챗봇)는 조직/공통 부여 체계 밖의 **전역 기본 제공 기능**이라 `AiToolKey`/`AI_TOOL_CATALOG`/`ai_tools` 에 두지 않는다. 접근은 엔타이틀먼트가 아니라 정책 헬퍼(web `access.ts` `canUseAiAssistant`: 현재 인증된 조직 유저 전원, 상시 on)로 결정한다. 플랫폼에서도 'AI 도구 관리' 밖에서 별도로 다룬다(control-tower 좌측 사이드바 별도 섹션). (과거 `0016` 하드 삭제 → `0025` 재시드로 남아 있던 `ai_tools` 행은 카탈로그에 없어 다음 부팅에 `CatalogSeederService` 가 soft 비활성화한다. 그리고 `toAiToolKeys` 닫힌 집합 필터가 토큰에서도 제거하므로 접근에 무영향.)

### MES(제조실행)는 AI 도구가 아니라 기능(FeatureKey)이다 [Phase 1 예정]

MES 는 `AiToolKey` 가 아니라 **`FeatureKey.Mes = 'mes'`** 로 추가한다. 승격 행위(초품 승인,
실적 정정, 지시 강제 종료)는 **`PermissionKey.MesSupervision = 'mes-supervision'`**.

근거 셋:

1. `AiToolKey` 는 정의상 "조직에 부여하는 **AI 도구**" 이고 `provisioning`(PER_ORG/COMMON),
   부서 부여, 유저 부여, **ROOT/대표 자동 전량 접근**이라는 전용 의미론을 끌고 온다. MES 는
   업무 모듈이라 그 의미론이 전부 잉여이고, 특히 마지막 항목은 위험하다. 조직 대표에게
   **현장 데이터 쓰기 권한이 자동 부여**되는 결과가 되기 때문이다.
2. `FeatureKey` 는 `organization_features.applies_to_all` 로 "조직 전원" 과 "지정 유저만" 을
   모두 표현한다. MES 는 납품 조직 단위로 켜고 끄는 모듈이라 이 모델과 정확히 일치한다.
3. 토큰 클레임 `features[]` 에 실리므로 csc-mes 가 **user 서버 호출 없이 토큰만으로 인가**한다.
   오프라인 우선 클라이언트에게 특히 중요하다. 단말이 캐시한 토큰으로 재접속할 때 즉시 판정된다.

**라인/공정 단위 권한은 userdb 카탈로그에 넣지 않는다.** `PermissionKey` 는 코드가 SSOT 인 닫힌
enum 이라 배포로만 바뀌는데, 라인과 공정은 조직마다 다르고 자주 바뀌는 운영 데이터다. 그래서
`mes_worker_assignments`(작업자 라인/공정 배정)와 `mes_devices.allowed_line_ids`(단말 라인 범위)
라는 **csc-mes 로컬 테이블**로 둔다. 판정식:

```
쓰기 허용 = features.includes('mes')                  // 모듈 접근
          AND device.status === 'ACTIVE'               // 단말 유효
          AND targetLineId ∈ device.allowedLineIds     // 단말 물리 범위
          AND (승격불요 OR permissions.includes('mes-supervision')
                        OR worker.assignment.role === 'SUPERVISOR')
```

### 현장 작업자는 조직유저가 아니다 (MES 로컬 엔티티) [Phase 1 예정]

생산직 작업자는 `organization_users` 계정을 만들지 않는다. `mes_workers` 라는 MES 도메인
엔티티이고, 필요한 사람(반장, 품질담당)만 `organization_user_id` 로 연결한다.

근거 셋:

1. `organization_users` 는 email 유니크에 이메일 로그인 기반이다. 사내
   이메일 없는 생산직 200명에게 계정을 만드는 것은 모델 오용이다.
2. 이 문서가 조직유저 역할을 ROOT/ADMIN 으로 좁히고 EMPLOYEE 를 폐기했다. 현장 작업자를 끼워
   넣으면 그 정리를 되돌리게 된다.
3. **결정적 이유는 오프라인이다.** 배지 스캔마다 user 서버에 토큰을 발급받으면 네트워크가 끊긴
   순간 작업자 전환이 불가능해진다. 작업자 식별이 인증이 아니라 **로컬에서 해석 가능한
   데이터**여야 오프라인 우선이 성립한다.

공용 현장 PC 에는 세 개의 신원이 한 요청에 실린다.

| 신원 | 정체 | 수명 |
|---|---|---|
| 단말 주체 | 이 터미널이 누구인가 | 등록부터 폐기까지(`mes_devices` + 디바이스 토큰) |
| 단말 세션 유저 | 터미널의 시스템 계정 | 액세스 토큰 수명. 조직유저 1개(사이트당 1개 권장) |
| 작업자 | 지금 화면 앞에 있는 사람 | 배지 스캔 사이(`mes_workers`, 요청 본문 `workerId`) |

배지 스캔은 로컬 SQLite 의 `mes_workers` 를 `badge_hash`(HMAC, salt 는 OS 키체인)로 조회해 즉시
전환한다. 서버 왕복이 없어 오프라인에서 동작한다. 단말이 물리적으로 탈취되면 위조 가능하며 이는
암호로 막을 수 없다. 단말 폐기(즉시 401)로 대응한다.

**승격 행위는 오프라인 큐잉을 허용하지 않는다.** 나중에 서버가 거부하면 이미 그 판정으로 생산이
진행된 뒤라 되돌릴 수 없다.

### AI 어시스턴트 2-레이어 설정 (플랫폼 전역 + 조직별)
AI 어시스턴트(챗봇)의 동작을 두 레이어 설정으로 제어한다. 설정은 **소유 서비스별로 분리 저장**하고, 채팅 시점에 csc-groupware 가 병합해 language-model 에 준다.

**역할 분담: 플랫폼은 "쓸 수 있나 + 어떤 성격인가", 조직은 "어떤 모델로".** 플랫폼에 있던 모델 정책
(`allowed_models` 화이트리스트, 전역 `default_model`)은 마이그레이션 `0031` 에서 제거했다. 외부 모델은
**조직이 자기 API 키를 등록해야만 동작**해서 화이트리스트가 실효 없이 설정 화면만 늘렸고(내부 모델은
하나뿐이라 좁힐 대상도 없다), 전역 기본 모델도 조직 미설정 시 **내장 Qwen**(language-model 카탈로그
기본 `internal-qwen3`)으로 떨어지면 충분했다.

- **플랫폼 레이어(플랫폼 관리자, control-tower)**: SSOT = **userdb `platform_assistant_settings` 싱글톤(id=1)**. 필드: `global_enabled`(킬스위치), `common_prompt` **둘뿐**. control-tower→user 위임(`/internal/platform-assistant-settings`, ai_tools 패턴). 모델 목록을 다루지 않으므로 **control-tower→language-model 링크는 없다**.
- **조직 레이어(조직 루트 권한자, groupware)**: SSOT = **groupwaredb `organization_assistant_settings`(org당 1행)**. 필드: `default_model`(미설정=내장 Qwen), `prompt_addition`. csc-groupware 소유(api_credentials 와 동일 원칙, 크로스-DB FK 없음). 조직 기본 모델 후보 = csc-groupware→language-model `/inference/models` **전체**(플랫폼이 좁히지 않는다).
- **병합(채팅 시점)**: csc-groupware `GET /internal/assistant-config/resolve?organizationId=` 가 조직 설정(로컬) + 플랫폼 설정(user fetch)을 병합해 **effective**(enabled / defaultModel(조직 설정, 없으면 null) / systemPrompt(공통+조직 이어붙임)) 반환. language-model `HttpAssistantConfigResolver`(기존 groupware 링크, 서비스토큰 재사용, TTL 캐시, 장애 시 fail-open)가 `stream_turn`/`create_session`/`list_models` 에서 적용: 킬스위치 차단, 기본 모델, 프롬프트 합성.
- **기본 모델 폴백 사슬(한 줄)**: 요청/세션 모델 → 조직 `default_model` → 카탈로그 기본(내장 Qwen). `resolve_chat` 이 미지/비활성 key 를 카탈로그 기본으로 흡수하므로, 조직이 사라진 모델을 가리켜도 유효한 모델이 나온다.
- **프론트 초기 선택**: `GET /ai-chat/models` 응답의 `is_default`(= 위 사슬로 정한 조직 기본 모델)를 프론트가 그대로 초기 선택에 쓴다. 프론트 상수로 정하면 조직 설정이 화면에 반영되지 않는다.
- **토폴로지**: csc-groupware→language-model(`/inference/models` 조회). 병합 fetch(groupware→user)와 채팅 resolve(language-model→groupware)는 기존 링크 재사용. env: csc-groupware `LANGUAGE_MODEL_API_URL`.

### 플랫폼 관리자 옵션 (조직 엔타이틀먼트와 분리)
- **결정(불변식):** 플랫폼 관리자(`admin_users`)의 관리 영역 접근권은 조직유저 엔타이틀먼트(`features`/`organization_*`)를 **재사용하지 않고 별도 테이블**(`admin_features`/`admin_user_features`)로 둔다. 두 액터(벤더 운영자 vs 조직유저)는 권한 축이 달라 한 테이블에 섞으면 의미가 꼬인다. `organization_*` 를 admin 에 끌어다 쓰지 말 것.
- **유효 접근 = ROOT 면 전체(활성 카탈로그 전부, grant 행 불필요) / ADMIN 이면 `admin_user_features` grant ∩ 카탈로그 `is_active`.** 부여/회수는 ROOT 만(추가도 ROOT 만).
- 관리자 access 토큰의 `adminFeatures` 클레임으로 다운스트림(사이드바/페이지 가드)이 토큰만으로 인가. 조직유저 토큰의 `features`/`aiTools` 와 이름, 출처 모두 분리.

### 토큰 클레임
```
AccessTokenPayload  = { id, email, name, userType, role, principalType, organizationId?, organizationType, features?, aiTools?, permissions?, position?, adminFeatures? }
RefreshTokenPayload = { id, tokenVersion, principalType }
```
- **`principalType`**(ADMIN_USER / ORGANIZATION_USER): refresh/find-data 가 어느 테이블(`admin_users` / `organization_users`)을 조회할지 라우팅한다. 테이블별 id 시퀀스가 독립이라 id 만으로는 구분 불가 → access, refresh **양쪽**에 담는다. **레거시 호환**: 구 `PLATFORM_ADMIN→ADMIN_USER`, `TENANT_USER`/`SERVICE_USER`→`ORGANIZATION_USER`(클레임 없으면 `ORGANIZATION_USER`)로 정규화(JwtTokenService.verify*): 기존 세션 무중단.
- **`features` / `aiTools` / `permissions`**: 조직유저의 **유효 엔타이틀먼트/권한 key 목록**(접근 가능한 기능/AI도구/보유 권한). 로그인, 리프레시 시 resolve 해 access 토큰에 싣는다 → 다운스트림 서비스는 토큰에서 바로 읽어 인가(cross-service 호출 불필요). staleness ≤ 쿠키 maxAge(~1일, proactive refresh). 관리자유저/플랫폼 토큰은 미포함(생략).
- **`position`**: 조직유저의 **직책**(REPRESENTATIVE 대표 / TEAM_LEADER 팀장). 권한/AI도구와 분리된 별도 차원(유저당 하나). 대표는 `hasRootAuthority`(ROOT 동등)의 근거: 로그인/리프레시 시 유저 행에서 그대로 싣는다. 없으면 생략.
- **`adminFeatures`**: 관리자유저(ADMIN_USER)의 **유효 플랫폼 관리 옵션 key 목록**(ROOT=전체, ADMIN=grant∩active). control-tower 사이드바/페이지 가드가 토큰만으로 인가. 조직유저 토큰에는 미포함(`features`/`aiTools` 와 분리).
- **플랫폼 토큰**: `organizationId` 없음, `organizationType=PLATFORM`, `userType=ADMIN_USER`. 조직 행이 없어도 PLATFORM 으로 발급하며, find-data 는 센티넬 조직(`type=PLATFORM`)을 반환해 프런트 `isPlatformAdmin` 을 유지한다.
- **테넌트 토큰**: `organizationId` + `organizationType=TENANT`. 가변값 slug 는 토큰에 넣지 않고 `findData` 로 조회(아래 slug 정책 동일).

가변값 `organizationSlug` 는 토큰에 넣지 않는다. 토큰 수명(최대 60일) 동안 stale 위험. **조직 slug 변경은
세션을 무효화하지 않으며**, `/[orgSlug]/admin` 가드가 다음 네비게이션에서 현재 slug 로 307 교정한다.
(세션 무효화가 필요한 건 정지/삭제: token_version bump.)

Refresh 토큰은 `principalType` 으로 테이블을 정한 뒤 해당 레코드에서 조직/상태를 재해석(테넌트는 갱신 시 조직 변경 반영, stale org 고정 방지).

### 조직 생명주기 ↔ 스토리지/부서

조직 삭제/개명/복구가 파일 스토리지(file-upload)와 부서(departments)에 어떻게 연동되는지. 상세는
[file-upload-limits.md](./file-upload-limits.md)(스토리지 구조/아카이브/접근통제).

- **개명(slug/name)**: 스토리지 무영향. object_key partition 은 **불변 orgId** 기반이라 이름이 바뀌어도 경로가 안 바뀐다(고아 없음). 세션도 무효화 안 함(위).
- **소프트 삭제(withdraw)**: `status=WITHDRAWN` + token_version bump. 하위 데이터/파일 스토리지는 **그대로 보존**(복구 대비).
- **복구(recover)**: WITHDRAWN → ACTIVE 되돌리기. **전용 경로**(user `POST /internal/organizations/:id/recover`, control-tower 위임, control-tower UI "복구" 버튼): 편집 폼 저장의 암묵 복구 부작용은 제거(WITHDRAWN 조직 저장 시 `status` 미포함). 소프트 삭제가 모두 보존하므로 상태만 되돌리면 완전 복구(사용자는 token bump 로 재로그인).
- **하드 삭제(purge)**: 조직/유저 영구 제거. 부서는 `departments.organization_id` **FK cascade** 로 서브트리 자동 정리(이 cascade 가 없어서 부서 있는 조직 purge 가 FK 위반으로 실패하던 버그를 수정). 파일은 control-tower 가 user purge 후 file-upload 로 **아카이브 후 1차 삭제**를 위임(고아 방지, best-effort).
- **조직 간 파일 접근**: 전역 버킷 없이 **플랫폼 ROOT 만** 전 조직 접근(권한 기반). 일반 접근은 자기 조직만. file-upload 소유 인덱스(`organization_id`)로 스코프. 강제(서명 다운로드)는 게이트(`REQUIRE_SIGNED_DOWNLOAD`) 기본 OFF, 임베드 전환 후 켠다.
- **스토리지 화면(공통/조직/개인)과 부서, 멤버 삭제의 연동은 아직 없다.** 부서를 지우면 그 부서 영역
  파일은 `department_id` 가 남은 채 아무도 볼 수 없게 되고(살아 있는 트리에 없는 부서라 인가 집합에
  들어가지 않는다), 멤버를 지우면 그 사람의 개인 영역 파일이 같은 이유로 닿지 않는다. userdb 의
  cascade 는 다른 DB 인 file-upload 에 닿지 못하므로(크로스-DB 금지) **삭제를 수행하는 BFF 가 재배치를
  위임**해야 한다. 그 경로(부서 재배치, 개인 파일 처분)는 스토리지 4단계에서 붙인다.

---

## 멀티-조직 멤버십 (확장 경로, 지금은 미구현)

한 사람이 여러 조직에 속해야 하는 요구가 생기면:
```
user_organizations (user_id, org_id, role, status)   # organization_users 의 role/organization_id 제거
```
로그인 시 활성 멤버십(조직) 선택 → 토큰에 선택 조직 담음. **모든 가드/로그인 흐름이 바뀌는 침습적 변경**이라
실제 요구가 생기기 전엔 도입하지 않는다. (a)→(b) 마이그레이션은 기존 `(organization_id, role)`을 멤버십 1행으로 backfill 하면 가산적.

그때는 이메일 유일성도 함께 재검토한다. 한 사람이 계정 하나로 여러 조직에 속하면 email 전역 유일이
그대로 성립하지만, 조직마다 **별개 계정**을 두려는 요구라면 로그인 진입점을 조직 스코프로 바꾸는 것
(조직별 서브도메인 또는 로그인 폼의 조직 선택)이 선행되어야 한다. 그것 없이 조직 범위 유일로 되돌리면
로그인이 어느 계정인지 정하지 못한다.

---

## 단계별 로드맵

| Phase | 범위 | 위험/파괴성 |
|------|------|------------|
| **0 (완료 대상)** | 프런트 조직 추상화: `Organization` 타입, `CurrentUser.organization`, 하드코딩 조직명 제거(더미). | 낮음 / 비파괴 |
| **1 (완료 대상)** | userdb `organizations` + `users.organization_id`(가산→backfill→notNull), email 전역 unique, 토큰 `organizationId` 클레임, 시더 기본 조직, findData 조직 반환, 프런트 실데이터 배선. | 중 / email unique 변경은 DB 레벨 파괴적이나 단일 테넌트는 기본 조직 backfill 로 무중단 |
| **2** | 조직 스코프 인가(가드가 `organizationId` 필터), control-tower 플랫폼 관리(조직 CRUD/테넌트 ROOT 발급, `PlatformAdminGuard`), 멀티-org 로그인 해석(조직 slug). | 중상 / 미스코프 쿼리 audit 필요 |
| **3** | 조직별 브랜딩(푸터/내정보/로그인 화이트라벨), 조직 설정 저장, groupwaredb/marketing 등 각 도메인 테이블에 `organization_id` 가산 + 필터. | 도메인별 가산, 낮음~중 |

### Phase 0/1 에서 반드시 "지금" 박아둘 것
1. **email 전역 unique**: 로그인 진입점이 조직 스코프가 아니면 이메일 하나가 계정 하나를 가리켜야 한다. 조직별 유일로 두면 같은 이메일이 두 조직에 생겼을 때 로그인이 어느 계정인지 정하지 못한다.
2. **토큰 경계 테넌시(`organizationId` 클레임)**: 모든 신규 엔드포인트가 태생부터 조직 스코프.
3. **PLATFORM = 예약 조직**(역할 enum/가드 불변).
4. **프런트 단일 org seam**: `CurrentUser.organization` 한 곳에서만 조직을 소비(컴포넌트가 조직 리터럴을 다시 import 하지 않게).

---

## 단일 테넌트 무중단 원칙

기존 단일 조직 배포는 그대로 동작해야 한다:
- 마이그레이션(`0001`)이 기존 유저를 `default` TENANT 조직으로 backfill 한 뒤 `organization_id` 를 NOT NULL 로 만든다(데이터 무중단).
- 마이그레이션(`0005`/`0006`)이 (당시명) `platform_admins` 테이블을 만들고, **PLATFORM 조직 소속 유저를 그 테이블로 이관**한 뒤 PLATFORM 조직 행을 제거한다(데이터 보존, `type='PLATFORM'` 기준으로만 동작: 모든 환경 멱등).
- 마이그레이션(`0008`)이 리네임(`platform_admins→admin_users`, `users→organization_users`, `ALTER TABLE RENAME`으로 데이터 보존)과 서비스 계층(`services`/`service_users`/라벨)을 추가했으나, **마이그레이션 `0010` 에서 서비스 계층을 다시 드롭**(미사용 스캐폴딩)하고 **`0011` 이 엔타이틀먼트(`features`/`ai_tools`/`organization_*`/`organization_user_*`)를 userdb 에 추가, 시드**한다. groupwaredb 의 구 엔타이틀먼트는 같은 작업에서 드롭(userdb 로 이전).
- 시더(`admin-seeder`)는 **`admin_users` 만** idempotent 보장한다(전역 email 로 find→없으면 create(ROOT)→비번 바뀌면 갱신). org 로직 없음. 부팅을 죽이지 않도록 `try/catch` 로 감싼다. **TENANT 조직은 시드하지 않는다.**
- 데모/기본 TENANT 조직(`default`/`비즈오피스 데모`)은 마이그레이션 `0003` 으로 제거됐다(유저 없을 때만). 조직 관리 목록(`listOrganizations`)은 TENANT 만 반환하며, 비어 있으면 UI 가 **데모 placeholder** 를 보여준다.
- 로그인은 테이블별로 분기: 플랫폼은 `POST /user-api/login/platform/email`(admin_users), 조직유저는 `POST /user-api/login/email`(organization_users). 멀티-org 로그인 해석은 Phase 2.

환경변수: `PLATFORM_ROOT_EMAIL`/`PLATFORM_ROOT_PASSWORD`(플랫폼 슈퍼관리자 시드: 구 `ROOT_ADMIN_*`).
