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
    <table role="table">
      <thead role="rowgroup"><tr role="row"><th role="columnheader">When</th>{showPatient && <th role="columnheader">Patient</th>}<th role="columnheader">Doctor</th><th role="columnheader">Reason</th><th role="columnheader">Status</th><th role="columnheader"></th></tr></thead>
      <tbody role="rowgroup">{appts.map((a) => (
        <tr role="row" key={a.id} className="dept-row" style={{ "--dept": DEPT[a.department] }}>
          <td role="cell" data-label="When">{fmt(a.when)}</td>
          {showPatient && <td role="cell" data-label="Patient">{user.role === "patient" ? a.patient : <button className="link" onClick={() => open(a.patient_id)}>{a.patient}</button>}</td>}
          <td role="cell" data-label="Doctor">{a.doctor}<small>{a.department}</small></td><td role="cell" data-label="Reason">{a.reason}</td><td role="cell" data-label="Status"><span className={`tag ${a.status}`}>{a.status}</span></td>
          <td role="cell">{["scheduled", "confirmed"].includes(a.status) && (
            <span className="actions">
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
      <tr role="row">
        <td role="cell" data-label="Medication">{r.medication}</td><td role="cell" data-label="Patient">{r.patient}</td><td role="cell" data-label="Prescribed by">{r.doctor}</td><td role="cell" data-label="Dosage">{r.dosage}</td><td role="cell" data-label="Refills">{r.refills}</td>
        <td role="cell" data-label="Status">{r.status}{r.dispensed_at && ` (${fmt(r.dispensed_at)})`}</td>
        <td role="cell">{r.status === "active" && <button className="link" onClick={() => setShow(!show)}>{show ? "Hide QR" : "Show QR"}</button>}</td>
      </tr>
      {show && <tr role="row" className="qr-row"><td role="cell" colSpan={7} className="qr"><QrCode text={r.token} /><br /><code>{r.token}</code></td></tr>}
    </>
  );
}

export function RxTable({ rx }) {
  if (!rx.length) return <Status>No prescriptions yet.</Status>;
  return (
    <table role="table">
      <thead role="rowgroup"><tr role="row"><th role="columnheader">Medication</th><th role="columnheader">Patient</th><th role="columnheader">Prescribed by</th><th role="columnheader">Dosage</th><th role="columnheader">Refills</th><th role="columnheader">Status</th><th role="columnheader"></th></tr></thead>
      <tbody role="rowgroup">{rx.map((r) => <RxRow key={r.id} r={r} />)}</tbody>
    </table>
  );
}

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const live = (a) => ["scheduled", "confirmed"].includes(a.status);
const ECG = "M0 44" + [0, 1, 2, 3].map((i) => `H${190 + i * 270} l14-6 l14 6 h20 l10 12 l14-52 l14 68 l10-28 h30 l18-10 l18 10`).join("") + " H1200";
const QUICK = {
  admin: [["patients", "Register a patient"], ["appointments", "Book appointment"], ["billing", "Record payment"], ["users", "Add a user"]],
  doctor: [["appointments", "Book appointment"], ["prescriptions", "Write prescription"], ["orders", "Order a test"]],
  nurse: [["records", "Add a record"], ["patients", "Find a patient"]],
  receptionist: [["patients", "Register a patient"], ["appointments", "Book appointment"], ["tele", "Schedule video visit"]],
  patient: [["appointments", "Book appointment"], ["billing", "My bills"], ["tele", "Video visits"]],
};
const dayLabel = (iso) => {
  const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / 864e5);
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
};

function Visit({ a, user, reload, open }) {
  const staff = user.role !== "patient";
  const set = (status) => api(`/appointments/${a.id}`, { method: "PATCH", body: { status } }).then(reload);
  return (
    <article className={"visit" + (live(a) ? "" : " done")} style={{ "--dept": DEPT[a.department] || "var(--line)" }}>
      <header>
        <b>{staff ? <button className="link" onClick={() => open(a.patient_id)}>{a.patient}</button> : a.doctor}</b>
        <span className={`tag ${a.status}`}>{a.status}</span>
      </header>
      <p>{staff ? `${a.doctor} · ${a.department}` : a.department}{a.reason ? ` — ${a.reason}` : ""}</p>
      {live(a) && (
        <div className="acts">
          {["doctor", "admin"].includes(user.role) && <button onClick={() => set("completed")}>Complete</button>}
          <button className="ghost" onClick={() => set("cancelled")}>Cancel</button>
        </div>)}
    </article>
  );
}

export function Dashboard({ user, open, go }) {
  const [d, reload, err] = useLoad("/dashboard");
  if (err) return <p className="error">{err}</p>;
  if (!d) return <Status>Loading…</Status>;
  const staff = user.role !== "patient";
  const now = Date.now();
  const today = [...d.today].sort((x, y) => new Date(x.when) - new Date(y.when));
  const nowAt = today.findIndex((a) => new Date(a.when) > now);
  const next = today.find((a) => new Date(a.when) > now && live(a)) || d.upcoming[0];
  const days = [];
  d.upcoming.forEach((a) => { const k = dayLabel(a.when); const g = days.find((x) => x[0] === k); g ? g[1].push(a) : days.push([k, [a]]); });
  const items = today.map((a) => ({ a }));
  if (items.length) items.splice(nowAt < 0 ? items.length : nowAt, 0, { now: true });
  return (
    <>
      <section className={"hero day" + (d.stats ? " has-stats" : "")}>
        <svg className="ecg" viewBox="0 0 1200 80" preserveAspectRatio="xMaxYMid slice" aria-hidden="true"><path d={ECG} pathLength="1" /></svg>
        <div className="date">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1>{greet()}, {user.name.replace("Dr. ", "").split(" ")[0]}</h1>
        <p>{d.today.length ? `${d.today.length} appointment${d.today.length > 1 ? "s" : ""} today.` : "Nothing on today's schedule."}
          {next && ` Next: ${dayLabel(next.when) === "Today" ? "" : dayLabel(next.when) + " "}${clock(next.when)}, ${staff ? next.patient : next.doctor}.`}</p>
      </section>
      {d.stats && <div className="stats">{Object.entries(d.stats).map(([k, v]) => <div key={k}><b>{v}</b>{k}</div>)}</div>}
      {QUICK[user.role] && <div className="quick">{QUICK[user.role].map(([to, label]) => <button key={to + label} onClick={() => go(to)}>{label}</button>)}</div>}

      <h2>Today</h2>
      {items.length ? (
        <ol className="tl">{items.map((it) => it.now
          ? <li key="now" className="now"><time>Now</time><span /></li>
          : <li key={it.a.id}><time>{clock(it.a.when)}</time><i className="dot" style={{ background: DEPT[it.a.department] || "var(--muted)" }} />
              <Visit a={it.a} user={user} reload={reload} open={open} /></li>)}
        </ol>
      ) : <p className="empty">Clear day. New bookings will show up here.</p>}

      {days.length > 0 && <h2>Coming up</h2>}
      {days.map(([label, list]) => (
        <section key={label} className="day"><h3>{label}</h3>
          {list.map((a) => <div className="slot" key={a.id}><time>{clock(a.when)}</time><Visit a={a} user={user} reload={reload} open={open} /></div>)}
        </section>))}

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
