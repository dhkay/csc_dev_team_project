"""Inbound Adapter: RAG (retrieval 도메인, Phase 1).

문서 목록 + 검색 프리뷰(현재 빈 결과 스텁). 인제스트는 Phase 2(워커) 에서 추가.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.deps import get_identity
from csc_net_utils import require_services

from ....core.application.ports.inbound import RetrievalInboundPort
from ....core.domain.types import RetrievedChunkRecord
from .schemas import DocumentResponse, RetrievedChunkResponse, RetrieveRequest

_CALLERS = require_services("web-groupware", "web-control-tower")


def get_retrieval_service() -> RetrievalInboundPort:
    raise NotImplementedError


router = APIRouter(prefix="/rag", tags=["retrieval"])


@router.get(
    "/documents", response_model=list[DocumentResponse], dependencies=[Depends(_CALLERS)]
)
async def list_documents(
    identity=Depends(get_identity),
    service: RetrievalInboundPort = Depends(get_retrieval_service),
) -> list[DocumentResponse]:
    docs = await service.list_documents(identity)
    return [
        DocumentResponse(
            id=d.id,
            title=d.title,
            status=d.status,
            file_id=d.file_id,
            created_at=d.created_at,
        )
        for d in docs
    ]


@router.post(
    "/retrieve",
    response_model=list[RetrievedChunkResponse],
    dependencies=[Depends(_CALLERS)],
)
async def retrieve(
    body: RetrieveRequest,
    identity=Depends(get_identity),
    service: RetrievalInboundPort = Depends(get_retrieval_service),
) -> list[RetrievedChunkResponse]:
    chunks: list[RetrievedChunkRecord] = await service.retrieve(
        identity, body.query, body.top_k
    )
    return [
        RetrievedChunkResponse(text=c.text, score=c.score, document_id=c.document_id)
        for c in chunks
    ]
