import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  RBFR_INGREDIENT_REGISTRATION_PORT,
  type RbfrIngredientRegistrationPort,
} from '../../../../core/application/ports/inbound/rbfr-ingredient-registration.port';
import { CreateIngredientDto } from '../dto';

/** 02_화면구성.md 탭3 "원료 등록/검증"(DATA 권한) 화면이 호출하는 진입점. */
@Controller('rbfr-api')
export class RbfrIngredientController {
  constructor(
    @Inject(RBFR_INGREDIENT_REGISTRATION_PORT)
    private readonly registration: RbfrIngredientRegistrationPort,
  ) {}

  @Get('profiles/:profileCode/direct-domains')
  async listDirectDomains(@Param('profileCode') profileCode: string): Promise<string[]> {
    return await this.registration.listDirectDomains(profileCode);
  }

  @Post('ingredients')
  async registerIngredient(@Body() dto: CreateIngredientDto) {
    return await this.registration.registerIngredient(dto);
  }

  @Get('ingredients')
  async listIngredients() {
    return await this.registration.listIngredients();
  }
}
