import { Body, Controller, Inject, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  ACCOUNT_PORT,
  AccountPort,
} from '../../../../core/application/ports/inbound/account.port';
import { AccessTokenPayload } from '../../../../core/domain/types/user.types';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UpdateMeDto } from '../dto/update-me.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

/**
 * 조직유저 본인 계정 self-service Inbound Adapter: JWT(본인) 인증
 * 경로는 web/groupware BFF 가 호출하는 형태(/user-api/me, /user-api/me/password)에 매칭
 * 역할 게이팅(ROOT/ADMIN), 주체 검증은 AccountService 가 강제(보안 경계)
 */
@ApiTags('account')
@Controller('user-api')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    @Inject(ACCOUNT_PORT)
    private readonly accountService: AccountPort,
  ) {}

  /** 본인 프로필 수정(이름/프로필이미지: 전 역할 공통) */
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[ACCOUNT-001] 본인 프로필 수정',
    description: '로그인한 사용자가 본인의 이름/프로필이미지를 수정한다(전 역할 공통).',
  })
  @Patch('me')
  async updateMe(
    @Req() req: Request & { user: AccessTokenPayload },
    @Body() dto: UpdateMeDto,
  ) {
    await this.accountService.updateOwnProfile(
      { id: req.user.id, role: req.user.role, principalType: req.user.principalType },
      dto,
    );
    return { success: true };
  }

  /** 본인 비밀번호 변경(ADMIN 전용: ROOT 는 플랫폼 관리) */
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[ACCOUNT-002] 본인 비밀번호 변경',
    description: '로그인한 사용자가 현재 비밀번호 확인 후 새 비밀번호로 변경한다(ADMIN 전용).',
  })
  @Post('me/password')
  async changePassword(
    @Req() req: Request & { user: AccessTokenPayload },
    @Body() dto: ChangePasswordDto,
  ) {
    await this.accountService.changeOwnPassword(
      { id: req.user.id, role: req.user.role, principalType: req.user.principalType },
      dto.currentPassword,
      dto.newPassword,
    );
    return { success: true };
  }
}
