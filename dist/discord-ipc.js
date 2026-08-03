const B = /* @__PURE__ */ new Map(), ct = (n) => String(n ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"), lt = (n) => {
  const t = B.get(n);
  if (t)
    return t;
  const e = n.replace(/\bthis\b/g, "__item"), i = new Function("scope", `with (scope) { return (${e}); }`);
  return B.set(n, i), i;
}, D = (n, t) => {
  try {
    return lt(n)(t);
  } catch {
    return "";
  }
}, U = (n, t = 0, e) => {
  const i = [];
  let s = t;
  for (; s < n.length; ) {
    const r = n.indexOf("{{", s);
    if (r === -1)
      return i.push({ type: "text", value: n.slice(s) }), { nodes: i, index: n.length };
    r > s && i.push({ type: "text", value: n.slice(s, r) });
    const o = n.indexOf("}}", r + 2);
    if (o === -1)
      return i.push({ type: "text", value: n.slice(r) }), { nodes: i, index: n.length };
    const c = n.slice(r + 2, o).trim();
    if (s = o + 2, c === "/if" || c === "/each") {
      if (e === c)
        return { nodes: i, index: s };
      i.push({ type: "text", value: `{{${c}}}` });
      continue;
    }
    if (c.startsWith("#if ")) {
      const a = U(n, s, "/if");
      i.push({
        type: "if",
        condition: c.slice(4).trim(),
        children: a.nodes
      }), s = a.index;
      continue;
    }
    if (c.startsWith("#each ")) {
      const a = U(n, s, "/each");
      i.push({
        type: "each",
        source: c.slice(6).trim(),
        children: a.nodes
      }), s = a.index;
      continue;
    }
    i.push({ type: "expr", value: c });
  }
  return { nodes: i, index: s };
}, x = (n, t) => {
  let e = "";
  for (const i of n) {
    if (i.type === "text") {
      e += i.value;
      continue;
    }
    if (i.type === "expr") {
      e += ct(D(i.value, t));
      continue;
    }
    if (i.type === "if") {
      D(i.condition, t) && (e += x(i.children, t));
      continue;
    }
    const s = D(i.source, t);
    if (Array.isArray(s))
      for (const r of s) {
        const o = Object.create(t);
        o.__item = r, e += x(i.children, o);
      }
  }
  return e;
}, ht = (n) => {
  const t = U(n).nodes;
  return (e) => x(t, e);
};
function dt(n, t = !1) {
  return window.__TAURI_INTERNALS__.transformCallback(n, t);
}
async function E(n, t = {}, e) {
  return window.__TAURI_INTERNALS__.invoke(n, t, e);
}
function tt(n, t = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(n, t);
}
var G;
(function(n) {
  n.WINDOW_RESIZED = "tauri://resize", n.WINDOW_MOVED = "tauri://move", n.WINDOW_CLOSE_REQUESTED = "tauri://close-requested", n.WINDOW_DESTROYED = "tauri://destroyed", n.WINDOW_FOCUS = "tauri://focus", n.WINDOW_BLUR = "tauri://blur", n.WINDOW_SCALE_FACTOR_CHANGED = "tauri://scale-change", n.WINDOW_THEME_CHANGED = "tauri://theme-changed", n.WINDOW_CREATED = "tauri://window-created", n.WEBVIEW_CREATED = "tauri://webview-created", n.DRAG_ENTER = "tauri://drag-enter", n.DRAG_OVER = "tauri://drag-over", n.DRAG_DROP = "tauri://drag-drop", n.DRAG_LEAVE = "tauri://drag-leave";
})(G || (G = {}));
async function ut(n, t) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(n, t), await E("plugin:event|unlisten", {
    event: n,
    eventId: t
  });
}
async function S(n, t, e) {
  var i;
  const s = (i = void 0) !== null && i !== void 0 ? i : { kind: "Any" };
  return E("plugin:event|listen", {
    event: n,
    target: s,
    handler: dt(t)
  }).then((r) => async () => ut(n, r));
}
const ft = "pack-tcp-socket-open", pt = "pack-tcp-socket-data", Et = "pack-tcp-socket-close", gt = 5e3, mt = (n) => {
  let t = "";
  for (let e = 0; e < n.length; e += 1)
    t += String.fromCharCode(n[e]);
  return btoa(t);
}, Tt = (n) => {
  const t = atob(n), e = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i += 1)
    e[i] = t.charCodeAt(i);
  return e;
}, _t = (n) => n instanceof Uint8Array ? n : n instanceof ArrayBuffer ? new Uint8Array(n) : Uint8Array.from(n), St = () => typeof crypto < "u" && typeof crypto.randomUUID == "function" ? crypto.randomUUID() : `tcp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
class It {
  constructor(t, e) {
    this.hasLocalhostAccess = e, this.isConnected = !1, this.connecting = null, this.tauriListenersReady = null, this.tauriUnlisteners = [], this.listeners = {
      open: /* @__PURE__ */ new Set(),
      data: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set(),
      error: /* @__PURE__ */ new Set()
    }, this.host = String(t.host ?? "").trim(), this.port = Number(t.port), this.sessionId = St();
  }
  get connected() {
    return this.isConnected;
  }
  async connect() {
    if (!this.hasLocalhostAccess)
      throw new Error("TCP socket access requires the Allow localhost access permission.");
    if (!this.isConnected) {
      if (this.connecting)
        return this.connecting;
      if (!this.host || !Number.isInteger(this.port) || this.port < 1 || this.port > 65535)
        throw new Error("A valid TCP socket host and port are required.");
      this.connecting = this.connectInternal();
      try {
        await this.connecting;
      } finally {
        this.connecting = null;
      }
    }
  }
  async send(t) {
    if (!this.isConnected)
      throw new Error("TCP socket is not connected.");
    await E("pack_tcp_socket_write", {
      sessionId: this.sessionId,
      dataBase64: mt(_t(t)),
      allowLocalhostAccess: this.hasLocalhostAccess
    });
  }
  async write(t) {
    await this.send(t);
  }
  async close() {
    try {
      await E("pack_tcp_socket_disconnect", { sessionId: this.sessionId });
    } finally {
      this.isConnected = !1, this.teardownTauriListeners();
    }
  }
  on(t, e) {
    return this.listeners[t].add(e), () => this.listeners[t].delete(e);
  }
  async connectInternal() {
    await this.ensureTauriListeners(), await new Promise(async (t, e) => {
      let i = !1;
      const s = setTimeout(() => {
        i || (i = !0, c(), e(new Error(`TCP socket connection timed out for ${this.host}:${this.port}`)));
      }, gt), r = this.on("open", () => {
        i || (i = !0, c(), t());
      }), o = this.on("close", (a) => {
        i || (i = !0, c(), e(new Error(a.error ?? "TCP socket closed before opening.")));
      }), c = () => {
        clearTimeout(s), r(), o();
      };
      try {
        await E("pack_tcp_socket_connect", {
          sessionId: this.sessionId,
          host: this.host,
          port: this.port,
          allowLocalhostAccess: this.hasLocalhostAccess
        });
      } catch (a) {
        if (i) return;
        i = !0, c(), e(a);
      }
    });
  }
  async ensureTauriListeners() {
    return this.tauriListenersReady ? this.tauriListenersReady : (this.tauriListenersReady = (async () => {
      this.tauriUnlisteners = [
        await S(ft, (t) => {
          t.payload.sessionId === this.sessionId && (this.isConnected = !0, this.emit("open", {
            host: this.host,
            port: this.port
          }));
        }),
        await S(pt, (t) => {
          if (t.payload.sessionId === this.sessionId)
            try {
              this.emit("data", Tt(t.payload.dataBase64));
            } catch (e) {
              this.emit("error", {
                host: this.host,
                port: this.port,
                error: e instanceof Error ? e.message : "Invalid TCP socket data."
              });
            }
        }),
        await S(Et, (t) => {
          t.payload.sessionId === this.sessionId && (this.isConnected = !1, t.payload.error && this.emit("error", {
            host: this.host,
            port: this.port,
            error: t.payload.error
          }), this.emit("close", {
            host: this.host,
            port: this.port,
            error: t.payload.error
          }));
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
const yt = "pack-ipc-transport-open", Ct = "pack-ipc-transport-data", At = "pack-ipc-transport-close", wt = 5e3, W = (n) => {
  let t = "";
  for (let e = 0; e < n.length; e += 1)
    t += String.fromCharCode(n[e]);
  return btoa(t);
}, bt = (n) => {
  const t = atob(n), e = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i += 1)
    e[i] = t.charCodeAt(i);
  return e;
}, q = (n) => n instanceof Uint8Array ? n : n instanceof ArrayBuffer ? new Uint8Array(n) : Uint8Array.from(n), Rt = (n, t) => {
  let e = 2166136261;
  for (const i of `${n}\0${t}`)
    e ^= i.charCodeAt(0), e = Math.imul(e, 16777619);
  return `ipc-${(e >>> 0).toString(16)}`;
}, w = (n, t) => `[IpcTransport session=${n} endpoint=${t}]`, kt = (n) => {
  if (!n)
    return "";
  if (typeof n == "string")
    return n.trim().toLowerCase();
  if (n instanceof Error)
    return n.message.trim().toLowerCase();
  if (typeof n == "object" && n && "error" in n) {
    const t = n.error;
    return typeof t == "string" ? t.trim().toLowerCase() : "";
  }
  return String(n).trim().toLowerCase();
}, L = (n) => {
  const t = kt(n);
  return t.includes("no such file or directory") || t.includes("os error 2") || t.includes("endpoint is not available") || t.includes("not found");
};
class vt {
  constructor(t) {
    this.connected = !1, this.listeners = {
      open: /* @__PURE__ */ new Set(),
      data: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set()
    }, this.tauriListenersReady = null, this.tauriUnlisteners = [], this.endpoint = String(t.endpoint ?? "").trim();
    const e = String(t.scope ?? "default").trim() || "default";
    this.sessionId = String(t.sessionId ?? "").trim() || Rt(e, this.endpoint), this.allowLocalhostAccess = t.allowLocalhostAccess === !0;
  }
  async connect() {
    return this.connectWithInitialWrite();
  }
  async connectWithInitialWrite(t) {
    if (!this.endpoint)
      throw new Error("Missing IPC endpoint.");
    return await this.ensureTauriListeners(), new Promise(async (e, i) => {
      let s = !1;
      const r = setTimeout(() => {
        s || (s = !0, a(), i(new Error(`IPC connect timed out for endpoint ${this.endpoint}`)));
      }, wt), o = this.on("open", () => {
        s || (s = !0, a(), e(!1));
      }), c = this.on("close", (d) => {
        s || (s = !0, a(), L(d.error) || console.error(
          `${w(this.sessionId, this.endpoint)} connect close-before-open error=${d.error ?? "<none>"}`
        ), i(new Error(d.error ?? `IPC transport closed for endpoint ${this.endpoint}`)));
      }), a = () => {
        clearTimeout(r), o(), c();
      };
      try {
        const d = await E("pack_ipc_transport_connect", {
          sessionId: this.sessionId,
          endpoint: this.endpoint,
          initialDataBase64: t ? W(q(t)) : null,
          allowLocalhostAccess: this.allowLocalhostAccess
        });
        !s && d === !0 && (s = !0, a(), this.connected = !0, this.emit("open", {
          sessionId: this.sessionId,
          endpoint: this.endpoint
        }), e(!0));
      } catch (d) {
        if (s)
          return;
        s = !0, a(), L(d) || console.error(`${w(this.sessionId, this.endpoint)} invoke connect failed`, d), i(d);
      }
    });
  }
  async write(t) {
    const e = q(t);
    try {
      await E("pack_ipc_transport_write", {
        sessionId: this.sessionId,
        dataBase64: W(e),
        allowLocalhostAccess: this.allowLocalhostAccess
      });
    } catch (i) {
      this.connected = !1;
      const s = i instanceof Error ? i.message : typeof i == "string" ? i : "IPC transport write failed";
      throw console.error(`${w(this.sessionId, this.endpoint)} write failed error=${s}`, i), this.emit("close", {
        sessionId: this.sessionId,
        endpoint: this.endpoint,
        error: s
      }), i;
    }
  }
  async send(t) {
    await this.write(t);
  }
  async close() {
    try {
      await E("pack_ipc_transport_disconnect", {
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
        await S(yt, (t) => {
          const e = t.payload;
          e.sessionId === this.sessionId && (this.connected = !0, this.emit("open", e));
        }),
        await S(Ct, (t) => {
          const e = t.payload;
          e.sessionId === this.sessionId && this.emit("data", bt(e.dataBase64));
        }),
        await S(At, (t) => {
          const e = t.payload;
          e.sessionId === this.sessionId && (this.connected = !1, L(e.error) || console.error(`${w(this.sessionId, this.endpoint)} event close`, e), this.emit("close", e));
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
const et = async (n, t = !1) => {
  const e = String(n ?? "").trim();
  return e ? E("pack_ipc_transport_endpoint_exists", {
    endpoint: e,
    allowLocalhostAccess: t
  }) : !1;
}, Ot = (n) => {
  if (typeof n != "function")
    return !1;
  const t = n;
  return t._isSignal === !0 && typeof t.set == "function" && typeof t.subscribe == "function";
}, $ = (n) => {
  let t = n;
  const e = /* @__PURE__ */ new Set(), i = (() => t);
  return i._isSignal = !0, i.set = (s) => {
    if (!Object.is(t, s)) {
      t = s;
      for (const r of e)
        r(t);
    }
  }, i.update = (s) => {
    i.set(s(t));
  }, i.subscribe = (s) => (e.add(s), () => e.delete(s)), i;
}, Dt = (n, t = "") => E("controller_widget_focus_view", {
  configuredWidgetId: n,
  requestId: t
}), Lt = async (n, t) => {
  const e = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let i = null, s = null;
  const r = new Promise((o) => {
    s = o;
  });
  try {
    return i = await S(
      "displayduck-widget-focus-state-response",
      (o) => {
        o.payload.requestId !== e || o.payload.configuredWidgetId !== n || s?.(o.payload.focused === !0);
      }
    ), await E("controller_widget_get_focus_state", {
      configuredWidgetId: n,
      focusRequestId: t,
      requestId: e
    }), await Promise.race([
      r,
      new Promise((o) => setTimeout(() => o(!1), 1e3))
    ]);
  } finally {
    i?.();
  }
}, Nt = (n, t, e) => E("controller_widget_set_focus_requirement", {
  configuredWidgetId: n,
  required: t,
  requestId: e
}), Pt = (n, t) => {
  const e = [];
  for (const i of Object.keys(n)) {
    const s = n[i];
    Ot(s) && e.push(s.subscribe(() => t()));
  }
  return () => {
    for (const i of e)
      i();
  };
}, Ut = (n, t) => new Proxy(
  { payload: t },
  {
    get(e, i) {
      if (typeof i != "string")
        return;
      if (i in e)
        return e[i];
      const s = n[i];
      return typeof s == "function" ? s.bind(n) : s;
    },
    has(e, i) {
      return typeof i != "string" ? !1 : i in e || i in n;
    }
  }
), xt = ["src", "href", "poster"], Vt = "{{pack-install-path}}/", z = "{{ASSETS}}", Mt = (n) => {
  const t = n.trim();
  return t.length === 0 || t.startsWith("data:") || t.startsWith("blob:") || t.startsWith("http://") || t.startsWith("https://") || t.startsWith("file:") || t.startsWith("asset:") || t.startsWith("mailto:") || t.startsWith("tel:") || t.startsWith("javascript:") || t.startsWith("//") || t.startsWith("/") || t.startsWith("#");
}, Bt = (n) => {
  const t = n.trim();
  if (!t)
    return null;
  if (!Mt(t))
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
}, Gt = (n, t) => {
  const e = n.replaceAll("\\", "/").replace(/\/+$/, ""), i = `${e}/${t.trim()}`, s = i.split("/"), r = [];
  for (const o of s) {
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
}, k = (n, t) => {
  const e = Bt(t);
  if (!n || !e)
    return t;
  try {
    return tt(Gt(n, e));
  } catch {
    return t;
  }
}, Wt = (n) => {
  const t = n.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!t)
    return "";
  try {
    return tt(t);
  } catch {
    return t;
  }
}, qt = (n, t) => n.split(",").map((e) => {
  const i = e.trim();
  if (!i)
    return i;
  const [s, r] = i.split(/\s+/, 2), o = k(t, s);
  return r ? `${o} ${r}` : o;
}).join(", "), $t = (n, t) => n.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (e, i, s) => {
  const r = k(t, s);
  return r === s ? e : `url("${r}")`;
}), V = (n, t) => {
  for (const s of xt) {
    const r = n.getAttribute(s);
    if (!r)
      continue;
    const o = k(t, r);
    o !== r && n.setAttribute(s, o);
  }
  const e = n.getAttribute("srcset");
  if (e) {
    const s = qt(e, t);
    s !== e && n.setAttribute("srcset", s);
  }
  const i = n.getAttribute("style");
  if (i) {
    const s = $t(i, t);
    s !== i && n.setAttribute("style", s);
  }
}, H = (n, t) => {
  if (t) {
    n instanceof Element && V(n, t);
    for (const e of Array.from(n.querySelectorAll("*")))
      V(e, t);
  }
}, Y = (n, t) => {
  if (!t)
    return n;
  let e = n;
  const i = Wt(t);
  return i && e.includes(z) && (e = e.replaceAll(z, i)), e.includes(Vt) ? e.replace(/\{\{pack-install-path\}\}\/([^"')\s]+)/g, (s, r) => k(t, r)) : e;
}, zt = (n) => {
  const t = /@font-face\s*\{[^{}]*\}/gi, e = n.match(t)?.join(`
