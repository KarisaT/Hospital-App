const BASE = import.meta.env.VITE_API_URL || "/api";
export const getToken = () => localStorage.getItem("hg_token");
export const setToken = (t) => (t ? localStorage.setItem("hg_token", t) : localStorage.removeItem("hg_token"));

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(getToken() && { Authorization: `Bearer ${getToken()}` }) },
    body: body && JSON.stringify(body),
  });
  if (res.status === 401 && path !== "/login") { setToken(null); location.reload(); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || "Something went wrong.");
  return data;
}
