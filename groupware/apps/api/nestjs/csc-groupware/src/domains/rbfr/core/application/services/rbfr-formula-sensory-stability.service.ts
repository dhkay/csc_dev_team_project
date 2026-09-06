/**
 * 처방 사용감·안정성 기록(탭1 부속) — 계산이 아니라 실험/관능평가 결과를 그대로 기록한다.
 * dataSource 기본값(unknown)은 Outbound Adapter가 채운다.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { FormulaSensoryStabilityInput, FormulaSensoryStabilityRecord } from '../../domain/types';
import type { RbfrFormulaSensoryStabilityPort } from '../ports/inbound';
import {
  RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT,
  type RbfrFormulaSensoryStabilityRepositoryPort,
} from '../ports/outbound';

@Injectable()
export class RbfrFormulaSensoryStabilityService implements RbfrFormulaSensoryStabilityPort {
  constructor(
    @Inject(RBFR_FORMULA_SENSORY_STABILITY_REPOSITORY_PORT)
    private readonly repository: RbfrFormulaSensoryStabilityRepositoryPort,
  ) {}

  async addRecord(formulaId: number, input: FormulaSensoryStabilityInput): Promise<FormulaSensoryStabilityRecord> {
    return await this.repository.createRecord(formulaId, input);
  }

  async listRecords(formulaId: number): Promise<FormulaSensoryStabilityRecord[]> {
    return await this.repository.listRecords(formulaId);
  }
}
