# HospitalGuard: React + FastAPI

## Backend (port 8000)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Tables and demo data are created on first start. API docs at http://localhost:8000/docs

## Frontend (port 5173)
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. Vite proxies `/api` to the backend.

## Demo logins (password `ChangeMe123!`)
| Role | Email |
|---|---|
| Admin | itskarisa@outlook.com |
| Doctor | daniel.taylor@hospitalguard.com |
| Nurse | nurse@hospitalguard.com |
| Receptionist | reception@hospitalguard.com |
| Pharmacist | pharmacist@hospitalguard.com |
| Billing | billing@hospitalguard.com |
| Lab tech | lab@hospitalguard.com |
| Radiologist | radiology@hospitalguard.com |
| Patient | itskarisa@gmail.com |

**Upgrading from the earlier version?** Delete `backend/hospitalguard.db` once so the new tables and columns get created.

## What's inside
Patient registration and journey stages, appointments, medical records, lab and radiology orders with results,
digital prescriptions with QR codes, pharmacy inventory and QR dispensing, billing and payments (KES),
telemedicine video visits (Jitsi) with aftercare plans, user/role management, and an audit log of every change.

Env vars: `SECRET_KEY`, `DATABASE_URL` (Postgres), `CORS_ORIGINS`, and `VITE_API_URL` on the frontend if the API is on another origin.
