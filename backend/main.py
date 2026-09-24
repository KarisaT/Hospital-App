import os, random, hmac, hashlib, secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional
import bcrypt, jwt
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, or_
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

SECRET = os.environ.get("SECRET_KEY", "dev-change-me")
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./hospitalguard.db").replace("postgres://", "postgresql://", 1)
engine = create_engine(DB_URL, connect_args={"check_same_thread": False} if DB_URL.startswith("sqlite") else {})
Session = sessionmaker(engine, autoflush=False)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String(120), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    password_hash = Column(String(120), nullable=False)
    role = Column(String(20), nullable=False)  # admin | doctor | patient
    department = Column(String(50))
    patient = relationship("Patient", back_populates="user", uselist=False)

class Patient(Base):
    __tablename__ = "patients"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    user = relationship("User", back_populates="patient")
    name = Column(String(120), nullable=False)
    email = Column(String(120))
    phone = Column(String(40))
    gender = Column(String(10))
    blood_type = Column(String(4))
    status = Column(String(30), default="outpatient")

class Appointment(Base):
    __tablename__ = "appointments"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient = relationship("Patient")
    doctor = relationship("User")
    scheduled_time = Column(DateTime, nullable=False)
    department = Column(String(50))
    reason = Column(String(200))
    status = Column(String(20), default="scheduled")

class Prescription(Base):
    __tablename__ = "prescriptions"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient = relationship("Patient")
    doctor = relationship("User")
    medication = Column(String(120), nullable=False)
    dosage = Column(String(120))
    refills = Column(Integer, default=0)
    status = Column(String(20), default="active")
    created = Column(DateTime, default=datetime.utcnow)
    dispensed_at = Column(DateTime)
    dispensed_by = Column(String(120))

# ---------- seed ----------
def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def seed(db):
    pw = hash_pw("ChangeMe123!")
    db.add(User(email="itskarisa@outlook.com", name="System Administrator", password_hash=pw, role="admin"))
    docs = []
    for n, d in [("Daniel Taylor", "Outpatient"), ("Helen Phillips", "Cardiology"),
                 ("Peter Otieno", "Neurology"), ("Amina Hassan", "Pediatrics")]:
        f, l = n.lower().split()
        u = User(email=f"{f}.{l}@hospitalguard.com", name="Dr. " + n, password_hash=pw, role="doctor", department=d)
        db.add(u); docs.append(u)
    names = ["Groot Karisa", "Sarah Wanjiku", "Grace Njeri", "Michael Kimani", "Faith Achieng", "Brian Mutua",
             "Lucy Wambui", "Kevin Omondi", "Esther Chebet", "Joseph Mwangi", "Mercy Atieno", "David Kariuki",
             "Rose Nyambura", "Samuel Kipchoge", "Zawadi Karisa", "Hassan Juma"]
    pats = []
    for i, n in enumerate(names):
        f, l = n.lower().split()
        email = "itskarisa@gmail.com" if i == 0 else f"{f}.{l}@email.com"
        u = User(email=email, name=n, password_hash=pw, role="patient")
        p = Patient(user=u, name=n, email=email, phone=f"+254-712-111-{100 + i}",
                    gender="male" if i % 2 == 0 else "female",
                    blood_type=random.choice(["A+", "O+", "B+", "AB+", "O-"]),
                    status="in_consultation" if i == 0 else "outpatient")
        db.add_all([u, p]); pats.append(p)
    db.flush()
    day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    reasons = ["Follow-up", "General consultation", "Lab review", "Blood pressure check", "New symptoms"]
    def add(p, d, when, reason=None, status="scheduled"):
        db.add(Appointment(patient=p, doctor=d, scheduled_time=when, department=d.department,
                           reason=reason or random.choice(reasons), status=status))
    for k in range(12):
        add(random.choice(pats[1:]), random.choice(docs), day + timedelta(hours=8 + k % 9), status="confirmed")
    for _ in range(52):
        add(random.choice(pats), random.choice(docs), day + timedelta(days=random.randint(1, 30), hours=random.randint(8, 16)))
    for _ in range(78):
        add(random.choice(pats), random.choice(docs), day - timedelta(days=random.randint(1, 90)) + timedelta(hours=random.randint(8, 16)),
            status=random.choice(["completed", "completed", "completed", "cancelled"]))
    g = pats[0]
    add(g, docs[0], day + timedelta(hours=10), "Follow-up for eye strain", "confirmed")
    add(g, docs[1], day + timedelta(days=7, hours=14), "Cardiovascular assessment")
    add(g, docs[0], day + timedelta(days=30, hours=8), "Vitamin D level recheck")
    for m in ["Ibuprofen 400mg", "Vitamin D3 2000IU", "Amoxicillin 500mg", "Metformin 500mg", "Amlodipine 5mg"]:
        db.add(Prescription(patient=random.choice(pats), doctor=random.choice(docs), medication=m,
                            dosage="Twice daily", refills=random.randint(0, 3)))
    db.commit()

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    with Session() as db:
        if not db.query(User).first():
            seed(db); seed_extra(db); print("Seeded demo data. Password: ChangeMe123!")
    yield

