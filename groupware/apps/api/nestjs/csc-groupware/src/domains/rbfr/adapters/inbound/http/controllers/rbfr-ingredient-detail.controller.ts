import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { RBFR_INGREDIENT_DETAIL_PORT, type RbfrIngredientDetailPort } from '../../../../core/application/ports/inbound';
import { CreateCasDto, CreateCertDto, CreateFlagDto, CreateIncompatDto, CreateInteractionDto, CreateRegulationDto } from '../dto';

/** 02_화면구성.md 탭3 부속 섹션(CAS/국가별 규제/인증/무첨가/원료쌍)이 호출하는 진입점. */
@Controller('rbfr-api')
export class RbfrIngredientDetailController {
  constructor(
    @Inject(RBFR_INGREDIENT_DETAIL_PORT)
    private readonly detail: RbfrIngredientDetailPort,
  ) {}

  @Post('ingredients/:ingredientId/cas')
  async addCas(@Param('ingredientId', ParseIntPipe) ingredientId: number, @Body() dto: CreateCasDto) {
    await this.detail.addCas(ingredientId, dto);
    return { ingredientId };
  }

  @Get('ingredients/:ingredientId/cas')
  async listCas(@Param('ingredientId', ParseIntPipe) ingredientId: number) {
    return await this.detail.listCas(ingredientId);
  }

  @Post('ingredients/:ingredientId/regulations')
  async addRegulation(@Param('ingredientId', ParseIntPipe) ingredientId: number, @Body() dto: CreateRegulationDto) {
    return await this.detail.addRegulation(ingredientId, dto);
  }

  @Get('ingredients/:ingredientId/regulations')
  async listRegulations(@Param('ingredientId', ParseIntPipe) ingredientId: number) {
    return await this.detail.listRegulations(ingredientId);
  }

  @Post('ingredients/:ingredientId/certs')
  async addCert(@Param('ingredientId', ParseIntPipe) ingredientId: number, @Body() dto: CreateCertDto) {
    await this.detail.addCert(ingredientId, dto);
    return { ingredientId };
  }

  @Get('ingredients/:ingredientId/certs')
  async listCerts(@Param('ingredientId', ParseIntPipe) ingredientId: number) {
    return await this.detail.listCerts(ingredientId);
  }

  @Post('ingredients/:ingredientId/flags')
  async addFlag(@Param('ingredientId', ParseIntPipe) ingredientId: number, @Body() dto: CreateFlagDto) {
    await this.detail.addFlag(ingredientId, dto);
    return { ingredientId };
  }

  @Get('ingredients/:ingredientId/flags')
  async listFlags(@Param('ingredientId', ParseIntPipe) ingredientId: number) {
    return await this.detail.listFlags(ingredientId);
  }

  @Post('ingredient-interactions')
  async addInteraction(@Body() dto: CreateInteractionDto) {
    return await this.detail.addInteraction(dto);
  }

  @Get('ingredient-interactions')
  async listInteractions(@Query('ingredientId', ParseIntPipe) ingredientId: number) {
    return await this.detail.listInteractions(ingredientId);
  }

  @Post('ingredient-incompat')
  async addIncompat(@Body() dto: CreateIncompatDto) {
    await this.detail.addIncompat(dto);
    return { ingredientId: dto.ingredientId, otherId: dto.otherId };
  }

  @Get('ingredient-incompat')
  async listIncompat(@Query('ingredientId', ParseIntPipe) ingredientId: number) {
    return await this.detail.listIncompat(ingredientId);
  }
}
