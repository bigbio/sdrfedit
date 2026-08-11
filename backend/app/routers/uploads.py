"""Document intake: user-supplied PDFs (paywalled papers) and pasted text."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..config import get_settings
from ..parsing.base import ParsedDocument, PdfParseError, split_markdown_sections
from ..parsing.factory import get_pdf_parser
from ..schemas import UploadResult
from ..session import get_session_store

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("/pdf", response_model=UploadResult)
async def upload_pdf(
    sessionId: str = Form(...),
    file: UploadFile = File(...),
) -> UploadResult:
    """Parse an uploaded paper so the assistant can read its methods section."""
    settings = get_settings()
    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file was empty.")
    limit = settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"File exceeds the {settings.max_upload_mb} MB limit.")
    if data[:5] != b"%PDF-":
        raise HTTPException(status_code=415, detail="Only PDF files are accepted here; paste plain text instead.")

    try:
        document = await get_pdf_parser().parse_bytes(data, file.filename or "paper.pdf")
    except PdfParseError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    stored = get_session_store().add_document(sessionId, file.filename or "paper.pdf", document, origin="upload")
    return UploadResult(
        documentId=stored.document_id,
        fileName=stored.file_name,
        charCount=document.char_count,
        sections=list(document.sections.keys()),
        preview=document.preview(),
        parser=document.parser,
    )


@router.post("/text", response_model=UploadResult)
async def upload_text(
    sessionId: str = Form(...),
    text: str = Form(...),
    fileName: str = Form("pasted-text.md"),
) -> UploadResult:
    """Register pasted manuscript text without going through MinerU."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="No text was provided.")

    document = ParsedDocument(
        markdown=text,
        sections=split_markdown_sections(text),
        parser="pasted-text",
    )
    stored = get_session_store().add_document(sessionId, fileName, document, origin="paste")
    return UploadResult(
        documentId=stored.document_id,
        fileName=stored.file_name,
        charCount=document.char_count,
        sections=list(document.sections.keys()),
        preview=document.preview(),
        parser=document.parser,
    )
