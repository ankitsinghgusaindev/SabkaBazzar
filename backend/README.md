# LocalShop backend

    cd backend
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    export DATABASE_URL=postgresql+psycopg://localshop:localshop@localhost:5432/localshop
    export JWT_SECRET=$(openssl rand -hex 32)
    uvicorn app.main:app --reload --app-dir . --port 8000

Create an admin account directly in the database (admins cannot self-register):

    UPDATE users SET role='admin' WHERE phone='+911234567890';

Interactive API docs: http://localhost:8000/docs
