import enum
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, ForeignKey, Enum
)
from sqlalchemy.orm import relationship

from database import Base


class Entidade(str, enum.Enum):
    exu = "exu"
    preto_velho = "preto_velho"


class StatusAgendamento(str, enum.Enum):
    confirmado = "confirmado"   # agendado, aguardando o dia da gira
    checkin = "checkin"         # chegou e foi confirmado presencialmente
    atendido = "atendido"       # consulta realizada
    cancelado = "cancelado"     # nao compareceu / vaga liberada


class Sessao(Base):
    """Uma gira: data, horario e qual entidade atende."""
    __tablename__ = "sessoes"

    id = Column(Integer, primary_key=True, index=True)
    data = Column(Date, nullable=False)
    horario = Column(String, nullable=False)  # ex: "19:30"
    entidade = Column(Enum(Entidade), nullable=False)

    mediuns = relationship("Medium", back_populates="sessao", cascade="all, delete-orphan")
    agendamentos = relationship("Agendamento", back_populates="sessao", cascade="all, delete-orphan")


class Medium(Base):
    """Um medium escalado para atender numa sessao especifica, com sua capacidade de atendimentos."""
    __tablename__ = "mediuns"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    entidade_nome = Column(String, nullable=True)  # ex: "Tranca-Ruas", "Pai Joaquim" — a variação/nome da entidade nesse médium
    capacidade = Column(Integer, nullable=False)
    sessao_id = Column(Integer, ForeignKey("sessoes.id"), nullable=False)

    sessao = relationship("Sessao", back_populates="mediuns")
    agendamentos = relationship("Agendamento", back_populates="medium", cascade="all, delete-orphan")

    @property
    def ocupadas(self) -> int:
        return len([a for a in self.agendamentos if a.status != StatusAgendamento.cancelado])

    @property
    def vagas_restantes(self) -> int:
        return self.capacidade - self.ocupadas


class Agendamento(Base):
    """Um agendamento feito por um consulente para um medium, numa sessao."""
    __tablename__ = "agendamentos"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    telefone = Column(String, nullable=False)
    prioridade = Column(Boolean, default=False, nullable=False)
    status = Column(Enum(StatusAgendamento), default=StatusAgendamento.confirmado, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False)

    sessao_id = Column(Integer, ForeignKey("sessoes.id"), nullable=False)
    medium_id = Column(Integer, ForeignKey("mediuns.id"), nullable=False)

    sessao = relationship("Sessao", back_populates="agendamentos")
    medium = relationship("Medium", back_populates="agendamentos")