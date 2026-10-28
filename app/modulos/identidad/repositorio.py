from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modulos.identidad.modelos import Usuario


class RepositorioUsuarios:
    def __init__(self, db: Session):
        self._db = db

    def por_email(self, email: str) -> Usuario | None:
        return self._db.scalar(select(Usuario).where(func.lower(Usuario.email) == email.strip().lower()))

    def por_id(self, usuario_id: int) -> Usuario | None:
        return self._db.get(Usuario, usuario_id)
