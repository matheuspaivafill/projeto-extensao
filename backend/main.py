from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import sessoes, agendamentos, admin

# Cria as tabelas no banco caso ainda nao existam (suficiente para este projeto;
# para evoluções de schema mais adiante, considere usar Alembic).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Encontro Marcado", version="1.0.0")

# Libera o frontend (Netlify, ou localhost em dev) a chamar a API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # em produção, troque "*" pelo domínio real do frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessoes.router)
app.include_router(agendamentos.router)
app.include_router(admin.router)


@app.get("/")
def raiz():
    return {"status": "ok", "servico": "Agenda do Terreiro"}