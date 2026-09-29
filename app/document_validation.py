"""Validation rules shared by authenticated document upload flows."""

import io
import zipfile


ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_DOCUMENT_BYTES = 15 * 1024 * 1024


def document_content_matches_type(content_type: str, content: bytes) -> bool:
    if content_type == "application/pdf":
        return content.startswith(b"%PDF-")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                files = set(archive.namelist())
            return "[Content_Types].xml" in files and "word/document.xml" in files
        except zipfile.BadZipFile:
            return False
    return False