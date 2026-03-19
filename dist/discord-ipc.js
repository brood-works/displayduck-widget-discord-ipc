const L = /* @__PURE__ */ new Map(), J = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"), Q = (s) => {
  const t = L.get(s);
  if (t)
    return t;
  const e = s.replace(/\bthis\b/g, "__item"), i = new Function("scope", `with (scope) { return (${e}); }`);
  return L.set(s, i), i;
}, y = (s, t) => {
  try {
    return Q(s)(t);
  } catch {
    return "";
  }
}, R = (s, t = 0, e) => {
  const i = [];
  let n = t;
  for (; n < s.length; ) {
    const r = s.indexOf("{{", n);
    if (r === -1)
      return i.push({ type: "text", value: s.slice(n) }), { nodes: i, index: s.length };
    r > n && i.push({ type: "text", value: s.slice(n, r) });
    const o = s.indexOf("}}", r + 2);
    if (o === -1)
      return i.push({ type: "text", value: s.slice(r) }), { nodes: i, index: s.length };
    const a = s.slice(r + 2, o).trim();
    if (n = o + 2, a === "/if" || a === "/each") {
      if (e === a)
        return { nodes: i, index: n };
      i.push({ type: "text", value: `{{${a}}}` });
      continue;
    }
    if (a.startsWith("#if ")) {
      const c = R(s, n, "/if");
      i.push({
        type: "if",
        condition: a.slice(4).trim(),
        children: c.nodes
      }), n = c.index;
      continue;
    }
    if (a.startsWith("#each ")) {
      const c = R(s, n, "/each");
      i.push({
        type: "each",
        source: a.slice(6).trim(),
        children: c.nodes
      }), n = c.index;
      continue;
    }
    i.push({ type: "expr", value: a });
  }
  return { nodes: i, index: n };
}, O = (s, t) => {
  let e = "";
  for (const i of s) {
    if (i.type === "text") {
      e += i.value;
      continue;
    }
    if (i.type === "expr") {
      e += J(y(i.value, t));
      continue;
    }
    if (i.type === "if") {
      y(i.condition, t) && (e += O(i.children, t));
      continue;
    }
    const n = y(i.source, t);
    if (Array.isArray(n))
      for (const r of n) {
        const o = Object.create(t);
        o.__item = r, e += O(i.children, o);
      }
  }
  return e;
}, X = (s) => {
  const t = R(s).nodes;
  return (e) => O(t, e);
};
function Z(s, t = !1) {
  return window.__TAURI_INTERNALS__.transformCallback(s, t);
}
async function g(s, t = {}, e) {
  return window.__TAURI_INTERNALS__.invoke(s, t, e);
}
function H(s, t = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(s, t);
}
var P;
(function(s) {
  s.WINDOW_RESIZED = "tauri://resize", s.WINDOW_MOVED = "tauri://move", s.WINDOW_CLOSE_REQUESTED = "tauri://close-requested", s.WINDOW_DESTROYED = "tauri://destroyed", s.WINDOW_FOCUS = "tauri://focus", s.WINDOW_BLUR = "tauri://blur", s.WINDOW_SCALE_FACTOR_CHANGED = "tauri://scale-change", s.WINDOW_THEME_CHANGED = "tauri://theme-changed", s.WINDOW_CREATED = "tauri://window-created", s.WEBVIEW_CREATED = "tauri://webview-created", s.DRAG_ENTER = "tauri://drag-enter", s.DRAG_OVER = "tauri://drag-over", s.DRAG_DROP = "tauri://drag-drop", s.DRAG_LEAVE = "tauri://drag-leave";
})(P || (P = {}));
async function tt(s, t) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(s, t), await g("plugin:event|unlisten", {
    event: s,
    eventId: t
  });
}
async function A(s, t, e) {
  var i;
  const n = (i = void 0) !== null && i !== void 0 ? i : { kind: "Any" };
  return g("plugin:event|listen", {
    event: s,
    target: n,
    handler: Z(t)
  }).then((r) => async () => tt(s, r));
}
const et = "pack-ipc-transport-open", it = "pack-ipc-transport-data", nt = "pack-ipc-transport-close", st = 5e3, D = (s) => {
  let t = "";
  for (let e = 0; e < s.length; e += 1)
    t += String.fromCharCode(s[e]);
  return btoa(t);
}, rt = (s) => {
  const t = atob(s), e = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i += 1)
    e[i] = t.charCodeAt(i);
  return e;
}, U = (s) => s instanceof Uint8Array ? s : s instanceof ArrayBuffer ? new Uint8Array(s) : Uint8Array.from(s), ot = () => typeof crypto < "u" && typeof crypto.randomUUID == "function" ? crypto.randomUUID() : `ipc-${Date.now()}-${Math.random().toString(16).slice(2)}`, S = (s, t) => `[IpcTransport session=${s} endpoint=${t}]`, at = (s) => {
  if (!s)
    return "";
  if (typeof s == "string")
    return s.trim().toLowerCase();
  if (s instanceof Error)
    return s.message.trim().toLowerCase();
  if (typeof s == "object" && s && "error" in s) {
    const t = s.error;
    return typeof t == "string" ? t.trim().toLowerCase() : "";
  }
  return String(s).trim().toLowerCase();
}, C = (s) => {
  const t = at(s);
  return t.includes("no such file or directory") || t.includes("os error 2") || t.includes("endpoint is not available") || t.includes("not found");
};
class ct {
  constructor(t) {
    this.connected = !1, this.listeners = {
      open: /* @__PURE__ */ new Set(),
      data: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set()
    }, this.tauriListenersReady = null, this.tauriUnlisteners = [], this.endpoint = String(t.endpoint ?? "").trim(), this.sessionId = String(t.sessionId ?? "").trim() || ot();
  }
  async connect() {
    await this.connectWithInitialWrite();
  }
  async connectWithInitialWrite(t) {
    if (!this.endpoint)
      throw new Error("Missing IPC endpoint.");
    await this.ensureTauriListeners(), await new Promise(async (e, i) => {
      let n = !1;
      const r = setTimeout(() => {
        n || (n = !0, c(), i(new Error(`IPC connect timed out for endpoint ${this.endpoint}`)));
      }, st), o = this.on("open", () => {
        n || (n = !0, c(), e());
      }), a = this.on("close", (h) => {
        n || (n = !0, c(), C(h.error) || console.error(
          `${S(this.sessionId, this.endpoint)} connect close-before-open error=${h.error ?? "<none>"}`
        ), i(new Error(h.error ?? `IPC transport closed for endpoint ${this.endpoint}`)));
      }), c = () => {
        clearTimeout(r), o(), a();
      };
      try {
        await g("pack_ipc_transport_connect", {
          sessionId: this.sessionId,
          endpoint: this.endpoint,
          initialDataBase64: t ? D(U(t)) : null
        });
      } catch (h) {
        if (n)
          return;
        n = !0, c(), C(h) || console.error(`${S(this.sessionId, this.endpoint)} invoke connect failed`, h), i(h);
      }
    });
  }
  async write(t) {
    const e = U(t);
    try {
      await g("pack_ipc_transport_write", {
        sessionId: this.sessionId,
        dataBase64: D(e)
      });
    } catch (i) {
      this.connected = !1;
      const n = i instanceof Error ? i.message : typeof i == "string" ? i : "IPC transport write failed";
      throw console.error(`${S(this.sessionId, this.endpoint)} write failed error=${n}`, i), this.emit("close", {
        sessionId: this.sessionId,
        endpoint: this.endpoint,
        error: n
      }), i;
    }
  }
  async send(t) {
    await this.write(t);
  }
  async close() {
    try {
      await g("pack_ipc_transport_disconnect", {
        sessionId: this.sessionId
      });
    } finally {
      this.connected = !1, this.teardownTauriListeners();
    }
  }
  async destroy() {
    await this.close();
  }
  on(t, e) {
    return this.listeners[t].add(e), () => {
      this.listeners[t].delete(e);
    };
  }
  async ensureTauriListeners() {
    return this.tauriListenersReady ? this.tauriListenersReady : (this.tauriListenersReady = (async () => {
      this.tauriUnlisteners = [
        await A(et, (t) => {
          const e = t.payload;
          e.sessionId === this.sessionId && (this.connected = !0, this.emit("open", e));
        }),
        await A(it, (t) => {
          const e = t.payload;
          e.sessionId === this.sessionId && this.emit("data", rt(e.dataBase64));
        }),
        await A(nt, (t) => {
          const e = t.payload;
          e.sessionId === this.sessionId && (this.connected = !1, C(e.error) || console.error(`${S(this.sessionId, this.endpoint)} event close`, e), this.emit("close", e));
        })
      ];
    })(), this.tauriListenersReady);
  }
  teardownTauriListeners() {
    for (const t of this.tauriUnlisteners)
      try {
        t();
      } catch {
      }
    this.tauriUnlisteners = [], this.tauriListenersReady = null;
  }
  emit(t, e) {
    for (const i of this.listeners[t])
      i(e);
  }
}
const z = async (s) => {
  const t = String(s ?? "").trim();
  return t ? g("pack_ipc_transport_endpoint_exists", {
    endpoint: t
  }) : !1;
}, lt = (s) => {
  if (typeof s != "function")
    return !1;
  const t = s;
  return t._isSignal === !0 && typeof t.set == "function" && typeof t.subscribe == "function";
}, dt = (s) => {
  let t = s;
  const e = /* @__PURE__ */ new Set(), i = (() => t);
  return i._isSignal = !0, i.set = (n) => {
    t = n;
    for (const r of e)
      r(t);
  }, i.update = (n) => {
    i.set(n(t));
  }, i.subscribe = (n) => (e.add(n), () => e.delete(n)), i;
}, ht = (s, t) => {
  const e = [];
  for (const i of Object.keys(s)) {
    const n = s[i];
    lt(n) && e.push(n.subscribe(() => t()));
  }
  return () => {
    for (const i of e)
      i();
  };
}, ut = (s, t) => new Proxy(
  { payload: t },
  {
    get(e, i) {
      if (typeof i != "string")
        return;
      if (i in e)
        return e[i];
      const n = s[i];
      return typeof n == "function" ? n.bind(s) : n;
    },
    has(e, i) {
      return typeof i != "string" ? !1 : i in e || i in s;
    }
  }
), pt = ["src", "href", "poster"], ft = "{{pack-install-path}}/", x = "{{ASSETS}}", Et = (s) => {
  const t = s.trim();
  return t.length === 0 || t.startsWith("data:") || t.startsWith("blob:") || t.startsWith("http://") || t.startsWith("https://") || t.startsWith("file:") || t.startsWith("asset:") || t.startsWith("mailto:") || t.startsWith("tel:") || t.startsWith("javascript:") || t.startsWith("//") || t.startsWith("/") || t.startsWith("#");
}, mt = (s) => {
  const t = s.trim();
  if (!t)
    return null;
  if (!Et(t))
    return t.replace(/^\.\/+/, "").replace(/^\/+/, "");
  if (t.startsWith("http://") || t.startsWith("https://"))
    try {
      const e = new URL(t);
      if (e.origin === window.location.origin)
        return `${e.pathname}${e.search}${e.hash}`.replace(/^\/+/, "");
    } catch {
      return null;
    }
  return null;
}, Tt = (s, t) => {
  const e = s.replaceAll("\\", "/").replace(/\/+$/, ""), i = `${e}/${t.trim()}`, n = i.split("/"), r = [];
  for (const o of n) {
    if (!o || o === ".") {
      r.length === 0 && i.startsWith("/") && r.push("");
      continue;
    }
    if (o === "..") {
      (r.length > 1 || r.length === 1 && r[0] !== "") && r.pop();
      continue;
    }
    r.push(o);
  }
  return r.join("/") || e;
}, I = (s, t) => {
  const e = mt(t);
  if (!s || !e)
    return t;
  try {
    return H(Tt(s, e));
  } catch {
    return t;
  }
}, _t = (s) => {
  const t = s.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!t)
    return "";
  try {
    return H(t);
  } catch {
    return t;
  }
}, gt = (s, t) => s.split(",").map((e) => {
  const i = e.trim();
  if (!i)
    return i;
  const [n, r] = i.split(/\s+/, 2), o = I(t, n);
  return r ? `${o} ${r}` : o;
}).join(", "), St = (s, t) => s.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (e, i, n) => {
  const r = I(t, n);
  return r === n ? e : `url("${r}")`;
}), b = (s, t) => {
  for (const n of pt) {
    const r = s.getAttribute(n);
    if (!r)
      continue;
    const o = I(t, r);
    o !== r && s.setAttribute(n, o);
  }
  const e = s.getAttribute("srcset");
  if (e) {
    const n = gt(e, t);
    n !== e && s.setAttribute("srcset", n);
  }
  const i = s.getAttribute("style");
  if (i) {
    const n = St(i, t);
    n !== i && s.setAttribute("style", n);
  }
}, V = (s, t) => {
  if (t) {
    s instanceof Element && b(s, t);
    for (const e of Array.from(s.querySelectorAll("*")))
      b(e, t);
  }
}, B = (s, t) => {
  if (!t)
    return s;
  let e = s;
  const i = _t(t);
  return i && e.includes(x) && (e = e.replaceAll(x, i)), e.includes(ft) ? e.replace(/\{\{pack-install-path\}\}\/([^"')\s]+)/g, (n, r) => I(t, r)) : e;
}, It = (s, t) => class {
  constructor({
    mount: i,
    payload: n,
    setLoading: r
  }) {
    this.cleanups = [], this.widgetDirectory = "", this.mount = i, this.payload = n ?? {}, this.setLoading = typeof r == "function" ? r : (() => {
    }), this.assetObserver = new MutationObserver((o) => {
      if (this.widgetDirectory)
        for (const a of o) {
          if (a.type === "attributes" && a.target instanceof Element) {
            b(a.target, this.widgetDirectory);
            continue;
          }
          for (const c of Array.from(a.addedNodes))
            c instanceof Element && V(c, this.widgetDirectory);
        }
    }), this.logic = new s({
      mount: i,
      payload: this.payload,
      setLoading: (o) => this.setLoading(!!o),
      on: (o, a, c) => this.on(o, a, c)
    }), this.cleanupSignalSubscriptions = ht(this.logic, () => this.render()), this.assetObserver.observe(this.mount, {
      subtree: !0,
      childList: !0,
      attributes: !0,
      attributeFilter: ["src", "href", "poster", "srcset", "style"]
    });
  }
  onInit() {
    this.render(), this.logic.onInit?.();
  }
  onUpdate(i) {
    this.payload = i ?? {}, this.logic.onUpdate?.(this.payload), this.render();
  }
  onDestroy() {
    for (this.cleanupSignalSubscriptions(); this.cleanups.length > 0; )
      this.cleanups.pop()?.();
    this.assetObserver.disconnect(), this.logic.onDestroy?.(), this.mount.innerHTML = "";
  }
  render() {
    const i = ut(this.logic, this.payload);
    this.widgetDirectory = String(
      this.payload?.widgetDirectory ?? this.payload?.directory ?? ""
    ).trim();
    const n = B(t.template, this.widgetDirectory), r = B(t.styles, this.widgetDirectory), a = X(n)(i);
    this.mount.innerHTML = `<style>${r}</style>${a}`, this.mount.setAttribute("data-displayduck-render-empty", a.trim().length === 0 ? "true" : "false"), V(this.mount, this.widgetDirectory), this.logic.afterRender?.();
  }
  on(i, n, r) {
    const o = (c) => {
      const u = c.target?.closest(n);
      !u || !this.mount.contains(u) || r(c, u);
    };
    this.mount.addEventListener(i, o);
    const a = () => this.mount.removeEventListener(i, o);
    return this.cleanups.push(a), a;
  }
};
class $ {
  constructor() {
    this.listenersMap = /* @__PURE__ */ new Map();
  }
  addListener(t, e) {
    return this.on(t, e);
  }
  on(t, e) {
    const i = this.listenersMap.get(t) ?? [];
    return i.push({ listener: e, once: !1 }), this.listenersMap.set(t, i), this;
  }
  once(t, e) {
    const i = this.listenersMap.get(t) ?? [];
    return i.push({ listener: e, once: !0 }), this.listenersMap.set(t, i), this;
  }
  off(t, e) {
    return this.removeListener(t, e);
  }
  removeListener(t, e) {
    const i = this.listenersMap.get(t);
    if (!i?.length)
      return this;
    const n = i.filter((r) => r.listener !== e);
    return n.length > 0 ? this.listenersMap.set(t, n) : this.listenersMap.delete(t), this;
  }
  removeAllListeners(t) {
    return t === void 0 ? (this.listenersMap.clear(), this) : (this.listenersMap.delete(t), this);
  }
  emit(t, ...e) {
    const i = this.listenersMap.get(t);
    if (!i?.length)
      return !1;
    const n = [...i];
    for (const r of n)
      r.listener(...e), r.once && this.removeListener(t, r.listener);
    return !0;
  }
  listeners(t) {
    return (this.listenersMap.get(t) ?? []).map((e) => e.listener);
  }
  listenerCount(t) {
    return this.listeners(t).length;
  }
}
const Y = () => {
  if (typeof crypto < "u" && typeof crypto.randomUUID == "function")
    return crypto.randomUUID();
  let s = "";
  for (let t = 0; t < 32; t += 1) {
    (t === 8 || t === 12 || t === 16 || t === 20) && (s += "-");
    let e;
    if (t === 12)
      e = 4;
    else {
      const i = Math.random() * 16 | 0;
      e = t === 16 ? i & 3 | 8 : i;
    }
    s += e.toString(16);
  }
  return s;
}, _ = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4
}, M = 3, yt = 250, At = new TextEncoder(), Ct = new TextDecoder(), vt = () => (globalThis.navigator?.platform ?? "").toLowerCase().includes("win") ? "win32" : "unix", K = (s) => {
  const t = Array.isArray(s.options?.ipcEndpoints) ? s.options.ipcEndpoints.filter((n) => typeof n == "string" && n.trim().length > 0) : [];
  if (t.length > 0)
    return t;
  const e = vt(), i = [];
  for (const n of ["discord-ipc", "discord-canary-ipc", "discord-ptb-ipc"])
    for (let r = 0; r < 10; r++)
      e === "win32" ? i.push(`\\\\.\\pipe\\${n}-${r}`) : i.push(`/tmp/${n}-${r}`);
  return i;
}, wt = (s) => Array.isArray(s.options?.ipcEndpoints) && s.options.ipcEndpoints.some((t) => typeof t == "string" && t.trim().length > 0), Rt = async (s) => {
  const t = K(s);
  return (await Promise.all(
    t.map(async (i) => ({
      endpoint: i,
      exists: await z(i).catch(() => !1)
    }))
  )).filter((i) => i.exists).map((i) => i.endpoint);
}, Ot = (s, t) => {
  const e = new Uint8Array(s.length + t.length);
  return e.set(s, 0), e.set(t, s.length), e;
}, bt = (s) => new Promise((t) => {
  setTimeout(t, s);
}), G = (s) => {
  if (s instanceof Error)
    return s;
  if (s && typeof s == "object") {
    const t = s, e = String(t.message ?? "").trim(), i = typeof t.code == "number" || typeof t.code == "string" ? String(t.code).trim() : "";
    if (e || i) {
      const n = new Error(
        [e, i ? `(code ${i})` : ""].filter(Boolean).join(" ")
      );
      return i && (n.code = i), n;
    }
  }
  return new Error(String(s ?? "connection closed"));
}, v = (s, t) => {
  const e = At.encode(JSON.stringify(t)), i = new Uint8Array(8 + e.length), n = new DataView(i.buffer);
  return n.setInt32(0, s, !0), n.setInt32(4, e.length, !0), i.set(e, 8), i;
};
class Nt extends $ {
  constructor(t) {
    super(), this.socket = null, this.buffer = new Uint8Array(0), this.connectPromise = null, this.client = t;
  }
  async connect() {
    if (!this.socket)
      return this.connectPromise ? this.connectPromise : (this.connectPromise = this.connectInternal().finally(() => {
        this.connectPromise = null;
      }), this.connectPromise);
  }
  send(t, e = _.FRAME) {
    if (!this.socket)
      throw new Error("IPC transport is not connected");
    const i = this.socket;
    i.write(v(e, t)).catch((n) => {
      this.socket === i && (this.socket = null), this.emit("close", n instanceof Error ? n : new Error(String(n)));
    });
  }
  async close() {
    if (this.connectPromise = null, !this.socket) {
      this.buffer = new Uint8Array(0);
      return;
    }
    const t = this.socket;
    this.socket = null, this.buffer = new Uint8Array(0), await t.write(v(_.CLOSE, {})).catch(() => {
    }), await t.close();
  }
  ping() {
    this.send(Y(), _.PING);
  }
  decode(t) {
    for (this.buffer = Ot(this.buffer, t); this.buffer.length >= 8; ) {
      const e = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength), i = e.getInt32(0, !0), r = 8 + e.getInt32(4, !0);
      if (this.buffer.length < r)
        return;
      const o = this.buffer.slice(8, r);
      this.buffer = this.buffer.slice(r);
      let a = null;
      try {
        a = JSON.parse(Ct.decode(o));
      } catch {
        continue;
      }
      if (i === _.PING) {
        this.send(a, _.PONG);
        continue;
      }
      if (i === _.FRAME) {
        if (!a || typeof a != "object")
          continue;
        this.emit("message", a);
        continue;
      }
      i === _.CLOSE && this.emit("close", G(a));
    }
  }
  async connectInternal() {
    this.buffer = new Uint8Array(0);
    const t = K(this.client), e = await Rt(this.client), i = e.length > 0 ? e : wt(this.client) ? t : [];
    let n = null;
    if (i.length === 0)
      throw new Error("Discord IPC endpoint is not available.");
    for (let r = 0; r < M; r += 1) {
      for (const o of i) {
        const a = new ct({ endpoint: o }), c = a.on("open", () => {
          this.emit("open");
        }), h = a.on("data", (d) => {
          this.decode(d);
        }), u = a.on("close", (d) => {
          this.socket === a && (this.socket = null), this.buffer = new Uint8Array(0), this.emit("close", d.error ? new Error(d.error) : G(d));
        });
        try {
          await a.connectWithInitialWrite(
            v(_.HANDSHAKE, {
              v: 1,
              client_id: this.client.clientId
            })
          ), this.socket = a;
          return;
        } catch (d) {
          c(), h(), u(), await a.close().catch(() => {
          }), n = d;
        }
      }
      r < M - 1 && await bt(yt * (r + 1));
    }
    throw e.length > 0 ? n instanceof Error ? n : new Error("Discord IPC endpoint is available, but the connection did not complete.") : n instanceof Error ? n : new Error("Could not connect");
  }
}
const F = (s) => {
  const t = {};
  for (const e of s)
    t[e] = e;
  return t;
}, l = F([
  "DISPATCH",
  "AUTHORIZE",
  "AUTHENTICATE",
  "GET_GUILD",
  "GET_GUILDS",
  "GET_CHANNEL",
  "GET_CHANNELS",
  "CREATE_CHANNEL_INVITE",
  "GET_RELATIONSHIPS",
  "GET_USER",
  "SUBSCRIBE",
  "UNSUBSCRIBE",
  "SET_USER_VOICE_SETTINGS",
  "SET_USER_VOICE_SETTINGS_2",
  "SELECT_VOICE_CHANNEL",
  "GET_SELECTED_VOICE_CHANNEL",
  "SELECT_TEXT_CHANNEL",
  "GET_VOICE_SETTINGS",
  "SET_VOICE_SETTINGS_2",
  "SET_VOICE_SETTINGS",
  "CAPTURE_SHORTCUT",
  "SET_ACTIVITY",
  "SEND_ACTIVITY_JOIN_INVITE",
  "CLOSE_ACTIVITY_JOIN_REQUEST",
  "ACTIVITY_INVITE_USER",
  "ACCEPT_ACTIVITY_INVITE",
  "INVITE_BROWSER",
  "DEEP_LINK",
  "CONNECTIONS_CALLBACK",
  "BRAINTREE_POPUP_BRIDGE_CALLBACK",
  "GIFT_CODE_BROWSER",
  "GUILD_TEMPLATE_BROWSER",
  "OVERLAY",
  "BROWSER_HANDOFF",
  "SET_CERTIFIED_DEVICES",
  "GET_IMAGE",
  "CREATE_LOBBY",
  "UPDATE_LOBBY",
  "DELETE_LOBBY",
  "UPDATE_LOBBY_MEMBER",
  "CONNECT_TO_LOBBY",
  "DISCONNECT_FROM_LOBBY",
  "SEND_TO_LOBBY",
  "SEARCH_LOBBIES",
  "CONNECT_TO_LOBBY_VOICE",
  "DISCONNECT_FROM_LOBBY_VOICE",
  "SET_OVERLAY_LOCKED",
  "OPEN_OVERLAY_ACTIVITY_INVITE",
  "OPEN_OVERLAY_GUILD_INVITE",
  "OPEN_OVERLAY_VOICE_SETTINGS",
  "VALIDATE_APPLICATION",
  "GET_ENTITLEMENT_TICKET",
  "GET_APPLICATION_TICKET",
  "START_PURCHASE",
  "GET_SKUS",
  "GET_ENTITLEMENTS",
  "GET_NETWORKING_CONFIG",
  "NETWORKING_SYSTEM_METRICS",
  "NETWORKING_PEER_METRICS",
  "NETWORKING_CREATE_TOKEN",
  "SET_USER_ACHIEVEMENT",
  "GET_USER_ACHIEVEMENTS",
  "PUSH_TO_TALK",
  "TOGGLE_VIDEO",
  "TOGGLE_SCREENSHARE",
  "GET_SOUNDBOARD_SOUNDS",
  "PLAY_SOUNDBOARD_SOUND"
]), f = F([
  "CURRENT_USER_UPDATE",
  "GUILD_STATUS",
  "GUILD_CREATE",
  "CHANNEL_CREATE",
  "RELATIONSHIP_UPDATE",
  "VOICE_CHANNEL_SELECT",
  "VOICE_STATE_CREATE",
  "VOICE_STATE_DELETE",
  "VOICE_STATE_UPDATE",
  "VOICE_SETTINGS_UPDATE",
  "VOICE_SETTINGS_UPDATE_2",
  "VOICE_CONNECTION_STATUS",
  "SPEAKING_START",
  "SPEAKING_STOP",
  "GAME_JOIN",
  "GAME_SPECTATE",
  "ACTIVITY_JOIN",
  "ACTIVITY_JOIN_REQUEST",
  "ACTIVITY_SPECTATE",
  "ACTIVITY_INVITE",
  "NOTIFICATION_CREATE",
  "MESSAGE_CREATE",
  "MESSAGE_UPDATE",
  "MESSAGE_DELETE",
  "LOBBY_DELETE",
  "LOBBY_UPDATE",
  "LOBBY_MEMBER_CONNECT",
  "LOBBY_MEMBER_DISCONNECT",
  "LOBBY_MEMBER_UPDATE",
  "LOBBY_MESSAGE",
  "CAPTURE_SHORTCUT_CHANGE",
  "OVERLAY",
  "OVERLAY_UPDATE",
  "ENTITLEMENT_CREATE",
  "ENTITLEMENT_DELETE",
  "USER_ACHIEVEMENT_UPDATE",
  "READY",
  "ERROR"
]), kt = {
  NONE: 0,
  FRIEND: 1,
  BLOCKED: 2,
  PENDING_INCOMING: 3,
  PENDING_OUTGOING: 4,
  IMPLICIT: 5
}, Lt = (s, t) => `${s}${JSON.stringify(t)}`, q = (s, t) => {
  const e = typeof t.pid == "number" ? t.pid : void 0;
  return typeof e == "number" ? e : typeof s.pid == "number" ? s.pid : 0;
};
class Pt extends $ {
  constructor(t = {}) {
    super(), this.accessToken = null, this.refreshToken = null, this.clientId = null, this.application = null, this.user = null, this.endpoint = "https://discord.com/api", this._expecting = /* @__PURE__ */ new Map(), this._subscriptions = /* @__PURE__ */ new Map(), this.options = t, this.transport = new Nt(this), this.transport.on("message", this._onRpcMessage.bind(this)), this.transport.on("close", (e) => {
      this._expecting.forEach((i) => {
        i.reject(e instanceof Error ? e : new Error("connection closed"));
      }), this._expecting.clear(), this._connectPromise = void 0, this.emit("disconnected", e instanceof Error ? e : new Error("connection closed"));
    });
  }
  on(t, e) {
    return super.on(t, e);
  }
  off(t, e) {
    return super.off(t, e);
  }
  once(t, e) {
    return super.once(t, e);
  }
  emit(t, ...e) {
    return super.emit(t, ...e);
  }
  async fetch(t, e, { data: i, query: n } = {}) {
    const r = n ? `?${new URLSearchParams(n).toString()}` : "", o = {};
    return typeof this.accessToken == "string" && this.accessToken.trim().length > 0 && (o.Authorization = `Bearer ${this.accessToken}`), fetch(`${this.endpoint}${e}${r}`, {
      method: t,
      body: i,
      headers: o
    }).then(async (a) => {
      const c = await a.json();
      if (!a.ok) {
        const h = new Error(a.status.toString());
        throw h.body = c, h;
      }
      return c;
    });
  }
  connect(t) {
    return this._connectPromise && this.clientId === t ? this._connectPromise : (this.clientId && this.clientId !== t && (this.destroy().catch(() => {
    }), this._connectPromise = void 0), this.transport.socket || (this._connectPromise = void 0), this._connectPromise = new Promise((e, i) => {
      this.clientId = t;
      const n = () => {
        o(), e(this);
      }, r = (c) => {
        o(), i(c instanceof Error ? c : new Error("connection closed"));
      }, o = () => {
        clearTimeout(a), this.off("connected", n), this.off("disconnected", r);
      }, a = setTimeout(() => {
        o(), i(new Error("RPC_CONNECTION_TIMEOUT"));
      }, 1e4);
      this.on("connected", n), this.on("disconnected", r), this.transport.connect().catch((c) => {
        o(), i(c);
      });
    }).catch((e) => {
      throw this._connectPromise = void 0, e;
    }), this._connectPromise);
  }
  async login(t) {
    if (await this.connect(t.clientId), !t.scopes)
      return this.emit("ready"), this;
    if (t.refreshToken) {
      const e = await this.refreshOAuthToken(t);
      e !== null ? (t.accessToken = e.access_token, t.refreshToken = e.refresh_token, this.accessToken = e.access_token, this.refreshToken = e.refresh_token) : (t.accessToken = void 0, t.refreshToken = void 0);
    }
    if (!t.accessToken || !t.refreshToken) {
      const e = await this.authorize(t);
      t.accessToken = e.access_token, t.refreshToken = e.refresh_token, this.accessToken = e.access_token, this.refreshToken = e.refresh_token;
    }
    return this.authenticate(t);
  }
  request(t, e, i) {
    return new Promise((n, r) => {
      if (!this.transport.socket) {
        r(new Error("connection closed"));
        return;
      }
      const o = Y();
      this._expecting.set(o, { resolve: n, reject: r });
      try {
        this.transport.send({ cmd: t, args: e, evt: i, nonce: o });
      } catch (a) {
        this._expecting.delete(o), r(a);
      }
    });
  }
  _onRpcMessage(t) {
    if (t.cmd === l.DISPATCH && t.evt === f.READY) {
      t.data && typeof t.data == "object" && "user" in t.data && (this.user = t.data.user ?? null), this.emit("connected");
      return;
    }
    if (t.evt === "ERROR" && !t.nonce) {
      const e = t.data ?? {}, i = new Error(e.message ?? "RPC handshake failed");
      i.code = e.code, i.data = t.data, this.emit("disconnected", i);
      return;
    }
    if (t.nonce && this._expecting.has(t.nonce)) {
      const e = this._expecting.get(t.nonce);
      if (!e)
        return;
      if (t.evt === "ERROR") {
        const i = t.data ?? {}, n = new Error(i.message ?? "RPC error");
        n.code = i.code, n.data = t.data, e.reject(n);
      } else
        e.resolve(t.data);
      this._expecting.delete(t.nonce);
      return;
    }
    this.emit(t.evt ?? "message", t.data);
  }
  async authorize({ scopes: t, clientSecret: e, rpcToken: i, redirectUri: n, prompt: r } = { clientId: "" }) {
    let o = i;
    e && i === !0 && (o = (await this.fetch("POST", "/oauth2/token/rpc", {
      data: new URLSearchParams({
        client_id: this.clientId || "",
        client_secret: e
      })
    })).rpc_token);
    const { code: a } = await this.request("AUTHORIZE", {
      scopes: t,
      client_id: this.clientId,
      prompt: r,
      rpc_token: o
    });
    return this.fetch("POST", "/oauth2/token", {
      data: new URLSearchParams({
        client_id: this.clientId || "",
        client_secret: e || "",
        code: a,
        grant_type: "authorization_code",
        redirect_uri: n || ""
      })
    });
  }
  authenticate(t) {
    return this.request("AUTHENTICATE", {
      access_token: t.accessToken
    }).then(({ application: e, user: i }) => (this.accessToken = t.accessToken, this.refreshToken = t.refreshToken, this.application = e, this.user = i, this.emit("ready"), this));
  }
  refreshOAuthToken(t) {
    return fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: t.clientId,
        client_secret: t.clientSecret || "",
        grant_type: "refresh_token",
        refresh_token: t.refreshToken || ""
      })
    }).then((e) => e.json()).catch(() => null);
  }
  getGuild(t, e) {
    return this.request(l.GET_GUILD, { guild_id: t, timeout: e });
  }
  async getGuilds(t) {
    const { guilds: e } = await this.request(l.GET_GUILDS, { timeout: t });
    return e;
  }
  getChannel(t, e) {
    return this.request(l.GET_CHANNEL, { channel_id: t, timeout: e });
  }
  async getChannels(t, e) {
    const { channels: i } = await this.request(l.GET_CHANNELS, { guild_id: t, timeout: e });
    return i;
  }
  async getSelectedVoiceChannel() {
    return this.request(l.GET_SELECTED_VOICE_CHANNEL);
  }
  setCertifiedDevices(t) {
    return this.request(l.SET_CERTIFIED_DEVICES, {
      devices: t.map((e) => ({
        type: e.type,
        id: e.uuid,
        vendor: e.vendor,
        model: e.model,
        related: e.related,
        echo_cancellation: e.echoCancellation,
        noise_suppression: e.noiseSuppression,
        automatic_gain_control: e.automaticGainControl,
        hardware_mute: e.hardwareMute
      }))
    });
  }
  setPushToTalk(t) {
    return this.request(l.PUSH_TO_TALK, { active: t });
  }
  setUserVoiceSettings(t, e) {
    return this.request(l.SET_USER_VOICE_SETTINGS, {
      user_id: t,
      ...e
    });
  }
  selectVoiceChannel(t, { timeout: e, force: i = !1 } = {}) {
    return this.request(l.SELECT_VOICE_CHANNEL, { channel_id: t, timeout: e, force: i });
  }
  selectTextChannel(t, { timeout: e } = {}) {
    return this.request(l.SELECT_TEXT_CHANNEL, { channel_id: t, timeout: e });
  }
  getVoiceSettings() {
    return this.request(l.GET_VOICE_SETTINGS);
  }
  setVoiceSettings(t) {
    return this.request(l.SET_VOICE_SETTINGS, t);
  }
  captureShortcut(t) {
    const e = Lt(f.CAPTURE_SHORTCUT_CHANGE), i = () => (this._subscriptions.delete(e), this.request(l.CAPTURE_SHORTCUT, { action: "STOP" }));
    return this._subscriptions.set(e, ({ shortcut: n }) => {
      t(n, i);
    }), this.request(l.CAPTURE_SHORTCUT, { action: "START" }).then(() => i);
  }
  setActivity(t = {}) {
    let e, i, n, r;
    if (t.startTimestamp || t.endTimestamp) {
      if (e = {
        start: t.startTimestamp,
        end: t.endTimestamp
      }, e.start instanceof Date && (e.start = Math.round(e.start.getTime())), e.end instanceof Date && (e.end = Math.round(e.end.getTime())), e.start > 2147483647e3)
        throw new RangeError("timestamps.start must fit into a unix timestamp");
      if (e.end > 2147483647e3)
        throw new RangeError("timestamps.end must fit into a unix timestamp");
    }
    return (t.largeImageKey || t.largeImageText || t.smallImageKey || t.smallImageText) && (i = {
      large_image: t.largeImageKey,
      large_text: t.largeImageText,
      small_image: t.smallImageKey,
      small_text: t.smallImageText
    }), (t.partySize || t.partyId || t.partyMax) && (n = { id: t.partyId }, (t.partySize || t.partyMax) && (n.size = [t.partySize, t.partyMax])), (t.matchSecret || t.joinSecret || t.spectateSecret) && (r = {
      match: t.matchSecret,
      join: t.joinSecret,
      spectate: t.spectateSecret
    }), this.request(l.SET_ACTIVITY, {
      pid: q(this.options, t),
      activity: {
        state: t.state,
        details: t.details,
        timestamps: e,
        assets: i,
        party: n,
        secrets: r,
        buttons: t.buttons,
        instance: !!t.instance
      }
    });
  }
  clearActivity() {
    return this.request(l.SET_ACTIVITY, { pid: q(this.options, {}) });
  }
  sendJoinInvite(t) {
    return this.request(l.SEND_ACTIVITY_JOIN_INVITE, {
      user_id: typeof t == "string" ? t : t.id
    });
  }
  sendJoinRequest(t) {
    return this.request(l.SEND_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof t == "string" ? t : t.id
    });
  }
  toggleVideo() {
    return this.request(l.TOGGLE_VIDEO);
  }
  toggleScreenshare() {
    return this.request(l.TOGGLE_SCREENSHARE);
  }
  getSoundboardSounds() {
    return this.request(l.GET_SOUNDBOARD_SOUNDS);
  }
  playSoundboardSound(t, e) {
    return this.request(l.PLAY_SOUNDBOARD_SOUND, { guild_id: t, sound_id: e });
  }
  closeJoinRequest(t) {
    return this.request(l.CLOSE_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof t == "string" ? t : t.id
    });
  }
  createLobby(t, e, i) {
    return this.request(l.CREATE_LOBBY, { type: t, capacity: e, metadata: i });
  }
  updateLobby(t, {
    type: e,
    owner: i,
    capacity: n,
    metadata: r
  } = {}) {
    return this.request(l.UPDATE_LOBBY, {
      id: typeof t == "string" ? t : t.id,
      type: e,
      owner_id: typeof i == "string" ? i : i?.id,
      capacity: n,
      metadata: r
    });
  }
  deleteLobby(t) {
    return this.request(l.DELETE_LOBBY, { id: typeof t == "string" ? t : t.id });
  }
  connectToLobby(t, e) {
    return this.request(l.CONNECT_TO_LOBBY, { id: t, secret: e });
  }
  sendToLobby(t, e) {
    return this.request(l.SEND_TO_LOBBY, { id: typeof t == "string" ? t : t.id, data: e });
  }
  disconnectFromLobby(t) {
    return this.request(l.DISCONNECT_FROM_LOBBY, { id: typeof t == "string" ? t : t.id });
  }
  updateLobbyMember(t, e, i) {
    return this.request(l.UPDATE_LOBBY_MEMBER, {
      lobby_id: typeof t == "string" ? t : t.id,
      user_id: typeof e == "string" ? e : e.id,
      metadata: i
    });
  }
  getRelationships() {
    const t = Object.keys(kt);
    return this.request(
      l.GET_RELATIONSHIPS
    ).then((e) => e.relationships.map((i) => ({
      ...i,
      type: t[i.type]
    })));
  }
  async subscribe(t, e) {
    return await this.request(l.SUBSCRIBE, e, t), {
      unsubscribe: () => this.request(l.UNSUBSCRIBE, e, t)
    };
  }
  async destroy() {
    this._expecting.clear(), this._connectPromise = void 0, await this.transport.close();
  }
}
const w = "displayduck:discord-ipc:token:", Dt = "http://localhost", Ut = ["rpc", "rpc.voice.read", "rpc.voice.write"], xt = ["discord-ipc", "discord-canary-ipc", "discord-ptb-ipc"], Vt = 1e3, Bt = 500, Mt = 3e3, Gt = 5e3, qt = 3e4, E = (s) => !!s && typeof s == "object", p = (s) => typeof s == "string" ? s.trim() : "", m = (s) => s === !0, Wt = (s) => s.startsWith("a_") ? "gif" : "png", W = (s, t) => {
  const e = p(t);
  if (e)
    return `https://cdn.discordapp.com/${s}/${e}.${Wt(e)}?size=128`;
}, Ht = () => {
  const s = [], t = (globalThis.navigator?.platform ?? "").toLowerCase().includes("win");
  for (const e of xt)
    for (let i = 0; i < 10; i += 1)
      s.push(t ? `\\\\.\\pipe\\${e}-${i}` : `${e}-${i}`);
  return s;
};
let zt = class {
  constructor(t) {
    this.ctx = t, this.participants = [], this.participantElements = /* @__PURE__ */ new Map(), this.renderedParticipants = /* @__PURE__ */ new Map(), this.dom = {
      container: null,
      host: null,
      disconnectedView: null,
      participantsView: null,
      participantsList: null,
      message: null,
      icon: null,
      loginButton: null,
      participantTemplate: null,
      loaderIcon: null,
      discordIcon: null
    }, this.client = null, this.subscriptions = [], this.reconnectTimer = null, this.speakingWatchdog = null, this.voicePollTimer = null, this.reconnectAttempts = 0, this.runId = 0, this.selectedChannelId = "", this.payload = t.payload ?? {}, this.state = dt({
      message: "Waiting for Discord authorization.",
      authenticated: !1,
      participants: [],
      isLoading: !1,
      authorizationRequired: !1,
      retryAvailable: !1,
      hideableDisconnect: !1,
      clientId: this.clientId()
    });
  }
  afterRender() {
    this.cacheDom(), this.reconcileParticipants(), this.render();
  }
  onInit() {
    this.ctx.on("click", "#login-btn", () => {
      if (!this.state().isLoading) {
        if (this.state().authorizationRequired) {
          this.authorize();
          return;
        }
        this.syncSession("Connecting to Discord...");
      }
    }), this.ctx.on("click", "[data-participant-id]", (t, e) => {
      const i = e.getAttribute("data-participant-id")?.trim() ?? "";
      !i || this.state().isLoading || this.toggleParticipantMute(i);
    }), this.initialize();
  }
  onUpdate(t) {
    this.payload = t ?? {};
    const e = this.clientId();
    e !== this.state().clientId && (this.invalidateRun(), this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.cancelReconnect(), this.participants = [], this.clearParticipantElements(), this.destroyClient(), this.patchState({
      clientId: e,
      authenticated: !1,
      participants: [],
      authorizationRequired: !1,
      retryAvailable: !1,
      hideableDisconnect: !1,
      message: e ? "Client changed. Reconnecting to Discord." : "Set a Discord client ID to begin authorization.",
      isLoading: !1
    }), this.syncSession("Connecting to Discord..."));
  }
  onDestroy() {
    this.invalidateRun(), this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.cancelReconnect(), this.participants = [], this.clearParticipantElements(), this.destroyClient();
  }
  async initialize() {
    await this.syncSession("Connecting to Discord...");
  }
  async syncSession(t) {
    const e = this.state().clientId;
    if (!e) {
      this.patchState({
        message: "Set a Discord client ID to begin authorization.",
        authenticated: !1,
        participants: [],
        authorizationRequired: !1,
        retryAvailable: !1,
        hideableDisconnect: !1,
        isLoading: !1
      });
      return;
    }
    const i = this.beginRun();
    this.setBusy(!0, t), this.cancelReconnect();
    try {
      const n = await this.ensureConnected(e);
      if (!this.isCurrentRun(i))
        return;
      const r = this.readStoredToken(e);
      if (!r?.accessToken) {
        this.requireAuthorization("Authorize this Discord application.");
        return;
      }
      if (!await this.restoreStoredSession(n, r) || !this.isCurrentRun(i))
        return;
      await this.handleAuthenticated(n);
    } catch (n) {
      if (!this.isCurrentRun(i))
        return;
      const r = await this.isDiscordRunning();
      this.disconnect(
        r ? n : "Discord is not running.",
        r ? "Could not connect to Discord." : "Discord is not running.",
        r
      );
    } finally {
      this.isCurrentRun(i) && this.setBusy(!1);
    }
  }
  async authorize() {
    const t = this.state().clientId;
    if (!t)
      return;
    const e = this.beginRun();
    this.setBusy(!0, "Authorizing with Discord..."), this.cancelReconnect();
    try {
      const i = await this.ensureConnected(t);
      if (!this.isCurrentRun(e) || (await i.login({
        clientId: t,
        redirectUri: Dt,
        scopes: [...Ut]
      }), !this.isCurrentRun(e)))
        return;
      this.persistClientTokens(t, i), await this.handleAuthenticated(i);
    } catch (i) {
      if (!this.isCurrentRun(e))
        return;
      this.shouldInvalidateToken(i) && this.clearStoredToken(t), this.requireAuthorization(this.formatError(i, "Discord authorization failed."));
    } finally {
      this.isCurrentRun(e) && this.setBusy(!1);
    }
  }
  async ensureConnected(t) {
    if (this.client && this.client.clientId === t && this.client.transport.socket)
      return await this.client.connect(t), this.client;
    await this.destroyClient();
    const e = new Pt();
    return this.bindClient(e), this.client = e, this.selectedChannelId = "", await e.connect(t), e;
  }
  bindClient(t) {
    t.on("disconnected", (i) => {
      this.client === t && (this.selectedChannelId = "", this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.clearSubscriptions(), this.disconnect(i, "Lost connection to Discord.", !0));
    });
    const e = () => {
      this.client !== t || !this.state().authenticated || this.refreshVoiceState();
    };
    t.on(f.VOICE_CHANNEL_SELECT, (i) => {
      e();
    }), t.on(f.VOICE_STATE_CREATE, e), t.on(f.VOICE_STATE_UPDATE, e), t.on(f.VOICE_STATE_DELETE, e), t.on(f.SPEAKING_START, (i) => {
      this.applySpeaking(this.extractUserId(i), !0);
    }), t.on(f.SPEAKING_STOP, (i) => {
      this.applySpeaking(this.extractUserId(i), !1);
    });
  }
  async restoreStoredSession(t, e) {
    const i = this.state().clientId;
    if (!i)
      return !1;
    try {
      return await t.authenticate({
        clientId: i,
        accessToken: e.accessToken,
        refreshToken: e.refreshToken
      }), this.persistClientTokens(i, t), !0;
    } catch (n) {
      if (e.refreshToken) {
        const r = await t.refreshOAuthToken({
          clientId: i,
          refreshToken: e.refreshToken
        });
        if (r?.access_token && r.refresh_token)
          return await t.authenticate({
            clientId: i,
            accessToken: r.access_token,
            refreshToken: r.refresh_token
          }), this.persistToken(i, {
            accessToken: r.access_token,
            refreshToken: r.refresh_token
          }), !0;
      }
      return this.shouldInvalidateToken(n) ? (this.clearStoredToken(i), this.requireAuthorization("Saved authorization expired. Please authorize again."), !1) : (this.disconnect(n, "Discord authentication failed.", !1), !1);
    }
  }
  async handleAuthenticated(t) {
    this.reconnectAttempts = 0, this.cancelReconnect(), this.patchState({
      authenticated: !0,
      authorizationRequired: !1,
      retryAvailable: !1,
      hideableDisconnect: !1,
      message: "Loading voice state..."
    }), await this.refreshVoiceState(), await this.subscribeToVoiceEvents(), this.startSpeakingWatchdog(), this.startVoicePolling();
  }
  async subscribeToVoiceEvents() {
    const t = this.client;
    if (!t || (await this.clearSubscriptions(), this.subscriptions.push(
      await t.subscribe(f.VOICE_CHANNEL_SELECT)
    ), !this.selectedChannelId))
      return;
    const e = { channel_id: this.selectedChannelId };
    for (const i of [
      f.VOICE_STATE_CREATE,
      f.VOICE_STATE_UPDATE,
      f.VOICE_STATE_DELETE,
      f.SPEAKING_START,
      f.SPEAKING_STOP
    ])
      this.subscriptions.push(await t.subscribe(i, e));
  }
  async clearSubscriptions() {
    const t = this.subscriptions.splice(0, this.subscriptions.length);
    await Promise.all(
      t.map((e) => e.unsubscribe().catch(() => {
      }))
    );
  }
  async refreshVoiceState() {
    const t = this.client;
    if (!t)
      return;
    let e = null;
    try {
      e = await t.getSelectedVoiceChannel();
    } catch (d) {
      this.client === t && this.disconnect(d, "Failed to read the current voice channel.", !0);
      return;
    }
    if (this.client !== t)
      return;
    const i = p(e?.id);
    i !== this.selectedChannelId && (this.selectedChannelId = i, await this.subscribeToVoiceEvents());
    const n = this.participants, r = new Map(n.map((d) => [d.id, d])), o = Date.now(), a = Array.isArray(e?.voice_states) ? e.voice_states.map((d) => this.normalizeParticipant(d, r.get(p(E(d?.user) ? d.user.id : void 0)), o, e)).filter((d) => !!d).sort((d, T) => this.participantName(d).localeCompare(this.participantName(T))) : [], c = a.some((d) => d.isSelf) ? a : [], h = c.length > 0 ? "" : "No active voice call or channel found.", u = !this.areParticipantsEqual(n, c);
    u && (this.participants = c, this.reconcileParticipants()), !(!u && this.state().message === h && this.state().authenticated && !this.state().authorizationRequired && !this.state().retryAvailable) && this.patchState({
      authenticated: !0,
      authorizationRequired: !1,
      retryAvailable: !1,
      hideableDisconnect: !1,
      participants: [],
      message: h
    });
  }
  normalizeParticipant(t, e, i, n) {
    const r = E(t.user) ? t.user : E(t.member) && E(t.member.user) ? t.member.user : null, o = p(r?.id);
    if (!o)
      return null;
    const a = E(t.member) ? t.member : null, c = E(t.voice_state) ? t.voice_state : null, h = p(t.nick || a?.nick || (E(c?.member) ? c.member.nick : void 0)) || void 0, u = p(r?.global_name) || p(r?.username) || "?", d = p(
      c?.guild_id || a?.guild_id || t.guild_id || n?.guild_id
    ), T = p(
      a?.avatar || t.guild_avatar || t.avatar || (E(c?.member) ? c.member.avatar : void 0)
    ), N = p(r?.avatar), k = typeof t.speaking == "boolean" ? t.speaking : e?.speaking ?? !1;
    return {
      id: o,
      username: u,
      nick: h,
      mute: {
        user: m(t.mute),
        server: m(c?.mute) || m(t.server_mute),
        self: m(c?.self_mute) || m(t.self_mute)
      },
      deaf: {
        server: m(c?.deaf) || m(t.server_deaf),
        self: m(c?.self_deaf) || m(t.self_deaf)
      },
      speaking: k,
      isSelf: o === this.currentUserId(),
      serverAvatar: d && T ? W(`guilds/${d}/users/${o}/avatars`, T) : void 0,
      avatar: N ? W(`avatars/${o}`, N) : void 0,
      lastSpokeAt: k ? i : e?.lastSpokeAt ?? 0
    };
  }
  applySpeaking(t, e) {
    if (!t)
      return;
    const i = this.participants, n = i.findIndex((o) => o.id === t);
    if (n < 0 || i[n].speaking === e)
      return;
    const r = [...i];
    r[n] = {
      ...i[n],
      speaking: e,
      lastSpokeAt: e ? Date.now() : i[n].lastSpokeAt
    }, this.participants = r, this.updateParticipantElement(r[n]);
  }
  async toggleParticipantMute(t) {
    const e = this.client, i = this.participants.find((n) => n.id === t);
    if (!(!e || !i))
      try {
        await e.setUserVoiceSettings(t, { mute: !i.mute.user }), await this.refreshVoiceState();
      } catch (n) {
        this.disconnect(n, "Failed to update voice settings.", !0);
      }
  }
  render() {
    const {
      container: t,
      host: e,
      disconnectedView: i,
      participantsView: n,
      message: r,
      loginButton: o,
      icon: a,
      loaderIcon: c,
      discordIcon: h
    } = this.dom;
    if (!t || !e || !i || !n || !r || !o)
      return;
    const u = this.state(), d = this.participants.length > 0, T = this.shouldAutoHide();
    t.hidden = T, t.style.display = T ? "none" : "", this.ctx.mount.style.display = T ? "none" : "", e.className = `discord-ipc align-${this.config("alignment", "top-left")}`, i.hidden = d, i.style.display = d ? "none" : "", n.hidden = !d, n.style.display = d ? "" : "none", r.textContent = this.hasClientId() ? u.message : "No Discord Client ID provided. Please set a valid Client ID in the widget settings to use the Discord IPC widget.", o.hidden = !(this.hasClientId() && !u.isLoading && (u.authorizationRequired || u.retryAvailable)), o.textContent = u.authorizationRequired ? "Authorize Discord" : "Try Again", a?.classList.toggle("loader-active", u.isLoading), c && (c.hidden = !u.isLoading), h && (h.hidden = u.isLoading);
  }
  cacheDom() {
    this.dom.container = this.ctx.mount.querySelector('[data-role="discord-root"]'), this.dom.host = this.ctx.mount.querySelector('[data-role="discord-host"]'), this.dom.disconnectedView = this.ctx.mount.querySelector('[data-role="disconnected-view"]'), this.dom.participantsView = this.ctx.mount.querySelector('[data-role="participants-view"]'), this.dom.participantsList = this.ctx.mount.querySelector('[data-role="participants-list"]'), this.dom.message = this.ctx.mount.querySelector('[data-role="message"]'), this.dom.icon = this.ctx.mount.querySelector('[data-role="icon"]'), this.dom.loginButton = this.ctx.mount.querySelector("#login-btn"), this.dom.participantTemplate = this.ctx.mount.querySelector("#participant-template"), this.dom.loaderIcon = this.ctx.mount.querySelector('[data-role="loader-icon"]'), this.dom.discordIcon = this.ctx.mount.querySelector('[data-role="discord-icon"]');
  }
  reconcileParticipants() {
    const t = this.dom.participantsList;
    if (!t)
      return;
    const e = new Set(this.participants.map((i) => i.id));
    for (const [i, n] of this.participantElements)
      e.has(i) || (n.root.remove(), this.participantElements.delete(i), this.renderedParticipants.delete(i));
    this.participants.forEach((i, n) => {
      const r = this.participantElements.get(i.id) ?? this.createParticipantElement(i.id), o = this.renderedParticipants.get(i.id);
      (!o || !this.areParticipantsEqual([o], [i])) && this.updateParticipantElement(i);
      const a = t.children.item(n);
      a !== r.root && t.insertBefore(r.root, a ?? null);
    });
  }
  createParticipantElement(t) {
    if (!this.dom.participantTemplate)
      throw new Error("Participant template not found.");
    const i = this.dom.participantTemplate.content.cloneNode(!0).firstElementChild, n = {
      root: i,
      avatar: i.querySelector(".avatar"),
      avatarImage: i.querySelector(".avatar > img"),
      avatarFallback: i.querySelector(".avatar-fallback"),
      muteContainer: i.querySelector(".mute"),
      deafIcon: i.querySelector('[data-role="deaf-icon"]'),
      selfMuteIcon: i.querySelector('[data-role="self-mute-icon"]'),
      serverMuteIcon: i.querySelector('[data-role="server-mute-icon"]'),
      userMuteIcon: i.querySelector('[data-role="user-mute-icon"]'),
      nameWrapper: i.querySelector(".name-wrapper"),
      name: i.querySelector(".name")
    };
    return n.root.setAttribute("data-participant-id", t), this.participantElements.set(t, n), n;
  }
  updateParticipantElement(t) {
    const e = this.participantElements.get(t.id);
    if (!e)
      return;
    e.root.className = this.participantClasses(t), e.avatar.className = this.avatarClasses(t), e.root.setAttribute("data-participant-id", t.id);
    const i = this.participantAvatarUrl(t);
    i ? (e.avatarImage.hidden = !1, e.avatarImage.getAttribute("src") !== i && e.avatarImage.setAttribute("src", i), e.avatarImage.alt = t.username, e.avatarFallback.hidden = !0, e.avatarFallback.textContent = "") : (e.avatarImage.hidden = !0, e.avatarImage.removeAttribute("src"), e.avatarFallback.hidden = !1, e.avatarFallback.textContent = this.participantInitials(t));
    const n = t.deaf.self || t.deaf.server;
    e.deafIcon.hidden = !n, e.selfMuteIcon.hidden = n || !t.mute.self, e.serverMuteIcon.hidden = n || t.mute.self || !t.mute.server, e.userMuteIcon.hidden = n || t.mute.self || t.mute.server || !t.mute.user, e.muteContainer.hidden = !this.hasStatusIcon(t), e.nameWrapper.hidden = !this.showNames(), e.name.textContent = this.participantName(t), this.renderedParticipants.set(t.id, t);
  }
  clearParticipantElements() {
    for (const t of this.participantElements.values())
      t.root.remove();
    this.participantElements.clear(), this.renderedParticipants.clear();
  }
  startSpeakingWatchdog() {
    this.speakingWatchdog || (this.speakingWatchdog = setInterval(() => {
      const t = this.participants, e = Date.now();
      let i = !1;
      const n = t.map((r) => !r.speaking || e - r.lastSpokeAt <= Vt ? r : (i = !0, { ...r, speaking: !1 }));
      i && (this.participants = n, this.reconcileParticipants());
    }, Bt));
  }
  stopSpeakingWatchdog() {
    this.speakingWatchdog && (clearInterval(this.speakingWatchdog), this.speakingWatchdog = null);
  }
  startVoicePolling() {
    this.voicePollTimer || (this.voicePollTimer = setInterval(() => {
      !this.state().authenticated || this.state().authorizationRequired || this.refreshVoiceState();
    }, Mt));
  }
  stopVoicePolling() {
    this.voicePollTimer && (clearInterval(this.voicePollTimer), this.voicePollTimer = null);
  }
  disconnect(t, e, i) {
    this.reconnectAttempts += 1, this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.participants = [], this.clearParticipantElements(), this.patchState({
      authenticated: !1,
      participants: [],
      authorizationRequired: !1,
      retryAvailable: !0,
      hideableDisconnect: i,
      message: this.formatError(t, e)
    }), this.scheduleReconnect();
  }
  requireAuthorization(t) {
    this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.participants = [], this.clearParticipantElements(), this.patchState({
      authenticated: !1,
      participants: [],
      authorizationRequired: !0,
      retryAvailable: !1,
      hideableDisconnect: !1,
      message: t
    });
  }
  scheduleReconnect() {
    if (this.reconnectTimer || !this.state().clientId || this.state().authorizationRequired)
      return;
    const t = this.runId, e = Math.min(Gt * Math.max(1, this.reconnectAttempts), qt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null, !(t !== this.runId || this.state().authenticated || this.state().authorizationRequired) && this.syncSession("Reconnecting to Discord...");
    }, e);
  }
  cancelReconnect() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null);
  }
  async destroyClient() {
    const t = this.client;
    this.client = null, this.selectedChannelId = "", await this.clearSubscriptions(), t && await t.destroy().catch(() => {
    });
  }
  currentUserId() {
    const t = this.client?.user;
    return E(t) ? p(t.id) : "";
  }
  extractUserId(t) {
    return t ? p(t.user_id) ? p(t.user_id) : E(t.user) ? p(t.user.id) : "" : "";
  }
  showNames() {
    return !!this.config("showNames", !0);
  }
  participantClasses(t) {
    const e = ["participant"];
    return t.isSelf && e.push("self"), this.hasStatusIcon(t) && e.push("muted"), e.join(" ");
  }
  avatarClasses(t) {
    return t.speaking ? "avatar speaking" : "avatar";
  }
  participantAvatarUrl(t) {
    return t.serverAvatar || t.avatar || "";
  }
  participantInitials(t) {
    return this.initials(t.username);
  }
  participantName(t) {
    return t.nick || t.username;
  }
  hasStatusIcon(t) {
    return t.deaf.self || t.deaf.server || t.mute.self || t.mute.server || t.mute.user;
  }
  areParticipantsEqual(t, e) {
    if (t.length !== e.length)
      return !1;
    for (let i = 0; i < t.length; i += 1) {
      const n = t[i], r = e[i];
      if (n.id !== r.id || n.username !== r.username || n.nick !== r.nick || n.speaking !== r.speaking || n.isSelf !== r.isSelf || n.serverAvatar !== r.serverAvatar || n.avatar !== r.avatar || n.lastSpokeAt !== r.lastSpokeAt || n.deaf.server !== r.deaf.server || n.deaf.self !== r.deaf.self || n.mute.user !== r.mute.user || n.mute.server !== r.mute.server || n.mute.self !== r.mute.self)
        return !1;
    }
    return !0;
  }
  patchState(t) {
    this.state.update((e) => {
      for (const [i, n] of Object.entries(t))
        if (e[i] !== n)
          return { ...e, ...t };
      return e;
    });
  }
  setBusy(t, e) {
    this.state.update((i) => {
      const n = e ?? i.message;
      return i.isLoading === t && i.message === n ? i : {
        ...i,
        isLoading: t,
        message: n
      };
    });
  }
  beginRun() {
    return this.runId += 1, this.runId;
  }
  invalidateRun() {
    this.runId += 1, this.setBusy(!1);
  }
  isCurrentRun(t) {
    return this.runId === t;
  }
  config(t, e) {
    return (this.payload.config ?? {})[t] ?? e;
  }
  clientId() {
    return String(this.config("clientId", "")).trim();
  }
  hasClientId() {
    return this.state().clientId.length > 0;
  }
  shouldAutoHide() {
    if (!this.config("autoHide", !1) || !this.hasClientId())
      return !1;
    const t = this.state();
    return t.authorizationRequired || t.retryAvailable && !t.hideableDisconnect ? !1 : this.participants.length === 0;
  }
  readStoredToken(t) {
    const e = localStorage.getItem(`${w}${t}`);
    if (!e)
      return null;
    try {
      const i = JSON.parse(e), n = p(i.accessToken), r = p(i.refreshToken) || void 0;
      return n ? { accessToken: n, refreshToken: r } : null;
    } catch {
      return null;
    }
  }
  persistClientTokens(t, e) {
    const i = p(e.accessToken);
    i && this.persistToken(t, {
      accessToken: i,
      refreshToken: p(e.refreshToken) || void 0
    });
  }
  persistToken(t, e) {
    localStorage.setItem(`${w}${t}`, JSON.stringify(e));
  }
  clearStoredToken(t) {
    localStorage.removeItem(`${w}${t}`);
  }
  shouldInvalidateToken(t) {
    const e = this.formatError(t, "").toLowerCase();
    return e.includes("invalid oauth2 access token") || e.includes("authenticate: invalid") || e.includes("authenticate") && e.includes("401") || e.includes("unauthorized") || e.includes("invalid_grant");
  }
  async isDiscordRunning() {
    return (await Promise.all(
      Ht().map((e) => z(e).catch(() => !1))
    )).some(Boolean);
  }
  formatError(t, e) {
    const i = t ? t instanceof Error || E(t) && typeof t.message == "string" ? t.message || e : String(t || e) : e;
    return i.toLowerCase().includes("ipc endpoint is not available") ? `Discord not running
(No IPC)` : i;
  }
  initials(t) {
    const e = t.split(/\s+/).map((i) => i.trim()).filter(Boolean);
    return e.length === 0 ? "?" : e.slice(0, 2).map((i) => i[0]?.toUpperCase() ?? "").join("") || "?";
  }
};
const $t = `<div class="discord-ipc-wrapper" data-role="discord-root" data-assets-base="{{ASSETS}}">
  <div class="discord-ipc" data-role="discord-host">
    <div class="participants-view" data-role="participants-view">
      <div class="participants" data-role="participants-list"></div>
      <template id="participant-template">
        <div class="participant" data-participant-id="">
          <div class="avatar">
            <img alt="" loading="lazy" decoding="async" hidden />
            <div class="avatar-fallback"></div>
            <div class="mute">
              <img src="{{ASSETS}}/img/deafened.png" class="invert" alt="" data-role="deaf-icon" hidden />
              <img src="{{ASSETS}}/img/mic-selfmuted.png" class="invert" alt="" data-role="self-mute-icon" hidden />
              <img src="{{ASSETS}}/img/mic-servermuted.png" alt="" data-role="server-mute-icon" hidden />
              <img src="{{ASSETS}}/img/mic-muted.png" class="invert" alt="" data-role="user-mute-icon" hidden />
            </div>
          </div>
          <div class="name-wrapper">
            <div class="name"></div>
          </div>
        </div>
      </template>
    </div>

    <div class="disconnected-view" data-role="disconnected-view" hidden>
      <div class="icon" data-role="icon">
        <img src="{{ASSETS}}/img/loader.gif" alt="Loading" data-role="loader-icon" hidden />
        <img src="{{ASSETS}}/img/discord.png" class="invert" alt="Discord" data-role="discord-icon" />
      </div>
      <div class="message" data-role="message"></div>
      <button id="login-btn" type="button" class="connect-button">Authorize Discord</button>
    </div>
  </div>
</div>
`, Yt = "img.invert{--filters: invert(100%) }.discord-ipc-wrapper{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden}.discord-ipc{display:flex;width:100%;height:100%;flex-direction:column}.discord-ipc.align-bottom-left .participants{justify-content:flex-start;align-items:flex-end}.discord-ipc.align-bottom-right .participants{justify-content:flex-end;align-items:flex-end}.discord-ipc.align-top-left .participants{justify-content:flex-start;align-items:flex-start}.discord-ipc.align-top-right .participants{justify-content:flex-end;align-items:flex-start}.participants-view{width:100%;height:100%}.participants{min-height:0;overflow:hidden;display:flex;flex-wrap:wrap;flex-direction:row;height:100%;width:100%;gap:.5em}.participant{position:relative;display:flex;flex-direction:column;align-items:center;overflow:hidden;aspect-ratio:1/1;transform:scale(.7);opacity:0;animation:popIn var(--transition) forwards;animation-delay:var(--animation-delay);width:var(--cell-width);height:var(--cell-height)}.participant.muted .avatar>img{filter:grayscale(100%) brightness(50%)}.participant.muted .avatar .mute{display:flex;opacity:1;visibility:visible;padding:.5em}.participant.muted .avatar .mute img{flex:1 1 25%;max-width:100%;filter:var(--filters) drop-shadow(1px 1px .25em rgba(0,0,0,.5))}.avatar{position:relative;width:min(var(--cell-width) * .75,var(--cell-height) * .75);height:auto;aspect-ratio:1/1;max-width:75%;max-height:75%;flex:0 0 auto;background:#ffffff1f;border:max(.15em,5px) solid transparent;border-radius:.25em;transition:border-color var(--transition)}.avatar>img{width:100%;height:100%;object-fit:cover;display:block;border-radius:.25em;transition:filter var(--transition)}.avatar.speaking{border-color:#70e070}.avatar-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.7em;font-weight:700;letter-spacing:.04em;color:#ffffffe6}.mute{display:flex;position:absolute;inset:0;font-size:calc(var(--host-width) / 15);justify-content:center;align-items:center;opacity:0;visibility:hidden;transition:opacity var(--transition),visibility var(--transition)}.name-wrapper{left:0;bottom:0;max-height:25%;font-size:clamp(8px,4.5cqw,22px);width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 .15em}.name{display:block;padding:0 .25em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}.disconnected-view{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:.65em}.icon img{width:3em;filter:var(--filters)}.message{text-transform:uppercase;line-height:1.3}.connect-button{border:0;border-radius:.35em;padding:.35em .6em;background:#ffffff2e;color:inherit;font-size:1.2em;text-transform:uppercase;transition:opacity var(--transition)}@keyframes popIn{0%{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}", j = It(zt, { template: $t, styles: Yt }), Kt = j, Jt = { DisplayDuckWidget: j, Widget: Kt };
export {
  j as DisplayDuckWidget,
  Kt as Widget,
  Jt as default
};
