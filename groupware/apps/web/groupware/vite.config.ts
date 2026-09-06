import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import terser from '@rollup/plugin-terser';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ command }) => {
	const isBuild = command === 'build';

	// Vite 7: esm-env의 DEV 상수는 NODE_ENV 기반 export conditions로 결정됨
	// → Docker 빌드 시 NODE_ENV=production 필수, 스테이징은 STAGING=true로 구분
	const isStaging = process.env.STAGING === 'true';
	const isFullProd = process.env.NODE_ENV === 'production' && !isStaging;

	// .env 파일 로드 (dev 서버용: Docker 빌드에는 .env 파일 없음)
	const envMode = (isStaging || process.env.NODE_ENV === 'staging') ? 'staging' : 'dev';
	const appDir = path.resolve(__dirname);
	const env = loadEnv(envMode, appDir, '');

	return {
		envPrefix: 'VITE_',
		envDir: appDir,
		// 빌드 시 반드시 'production': SvelteKit App ID 서버/클라이언트 일치 보장
		// dev 서버는 envMode 유지 (.env.dev/.env.staging 자동 로드)
		mode: isBuild ? 'production' : envMode,
		plugins: [tailwindcss(), sveltekit()],
		ssr: {
			// 워크스페이스 raw 소스 패키지 + .svelte 를 dist 로 배포하는 패키지는 SSR 시 번들에 포함
			// (externalize 하면 Node 가 raw .svelte 를 직접 로드하려다 ERR_UNKNOWN_FILE_EXTENSION)
			// @tanstack/svelte-query v6 는 dist 에 .svelte(QueryClientProvider/HydrationBoundary 등)를 담는다.
			noExternal: ['@csc/shared-ui', '@tanstack/svelte-query'],
			external: [
				'@nestjs/common',
				'@nestjs/core',
				'@nestjs/platform-express',
				'class-transformer',
				'class-validator',
				'reflect-metadata'
			]
		},
		resolve: {
			alias: {
				$lib: path.resolve('./src/lib')
			}
		},
		esbuild: {
			// prod: console + debugger 제거, dev/staging: debugger만 제거
			drop: isFullProd ? ['console', 'debugger'] : ['debugger'],
		},
		build: {
			// prod에서만 Terser 난독화 적용, dev/staging은 기본 esbuild 경량 압축
			...(isFullProd && { minify: 'terser' as const }),
			rollupOptions: {
				external: [
					/^@nestjs\/.*/,
					'class-transformer',
					'class-validator',
					'reflect-metadata'
				],
				...(isFullProd && {
					plugins: [
						terser({
							// 변수명/함수명 난독화
							mangle: {
								properties: false,
								toplevel: true,
								eval: true,
								keep_fnames: false
							},
							// 코드 압축 최적화
							compress: {
								drop_console: true,
								drop_debugger: true,
								passes: 2,
								dead_code: true,
								conditionals: true,
								sequences: true,
								join_vars: true,
								booleans: true,
								evaluate: true
							},
							// 출력 최적화
							format: {
								comments: false,
								semicolons: false
							}
						})
					],
					output: {
						chunkFileNames: '[hash].js',
						entryFileNames: '[hash].js',
					}
				})
			}
		},
		test: {
			// requireAssertions: true는 각 project 안에 명시 (extends 자기참조 시 base 옵션 미상속 버그 회피)
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'unit',
						environment: 'node',
						include: ['tests/unit/**/*.test.{js,ts}'],
						exclude: ['**/*.svelte.test.{js,ts}'],
						expect: { requireAssertions: true }
					}
				},
				{
					extends: './vite.config.ts',
					plugins: [svelteTesting()],
					test: {
						name: 'component',
						environment: 'jsdom',
						globals: true,
						include: ['tests/component/**/*.svelte.test.{js,ts}'],
						setupFiles: ['tests/setup/component-setup.ts'],
						// requireAssertions는 vitest 3.2.4 + jsdom + svelteTesting 조합에서 expect 카운트 메커니즘이
						// 깨짐(모든 expect 호출이 0회로 집계). component 테스트는 spy 기반이라 false positive 위험 낮음
						expect: { requireAssertions: false }
					}
				},
				{
					extends: './vite.config.ts',
					test: {
						name: 'integration',
						environment: 'node',
						include: ['tests/integration/**/*.test.{js,ts}'],
						expect: { requireAssertions: true }
					}
				}
			]
		},
		server: {
			// localhost HTTP 만 허용: LAN IP 는 dev-runner 가 띄우는 HTTPS 리버스 프록시가 처리 (동일 포트 5173, LAN IP 바인딩)
			host: '127.0.0.1',
			port: parseInt(env.VITE_PORT) || 5173,  // .env.dev에서 포트 로드
			open: false,  // 스크립트에서 독립적으로 브라우저 열기
			allowedHosts: true,  // 로컬 네트워크 IP 접속 허용 (192.168.x.x 등) + trycloudflare.com 호스트 허용
			// 비-localhost HTTPS 접속(LAN IP HTTPS, Cloudflare Tunnel 등)에서 client 측 devUrlRewrite 가
			// http://localhost:{port}/ 절대 URL 을 /api-backend/{name}/ 상대 경로로 재작성하는데,
			// 해당 요청이 Vite 에 도달했을 때 각 API 포트로 포워딩하기 위한 규칙
			// localhost HTTP 직접 접속에서는 client 가 절대 URL 을 그대로 호출하므로 이 규칙은 사용되지 않음
			proxy: {
				// csc 백엔드 포트: csc-groupware 3000 / user 3002 / csc-control-tower 3001 / file-upload 8001 / marketing-video 8000
				'/api-backend/main':    { target: 'http://127.0.0.1:3000', changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/api-backend\/main/, '') },
				'/api-backend/user':    { target: 'http://127.0.0.1:3002', changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/api-backend\/user/, '') },
				'/api-backend/admin':   { target: 'http://127.0.0.1:3001', changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/api-backend\/admin/, '') },
				'/api-backend/storage': { target: 'http://127.0.0.1:8001', changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/api-backend\/storage/, '') },
				'/api-backend/marketing-video': { target: 'http://127.0.0.1:8000', changeOrigin: true, secure: false, rewrite: (p) => p.replace(/^\/api-backend\/marketing-video/, '') },
			},
		},
		preview: {
			port: 4173,
			host: '0.0.0.0',  // Docker 컨테이너에서 외부 접속 허용
			allowedHosts: true
		}
	};
});