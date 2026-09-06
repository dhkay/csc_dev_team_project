/**
 * scalar-gateway: 통합 API 문서 포털
 *
 * 모든 라우트는 registry(단일 진실원)에서 파생된다. 스펙 프록시는 백엔드 스펙을 서버간
 * fetch 한 뒤 `servers` 를 `/proxy/:name` 으로 rewrite 하고, 호출 프록시는 X-Service-Token 을
 * 주입한다(유저 JWT 는 Bearer 로만 통과).
 *
 * 보호는 nginx IP allowlist + 앱 레벨 BasicAuth 이중이다. 백엔드는 내부망 전용이라 포털만 노출된다.
 */
import express from 'express';
import { apiReference } from '@scalar/express-api-reference';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { basicAuth } from './basic-auth.js';
import { findBackend, REGISTRY } from './registry.js';
import { mintServiceToken } from './token.js';

const app = express();
app.disable('x-powered-by');

// 1) 헬스체크: 인증/프록시 이전. 컨테이너 healthcheck 용
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', backends: REGISTRY.map((b) => b.name) });
});

// 2) BasicAuth: 이후 모든 라우트 보호(UI/스펙/프록시)
app.use(basicAuth());

// 3) 스펙 프록시: 백엔드 /openapi.json 을 서버간 수집 후 servers 를 게이트웨이 프록시로 rewrite.
app.get('/specs/:name/openapi.json', async (req, res) => {
  const backend = findBackend(req.params.name);
  if (!backend) {
    res.status(404).json({ error: `unknown backend: ${req.params.name}` });
    return;
  }
  try {
    const upstream = await fetch(`${backend.baseUrl}/openapi.json`, {
      headers: { 'x-service-token': mintServiceToken() },
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `upstream ${upstream.status} from ${backend.name}` });
      return;
    }
    const spec = (await upstream.json()) as Record<string, unknown>;
    // Try-it-out 요청이 게이트웨이 프록시를 향하도록 servers 재작성
    spec.servers = [
      { url: `/proxy/${backend.name}`, description: `${backend.label} (via scalar-gateway)` },
    ];
    // 스펙은 백엔드 변경에 따라 수시로 바뀌므로 절대 캐시하지 않는다(브라우저가 항상 최신 재수집)
    res.set('Cache-Control', 'no-store');
    res.json(spec);
  } catch (err) {
    res.status(502).json({ error: 'failed to fetch spec', backend: backend.name, detail: String(err) });
  }
});

// 4) 호출 프록시: Try-it-out. '/proxy' 에 마운트하고 첫 세그먼트(:name)로 백엔드를 해석한다.
//    유효하지 않은 name 은 404, X-Service-Token 주입, Authorization 은 Bearer(유저 JWT)만 통과(Basic 누설 방지)
app.use('/proxy', (req, res, next) => {
  const name = req.url.split('/')[1]?.split('?')[0] ?? '';
  if (!findBackend(name)) {
    res.status(404).json({ error: `unknown backend: ${name}` });
    return;
  }
  next();
});

app.use(
  '/proxy',
  createProxyMiddleware({
    changeOrigin: true,
    // req.url = '/:name/rest?query' → 백엔드 baseUrl 해석
    router: (req) => {
      const name = req.url?.split('/')[1]?.split('?')[0] ?? '';
      return findBackend(name)?.baseUrl;
    },
    // 첫 세그먼트(/:name) 제거 → 백엔드 실제 경로
    pathRewrite: (path) => path.replace(/^\/[^/]+/, '') || '/',
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('x-service-token', mintServiceToken());
        // 유저 JWT(Bearer)만 통과. BasicAuth 자격증명(브라우저 자동 재전송)이 백엔드로 새지 않게 제거
        const auth = req.headers['authorization'];
        const value = Array.isArray(auth) ? auth[0] : auth;
        if (!value || !/^Bearer\s/i.test(value)) {
          proxyReq.removeHeader('authorization');
        }
      },
    },
  }),
);

// 5) Scalar UI: registry 의 모든 백엔드를 소스 드롭다운으로. (마지막에 마운트: '/' catch-all)
app.use(
  '/',
  apiReference({
    sources: REGISTRY.map((b) => ({ title: b.label, url: `/specs/${b.name}/openapi.json` })),
  }),
);

// 로컬 `pnpm dev` 충돌 회피: 기본 3300(백엔드 3000~3002, 8000~8001 와 겹치지 않음)
// 도커는 PORT=3000 을 env 로 주입(compose/Dockerfile)하므로 컨테이너 내부 포트는 3000 유지
const port = Number(process.env.PORT ?? 3300);
app.listen(port, () => {
  console.log(`[scalar-gateway] listening on :${port}`);
  console.log(`[scalar-gateway] backends: ${REGISTRY.map((b) => `${b.name}→${b.baseUrl}`).join(', ')}`);
});