app = FastAPI(title="HospitalGuard API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(","),
                   allow_methods=["*"], allow_headers=["*"])

# ---------- auth ----------
bearer = HTTPBearer(auto_error=False)
CLINICAL = ("admin", "doctor", "nurse", "receptionist")
ROLES = ["admin", "doctor", "nurse", "receptionist", "pharmacist", "billing", "lab_tech", "radiologist", "patient"]

def get_db():
    with Session() as db:
        yield db

def auth(cred=Depends(bearer), db=Depends(get_db)):
    try:
        uid = int(jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])["sub"])
    except Exception:
        raise HTTPException(401, "Not signed in")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(401, "Not signed in")
    return u

def roles(*allowed):
    def dep(u=Depends(auth)):
        if u.role not in allowed:
            raise HTTPException(403, "Not allowed")
        return u
    return dep

class LoginIn(BaseModel):
    email: str
    password: str

class ApptIn(BaseModel):
    patient_id: Optional[int] = None
    doctor_id: int
    when: datetime
    reason: str = ""

class StatusIn(BaseModel):
    status: str

class RxIn(BaseModel):
    patient_id: int
    medication: str
    dosage: str = ""
    refills: int = 0

def user_out(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "department": u.department,
            "patient_id": u.patient.id if u.patient else None}

def patient_out(p):
    return {"id": p.id, "name": p.name, "email": p.email, "phone": p.phone, "gender": p.gender,
            "blood_type": p.blood_type, "status": p.status}

def appt_out(a):
    return {"id": a.id, "when": a.scheduled_time.isoformat(), "patient": a.patient.name, "patient_id": a.patient_id,
            "doctor": a.doctor.name, "department": a.department, "reason": a.reason, "status": a.status}

def rx_out(r):
    return {"id": r.id, "medication": r.medication, "dosage": r.dosage, "refills": r.refills,
            "status": r.status, "patient": r.patient.name, "patient_id": r.patient_id, "doctor": r.doctor.name,
            "token": rx_token(r), "dispensed_at": r.dispensed_at.isoformat() if r.dispensed_at else None}

def scoped(q, model, u):
    if u.role == "doctor" and model is Appointment:
        return q.filter(model.doctor_id == u.id)
    if u.role == "patient":
        return q.filter(model.patient_id == u.patient.id)
    return q

def day_bounds():
    s = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return s, s + timedelta(days=1)

@app.post("/api/login")
def login(body: LoginIn, request: Request, db=Depends(get_db)):
    u = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not u or not bcrypt.checkpw(body.password.encode(), u.password_hash.encode()):
        raise HTTPException(401, "Wrong email or password.")
    request.state.uid = u.id
    token = jwt.encode({"sub": str(u.id), "exp": datetime.utcnow() + timedelta(hours=12)}, SECRET, algorithm="HS256")
    return {"token": token, "user": user_out(u)}

@app.get("/api/me")
def me(u=Depends(auth)):
    return user_out(u)

