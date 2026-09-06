import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AUTH_PORT, AuthPort } from '../../../../core/application/ports/inbound/auth.port';
import { AccessTokenPayload } from '../../../../core/domain/types/user.types';
import { LoginEmailDto } from '../dto/login-email.dto';
import { RefreshDto } from '../dto/refresh.dto';
import { LogoutDto } from '../dto/logout.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

/**
 * 인증/계정 Inbound Adapter.
 * 경로는 web/groupware BFF 가 호출하는 형태(/user-api/login/email, refresh, find/data 등)에 정확히 매칭한다.
 */
@ApiTags('auth')
@Controller('user-api')
export class AuthController {
  constructor(
    @Inject(AUTH_PORT)
    private readonly authService: AuthPort,
  ) {}

  @ApiOperation({
    summary: '[AUTH-001] 이메일 로그인',
    description: '조직유저(WEB_USER) 이메일/비밀번호 로그인: Access/Refresh 토큰과 프로필을 발급한다.',
  })
  @Post('login/email')
  async loginEmail(@Body() dto: LoginEmailDto) {
    return this.authService.loginEmail(dto.email, dto.password);
  }

  /** 플랫폼 슈퍼관리자 로그인(control-tower): platform_admins 테이블 */
  @ApiOperation({
    summary: '[AUTH-002] 플랫폼 관리자 로그인',
    description: '플랫폼 슈퍼관리자(ADMIN_USER, control-tower) 이메일 로그인: admin_users 테이블 기준.',
  })
  @Post('login/platform/email')
  async loginPlatformEmail(@Body() dto: LoginEmailDto) {
    return this.authService.loginPlatformEmail(dto.email, dto.password);
  }

  @ApiOperation({
    summary: '[AUTH-003] 토큰 갱신',
    description: 'Refresh 토큰으로 새 Access/Refresh 토큰 쌍을 발급한다(Refresh Rotation).',
  })
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiOperation({
    summary: '[AUTH-004] 로그아웃',
    description: '전달된 Refresh 토큰을 무효화한다.',
  })
  @Post('logout')
  async logout(@Body() dto: LogoutDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: '[AUTH-005] 본인 데이터 조회',
    description: '토큰의 principalType 으로 테이블을 라우팅해 로그인 사용자/조직 정보를 조회한다.',
  })
  @UseGuards(JwtAuthGuard)
  @Get('find/data')
  async findData(@Req() req: Request & { user: AccessTokenPayload }) {
    return this.authService.findData(req.user.id, req.user.principalType);
  }
}
