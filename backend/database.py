import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Em produção (Render), defina a variável de ambiente DATABASE_URL com a URL do Postgres.
# Localmente, sem essa variável, usamos SQLite num arquivo (facil de rodar/testar).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./terreiro.db")

# O Render entrega URLs do Postgres começando com "postgres://", mas o SQLAlchemy
# moderno espera "postgresql://" — corrigimos isso automaticamente.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()