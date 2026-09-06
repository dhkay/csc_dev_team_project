//! 골든 픽스처 파싱 테스트.
//!
//! TS 패키지의 fixtures/ 를 그대로 읽는다. 같은 JSON 을 csc-mes 의 Jest 테스트,
//! 데스크톱 TS 테스트, 그리고 이 Rust 테스트가 함께 파싱한다. 셋 중 하나라도 실패하면
//! 계약이 갈라진 것이고, 그 사실이 런타임이 아니라 CI 에서 드러난다.
//!
//! `include_str!` 을 쓰는 이유: 경로가 깨지면 빌드가 실패한다. 런타임에 파일을 찾는
//! 방식이면 파일이 사라져도 테스트가 조용히 통과할 여지가 생긴다.

use mes_contracts::{
    MutationOp, PullResponse, PushRequest, PushResponse, RejectReason, SyncEntity, SyncOpStatus,
    MAX_OPERATIONS_PER_BATCH,
};

const PUSH_REQUEST: &str =
    include_str!("../../../../../../../packages/mes-contracts/fixtures/push-request.json");
const PUSH_RESPONSE: &str =
    include_str!("../../../../../../../packages/mes-contracts/fixtures/push-response.json");
const PULL_RESPONSE: &str =
    include_str!("../../../../../../../packages/mes-contracts/fixtures/pull-response.json");

#[test]
fn push_request_deserializes() {
    let request: PushRequest = serde_json::from_str(PUSH_REQUEST).expect("push 요청 파싱 실패");

    assert_eq!(request.operations.len(), 2);
    assert!(request.operations.len() <= MAX_OPERATIONS_PER_BATCH);

    let intent = &request.operations[0];
    assert_eq!(intent.op, MutationOp::Intent);
    assert_eq!(intent.entity, SyncEntity::WorkOrder);
    // INTENT 는 절대값이 아니라 의도를 보낸다. baseVersion 낙관적 잠금이 함께 실린다.
    assert_eq!(intent.intent.as_deref(), Some("START"));
    assert_eq!(intent.base_version, Some(2));

    let create = &request.operations[1];
    assert_eq!(create.op, MutationOp::Create);
    assert_eq!(create.entity, SyncEntity::ProductionRecord);
    // append-only 라 대상 id 도 baseVersion 도 없다(충돌 개념 자체가 없다).
    assert_eq!(create.target_id, None);
    assert_eq!(create.base_version, None);
}

#[test]
fn push_request_round_trips() {
    // 직렬화한 결과를 서버가 받는다. 왕복에서 필드가 사라지면 그게 곧 조용한 유실이다.
    let request: PushRequest = serde_json::from_str(PUSH_REQUEST).unwrap();
    let encoded = serde_json::to_string(&request).unwrap();
    let decoded: PushRequest = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded.operations.len(), request.operations.len());
    assert_eq!(
        decoded.operations[0].client_op_id,
        request.operations[0].client_op_id
    );
    assert_eq!(decoded.device_id, request.device_id);
}

#[test]
fn push_request_uses_camel_case_wire_format() {
    // Rust 는 snake_case 필드이지만 전송은 camelCase 다. rename_all 이 빠지면 서버가
    // 전 필드를 못 읽는다.
    let request: PushRequest = serde_json::from_str(PUSH_REQUEST).unwrap();
    let value = serde_json::to_value(&request).unwrap();
    let first = &value["operations"][0];
    assert!(first.get("clientOpId").is_some());
    assert!(first.get("baseVersion").is_some());
    assert!(first.get("client_op_id").is_none());
}

#[test]
fn push_response_deserializes() {
    let response: PushResponse = serde_json::from_str(PUSH_RESPONSE).expect("push 응답 파싱 실패");
    assert_eq!(response.results[0].status, SyncOpStatus::Applied);
    assert_eq!(response.results[1].status, SyncOpStatus::Rejected);
    assert_eq!(
        response.results[1].reason,
        Some(RejectReason::QtyExceedsPlan)
    );
}

#[test]
fn push_response_retryable_matches_default_table() {
    let response: PushResponse = serde_json::from_str(PUSH_RESPONSE).unwrap();
    for result in &response.results {
        if let Some(reason) = result.reason {
            // 서버 값이 진실원이지만 기본 표와 어긋나면 둘 중 하나가 틀린 것이다.
            assert_eq!(result.retryable, reason.default_retryable());
        }
    }
}

#[test]
fn pull_response_is_seq_ordered() {
    let response: PullResponse = serde_json::from_str(PULL_RESPONSE).expect("pull 응답 파싱 실패");
    let seqs: Vec<i64> = response.changes.iter().map(|c| c.seq).collect();
    let mut sorted = seqs.clone();
    sorted.sort_unstable();
    // 엔티티가 섞여도 전역 seq 순서를 지킨다. 작업지시 생성이 그 실적보다 먼저 도착하는
    // 인과 순서가 이 정렬로 보장된다.
    assert_eq!(seqs, sorted);
}

#[test]
fn pull_response_propagates_tombstones() {
    let response: PullResponse = serde_json::from_str(PULL_RESPONSE).unwrap();
    let deletion = response
        .changes
        .iter()
        .find(|c| c.op == "DELETE")
        .expect("tombstone 이 없다");
    // 하드 삭제면 오프라인 클라이언트가 "없어진 행"을 스스로 알 방법이 없다.
    assert!(deletion.deleted_at.is_some());
}
