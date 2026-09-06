/**
 * 동기화 엔티티 어휘. 서버 레지스트리, 클라이언트 outbox, 로컬 캐시 테이블이 같은 문자열을 쓴다.
 *
 * Phase 0 에는 구현이 없지만 어휘는 지금 고정한다. 계약 문자열이 나중에 바뀌면 이미 현장에 깔린
 * 앱의 outbox 에 남은 값과 어긋나고, 그 outbox 는 영영 전송되지 않는다.
 */
export enum SyncEntity {
  /** 마스터: 품목 (pull only). Phase 1 */
  Item = 'item',
  /** 마스터: 라인 (pull only). Phase 1 */
  Line = 'line',
  /** 마스터: 공정 (pull only). Phase 1 */
  Process = 'process',
  /** 마스터: 작업자. 배지 스캔 조회 대상이라 오프라인에서도 있어야 한다. Phase 1 */
  Worker = 'worker',
  /** 마스터: 설비 (pull only). Phase 2 */
  Equipment = 'equipment',
  /** 마스터: 불량 코드 (pull only). Phase 1 */
  DefectCode = 'defect_code',
  /** 마스터: 비가동 사유 (pull only). Phase 2 */
  DowntimeReason = 'downtime_reason',
  /** 마스터: 검사 템플릿 (pull only). Phase 2 */
  InspectionTemplate = 'inspection_template',
  /** 작업지시. 마스터 필드는 pull only, 상태는 intent 로 양방향. Phase 1 */
  WorkOrder = 'work_order',
  /** 생산실적. append-only push. Phase 1 */
  ProductionRecord = 'production_record',
  /** 품질검사. append-only push. Phase 2 */
  Inspection = 'inspection',
  /** 설비 가동상태 이벤트. append-only push. Phase 2 */
  EquipmentStateEvent = 'equipment_state_event',
  /**
   * 진단 로그. outbox 를 재사용하는 특수 엔티티라 밑줄로 시작해 도메인과 구분한다.
   * 도메인 op 보다 낮은 우선순위와 별도 용량 상한을 갖는다. 로그가 생산실적 전송을
   * 밀어내면 안 된다. Phase 2
   */
  Log = '_log',
  /**
   * 라벨 인쇄 작업. Phase 3 에서 구현하지만 어휘는 지금 예약한다.
   * 프린터 인쇄를 직접 호출이 아니라 enqueue 로 설계하는 이유: 새벽에 용지가 떨어진 프린터
   * 때문에 인쇄 작업이 사라지면 안 되고, 그건 이미 outbox 가 푼 문제다.
   */
  LabelPrint = 'label_print',
}
