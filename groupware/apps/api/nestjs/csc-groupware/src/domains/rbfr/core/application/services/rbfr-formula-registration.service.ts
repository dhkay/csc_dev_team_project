import { Inject, Injectable } from '@nestjs/common';
import type { CreateFormulaInput, CreateFormulaResult } from '../../domain/types';
import {
  RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT,
  type RbfrFormulaRegistrationRepositoryPort,
} from '../ports/outbound';
import type { RbfrFormulaRegistrationPort } from '../ports/inbound/rbfr-formula-registration.port';

@Injectable()
export class RbfrFormulaRegistrationService implements RbfrFormulaRegistrationPort {
  constructor(
    @Inject(RBFR_FORMULA_REGISTRATION_REPOSITORY_PORT)
    private readonly repository: RbfrFormulaRegistrationRepositoryPort,
  ) {}

  async createFormula(input: CreateFormulaInput): Promise<CreateFormulaResult> {
    return await this.repository.createFormula(input);
  }
}
