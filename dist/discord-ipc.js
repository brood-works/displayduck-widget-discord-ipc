const expressionCache = /* @__PURE__ */ new Map();
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const compileExpression = (expression) => {
  const cached = expressionCache.get(expression);
  if (cached) {
    return cached;
  }
  const transformed = expression.replace(/\bthis\b/g, "__item");
  const fn = new Function("scope", `with (scope) { return (${transformed}); }`);
  expressionCache.set(expression, fn);
  return fn;
};
const evaluate = (expression, scope) => {
  try {
    return compileExpression(expression)(scope);
  } catch {
    return "";
  }
};
const parseNodes = (template2, from = 0, stopAt) => {
  const nodes = [];
  let index = from;
  while (index < template2.length) {
    const start = template2.indexOf("{{", index);
    if (start === -1) {
      nodes.push({ type: "text", value: template2.slice(index) });
      return { nodes, index: template2.length };
    }
    if (start > index) {
      nodes.push({ type: "text", value: template2.slice(index, start) });
    }
    const close = template2.indexOf("}}", start + 2);
    if (close === -1) {
      nodes.push({ type: "text", value: template2.slice(start) });
      return { nodes, index: template2.length };
    }
    const token = template2.slice(start + 2, close).trim();
    index = close + 2;
    if (token === "/if" || token === "/each") {
      if (stopAt === token) {
        return { nodes, index };
      }
      nodes.push({ type: "text", value: `{{${token}}}` });
      continue;
    }
    if (token.startsWith("#if ")) {
      const child = parseNodes(template2, index, "/if");
      nodes.push({
        type: "if",
        condition: token.slice(4).trim(),
        children: child.nodes
      });
      index = child.index;
      continue;
    }
    if (token.startsWith("#each ")) {
      const child = parseNodes(template2, index, "/each");
      nodes.push({
        type: "each",
        source: token.slice(6).trim(),
        children: child.nodes
      });
      index = child.index;
      continue;
    }
    nodes.push({ type: "expr", value: token });
  }
  return { nodes, index };
};
const renderNodes = (nodes, scope) => {
  let output = "";
  for (const node of nodes) {
    if (node.type === "text") {
      output += node.value;
      continue;
    }
    if (node.type === "expr") {
      output += escapeHtml(evaluate(node.value, scope));
      continue;
    }
    if (node.type === "if") {
      if (Boolean(evaluate(node.condition, scope))) {
        output += renderNodes(node.children, scope);
      }
      continue;
    }
    const items = evaluate(node.source, scope);
    if (!Array.isArray(items)) {
      continue;
    }
    for (const item of items) {
      const childScope = Object.create(scope);
      childScope.__item = item;
      output += renderNodes(node.children, childScope);
    }
  }
  return output;
};
const createTemplateRenderer = (template2) => {
  const parsed = parseNodes(template2).nodes;
  return (scope) => renderNodes(parsed, scope);
};
typeof SuppressedError === "function" ? SuppressedError : function(error, suppressed, message) {
  var e = new Error(message);
  return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
function convertFileSrc(filePath, protocol = "asset") {
  return window.__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
}
var TauriEvent;
(function(TauriEvent2) {
  TauriEvent2["WINDOW_RESIZED"] = "tauri://resize";
  TauriEvent2["WINDOW_MOVED"] = "tauri://move";
  TauriEvent2["WINDOW_CLOSE_REQUESTED"] = "tauri://close-requested";
  TauriEvent2["WINDOW_DESTROYED"] = "tauri://destroyed";
  TauriEvent2["WINDOW_FOCUS"] = "tauri://focus";
  TauriEvent2["WINDOW_BLUR"] = "tauri://blur";
  TauriEvent2["WINDOW_SCALE_FACTOR_CHANGED"] = "tauri://scale-change";
  TauriEvent2["WINDOW_THEME_CHANGED"] = "tauri://theme-changed";
  TauriEvent2["WINDOW_CREATED"] = "tauri://window-created";
  TauriEvent2["WINDOW_SUSPENDED"] = "tauri://suspended";
  TauriEvent2["WINDOW_RESUMED"] = "tauri://resumed";
  TauriEvent2["WEBVIEW_CREATED"] = "tauri://webview-created";
  TauriEvent2["DRAG_ENTER"] = "tauri://drag-enter";
  TauriEvent2["DRAG_OVER"] = "tauri://drag-over";
  TauriEvent2["DRAG_DROP"] = "tauri://drag-drop";
  TauriEvent2["DRAG_LEAVE"] = "tauri://drag-leave";
})(TauriEvent || (TauriEvent = {}));
async function _unlisten(event, eventId) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(event, eventId);
  await invoke("plugin:event|unlisten", {
    event,
    eventId
  });
}
async function listen(event, handler, options) {
  var _a;
  const target = (_a = void 0) !== null && _a !== void 0 ? _a : { kind: "Any" };
  return invoke("plugin:event|listen", {
    event,
    target,
    handler: transformCallback(handler)
  }).then((eventId) => {
    return async () => _unlisten(event, eventId);
  });
}
const OPEN_EVENT$1 = "pack-tcp-socket-open";
const DATA_EVENT$1 = "pack-tcp-socket-data";
const CLOSE_EVENT$1 = "pack-tcp-socket-close";
const CONNECT_TIMEOUT_MS$1 = 5e3;
const toBase64$1 = (bytes) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};
const fromBase64$1 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
const normalizeBinary$1 = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return Uint8Array.from(value);
};
const createSessionId$1 = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tcp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
class RuntimeTcpSocket {
  constructor(options, hasEventAccess) {
    this.hasEventAccess = hasEventAccess;
    this.isConnected = false;
    this.connecting = null;
    this.tauriListenersReady = null;
    this.tauriUnlisteners = [];
    this.listeners = {
      open: /* @__PURE__ */ new Set(),
      data: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set(),
      error: /* @__PURE__ */ new Set()
    };
    this.host = String(options.host ?? "").trim();
    this.port = Number(options.port);
    this.sessionId = createSessionId$1();
  }
  get connected() {
    return this.isConnected;
  }
  async connect() {
    if (!this.hasEventAccess) {
      throw new Error("TCP socket access requires the Allow event access permission.");
    }
    if (this.isConnected) {
      return;
    }
    if (this.connecting) {
      return this.connecting;
    }
    if (!this.host || !Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
      throw new Error("A valid TCP socket host and port are required.");
    }
    this.connecting = this.connectInternal();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }
  async send(data) {
    if (!this.isConnected) {
      throw new Error("TCP socket is not connected.");
    }
    await invoke("pack_tcp_socket_write", {
      sessionId: this.sessionId,
      dataBase64: toBase64$1(normalizeBinary$1(data))
    });
  }
  async write(data) {
    await this.send(data);
  }
  async close() {
    try {
      await invoke("pack_tcp_socket_disconnect", { sessionId: this.sessionId });
    } finally {
      this.isConnected = false;
      this.teardownTauriListeners();
    }
  }
  on(eventName, handler) {
    this.listeners[eventName].add(handler);
    return () => this.listeners[eventName].delete(handler);
  }
  async connectInternal() {
    await this.ensureTauriListeners();
    await new Promise(async (resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`TCP socket connection timed out for ${this.host}:${this.port}`));
      }, CONNECT_TIMEOUT_MS$1);
      const offOpen = this.on("open", () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      });
      const offClose = this.on("close", (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(payload.error ?? `TCP socket closed before opening.`));
      });
      const cleanup = () => {
        clearTimeout(timeoutId);
        offOpen();
        offClose();
      };
      try {
        await invoke("pack_tcp_socket_connect", {
          sessionId: this.sessionId,
          host: this.host,
          port: this.port,
          allowEventAccess: this.hasEventAccess
        });
      } catch (error) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    });
  }
  async ensureTauriListeners() {
    if (this.tauriListenersReady) {
      return this.tauriListenersReady;
    }
    this.tauriListenersReady = (async () => {
      this.tauriUnlisteners = [
        await listen(OPEN_EVENT$1, (event) => {
          if (event.payload.sessionId !== this.sessionId) return;
          this.isConnected = true;
          this.emit("open", {
            host: this.host,
            port: this.port
          });
        }),
        await listen(DATA_EVENT$1, (event) => {
          if (event.payload.sessionId !== this.sessionId) return;
          try {
            this.emit("data", fromBase64$1(event.payload.dataBase64));
          } catch (error) {
            this.emit("error", {
              host: this.host,
              port: this.port,
              error: error instanceof Error ? error.message : "Invalid TCP socket data."
            });
          }
        }),
        await listen(CLOSE_EVENT$1, (event) => {
          if (event.payload.sessionId !== this.sessionId) return;
          this.isConnected = false;
          if (event.payload.error) {
            this.emit("error", {
              host: this.host,
              port: this.port,
              error: event.payload.error
            });
          }
          this.emit("close", {
            host: this.host,
            port: this.port,
            error: event.payload.error
          });
        })
      ];
    })();
    return this.tauriListenersReady;
  }
  teardownTauriListeners() {
    for (const unlisten of this.tauriUnlisteners) {
      try {
        unlisten();
      } catch {
      }
    }
    this.tauriUnlisteners = [];
    this.tauriListenersReady = null;
  }
  emit(eventName, payload) {
    for (const listener of this.listeners[eventName]) {
      listener(payload);
    }
  }
}
const OPEN_EVENT = "pack-ipc-transport-open";
const DATA_EVENT = "pack-ipc-transport-data";
const CLOSE_EVENT = "pack-ipc-transport-close";
const CONNECT_TIMEOUT_MS = 5e3;
const toBase64 = (bytes) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};
const fromBase64 = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};
const normalizeBinary = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return Uint8Array.from(value);
};
const createSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ipc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
const logPrefix = (sessionId, endpoint) => `[IpcTransport session=${sessionId} endpoint=${endpoint}]`;
const normalizeTransportErrorMessage = (value) => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }
  if (value instanceof Error) {
    return value.message.trim().toLowerCase();
  }
  if (typeof value === "object" && value && "error" in value) {
    const error = value.error;
    return typeof error === "string" ? error.trim().toLowerCase() : "";
  }
  return String(value).trim().toLowerCase();
};
const isMissingEndpointError = (value) => {
  const message = normalizeTransportErrorMessage(value);
  return message.includes("no such file or directory") || message.includes("os error 2") || message.includes("endpoint is not available") || message.includes("not found");
};
class IpcTransport {
  constructor(options) {
    this.connected = false;
    this.listeners = {
      open: /* @__PURE__ */ new Set(),
      data: /* @__PURE__ */ new Set(),
      close: /* @__PURE__ */ new Set()
    };
    this.tauriListenersReady = null;
    this.tauriUnlisteners = [];
    this.endpoint = String(options.endpoint ?? "").trim();
    this.sessionId = String(options.sessionId ?? "").trim() || createSessionId();
  }
  async connect() {
    await this.connectWithInitialWrite();
  }
  async connectWithInitialWrite(initialData) {
    if (!this.endpoint) {
      throw new Error("Missing IPC endpoint.");
    }
    await this.ensureTauriListeners();
    await new Promise(async (resolve, reject) => {
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new Error(`IPC connect timed out for endpoint ${this.endpoint}`));
      }, CONNECT_TIMEOUT_MS);
      const offOpen = this.on("open", () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      });
      const offClose = this.on("close", (payload) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (!isMissingEndpointError(payload.error)) {
          console.error(
            `${logPrefix(this.sessionId, this.endpoint)} connect close-before-open error=${payload.error ?? "<none>"}`
          );
        }
        reject(new Error(payload.error ?? `IPC transport closed for endpoint ${this.endpoint}`));
      });
      const cleanup = () => {
        clearTimeout(timeoutId);
        offOpen();
        offClose();
      };
      try {
        await invoke("pack_ipc_transport_connect", {
          sessionId: this.sessionId,
          endpoint: this.endpoint,
          initialDataBase64: initialData ? toBase64(normalizeBinary(initialData)) : null
        });
      } catch (error) {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (!isMissingEndpointError(error)) {
          console.error(`${logPrefix(this.sessionId, this.endpoint)} invoke connect failed`, error);
        }
        reject(error);
      }
    });
  }
  async write(data) {
    const bytes = normalizeBinary(data);
    try {
      await invoke("pack_ipc_transport_write", {
        sessionId: this.sessionId,
        dataBase64: toBase64(bytes)
      });
    } catch (error) {
      this.connected = false;
      const message = error instanceof Error ? error.message : typeof error === "string" ? error : "IPC transport write failed";
      console.error(`${logPrefix(this.sessionId, this.endpoint)} write failed error=${message}`, error);
      this.emit("close", {
        sessionId: this.sessionId,
        endpoint: this.endpoint,
        error: message
      });
      throw error;
    }
  }
  async send(data) {
    await this.write(data);
  }
  async close() {
    try {
      await invoke("pack_ipc_transport_disconnect", {
        sessionId: this.sessionId
      });
    } finally {
      this.connected = false;
      this.teardownTauriListeners();
    }
  }
  async destroy() {
    await this.close();
  }
  on(eventName, handler) {
    this.listeners[eventName].add(handler);
    return () => {
      this.listeners[eventName].delete(handler);
    };
  }
  async ensureTauriListeners() {
    if (this.tauriListenersReady) {
      return this.tauriListenersReady;
    }
    this.tauriListenersReady = (async () => {
      this.tauriUnlisteners = [
        await listen(OPEN_EVENT, (event) => {
          const payload = event.payload;
          if (payload.sessionId !== this.sessionId) {
            return;
          }
          this.connected = true;
          this.emit("open", payload);
        }),
        await listen(DATA_EVENT, (event) => {
          const payload = event.payload;
          if (payload.sessionId !== this.sessionId) {
            return;
          }
          this.emit("data", fromBase64(payload.dataBase64));
        }),
        await listen(CLOSE_EVENT, (event) => {
          const payload = event.payload;
          if (payload.sessionId !== this.sessionId) {
            return;
          }
          this.connected = false;
          if (!isMissingEndpointError(payload.error)) {
            console.error(`${logPrefix(this.sessionId, this.endpoint)} event close`, payload);
          }
          this.emit("close", payload);
        })
      ];
    })();
    return this.tauriListenersReady;
  }
  teardownTauriListeners() {
    for (const unlisten of this.tauriUnlisteners) {
      try {
        unlisten();
      } catch {
      }
    }
    this.tauriUnlisteners = [];
    this.tauriListenersReady = null;
  }
  emit(eventName, payload) {
    for (const listener of this.listeners[eventName]) {
      listener(payload);
    }
  }
}
const ipcTransportEndpointExists = async (endpoint) => {
  const normalized = String(endpoint ?? "").trim();
  if (!normalized) {
    return false;
  }
  return invoke("pack_ipc_transport_endpoint_exists", {
    endpoint: normalized
  });
};
const isSignal = (value) => {
  if (typeof value !== "function") {
    return false;
  }
  const candidate = value;
  return candidate._isSignal === true && typeof candidate.set === "function" && typeof candidate.subscribe === "function";
};
const signal = (initialValue) => {
  let current = initialValue;
  const subscribers = /* @__PURE__ */ new Set();
  const read = (() => current);
  read._isSignal = true;
  read.set = (value) => {
    if (Object.is(current, value)) {
      return;
    }
    current = value;
    for (const subscriber of subscribers) {
      subscriber(current);
    }
  };
  read.update = (updater) => {
    read.set(updater(current));
  };
  read.subscribe = (subscriber) => {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  };
  return read;
};
const focusWidgetView = (configuredWidgetId) => invoke("controller_widget_focus_view", { configuredWidgetId });
const bindSignals = (source, onChange) => {
  const unsubscribers = [];
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (isSignal(value)) {
      unsubscribers.push(value.subscribe(() => onChange()));
    }
  }
  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
};
const createScope = (instance, payload) => {
  return new Proxy(
    { payload },
    {
      get(target, property) {
        if (typeof property !== "string") {
          return void 0;
        }
        if (property in target) {
          return target[property];
        }
        const value = instance[property];
        if (typeof value === "function") {
          return value.bind(instance);
        }
        return value;
      },
      has(target, property) {
        if (typeof property !== "string") {
          return false;
        }
        return property in target || property in instance;
      }
    }
  );
};
const RELATIVE_URL_ATTRIBUTES = ["src", "href", "poster"];
const PACK_INSTALL_PATH_PLACEHOLDER = "{{pack-install-path}}/";
const ASSETS_PLACEHOLDER = "{{ASSETS}}";
const isExternalAssetUrl = (value) => {
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("file:") || trimmed.startsWith("asset:") || trimmed.startsWith("mailto:") || trimmed.startsWith("tel:") || trimmed.startsWith("javascript:") || trimmed.startsWith("//") || trimmed.startsWith("/") || trimmed.startsWith("#");
};
const extractWidgetRelativePath = (value) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!isExternalAssetUrl(trimmed)) {
    return trimmed.replace(/^\.\/+/, "").replace(/^\/+/, "");
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`.replace(/^\/+/, "");
      }
    } catch {
      return null;
    }
  }
  return null;
};
const normalizeJoinedAssetPath = (widgetDirectory, relativePath) => {
  const normalizedBase = widgetDirectory.replaceAll("\\", "/").replace(/\/+$/, "");
  const combined = `${normalizedBase}/${relativePath.trim()}`;
  const segments = combined.split("/");
  const resolved = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      if (resolved.length === 0 && combined.startsWith("/")) {
        resolved.push("");
      }
      continue;
    }
    if (segment === "..") {
      if (resolved.length > 1 || resolved.length === 1 && resolved[0] !== "") {
        resolved.pop();
      }
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/") || normalizedBase;
};
const resolveAssetUrl = (widgetDirectory, value) => {
  const relativePath = extractWidgetRelativePath(value);
  if (!widgetDirectory || !relativePath) {
    return value;
  }
  try {
    return convertFileSrc(normalizeJoinedAssetPath(widgetDirectory, relativePath));
  } catch {
    return value;
  }
};
const resolveAssetsBaseUrl = (widgetDirectory) => {
  const normalizedDirectory = widgetDirectory.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!normalizedDirectory) {
    return "";
  }
  try {
    return convertFileSrc(normalizedDirectory);
  } catch {
    return normalizedDirectory;
  }
};
const rewriteSrcset = (value, widgetDirectory) => {
  return value.split(",").map((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) {
      return trimmed;
    }
    const [url, descriptor] = trimmed.split(/\s+/, 2);
    const nextUrl = resolveAssetUrl(widgetDirectory, url);
    return descriptor ? `${nextUrl} ${descriptor}` : nextUrl;
  }).join(", ");
};
const rewriteInlineStyleUrls = (value, widgetDirectory) => {
  return value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, urlValue) => {
    const nextUrl = resolveAssetUrl(widgetDirectory, urlValue);
    if (nextUrl === urlValue) {
      return full;
    }
    return `url("${nextUrl}")`;
  });
};
const rewriteElementAssetUrls = (element, widgetDirectory) => {
  for (const attribute of RELATIVE_URL_ATTRIBUTES) {
    const currentValue = element.getAttribute(attribute);
    if (!currentValue) {
      continue;
    }
    const nextValue = resolveAssetUrl(widgetDirectory, currentValue);
    if (nextValue !== currentValue) {
      element.setAttribute(attribute, nextValue);
    }
  }
  const currentSrcset = element.getAttribute("srcset");
  if (currentSrcset) {
    const nextSrcset = rewriteSrcset(currentSrcset, widgetDirectory);
    if (nextSrcset !== currentSrcset) {
      element.setAttribute("srcset", nextSrcset);
    }
  }
  const currentStyle = element.getAttribute("style");
  if (currentStyle) {
    const nextStyle = rewriteInlineStyleUrls(currentStyle, widgetDirectory);
    if (nextStyle !== currentStyle) {
      element.setAttribute("style", nextStyle);
    }
  }
};
const rewriteTreeAssetUrls = (root, widgetDirectory) => {
  if (!widgetDirectory) {
    return;
  }
  if (root instanceof Element) {
    rewriteElementAssetUrls(root, widgetDirectory);
  }
  for (const element of Array.from(root.querySelectorAll("*"))) {
    rewriteElementAssetUrls(element, widgetDirectory);
  }
};
const rewriteInstallPathPlaceholders = (input, widgetDirectory) => {
  if (!widgetDirectory) {
    return input;
  }
  let output = input;
  const assetsBaseUrl = resolveAssetsBaseUrl(widgetDirectory);
  if (assetsBaseUrl && output.includes(ASSETS_PLACEHOLDER)) {
    output = output.replaceAll(ASSETS_PLACEHOLDER, assetsBaseUrl);
  }
  if (!output.includes(PACK_INSTALL_PATH_PLACEHOLDER)) {
    return output;
  }
  return output.replace(/\{\{pack-install-path\}\}\/([^"')\s]+)/g, (full, relativePath) => {
    return resolveAssetUrl(widgetDirectory, relativePath);
  });
};
const createWidgetClass = (WidgetImpl, options) => {
  return class RuntimeWidget {
    constructor({
      mount,
      payload,
      setLoading
    }) {
      this.cleanups = [];
      this.widgetDirectory = "";
      this.mount = mount;
      this.payload = payload ?? {};
      this.setLoading = typeof setLoading === "function" ? setLoading : (() => {
      });
      this.assetObserver = new MutationObserver((mutations) => {
        if (!this.widgetDirectory) {
          return;
        }
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.target instanceof Element) {
            rewriteElementAssetUrls(mutation.target, this.widgetDirectory);
            continue;
          }
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof Element) {
              rewriteTreeAssetUrls(node, this.widgetDirectory);
            }
          }
        }
      });
      this.logic = new WidgetImpl({
        mount,
        payload: this.payload,
        setLoading: (loading) => this.setLoading(Boolean(loading)),
        focusWidgetView: () => focusWidgetView(
          String(this.payload?.configuredWidgetId ?? "").trim()
        ),
        createTcpSocket: (options2) => new RuntimeTcpSocket(
          options2,
          this.hasEventAccessPermission()
        ),
        on: (eventName, selector, handler) => this.on(eventName, selector, handler)
      });
      this.cleanupSignalSubscriptions = bindSignals(this.logic, () => this.render());
      this.assetObserver.observe(this.mount, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "href", "poster", "srcset", "style"]
      });
    }
    onInit() {
      this.render();
      this.logic.onInit?.();
    }
    onUpdate(payload) {
      this.payload = payload ?? {};
      this.logic.onUpdate?.(this.payload);
      this.render();
    }
    onDestroy() {
      this.cleanupSignalSubscriptions();
      while (this.cleanups.length > 0) {
        const cleanup = this.cleanups.pop();
        cleanup?.();
      }
      this.assetObserver.disconnect();
      this.logic.onDestroy?.();
      this.mount.innerHTML = "";
    }
    hasEventAccessPermission() {
      const config = this.payload?.config;
      return Boolean(
        config && typeof config === "object" && config.allowEventAccess === true
      );
    }
    render() {
      const scope = createScope(this.logic, this.payload);
      this.widgetDirectory = String(
        this.payload?.widgetDirectory ?? this.payload?.directory ?? ""
      ).trim();
      const finalTemplate = rewriteInstallPathPlaceholders(options.template, this.widgetDirectory);
      const finalStyles = rewriteInstallPathPlaceholders(options.styles, this.widgetDirectory);
      const renderTemplate = createTemplateRenderer(finalTemplate);
      const html = renderTemplate(scope);
      this.mount.innerHTML = `<style>${finalStyles}</style>${html}`;
      this.mount.setAttribute("data-displayduck-render-empty", html.trim().length === 0 ? "true" : "false");
      rewriteTreeAssetUrls(this.mount, this.widgetDirectory);
      this.logic.afterRender?.();
    }
    on(eventName, selector, handler) {
      const listener = (event) => {
        const target = event.target;
        const matched = target?.closest(selector);
        if (!matched || !this.mount.contains(matched)) {
          return;
        }
        handler(event, matched);
      };
      this.mount.addEventListener(eventName, listener);
      const cleanup = () => this.mount.removeEventListener(eventName, listener);
      this.cleanups.push(cleanup);
      return cleanup;
    }
  };
};
class EventEmitter {
  constructor() {
    this.listenersMap = /* @__PURE__ */ new Map();
  }
  addListener(eventName, listener) {
    return this.on(eventName, listener);
  }
  on(eventName, listener) {
    const listeners = this.listenersMap.get(eventName) ?? [];
    listeners.push({ listener, once: false });
    this.listenersMap.set(eventName, listeners);
    return this;
  }
  once(eventName, listener) {
    const listeners = this.listenersMap.get(eventName) ?? [];
    listeners.push({ listener, once: true });
    this.listenersMap.set(eventName, listeners);
    return this;
  }
  off(eventName, listener) {
    return this.removeListener(eventName, listener);
  }
  removeListener(eventName, listener) {
    const listeners = this.listenersMap.get(eventName);
    if (!listeners?.length) {
      return this;
    }
    const nextListeners = listeners.filter((entry) => entry.listener !== listener);
    if (nextListeners.length > 0) {
      this.listenersMap.set(eventName, nextListeners);
    } else {
      this.listenersMap.delete(eventName);
    }
    return this;
  }
  removeAllListeners(eventName) {
    if (eventName === void 0) {
      this.listenersMap.clear();
      return this;
    }
    this.listenersMap.delete(eventName);
    return this;
  }
  emit(eventName, ...args) {
    const listeners = this.listenersMap.get(eventName);
    if (!listeners?.length) {
      return false;
    }
    const snapshot = [...listeners];
    for (const entry of snapshot) {
      entry.listener(...args);
      if (entry.once) {
        this.removeListener(eventName, entry.listener);
      }
    }
    return true;
  }
  listeners(eventName) {
    return (this.listenersMap.get(eventName) ?? []).map((entry) => entry.listener);
  }
  listenerCount(eventName) {
    return this.listeners(eventName).length;
  }
}
const uuid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  let value = "";
  for (let index = 0; index < 32; index += 1) {
    if (index === 8 || index === 12 || index === 16 || index === 20) {
      value += "-";
    }
    let nibble;
    if (index === 12) {
      nibble = 4;
    } else {
      const random = Math.random() * 16 | 0;
      nibble = index === 16 ? random & 3 | 8 : random;
    }
    value += nibble.toString(16);
  }
  return value;
};
const OPCodes = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4
};
const CONNECT_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 250;
const ENDPOINT_CACHE_TTL_MS = 15e3;
let endpointCache = null;
let endpointDiscoveryPromise = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const getPlatform = () => {
  const platform = (globalThis.navigator?.platform ?? "").toLowerCase();
  if (platform.includes("win")) {
    return "win32";
  }
  return "unix";
};
const getCandidateEndpoints = (client) => {
  const custom = Array.isArray(client.options?.ipcEndpoints) ? client.options.ipcEndpoints.filter((value) => typeof value === "string" && value.trim().length > 0) : [];
  if (custom.length > 0) {
    return custom;
  }
  const platform = getPlatform();
  const candidates = [];
  for (const build of ["discord-ipc", "discord-canary-ipc", "discord-ptb-ipc"]) {
    for (let i = 0; i < 10; i++) {
      if (platform === "win32") {
        candidates.push(`\\\\.\\pipe\\${build}-${i}`);
      } else {
        candidates.push(`/tmp/${build}-${i}`);
      }
    }
  }
  return candidates;
};
const hasCustomEndpoints = (client) => {
  return Array.isArray(client.options?.ipcEndpoints) && client.options.ipcEndpoints.some((value) => typeof value === "string" && value.trim().length > 0);
};
const getReachableEndpoints = async (client) => {
  const candidates = getCandidateEndpoints(client);
  const cacheKey = candidates.join("\0");
  if (endpointCache && endpointCache.key === cacheKey && endpointCache.expiresAt > Date.now()) {
    return endpointCache.endpoints;
  }
  if (endpointDiscoveryPromise?.key === cacheKey) {
    return endpointDiscoveryPromise.promise;
  }
  const promise = Promise.all(
    candidates.map(async (endpoint) => ({
      endpoint,
      exists: await ipcTransportEndpointExists(endpoint).catch(() => false)
    }))
  ).then((checks) => {
    const endpoints = checks.filter((entry) => entry.exists).map((entry) => entry.endpoint);
    endpointCache = {
      key: cacheKey,
      endpoints,
      expiresAt: Date.now() + ENDPOINT_CACHE_TTL_MS
    };
    return endpoints;
  }).finally(() => {
    if (endpointDiscoveryPromise?.key === cacheKey) {
      endpointDiscoveryPromise = null;
    }
  });
  endpointDiscoveryPromise = { key: cacheKey, promise };
  return promise;
};
const getSharedSessionId = (clientId, endpoint) => {
  let hash = 2166136261;
  for (const character of `discord:${clientId ?? ""}\0${endpoint}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `displayduck-discord-ipc-${(hash >>> 0).toString(16)}`;
};
const concatBytes = (left, right) => {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
};
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});
const toTransportError = (payload) => {
  if (payload instanceof Error) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    const record = payload;
    const message = String(record.message ?? "").trim();
    const code = typeof record.code === "number" || typeof record.code === "string" ? String(record.code).trim() : "";
    if (message || code) {
      const error = new Error(
        [message, code ? `(code ${code})` : ""].filter(Boolean).join(" ")
      );
      if (code) {
        error.code = code;
      }
      return error;
    }
  }
  return new Error(String(payload ?? "connection closed"));
};
const encode = (op, data) => {
  const payload = encoder.encode(JSON.stringify(data));
  const packet = new Uint8Array(8 + payload.length);
  const view = new DataView(packet.buffer);
  view.setInt32(0, op, true);
  view.setInt32(4, payload.length, true);
  packet.set(payload, 8);
  return packet;
};
class IPCTransport extends EventEmitter {
  constructor(client) {
    super();
    this.socket = null;
    this.buffer = new Uint8Array(0);
    this.connectPromise = null;
    this.connectionGeneration = 0;
    this.client = client;
  }
  async connect() {
    if (this.socket) {
      return false;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    const generation = this.connectionGeneration;
    this.connectPromise = this.connectInternal(generation).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }
  send(data, op = OPCodes.FRAME) {
    if (!this.socket) {
      throw new Error("IPC transport is not connected");
    }
    const socket = this.socket;
    void socket.write(encode(op, data)).catch((error) => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.emit("close", error instanceof Error ? error : new Error(String(error)));
    });
  }
  async close() {
    this.connectionGeneration += 1;
    this.connectPromise = null;
    if (!this.socket) {
      this.buffer = new Uint8Array(0);
      return;
    }
    const socket = this.socket;
    this.socket = null;
    this.buffer = new Uint8Array(0);
    await socket.close();
  }
  ping() {
    this.send(uuid(), OPCodes.PING);
  }
  decode(chunk) {
    this.buffer = concatBytes(this.buffer, chunk);
    while (this.buffer.length >= 8) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
      const op = view.getInt32(0, true);
      const length = view.getInt32(4, true);
      const totalLength = 8 + length;
      if (this.buffer.length < totalLength) {
        return;
      }
      const payload = this.buffer.slice(8, totalLength);
      this.buffer = this.buffer.slice(totalLength);
      let data = null;
      try {
        data = JSON.parse(decoder.decode(payload));
      } catch {
        continue;
      }
      if (op === OPCodes.PING) {
        this.send(data, OPCodes.PONG);
        continue;
      }
      if (op === OPCodes.FRAME) {
        if (!data || typeof data !== "object") {
          continue;
        }
        this.emit("message", data);
        continue;
      }
      if (op === OPCodes.CLOSE) {
        this.emit("close", toTransportError(data));
      }
    }
  }
  async connectInternal(generation) {
    this.buffer = new Uint8Array(0);
    const candidateEndpoints = getCandidateEndpoints(this.client);
    const reachableEndpoints = await getReachableEndpoints(this.client);
    if (generation !== this.connectionGeneration) {
      throw new Error("Discord IPC connection was cancelled.");
    }
    const endpoints = reachableEndpoints.length > 0 ? reachableEndpoints : hasCustomEndpoints(this.client) ? candidateEndpoints : [];
    let lastError = null;
    if (endpoints.length === 0) {
      throw new Error("Discord IPC endpoint is not available.");
    }
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS; attempt += 1) {
      for (const endpoint of endpoints) {
        const transport = new IpcTransport({
          endpoint,
          sessionId: getSharedSessionId(this.client.clientId, endpoint)
        });
        const unbindOpen = transport.on("open", () => {
          this.emit("open");
        });
        const unbindData = transport.on("data", (chunk) => {
          this.decode(chunk);
        });
        const unbindClose = transport.on("close", (payload) => {
          if (this.socket === transport) {
            this.socket = null;
          }
          this.buffer = new Uint8Array(0);
          this.emit("close", payload.error ? new Error(payload.error) : toTransportError(payload));
        });
        try {
          const reused = await transport.connectWithInitialWrite(
            encode(OPCodes.HANDSHAKE, {
              v: 1,
              client_id: this.client.clientId
            })
          );
          if (generation !== this.connectionGeneration) {
            await transport.close().catch(() => void 0);
            throw new Error("Discord IPC connection was cancelled.");
          }
          this.socket = transport;
          return reused;
        } catch (error) {
          unbindOpen();
          unbindData();
          unbindClose();
          await transport.close().catch(() => void 0);
          lastError = error;
        }
      }
      if (attempt < CONNECT_ATTEMPTS - 1) {
        await sleep(CONNECT_RETRY_DELAY_MS * (attempt + 1));
      }
    }
    if (reachableEndpoints.length > 0) {
      throw lastError instanceof Error ? lastError : new Error("Discord IPC endpoint is available, but the connection did not complete.");
    }
    throw lastError instanceof Error ? lastError : new Error("Could not connect");
  }
}
const keyMirror = (values) => {
  const result = {};
  for (const value of values) {
    result[value] = value;
  }
  return result;
};
const RPCCommands = keyMirror([
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
]);
const RPCEvents = keyMirror([
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
]);
const RelationshipTypes = {
  NONE: 0,
  FRIEND: 1,
  BLOCKED: 2,
  PENDING_INCOMING: 3,
  PENDING_OUTGOING: 4,
  IMPLICIT: 5
};
const RPC_REQUEST_TIMEOUT_MS = 8e3;
const subKey = (event, args) => {
  return `${event}${JSON.stringify(args)}`;
};
const getProcessId = (options, args) => {
  const explicitPid = typeof args.pid === "number" ? args.pid : void 0;
  if (typeof explicitPid === "number") {
    return explicitPid;
  }
  return typeof options.pid === "number" ? options.pid : 0;
};
const createFormBody = (values) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    body.set(key, trimmed);
  }
  return body;
};
const readApiErrorMessage = (body) => {
  if (!body || typeof body !== "object") {
    return "";
  }
  const error = "error" in body && typeof body.error === "string" ? body.error : "";
  const description = "error_description" in body && typeof body.error_description === "string" ? body.error_description : "";
  return [error, description].filter(Boolean).join(": ");
};
const toBase64Url = (bytes) => {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
const createPkceVerifier = () => {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};
const createPkceChallenge = async (verifier) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
};
class Client extends EventEmitter {
  constructor(options = {}) {
    super();
    this.accessToken = null;
    this.refreshToken = null;
    this.clientId = null;
    this.application = null;
    this.user = null;
    this.endpoint = "https://discord.com/api/v10";
    this._expecting = /* @__PURE__ */ new Map();
    this._subscriptions = /* @__PURE__ */ new Map();
    this.rpcSubscriptions = /* @__PURE__ */ new Map();
    this.options = options;
    this.transport = new IPCTransport(this);
    this.transport.on("message", this._onRpcMessage.bind(this));
    this.transport.on("close", (error) => {
      this._expecting.forEach((entry) => {
        if (entry.timeout) {
          clearTimeout(entry.timeout);
        }
        entry.reject(error instanceof Error ? error : new Error("connection closed"));
      });
      this._expecting.clear();
      this.rpcSubscriptions.clear();
      this._connectPromise = void 0;
      this.emit("disconnected", error instanceof Error ? error : new Error("connection closed"));
    });
  }
  on(eventName, listener) {
    return super.on(eventName, listener);
  }
  off(eventName, listener) {
    return super.off(eventName, listener);
  }
  once(eventName, listener) {
    return super.once(eventName, listener);
  }
  emit(eventName, ...args) {
    return super.emit(eventName, ...args);
  }
  async fetch(method, path, { data, query } = {}) {
    const search = query ? `?${new URLSearchParams(query).toString()}` : "";
    const headers = {};
    if (typeof this.accessToken === "string" && this.accessToken.trim().length > 0) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    if (data instanceof URLSearchParams) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const response = await fetch(`${this.endpoint}${path}${search}`, {
      method,
      body: data,
      headers
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(
        `Discord API request failed: ${response.status} ${response.statusText}`
      );
      error.body = body;
      error.status = response.status;
      throw error;
    }
    return body;
  }
  connect(clientId) {
    if (this._connectPromise && this.clientId === clientId) {
      return this._connectPromise;
    }
    if (this.clientId && this.clientId !== clientId) {
      void this.destroy().catch(() => void 0);
      this._connectPromise = void 0;
    }
    if (!this.transport.socket) {
      this._connectPromise = void 0;
    }
    this._connectPromise = new Promise((resolve, reject) => {
      this.clientId = clientId;
      const onConnected = () => {
        cleanup();
        resolve(this);
      };
      const onDisconnected = (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error("connection closed"));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.off("connected", onConnected);
        this.off("disconnected", onDisconnected);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("RPC_CONNECTION_TIMEOUT"));
      }, 1e4);
      this.on("connected", onConnected);
      this.on("disconnected", onDisconnected);
      this.transport.connect().then((reused) => {
        if (reused) {
          onConnected();
        }
      }).catch((error) => {
        cleanup();
        reject(error);
      });
    }).catch((error) => {
      this._connectPromise = void 0;
      throw error;
    });
    return this._connectPromise;
  }
  async login(options) {
    await this.connect(options.clientId);
    if (!options.scopes) {
      this.emit("ready");
      return this;
    }
    if (options.refreshToken) {
      const auth = await this.refreshOAuthToken(options);
      if (auth !== null) {
        options.accessToken = auth.access_token;
        options.refreshToken = auth.refresh_token;
        this.accessToken = auth.access_token;
        this.refreshToken = auth.refresh_token;
      } else {
        options.accessToken = void 0;
        options.refreshToken = void 0;
      }
    }
    if (!options.accessToken || !options.refreshToken) {
      const auth = await this.authorize(options);
      options.accessToken = auth.access_token;
      options.refreshToken = auth.refresh_token;
      this.accessToken = auth.access_token;
      this.refreshToken = auth.refresh_token;
    }
    return this.authenticate(options);
  }
  request(cmd, args, evt) {
    return new Promise((resolve, reject) => {
      if (!this.transport.socket) {
        reject(new Error("connection closed"));
        return;
      }
      const nonce = uuid();
      const timeout = setTimeout(() => {
        const pending = this._expecting.get(nonce);
        if (!pending) {
          return;
        }
        this._expecting.delete(nonce);
        pending.reject(new Error(`Discord RPC request timed out: ${cmd}.`));
      }, RPC_REQUEST_TIMEOUT_MS);
      this._expecting.set(nonce, { resolve, reject, timeout });
      try {
        this.transport.send({ cmd, args, evt, nonce });
      } catch (error) {
        clearTimeout(timeout);
        this._expecting.delete(nonce);
        reject(error);
      }
    });
  }
  _onRpcMessage(message) {
    if (message.cmd === RPCCommands.DISPATCH && message.evt === RPCEvents.READY) {
      if (message.data && typeof message.data === "object" && "user" in message.data) {
        this.user = message.data.user ?? null;
      }
      this.emit("connected");
      return;
    }
    if (message.evt === "ERROR" && !message.nonce) {
      const data = message.data ?? {};
      const error = new Error(data.message ?? "RPC handshake failed");
      error.code = data.code;
      error.data = message.data;
      this.emit("disconnected", error);
      return;
    }
    if (message.nonce && this._expecting.has(message.nonce)) {
      const request = this._expecting.get(message.nonce);
      if (!request) {
        return;
      }
      if (message.evt === "ERROR") {
        const data = message.data ?? {};
        const error = new Error(data.message ?? "RPC error");
        error.code = data.code;
        error.data = message.data;
        if (request.timeout) {
          clearTimeout(request.timeout);
        }
        request.reject(error);
      } else {
        if (request.timeout) {
          clearTimeout(request.timeout);
        }
        request.resolve(message.data);
      }
      this._expecting.delete(message.nonce);
      return;
    }
    this.emit(message.evt ?? "message", message.data);
  }
  async authorize({ scopes, clientSecret, rpcToken, redirectUri, prompt } = { clientId: "" }) {
    let nextRpcToken = rpcToken;
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    if (clientSecret && rpcToken === true) {
      const body = await this.fetch("POST", "/oauth2/token/rpc", {
        data: createFormBody({
          client_id: this.clientId || "",
          client_secret: clientSecret
        })
      });
      nextRpcToken = body.rpc_token;
    }
    const { code } = await this.request("AUTHORIZE", {
      scopes,
      client_id: this.clientId,
      prompt,
      rpc_token: nextRpcToken,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    try {
      return await this.fetch("POST", "/oauth2/token", {
        data: createFormBody({
          client_id: this.clientId || "",
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          code_verifier: verifier,
          redirect_uri: redirectUri || ""
        })
      });
    } catch (error) {
      if (error instanceof Error && "status" in error && error.status === 401) {
        const details = "body" in error ? readApiErrorMessage(error.body) : "";
        throw new Error(
          [
            `Authorization failed (401) while exchanging the Discord OAuth code.`,
            `This widget authorizes directly from the client, so your Discord app must have Public Client enabled unless you are using a backend/client secret flow.`,
            `Client ID: ${this.clientId || "(missing)"}. Redirect URI used: ${redirectUri || "(missing)"}.`,
            `Make sure that exact redirect is listed on the OAuth2 page and that the Public Client toggle is enabled for direct widget authorization.`,
            details ? `Discord response: ${details}.` : ""
          ].filter(Boolean).join(" ")
        );
      }
      throw error;
    }
  }
  async authenticate(options) {
    try {
      const { application, user } = await this.request(
        "AUTHENTICATE",
        {
          access_token: options.accessToken
        }
      );
      this.accessToken = options.accessToken;
      this.refreshToken = options.refreshToken;
      this.application = application;
      this.user = user;
      this.emit("ready");
      return this;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === 401) {
        throw new Error("Authentication failed. The provided access token is invalid or has expired.");
      }
      throw error;
    }
  }
  async refreshOAuthToken(options) {
    try {
      const response = await fetch(`${this.endpoint}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: createFormBody({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          grant_type: "refresh_token",
          refresh_token: options.refreshToken || ""
        })
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      return null;
    }
  }
  getGuild(id, timeout) {
    return this.request(RPCCommands.GET_GUILD, { guild_id: id, timeout });
  }
  async getGuilds(timeout) {
    const { guilds } = await this.request(RPCCommands.GET_GUILDS, { timeout });
    return guilds;
  }
  getChannel(id, timeout) {
    return this.request(RPCCommands.GET_CHANNEL, { channel_id: id, timeout });
  }
  async getChannels(id, timeout) {
    const { channels } = await this.request(RPCCommands.GET_CHANNELS, { guild_id: id, timeout });
    return channels;
  }
  async getSelectedVoiceChannel() {
    return this.request(RPCCommands.GET_SELECTED_VOICE_CHANNEL);
  }
  setCertifiedDevices(devices) {
    return this.request(RPCCommands.SET_CERTIFIED_DEVICES, {
      devices: devices.map((device) => ({
        type: device.type,
        id: device.uuid,
        vendor: device.vendor,
        model: device.model,
        related: device.related,
        echo_cancellation: device.echoCancellation,
        noise_suppression: device.noiseSuppression,
        automatic_gain_control: device.automaticGainControl,
        hardware_mute: device.hardwareMute
      }))
    });
  }
  setPushToTalk(state) {
    return this.request(RPCCommands.PUSH_TO_TALK, { active: state });
  }
  setUserVoiceSettings(id, settings) {
    return this.request(RPCCommands.SET_USER_VOICE_SETTINGS, {
      user_id: id,
      ...settings
    });
  }
  selectVoiceChannel(id, { timeout, force = false } = {}) {
    return this.request(RPCCommands.SELECT_VOICE_CHANNEL, { channel_id: id, timeout, force });
  }
  selectTextChannel(id, { timeout } = {}) {
    return this.request(RPCCommands.SELECT_TEXT_CHANNEL, { channel_id: id, timeout });
  }
  getVoiceSettings() {
    return this.request(RPCCommands.GET_VOICE_SETTINGS);
  }
  setVoiceSettings(args) {
    return this.request(RPCCommands.SET_VOICE_SETTINGS, args);
  }
  captureShortcut(callback) {
    const subscriptionId = subKey(RPCEvents.CAPTURE_SHORTCUT_CHANGE);
    const stop = () => {
      this._subscriptions.delete(subscriptionId);
      return this.request(RPCCommands.CAPTURE_SHORTCUT, { action: "STOP" });
    };
    this._subscriptions.set(subscriptionId, ({ shortcut }) => {
      callback(shortcut, stop);
    });
    return this.request(RPCCommands.CAPTURE_SHORTCUT, { action: "START" }).then(() => stop);
  }
  setActivity(args = {}) {
    let timestamps;
    let assets;
    let party;
    let secrets;
    if (args.startTimestamp || args.endTimestamp) {
      timestamps = {
        start: args.startTimestamp,
        end: args.endTimestamp
      };
      if (timestamps.start instanceof Date) {
        timestamps.start = Math.round(timestamps.start.getTime());
      }
      if (timestamps.end instanceof Date) {
        timestamps.end = Math.round(timestamps.end.getTime());
      }
      if (timestamps.start > 2147483647e3) {
        throw new RangeError("timestamps.start must fit into a unix timestamp");
      }
      if (timestamps.end > 2147483647e3) {
        throw new RangeError("timestamps.end must fit into a unix timestamp");
      }
    }
    if (args.largeImageKey || args.largeImageText || args.smallImageKey || args.smallImageText) {
      assets = {
        large_image: args.largeImageKey,
        large_text: args.largeImageText,
        small_image: args.smallImageKey,
        small_text: args.smallImageText
      };
    }
    if (args.partySize || args.partyId || args.partyMax) {
      party = { id: args.partyId };
      if (args.partySize || args.partyMax) {
        party.size = [args.partySize, args.partyMax];
      }
    }
    if (args.matchSecret || args.joinSecret || args.spectateSecret) {
      secrets = {
        match: args.matchSecret,
        join: args.joinSecret,
        spectate: args.spectateSecret
      };
    }
    return this.request(RPCCommands.SET_ACTIVITY, {
      pid: getProcessId(this.options, args),
      activity: {
        state: args.state,
        details: args.details,
        timestamps,
        assets,
        party,
        secrets,
        buttons: args.buttons,
        instance: !!args.instance
      }
    });
  }
  clearActivity() {
    return this.request(RPCCommands.SET_ACTIVITY, { pid: getProcessId(this.options, {}) });
  }
  sendJoinInvite(user) {
    return this.request(RPCCommands.SEND_ACTIVITY_JOIN_INVITE, {
      user_id: typeof user === "string" ? user : user.id
    });
  }
  sendJoinRequest(user) {
    return this.request(RPCCommands.SEND_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof user === "string" ? user : user.id
    });
  }
  toggleVideo() {
    return this.request(RPCCommands.TOGGLE_VIDEO);
  }
  toggleScreenshare() {
    return this.request(RPCCommands.TOGGLE_SCREENSHARE);
  }
  getSoundboardSounds() {
    return this.request(RPCCommands.GET_SOUNDBOARD_SOUNDS);
  }
  playSoundboardSound(guild_id, sound_id) {
    return this.request(RPCCommands.PLAY_SOUNDBOARD_SOUND, { guild_id, sound_id });
  }
  closeJoinRequest(user) {
    return this.request(RPCCommands.CLOSE_ACTIVITY_JOIN_REQUEST, {
      user_id: typeof user === "string" ? user : user.id
    });
  }
  createLobby(type, capacity, metadata) {
    return this.request(RPCCommands.CREATE_LOBBY, { type, capacity, metadata });
  }
  updateLobby(lobby, {
    type,
    owner,
    capacity,
    metadata
  } = {}) {
    return this.request(RPCCommands.UPDATE_LOBBY, {
      id: typeof lobby === "string" ? lobby : lobby.id,
      type,
      owner_id: typeof owner === "string" ? owner : owner?.id,
      capacity,
      metadata
    });
  }
  deleteLobby(lobby) {
    return this.request(RPCCommands.DELETE_LOBBY, { id: typeof lobby === "string" ? lobby : lobby.id });
  }
  connectToLobby(id, secret) {
    return this.request(RPCCommands.CONNECT_TO_LOBBY, { id, secret });
  }
  sendToLobby(lobby, data) {
    return this.request(RPCCommands.SEND_TO_LOBBY, { id: typeof lobby === "string" ? lobby : lobby.id, data });
  }
  disconnectFromLobby(lobby) {
    return this.request(RPCCommands.DISCONNECT_FROM_LOBBY, { id: typeof lobby === "string" ? lobby : lobby.id });
  }
  updateLobbyMember(lobby, user, metadata) {
    return this.request(RPCCommands.UPDATE_LOBBY_MEMBER, {
      lobby_id: typeof lobby === "string" ? lobby : lobby.id,
      user_id: typeof user === "string" ? user : user.id,
      metadata
    });
  }
  getRelationships() {
    const types = Object.keys(RelationshipTypes);
    return this.request(
      RPCCommands.GET_RELATIONSHIPS
    ).then((response) => {
      return response.relationships.map((relationship) => ({
        ...relationship,
        type: types[relationship.type]
      }));
    });
  }
  async subscribe(event, args) {
    const key = subKey(event, args);
    let subscription = this.rpcSubscriptions.get(key);
    if (!subscription) {
      subscription = {
        event,
        args,
        count: 0,
        ready: this.request(RPCCommands.SUBSCRIBE, args, event)
      };
      this.rpcSubscriptions.set(key, subscription);
    }
    subscription.count += 1;
    try {
      await subscription.ready;
    } catch (error) {
      if (this.rpcSubscriptions.get(key) === subscription) {
        this.rpcSubscriptions.delete(key);
      }
      throw error;
    }
    let active = true;
    return {
      unsubscribe: async () => {
        if (!active) {
          return;
        }
        active = false;
        const current = this.rpcSubscriptions.get(key);
        if (current !== subscription) {
          return;
        }
        current.count = Math.max(0, current.count - 1);
        if (current.count > 0) {
          return;
        }
        this.rpcSubscriptions.delete(key);
        await current.ready.catch(() => void 0);
        await this.request(RPCCommands.UNSUBSCRIBE, current.args, current.event).catch(() => void 0);
      }
    };
  }
  isAuthenticated() {
    return Boolean(this.accessToken && this.application && this.user);
  }
  async destroy() {
    const error = new Error("Discord RPC client was closed.");
    for (const pending of this._expecting.values()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(error);
    }
    this._expecting.clear();
    this._subscriptions.clear();
    this.rpcSubscriptions.clear();
    this._connectPromise = void 0;
    await this.transport.close();
  }
}
const STORAGE_PREFIX = "displayduck:discord-ipc:token:";
const DEFAULT_DISCORD_REDIRECT_URI = "http://localhost";
const DISCORD_SCOPES = ["rpc", "rpc.voice.read", "rpc.voice.write"];
const DISCORD_IPC_BUILDS = ["discord-ipc", "discord-canary-ipc", "discord-ptb-ipc"];
const SPEAKING_TIMEOUT_MS = 1e3;
const SPEAKING_WATCHDOG_INTERVAL_MS = 500;
const VOICE_POLL_INTERVAL_MS = 3e3;
const RECONNECT_BASE_MS = 5e3;
const RECONNECT_MAX_MS = 3e4;
const RECONNECT_JITTER_MS = 750;
const DISCORD_STATUS_CACHE_MS = 2500;
const SHARED_CLIENT_IDLE_MS = 3e3;
let discordStatusCache = null;
let discordStatusProbe = null;
const sharedDiscordClients = (() => {
  const globalScope = globalThis;
  if (!globalScope.__displayduckDiscordClients) {
    globalScope.__displayduckDiscordClients = /* @__PURE__ */ new Map();
  }
  return globalScope.__displayduckDiscordClients;
})();
const acquireSharedDiscordClient = (clientId) => {
  let shared = sharedDiscordClients.get(clientId);
  if (!shared) {
    shared = {
      client: new Client(),
      clientId,
      references: 0,
      closeTimer: null
    };
    sharedDiscordClients.set(clientId, shared);
  }
  if (shared.closeTimer) {
    clearTimeout(shared.closeTimer);
    shared.closeTimer = null;
  }
  shared.references += 1;
  return shared.client;
};
const releaseSharedDiscordClient = (client) => {
  const shared = Array.from(sharedDiscordClients.values()).find((candidate) => candidate.client === client);
  if (!shared) {
    return;
  }
  shared.references = Math.max(0, shared.references - 1);
  if (shared.references > 0 || shared.closeTimer) {
    return;
  }
  shared.closeTimer = setTimeout(() => {
    shared.closeTimer = null;
    if (shared.references > 0) {
      return;
    }
    sharedDiscordClients.delete(shared.clientId);
    void shared.client.destroy();
  }, SHARED_CLIENT_IDLE_MS);
};
const isRecord = (value) => {
  return Boolean(value) && typeof value === "object";
};
const readString = (value) => {
  return typeof value === "string" ? value.trim() : "";
};
const readBoolean = (value) => {
  return value === true;
};
const avatarExtension = (hash) => {
  return hash.startsWith("a_") ? "gif" : "png";
};
const toAvatarUrl = (path, hash) => {
  const normalizedHash = readString(hash);
  if (!normalizedHash) {
    return void 0;
  }
  return `https://cdn.discordapp.com/${path}/${normalizedHash}.${avatarExtension(normalizedHash)}?size=128`;
};
const getDiscordIpcEndpoints = () => {
  const endpoints = [];
  const isWindows = (globalThis.navigator?.platform ?? "").toLowerCase().includes("win");
  for (const build of DISCORD_IPC_BUILDS) {
    for (let index = 0; index < 10; index += 1) {
      endpoints.push(isWindows ? `\\\\.\\pipe\\${build}-${index}` : `/tmp/${build}-${index}`);
    }
  }
  return endpoints;
};
let DisplayDuckWidget$1 = class DisplayDuckWidget {
  constructor(ctx) {
    this.ctx = ctx;
    this.client = null;
    this.clientListenerCleanups = [];
    this.subscriptions = [];
    this.reconnectTimer = null;
    this.speakingWatchdog = null;
    this.voicePollTimer = null;
    this.reconnectAttempts = 0;
    this.runId = 0;
    this.selectedChannelId = "";
    this.liveSpeaking = /* @__PURE__ */ new Map();
    this.payload = signal(ctx.payload ?? {});
    this.state = signal({
      message: "Waiting for Discord authorization.",
      authenticated: false,
      participants: [],
      isLoading: false,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      clientId: this.clientId()
    });
  }
  afterRender() {
    this.ctx.mount.style.display = "";
    for (const participant of this.state().participants) {
      this.patchParticipantSpeaking(
        participant.id,
        this.liveSpeaking.get(participant.id)?.speaking ?? participant.speaking
      );
    }
  }
  onInit() {
    this.ctx.on("click", "#login-btn", () => {
      if (this.state().isLoading) {
        return;
      }
      if (this.state().authorizationRequired) {
        void this.authorize();
        return;
      }
      void this.syncSession("Connecting to Discord...");
    });
    this.ctx.on("click", "[data-participant-id]", (_event, target) => {
      const participantId = target.getAttribute("data-participant-id")?.trim() ?? "";
      if (!participantId || this.state().isLoading) {
        return;
      }
      void this.toggleParticipantMute(participantId);
    });
    void this.initialize();
  }
  onUpdate(payload) {
    this.payload.set(payload ?? {});
    const nextClientId = this.clientId();
    if (nextClientId === this.state().clientId) {
      return;
    }
    this.invalidateRun();
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.cancelReconnect();
    this.liveSpeaking.clear();
    void this.destroyClient();
    this.patchState({
      clientId: nextClientId,
      authenticated: false,
      participants: [],
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      message: nextClientId ? "Client changed. Reconnecting to Discord." : "Set a Discord client ID to begin authorization.",
      isLoading: false
    });
    void this.syncSession("Connecting to Discord...");
  }
  onDestroy() {
    this.invalidateRun();
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.cancelReconnect();
    this.liveSpeaking.clear();
    void this.destroyClient();
  }
  async initialize() {
    await this.syncSession("Connecting to Discord...");
  }
  async syncSession(message) {
    const clientId = this.state().clientId;
    if (!clientId) {
      this.patchState({
        message: "Set a Discord client ID to begin authorization.",
        authenticated: false,
        participants: [],
        authorizationRequired: false,
        retryAvailable: false,
        hideableDisconnect: false,
        isLoading: false
      });
      return;
    }
    const runId = this.beginRun();
    this.setBusy(true, message);
    this.cancelReconnect();
    try {
      const client = await this.ensureConnected(clientId);
      if (!this.isCurrentRun(runId)) return;
      const storedToken = this.readStoredToken(clientId);
      if (client.isAuthenticated()) {
        await this.handleAuthenticated(client);
        return;
      }
      if (!storedToken?.accessToken) {
        this.requireAuthorization("Waiting for Discord authorization.");
        return;
      }
      if (await this.restoreStoredSession(client, storedToken)) {
        if (!this.isCurrentRun(runId)) return;
        await this.handleAuthenticated(client);
      }
    } catch (error) {
      if (!this.isCurrentRun(runId)) return;
      const isRunning = await this.isDiscordRunning();
      this.disconnect(
        error,
        isRunning ? "Could not connect to Discord." : "Discord is not running.",
        isRunning
      );
    } finally {
      if (this.isCurrentRun(runId)) {
        this.setBusy(false);
      }
    }
  }
  async authorize() {
    const clientId = this.state().clientId;
    const redirectUri = this.redirectUri();
    if (!clientId) {
      this.patchState({
        message: "Set a Discord client ID to begin authorization.",
        isLoading: false,
        authorizationRequired: false
      });
      return;
    }
    const runId = this.beginRun();
    this.setBusy(true, "Awaiting authorization in Discord client...");
    this.cancelReconnect();
    try {
      const client = await this.ensureConnected(clientId);
      if (!this.isCurrentRun(runId)) return;
      await client.login({
        clientId,
        redirectUri,
        scopes: [...DISCORD_SCOPES],
        prompt: "consent"
      });
      if (!this.isCurrentRun(runId)) return;
      this.persistClientTokens(clientId, client);
      await this.handleAuthenticated(client);
    } catch (error) {
      if (!this.isCurrentRun(runId)) return;
      if (this.shouldInvalidateToken(error)) {
        this.clearStoredToken(clientId);
      }
      this.requireAuthorization(this.formatError(error, "Discord authorization failed."));
    } finally {
      if (this.isCurrentRun(runId)) {
        this.setBusy(false);
      }
    }
  }
  async ensureConnected(clientId) {
    if (this.client?.clientId === clientId) {
      await this.client.connect(clientId);
      return this.client;
    }
    await this.destroyClient();
    const client = acquireSharedDiscordClient(clientId);
    this.client = client;
    this.selectedChannelId = "";
    this.bindClient(client);
    try {
      await client.connect(clientId);
      return client;
    } catch (error) {
      await this.destroyClient();
      throw error;
    }
  }
  bindClient(client) {
    this.unbindClientListeners();
    const onDisconnected = (error) => {
      if (this.client !== client) {
        return;
      }
      this.selectedChannelId = "";
      this.stopSpeakingWatchdog();
      this.stopVoicePolling();
      void this.clearSubscriptions(false);
      this.disconnect(error, "Lost connection to Discord.", true);
    };
    const refreshVoiceState = () => {
      if (this.client !== client || !this.state().authenticated) {
        return;
      }
      void this.refreshVoiceState();
    };
    const onVoiceChannelSelect = (_payload) => {
      refreshVoiceState();
    };
    const onVoiceStateCreate = () => refreshVoiceState();
    const onVoiceStateUpdate = () => refreshVoiceState();
    const onVoiceStateDelete = () => refreshVoiceState();
    const onSpeakingStart = (payload) => {
      this.applySpeaking(this.extractUserId(payload), true);
    };
    const onSpeakingStop = (payload) => {
      this.applySpeaking(this.extractUserId(payload), false);
    };
    client.on("disconnected", onDisconnected);
    client.on(RPCEvents.VOICE_CHANNEL_SELECT, onVoiceChannelSelect);
    client.on(RPCEvents.VOICE_STATE_CREATE, onVoiceStateCreate);
    client.on(RPCEvents.VOICE_STATE_UPDATE, onVoiceStateUpdate);
    client.on(RPCEvents.VOICE_STATE_DELETE, onVoiceStateDelete);
    client.on(RPCEvents.SPEAKING_START, onSpeakingStart);
    client.on(RPCEvents.SPEAKING_STOP, onSpeakingStop);
    this.clientListenerCleanups = [
      () => client.off("disconnected", onDisconnected),
      () => client.off(RPCEvents.VOICE_CHANNEL_SELECT, onVoiceChannelSelect),
      () => client.off(RPCEvents.VOICE_STATE_CREATE, onVoiceStateCreate),
      () => client.off(RPCEvents.VOICE_STATE_UPDATE, onVoiceStateUpdate),
      () => client.off(RPCEvents.VOICE_STATE_DELETE, onVoiceStateDelete),
      () => client.off(RPCEvents.SPEAKING_START, onSpeakingStart),
      () => client.off(RPCEvents.SPEAKING_STOP, onSpeakingStop)
    ];
  }
  unbindClientListeners() {
    for (const cleanup of this.clientListenerCleanups) {
      cleanup();
    }
    this.clientListenerCleanups = [];
  }
  async restoreStoredSession(client, token) {
    const clientId = this.state().clientId;
    if (!clientId) {
      return false;
    }
    try {
      await client.authenticate({
        clientId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken
      });
      this.persistClientTokens(clientId, client);
      return true;
    } catch (error) {
      if (!this.shouldInvalidateToken(error)) {
        this.disconnect(error, "Could not restore session.", true);
        return false;
      }
    }
    if (token.refreshToken) {
      try {
        const refreshed = await client.refreshOAuthToken({
          clientId,
          refreshToken: token.refreshToken
        });
        if (refreshed?.access_token) {
          const nextRefreshToken = refreshed.refresh_token ?? token.refreshToken;
          await client.authenticate({
            clientId,
            accessToken: refreshed.access_token,
            refreshToken: nextRefreshToken
          });
          this.persistToken(clientId, {
            accessToken: refreshed.access_token,
            refreshToken: nextRefreshToken
          });
          return true;
        }
      } catch (error) {
      }
    }
    this.clearStoredToken(clientId);
    this.requireAuthorization("Saved authorization expired. Please authorize again.");
    return false;
  }
  async handleAuthenticated(client) {
    this.reconnectAttempts = 0;
    this.cancelReconnect();
    this.patchState({
      authenticated: true,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      message: "Loading voice state..."
    });
    await this.refreshVoiceState();
    await this.subscribeToVoiceEvents();
    this.startSpeakingWatchdog();
    this.startVoicePolling();
  }
  async subscribeToVoiceEvents() {
    const client = this.client;
    if (!client) {
      return;
    }
    await this.clearSubscriptions();
    this.subscriptions.push(
      await client.subscribe(RPCEvents.VOICE_CHANNEL_SELECT)
    );
    if (!this.selectedChannelId) {
      return;
    }
    const args = { channel_id: this.selectedChannelId };
    for (const eventName of [
      RPCEvents.VOICE_STATE_CREATE,
      RPCEvents.VOICE_STATE_UPDATE,
      RPCEvents.VOICE_STATE_DELETE,
      RPCEvents.SPEAKING_START,
      RPCEvents.SPEAKING_STOP
    ]) {
      this.subscriptions.push(await client.subscribe(eventName, args));
    }
  }
  async clearSubscriptions(unsubscribe = true) {
    const subscriptions = this.subscriptions.splice(0, this.subscriptions.length);
    if (!unsubscribe) {
      return;
    }
    await Promise.all(
      subscriptions.map((subscription) => subscription.unsubscribe().catch(() => void 0))
    );
  }
  async refreshVoiceState() {
    const client = this.client;
    if (!client) {
      return;
    }
    let channel = null;
    try {
      channel = await client.getSelectedVoiceChannel();
    } catch (error) {
      if (this.client === client) {
        this.disconnect(error, "Failed to read the current voice channel.", true);
      }
      return;
    }
    if (this.client !== client) {
      return;
    }
    const nextChannelId = readString(channel?.id);
    if (nextChannelId !== this.selectedChannelId) {
      this.selectedChannelId = nextChannelId;
      await this.subscribeToVoiceEvents();
    }
    const currentParticipants = this.state().participants;
    const previous = new Map(currentParticipants.map((participant) => [participant.id, participant]));
    const now = Date.now();
    const participants = Array.isArray(channel?.voice_states) ? channel.voice_states.map((voiceState) => this.normalizeParticipant(voiceState, previous.get(readString(isRecord(voiceState?.user) ? voiceState.user.id : void 0)), now, channel)).filter((participant) => Boolean(participant)).sort((left, right) => this.participantName(left).localeCompare(this.participantName(right))) : [];
    const visibleParticipants = participants.some((participant) => participant.isSelf) ? participants : [];
    const nextMessage = visibleParticipants.length > 0 ? "" : "No active voice call or channel found.";
    const visibleIds = new Set(visibleParticipants.map((participant) => participant.id));
    for (const userId of this.liveSpeaking.keys()) {
      if (!visibleIds.has(userId)) {
        this.liveSpeaking.delete(userId);
      }
    }
    for (const participant of visibleParticipants) {
      this.patchParticipantSpeaking(participant.id, participant.speaking);
    }
    const participantsChanged = !this.areParticipantsEqual(currentParticipants, visibleParticipants);
    if (!participantsChanged && this.state().message === nextMessage && this.state().authenticated && !this.state().authorizationRequired && !this.state().retryAvailable) {
      return;
    }
    this.patchState({
      authenticated: true,
      authorizationRequired: false,
      retryAvailable: false,
      hideableDisconnect: false,
      participants: visibleParticipants,
      message: nextMessage
    });
  }
  normalizeParticipant(raw, existing, now, channel) {
    const user = isRecord(raw.user) ? raw.user : isRecord(raw.member) && isRecord(raw.member.user) ? raw.member.user : null;
    const userId = readString(user?.id);
    if (!userId) {
      return null;
    }
    const member = isRecord(raw.member) ? raw.member : null;
    const voiceState = isRecord(raw.voice_state) ? raw.voice_state : null;
    const nick = readString(raw.nick || member?.nick || (isRecord(voiceState?.member) ? voiceState.member.nick : void 0)) || void 0;
    const username = readString(user?.global_name) || readString(user?.username) || "?";
    const guildId = readString(
      voiceState?.guild_id || member?.guild_id || raw.guild_id || channel?.guild_id
    );
    const memberAvatarHash = readString(
      member?.avatar || raw.guild_avatar || raw.avatar || (isRecord(voiceState?.member) ? voiceState.member.avatar : void 0)
    );
    const userAvatarHash = readString(user?.avatar);
    const liveSpeaking = this.liveSpeaking.get(userId);
    const speaking = typeof raw.speaking === "boolean" ? raw.speaking : liveSpeaking?.speaking ?? existing?.speaking ?? false;
    const lastSpokeAt = speaking ? liveSpeaking?.lastSpokeAt ?? existing?.lastSpokeAt ?? now : liveSpeaking?.lastSpokeAt ?? existing?.lastSpokeAt ?? 0;
    this.liveSpeaking.set(userId, { speaking, lastSpokeAt });
    return {
      id: userId,
      username,
      nick,
      mute: {
        user: readBoolean(raw.mute),
        server: readBoolean(voiceState?.mute) || readBoolean(raw.server_mute),
        self: readBoolean(voiceState?.self_mute) || readBoolean(raw.self_mute)
      },
      deaf: {
        server: readBoolean(voiceState?.deaf) || readBoolean(raw.server_deaf),
        self: readBoolean(voiceState?.self_deaf) || readBoolean(raw.self_deaf)
      },
      speaking,
      isSelf: userId === this.currentUserId(),
      serverAvatar: guildId && memberAvatarHash ? toAvatarUrl(`guilds/${guildId}/users/${userId}/avatars`, memberAvatarHash) : void 0,
      avatar: userAvatarHash ? toAvatarUrl(`avatars/${userId}`, userAvatarHash) : void 0,
      lastSpokeAt
    };
  }
  applySpeaking(userId, speaking) {
    if (!userId) {
      return;
    }
    const participant = this.state().participants.find((entry) => entry.id === userId);
    const existingSpeaking = this.liveSpeaking.get(userId);
    if (!participant || existingSpeaking?.speaking === speaking) {
      return;
    }
    const lastSpokeAt = speaking ? Date.now() : existingSpeaking?.lastSpokeAt ?? participant.lastSpokeAt;
    this.liveSpeaking.set(userId, { speaking, lastSpokeAt });
    this.patchParticipantSpeaking(userId, speaking);
  }
  patchParticipantSpeaking(userId, speaking) {
    const participantElement = Array.from(
      this.ctx.mount.querySelectorAll("[data-participant-id]")
    ).find((element) => element.getAttribute("data-participant-id") === userId);
    const avatar = participantElement?.querySelector(".avatar");
    avatar?.classList.toggle("speaking", speaking);
  }
  async toggleParticipantMute(userId) {
    const client = this.client;
    const participant = this.state().participants.find((entry) => entry.id === userId);
    if (!client || !participant) {
      return;
    }
    try {
      await client.setUserVoiceSettings(userId, { mute: !participant.mute.user });
      await this.refreshVoiceState();
    } catch (error) {
      this.disconnect(error, "Failed to update voice settings.", true);
    }
  }
  startSpeakingWatchdog() {
    if (this.speakingWatchdog) {
      return;
    }
    this.speakingWatchdog = setInterval(() => {
      const now = Date.now();
      for (const [userId, speakingState] of this.liveSpeaking) {
        if (!speakingState.speaking || now - speakingState.lastSpokeAt <= SPEAKING_TIMEOUT_MS) {
          continue;
        }
        this.liveSpeaking.set(userId, {
          speaking: false,
          lastSpokeAt: speakingState.lastSpokeAt
        });
        this.patchParticipantSpeaking(userId, false);
      }
    }, SPEAKING_WATCHDOG_INTERVAL_MS);
  }
  stopSpeakingWatchdog() {
    if (!this.speakingWatchdog) {
      return;
    }
    clearInterval(this.speakingWatchdog);
    this.speakingWatchdog = null;
  }
  startVoicePolling() {
    if (this.voicePollTimer) {
      return;
    }
    this.voicePollTimer = setInterval(() => {
      if (!this.state().authenticated || this.state().authorizationRequired) {
        return;
      }
      void this.refreshVoiceState();
    }, VOICE_POLL_INTERVAL_MS);
  }
  stopVoicePolling() {
    if (!this.voicePollTimer) {
      return;
    }
    clearInterval(this.voicePollTimer);
    this.voicePollTimer = null;
  }
  disconnect(error, fallback, hideable) {
    this.reconnectAttempts += 1;
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.liveSpeaking.clear();
    this.patchState({
      authenticated: false,
      participants: [],
      authorizationRequired: false,
      retryAvailable: true,
      hideableDisconnect: hideable,
      message: this.formatError(error, fallback)
    });
    this.scheduleReconnect();
  }
  requireAuthorization(message) {
    this.stopSpeakingWatchdog();
    this.stopVoicePolling();
    this.liveSpeaking.clear();
    this.patchState({
      authenticated: false,
      participants: [],
      authorizationRequired: true,
      retryAvailable: false,
      hideableDisconnect: false,
      isLoading: false,
      message
    });
  }
  scheduleReconnect() {
    if (this.reconnectTimer || !this.state().clientId || this.state().authorizationRequired) {
      return;
    }
    const runId = this.runId;
    const backoff = Math.min(
      RECONNECT_BASE_MS * 2 ** Math.min(Math.max(0, this.reconnectAttempts - 1), 4),
      RECONNECT_MAX_MS
    );
    const delay = backoff + Math.round(Math.random() * RECONNECT_JITTER_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (runId !== this.runId || this.state().authenticated || this.state().authorizationRequired) {
        return;
      }
      void this.syncSession("Reconnecting to Discord...");
    }, delay);
  }
  cancelReconnect() {
    if (!this.reconnectTimer) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
  async destroyClient() {
    const client = this.client;
    this.client = null;
    this.selectedChannelId = "";
    this.unbindClientListeners();
    await this.clearSubscriptions();
    if (!client) {
      return;
    }
    releaseSharedDiscordClient(client);
  }
  currentUserId() {
    const user = this.client?.user;
    if (!isRecord(user)) {
      return "";
    }
    return readString(user.id);
  }
  extractUserId(payload) {
    if (!payload) {
      return "";
    }
    if (readString(payload.user_id)) {
      return readString(payload.user_id);
    }
    if (isRecord(payload.user)) {
      return readString(payload.user.id);
    }
    return "";
  }
  shadowsEnabled() {
    return Boolean(this.config("shadow", false));
  }
  alignmentClass() {
    const alignment = this.config("alignment", "top-left");
    return typeof alignment === "string" && alignment.length > 0 ? alignment : "top-left";
  }
  participantGridSize() {
    const configuredSize = String(this.config("participantSize", "default")).trim().toLowerCase();
    if (configuredSize.startsWith("small")) {
      return 1;
    }
    if (configuredSize.startsWith("large")) {
      return 3;
    }
    if (configuredSize.startsWith("xl")) {
      return 4;
    }
    if (configuredSize.startsWith("xxxl")) {
      return 6;
    }
    if (configuredSize.startsWith("xxl")) {
      return 5;
    }
    return 2;
  }
  showWidget() {
    return !this.shouldAutoHide();
  }
  showNames() {
    return Boolean(this.config("showNames", true));
  }
  participantClasses(participant) {
    const classes = [];
    if (participant.isSelf) {
      classes.push("self");
    }
    if (this.hasStatusIcon(participant)) {
      classes.push("muted");
    }
    return classes.join(" ");
  }
  participantAvatarUrl(participant) {
    return participant.serverAvatar || participant.avatar || "";
  }
  participantInitials(participant) {
    return this.initials(participant.username);
  }
  participantName(participant) {
    return participant.nick || participant.username;
  }
  hasStatusIcon(participant) {
    return participant.deaf.self || participant.deaf.server || participant.mute.self || participant.mute.server || participant.mute.user;
  }
  participantIsDeafened(participant) {
    return participant.deaf.self || participant.deaf.server;
  }
  areParticipantsEqual(current, next) {
    if (current.length !== next.length) {
      return false;
    }
    for (let index = 0; index < current.length; index += 1) {
      const left = current[index];
      const right = next[index];
      if (left.id !== right.id || left.username !== right.username || left.nick !== right.nick || left.isSelf !== right.isSelf || left.serverAvatar !== right.serverAvatar || left.avatar !== right.avatar || left.deaf.server !== right.deaf.server || left.deaf.self !== right.deaf.self || left.mute.user !== right.mute.user || left.mute.server !== right.mute.server || left.mute.self !== right.mute.self) {
        return false;
      }
    }
    return true;
  }
  patchState(patch) {
    this.state.update((state) => {
      for (const [key, value] of Object.entries(patch)) {
        if (state[key] !== value) {
          return { ...state, ...patch };
        }
      }
      return state;
    });
  }
  setBusy(isLoading, message) {
    this.state.update((state) => {
      const nextMessage = message ?? state.message;
      if (state.isLoading === isLoading && state.message === nextMessage) {
        return state;
      }
      return {
        ...state,
        isLoading,
        message: nextMessage
      };
    });
  }
  beginRun() {
    this.runId += 1;
    return this.runId;
  }
  invalidateRun() {
    this.runId += 1;
    this.setBusy(false);
  }
  isCurrentRun(runId) {
    return this.runId === runId;
  }
  config(key, fallback) {
    const config = this.payload().config;
    if (!isRecord(config)) {
      return fallback;
    }
    return config[key] ?? fallback;
  }
  clientId() {
    return String(this.config("clientId", "")).trim();
  }
  redirectUri() {
    return String(this.config("redirectUri", DEFAULT_DISCORD_REDIRECT_URI)).trim() || DEFAULT_DISCORD_REDIRECT_URI;
  }
  hasClientId() {
    return this.state().clientId.length > 0;
  }
  shouldAutoHide() {
    if (!Boolean(this.config("autoHide", false)) || !this.hasClientId()) {
      return false;
    }
    const state = this.state();
    if (state.authorizationRequired || state.retryAvailable && !state.hideableDisconnect) {
      return false;
    }
    return this.state().participants.length === 0;
  }
  readStoredToken(clientId) {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${clientId}`);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      const accessToken = readString(parsed.accessToken);
      const refreshToken = readString(parsed.refreshToken) || void 0;
      return accessToken ? { accessToken, refreshToken } : null;
    } catch {
      return null;
    }
  }
  persistClientTokens(clientId, client) {
    const accessToken = readString(client.accessToken);
    if (!accessToken) {
      return;
    }
    const storedRefreshToken = this.readStoredToken(clientId)?.refreshToken;
    this.persistToken(clientId, {
      accessToken,
      refreshToken: readString(client.refreshToken) || storedRefreshToken
    });
  }
  persistToken(clientId, token) {
    localStorage.setItem(`${STORAGE_PREFIX}${clientId}`, JSON.stringify(token));
  }
  clearStoredToken(clientId) {
    localStorage.removeItem(`${STORAGE_PREFIX}${clientId}`);
  }
  shouldInvalidateToken(error) {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return message.includes("invalid access token") || message.includes("invalid oauth2 access token") || message.includes("authentication failed") || message.includes("invalid_grant") || message.includes("401");
  }
  async isDiscordRunning() {
    if (discordStatusCache && discordStatusCache.expiresAt > Date.now()) {
      return discordStatusCache.running;
    }
    if (discordStatusProbe) {
      return discordStatusProbe;
    }
    discordStatusProbe = Promise.all(
      getDiscordIpcEndpoints().map((endpoint) => ipcTransportEndpointExists(endpoint).catch(() => false))
    ).then((checks) => {
      const running = checks.some(Boolean);
      discordStatusCache = {
        running,
        expiresAt: Date.now() + DISCORD_STATUS_CACHE_MS
      };
      return running;
    }).finally(() => {
      discordStatusProbe = null;
    });
    return discordStatusProbe;
  }
  formatError(error, fallback) {
    if (error instanceof Error) {
      if (error.message.includes("RPC_CONNECTION_TIMEOUT")) {
        return "Connection to Discord timed out.";
      }
      if (error.message.includes("endpoint is not available")) {
        return "Discord is not running, or IPC access is unavailable.";
      }
      if (error.message.toLowerCase().includes("invalid client")) {
        return "Discord rejected the Client ID. Check that it is a valid Discord application Client ID.";
      }
      if (error.message.toLowerCase().includes("rpc request timed out")) {
        return `${error.message} Discord may be busy, disconnected, or refusing this application.`;
      }
      if (error.message.includes("Could not connect")) {
        return "Could not connect to the Discord client.";
      }
      return error.message;
    }
    return fallback;
  }
  initials(value) {
    const tokens = value.split(/\s+/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 0) {
      return "?";
    }
    return tokens.slice(0, 2).map((token) => token[0]?.toUpperCase() ?? "").join("") || "?";
  }
};
const template = '{{#if showWidget()}}\n  <div class="discord-ipc-wrapper {{#if shadowsEnabled()}}shadows{{/if}}">\n    <div class="discord-ipc align-{{alignmentClass()}}">\n      {{#if state().participants.length > 0}}\n        <div class="participants-view">\n          <div class="participants">\n            {{#each state().participants}}\n              <div\n                class="participant {{participantClasses(this)}}"\n                data-participant-id="{{this.id}}"\n                style="--participant-size: {{participantGridSize()}};"\n              >\n                <div class="avatar">\n                  {{#if participantAvatarUrl(this)}}\n                    <img src="{{participantAvatarUrl(this)}}" alt="{{this.username}}" loading="lazy" decoding="async" />\n                  {{/if}}\n                  {{#if !participantAvatarUrl(this)}}\n                    <div class="avatar-fallback">{{participantInitials(this)}}</div>\n                  {{/if}}\n                  {{#if hasStatusIcon(this)}}\n                    <div class="mute">\n                      {{#if participantIsDeafened(this)}}\n                        <img src="{{ASSETS}}/img/deafened.png" class="invert" alt="Deafened" />\n                      {{/if}}\n                      {{#if this.mute.self && !participantIsDeafened(this)}}\n                        <img src="{{ASSETS}}/img/mic-selfmuted.png" class="invert" alt="Self muted" />\n                      {{/if}}\n                      {{#if this.mute.server && !this.mute.self && !participantIsDeafened(this)}}\n                        <img src="{{ASSETS}}/img/mic-servermuted.png" alt="Server muted" />\n                      {{/if}}\n                      {{#if this.mute.user && !this.mute.self && !this.mute.server && !participantIsDeafened(this)}}\n                        <img src="{{ASSETS}}/img/mic-muted.png" class="invert" alt="Muted" />\n                      {{/if}}\n                    </div>\n                  {{/if}}\n                </div>\n                {{#if showNames()}}\n                  <div class="name-wrapper">\n                    <div class="name">{{participantName(this)}}</div>\n                  </div>\n                {{/if}}\n              </div>\n            {{/each}}\n          </div>\n        </div>\n      {{/if}}\n\n      {{#if state().participants.length === 0}}\n        <div class="disconnected-view">\n          <div class="icon">\n            {{#if state().isLoading}}\n              <img src="{{ASSETS}}/img/loader.gif" alt="Loading" />\n            {{/if}}\n            {{#if !state().isLoading}}\n              <img src="{{ASSETS}}/img/discord.png" class="invert" alt="Discord" />\n            {{/if}}\n          </div>\n          <div class="message">\n            {{#if hasClientId()}}\n              {{state().message}}\n            {{/if}}\n            {{#if !hasClientId()}}\n              No Discord Client ID provided. Please set a valid Client ID in the widget settings to use the Discord IPC widget.\n            {{/if}}\n          </div>\n          {{#if hasClientId() && !state().isLoading && (state().authorizationRequired || state().retryAvailable)}}\n            <button id="login-btn" type="button" class="connect-button">\n              {{#if state().authorizationRequired}}Authorize Discord{{/if}}\n              {{#if !state().authorizationRequired}}Try Again{{/if}}\n            </button>\n          {{/if}}\n        </div>\n      {{/if}}\n    </div>\n  </div>\n{{/if}}\n';
const styles = "img.invert {\n  --filters: invert(100%);\n}\n\n.discord-ipc-wrapper {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n  container-type: size;\n}\n.discord-ipc-wrapper.shadows {\n  filter: drop-shadow(-1px 1px 1px #000000);\n}\n\n.discord-ipc {\n  display: flex;\n  width: 100%;\n  height: 100%;\n  flex-direction: column;\n}\n\n.participants-view {\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  container-type: size;\n}\n\n.participants {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: wrap;\n  align-items: flex-start;\n  align-content: flex-start;\n  justify-content: flex-start;\n  width: 100%;\n  height: 100%;\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  gap: clamp(2px, 0.5em, 8px);\n}\n\n.align-top-center .participants,\n.align-center-center .participants,\n.align-bottom-center .participants {\n  justify-content: center;\n}\n\n.align-top-right .participants,\n.align-center-right .participants,\n.align-bottom-right .participants {\n  justify-content: flex-end;\n}\n\n.align-center-left .participants,\n.align-center-center .participants,\n.align-center-right .participants {\n  align-items: center;\n  align-content: center;\n}\n\n.align-bottom-left .participants,\n.align-bottom-center .participants,\n.align-bottom-right .participants {\n  align-items: flex-end;\n  align-content: flex-end;\n}\n\n.participant {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  flex: 0 0 calc(var(--cell-width, 60px) * var(--participant-size));\n  width: calc(var(--cell-width, 60px) * var(--participant-size));\n  height: calc(var(--cell-width, 60px) * var(--participant-size));\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;\n  aspect-ratio: 1/1;\n  transform: scale(0.7);\n  opacity: 0;\n  animation: popIn var(--transition) forwards;\n  animation-delay: var(--animation-delay);\n}\n.participant.muted .avatar > img {\n  filter: grayscale(100%) brightness(50%);\n}\n.participant.muted .avatar .mute {\n  opacity: 1;\n  visibility: visible;\n}\n\n.avatar {\n  position: relative;\n  width: min(75%, 75cqh);\n  height: auto;\n  aspect-ratio: 1/1;\n  max-width: 75%;\n  max-height: 75%;\n  flex: 0 0 auto;\n  background: rgba(255, 255, 255, 0.12);\n  border: max(0.15em, 5px) solid transparent;\n  border-radius: 0.25em;\n  transition: border-color var(--transition);\n}\n.avatar > img {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n  border-radius: 0.25em;\n  transition: filter var(--transition);\n}\n.avatar.speaking {\n  border-color: rgb(112, 224, 112);\n}\n\n.avatar-fallback {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 0.7em;\n  font-weight: 700;\n  letter-spacing: 0.04em;\n  color: rgba(255, 255, 255, 0.9);\n}\n\n.mute {\n  display: flex;\n  position: absolute;\n  inset: 0;\n  font-size: max(1em, var(--host-width) / 15);\n  justify-content: center;\n  align-items: center;\n  gap: 0.2em;\n  opacity: 0;\n  visibility: hidden;\n  transition: opacity var(--transition), visibility var(--transition);\n}\n.mute img {\n  width: 30%;\n  max-width: 100%;\n  filter: var(--filters) drop-shadow(1px 1px 0.25em rgba(0, 0, 0, 0.5));\n}\n\n.name-wrapper {\n  width: 100%;\n  max-height: 25%;\n  font-size: clamp(8px, 4.5cqw, 22px);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  padding: 0 0.15em;\n}\n\n.name {\n  display: block;\n  padding: 0 0.25em;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  text-align: center;\n}\n\n.disconnected-view {\n  width: 100%;\n  height: 100%;\n  display: flex;\n  flex-direction: column;\n  justify-content: center;\n  align-items: center;\n  text-align: center;\n  gap: 0.65em;\n  padding: 0.75em;\n  box-sizing: border-box;\n}\n\n.icon img {\n  width: 3em;\n  filter: var(--filters);\n}\n\n.message {\n  text-transform: uppercase;\n  line-height: 1.3;\n}\n\n.connect-button {\n  border: 0;\n  border-radius: 0.35em;\n  padding: 0.35em 0.6em;\n  background: rgba(255, 255, 255, 0.18);\n  color: inherit;\n  font-size: 1.2em;\n  text-transform: uppercase;\n  transition: opacity var(--transition);\n}\n\n@keyframes popIn {\n  0% {\n    transform: scale(0.7);\n    opacity: 0;\n  }\n  100% {\n    transform: scale(1);\n    opacity: 1;\n  }\n}";
const DisplayDuckWidget2 = createWidgetClass(DisplayDuckWidget$1, { template, styles });
const Widget = DisplayDuckWidget2;
const displayduckPackDiscordIpc_discordIpc_entry = { DisplayDuckWidget: DisplayDuckWidget2, Widget };
export {
  DisplayDuckWidget2 as DisplayDuckWidget,
  Widget,
  displayduckPackDiscordIpc_discordIpc_entry as default
};
//# sourceMappingURL=discord-ipc.js.map