# ---------- data ----------
@app.get("/api/dashboard")
def dashboard(u=Depends(auth), db=Depends(get_db)):
    s, e = day_bounds()
    q = scoped(db.query(Appointment), Appointment, u)
    today = q.filter(Appointment.scheduled_time >= s, Appointment.scheduled_time < e).order_by(Appointment.scheduled_time).all()
    upcoming = q.filter(Appointment.scheduled_time >= e, Appointment.status != "cancelled").order_by(Appointment.scheduled_time).limit(5).all()
    rx = scoped(db.query(Prescription), Prescription, u).order_by(Prescription.created.desc()).limit(5).all()
    stats = None
    if u.role in CLINICAL:
        stats = {"Patients": db.query(Patient).count(), "Appointments today": len(today),
                 "Active prescriptions": db.query(Prescription).filter_by(status="active").count(),
                 "Total appointments": q.count()}
    return {"stats": stats, "today": [appt_out(a) for a in today], "upcoming": [appt_out(a) for a in upcoming],
            "prescriptions": [rx_out(r) for r in rx]}

@app.get("/api/doctors")
def doctors(u=Depends(auth), db=Depends(get_db)):
    return [{"id": d.id, "name": d.name, "department": d.department} for d in db.query(User).filter_by(role="doctor")]

@app.get("/api/patients")
def patients(q: str = "", u=Depends(roles(*CLINICAL)), db=Depends(get_db)):
    query = db.query(Patient)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(Patient.name.ilike(like), Patient.email.ilike(like)))
    return [patient_out(p) for p in query.order_by(Patient.name)]

@app.get("/api/patients/{pid}")
def patient_detail(pid: int, u=Depends(roles(*CLINICAL)), db=Depends(get_db)):
    p = db.get(Patient, pid)
    if not p:
        raise HTTPException(404, "Patient not found")
    appts = db.query(Appointment).filter_by(patient_id=pid).order_by(Appointment.scheduled_time.desc()).all()
    rx = db.query(Prescription).filter_by(patient_id=pid).order_by(Prescription.created.desc()).all()
    return {**patient_out(p), "appointments": [appt_out(a) for a in appts], "prescriptions": [rx_out(r) for r in rx]}

@app.get("/api/appointments")
def list_appointments(scope: str = "upcoming", u=Depends(auth), db=Depends(get_db)):
    s, e = day_bounds()
    q = scoped(db.query(Appointment), Appointment, u)
    if scope == "today":
        q = q.filter(Appointment.scheduled_time >= s, Appointment.scheduled_time < e)
    elif scope == "past":
        q = q.filter(Appointment.scheduled_time < s)
    else:
        q = q.filter(Appointment.scheduled_time >= e)
    order = Appointment.scheduled_time.desc() if scope == "past" else Appointment.scheduled_time
    return [appt_out(a) for a in q.order_by(order).limit(200)]

@app.post("/api/appointments", status_code=201)
def book(body: ApptIn, u=Depends(auth), db=Depends(get_db)):
    pid = u.patient.id if u.role == "patient" else body.patient_id
    doc = db.get(User, body.doctor_id)
    if not pid or not doc or doc.role != "doctor":
        raise HTTPException(400, "Choose a patient and a doctor.")
    a = Appointment(patient_id=pid, doctor_id=doc.id, scheduled_time=body.when.replace(tzinfo=None),
                    department=doc.department, reason=body.reason[:200])
    db.add(a); db.commit()
    return appt_out(a)

@app.patch("/api/appointments/{aid}")
def set_status(aid: int, body: StatusIn, u=Depends(auth), db=Depends(get_db)):
    a = db.get(Appointment, aid)
    if not a:
        raise HTTPException(404, "Appointment not found")
    own = (u.role == "doctor" and a.doctor_id == u.id) or (u.role == "patient" and a.patient_id == u.patient.id)
    if not (u.role in ("admin", "receptionist") or own) or (u.role == "patient" and body.status != "cancelled"):
        raise HTTPException(403, "Not allowed")
    if body.status not in ("scheduled", "confirmed", "completed", "cancelled"):
        raise HTTPException(400, "Unknown status")
    a.status = body.status
    db.commit()
    return appt_out(a)

