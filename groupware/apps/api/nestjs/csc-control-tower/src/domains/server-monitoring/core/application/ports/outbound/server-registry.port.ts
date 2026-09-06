import { RegisteredServer } from '../../../domain/server.types';

/** 환경별 서버 레지스트리 Outbound Port(dev/staging/prod 차이를 여기서 표현) */
export interface ServerRegistryPort {
  list(): RegisteredServer[];
}

export const SERVER_REGISTRY_PORT = Symbol('SERVER_REGISTRY_PORT');
