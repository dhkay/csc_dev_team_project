// 변경 로직(쓰기). apis 를 호출/조합한다.
import * as memberApi from '../apis/membersApi';
import type { CreateMemberInput, UpdateMemberInput } from '../types';

export const createMember = (input: CreateMemberInput) => memberApi.createMember(input);
export const updateMember = (id: number, patch: UpdateMemberInput) =>
  memberApi.updateMember(id, patch);
export const deleteMember = (id: number) => memberApi.deleteMember(id);
export const purgeMember = (id: number) => memberApi.purgeMember(id);
