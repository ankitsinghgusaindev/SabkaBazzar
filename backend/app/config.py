import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_env: str
    database_url: str
    jwt_secret: str
    cors_origins: list[str]

    @property
    def is_production_like(self) -> bool:
        return self.app_env in ("uat", "production")


def load_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "development")
    secret = os.getenv("JWT_SECRET", "")
    if app_env != "development" and (len(secret) < 32 or secret.startswith("replace-with")):
        raise RuntimeError("JWT_SECRET must be set to a strong random value outside development")
    return Settings(
        app_env=app_env,
        database_url=os.getenv(
            "DATABASE_URL", "postgresql+psycopg://localshop:localshop@localhost:5432/localshop"
        ),
        jwt_secret=secret or "dev-only-change-me",
        cors_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    )


settings = load_settings()
