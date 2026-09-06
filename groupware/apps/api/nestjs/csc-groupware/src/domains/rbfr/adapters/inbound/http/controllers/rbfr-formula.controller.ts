import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  RBFR_FORMULA_CALCULATION_PORT,
  type RbfrFormulaCalculationPort,
} from '../../../../core/application/ports/inbound/rbfr-formula-calculation.port';
import {
  RBFR_FORMULA_REGISTRATION_PORT,
  type RbfrFormulaRegistrationPort,
} from '../../../../core/application/ports/inbound/rbfr-formula-registration.port';
import {
  RBFR_FORMULA_SENSORY_STABILITY_PORT,
  type RbfrFormulaSensoryStabilityPort,
} from '../../../../core/application/ports/inbound/rbfr-formula-sensory-stability.port';
import { CalculateFormulaQueryDto, CreateFormulaDto, CreateSensoryStabilityRecordDto } from '../dto';

/**
 * 02_화면구성.md 탭1 "정방향 계산" 화면이 호출하는 진입점. 계산/생성 자체는 여기서 하지 않고
 * 각 Port에 위임한다(Controller는 얇게 유지).
 */
@Controller('rbfr-api')
export class RbfrFormulaController {
  constructor(
    @Inject(RBFR_FORMULA_CALCULATION_PORT)
    private readonly calculation: RbfrFormulaCalculationPort,
    @Inject(RBFR_FORMULA_REGISTRATION_PORT)
    private readonly registration: RbfrFormulaRegistrationPort,
    @Inject(RBFR_FORMULA_SENSORY_STABILITY_PORT)
    private readonly sensoryStability: RbfrFormulaSensoryStabilityPort,
  ) {}

  @Get('formulas/:formulaId/calculate')
  async calculateFormula(
    @Param('formulaId', ParseIntPipe) formulaId: number,
    @Query() query: CalculateFormulaQueryDto,
  ) {
    return await this.calculation.calculateAndValidateFormula(formulaId, query.profileCode);
  }

  @Post('formulas')
  async createFormula(@Body() dto: CreateFormulaDto) {
    return await this.registration.createFormula(dto);
  }

  @Post('formulas/:formulaId/sensory-stability')
  async addSensoryStabilityRecord(
    @Param('formulaId', ParseIntPipe) formulaId: number,
    @Body() dto: CreateSensoryStabilityRecordDto,
  ) {
    return await this.sensoryStability.addRecord(formulaId, dto);
  }

  @Get('formulas/:formulaId/sensory-stability')
  async listSensoryStabilityRecords(@Param('formulaId', ParseIntPipe) formulaId: number) {
    return await this.sensoryStability.listRecords(formulaId);
  }
}
