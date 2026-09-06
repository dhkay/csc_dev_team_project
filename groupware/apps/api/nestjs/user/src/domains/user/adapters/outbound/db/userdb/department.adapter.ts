import { Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { userDb, departments } from '@csc/database/userdb';
import { DepartmentEntity } from '../../../../core/domain/entities/department.entity';
import {
  CreateDepartmentRecord,
  DepartmentRepositoryPort,
} from '../../../../core/application/ports/outbound/department-repository.port';
import { toDepartmentEntity } from './mappers';

/** DepartmentRepositoryPort 구현: userdb departments(부서 트리) */
@Injectable()
export class DepartmentRepositoryAdapter implements DepartmentRepositoryPort {
  async findManyRecordsByOrganizationId(organizationId: number): Promise<DepartmentEntity[]> {
    const rows = await userDb.query.departments.findMany({
      where: eq(departments.organizationId, organizationId),
      orderBy: asc(departments.createdAt),
    });
    return rows.map(toDepartmentEntity);
  }

  async findOneRecordById(id: number): Promise<DepartmentEntity | null> {
    const row = await userDb.query.departments.findFirst({
      where: eq(departments.id, id),
    });
    return row ? toDepartmentEntity(row) : null;
  }

  async createRecord(record: CreateDepartmentRecord): Promise<DepartmentEntity> {
    const [row] = await userDb
      .insert(departments)
      .values({
        organizationId: record.organizationId,
        parentId: record.parentId,
        name: record.name,
      })
      .returning();
    return toDepartmentEntity(row);
  }

  async updateNameRecord(id: number, name: string): Promise<void> {
    await userDb
      .update(departments)
      .set({ name, updatedAt: new Date() })
      .where(eq(departments.id, id));
  }

  async updateParentRecord(id: number, parentId: number | null): Promise<void> {
    await userDb
      .update(departments)
      .set({ parentId, updatedAt: new Date() })
      .where(eq(departments.id, id));
  }

  async deleteManyRecordsByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await userDb.delete(departments).where(inArray(departments.id, ids));
  }
}