@app.get("/api/prescriptions")
def list_rx(u=Depends(auth), db=Depends(get_db)):
    q = scoped(db.query(Prescription), Prescription, u)
    return [rx_out(r) for r in q.order_by(Prescription.created.desc())]

@app.post("/api/prescriptions", status_code=201)
def write_rx(body: RxIn, u=Depends(roles("doctor", "admin")), db=Depends(get_db)):
    r = Prescription(patient_id=body.patient_id, doctor_id=u.id, medication=body.medication,
                     dosage=body.dosage, refills=body.refills)
    db.add(r); db.commit()
    return rx_out(r)

# =====================================================================
# Extended modules: records, lab/radiology, pharmacy + QR, billing,
# telemedicine, user management, audit log
# =====================================================================
class MedicalRecord(Base):
    __tablename__ = "records"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient = relationship("Patient")
    author = relationship("User")
    kind = Column(String(20))  # consultation | diagnosis | procedure | vitals | note
    summary = Column(String(500))
    created = Column(DateTime, default=datetime.utcnow)

class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient = relationship("Patient")
    doctor = relationship("User")
    kind = Column(String(12))  # lab | radiology
    test = Column(String(120))
    status = Column(String(20), default="ordered")  # ordered | in_progress | completed
    result = Column(String(500))
    created = Column(DateTime, default=datetime.utcnow)

class Medication(Base):
    __tablename__ = "medications"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    stock = Column(Integer, default=0)
    unit_price = Column(Integer, default=0)
    reorder_level = Column(Integer, default=50)

class Bill(Base):
    __tablename__ = "bills"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    patient = relationship("Patient")
    description = Column(String(200))
    amount = Column(Integer, nullable=False)  # KES
    created = Column(DateTime, default=datetime.utcnow)
    payments = relationship("Payment", back_populates="bill")

class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    bill_id = Column(Integer, ForeignKey("bills.id"), nullable=False)
    bill = relationship("Bill", back_populates="payments")
    amount = Column(Integer, nullable=False)
    method = Column(String(20))
    created = Column(DateTime, default=datetime.utcnow)

