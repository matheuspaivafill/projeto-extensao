from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from models import Entidade, StatusAgendamento


# ---------- Medium ----------
class MediumCreate(BaseModel):
    nome: str
    entidade_nome: Optional[str] = None
    capacidade: int = Field(gt=0)


class MediumOut(BaseModel):
    id: int
    nome: str
    entidade_nome: Optional[str] = None
    capacidade: int
    ocupadas: int
    vagas_restantes: int

    class Config:
        from_attributes = True


# ---------- Sessao ----------
class SessaoCreate(BaseModel):
    data: date
    horario: str
    entidade: Entidade


class SessaoUpdate(BaseModel):
    data: date
    horario: str
    entidade: Entidade


class SessaoOut(BaseModel):
    id: int
    data: date
    horario: str
    entidade: Entidade
    mediuns: List[MediumOut] = []

    class Config:
        from_attributes = True


# ---------- Agendamento ----------
class AgendamentoCreate(BaseModel):
    nome: str
    telefone: str
    prioridade: bool = False
    sessao_id: int
    medium_id: int


class AgendamentoOut(BaseModel):
    id: int
    nome: str
    telefone: str
    prioridade: bool
    status: StatusAgendamento
    criado_em: datetime
    sessao_id: int
    medium_id: int
    posicao_fila: Optional[int] = None

    class Config:
        from_attributes = True


class AgendamentoStatusUpdate(BaseModel):
    status: StatusAgendamento


class AdminLogin(BaseModel):
    senha: str