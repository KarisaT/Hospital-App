import { useEffect, useState, useCallback } from "react";
import QRCode from "qrcode";
import { api } from "./api";

export const fmt = (iso) => new Date(iso).toLocaleString([], { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
export const formData = (e) => Object.fromEntries(new FormData(e.target));

export function useLoad(path) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => api(path).then(setData).catch((e) => setErr(e.message)), [path]);
  useEffect(() => { setData(null); load(); }, [load]);
  return [data, load, err];
}

export function Status({ children }) {
  if (children === "Loading…") return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>;
  return <p className="empty">{children}</p>;
}

export const DEPT = { Outpatient: "#1c9a68", Cardiology: "#3462d1", Neurology: "#7a59c7", Pediatrics: "#d38b17",
  Emergency: "#c62f3e", Maternity: "#e0728a", "Mental Health": "#14a3a3", Surgery: "#5b6b7a" };

export function ApptTable({ appts, user, reload, showPatient = true, open }) {
  if (!appts.length) return <Status>No appointments here.</Status>;
  const set = (id, status) => api(`/appointments/${id}`, { method: "PATCH", body: { status } }).then(reload);
  return (
    <table>
      <thead><tr><th>When</th>{showPatient && <th>Patient</th>}<th>Doctor</th><th>Reason</th><th>Status</th><th></th></tr></thead>
      <tbody>{appts.map((a) => (
        <tr key={a.id} className="dept-row" style={{ "--dept": DEPT[a.department] }}>
          <td>{fmt(a.when)}</td>
          {showPatient && <td>{user.role === "patient" ? a.patient : <button className="link" onClick={() => open(a.patient_id)}>{a.patient}</button>}</td>}
          <td>{a.doctor}<small>{a.department}</small></td><td>{a.reason}</td><td><span className={`tag ${a.status}`}>{a.status}</span></td>
          <td>{["scheduled", "confirmed"].includes(a.status) && (
            <span className="inline" style={{ display: "flex", gap: 6 }}>
              {["doctor", "admin"].includes(user.role) && <button onClick={() => set(a.id, "completed")}>Complete</button>}
              <button className="ghost" onClick={() => set(a.id, "cancelled")}>Cancel</button>
            </span>)}</td>
        </tr>))}
      </tbody>
    </table>
  );
}

export function QrCode({ text }) {
  const [src, setSrc] = useState("");
  useEffect(() => { QRCode.toDataURL(text, { width: 200, margin: 1 }).then(setSrc); }, [text]);
  return src ? <img src={src} alt={`QR code ${text}`} width="200" height="200" /> : null;
}

function RxRow({ r }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <tr>
        <td>{r.medication}</td><td>{r.patient}</td><td>{r.doctor}</td><td>{r.dosage}</td><td>{r.refills}</td>
        <td>{r.status}{r.dispensed_at && ` (${fmt(r.dispensed_at)})`}</td>
        <td>{r.status === "active" && <button className="link" onClick={() => setShow(!show)}>{show ? "Hide QR" : "Show QR"}</button>}</td>
      </tr>
      {show && <tr><td colSpan={7}><QrCode text={r.token} /><br /><code>{r.token}</code></td></tr>}
    </>
  );
}

