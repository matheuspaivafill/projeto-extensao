import os
import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Defina ADMIN_SENHA e ADMIN_TOKEN como variaveis de ambiente em produção.
# Valores abaixo sao apenas fallback para rodar localmente em desenvolvimento.
ADMIN_SENHA = os.getenv("ADMIN_SENHA", "1234")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", secrets.token_hex(16))

# Usar HTTPBearer (em vez de checar o header manualmente) faz o Swagger (/docs)
# mostrar um botão "Authorize" com cadeado, onde basta colar o token puro.
security_scheme = HTTPBearer()


def checar_senha(senha: str) -> str:
    """Confere a senha do responsavel e devolve o token a ser usado nas próximas chamadas."""
    if senha != ADMIN_SENHA:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha incorreta")
    return ADMIN_TOKEN


def exigir_admin(credenciais: HTTPAuthorizationCredentials = Depends(security_scheme)) -> None:
    """Dependency usada nas rotas administrativas: espera o token do /admin/login."""
    if credenciais.credentials != ADMIN_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autorizado")