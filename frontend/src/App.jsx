import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Users as UsersIcon, CalendarDays, ClipboardList, FlaskConical, Pill, Boxes, Receipt, Video, UserCog, ShieldCheck, LogOut, Menu, X } from "lucide-react";
import { api, getToken, setToken } from "./api";
import { Dashboard, Appointments, Prescriptions } from "./pages.jsx";
import { Patients, PatientDetail, Records, Orders, Pharmacy, Billing, Tele, Users, Audit } from "./pages2.jsx";

const LABELS = { dashboard: "Dashboard", patients: "Patients", appointments: "Appointments", records: "Records", orders: "Lab & imaging",
  prescriptions: "Prescriptions", pharmacy: "Pharmacy", billing: "Billing", tele: "Telemedicine", users: "Users", audit: "Audit log" };
const NAV = {
  admin: ["dashboard", "patients", "appointments", "records", "orders", "prescriptions", "pharmacy", "billing", "tele", "users", "audit"],
  doctor: ["dashboard", "patients", "appointments", "records", "orders", "prescriptions", "tele"],
  nurse: ["dashboard", "patients", "appointments", "records"],
  receptionist: ["dashboard", "patients", "appointments", "tele"],
  pharmacist: ["pharmacy", "prescriptions"],
  billing: ["billing"],
  lab_tech: ["orders"],
  radiologist: ["orders"],
  patient: ["dashboard", "appointments", "records", "orders", "prescriptions", "billing", "tele"],
};

const ICONS = { dashboard: LayoutDashboard, patients: UsersIcon, appointments: CalendarDays, records: ClipboardList, orders: FlaskConical,
  prescriptions: Pill, pharmacy: Boxes, billing: Receipt, tele: Video, users: UserCog, audit: ShieldCheck };

const Crest = ({ size = 32 }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <path d="M16 2.5 4.5 7v8.2c0 7.2 4.8 12.3 11.5 14.3 6.7-2 11.5-7.1 11.5-14.3V7L16 2.5Z" />
    <path d="M16 9.5v11M10.5 15h11" strokeLinecap="round" />
  </svg>
);

const initials = (n) => n.replace(/^(Dr\.|Nurse|Pharm\.)\s*/, "").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

const DEMO = { email: "itskarisa@outlook.com", password: "ChangeMe123!" };

function Login({ onLogin }) {
  const [err, setErr] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { const r = await api("/login", { method: "POST", body: f }); setToken(r.token); onLogin(r.user); }
    catch (x) { setErr(x.message); }
  };
  return (
    <div className="lobby">
      <div className="pass">
        <div className="strap" aria-hidden="true" />
        <div className="clip" aria-hidden="true" />
        <form className="badge" onSubmit={submit}>
          <div className="badge-head">
            <Crest size={34} />
            <div><b>HospitalGuard</b><small>Staff and patient pass</small></div>
          </div>
          <div className="badge-body">
            <label>Email <input type="email" name="email" required autoFocus={!matchMedia("(pointer:coarse)").matches} autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password <input type="password" name="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {err && <p className="error">{err}</p>}
            <button>Sign in</button>
            <div className="demo">
              <b>Want to look around?</b>
              <span>Email: <code>{DEMO.email}</code></span>
              <span>Password: <code>{DEMO.password}</code></span>
              <button type="button" onClick={() => { setEmail(DEMO.email); setPassword(DEMO.password); }}>Use these details</button>
            </div>
          </div>
          <div className="barcode" aria-hidden="true" />
        </form>
      </div>
      <p className="lobby-note">Trouble signing in? Ask your administrator to reset your password.</p>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [view, setView] = useState(null);
  const [menu, setMenu] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    if (!menu) return;
    closeRef.current?.focus();
    const esc = (e) => e.key === "Escape" && setMenu(false);
    const mq = matchMedia("(min-width:901px)");
    const wide = (e) => e.matches && setMenu(false);
    addEventListener("keydown", esc); mq.addEventListener("change", wide);
    return () => { document.body.style.overflow = ""; removeEventListener("keydown", esc); mq.removeEventListener("change", wide); };
  }, [menu]);

  useEffect(() => { window.scrollTo(0, 0); }, [view]);

  useEffect(() => {
    if (getToken()) api("/me").then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  if (!user) return <Login onLogin={setUser} />;

  const nav = NAV[user.role] || ["dashboard"];
  const cur = view || { name: nav[0] };
  const active = cur.name === "patient" ? "patients" : cur.name;
  const go = (name, id) => { setView({ name, id }); setMenu(false); };
  const openPatient = (id) => go("patient", id);
  const logout = () => { setToken(null); setUser(null); setView(null); setMenu(false); };
  const pages = {
    dashboard: () => <Dashboard user={user} open={openPatient} go={go} />,
    patients: () => <Patients open={openPatient} />,
    patient: () => <PatientDetail id={cur.id} user={user} />,
    appointments: () => <Appointments user={user} open={openPatient} />,
    records: () => <Records user={user} />,
    orders: () => <Orders user={user} />,
    prescriptions: () => <Prescriptions user={user} />,
    pharmacy: () => <Pharmacy />,
    billing: () => <Billing user={user} />,
    tele: () => <Tele user={user} />,
    users: () => <Users me={user} />,
    audit: () => <Audit />,
  };
  const link = (fn) => (e) => { e.preventDefault(); fn(); };

  return (
    <div className="shell">
      <header className="topbar">
        <button className="icon" aria-label="Open menu" aria-expanded={menu} aria-controls="side" onClick={() => setMenu(true)}><Menu size={24} /></button>
        <Crest size={26} />
        <b>{LABELS[active]}</b>
      </header>
      <div className={"scrim" + (menu ? " open" : "")} onClick={() => setMenu(false)} aria-hidden="true" />
      <aside id="side" className={"side" + (menu ? " open" : "")}>
        <button ref={closeRef} className="icon close" aria-label="Close menu" onClick={() => setMenu(false)}><X size={22} /></button>
        <a className="brand" href="#" onClick={link(() => go(nav[0]))}><Crest /><span>HospitalGuard</span></a>
        <nav className="nav">
          {nav.map((k) => { const Icon = ICONS[k]; return (
            <a key={k} href="#" className={active === k ? "on" : ""} onClick={link(() => go(k))}><Icon size={18} />{LABELS[k]}</a>); })}
        </nav>
        <div className="me">
          <span className="avatar">{initials(user.name)}</span>
          <div><b>{user.name}</b><small>{user.role.replace("_", " ")}</small></div>
          <button className="icon" aria-label="Sign out" title="Sign out" onClick={logout}><LogOut size={18} /></button>
        </div>
      </aside>
      <main className="page" key={cur.name + (cur.id || "")}>{pages[cur.name]()}</main>
    </div>
  );
}
