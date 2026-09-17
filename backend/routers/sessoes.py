from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
from auth import exigir_admin

router = APIRouter(prefix="/sessoes", tags=["sessoes"])


@router.get("/", response_model=List[schemas.SessaoOut])
def listar_sessoes(db: Session = Depends(get_db)):
    """Lista todas as sessoes, ordenadas por data. Uso público (tela de agendamento)."""
    return db.query(models.Sessao).order_by(models.Sessao.data).all()


@router.get("/{sessao_id}", response_model=schemas.SessaoOut)
def obter_sessao(sessao_id: int, db: Session = Depends(get_db)):
    sessao = db.query(models.Sessao).get(sessao_id)
    if not sessao:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    return sessao


@router.post("/", response_model=schemas.SessaoOut, dependencies=[Depends(exigir_admin)])
def criar_sessao(dados: schemas.SessaoCreate, db: Session = Depends(get_db)):
    """Cria uma nova gira no calendário. Rota do responsável."""
    sessao = models.Sessao(**dados.dict())
    db.add(sessao)
    db.commit()
    db.refresh(sessao)
    return sessao


@router.put("/{sessao_id}", response_model=schemas.SessaoOut, dependencies=[Depends(exigir_admin)])
def editar_sessao(sessao_id: int, dados: schemas.SessaoUpdate, db: Session = Depends(get_db)):
    """Edita data/horário/entidade de uma gira já cadastrada — útil em caso de remarcação."""
    sessao = db.query(models.Sessao).get(sessao_id)
    if not sessao:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    sessao.data = dados.data
    sessao.horario = dados.horario
    sessao.entidade = dados.entidade
    db.commit()
    db.refresh(sessao)
    return sessao


@router.delete("/{sessao_id}", dependencies=[Depends(exigir_admin)])
def excluir_sessao(sessao_id: int, db: Session = Depends(get_db)):
    """Exclui uma gira e, em cascata, seus médiuns e agendamentos."""
    sessao = db.query(models.Sessao).get(sessao_id)
    if not sessao:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    db.delete(sessao)
    db.commit()
    return {"ok": True}


@router.post("/{sessao_id}/mediuns", response_model=schemas.MediumOut, dependencies=[Depends(exigir_admin)])
def adicionar_medium(sessao_id: int, dados: schemas.MediumCreate, db: Session = Depends(get_db)):
    """Adiciona um médium à escala de uma gira — é isso que 'abre' a gira para agendamento público."""
    sessao = db.query(models.Sessao).get(sessao_id)
    if not sessao:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    medium = models.Medium(
        nome=dados.nome,
        entidade_nome=dados.entidade_nome,
        capacidade=dados.capacidade,
        sessao_id=sessao_id,
    )
    db.add(medium)
    db.commit()
    db.refresh(medium)
    return medium


@router.delete("/{sessao_id}/mediuns/{medium_id}", dependencies=[Depends(exigir_admin)])
def remover_medium(sessao_id: int, medium_id: int, db: Session = Depends(get_db)):
    medium = db.query(models.Medium).filter_by(id=medium_id, sessao_id=sessao_id).first()
    if not medium:
        raise HTTPException(status_code=404, detail="Médium não encontrado")
    db.delete(medium)
    db.commit()
    return {"ok": True}