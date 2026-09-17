from fastapi import APIRouter

import schemas
from auth import checar_senha

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login")
def login(dados: schemas.AdminLogin):
    """Confere a senha do responsável e devolve um token para usar nas rotas administrativas."""
    token = checar_senha(dados.senha)
    return {"token": token}