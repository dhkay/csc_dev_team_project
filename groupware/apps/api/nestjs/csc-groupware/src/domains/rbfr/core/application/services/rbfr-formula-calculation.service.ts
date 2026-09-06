/**
 * 처방 계산·검증 오케스트레이션. Outbound Port(RbfrFormulaRepositoryPort)로 데이터를 모아
 * RbfrScoringService(계산)와 RbfrValidationService(검증)에 넘긴다. 이 서비스 자체는 계산식이나
 * 검증 규칙을 알지 못한다 — 그건 두 하위 서비스의 책임이다(단일 책임 유지).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { FormulaConditions, IntegratedRoleInput } from '../../domain/types';
import { RBFR_FORMULA_REPOSITORY_PORT, type RbfrFormulaRepositoryPort } from '../ports/outbound';
import { RBFR_SCORING_PORT, type RbfrScoringPort } from '../ports/inbound/rbfr-scoring.port';
import { RBFR_VALIDATION_PORT, type RbfrValidationPort } from '../ports/inbound/rbfr-validation.port';
import type { FormulaCalculationResult, RbfrFormulaCalculationPort } from '../ports/inbound/rbfr-formula-calculation.port';

const EMPTY_CONDITIONS: FormulaConditions = { excludedNoaddCodes: [], requiredCertCodes: [] };
const NO_INTEGRATED_ROLE: IntegratedRoleInput = { domainCode: '', hasEvidence: false, value: 0 };

@Injectable()
export class RbfrFormulaCalculationService implements RbfrFormulaCalculationPort {
  constructor(
    @Inject(RBFR_FORMULA_REPOSITORY_PORT)
    private readonly repository: RbfrFormulaRepositoryPort,
    @Inject(RBFR_SCORING_PORT)
    private readonly scoring: RbfrScoringPort,
    @Inject(RBFR_VALIDATION_PORT)
    private readonly validation: RbfrValidationPort,
  ) {}

  async calculateAndValidateFormula(formulaId: number, profileCode: string): Promise<FormulaCalculationResult> {
    const formulaIngredients = await this.repository.findFormulaIngredients(formulaId);
    const ingredientIds = formulaIngredients.map((fi) => Number(fi.ingredientId));

    const directDomainCodes = await this.repository.findDirectDomainCodes(profileCode);
    const integratedDomainCode = await this.repository.findIntegratedDomainCode(profileCode);

    const [contributions, interactions, concentrationLimits] = await Promise.all([
      this.repository.findContributions(ingredientIds, directDomainCodes),
      this.repository.findInteractionCoefficients(ingredientIds, directDomainCodes),
      this.repository.findConcentrationLimits(ingredientIds),
    ]);

    const directResults = this.scoring.calculateAllDirectRoleEfficacies(
      directDomainCodes,
      formulaIngredients,
      contributions,
      interactions,
      concentrationLimits,
    );

    const integratedRole = integratedDomainCode
      ? await this.repository.findIntegratedRoleInput(formulaId, integratedDomainCode)
      : NO_INTEGRATED_ROLE;

    const ratios = this.scoring.calculateRatioValues(directResults, integratedRole);

    const [
      pinned,
      conditions,
      targetCountryCodes,
      regulations,
      incompat,
      noaddFlags,
      certs,
      phRanges,
      hlbProfiles,
      unitPrices,
    ] = await Promise.all([
      this.repository.findPinnedIngredients(formulaId),
      this.repository.findFormulaConditions(formulaId),
      this.repository.findFormulaCountryCodes(formulaId),
      this.repository.findRegulations(ingredientIds),
      this.repository.findIncompat(ingredientIds),
      this.repository.findNoaddFlags(ingredientIds),
      this.repository.findCerts(ingredientIds),
      this.repository.findPhRanges(ingredientIds),
      this.repository.findHlbProfiles(ingredientIds),
      this.repository.findUnitPrices(ingredientIds),
    ]);

    const validationResult = this.validation.validateFormula({
      formulaIngredients,
      regulations,
      targetCountryCodes,
      noaddFlags,
      certs,
      pinned,
      phRanges,
      incompat,
      hlbProfiles,
      unitPrices,
      conditions: conditions ?? EMPTY_CONDITIONS,
    });

    return { directResults, ratios, validation: validationResult };
  }
}
