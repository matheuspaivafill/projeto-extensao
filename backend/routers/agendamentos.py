from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import exigir_admin

router = APIRouter(prefix="/agendamentos", tags=["agendamentos"])


def ordenar_fila(agendamentos: list) -> list:
    """Preferenciais primeiro, depois por ordem de criação (quem agendou antes)."""
    ativos = [a for a in agendamentos if a.status != models.StatusAgendamento.cancelado]
    return sorted(ativos, key=lambda a: (not a.prioridade, a.criado_em))


def montar_saida(agendamento: models.Agendamento, db: Session) -> schemas.AgendamentoOut:
    fila_do_medium = db.query(models.Agendamento).filter_by(medium_id=agendamento.medium_id).all()
    fila_ordenada = ordenar_fila(fila_do_medium)
    posicao = next((i + 1 for i, a in enumerate(fila_ordenada) if a.id == agendamento.id), None)
    saida = schemas.AgendamentoOut.from_orm(agendamento)
    saida.posicao_fila = posicao
    return saida


@router.post("/", response_model=schemas.AgendamentoOut)
def criar_agendamento(dados: schemas.AgendamentoCreate, db: Session = Depends(get_db)):
    """Consulente cria seu próprio agendamento. Confirmação é automática, mas
    a vaga só é garantida com o check-in presencial no dia da gira."""
    medium = db.query(models.Medium).get(dados.medium_id)
    if not medium or medium.sessao_id != dados.sessao_id:
        raise HTTPException(status_code=404, detail="Médium/sessão não encontrados")
    if medium.vagas_restantes <= 0:
        raise HTTPException(status_code=409, detail="Não há mais vagas com esse médium nesta gira")

    agendamento = models.Agendamento(
        nome=dados.nome,
        telefone=dados.telefone,
        prioridade=dados.prioridade,
        sessao_id=dados.sessao_id,
        medium_id=dados.medium_id,
    )
    db.add(agendamento)
    db.commit()
    db.refresh(agendamento)
    return montar_saida(agendamento, db)


@router.get("/meus", response_model=List[schemas.AgendamentoOut])
def meus_agendamentos(ids: str, db: Session = Depends(get_db)):
    """Busca agendamentos por lista de ids separados por vírgula (o app guarda os ids no dispositivo)."""
    lista_ids = [int(i) for i in ids.split(",") if i.strip().isdigit()]
    agendamentos = db.query(models.Agendamento).filter(models.Agendamento.id.in_(lista_ids)).all()
    return [montar_saida(a, db) for a in agendamentos]


@router.post("/{agendamento_id}/cancelar", response_model=schemas.AgendamentoOut)
def cancelar_pelo_consulente(agendamento_id: int, db: Session = Depends(get_db)):
    """Permite que o próprio consulente cancele seu agendamento, desde que ainda
    não tenha feito check-in (depois disso, o cancelamento é tratado pelo responsável no local)."""
    agendamento = db.query(models.Agendamento).get(agendamento_id)
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    if agendamento.status != models.StatusAgendamento.confirmado:
        raise HTTPException(status_code=400, detail="Esse agendamento não pode mais ser cancelado por aqui")
    agendamento.status = models.StatusAgendamento.cancelado
    db.commit()
    db.refresh(agendamento)
    return montar_saida(agendamento, db)


@router.get("/sessao/{sessao_id}", response_model=List[schemas.AgendamentoOut], dependencies=[Depends(exigir_admin)])
def listar_por_sessao(sessao_id: int, db: Session = Depends(get_db)):
    """Lista todos os agendamentos de uma gira, para o painel de check-in do responsável."""
    agendamentos = db.query(models.Agendamento).filter_by(sessao_id=sessao_id).all()
    return [montar_saida(a, db) for a in agendamentos]


@router.patch("/{agendamento_id}", response_model=schemas.AgendamentoOut, dependencies=[Depends(exigir_admin)])
def atualizar_status(agendamento_id: int, dados: schemas.AgendamentoStatusUpdate, db: Session = Depends(get_db)):
    """Usado pelo responsável no dia da gira: confirmar chegada (checkin),
    marcar como atendido, ou cancelado (não compareceu -> libera a vaga)."""
    agendamento = db.query(models.Agendamento).get(agendamento_id)
    if not agendamento:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    agendamento.status = dados.status
    db.commit()
    db.refresh(agendamento)
    return montar_saida(agendamento, db)