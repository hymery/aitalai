import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


DEFAULT_POSTGRES_URL = (
    "postgresql+psycopg2://bashkir:bashkir@localhost:5432/bashkir_school"
)
SQLITE_URL = "sqlite:///./bashkir.db"


def select_database_url() -> str:
    configured_url = os.getenv("DATABASE_URL")
    if configured_url:
        return configured_url

    probe_engine = create_engine(
        DEFAULT_POSTGRES_URL,
        connect_args={"connect_timeout": 2},
    )
    try:
        with probe_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return DEFAULT_POSTGRES_URL
    except SQLAlchemyError:
        return SQLITE_URL
    finally:
        probe_engine.dispose()


DATABASE_URL = select_database_url()
engine_options = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_options)
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