class TeleSession(Base):
    __tablename__ = "tele"
    id = Column(Integer, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient = relationship("Patient")
    doctor = relationship("User")
    scheduled_time = Column(DateTime, nullable=False)
    status = Column(String(20), default="scheduled")
    meeting_url = Column(String(200))
    notes = Column(String(500))  # aftercare plan

class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    user = relationship("User")
    action = Column(String(10))
    path = Column(String(200))
    status = Column(Integer)
    created = Column(DateTime, default=datetime.utcnow)

def rx_token(r):
    sig = hmac.new(SECRET.encode(), f"{r.id}:{r.patient_id}:{r.doctor_id}:{r.medication}".encode(), hashlib.sha256).hexdigest()[:12]
    return f"HG-{r.id}-{sig}"

def find_rx(db, token):
    token = token.strip()
    try:
        r = db.get(Prescription, int(token.split("-")[1]))
    except Exception:
        r = None
    if not r or not hmac.compare_digest(rx_token(r), token):
        raise HTTPException(404, "Invalid prescription code.")
    return r

def iso(d): return d.isoformat() if d else None

class PatientIn(BaseModel):
    name: str
    email: str = ""
    phone: str = ""
    gender: str = ""
    blood_type: str = ""

class PatientStatusIn(BaseModel):
    status: str

class RecIn(BaseModel):
    patient_id: int
    kind: str
    summary: str

class OrderIn(BaseModel):
    patient_id: int
    kind: str
    test: str

class OrderUpdateIn(BaseModel):
    status: str
    result: Optional[str] = None

class TokenIn(BaseModel):
    token: str

class RestockIn(BaseModel):
    qty: int

class BillIn(BaseModel):
    patient_id: int
    description: str
    amount: int

class PaymentIn(BaseModel):
    amount: int
    method: str = "cash"

class TeleIn(BaseModel):
    patient_id: int
    doctor_id: Optional[int] = None
    when: datetime

class TeleUpdateIn(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class UserIn(BaseModel):
    name: str
    email: str
    password: str
    role: str
    department: str = ""

class RoleIn(BaseModel):
    role: str

# ---------- patients: register + journey status ----------
@app.post("/api/patients", status_code=201)
def register_patient(body: PatientIn, u=Depends(roles(*CLINICAL)), db=Depends(get_db)):
    p = Patient(name=body.name.strip(), email=body.email.strip().lower() or None, phone=body.phone,
                gender=body.gender, blood_type=body.blood_type, status="registered")
    db.add(p); db.commit()
    return patient_out(p)

@app.patch("/api/patients/{pid}/status")
def patient_status(pid: int, body: PatientStatusIn, u=Depends(roles(*CLINICAL)), db=Depends(get_db)):
    if body.status not in ("registered", "triage", "in_consultation", "admitted", "outpatient", "discharged"):
        raise HTTPException(400, "Unknown status")
    p = db.get(Patient, pid)
    if not p:
        raise HTTPException(404, "Patient not found")
    p.status = body.status; db.commit()
    return patient_out(p)

# ---------- medical records ----------
def rec_out(r):
    return {"id": r.id, "patient": r.patient.name, "patient_id": r.patient_id, "author": r.author.name,
            "kind": r.kind, "summary": r.summary, "created": iso(r.created)}

@app.get("/api/records")
def list_records(patient_id: Optional[int] = None, u=Depends(roles("admin", "doctor", "nurse", "patient")), db=Depends(get_db)):
    q = db.query(MedicalRecord)
    if u.role == "patient":
        q = q.filter_by(patient_id=u.patient.id)
    elif patient_id:
        q = q.filter_by(patient_id=patient_id)
    return [rec_out(r) for r in q.order_by(MedicalRecord.created.desc()).limit(200)]

@app.post("/api/records", status_code=201)
def add_record(body: RecIn, u=Depends(roles("admin", "doctor", "nurse")), db=Depends(get_db)):
    if body.kind not in ("consultation", "diagnosis", "procedure", "vitals", "note"):
        raise HTTPException(400, "Unknown record type")
    r = MedicalRecord(patient_id=body.patient_id, author_id=u.id, kind=body.kind, summary=body.summary[:500])
    db.add(r); db.commit()
    return rec_out(r)

# ---------- lab & radiology ----------
def order_out(o):
    return {"id": o.id, "patient": o.patient.name, "patient_id": o.patient_id, "doctor": o.doctor.name, "kind": o.kind,
            "test": o.test, "status": o.status, "result": o.result, "created": iso(o.created)}

@app.get("/api/orders")
def list_orders(patient_id: Optional[int] = None, u=Depends(auth), db=Depends(get_db)):
    q = db.query(Order)
    if u.role == "patient":
        q = q.filter_by(patient_id=u.patient.id)
    elif patient_id:
        q = q.filter_by(patient_id=patient_id)
    if u.role == "lab_tech":
        q = q.filter_by(kind="lab")
    elif u.role == "radiologist":
        q = q.filter_by(kind="radiology")
    return [order_out(o) for o in q.order_by(Order.created.desc()).limit(200)]

@app.post("/api/orders", status_code=201)
def create_order(body: OrderIn, u=Depends(roles("doctor", "admin")), db=Depends(get_db)):
    if body.kind not in ("lab", "radiology"):
        raise HTTPException(400, "Kind must be lab or radiology")
    o = Order(patient_id=body.patient_id, doctor_id=u.id, kind=body.kind, test=body.test)
    db.add(o); db.commit()
    return order_out(o)

@app.patch("/api/orders/{oid}")
def update_order(oid: int, body: OrderUpdateIn, u=Depends(roles("admin", "lab_tech", "radiologist")), db=Depends(get_db)):
    o = db.get(Order, oid)
    if not o:
        raise HTTPException(404, "Order not found")
    if (u.role == "lab_tech" and o.kind != "lab") or (u.role == "radiologist" and o.kind != "radiology"):
        raise HTTPException(403, "Not allowed")
    if body.status not in ("ordered", "in_progress", "completed"):
        raise HTTPException(400, "Unknown status")
    o.status = body.status
    if body.result is not None:
        o.result = body.result[:500]
    db.commit()
    return order_out(o)

# ---------- pharmacy: inventory + QR dispensing ----------
def med_out(m):
    return {"id": m.id, "name": m.name, "stock": m.stock, "unit_price": m.unit_price, "reorder_level": m.reorder_level,
            "low": m.stock <= m.reorder_level}

@app.get("/api/pharmacy/inventory")
def inventory(u=Depends(roles("pharmacist", "admin", "doctor")), db=Depends(get_db)):
    return [med_out(m) for m in db.query(Medication).order_by(Medication.name)]

@app.post("/api/pharmacy/inventory/{mid}/restock")
def restock(mid: int, body: RestockIn, u=Depends(roles("pharmacist", "admin")), db=Depends(get_db)):
    m = db.get(Medication, mid)
    if not m or body.qty < 1:
        raise HTTPException(400, "Enter a quantity of at least 1.")
    m.stock += body.qty; db.commit()
    return med_out(m)

@app.get("/api/pharmacy/lookup")
def lookup(token: str, u=Depends(roles("pharmacist", "admin")), db=Depends(get_db)):
    r = find_rx(db, token)
    med = db.query(Medication).filter_by(name=r.medication).first()
    return {**rx_out(r), "in_stock": med.stock if med else None}

@app.post("/api/pharmacy/dispense")
def dispense(body: TokenIn, u=Depends(roles("pharmacist", "admin")), db=Depends(get_db)):
    r = find_rx(db, body.token)
    if r.status != "active":
        raise HTTPException(409, "This prescription was already dispensed.")
    med = db.query(Medication).filter_by(name=r.medication).first()
    if med:
        if med.stock < 1:
            raise HTTPException(409, f"{med.name} is out of stock.")
        med.stock -= 1
    if r.refills > 0:
        r.refills -= 1
    else:
        r.status = "dispensed"
    r.dispensed_at = datetime.utcnow(); r.dispensed_by = u.name
    db.commit()
    return rx_out(r)

# ---------- billing ----------
def bill_out(b):
    paid = sum(p.amount for p in b.payments)
    status = "paid" if paid >= b.amount else "partial" if paid else "pending"
    return {"id": b.id, "patient": b.patient.name, "patient_id": b.patient_id, "description": b.description,
            "amount": b.amount, "paid": paid, "balance": b.amount - paid, "status": status, "created": iso(b.created)}

@app.get("/api/bills")
def list_bills(u=Depends(roles("admin", "billing", "patient")), db=Depends(get_db)):
    q = db.query(Bill)
    if u.role == "patient":
        q = q.filter_by(patient_id=u.patient.id)
    rows = [bill_out(b) for b in q.order_by(Bill.created.desc())]
    billed, paid = sum(r["amount"] for r in rows), sum(r["paid"] for r in rows)
    return {"summary": {"Billed": billed, "Collected": paid, "Outstanding": billed - paid}, "bills": rows}

@app.post("/api/bills", status_code=201)
def create_bill(body: BillIn, u=Depends(roles("admin", "billing")), db=Depends(get_db)):
    if body.amount < 1:
        raise HTTPException(400, "Amount must be more than 0.")
    b = Bill(patient_id=body.patient_id, description=body.description[:200], amount=body.amount)
    db.add(b); db.commit()
    return bill_out(b)

@app.post("/api/bills/{bid}/payments", status_code=201)
def pay_bill(bid: int, body: PaymentIn, u=Depends(roles("admin", "billing")), db=Depends(get_db)):
    b = db.get(Bill, bid)
    if not b:
        raise HTTPException(404, "Bill not found")
    balance = bill_out(b)["balance"]
    if body.amount < 1 or body.amount > balance:
        raise HTTPException(400, f"Enter an amount between 1 and {balance}.")
    db.add(Payment(bill_id=b.id, amount=body.amount, method=body.method)); db.commit()
    db.refresh(b)
    return bill_out(b)

# ---------- telemedicine / aftercare ----------
def tele_out(t):
    return {"id": t.id, "when": iso(t.scheduled_time), "patient": t.patient.name, "doctor": t.doctor.name,
            "status": t.status, "meeting_url": t.meeting_url, "notes": t.notes}

@app.get("/api/tele")
def list_tele(u=Depends(auth), db=Depends(get_db)):
    q = db.query(TeleSession)
    if u.role == "patient":
        q = q.filter_by(patient_id=u.patient.id)
    elif u.role == "doctor":
        q = q.filter_by(doctor_id=u.id)
    return [tele_out(t) for t in q.order_by(TeleSession.scheduled_time.desc()).limit(100)]

@app.post("/api/tele", status_code=201)
def schedule_tele(body: TeleIn, u=Depends(roles("doctor", "admin", "receptionist")), db=Depends(get_db)):
    did = u.id if u.role == "doctor" else body.doctor_id
    if not did or not db.get(User, did):
        raise HTTPException(400, "Choose a doctor.")
    t = TeleSession(patient_id=body.patient_id, doctor_id=did, scheduled_time=body.when.replace(tzinfo=None),
                    meeting_url=f"https://meet.jit.si/HospitalGuard-{secrets.token_urlsafe(9)}")
    db.add(t); db.commit()
    return tele_out(t)

@app.patch("/api/tele/{tid}")
def update_tele(tid: int, body: TeleUpdateIn, u=Depends(roles("doctor", "admin")), db=Depends(get_db)):
    t = db.get(TeleSession, tid)
    if not t or (u.role == "doctor" and t.doctor_id != u.id):
        raise HTTPException(404, "Session not found")
    if body.status:
        if body.status not in ("scheduled", "completed", "cancelled"):
            raise HTTPException(400, "Unknown status")
        t.status = body.status
    if body.notes is not None:
        t.notes = body.notes[:500]
    db.commit()
    return tele_out(t)

# ---------- user management (admin) ----------
def staff_out(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "department": u.department}

@app.get("/api/users")
def list_users(u=Depends(roles("admin")), db=Depends(get_db)):
    return [staff_out(x) for x in db.query(User).order_by(User.role, User.name)]

@app.post("/api/users", status_code=201)
def create_user(body: UserIn, u=Depends(roles("admin")), db=Depends(get_db)):
    if body.role not in ROLES:
        raise HTTPException(400, "Unknown role")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters.")
    email = body.email.strip().lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "That email already has an account.")
    nu = User(email=email, name=body.name.strip(), password_hash=hash_pw(body.password), role=body.role,
              department=body.department or None)
    db.add(nu)
    if body.role == "patient":
        db.add(Patient(user=nu, name=nu.name, email=email))
    db.commit()
    return staff_out(nu)

@app.patch("/api/users/{uid}")
def change_role(uid: int, body: RoleIn, u=Depends(roles("admin")), db=Depends(get_db)):
    x = db.get(User, uid)
    if not x or body.role not in ROLES:
        raise HTTPException(400, "Unknown user or role")
    if x.id == u.id:
        raise HTTPException(400, "You can't change your own role.")
    if body.role == "patient" and not x.patient:
        db.add(Patient(user=x, name=x.name, email=x.email))
    x.role = body.role; db.commit()
    return staff_out(x)

# ---------- audit log ----------
@app.get("/api/audit")
def audit_log(u=Depends(roles("admin")), db=Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200)
    return [{"id": a.id, "when": iso(a.created), "user": a.user.name if a.user else "Not signed in",
             "action": a.action, "path": a.path, "status": a.status} for a in rows]

@app.middleware("http")
async def audit_mw(request: Request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p.startswith("/api") and (request.method in ("POST", "PATCH", "PUT", "DELETE") or p.startswith("/api/patients/")):
        uid = getattr(request.state, "uid", None)
        if uid is None:
            try:
                uid = int(jwt.decode(request.headers.get("authorization", "")[7:], SECRET, algorithms=["HS256"])["sub"])
            except Exception:
                pass
        with Session() as db:
            db.add(AuditLog(user_id=uid, action=request.method, path=p, status=resp.status_code)); db.commit()
    return resp

# ---------- extra seed ----------
def seed_extra(db):
    pw = hash_pw("ChangeMe123!")
    for email, name, role in [("nurse@hospitalguard.com", "Nurse Wanjiru Kamau", "nurse"),
                              ("pharmacist@hospitalguard.com", "Pharm. Ali Mwinyi", "pharmacist"),
                              ("billing@hospitalguard.com", "Beatrice Odhiambo", "billing"),
                              ("lab@hospitalguard.com", "Kevin Sang (Lab)", "lab_tech"),
                              ("radiology@hospitalguard.com", "Dr. Zainab Salim", "radiologist"),
                              ("reception@hospitalguard.com", "Joy Muthoni", "receptionist")]:
        db.add(User(email=email, name=name, password_hash=pw, role=role))
    for n, stock, price in [("Ibuprofen 400mg", 240, 15), ("Vitamin D3 2000IU", 12, 40), ("Amoxicillin 500mg", 180, 25),
                            ("Metformin 500mg", 300, 10), ("Amlodipine 5mg", 150, 20), ("Paracetamol 500mg", 500, 5)]:
        db.add(Medication(name=n, stock=stock, unit_price=price, reorder_level=50))
    db.flush()
    docs = db.query(User).filter_by(role="doctor").all()
    pats = db.query(Patient).order_by(Patient.id).all()
    now = datetime.utcnow()
    db.add(Order(patient=pats[0], doctor=docs[0], kind="lab", test="Vitamin D level", status="completed",
                 result="22 ng/mL (low). Start supplement, recheck in 4 weeks.", created=now - timedelta(days=10)))
    tests = [("lab", "Full blood count"), ("lab", "Lipid panel"), ("lab", "HbA1c"), ("radiology", "Chest X-ray"), ("radiology", "Abdominal ultrasound")]
    for _ in range(10):
        kind, test = random.choice(tests)
        done = random.random() < 0.5
        db.add(Order(patient=random.choice(pats), doctor=random.choice(docs), kind=kind, test=test,
                     status="completed" if done else random.choice(["ordered", "in_progress"]),
                     result="Within normal limits." if done else None, created=now - timedelta(days=random.randint(0, 20))))
    notes = ["Routine check-up, no concerns.", "Mild hypertension, advised diet changes.", "Seasonal allergies, antihistamine given.",
             "BP 120/80, pulse 72, temp 36.7 C.", "Minor wound cleaned and dressed."]
    for p in pats:
        db.add(MedicalRecord(patient=p, author=random.choice(docs), kind=random.choice(["consultation", "diagnosis", "vitals", "procedure"]),
                             summary=random.choice(notes), created=now - timedelta(days=random.randint(1, 60))))
    for p in pats:
        for _ in range(random.randint(1, 2)):
            b = Bill(patient=p, description=random.choice(["Consultation", "Lab tests", "Imaging", "Pharmacy", "Procedure"]),
                     amount=random.choice([1500, 3500, 8000, 15000, 42000, 90000]), created=now - timedelta(days=random.randint(0, 45)))
            db.add(b)
            frac = random.choice([0, 0.5, 1])
            if frac:
                db.add(Payment(bill=b, amount=int(b.amount * frac), method=random.choice(["cash", "mpesa", "card", "insurance"])))
    for i in range(6):
        db.add(TeleSession(patient=pats[i], doctor=random.choice(docs), scheduled_time=now + timedelta(days=random.randint(-5, 10), hours=random.randint(0, 8)),
                           meeting_url=f"https://meet.jit.si/HospitalGuard-{secrets.token_urlsafe(9)}"))
    db.commit()