export function RxTable({ rx }) {
  if (!rx.length) return <Status>No prescriptions yet.</Status>;
  return (
    <table>
      <thead><tr><th>Medication</th><th>Patient</th><th>Prescribed by</th><th>Dosage</th><th>Refills</th><th>Status</th><th></th></tr></thead>
      <tbody>{rx.map((r) => <RxRow key={r.id} r={r} />)}</tbody>
    </table>
  );
}

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export function Dashboard({ user, open }) {
  const [d, reload, err] = useLoad("/dashboard");
  if (err) return <p className="error">{err}</p>;
  if (!d) return <Status>Loading…</Status>;
  const isPatient = user.role === "patient";
  return (
    <>
      <section className={"hero" + (d.stats ? " has-stats" : "")}>
        <div className="date">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>{greet()}, {user.name.replace("Dr. ", "").split(" ")[0]}</h1>
        <p>{d.today.length ? `${d.today.length} appointment${d.today.length > 1 ? "s" : ""} on today's schedule.` : "Nothing on today's schedule."}</p>
      </section>
      {d.stats && <div className="stats">{Object.entries(d.stats).map(([k, v]) => <div key={k}><b>{v}</b>{k}</div>)}</div>}
      <h2>Today</h2><ApptTable appts={d.today} user={user} reload={reload} showPatient={!isPatient} open={open} />
      <h2>Coming up</h2><ApptTable appts={d.upcoming} user={user} reload={reload} showPatient={!isPatient} open={open} />
      <h2>Recent prescriptions</h2><RxTable rx={d.prescriptions} />
    </>
  );
}

export function Appointments({ user, open }) {
  const [scope, setScope] = useState("upcoming");
  const [appts, reload, err] = useLoad(`/appointments?scope=${scope}`);
  const [doctors] = useLoad("/doctors");
  const [patients] = useLoad(user.role === "patient" ? "/doctors" : "/patients");
  const [msg, setMsg] = useState("");
  const book = async (e) => {
    e.preventDefault();
    const f = formData(e);
    try {
      await api("/appointments", { method: "POST", body: { ...f, doctor_id: +f.doctor_id, patient_id: f.patient_id ? +f.patient_id : null } });
      setMsg("Appointment booked."); e.target.reset(); reload();
    } catch (x) { setMsg(x.message); }
  };
  return (
    <>
      <h1>Appointments</h1>
      <div className="tabs">{["today", "upcoming", "past"].map((s) => (
        <a key={s} href="#" className={s === scope ? "on" : ""} onClick={(e) => { e.preventDefault(); setScope(s); }}>{s[0].toUpperCase() + s.slice(1)}</a>))}
      </div>
      {err && <p className="error">{err}</p>}
      {appts ? <ApptTable appts={appts} user={user} reload={reload} showPatient={user.role !== "patient"} open={open} /> : <Status>Loading…</Status>}
      <h2>Book an appointment</h2>
      {msg && <p className="flash">{msg}</p>}
      <form className="grid" onSubmit={book}>
        {user.role !== "patient" && <label>Patient <select name="patient_id" required>{(patients || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label>Doctor <select name="doctor_id" required>{(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.name} · {d.department}</option>)}</select></label>
        <label>Date and time <input type="datetime-local" name="when" required /></label>
        <label>Reason <input name="reason" maxLength={200} /></label>
        <button>Book appointment</button>
      </form>
    </>
  );
}

export function Prescriptions({ user }) {
  const [rx, reload, err] = useLoad("/prescriptions");
  const [patients] = useLoad(user.role === "patient" ? "/doctors" : "/patients");
  const [msg, setMsg] = useState("");
  const save = async (e) => {
    e.preventDefault();
    const f = formData(e);
    try {
      await api("/prescriptions", { method: "POST", body: { ...f, patient_id: +f.patient_id, refills: +f.refills || 0 } });
      setMsg("Prescription saved."); e.target.reset(); reload();
    } catch (x) { setMsg(x.message); }
  };
  return (
    <>
      <h1>Prescriptions</h1>
      {err && <p className="error">{err}</p>}
      {rx ? <RxTable rx={rx} /> : <Status>Loading…</Status>}
      {["doctor", "admin"].includes(user.role) && (
        <>
          <h2>Write a prescription</h2>
          {msg && <p className="flash">{msg}</p>}
          <form className="grid" onSubmit={save}>
            <label>Patient <select name="patient_id" required>{(patients || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Medication <input name="medication" required /></label>
            <label>Dosage <input name="dosage" placeholder="e.g. 1 tablet twice daily" /></label>
            <label>Refills <input type="number" name="refills" min="0" defaultValue="0" /></label>
            <button>Save prescription</button>
          </form>
        </>)}
    </>
  );
}
