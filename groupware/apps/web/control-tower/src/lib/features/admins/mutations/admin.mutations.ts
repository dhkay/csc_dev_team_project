// 변경 로직(쓰기). apis 를 호출/조합한다.
import * as adminApi from '../apis/adminsApi';
import type { CreateAdminInput, UpdateAdminInput } from '../types';

export const createAdmin = (input: CreateAdminInput) => adminApi.createAdmin(input);
export const deleteAdmin = (id: number) => adminApi.deleteAdmin(id);
export const setAdminFeatures = (id: number, features: string[]) =>
  adminApi.setAdminFeatures(id, features);
export const updateAdmin = (id: number, patch: UpdateAdminInput) =>
  adminApi.updateAdmin(id, patch);
