import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { ToolVersion, parseToolVersion } from '../../../domain/tool-version';

// 버전 스코프 컨트롤러의 경로 접두사. 세그먼트 이름이 갈리면 데코레이터가 조용히 undefined 를 읽어 한 곳에서 정의
export const TOOL_VERSION_ROUTE = 'v/:version';

/** 데코레이터가 보는 요청의 최소 형태(경로 파라미터만) */
export interface RouteParamsCarrier {
  params?: Record<string, string>;
}

/**
 * 요청의 경로 파라미터를 ToolVersion 으로 변환
 * 데코레이터와 갈라 둔 이유는 테스트(파라미터 데코레이터 팩토리는 직접 호출이 어려움)
 */
export function toolVersionFromRequest(request: RouteParamsCarrier): ToolVersion {
  return parseToolVersion(request.params?.version);
}

/**
 * 경로 세그먼트를 ToolVersion 으로 변환하는 데코레이터. 요청 안에서 버전의 유일한 생산자
 * 모르는 값은 400, 세그먼트 없는 경로는 404. 기본값으로 접는 경로가 없어 누락이 실패로 드러남
 */
export const PathToolVersion = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ToolVersion =>
    toolVersionFromRequest(ctx.switchToHttp().getRequest<RouteParamsCarrier>()),
);
