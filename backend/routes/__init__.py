# Package "routes" — routeurs FastAPI extraits de server.py.
# Chaque module expose soit un `router: APIRouter` déjà configuré, soit une
# fabrique `build_router(**deps)` quand des dépendances runtime (db, helpers)
# doivent être injectées.
