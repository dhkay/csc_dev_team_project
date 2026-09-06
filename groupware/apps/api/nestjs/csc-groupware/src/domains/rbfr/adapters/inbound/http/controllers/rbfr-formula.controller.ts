import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  RBFR_FORMULA_CALCULATION_PORT,
  type RbfrFormulaCalculationPort,
} from '../../../../core/application/ports/inbound/rbfr-formula-calculation.port';
import {
  RBFR_FORMULA_REGISTRATION_PORT,
  type RbfrFormulaRegistrationPort,
} from '../../../../core/application/ports/inbound/rbfr-formula-registration.port';
import { CalculateFormulaQueryDto, CreateFormulaDto } from '../dto';

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
}
