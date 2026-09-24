import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { QrCode, ApptTable, RxTable, useLoad, Status, Fold, fmt, formData } from "./pages.jsx";

const kes = (n) => "KES " + new Intl.NumberFormat("en-KE").format(n);
const pick = (rows, label = (r) => r.name) => (rows || []).map((r) => [r.id, label(r)]);

// ---------- small building blocks ----------
function Table({ cols, rows, empty = "Nothing here yet." }) {
  if (!rows.length) return <Status>{empty}</Status>;
  return (
    <table role="table">
      <thead role="rowgroup"><tr role="row">{cols.map(([h]) => <th role="columnheader" key={h}>{h}</th>)}</tr></thead>
      <tbody role="rowgroup">{rows.map((r, i) => <tr role="row" key={r.id ?? i}>{cols.map(([h, f]) => <td role="cell" key={h} data-label={h || undefined}>{f(r)}</td>)}</tr>)}</tbody>
    </table>
  );
}

function Field({ f }) {
  if (f.options) {
    return (
      <label>{f.label}
        <select name={f.name} required defaultValue={f.value}>
          {f.options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
        </select>
      </label>
    );
  }
  return <label>{f.label}<input name={f.name} type={f.type || "text"} required={f.required} placeholder={f.placeholder} min={f.min} defaultValue={f.value} /></label>;
}

function Form({ fields, submit, onSubmit }) {
  const [msg, setMsg] = useState(null);
  const go = async (e) => {
    e.preventDefault();
    const form = e.target;
    try { await onSubmit(formData(e)); setMsg({ ok: true, t: "Saved." }); form.reset(); }
    catch (x) { setMsg({ ok: false, t: x.message }); }
  };
  return (
    <>
      {msg && <p className={msg.ok ? "flash" : "flash error"}>{msg.t}</p>}
      <form className="grid" onSubmit={go}>{fields.map((f) => <Field key={f.name} f={f} />)}<button>{submit}</button></form>
    </>
  );
}

const post = (path, body) => api(path, { method: "POST", body });
const patch = (path, body) => api(path, { method: "PATCH", body });
const STATUSES = ["registered", "triage", "in_consultation", "admitted", "outpatient", "discharged"];

// ---------- patients ----------
export function Patients({ open }) {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [rows, reload, err] = useLoad(`/patients?q=${encodeURIComponent(q)}`);
  return (
    <>
      <h1>Patients</h1>
      <form className="search" onSubmit={(e) => { e.preventDefault(); setQ(term); }}>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by name or email" /><button>Search</button>
      </form>
      {err && <p className="error">{err}</p>}
      {rows && <Table empty={`No patients match "${q}".`} rows={rows} cols={[
        ["Name", (p) => <button className="link" onClick={() => open(p.id)}>{p.name}</button>],
        ["Contact", (p) => <>{p.email}<br />{p.phone}</>], ["Blood", (p) => p.blood_type], ["Status", (p) => p.status]]} />}
      <Fold title="Register a patient"><Form submit="Register patient" onSubmit={async (f) => { await post("/patients", f); reload(); }} fields={[
        { name: "name", label: "Full name", required: true }, { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Phone" }, { name: "gender", label: "Gender", options: ["female", "male", "other"] },
        { name: "blood_type", label: "Blood type", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] }]} /></Fold>
    </>
  );
}

export function PatientDetail({ id, user }) {
  const [p, reload, err] = useLoad(`/patients/${id}`);
  const [recs] = useLoad(user.role === "receptionist" ? "/doctors" : `/records?patient_id=${id}`);
  const [orders] = useLoad(`/orders?patient_id=${id}`);
  if (err) return <p className="error">{err}</p>;
  if (!p) return <Status>Loading…</Status>;
  return (
    <>
      <h1>{p.name}</h1>
      <p className="meta">{p.email} · {p.phone} · {p.gender} · blood type {p.blood_type}</p>
      <label style={{ maxWidth: 240 }}>Journey stage
        <select value={p.status} onChange={(e) => patch(`/patients/${id}/status`, { status: e.target.value }).then(reload)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <h2>Appointments</h2><ApptTable appts={p.appointments} user={user} reload={reload} showPatient={false} />
      <h2>Prescriptions</h2><RxTable rx={p.prescriptions} />
      {user.role !== "receptionist" && <><h2>Medical records</h2>
        <Table rows={recs || []} empty="No records yet." cols={[["When", (r) => fmt(r.created)], ["Type", (r) => r.kind], ["Summary", (r) => r.summary], ["By", (r) => r.author]]} /></>}
      <h2>Lab and imaging</h2>
      <Table rows={orders || []} empty="No orders yet." cols={[["Test", (o) => o.test], ["Type", (o) => o.kind], ["Status", (o) => o.status], ["Result", (o) => o.result]]} />
    </>
  );
}

// ---------- medical records ----------
export function Records({ user }) {
  const [rows, reload, err] = useLoad("/records");
  const [patients] = useLoad(user.role === "patient" ? "/doctors" : "/patients");
  const canWrite = ["doctor", "nurse", "admin"].includes(user.role);
  return (
    <>
      <h1>Medical records</h1>
      {err && <p className="error">{err}</p>}
      {rows && <Table rows={rows} empty="No records yet." cols={[["When", (r) => fmt(r.created)], ["Patient", (r) => r.patient], ["Type", (r) => r.kind], ["Summary", (r) => r.summary], ["By", (r) => r.author]]} />}
      {canWrite && <><Fold title="Add a record"><Form submit="Save record" onSubmit={async (f) => { await post("/records", { ...f, patient_id: +f.patient_id }); reload(); }} fields={[
          { name: "patient_id", label: "Patient", options: pick(patients) },
          { name: "kind", label: "Type", options: ["consultation", "diagnosis", "procedure", "vitals", "note"] },
          { name: "summary", label: "Summary", required: true }]} /></Fold></>}
    </>
  );
}

// ---------- lab & radiology ----------
function OrderActions({ o, user, reload }) {
  const [t, setT] = useState("");
  const allowed = user.role === "admin" || (user.role === "lab_tech" && o.kind === "lab") || (user.role === "radiologist" && o.kind === "radiology");
  if (!allowed || o.status === "completed") return null;
  const upd = (status, result) => patch(`/orders/${o.id}`, { status, result }).then(reload);
  return (
    <span className="actions">
      {o.status === "ordered" && <button onClick={() => upd("in_progress")}>Start</button>}
      <input value={t} placeholder="Result" onChange={(e) => setT(e.target.value)} />
      <button onClick={() => t.trim() && upd("completed", t)}>Complete</button>
    </span>
  );
}

export function Orders({ user }) {
  const [rows, reload, err] = useLoad("/orders");
  const [patients] = useLoad(user.role === "patient" ? "/doctors" : "/patients");
  return (
    <>
      <h1>Lab and imaging</h1>
      {err && <p className="error">{err}</p>}
      {rows && <Table rows={rows} empty="No orders yet." cols={[
        ["Ordered", (o) => fmt(o.created)], ["Patient", (o) => o.patient], ["Type", (o) => o.kind], ["Test", (o) => o.test],
        ["Doctor", (o) => o.doctor], ["Status", (o) => <span className={`tag ${o.status}`}>{o.status}</span>], ["Result", (o) => o.result],
        ["", (o) => <OrderActions o={o} user={user} reload={reload} />]]} />}
      {["doctor", "admin"].includes(user.role) && <><Fold title="Order a test"><Form submit="Place order" onSubmit={async (f) => { await post("/orders", { ...f, patient_id: +f.patient_id }); reload(); }} fields={[
          { name: "patient_id", label: "Patient", options: pick(patients) }, { name: "kind", label: "Type", options: ["lab", "radiology"] },
          { name: "test", label: "Test", required: true, placeholder: "e.g. Full blood count, Chest X-ray" }]} /></Fold></>}
    </>
  );
}

// ---------- pharmacy ----------
function Scanner({ onCode }) {
  const ref = useRef();
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream, stop = false;
    (async () => {
      try {
        if (!("BarcodeDetector" in window)) throw new Error("This browser can't scan QR codes. Type the code instead.");
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        ref.current.srcObject = stream; await ref.current.play();
        const tick = async () => {
          if (stop) return;
          const codes = await det.detect(ref.current).catch(() => []);
          if (codes[0]) return onCode(codes[0].rawValue);
          requestAnimationFrame(tick);
        };
        tick();
      } catch (x) { setErr(x.message); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return err ? <p className="error">{err}</p> : <video ref={ref} muted playsInline style={{ width: "100%", maxWidth: 360 }} />;
}

export function Pharmacy() {
  const [inv, reload, err] = useLoad("/pharmacy/inventory");
  const [code, setCode] = useState("");
  const [rx, setRx] = useState(null);
  const [msg, setMsg] = useState(null);
  const [scan, setScan] = useState(false);
  const look = async (t = code) => {
    setMsg(null); setRx(null);
    try { setRx(await api(`/pharmacy/lookup?token=${encodeURIComponent(t.trim())}`)); }
    catch (x) { setMsg({ ok: false, t: x.message }); }
  };
  const dispense = async () => {
    try { await post("/pharmacy/dispense", { token: rx.token }); setMsg({ ok: true, t: `Dispensed ${rx.medication} to ${rx.patient}.` }); setRx(null); setCode(""); reload(); }
    catch (x) { setMsg({ ok: false, t: x.message }); }
  };
  return (
    <>
      <h1>Pharmacy</h1>
      <h2>Dispense a prescription</h2>
      {msg && <p className={msg.ok ? "flash" : "flash error"}>{msg.t}</p>}
      <form className="search stack" onSubmit={(e) => { e.preventDefault(); look(); }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Prescription code, e.g. HG-12-ab34cd56ef78" />
        <button>Look up</button>
        <button type="button" className="ghost" style={{ color: "var(--teal)", borderColor: "var(--teal)" }} onClick={() => setScan(!scan)}>{scan ? "Stop scanning" : "Scan QR"}</button>
      </form>
      {scan && <Scanner onCode={(t) => { setScan(false); setCode(t); look(t); }} />}
      {rx && (
        <div className="card">
          <b>{rx.medication}</b> · {rx.dosage || "no dosage noted"}<br />
          For {rx.patient}, prescribed by {rx.doctor}. Refills left: {rx.refills}.<br />
          {rx.in_stock === null ? "Not tracked in inventory." : `In stock: ${rx.in_stock}`}
          <p>{rx.status === "active" ? <button onClick={dispense}>Dispense</button> : <span className="tag dispensed">Already dispensed</span>}</p>
        </div>)}
      <h2>Inventory</h2>
      {err && <p className="error">{err}</p>}
      {inv && <Table rows={inv} cols={[
        ["Medication", (m) => m.name], ["In stock", (m) => <>{m.stock} {m.low && <span className="tag low">Low</span>}</>],
        ["Price", (m) => kes(m.unit_price)],
        ["", (m) => <button onClick={() => post(`/pharmacy/inventory/${m.id}/restock`, { qty: 50 }).then(reload)}>Add 50</button>]]} />}
    </>
  );
}

// ---------- billing ----------
export function Billing({ user }) {
  const [d, reload, err] = useLoad("/bills");
  const [patients] = useLoad(user.role === "patient" ? "/doctors" : "/patients");
  const staff = user.role !== "patient";
  if (err) return <p className="error">{err}</p>;
  if (!d) return <Status>Loading…</Status>;
  const open = d.bills.filter((b) => b.balance > 0);
  return (
    <>
      <h1>Billing</h1>
      <div className="stats wide">{Object.entries(d.summary).map(([k, v]) => <div key={k}><b>{kes(v)}</b>{k}</div>)}</div>
      <h2>Bills</h2>
      <Table rows={d.bills} empty="No bills yet." cols={[
        ["Date", (b) => fmt(b.created)], ...(staff ? [["Patient", (b) => b.patient]] : []), ["For", (b) => b.description],
        ["Amount", (b) => kes(b.amount)], ["Paid", (b) => kes(b.paid)], ["Status", (b) => <span className={`tag ${b.status}`}>{b.status}</span>]]} />
      {staff && <>
        <h2>Record a payment</h2>
        {open.length === 0 ? <Status>Nothing outstanding.</Status> :
          <Form submit="Record payment" onSubmit={async (f) => { await post(`/bills/${f.bill_id}/payments`, { amount: +f.amount, method: f.method }); reload(); }} fields={[
            { name: "bill_id", label: "Bill", options: open.map((b) => [b.id, `${b.patient} · ${b.description} · ${kes(b.balance)} due`]) },
            { name: "amount", label: "Amount (KES)", type: "number", min: 1, required: true },
            { name: "method", label: "Method", options: ["cash", "mpesa", "card", "insurance"] }]} />}
        <Fold title="Create a bill"><Form submit="Create bill" onSubmit={async (f) => { await post("/bills", { ...f, patient_id: +f.patient_id, amount: +f.amount }); reload(); }} fields={[
          { name: "patient_id", label: "Patient", options: pick(patients) }, { name: "description", label: "Description", required: true },
          { name: "amount", label: "Amount (KES)", type: "number", min: 1, required: true }]} /></Fold></>}
    </>
  );
}

// ---------- telemedicine ----------
export function Tele({ user }) {
  const [rows, reload, err] = useLoad("/tele");
  const [patients] = useLoad(user.role === "patient" ? "/doctors" : "/patients");
  const [doctors] = useLoad("/doctors");
  const clinician = ["doctor", "admin"].includes(user.role);
  const done = (t) => { const notes = window.prompt("Aftercare notes for the patient:", t.notes || ""); if (notes !== null) patch(`/tele/${t.id}`, { status: "completed", notes }).then(reload); };
  return (
    <>
      <h1>Telemedicine</h1>
      {err && <p className="error">{err}</p>}
      {rows && <Table rows={rows} empty="No video visits yet." cols={[
        ["When", (t) => fmt(t.when)], ["Patient", (t) => t.patient], ["Doctor", (t) => t.doctor],
        ["Status", (t) => <span className={`tag ${t.status}`}>{t.status}</span>],
        ["Call", (t) => t.status === "scheduled" && <a href={t.meeting_url} target="_blank" rel="noreferrer">Join video call</a>],
        ["Aftercare plan", (t) => t.notes],
        ["", (t) => clinician && t.status === "scheduled" && (
          <span className="actions"><button onClick={() => done(t)}>Complete</button>
            <button className="ghost" onClick={() => patch(`/tele/${t.id}`, { status: "cancelled" }).then(reload)}>Cancel</button></span>)]]} />}
      {user.role !== "patient" && <><Fold title="Schedule a video visit"><Form submit="Schedule visit" onSubmit={async (f) => { await post("/tele", { ...f, patient_id: +f.patient_id, doctor_id: f.doctor_id ? +f.doctor_id : null }); reload(); }} fields={[
          { name: "patient_id", label: "Patient", options: pick(patients) },
          ...(user.role !== "doctor" ? [{ name: "doctor_id", label: "Doctor", options: pick(doctors, (d) => `${d.name} · ${d.department}`) }] : []),
          { name: "when", label: "Date and time", type: "datetime-local", required: true }]} /></Fold></>}
    </>
  );
}

// ---------- admin ----------
const ROLES = ["admin", "doctor", "nurse", "receptionist", "pharmacist", "billing", "lab_tech", "radiologist", "patient"];

export function Users({ me }) {
  const [rows, reload, err] = useLoad("/users");
  return (
    <>
      <h1>Users</h1>
      {err && <p className="error">{err}</p>}
      {rows && <Table rows={rows} cols={[["Name", (u) => u.name], ["Email", (u) => u.email], ["Department", (u) => u.department],
        ["Role", (u) => u.id === me.id ? u.role : <select value={u.role} onChange={(e) => patch(`/users/${u.id}`, { role: e.target.value }).then(reload)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>]]} />}
      <Fold title="Add a user"><Form submit="Create user" onSubmit={async (f) => { await post("/users", f); reload(); }} fields={[
        { name: "name", label: "Full name", required: true }, { name: "email", label: "Email", type: "email", required: true },
        { name: "password", label: "Temporary password (8+ characters)", type: "password", required: true },
        { name: "role", label: "Role", options: ROLES }, { name: "department", label: "Department (optional)" }]} /></Fold>
    </>
  );
}

export function Audit() {
  const [rows, , err] = useLoad("/audit");
  return (
    <>
      <h1>Audit log</h1>
      <p className="meta">Every change and every patient record view, newest first.</p>
      {err && <p className="error">{err}</p>}
      {rows && <Table rows={rows} empty="No activity yet." cols={[["When", (a) => fmt(a.when)], ["User", (a) => a.user], ["Action", (a) => a.action], ["Path", (a) => <code>{a.path}</code>], ["Result", (a) => a.status]]} />}
    </>
  );
}
