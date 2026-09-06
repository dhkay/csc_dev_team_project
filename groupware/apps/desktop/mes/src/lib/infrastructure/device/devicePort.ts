/**
 * 디바이스 포트. Phase 1 은 스캐너만 구현하고 프린터와 PLC 는 시그니처만 둔다.
 *
 * 지금 자리를 파두는 이유 셋:
 *
 * 1. 지금 필요 없는 async 를 지금 넣는다. 스캐너는 WebView 안에서 동기적으로 끝나지만
 *    프린터와 PLC 는 Rust 에 산다. 나중에 async 로 바꾸면 앱 전체의 호출부가 흔들린다.
 * 2. 라벨 인쇄는 outbox 로 간다. 직접 호출이 아니라 enqueue 다. 새벽에 용지가 떨어진
 *    프린터 때문에 인쇄 작업이 사라지면 안 되고, 그건 이미 outbox 가 푼 문제다.
 *    그래서 SyncEntity 에 label_print 를 미리 예약해 두었다.
 * 3. PLC 이벤트 자리는 서버 스키마에도 이미 있다. 설비 이벤트의 source 가
 *    MANUAL / PLC 로 갈린다. PLC 를 붙일 때 새로 만드는 것은 ingest 태스크뿐이고
 *    저장과 push 경로는 그대로다.
 */

export type DeviceKind = 'scanner' | 'printer' | 'plc';

export interface DeviceDescriptor {
  id: string;
  kind: DeviceKind;
  name: string;
  transport: 'hid' | 'usb' | 'serial' | 'tcp' | 'system';
  status: 'ready' | 'busy' | 'error' | 'absent';
}

export interface DevicePort {
  list(kind?: DeviceKind): Promise<DeviceDescriptor[]>;
  capabilities(id: string): Promise<string[]>;
}

/** 스캔 1건. 원시 키열과 간격을 함께 남겨 진단 화면에서 오분류를 추적할 수 있게 한다. */
export interface ScanResult {
  // 파싱된 코드 본문(prefix/suffix 제거 후)
  code: string;
  prefix: string | null;
  suffix: string | null;
  // 키 간격(ms). 스캐너/사람 타이핑 판정 근거
  intervals: number[];
  scannedAt: string;
}

export interface ScannerPort {
  /** 스캔 구독. 해제 함수를 돌려준다. */
  subscribe(handler: (result: ScanResult) => void): () => void;
}

/** Phase 3. 시그니처만 확정하고 구현체를 두지 않는다. */
export interface LabelJob {
  templateId: string;
  copies: number;
  data: Record<string, string>;
}

/** Phase 3. 인쇄는 직접 호출이 아니라 outbox enqueue 로 구현한다(위 2번 참고) */
export interface PrinterPort extends DevicePort {
  print(job: LabelJob): Promise<{ clientOpId: string }>;
}

/** Phase 3. */
export interface TagValue {
  tag: string;
  value: number | boolean | string;
  readAt: string;
}

/** Phase 3. */
export interface PlcPort extends DevicePort {
  read(tag: string): Promise<TagValue>;
  subscribe(tags: string[], handler: (value: TagValue) => void): () => void;
}