`) ?? "";
  return {
    scopedStyles: e ? n.replace(t, "") : n,
    fontStyles: e
  };
}, Ht = (n, t) => class {
  constructor({
    mount: i,
    payload: s,
    setLoading: r
  }) {
    this.cleanups = [], this.hasRendered = !1, this.renderScheduled = !1, this.destroyed = !1, this.globalFontStyle = null, this.focusRequestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, this.widgetDirectory = "", this.mount = i, this.payload = s ?? {}, this.setLoading = typeof r == "function" ? r : (() => {
    }), this.assetObserver = new MutationObserver((o) => {
      if (this.widgetDirectory)
        for (const c of o) {
          if (c.type === "attributes" && c.target instanceof Element) {
            V(c.target, this.widgetDirectory);
            continue;
          }
          for (const a of Array.from(c.addedNodes))
            a instanceof Element && H(a, this.widgetDirectory);
        }
    }), this.logic = new n({
      mount: i,
      payload: this.payload,
      setLoading: (o) => this.setLoading(!!o),
      focusWidgetView: () => Dt(
        String(this.payload?.configuredWidgetId ?? "").trim(),
        this.focusRequestId
      ),
      isWidgetViewFocused: () => Lt(
        String(this.payload?.configuredWidgetId ?? "").trim(),
        this.focusRequestId
      ),
      setRequireFocus: (o) => Nt(
        String(this.payload?.configuredWidgetId ?? "").trim(),
        !!o,
        this.focusRequestId
      ),
      createTcpSocket: (o) => new It(
        o,
        this.hasLocalhostAccessPermission()
      ),
      on: (o, c, a) => this.on(o, c, a)
    }), this.cleanupSignalSubscriptions = Pt(this.logic, () => this.scheduleRender()), this.assetObserver.observe(this.mount, {
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
    for (this.destroyed = !0, this.renderScheduled = !1, this.globalFontStyle?.remove(), this.globalFontStyle = null, this.cleanupSignalSubscriptions(); this.cleanups.length > 0; )
      this.cleanups.pop()?.();
    this.assetObserver.disconnect(), this.logic.onDestroy?.(), this.mount.innerHTML = "", this.hasRendered = !1;
  }
  hasLocalhostAccessPermission() {
    const i = this.payload?.config;
    return !!(i && typeof i == "object" && i.allowEventAccess === !0);
  }
  render() {
    this.renderScheduled = !1;
    const i = Ut(this.logic, this.payload);
    this.widgetDirectory = String(
      this.payload?.widgetDirectory ?? this.payload?.directory ?? ""
    ).trim();
    const s = Y(t.template, this.widgetDirectory), r = Y(t.styles, this.widgetDirectory), { scopedStyles: o, fontStyles: c } = zt(r);
    this.syncGlobalFontStyle(c);
    const d = ht(s)(i), u = `<style>${o}</style>${d}`;
    this.hasRendered ? this.reconcileMarkup(u) : (this.mount.innerHTML = u, this.hasRendered = !0), this.mount.setAttribute("data-displayduck-render-empty", d.trim().length === 0 ? "true" : "false"), H(this.mount, this.widgetDirectory), this.logic.afterRender?.();
  }
  syncGlobalFontStyle(i) {
    if (!i) {
      this.globalFontStyle?.remove(), this.globalFontStyle = null;
      return;
    }
    this.globalFontStyle || (this.globalFontStyle = this.mount.ownerDocument.createElement("style"), this.globalFontStyle.dataset.displayduckPackFonts = "true", this.mount.ownerDocument.head.appendChild(this.globalFontStyle)), this.globalFontStyle.textContent !== i && (this.globalFontStyle.textContent = i);
  }
  scheduleRender() {
    this.renderScheduled || this.destroyed || (this.renderScheduled = !0, queueMicrotask(() => {
      !this.destroyed && this.renderScheduled && this.render();
    }));
  }
  reconcileMarkup(i) {
    const s = document.createElement("div");
    s.innerHTML = i, this.reconcileChildren(this.mount, s);
  }
  reconcileChildren(i, s) {
    const r = Array.from(i.childNodes), o = Array.from(s.childNodes), c = Math.min(r.length, o.length);
    for (let a = 0; a < c; a += 1)
      this.reconcileNode(r[a], o[a]);
    for (let a = c; a < o.length; a += 1)
      i.appendChild(o[a].cloneNode(!0));
    for (let a = r.length - 1; a >= o.length; a -= 1)
      r[a].remove();
  }
  reconcileNode(i, s) {
    if (i.nodeType !== s.nodeType) {
      i.replaceWith(s.cloneNode(!0));
      return;
    }
    if (i.nodeType === Node.TEXT_NODE) {
      i.nodeValue !== s.nodeValue && (i.nodeValue = s.nodeValue);
      return;
    }
    if (!(!(i instanceof Element) || !(s instanceof Element))) {
      if (i.tagName !== s.tagName) {
        i.replaceWith(s.cloneNode(!0));
        return;
      }
      for (const r of Array.from(i.attributes))
        s.hasAttribute(r.name) || i.removeAttribute(r.name);
      for (const r of Array.from(s.attributes))
        i.getAttribute(r.name) !== r.value && i.setAttribute(r.name, r.value);
      this.reconcileChildren(i, s);
    }
  }
  on(i, s, r) {
    const o = (a) => {
      const u = a.target?.closest(s);
      !u || !this.mount.contains(u) || r(a, u);
    };
    this.mount.addEventListener(i, o);
    const c = () => this.mount.removeEventListener(i, o);
    return this.cleanups.push(c), c;
  }
};
class it {
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
    const s = i.filter((r) => r.listener !== e);
    return s.length > 0 ? this.listenersMap.set(t, s) : this.listenersMap.delete(t), this;
  }
  removeAllListeners(t) {
    return t === void 0 ? (this.listenersMap.clear(), this) : (this.listenersMap.delete(t), this);
  }
  emit(t, ...e) {
    const i = this.listenersMap.get(t);
    if (!i?.length)
      return !1;
    const s = [...i];
    for (const r of s)
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
const nt = () => {
  if (typeof crypto < "u" && typeof crypto.randomUUID == "function")
    return crypto.randomUUID();
  let n = "";
  for (let t = 0; t < 32; t += 1) {
    (t === 8 || t === 12 || t === 16 || t === 20) && (n += "-");
    let e;
    if (t === 12)
      e = 4;
    else {
      const i = Math.random() * 16 | 0;
      e = t === 16 ? i & 3 | 8 : i;
    }
    n += e.toString(16);
  }
  return n;
}, _ = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4
}, F = 3, Yt = 250, Ft = 15e3;
let I = null, y = null;
const Kt = new TextEncoder(), jt = new TextDecoder(), Jt = () => (globalThis.navigator?.platform ?? "").toLowerCase().includes("win") ? "win32" : "unix", st = (n) => {
  const t = Array.isArray(n.options?.ipcEndpoints) ? n.options.ipcEndpoints.filter((s) => typeof s == "string" && s.trim().length > 0) : [];
  if (t.length > 0)
    return t;
  const e = Jt(), i = [];
  for (const s of ["discord-ipc", "discord-canary-ipc", "discord-ptb-ipc"])
    for (let r = 0; r < 10; r++)
      e === "win32" ? i.push(`\\\\.\\pipe\\${s}-${r}`) : i.push(`/tmp/${s}-${r}`);
  return i;
}, Qt = (n) => Array.isArray(n.options?.ipcEndpoints) && n.options.ipcEndpoints.some((t) => typeof t == "string" && t.trim().length > 0), Xt = async (n) => {
  const t = st(n), e = t.join("\0");
  if (I && I.key === e && I.expiresAt > Date.now())
    return I.endpoints;
  if (y?.key === e)
    return y.promise;
  const i = Promise.all(
    t.map(async (s) => ({
      endpoint: s,
      exists: await et(s).catch(() => !1)
    }))
  ).then((s) => {
    const r = s.filter((o) => o.exists).map((o) => o.endpoint);
    return I = {
      key: e,
      endpoints: r,
      expiresAt: Date.now() + Ft
    }, r;
  }).finally(() => {
    y?.key === e && (y = null);
  });
  return y = { key: e, promise: i }, i;
}, Zt = (n, t) => {
  let e = 2166136261;
  for (const i of `discord:${n ?? ""}\0${t}`)
    e ^= i.charCodeAt(0), e = Math.imul(e, 16777619);
  return `displayduck-discord-ipc-${(e >>> 0).toString(16)}`;
}, te = (n, t) => {
  const e = new Uint8Array(n.length + t.length);
  return e.set(n, 0), e.set(t, n.length), e;
}, ee = (n) => new Promise((t) => {
  setTimeout(t, n);
}), K = (n) => {
  if (n instanceof Error)
    return n;
  if (n && typeof n == "object") {
    const t = n, e = String(t.message ?? "").trim(), i = typeof t.code == "number" || typeof t.code == "string" ? String(t.code).trim() : "";
    if (e || i) {
      const s = new Error(
        [e, i ? `(code ${i})` : ""].filter(Boolean).join(" ")
      );
      return i && (s.code = i), s;
    }
  }
  return new Error(String(n ?? "connection closed"));
}, j = (n, t) => {
  const e = Kt.encode(JSON.stringify(t)), i = new Uint8Array(8 + e.length), s = new DataView(i.buffer);
  return s.setInt32(0, n, !0), s.setInt32(4, e.length, !0), i.set(e, 8), i;
};
class ie extends it {
  constructor(t) {
    super(), this.socket = null, this.buffer = new Uint8Array(0), this.connectPromise = null, this.connectionGeneration = 0, this.client = t;
  }
  async connect() {
    if (this.socket)
      return !1;
    if (this.connectPromise)
      return this.connectPromise;
    const t = this.connectionGeneration;
    return this.connectPromise = this.connectInternal(t).finally(() => {
      this.connectPromise = null;
    }), this.connectPromise;
  }
  send(t, e = _.FRAME) {
    if (!this.socket)
      throw new Error("IPC transport is not connected");
    const i = this.socket;
    i.write(j(e, t)).catch((s) => {
      this.socket === i && (this.socket = null), this.emit("close", s instanceof Error ? s : new Error(String(s)));
    });
  }
  async close() {
    if (this.connectionGeneration += 1, this.connectPromise = null, !this.socket) {
      this.buffer = new Uint8Array(0);
      return;
    }
    const t = this.socket;
    this.socket = null, this.buffer = new Uint8Array(0), await t.close();
  }
  ping() {
    this.send(nt(), _.PING);
  }
  decode(t) {
    for (this.buffer = te(this.buffer, t); this.buffer.length >= 8; ) {
      const e = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength), i = e.getInt32(0, !0), r = 8 + e.getInt32(4, !0);
      if (this.buffer.length < r)
        return;
      const o = this.buffer.slice(8, r);
      this.buffer = this.buffer.slice(r);
      let c = null;
      try {
        c = JSON.parse(jt.decode(o));
      } catch {
        continue;
      }
      if (i === _.PING) {
        this.send(c, _.PONG);
        continue;
      }
      if (i === _.FRAME) {
        if (!c || typeof c != "object")
          continue;
        this.emit("message", c);
        continue;
      }
      i === _.CLOSE && this.emit("close", K(c));
    }
  }
  async connectInternal(t) {
    this.buffer = new Uint8Array(0);
    const e = st(this.client), i = await Xt(this.client);
    if (t !== this.connectionGeneration)
      throw new Error("Discord IPC connection was cancelled.");
    const s = i.length > 0 ? i : Qt(this.client) ? e : [];
    let r = null;
    if (s.length === 0)
      throw new Error("Discord IPC endpoint is not available.");
    for (let o = 0; o < F; o += 1) {
      for (const c of s) {
        const a = new vt({
          endpoint: c,
          sessionId: Zt(this.client.clientId, c)
        }), d = a.on("open", () => {
          this.emit("open");
        }), u = a.on("data", (l) => {
          this.decode(l);
        }), T = a.on("close", (l) => {
          this.socket === a && (this.socket = null), this.buffer = new Uint8Array(0), this.emit("close", l.error ? new Error(l.error) : K(l));
        });
        try {
          const l = await a.connectWithInitialWrite(
            j(_.HANDSHAKE, {
              v: 1,
              client_id: this.client.clientId
            })
          );
          if (t !== this.connectionGeneration)
            throw await a.close().catch(() => {
            }), new Error("Discord IPC connection was cancelled.");
          return this.socket = a, l;
        } catch (l) {
          d(), u(), T(), await a.close().catch(() => {
          }), r = l;
        }
      }
      o < F - 1 && await ee(Yt * (o + 1));
    }
    throw i.length > 0 ? r instanceof Error ? r : new Error("Discord IPC endpoint is available, but the connection did not complete.") : r instanceof Error ? r : new Error("Could not connect");
  }
}
const rt = (n) => {
  const t = {};
  for (const e of n)
    t[e] = e;
  return t;
}, h = rt([
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
]), f = rt([
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
]), ne = {
  NONE: 0,
  FRIEND: 1,
  BLOCKED: 2,
  PENDING_INCOMING: 3,
  PENDING_OUTGOING: 4,
  IMPLICIT: 5
}, se = 8e3, J = (n, t) => `${n}${JSON.stringify(t)}`, Q = (n, t) => {
  const e = typeof t.pid == "number" ? t.pid : void 0;
  return typeof e == "number" ? e : typeof n.pid == "number" ? n.pid : 0;
}, N = (n) => {
  const t = new URLSearchParams();
  for (const [e, i] of Object.entries(n)) {
    if (typeof i != "string")
      continue;
    const s = i.trim();
    s && t.set(e, s);
  }
  return t;
}, re = (n) => {
  if (!n || typeof n != "object")
    return "";
  const t = "error" in n && typeof n.error == "string" ? n.error : "", e = "error_description" in n && typeof n.error_description == "string" ? n.error_description : "";
  return [t, e].filter(Boolean).join(": ");
}, ot = (n) => {
  let t = "";
  for (const e of n)
    t += String.fromCharCode(e);
  return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}, oe = () => {
  const n = new Uint8Array(48);
  return crypto.getRandomValues(n), ot(n);
}, ae = async (n) => {
  const t = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(n));
  return ot(new Uint8Array(t));
};
class ce extends it {
  constructor(t = {}) {
    super(), this.accessToken = null, this.refreshToken = null, this.clientId = null, this.application = null, this.user = null, this.endpoint = "https://discord.com/api/v10", this._expecting = /* @__PURE__ */ new Map(), this._subscriptions = /* @__PURE__ */ new Map(), this.rpcSubscriptions = /* @__PURE__ */ new Map(), this.options = t, this.transport = new ie(this), this.transport.on("message", this._onRpcMessage.bind(this)), this.transport.on("close", (e) => {
      this._expecting.forEach((i) => {
        i.timeout && clearTimeout(i.timeout), i.reject(e instanceof Error ? e : new Error("connection closed"));
      }), this._expecting.clear(), this.rpcSubscriptions.clear(), this._connectPromise = void 0, this.emit("disconnected", e instanceof Error ? e : new Error("connection closed"));
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
  async fetch(t, e, { data: i, query: s } = {}) {
    const r = s ? `?${new URLSearchParams(s).toString()}` : "", o = {};
    typeof this.accessToken == "string" && this.accessToken.trim().length > 0 && (o.Authorization = `Bearer ${this.accessToken}`), i instanceof URLSearchParams && (o["Content-Type"] = "application/x-www-form-urlencoded");
    const c = await fetch(`${this.endpoint}${e}${r}`, {
      method: t,
      body: i,
      headers: o
    }), a = await c.json().catch(() => ({}));
    if (!c.ok) {
      const d = new Error(
        `Discord API request failed: ${c.status} ${c.statusText}`
      );
      throw d.body = a, d.status = c.status, d;
    }
    return a;
  }
  connect(t) {
    return this._connectPromise && this.clientId === t ? this._connectPromise : (this.clientId && this.clientId !== t && (this.destroy().catch(() => {
    }), this._connectPromise = void 0), this.transport.socket || (this._connectPromise = void 0), this._connectPromise = new Promise((e, i) => {
      this.clientId = t;
      const s = () => {
        o(), e(this);
      }, r = (a) => {
        o(), i(a instanceof Error ? a : new Error("connection closed"));
      }, o = () => {
        clearTimeout(c), this.off("connected", s), this.off("disconnected", r);
      }, c = setTimeout(() => {
        o(), i(new Error("RPC_CONNECTION_TIMEOUT"));
      }, 1e4);
      this.on("connected", s), this.on("disconnected", r), this.transport.connect().then((a) => {
        a && s();
      }).catch((a) => {
        o(), i(a);
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
    return new Promise((s, r) => {
      if (!this.transport.socket) {
        r(new Error("connection closed"));
        return;
      }
      const o = nt(), c = setTimeout(() => {
        const a = this._expecting.get(o);
        a && (this._expecting.delete(o), a.reject(new Error(`Discord RPC request timed out: ${t}.`)));
      }, se);
      this._expecting.set(o, { resolve: s, reject: r, timeout: c });
      try {
        this.transport.send({ cmd: t, args: e, evt: i, nonce: o });
      } catch (a) {
        clearTimeout(c), this._expecting.delete(o), r(a);
      }
    });
  }
  _onRpcMessage(t) {
    if (t.cmd === h.DISPATCH && t.evt === f.READY) {
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
        const i = t.data ?? {}, s = new Error(i.message ?? "RPC error");
        s.code = i.code, s.data = t.data, e.timeout && clearTimeout(e.timeout), e.reject(s);
      } else
        e.timeout && clearTimeout(e.timeout), e.resolve(t.data);
      this._expecting.delete(t.nonce);
      return;
    }
    this.emit(t.evt ?? "message", t.data);
  }
  async authorize({ scopes: t, clientSecret: e, rpcToken: i, redirectUri: s, prompt: r } = { clientId: "" }) {
    let o = i;
    const c = oe(), a = await ae(c);
    e && i === !0 && (o = (await this.fetch("POST", "/oauth2/token/rpc", {
      data: N({
        client_id: this.clientId || "",
        client_secret: e
      })
    })).rpc_token);
    const { code: d } = await this.request("AUTHORIZE", {
      scopes: t,
      client_id: this.clientId,
      prompt: r,
      rpc_token: o,
      code_challenge: a,
      code_challenge_method: "S256"
    });
    try {
      return await this.fetch("POST", "/oauth2/token", {
        data: N({
          client_id: this.clientId || "",
          client_secret: e,
          code: d,
          grant_type: "authorization_code",
          code_verifier: c,
          redirect_uri: s || ""
        })
      });
    } catch (u) {
      if (u instanceof Error && "status" in u && u.status === 401) {
        const T = "body" in u ? re(u.body) : "";
        throw new Error(
          [
            "Authorization failed (401) while exchanging the Discord OAuth code.",
            "This widget authorizes directly from the client, so your Discord app must have Public Client enabled unless you are using a backend/client secret flow.",
            `Client ID: ${this.clientId || "(missing)"}. Redirect URI used: ${s || "(missing)"}.`,
            "Make sure that exact redirect is listed on the OAuth2 page and that the Public Client toggle is enabled for direct widget authorization.",
            T ? `Discord response: ${T}.` : ""
          ].filter(Boolean).join(" ")
        );
      }
      throw u;
    }
  }
  async authenticate(t) {
    try {
      const { application: e, user: i } = await this.request(
        "AUTHENTICATE",
        {
          access_token: t.accessToken
        }
      );
      return this.accessToken = t.accessToken, this.refreshToken = t.refreshToken, this.application = e, this.user = i, this.emit("ready"), this;
    } catch (e) {
      throw e instanceof Error && "code" in e && e.code === 401 ? new Error("Authentication failed. The provided access token is invalid or has expired.") : e;
    }
  }
  async refreshOAuthToken(t) {
    try {
      const e = await fetch(`${this.endpoint}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: N({
          client_id: t.clientId,
          client_secret: t.clientSecret,
          grant_type: "refresh_token",
          refresh_token: t.refreshToken || ""
        })
      });
      return e.ok ? await e.json() : null;
    } catch {
      return null;
    }
  }
  getGuild(t, e) {
    return this.request(h.GET_GUILD, { guild_id: t, timeout: e });
  }
  async getGuilds(t) {
    const { guilds: e } = await this.request(h.GET_GUILDS, { timeout: t });
    return e;
  }
  getChannel(t, e) {
    return this.request(h.GET_CHANNEL, { channel_id: t, timeout: e });
  }
  async getChannels(t, e) {
    const { channels: i } = await this.request(h.GET_CHANNELS, { guild_id: t, timeout: e });
    return i;
  }
  async getSelectedVoiceChannel() {
    return this.request(h.GET_SELECTED_VOICE_CHANNEL);
  }
  setCertifiedDevices(t) {
    return this.request(h.SET_CERTIFIED_DEVICES, {
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
    return this.request(h.PUSH_TO_TALK, { active: t });
  }
  setUserVoiceSettings(t, e) {
    return this.request(h.SET_USER_VOICE_SETTINGS, {
      user_id: t,
      ...e
    });
  }
  selectVoiceChannel(t, { timeout: e, force: i = !1 } = {}) {
    return this.request(h.SELECT_VOICE_CHANNEL, { channel_id: t, timeout: e, force: i });
  }
  selectTextChannel(t, { timeout: e } = {}) {
    return this.request(h.SELECT_TEXT_CHANNEL, { channel_id: t, timeout: e });
  }
  getVoiceSettings() {
    return this.request(h.GET_VOICE_SETTINGS);
  }
  setVoiceSettings(t) {
    return this.request(h.SET_VOICE_SETTINGS, t);
  }
  captureShortcut(t) {
    const e = J(f.CAPTURE_SHORTCUT_CHANGE), i = () => (this._subscriptions.delete(e), this.request(h.CAPTURE_SHORTCUT, { action: "STOP" }));
    return this._subscriptions.set(e, ({ shortcut: s }) => {
      t(s, i);
    }), this.request(h.CAPTURE_SHORTCUT, { action: "START" }).then(() => i);
  }
  setActivity(t = {}) {
    let e, i, s, r;
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
    }), (t.partySize || t.partyId || t.partyMax) && (s = { id: t.partyId }, (t.partySize || t.partyMax) && (s.size = [t.partySize, t.partyMax])), (t.matchSecret || t.joinSecret || t.spectateSecret) && (r = {
      match: t.matchSecret,
      join: t.joinSecret,
      spectate: t.spectateSecret
    }), this.request(h.SET_ACTIVITY, {
      pid: Q(this.options, t),
      activity: {
        state: t.state,
        details: t.details,
        timestamps: e,
        assets: i,
        party: s,
        secrets: r,
        buttons: t.buttons,
        instance: !!t.instance
      }
    });
  }
  clearActivity() {
    return this.request(h.SET_ACTIVITY, { pid: Q(this.options, {}) });
  }
  sendJoinInvite(t) {
    return this.request(h.SEND_ACTIVITY_JOIN_INVITE, {
      user_id: typeof t == "string" ? t : t.id
    });
  }
  sendJoinRequest(t) {
    return this.request(h.SEND_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof t == "string" ? t : t.id
    });
  }
  toggleVideo() {
    return this.request(h.TOGGLE_VIDEO);
  }
  toggleScreenshare() {
    return this.request(h.TOGGLE_SCREENSHARE);
  }
  getSoundboardSounds() {
    return this.request(h.GET_SOUNDBOARD_SOUNDS);
  }
  playSoundboardSound(t, e) {
    return this.request(h.PLAY_SOUNDBOARD_SOUND, { guild_id: t, sound_id: e });
  }
  closeJoinRequest(t) {
    return this.request(h.CLOSE_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof t == "string" ? t : t.id
    });
  }
  createLobby(t, e, i) {
    return this.request(h.CREATE_LOBBY, { type: t, capacity: e, metadata: i });
  }
  updateLobby(t, {
    type: e,
    owner: i,
    capacity: s,
    metadata: r
  } = {}) {
    return this.request(h.UPDATE_LOBBY, {
      id: typeof t == "string" ? t : t.id,
      type: e,
      owner_id: typeof i == "string" ? i : i?.id,
      capacity: s,
      metadata: r
    });
  }
  deleteLobby(t) {
    return this.request(h.DELETE_LOBBY, { id: typeof t == "string" ? t : t.id });
  }
  connectToLobby(t, e) {
    return this.request(h.CONNECT_TO_LOBBY, { id: t, secret: e });
  }
  sendToLobby(t, e) {
    return this.request(h.SEND_TO_LOBBY, { id: typeof t == "string" ? t : t.id, data: e });
  }
  disconnectFromLobby(t) {
    return this.request(h.DISCONNECT_FROM_LOBBY, { id: typeof t == "string" ? t : t.id });
  }
  updateLobbyMember(t, e, i) {
    return this.request(h.UPDATE_LOBBY_MEMBER, {
      lobby_id: typeof t == "string" ? t : t.id,
      user_id: typeof e == "string" ? e : e.id,
      metadata: i
    });
  }
  getRelationships() {
    const t = Object.keys(ne);
    return this.request(
      h.GET_RELATIONSHIPS
    ).then((e) => e.relationships.map((i) => ({
      ...i,
      type: t[i.type]
    })));
  }
  async subscribe(t, e) {
    const i = J(t, e);
    let s = this.rpcSubscriptions.get(i);
    s || (s = {
      event: t,
      args: e,
      count: 0,
      ready: this.request(h.SUBSCRIBE, e, t)
    }, this.rpcSubscriptions.set(i, s)), s.count += 1;
    try {
      await s.ready;
    } catch (o) {
      throw this.rpcSubscriptions.get(i) === s && this.rpcSubscriptions.delete(i), o;
    }
    let r = !0;
    return {
      unsubscribe: async () => {
        if (!r)
          return;
        r = !1;
        const o = this.rpcSubscriptions.get(i);
        o === s && (o.count = Math.max(0, o.count - 1), !(o.count > 0) && (this.rpcSubscriptions.delete(i), await o.ready.catch(() => {
        }), await this.request(h.UNSUBSCRIBE, o.args, o.event).catch(() => {
        })));
      }
    };
  }
  isAuthenticated() {
    return !!(this.accessToken && this.application && this.user);
  }
  async destroy() {
    const t = new Error("Discord RPC client was closed.");
    for (const e of this._expecting.values())
      e.timeout && clearTimeout(e.timeout), e.reject(t);
    this._expecting.clear(), this._subscriptions.clear(), this.rpcSubscriptions.clear(), this._connectPromise = void 0, await this.transport.close();
  }
}
const P = "displayduck:discord-ipc:token:", X = "http://localhost", le = ["rpc", "rpc.voice.read", "rpc.voice.write"], he = ["discord-ipc", "discord-canary-ipc", "discord-ptb-ipc"], de = 1e3, ue = 500, fe = 3e3, pe = 5e3, Ee = 3e4, ge = 750, me = 2500, Te = 3e3;
let b = null, C = null;
const R = (() => {
  const n = globalThis;
  return n.__displayduckDiscordClients || (n.__displayduckDiscordClients = /* @__PURE__ */ new Map()), n.__displayduckDiscordClients;
})(), _e = (n) => {
  let t = R.get(n);
  return t || (t = {
    client: new ce(),
    clientId: n,
    references: 0,
    closeTimer: null
  }, R.set(n, t)), t.closeTimer && (clearTimeout(t.closeTimer), t.closeTimer = null), t.references += 1, t.client;
}, Se = (n) => {
  const t = Array.from(R.values()).find((e) => e.client === n);
  t && (t.references = Math.max(0, t.references - 1), !(t.references > 0 || t.closeTimer) && (t.closeTimer = setTimeout(() => {
    t.closeTimer = null, !(t.references > 0) && (R.delete(t.clientId), t.client.destroy());
  }, Te)));
}, g = (n) => !!n && typeof n == "object", p = (n) => typeof n == "string" ? n.trim() : "", m = (n) => n === !0, Ie = (n) => n.startsWith("a_") ? "gif" : "png", Z = (n, t) => {
  const e = p(t);
  if (e)
    return `https://cdn.discordapp.com/${n}/${e}.${Ie(e)}?size=128`;
}, ye = () => {
  const n = [], t = (globalThis.navigator?.platform ?? "").toLowerCase().includes("win");
  for (const e of he)
    for (let i = 0; i < 10; i += 1)
      n.push(t ? `\\\\.\\pipe\\${e}-${i}` : `/tmp/${e}-${i}`);
  return n;
};
let Ce = class {
  constructor(t) {
    this.ctx = t, this.client = null, this.clientListenerCleanups = [], this.subscriptions = [], this.reconnectTimer = null, this.speakingWatchdog = null, this.voicePollTimer = null, this.reconnectAttempts = 0, this.runId = 0, this.selectedChannelId = "", this.liveSpeaking = /* @__PURE__ */ new Map(), this.payload = $(t.payload ?? {}), this.state = $({
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
    this.ctx.mount.style.display = "";
    for (const t of this.state().participants)
      this.patchParticipantSpeaking(
        t.id,
        this.liveSpeaking.get(t.id)?.speaking ?? t.speaking
      );
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
    this.payload.set(t ?? {});
    const e = this.clientId();
    e !== this.state().clientId && (this.invalidateRun(), this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.cancelReconnect(), this.liveSpeaking.clear(), this.destroyClient(), this.patchState({
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
    this.invalidateRun(), this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.cancelReconnect(), this.liveSpeaking.clear(), this.destroyClient();
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
      const s = await this.ensureConnected(e);
      if (!this.isCurrentRun(i)) return;
      const r = this.readStoredToken(e);
      if (s.isAuthenticated()) {
        await this.handleAuthenticated(s);
        return;
      }
      if (!r?.accessToken) {
        this.requireAuthorization("Waiting for Discord authorization.");
        return;
      }
      if (await this.restoreStoredSession(s, r)) {
        if (!this.isCurrentRun(i)) return;
        await this.handleAuthenticated(s);
      }
    } catch (s) {
      if (!this.isCurrentRun(i)) return;
      const r = await this.isDiscordRunning();
      this.disconnect(
        s,
        r ? "Could not connect to Discord." : "Discord is not running.",
        r
      );
    } finally {
      this.isCurrentRun(i) && this.setBusy(!1);
    }
  }
  async authorize() {
    const t = this.state().clientId, e = this.redirectUri();
    if (!t) {
      this.patchState({
        message: "Set a Discord client ID to begin authorization.",
        isLoading: !1,
        authorizationRequired: !1
      });
      return;
    }
    const i = this.beginRun();
    this.setBusy(!0, "Awaiting authorization in Discord client..."), this.cancelReconnect();
    try {
      const s = await this.ensureConnected(t);
      if (!this.isCurrentRun(i) || (await s.login({
        clientId: t,
        redirectUri: e,
        scopes: [...le],
        prompt: "consent"
      }), !this.isCurrentRun(i))) return;
      this.persistClientTokens(t, s), await this.handleAuthenticated(s);
    } catch (s) {
      if (!this.isCurrentRun(i)) return;
      this.shouldInvalidateToken(s) && this.clearStoredToken(t), this.requireAuthorization(this.formatError(s, "Discord authorization failed."));
    } finally {
      this.isCurrentRun(i) && this.setBusy(!1);
    }
  }
  async ensureConnected(t) {
    if (this.client?.clientId === t)
      return await this.client.connect(t), this.client;
    await this.destroyClient();
    const e = _e(t);
    this.client = e, this.selectedChannelId = "", this.bindClient(e);
    try {
      return await e.connect(t), e;
    } catch (i) {
      throw await this.destroyClient(), i;
    }
  }
  bindClient(t) {
    this.unbindClientListeners();
    const e = (u) => {
      this.client === t && (this.selectedChannelId = "", this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.clearSubscriptions(!1), this.disconnect(u, "Lost connection to Discord.", !0));
    }, i = () => {
      this.client !== t || !this.state().authenticated || this.refreshVoiceState();
    }, s = (u) => {
      i();
    }, r = () => i(), o = () => i(), c = () => i(), a = (u) => {
      this.applySpeaking(this.extractUserId(u), !0);
    }, d = (u) => {
      this.applySpeaking(this.extractUserId(u), !1);
    };
    t.on("disconnected", e), t.on(f.VOICE_CHANNEL_SELECT, s), t.on(f.VOICE_STATE_CREATE, r), t.on(f.VOICE_STATE_UPDATE, o), t.on(f.VOICE_STATE_DELETE, c), t.on(f.SPEAKING_START, a), t.on(f.SPEAKING_STOP, d), this.clientListenerCleanups = [
      () => t.off("disconnected", e),
      () => t.off(f.VOICE_CHANNEL_SELECT, s),
      () => t.off(f.VOICE_STATE_CREATE, r),
      () => t.off(f.VOICE_STATE_UPDATE, o),
      () => t.off(f.VOICE_STATE_DELETE, c),
      () => t.off(f.SPEAKING_START, a),
      () => t.off(f.SPEAKING_STOP, d)
    ];
  }
  unbindClientListeners() {
    for (const t of this.clientListenerCleanups)
      t();
    this.clientListenerCleanups = [];
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
    } catch (s) {
      if (!this.shouldInvalidateToken(s))
        return this.disconnect(s, "Could not restore session.", !0), !1;
    }
    if (e.refreshToken)
      try {
        const s = await t.refreshOAuthToken({
          clientId: i,
          refreshToken: e.refreshToken
        });
        if (s?.access_token) {
          const r = s.refresh_token ?? e.refreshToken;
          return await t.authenticate({
            clientId: i,
            accessToken: s.access_token,
            refreshToken: r
          }), this.persistToken(i, {
            accessToken: s.access_token,
            refreshToken: r
          }), !0;
        }
      } catch {
      }
    return this.clearStoredToken(i), this.requireAuthorization("Saved authorization expired. Please authorize again."), !1;
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
  async clearSubscriptions(t = !0) {
    const e = this.subscriptions.splice(0, this.subscriptions.length);
    t && await Promise.all(
      e.map((i) => i.unsubscribe().catch(() => {
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
    } catch (l) {
      this.client === t && this.disconnect(l, "Failed to read the current voice channel.", !0);
      return;
    }
    if (this.client !== t)
      return;
    const i = p(e?.id);
    i !== this.selectedChannelId && (this.selectedChannelId = i, await this.subscribeToVoiceEvents());
    const s = this.state().participants, r = new Map(s.map((l) => [l.id, l])), o = Date.now(), c = Array.isArray(e?.voice_states) ? e.voice_states.map((l) => this.normalizeParticipant(l, r.get(p(g(l?.user) ? l.user.id : void 0)), o, e)).filter((l) => !!l).sort((l, A) => this.participantName(l).localeCompare(this.participantName(A))) : [], a = c.some((l) => l.isSelf) ? c : [], d = a.length > 0 ? "" : "No active voice call or channel found.", u = new Set(a.map((l) => l.id));
    for (const l of this.liveSpeaking.keys())
      u.has(l) || this.liveSpeaking.delete(l);
    for (const l of a)
      this.patchParticipantSpeaking(l.id, l.speaking);
    this.areParticipantsEqual(s, a) && this.state().message === d && this.state().authenticated && !this.state().authorizationRequired && !this.state().retryAvailable || this.patchState({
      authenticated: !0,
      authorizationRequired: !1,
      retryAvailable: !1,
      hideableDisconnect: !1,
      participants: a,
      message: d
    });
  }
  normalizeParticipant(t, e, i, s) {
    const r = g(t.user) ? t.user : g(t.member) && g(t.member.user) ? t.member.user : null, o = p(r?.id);
    if (!o)
      return null;
    const c = g(t.member) ? t.member : null, a = g(t.voice_state) ? t.voice_state : null, d = p(t.nick || c?.nick || (g(a?.member) ? a.member.nick : void 0)) || void 0, u = p(r?.global_name) || p(r?.username) || "?", T = p(
      a?.guild_id || c?.guild_id || t.guild_id || s?.guild_id
    ), l = p(
      c?.avatar || t.guild_avatar || t.avatar || (g(a?.member) ? a.member.avatar : void 0)
    ), A = p(r?.avatar), v = this.liveSpeaking.get(o), O = typeof t.speaking == "boolean" ? t.speaking : v?.speaking ?? e?.speaking ?? !1, M = O ? v?.lastSpokeAt ?? e?.lastSpokeAt ?? i : v?.lastSpokeAt ?? e?.lastSpokeAt ?? 0;
    return this.liveSpeaking.set(o, { speaking: O, lastSpokeAt: M }), {
      id: o,
      username: u,
      nick: d,
      mute: {
        user: m(t.mute),
        server: m(a?.mute) || m(t.server_mute),
        self: m(a?.self_mute) || m(t.self_mute)
      },
      deaf: {
        server: m(a?.deaf) || m(t.server_deaf),
        self: m(a?.self_deaf) || m(t.self_deaf)
      },
      speaking: O,
      isSelf: o === this.currentUserId(),
      serverAvatar: T && l ? Z(`guilds/${T}/users/${o}/avatars`, l) : void 0,
      avatar: A ? Z(`avatars/${o}`, A) : void 0,
      lastSpokeAt: M
    };
  }
  applySpeaking(t, e) {
    if (!t)
      return;
    const i = this.state().participants.find((o) => o.id === t), s = this.liveSpeaking.get(t);
    if (!i || s?.speaking === e)
      return;
    const r = e ? Date.now() : s?.lastSpokeAt ?? i.lastSpokeAt;
    this.liveSpeaking.set(t, { speaking: e, lastSpokeAt: r }), this.patchParticipantSpeaking(t, e);
  }
  patchParticipantSpeaking(t, e) {
    Array.from(
      this.ctx.mount.querySelectorAll("[data-participant-id]")
    ).find((r) => r.getAttribute("data-participant-id") === t)?.querySelector(".avatar")?.classList.toggle("speaking", e);
  }
  async toggleParticipantMute(t) {
    const e = this.client, i = this.state().participants.find((s) => s.id === t);
    if (!(!e || !i))
      try {
        await e.setUserVoiceSettings(t, { mute: !i.mute.user }), await this.refreshVoiceState();
      } catch (s) {
        this.disconnect(s, "Failed to update voice settings.", !0);
      }
  }
  startSpeakingWatchdog() {
    this.speakingWatchdog || (this.speakingWatchdog = setInterval(() => {
      const t = Date.now();
      for (const [e, i] of this.liveSpeaking)
        !i.speaking || t - i.lastSpokeAt <= de || (this.liveSpeaking.set(e, {
          speaking: !1,
          lastSpokeAt: i.lastSpokeAt
        }), this.patchParticipantSpeaking(e, !1));
    }, ue));
  }
  stopSpeakingWatchdog() {
    this.speakingWatchdog && (clearInterval(this.speakingWatchdog), this.speakingWatchdog = null);
  }
  startVoicePolling() {
    this.voicePollTimer || (this.voicePollTimer = setInterval(() => {
      !this.state().authenticated || this.state().authorizationRequired || this.refreshVoiceState();
    }, fe));
  }
  stopVoicePolling() {
    this.voicePollTimer && (clearInterval(this.voicePollTimer), this.voicePollTimer = null);
  }
  disconnect(t, e, i) {
    this.reconnectAttempts += 1, this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.liveSpeaking.clear(), this.patchState({
      authenticated: !1,
      participants: [],
      authorizationRequired: !1,
      retryAvailable: !0,
      hideableDisconnect: i,
      message: this.formatError(t, e)
    }), this.scheduleReconnect();
  }
  requireAuthorization(t) {
    this.stopSpeakingWatchdog(), this.stopVoicePolling(), this.liveSpeaking.clear(), this.patchState({
      authenticated: !1,
      participants: [],
      authorizationRequired: !0,
      retryAvailable: !1,
      hideableDisconnect: !1,
      isLoading: !1,
      message: t
    });
  }
  scheduleReconnect() {
    if (this.reconnectTimer || !this.state().clientId || this.state().authorizationRequired)
      return;
    const t = this.runId, i = Math.min(
      pe * 2 ** Math.min(Math.max(0, this.reconnectAttempts - 1), 4),
      Ee
    ) + Math.round(Math.random() * ge);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null, !(t !== this.runId || this.state().authenticated || this.state().authorizationRequired) && this.syncSession("Reconnecting to Discord...");
    }, i);
  }
  cancelReconnect() {
    this.reconnectTimer && (clearTimeout(this.reconnectTimer), this.reconnectTimer = null);
  }
  async destroyClient() {
    const t = this.client;
    this.client = null, this.selectedChannelId = "", this.unbindClientListeners(), await this.clearSubscriptions(), t && Se(t);
  }
  currentUserId() {
    const t = this.client?.user;
    return g(t) ? p(t.id) : "";
  }
  extractUserId(t) {
    return t ? p(t.user_id) ? p(t.user_id) : g(t.user) ? p(t.user.id) : "" : "";
  }
  shadowsEnabled() {
    return !!this.config("shadow", !1);
  }
  alignmentClass() {
    const t = this.config("alignment", "top-left");
    return typeof t == "string" && t.length > 0 ? t : "top-left";
  }
  participantGridSize() {
    const t = String(this.config("participantSize", "default")).trim().toLowerCase();
    return t.startsWith("small") ? 1 : t.startsWith("large") ? 3 : t.startsWith("xl") ? 4 : t.startsWith("xxxl") ? 6 : t.startsWith("xxl") ? 5 : 2;
  }
  showWidget() {
    return !this.shouldAutoHide();
  }
  showNames() {
    return !!this.config("showNames", !0);
  }
  participantClasses(t) {
    const e = [];
    return t.isSelf && e.push("self"), this.hasStatusIcon(t) && e.push("muted"), e.join(" ");
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
  participantIsDeafened(t) {
    return t.deaf.self || t.deaf.server;
  }
  areParticipantsEqual(t, e) {
    if (t.length !== e.length)
      return !1;
    for (let i = 0; i < t.length; i += 1) {
      const s = t[i], r = e[i];
      if (s.id !== r.id || s.username !== r.username || s.nick !== r.nick || s.isSelf !== r.isSelf || s.serverAvatar !== r.serverAvatar || s.avatar !== r.avatar || s.deaf.server !== r.deaf.server || s.deaf.self !== r.deaf.self || s.mute.user !== r.mute.user || s.mute.server !== r.mute.server || s.mute.self !== r.mute.self)
        return !1;
    }
    return !0;
  }
  patchState(t) {
    this.state.update((e) => {
      for (const [i, s] of Object.entries(t))
        if (e[i] !== s)
          return { ...e, ...t };
      return e;
    });
  }
  setBusy(t, e) {
    this.state.update((i) => {
      const s = e ?? i.message;
      return i.isLoading === t && i.message === s ? i : {
        ...i,
        isLoading: t,
        message: s
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
    const i = this.payload().config;
    return g(i) ? i[t] ?? e : e;
  }
  clientId() {
    return String(this.config("clientId", "")).trim();
  }
  redirectUri() {
    return String(this.config("redirectUri", X)).trim() || X;
  }
  hasClientId() {
    return this.state().clientId.length > 0;
  }
  shouldAutoHide() {
    if (!this.config("autoHide", !1) || !this.hasClientId())
      return !1;
    const t = this.state();
    return t.authorizationRequired || t.retryAvailable && !t.hideableDisconnect ? !1 : this.state().participants.length === 0;
  }
  readStoredToken(t) {
    const e = localStorage.getItem(`${P}${t}`);
    if (!e)
      return null;
    try {
      const i = JSON.parse(e), s = p(i.accessToken), r = p(i.refreshToken) || void 0;
      return s ? { accessToken: s, refreshToken: r } : null;
    } catch {
      return null;
    }
  }
  persistClientTokens(t, e) {
    const i = p(e.accessToken);
    if (!i)
      return;
    const s = this.readStoredToken(t)?.refreshToken;
    this.persistToken(t, {
      accessToken: i,
      refreshToken: p(e.refreshToken) || s
    });
  }
  persistToken(t, e) {
    localStorage.setItem(`${P}${t}`, JSON.stringify(e));
  }
  clearStoredToken(t) {
    localStorage.removeItem(`${P}${t}`);
  }
  shouldInvalidateToken(t) {
    if (!(t instanceof Error))
      return !1;
    const e = t.message.toLowerCase();
    return e.includes("invalid access token") || e.includes("invalid oauth2 access token") || e.includes("authentication failed") || e.includes("invalid_grant") || e.includes("401");
  }
  async isDiscordRunning() {
    return b && b.expiresAt > Date.now() ? b.running : C || (C = Promise.all(
      ye().map((t) => et(t).catch(() => !1))
    ).then((t) => {
      const e = t.some(Boolean);
      return b = {
        running: e,
        expiresAt: Date.now() + me
      }, e;
    }).finally(() => {
      C = null;
    }), C);
  }
  formatError(t, e) {
    return t instanceof Error ? t.message.includes("RPC_CONNECTION_TIMEOUT") ? "Connection to Discord timed out." : t.message.includes("endpoint is not available") ? "Discord is not running, or IPC access is unavailable." : t.message.toLowerCase().includes("invalid client") ? "Discord rejected the Client ID. Check that it is a valid Discord application Client ID." : t.message.toLowerCase().includes("rpc request timed out") ? `${t.message} Discord may be busy, disconnected, or refusing this application.` : t.message.includes("Could not connect") ? "Could not connect to the Discord client." : t.message : e;
  }
  initials(t) {
    const e = t.split(/\s+/).map((i) => i.trim()).filter(Boolean);
    return e.length === 0 ? "?" : e.slice(0, 2).map((i) => i[0]?.toUpperCase() ?? "").join("") || "?";
  }
};
const Ae = `{{#if showWidget()}}
  <div class="discord-ipc-wrapper {{#if shadowsEnabled()}}shadows{{/if}}">
    <div class="discord-ipc align-{{alignmentClass()}}">
      {{#if state().participants.length > 0}}
        <div class="participants-view">
          <div class="participants">
            {{#each state().participants}}
              <div
                class="participant {{participantClasses(this)}}"
                data-participant-id="{{this.id}}"
                style="--participant-size: {{participantGridSize()}};"
              >
                <div class="avatar">
                  {{#if participantAvatarUrl(this)}}
                    <img src="{{participantAvatarUrl(this)}}" alt="{{this.username}}" loading="lazy" decoding="async" />
                  {{/if}}
                  {{#if !participantAvatarUrl(this)}}
                    <div class="avatar-fallback">{{participantInitials(this)}}</div>
                  {{/if}}
                  {{#if hasStatusIcon(this)}}
                    <div class="mute">
                      {{#if participantIsDeafened(this)}}
                        <img src="{{ASSETS}}/img/deafened.png" class="invert" alt="Deafened" />
                      {{/if}}
                      {{#if this.mute.self && !participantIsDeafened(this)}}
                        <img src="{{ASSETS}}/img/mic-selfmuted.png" class="invert" alt="Self muted" />
                      {{/if}}
                      {{#if this.mute.server && !this.mute.self && !participantIsDeafened(this)}}
                        <img src="{{ASSETS}}/img/mic-servermuted.png" alt="Server muted" />
                      {{/if}}
                      {{#if this.mute.user && !this.mute.self && !this.mute.server && !participantIsDeafened(this)}}
                        <img src="{{ASSETS}}/img/mic-muted.png" class="invert" alt="Muted" />
                      {{/if}}
                    </div>
                  {{/if}}
                </div>
                {{#if showNames()}}
                  <div class="name-wrapper">
                    <div class="name">{{participantName(this)}}</div>
                  </div>
                {{/if}}
              </div>
            {{/each}}
          </div>
        </div>
      {{/if}}

      {{#if state().participants.length === 0}}
        <div class="disconnected-view">
          <div class="icon">
            {{#if state().isLoading}}
              <img src="{{ASSETS}}/img/loader.gif" alt="Loading" />
            {{/if}}
            {{#if !state().isLoading}}
              <img src="{{ASSETS}}/img/discord.png" class="invert" alt="Discord" />
            {{/if}}
          </div>
          <div class="message">
            {{#if hasClientId()}}
              {{state().message}}
            {{/if}}
            {{#if !hasClientId()}}
              No Discord Client ID provided. Please set a valid Client ID in the widget settings to use the Discord IPC widget.
            {{/if}}
          </div>
          {{#if hasClientId() && !state().isLoading && (state().authorizationRequired || state().retryAvailable)}}
            <button id="login-btn" type="button" class="connect-button">
              {{#if state().authorizationRequired}}Authorize Discord{{/if}}
              {{#if !state().authorizationRequired}}Try Again{{/if}}
            </button>
          {{/if}}
        </div>
      {{/if}}
    </div>
  </div>
{{/if}}
`, we = "img.invert{--filters: invert(100%)}.discord-ipc-wrapper{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;container-type:size}.discord-ipc-wrapper.shadows{filter:drop-shadow(-1px 1px 1px #000000)}.discord-ipc{display:flex;width:100%;height:100%;flex-direction:column}.participants-view{width:100%;height:100%;min-width:0;min-height:0;container-type:size}.participants{display:flex;flex-direction:row;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;justify-content:flex-start;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;gap:clamp(2px,.5em,8px)}.align-top-center .participants,.align-center-center .participants,.align-bottom-center .participants{justify-content:center}.align-top-right .participants,.align-center-right .participants,.align-bottom-right .participants{justify-content:flex-end}.align-center-left .participants,.align-center-center .participants,.align-center-right .participants{align-items:center;align-content:center}.align-bottom-left .participants,.align-bottom-center .participants,.align-bottom-right .participants{align-items:flex-end;align-content:flex-end}.participant{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 calc(var(--cell-width, 60px) * var(--participant-size));width:calc(var(--cell-width, 60px) * var(--participant-size));height:calc(var(--cell-width, 60px) * var(--participant-size));min-width:0;min-height:0;overflow:hidden;aspect-ratio:1/1;transform:scale(.7);opacity:0;animation:popIn var(--transition) forwards;animation-delay:var(--animation-delay)}.participant.muted .avatar>img{filter:grayscale(100%) brightness(50%)}.participant.muted .avatar .mute{opacity:1;visibility:visible}.avatar{position:relative;width:min(75%,75cqh);height:auto;aspect-ratio:1/1;max-width:75%;max-height:75%;flex:0 0 auto;background:#ffffff1f;border:max(.15em,5px) solid transparent;border-radius:.25em;transition:border-color var(--transition)}.avatar>img{width:100%;height:100%;object-fit:cover;display:block;border-radius:.25em;transition:filter var(--transition)}.avatar.speaking{border-color:#70e070}.avatar-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.7em;font-weight:700;letter-spacing:.04em;color:#ffffffe6}.mute{display:flex;position:absolute;inset:0;font-size:max(1em,var(--host-width) / 15);justify-content:center;align-items:center;gap:.2em;opacity:0;visibility:hidden;transition:opacity var(--transition),visibility var(--transition)}.mute img{width:30%;max-width:100%;filter:var(--filters) drop-shadow(1px 1px .25em rgba(0,0,0,.5))}.name-wrapper{width:100%;max-height:25%;font-size:clamp(8px,4.5cqw,22px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 .15em}.name{display:block;padding:0 .25em;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}.disconnected-view{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:.65em;padding:.75em;box-sizing:border-box}.icon img{width:3em;filter:var(--filters)}.message{text-transform:uppercase;line-height:1.3}.connect-button{border:0;border-radius:.35em;padding:.35em .6em;background:#ffffff2e;color:inherit;font-size:1.2em;text-transform:uppercase;transition:opacity var(--transition)}@keyframes popIn{0%{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}", at = Ht(Ce, { template: Ae, styles: we }), be = at, ve = { DisplayDuckWidget: at, Widget: be };
export {
  at as DisplayDuckWidget,
  be as Widget,
  ve as default
};
