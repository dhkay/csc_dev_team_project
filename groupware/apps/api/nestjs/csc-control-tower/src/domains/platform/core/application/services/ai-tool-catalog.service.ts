import { Inject, Injectable } from '@nestjs/common';
import { AiToolCatalogItem } from '../../domain/ai-tool.types';
import {
  AiToolCatalogPort,
  UpdateAiToolInput,
} from '../ports/inbound/ai-tool-catalog.port';
import { USER_API_PORT, UserApiPort } from '../ports/outbound/user-api.port';

/**
 * AI 도구 카탈로그 관리 Service (control-tower): 표시명/slug 조회, 수정
 * ai_tools 는 userdb(user 서버 소유)라 직접 쓰지 않고 user 서버에 위임한다(소유권)
 */
@Injectable()
export class AiToolCatalogService implements AiToolCatalogPort {
  constructor(
    @Inject(USER_API_PORT)
    private readonly userApi: UserApiPort,
  ) {}

  listAiToolCatalog(): Promise<AiToolCatalogItem[]> {
    return this.userApi.listAiToolCatalog();
  }

  updateAiTool(key: string, patch: UpdateAiToolInput): Promise<AiToolCatalogItem> {
    return this.userApi.updateAiTool(key, patch);
  }
}
