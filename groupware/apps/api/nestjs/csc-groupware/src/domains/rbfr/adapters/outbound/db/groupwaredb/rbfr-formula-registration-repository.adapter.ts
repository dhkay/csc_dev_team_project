/**
 * RbfrFormulaRegistrationRepositoryPort의 Drizzle 구현. 처방을 만들 때마다 새 프로젝트도 함께
 * 만든다(임시 단순화 — 프로젝트 선택 화면이 아직 없다, rbfr-formula-registration.types.ts 참고).
 * 세 테이블(프로젝트/처방/처방원료)에 걸친 쓰기라 트랜잭션으로 묶어 부분 실패를 막는다.
 */
import { Injectable } from '@nestjs/common';
import { groupwareDb, rbfrProjects, rbfrFormulas, rbfrFormulaIngredients } from '@csc/database/groupwaredb';
import type { CreateFormulaInput, CreateFormulaResult } from '../../../../core/domain/types';
import type { RbfrFormulaRegistrationRepositoryPort } from '../../../../core/application/ports/outbound';

/** 인증 연동 전까지의 임시 소유자 id(확인 필요, develop_status.md 참고). */
const PLACEHOLDER_OWNER_ID = 1;

@Injectable()
export class RbfrFormulaRegistrationRepositoryAdapter implements RbfrFormulaRegistrationRepositoryPort {
  async createFormula(input: CreateFormulaInput): Promise<CreateFormulaResult> {
    return await groupwareDb.transaction(async (tx) => {
      const ownerId = input.ownerId ?? PLACEHOLDER_OWNER_ID;

      const [project] = await tx
        .insert(rbfrProjects)
        .values({ projectName: input.projectName, ownerId })
        .returning({ id: rbfrProjects.id });

      const [formula] = await tx
        .insert(rbfrFormulas)
        .values({ projectId: project.id, formulaName: input.formulaName, ownerId, status: 'DRAFT' })
        .returning({ id: rbfrFormulas.id });

      if (input.ingredients.length > 0) {
        await tx.insert(rbfrFormulaIngredients).values(
          input.ingredients.map((ing) => ({
            formulaId: formula.id,
            ingredientId: ing.ingredientId,
            actualPct: ing.actualPct.toString(),
          })),
        );
      }

      return { formulaId: formula.id, projectId: project.id };
    });
  }
}
