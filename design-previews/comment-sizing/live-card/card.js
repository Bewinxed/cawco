//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/constants.js
var e = {}, t = Symbol("uninitialized"), n = "http://www.w3.org/1999/xhtml", r = "@attach", i = Array.isArray, a = Array.prototype.indexOf, o = Array.prototype.includes, s = Array.from, c = Object.defineProperty, l = Object.getOwnPropertyDescriptor, u = Object.getOwnPropertyDescriptors, d = Object.prototype, f = Array.prototype, p = Object.getPrototypeOf, m = Object.isExtensible;
function h(e) {
	return typeof e == "function";
}
var g = () => {};
function _(e) {
	for (var t = 0; t < e.length; t++) e[t]();
}
function v() {
	var e, t;
	return {
		promise: new Promise((n, r) => {
			e = n, t = r;
		}),
		resolve: e,
		reject: t
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/constants.js
var y = 1 << 24, b = 1024, x = 2048, S = 4096, C = 8192, w = 16384, T = 32768, E = 1 << 25, ee = 65536, te = 1 << 19, ne = 1 << 20, re = 1 << 21, ie = 1 << 22, D = 1 << 23, O = Symbol("$state"), ae = Symbol("component"), oe = Symbol("legacy props"), k = Symbol(""), se = Symbol("attributes"), ce = Symbol("class"), le = Symbol("style"), ue = Symbol("text"), A = Symbol("form reset"), j = new class extends Error {
	name = "StaleReactionError";
	message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), de = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml");
function fe() {
	console.warn("https://svelte.dev/e/derived_inert");
}
function M(e) {
	console.warn("https://svelte.dev/e/hydration_mismatch");
}
function pe() {
	console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function me() {
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/hydration.js
var N = !1;
function he(e) {
	N = e;
}
var P;
function ge(t) {
	if (t === null) throw M(), e;
	return P = t;
}
function _e() {
	return ge(/* @__PURE__ */ un(P));
}
function ve(t) {
	if (N) {
		if (/* @__PURE__ */ un(P) !== null) throw M(), e;
		P = t;
	}
}
function ye(e = 1) {
	if (N) {
		for (var t = e, n = P; t--;) n = /* @__PURE__ */ un(n);
		P = n;
	}
}
function be(e = !0) {
	for (var t = 0, n = P;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ un(n);
		e && n.remove(), n = i;
	}
}
function xe(t) {
	if (!t || t.nodeType !== 8) throw M(), e;
	return t.data;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/equality.js
function Se(e) {
	return e === this.v;
}
function Ce(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function we(e) {
	return !Ce(e, this.v);
}
function Te(e) {
	throw Error("https://svelte.dev/e/lifecycle_outside_component");
}
function Ee() {
	throw Error("https://svelte.dev/e/set_context_after_init");
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/errors.js
function De() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function Oe(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function ke() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function Ae(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function je() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function Me(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function Ne() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function Pe() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function Fe() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function Ie() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/flags/index.js
var Le = !1;
function Re() {
	Le = !0;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/shared/context.js
function ze(e) {
	let t = e.p;
	for (; t !== null && t.c === null;) t = t.p;
	return t?.c ?? null;
}
function Be(e, t) {
	return e === null && Te(t), e.c ??= new Map(ze(e) || void 0);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/context.js
var Ve = null;
function He(e) {
	Ve = e;
}
function Ue(e) {
	return Be(Ve, "getContext").get(e);
}
function We(e, t) {
	let n = Be(Ve, "setContext");
	if (Le) {
		var r = V.f;
		!B && r & 32 && !Ve.i || Ee();
	}
	return n.set(e, t), t;
}
function Ge(e) {
	return Be(Ve, "hasContext").has(e);
}
function Ke() {
	return Be(Ve, "getAllContexts");
}
function qe(e, t = !1, n) {
	Ve = {
		p: Ve,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: V,
		l: null
	};
}
function Je(e) {
	var t = Ve, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) Tn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, Ve = t.p, Ye(e);
}
function Ye(e = {}) {
	return c(e, ae, { value: !0 }), e;
}
function Xe() {
	return !0;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/task.js
var Ze = [];
function Qe() {
	var e = Ze;
	Ze = [], _(e);
}
function $e(e) {
	if (Ze.length === 0 && !Dt) {
		var t = Ze;
		queueMicrotask(() => {
			t === Ze && Qe();
		});
	}
	Ze.push(e);
}
function et() {
	for (; Ze.length > 0;) Qe();
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/status.js
var tt = ~(x | S | b);
function nt(e, t) {
	e.f = e.f & tt | t;
}
function rt(e) {
	e.f & 512 || e.deps === null ? nt(e, b) : nt(e, S);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/utils.js
function it(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), nt(e, b);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/misc.js
function at(e, t) {
	if (t) {
		let t = document.body;
		e.autofocus = !0, $e(() => {
			document.activeElement === t && e.focus();
		});
	}
}
var ot = !1;
function st() {
	ot || (ot = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[A]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function ct(e) {
	var t = B, n = V;
	Zn(null), Qn(null);
	try {
		return e();
	} finally {
		Zn(t), Qn(n);
	}
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/async.js
function lt(e, t, n, r) {
	let i = Xe() ? pt : gt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = V, c = ut(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				vn(e, s);
			}
			dt();
		}
	}
	var d = ft();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ ht(e))).then(u).catch((e) => vn(e, s)).finally(d);
	}
	l ? l.then(() => {
		if (s.f & 16384) {
			d();
			return;
		}
		c(), f(), dt();
	}) : f();
}
function ut() {
	var e = V, t = B, n = Ve, r = I;
	return function(i = !0) {
		Qn(e), Zn(t), He(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function dt(e = !0) {
	Qn(null), Zn(null), He(null), e && I?.deactivate();
}
function ft() {
	var e = V, t = e.b, n = I, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function pt(e) {
	var n = 2 | x;
	return V !== null && (V.f |= te), {
		ctx: Ve,
		deps: null,
		effects: null,
		equals: Se,
		f: n,
		fn: e,
		reactions: null,
		rv: 0,
		v: t,
		wv: 0,
		parent: V,
		ac: null
	};
}
var mt = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function ht(e, n, r) {
	let i = V;
	i === null && De();
	var a = void 0, o = Kt(t), s = !B, c = /* @__PURE__ */ new Set();
	return An(() => {
		var t = V, n = v();
		a = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== j && n.reject(e);
			}).finally(dt);
		} catch (e) {
			n.reject(e), dt();
		}
		var r = I;
		if (s) {
			if (t.f & 32768) var l = ft();
			if (i.b?.is_rendered()) r.async_deriveds.get(t)?.reject(mt);
			else for (let e of c.values()) e.reject(mt);
			c.add(n), r.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), c.delete(n), t !== mt && (r.activate(), t ? (o.f |= D, Yt(o, t)) : (o.f & 8388608 && (o.f ^= D), Yt(o, e)), r.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), Cn(() => {
		for (let e of c) e.reject(mt);
	}), new Promise((e) => {
		function t(n) {
			function r() {
				n === a ? e(o) : t(a);
			}
			n.then(r, r);
		}
		t(a);
	});
}
/*#__NO_SIDE_EFFECTS__*/
function F(e) {
	let t = /* @__PURE__ */ pt(e);
	return Le || er(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function gt(e) {
	let t = /* @__PURE__ */ pt(e);
	return t.equals = we, t;
}
function _t(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) zn(t[n]);
	}
}
function vt(e) {
	var n, r = V, i = e.parent;
	if (!Jn && i !== null && e.v !== t && i.f & 24576) return fe(), e.v;
	Qn(i);
	try {
		_t(e), n = fr(e);
	} finally {
		Qn(r);
	}
	return n;
}
function yt(e) {
	var t = vt(e);
	if (!e.equals(t) && (e.wv = lr(), (!I?.is_fork || e.deps === null) && (I === null ? e.v = t : (I.capture(e, t, !0), wt?.capture(e, t, !0)), e.deps === null))) {
		nt(e, b);
		return;
	}
	Jn || (Tt === null ? rt(e) : (Sn() || I?.is_fork) && Tt.set(e, t));
}
function bt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && ct(() => {
		t.ac.abort(j), t.ac = null;
	}), t.fn !== null && (t.teardown = g), hr(t, 0), Ln(t));
}
function xt(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && gr(t);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/batch.js
var St = null, Ct = null, I = null, wt = null, Tt = null, Et = null, Dt = !1, Ot = !1, kt = null, At = null, jt = 0, Mt = 1, Nt = class e {
	id = Mt++;
	#e = !1;
	linked = !0;
	#t = null;
	#n = null;
	async_deriveds = /* @__PURE__ */ new Map();
	current = /* @__PURE__ */ new Map();
	previous = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = /* @__PURE__ */ new Set();
	#a = 0;
	#o = /* @__PURE__ */ new Map();
	#s = null;
	#c = [];
	#l = [];
	#u = /* @__PURE__ */ new Set();
	#d = /* @__PURE__ */ new Set();
	#f = /* @__PURE__ */ new Map();
	#p = /* @__PURE__ */ new Set();
	is_fork = !1;
	#m = !1;
	constructor() {
		Ct === null ? St = Ct = this : (Ct.#n = this, this.#t = Ct), Ct = this;
	}
	#h() {
		if (this.is_fork) return !0;
		for (let n of this.#o.keys()) {
			for (var e = n, t = !1; e.parent !== null;) {
				if (this.#f.has(e)) {
					t = !0;
					break;
				}
				e = e.parent;
			}
			if (!t) return !0;
		}
		return !1;
	}
	skip_effect(e) {
		this.#f.has(e) || this.#f.set(e, {
			d: [],
			m: []
		}), this.#p.delete(e);
	}
	unskip_effect(e, t = (e) => this.schedule(e)) {
		var n = this.#f.get(e);
		if (n) {
			this.#f.delete(e);
			for (var r of n.d) nt(r, x), t(r);
			for (r of n.m) nt(r, S), t(r);
		}
		this.#p.add(e);
	}
	#g() {
		var e = [];
		for (let i of this.#c) if (!(i.f & 16384 || !(i.f & 6144))) {
			for (var t = i, n = !1; t.parent !== null;) {
				t = t.parent;
				var r = t.f;
				if (r & 96) {
					if (!(r & 1024)) {
						n = !0;
						break;
					}
					t.f ^= b;
				}
			}
			n || e.push(t);
		}
		return this.#c = [], e;
	}
	#_() {
		this.#e = !0;
		for (let e of this.#u) this.#d.delete(e), nt(e, x), this.schedule(e);
		for (let e of this.#d) nt(e, S), this.schedule(e);
		this.apply();
		for (var t = kt = [], n = [], r = At = []; this.#c.length > 0;) {
			jt++ > 1e3 && (this.#C(), Ft());
			for (let e of this.#g()) try {
				this.#v(e, t, n);
			} catch (t) {
				throw Ht(e), this.#h() || this.discard(), t;
			}
		}
		if (I = null, r.length > 0) {
			var i = e.ensure();
			for (let e of r) i.schedule(e);
		}
		if (kt = null, At = null, this.#h()) {
			this.#x(n), this.#x(t);
			for (let [e, t] of this.#f) Vt(e, t);
			r.length > 0 && I.#_();
			return;
		}
		let a = this.#y();
		if (a) {
			this.#x(n), this.#x(t), a.#b(this);
			return;
		}
		this.#u.clear(), this.#d.clear();
		for (let e of this.#r) e(this);
		this.#r.clear(), wt = this, Lt(n), Lt(t), wt = null, this.#s?.resolve();
		var o = I;
		if (this.#a === 0 && (this.#c.length === 0 || o !== null) && (this.#C(), Le && (this.#S(), I = o)), this.#c.length > 0) {
			if (o !== null) {
				for (let e of this.#c) o.#c.push(e);
				this.#c = [];
			} else o = this;
		}
		o !== null && (Wt.clear(), o.#_());
	}
	#v(e, t, n) {
		e.f ^= b;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#f.has(r)) && r.fn !== null) {
				a ? r.f ^= b : i & 4 ? t.push(r) : Le && i & 16777224 ? n.push(r) : ur(r) && (i & 16 && this.#d.add(r), gr(r));
				var o = r.first;
				if (o !== null) {
					r = o;
					continue;
				}
			}
			for (; r !== null;) {
				var s = r.next;
				if (s !== null) {
					r = s;
					break;
				}
				r = r.parent;
			}
		}
	}
	#y() {
		for (var e = this.#t; e !== null;) {
			if (!e.is_fork) {
				for (let [t, [, n]] of this.current) if (e.current.has(t) && !n) return e;
			}
			e = e.#t;
		}
		return null;
	}
	#b(e) {
		for (let [t, n] of e.current) !this.previous.has(t) && e.previous.has(t) && this.previous.set(t, e.previous.get(t)), this.current.set(t, n);
		for (let [t, n] of e.async_deriveds) {
			let e = this.async_deriveds.get(t);
			e && n.promise.then(e.resolve).catch(e.reject);
		}
		e.async_deriveds.clear(), this.transfer_effects(e.#u, e.#d);
		let t = (e) => {
			var n = e.reactions;
			if (n !== null && !(e.f & 2 && !(e.f & 6144))) for (let e of n) {
				var r = e.f;
				if (r & 2) t(e);
				else {
					var i = e;
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), nt(i, x), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#C(), I = this, this.#_();
	}
	#x(e) {
		for (var t = 0; t < e.length; t += 1) it(e[t], this.#u, this.#d);
	}
	capture(e, n, r = !1) {
		e.v !== t && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [n, r]), Tt?.set(e, n)), this.is_fork || (e.v = n);
	}
	activate() {
		I = this;
	}
	deactivate() {
		I = null, Tt = null;
	}
	flush() {
		try {
			Ot = !0, I = this, this.#_();
		} finally {
			jt = 0, Et = null, kt = null, At = null, Ot = !1, I = null, Tt = null, Wt.clear();
		}
	}
	discard() {
		for (let e of this.#i) e(this);
		this.#i.clear();
		for (let e of this.async_deriveds.values()) e.reject(mt);
		this.#C(), this.#s?.resolve();
	}
	register_created_effect(e) {
		this.#l.push(e);
	}
	#S() {
		for (let u = St; u !== null; u = u.#n) {
			var e = u.id < this.id, t = [];
			for (let [r, [i, a]] of this.current) {
				if (u.current.has(r)) {
					var n = u.current.get(r)[0];
					if (e && i !== n) u.current.set(r, [i, a]);
					else continue;
				}
				t.push(r);
			}
			if (e) for (let [e, t] of this.async_deriveds) {
				let n = u.async_deriveds.get(e);
				n && t.promise.then(n.resolve).catch(n.reject);
			}
			var r = [...u.current.keys()].filter((e) => !u.current.get(e)[1]);
			if (u.#e && r.length !== 0) {
				var i = r.filter((e) => !this.current.has(e));
				if (i.length === 0) e && u.discard();
				else if (t.length > 0) {
					if (e) for (let e of this.#p) u.unskip_effect(e, (e) => {
						e.f & 4194320 ? u.schedule(e) : u.#x([e]);
					});
					u.activate();
					var a = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Map();
					for (var s of t) Rt(s, i, a, o);
					o = /* @__PURE__ */ new Map();
					var c = [...u.current].filter(([e, t]) => {
						let n = this.current.get(e);
						return !n || n[0] !== t[0] || n[1] !== t[1];
					}).map(([e]) => e);
					if (c.length > 0) for (let e of this.#l) !(e.f & 155648) && zt(e, c, o) && (e.f & 4194320 ? (nt(e, x), u.schedule(e)) : u.#u.add(e));
					if (u.#c.length > 0 && !u.#m) {
						u.apply();
						for (var l of u.#g()) u.#v(l, [], []);
					}
					u.deactivate();
				}
			}
		}
	}
	increment(e, t) {
		if (this.#a += 1, e) {
			let e = this.#o.get(t) ?? 0;
			this.#o.set(t, e + 1);
		}
	}
	decrement(e, t) {
		if (--this.#a, e) {
			let e = this.#o.get(t) ?? 0;
			e === 1 ? this.#o.delete(t) : this.#o.set(t, e - 1);
		}
		this.#m || (this.#m = !0, $e(() => {
			this.#m = !1, this.linked && this.flush();
		}));
	}
	transfer_effects(e, t) {
		for (let t of e) this.#u.add(t);
		for (let e of t) this.#d.add(e);
		e.clear(), t.clear();
	}
	oncommit(e) {
		this.#r.add(e);
	}
	ondiscard(e) {
		this.#i.add(e);
	}
	settled() {
		return (this.#s ??= v()).promise;
	}
	static ensure() {
		if (I === null) {
			let t = I = new e();
			!Ot && !Dt && $e(() => {
				t.#e || t.flush();
			});
		}
		return I;
	}
	apply() {
		if (!Le || !this.is_fork && this.#t === null && this.#n === null) {
			Tt = null;
			return;
		}
		Tt = /* @__PURE__ */ new Map();
		for (let [e, [t]] of this.current) Tt.set(e, t);
		for (let t = St; t !== null; t = t.#n) if (!(t === this || t.is_fork)) {
			var e = !1;
			if (t.id < this.id) {
				for (let [n, [, r]] of t.current) if (!r && this.current.has(n)) {
					e = !0;
					break;
				}
			}
			if (!e) for (let [e, n] of t.previous) Tt.has(e) || Tt.set(e, n);
		}
	}
	schedule(e) {
		if (Et = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768)) {
			e.b.defer_effect(e);
			return;
		}
		this.#c.push(e);
	}
	#C() {
		if (this.linked) {
			var e = this.#t, t = this.#n;
			e === null ? St = t : e.#n = t, t === null ? Ct = e : t.#t = e, this.linked = !1;
		}
	}
};
function Pt(e) {
	var t = Dt, n = wt;
	wt = null, Dt = !0;
	try {
		var r;
		for (e && (Pt(), r = e());;) {
			if (et(), I === null) return r;
			I.flush();
		}
	} finally {
		Dt = t, wt = n;
	}
}
function Ft() {
	try {
		je();
	} catch (e) {
		vn(e, Et);
	}
}
var It = null;
function Lt(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && ur(r) && (It = /* @__PURE__ */ new Set(), gr(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && Vn(r), It?.size > 0)) {
				Wt.clear();
				for (let e of It) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) It.has(n) && (It.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || gr(n);
					}
				}
				It.clear();
			}
		}
		It = null;
	}
}
function Rt(e, t, n, r) {
	if (!n.has(e) && (n.add(e), e.reactions !== null)) for (let i of e.reactions) {
		let e = i.f;
		e & 2 ? Rt(i, t, n, r) : e & 4194320 && !(e & 2048) && zt(i, t, r) && (nt(i, x), Bt(i));
	}
}
function zt(e, t, n) {
	let r = n.get(e);
	if (r !== void 0) return r;
	if (e.deps !== null) for (let r of e.deps) {
		if (o.call(t, r)) return !0;
		if (r.f & 2 && zt(r, t, n)) return n.set(r, !0), !0;
	}
	return n.set(e, !1), !1;
}
function Bt(e) {
	I.schedule(e);
}
function Vt(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), nt(e, b);
		for (var n = e.first; n !== null;) Vt(n, t), n = n.next;
	}
}
function Ht(e) {
	nt(e, b);
	for (var t = e.first; t !== null;) Ht(t), t = t.next;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/sources.js
var Ut = /* @__PURE__ */ new Set(), Wt = /* @__PURE__ */ new Map(), Gt = !1;
function Kt(e, t) {
	return {
		f: 0,
		v: e,
		reactions: null,
		equals: Se,
		rv: 0,
		wv: 0
	};
}
/*#__NO_SIDE_EFFECTS__*/
function L(e, t) {
	let n = Kt(e, t);
	return er(n), n;
}
function R(e, t, n = !1) {
	return B !== null && (!Xn || B.f & 131072) && Xe() && B.f & 4325394 && ($n === null || !$n.has(e)) && Fe(), Yt(e, n ? $t(t) : t, At);
}
var qt = null, Jt = 0;
function Yt(e, t, n = null) {
	if (!e.equals(t)) {
		Jn ? Wt.set(e, t) : Wt.has(e) || Wt.set(e, e.v);
		var r = Nt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && vt(t), Tt === null && rt(t);
		}
		e.wv = lr(), qt = null, Jt = 0, Qt(e, x, n), qt = null, Xe() && V !== null && V.f & 1024 && !(V.f & 96) && (rr === null ? ir([e]) : rr.push(e)), !r.is_fork && Ut.size > 0 && !Gt && Xt();
	}
	return t;
}
function Xt() {
	Gt = !1;
	for (let e of Ut) {
		e.f & 1024 && nt(e, S);
		let t;
		try {
			t = ur(e);
		} catch {
			t = !0;
		}
		t && gr(e);
	}
	Ut.clear();
}
function Zt(e) {
	R(e, e.v + 1);
}
function Qt(e, t, n) {
	var r = e.reactions;
	if (r !== null) {
		var i = Xe(), a = r.length;
		if (Jt += a, Jt > 1e5 && qt === null && (qt = /* @__PURE__ */ new Set()), qt !== null) {
			if (qt.has(e)) return;
			qt.add(e);
		}
		for (var o = 0; o < a; o++) {
			var s = r[o], c = s.f;
			if (i || s !== V) {
				var l = (c & x) === 0;
				if (l && nt(s, t), c & 131072) Ut.add(s);
				else if (c & 2) {
					var u = s;
					Tt?.delete(u), Qt(u, S, n);
				} else if (l) {
					var d = s;
					c & 16 && It !== null && It.add(d), n === null ? Bt(d) : n.push(d);
				}
			}
		}
	}
}
function $t(e) {
	if (typeof e != "object" || !e || O in e || ae in e) return e;
	let n = p(e);
	if (n !== d && n !== f) return e;
	var r = /* @__PURE__ */ new Map(), a = i(e), o = /* @__PURE__ */ L(0), s = null, c = sr, u = (e) => {
		if (sr === c) return e();
		var t = B, n = sr;
		Zn(null), cr(c);
		var r = e();
		return Zn(t), cr(n), r;
	};
	return a && r.set("length", /* @__PURE__ */ L(e.length, s)), new Proxy(e, {
		defineProperty(e, t, n) {
			(!("value" in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) && Ne();
			var i = r.get(t);
			return i === void 0 ? u(() => {
				var e = /* @__PURE__ */ L(n.value, s);
				return r.set(t, e), e;
			}) : R(i, n.value, !0), !0;
		},
		deleteProperty(e, n) {
			var i = r.get(n);
			if (i === void 0) {
				if (n in e) {
					let e = u(() => /* @__PURE__ */ L(t, s));
					r.set(n, e), Zt(o);
				}
			} else R(i, t), Zt(o);
			return !0;
		},
		get(n, i, a) {
			if (i === O) return e;
			var o = r.get(i), c = i in n;
			if (o === void 0 && (!c || l(n, i)?.writable) && (o = u(() => /* @__PURE__ */ L($t(c ? n[i] : t), s)), r.set(i, o)), o !== void 0) {
				var d = H(o);
				return d === t ? void 0 : d;
			}
			return Reflect.get(n, i, a);
		},
		getOwnPropertyDescriptor(e, n) {
			this.has?.(e, n);
			var i = Reflect.getOwnPropertyDescriptor(e, n), a = r.get(n);
			if (a !== void 0) {
				var o = H(a);
				if (o === t) return;
				if (i && "value" in i) i.value = o;
				else return {
					enumerable: !0,
					configurable: !0,
					value: o,
					writable: !0
				};
			}
			return i;
		},
		has(e, n) {
			if (n === O) return !0;
			var i = r.get(n), a = i !== void 0 && i.v !== t || Reflect.has(e, n);
			return (i !== void 0 || V !== null && (!a || l(e, n)?.writable)) && (i === void 0 && (i = u(() => /* @__PURE__ */ L(a ? $t(e[n]) : t, s)), r.set(n, i)), H(i) === t) ? !1 : a;
		},
		set(e, n, i, c) {
			var d = r.get(n), f = n in e;
			if (a && n === "length") for (var p = i; p < d.v; p += 1) {
				var m = r.get(p + "");
				m === void 0 ? p in e && (m = u(() => /* @__PURE__ */ L(t, s)), r.set(p + "", m)) : R(m, t);
			}
			if (d === void 0) (!f || l(e, n)?.writable) && (d = u(() => /* @__PURE__ */ L(void 0, s)), R(d, $t(i)), r.set(n, d));
			else {
				f = d.v !== t;
				var h = u(() => $t(i));
				R(d, h);
			}
			var g = Reflect.getOwnPropertyDescriptor(e, n);
			if (g?.set && g.set.call(c, i), !f) {
				if (a && typeof n == "string") {
					var _ = r.get("length"), v = Number(n);
					Number.isInteger(v) && v >= _.v && R(_, v + 1);
				}
				Zt(o);
			}
			return !0;
		},
		ownKeys(e) {
			H(o);
			var n = Reflect.ownKeys(e).filter((e) => {
				var n = r.get(e);
				return n === void 0 || n.v !== t;
			});
			for (var [i, a] of r) a.v !== t && !(i in e) && n.push(i);
			return n;
		},
		setPrototypeOf() {
			Pe();
		}
	});
}
function en(e) {
	try {
		if (typeof e == "object" && e && O in e) return e[O];
	} catch {}
	return e;
}
function tn(e, t) {
	return Object.is(en(e), en(t));
}
var nn, rn, an, on;
function sn() {
	if (nn === void 0) {
		nn = window, rn = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		an = l(t, "firstChild").get, on = l(t, "nextSibling").get, m(e) && (e[ce] = void 0, e[se] = null, e[le] = void 0, e.__e = void 0), m(n) && (n[ue] = void 0);
	}
}
function cn(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function ln(e) {
	return an.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function un(e) {
	return on.call(e);
}
function dn(e, t) {
	if (!N) return /* @__PURE__ */ ln(e);
	var n = /* @__PURE__ */ ln(P);
	if (n === null) n = P.appendChild(cn());
	else if (t && n.nodeType !== 3) {
		var r = cn();
		return n?.before(r), ge(r), r;
	}
	return t && gn(n), ge(n), n;
}
function z(e, t = !1) {
	if (!N) {
		var n = /* @__PURE__ */ ln(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ un(n) : n;
	}
	if (t) {
		if (P?.nodeType !== 3) {
			var r = cn();
			return P?.before(r), ge(r), r;
		}
		gn(P);
	}
	return P;
}
function fn(e, t = !1) {
	if (!N) return /* @__PURE__ */ ln(e);
	var n = dn(e, t);
	return ve(e), n;
}
function pn(e, t = 1, n = !1) {
	let r = N ? P : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ un(r);
	if (!N) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = cn();
			return r === null ? i?.after(a) : r.before(a), ge(a), a;
		}
		gn(r);
	}
	return ge(r), r;
}
function mn() {
	return !Le || It !== null ? !1 : (V.f & T) !== 0;
}
function hn(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function gn(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
function _n(e) {
	var t = V;
	if (t === null) return B.f |= D, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	vn(e, t);
}
function vn(t, n) {
	if (t === e) throw t;
	if (!(n !== null && n.f & 16384)) {
		for (; n !== null;) {
			if (n.f & 128 && !(n.f & 33570816)) {
				if (!(n.f & 32768)) throw t;
				try {
					n.b.error(t);
					return;
				} catch (e) {
					t = e;
				}
			}
			n = n.parent;
		}
		throw t;
	}
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/effects.js
function yn(e) {
	V === null && (B === null && Ae(e), ke()), Jn && Oe(e);
}
function bn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function xn(e, t) {
	var n = V;
	n !== null && n.f & 8192 && (e |= C);
	var r = {
		ctx: Ve,
		deps: null,
		nodes: null,
		f: e | x | 512,
		first: null,
		fn: t,
		last: null,
		next: null,
		parent: n,
		b: n && n.b,
		prev: null,
		teardown: null,
		wv: 0,
		ac: null
	};
	I?.register_created_effect(r);
	var i = r;
	if (e & 4) kt === null ? Nt.ensure().schedule(r) : kt.push(r);
	else if (t !== null) {
		try {
			gr(r);
		} catch (e) {
			throw zn(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= ee));
	}
	if (i !== null && (i.parent = n, n !== null && bn(i, n), B !== null && B.f & 2 && !(e & 64))) {
		var a = B;
		(a.effects ??= []).push(i);
	}
	return r;
}
function Sn() {
	return B !== null && !Xn;
}
function Cn(e) {
	let t = xn(8, null);
	return nt(t, b), t.teardown = e, t;
}
function wn(e) {
	yn("$effect");
	var t = V.f;
	if (!B && t & 32 && Ve !== null && !Ve.i) {
		var n = Ve;
		(n.e ??= []).push(e);
	} else return Tn(e);
}
function Tn(e) {
	return xn(4 | ne, e);
}
function En(e) {
	return yn("$effect.pre"), xn(8 | ne, e);
}
function Dn(e) {
	Nt.ensure();
	let t = xn(64 | te, e);
	return () => {
		zn(t);
	};
}
function On(e) {
	Nt.ensure();
	let t = xn(64 | te, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? Hn(t, () => {
			zn(t), n(void 0);
		}) : (zn(t), n(void 0));
	});
}
function kn(e) {
	return xn(4, e);
}
function An(e) {
	return xn(ie | te, e);
}
function jn(e, t = 0) {
	return xn(8 | t, e);
}
function Mn(e, t = [], n = [], r = []) {
	lt(r, t, n, (t) => {
		xn(8, () => {
			e(...t.map(H));
		});
	});
}
function Nn(e, t = 0) {
	return xn(16 | t, e);
}
function Pn(e, t = 0) {
	return xn(y | t, e);
}
function Fn(e) {
	return xn(32 | te, e);
}
function In(e) {
	var t = e.teardown;
	if (t !== null) {
		let n = Jn, r = B;
		Yn(!0), Zn(null);
		try {
			t.call(null);
		} catch (t) {
			vn(t, e.parent);
		} finally {
			Yn(n), Zn(r);
		}
	}
}
function Ln(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && ct(() => {
			e.abort(j);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : zn(n, t), n = r;
	}
}
function Rn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || zn(t), t = n;
	}
}
function zn(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (Bn(e.nodes.start, e.nodes.end), n = !0), e.f |= E, Ln(e, t && !n), hr(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	In(e), e.f ^= E, e.f |= w;
	var i = e.parent;
	i !== null && i.first !== null && Vn(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function Bn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ un(e);
		e.remove(), e = n;
	}
}
function Vn(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function Hn(e, t, n = !0) {
	var r = [];
	e.f |= 256, Un(e, r, !0);
	var i = () => {
		n && zn(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function Un(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= C;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				Un(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function Wn(e) {
	e.f &= -257, Gn(e, !0);
}
function Gn(e, t) {
	if (!(e.f & 256) && e.f & 8192) {
		e.f ^= C, e.f & 1024 || (nt(e, x), Nt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			Gn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function Kn(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ un(n);
		t.append(n), n = i;
	}
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/legacy.js
var qn = null, Jn = !1;
function Yn(e) {
	Jn = e;
}
var B = null, Xn = !1;
function Zn(e) {
	B = e;
}
var V = null;
function Qn(e) {
	V = e;
}
var $n = null;
function er(e) {
	B !== null && (!Le && B.f & 2097152 || B.f & 2) && ($n ??= /* @__PURE__ */ new Set()).add(e);
}
var tr = null, nr = 0, rr = null;
function ir(e) {
	rr = e;
}
var ar = 1, or = 0, sr = or;
function cr(e) {
	sr = e;
}
function lr() {
	return ++ar;
}
function ur(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (ur(a) && yt(a), a.wv > e.wv) return !0;
		}
		t & 512 && Tt === null && nt(e, b);
	}
	return !1;
}
function dr(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && (Le || $n === null || !$n.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? dr(a, t, !1) : t === a && (n ? nt(a, x) : a.f & 1024 && nt(a, S), Bt(a));
	}
}
function fr(e) {
	var t = tr, n = nr, r = rr, i = B, a = $n, o = Ve, s = Xn, c = sr, l = e.f;
	tr = null, nr = 0, rr = null, B = l & 96 ? null : e, $n = null, He(e.ctx), Xn = !1, sr = ++or, e.ac !== null && (ct(() => {
		e.ac.abort(j);
	}), e.ac = null);
	try {
		e.f |= re;
		var u = e.fn, d = u();
		e.f |= T;
		var f = pr(e);
		if (Xe() && rr !== null && !Xn && f !== null && !(e.f & 6146)) for (var p = 0; p < rr.length; p++) dr(rr[p], e);
		if (i !== null && i !== e) {
			if (or++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = or;
			if (t !== null) for (let e of t) e.rv = or;
			rr !== null && (r === null ? r = rr : r.push(...rr));
		}
		return e.f & 8388608 && (e.f ^= D), d;
	} catch (t) {
		return pr(e), _n(t);
	} finally {
		e.f ^= re, tr = t, nr = n, rr = r, B = i, $n = a, He(o), Xn = s, sr = c;
	}
}
function pr(e) {
	var t = e.deps, n = I?.is_fork;
	if (tr !== null) {
		var r;
		if (n || hr(e, nr), t !== null && nr > 0) for (t.length = nr + tr.length, r = 0; r < tr.length; r++) t[nr + r] = tr[r];
		else e.deps = t = tr;
		if (Sn() && e.f & 512) for (r = nr; r < t.length; r++) (t[r].reactions ??= []).push(e);
	} else !n && t !== null && nr < t.length && (hr(e, nr), t.length = nr);
	return t;
}
function mr(e, n) {
	let r = n.reactions;
	if (r !== null) {
		var i = a.call(r, e);
		if (i !== -1) {
			var s = r.length - 1;
			s === 0 ? r = n.reactions = null : (r[i] = r[s], r.pop());
		}
	}
	if (r === null && n.f & 2 && (tr === null || !o.call(tr, n))) {
		var c = n;
		c.f & 512 && (c.f ^= 512), c.v !== t && rt(c), c.ac !== null && ct(() => {
			c.ac.abort(j), c.ac = null, nt(c, x);
		}), bt(c), hr(c, 0);
	}
}
function hr(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) mr(e, n[r]);
}
function gr(e) {
	var t = e.f;
	if (!(t & 16384)) {
		nt(e, b);
		var n = V;
		V = e;
		try {
			t & 16777232 ? Rn(e) : Ln(e), In(e);
			var r = fr(e);
			e.teardown = typeof r == "function" ? r : null, e.wv = ar;
		} finally {
			V = n;
		}
	}
}
async function _r() {
	if (Le) return new Promise((e) => {
		requestAnimationFrame(() => e()), setTimeout(() => e());
	});
	await Promise.resolve(), Pt();
}
function H(e) {
	var t = !!(e.f & 2);
	if (qn?.add(e), B !== null && !Xn && !(V !== null && V.f & 16384) && ($n === null || !$n.has(e))) {
		var n = B.deps;
		if (B.f & 2097152) e.rv < or && (e.rv = or, tr === null && n !== null && n[nr] === e ? nr++ : tr === null ? tr = [e] : tr.push(e));
		else {
			B.deps ??= [], o.call(B.deps, e) || B.deps.push(e);
			var r = e.reactions;
			r === null ? e.reactions = [B] : o.call(r, B) || r.push(B);
		}
	}
	if (Jn && Wt.has(e)) return Wt.get(e);
	if (t) {
		var i = e;
		if (Jn) {
			var a = i.v;
			return (!(i.f & 1024) && i.reactions !== null || yr(i)) && (a = vt(i)), Wt.set(i, a), a;
		}
		var s = !(i.f & 512) && !Xn && B !== null && !!(B.f & 512), c = (i.f & T) === 0;
		ur(i) && (s && (i.f |= 512), yt(i)), s && !c && (xt(i), vr(i));
	}
	if (Tt?.has(e)) return Tt.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function vr(e) {
	if (e.f |= 512, e.deps !== null) for (let n of e.deps) {
		var t = n.reactions;
		t === null ? n.reactions = [e] : o.call(t, e) || t.push(e), n.f & 2 && !(n.f & 512) && (xt(n), vr(n));
	}
}
function yr(e) {
	if (e.v === t) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (Wt.has(t) || t.f & 2 && yr(t)) return !0;
	return !1;
}
function br(e) {
	var t = Xn;
	try {
		return Xn = !0, e();
	} finally {
		Xn = t;
	}
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/events.js
var xr = Symbol("events"), Sr = /* @__PURE__ */ new Set(), Cr = /* @__PURE__ */ new Set();
function wr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || Ar.call(t, e), !e.cancelBubble) return ct(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? (i.__removed = !1, $e(() => {
		i.__removed || t.addEventListener(e, i, r);
	})) : t.addEventListener(e, i, r), i;
}
function Tr(e, t, n, r = {}) {
	var i = wr(t, e, n, r);
	return () => {
		i.__removed = !0, e.removeEventListener(t, i, r);
	};
}
function Er(e, t, n) {
	(t[xr] ??= {})[e] = n;
}
function Dr(e) {
	for (var t = 0; t < e.length; t++) Sr.add(e[t]);
	for (var n of Cr) n(e);
}
var Or = null, kr = !1;
function Ar(e) {
	var t = this, n = t.ownerDocument, r = e.type, i = e.composedPath?.() || [], a = i[0] || e.target;
	Or = e, kr || (kr = !0, setTimeout(() => {
		kr = !1, Or = null;
	}));
	var o = 0, s = Or === e && e[xr];
	if (s) {
		var l = i.indexOf(s);
		if (l !== -1 && (t === document || t === window)) {
			e[xr] = t;
			return;
		}
		var u = i.indexOf(t);
		if (u === -1) return;
		l <= u && (o = l);
	}
	if (a = i[o] || e.target, a !== t) {
		c(e, "currentTarget", {
			configurable: !0,
			get() {
				return a || n;
			}
		});
		var d = B, f = V;
		Zn(null), Qn(null);
		try {
			for (var p, m = []; a !== null && a !== t;) {
				try {
					var h = a[xr]?.[r];
					h != null && (!a.disabled || e.target === a) && h.call(a, e);
				} catch (e) {
					p ? m.push(e) : p = e;
				}
				if (e.cancelBubble) break;
				o++, a = o < i.length ? i[o] : null;
			}
			if (p) {
				for (let e of m) queueMicrotask(() => {
					throw e;
				});
				throw p;
			}
		} finally {
			e[xr] = t, delete e.currentTarget, Zn(d), Qn(f);
		}
	}
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/reconciler.js
var jr = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function Mr(e) {
	return jr?.createHTML(e) ?? e;
}
function Nr(e) {
	var t = hn("template");
	return t.innerHTML = Mr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/template.js
function Pr(e, t) {
	var n = V;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function Fr(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (N) return Pr(P, null), P;
		i === void 0 && (i = Nr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ ln(i)));
		var t = r || rn ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ ln(t), s = t.lastChild;
			Pr(o, s);
		} else Pr(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function Ir(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (N) return Pr(P, null), P;
		if (!o) {
			var e = /* @__PURE__ */ ln(Nr(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ ln(e);) o.appendChild(/* @__PURE__ */ ln(e));
			else o = /* @__PURE__ */ ln(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ ln(t), r = t.lastChild;
			Pr(n, r);
		} else Pr(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function Lr(e, t) {
	return /* @__PURE__ */ Ir(e, t, "svg");
}
function U() {
	if (N) return Pr(P, null), P;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = cn();
	return e.append(t, n), Pr(t, n), e;
}
function W(e, t) {
	if (N) {
		var n = V;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = P), _e();
		return;
	}
	e !== null && e.before(t);
}
function Rr() {
	if (N && P && P.nodeType === 8 && P.textContent?.startsWith("$")) {
		let e = P.textContent.substring(1);
		return _e(), e;
	}
	return (window.__svelte ??= {}).uid ??= 1, `c${window.__svelte.uid++}`;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/utils.js
function zr(e) {
	return e.endsWith("capture") && e !== "gotpointercapture" && e !== "lostpointercapture";
}
var Br = [
	"beforeinput",
	"click",
	"change",
	"dblclick",
	"contextmenu",
	"focusin",
	"focusout",
	"input",
	"keydown",
	"keyup",
	"mousedown",
	"mousemove",
	"mouseout",
	"mouseover",
	"mouseup",
	"pointerdown",
	"pointermove",
	"pointerout",
	"pointerover",
	"pointerup",
	"touchend",
	"touchmove",
	"touchstart"
];
function Vr(e) {
	return Br.includes(e);
}
var Hr = /* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split("."), Ur = {
	formnovalidate: "formNoValidate",
	ismap: "isMap",
	nomodule: "noModule",
	playsinline: "playsInline",
	readonly: "readOnly",
	defaultvalue: "defaultValue",
	defaultchecked: "defaultChecked",
	srcobject: "srcObject",
	novalidate: "noValidate",
	allowfullscreen: "allowFullscreen",
	disablepictureinpicture: "disablePictureInPicture",
	disableremoteplayback: "disableRemotePlayback"
};
function Wr(e) {
	return e = e.toLowerCase(), Ur[e] ?? e;
}
[...Hr];
var Gr = ["touchstart", "touchmove"];
function Kr(e) {
	return Gr.includes(e);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/reactivity/create-subscriber.js
function qr(e) {
	let t = 0, n = Kt(0), r;
	return () => {
		Sn() && (H(n), jn(() => (t === 0 && (r = br(() => e(() => Zt(n)))), t += 1, () => {
			$e(() => {
				--t, t === 0 && (r?.(), r = void 0, Zt(n));
			});
		})));
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var Jr = ee | te;
function Yr(e, t, n, r) {
	new Xr(e, t, n, r);
}
var Xr = class {
	parent;
	is_pending = !1;
	transform_error;
	#e;
	#t = N ? P : null;
	#n;
	#r;
	#i;
	#a = null;
	#o = null;
	#s = null;
	#c = null;
	#l = 0;
	#u = 0;
	#d = !1;
	#f = /* @__PURE__ */ new Set();
	#p = /* @__PURE__ */ new Set();
	#m = null;
	#h = qr(() => (this.#m = Kt(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = V;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = V.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = Nn(() => {
			if (N) {
				let e = xe(this.#t);
				_e();
				let t = e === "[!";
				if (e.startsWith("[?")) {
					let t = JSON.parse(e.slice(2));
					this.#_(t);
				} else t ? this.#b() : this.#g();
			} else this.#x();
		}, Jr), N && (this.#e = P);
	}
	#g() {
		try {
			this.#a = Fn(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#_(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#v(e);
		$e(r), t && (this.#s = Fn(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#v(e) {
		var t = !1, n = !1;
		let r = () => {
			if (!this.#y()) {
				if (t) {
					me();
					return;
				}
				t = !0, n && Ie(), this.#s !== null && Hn(this.#s, () => {
					this.#s = null;
				}), this.#C(() => {
					this.#x();
				});
			}
		};
		return {
			reset: r,
			invoke_onerror: () => {
				if (!this.#y()) try {
					n = !0, this.#n.onerror?.(e, r), n = !1;
				} catch (e) {
					vn(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#y() {
		return (this.#i.f & (w | E)) !== 0;
	}
	#b() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = Fn(() => e(this.#e)), $e(() => {
			if (!this.#y()) {
				var e = this.#c = document.createDocumentFragment(), t = cn(), n = !1;
				if (e.append(t), this.#a = this.#C(() => {
					try {
						return Fn(() => this.#r(t));
					} catch (e) {
						try {
							this.error(e), n = !0;
						} catch (e) {
							vn(e, this.#i.parent);
						}
						return null;
					}
				}), this.#a === null) {
					this.#c = null, n && this.#S(I);
					return;
				}
				this.#u === 0 && (this.#e.before(e), this.#c = null, Hn(this.#o, () => {
					this.#o = null;
				}), this.#S(I));
			}
		}));
	}
	#x() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = Fn(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				Kn(this.#a, e);
				let t = this.#n.pending;
				this.#o = Fn(() => t(this.#e));
			} else this.#S(I);
		} catch (e) {
			this.error(e);
		}
	}
	#S(e) {
		this.is_pending = !1, e.transfer_effects(this.#f, this.#p);
	}
	defer_effect(e) {
		it(e, this.#f, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#C(e) {
		var t = V, n = B, r = Ve;
		Qn(this.#i), Zn(this.#i), He(this.#i.ctx);
		try {
			return Nt.ensure(), e();
		} finally {
			Qn(t), Zn(n), He(r);
		}
	}
	#w(e, t) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#w(e, t);
			return;
		}
		this.#u += e, this.#u === 0 && (this.#S(t), this.#o && Hn(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null));
	}
	update_pending_count(e, t) {
		this.#w(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, $e(() => {
			this.#d = !1, this.#m && Yt(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), H(this.#m);
	}
	error(t) {
		if (t === e || !this.#n.onerror && !this.#n.failed) throw t;
		I?.is_fork ? (this.#a && I.skip_effect(this.#a), this.#o && I.skip_effect(this.#o), this.#s && I.skip_effect(this.#s), I.oncommit(() => {
			this.#y() || this.#T(t);
		})) : this.#T(t);
	}
	#T(e) {
		this.#a &&= (zn(this.#a), null), this.#o &&= (zn(this.#o), null), this.#s &&= (zn(this.#s), null), N && (ge(this.#t), ye(), ge(be()));
		let t = this.#n.failed, n = (e) => {
			if (this.#y()) return;
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && !this.#y() && (this.#s = this.#C(() => {
				try {
					return Fn(() => {
						var r = V;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return vn(e, this.#i.parent), null;
				}
			}));
		};
		$e(() => {
			if (!this.#y()) {
				var t;
				try {
					t = this.transform_error(e);
				} catch (e) {
					vn(e, this.#i && this.#i.parent);
					return;
				}
				typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => vn(e, this.#i && this.#i.parent)) : n(t);
			}
		});
	}
}, Zr = !0;
function Qr(e, t) {
	return ei(e, t);
}
var $r = /* @__PURE__ */ new Map();
function ei(t, { target: n, anchor: r, props: i = {}, events: a, context: o, intro: c = !0, transformError: l }) {
	sn();
	var u = void 0, d = On(() => {
		var d = r ?? n.appendChild(cn());
		Yr(d, { pending: () => {} }, (n) => {
			qe({});
			var r = Ve;
			if (o && (r.c = o), a && (i.$$events = a), N && Pr(n, null), Zr = c, u = t(n, i) || Ye(), Zr = !0, N && (V.nodes.end = P, P === null || P.nodeType !== 8 || P.data !== "]")) throw M(), e;
			Je();
		}, l);
		var f = /* @__PURE__ */ new Set(), p = (e) => {
			for (var t = 0; t < e.length; t++) {
				var r = e[t];
				if (!f.has(r)) {
					f.add(r);
					var i = Kr(r);
					for (let e of [n, document]) {
						var a = $r.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), $r.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, Ar, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return p(s(Sr)), Cr.add(p), () => {
			for (var e of f) for (let r of [n, document]) {
				var t = $r.get(r), i = t.get(e);
				--i == 0 ? (r.removeEventListener(e, Ar), t.delete(e), t.size === 0 && $r.delete(r)) : t.set(e, i);
			}
			Cr.delete(p), d !== r && d.parentNode?.removeChild(d);
		};
	});
	return ti.set(u, d), u;
}
var ti = /* @__PURE__ */ new WeakMap();
function ni(e, t) {
	let n = ti.get(e);
	return n ? (ti.delete(e), n(t)) : Promise.resolve();
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/blocks/branches.js
var ri = class {
	anchor;
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ new Map();
	#n = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = !0;
	constructor(e, t = !0) {
		this.anchor = e, this.#i = t;
	}
	#a = (e) => {
		if (this.#e.has(e)) {
			var t = this.#e.get(e), n = this.#t.get(t);
			if (n) Wn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (Wn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
			}
			for (let [t, n] of this.#e) {
				if (this.#e.delete(t), t === e) break;
				let r = this.#n.get(n);
				r && (zn(r.effect), this.#n.delete(n));
			}
			for (let [e, r] of this.#t) {
				if (e === t || this.#r.has(e)) continue;
				let i = () => {
					if (Array.from(this.#e.values()).includes(e)) {
						var t = document.createDocumentFragment();
						Kn(r, t), t.append(cn()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else zn(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), Hn(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (zn(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = I, r = mn();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = cn();
				i.append(a), this.#n.set(e, {
					effect: Fn(() => t(a)),
					fragment: i
				});
			} else this.#t.set(e, Fn(() => t(this.anchor)));
		}
		if (this.#e.set(n, e), r) {
			for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
			for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
			n.oncommit(this.#a), n.ondiscard(this.#o);
		} else N && (this.anchor = P), this.#a(n);
	}
};
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/blocks/snippet.js
function ii(e, t, ...n) {
	var r = new ri(e);
	Nn(() => {
		let e = t() ?? null;
		r.ensure(e, e && ((t) => e(t, ...n)));
	}, ee);
}
function ai(e) {
	Ve === null && Te("onMount"), wn(() => {
		let t = br(e);
		if (typeof t == "function") return t;
	});
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/attachments/index.js
function oi() {
	return Symbol(r);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/blocks/if.js
function si(e, t, n = !1) {
	var r;
	N && (r = P, _e());
	var i = new ri(e), a = n ? ee : 0;
	function o(e, t) {
		if (N) {
			var n = xe(r);
			if (e !== parseInt(n.substring(1))) {
				var a = be();
				ge(a), i.anchor = a, he(!1), i.ensure(e, t), he(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	Nn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/blocks/key.js
var ci = Symbol("NaN");
function li(e, t, n) {
	N && _e();
	var r = new ri(e), i = !Xe();
	Nn(() => {
		var e = t();
		e !== e && (e = ci), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/blocks/svelte-component.js
function ui(e, t, n) {
	var r;
	N && (r = P, _e());
	var i = new ri(e);
	Nn(() => {
		var e = t() ?? null;
		if (N && xe(r) === "[" != (e !== null)) {
			var a = be();
			ge(a), i.anchor = a, he(!1), i.ensure(e, e && ((t) => n(t, e))), he(!0);
			return;
		}
		i.ensure(e, e && ((t) => n(t, e)));
	}, ee);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/timing.js
var di = () => performance.now(), fi = {
	tick: (e) => requestAnimationFrame(e),
	now: () => di(),
	tasks: /* @__PURE__ */ new Set()
};
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/loop.js
function pi() {
	let e = fi.now();
	fi.tasks.forEach((t) => {
		t.c(e) || (fi.tasks.delete(t), t.f());
	}), fi.tasks.size !== 0 && fi.tick(pi);
}
function mi(e) {
	let t;
	return fi.tasks.size === 0 && fi.tick(pi), {
		promise: new Promise((n) => {
			fi.tasks.add(t = {
				c: e,
				f: n
			});
		}),
		abort() {
			fi.tasks.delete(t);
		}
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/transitions.js
function hi(e, t) {
	ct(() => {
		e.dispatchEvent(new CustomEvent(t));
	});
}
function gi(e) {
	if (e === "float") return "cssFloat";
	if (e === "offset") return "cssOffset";
	if (e.startsWith("--")) return e;
	let t = e.split("-");
	return t.length === 1 ? t[0] : t[0] + t.slice(1).map((e) => e[0].toUpperCase() + e.slice(1)).join("");
}
function _i(e) {
	let t = {}, n = e.split(";");
	for (let e of n) {
		let [n, r] = e.split(":");
		if (!n || r === void 0) break;
		let i = gi(n.trim());
		t[i] = r.trim();
	}
	return t;
}
var vi = (e) => e;
function yi(e, t, n, r) {
	var i = !!(e & 1), a = !!(e & 2), o = i && a, s = !!(e & 4), c = o ? "both" : i ? "in" : "out", l, u = t.inert, d = t.style.overflow, f, p;
	function m() {
		return ct(() => l ??= n()(t, r?.() ?? {}, { direction: c }));
	}
	var h = {
		is_global: s,
		in() {
			if (t.inert = u, !i) {
				p?.abort(), p?.reset?.();
				return;
			}
			a || f?.abort(), f = bi(t, m(), p, 1, () => {
				hi(t, "introstart");
			}, () => {
				hi(t, "introend"), f?.abort(), f = l = void 0, t.style.overflow = d;
			});
		},
		out(e) {
			if (!a) {
				e?.(), l = void 0;
				return;
			}
			t.inert = !0, p = bi(t, m(), f, 0, () => {
				hi(t, "outrostart");
			}, () => {
				hi(t, "outroend"), e?.();
			});
		},
		stop: () => {
			f?.abort(), p?.abort();
		}
	}, g = V;
	if ((g.nodes.t ??= []).push(h), i && Zr) {
		var _ = s;
		if (!_) {
			for (var v = g.parent; v && v.f & 65536;) for (; (v = v.parent) && !(v.f & 16););
			_ = !v || !!(v.f & 32768);
		}
		_ && kn(() => {
			br(() => h.in());
		});
	}
}
function bi(e, t, n, r, i, a) {
	var o = r === 1, s = !1;
	if (h(t)) {
		var c;
		return $e(() => {
			s || (c = bi(e, t({ direction: o ? "in" : "out" }), n, r, i, a));
		}), {
			abort: () => {
				s = !0, c?.abort();
			},
			deactivate: () => c?.deactivate(),
			reset: () => c?.reset(),
			t: () => c?.t() ?? 1 - r
		};
	}
	if (n?.deactivate(), !t?.duration && !t?.delay) return i(), a(), {
		abort: g,
		deactivate: g,
		reset: g,
		t: () => r
	};
	let { delay: l = 0, css: u, tick: d, easing: f = vi } = t;
	var p, m = () => 1 - r;
	return $e(() => {
		if (!s) {
			var c = [];
			if (o && n === void 0 && (d && d(0, 1), u)) {
				var h = _i(u(0, 1));
				c.push(h, h);
			}
			p = e.animate(c, {
				duration: l,
				fill: "forwards"
			}), p.onfinish = () => {
				p.cancel(), i();
				var o = n?.t() ?? 1 - r;
				n?.abort();
				var s = r - o, c = t.duration * Math.abs(s), l = [];
				if (c > 0) {
					var h = !1;
					if (u) for (var g = Math.ceil(c / (1e3 / 60)), _ = 0; _ <= g; _ += 1) {
						var v = o + s * f(_ / g), y = _i(u(v, 1 - v));
						l.push(y), h ||= y.overflow === "hidden";
					}
					h && (e.style.overflow = "hidden"), m = () => {
						var e = p.currentTime;
						return o + s * f(e / c);
					}, d && mi(() => {
						if (p.playState !== "running") return !1;
						var e = m();
						return d(e, 1 - e), !0;
					});
				}
				p = e.animate(l, {
					duration: c,
					fill: "forwards"
				}), p.onfinish = () => {
					m = () => r, d?.(r, 1 - r), a();
				};
			};
		}
	}), {
		abort: () => {
			s = !0, p && (p.cancel(), p.effect = null, p.onfinish = g);
		},
		deactivate: () => {
			a = g;
		},
		reset: () => {
			r === 0 && d?.(1, 0);
		},
		t: () => m()
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/attachments.js
function xi(e, t) {
	var n = void 0, r;
	Pn(() => {
		n !== (n = t()) && (r &&= (zn(r), null), n && (r = Fn(() => {
			kn(() => n(e));
		})));
	});
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/clsx@2.1.1-6c3de0b2556c656c/node_modules/clsx/dist/clsx.mjs
function Si(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = Si(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function Ci() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = Si(e)) && (r && (r += " "), r += t);
	return r;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/shared/attributes.js
function wi(e) {
	return typeof e == "object" ? Ci(e) : e ?? "";
}
var Ti = [..." 	\n\r\f\xA0\v﻿"];
function Ei(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || Ti.includes(r[o - 1])) && (s === r.length || Ti.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function Di(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function Oi(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function ki(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(Oi)), i && c.push(...Object.keys(i).map(Oi));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = Oi(e.substring(l, u).trim());
							if (!c.includes(p)) {
								f !== ";" && d++;
								var m = e.substring(l, d).trim();
								n += " " + m + ";";
							}
						}
						l = d + 1, u = -1;
					}
				}
			}
		}
		return r && (n += Di(r)), i && (n += Di(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/class.js
function Ai(e, t, n, r, i, a) {
	var o = e[ce];
	if (N || o !== n || o === void 0) {
		var s = Ei(n, r, a);
		(!N || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[ce] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/style.js
function ji(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function Mi(e, t, n, r) {
	var i = e[le];
	if (N || i !== t) {
		var a = ki(t, r);
		(!N || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[le] = t;
	} else r && (Array.isArray(r) ? (ji(e, n?.[0], r[0]), ji(e, n?.[1], r[1], "important")) : ji(e, n, r));
	return r;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function Ni(e, t) {
	t ? e.hasAttribute("selected") || e.setAttribute("selected", "") : e.removeAttribute("selected");
}
function Pi(e, t) {
	var n = !("__defaultValue" in e);
	(n || e.__defaultValue !== t) && (e.__defaultValue = t, Fi(e, !n || "__value" in e));
}
function Fi(e, t) {
	var n = e.__defaultValue, r = e.multiple, a = r ? n ?? [] : null;
	if (!r || i(a)) {
		var o = e.selectedIndex, s = t && r ? new Set(e.selectedOptions) : null;
		for (var c of e.options) {
			var l = Ri(c);
			Ni(c, r ? a.includes(l) : tn(l, n));
		}
		if (t) {
			if (s !== null) for (c of e.options) {
				var u = s.has(c);
				c.selected !== u && (c.selected = u);
			}
			else e.selectedIndex !== o && (e.selectedIndex = o);
		}
	}
}
function Ii(e, t, n = !1) {
	if (e.multiple) {
		if (t == null) return;
		if (!i(t)) return pe();
		for (var r of e.options) r.selected = t.includes(Ri(r));
		return;
	}
	for (r of e.options) if (tn(Ri(r), t)) {
		r.selected = !0;
		return;
	}
	(!n || t !== void 0) && (e.selectedIndex = -1);
}
function Li(e) {
	var t = new MutationObserver((t) => {
		t.every(zi) || ("__defaultValue" in e && Fi(e, !1), "__value" in e && Ii(e, e.__value));
	});
	t.observe(e, {
		childList: !0,
		subtree: !0,
		attributes: !0,
		attributeFilter: ["value"]
	}), Cn(() => {
		t.disconnect();
	});
}
function Ri(e) {
	return "__value" in e ? e.__value : e.value;
}
function zi(e) {
	if (e.target.closest("selectedcontent") !== null) return !0;
	if (e.type === "childList") {
		var t = [...e.addedNodes, ...e.removedNodes];
		return t.length > 0 && t.every((e) => e.nodeName === "SELECTEDCONTENT");
	}
	return !1;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/attributes.js
var Bi = Symbol("class"), Vi = Symbol("style"), Hi = Symbol("is custom element"), Ui = Symbol("is html"), Wi = de ? "link" : "LINK", Gi = de ? "input" : "INPUT", Ki = de ? "option" : "OPTION", qi = de ? "select" : "SELECT", Ji = de ? "progress" : "PROGRESS";
function Yi(e) {
	if (N) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					Xi(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					Xi(e, "checked", null), e.checked = r;
				}
			}
		};
		e[A] = n, $e(n), st();
	}
}
function Xi(e, t, n, r) {
	var i = $i(e);
	N && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === Wi) || i[t] !== (i[t] = n) && (t === "loading" && (e[k] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && ta(e).has(t) ? e[t] = n : e.setAttribute(t, n));
}
function Zi(e, n, r, i, a = !1, o = !1) {
	N && a && e.nodeName === Gi && ("defaultValue" in r || "defaultChecked" in r || Yi(e));
	var s = $i(e), c = s[Hi], l = !s[Ui];
	let u = N && c;
	u && he(!1);
	var d = n || {}, f = e.nodeName === Ki, p = e.nodeName === qi;
	try {
		for (var m in n) !(m in r) && m[0] + m[1] !== "$$" && (r[m] = null);
		r.class ? r.class = wi(r.class) : (i || r[Bi]) && (r.class = null), r[Vi] && (r.style ??= null);
		var h = ta(e);
		if (e.nodeName === Gi && "type" in r && ("value" in r || "__value" in r)) {
			var g = r.type;
			(g !== d.type || g === void 0 && e.hasAttribute("type")) && (d.type = g, Xi(e, "type", g, o));
		}
		for (let a in r) {
			let u = r[a];
			if (f && a === "value" && u == null) {
				e.value = e.__value = "", d[a] = u;
				continue;
			}
			if (a === "class") {
				Ai(e, e.namespaceURI === "http://www.w3.org/1999/xhtml", u, i, n?.[Bi], r[Bi]), d[a] = u, d[Bi] = r[Bi];
				continue;
			}
			if (a === "style") {
				Mi(e, u, n?.[Vi], r[Vi]), d[a] = u, d[Vi] = r[Vi];
				continue;
			}
			var _ = d[a];
			if (u !== _ || u === void 0 && e.hasAttribute(a)) {
				d[a] = u;
				var v = a[0] + a[1];
				if (v !== "$$") {
					if (v === "on") {
						let t = {}, n = "$$" + a, r = a.slice(2);
						var y = Vr(r);
						if (zr(r) && (r = r.slice(0, -7), t.capture = !0), !y && _) {
							if (u != null) continue;
							e.removeEventListener(r, d[n], t), d[n] = null;
						}
						if (y) Er(r, e, u), Dr([r]);
						else if (u != null) {
							function i(e) {
								d[a].call(this, e);
							}
							d[n] = wr(r, e, i, t);
						}
					} else if (a === "style") Xi(e, a, u);
					else if (a === "autofocus") at(e, !!u);
					else if (!c && (a === "__value" || a === "value" && u != null)) e.__value = u, (_ == null || e.value !== u || u === 0 && e.nodeName === Ji) && (e.value = u);
					else if (a === "selected" && f) Ni(e, u);
					else {
						var b = a;
						l || (b = Wr(b));
						var x = b === "defaultValue" || b === "defaultChecked";
						if (p && b === "defaultValue") continue;
						if (u == null && !c && !x) {
							if (s[a] = null, b === "value" || b === "checked") {
								let t = e, r = n === void 0;
								if (b === "value") {
									let e = t.defaultValue;
									t.removeAttribute(b), t.defaultValue = e, t.value = t.__value = r ? e : null;
								} else {
									let e = t.defaultChecked;
									t.removeAttribute(b), t.defaultChecked = e, t.checked = r ? e : !1;
								}
							} else e.removeAttribute(a);
						} else x || (c || typeof u != "string") && h.has(b) ? (e[b] = u, b in s && (s[b] = t)) : typeof u != "function" && Xi(e, b, u, o);
					}
				}
			}
		}
	} finally {
		u && he(!0);
	}
	return d;
}
function Qi(e, t, n = [], r = [], i = [], a, o = !1, s = !1) {
	lt(i, n, r, (n) => {
		var r = void 0, i = {}, c = e.nodeName === qi, l = !1;
		if (Pn(() => {
			var u = t(...n.map(H)), d = Zi(e, r, u, a, o, s);
			if (l && c) {
				var f = e;
				"defaultValue" in u && Pi(f, u.defaultValue), "value" in u && Ii(f, u.value);
			}
			for (let e of Object.getOwnPropertySymbols(i)) u[e] || zn(i[e]);
			for (let t of Object.getOwnPropertySymbols(u)) {
				var p = u[t];
				t.description === "@attach" && (!r || p !== r[t]) && (i[t] && zn(i[t]), i[t] = Fn(() => xi(e, () => p))), d[t] = p;
			}
			r = d;
		}), c) {
			var u = e;
			kn(() => {
				var e = r;
				"defaultValue" in e && Pi(u, e.defaultValue), Ii(u, e.value, !0), Li(u);
			});
		}
		l = !0;
	});
}
function $i(e) {
	return e[se] ??= {
		[Hi]: e.nodeName.includes("-"),
		[Ui]: e.namespaceURI === n
	};
}
var ea = /* @__PURE__ */ new Map();
function ta(e) {
	var t = e.getAttribute("is") || e.nodeName, n = ea.get(t);
	if (n) return n;
	ea.set(t, n = /* @__PURE__ */ new Set());
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var o in r = u(i), r) r[o].set && o !== "innerHTML" && o !== "textContent" && o !== "innerText" && n.add(o);
		i = p(i);
	}
	return n;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function na(e, t) {
	return e === t || e?.[O] === t;
}
function ra(e = Ye(), t, n, r) {
	var i = Ve.r, a = V;
	return kn(() => {
		var o, s;
		return jn(() => {
			o = s, s = r?.() || [], br(() => {
				na(n(...s), e) || (t(e, ...s), o && na(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && na(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/store.js
var ia = !1;
function aa(e) {
	var t = ia;
	try {
		return ia = !1, [e(), ia];
	} finally {
		ia = t;
	}
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/client/reactivity/props.js
var oa = {
	get(e, t) {
		if (!e.exclude.has(t)) return e.props[t];
	},
	set(e, t) {
		return !1;
	},
	getOwnPropertyDescriptor(e, t) {
		if (!e.exclude.has(t) && t in e.props) return {
			enumerable: !0,
			configurable: !0,
			value: e.props[t]
		};
	},
	has(e, t) {
		return !e.exclude.has(t) && t in e.props;
	},
	ownKeys(e) {
		return Reflect.ownKeys(e.props).filter((t) => !e.exclude.has(t));
	}
};
/*#__NO_SIDE_EFFECTS__*/
function sa(e, t, n) {
	return new Proxy({
		props: e,
		exclude: t
	}, oa);
}
var ca = {
	get(e, t) {
		let n = e.props.length;
		for (; n--;) {
			let r = e.props[n];
			if (h(r) && (r = r()), typeof r == "object" && r && t in r) return r[t];
		}
	},
	set(e, t, n) {
		let r = e.props.length;
		for (; r--;) {
			let i = e.props[r];
			h(i) && (i = i());
			let a = l(i, t);
			if (a && a.set) return a.set(n), !0;
		}
		return !1;
	},
	getOwnPropertyDescriptor(e, t) {
		let n = e.props.length;
		for (; n--;) {
			let r = e.props[n];
			if (h(r) && (r = r()), typeof r == "object" && r && t in r) {
				let e = l(r, t);
				return e && !e.configurable && (e.configurable = !0), e;
			}
		}
	},
	has(e, t) {
		if (t === O || t === oe) return !1;
		for (let n of e.props) if (h(n) && (n = n()), n != null && t in n) return !0;
		return !1;
	},
	ownKeys(e) {
		let t = [];
		for (let n of e.props) if (h(n) && (n = n()), n) {
			for (let e in n) t.includes(e) || t.push(e);
			for (let e of Object.getOwnPropertySymbols(n)) t.includes(e) || t.push(e);
		}
		return t;
	}
};
function la(...e) {
	return new Proxy({ props: e }, ca);
}
function G(e, t, n, r) {
	var i = !0, a = !!(n & 8), o = !!(n & 16), s = r, c = !0, u = void 0, d = () => o && i ? (u ??= /* @__PURE__ */ pt(r), H(u)) : (c && (c = !1, s = o ? br(r) : r), s);
	let f;
	if (a) {
		var p = O in e || oe in e;
		f = l(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	a ? [m, h] = aa(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && Me(t), f(m)));
	var g = i ? () => {
		var n = e[t];
		return n === void 0 ? d() : (c = !0, n);
	} : () => {
		var n = e[t];
		return n !== void 0 && (s = void 0), n === void 0 ? s : n;
	};
	if (i && !(n & 4)) return g;
	if (f) {
		var _ = e.$$legacy;
		return (function(e, t) {
			return arguments.length > 0 ? ((!i || !t || _ || h) && f(t ? g() : e), e) : g();
		});
	}
	var v = !1, y = (n & 1 ? pt : gt)(() => (v = !1, g()));
	a && H(y);
	var b = V;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? H(y) : i && a ? $t(e) : e;
			return R(y, n), v = !0, s !== void 0 && (s = n), e;
		}
		return Jn && v || b.f & 16384 ? y.v : H(y);
	});
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/internal/flags/async.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5"), Re();
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/tailwind-merge@3.7.0-c1edf3dd50354d0b/node_modules/tailwind-merge/dist/bundle-mjs.mjs
var ua = (e, t) => {
	let n = Array(e.length + t.length);
	for (let t = 0; t < e.length; t++) n[t] = e[t];
	for (let r = 0; r < t.length; r++) n[e.length + r] = t[r];
	return n;
}, da = (e, t) => ({
	classGroupId: e,
	validator: t
}), fa = (e = /* @__PURE__ */ new Map(), t = null, n) => ({
	nextPart: e,
	validators: t,
	classGroupId: n
}), pa = "-", ma = [], ha = "arbitrary..", ga = (e) => {
	let t = ya(e), { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e;
	return {
		getClassGroupId: (e) => {
			if (e.startsWith("[") && e.endsWith("]")) return va(e);
			let n = e.split(pa);
			return _a(n, +(n[0] === "" && n.length > 1), t);
		},
		getConflictingClassGroupIds: (e, t) => {
			if (t) {
				let t = r[e], i = n[e];
				return t ? i ? ua(i, t) : t : i || ma;
			}
			return n[e] || ma;
		}
	};
}, _a = (e, t, n) => {
	if (e.length - t === 0) return n.classGroupId;
	let r = e[t], i = n.nextPart.get(r);
	if (i) {
		let n = _a(e, t + 1, i);
		if (n) return n;
	}
	let a = n.validators;
	if (a === null) return;
	let o = t === 0 ? e.join(pa) : e.slice(t).join(pa), s = a.length;
	for (let e = 0; e < s; e++) {
		let t = a[e];
		if (t.validator(o)) return t.classGroupId;
	}
}, va = (e) => e.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
	let t = e.slice(1, -1), n = t.indexOf(":"), r = t.slice(0, n);
	return r ? ha + r : void 0;
})(), ya = (e) => {
	let { theme: t, classGroups: n } = e;
	return ba(n, t);
}, ba = (e, t) => {
	let n = fa();
	for (let r in e) {
		let i = e[r];
		xa(i, n, r, t);
	}
	return n;
}, xa = (e, t, n, r) => {
	let i = e.length;
	for (let a = 0; a < i; a++) {
		let i = e[a];
		Sa(i, t, n, r);
	}
}, Sa = (e, t, n, r) => {
	if (typeof e == "string") {
		Ca(e, t, n);
		return;
	}
	if (typeof e == "function") {
		wa(e, t, n, r);
		return;
	}
	Ta(e, t, n, r);
}, Ca = (e, t, n) => {
	let r = e === "" ? t : Ea(t, e);
	r.classGroupId = n;
}, wa = (e, t, n, r) => {
	if (Da(e)) {
		xa(e(r), t, n, r);
		return;
	}
	t.validators === null && (t.validators = []), t.validators.push(da(n, e));
}, Ta = (e, t, n, r) => {
	let i = Object.entries(e), a = i.length;
	for (let e = 0; e < a; e++) {
		let [a, o] = i[e];
		xa(o, Ea(t, a), n, r);
	}
}, Ea = (e, t) => {
	let n = e, r = t.split(pa), i = r.length;
	for (let e = 0; e < i; e++) {
		let t = r[e], i = n.nextPart.get(t);
		i || (i = fa(), n.nextPart.set(t, i)), n = i;
	}
	return n;
}, Da = (e) => "isThemeGetter" in e && e.isThemeGetter === !0, Oa = (e) => {
	if (e < 1) return {
		get: () => void 0,
		set: () => {}
	};
	let t = 0, n = Object.create(null), r = Object.create(null), i = (i, a) => {
		n[i] = a, t++, t > e && (t = 0, r = n, n = Object.create(null));
	};
	return {
		get(e) {
			let t = n[e];
			if (t !== void 0) return t;
			if ((t = r[e]) !== void 0) return i(e, t), t;
		},
		set(e, t) {
			e in n ? n[e] = t : i(e, t);
		}
	};
}, ka = "!", Aa = ":", ja = [], Ma = (e, t, n, r, i) => ({
	modifiers: e,
	hasImportantModifier: t,
	baseClassName: n,
	maybePostfixModifierPosition: r,
	isExternal: i
}), Na = (e) => {
	let { prefix: t, experimentalParseClassName: n } = e, r = (e) => {
		let t = [], n = 0, r = 0, i = 0, a, o = e.length;
		for (let s = 0; s < o; s++) {
			let o = e[s];
			if (n === 0 && r === 0) {
				if (o === Aa) {
					t.push(e.slice(i, s)), i = s + 1;
					continue;
				}
				if (o === "/") {
					a = s;
					continue;
				}
			}
			o === "[" ? n++ : o === "]" ? n-- : o === "(" ? r++ : o === ")" && r--;
		}
		let s = t.length === 0 ? e : e.slice(i), c = s, l = !1;
		s.endsWith(ka) ? (c = s.slice(0, -1), l = !0) : s.startsWith(ka) && (c = s.slice(1), l = !0);
		let u = a && a > i ? a - i : void 0;
		return Ma(t, l, c, u);
	};
	if (t) {
		let e = t + Aa, n = r;
		r = (t) => t.startsWith(e) ? n(t.slice(e.length)) : Ma(ja, !1, t, void 0, !0);
	}
	if (n) {
		let e = r;
		r = (t) => n({
			className: t,
			parseClassName: e
		});
	}
	return r;
}, Pa = (e) => {
	let t = /* @__PURE__ */ new Map();
	return e.orderSensitiveModifiers.forEach((e, n) => {
		t.set(e, 1e6 + n);
	}), (e) => {
		let n = [], r = [];
		for (let i = 0; i < e.length; i++) {
			let a = e[i], o = a[0] === "[", s = t.has(a);
			o || s ? (r.length > 0 && (r.sort(), n.push(...r), r = []), n.push(a)) : r.push(a);
		}
		return r.length > 0 && (r.sort(), n.push(...r)), n;
	};
}, Fa = (e) => ({
	cache: Oa(e.cacheSize),
	parseClassName: Na(e),
	sortModifiers: Pa(e),
	postfixLookupClassGroupIds: Ia(e),
	...ga(e)
}), Ia = (e) => {
	let t = Object.create(null), n = e.postfixLookupClassGroups;
	if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0;
	return t;
}, La = /\s+/, Ra = (e, t) => {
	let { parseClassName: n, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: a, postfixLookupClassGroupIds: o } = t, s = [], c = e.trim().split(La), l = "";
	for (let e = c.length - 1; e >= 0; --e) {
		let t = c[e], { isExternal: u, modifiers: d, hasImportantModifier: f, baseClassName: p, maybePostfixModifierPosition: m } = n(t);
		if (u) {
			l = t + (l.length > 0 ? " " + l : l);
			continue;
		}
		let h = !!m, g;
		if (h) {
			g = r(p.substring(0, m));
			let e = g && o[g] ? r(p) : void 0;
			e && e !== g && (g = e, h = !1);
		} else g = r(p);
		if (!g) {
			if (!h) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			if (g = r(p), !g) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			h = !1;
		}
		let _ = d.length === 0 ? "" : d.length === 1 ? d[0] : a(d).join(":"), v = f ? _ + ka : _, y = v + g;
		if (s.indexOf(y) > -1) continue;
		s.push(y);
		let b = i(g, h);
		for (let e = 0; e < b.length; ++e) {
			let t = b[e];
			s.push(v + t);
		}
		l = t + (l.length > 0 ? " " + l : l);
	}
	return l;
}, za = (...e) => {
	let t = 0, n, r, i = "";
	for (; t < e.length;) (n = e[t++]) && (r = Ba(n)) && (i && (i += " "), i += r);
	return i;
}, Ba = (e) => {
	if (typeof e == "string") return e;
	let t, n = "";
	for (let r = 0; r < e.length; r++) e[r] && (t = Ba(e[r])) && (n && (n += " "), n += t);
	return n;
}, Va = (e, ...t) => {
	let n, r, i, a, o = (o) => (n = Fa(t.reduce((e, t) => t(e), e())), r = n.cache.get, i = n.cache.set, a = s, s(o)), s = (e) => {
		let t = r(e);
		if (t) return t;
		let a = Ra(e, n);
		return i(e, a), a;
	};
	return a = o, (...e) => a(za(...e));
}, Ha = [], Ua = (e) => {
	let t = (t) => t[e] || Ha;
	return t.isThemeGetter = !0, t.themeKey = e, t;
}, Wa = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Ga = /^\((?:(\w[\w-]*):)?(.+)\)$/i, Ka = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, qa = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, Ja = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, Ya = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/, Xa = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, Za = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, Qa = (e) => Ka.test(e), K = (e) => !!e && !Number.isNaN(Number(e)), $a = (e) => !!e && Number.isInteger(Number(e)), eo = (e) => e.endsWith("%") && K(e.slice(0, -1)), to = (e) => qa.test(e), no = () => !0, ro = (e) => Ja.test(e) && !Ya.test(e), io = () => !1, ao = (e) => Xa.test(e), oo = (e) => Za.test(e), so = (e) => !q(e) && !J(e), co = (e) => e.startsWith("@container") && (e[10] === "/" && e[11] !== void 0 || e[11] === "s" && e[16] !== void 0 && e.startsWith("-size/", 10) || e[11] === "n" && e[18] !== void 0 && e.startsWith("-normal/", 10)), lo = (e) => To(e, ko, io), q = (e) => Wa.test(e), uo = (e) => To(e, Ao, ro), fo = (e) => To(e, jo, K), po = (e) => To(e, No, no), mo = (e) => To(e, Mo, io), ho = (e) => To(e, Do, io), go = (e) => To(e, Oo, oo), _o = (e) => To(e, Po, ao), J = (e) => Ga.test(e), vo = (e) => Eo(e, Ao), yo = (e) => Eo(e, Mo), bo = (e) => Eo(e, Do), xo = (e) => Eo(e, ko), So = (e) => Eo(e, Oo), Co = (e) => Eo(e, Po, !0), wo = (e) => Eo(e, No, !0), To = (e, t, n) => {
	let r = Wa.exec(e);
	return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, Eo = (e, t, n = !1) => {
	let r = Ga.exec(e);
	return r ? r[1] ? t(r[1]) : n : !1;
}, Do = (e) => e === "position" || e === "percentage", Oo = (e) => e === "image" || e === "url", ko = (e) => e === "length" || e === "size" || e === "bg-size", Ao = (e) => e === "length", jo = (e) => e === "number", Mo = (e) => e === "family-name", No = (e) => e === "number" || e === "weight", Po = (e) => e === "shadow", Fo = /*#__PURE__*/ Object.defineProperty({
	__proto__: null,
	isAny: no,
	isAnyNonArbitrary: so,
	isArbitraryFamilyName: mo,
	isArbitraryImage: go,
	isArbitraryLength: uo,
	isArbitraryNumber: fo,
	isArbitraryPosition: ho,
	isArbitraryShadow: _o,
	isArbitrarySize: lo,
	isArbitraryValue: q,
	isArbitraryVariable: J,
	isArbitraryVariableFamilyName: yo,
	isArbitraryVariableImage: So,
	isArbitraryVariableLength: vo,
	isArbitraryVariablePosition: bo,
	isArbitraryVariableShadow: Co,
	isArbitraryVariableSize: xo,
	isArbitraryVariableWeight: wo,
	isArbitraryWeight: po,
	isFraction: Qa,
	isInteger: $a,
	isNamedContainerQuery: co,
	isNumber: K,
	isPercent: eo,
	isTshirtSize: to
}, Symbol.toStringTag, { value: "Module" }), Io = () => {
	let e = Ua("color"), t = Ua("font"), n = Ua("text"), r = Ua("font-weight"), i = Ua("tracking"), a = Ua("leading"), o = Ua("breakpoint"), s = Ua("container"), c = Ua("spacing"), l = Ua("radius"), u = Ua("shadow"), d = Ua("inset-shadow"), f = Ua("text-shadow"), p = Ua("drop-shadow"), m = Ua("blur"), h = Ua("perspective"), g = Ua("aspect"), _ = Ua("ease"), v = Ua("animate"), y = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	], b = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	], x = () => [
		...b(),
		J,
		q
	], S = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	], C = () => [
		"auto",
		"contain",
		"none"
	], w = () => [
		J,
		q,
		c
	], T = () => [
		Qa,
		"full",
		"auto",
		...w()
	], E = () => [
		$a,
		"none",
		"subgrid",
		J,
		q
	], ee = () => [
		"auto",
		{ span: [
			"full",
			$a,
			J,
			q
		] },
		$a,
		J,
		q
	], te = () => [
		$a,
		"auto",
		J,
		q
	], ne = () => [
		"auto",
		"min",
		"max",
		"fr",
		J,
		q
	], re = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	], ie = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	], D = () => ["auto", ...w()], O = () => [
		Qa,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], ae = () => [
		s,
		Qa,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...w()
	], oe = () => [
		Qa,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], k = () => [
		e,
		J,
		q
	], se = () => [
		...b(),
		bo,
		ho,
		{ position: [J, q] }
	], ce = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }], le = () => [
		"auto",
		"cover",
		"contain",
		xo,
		lo,
		{ size: [J, q] }
	], ue = () => [
		eo,
		vo,
		uo
	], A = () => [
		"",
		"none",
		"full",
		l,
		J,
		q
	], j = () => [
		"",
		K,
		vo,
		uo
	], de = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	], fe = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	], M = () => [
		K,
		eo,
		bo,
		ho
	], pe = () => [
		"",
		"none",
		m,
		J,
		q
	], me = () => [
		"none",
		K,
		J,
		q
	], N = () => [
		"none",
		K,
		J,
		q
	], he = () => [
		K,
		J,
		q
	], P = () => [
		Qa,
		"full",
		...w()
	];
	return {
		cacheSize: 500,
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [to],
			breakpoint: [to],
			color: [no],
			container: [to],
			"drop-shadow": [to],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [so],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [to],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [to],
			shadow: [to],
			spacing: ["px", K],
			text: [to],
			"text-shadow": [to],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			aspect: [{ aspect: [
				"auto",
				"square",
				Qa,
				q,
				J,
				g
			] }],
			container: ["container"],
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				J,
				q
			] }],
			"container-named": [co],
			columns: [{ columns: [
				K,
				"auto",
				q,
				J,
				s
			] }],
			"break-after": [{ "break-after": y() }],
			"break-before": [{ "break-before": y() }],
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			box: [{ box: ["border", "content"] }],
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			sr: ["sr-only", "not-sr-only"],
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			isolation: ["isolate", "isolation-auto"],
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			"object-position": [{ object: x() }],
			overflow: [{ overflow: S() }],
			"overflow-x": [{ "overflow-x": S() }],
			"overflow-y": [{ "overflow-y": S() }],
			overscroll: [{ overscroll: C() }],
			"overscroll-x": [{ "overscroll-x": C() }],
			"overscroll-y": [{ "overscroll-y": C() }],
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			inset: [{ inset: T() }],
			"inset-x": [{ "inset-x": T() }],
			"inset-y": [{ "inset-y": T() }],
			start: [{
				"inset-s": T(),
				start: T()
			}],
			end: [{
				"inset-e": T(),
				end: T()
			}],
			"inset-bs": [{ "inset-bs": T() }],
			"inset-be": [{ "inset-be": T() }],
			top: [{ top: T() }],
			right: [{ right: T() }],
			bottom: [{ bottom: T() }],
			left: [{ left: T() }],
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			z: [{ z: [
				$a,
				"auto",
				J,
				q
			] }],
			basis: [{ basis: [
				Qa,
				"full",
				"auto",
				s,
				...w()
			] }],
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			flex: [{ flex: [
				K,
				Qa,
				"auto",
				"initial",
				"none",
				q
			] }],
			grow: [{ grow: [
				"",
				K,
				J,
				q
			] }],
			shrink: [{ shrink: [
				"",
				K,
				J,
				q
			] }],
			order: [{ order: [
				$a,
				"first",
				"last",
				"none",
				J,
				q
			] }],
			"grid-cols": [{ "grid-cols": E() }],
			"col-start-end": [{ col: ee() }],
			"col-start": [{ "col-start": te() }],
			"col-end": [{ "col-end": te() }],
			"grid-rows": [{ "grid-rows": E() }],
			"row-start-end": [{ row: ee() }],
			"row-start": [{ "row-start": te() }],
			"row-end": [{ "row-end": te() }],
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			"auto-cols": [{ "auto-cols": ne() }],
			"auto-rows": [{ "auto-rows": ne() }],
			gap: [{ gap: w() }],
			"gap-x": [{ "gap-x": w() }],
			"gap-y": [{ "gap-y": w() }],
			"justify-content": [{ justify: [...re(), "normal"] }],
			"justify-items": [{ "justify-items": [...ie(), "normal"] }],
			"justify-self": [{ "justify-self": ["auto", ...ie()] }],
			"align-content": [{ content: ["normal", ...re()] }],
			"align-items": [{ items: [...ie(), { baseline: ["", "last"] }] }],
			"align-self": [{ self: [
				"auto",
				...ie(),
				{ baseline: ["", "last"] }
			] }],
			"place-content": [{ "place-content": re() }],
			"place-items": [{ "place-items": [...ie(), "baseline"] }],
			"place-self": [{ "place-self": ["auto", ...ie()] }],
			p: [{ p: w() }],
			px: [{ px: w() }],
			py: [{ py: w() }],
			ps: [{ ps: w() }],
			pe: [{ pe: w() }],
			pbs: [{ pbs: w() }],
			pbe: [{ pbe: w() }],
			pt: [{ pt: w() }],
			pr: [{ pr: w() }],
			pb: [{ pb: w() }],
			pl: [{ pl: w() }],
			m: [{ m: D() }],
			mx: [{ mx: D() }],
			my: [{ my: D() }],
			ms: [{ ms: D() }],
			me: [{ me: D() }],
			mbs: [{ mbs: D() }],
			mbe: [{ mbe: D() }],
			mt: [{ mt: D() }],
			mr: [{ mr: D() }],
			mb: [{ mb: D() }],
			ml: [{ ml: D() }],
			"space-x": [{ "space-x": w() }],
			"space-x-reverse": ["space-x-reverse"],
			"space-y": [{ "space-y": w() }],
			"space-y-reverse": ["space-y-reverse"],
			size: [{ size: O() }],
			"inline-size": [{ inline: ["auto", ...ae()] }],
			"min-inline-size": [{ "min-inline": ["auto", ...ae()] }],
			"max-inline-size": [{ "max-inline": ["none", ...ae()] }],
			"block-size": [{ block: ["auto", ...oe()] }],
			"min-block-size": [{ "min-block": ["auto", ...oe()] }],
			"max-block-size": [{ "max-block": ["none", ...oe()] }],
			w: [{ w: [
				s,
				"screen",
				...O()
			] }],
			"min-w": [{ "min-w": [
				s,
				"screen",
				"none",
				...O()
			] }],
			"max-w": [{ "max-w": [
				s,
				"screen",
				"none",
				"prose",
				{ screen: [o] },
				...O()
			] }],
			h: [{ h: [
				"screen",
				"lh",
				...O()
			] }],
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...O()
			] }],
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				"none",
				...O()
			] }],
			"font-size": [{ text: [
				"base",
				n,
				vo,
				uo
			] }],
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			"font-style": ["italic", "not-italic"],
			"font-weight": [{ font: [
				r,
				wo,
				po
			] }],
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				eo,
				q
			] }],
			"font-family": [{ font: [
				yo,
				mo,
				t
			] }],
			"font-features": [{ "font-features": [q] }],
			"fvn-normal": ["normal-nums"],
			"fvn-ordinal": ["ordinal"],
			"fvn-slashed-zero": ["slashed-zero"],
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			tracking: [{ tracking: [
				i,
				J,
				q
			] }],
			"line-clamp": [{ "line-clamp": [
				K,
				"none",
				J,
				fo
			] }],
			leading: [{ leading: [
				"none",
				a,
				...w()
			] }],
			"list-image": [{ "list-image": [
				"none",
				J,
				q
			] }],
			"list-style-position": [{ list: ["inside", "outside"] }],
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				J,
				q
			] }],
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			"placeholder-color": [{ placeholder: k() }],
			"text-color": [{ text: k() }],
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			"text-decoration-style": [{ decoration: [...de(), "wavy"] }],
			"text-decoration-thickness": [{ decoration: [
				K,
				"from-font",
				"auto",
				J,
				uo
			] }],
			"text-decoration-color": [{ decoration: k() }],
			"underline-offset": [{ "underline-offset": [
				K,
				"auto",
				J,
				q
			] }],
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			indent: [{ indent: w() }],
			"tab-size": [{ tab: [
				$a,
				J,
				q
			] }],
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				J,
				q
			] }],
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			content: [{ content: [
				"none",
				J,
				q
			] }],
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			"bg-position": [{ bg: se() }],
			"bg-repeat": [{ bg: ce() }],
			"bg-size": [{ bg: le() }],
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						$a,
						J,
						q
					],
					radial: [
						"",
						J,
						q
					],
					conic: [
						"",
						$a,
						J,
						q
					]
				},
				So,
				go
			] }],
			"bg-color": [{ bg: k() }],
			"gradient-from-pos": [{ from: ue() }],
			"gradient-via-pos": [{ via: ue() }],
			"gradient-to-pos": [{ to: ue() }],
			"gradient-from": [{ from: k() }],
			"gradient-via": [{ via: k() }],
			"gradient-to": [{ to: k() }],
			rounded: [{ rounded: A() }],
			"rounded-s": [{ "rounded-s": A() }],
			"rounded-e": [{ "rounded-e": A() }],
			"rounded-t": [{ "rounded-t": A() }],
			"rounded-r": [{ "rounded-r": A() }],
			"rounded-b": [{ "rounded-b": A() }],
			"rounded-l": [{ "rounded-l": A() }],
			"rounded-ss": [{ "rounded-ss": A() }],
			"rounded-se": [{ "rounded-se": A() }],
			"rounded-ee": [{ "rounded-ee": A() }],
			"rounded-es": [{ "rounded-es": A() }],
			"rounded-tl": [{ "rounded-tl": A() }],
			"rounded-tr": [{ "rounded-tr": A() }],
			"rounded-br": [{ "rounded-br": A() }],
			"rounded-bl": [{ "rounded-bl": A() }],
			"border-w": [{ border: j() }],
			"border-w-x": [{ "border-x": j() }],
			"border-w-y": [{ "border-y": j() }],
			"border-w-s": [{ "border-s": j() }],
			"border-w-e": [{ "border-e": j() }],
			"border-w-bs": [{ "border-bs": j() }],
			"border-w-be": [{ "border-be": j() }],
			"border-w-t": [{ "border-t": j() }],
			"border-w-r": [{ "border-r": j() }],
			"border-w-b": [{ "border-b": j() }],
			"border-w-l": [{ "border-l": j() }],
			"divide-x": [{ "divide-x": j() }],
			"divide-x-reverse": ["divide-x-reverse"],
			"divide-y": [{ "divide-y": j() }],
			"divide-y-reverse": ["divide-y-reverse"],
			"border-style": [{ border: [
				...de(),
				"hidden",
				"none"
			] }],
			"divide-style": [{ divide: [
				...de(),
				"hidden",
				"none"
			] }],
			"border-color": [{ border: k() }],
			"border-color-x": [{ "border-x": k() }],
			"border-color-y": [{ "border-y": k() }],
			"border-color-s": [{ "border-s": k() }],
			"border-color-e": [{ "border-e": k() }],
			"border-color-bs": [{ "border-bs": k() }],
			"border-color-be": [{ "border-be": k() }],
			"border-color-t": [{ "border-t": k() }],
			"border-color-r": [{ "border-r": k() }],
			"border-color-b": [{ "border-b": k() }],
			"border-color-l": [{ "border-l": k() }],
			"divide-color": [{ divide: k() }],
			"outline-style": [{ outline: [
				...de(),
				"none",
				"hidden"
			] }],
			"outline-offset": [{ "outline-offset": [
				K,
				J,
				q
			] }],
			"outline-w": [{ outline: [
				"",
				K,
				vo,
				uo
			] }],
			"outline-color": [{ outline: k() }],
			shadow: [{ shadow: [
				"",
				"inner",
				"none",
				u,
				Co,
				_o
			] }],
			"shadow-color": [{ shadow: k() }],
			"inset-shadow": [{ "inset-shadow": [
				"none",
				d,
				Co,
				_o
			] }],
			"inset-shadow-color": [{ "inset-shadow": k() }],
			"ring-w": [{ ring: j() }],
			"ring-w-inset": ["ring-inset"],
			"ring-color": [{ ring: k() }],
			"ring-offset-w": [{ "ring-offset": [K, uo] }],
			"ring-offset-color": [{ "ring-offset": k() }],
			"inset-ring-w": [{ "inset-ring": j() }],
			"inset-ring-color": [{ "inset-ring": k() }],
			"text-shadow": [{ "text-shadow": [
				"none",
				f,
				Co,
				_o
			] }],
			"text-shadow-color": [{ "text-shadow": k() }],
			opacity: [{ opacity: [
				K,
				J,
				q
			] }],
			"mix-blend": [{ "mix-blend": [
				...fe(),
				"plus-darker",
				"plus-lighter"
			] }],
			"bg-blend": [{ "bg-blend": fe() }],
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			"mask-image-linear-pos": [{ "mask-linear": [K] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": M() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": M() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": k() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": k() }],
			"mask-image-t-from-pos": [{ "mask-t-from": M() }],
			"mask-image-t-to-pos": [{ "mask-t-to": M() }],
			"mask-image-t-from-color": [{ "mask-t-from": k() }],
			"mask-image-t-to-color": [{ "mask-t-to": k() }],
			"mask-image-r-from-pos": [{ "mask-r-from": M() }],
			"mask-image-r-to-pos": [{ "mask-r-to": M() }],
			"mask-image-r-from-color": [{ "mask-r-from": k() }],
			"mask-image-r-to-color": [{ "mask-r-to": k() }],
			"mask-image-b-from-pos": [{ "mask-b-from": M() }],
			"mask-image-b-to-pos": [{ "mask-b-to": M() }],
			"mask-image-b-from-color": [{ "mask-b-from": k() }],
			"mask-image-b-to-color": [{ "mask-b-to": k() }],
			"mask-image-l-from-pos": [{ "mask-l-from": M() }],
			"mask-image-l-to-pos": [{ "mask-l-to": M() }],
			"mask-image-l-from-color": [{ "mask-l-from": k() }],
			"mask-image-l-to-color": [{ "mask-l-to": k() }],
			"mask-image-x-from-pos": [{ "mask-x-from": M() }],
			"mask-image-x-to-pos": [{ "mask-x-to": M() }],
			"mask-image-x-from-color": [{ "mask-x-from": k() }],
			"mask-image-x-to-color": [{ "mask-x-to": k() }],
			"mask-image-y-from-pos": [{ "mask-y-from": M() }],
			"mask-image-y-to-pos": [{ "mask-y-to": M() }],
			"mask-image-y-from-color": [{ "mask-y-from": k() }],
			"mask-image-y-to-color": [{ "mask-y-to": k() }],
			"mask-image-radial": [{ "mask-radial": [J, q] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": M() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": M() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": k() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": k() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": b() }],
			"mask-image-conic-pos": [{ "mask-conic": [K] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": M() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": M() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": k() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": k() }],
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			"mask-position": [{ mask: se() }],
			"mask-repeat": [{ mask: ce() }],
			"mask-size": [{ mask: le() }],
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			"mask-image": [{ mask: [
				"none",
				J,
				q
			] }],
			filter: [{ filter: [
				"",
				"none",
				J,
				q
			] }],
			blur: [{ blur: pe() }],
			brightness: [{ brightness: [
				K,
				J,
				q
			] }],
			contrast: [{ contrast: [
				K,
				J,
				q
			] }],
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				p,
				Co,
				_o
			] }],
			"drop-shadow-color": [{ "drop-shadow": k() }],
			grayscale: [{ grayscale: [
				"",
				K,
				J,
				q
			] }],
			"hue-rotate": [{ "hue-rotate": [
				K,
				J,
				q
			] }],
			invert: [{ invert: [
				"",
				K,
				J,
				q
			] }],
			saturate: [{ saturate: [
				K,
				J,
				q
			] }],
			sepia: [{ sepia: [
				"",
				K,
				J,
				q
			] }],
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				J,
				q
			] }],
			"backdrop-blur": [{ "backdrop-blur": pe() }],
			"backdrop-brightness": [{ "backdrop-brightness": [
				K,
				J,
				q
			] }],
			"backdrop-contrast": [{ "backdrop-contrast": [
				K,
				J,
				q
			] }],
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				K,
				J,
				q
			] }],
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				K,
				J,
				q
			] }],
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				K,
				J,
				q
			] }],
			"backdrop-opacity": [{ "backdrop-opacity": [
				K,
				J,
				q
			] }],
			"backdrop-saturate": [{ "backdrop-saturate": [
				K,
				J,
				q
			] }],
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				K,
				J,
				q
			] }],
			"border-collapse": [{ border: ["collapse", "separate"] }],
			"border-spacing": [{ "border-spacing": w() }],
			"border-spacing-x": [{ "border-spacing-x": w() }],
			"border-spacing-y": [{ "border-spacing-y": w() }],
			"table-layout": [{ table: ["auto", "fixed"] }],
			caption: [{ caption: ["top", "bottom"] }],
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				J,
				q
			] }],
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			duration: [{ duration: [
				K,
				"initial",
				J,
				q
			] }],
			ease: [{ ease: [
				"linear",
				"initial",
				_,
				J,
				q
			] }],
			delay: [{ delay: [
				K,
				J,
				q
			] }],
			animate: [{ animate: [
				"none",
				v,
				J,
				q
			] }],
			backface: [{ backface: ["hidden", "visible"] }],
			perspective: [{ perspective: [
				h,
				J,
				q
			] }],
			"perspective-origin": [{ "perspective-origin": x() }],
			rotate: [{ rotate: me() }],
			"rotate-x": [{ "rotate-x": me() }],
			"rotate-y": [{ "rotate-y": me() }],
			"rotate-z": [{ "rotate-z": me() }],
			scale: [{ scale: N() }],
			"scale-x": [{ "scale-x": N() }],
			"scale-y": [{ "scale-y": N() }],
			"scale-z": [{ "scale-z": N() }],
			"scale-3d": ["scale-3d"],
			skew: [{ skew: he() }],
			"skew-x": [{ "skew-x": he() }],
			"skew-y": [{ "skew-y": he() }],
			transform: [{ transform: [
				J,
				q,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			"transform-origin": [{ origin: x() }],
			"transform-style": [{ transform: ["3d", "flat"] }],
			translate: [{ translate: P() }],
			"translate-x": [{ "translate-x": P() }],
			"translate-y": [{ "translate-y": P() }],
			"translate-z": [{ "translate-z": P() }],
			"translate-none": ["translate-none"],
			zoom: [{ zoom: [
				$a,
				J,
				q
			] }],
			accent: [{ accent: k() }],
			appearance: [{ appearance: ["none", "auto"] }],
			"caret-color": [{ caret: k() }],
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				J,
				q
			] }],
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			"scrollbar-thumb-color": [{ "scrollbar-thumb": k() }],
			"scrollbar-track-color": [{ "scrollbar-track": k() }],
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			"scroll-m": [{ "scroll-m": w() }],
			"scroll-mx": [{ "scroll-mx": w() }],
			"scroll-my": [{ "scroll-my": w() }],
			"scroll-ms": [{ "scroll-ms": w() }],
			"scroll-me": [{ "scroll-me": w() }],
			"scroll-mbs": [{ "scroll-mbs": w() }],
			"scroll-mbe": [{ "scroll-mbe": w() }],
			"scroll-mt": [{ "scroll-mt": w() }],
			"scroll-mr": [{ "scroll-mr": w() }],
			"scroll-mb": [{ "scroll-mb": w() }],
			"scroll-ml": [{ "scroll-ml": w() }],
			"scroll-p": [{ "scroll-p": w() }],
			"scroll-px": [{ "scroll-px": w() }],
			"scroll-py": [{ "scroll-py": w() }],
			"scroll-ps": [{ "scroll-ps": w() }],
			"scroll-pe": [{ "scroll-pe": w() }],
			"scroll-pbs": [{ "scroll-pbs": w() }],
			"scroll-pbe": [{ "scroll-pbe": w() }],
			"scroll-pt": [{ "scroll-pt": w() }],
			"scroll-pr": [{ "scroll-pr": w() }],
			"scroll-pb": [{ "scroll-pb": w() }],
			"scroll-pl": [{ "scroll-pl": w() }],
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			"snap-stop": [{ snap: ["normal", "always"] }],
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			"touch-pz": ["touch-pinch-zoom"],
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				J,
				q
			] }],
			fill: [{ fill: ["none", ...k()] }],
			"stroke-w": [{ stroke: [
				K,
				vo,
				uo,
				fo
			] }],
			stroke: [{ stroke: ["none", ...k()] }],
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": [
				"start",
				"end",
				"right",
				"left"
			],
			"inset-y": [
				"inset-bs",
				"inset-be",
				"top",
				"bottom"
			],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: [
				"ps",
				"pe",
				"pr",
				"pl"
			],
			py: [
				"pbs",
				"pbe",
				"pt",
				"pb"
			],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: [
				"ms",
				"me",
				"mr",
				"ml"
			],
			my: [
				"mbs",
				"mbe",
				"mt",
				"mb"
			],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": [
				"border-w-s",
				"border-w-e",
				"border-w-r",
				"border-w-l"
			],
			"border-w-y": [
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-b"
			],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": [
				"border-color-s",
				"border-color-e",
				"border-color-r",
				"border-color-l"
			],
			"border-color-y": [
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-b"
			],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": [
				"scroll-ms",
				"scroll-me",
				"scroll-mr",
				"scroll-ml"
			],
			"scroll-my": [
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mb"
			],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": [
				"scroll-ps",
				"scroll-pe",
				"scroll-pr",
				"scroll-pl"
			],
			"scroll-py": [
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pb"
			],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
}, Lo = (e, { cacheSize: t, prefix: n, experimentalParseClassName: r, extend: i = {}, override: a = {} }) => (Ro(e, "cacheSize", t), Ro(e, "prefix", n), Ro(e, "experimentalParseClassName", r), zo(e.theme, a.theme), zo(e.classGroups, a.classGroups), zo(e.conflictingClassGroups, a.conflictingClassGroups), zo(e.conflictingClassGroupModifiers, a.conflictingClassGroupModifiers), Ro(e, "postfixLookupClassGroups", a.postfixLookupClassGroups), Ro(e, "orderSensitiveModifiers", a.orderSensitiveModifiers), Bo(e.theme, i.theme), Bo(e.classGroups, i.classGroups), Bo(e.conflictingClassGroups, i.conflictingClassGroups), Bo(e.conflictingClassGroupModifiers, i.conflictingClassGroupModifiers), Vo(e, i, "postfixLookupClassGroups"), Vo(e, i, "orderSensitiveModifiers"), e), Ro = (e, t, n) => {
	n !== void 0 && (e[t] = n);
}, zo = (e, t) => {
	if (t) for (let n in t) Ro(e, n, t[n]);
}, Bo = (e, t) => {
	if (t) for (let n in t) Vo(e, t, n);
}, Vo = (e, t, n) => {
	let r = t[n];
	r !== void 0 && (e[n] = e[n] ? e[n].concat(r) : r);
}, Ho = (e, ...t) => typeof e == "function" ? Va(Io, e, ...t) : Va(() => Lo(Io(), e), ...t), Uo = Array.isArray, Wo = (e) => {
	if (!e && e !== 0 && e !== 0n) return "";
	if (typeof e == "string") return e;
	if (typeof e == "number") return e === e ? "" + e : "";
	if (typeof e == "bigint") return "" + e;
	let t = "";
	if (Uo(e)) {
		let n = e.length;
		for (let r = 0; r < n; r++) {
			let n = e[r];
			if (!n && n !== 0 && n !== 0n) continue;
			let i = typeof n == "string" ? n : Wo(n);
			i && (t && (t += " "), t += i);
		}
		return t;
	}
	if (typeof e == "object") for (let n in e) e[n] && (t && (t += " "), t += n);
	return t;
}, Go = /\s+/g, Ko = Array.isArray, qo = (e) => typeof e != "string" || !e ? e : e.replace(Go, " ").trim(), Jo = (e) => {
	let t = e.length;
	if (t === 0) return !1;
	let n = e.charCodeAt(0), r = e.charCodeAt(t - 1);
	if (n === 32 || r === 32 || n >= 9 && n <= 13 || n === 160 || r >= 9 && r <= 13 || r === 160) return !0;
	for (let n = 0; n < t; n++) {
		let r = e.charCodeAt(n);
		if (r >= 9 && r <= 13 || r === 160 || r === 32 && n + 1 < t && e.charCodeAt(n + 1) === 32) return !0;
	}
	return !1;
}, Yo = (...e) => {
	let t = Wo(e);
	if (t) return Jo(t) ? qo(t) : t;
}, Xo = (e) => e === !1 ? "false" : e === !0 ? "true" : e === 0 ? "0" : e, Zo = (e) => {
	if (!e || typeof e != "object") return !0;
	for (let t in e) return !1;
	return !0;
}, Qo = (e, t) => {
	if (e === t) return !0;
	if (!e || !t) return !1;
	let n = e, r = t, i = Object.keys(n), a = Object.keys(r);
	if (i.length !== a.length) return !1;
	for (let e = 0; e < i.length; e++) {
		let t = i[e];
		if (!a.includes(t) || n[t] !== r[t]) return !1;
	}
	return !0;
}, $o = (e, t) => {
	let n = e;
	for (let e in t) if (Object.hasOwn(t, e)) {
		let r = t[e];
		n[e] = e in n ? Yo(n[e], r) : r;
	}
	return e;
}, es = (e, t) => {
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		Ko(r) ? es(r, t) : r && t.push(r);
	}
}, ts = (...e) => {
	let t = [];
	es(e, t);
	let n = [];
	for (let e = 0; e < t.length; e++) t[e] && n.push(t[e]);
	return n;
}, ns = (e, t) => {
	let n = e, r = t, i = {};
	for (let e in n) {
		let t = n[e];
		if (e in r) {
			let n = r[e];
			i[e] = Ko(t) || Ko(n) ? ts(n, t) : typeof t == "object" && typeof n == "object" && t && n ? ns(t, n) : n + " " + t;
		} else i[e] = t;
	}
	for (let e in r) e in n || (i[e] = r[e]);
	return i;
}, rs = {
	twMerge: !0,
	twMergeConfig: {}
}, is = 256, as = 128, os = /* @__PURE__ */ Symbol("tv-cache-miss"), ss = (e) => e?.class != null && e.class !== "" || e?.className != null && e.className !== "", cs = (e) => {
	if (e === void 0) return "";
	if (e === null) return "null";
	if (typeof e == "string") return e;
	if (typeof e == "boolean") return e ? "true" : "false";
	if (typeof e == "number") return e === 0 ? "0" : String(e);
	if (typeof e == "bigint") return String(e);
	let t = Xo(e), n = typeof t;
	if (n === "string" || n === "number" || n === "boolean" || n === "bigint") return String(t);
	if (n === "object") try {
		return JSON.stringify(t);
	} catch {
		return null;
	}
	return null;
}, ls = (e, t) => {
	if (t === void 0) return e;
	if (t === null) return e + "null";
	let n = typeof t;
	if (n === "string" || n === "number" || n === "boolean" || n === "bigint") return e + String(t);
	if (Array.isArray(t)) return e + t.join("\0");
	try {
		return e + JSON.stringify(t);
	} catch {
		return e + "?";
	}
}, us = (e, t, n, r) => {
	let i = "", a = /* @__PURE__ */ Object.create(null);
	for (let r = 0; r < e.length; r++) {
		let o = e[r];
		a[o] = 1;
		let s = t[o];
		n && n[o] !== void 0 && (s = n[o]);
		let c = cs(s);
		if (c === null) return null;
		i += o + ":" + c + ";";
	}
	let o = [];
	for (let e in t) e === "class" || e === "className" || a[e] || (a[e] = 1, o.push(e));
	if (n) for (let e in n) e === "class" || e === "className" || a[e] || n[e] === void 0 || (a[e] = 1, o.push(e));
	o.length > 1 && o.sort();
	for (let e = 0; e < o.length; e++) {
		let r = o[e], a = t[r];
		n && n[r] !== void 0 && (a = n[r]);
		let s = cs(a);
		if (s === null) return null;
		i += r + ":" + s + ";";
	}
	return i;
}, ds = (e, t) => {
	let n = "";
	for (let t = 0; t < e.length; t++) {
		let { conditionKeys: r, source: i } = e[t];
		for (let e = 0; e < r.length; e++) {
			let t = r[e];
			n += t + "=", n = ls(n, i[t]), n += ",";
		}
		n += "c=", n = ls(n, i.class), n += "|cn=", n = ls(n, i.className), n += ";";
	}
	for (let e = 0; e < t.length; e++) {
		let { conditionKeys: r, source: i } = t[e];
		for (let e = 0; e < r.length; e++) {
			let t = r[e];
			n += t + "=", n = ls(n, i[t]), n += ",";
		}
		Array.isArray(i.slots) && (n += "slots=" + i.slots.join(",") + ","), n += "c=", n = ls(n, i.class), n += "|cn=", n = ls(n, i.className), n += ";";
	}
	return n;
}, fs = (e = is) => {
	let t = /* @__PURE__ */ new Map(), n = null;
	return {
		get(e) {
			if (t.has(e)) return t.get(e);
			if (n?.has(e)) {
				let r = n.get(e);
				return t.set(e, r), r;
			}
			return os;
		},
		set(r, i) {
			t.size >= e && (n = t, t = /* @__PURE__ */ new Map()), t.set(r, i);
		}
	};
}, ps = (e = is) => {
	let t = fs(e);
	return {
		get(e) {
			return t.get(e);
		},
		set(e, n) {
			t.set(e, n);
		}
	};
}, ms = (e = as) => {
	let t = /* @__PURE__ */ new Map(), n = null, r = 0;
	return {
		get(e, i) {
			let a = t.get(e);
			if (a) {
				let e = a.get(i);
				if (e !== void 0 || a.has(i)) return e;
			}
			if (n) {
				let a = n.get(e);
				if (a) {
					let n = a.get(i);
					if (n !== void 0 || a.has(i)) {
						let a = t.get(e);
						return a || (a = /* @__PURE__ */ new Map(), t.set(e, a)), a.has(i) || r++, a.set(i, n), n;
					}
				}
			}
			return os;
		},
		set(i, a, o) {
			r >= e && (n = t, t = /* @__PURE__ */ new Map(), r = 0);
			let s = t.get(i);
			s || (s = /* @__PURE__ */ new Map(), t.set(i, s)), s.has(a) || r++, s.set(a, o);
		}
	};
}, hs = (e, t) => {
	let n = null;
	return (r, i) => {
		if (!ss(i)) return r;
		let a = i.class, o = i.className;
		if (a != null && a !== "" && typeof a != "string" || o != null && o !== "" && typeof o != "string") return e(t, r, a, o);
		n ??= ms();
		let s = r ?? "", c = (typeof a == "string" ? a : "") + "\0" + (typeof o == "string" ? o : ""), l = n.get(s, c);
		if (l !== os) return l;
		let u = e(t, r, a, o);
		return n.set(s, c, u), u;
	};
};
function gs() {
	let e = null, t = {}, n = !1;
	return {
		get cachedTwMerge() {
			return e;
		},
		set cachedTwMerge(t) {
			e = t;
		},
		get cachedTwMergeConfig() {
			return t;
		},
		set cachedTwMergeConfig(e) {
			t = e;
		},
		get didTwMergeConfigChange() {
			return n;
		},
		set didTwMergeConfigChange(e) {
			n = e;
		},
		reset() {
			e = null, t = {}, n = !1;
		}
	};
}
var _s = gs(), vs = (e) => {
	!Zo(e.twMergeConfig) && !Qo(e.twMergeConfig, _s.cachedTwMergeConfig) && (_s.didTwMergeConfigChange = !0, _s.cachedTwMergeConfig = e.twMergeConfig);
}, ys = (e, t) => {
	let n = [];
	for (let r = 0; r < t.length; r++) {
		let i = t[r], a = e[i];
		n.push({
			key: i,
			values: a,
			isEmpty: Zo(a)
		});
	}
	return n;
}, bs = (e) => {
	if (!Array.isArray(e) || e.length === 0) return [];
	let t = [];
	for (let n = 0; n < e.length; n++) {
		let r = e[n], i = [];
		for (let e in r) e !== "class" && e !== "className" && i.push(e);
		t.push({
			conditionKeys: i,
			source: r
		});
	}
	return t;
}, xs = (e) => {
	if (!Array.isArray(e) || e.length === 0) return [];
	let t = [];
	for (let n = 0; n < e.length; n++) {
		let r = e[n], i = [];
		for (let e in r) e !== "slots" && e !== "class" && e !== "className" && i.push(e);
		t.push({
			conditionKeys: i,
			source: r
		});
	}
	return t;
}, Ss = (e) => {
	let t = {};
	for (let n = 0; n < e.length; n++) {
		let r = e[n], i = r.source.slots;
		if (Array.isArray(i)) for (let e = 0; e < i.length; e++) {
			let n = i[e];
			t[n] || (t[n] = []), t[n].push(r);
		}
	}
	return t;
}, Cs = (e, t) => {
	let { extend: n = null, slots: r = {}, variants: i = {}, compoundVariants: a = [], compoundSlots: o = [], defaultVariants: s = {} } = e, c = {
		...rs,
		...t
	}, l = e.slots !== void 0, u = n?.base ? Yo(n.base, e?.base) : e?.base, d = n?.variants && !Zo(n.variants) ? ns(i, n.variants) : i, f = n?.defaultVariants && !Zo(n.defaultVariants) ? {
		...n.defaultVariants,
		...s
	} : s;
	vs(c);
	let p = !n?.slots || Zo(n.slots), m = l ? p && n?.base ? Yo(e?.base, n.base) : typeof e?.base == "string" || e?.base == null ? e.base : Yo(e.base) : void 0, h = l ? {
		base: m,
		...r
	} : {}, g = p ? h : $o({ ...n?.slots }, Zo(h) ? { base: e?.base } : h), _ = !n?.compoundVariants || Zo(n.compoundVariants) ? a : ts(n?.compoundVariants, a), v = !n?.compoundSlots || Zo(n.compoundSlots) ? o : ts(n?.compoundSlots, o), y = Object.keys(d);
	return {
		config: c,
		extend: n,
		base: u,
		variants: d,
		defaultVariants: f,
		slots: g,
		compoundVariants: _,
		compoundSlots: v,
		compiledVariants: null,
		compiledCompoundVariants: null,
		compiledCompoundSlots: null,
		compiledCompoundSlotsBySlot: null,
		deferredError: _ && !Array.isArray(_) ? /* @__PURE__ */ TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof _}`) : v && !Array.isArray(v) ? /* @__PURE__ */ TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof v}`) : null,
		mode: l || !p ? "slots" : y.length === 0 ? "plain" : "variants",
		slotKeys: null,
		variantKeys: y
	};
}, ws = (e) => e.compiledVariants === null ? (e.compiledVariants = ys(e.variants, e.variantKeys), e.compiledCompoundVariants = bs(e.compoundVariants), e.compiledCompoundSlots = xs(e.compoundSlots), e.compiledCompoundSlotsBySlot = Ss(e.compiledCompoundSlots), e.slotKeys = e.slots && typeof e.slots == "object" ? Object.keys(e.slots) : [], e) : e, Ts = [], Es = [], Ds = [], Os = [], ks = [], As = (e, t, n) => {
	let r = {};
	for (let t in e) r[t] = e[t];
	if (t) for (let e in t) t[e] !== void 0 && (r[e] = t[e]);
	if (n) for (let e in n) n[e] !== void 0 && (r[e] = n[e]);
	return r;
}, js = (e) => e == null || e === !1, Ms = (e, t) => {
	if (!Array.isArray(e)) return e === t || js(e) && js(t);
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		if (r === t || js(r) && js(t)) return !0;
	}
	return !1;
}, Ns = (e, t, n, r) => {
	if (e.isEmpty) return null;
	let i = r?.[e.key] ?? n?.[e.key];
	if (i === null) return null;
	let a = Xo(i);
	if (typeof a == "object") return null;
	let o = t?.[e.key], s = a ?? Xo(o);
	return e.values[s || "false"];
}, Ps = (e, t) => {
	let { conditionKeys: n, source: r } = e;
	for (let e = 0; e < n.length; e++) {
		let i = n[e];
		if (!Ms(r[i], t[i])) return !1;
	}
	return !0;
}, Fs = (e, t, n) => {
	typeof n == "string" ? t === "base" && e.push(n) : n && typeof n == "object" && n[t] && e.push(n[t]);
}, Is = (e, t, n) => {
	let r = Es;
	r.length = 0;
	for (let i = 0; i < e.length; i++) {
		let a = Ns(e[i], t, n);
		a && r.push(a);
	}
	return r;
}, Ls = (e, t, n, r, i) => {
	let a = Es;
	a.length = 0;
	for (let o = 0; o < t.length; o++) {
		let s = Ns(t[o], n, r, i), c = e === "base" && typeof s == "string" ? s : s && s[e];
		c && a.push(c);
	}
	return a;
}, Rs = (e, t) => {
	let n = Ds;
	n.length = 0;
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		Ps(i, t) && (i.source.class && n.push(i.source.class), i.source.className && n.push(i.source.className));
	}
	return n;
}, zs = (e, t, n) => {
	let r = Os;
	r.length = 0;
	for (let i = 0; i < t.length; i++) {
		let a = t[i];
		Ps(a, n) && (Fs(r, e, a.source.class), Fs(r, e, a.source.className));
	}
	return r;
}, Bs = (e, t) => {
	let n = ks;
	n.length = 0;
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		Ps(i, t) && (i.source.class && n.push(i.source.class), i.source.className && n.push(i.source.className));
	}
	return n;
}, Vs = (e, t) => {
	let { base: n, config: r } = e, i = os, a = hs(t, r);
	return ((e) => (i === os && (i = t(r, n)), a(i, e)));
}, Hs = (e, t) => {
	let { base: n, config: r, defaultVariants: i, deferredError: a, variantKeys: o } = e, s = e.compiledCompoundVariants, c = e.compiledVariants, l = Ts, u = null, d = hs(t, r), f = 1, p = (e) => {
		let a = s.length > 0 ? Rs(s, As(i, e)) : void 0;
		return t(r, n, Is(c, i, e), a);
	};
	return ((t) => {
		if (a) throw a;
		(c === null || s === null) && (ws(e), c = e.compiledVariants, s = e.compiledCompoundVariants, l = e.compiledCompoundSlots ?? Ts);
		let n;
		if (f > 0) f--, n = p(t);
		else {
			u ??= ps();
			let e = us(o, i, t);
			if (e !== null) {
				let r = s.length > 0 || l.length > 0 ? ds(s, l) : "", i = e + "#" + r, a = u.get(i);
				a === os ? (n = p(t), u.set(i, n)) : n = a;
			} else n = p(t);
		}
		return d(n, t);
	});
}, Us = (e, t) => {
	let { config: n, defaultVariants: r, deferredError: i, slots: a, variantKeys: o } = e, s = null, c = null, l = null, u = null, d = !1, f = null, p = null, m = 1, h = () => {
		if (l !== null) return;
		(e.compiledVariants === null || e.compiledCompoundVariants === null || e.compiledCompoundSlots === null || e.compiledCompoundSlotsBySlot === null || e.slotKeys === null) && ws(e);
		let i = e.compiledVariants;
		s = e.compiledCompoundVariants, c = e.compiledCompoundSlots;
		let o = e.compiledCompoundSlotsBySlot;
		l = e.slotKeys, d = s.length > 0 || c.length > 0, f = hs(t, n);
		let p = Array(l.length);
		for (let e = 0; e < l.length; e++) {
			let c = l[e], u = o[c] ?? Ts;
			p[e] = (e, o) => {
				let l = d ? As(r, e, o) : void 0, f = l ? zs(c, s, l) : void 0, p = l ? Bs(u, l) : void 0;
				return t(n, a[c], Ls(c, i, r, e, o), f, p);
			};
		}
		u = p;
	}, g = (e) => {
		let t = l, n = u, r = f, i = {};
		for (let a = 0; a < t.length; a++) {
			let o = n[a], s = o(e);
			i[t[a]] = (t) => {
				if (t == null) return s;
				let n = !1;
				for (let e in t) if (e !== "class" && e !== "className" && t[e] !== void 0) {
					n = !0;
					break;
				}
				return r(n ? o(e, t) : s, t);
			};
		}
		return i;
	};
	return ((e) => {
		if (i) throw i;
		if (h(), m > 0) return m--, g(e);
		let t = us(o, r, e);
		if (t === null) return g(e);
		let n = d ? ds(s, c) : "", a = t + "#" + n;
		p ??= fs();
		let l = p.get(a);
		if (l !== os) return l;
		let u = g(e);
		return p.set(a, u), u;
	});
}, Ws = (e, t) => {
	if (e.mode === "plain") return Vs(e, t);
	let n;
	return ((r) => (n ??= e.mode === "slots" ? Us(e, t) : Hs(e, t), n(r)));
}, Gs = (e, t) => {
	e.variantKeys = t.variantKeys, e.extend = t.extend, e.base = t.base, e.slots = t.slots, e.variants = t.variants, e.defaultVariants = t.defaultVariants, e.compoundSlots = t.compoundSlots, e.compoundVariants = t.compoundVariants;
}, Ks = (e) => {
	let t = (t, n) => {
		let r = Cs(t, n), i = Ws(r, e);
		return Gs(i, r), i;
	};
	return {
		tv: t,
		createTV: (e) => (n, r) => t(n, r ? ns(e, r) : e)
	};
}, qs = (e, t) => {
	let n = e.length, r = t.length, i = Array(n + r);
	for (let t = 0; t < n; t++) i[t] = e[t];
	for (let e = 0; e < r; e++) i[n + e] = t[e];
	return i;
}, Js = (e, t) => ({
	classGroupId: e,
	validator: t
}), Ys = (e = /* @__PURE__ */ new Map(), t = null, n) => ({
	nextPart: e,
	validators: t,
	classGroupId: n
}), Xs = "-", Zs = [], Qs = "arbitrary..", $s = (e) => {
	let t = nc(e), { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e;
	return {
		getClassGroupId: (e) => {
			if (e[0] === "[" && e[e.length - 1] === "]") return tc(e);
			let n = e.split(Xs);
			return ec(n, +(n[0] === "" && n.length > 1), t);
		},
		getConflictingClassGroupIds: (e, t) => {
			if (t) {
				let t = r[e], i = n[e];
				return t ? i ? qs(i, t) : t : i || Zs;
			}
			return n[e] || Zs;
		}
	};
}, ec = (e, t, n) => {
	if (e.length - t === 0) return n.classGroupId;
	let r = e[t], i = n.nextPart.get(r);
	if (i) {
		let n = ec(e, t + 1, i);
		if (n) return n;
	}
	let a = n.validators;
	if (a === null) return;
	let o = t === 0 ? e.join(Xs) : e.slice(t).join(Xs), s = a.length;
	for (let e = 0; e < s; e++) {
		let t = a[e];
		if (t.validator(o)) return t.classGroupId;
	}
}, tc = (e) => {
	let t = e.slice(1, -1), n = t.indexOf(":");
	if (n === -1) return;
	let r = t.slice(0, n);
	return r ? Qs + r : void 0;
}, nc = (e) => {
	let { theme: t, classGroups: n } = e;
	return rc(n, t);
}, rc = (e, t) => {
	let n = Ys();
	for (let r in e) {
		let i = e[r];
		ic(i, n, r, t);
	}
	return n;
}, ic = (e, t, n, r) => {
	let i = e.length;
	for (let a = 0; a < i; a++) {
		let i = e[a];
		ac(i, t, n, r);
	}
}, ac = (e, t, n, r) => {
	if (typeof e == "string") {
		oc(e, t, n);
		return;
	}
	if (typeof e == "function") {
		sc(e, t, n, r);
		return;
	}
	cc(e, t, n, r);
}, oc = (e, t, n) => {
	let r = e === "" ? t : lc(t, e);
	r.classGroupId = n;
}, sc = (e, t, n, r) => {
	if (uc(e)) {
		ic(e(r), t, n, r);
		return;
	}
	t.validators === null && (t.validators = []), t.validators.push(Js(n, e));
}, cc = (e, t, n, r) => {
	let i = Object.entries(e), a = i.length;
	for (let e = 0; e < a; e++) {
		let [a, o] = i[e];
		ic(o, lc(t, a), n, r);
	}
}, lc = (e, t) => {
	let n = e, r = t.split(Xs), i = r.length;
	for (let e = 0; e < i; e++) {
		let t = r[e], i = n.nextPart.get(t);
		i || (i = Ys(), n.nextPart.set(t, i)), n = i;
	}
	return n;
}, uc = (e) => "isThemeGetter" in e && e.isThemeGetter === !0, dc = "!", fc = 58, pc = 47, mc = 91, hc = 93, gc = 40, _c = 41, vc = 33, yc = (e, t, n, r) => ({
	modifiers: e,
	hasImportantModifier: t,
	baseClassName: n,
	maybePostfixModifierPosition: r,
	isExternal: void 0
}), bc = (e) => {
	let t = [], n = 0, r = 0, i = 0, a, o = e.length;
	for (let s = 0; s < o; s++) {
		let o = e.charCodeAt(s);
		if (n === 0 && r === 0) {
			if (o === fc) {
				t.push(e.slice(i, s)), i = s + 1;
				continue;
			}
			if (o === pc) {
				a = s;
				continue;
			}
		}
		o === mc ? n++ : o === hc ? n-- : o === gc ? r++ : o === _c && r--;
	}
	let s = t.length === 0 ? e : e.slice(i), c = s, l = !1, u = s.length - 1;
	s.charCodeAt(u) === vc ? (c = s.slice(0, -1), l = !0) : s.charCodeAt(0) === vc && (c = s.slice(1), l = !0);
	let d = a && a > i ? a - i : void 0;
	return yc(t, l, c, d);
}, xc = (e) => {
	let t = new Set(e.orderSensitiveModifiers);
	return (e) => {
		let n = [], r = [];
		for (let i = 0; i < e.length; i++) {
			let a = e[i], o = a[0] === "[", s = t.has(a);
			if (o || s) {
				if (r.length > 0) {
					r.sort();
					for (let e = 0; e < r.length; e++) n.push(r[e]);
					r = [];
				}
				n.push(a);
			} else r.push(a);
		}
		if (r.length > 0) {
			r.sort();
			for (let e = 0; e < r.length; e++) n.push(r[e]);
		}
		return n;
	};
}, Sc = {
	isExternal: !0,
	classId: -1,
	conflictIds: []
}, Cc = 4096, wc = 16384, Tc = (e) => {
	let t = xc(e), n = Ec(e), { getClassGroupId: r, getConflictingClassGroupIds: i } = $s(e), a = /* @__PURE__ */ Object.create(null), o = /* @__PURE__ */ Object.create(null), s = 0, c = /* @__PURE__ */ new Int32Array(256), l = 0, u = /* @__PURE__ */ new Uint8Array(64), d = !1, f = (e) => {
		let t = [], n = e.length, r = -1;
		d = !1;
		for (let i = 0; i < n; i++) {
			let n = e.charCodeAt(i);
			n === 32 ? r !== -1 && (t.push(e.slice(r, i)), r = -1) : n >= 9 && n <= 13 ? (d = !0, r !== -1 && (t.push(e.slice(r, i)), r = -1)) : r === -1 && (r = i);
		}
		return r !== -1 && t.push(e.slice(r)), t;
	}, p = /* @__PURE__ */ new Map(), m = 0, h = (e) => {
		let t = p.get(e);
		if (t === void 0 && (t = m++, p.set(e, t), t >= c.length)) {
			let e = new Int32Array(c.length * 2);
			e.set(c), c = e;
		}
		return t;
	}, g = (e) => {
		let { isExternal: a, modifiers: o, hasImportantModifier: s, baseClassName: c, maybePostfixModifierPosition: l } = bc(e);
		if (a) return Sc;
		let u = !!l, d;
		if (u) {
			let e = c.substring(0, l);
			d = r(e);
			let t = d && n[d] ? r(c) : void 0;
			t && t !== d && (d = t, u = !1);
		} else d = r(c);
		if (!d) {
			if (!u || (d = r(c), !d)) return Sc;
			u = !1;
		}
		let f = o.length === 0 ? "" : o.length === 1 ? o[0] : t(o).join(":"), p = s ? f + dc : f, m = i(d, u), g = [];
		for (let e = 0; e < m.length; e++) g.push(h(p + m[e]));
		return {
			isExternal: !1,
			classId: h(p + d),
			conflictIds: g
		};
	}, _ = (e) => {
		let t = a[e];
		return t === void 0 ? (t = o[e], t === void 0 && (t = g(e)), a[e] = t, ++s > Cc && (s = 0, o = a, a = /* @__PURE__ */ Object.create(null)), t) : t;
	};
	return {
		parseClassName: bc,
		sortModifiers: t,
		postfixLookupClassGroupIds: n,
		getClassGroupId: r,
		getConflictingClassGroupIds: i,
		getClassDescriptor: _,
		mergeClassList: (e) => {
			let t = f(e), n = t.length;
			if (n === 1) return t[0];
			m > wc && (p.clear(), m = 0, a = /* @__PURE__ */ Object.create(null), o = /* @__PURE__ */ Object.create(null), s = 0), l = l + 1 | 0, l === 0 && (l = 1);
			let r = l;
			if (n > u.length) {
				let e = u.length;
				for (; e < n;) e *= 2;
				u = new Uint8Array(e);
			}
			let i = !1, h = 0;
			for (let e = n - 1; e >= 0; --e) {
				let n = t[e];
				h += n.length;
				let a = _(n);
				if (a.isExternal) {
					u[e] = 1;
					continue;
				}
				let o = a.classId;
				if (c[o] === r) {
					u[e] = 0, i = !0;
					continue;
				}
				c[o] = r;
				let s = a.conflictIds;
				for (let e = 0; e < s.length; e++) c[s[e]] = r;
				u[e] = 1;
			}
			if (!i && !d && e.length === h + n - 1) return e;
			let g = "";
			for (let e = 0; e < n; e++) u[e] === 1 && (g && (g += " "), g += t[e]);
			return g;
		}
	};
}, Ec = (e) => {
	let t = /* @__PURE__ */ Object.create(null), n = e.postfixLookupClassGroups;
	if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0;
	return t;
}, Dc = 500, Oc = (e) => {
	let t, n, r = /* @__PURE__ */ Object.create(null), i = /* @__PURE__ */ Object.create(null), a = 0, o = (r) => (t = Tc(e()), n = t.mergeClassList, c.mergeString = s, s(r)), s = (e) => {
		let t = r[e];
		return t === void 0 ? (t = i[e], t === void 0 && (t = n(e)), r[e] = t, ++a > Dc && (a = 0, i = r, r = /* @__PURE__ */ Object.create(null)), t) : t;
	}, c = (...e) => c.mergeString(Wo(e));
	return c.mergeString = o, c;
}, kc = [], Ac = (e) => {
	let t = (t) => t[e] || kc;
	return t.isThemeGetter = !0, t;
}, jc = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Mc = /^\((?:(\w[\w-]*):)?(.+)\)$/i, Nc = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, Pc = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, Fc = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, Ic = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, Lc = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, Rc = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, zc = Number, Bc = Number.isNaN, Vc = Number.isInteger, Hc = (e) => Nc.test(e), Y = (e) => !!e && !Bc(zc(e)), Uc = (e) => !!e && Vc(zc(e)), Wc = (e) => e.endsWith("%") && Y(e.slice(0, -1)), Gc = (e) => Pc.test(e), Kc = () => !0, qc = (e) => Fc.test(e) && !Ic.test(e), Jc = () => !1, Yc = (e) => Lc.test(e), Xc = (e) => Rc.test(e), Zc = (e) => !X(e) && !Z(e), Qc = (e) => e.startsWith("@container") && (e[10] === "/" && e[11] !== void 0 || e[11] === "s" && e[16] !== void 0 && e.startsWith("-size/", 10) || e[11] === "n" && e[18] !== void 0 && e.startsWith("-normal/", 10)), $c = (e) => ml(e, vl, Jc), X = (e) => jc.test(e), el = (e) => ml(e, yl, qc), tl = (e) => ml(e, bl, Y), nl = (e) => ml(e, Sl, Kc), rl = (e) => ml(e, xl, Jc), il = (e) => ml(e, gl, Jc), al = (e) => ml(e, _l, Xc), ol = (e) => ml(e, Cl, Yc), Z = (e) => Mc.test(e), sl = (e) => hl(e, yl), cl = (e) => hl(e, xl), ll = (e) => hl(e, gl), ul = (e) => hl(e, vl), dl = (e) => hl(e, _l), fl = (e) => hl(e, Cl, !0), pl = (e) => hl(e, Sl, !0), ml = (e, t, n) => {
	let r = jc.exec(e);
	return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, hl = (e, t, n = !1) => {
	let r = Mc.exec(e);
	return r ? r[1] ? t(r[1]) : n : !1;
}, gl = (e) => e === "position" || e === "percentage", _l = (e) => e === "image" || e === "url", vl = (e) => e === "length" || e === "size" || e === "bg-size", yl = (e) => e === "length", bl = (e) => e === "number", xl = (e) => e === "family-name", Sl = (e) => e === "number" || e === "weight", Cl = (e) => e === "shadow", wl = () => {
	let e = Ac("color"), t = Ac("font"), n = Ac("text"), r = Ac("font-weight"), i = Ac("tracking"), a = Ac("leading"), o = Ac("breakpoint"), s = Ac("container"), c = Ac("spacing"), l = Ac("radius"), u = Ac("shadow"), d = Ac("inset-shadow"), f = Ac("text-shadow"), p = Ac("drop-shadow"), m = Ac("blur"), h = Ac("perspective"), g = Ac("aspect"), _ = Ac("ease"), v = Ac("animate"), y = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	], b = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	], x = () => [
		...b(),
		Z,
		X
	], S = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	], C = () => [
		"auto",
		"contain",
		"none"
	], w = () => [
		Z,
		X,
		c
	], T = () => [
		Hc,
		"full",
		"auto",
		...w()
	], E = () => [
		Uc,
		"none",
		"subgrid",
		Z,
		X
	], ee = () => [
		"auto",
		{ span: [
			"full",
			Uc,
			Z,
			X
		] },
		Uc,
		Z,
		X
	], te = () => [
		Uc,
		"auto",
		Z,
		X
	], ne = () => [
		"auto",
		"min",
		"max",
		"fr",
		Z,
		X
	], re = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	], ie = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	], D = () => ["auto", ...w()], O = () => [
		Hc,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], ae = () => [
		Hc,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...w()
	], oe = () => [
		Hc,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], k = () => [
		e,
		Z,
		X
	], se = () => [
		...b(),
		ll,
		il,
		{ position: [Z, X] }
	], ce = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }], le = () => [
		"auto",
		"cover",
		"contain",
		ul,
		$c,
		{ size: [Z, X] }
	], ue = () => [
		Wc,
		sl,
		el
	], A = () => [
		"",
		"none",
		"full",
		l,
		Z,
		X
	], j = () => [
		"",
		Y,
		sl,
		el
	], de = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	], fe = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	], M = () => [
		Y,
		Wc,
		ll,
		il
	], pe = () => [
		"",
		"none",
		m,
		Z,
		X
	], me = () => [
		"none",
		Y,
		Z,
		X
	], N = () => [
		"none",
		Y,
		Z,
		X
	], he = () => [
		Y,
		Z,
		X
	], P = () => [
		Hc,
		"full",
		...w()
	];
	return {
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [Gc],
			breakpoint: [Gc],
			color: [Kc],
			container: [Gc],
			"drop-shadow": [Gc],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [Zc],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [Gc],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [Gc],
			shadow: [Gc],
			spacing: ["px", Y],
			text: [Gc],
			"text-shadow": [Gc],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			aspect: [{ aspect: [
				"auto",
				"square",
				Hc,
				X,
				Z,
				g
			] }],
			container: ["container"],
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				Z,
				X
			] }],
			"container-named": [Qc],
			columns: [{ columns: [
				Y,
				X,
				Z,
				s
			] }],
			"break-after": [{ "break-after": y() }],
			"break-before": [{ "break-before": y() }],
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			box: [{ box: ["border", "content"] }],
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			sr: ["sr-only", "not-sr-only"],
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			isolation: ["isolate", "isolation-auto"],
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			"object-position": [{ object: x() }],
			overflow: [{ overflow: S() }],
			"overflow-x": [{ "overflow-x": S() }],
			"overflow-y": [{ "overflow-y": S() }],
			overscroll: [{ overscroll: C() }],
			"overscroll-x": [{ "overscroll-x": C() }],
			"overscroll-y": [{ "overscroll-y": C() }],
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			inset: [{ inset: T() }],
			"inset-x": [{ "inset-x": T() }],
			"inset-y": [{ "inset-y": T() }],
			start: [{
				"inset-s": T(),
				start: T()
			}],
			end: [{
				"inset-e": T(),
				end: T()
			}],
			"inset-bs": [{ "inset-bs": T() }],
			"inset-be": [{ "inset-be": T() }],
			top: [{ top: T() }],
			right: [{ right: T() }],
			bottom: [{ bottom: T() }],
			left: [{ left: T() }],
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			z: [{ z: [
				Uc,
				"auto",
				Z,
				X
			] }],
			basis: [{ basis: [
				Hc,
				"full",
				"auto",
				s,
				...w()
			] }],
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			flex: [{ flex: [
				Y,
				Hc,
				"auto",
				"initial",
				"none",
				X
			] }],
			grow: [{ grow: [
				"",
				Y,
				Z,
				X
			] }],
			shrink: [{ shrink: [
				"",
				Y,
				Z,
				X
			] }],
			order: [{ order: [
				Uc,
				"first",
				"last",
				"none",
				Z,
				X
			] }],
			"grid-cols": [{ "grid-cols": E() }],
			"col-start-end": [{ col: ee() }],
			"col-start": [{ "col-start": te() }],
			"col-end": [{ "col-end": te() }],
			"grid-rows": [{ "grid-rows": E() }],
			"row-start-end": [{ row: ee() }],
			"row-start": [{ "row-start": te() }],
			"row-end": [{ "row-end": te() }],
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			"auto-cols": [{ "auto-cols": ne() }],
			"auto-rows": [{ "auto-rows": ne() }],
			gap: [{ gap: w() }],
			"gap-x": [{ "gap-x": w() }],
			"gap-y": [{ "gap-y": w() }],
			"justify-content": [{ justify: [...re(), "normal"] }],
			"justify-items": [{ "justify-items": [...ie(), "normal"] }],
			"justify-self": [{ "justify-self": ["auto", ...ie()] }],
			"align-content": [{ content: ["normal", ...re()] }],
			"align-items": [{ items: [...ie(), { baseline: ["", "last"] }] }],
			"align-self": [{ self: [
				"auto",
				...ie(),
				{ baseline: ["", "last"] }
			] }],
			"place-content": [{ "place-content": re() }],
			"place-items": [{ "place-items": [...ie(), "baseline"] }],
			"place-self": [{ "place-self": ["auto", ...ie()] }],
			p: [{ p: w() }],
			px: [{ px: w() }],
			py: [{ py: w() }],
			ps: [{ ps: w() }],
			pe: [{ pe: w() }],
			pbs: [{ pbs: w() }],
			pbe: [{ pbe: w() }],
			pt: [{ pt: w() }],
			pr: [{ pr: w() }],
			pb: [{ pb: w() }],
			pl: [{ pl: w() }],
			m: [{ m: D() }],
			mx: [{ mx: D() }],
			my: [{ my: D() }],
			ms: [{ ms: D() }],
			me: [{ me: D() }],
			mbs: [{ mbs: D() }],
			mbe: [{ mbe: D() }],
			mt: [{ mt: D() }],
			mr: [{ mr: D() }],
			mb: [{ mb: D() }],
			ml: [{ ml: D() }],
			"space-x": [{ "space-x": w() }],
			"space-x-reverse": ["space-x-reverse"],
			"space-y": [{ "space-y": w() }],
			"space-y-reverse": ["space-y-reverse"],
			size: [{ size: O() }],
			"inline-size": [{ inline: ["auto", ...ae()] }],
			"min-inline-size": [{ "min-inline": ["auto", ...ae()] }],
			"max-inline-size": [{ "max-inline": ["none", ...ae()] }],
			"block-size": [{ block: ["auto", ...oe()] }],
			"min-block-size": [{ "min-block": ["auto", ...oe()] }],
			"max-block-size": [{ "max-block": ["none", ...oe()] }],
			w: [{ w: [
				s,
				"screen",
				...O()
			] }],
			"min-w": [{ "min-w": [
				s,
				"screen",
				"none",
				...O()
			] }],
			"max-w": [{ "max-w": [
				s,
				"screen",
				"none",
				"prose",
				{ screen: [o] },
				...O()
			] }],
			h: [{ h: [
				"screen",
				"lh",
				...O()
			] }],
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...O()
			] }],
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				...O()
			] }],
			"font-size": [{ text: [
				"base",
				n,
				sl,
				el
			] }],
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			"font-style": ["italic", "not-italic"],
			"font-weight": [{ font: [
				r,
				pl,
				nl
			] }],
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				Wc,
				X
			] }],
			"font-family": [{ font: [
				cl,
				rl,
				t
			] }],
			"font-features": [{ "font-features": [X] }],
			"fvn-normal": ["normal-nums"],
			"fvn-ordinal": ["ordinal"],
			"fvn-slashed-zero": ["slashed-zero"],
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			tracking: [{ tracking: [
				i,
				Z,
				X
			] }],
			"line-clamp": [{ "line-clamp": [
				Y,
				"none",
				Z,
				tl
			] }],
			leading: [{ leading: [a, ...w()] }],
			"list-image": [{ "list-image": [
				"none",
				Z,
				X
			] }],
			"list-style-position": [{ list: ["inside", "outside"] }],
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				Z,
				X
			] }],
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			"placeholder-color": [{ placeholder: k() }],
			"text-color": [{ text: k() }],
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			"text-decoration-style": [{ decoration: [...de(), "wavy"] }],
			"text-decoration-thickness": [{ decoration: [
				Y,
				"from-font",
				"auto",
				Z,
				el
			] }],
			"text-decoration-color": [{ decoration: k() }],
			"underline-offset": [{ "underline-offset": [
				Y,
				"auto",
				Z,
				X
			] }],
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			indent: [{ indent: w() }],
			"tab-size": [{ tab: [
				Uc,
				Z,
				X
			] }],
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				Z,
				X
			] }],
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			content: [{ content: [
				"none",
				Z,
				X
			] }],
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			"bg-position": [{ bg: se() }],
			"bg-repeat": [{ bg: ce() }],
			"bg-size": [{ bg: le() }],
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						Uc,
						Z,
						X
					],
					radial: [
						"",
						Z,
						X
					],
					conic: [
						Uc,
						Z,
						X
					]
				},
				dl,
				al
			] }],
			"bg-color": [{ bg: k() }],
			"gradient-from-pos": [{ from: ue() }],
			"gradient-via-pos": [{ via: ue() }],
			"gradient-to-pos": [{ to: ue() }],
			"gradient-from": [{ from: k() }],
			"gradient-via": [{ via: k() }],
			"gradient-to": [{ to: k() }],
			rounded: [{ rounded: A() }],
			"rounded-s": [{ "rounded-s": A() }],
			"rounded-e": [{ "rounded-e": A() }],
			"rounded-t": [{ "rounded-t": A() }],
			"rounded-r": [{ "rounded-r": A() }],
			"rounded-b": [{ "rounded-b": A() }],
			"rounded-l": [{ "rounded-l": A() }],
			"rounded-ss": [{ "rounded-ss": A() }],
			"rounded-se": [{ "rounded-se": A() }],
			"rounded-ee": [{ "rounded-ee": A() }],
			"rounded-es": [{ "rounded-es": A() }],
			"rounded-tl": [{ "rounded-tl": A() }],
			"rounded-tr": [{ "rounded-tr": A() }],
			"rounded-br": [{ "rounded-br": A() }],
			"rounded-bl": [{ "rounded-bl": A() }],
			"border-w": [{ border: j() }],
			"border-w-x": [{ "border-x": j() }],
			"border-w-y": [{ "border-y": j() }],
			"border-w-s": [{ "border-s": j() }],
			"border-w-e": [{ "border-e": j() }],
			"border-w-bs": [{ "border-bs": j() }],
			"border-w-be": [{ "border-be": j() }],
			"border-w-t": [{ "border-t": j() }],
			"border-w-r": [{ "border-r": j() }],
			"border-w-b": [{ "border-b": j() }],
			"border-w-l": [{ "border-l": j() }],
			"divide-x": [{ "divide-x": j() }],
			"divide-x-reverse": ["divide-x-reverse"],
			"divide-y": [{ "divide-y": j() }],
			"divide-y-reverse": ["divide-y-reverse"],
			"border-style": [{ border: [
				...de(),
				"hidden",
				"none"
			] }],
			"divide-style": [{ divide: [
				...de(),
				"hidden",
				"none"
			] }],
			"border-color": [{ border: k() }],
			"border-color-x": [{ "border-x": k() }],
			"border-color-y": [{ "border-y": k() }],
			"border-color-s": [{ "border-s": k() }],
			"border-color-e": [{ "border-e": k() }],
			"border-color-bs": [{ "border-bs": k() }],
			"border-color-be": [{ "border-be": k() }],
			"border-color-t": [{ "border-t": k() }],
			"border-color-r": [{ "border-r": k() }],
			"border-color-b": [{ "border-b": k() }],
			"border-color-l": [{ "border-l": k() }],
			"divide-color": [{ divide: k() }],
			"outline-style": [{ outline: [
				...de(),
				"none",
				"hidden"
			] }],
			"outline-offset": [{ "outline-offset": [
				Y,
				Z,
				X
			] }],
			"outline-w": [{ outline: [
				"",
				Y,
				sl,
				el
			] }],
			"outline-color": [{ outline: k() }],
			shadow: [{ shadow: [
				"",
				"none",
				u,
				fl,
				ol
			] }],
			"shadow-color": [{ shadow: k() }],
			"inset-shadow": [{ "inset-shadow": [
				"none",
				d,
				fl,
				ol
			] }],
			"inset-shadow-color": [{ "inset-shadow": k() }],
			"ring-w": [{ ring: j() }],
			"ring-w-inset": ["ring-inset"],
			"ring-color": [{ ring: k() }],
			"ring-offset-w": [{ "ring-offset": [Y, el] }],
			"ring-offset-color": [{ "ring-offset": k() }],
			"inset-ring-w": [{ "inset-ring": j() }],
			"inset-ring-color": [{ "inset-ring": k() }],
			"text-shadow": [{ "text-shadow": [
				"none",
				f,
				fl,
				ol
			] }],
			"text-shadow-color": [{ "text-shadow": k() }],
			opacity: [{ opacity: [
				Y,
				Z,
				X
			] }],
			"mix-blend": [{ "mix-blend": [
				...fe(),
				"plus-darker",
				"plus-lighter"
			] }],
			"bg-blend": [{ "bg-blend": fe() }],
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			"mask-image-linear-pos": [{ "mask-linear": [Y] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": M() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": M() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": k() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": k() }],
			"mask-image-t-from-pos": [{ "mask-t-from": M() }],
			"mask-image-t-to-pos": [{ "mask-t-to": M() }],
			"mask-image-t-from-color": [{ "mask-t-from": k() }],
			"mask-image-t-to-color": [{ "mask-t-to": k() }],
			"mask-image-r-from-pos": [{ "mask-r-from": M() }],
			"mask-image-r-to-pos": [{ "mask-r-to": M() }],
			"mask-image-r-from-color": [{ "mask-r-from": k() }],
			"mask-image-r-to-color": [{ "mask-r-to": k() }],
			"mask-image-b-from-pos": [{ "mask-b-from": M() }],
			"mask-image-b-to-pos": [{ "mask-b-to": M() }],
			"mask-image-b-from-color": [{ "mask-b-from": k() }],
			"mask-image-b-to-color": [{ "mask-b-to": k() }],
			"mask-image-l-from-pos": [{ "mask-l-from": M() }],
			"mask-image-l-to-pos": [{ "mask-l-to": M() }],
			"mask-image-l-from-color": [{ "mask-l-from": k() }],
			"mask-image-l-to-color": [{ "mask-l-to": k() }],
			"mask-image-x-from-pos": [{ "mask-x-from": M() }],
			"mask-image-x-to-pos": [{ "mask-x-to": M() }],
			"mask-image-x-from-color": [{ "mask-x-from": k() }],
			"mask-image-x-to-color": [{ "mask-x-to": k() }],
			"mask-image-y-from-pos": [{ "mask-y-from": M() }],
			"mask-image-y-to-pos": [{ "mask-y-to": M() }],
			"mask-image-y-from-color": [{ "mask-y-from": k() }],
			"mask-image-y-to-color": [{ "mask-y-to": k() }],
			"mask-image-radial": [{ "mask-radial": [Z, X] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": M() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": M() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": k() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": k() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": b() }],
			"mask-image-conic-pos": [{ "mask-conic": [Y] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": M() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": M() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": k() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": k() }],
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			"mask-position": [{ mask: se() }],
			"mask-repeat": [{ mask: ce() }],
			"mask-size": [{ mask: le() }],
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			"mask-image": [{ mask: [
				"none",
				Z,
				X
			] }],
			filter: [{ filter: [
				"",
				"none",
				Z,
				X
			] }],
			blur: [{ blur: pe() }],
			brightness: [{ brightness: [
				Y,
				Z,
				X
			] }],
			contrast: [{ contrast: [
				Y,
				Z,
				X
			] }],
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				p,
				fl,
				ol
			] }],
			"drop-shadow-color": [{ "drop-shadow": k() }],
			grayscale: [{ grayscale: [
				"",
				Y,
				Z,
				X
			] }],
			"hue-rotate": [{ "hue-rotate": [
				Y,
				Z,
				X
			] }],
			invert: [{ invert: [
				"",
				Y,
				Z,
				X
			] }],
			saturate: [{ saturate: [
				Y,
				Z,
				X
			] }],
			sepia: [{ sepia: [
				"",
				Y,
				Z,
				X
			] }],
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				Z,
				X
			] }],
			"backdrop-blur": [{ "backdrop-blur": pe() }],
			"backdrop-brightness": [{ "backdrop-brightness": [
				Y,
				Z,
				X
			] }],
			"backdrop-contrast": [{ "backdrop-contrast": [
				Y,
				Z,
				X
			] }],
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				Y,
				Z,
				X
			] }],
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				Y,
				Z,
				X
			] }],
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				Y,
				Z,
				X
			] }],
			"backdrop-opacity": [{ "backdrop-opacity": [
				Y,
				Z,
				X
			] }],
			"backdrop-saturate": [{ "backdrop-saturate": [
				Y,
				Z,
				X
			] }],
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				Y,
				Z,
				X
			] }],
			"border-collapse": [{ border: ["collapse", "separate"] }],
			"border-spacing": [{ "border-spacing": w() }],
			"border-spacing-x": [{ "border-spacing-x": w() }],
			"border-spacing-y": [{ "border-spacing-y": w() }],
			"table-layout": [{ table: ["auto", "fixed"] }],
			caption: [{ caption: ["top", "bottom"] }],
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				Z,
				X
			] }],
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			duration: [{ duration: [
				Y,
				"initial",
				Z,
				X
			] }],
			ease: [{ ease: [
				"linear",
				"initial",
				_,
				Z,
				X
			] }],
			delay: [{ delay: [
				Y,
				Z,
				X
			] }],
			animate: [{ animate: [
				"none",
				v,
				Z,
				X
			] }],
			backface: [{ backface: ["hidden", "visible"] }],
			perspective: [{ perspective: [
				h,
				Z,
				X
			] }],
			"perspective-origin": [{ "perspective-origin": x() }],
			rotate: [{ rotate: me() }],
			"rotate-x": [{ "rotate-x": me() }],
			"rotate-y": [{ "rotate-y": me() }],
			"rotate-z": [{ "rotate-z": me() }],
			scale: [{ scale: N() }],
			"scale-x": [{ "scale-x": N() }],
			"scale-y": [{ "scale-y": N() }],
			"scale-z": [{ "scale-z": N() }],
			"scale-3d": ["scale-3d"],
			skew: [{ skew: he() }],
			"skew-x": [{ "skew-x": he() }],
			"skew-y": [{ "skew-y": he() }],
			transform: [{ transform: [
				Z,
				X,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			"transform-origin": [{ origin: x() }],
			"transform-style": [{ transform: ["3d", "flat"] }],
			translate: [{ translate: P() }],
			"translate-x": [{ "translate-x": P() }],
			"translate-y": [{ "translate-y": P() }],
			"translate-z": [{ "translate-z": P() }],
			"translate-none": ["translate-none"],
			zoom: [{ zoom: [
				Uc,
				Z,
				X
			] }],
			accent: [{ accent: k() }],
			appearance: [{ appearance: ["none", "auto"] }],
			"caret-color": [{ caret: k() }],
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				Z,
				X
			] }],
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			"scrollbar-thumb-color": [{ "scrollbar-thumb": k() }],
			"scrollbar-track-color": [{ "scrollbar-track": k() }],
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			"scroll-m": [{ "scroll-m": w() }],
			"scroll-mx": [{ "scroll-mx": w() }],
			"scroll-my": [{ "scroll-my": w() }],
			"scroll-ms": [{ "scroll-ms": w() }],
			"scroll-me": [{ "scroll-me": w() }],
			"scroll-mbs": [{ "scroll-mbs": w() }],
			"scroll-mbe": [{ "scroll-mbe": w() }],
			"scroll-mt": [{ "scroll-mt": w() }],
			"scroll-mr": [{ "scroll-mr": w() }],
			"scroll-mb": [{ "scroll-mb": w() }],
			"scroll-ml": [{ "scroll-ml": w() }],
			"scroll-p": [{ "scroll-p": w() }],
			"scroll-px": [{ "scroll-px": w() }],
			"scroll-py": [{ "scroll-py": w() }],
			"scroll-ps": [{ "scroll-ps": w() }],
			"scroll-pe": [{ "scroll-pe": w() }],
			"scroll-pbs": [{ "scroll-pbs": w() }],
			"scroll-pbe": [{ "scroll-pbe": w() }],
			"scroll-pt": [{ "scroll-pt": w() }],
			"scroll-pr": [{ "scroll-pr": w() }],
			"scroll-pb": [{ "scroll-pb": w() }],
			"scroll-pl": [{ "scroll-pl": w() }],
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			"snap-stop": [{ snap: ["normal", "always"] }],
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			"touch-pz": ["touch-pinch-zoom"],
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				Z,
				X
			] }],
			fill: [{ fill: ["none", ...k()] }],
			"stroke-w": [{ stroke: [
				Y,
				sl,
				el,
				tl
			] }],
			stroke: [{ stroke: ["none", ...k()] }],
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": ["right", "left"],
			"inset-y": ["top", "bottom"],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: ["pr", "pl"],
			py: ["pt", "pb"],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: ["mr", "ml"],
			my: ["mt", "mb"],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": ["border-w-r", "border-w-l"],
			"border-w-y": ["border-w-t", "border-w-b"],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": ["border-color-r", "border-color-l"],
			"border-color-y": ["border-color-t", "border-color-b"],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": ["scroll-mr", "scroll-ml"],
			"scroll-my": ["scroll-mt", "scroll-mb"],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": ["scroll-pr", "scroll-pl"],
			"scroll-py": ["scroll-pt", "scroll-pb"],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
}, Tl = (e, { extend: t = {}, override: n = {} }) => (Dl(e.theme, n.theme), Dl(e.classGroups, n.classGroups), Dl(e.conflictingClassGroups, n.conflictingClassGroups), Dl(e.conflictingClassGroupModifiers, n.conflictingClassGroupModifiers), El(e, "postfixLookupClassGroups", n.postfixLookupClassGroups), El(e, "orderSensitiveModifiers", n.orderSensitiveModifiers), Ol(e.theme, t.theme), Ol(e.classGroups, t.classGroups), Ol(e.conflictingClassGroups, t.conflictingClassGroups), Ol(e.conflictingClassGroupModifiers, t.conflictingClassGroupModifiers), kl(e, t, "postfixLookupClassGroups"), kl(e, t, "orderSensitiveModifiers"), e), El = (e, t, n) => {
	n !== void 0 && (e[t] = n);
}, Dl = (e, t) => {
	if (t) for (let n in t) El(e, n, t[n]);
}, Ol = (e, t) => {
	if (t) for (let n in t) kl(e, t, n);
}, kl = (e, t, n) => {
	let r = t[n];
	r !== void 0 && (e[n] = e[n] ? e[n].concat(r) : r);
}, Al = (e) => Oc(e ? typeof e == "function" ? () => e(wl()) : () => Tl(wl(), e) : wl), jl = (e) => {
	if (Zo(e)) return;
	let t = e, n = { ...t.extend ?? {} };
	for (let e of [
		"theme",
		"classGroups",
		"conflictingClassGroups",
		"conflictingClassGroupModifiers",
		"postfixLookupClassGroups",
		"orderSensitiveModifiers",
		"cacheSize",
		"prefix",
		"separator",
		"experimentalParseClassName"
	]) t[e] !== void 0 && n[e] === void 0 && (n[e] = t[e]);
	let r = {};
	if (Object.keys(n).length > 0 && (r.extend = n), t.override != null && !Zo(t.override) && (r.override = t.override), r.extend || r.override) return r;
}, Ml = (e) => {
	let t = Al(jl(e));
	return (e) => t.mergeString(e);
}, Nl, Pl = () => (Nl ||= Al(), Nl), Fl = () => ((!_s.cachedTwMerge || _s.didTwMergeConfigChange) && (_s.didTwMergeConfigChange = !1, _s.cachedTwMerge = Ml(_s.cachedTwMergeConfig)), _s.cachedTwMerge), Il = (e) => {
	let t = e?.twMergeConfig;
	t && !Zo(t) && (Qo(t, _s.cachedTwMergeConfig) || (_s.cachedTwMergeConfig = t, _s.didTwMergeConfigChange = !0));
}, Ll = (e) => Wo(e);
(() => {
	let e = /* @__PURE__ */ Error();
	return !("line" in e) && !("lineNumber" in e);
})();
var Rl = _s.reset.bind(_s);
_s.reset = () => {
	Nl = void 0, Rl();
};
var zl = (e, t) => {
	let n = Ll(e);
	return !n || !(t?.twMerge ?? !0) ? n || void 0 : n.indexOf(" ") === -1 ? n : (Il(t), (t?.twMergeConfig && !Zo(t.twMergeConfig) ? Fl() : Pl().mergeString)(n) || void 0);
}, Bl = Ks((e, ...t) => zl(t, e));
Bl.tv;
var Vl = Bl.createTV, Hl = "/* Generated by `bun run tokens` from design/tokens/cawco.tokens.json.\n   Do not edit: change the token source and rebuild. The Tailwind theme\n   over tokens.css: a utility exists only where a token does. */\n@theme {\n  --*: initial;\n\n  --spacing: 0.25rem;\n\n  --breakpoint-phone: 640px;\n  --breakpoint-desk: 900px;\n  --breakpoint-wide: 1025px;\n\n  --container-phone: 640px;\n  --container-desk: 900px;\n  --container-wide: 1025px;\n  --container-field-group: 28rem;\n  --container-details: 30rem;\n  --container-table-34rem: 34rem;\n  --container-task-frame: 56rem;\n  --container-table-400px: 400px;\n  --container-table-424px: 424px;\n  --container-table-496px: 496px;\n  --container-table-576px: 576px;\n  --container-table-670px: 670px;\n  --container-table-766px: 766px;\n  --container-table-878px: 878px;\n  --container-table-1102px: 1102px;\n  --container-stop-tray: 420px;\n  --container-kinds: 480px;\n  --container-decisions-520px: 520px;\n  --container-leaf: 620px;\n  --container-setup: 640px;\n  --container-media-split: 640px;\n  --container-decisions-900px: 900px;\n  --container-project-dock: 938px;\n  --container-section-row: 312px;\n  --container-connect-row: 400px;\n  --container-suggestion-rows-narrow: 340px;\n}\n\n@theme inline {\n  --color-neutral-1: var(--neutral-1);\n  --color-neutral-2: var(--neutral-2);\n  --color-neutral-3: var(--neutral-3);\n  --color-neutral-4: var(--neutral-4);\n  --color-neutral-5: var(--neutral-5);\n  --color-neutral-6: var(--neutral-6);\n  --color-neutral-7: var(--neutral-7);\n  --color-neutral-8: var(--neutral-8);\n  --color-neutral-9: var(--neutral-9);\n  --color-neutral-11: var(--neutral-11);\n  --color-neutral-12: var(--neutral-12);\n  --color-coral-3: var(--coral-3);\n  --color-coral-5: var(--coral-5);\n  --color-coral-9: var(--coral-9);\n  --color-coral-10: var(--coral-10);\n  --color-coral-11: var(--coral-11);\n  --color-spark: var(--spark);\n  --color-paper: var(--paper);\n  --color-crow-ink: var(--crow-ink);\n  --color-opencode-logo-core: var(--opencode-logo-core);\n  --color-opencode-logo-frame: var(--opencode-logo-frame);\n  --color-error-3: var(--error-3);\n  --color-error-9: var(--error-9);\n  --color-error-11: var(--error-11);\n  --color-warning-3: var(--warning-3);\n  --color-warning-9: var(--warning-9);\n  --color-warning-11: var(--warning-11);\n  --color-success-3: var(--success-3);\n  --color-success-9: var(--success-9);\n  --color-success-11: var(--success-11);\n  --color-info-3: var(--info-3);\n  --color-info-9: var(--info-9);\n  --color-info-11: var(--info-11);\n  --color-mark-1: var(--mark-1);\n  --color-mark-2: var(--mark-2);\n  --color-mark-3: var(--mark-3);\n  --color-mark-4: var(--mark-4);\n  --color-mark-5: var(--mark-5);\n  --color-mark-6: var(--mark-6);\n  --color-mark-7: var(--mark-7);\n  --color-mark-8: var(--mark-8);\n  --color-account-amber: var(--account-amber);\n  --color-account-orange: var(--account-orange);\n  --color-account-green: var(--account-green);\n  --color-account-cyan: var(--account-cyan);\n  --color-account-blue: var(--account-blue);\n  --color-account-rose: var(--account-rose);\n  --color-account-violet: var(--account-violet);\n  --color-account-week-toward: var(--account-week-toward);\n  --color-ring-track-spent: var(--ring-track-spent);\n  --color-account-reserved: var(--account-reserved);\n  --color-mark-glyph: var(--mark-glyph);\n  --color-mark-deck-shade: var(--mark-deck-shade);\n  --color-mark-deck-cast: var(--mark-deck-cast);\n  --color-hue-cyan-400: var(--hue-cyan-400);\n  --color-hue-cyan-500: var(--hue-cyan-500);\n  --color-hue-amber-500: var(--hue-amber-500);\n  --color-hue-orange-500: var(--hue-orange-500);\n  --color-hue-green-500: var(--hue-green-500);\n  --color-hue-green-600: var(--hue-green-600);\n  --color-hue-blue-500: var(--hue-blue-500);\n  --color-hue-blue-600: var(--hue-blue-600);\n  --color-tool-run: var(--tool-run);\n  --color-tool-mcp: var(--tool-mcp);\n  --color-tool-search: var(--tool-search);\n  --color-tool-ask: var(--tool-ask);\n  --color-tool-web: var(--tool-web);\n  --color-tool-read: var(--tool-read);\n  --color-tool-agent: var(--tool-agent);\n  --color-tool-edit: var(--tool-edit);\n  --color-tool-write: var(--tool-write);\n  --color-tool-skill: var(--tool-skill);\n  --color-tool-plan: var(--tool-plan);\n  --color-card: var(--card);\n  --color-accent: var(--accent);\n  --color-surface-page: var(--surface-page);\n  --color-surface-raised: var(--surface-raised);\n  --color-surface-card: var(--surface-card);\n  --color-surface-recess: var(--surface-recess);\n  --color-surface-recess-clear: var(--surface-recess-clear);\n  --color-mask-opaque: var(--mask-opaque);\n  --color-mask-opaque-a10: var(--mask-opaque-a10);\n  --color-mask-opaque-a15: var(--mask-opaque-a15);\n  --color-mask-opaque-a50: var(--mask-opaque-a50);\n  --color-mask-opaque-a60: var(--mask-opaque-a60);\n  --color-mask-opaque-a90: var(--mask-opaque-a90);\n  --color-surface-band: var(--surface-band);\n  --color-surface-recess-deep: var(--surface-recess-deep);\n  --color-surface-well: var(--surface-well);\n  --color-surface-shelf: var(--surface-shelf);\n  --color-tab-sheet: var(--tab-sheet);\n  --color-tab-recede-1: var(--tab-recede-1);\n  --color-tab-recede-2: var(--tab-recede-2);\n  --color-tab-recede-3: var(--tab-recede-3);\n  --color-surface-lift: var(--surface-lift);\n  --color-surface-tile: var(--surface-tile);\n  --color-surface-fill: var(--surface-fill);\n  --color-surface-fill-strong: var(--surface-fill-strong);\n  --color-press-fill: var(--press-fill);\n  --color-surface-pressed: var(--surface-pressed);\n  --color-surface-hover: var(--surface-hover);\n  --color-well-edge: var(--well-edge);\n  --color-seam: var(--seam);\n  --color-code-bg: var(--code-bg);\n  --color-surface-1: var(--surface-1);\n  --color-surface-2: var(--surface-2);\n  --color-surface-3: var(--surface-3);\n  --color-surface-4: var(--surface-4);\n  --color-surface-5: var(--surface-5);\n  --color-surface-6: var(--surface-6);\n  --color-surface-7: var(--surface-7);\n  --color-surface-8: var(--surface-8);\n  --color-border: var(--border);\n  --color-border-hairline: var(--border-hairline);\n  --color-border-well: var(--border-well);\n  --color-border-control: var(--border-control);\n  --color-border-contrast: var(--border-contrast);\n  --color-border-card: var(--border-card);\n  --color-border-button-outline: var(--border-button-outline);\n  --color-border-row-outline: var(--border-row-outline);\n  --color-border-control-strong: var(--border-control-strong);\n  --color-input: var(--input);\n  --color-ink-strong: var(--ink-strong);\n  --color-ink-row: var(--ink-row);\n  --color-ink-stat: var(--ink-stat);\n  --color-ink-muted: var(--ink-muted);\n  --color-ink-subtle: var(--ink-subtle);\n  --color-text-strong: var(--text-strong);\n  --color-text-muted: var(--text-muted);\n  --color-brand-solid: var(--brand-solid);\n  --color-brand-hover: var(--brand-hover);\n  --color-brand-wash: var(--brand-wash);\n  --color-c-target-tint: var(--c-target-tint);\n  --color-c-change-ring: var(--c-change-ring);\n  --color-brand-ink: var(--brand-ink);\n  --color-brand-ink-strong: var(--brand-ink-strong);\n  --color-link-ink: var(--link-ink);\n  --color-link-hover: var(--link-hover);\n  --color-action-solid: var(--action-solid);\n  --color-action-hover: var(--action-hover);\n  --color-on-action: var(--on-action);\n  --color-on-brand: var(--on-brand);\n  --color-action-top: var(--action-top);\n  --color-action-bottom: var(--action-bottom);\n  --color-action-hover-top: var(--action-hover-top);\n  --color-action-hover-bottom: var(--action-hover-bottom);\n  --color-selected-bg: var(--selected-bg);\n  --color-selected-ink: var(--selected-ink);\n  --color-selected-icon: var(--selected-icon);\n  --color-chip-chosen-bg: var(--chip-chosen-bg);\n  --color-chip-chosen-ink: var(--chip-chosen-ink);\n  --color-ink-solid: var(--ink-solid);\n  --color-on-ink: var(--on-ink);\n  --color-focus-ring: var(--focus-ring);\n  --color-selection: var(--selection);\n  --color-status-live-bg: var(--status-live-bg);\n  --color-status-attn-bg: var(--status-attn-bg);\n  --color-needs-ground: var(--needs-ground);\n  --color-strategy-card-picked: var(--strategy-card-picked);\n  --color-status-done-bg: var(--status-done-bg);\n  --color-status-fail-bg: var(--status-fail-bg);\n  --color-status-idle-bg: var(--status-idle-bg);\n  --color-status-live-ink: var(--status-live-ink);\n  --color-status-attn-ink: var(--status-attn-ink);\n  --color-status-done-ink: var(--status-done-ink);\n  --color-status-fail-ink: var(--status-fail-ink);\n  --color-status-idle-ink: var(--status-idle-ink);\n  --color-status-live-glyph: var(--status-live-glyph);\n  --color-status-attn-glyph: var(--status-attn-glyph);\n  --color-tab-rim-attn: var(--tab-rim-attn);\n  --color-status-done-glyph: var(--status-done-glyph);\n  --color-status-fail-glyph: var(--status-fail-glyph);\n  --color-status-idle-glyph: var(--status-idle-glyph);\n  --color-nest-ink: var(--nest-ink);\n  --color-meter-calm: var(--meter-calm);\n  --color-meter-calm-track: var(--meter-calm-track);\n  --color-meter-near: var(--meter-near);\n  --color-meter-near-track: var(--meter-near-track);\n  --color-meter-over: var(--meter-over);\n  --color-meter-over-track: var(--meter-over-track);\n  --color-meter-stale: var(--meter-stale);\n  --color-meter-stale-track: var(--meter-stale-track);\n  --color-meter-share: var(--meter-share);\n  --color-meter-wash-near: var(--meter-wash-near);\n  --color-meter-wash-over: var(--meter-wash-over);\n  --color-presence-online: var(--presence-online);\n  --color-presence-away: var(--presence-away);\n  --color-presence-off: var(--presence-off);\n  --color-scrollbar-thumb: var(--scrollbar-thumb);\n  --color-skeleton-sheen: var(--skeleton-sheen);\n  --color-prose-bullet: var(--prose-bullet);\n  --color-identity-ink: var(--identity-ink);\n  --color-machine-offline: var(--machine-offline);\n  --color-data-ok: var(--data-ok);\n  --color-data-warn: var(--data-warn);\n  --color-data-bad: var(--data-bad);\n  --color-diff-add-bg: var(--diff-add-bg);\n  --color-diff-del-bg: var(--diff-del-bg);\n  --color-diff-add-emphasis: var(--diff-add-emphasis);\n  --color-diff-del-emphasis: var(--diff-del-emphasis);\n  --color-note-new-ink: var(--note-new-ink);\n  --color-note-new-bg: var(--note-new-bg);\n  --color-note-improved-ink: var(--note-improved-ink);\n  --color-note-improved-bg: var(--note-improved-bg);\n  --color-note-fixed-ink: var(--note-fixed-ink);\n  --color-note-fixed-bg: var(--note-fixed-bg);\n  --color-chart-1: var(--chart-1);\n  --color-chart-brand: var(--chart-brand);\n  --color-chart-2: var(--chart-2);\n  --color-chart-3: var(--chart-3);\n  --color-chart-4: var(--chart-4);\n  --color-chart-5: var(--chart-5);\n  --color-code-ink: var(--code-ink);\n  --color-code-keyword: var(--code-keyword);\n  --color-code-fn: var(--code-fn);\n  --color-code-string: var(--code-string);\n  --color-code-number: var(--code-number);\n  --color-code-comment: var(--code-comment);\n  --color-rail-body: var(--rail-body);\n  --color-material-panel: var(--material-panel);\n  --color-scrim: var(--scrim);\n  --color-image-outline: var(--image-outline);\n  --color-shadow-tint: var(--shadow-tint);\n  --color-shadow-tint-2: var(--shadow-tint-2);\n  --color-shadow-tint-3: var(--shadow-tint-3);\n  --color-tab-shade: var(--tab-shade);\n  --color-tab-shade-chosen: var(--tab-shade-chosen);\n  --color-night-ring: var(--night-ring);\n\n  --shadow-surface-shadow-1: var(--surface-shadow-1);\n  --shadow-surface-shadow-2: var(--surface-shadow-2);\n  --shadow-surface-shadow-3: var(--surface-shadow-3);\n  --shadow-surface-shadow-4: var(--surface-shadow-4);\n  --shadow-surface-shadow-5: var(--surface-shadow-5);\n  --shadow-surface-shadow-6: var(--surface-shadow-6);\n  --shadow-surface-shadow-7: var(--surface-shadow-7);\n  --shadow-surface-shadow-8: var(--surface-shadow-8);\n  --shadow-action-ring: var(--action-ring);\n  --shadow-code-ring: var(--code-ring);\n  --shadow-selected-shadow: var(--selected-shadow);\n\n  --drop-shadow-drop: var(--shadow-drop);\n  --drop-shadow-drop-near: var(--shadow-drop-near);\n\n  --tracking-wordmark: var(--track-wordmark);\n  --tracking-display: var(--track-display);\n  --tracking-title: var(--track-title);\n  --tracking-caps: var(--track-caps);\n  --tracking-widest: var(--track-widest);\n\n  --font-weight-normal: var(--weight-body);\n  --font-weight-medium: var(--weight-strong);\n\n  --spacing-space-1: var(--space-1);\n  --spacing-space-2: var(--space-2);\n  --spacing-space-3: var(--space-3);\n  --spacing-space-4: var(--space-4);\n  --spacing-space-5: var(--space-5);\n  --spacing-space-6: var(--space-6);\n  --spacing-space-7: var(--space-7);\n  --spacing-space-8: var(--space-8);\n  --spacing-space-group: var(--space-group);\n  --spacing-space-row: var(--space-row);\n  --spacing-c-btn-h: var(--c-btn-h);\n  --spacing-c-btn-h-sm: var(--c-btn-h-sm);\n  --spacing-c-btn-h-xs: var(--c-btn-h-xs);\n  --spacing-c-btn-h-lg: var(--c-btn-h-lg);\n  --spacing-c-input-h: var(--c-input-h);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-nav-h: var(--c-nav-h);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-rail-row-h: var(--c-rail-row-h);\n  --spacing-c-artifact-row-h: var(--c-artifact-row-h);\n  --spacing-c-pin: var(--c-pin);\n  --spacing-c-pin-pad: var(--c-pin-pad);\n  --spacing-c-pin-gone-ring: var(--c-pin-gone-ring);\n  --spacing-c-comments-w: var(--c-comments-w);\n  --spacing-c-pin-card-w: var(--c-pin-card-w);\n  --spacing-c-pin-card-reading-w: var(--c-pin-card-reading-w);\n  --spacing-c-target-stroke: var(--c-target-stroke);\n  --spacing-c-target-gap: var(--c-target-gap);\n  --spacing-c-sheet-inspector-w: var(--c-sheet-inspector-w);\n  --spacing-c-sheet-inspector-max-h: var(--c-sheet-inspector-max-h);\n  --spacing-c-sheet-inspector-head-h: var(--c-sheet-inspector-head-h);\n  --spacing-c-canvas-skeleton-w: var(--c-canvas-skeleton-w);\n  --spacing-c-canvas-skeleton-h: var(--c-canvas-skeleton-h);\n  --spacing-c-graph-edge: var(--c-graph-edge);\n  --spacing-c-map-node-w: var(--c-map-node-w);\n  --spacing-c-pin-list-min: var(--c-pin-list-min);\n  --spacing-c-pin-list-max: var(--c-pin-list-max);\n  --spacing-c-review-words: var(--c-review-words);\n  --spacing-c-mark: var(--c-mark);\n  --spacing-c-mark-glyph: var(--c-mark-glyph);\n  --spacing-c-row-mark: var(--c-row-mark);\n  --spacing-c-pill-h: var(--c-pill-h);\n  --spacing-c-pill-gap: var(--c-pill-gap);\n  --spacing-c-pill-fs: var(--c-pill-fs);\n  --spacing-c-badge-h: var(--c-badge-h);\n  --spacing-c-stat-h: var(--c-stat-h);\n  --spacing-c-stat-well-pad: var(--c-stat-well-pad);\n  --spacing-c-toolbar-zone: var(--c-toolbar-zone);\n  --spacing-c-toolbar-ctl: var(--c-toolbar-ctl);\n  --spacing-c-find-w: var(--c-find-w);\n  --spacing-c-new-session-pop-w: var(--c-new-session-pop-w);\n  --spacing-c-step-rail-x: var(--c-step-rail-x);\n  --spacing-c-step-rail-top: var(--c-step-rail-top);\n  --spacing-c-step-rail-gap: var(--c-step-rail-gap);\n  --spacing-c-connect-w: var(--c-connect-w);\n  --spacing-c-panel-w: var(--c-panel-w);\n  --spacing-c-signin-pop-w: var(--c-signin-pop-w);\n  --spacing-c-caw-panel-h: var(--c-caw-panel-h);\n  --spacing-c-top-bar-h: var(--c-top-bar-h);\n  --spacing-c-bar-toggle-glyph: var(--c-bar-toggle-glyph);\n  --spacing-c-bar-phone-edge: var(--c-bar-phone-edge);\n  --spacing-c-side-divider-hit: var(--c-side-divider-hit);\n  --spacing-c-corner-grip-leg: var(--c-corner-grip-leg);\n  --spacing-c-corner-grip-inset: var(--c-corner-grip-inset);\n  --spacing-c-corner-grip-stroke: var(--c-corner-grip-stroke);\n  --spacing-c-bar-phone-gap: var(--c-bar-phone-gap);\n  --spacing-c-edge-pull: var(--c-edge-pull);\n  --spacing-c-tab-lead: var(--c-tab-lead);\n  --spacing-c-tab-row-h: var(--c-tab-row-h);\n  --spacing-c-head-fade: var(--c-head-fade);\n  --spacing-c-head-fade-blur: var(--c-head-fade-blur);\n  --spacing-c-recall-cross-blur: var(--c-recall-cross-blur);\n  --spacing-c-deck-peek: var(--c-deck-peek);\n  --spacing-c-tab-max-w: var(--c-tab-max-w);\n  --spacing-c-bar-group-pad: var(--c-bar-group-pad);\n  --spacing-c-bar-item: var(--c-bar-item);\n  --spacing-c-bar-symbol: var(--c-bar-symbol);\n  --spacing-c-bar-caw-glass-phone: var(--c-bar-caw-glass-phone);\n  --spacing-c-bar-caw-head-phone: var(--c-bar-caw-head-phone);\n  --spacing-c-caw-ring: var(--c-caw-ring);\n  --spacing-c-page-head-h: var(--c-page-head-h);\n  --spacing-c-sidebar-w: var(--c-sidebar-w);\n  --spacing-c-composer-field: var(--c-composer-field);\n  --spacing-c-composer-inset: var(--c-composer-inset);\n  --spacing-c-inset-composer: var(--c-inset-composer);\n  --spacing-c-floating-pad: var(--c-floating-pad);\n  --spacing-c-inset-floating: var(--c-inset-floating);\n  --spacing-c-composer-panel: var(--c-composer-panel);\n  --spacing-c-new-project-field-w: var(--c-new-project-field-w);\n  --spacing-c-composer-w: var(--c-composer-w);\n  --spacing-c-suggest-chip: var(--c-suggest-chip);\n  --spacing-c-suggest-row: var(--c-suggest-row);\n  --spacing-c-suggest-room: var(--c-suggest-room);\n  --spacing-c-starter-w: var(--c-starter-w);\n  --spacing-c-starter-h: var(--c-starter-h);\n  --spacing-c-starters-w: var(--c-starters-w);\n  --spacing-c-row-lead: var(--c-row-lead);\n  --spacing-c-section-head-h: var(--c-section-head-h);\n  --spacing-c-row-inset: var(--c-row-inset);\n  --spacing-c-row-h: var(--c-row-h);\n  --spacing-c-routine-time-w: var(--c-routine-time-w);\n  --spacing-c-grid-4: var(--c-grid-4);\n  --spacing-c-grid-2: var(--c-grid-2);\n  --spacing-c-block-routines: var(--c-block-routines);\n  --spacing-c-block-ledger: var(--c-block-ledger);\n  --spacing-c-block-view: var(--c-block-view);\n  --spacing-c-block-body-max: var(--c-block-body-max);\n  --spacing-c-block-drop-line: var(--c-block-drop-line);\n  --spacing-c-block-drop-dot: var(--c-block-drop-dot);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-tray-chip: var(--c-tray-chip);\n  --spacing-c-inline-chip-line: var(--c-inline-chip-line);\n  --spacing-c-inline-chip-pad: var(--c-inline-chip-pad);\n  --spacing-c-inline-chip-max-w: var(--c-inline-chip-max-w);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-peek-glyph: var(--c-peek-glyph);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-tray-gap: var(--c-tray-gap);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-tray-row: var(--c-tray-row);\n  --spacing-c-tray-chip-min: var(--c-tray-chip-min);\n  --spacing-c-tray-chip-max: var(--c-tray-chip-max);\n  --spacing-icon-sm: var(--icon-sm);\n  --spacing-icon-md: var(--icon-md);\n  --spacing-icon-lg: var(--icon-lg);\n  --spacing-c-change-ring-width: var(--c-change-ring-width);\n  --spacing-c-change-ring-offset: var(--c-change-ring-offset);\n  --spacing-c-change-ping-spread: var(--c-change-ping-spread);\n  --spacing-c-segmented-pad: var(--c-segmented-pad);\n  --spacing-c-segment-gap: var(--c-segment-gap);\n  --spacing-c-segment-pad-x: var(--c-segment-pad-x);\n  --spacing-c-tab-item: var(--c-tab-item);\n  --spacing-c-tab-px: var(--c-tab-px);\n  --spacing-c-tab-slope-start: var(--c-tab-slope-start);\n  --spacing-c-tab-slope-end: var(--c-tab-slope-end);\n  --spacing-c-measure: var(--c-measure);\n  --spacing-c-measure-short: var(--c-measure-short);\n  --spacing-c-measure-meta: var(--c-measure-meta);\n  --spacing-c-count-digit: var(--c-count-digit);\n  --spacing-c-rail-count-min: var(--c-rail-count-min);\n  --spacing-c-skeleton-x-height: var(--c-skeleton-x-height);\n  --spacing-c-code-chip-pad-x: var(--c-code-chip-pad-x);\n  --spacing-c-skeleton-age: var(--c-skeleton-age);\n  --spacing-c-textarea-max-h: var(--c-textarea-max-h);\n  --spacing-c-number-field-w: var(--c-number-field-w);\n  --spacing-c-port-field-w: var(--c-port-field-w);\n  --spacing-c-btn-min-w: var(--c-btn-min-w);\n  --spacing-c-btn-gap: var(--c-btn-gap);\n  --spacing-c-btn-words-blur: var(--c-btn-words-blur);\n  --spacing-c-pointer-floor: var(--c-pointer-floor);\n  --spacing-c-touch-floor: var(--c-touch-floor);\n  --spacing-c-screen-margin: var(--c-screen-margin);\n  --spacing-c-pop-w: var(--c-pop-w);\n  --spacing-c-pop-max-h: var(--c-pop-max-h);\n  --spacing-c-pop-max-h-phone: var(--c-pop-max-h-phone);\n  --spacing-c-tip-max-w: var(--c-tip-max-w);\n  --spacing-c-scrollbar-thin: var(--c-scrollbar-thin);\n  --spacing-c-edge-fade-len: var(--c-edge-fade-len);\n  --spacing-c-edge-fade-len-phone: var(--c-edge-fade-len-phone);\n  /* Switches with its context: no literal maps to it. */\n  --spacing-c-menu-item-h: var(--c-menu-item-h);\n  --spacing-c-icon-card-min: var(--c-icon-card-min);\n  --spacing-c-sheet-max-h: var(--c-sheet-max-h);\n  --spacing-c-peek-sheet-h: var(--c-peek-sheet-h);\n  --spacing-c-peek-sheet-w: var(--c-peek-sheet-w);\n  --spacing-c-grabber-w: var(--c-grabber-w);\n  --spacing-c-grabber-h: var(--c-grabber-h);\n  --spacing-c-lightbox-sheet-w: var(--c-lightbox-sheet-w);\n  --spacing-c-lightbox-sheet-max-h: var(--c-lightbox-sheet-max-h);\n  --spacing-c-report-text-max: var(--c-report-text-max);\n  --spacing-c-config-max-w: var(--c-config-max-w);\n  --spacing-c-config-rail-w: var(--c-config-rail-w);\n  --spacing-c-row-h-two: var(--c-row-h-two);\n  --spacing-c-detail-max: var(--c-detail-max);\n  --spacing-c-output-max: var(--c-output-max);\n  --spacing-c-editor-well-min: var(--c-editor-well-min);\n  --spacing-c-choice-list-max-h: var(--c-choice-list-max-h);\n  --spacing-c-setup-rail-w: var(--c-setup-rail-w);\n  --spacing-c-setup-machine-name-w: var(--c-setup-machine-name-w);\n  --spacing-c-setup-code-basis: var(--c-setup-code-basis);\n  --spacing-c-setup-nickname-w: var(--c-setup-nickname-w);\n  --spacing-c-setup-preview-w: var(--c-setup-preview-w);\n  --spacing-c-drag-dots-w: var(--c-drag-dots-w);\n  --spacing-c-drag-dots-tile: var(--c-drag-dots-tile);\n  --spacing-c-drag-dots-edge: var(--c-drag-dots-edge);\n  --spacing-c-block-refused-basis: var(--c-block-refused-basis);\n  --spacing-c-canvas-grab-w: var(--c-canvas-grab-w);\n  --spacing-c-decision-page-w: var(--c-decision-page-w);\n  --spacing-c-decision-meter-w: var(--c-decision-meter-w);\n  --spacing-c-decision-option-min: var(--c-decision-option-min);\n  --spacing-c-media-max-h: var(--c-media-max-h);\n  --spacing-c-artifact-card-min: var(--c-artifact-card-min);\n  --spacing-c-work-tabs-roomy-w: var(--c-work-tabs-roomy-w);\n  --spacing-c-work-tabs-squeeze: var(--c-work-tabs-squeeze);\n  --spacing-c-caw-list-h: var(--c-caw-list-h);\n  --spacing-c-caw-list-clear: var(--c-caw-list-clear);\n  --spacing-c-caw-list-clear-phone: var(--c-caw-list-clear-phone);\n  --spacing-c-lead-card-w: var(--c-lead-card-w);\n  --spacing-c-lead-card-max-h: var(--c-lead-card-max-h);\n  --spacing-c-move-wait-col-w: var(--c-move-wait-col-w);\n  --spacing-c-move-wait-caw-h: var(--c-move-wait-caw-h);\n  --spacing-c-move-wait-caw-h-phone: var(--c-move-wait-caw-h-phone);\n  --spacing-c-move-wait-file-bar-w: var(--c-move-wait-file-bar-w);\n  --spacing-c-machines-w: var(--c-machines-w);\n  --spacing-c-find-row-h: var(--c-find-row-h);\n  --spacing-c-find-row-h-phone: var(--c-find-row-h-phone);\n  --spacing-c-find-line-h: var(--c-find-line-h);\n  --spacing-c-find-phone-h: var(--c-find-phone-h);\n  --spacing-c-find-head-h: var(--c-find-head-h);\n  --spacing-c-find-skeleton-tall: var(--c-find-skeleton-tall);\n  --spacing-c-head-who-basis: var(--c-head-who-basis);\n  --spacing-c-project-details-measure: var(--c-project-details-measure);\n  --spacing-c-project-details-label-w: var(--c-project-details-label-w);\n  --spacing-c-project-details-select-w: var(--c-project-details-select-w);\n  --spacing-c-ledger-when-w: var(--c-ledger-when-w);\n  --spacing-c-ledger-when-w-narrow: var(--c-ledger-when-w-narrow);\n  --spacing-c-ledger-outcome-w: var(--c-ledger-outcome-w);\n  --spacing-c-ledger-outcome-w-narrow: var(--c-ledger-outcome-w-narrow);\n  --spacing-c-ledger-took-w: var(--c-ledger-took-w);\n  --spacing-c-ledger-band-h: var(--c-ledger-band-h);\n  --spacing-c-ledger-row-h: var(--c-ledger-row-h);\n  --spacing-c-ledger-count-w: var(--c-ledger-count-w);\n  --spacing-c-ledger-usd-w: var(--c-ledger-usd-w);\n  --spacing-c-matrix-col-w: var(--c-matrix-col-w);\n  --spacing-c-ledger-title-min: var(--c-ledger-title-min);\n  --spacing-c-side-grip-w: var(--c-side-grip-w);\n  --spacing-c-side-surface-min: var(--c-side-surface-min);\n  --spacing-c-effort-track-h-phone: var(--c-effort-track-h-phone);\n  --spacing-c-model-list-h: var(--c-model-list-h);\n  --spacing-c-model-row-basis: var(--c-model-row-basis);\n  --spacing-c-folder-list-max-h: var(--c-folder-list-max-h);\n  --spacing-c-prompt-grown-h: var(--c-prompt-grown-h);\n  --spacing-c-page-column-w: var(--c-page-column-w);\n  --spacing-c-page-line: var(--c-page-line);\n  --spacing-c-hover-panel-room: var(--c-hover-panel-room);\n  --spacing-c-status-mark: var(--c-status-mark);\n  --spacing-c-inventory-text-basis: var(--c-inventory-text-basis);\n  --spacing-c-empty-fleet-caw: var(--c-empty-fleet-caw);\n  --spacing-c-stat-min: var(--c-stat-min);\n  --spacing-c-view-lead-min: var(--c-view-lead-min);\n  --spacing-c-bulk-labels-max-h: var(--c-bulk-labels-max-h);\n  --spacing-c-post-media-max-h: var(--c-post-media-max-h);\n  --spacing-c-board-col-min: var(--c-board-col-min);\n  --spacing-c-board-col-max: var(--c-board-col-max);\n  --spacing-c-task-key-w: var(--c-task-key-w);\n  --spacing-c-filter-label-w: var(--c-filter-label-w);\n  --spacing-c-task-label-field-w: var(--c-task-label-field-w);\n  --spacing-c-task-args-max-h: var(--c-task-args-max-h);\n  --spacing-c-task-output-compact-h: var(--c-task-output-compact-h);\n  --spacing-c-task-output-image-h: var(--c-task-output-image-h);\n  --spacing-c-task-output-video-h: var(--c-task-output-video-h);\n  --spacing-c-task-stage-skeleton-w: var(--c-task-stage-skeleton-w);\n  --spacing-c-task-edge-label-w: var(--c-task-edge-label-w);\n  --spacing-c-task-candidates-max-h: var(--c-task-candidates-max-h);\n  --spacing-c-task-col-id-w: var(--c-task-col-id-w);\n  --spacing-c-task-col-stage-w: var(--c-task-col-stage-w);\n  --spacing-c-task-col-labels-w: var(--c-task-col-labels-w);\n  --spacing-c-task-col-todos-w: var(--c-task-col-todos-w);\n  --spacing-c-task-col-time-w: var(--c-task-col-time-w);\n  --spacing-c-stop-tray-status-w: var(--c-stop-tray-status-w);\n  --spacing-c-stop-tray-trail-w: var(--c-stop-tray-trail-w);\n  --spacing-c-tree-mark-hole-edge: var(--c-tree-mark-hole-edge);\n  --spacing-c-tree-mark-num-w: var(--c-tree-mark-num-w);\n  --spacing-c-usage-cap-lh: var(--c-usage-cap-lh);\n  --spacing-c-usage-strip-row: var(--c-usage-strip-row);\n  --spacing-c-usage-strip-clip: var(--c-usage-strip-clip);\n  --spacing-c-usage-strip-home-h: var(--c-usage-strip-home-h);\n  --spacing-c-usage-pct-w: var(--c-usage-pct-w);\n  --spacing-c-filed-task-w: var(--c-filed-task-w);\n  --spacing-c-atts-max-h: var(--c-atts-max-h);\n  --spacing-c-compaction-word-bleed: var(--c-compaction-word-bleed);\n  --spacing-c-give-way-min: var(--c-give-way-min);\n  --spacing-c-elapsed-w: var(--c-elapsed-w);\n  --spacing-c-composer-more-w: var(--c-composer-more-w);\n  --spacing-c-composer-menu-max-h: var(--c-composer-menu-max-h);\n  --spacing-c-ask-value-max-h: var(--c-ask-value-max-h);\n  --spacing-c-offer-line: var(--c-offer-line);\n  --spacing-c-suggest-shimmer-w: var(--c-suggest-shimmer-w);\n  --spacing-c-turn-clock-w: var(--c-turn-clock-w);\n  --spacing-c-update-said-h: var(--c-update-said-h);\n  --spacing-c-usage-plot: var(--c-usage-plot);\n  --spacing-c-limit-bar: var(--c-limit-bar);\n  --spacing-c-usage-tile-min: var(--c-usage-tile-min);\n  --spacing-c-stat-tile-min: var(--c-stat-tile-min);\n  --spacing-c-rings-key-label-w: var(--c-rings-key-label-w);\n  --spacing-c-rings-key-value-w: var(--c-rings-key-value-w);\n  --spacing-c-mark-dot: var(--c-mark-dot);\n  --spacing-c-usage-figure-w: var(--c-usage-figure-w);\n  --spacing-c-meter-bar-h: var(--c-meter-bar-h);\n  --spacing-c-dialog-max-h: var(--c-dialog-max-h);\n  --spacing-c-dialog-close-clear: var(--c-dialog-close-clear);\n  --spacing-c-dialog-document-w: var(--c-dialog-document-w);\n  --spacing-c-tool-well-max-h: var(--c-tool-well-max-h);\n  --spacing-c-completer-max-h: var(--c-completer-max-h);\n  --spacing-c-key-field-basis: var(--c-key-field-basis);\n  --spacing-c-key-field-max: var(--c-key-field-max);\n  --spacing-c-bench-phone-w: var(--c-bench-phone-w);\n  --spacing-c-bench-phone-h: var(--c-bench-phone-h);\n  --spacing-c-bench-controls-w: var(--c-bench-controls-w);\n  --spacing-c-bench-stage: var(--c-bench-stage);\n  --spacing-c-bench-side-w: var(--c-bench-side-w);\n  --spacing-c-bench-side-h: var(--c-bench-side-h);\n  --spacing-c-bench-field-w: var(--c-bench-field-w);\n  --spacing-c-bench-readout-w: var(--c-bench-readout-w);\n  --spacing-c-side-bench-h: var(--c-side-bench-h);\n  --spacing-c-rail-sheet-w: var(--c-rail-sheet-w);\n  --spacing-c-session-hover-head: var(--c-session-hover-head);\n  --spacing-c-session-hover-room: var(--c-session-hover-room);\n  --spacing-c-trail-col: var(--c-trail-col);\n  --spacing-c-foot-fade: var(--c-foot-fade);\n  --spacing-c-doc-max: var(--c-doc-max);\n  --spacing-c-tray-more-w: var(--c-tray-more-w);\n  --spacing-c-made-tile-min: var(--c-made-tile-min);\n  --spacing-c-canvas-min-h: var(--c-canvas-min-h);\n  --spacing-c-deck-gap: var(--c-deck-gap);\n  --spacing-c-new-project-w: var(--c-new-project-w);\n  --spacing-c-address-tray-w: var(--c-address-tray-w);\n  --spacing-c-address-caw: var(--c-address-caw);\n  --spacing-c-address-caw-title: var(--c-address-caw-title);\n  --spacing-c-address-qr: var(--c-address-qr);\n  --spacing-c-address-raw-h: var(--c-address-raw-h);\n  --spacing-c-address-phone-h: var(--c-address-phone-h);\n  --spacing-c-caw-hero: var(--c-caw-hero);\n  --spacing-c-context-bar-min: var(--c-context-bar-min);\n  --spacing-c-context-bar-max: var(--c-context-bar-max);\n  --spacing-c-model-list-max: var(--c-model-list-max);\n  --spacing-c-tab-strip-fade: var(--c-tab-strip-fade);\n  --spacing-c-tab-strip-uncapped: var(--c-tab-strip-uncapped);\n  --spacing-c-details-card-w: var(--c-details-card-w);\n  --spacing-c-details-card-max-h: var(--c-details-card-max-h);\n  --spacing-c-tab-menu-min: var(--c-tab-menu-min);\n  --spacing-c-new-task-w: var(--c-new-task-w);\n  --spacing-c-draft-line: var(--c-draft-line);\n  --spacing-c-skeleton-card-h: var(--c-skeleton-card-h);\n  --spacing-c-offer-text-basis: var(--c-offer-text-basis);\n\n  --radius-well-r: var(--well-r);\n  --radius-row-mark: var(--row-mark-r);\n  --radius-tab-icon: var(--tab-icon-r);\n  --radius-glide-row: var(--glide-row-r);\n  --radius-inner-well: var(--inner-well-r);\n\n  --duration-stagger: var(--dur-stagger);\n  --duration-cascade: var(--dur-cascade);\n  --duration-ghost: var(--dur-ghost);\n  --duration-control: var(--dur-control);\n  --duration-menu: var(--dur-menu);\n  --duration-peek: var(--dur-peek);\n  --duration-toggle: var(--dur-toggle);\n  --duration-exit: var(--dur-exit);\n  --duration-morph: var(--dur-morph);\n  --duration-rail: var(--dur-rail);\n  --duration-fade: var(--dur-fade);\n  --duration-mark-hold: var(--dur-mark-hold);\n  --duration-wait-grace: var(--dur-wait-grace);\n  --duration-pop: var(--dur-pop);\n  --duration-panel: var(--dur-panel);\n  --duration-pick-up: var(--dur-pick-up);\n  --duration-grow: var(--dur-grow);\n  --duration-grow-exit: var(--dur-grow-exit);\n  --duration-lift: var(--dur-lift);\n  --duration-press-hold: var(--dur-press-hold);\n  --duration-settle: var(--dur-settle);\n  --duration-reveal: var(--dur-reveal);\n  --duration-hold: var(--dur-hold);\n  --duration-loop: var(--dur-loop);\n  --duration-skeleton-pulse: var(--dur-skeleton-pulse);\n  --duration-skeleton-reveal: var(--dur-skeleton-reveal);\n  --duration-c-500: var(--c-500);\n  --duration-breath: var(--breath);\n\n  --font-weight-brand: 600;\n\n  --default-font-family: var(--font-body);\n  --default-mono-font-family: var(--font-mono);\n  --default-transition-duration: var(--dur-control);\n  --default-transition-timing-function: var(--ease-out);\n  --animate-spin: spin var(--dur-loop) linear infinite;\n  --animate-pulse: pulse var(--dur-loop) var(--ease-in-out) infinite;\n  --animate-ping: ping var(--dur-loop) var(--ease-out) infinite;\n  --animate-breath: breath var(--breath) var(--ease-in-out) infinite;\n  --animate-kit-fade-out: kit-fade-out var(--dur-exit) var(--ease-out) both;\n  --animate-kit-tip-fade: kit-tip-fade var(--dur-menu) var(--ease-out);\n  --animate-thinking-step-in: kit-fade-in var(--dur-menu) var(--ease-out)\n    backwards;\n  --animate-sheet-fade-in: kit-fade-in var(--dur-control) var(--ease-out);\n  --animate-sheet-fade-out: kit-fade-out var(--dur-control) var(--ease-out)\n    forwards;\n  --animate-wait-grace-in: kit-fade-in var(--dur-fade) var(--ease-out)\n    var(--dur-wait-grace) both;\n  --animate-wait-grace-show: kit-fade-in 1ms var(--dur-wait-grace) both;\n  --animate-check-in: kit-fade-in var(--dur-toggle) var(--ease-out) both;\n  --animate-check-draw: check-draw var(--dur-toggle) var(--ease-out) both;\n  --animate-rail-label-in: rail-label-in var(--dur-exit) var(--ease-out) both;\n  --animate-thinking-word: thinking-word calc(var(--breath) * 8) var(--ease-out)\n    var(--word-delay, 0s) infinite both;\n  --animate-thinking-circle: thinking-circle calc(var(--breath) * 3)\n    var(--ease-in-out) infinite both;\n  --animate-thinking-lemniscate: thinking-lemniscate calc(var(--breath) * 3)\n    var(--ease-in-out) infinite both;\n  --animate-thinking-sheen: thinking-sheen var(--breath) var(--ease-in-out)\n    infinite;\n  --animate-thinking-sheen-hold: thinking-sheen-hold var(--breath)\n    var(--ease-in-out) infinite;\n  --animate-step-shimmer: step-shimmer var(--breath) var(--ease-in-out) infinite;\n  --animate-row-flash: row-flash calc(var(--dur-fade) * 3) var(--ease-out) both;\n  --animate-mention-tip-in: mention-tip-in var(--dur-menu) var(--ease-out);\n  --animate-mark-in: mark-in var(--dur-pop) var(--ease-out) both;\n  --animate-sheet-in: sheet-in var(--dur-panel) var(--ease-drawer);\n  --animate-sheet-out: sheet-out var(--dur-exit) var(--ease-drawer) forwards;\n  --animate-ns-sec: ns-in var(--dur-pop) var(--ease-out) var(--delay, 0ms)\n    backwards;\n  --animate-ns-in: ns-in var(--ns-row-ms) var(--ease-out) backwards;\n  --animate-ns-check: ns-check var(--ns-check-ms) var(--ease-out) both;\n  --animate-ns-panel: ns-panel var(--dur-fade) var(--ease-out) both;\n  --animate-ns-pop-in: ns-pop-in var(--dur-pop) var(--ease-drawer) both;\n  --animate-ns-pop-out: ns-pop-out var(--dur-exit) var(--ease-out) both;\n  --animate-filed-fade: kit-fade-in var(--dur-pop) var(--ease-out)\n    var(--arrive-delay, 0ms) backwards;\n  --animate-filed-rise: rise-in var(--dur-pop) var(--ease-out)\n    var(--arrive-delay, 0ms) backwards;\n  --animate-offer-settle: rise-in calc(var(--dur-control) * 2) var(--ease-out)\n    backwards;\n  --animate-face-out: kit-fade-out var(--dur-exit) var(--ease-out) forwards;\n  --animate-face-in: kit-fade-in var(--dur-menu) var(--ease-out) backwards;\n  --animate-wave-arrive: wave-draw var(--dur-pop) var(--ease-out)\n    calc(var(--dur-rail) + var(--lead)) backwards;\n  --animate-wave-draw: wave-draw var(--dur-pop) var(--ease-out) backwards;\n  --animate-wave-breathe:\n    wave-breath-draw calc(var(--breath) * 2) var(--ease-out) infinite,\n    wave-breath-fade calc(var(--breath) * 2) var(--ease-in-out) infinite;\n  --animate-icon-swap: icon-swap var(--dur-control) var(--ease-out) both;\n  --animate-icon-swap-still: icon-swap-still var(--dur-control) var(--ease-out)\n    both;\n  --animate-cell-swap: cell-swap var(--dur-control) var(--ease-out);\n  --animate-cell-fade: kit-fade-in var(--dur-control) var(--ease-out);\n  --animate-arrive: kit-fade-in var(--dur-menu) var(--ease-out) both;\n  --animate-arrive-late: kit-fade-in var(--dur-menu) var(--ease-out)\n    var(--dur-control) both;\n  --animate-finish: finish calc(var(--dur-fade) * 2) var(--ease-out);\n  --animate-attn-echo: ping var(--dur-loop) var(--ease-out) 3 forwards;\n  --animate-head-fade: head-fade linear both;\n  --animate-dialog-in: kit-dialog-in var(--dur-panel) var(--ease-out) both;\n  --animate-dialog-out: kit-dialog-out var(--dur-exit) var(--ease-out) both;\n  --animate-scrim-in: kit-fade-in var(--dur-panel) var(--ease-out) both;\n  --animate-tip-fade: kit-tip-fade var(--dur-fade) var(--ease-out) both;\n  --animate-tip-in: kit-tip-in var(--dur-fade) var(--ease-out) both;\n  --animate-skeleton-pulse: kit-skeleton-pulse var(--dur-skeleton-pulse)\n    var(--ease-crossfade) infinite;\n  @keyframes spin {\n    to {\n      transform: rotate(360deg);\n    }\n  }\n  @keyframes ping {\n    75%,\n    100% {\n      transform: scale(2);\n      opacity: 0;\n    }\n  }\n  @keyframes pulse {\n    50% {\n      opacity: 0.5;\n    }\n  }\n  @keyframes check-draw {\n    from {\n      stroke-dashoffset: 1;\n    }\n    to {\n      stroke-dashoffset: 0;\n    }\n  }\n  @keyframes thinking-word {\n    0% {\n      opacity: 0;\n      transform: translateY(80%);\n    }\n    1.5%,\n    25% {\n      opacity: 1;\n      transform: translateY(0);\n    }\n    26%,\n    100% {\n      opacity: 0;\n      transform: translateY(-80%);\n    }\n  }\n  @keyframes thinking-circle {\n    0%,\n    50%,\n    100% {\n      opacity: 1;\n      transform: none;\n    }\n    25%,\n    75% {\n      opacity: 0;\n      transform: scale(1.15, 0.8);\n    }\n  }\n  @keyframes thinking-lemniscate {\n    0%,\n    50%,\n    100% {\n      opacity: 0;\n      transform: scale(0.7, 1.1);\n    }\n    25%,\n    75% {\n      opacity: 1;\n      transform: none;\n    }\n  }\n  @keyframes thinking-sheen {\n    to {\n      transform: translateX(-66.6667%);\n    }\n  }\n  @keyframes thinking-sheen-hold {\n    to {\n      transform: translateX(200%);\n    }\n  }\n  @keyframes step-shimmer {\n    from {\n      background-position: 0% 0;\n    }\n    to {\n      background-position: 100% 0;\n    }\n  }\n  @keyframes row-flash {\n    from {\n      opacity: 0.35;\n    }\n  }\n  @keyframes mention-tip-in {\n    from {\n      opacity: 0;\n      scale: var(--press-scale);\n    }\n  }\n  @keyframes mark-in {\n    from {\n      opacity: 0;\n      scale: 0.25;\n      filter: blur(var(--space-1));\n    }\n  }\n  @keyframes icon-swap {\n    from {\n      opacity: 0;\n      transform: scale(0.25);\n      filter: blur(var(--space-1));\n    }\n  }\n  @keyframes icon-swap-still {\n    from {\n      opacity: 0;\n    }\n  }\n  @keyframes sheet-in {\n    from {\n      transform: var(--sheet-away);\n    }\n  }\n  @keyframes sheet-out {\n    to {\n      transform: var(--sheet-away);\n    }\n  }\n  @keyframes ns-in {\n    from {\n      opacity: 0;\n      transform: translateY(8px);\n    }\n    to {\n      opacity: 1;\n      transform: none;\n    }\n  }\n  @keyframes ns-check {\n    from {\n      opacity: 0;\n      transform: scale(0.5);\n    }\n    to {\n      opacity: 1;\n      transform: none;\n    }\n  }\n  @keyframes ns-panel {\n    from {\n      opacity: 0;\n      transform: translateY(6px);\n    }\n    to {\n      opacity: 1;\n      transform: none;\n    }\n  }\n  @keyframes ns-pop-out {\n    to {\n      opacity: 0;\n      scale: var(--pop-scale);\n    }\n  }\n  @keyframes ns-pop-in {\n    from {\n      opacity: 0;\n      scale: var(--pop-scale);\n      translate: 0 calc(-1 * var(--pop-rise));\n    }\n  }\n  @keyframes rise-in {\n    from {\n      opacity: 0;\n      translate: 0 var(--pop-rise);\n    }\n  }\n  @keyframes wave-draw {\n    from {\n      stroke-dashoffset: var(--run);\n    }\n  }\n  @keyframes wave-breath-draw {\n    0% {\n      stroke-dashoffset: var(--run);\n    }\n    50%,\n    100% {\n      stroke-dashoffset: 0;\n    }\n  }\n  @keyframes wave-breath-fade {\n    0%,\n    50% {\n      opacity: 1;\n    }\n    100% {\n      opacity: 0;\n    }\n  }\n  @keyframes cell-swap {\n    from {\n      opacity: 0;\n      scale: var(--pop-scale);\n    }\n  }\n  @keyframes finish {\n    35% {\n      background-color: var(--status-done-bg);\n    }\n  }\n  @keyframes head-fade {\n    to {\n      opacity: 1;\n    }\n  }\n  @keyframes kit-dialog-in {\n    from {\n      opacity: 0;\n      transform: translateY(6px);\n    }\n  }\n  @keyframes kit-dialog-out {\n    to {\n      opacity: 0;\n      transform: translateY(6px);\n    }\n  }\n  @keyframes kit-tip-in {\n    from {\n      opacity: 0;\n      translate: var(--kit-tip-from);\n    }\n  }\n  @keyframes kit-skeleton-pulse {\n    0%,\n    100% {\n      opacity: 1;\n    }\n    50% {\n      opacity: var(--skeleton-pulse-floor);\n    }\n  }\n}\n\n@theme inline reference {\n  --shadow-xs: var(--shadow-xs);\n  --shadow-tile: var(--shadow-tile);\n  --shadow-raised: var(--shadow-raised);\n  --shadow-hairline: var(--shadow-hairline);\n  --shadow-stat: var(--shadow-stat);\n  --shadow-md: var(--shadow-md);\n  --shadow-lg: var(--shadow-lg);\n  --shadow-xl: var(--shadow-xl);\n  --shadow-overlay: var(--shadow-overlay);\n  --shadow-overlay-hung: var(--shadow-overlay-hung);\n  --shadow-modal: var(--shadow-modal);\n  --shadow-drawer: var(--shadow-drawer);\n  --shadow-tab-start: var(--shadow-tab-start);\n  --shadow-tab-end: var(--shadow-tab-end);\n  --shadow-tab-start-chosen: var(--shadow-tab-start-chosen);\n  --shadow-tab-end-chosen: var(--shadow-tab-end-chosen);\n  --shadow-inset-sel: var(--shadow-inset-sel);\n  --shadow-knob: var(--shadow-knob);\n\n  --font-wordmark: var(--font-wordmark);\n  --font-body: var(--font-body);\n  --font-mono: var(--font-mono);\n  --font-display: var(--font-display);\n\n  --leading-meta: var(--leading-meta);\n  --leading-label: var(--leading-label);\n  --leading-tight: var(--leading-tight);\n  --leading-ui: var(--leading-ui);\n  --leading-body: var(--leading-body);\n  --leading-prose: var(--leading-prose);\n  --leading-code: var(--leading-code);\n  --leading-kpi: var(--leading-kpi);\n  --leading-root: var(--leading-root);\n  --leading-prose-sm: var(--leading-prose-sm);\n  --leading-relaxed: var(--leading-relaxed);\n\n  --radius-hair: var(--radius-hair);\n  --radius-xs: var(--radius-xs);\n  --radius-sm: var(--radius-sm);\n  --radius-md: var(--radius-md);\n  --radius-lg: var(--radius-lg);\n  --radius-well: var(--radius-well);\n  --radius-panel: var(--radius-panel);\n  --radius-modal: var(--radius-modal);\n  --radius-pill: var(--radius-pill);\n\n  --ease-out: var(--ease-out);\n  --ease-in-out: var(--ease-in-out);\n  --ease-drawer: var(--ease-drawer);\n  --ease-crossfade: var(--ease-crossfade);\n  --ease-arrive: var(--ease-arrive);\n  --ease-figure: var(--ease-figure);\n  --ease-glide-in: var(--ease-glide-in);\n  --ease-glide-out: var(--ease-glide-out);\n}\n\n@utility bg-mark-overlay {\n  background-image: var(--mark-overlay);\n}\n\n@utility bg-action-surface {\n  background-image: var(--action-surface);\n}\n\n@utility bg-action-surface-hover {\n  background-image: var(--action-surface-hover);\n}\n\n@utility bg-rail {\n  background-image: var(--rail);\n}\n\n@utility bg-head-tint-ramp {\n  background-image: var(--head-tint-ramp);\n}\n\n@utility type-meta {\n  --tw-sort: vertical-align;\n  font: var(--type-meta);\n}\n\n@utility type-label {\n  --tw-sort: vertical-align;\n  font: var(--type-label);\n}\n\n@utility type-body {\n  --tw-sort: vertical-align;\n  font: var(--type-body);\n}\n\n@utility type-prose {\n  --tw-sort: vertical-align;\n  font: var(--type-prose);\n}\n\n@utility type-button {\n  --tw-sort: vertical-align;\n  font: var(--type-button);\n}\n\n@utility type-title {\n  --tw-sort: vertical-align;\n  font: var(--type-title);\n}\n\n@utility type-kpi {\n  --tw-sort: vertical-align;\n  font: var(--type-kpi);\n  font-variant-numeric: tabular-nums;\n}\n\n@utility type-code {\n  --tw-sort: vertical-align;\n  font: var(--type-code);\n}\n\n@utility type-caps {\n  --tw-sort: vertical-align;\n  font: var(--type-caps);\n}\n\n@utility text-size-meta {\n  font-size: var(--text-meta);\n}\n\n@utility text-size-label {\n  font-size: var(--text-label);\n}\n\n@utility text-size-body {\n  font-size: var(--text-body);\n}\n\n@utility text-size-code {\n  font-size: var(--text-code);\n}\n\n@utility text-size-title {\n  font-size: var(--text-title);\n}\n\n@utility text-size-kpi {\n  font-size: var(--text-kpi);\n}\n\n@utility text-size-display {\n  font-size: var(--text-display);\n}\n\n@utility text-size-field-floor {\n  font-size: var(--text-field-floor);\n}\n\n@utility text-meta {\n  font-size: var(--text-meta);\n  line-height: var(--tw-leading, var(--leading-meta));\n  font-weight: var(--tw-font-weight, var(--weight-body));\n}\n\n@utility text-label {\n  font-size: var(--text-label);\n  line-height: var(--tw-leading, var(--leading-label));\n  font-weight: var(--tw-font-weight, var(--weight-strong));\n}\n\n@utility text-body {\n  font-size: var(--text-body);\n  line-height: var(--tw-leading, var(--leading-body));\n  font-weight: var(--tw-font-weight, var(--weight-body));\n}\n\n@utility text-title {\n  font-size: var(--text-title);\n  line-height: var(--tw-leading, var(--leading-ui));\n  letter-spacing: var(--tw-tracking, var(--track-title));\n  font-weight: var(--tw-font-weight, var(--weight-strong));\n}\n\n@utility text-kpi {\n  font-size: var(--text-kpi);\n  line-height: var(--tw-leading, var(--leading-kpi));\n  font-weight: var(--tw-font-weight, var(--weight-strong));\n}\n\n@utility transition-control {\n  transition: var(--transition-control);\n}\n\n@utility transition-fade-show {\n  transition: var(--transition-fade-show);\n}\n\n@utility transition-fade-hide {\n  transition: var(--transition-fade-hide);\n}\n\n@utility transition-exit-show {\n  transition: var(--transition-exit-show);\n}\n\n@utility transition-exit-hide {\n  transition: var(--transition-exit-hide);\n}\n\n@utility transition-fade-blur {\n  transition: var(--transition-fade-blur);\n}\n\n@utility transition-fade-slide-blur {\n  transition: var(--transition-fade-slide-blur);\n}\n\n@utility transition-tint-press {\n  transition: var(--transition-tint-press);\n}\n\n@utility transition-control-press {\n  transition: var(--transition-control-press);\n}\n\n@utility transition-control-slide {\n  transition: var(--transition-control-slide);\n}\n\n@utility transition-control-ring {\n  transition: var(--transition-control-ring);\n}\n\n@utility transition-chip-settle {\n  transition: var(--transition-chip-settle);\n}\n\n@utility transition-pick-card {\n  transition: var(--transition-pick-card);\n}\n\n@utility transition-frame-end-first {\n  transition: var(--transition-frame-end-first);\n}\n\n@utility transition-frame-start-first {\n  transition: var(--transition-frame-start-first);\n}\n\n@utility transition-split-surface {\n  transition: var(--transition-split-surface);\n}\n\n@utility transition-ring-arc {\n  transition: var(--transition-ring-arc);\n}\n\n@utility transition-rail-tip {\n  transition: var(--transition-rail-tip);\n}\n\n@utility transition-panel-travel {\n  transition: var(--transition-panel-travel);\n}\n\n@utility transition-panel-resize {\n  transition: var(--transition-panel-resize);\n}\n\n@utility transition-suggest-chip {\n  transition: var(--transition-suggest-chip);\n}\n\n@utility transition-segment {\n  transition: var(--transition-segment);\n}\n\n@utility transition-fold-fade {\n  transition: var(--transition-fold-fade);\n}\n\n@utility transition-morph-fade {\n  transition: var(--transition-morph-fade);\n}\n\n@utility transition-band-hide {\n  transition: var(--transition-band-hide);\n}\n\n@utility transition-band-show {\n  transition: var(--transition-band-show);\n}\n\n@utility transition-band-slide-hide {\n  transition: var(--transition-band-slide-hide);\n}\n\n@utility transition-band-slide-show {\n  transition: var(--transition-band-slide-show);\n}\n\n@utility transition-band-row-shut {\n  transition: var(--transition-band-row-shut);\n}\n\n@utility transition-band-row-open {\n  transition: var(--transition-band-row-open);\n}\n\n@utility liga-none {\n  font-variant-ligatures: none;\n}\n\n@utility no-scrollbar {\n  scrollbar-width: none;\n  &::-webkit-scrollbar {\n    display: none;\n  }\n}\n\n@utility anim-dur-* {\n  animation-duration: --value(--duration-*);\n}\n\n@utility anim-delay-* {\n  animation-delay: --value(--duration-*);\n}\n", Ul = (e) => [...Hl.matchAll(RegExp(`^\\s*--${e}-([a-z0-9-]+):`, "gm"))].map(([, e]) => e), Wl = (e) => [...Hl.matchAll(RegExp(`^@utility ${e}-([a-z0-9-]+) \\{`, "gm"))].map(([, e]) => e), Gl = Ul("duration"), Kl = [
	"type-role",
	"font-shorthand",
	"font-family",
	"font-features",
	"font-size",
	"font-stretch",
	"font-style",
	"font-weight",
	"fvn-normal",
	"fvn-ordinal",
	"fvn-slashed-zero",
	"fvn-figure",
	"fvn-spacing",
	"fvn-fraction",
	"leading"
], ql = [Fo.isArbitraryVariable, Fo.isArbitraryValue], Jl = { extend: {
	theme: {
		text: Wl("text").filter((e) => !e.startsWith("size-")),
		spacing: Ul("spacing"),
		radius: Ul("radius"),
		shadow: Ul("shadow"),
		"drop-shadow": Ul("drop-shadow"),
		leading: Ul("leading"),
		tracking: Ul("tracking"),
		ease: Ul("ease"),
		font: Ul("font").filter((e) => !e.startsWith("weight-")),
		"font-weight": Ul("font-weight"),
		breakpoint: Ul("breakpoint"),
		container: Ul("container"),
		animate: Ul("animate")
	},
	classGroups: {
		"font-size": [{ "text-size": Wl("text-size") }],
		"bg-image": [{ bg: Wl("bg") }],
		transition: [{ transition: [
			...Wl("transition"),
			"off",
			"control-grow"
		] }],
		animate: ["sheet-fade"],
		content: [{ content: ["data-n", "placeholder"] }],
		"grid-rows": [{ "grid-rows": ["shut", "open"] }],
		"grid-cols": [{ "grid-cols": ["fluid-auto", "mark-fluid"] }],
		"auto-rows": [{ "auto-rows": [
			"line",
			"band",
			"band-phone"
		] }],
		"animation-duration": [{ "anim-dur": Gl }],
		"animation-delay": [{ "anim-delay": Gl }],
		"type-role": [{ type: Wl("type") }],
		"border-none-t": ["border-t-none"],
		"border-none-b": ["border-b-none"],
		"border-none-l": ["border-l-none"],
		"border-none-r": ["border-r-none"],
		"border-none-s": ["border-s-none"],
		"border-style-t": ["border-t-dashed"],
		"outline-off": ["outline-off"],
		"background-shorthand": [{ background: [Fo.isAny] }],
		rounded: ["rounded-inherit", { concentric: Ul("radius") }],
		"concentric-in": ["concentric-in"],
		"r-outer": [{ "r-outer": Ul("radius") }],
		"r-inset": [{ "r-inset": Ul("spacing") }],
		"font-family": ["font-family-inherit"],
		gap: ["gap-inherit"],
		"color-scheme": ["scheme-inherit"],
		"pointer-events": ["pointer-events-all"],
		"max-h": ["max-h-inherit"],
		"align-items": [
			"items-box-start",
			"items-box-end",
			"items-unsafe-end"
		],
		"justify-content": ["justify-box-end"],
		"justify-self": ["justify-self-box-start"],
		"align-content": ["content-unsafe-end"],
		"border-color": ["border-suggest-tint"],
		"bg-color": ["bg-suggest-tint", "bg-suggest-tint-hover"],
		"font-shorthand": ["font-inherit", "font-mono-meta"],
		"line-clamp-undo": ["line-clamp-undo"],
		"translate-raw": [{ "translate-raw": ql }],
		"clip-margin": [{ "clip-margin": [Fo.isAny] }],
		"overflow-anchor": ["anchor-none"],
		"scroll-timeline": ["scroll-timeline-transcript-head"],
		"pane-tab-pads": ["pane-tab-pads"],
		"pane-tab-rims": ["pane-tab-rims"],
		"divider-chevron": ["divider-chevron"],
		"turn-pad": ["turn-pad"],
		"word-break-word": ["break-word"],
		"animation-play-state": ["animation-paused"],
		"inks-strong": ["inks-strong"],
		"tap-highlight": ["tap-highlight-none"],
		"touch-callout": ["touch-callout-none"],
		"content-visibility": ["content-visibility-hidden"],
		"timeline-scope": ["timeline-scope-transcript-head"],
		"writing-mode": ["writing-vertical-rl"],
		direction: ["dir-rtl"],
		"clip-path": [
			{ "clip-path": ql },
			"clip-block-start",
			"clip-tab-foot"
		],
		"grid-areas": [{ "grid-areas": ql }],
		"line-clamp-std": [{ "line-clamp-std": [Fo.isInteger] }],
		"ring-ground": [{ "ring-ground": [Fo.isAny] }],
		"hit-gap-x": [{ "hit-gap-x": [Fo.isAny] }],
		"hit-gap-y": [{ "hit-gap-y": ql }],
		"caw-neck": [{ "caw-neck": ql }],
		"press-by": [{ "press-by": ql }],
		"swap-away": [{ "swap-away": [Fo.isInteger] }],
		"rail-step": [{ "rail-step": ql }],
		"prompt-fs": [{ "prompt-fs": ql }],
		"fade-inset-end": [{ "fade-inset-end": ql }]
	},
	conflictingClassGroups: {
		"type-role": [...Kl],
		"font-shorthand": [...Kl]
	}
} }, Yl = Ho(Jl), Xl = Vl({ twMergeConfig: Jl });
function Zl(...e) {
	return Yl(Ci(e));
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte@5.57.2-ccb70d565b313072/node_modules/svelte/src/reactivity/map.js
var Ql = class extends Map {
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ L(0);
	#n = /* @__PURE__ */ L(0);
	#r = sr || -1;
	constructor(e) {
		if (super(), e) {
			for (var [t, n] of e) super.set(t, n);
			this.#n.v = super.size;
		}
	}
	#i(e) {
		return sr === this.#r ? /* @__PURE__ */ L(e) : Kt(e);
	}
	has(e) {
		var t = this.#e, n = t.get(e);
		if (n === void 0) {
			if (super.has(e)) n = this.#i(0), t.set(e, n);
			else return H(this.#t), !1;
		}
		return H(n), !0;
	}
	forEach(e, t) {
		this.#a(), super.forEach(e, t);
	}
	get(e) {
		var t = this.#e, n = t.get(e);
		if (n === void 0) {
			if (super.has(e)) n = this.#i(0), t.set(e, n);
			else {
				H(this.#t);
				return;
			}
		}
		return H(n), super.get(e);
	}
	getOrInsert(e, t) {
		return super.has(e) || this.set(e, t), this.get(e);
	}
	getOrInsertComputed(e, t) {
		return super.has(e) || this.set(e, t(e)), this.get(e);
	}
	set(e, t) {
		var n = this.#e, r = n.get(e), i = super.get(e), a = super.set(e, t), o = this.#t;
		if (r === void 0) r = this.#i(0), n.set(e, r), R(this.#n, super.size), Zt(o);
		else if (i !== t) {
			Zt(r);
			var s = o.reactions === null ? null : new Set(o.reactions);
			(s === null || !r.reactions?.every((e) => s.has(e))) && Zt(o);
		}
		return a;
	}
	delete(e) {
		var t = this.#e, n = t.get(e), r = super.delete(e);
		return n !== void 0 && (t.delete(e), R(n, -1)), r && (R(this.#n, super.size), Zt(this.#t)), r;
	}
	clear() {
		if (super.size !== 0) {
			super.clear();
			var e = this.#e;
			R(this.#n, 0);
			for (var t of e.values()) R(t, -1);
			Zt(this.#t), e.clear();
		}
	}
	#a() {
		H(this.#t);
		var e = this.#e;
		if (this.#n.v !== e.size) {
			for (var t of super.keys()) if (!e.has(t)) {
				var n = this.#i(0);
				e.set(t, n);
			}
		}
		for ([, n] of this.#e) H(n);
	}
	keys() {
		return H(this.#t), super.keys();
	}
	values() {
		return this.#a(), super.values();
	}
	entries() {
		return this.#a(), super.entries();
	}
	[Symbol.iterator]() {
		return this.entries();
	}
	get size() {
		return H(this.#n), super.size;
	}
}, $l = class {
	#e;
	#t;
	constructor(e, t) {
		this.#e = e, this.#t = qr(t);
	}
	get current() {
		return this.#t(), this.#e();
	}
}, eu = /\(.+\)/, tu = /* @__PURE__ */ new Set([
	"all",
	"print",
	"screen",
	"and",
	"or",
	"not",
	"only"
]), nu = class extends $l {
	constructor(e, t) {
		let n = eu.test(e) || e.split(/[\s,]+/).some((e) => tu.has(e.trim())) ? e : `(${e})`, r = window.matchMedia(n);
		super(() => r.matches, (e) => Tr(r, "change", e));
	}
}, ru = new nu("(prefers-reduced-motion: no-preference)");
function iu(e, t, n, r) {
	let i = 3 * e, a = 3 * (n - e) - i, o = 1 - i - a, s = 3 * t, c = 3 * (r - t) - s, l = 1 - s - c, u = (e) => ((o * e + a) * e + i) * e, d = (e) => ((l * e + c) * e + s) * e, f = (e) => (3 * o * e + 2 * a) * e + i, p = (e) => {
		let t = e;
		for (let n = 0; n < 8; n += 1) {
			let n = u(t) - e;
			if (Math.abs(n) < 1e-6) return t;
			let r = f(t);
			if (Math.abs(r) < 1e-6) break;
			t -= n / r;
		}
		let n = 0, r = 1;
		for (t = e; r - n > 1e-6;) u(t) < e ? n = t : r = t, t = (n + r) / 2;
		return t;
	};
	return (e) => e <= 0 ? 0 : e >= 1 ? 1 : d(p(e));
}
var au = iu(.23, 1, .32, 1);
iu(.77, 0, .175, 1);
var ou = iu(.32, .72, 0, 1), su = /* @__PURE__ */ "--dur-control.--dur-menu.--dur-pop.--dur-panel.--dur-grow.--dur-grow-exit.--dur-lift.--dur-press-hold.--dur-exit.--dur-toggle.--dur-morph.--dur-rail.--dur-fade.--dur-hold.--dur-ghost.--dur-stagger.--dur-cascade.--dur-skeleton-reveal.--skeleton-reveal-blur.--ease-out.--ease-in-out.--ease-drawer.--pop-scale.--pop-rise.--space-1.--space-3".split("."), cu = /* @__PURE__ */ new Map(), lu = !1, uu = (e) => {
	let t = cu.get(e);
	if (t !== void 0) return t;
	let n = document.documentElement;
	lu || (lu = !0, new MutationObserver(() => cu.clear()).observe(n, {
		attributes: !0,
		attributeFilter: ["class"]
	}));
	let r = getComputedStyle(n);
	for (let t of cu.size === 0 ? [...su, e] : [e]) cu.set(t, r.getPropertyValue(t).trim());
	return cu.get(e);
}, du = (e) => {
	let t = uu(e), n = Number.parseFloat(t);
	return t.endsWith("ms") ? n : n * 1e3;
}, fu = (e) => uu(e), pu = (e) => Number.parseFloat(uu(e)), mu = {
	out: "cubic-bezier(0.23, 1, 0.32, 1)",
	inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
	drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
	glideIn: "cubic-bezier(0.3333, 0, 0.6667, 0.3333)",
	glideOut: "cubic-bezier(0.3333, 0.6667, 0.6667, 1)"
}, hu = (e) => Number.parseFloat(uu(e)) || 0;
function gu(e, t) {
	let n = hu("--space-3") + hu("--space-1"), r = n > 0 ? Math.min(1, e / n) : 0, i = hu("--space-3") * r, a = hu("--space-1") * r, o = 2 * i / t, s = Math.max(0, e - i - a) / t, c = 2 * a / t, l = o + s + c;
	return {
		covered: (n) => {
			if (n <= 0) return 0;
			if (n < o) return t / (2 * o) * n * n;
			if (n < o + s) return i + t * (n - o);
			if (n < l) {
				let r = l - n;
				return e - t / (2 * c) * r * r;
			}
			return e;
		},
		duration: l,
		frames: (t, n) => l <= 0 || e <= 0 ? [t, n] : [
			{
				...t,
				offset: 0,
				easing: mu.glideIn
			},
			{
				...yu(t, n, i / e),
				offset: o / l,
				easing: "linear"
			},
			{
				...yu(t, n, (e - a) / e),
				offset: (o + s) / l,
				easing: mu.glideOut
			},
			{
				...n,
				offset: 1
			}
		],
		reached: (n) => n <= 0 ? 0 : n >= e ? l : n < i ? Math.sqrt(2 * o * n / t) : n <= e - a ? o + (n - i) / t : l - Math.sqrt(2 * c * (e - n) / t)
	};
}
var _u = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi, vu = /* @__PURE__ */ new Set([
	"offset",
	"easing",
	"composite",
	"computedOffset"
]);
function yu(e, t, n) {
	let r = {};
	for (let [i, a] of Object.entries(e)) {
		if (vu.has(i) || a == null) continue;
		let e = String(t[i] ?? a).match(_u) ?? [], o = 0;
		r[i] = String(a).replace(_u, (t) => {
			let r = Number(t), i = Number(e[o] ?? t);
			return o += 1, String(Number((r + (i - r) * n).toFixed(3)));
		});
	}
	return r;
}
iu(.42, 0, .58, 1);
//#endregion
//#region src/lib/cawco/motion/hang.ts
var bu = /translate(?:3d)?\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/, xu = "grown", Su = "hang-slide", Cu = /* @__PURE__ */ new WeakSet(), wu = (e) => {
	Cu.add(e), e.dispatchEvent(new Event(xu));
}, Tu = "folded", Eu = (e, t) => Math.abs(e.start - t.start) <= .5 && Math.abs(e.end - t.end) <= .5 && e.flareStart === t.flareStart && e.flareEnd === t.flareEnd && e.flush === t.flush, Du = (e) => e > 0 ? Math.sqrt(2 * e + 1) : 0;
function Ou(e, t) {
	let n = Du(e.flareStart), r = Du(e.flareEnd), i = (e, n) => t === "foot" ? `${e} ${n}` : `${t === "end" ? n : `calc(100% - ${n === "0" ? "0px" : n})`} ${e}`, a = t === "end" ? "cw" : "ccw", o = e.flareStart > 0 ? `arc to ${i(`${n}px`, "0")} of ${e.flareStart + 1}px ${a}` : `line to ${i("0", "0")}`, s = e.flareEnd > 0 ? `arc to ${i("100%", "100%")} of ${e.flareEnd + 1}px ${a}` : `line to ${i("100%", "100%")}`;
	return `shape(from ${i("0", "100%")}, ${o}, line to ${i(`calc(100% - ${r}px)`, "0")}, ${s}, close)`;
}
var ku = (e, t) => [
	["--neck-start", `${e.start}px`],
	["--neck-end", `${e.end}px`],
	["--neck-flare-start", `${e.flareStart}px`],
	["--neck-flare-end", `${e.flareEnd}px`],
	["--neck-cut", Ou(e, t)]
];
function Au(e, t, n = "foot") {
	for (let [r, i] of ku(t, n)) e.style.setProperty(r, i);
}
var ju = /* @__PURE__ */ new WeakMap();
function Mu(e) {
	ju.get(e)?.();
}
function Nu(e) {
	return (t) => {
		let n = t.parentElement;
		if (!n) return;
		let r = e.grow ? Lu(t, e, e.grow) : Ru(t, e), i = () => br(() => {
			let t = bu.exec(n.style.transform);
			if (!t) return;
			let i = Number(t[1]), a = Number(t[2]);
			e.onplaced?.(i, a);
			let o = e.neckAt((e.from ?? "foot") === "foot" ? i : a);
			o && (r.placed(), e.onneck(o));
		}), a = new MutationObserver(i);
		return a.observe(n, {
			attributes: !0,
			attributeFilter: ["style"]
		}), i(), () => {
			a.disconnect(), r.stop();
		};
	};
}
var Pu = "hang-grow", Fu = /* @__PURE__ */ new WeakMap();
function Iu(e) {
	Fu.get(e)?.again();
}
function Lu(e, t, n) {
	let r = null, i = !1, a = 0, o = 0, s = 0, c = 0, l = (e) => {
		o = e, n(e);
	}, u = () => {
		cancelAnimationFrame(a), r?.cancel(), r = null;
	};
	Fu.set(e, {
		again: () => n(o),
		to: (e) => {
			u(), l(e);
		}
	});
	let d = () => {
		let e = r;
		if (!e) return;
		let t = e.effect?.getComputedTiming(), n = Number(e.currentTime ?? 0) >= Number(t?.endTime ?? 0);
		l(s + (c - s) * (n ? 1 : t?.progress ?? 0)), a = requestAnimationFrame(d);
	}, f = (t, n) => {
		u(), Cu.delete(e), s = o, c = t;
		let i = e.animate([{ "--hang-grow": s }, { "--hang-grow": t }], {
			id: Pu,
			duration: Math.max(1, n * Math.abs(t - s)),
			easing: fu("--ease-out"),
			fill: "forwards"
		});
		return r = i, a = requestAnimationFrame(d), i;
	}, p = () => {
		u(), l(0), Cu.delete(e), delete e.dataset.shown, t.onshown?.(!1), e.dispatchEvent(new Event(Tu));
	}, m = () => {
		if (!i) return;
		if (e.dataset.shown = "", t.onshown?.(!0), t.held?.()) {
			u(), wu(e);
			return;
		}
		if (!ru.current) {
			u(), l(1), wu(e);
			return;
		}
		let n = f(1, du("--dur-pop"));
		n.finished.then(() => {
			r === n && (u(), l(1), wu(e));
		}).catch(() => void 0);
	}, h = () => {
		if (t.folded?.() || !ru.current || !i || e.dataset.shown === void 0) {
			p();
			return;
		}
		let n = f(0, du("--dur-exit"));
		n.finished.then(() => {
			r === n && p();
		}).catch(() => void 0);
	}, g = 0, _ = new MutationObserver(() => {
		e.dataset.state === "closed" ? (cancelAnimationFrame(g), h()) : e.dataset.state === "open" && i && (cancelAnimationFrame(g), g = requestAnimationFrame(m));
	});
	return _.observe(e, {
		attributes: !0,
		attributeFilter: ["data-state"]
	}), br(() => l(0)), {
		placed() {
			let t = !i;
			i = !0, t ? g = requestAnimationFrame(() => {
				e.dataset.state === "open" && m();
			}) : n(o);
		},
		stop() {
			cancelAnimationFrame(g), _.disconnect(), u(), Fu.delete(e);
		}
	};
}
function Ru(e, t) {
	let n = null, r = !1, i = "0px 0px", a = t.from ?? "foot", o = () => {
		let t = Number.parseFloat(getComputedStyle(e).getPropertyValue("--hang-reach")) || 0;
		return a === "end" ? `calc(-100% - ${t}px) 0px` : a === "start" ? `calc(100% + ${t}px) 0px` : `0px calc(-100% - ${t}px)`;
	}, s = (t) => n ? getComputedStyle(e).translate : t, c = (t, r, i, a) => {
		Cu.delete(e);
		let o = e.animate([{ translate: t }, { translate: r }], {
			duration: i,
			easing: fu("--ease-out"),
			fill: "forwards"
		});
		return n?.cancel(), n = o, e.dispatchEvent(new CustomEvent(Su, { detail: {
			opens: a,
			run: o
		} })), o;
	}, l = () => {
		n?.cancel(), n = null, Cu.delete(e), delete e.dataset.shown, e.dispatchEvent(new Event(Tu));
	}, u = () => {
		if (!r) return;
		if (e.dataset.shown = "", t.onshown?.(!0), !ru.current || t.held?.()) {
			n?.cancel(), n = null, wu(e);
			return;
		}
		let a = c(s(o()), i, du("--dur-pop"), !0);
		a.finished.then(() => {
			n === a && (a.cancel(), n = null, wu(e));
		}).catch(() => void 0);
	}, d = () => {
		if (t.onshown?.(!1), t.folded?.() || !ru.current || !r || e.dataset.shown === void 0) {
			l();
			return;
		}
		let a = c(s(i), o(), du("--dur-exit"), !1);
		a.finished.then(() => {
			n === a && l();
		}).catch(() => void 0);
	}, f = 0;
	ju.set(e, () => {
		cancelAnimationFrame(f), d();
	});
	let p = new MutationObserver(() => {
		e.dataset.state === "closed" ? (cancelAnimationFrame(f), d()) : e.dataset.state === "open" && r && (cancelAnimationFrame(f), f = requestAnimationFrame(u));
	});
	return p.observe(e, {
		attributes: !0,
		attributeFilter: ["data-state"]
	}), {
		placed() {
			let t = !r;
			r = !0, t && (f = requestAnimationFrame(() => {
				e.dataset.state === "open" && u();
			}));
		},
		stop() {
			cancelAnimationFrame(f), p.disconnect(), n?.cancel(), ju.delete(e);
		}
	};
}
//#endregion
//#region src/lib/components/ui/fluid-tabs/fold-path.ts
var zu = .5523, Bu = (e) => ({
	spread: [+!e[0], +!e[1]],
	tuck: [0, 0]
}), Vu = (e) => Math.round(e * 100) / 100;
function Hu(e, t, n = {}) {
	let { width: r, flare: i } = e, a = n.inset ?? 0, o = n.at?.x ?? 0, s = n.at?.y ?? 0, c = e.height, l = e.radius - a, u = (e, t) => `${Vu(e + o)} ${Vu(t + s)}`, [d, f] = t.spread, p = i + a + t.tuck[0], m = i + r - a - t.tuck[1], h = c - i, g = (i + a) * d, _ = (i + a) * f, v = p - g, y = m + _, b = c + a * Math.max(d, 0), x = c + a * Math.max(f, 0), S = l + a;
	return [
		`M ${u(v, b)}`,
		`C ${u(v + zu * g, b)} ${u(p, h + zu * g)} ${u(p, h)}`,
		`L ${u(p + e.slopeStart, S)}`,
		`A ${Vu(l)} ${Vu(l)} 0 0 1 ${u(p + e.slopeStart + l, a)}`,
		`L ${u(m - e.slopeEnd - l, a)}`,
		`A ${Vu(l)} ${Vu(l)} 0 0 1 ${u(m - e.slopeEnd, S)}`,
		`L ${u(m, h)}`,
		`C ${u(m, h + zu * _)} ${u(y - zu * _, x)} ${u(y, x)}`
	].join(" ");
}
//#endregion
//#region src/lib/cawco/motion/hang-shape.ts
var Uu = .5, Wu = (e) => Math.round(e * 100) / 100, Gu = (e) => (t, n) => `${Wu(t - e.x)} ${Wu(n - e.y)}`, Ku = {
	x: 0,
	y: 0
};
function qu(e) {
	let { tab: t, hang: n, box: r, flush: i } = e, a = Math.max(0, Math.min(e.corner, n.height / 2)), o = (t) => Math.max(0, Math.min(e.corner, t, n.height - a));
	return {
		bottom: a,
		start: i.start ? 0 : o(t.left - r.flare - n.left),
		end: i.end ? 0 : o(n.right - (t.right + r.flare))
	};
}
function Ju(e, t) {
	let { tab: n, hang: r, flush: i } = e, a = e.box.flare, o = n.bottom, s = o + r.height, c = qu(e), l = (e, n, r) => e > .5 ? `A ${Wu(e - Uu)} ${Wu(e - Uu)} 0 0 1 ${t(n, r)}` : `L ${t(n, r)}`, u = [];
	return i.end || (u.push(`L ${t(r.right - c.end, o + Uu)}`), u.push(l(c.end, r.right - Uu, o + Math.max(c.end, Uu)))), u.push(`L ${t(r.right - Uu, s - c.bottom)}`), u.push(l(c.bottom, r.right - c.bottom, s - Uu)), u.push(`L ${t(r.left + c.bottom, s - Uu)}`), u.push(l(c.bottom, r.left + Uu, s - c.bottom)), i.start ? u.push(`L ${t(r.left + Uu, o)}`) : (u.push(`L ${t(r.left + Uu, o + Math.max(c.start, Uu))}`), u.push(l(c.start, r.left + c.start, o + Uu)), u.push(`L ${t(n.left - a, o + Uu)}`)), u;
}
function Yu(e) {
	return Hu(e.box, Bu([e.flush.start, e.flush.end]), {
		inset: Uu,
		at: {
			x: e.tab.left - e.box.flare,
			y: e.tab.top
		}
	});
}
var Xu = (e) => e.hang.height >= 1;
function Zu(e) {
	let t = Yu(e);
	return Xu(e) ? `${t} ${Ju(e, Gu(Ku)).join(" ")} Z` : t;
}
function Qu(e, t) {
	if (!Xu(e)) return "M 0 0 Z";
	let { tab: n, flush: r, box: i } = e, a = Gu(t), o = i.flare, s = n.bottom, c = Math.sqrt((o + Uu) ** 2 - o ** 2), l = r.start ? n.left + Uu : n.left - o + c, u = r.end ? n.right - Uu : n.right + o - c, d = `A ${Wu(o + Uu)} ${Wu(o + Uu)} 0 0 0`, f = [`M ${a(l, s)}`, `L ${a(u, s)}`];
	return r.end || f.push(`${d} ${a(n.right + o, s + Uu)}`), f.push(...Ju(e, a)), r.start || f.push(`${d} ${a(l, s)}`), f.push("Z"), f.join(" ");
}
function $u(e, t) {
	let n = Math.min(1, Math.max(0, t)), r = (e, t) => e + (t - e) * n, i = e.box.flare;
	return {
		...e,
		hang: {
			left: e.flush.start ? e.hang.left : r(e.tab.left - i, e.hang.left),
			right: e.flush.end ? e.hang.right : r(e.tab.right + i, e.hang.right),
			height: e.hang.height * n
		}
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/is.js
function ed(e) {
	return typeof e == "function";
}
function td(e) {
	return typeof e == "object" && !!e;
}
var nd = [
	"string",
	"number",
	"bigint",
	"boolean"
];
function rd(e) {
	return e == null || nd.includes(typeof e) ? !0 : Array.isArray(e) ? e.every((e) => rd(e)) : typeof e == "object" && Object.getPrototypeOf(e) === Object.prototype;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/box/box-extras.svelte.js
var id = Symbol("box"), ad = Symbol("is-writable");
function Q(e, t) {
	let n = /* @__PURE__ */ F(e);
	return t ? {
		[id]: !0,
		[ad]: !0,
		get current() {
			return H(n);
		},
		set current(e) {
			t(e);
		}
	} : {
		[id]: !0,
		get current() {
			return e();
		}
	};
}
function od(e) {
	return td(e) && id in e;
}
function sd(e) {
	return od(e) && ad in e;
}
function cd(e) {
	return od(e) ? e : ed(e) ? Q(e) : dd(e);
}
function ld(e) {
	return Object.entries(e).reduce((e, [t, n]) => od(n) ? (sd(n) ? Object.defineProperty(e, t, {
		get() {
			return n.current;
		},
		set(e) {
			n.current = e;
		}
	}) : Object.defineProperty(e, t, { get() {
		return n.current;
	} }), e) : Object.assign(e, { [t]: n }), {});
}
function ud(e) {
	return sd(e) ? {
		[id]: !0,
		get current() {
			return e.current;
		}
	} : e;
}
function dd(e) {
	let t = /* @__PURE__ */ L($t(e));
	return {
		[id]: !0,
		[ad]: !0,
		get current() {
			return H(t);
		},
		set current(e) {
			R(t, e, !0);
		}
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/box/box.svelte.js
function fd(e) {
	let t = /* @__PURE__ */ L($t(e));
	return {
		[id]: !0,
		[ad]: !0,
		get current() {
			return H(t);
		},
		set current(e) {
			R(t, e, !0);
		}
	};
}
fd.from = cd, fd.with = Q, fd.flatten = ld, fd.readonly = ud, fd.isBox = od, fd.isWritableBox = sd;
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/compose-handlers.js
function pd(...e) {
	return function(t) {
		for (let n of e) if (n) {
			if (t.defaultPrevented) return;
			typeof n == "function" ? n.call(this, t) : n.current?.call(this, t);
		}
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/inline-style-parser@0.2.7-2afe2315d922f283/node_modules/inline-style-parser/esm/index.mjs
var md = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, hd = /\n/g, gd = /^\s*/, _d = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/, vd = /^:\s*/, yd = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/, bd = /^[;\s]*/, xd = /^\s+|\s+$/g, Sd = "\n", Cd = "/", wd = "*", Td = "", Ed = "comment", Dd = "declaration";
function Od(e, t) {
	if (typeof e != "string") throw TypeError("First argument must be a string");
	if (!e) return [];
	t ||= {};
	var n = 1, r = 1;
	function i(e) {
		var t = e.match(hd);
		t && (n += t.length);
		var i = e.lastIndexOf(Sd);
		r = ~i ? e.length - i : r + e.length;
	}
	function a() {
		var e = {
			line: n,
			column: r
		};
		return function(t) {
			return t.position = new o(e), l(), t;
		};
	}
	function o(e) {
		this.start = e, this.end = {
			line: n,
			column: r
		}, this.source = t.source;
	}
	o.prototype.content = e;
	function s(i) {
		var a = /* @__PURE__ */ Error(t.source + ":" + n + ":" + r + ": " + i);
		if (a.reason = i, a.filename = t.source, a.line = n, a.column = r, a.source = e, !t.silent) throw a;
	}
	function c(t) {
		var n = t.exec(e);
		if (n) {
			var r = n[0];
			return i(r), e = e.slice(r.length), n;
		}
	}
	function l() {
		c(gd);
	}
	function u(e) {
		var t;
		for (e ||= []; t = d();) t !== !1 && e.push(t);
		return e;
	}
	function d() {
		var t = a();
		if (Cd == e.charAt(0) && wd == e.charAt(1)) {
			for (var n = 2; Td != e.charAt(n) && (wd != e.charAt(n) || Cd != e.charAt(n + 1));) ++n;
			if (n += 2, Td === e.charAt(n - 1)) return s("End of comment missing");
			var o = e.slice(2, n - 2);
			return r += 2, i(o), e = e.slice(n), r += 2, t({
				type: Ed,
				comment: o
			});
		}
	}
	function f() {
		var e = a(), t = c(_d);
		if (t) {
			if (d(), !c(vd)) return s("property missing ':'");
			var n = c(yd), r = e({
				type: Dd,
				property: kd(t[0].replace(md, Td)),
				value: n ? kd(n[0].replace(md, Td)) : Td
			});
			return c(bd), r;
		}
	}
	function p() {
		var e = [];
		u(e);
		for (var t; t = f();) t !== !1 && (e.push(t), u(e));
		return e;
	}
	return l(), p();
}
function kd(e) {
	return e ? e.replace(xd, Td) : Td;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/style-to-object@1.0.14-925e756c179989c7/node_modules/style-to-object/esm/index.mjs
function Ad(e, t) {
	let n = null;
	if (!e || typeof e != "string") return n;
	let r = Od(e), i = typeof t == "function";
	return r.forEach((e) => {
		if (e.type !== "declaration") return;
		let { property: r, value: a } = e;
		i ? t(r, a, e) : a && (n ||= {}, n[r] = a);
	}), n;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/strings.js
var jd = /\d/, Md = [
	"-",
	"_",
	"/",
	"."
];
function Nd(e = "") {
	if (!jd.test(e)) return e !== e.toLowerCase();
}
function Pd(e) {
	let t = [], n = "", r, i;
	for (let a of e) {
		let e = Md.includes(a);
		if (e === !0) {
			t.push(n), n = "", r = void 0;
			continue;
		}
		let o = Nd(a);
		if (i === !1) {
			if (r === !1 && o === !0) {
				t.push(n), n = a, r = o;
				continue;
			}
			if (r === !0 && o === !1 && n.length > 1) {
				let e = n.at(-1);
				t.push(n.slice(0, Math.max(0, n.length - 1))), n = e + a, r = o;
				continue;
			}
		}
		n += a, r = o, i = e;
	}
	return t.push(n), t;
}
function Fd(e) {
	return e ? Pd(e).map((e) => Ld(e)).join("") : "";
}
function Id(e) {
	return Rd(Fd(e || ""));
}
function Ld(e) {
	return e ? e[0].toUpperCase() + e.slice(1) : "";
}
function Rd(e) {
	return e ? e[0].toLowerCase() + e.slice(1) : "";
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/css-to-style-obj.js
function zd(e) {
	if (!e) return {};
	let t = {};
	function n(e, n) {
		if (e.startsWith("-moz-") || e.startsWith("-webkit-") || e.startsWith("-ms-") || e.startsWith("-o-")) {
			t[Fd(e)] = n;
			return;
		}
		if (e.startsWith("--")) {
			t[e] = n;
			return;
		}
		t[Id(e)] = n;
	}
	return Ad(e, n), t;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/execute-callbacks.js
function Bd(...e) {
	return (...t) => {
		for (let n of e) typeof n == "function" && n(...t);
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/style-to-css.js
function Vd(e, t) {
	let n = RegExp(e, "g");
	return (e) => {
		if (typeof e != "string") throw TypeError(`expected an argument of type string, but got ${typeof e}`);
		return e.match(n) ? e.replace(n, t) : e;
	};
}
var Hd = Vd(/[A-Z]/, (e) => `-${e.toLowerCase()}`);
function Ud(e) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw TypeError(`expected an argument of type object, but got ${typeof e}`);
	return Object.keys(e).map((t) => `${Hd(t)}: ${e[t]};`).join("\n");
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/style.js
function Wd(e = {}) {
	return Ud(e).replace("\n", " ");
}
var Gd = new Set(/* @__PURE__ */ "onabort.onanimationcancel.onanimationend.onanimationiteration.onanimationstart.onauxclick.onbeforeinput.onbeforetoggle.onblur.oncancel.oncanplay.oncanplaythrough.onchange.onclick.onclose.oncompositionend.oncompositionstart.oncompositionupdate.oncontextlost.oncontextmenu.oncontextrestored.oncopy.oncuechange.oncut.ondblclick.ondrag.ondragend.ondragenter.ondragleave.ondragover.ondragstart.ondrop.ondurationchange.onemptied.onended.onerror.onfocus.onfocusin.onfocusout.onformdata.ongotpointercapture.oninput.oninvalid.onkeydown.onkeypress.onkeyup.onload.onloadeddata.onloadedmetadata.onloadstart.onlostpointercapture.onmousedown.onmouseenter.onmouseleave.onmousemove.onmouseout.onmouseover.onmouseup.onpaste.onpause.onplay.onplaying.onpointercancel.onpointerdown.onpointerenter.onpointerleave.onpointermove.onpointerout.onpointerover.onpointerup.onprogress.onratechange.onreset.onresize.onscroll.onscrollend.onsecuritypolicyviolation.onseeked.onseeking.onselect.onselectionchange.onselectstart.onslotchange.onstalled.onsubmit.onsuspend.ontimeupdate.ontoggle.ontouchcancel.ontouchend.ontouchmove.ontouchstart.ontransitioncancel.ontransitionend.ontransitionrun.ontransitionstart.onvolumechange.onwaiting.onwebkitanimationend.onwebkitanimationiteration.onwebkitanimationstart.onwebkittransitionend.onwheel".split("."));
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/merge-props.js
function Kd(e) {
	return Gd.has(e);
}
function qd(...e) {
	let t = { ...e[0] };
	for (let n = 1; n < e.length; n++) {
		let r = e[n];
		if (r) {
			for (let e of Object.keys(r)) {
				let n = t[e], i = r[e], a = typeof n == "function", o = typeof i == "function";
				if (a && typeof o && Kd(e)) t[e] = pd(n, i);
				else if (a && o) t[e] = Bd(n, i);
				else if (e === "class") {
					let r = rd(n), a = rd(i);
					r && a ? t[e] = Ci(n, i) : r ? t[e] = Ci(n) : a && (t[e] = Ci(i));
				} else if (e === "style") {
					let r = typeof n == "object", a = typeof i == "object", o = typeof n == "string", s = typeof i == "string";
					if (r && a) t[e] = {
						...n,
						...i
					};
					else if (r && s) {
						let r = zd(i);
						t[e] = {
							...n,
							...r
						};
					} else if (o && a) t[e] = {
						...zd(n),
						...i
					};
					else if (o && s) {
						let r = zd(n), a = zd(i);
						t[e] = {
							...r,
							...a
						};
					} else r ? t[e] = n : a ? t[e] = i : o ? t[e] = n : s && (t[e] = i);
				} else t[e] = i === void 0 ? n : i;
			}
			for (let e of Object.getOwnPropertySymbols(r)) {
				let n = t[e], i = r[e];
				t[e] = i === void 0 ? n : i;
			}
		}
	}
	return typeof t.style == "object" && (t.style = Wd(t.style).replaceAll("\n", " ")), t.hidden === !1 && (t.hidden = void 0, delete t.hidden), t.disabled === !1 && (t.disabled = void 0, delete t.disabled), t;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/internal/configurable-globals.js
var Jd = typeof window < "u" ? window : void 0;
typeof window < "u" && window.document, typeof window < "u" && window.navigator, typeof window < "u" && window.location;
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/internal/utils/dom.js
function Yd(e) {
	let t = e.activeElement;
	for (; t?.shadowRoot;) {
		let e = t.shadowRoot.activeElement;
		if (e === t) break;
		t = e;
	}
	return t;
}
new class {
	#e;
	#t;
	constructor(e = {}) {
		let { window: t = Jd, document: n = t?.document } = e;
		t !== void 0 && (this.#e = n, this.#t = qr((e) => {
			let n = Tr(t, "focusin", e), r = Tr(t, "focusout", e);
			return () => {
				n(), r();
			};
		}));
	}
	get current() {
		return this.#t?.(), this.#e ? Yd(this.#e) : null;
	}
}();
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/internal/utils/is.js
function Xd(e) {
	return typeof e == "function";
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/utilities/context/context.js
var Zd = class {
	#e;
	#t;
	constructor(e) {
		this.#e = e, this.#t = Symbol(e);
	}
	get key() {
		return this.#t;
	}
	exists() {
		return Ge(this.#t);
	}
	get() {
		let e = Ue(this.#t);
		if (e === void 0) throw Error(`Context "${this.#e}" not found`);
		return e;
	}
	getOr(e) {
		let t = Ue(this.#t);
		return t === void 0 ? e : t;
	}
	set(e) {
		return We(this.#t, e);
	}
};
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/utilities/watch/watch.svelte.js
function Qd(e, t) {
	switch (e) {
		case "post":
			wn(t);
			break;
		case "pre": En(t);
	}
}
function $d(e, t, n, r = {}) {
	let { lazy: i = !1 } = r, a = !i, o = Array.isArray(e) ? [] : void 0;
	Qd(t, () => {
		let t = Array.isArray(e) ? e.map((e) => e()) : e();
		if (!a) {
			a = !0, o = t;
			return;
		}
		let r = br(() => n(t, o));
		return o = t, r;
	});
}
function ef(e, t, n) {
	$d(e, "post", t, n);
}
function tf(e, t, n) {
	$d(e, "pre", t, n);
}
ef.pre = tf;
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/internal/utils/get.js
function nf(e) {
	return Xd(e) ? e() : e;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/runed@0.35.1+49047e9ce348abe8-bb683a36dc301623/node_modules/runed/dist/utilities/element-size/element-size.svelte.js
var rf = class {
	#e = {
		width: 0,
		height: 0
	};
	#t = !1;
	#n;
	#r;
	#i;
	#a = /* @__PURE__ */ F(() => (H(this.#s)?.(), this.getSize().width));
	#o = /* @__PURE__ */ F(() => (H(this.#s)?.(), this.getSize().height));
	#s = /* @__PURE__ */ F(() => {
		let e = nf(this.#r);
		if (e) return qr((t) => {
			if (!this.#i) return;
			let n = new this.#i.ResizeObserver((e) => {
				this.#t = !0;
				for (let t of e) {
					let e = this.#n.box === "content-box" ? t.contentBoxSize : t.borderBoxSize, n = Array.isArray(e) ? e : [e];
					this.#e.width = n.reduce((e, t) => Math.max(e, t.inlineSize), 0), this.#e.height = n.reduce((e, t) => Math.max(e, t.blockSize), 0);
				}
				t();
			});
			return n.observe(e), () => {
				this.#t = !1, n.disconnect();
			};
		});
	});
	constructor(e, t = { box: "border-box" }) {
		this.#i = t.window ?? Jd, this.#n = t, this.#r = e, this.#e = {
			width: 0,
			height: 0
		};
	}
	calculateSize() {
		let e = nf(this.#r);
		if (!e || !this.#i) return;
		let t = e.offsetWidth, n = e.offsetHeight;
		if (this.#n.box === "border-box") return {
			width: t,
			height: n
		};
		let r = this.#i.getComputedStyle(e), i = parseFloat(r.paddingLeft) + parseFloat(r.paddingRight), a = parseFloat(r.paddingTop) + parseFloat(r.paddingBottom), o = parseFloat(r.borderLeftWidth) + parseFloat(r.borderRightWidth), s = parseFloat(r.borderTopWidth) + parseFloat(r.borderBottomWidth);
		return {
			width: t - i - o,
			height: n - a - s
		};
	}
	getSize() {
		return this.#t ? this.#e : this.calculateSize() ?? this.#e;
	}
	get current() {
		return H(this.#s)?.(), this.getSize();
	}
	get width() {
		return H(this.#a);
	}
	get height() {
		return H(this.#o);
	}
};
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/on-destroy-effect.svelte.js
function af(e) {
	wn(() => () => {
		e();
	});
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/after-tick.js
function of(e) {
	_r().then(e);
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/dom.js
var sf = 1, cf = 9, lf = 11;
function uf(e) {
	return td(e) && e.nodeType === sf && typeof e.nodeName == "string";
}
function df(e) {
	return td(e) && e.nodeType === cf;
}
function ff(e) {
	return td(e) && e.constructor?.name === "VisualViewport";
}
function pf(e) {
	return td(e) && e.nodeType !== void 0;
}
function mf(e) {
	return pf(e) && e.nodeType === lf && "host" in e;
}
function hf(e, t) {
	if (!e || !t || !uf(e) || !uf(t)) return !1;
	let n = t.getRootNode?.();
	if (e === t || e.contains(t)) return !0;
	if (n && mf(n)) {
		let n = t;
		for (; n;) {
			if (e === n) return !0;
			n = n.parentNode || n.host;
		}
	}
	return !1;
}
function gf(e) {
	return df(e) ? e : ff(e) ? e.document : e?.ownerDocument ?? document;
}
function _f(e) {
	return mf(e) ? _f(e.host) : df(e) ? e.defaultView ?? window : uf(e) ? e.ownerDocument?.defaultView ?? window : window;
}
function vf(e) {
	let t = e.activeElement;
	for (; t?.shadowRoot;) {
		let e = t.shadowRoot.activeElement;
		if (e === t) break;
		t = e;
	}
	return t;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/dom-context.svelte.js
var yf = class {
	element;
	#e = /* @__PURE__ */ F(() => this.element.current ? this.element.current.getRootNode() ?? document : document);
	get root() {
		return H(this.#e);
	}
	set root(e) {
		R(this.#e, e);
	}
	constructor(e) {
		this.element = typeof e == "function" ? Q(e) : e;
	}
	getDocument = () => gf(this.root);
	getWindow = () => this.getDocument().defaultView ?? window;
	getActiveElement = () => vf(this.root);
	isActiveElement = (e) => e === this.getActiveElement();
	getElementById(e) {
		return this.root.getElementById(e);
	}
	querySelector = (e) => this.root ? this.root.querySelector(e) : null;
	querySelectorAll = (e) => this.root ? this.root.querySelectorAll(e) : [];
	setTimeout = (e, t) => this.getWindow().setTimeout(e, t);
	clearTimeout = (e) => this.getWindow().clearTimeout(e);
};
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/svelte-toolbelt@0.10.6+49047e9ce348abe8-dbcfe568d6bf89fc/node_modules/svelte-toolbelt/dist/utils/attach-ref.js
function bf(e, t) {
	return { [oi()]: (n) => od(e) ? (e.current = n, br(() => t?.(n)), () => {
		"isConnected" in n && n.isConnected || (e.current = null, t?.(null));
	}) : (e(n), br(() => t?.(n)), () => {
		"isConnected" in n && n.isConnected || (e(null), t?.(null));
	}) };
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/attrs.js
function xf(e) {
	return e ? "open" : "closed";
}
function Sf(e) {
	return e === "starting" ? { "data-starting-style": "" } : e === "ending" ? { "data-ending-style": "" } : {};
}
var Cf = class {
	#e;
	#t;
	attrs;
	constructor(e) {
		this.#e = e.getVariant ? e.getVariant() : null, this.#t = this.#e ? `data-${this.#e}-` : `data-${e.component}-`, this.getAttr = this.getAttr.bind(this), this.selector = this.selector.bind(this), this.attrs = Object.fromEntries(e.parts.map((e) => [e, this.getAttr(e)]));
	}
	getAttr(e, t) {
		return t ? `data-${t}-${e}` : `${this.#t}${e}`;
	}
	selector(e, t) {
		return `[${this.getAttr(e, t)}]`;
	}
};
function wf(e) {
	let t = new Cf(e);
	return {
		...t.attrs,
		selector: t.selector,
		getAttr: t.getAttr
	};
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/kbd-constants.js
var Tf = "ArrowDown", Ef = "ArrowLeft", Df = "ArrowRight", Of = "ArrowUp", kf = "Enter", Af = "Home", jf = "PageDown", Mf = "PageUp";
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/locale.js
function Nf(e) {
	return window.getComputedStyle(e).getPropertyValue("direction");
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/get-directional-keys.js
var Pf = [
	Tf,
	Mf,
	Af
], Ff = [
	Of,
	jf,
	"End"
];
[...Pf, ...Ff];
function If(e = "ltr", t = "horizontal") {
	return {
		horizontal: e === "rtl" ? Ef : Df,
		vertical: Tf
	}[t];
}
function Lf(e = "ltr", t = "horizontal") {
	return {
		horizontal: e === "rtl" ? Df : Ef,
		vertical: Of
	}[t];
}
function Rf(e = "ltr", t = "horizontal") {
	return ["ltr", "rtl"].includes(e) || (e = "ltr"), ["horizontal", "vertical"].includes(t) || (t = "horizontal"), {
		nextKey: If(e, t),
		prevKey: Lf(e, t)
	};
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/is.js
var zf = typeof document < "u", Bf = Vf();
function Vf() {
	return zf && window?.navigator?.userAgent && (/iP(ad|hone|od)/.test(window.navigator.userAgent) || window?.navigator?.maxTouchPoints > 2 && /iPad|Macintosh/.test(window?.navigator.userAgent));
}
function Hf(e) {
	return e instanceof HTMLElement;
}
function Uf(e) {
	return e instanceof Element;
}
function Wf(e) {
	return e instanceof Element || e instanceof SVGElement;
}
function Gf(e) {
	return e.pointerType === "touch";
}
function Kf(e) {
	return e !== null;
}
function qf(e) {
	return e instanceof HTMLInputElement && "select" in e;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/roving-focus-group.js
var Jf = class {
	#e;
	#t = fd(null);
	constructor(e) {
		this.#e = e;
	}
	getCandidateNodes() {
		return this.#e.rootNode.current ? this.#e.candidateSelector ? Array.from(this.#e.rootNode.current.querySelectorAll(this.#e.candidateSelector)) : this.#e.candidateAttr ? Array.from(this.#e.rootNode.current.querySelectorAll(`[${this.#e.candidateAttr}]:not([data-disabled])`)) : [] : [];
	}
	focusFirstCandidate() {
		let e = this.getCandidateNodes();
		e.length && e[0]?.focus();
	}
	handleKeydown(e, t, n = !1) {
		let r = this.#e.rootNode.current;
		if (!r || !e) return;
		let i = this.getCandidateNodes();
		if (!i.length) return;
		let a = i.indexOf(e), { nextKey: o, prevKey: s } = Rf(Nf(r), this.#e.orientation.current), c = this.#e.loop.current, l = {
			[o]: a + 1,
			[s]: a - 1,
			[Af]: 0,
			End: i.length - 1
		};
		if (n) {
			let e = o === "ArrowDown" ? Df : Tf, t = s === "ArrowUp" ? Ef : Of;
			l[e] = a + 1, l[t] = a - 1;
		}
		let u = l[t.key];
		if (u === void 0) return;
		t.preventDefault(), u < 0 && c ? u = i.length - 1 : u === i.length && c && (u = 0);
		let d = i[u];
		if (d) return d.focus(), this.#t.current = d.id, this.#e.onCandidateFocus?.(d), d;
	}
	getTabIndex(e) {
		let t = this.getCandidateNodes(), n = this.#t.current !== null;
		return e && !n && t[0] === e ? (this.#t.current = e.id, 0) : e?.id === this.#t.current ? 0 : -1;
	}
	setCurrentTabStopId(e) {
		this.#t.current = e;
	}
	focusCurrentTabStop() {
		let e = this.#t.current;
		if (!e) return;
		let t = this.#e.rootNode.current?.querySelector(`#${e}`);
		t && Hf(t) && t.focus();
	}
}, Yf = class {
	#e;
	#t = null;
	#n = null;
	#r = 0;
	constructor(e) {
		this.#e = e, af(() => this.#i());
	}
	#i() {
		this.#t !== null && (window.cancelAnimationFrame(this.#t), this.#t = null), this.#n?.disconnect(), this.#n = null, this.#r++;
	}
	run(e) {
		this.#i();
		let t = this.#e.ref.current;
		if (!t) return;
		if (typeof t.getAnimations != "function") {
			this.#a(e);
			return;
		}
		let n = this.#r, r = () => {
			n === this.#r && this.#a(e);
		}, i = () => {
			if (n !== this.#r) return;
			let e = t.getAnimations();
			if (e.length === 0) {
				r();
				return;
			}
			Promise.all(e.map((e) => e.finished)).then(() => {
				r();
			}).catch(() => {
				if (n === this.#r) {
					if (t.getAnimations().some((e) => e.pending || e.playState !== "finished")) {
						i();
						return;
					}
					r();
				}
			});
		}, a = () => {
			this.#t = window.requestAnimationFrame(() => {
				this.#t = null, i();
			});
		};
		if (!this.#e.afterTick.current) {
			a();
			return;
		}
		this.#t = window.requestAnimationFrame(() => {
			this.#t = null;
			let e = "data-starting-style";
			if (!t.hasAttribute(e)) {
				a();
				return;
			}
			this.#n = new MutationObserver(() => {
				n === this.#r && (t.hasAttribute(e) || (this.#n?.disconnect(), this.#n = null, a()));
			}), this.#n.observe(t, {
				attributes: !0,
				attributeFilter: [e]
			});
		});
	}
	#a(e) {
		let t = () => {
			e();
		};
		this.#e.afterTick ? of(t) : t();
	}
}, Xf = class {
	#e;
	#t;
	#n;
	#r = /* @__PURE__ */ L(!1);
	#i = /* @__PURE__ */ L(void 0);
	#a = !1;
	#o = null;
	constructor(e) {
		this.#e = e, R(this.#r, e.open.current, !0), this.#t = e.enabled ?? !0, this.#n = new Yf({
			ref: this.#e.ref,
			afterTick: this.#e.open
		}), af(() => this.#s()), ef(() => this.#e.open.current, (e) => {
			if (!this.#a) {
				this.#a = !0;
				return;
			}
			if (this.#s(), !e && this.#e.shouldSkipExitAnimation?.()) {
				R(this.#r, !1), R(this.#i, void 0), this.#e.onComplete?.();
				return;
			}
			if (e && R(this.#r, !0), R(this.#i, e ? "starting" : "ending", !0), e && (this.#o = window.requestAnimationFrame(() => {
				this.#o = null, this.#e.open.current && R(this.#i, void 0);
			})), !this.#t) {
				e || R(this.#r, !1), R(this.#i, void 0), this.#e.onComplete?.();
				return;
			}
			this.#n.run(() => {
				e === this.#e.open.current && (this.#e.open.current || R(this.#r, !1), R(this.#i, void 0), this.#e.onComplete?.());
			});
		});
	}
	get shouldRender() {
		return H(this.#r);
	}
	get transitionStatus() {
		return H(this.#i);
	}
	#s() {
		this.#o !== null && (window.cancelAnimationFrame(this.#o), this.#o = null);
	}
};
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/noop.js
function Zf() {}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/create-id.js
function Qf(e, t) {
	return t === void 0 ? `bits-${e}` : `bits-${e}-${t}`;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/portal/portal-consumer.svelte
function $f(e, t) {
	var n = U();
	li(z(n), () => t.children, (e) => {
		var n = U();
		ii(z(n), () => t.children ?? g), W(e, n);
	}), W(e, n);
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/config/bits-config.js
var ep = new Zd("BitsConfig");
function tp() {
	let e = new np(null, {});
	return ep.getOr(e).opts;
}
var np = class {
	opts;
	constructor(e, t) {
		let n = rp(e, t);
		this.opts = {
			defaultPortalTo: n((e) => e.defaultPortalTo),
			defaultLocale: n((e) => e.defaultLocale)
		};
	}
};
function rp(e, t) {
	return (n) => Q(() => {
		let r = n(t)?.current;
		if (r !== void 0) return r;
		if (e !== null) return n(e.opts)?.current;
	});
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/config/prop-resolvers.js
function ip(e, t) {
	return (n) => {
		let r = tp();
		return Q(() => {
			let i = n();
			if (i !== void 0) return i;
			let a = e(r).current;
			return a === void 0 ? t : a;
		});
	};
}
var ap = ip((e) => e.defaultPortalTo, "body");
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/portal/portal.svelte
function op(e, t) {
	qe(t, !0);
	let n = ap(() => t.to), r = Ke(), i = /* @__PURE__ */ F(a);
	function a() {
		if (!zf || t.disabled) return null;
		let e = null;
		return e = typeof n.current == "string" ? document.querySelector(n.current) : n.current, e;
	}
	let o;
	function s() {
		o &&= (ni(o), null);
	}
	ef([() => H(i), () => t.disabled], ([e, n]) => {
		if (!e || n) {
			s();
			return;
		}
		return o = Qr($f, {
			target: e,
			props: { children: t.children },
			context: r
		}), () => {
			s();
		};
	});
	var c = U(), l = z(c), u = (e) => {
		var n = U();
		ii(z(n), () => t.children ?? g), W(e, n);
	};
	si(l, (e) => {
		t.disabled && e(u);
	}), W(e, c), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/events.js
var sp = class {
	eventName;
	options;
	constructor(e, t = {
		bubbles: !0,
		cancelable: !0
	}) {
		this.eventName = e, this.options = t;
	}
	createEvent(e) {
		return new CustomEvent(this.eventName, {
			...this.options,
			detail: e
		});
	}
	dispatch(e, t) {
		let n = this.createEvent(t);
		return e.dispatchEvent(n), n;
	}
	listen(e, t, n) {
		return Tr(e, this.eventName, (e) => {
			t(e);
		}, n);
	}
};
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/debounce.js
function cp(e, t = 500) {
	let n = null, r = (...r) => {
		n !== null && clearTimeout(n), n = setTimeout(() => {
			e(...r);
		}, t);
	};
	return r.destroy = () => {
		n !== null && (clearTimeout(n), n = null);
	}, r;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/elements.js
function lp(e, t) {
	return e === t || e.contains(t);
}
function up(e) {
	return e?.ownerDocument ?? document;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/dom.js
function dp(e, t) {
	let { clientX: n, clientY: r } = e, i = t.getBoundingClientRect();
	return n < i.left || n > i.right || r < i.top || r > i.bottom;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/menu/context-menu-attributes.js
var fp = "data-context-menu-trigger", pp = "data-context-menu-content";
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/dismissible-layer/use-dismissable-layer.svelte.js
globalThis.bitsDismissableLayers ??= /* @__PURE__ */ new Map();
var mp = class e {
	static create(t) {
		return new e(t);
	}
	opts;
	#e;
	#t;
	#n = { pointerdown: !1 };
	#r = !1;
	#i = null;
	#a = !1;
	#o = void 0;
	#s;
	#c = Zf;
	#l = !1;
	constructor(e) {
		this.opts = e, this.#t = e.interactOutsideBehavior, this.#e = e.onInteractOutside, this.#s = e.onFocusOutside;
		let t = Zf, n = null, r = () => {
			n = null, this.#y(), globalThis.bitsDismissableLayers.delete(this), this.#m.destroy(), this.#c(), t();
		};
		ef([() => this.opts.enabled.current, () => this.opts.ref.current], ([e, i]) => {
			let a = e ? i : null;
			n !== a && (r(), a && (n = a, this.#o = up(a), globalThis.bitsDismissableLayers.set(this, this.#t), t = this.#d()));
		}), af(() => {
			this.#l = !0, r();
		});
	}
	#u = (e) => {
		e.defaultPrevented || this.#l || !this.opts.ref.current || of(() => {
			this.#l || this.opts.ref.current && !this.#v(e.target) && e.target && !this.#a && this.#s.current?.(e);
		});
	};
	#d() {
		let e = this.#o, t = (e) => {
			br(() => {
				this.#h(e), this.#_(e);
			});
		}, n = (e) => {
			e.cancelBubble || e !== this.#i || (this.#g(e), e.pointerType === "touch" ? (this.#m.destroy(), this.#p(e)) : this.#m(e));
		};
		return e.addEventListener("pointerdown", t, !0), e.addEventListener("pointerdown", n), Bd(() => e.removeEventListener("pointerdown", t, !0), () => e.removeEventListener("pointerdown", n), Tr(e, "focusin", this.#u));
	}
	#f = (e) => {
		let t = e;
		t.defaultPrevented && (t = vp(e)), this.#e.current(t);
	};
	#p = (e) => {
		if (!this.opts.ref.current) {
			this.#c();
			return;
		}
		let t = this.opts.isValidEvent.current(e, this.opts.ref.current) || _p(e, this.opts.ref.current);
		if (!this.#r || this.#b() || !t) {
			this.#c();
			return;
		}
		let n = e;
		if (n.defaultPrevented && (n = vp(n)), this.#t.current !== "close" && this.#t.current !== "defer-otherwise-close") {
			this.#c();
			return;
		}
		if (e.pointerType === "touch") {
			this.#c();
			let e = null, t = Zf, n = (e) => {
				t(), this.#f(e);
			};
			t = Bd(Tr(this.#o, "click", n, { once: !0 }), Tr(this.#o, "click", (t) => {
				e = setTimeout(() => n(t), 0);
			}, {
				once: !0,
				capture: !0
			}), () => {
				e !== null && clearTimeout(e), e = null;
			}), this.#c = t;
		} else this.#e.current(n);
	};
	#m = cp(this.#p, 10);
	#h = (e) => {
		this.#n[e.type] = !0;
	};
	#g = (e) => {
		this.#n[e.type] = !1;
	};
	#_ = (e) => {
		this.#i = e, this.opts.ref.current && (this.#r = gp(this.opts.ref.current));
	};
	#v = (e) => this.opts.ref.current ? lp(this.opts.ref.current, e) : !1;
	#y = () => {
		for (let e in this.#n) this.#n[e] = !1;
		this.#r = !1, this.#i = null;
	};
	#b() {
		return Object.values(this.#n).some(Boolean);
	}
	#x = () => {
		this.#a = !0;
	};
	#S = () => {
		this.#a = !1;
	};
	props = {
		onfocuscapture: this.#x,
		onblurcapture: this.#S
	};
};
function hp(e = [...globalThis.bitsDismissableLayers]) {
	return e.findLast(([e, { current: t }]) => t === "close" || t === "ignore");
}
function gp(e) {
	let t = [...globalThis.bitsDismissableLayers], n = hp(t);
	if (n) return n[0].opts.ref.current === e;
	let [r] = t[0];
	return r.opts.ref.current === e;
}
function _p(e, t) {
	let n = e.target;
	if (!Wf(n)) return !1;
	let r = !!n.closest(`[${fp}]`), i = !!t.closest(`[${pp}]`);
	return "button" in e && e.button > 0 && !r ? !1 : "button" in e && e.button === 0 && r && i ? !0 : r && i ? !1 : up(n).documentElement.contains(n) && !lp(t, n) && dp(e, t);
}
function vp(e) {
	let t = e.currentTarget, n = e.target, r;
	r = e instanceof PointerEvent ? new PointerEvent(e.type, e) : new PointerEvent("pointerdown", e);
	let i = !1;
	return new Proxy(r, { get: (r, a) => a === "currentTarget" ? t : a === "target" ? n : a === "preventDefault" ? () => {
		i = !0, typeof r.preventDefault == "function" && r.preventDefault();
	} : a === "defaultPrevented" ? i : a in r ? r[a] : e[a] });
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/dismissible-layer/dismissible-layer.svelte
function yp(e, t) {
	qe(t, !0);
	let n = G(t, "interactOutsideBehavior", 3, "close"), r = G(t, "onInteractOutside", 3, Zf), i = G(t, "onFocusOutside", 3, Zf), a = G(t, "isValidEvent", 3, () => !1), o = mp.create({
		id: Q(() => t.id),
		interactOutsideBehavior: Q(() => n()),
		onInteractOutside: Q(() => r()),
		enabled: Q(() => t.enabled),
		onFocusOutside: Q(() => i()),
		isValidEvent: Q(() => a()),
		ref: t.ref
	});
	var s = U();
	ii(z(s), () => t.children ?? g, () => ({ props: o.props })), W(e, s), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/escape-layer/use-escape-layer.svelte.js
globalThis.bitsEscapeLayers ??= /* @__PURE__ */ new Map();
var bp = class e {
	static create(t) {
		return new e(t);
	}
	opts;
	domContext;
	constructor(e) {
		this.opts = e, this.domContext = new yf(this.opts.ref);
		let t = Zf;
		ef(() => e.enabled.current, (n) => (n && (globalThis.bitsEscapeLayers.set(this, e.escapeKeydownBehavior), t = this.#e()), () => {
			t(), globalThis.bitsEscapeLayers.delete(this);
		}));
	}
	#e = () => Tr(this.domContext.getDocument(), "keydown", this.#t, { passive: !1 });
	#t = (e) => {
		if (e.key !== "Escape" || !xp(this)) return;
		let t = new KeyboardEvent(e.type, e);
		e.preventDefault();
		let n = this.opts.escapeKeydownBehavior.current;
		(n === "close" || n === "defer-otherwise-close") && this.opts.onEscapeKeydown.current(t);
	};
};
function xp(e) {
	let t = [...globalThis.bitsEscapeLayers], n = t.findLast(([e, { current: t }]) => t === "close" || t === "ignore");
	if (n) return n[0] === e;
	let [r] = t[0];
	return r === e;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/escape-layer/escape-layer.svelte
function Sp(e, t) {
	qe(t, !0);
	let n = G(t, "escapeKeydownBehavior", 3, "close"), r = G(t, "onEscapeKeydown", 3, Zf);
	bp.create({
		escapeKeydownBehavior: Q(() => n()),
		onEscapeKeydown: Q(() => r()),
		enabled: Q(() => t.enabled),
		ref: t.ref
	});
	var i = U();
	ii(z(i), () => t.children ?? g), W(e, i), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/focus-scope/focus-scope-manager.js
var Cp = class e {
	static instance;
	#e = dd([]);
	#t = /* @__PURE__ */ new WeakMap();
	#n = /* @__PURE__ */ new WeakMap();
	static getInstance() {
		return this.instance ||= new e(), this.instance;
	}
	register(e) {
		let t = this.getActive();
		t && t !== e && t.pause();
		let n = vf(document);
		n && n !== document.body && this.#n.set(e, n), this.#e.current = this.#e.current.filter((t) => t !== e), this.#e.current.unshift(e);
	}
	unregister(e) {
		this.#e.current = this.#e.current.filter((t) => t !== e);
		let t = this.getActive();
		t && t.resume();
	}
	getActive() {
		return this.#e.current[0];
	}
	setFocusMemory(e, t) {
		this.#t.set(e, t);
	}
	getFocusMemory(e) {
		return this.#t.get(e);
	}
	isActiveScope(e) {
		return this.getActive() === e;
	}
	setPreFocusMemory(e, t) {
		this.#n.set(e, t);
	}
	getPreFocusMemory(e) {
		return this.#n.get(e);
	}
	clearPreFocusMemory(e) {
		this.#n.delete(e);
	}
}, wp = [
	"input:not([inert]):not([inert] *)",
	"select:not([inert]):not([inert] *)",
	"textarea:not([inert]):not([inert] *)",
	"a[href]:not([inert]):not([inert] *)",
	"area[href]:not([inert]):not([inert] *)",
	"button:not([inert]):not([inert] *)",
	"[tabindex]:not(slot):not([inert]):not([inert] *)",
	"audio[controls]:not([inert]):not([inert] *)",
	"video[controls]:not([inert]):not([inert] *)",
	"[contenteditable]:not([contenteditable=\"false\"]):not([inert]):not([inert] *)",
	"details>summary:first-of-type:not([inert]):not([inert] *)",
	"details:not([inert]):not([inert] *)"
], Tp = /* #__PURE__ */ wp.join(","), Ep = typeof Element > "u", Dp = Ep ? function() {} : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector, Op = !Ep && Element.prototype.getRootNode ? function(e) {
	return e?.getRootNode?.call(e);
} : function(e) {
	return e?.ownerDocument;
}, kp = function(e, t) {
	t === void 0 && (t = !0);
	var n = e?.getAttribute?.call(e, "inert");
	return n === "" || n === "true" || t && e && (typeof e.closest == "function" ? e.closest("[inert]") : kp(e.parentNode));
}, Ap = function(e) {
	var t = e?.getAttribute?.call(e, "contenteditable");
	return t === "" || t === "true";
}, jp = function(e, t, n) {
	if (kp(e)) return [];
	var r = Array.prototype.slice.apply(e.querySelectorAll(Tp));
	return t && Dp.call(e, Tp) && r.unshift(e), r = r.filter(n), r;
}, Mp = function(e, t, n) {
	for (var r = [], i = Array.from(e); i.length;) {
		var a = i.shift();
		if (!kp(a, !1)) {
			if (a.tagName === "SLOT") {
				var o = a.assignedElements(), s = Mp(o.length ? o : a.children, !0, n);
				n.flatten ? r.push.apply(r, s) : r.push({
					scopeParent: a,
					candidates: s
				});
			} else {
				Dp.call(a, Tp) && n.filter(a) && (t || !e.includes(a)) && r.push(a);
				var c = a.shadowRoot || typeof n.getShadowRoot == "function" && n.getShadowRoot(a), l = !kp(c, !1) && (!n.shadowRootFilter || n.shadowRootFilter(a));
				if (c && l) {
					var u = Mp(c === !0 ? a.children : c.children, !0, n);
					n.flatten ? r.push.apply(r, u) : r.push({
						scopeParent: a,
						candidates: u
					});
				} else i.unshift.apply(i, a.children);
			}
		}
	}
	return r;
}, Np = function(e) {
	return !isNaN(parseInt(e.getAttribute("tabindex"), 10));
}, Pp = function(e) {
	if (!e) throw Error("No node provided");
	return e.tabIndex < 0 && (/^(AUDIO|VIDEO|DETAILS)$/.test(e.tagName) || Ap(e)) && !Np(e) ? 0 : e.tabIndex;
}, Fp = function(e, t) {
	var n = Pp(e);
	return n < 0 && t && !Np(e) ? 0 : n;
}, Ip = function(e, t) {
	return e.tabIndex === t.tabIndex ? e.documentOrder - t.documentOrder : e.tabIndex - t.tabIndex;
}, Lp = function(e) {
	return e.tagName === "INPUT";
}, Rp = function(e) {
	return Lp(e) && e.type === "hidden";
}, zp = function(e) {
	return e.tagName === "DETAILS" && Array.prototype.slice.apply(e.children).some(function(e) {
		return e.tagName === "SUMMARY";
	});
}, Bp = function(e, t) {
	for (var n = 0; n < e.length; n++) if (e[n].checked && e[n].form === t) return e[n];
}, Vp = function(e) {
	if (!e.name) return !0;
	var t = e.form || Op(e), n = function(e) {
		return t.querySelectorAll("input[type=\"radio\"][name=\"" + e + "\"]");
	}, r;
	if (typeof window < "u" && window.CSS !== void 0 && typeof window.CSS.escape == "function") r = n(window.CSS.escape(e.name));
	else try {
		r = n(e.name);
	} catch (e) {
		return console.error("Looks like you have a radio button with a name attribute containing invalid CSS selector characters and need the CSS.escape polyfill: %s", e.message), !1;
	}
	var i = Bp(r, e.form);
	return !i || i === e;
}, Hp = function(e) {
	return Lp(e) && e.type === "radio";
}, Up = function(e) {
	return Hp(e) && !Vp(e);
}, Wp = function(e) {
	var t = e && Op(e), n = t?.host, r = !1;
	if (t && t !== e) {
		var i, a, o;
		for (r = !!((i = n) != null && (a = i.ownerDocument) != null && a.contains(n) || e != null && (o = e.ownerDocument) != null && o.contains(e)); !r && n;) {
			var s, c;
			t = Op(n), n = t?.host, r = !!((s = n) != null && (c = s.ownerDocument) != null && c.contains(n));
		}
	}
	return r;
}, Gp = function(e) {
	var t = e.getBoundingClientRect(), n = t.width, r = t.height;
	return n === 0 && r === 0;
}, Kp = function(e, t) {
	var n = t.displayCheck, r = t.getShadowRoot;
	if (n === "full-native" && "checkVisibility" in e) return !e.checkVisibility({
		checkOpacity: !1,
		opacityProperty: !1,
		contentVisibilityAuto: !0,
		visibilityProperty: !0,
		checkVisibilityCSS: !0
	});
	var i = getComputedStyle(e).visibility;
	if (i === "hidden" || i === "collapse") return !0;
	var a = Dp.call(e, "details>summary:first-of-type") ? e.parentElement : e;
	if (Dp.call(a, "details:not([open]) *")) return !0;
	if (!n || n === "full" || n === "full-native" || n === "legacy-full") {
		if (typeof r == "function") {
			for (var o = e; e;) {
				var s = e.parentElement, c = Op(e);
				if (s && !s.shadowRoot && r(s) === !0) return Gp(e);
				e = e.assignedSlot ? e.assignedSlot : !s && c !== e.ownerDocument ? c.host : s;
			}
			e = o;
		}
		if (Wp(e)) return !e.getClientRects().length;
		if (n !== "legacy-full") return !0;
	} else if (n === "non-zero-area") return Gp(e);
	return !1;
}, qp = function(e) {
	if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(e.tagName)) for (var t = e.parentElement; t;) {
		if (t.tagName === "FIELDSET" && t.disabled) {
			for (var n = 0; n < t.children.length; n++) {
				var r = t.children.item(n);
				if (r.tagName === "LEGEND") return Dp.call(t, "fieldset[disabled] *") ? !0 : !r.contains(e);
			}
			return !0;
		}
		t = t.parentElement;
	}
	return !1;
}, Jp = function(e, t) {
	return !(t.disabled || Rp(t) || Kp(t, e) || zp(t) || qp(t));
}, Yp = function(e, t) {
	return !(Up(t) || Pp(t) < 0 || !Jp(e, t));
}, Xp = function(e) {
	var t = parseInt(e.getAttribute("tabindex"), 10);
	return !!(isNaN(t) || t >= 0);
}, Zp = function(e) {
	var t = [], n = [];
	return e.forEach(function(e, r) {
		var i = !!e.scopeParent, a = i ? e.scopeParent : e, o = Fp(a, i), s = i ? Zp(e.candidates) : a;
		o === 0 ? i ? t.push.apply(t, s) : t.push(a) : n.push({
			documentOrder: r,
			tabIndex: o,
			item: e,
			isScope: i,
			content: s
		});
	}), n.sort(Ip).reduce(function(e, t) {
		return t.isScope ? e.push.apply(e, t.content) : e.push(t.content), e;
	}, []).concat(t);
}, Qp = function(e, t) {
	return t ||= {}, Zp(t.getShadowRoot ? Mp([e], t.includeContainer, {
		filter: Yp.bind(null, t),
		flatten: !1,
		getShadowRoot: t.getShadowRoot,
		shadowRootFilter: Xp
	}) : jp(e, t.includeContainer, Yp.bind(null, t)));
}, $p = function(e, t) {
	return t ||= {}, t.getShadowRoot ? Mp([e], t.includeContainer, {
		filter: Jp.bind(null, t),
		flatten: !0,
		getShadowRoot: t.getShadowRoot
	}) : jp(e, t.includeContainer, Jp.bind(null, t));
}, em = function(e, t) {
	if (t ||= {}, !e) throw Error("No node provided");
	return Dp.call(e, Tp) !== !1 && Yp(t, e);
}, tm = /* #__PURE__ */ wp.concat("iframe:not([inert]):not([inert] *)").join(","), nm = function(e, t) {
	if (t ||= {}, !e) throw Error("No node provided");
	return Dp.call(e, tm) !== !1 && Jp(t, e);
}, rm = class e {
	#e = !1;
	#t = null;
	#n = Cp.getInstance();
	#r = [];
	#i;
	constructor(e) {
		this.#i = e;
	}
	get paused() {
		return this.#e;
	}
	pause() {
		this.#e = !0;
	}
	resume() {
		this.#e = !1;
	}
	#a() {
		for (let e of this.#r) e();
		this.#r = [];
	}
	mount(e) {
		this.#t && this.unmount(), this.#t = e, this.#n.register(this), this.#c(), this.#o();
	}
	unmount() {
		this.#t &&= (this.#a(), this.#s(), this.#n.unregister(this), this.#n.clearPreFocusMemory(this), null);
	}
	#o() {
		if (!this.#t) return;
		let e = new CustomEvent("focusScope.onOpenAutoFocus", {
			bubbles: !1,
			cancelable: !0
		});
		this.#i.onOpenAutoFocus.current(e), e.defaultPrevented || requestAnimationFrame(() => {
			if (!this.#t || this.#e || !this.#n.isActiveScope(this) || this.#t.contains(vf(this.#t.ownerDocument))) return;
			let e = this.#u();
			e ? (e.focus(), this.#n.setFocusMemory(this, e)) : this.#t.focus();
		});
	}
	#s() {
		let e = new CustomEvent("focusScope.onCloseAutoFocus", {
			bubbles: !1,
			cancelable: !0
		});
		if (this.#i.onCloseAutoFocus.current?.(e), !e.defaultPrevented) {
			let e = this.#n.getPreFocusMemory(this);
			if (e && e.isConnected) try {
				e.focus();
			} catch {
				document.body.focus();
			}
		}
	}
	#c() {
		if (!this.#t || !this.#i.trap.current) return;
		let e = this.#t, t = e.ownerDocument;
		this.#r.push(Tr(t, "focusin", (t) => {
			if (this.#e || !this.#n.isActiveScope(this)) return;
			let n = t.composedPath()[0];
			if (n) {
				if (e.contains(n)) this.#n.setFocusMemory(this, n);
				else {
					let n = this.#n.getFocusMemory(this);
					if (n && e.contains(n) && nm(n)) t.preventDefault(), n.focus();
					else {
						let t = this.#u(), n = this.#d()[0];
						(t || n || e).focus();
					}
				}
			}
		}, { capture: !0 }), Tr(e, "keydown", (e) => {
			if (!this.#i.loop || this.#e || e.key !== "Tab" || !this.#n.isActiveScope(this)) return;
			let n = this.#l();
			if (n.length === 0) return;
			let r = n[0], i = n[n.length - 1];
			!e.shiftKey && vf(t) === i ? (e.preventDefault(), r.focus()) : e.shiftKey && vf(t) === r && (e.preventDefault(), i.focus());
		}));
		let n = new MutationObserver(() => {
			let t = this.#n.getFocusMemory(this);
			if (t && !e.contains(t)) {
				let t = this.#u(), n = this.#d()[0], r = t || n;
				r ? (r.focus(), this.#n.setFocusMemory(this, r)) : e.focus();
			}
		});
		n.observe(e, {
			childList: !0,
			subtree: !0
		}), this.#r.push(() => n.disconnect());
	}
	#l() {
		return this.#t ? Qp(this.#t, {
			includeContainer: !1,
			getShadowRoot: !0
		}) : [];
	}
	#u() {
		return this.#l()[0] || null;
	}
	#d() {
		return this.#t ? $p(this.#t, {
			includeContainer: !1,
			getShadowRoot: !0
		}) : [];
	}
	static use(t) {
		let n = null;
		return ef([() => t.ref.current, () => t.enabled.current], ([r, i]) => {
			r && i ? (n ||= new e(t), n.mount(r)) : n &&= (n.unmount(), null);
		}), af(() => {
			n?.unmount();
		}), { get props() {
			return { tabindex: -1 };
		} };
	}
};
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/focus-scope/focus-scope.svelte
function im(e, t) {
	qe(t, !0);
	let n = G(t, "enabled", 3, !1), r = G(t, "trapFocus", 3, !1), i = G(t, "loop", 3, !1), a = G(t, "onCloseAutoFocus", 3, Zf), o = G(t, "onOpenAutoFocus", 3, Zf), s = rm.use({
		enabled: Q(() => n()),
		trap: Q(() => r()),
		loop: i(),
		onCloseAutoFocus: Q(() => a()),
		onOpenAutoFocus: Q(() => o()),
		ref: t.ref
	});
	var c = U();
	ii(z(c), () => t.focusScope ?? g, () => ({ props: s.props })), W(e, c), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/text-selection-layer/use-text-selection-layer.svelte.js
var am = () => {};
globalThis.bitsTextSelectionLayers ??= /* @__PURE__ */ new Map();
var om = class e {
	static create(t) {
		return new e(t);
	}
	opts;
	domContext;
	#e = Zf;
	#t = !1;
	#n = am;
	#r = am;
	constructor(e) {
		this.opts = e, this.domContext = new yf(e.ref);
		let t = Zf;
		ef(() => [
			this.opts.enabled.current,
			this.opts.onPointerDown.current,
			this.opts.onPointerUp.current
		], ([e, n, r]) => (this.#t = e, this.#n = n, this.#r = r, e && (globalThis.bitsTextSelectionLayers.set(this, this.opts.enabled), t(), t = this.#i()), () => {
			this.#t = !1, t(), this.#s(), globalThis.bitsTextSelectionLayers.delete(this);
		}));
	}
	#i() {
		return Bd(Tr(this.domContext.getDocument(), "pointerdown", this.#o), Tr(this.domContext.getDocument(), "pointerup", this.#a));
	}
	#a = (e) => {
		this.#s(), !e.defaultPrevented && this.#r(e);
	};
	#o = (e) => {
		if (!this.#t) return;
		this.#s();
		let t = this.opts.ref.current, n = e.target;
		Hf(t) && Hf(n) && um(this) && hf(t, n) && (this.#n(e), !e.defaultPrevented && (this.#e = cm(t, this.domContext.getDocument().body)));
	};
	#s = () => {
		this.#e(), this.#e = Zf;
	};
}, sm = (e) => e.style.userSelect || e.style.webkitUserSelect;
function cm(e, t) {
	let n = sm(t), r = sm(e);
	return lm(t, "none"), lm(e, "text"), () => {
		lm(t, n), lm(e, r);
	};
}
function lm(e, t) {
	e.style.userSelect = t, e.style.webkitUserSelect = t;
}
function um(e) {
	let t = [...globalThis.bitsTextSelectionLayers];
	if (!t.length) return !1;
	let n = t.at(-1);
	return n ? n[0] === e : !1;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/text-selection-layer/text-selection-layer.svelte
function dm(e, t) {
	qe(t, !0);
	let n = G(t, "preventOverflowTextSelection", 3, !0), r = G(t, "onPointerDown", 3, Zf), i = G(t, "onPointerUp", 3, Zf);
	om.create({
		id: Q(() => t.id),
		onPointerDown: Q(() => r()),
		onPointerUp: Q(() => i()),
		enabled: Q(() => t.enabled && n()),
		ref: t.ref
	});
	var a = U();
	ii(z(a), () => t.children ?? g), W(e, a), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/use-id.js
globalThis.bitsIdCounter ??= { current: 0 };
function fm(e = "bits") {
	return globalThis.bitsIdCounter.current++, `${e}-${globalThis.bitsIdCounter.current}`;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/shared-state.svelte.js
var pm = class {
	#e;
	#t = 0;
	#n = /* @__PURE__ */ L();
	#r;
	constructor(e) {
		this.#e = e;
	}
	#i() {
		--this.#t, this.#r && this.#t <= 0 && (this.#r(), R(this.#n, void 0), this.#r = void 0);
	}
	get(...e) {
		return this.#t += 1, H(this.#n) === void 0 && (this.#r = Dn(() => {
			R(this.#n, this.#e(...e), !0);
		})), wn(() => () => {
			this.#i();
		}), H(this.#n);
	}
}, mm = new Ql(), hm = [
	"padding-right",
	"margin-right",
	"overflow",
	"overflow-x",
	"overflow-y",
	"pointer-events",
	"--scrollbar-width"
], gm = null, _m = !1, vm = /* @__PURE__ */ new Set(), ym = null, bm = null, xm = !1;
function Sm(e, t, n) {
	e.setProperty(t, n), vm.add(t), t === "overflow" && (vm.add("overflow-x"), vm.add("overflow-y"));
}
var Cm = Q(() => {
	for (let e of mm.values()) if (e) return !0;
	return !1;
}), wm = null, Tm = new pm(() => {
	function e(e) {
		for (let t of hm) {
			if (!vm.has(t)) continue;
			let n = gm?.get(t);
			n?.value ? e.body.style.setProperty(t, n.value, n.priority) : e.body.style.removeProperty(t);
		}
		!_m && e.body.style.length === 0 && e.body.removeAttribute("style"), gm = null, vm.clear(), Bf && ym?.();
	}
	function t() {
		bm !== null && (window.clearTimeout(bm), bm = null);
	}
	function n(e, n) {
		t(), xm = !0, wm = Date.now();
		let r = wm, i = () => {
			bm = null, wm === r && (Dm(mm) ? xm = !1 : (xm = !1, n()));
		}, a = e === null ? 24 : e;
		bm = window.setTimeout(i, a);
	}
	function r() {
		if (gm === null && mm.size === 0 && !xm) {
			_m = document.body.hasAttribute("style"), gm = /* @__PURE__ */ new Map();
			for (let e of hm) gm.set(e, {
				value: document.body.style.getPropertyValue(e),
				priority: document.body.style.getPropertyPriority(e)
			});
		}
	}
	return ef(() => Cm.current, () => {
		if (!Cm.current) return;
		r(), xm = !1;
		let e = getComputedStyle(document.documentElement), t = getComputedStyle(document.body), n = e.scrollbarGutter?.includes("stable") || t.scrollbarGutter?.includes("stable"), i = window.innerWidth - document.documentElement.clientWidth, a = {
			padding: Number.parseInt(t.paddingRight ?? "0", 10) + i,
			margin: Number.parseInt(t.marginRight ?? "0", 10)
		};
		i > 0 && !n && (Sm(document.body.style, "padding-right", `${a.padding}px`), Sm(document.body.style, "margin-right", `${a.margin}px`), Sm(document.body.style, "--scrollbar-width", `${i}px`)), Sm(document.body.style, "overflow", "hidden"), Bf && (ym = Tr(document, "touchmove", (e) => {
			e.target === document.documentElement && (e.touches.length > 1 || e.preventDefault());
		}, { passive: !1 })), of(() => {
			Sm(document.body.style, "pointer-events", "none"), Sm(document.body.style, "overflow", "hidden");
		});
	}), af(() => () => {
		ym?.();
	}), {
		get lockMap() {
			return mm;
		},
		resetBodyStyle: e,
		scheduleCleanupIfNoNewLocks: n,
		cancelPendingCleanup: t,
		ensureInitialStyleCaptured: r
	};
}), Em = class {
	#e = fm();
	#t;
	#n = () => null;
	#r;
	locked;
	constructor(e, t = () => null) {
		this.#t = e, this.#n = t, this.#r = Tm.get(), this.#r && (this.#r.cancelPendingCleanup(), this.#r.ensureInitialStyleCaptured(), this.#r.lockMap.set(this.#e, this.#t ?? !1), this.locked = Q(() => this.#r.lockMap.get(this.#e) ?? !1, (e) => this.#r.lockMap.set(this.#e, e)), af(() => {
			if (this.#r.lockMap.delete(this.#e), Dm(this.#r.lockMap)) return;
			let e = this.#n(), t = document;
			this.#r.scheduleCleanupIfNoNewLocks(e, () => {
				this.#r.resetBodyStyle(t);
			});
		}));
	}
};
function Dm(e) {
	for (let [t, n] of e) if (n) return !0;
	return !1;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/scroll-lock/scroll-lock.svelte
function Om(e, t) {
	qe(t, !0);
	let n = G(t, "preventScroll", 3, !0), r = G(t, "restoreScrollDelay", 3, null);
	n() && new Em(n(), () => r()), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/arrays.js
function km(e, t, n) {
	let r = t.toLowerCase();
	if (r.endsWith(" ")) {
		let i = r.slice(0, -1);
		if (e.filter((e) => e.toLowerCase().startsWith(i)).length <= 1) return km(e, i, n);
		let a = n?.toLowerCase();
		if (a && a.startsWith(i) && a.charAt(i.length) === " " && t.trim() === i) return n;
		let o = e.filter((e) => e.toLowerCase().startsWith(r));
		if (o.length > 0) {
			let t = n ? e.indexOf(n) : -1;
			return Am(o, Math.max(t, 0)).find((e) => e !== n) || n;
		}
	}
	let i = t.length > 1 && Array.from(t).every((e) => e === t[0]) ? t[0] : t, a = i.toLowerCase(), o = n ? e.indexOf(n) : -1, s = Am(e, Math.max(o, 0));
	i.length === 1 && (s = s.filter((e) => e !== n));
	let c = s.find((e) => e?.toLowerCase().startsWith(a));
	return c === n ? void 0 : c;
}
function Am(e, t) {
	return e.map((n, r) => e[(t + r) % e.length]);
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/floating-layer/floating-root.svelte.js
var jm = new Zd("Floating.Root"), Mm = new Zd("Floating.Root"), Nm = class e {
	static create(t = !1) {
		return t ? Mm.set(new e()) : jm.set(new e());
	}
	anchorNode = dd(null);
	customAnchorNode = dd(null);
	triggerNode = dd(null);
	constructor() {
		wn(() => {
			this.customAnchorNode.current ? typeof this.customAnchorNode.current == "string" ? this.anchorNode.current = document.querySelector(this.customAnchorNode.current) : this.anchorNode.current = this.customAnchorNode.current : this.anchorNode.current = this.triggerNode.current;
		});
	}
};
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer.svelte
function Pm(e, t) {
	qe(t, !0);
	let n = G(t, "tooltip", 3, !1);
	Nm.create(n());
	var r = U();
	ii(z(r), () => t.children ?? g), W(e, r), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/floating-svelte/floating-utils.svelte.js
function Fm(e) {
	return typeof e == "function" ? e() : e;
}
function Im(e) {
	return typeof window > "u" ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1;
}
function Lm(e, t) {
	let n = Im(e);
	return Math.round(t * n) / n;
}
function Rm(e) {
	return {
		[`--bits-${e}-content-transform-origin`]: "var(--bits-floating-transform-origin)",
		[`--bits-${e}-content-available-width`]: "var(--bits-floating-available-width)",
		[`--bits-${e}-content-available-height`]: "var(--bits-floating-available-height)",
		[`--bits-${e}-anchor-width`]: "var(--bits-floating-anchor-width)",
		[`--bits-${e}-anchor-height`]: "var(--bits-floating-anchor-height)"
	};
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/box-auto-reset.svelte.js
var zm = {
	afterMs: 1e4,
	onChange: Zf
};
function Bm(e, t) {
	let { afterMs: n, onChange: r, getWindow: i } = {
		...zm,
		...t
	}, a = null, o = /* @__PURE__ */ L($t(e));
	function s() {
		return i().setTimeout(() => {
			R(o, e, !0), r?.(e);
		}, n);
	}
	return wn(() => () => {
		a && i().clearTimeout(a);
	}), Q(() => H(o), (e) => {
		R(o, e, !0), r?.(e), a && i().clearTimeout(a), a = s();
	});
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/dom-typeahead.svelte.js
var Vm = class {
	#e;
	#t;
	#n = /* @__PURE__ */ F(() => this.#e.onMatch ? this.#e.onMatch : (e) => e.focus());
	#r = /* @__PURE__ */ F(() => this.#e.getCurrentItem ? this.#e.getCurrentItem : this.#e.getActiveElement);
	constructor(e) {
		this.#e = e, this.#t = Bm("", {
			afterMs: 1e3,
			getWindow: e.getWindow
		}), this.handleTypeaheadSearch = this.handleTypeaheadSearch.bind(this), this.resetTypeahead = this.resetTypeahead.bind(this);
	}
	handleTypeaheadSearch(e, t) {
		if (!t.length) return;
		this.#t.current = this.#t.current + e;
		let n = H(this.#r)(), r = t.find((e) => e === n)?.textContent?.trim() ?? "", i = km(t.map((e) => e.textContent?.trim() ?? ""), this.#t.current, r), a = t.find((e) => e.textContent?.trim() === i);
		return a && H(this.#n)(a), a;
	}
	resetTypeahead() {
		this.#t.current = "";
	}
	get search() {
		return this.#t.current;
	}
}, Hm = [
	"top",
	"right",
	"bottom",
	"left"
], Um = Math.min, Wm = Math.max, Gm = Math.round, Km = Math.floor, qm = (e) => ({
	x: e,
	y: e
}), Jm = {
	left: "right",
	right: "left",
	bottom: "top",
	top: "bottom"
};
function Ym(e, t, n) {
	return Wm(e, Um(t, n));
}
function Xm(e, t) {
	return typeof e == "function" ? e(t) : e;
}
function Zm(e) {
	return e.split("-")[0];
}
function Qm(e) {
	return e.split("-")[1];
}
function $m(e) {
	return e === "x" ? "y" : "x";
}
function eh(e) {
	return e === "y" ? "height" : "width";
}
function th(e) {
	let t = e[0];
	return t === "t" || t === "b" ? "y" : "x";
}
function nh(e) {
	return $m(th(e));
}
function rh(e, t, n) {
	n === void 0 && (n = !1);
	let r = Qm(e), i = nh(e), a = eh(i), o = i === "x" ? r === (n ? "end" : "start") ? "right" : "left" : r === "start" ? "bottom" : "top";
	return t.reference[a] > t.floating[a] && (o = fh(o)), [o, fh(o)];
}
function ih(e) {
	let t = fh(e);
	return [
		ah(e),
		t,
		ah(t)
	];
}
function ah(e) {
	return e.includes("start") ? e.replace("start", "end") : e.replace("end", "start");
}
var oh = ["left", "right"], sh = ["right", "left"], ch = ["top", "bottom"], lh = ["bottom", "top"];
function uh(e, t, n) {
	switch (e) {
		case "top":
		case "bottom": return n ? t ? sh : oh : t ? oh : sh;
		case "left":
		case "right": return t ? ch : lh;
		default: return [];
	}
}
function dh(e, t, n, r) {
	let i = Qm(e), a = uh(Zm(e), n === "start", r);
	return i && (a = a.map((e) => e + "-" + i), t && (a = a.concat(a.map(ah)))), a;
}
function fh(e) {
	let t = Zm(e);
	return Jm[t] + e.slice(t.length);
}
function ph(e) {
	return {
		top: e.top ?? 0,
		right: e.right ?? 0,
		bottom: e.bottom ?? 0,
		left: e.left ?? 0
	};
}
function mh(e) {
	return typeof e == "number" ? {
		top: e,
		right: e,
		bottom: e,
		left: e
	} : ph(e);
}
function hh(e) {
	let { x: t, y: n, width: r, height: i } = e;
	return {
		width: r,
		height: i,
		top: n,
		left: t,
		right: t + r,
		bottom: n + i,
		x: t,
		y: n
	};
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/@floating-ui+core@1.8.0-ab1b4bf7a3bb053c/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
function gh(e, t, n) {
	let { reference: r, floating: i } = e, a = th(t), o = nh(t), s = eh(o), c = Zm(t), l = a === "y", u = r.x + r.width / 2 - i.width / 2, d = r.y + r.height / 2 - i.height / 2, f = r[s] / 2 - i[s] / 2, p;
	switch (c) {
		case "top":
			p = {
				x: u,
				y: r.y - i.height
			};
			break;
		case "bottom":
			p = {
				x: u,
				y: r.y + r.height
			};
			break;
		case "right":
			p = {
				x: r.x + r.width,
				y: d
			};
			break;
		case "left":
			p = {
				x: r.x - i.width,
				y: d
			};
			break;
		default: p = {
			x: r.x,
			y: r.y
		};
	}
	let m = Qm(t);
	return m && (p[o] += f * (m === "end" ? 1 : -1) * (n && l ? -1 : 1)), p;
}
async function _h(e, t) {
	t === void 0 && (t = {});
	let { x: n, y: r, platform: i, rects: a, elements: o, strategy: s } = e, { boundary: c = "clippingAncestors", rootBoundary: l = "viewport", elementContext: u = "floating", altBoundary: d = !1, padding: f = 0 } = Xm(t, e), p = mh(f), m = o[d ? u === "floating" ? "reference" : "floating" : u], h = hh(await i.getClippingRect({
		element: await (i.isElement == null ? void 0 : i.isElement(m)) ?? !0 ? m : m.contextElement || await (i.getDocumentElement == null ? void 0 : i.getDocumentElement(o.floating)),
		boundary: c,
		rootBoundary: l,
		strategy: s
	})), g = u === "floating" ? {
		x: n,
		y: r,
		width: a.floating.width,
		height: a.floating.height
	} : a.reference, _ = await (i.getOffsetParent == null ? void 0 : i.getOffsetParent(o.floating)), v = await (i.isElement == null ? void 0 : i.isElement(_)) && await (i.getScale == null ? void 0 : i.getScale(_)) || {
		x: 1,
		y: 1
	}, y = hh(i.convertOffsetParentRelativeRectToViewportRelativeRect ? await i.convertOffsetParentRelativeRectToViewportRelativeRect({
		elements: o,
		rect: g,
		offsetParent: _,
		strategy: s
	}) : g);
	return {
		top: (h.top - y.top + p.top) / v.y,
		bottom: (y.bottom - h.bottom + p.bottom) / v.y,
		left: (h.left - y.left + p.left) / v.x,
		right: (y.right - h.right + p.right) / v.x
	};
}
var vh = 50, yh = async (e, t, n) => {
	let { placement: r = "bottom", strategy: i = "absolute", middleware: a = [], platform: o } = n, s = o.detectOverflow ? o : {
		...o,
		detectOverflow: _h
	}, c = await (o.isRTL == null ? void 0 : o.isRTL(t)), l = await o.getElementRects({
		reference: e,
		floating: t,
		strategy: i
	}), { x: u, y: d } = gh(l, r, c), f = r, p = 0, m = {};
	for (let n = 0; n < a.length; n++) {
		let h = a[n];
		if (!h) continue;
		let { name: g, fn: _ } = h, { x: v, y, data: b, reset: x } = await _({
			x: u,
			y: d,
			initialPlacement: r,
			placement: f,
			strategy: i,
			middlewareData: m,
			rects: l,
			platform: s,
			elements: {
				reference: e,
				floating: t
			}
		});
		u = v ?? u, d = y ?? d, m[g] = {
			...m[g],
			...b
		}, x && p < vh && (p++, typeof x == "object" && (x.placement && (f = x.placement), x.rects && (l = x.rects === !0 ? await o.getElementRects({
			reference: e,
			floating: t,
			strategy: i
		}) : x.rects), {x: u, y: d} = gh(l, f, c)), n = -1);
	}
	return {
		x: u,
		y: d,
		placement: f,
		strategy: i,
		middlewareData: m
	};
}, bh = (e) => ({
	name: "arrow",
	options: e,
	async fn(t) {
		let { x: n, y: r, placement: i, rects: a, platform: o, elements: s, middlewareData: c } = t, { element: l, padding: u = 0 } = Xm(e, t) || {};
		if (l == null) return {};
		let d = mh(u), f = {
			x: n,
			y: r
		}, p = nh(i), m = eh(p), h = await o.getDimensions(l), g = p === "y", _ = g ? "top" : "left", v = g ? "bottom" : "right", y = g ? "clientHeight" : "clientWidth", b = a.reference[m] + a.reference[p] - f[p] - a.floating[m], x = f[p] - a.reference[p], S = await (o.getOffsetParent == null ? void 0 : o.getOffsetParent(l)), C = S ? S[y] : 0;
		(!C || !await (o.isElement == null ? void 0 : o.isElement(S))) && (C = s.floating[y] || a.floating[m]);
		let w = b / 2 - x / 2, T = C / 2 - h[m] / 2 - 1, E = Um(d[_], T), ee = Um(d[v], T), te = C - h[m] - ee, ne = C / 2 - h[m] / 2 + w, re = Ym(E, ne, te), ie = !c.arrow && Qm(i) != null && ne !== re && a.reference[m] / 2 - (ne < E ? E : ee) - h[m] / 2 < 0, D = ie ? ne < E ? ne - E : ne - te : 0;
		return {
			[p]: f[p] + D,
			data: {
				[p]: re,
				centerOffset: ne - re - D,
				...ie && { alignmentOffset: D }
			},
			reset: ie
		};
	}
}), xh = function(e) {
	return e === void 0 && (e = {}), {
		name: "flip",
		options: e,
		async fn(t) {
			var n;
			let { placement: r, middlewareData: i, rects: a, initialPlacement: o, platform: s, elements: c } = t, { mainAxis: l = !0, crossAxis: u = !0, fallbackPlacements: d, fallbackStrategy: f = "bestFit", fallbackAxisSideDirection: p = "none", flipAlignment: m = !0, ...h } = Xm(e, t);
			if ((n = i.arrow) != null && n.alignmentOffset) return {};
			let g = Zm(r), _ = th(o), v = Zm(o) === o, y = await (s.isRTL == null ? void 0 : s.isRTL(c.floating)), b = d || (v || !m ? [fh(o)] : ih(o)), x = p !== "none";
			!d && x && b.push(...dh(o, m, p, y));
			let S = [o, ...b], C = await s.detectOverflow(t, h), w = [], T = i.flip?.overflows || [];
			if (l && w.push(C[g]), u) {
				let e = rh(r, a, y);
				w.push(C[e[0]], C[e[1]]);
			}
			if (T = [...T, {
				placement: r,
				overflows: w
			}], !w.every((e) => e <= 0)) {
				let e = (i.flip?.index || 0) + 1, t = S[e];
				if (t && (u !== "alignment" || _ === th(t) || T.every((e) => th(e.placement) !== _ || e.overflows[0] > 0))) return {
					data: {
						index: e,
						overflows: T
					},
					reset: { placement: t }
				};
				let n = T.filter((e) => e.overflows[0] <= 0).sort((e, t) => e.overflows[1] - t.overflows[1])[0]?.placement;
				if (!n) switch (f) {
					case "bestFit": {
						let e = T.filter((e) => {
							if (x) {
								let t = th(e.placement);
								return t === _ || t === "y";
							}
							return !0;
						}).map((e) => [e.placement, e.overflows.filter((e) => e > 0).reduce((e, t) => e + t, 0)]).sort((e, t) => e[1] - t[1])[0]?.[0];
						e && (n = e);
						break;
					}
					case "initialPlacement": n = o;
				}
				if (r !== n) return { reset: { placement: n } };
			}
			return {};
		}
	};
};
function Sh(e, t) {
	return {
		top: e.top - t.height,
		right: e.right - t.width,
		bottom: e.bottom - t.height,
		left: e.left - t.width
	};
}
function Ch(e) {
	return Hm.some((t) => e[t] >= 0);
}
var wh = function(e) {
	return e === void 0 && (e = {}), {
		name: "hide",
		options: e,
		async fn(t) {
			let { rects: n, platform: r } = t, { strategy: i = "referenceHidden", ...a } = Xm(e, t);
			switch (i) {
				case "referenceHidden": {
					let e = Sh(await r.detectOverflow(t, {
						...a,
						elementContext: "reference"
					}), n.reference);
					return { data: {
						referenceHiddenOffsets: e,
						referenceHidden: Ch(e)
					} };
				}
				case "escaped": {
					let e = Sh(await r.detectOverflow(t, {
						...a,
						altBoundary: !0
					}), n.floating);
					return { data: {
						escapedOffsets: e,
						escaped: Ch(e)
					} };
				}
				default: return {};
			}
		}
	};
}, Th = /*#__PURE__*/ new Set(["left", "top"]);
async function Eh(e, t) {
	let { placement: n, platform: r, elements: i } = e, a = await (r.isRTL == null ? void 0 : r.isRTL(i.floating)), o = Zm(n), s = Qm(n), c = th(n) === "y", l = Th.has(o) ? -1 : 1, u = a && c ? -1 : 1, d = Xm(t, e), { mainAxis: f, crossAxis: p, alignmentAxis: m } = typeof d == "number" ? {
		mainAxis: d,
		crossAxis: 0,
		alignmentAxis: null
	} : {
		mainAxis: d.mainAxis || 0,
		crossAxis: d.crossAxis || 0,
		alignmentAxis: d.alignmentAxis
	};
	return s && typeof m == "number" && (p = s === "end" ? m * -1 : m), c ? {
		x: p * u,
		y: f * l
	} : {
		x: f * l,
		y: p * u
	};
}
var Dh = function(e) {
	return e === void 0 && (e = 0), {
		name: "offset",
		options: e,
		async fn(t) {
			var n;
			let { x: r, y: i, placement: a, middlewareData: o } = t, s = await Eh(t, e);
			return a === o.offset?.placement && (n = o.arrow) != null && n.alignmentOffset ? {} : {
				x: r + s.x,
				y: i + s.y,
				data: {
					...s,
					placement: a
				}
			};
		}
	};
}, Oh = function(e) {
	return e === void 0 && (e = {}), {
		name: "shift",
		options: e,
		async fn(t) {
			let { x: n, y: r, placement: i, platform: a } = t, { mainAxis: o = !0, crossAxis: s = !1, limiter: c = { fn: (e) => {
				let { x: t, y: n } = e;
				return {
					x: t,
					y: n
				};
			} }, ...l } = Xm(e, t), u = {
				x: n,
				y: r
			}, d = await a.detectOverflow(t, l), f = th(i), p = $m(f), m = u[p], h = u[f], g = (e, t) => Ym(t + d[e === "y" ? "top" : "left"], t, t - d[e === "y" ? "bottom" : "right"]);
			o && (m = g(p, m)), s && (h = g(f, h));
			let _ = c.fn({
				...t,
				[p]: m,
				[f]: h
			});
			return {
				..._,
				data: {
					x: _.x - n,
					y: _.y - r,
					enabled: {
						[p]: o,
						[f]: s
					}
				}
			};
		}
	};
}, kh = function(e) {
	return e === void 0 && (e = {}), {
		options: e,
		fn(t) {
			let { x: n, y: r, placement: i, rects: a, middlewareData: o } = t, { offset: s = 0, mainAxis: c = !0, crossAxis: l = !0 } = Xm(e, t), u = {
				x: n,
				y: r
			}, d = th(i), f = $m(d), p = u[f], m = u[d], h = Xm(s, t), g = typeof h == "number" ? {
				mainAxis: h,
				crossAxis: 0
			} : {
				mainAxis: h.mainAxis ?? 0,
				crossAxis: h.crossAxis ?? 0
			};
			if (c) {
				let e = f === "y" ? "height" : "width", t = a.reference[f] - a.floating[e] + g.mainAxis, n = a.reference[f] + a.reference[e] - g.mainAxis;
				p < t ? p = t : p > n && (p = n);
			}
			if (l) {
				let e = f === "y" ? "width" : "height", t = Th.has(Zm(i)), n = a.reference[d] - a.floating[e] + (t && o.offset?.[d] || 0) + (t ? 0 : g.crossAxis), r = a.reference[d] + a.reference[e] + (t ? 0 : o.offset?.[d] || 0) - (t ? g.crossAxis : 0);
				m < n ? m = n : m > r && (m = r);
			}
			return {
				[f]: p,
				[d]: m
			};
		}
	};
}, Ah = function(e) {
	return e === void 0 && (e = {}), {
		name: "size",
		options: e,
		async fn(t) {
			let { placement: n, rects: r, platform: i, elements: a } = t, { apply: o = () => {}, ...s } = Xm(e, t), c = await i.detectOverflow(t, s), l = Zm(n), u = Qm(n), d = th(n) === "y", { width: f, height: p } = r.floating, m, h;
			l === "top" || l === "bottom" ? (m = l, h = u === (await (i.isRTL == null ? void 0 : i.isRTL(a.floating)) ? "start" : "end") ? "left" : "right") : (h = l, m = u === "end" ? "top" : "bottom");
			let g = p - c.top - c.bottom, _ = f - c.left - c.right, v = Um(p - c[m], g), y = Um(f - c[h], _), b = t.middlewareData.shift, x = !b, S = v, C = y;
			b != null && b.enabled.x && (C = _), b != null && b.enabled.y && (S = g), x && !u && (d ? C = f - 2 * Wm(c.left, c.right) : S = p - 2 * Wm(c.top, c.bottom)), await o({
				...t,
				availableWidth: C,
				availableHeight: S
			});
			let w = await i.getDimensions(a.floating);
			return f !== w.width || p !== w.height ? { reset: { rects: !0 } } : {};
		}
	};
};
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/@floating-ui+utils@0.2.12-e456c7974173eb16/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
function jh() {
	return typeof window < "u";
}
function Mh(e) {
	return Fh(e) ? (e.nodeName || "").toLowerCase() : "#document";
}
function Nh(e) {
	var t;
	return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window;
}
function Ph(e) {
	return ((Fh(e) ? e.ownerDocument : e.document) || window.document)?.documentElement;
}
function Fh(e) {
	return jh() ? e instanceof Node || e instanceof Nh(e).Node : !1;
}
function Ih(e) {
	return jh() ? e instanceof Element || e instanceof Nh(e).Element : !1;
}
function Lh(e) {
	return jh() ? e instanceof HTMLElement || e instanceof Nh(e).HTMLElement : !1;
}
function Rh(e) {
	return !jh() || typeof ShadowRoot > "u" ? !1 : e instanceof ShadowRoot || e instanceof Nh(e).ShadowRoot;
}
function zh(e) {
	let { overflow: t, overflowX: n, overflowY: r, display: i } = Xh(e);
	return /auto|scroll|overlay|hidden|clip/.test(t + r + n) && i !== "inline" && i !== "contents";
}
function Bh(e) {
	return /^(table|td|th)$/.test(Mh(e));
}
function Vh(e) {
	try {
		if (e.matches(":popover-open")) return !0;
	} catch {}
	try {
		return e.matches(":modal");
	} catch {
		return !1;
	}
}
var Hh = /transform|translate|scale|rotate|perspective|filter/, Uh = /paint|layout|strict|content/, Wh = (e) => !!e && e !== "none", Gh;
function Kh(e) {
	let t = Ih(e) ? Xh(e) : e;
	return Wh(t.transform) || Wh(t.translate) || Wh(t.scale) || Wh(t.rotate) || Wh(t.perspective) || !Jh() && (Wh(t.backdropFilter) || Wh(t.filter)) || Hh.test(t.willChange || "") || Uh.test(t.contain || "");
}
function qh(e) {
	let t = Qh(e);
	for (; Lh(t) && !Yh(t);) {
		if (Kh(t)) return t;
		if (Vh(t)) return null;
		t = Qh(t);
	}
	return null;
}
function Jh() {
	return Gh ??= typeof CSS < "u" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none"), Gh;
}
function Yh(e) {
	return /^(html|body|#document)$/.test(Mh(e));
}
function Xh(e) {
	return Nh(e).getComputedStyle(e);
}
function Zh(e) {
	return Ih(e) ? {
		scrollLeft: e.scrollLeft,
		scrollTop: e.scrollTop
	} : {
		scrollLeft: e.scrollX,
		scrollTop: e.scrollY
	};
}
function Qh(e) {
	if (Mh(e) === "html") return e;
	let t = e.assignedSlot || e.parentNode || Rh(e) && e.host || Ph(e);
	return Rh(t) ? t.host : t;
}
function $h(e) {
	let t = Qh(e);
	return Yh(t) ? (e.ownerDocument || e).body : Lh(t) && zh(t) ? t : $h(t);
}
function eg(e, t, n) {
	t === void 0 && (t = []), n === void 0 && (n = !0);
	let r = $h(e), i = r === e.ownerDocument?.body, a = Nh(r);
	if (i) {
		let e = tg(a);
		return t.concat(a, a.visualViewport || [], zh(r) ? r : [], e && n ? eg(e) : []);
	}
	return t.concat(r, eg(r, [], n));
}
function tg(e) {
	return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null;
}
//#endregion
//#region ../../../../.cawco/workspace-cache/bun/links/@floating-ui+dom@1.8.0-df79c1d0ffc2990c/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
function ng(e) {
	let t = Xh(e), n = parseFloat(t.width) || 0, r = parseFloat(t.height) || 0, i = Lh(e), a = i ? e.offsetWidth : n, o = i ? e.offsetHeight : r, s = Gm(n) !== a || Gm(r) !== o;
	return s && (n = a, r = o), {
		width: n,
		height: r,
		$: s
	};
}
function rg(e) {
	return Ih(e) ? e : e.contextElement;
}
function ig(e) {
	let t = rg(e);
	if (!Lh(t)) return qm(1);
	let n = t.getBoundingClientRect(), { width: r, height: i, $: a } = ng(t), o = (a ? Gm(n.width) : n.width) / r, s = (a ? Gm(n.height) : n.height) / i;
	return (!o || !Number.isFinite(o)) && (o = 1), (!s || !Number.isFinite(s)) && (s = 1), {
		x: o,
		y: s
	};
}
var ag = /*#__PURE__*/ qm(0);
function og(e) {
	let t = Nh(e);
	return !Jh() || !t.visualViewport ? ag : {
		x: t.visualViewport.offsetLeft,
		y: t.visualViewport.offsetTop
	};
}
function sg(e, t, n) {
	return t === void 0 && (t = !1), !!n && t && n === Nh(e);
}
function cg(e, t, n, r) {
	t === void 0 && (t = !1), n === void 0 && (n = !1);
	let i = e.getBoundingClientRect(), a = rg(e), o = qm(1);
	t && (r ? Ih(r) && (o = ig(r)) : o = ig(e));
	let s = sg(a, n, r) ? og(a) : qm(0), c = (i.left + s.x) / o.x, l = (i.top + s.y) / o.y, u = i.width / o.x, d = i.height / o.y;
	if (a && r) {
		let e = Nh(a), t = Ih(r) ? Nh(r) : r, n = e, i = tg(n);
		for (; i && t !== n;) {
			let e = ig(i), t = i.getBoundingClientRect(), r = Xh(i), a = t.left + (i.clientLeft + parseFloat(r.paddingLeft)) * e.x, o = t.top + (i.clientTop + parseFloat(r.paddingTop)) * e.y;
			c *= e.x, l *= e.y, u *= e.x, d *= e.y, c += a, l += o, n = Nh(i), i = tg(n);
		}
	}
	return hh({
		width: u,
		height: d,
		x: c,
		y: l
	});
}
function lg(e, t) {
	let n = Zh(e).scrollLeft;
	return t ? t.left + n : cg(Ph(e)).left + n;
}
function ug(e, t) {
	let n = e.getBoundingClientRect();
	return {
		x: n.left + t.scrollLeft - lg(e, n),
		y: n.top + t.scrollTop
	};
}
function dg(e) {
	let { elements: t, rect: n, offsetParent: r, strategy: i } = e, a = i === "fixed", o = Ph(r), s = t ? Vh(t.floating) : !1;
	if (r === o || s && a) return n;
	let c = {
		scrollLeft: 0,
		scrollTop: 0
	}, l = qm(1), u = qm(0), d = Lh(r);
	if ((d || !a) && ((Mh(r) !== "body" || zh(o)) && (c = Zh(r)), d)) {
		let e = cg(r);
		l = ig(r), u.x = e.x + r.clientLeft, u.y = e.y + r.clientTop;
	}
	let f = o && !d && !a ? ug(o, c) : qm(0);
	return {
		width: n.width * l.x,
		height: n.height * l.y,
		x: n.x * l.x - c.scrollLeft * l.x + u.x + f.x,
		y: n.y * l.y - c.scrollTop * l.y + u.y + f.y
	};
}
function fg(e) {
	return e.getClientRects ? Array.from(e.getClientRects()) : [];
}
function pg(e) {
	let t = Zh(e), n = e.ownerDocument.body, r = Wm(e.scrollWidth, e.clientWidth, n.scrollWidth, n.clientWidth), i = Wm(e.scrollHeight, e.clientHeight, n.scrollHeight, n.clientHeight), a = -t.scrollLeft + lg(e), o = -t.scrollTop;
	return Xh(n).direction === "rtl" && (a += Wm(e.clientWidth, n.clientWidth) - r), {
		width: r,
		height: i,
		x: a,
		y: o
	};
}
var mg = 25;
function hg(e, t, n) {
	n === void 0 && (n = "viewport");
	let r = n === "layoutViewport", i = Nh(e), a = Ph(e), o = i.visualViewport, s = a.clientWidth, c = a.clientHeight, l = 0, u = 0;
	if (o) {
		let e = !Jh() || t === "fixed";
		r ? e || (l = -o.offsetLeft, u = -o.offsetTop) : (s = o.width, c = o.height, e && (l = o.offsetLeft, u = o.offsetTop));
	}
	if (lg(a) <= 0) {
		let e = a.ownerDocument, t = e.body, n = getComputedStyle(t), r = e.compatMode === "CSS1Compat" && parseFloat(n.marginLeft) + parseFloat(n.marginRight) || 0, i = Math.abs(a.clientWidth - t.clientWidth - r), o = getComputedStyle(a).scrollbarGutter === "stable both-edges" ? i / 2 : i;
		o <= mg && (s -= o);
	}
	return {
		width: s,
		height: c,
		x: l,
		y: u
	};
}
function gg(e, t) {
	let n = cg(e, !0, t === "fixed"), r = n.top + e.clientTop, i = n.left + e.clientLeft, a = ig(e);
	return {
		width: e.clientWidth * a.x,
		height: e.clientHeight * a.y,
		x: i * a.x,
		y: r * a.y
	};
}
function _g(e, t, n) {
	let r;
	if (t === "viewport" || t === "layoutViewport") r = hg(e, n, t);
	else if (t === "document") r = pg(Ph(e));
	else if (Ih(t)) r = gg(t, n);
	else {
		let n = og(e);
		r = {
			x: t.x - n.x,
			y: t.y - n.y,
			width: t.width,
			height: t.height
		};
	}
	return hh(r);
}
function vg(e, t) {
	let n = t.get(e);
	if (n) return n;
	let r = eg(e, [], !1).filter((e) => Ih(e) && Mh(e) !== "body"), i = null, a = Xh(e).position === "fixed", o = a ? Qh(e) : e;
	for (; Ih(o) && !Yh(o);) {
		let e = Xh(o), t = Kh(o), n = i ? i.position : a ? "fixed" : "";
		!t && (n === "fixed" || n === "absolute" && e.position === "static") ? r = r.filter((e) => e !== o) : i = e, o = Qh(o);
	}
	return t.set(e, r), r;
}
function yg(e) {
	let { element: t, boundary: n, rootBoundary: r, strategy: i } = e, a = [...n === "clippingAncestors" ? Vh(t) ? [] : vg(t, this._c) : [].concat(n), r], o = _g(t, a[0], i), s = o.top, c = o.right, l = o.bottom, u = o.left;
	for (let e = 1; e < a.length; e++) {
		let n = _g(t, a[e], i);
		s = Wm(n.top, s), c = Um(n.right, c), l = Um(n.bottom, l), u = Wm(n.left, u);
	}
	return {
		width: c - u,
		height: l - s,
		x: u,
		y: s
	};
}
function bg(e) {
	let { width: t, height: n } = ng(e);
	return {
		width: t,
		height: n
	};
}
function xg(e, t, n) {
	let r = Lh(t), i = Ph(t), a = n === "fixed", o = cg(e, !0, a, t), s = {
		scrollLeft: 0,
		scrollTop: 0
	}, c = qm(0);
	if ((r || !a) && ((Mh(t) !== "body" || zh(i)) && (s = Zh(t)), r)) {
		let e = cg(t, !0, a, t);
		c.x = e.x + t.clientLeft, c.y = e.y + t.clientTop;
	}
	!r && i && (c.x = lg(i));
	let l = i && !r && !a ? ug(i, s) : qm(0);
	return {
		x: o.left + s.scrollLeft - c.x - l.x,
		y: o.top + s.scrollTop - c.y - l.y,
		width: o.width,
		height: o.height
	};
}
function Sg(e) {
	return Xh(e).position === "static";
}
function Cg(e, t) {
	if (!Lh(e) || Xh(e).position === "fixed") return null;
	if (t) return t(e);
	let n = e.offsetParent;
	return Ph(e) === n && (n = n.ownerDocument.body), n;
}
function wg(e, t) {
	let n = Nh(e);
	if (Vh(e)) return n;
	if (!Lh(e)) {
		let t = Qh(e);
		for (; t && !Yh(t);) {
			if (Ih(t) && !Sg(t)) return t;
			t = Qh(t);
		}
		return n;
	}
	let r = Cg(e, t);
	for (; r && Bh(r) && Sg(r);) r = Cg(r, t);
	return r && Yh(r) && Sg(r) && !Kh(r) ? n : r || qh(e) || n;
}
var Tg = async function(e) {
	let t = this.getOffsetParent || wg, n = this.getDimensions, r = await n(e.floating);
	return {
		reference: xg(e.reference, await t(e.floating), e.strategy),
		floating: {
			x: 0,
			y: 0,
			width: r.width,
			height: r.height
		}
	};
};
function Eg(e) {
	return Xh(e).direction === "rtl";
}
var Dg = {
	convertOffsetParentRelativeRectToViewportRelativeRect: dg,
	getDocumentElement: Ph,
	getClippingRect: yg,
	getOffsetParent: wg,
	getElementRects: Tg,
	getClientRects: fg,
	getDimensions: bg,
	getScale: ig,
	isElement: Ih,
	isRTL: Eg
};
function Og(e, t) {
	return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height;
}
function kg(e, t, n) {
	let r = null, i, a = Ph(e);
	function o() {
		var e;
		clearTimeout(i), (e = r) == null || e.disconnect(), r = null;
	}
	function s(n, c) {
		n === void 0 && (n = !1), c === void 0 && (c = 1), o();
		let l = e.getBoundingClientRect(), { left: u, top: d, width: f, height: p } = l;
		if (n || t(), !f || !p) return;
		let m = Km(d), h = Km(a.clientWidth - (u + f)), g = Km(a.clientHeight - (d + p)), _ = Km(u), v = {
			rootMargin: -m + "px " + -h + "px " + -g + "px " + -_ + "px",
			threshold: Wm(0, Um(1, c)) || 1
		}, y = !0;
		function b(t) {
			let n = t[0].intersectionRatio;
			if (!Og(l, e.getBoundingClientRect())) return s();
			if (n !== c) {
				if (!y) return s();
				n ? s(!1, n) : i = setTimeout(() => {
					s(!1, 1e-7);
				}, 1e3);
			}
			y = !1;
		}
		try {
			r = new IntersectionObserver(b, {
				...v,
				root: a.ownerDocument
			});
		} catch {
			r = new IntersectionObserver(b, v);
		}
		r.observe(e);
	}
	let c = Nh(e), l = () => s(n);
	return c.addEventListener("resize", l), s(!0), () => {
		c.removeEventListener("resize", l), o();
	};
}
function Ag(e, t, n, r) {
	r === void 0 && (r = {});
	let { ancestorScroll: i = !0, ancestorResize: a = !0, elementResize: o = typeof ResizeObserver == "function", layoutShift: s = typeof IntersectionObserver == "function", animationFrame: c = !1 } = r, l = rg(e), u = i || a ? [...l ? eg(l) : [], ...t ? eg(t) : []] : [];
	u.forEach((e) => {
		i && e.addEventListener("scroll", n), a && e.addEventListener("resize", n);
	});
	let d = l && s ? kg(l, n, a) : null, f = -1, p = null;
	o && (p = new ResizeObserver((e) => {
		let [r] = e;
		r && r.target === l && p && t && (p.unobserve(t), cancelAnimationFrame(f), f = requestAnimationFrame(() => {
			var e;
			(e = p) == null || e.observe(t);
		})), n();
	}), l && !c && p.observe(l), t && p.observe(t));
	let m, h = c ? cg(e) : null;
	c && g();
	function g() {
		let t = cg(e);
		h && !Og(h, t) && n(), h = t, m = requestAnimationFrame(g);
	}
	return n(), () => {
		var e;
		u.forEach((e) => {
			i && e.removeEventListener("scroll", n), a && e.removeEventListener("resize", n);
		}), d?.(), (e = p) == null || e.disconnect(), p = null, c && cancelAnimationFrame(m);
	};
}
var jg = Dh, Mg = Oh, Ng = xh, Pg = Ah, Fg = wh, Ig = bh, Lg = kh, Rg = (e, t, n) => {
	let r = /* @__PURE__ */ new Map(), i = n ?? {}, a = {
		...Dg,
		...i.platform,
		_c: r
	};
	return yh(e, t, {
		...i,
		platform: a
	});
};
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/floating-svelte/use-floating.svelte.js
function zg(e) {
	let t = e.whileElementsMounted, n = /* @__PURE__ */ F(() => Fm(e.open) ?? !0), r = /* @__PURE__ */ F(() => Fm(e.middleware)), i = /* @__PURE__ */ F(() => Fm(e.transform) ?? !0), a = /* @__PURE__ */ F(() => Fm(e.placement) ?? "bottom"), o = /* @__PURE__ */ F(() => Fm(e.strategy) ?? "absolute"), s = /* @__PURE__ */ F(() => Fm(e.sideOffset) ?? 0), c = /* @__PURE__ */ F(() => Fm(e.alignOffset) ?? 0), l = e.reference, u = /* @__PURE__ */ L(0), d = /* @__PURE__ */ L(0), f = dd(null), p = /* @__PURE__ */ L($t(H(o))), m = /* @__PURE__ */ L($t(H(a))), h = /* @__PURE__ */ L($t({})), g = /* @__PURE__ */ L(!1), _ = !1, v = 0, y = !1, b = /* @__PURE__ */ F(() => {
		let e = f.current ? Lm(f.current, H(u)) : H(u), t = f.current ? Lm(f.current, H(d)) : H(d);
		return H(i) ? {
			position: H(p),
			left: "0",
			top: "0",
			transform: `translate(${e}px, ${t}px)`,
			...f.current && Im(f.current) >= 1.5 && { willChange: "transform" }
		} : {
			position: H(p),
			left: `${e}px`,
			top: `${t}px`
		};
	}), x;
	function S() {
		if (y || l.current === null || f.current === null) return;
		let e = l.current, t = f.current, i = ++v;
		Rg(e, t, {
			middleware: H(r),
			placement: H(a),
			strategy: H(o)
		}).then((r) => {
			if (i === v && l.current === e && f.current === t) {
				if (Bg(e)) {
					R(h, {
						...H(h),
						hide: {
							...H(h).hide,
							referenceHidden: !0
						}
					}, !0);
					return;
				}
				if (!H(n) && H(u) !== 0 && H(d) !== 0) {
					let e = Math.max(Math.abs(H(s)), Math.abs(H(c)), 15);
					if (r.x <= e && r.y <= e) return;
				}
				R(u, r.x, !0), R(d, r.y, !0), R(p, r.strategy, !0), R(m, r.placement, !0), R(h, r.middlewareData, !0), R(g, !0);
			}
		});
	}
	function C() {
		typeof x == "function" && (x(), x = void 0), v++;
	}
	function w() {
		if (C(), t === void 0) {
			S();
			return;
		}
		H(n) && l.current !== null && f.current !== null && (x = t(l.current, f.current, S));
	}
	function T() {
		!H(n) && f.current === null && R(g, !1);
	}
	function E() {
		return [
			H(r),
			H(a),
			H(o),
			H(s),
			H(c),
			H(n)
		];
	}
	return wn(() => {
		t === void 0 && H(n) && S();
	}), wn(w), wn(() => {
		if (t !== void 0) {
			if (E(), !H(n)) {
				_ = !1;
				return;
			}
			if (!H(g)) {
				_ = !1;
				return;
			}
			if (!_) {
				_ = !0;
				return;
			}
			S();
		}
	}), wn(T), wn(() => () => {
		y = !0, C();
	}), {
		floating: f,
		reference: l,
		get strategy() {
			return H(p);
		},
		get placement() {
			return H(m);
		},
		get middlewareData() {
			return H(h);
		},
		get isPositioned() {
			return H(g);
		},
		get floatingStyles() {
			return H(b);
		},
		get update() {
			return S;
		}
	};
}
function Bg(e) {
	return e instanceof Element ? !e.isConnected || e instanceof HTMLElement && e.hidden ? !0 : e.getClientRects().length === 0 : !1;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/floating-layer/use-floating-layer.svelte.js
var Vg = {
	top: "bottom",
	right: "left",
	bottom: "top",
	left: "right"
}, Hg = new Zd("Floating.Content"), Ug = class e {
	static create(t, n = !1) {
		return n ? Hg.set(new e(t, Mm.get())) : Hg.set(new e(t, jm.get()));
	}
	opts;
	root;
	contentRef = dd(null);
	wrapperRef = dd(null);
	arrowRef = dd(null);
	contentAttachment = bf(this.contentRef);
	wrapperAttachment = bf(this.wrapperRef);
	arrowAttachment = bf(this.arrowRef);
	arrowId = dd(fm());
	#e = /* @__PURE__ */ F(() => {
		if (typeof this.opts.style == "string") return zd(this.opts.style);
		if (!this.opts.style) return {};
	});
	#t = void 0;
	#n = new rf(() => this.arrowRef.current ?? void 0);
	#r = /* @__PURE__ */ F(() => this.#n?.width ?? 0);
	#i = /* @__PURE__ */ F(() => this.#n?.height ?? 0);
	#a = /* @__PURE__ */ F(() => this.opts.side?.current + (this.opts.align.current === "center" ? "" : `-${this.opts.align.current}`));
	#o = /* @__PURE__ */ F(() => Array.isArray(this.opts.collisionBoundary.current) ? this.opts.collisionBoundary.current : [this.opts.collisionBoundary.current]);
	#s = /* @__PURE__ */ F(() => H(this.#o).length > 0);
	get hasExplicitBoundaries() {
		return H(this.#s);
	}
	set hasExplicitBoundaries(e) {
		R(this.#s, e);
	}
	#c = /* @__PURE__ */ F(() => ({
		padding: this.opts.collisionPadding.current,
		boundary: H(this.#o).filter(Kf),
		altBoundary: this.hasExplicitBoundaries
	}));
	get detectOverflowOptions() {
		return H(this.#c);
	}
	set detectOverflowOptions(e) {
		R(this.#c, e);
	}
	#l = /* @__PURE__ */ L(void 0);
	#u = /* @__PURE__ */ L(void 0);
	#d = /* @__PURE__ */ L(void 0);
	#f = /* @__PURE__ */ L(void 0);
	#p = /* @__PURE__ */ F(() => [
		jg({
			mainAxis: this.opts.sideOffset.current + H(this.#i),
			alignmentAxis: this.opts.alignOffset.current
		}),
		this.opts.avoidCollisions.current && Mg({
			mainAxis: !0,
			crossAxis: !1,
			limiter: this.opts.sticky.current === "partial" ? Lg() : void 0,
			...this.detectOverflowOptions
		}),
		this.opts.avoidCollisions.current && Ng({ ...this.detectOverflowOptions }),
		Pg({
			...this.detectOverflowOptions,
			apply: ({ rects: e, availableWidth: t, availableHeight: n }) => {
				let { width: r, height: i } = e.reference;
				R(this.#l, t, !0), R(this.#u, n, !0), R(this.#d, r, !0), R(this.#f, i, !0);
			}
		}),
		this.arrowRef.current && Ig({
			element: this.arrowRef.current,
			padding: this.opts.arrowPadding.current
		}),
		Wg({
			arrowWidth: H(this.#r),
			arrowHeight: H(this.#i)
		}),
		this.opts.hideWhenDetached.current && Fg({
			strategy: "referenceHidden",
			...this.detectOverflowOptions
		})
	].filter(Boolean));
	get middleware() {
		return H(this.#p);
	}
	set middleware(e) {
		R(this.#p, e);
	}
	floating;
	#m = /* @__PURE__ */ F(() => Kg(this.floating.placement));
	get placedSide() {
		return H(this.#m);
	}
	set placedSide(e) {
		R(this.#m, e);
	}
	#h = /* @__PURE__ */ F(() => qg(this.floating.placement));
	get placedAlign() {
		return H(this.#h);
	}
	set placedAlign(e) {
		R(this.#h, e);
	}
	#g = /* @__PURE__ */ F(() => this.floating.middlewareData.arrow?.x ?? 0);
	get arrowX() {
		return H(this.#g);
	}
	set arrowX(e) {
		R(this.#g, e);
	}
	#_ = /* @__PURE__ */ F(() => this.floating.middlewareData.arrow?.y ?? 0);
	get arrowY() {
		return H(this.#_);
	}
	set arrowY(e) {
		R(this.#_, e);
	}
	#v = /* @__PURE__ */ F(() => this.floating.middlewareData.arrow?.centerOffset !== 0);
	get cannotCenterArrow() {
		return H(this.#v);
	}
	set cannotCenterArrow(e) {
		R(this.#v, e);
	}
	#y = /* @__PURE__ */ L();
	get contentZIndex() {
		return H(this.#y);
	}
	set contentZIndex(e) {
		R(this.#y, e, !0);
	}
	#b = /* @__PURE__ */ F(() => Vg[this.placedSide]);
	get arrowBaseSide() {
		return H(this.#b);
	}
	set arrowBaseSide(e) {
		R(this.#b, e);
	}
	#x = /* @__PURE__ */ F(() => ({
		id: this.opts.wrapperId.current,
		"data-bits-floating-content-wrapper": "",
		style: {
			...this.floating.floatingStyles,
			transform: this.floating.isPositioned ? this.floating.floatingStyles.transform : "translate(0, -200%)",
			minWidth: "max-content",
			zIndex: this.contentZIndex,
			"--bits-floating-transform-origin": `${this.floating.middlewareData.transformOrigin?.x} ${this.floating.middlewareData.transformOrigin?.y}`,
			"--bits-floating-available-width": `${H(this.#l)}px`,
			"--bits-floating-available-height": `${H(this.#u)}px`,
			"--bits-floating-anchor-width": `${H(this.#d)}px`,
			"--bits-floating-anchor-height": `${H(this.#f)}px`,
			...this.floating.middlewareData.hide?.referenceHidden && {
				visibility: "hidden",
				"pointer-events": "none"
			},
			...H(this.#e)
		},
		dir: this.opts.dir.current,
		...this.wrapperAttachment
	}));
	get wrapperProps() {
		return H(this.#x);
	}
	set wrapperProps(e) {
		R(this.#x, e);
	}
	#S = /* @__PURE__ */ F(() => ({
		"data-side": this.placedSide,
		"data-align": this.placedAlign,
		style: Wd({ ...H(this.#e) }),
		...this.contentAttachment
	}));
	get props() {
		return H(this.#S);
	}
	set props(e) {
		R(this.#S, e);
	}
	#C = /* @__PURE__ */ F(() => ({
		position: "absolute",
		left: this.arrowX ? `${this.arrowX}px` : void 0,
		top: this.arrowY ? `${this.arrowY}px` : void 0,
		[this.arrowBaseSide]: 0,
		"transform-origin": {
			top: "",
			right: "0 0",
			bottom: "center 0",
			left: "100% 0"
		}[this.placedSide],
		transform: {
			top: "translateY(100%)",
			right: "translateY(50%) rotate(90deg) translateX(-50%)",
			bottom: "rotate(180deg)",
			left: "translateY(50%) rotate(-90deg) translateX(50%)"
		}[this.placedSide],
		visibility: this.cannotCenterArrow ? "hidden" : void 0
	}));
	get arrowStyle() {
		return H(this.#C);
	}
	set arrowStyle(e) {
		R(this.#C, e);
	}
	constructor(e, t) {
		this.opts = e, this.root = t, this.#t = e.updatePositionStrategy, e.customAnchor && (this.root.customAnchorNode.current = e.customAnchor.current), ef(() => e.customAnchor.current, (e) => {
			this.root.customAnchorNode.current = e;
		}), this.floating = zg({
			strategy: () => this.opts.strategy.current,
			placement: () => H(this.#a),
			middleware: () => this.middleware,
			reference: this.root.anchorNode,
			whileElementsMounted: (...e) => Ag(...e, { animationFrame: this.#t?.current === "always" }),
			open: () => this.opts.enabled.current,
			sideOffset: () => this.opts.sideOffset.current,
			alignOffset: () => this.opts.alignOffset.current
		}), wn(() => {
			this.floating.isPositioned && this.opts.onPlaced?.current();
		}), ef(() => this.contentRef.current, (e) => {
			if (!e || !this.opts.enabled.current) return;
			let t = _f(e), n = t.requestAnimationFrame(() => {
				if (this.contentRef.current !== e || !this.opts.enabled.current) return;
				let n = t.getComputedStyle(e).zIndex;
				n !== this.contentZIndex && (this.contentZIndex = n);
			});
			return () => {
				t.cancelAnimationFrame(n);
			};
		}), wn(() => {
			this.floating.floating.current = this.wrapperRef.current;
		});
	}
};
function Wg(e) {
	return {
		name: "transformOrigin",
		options: e,
		fn(t) {
			let { placement: n, rects: r, middlewareData: i } = t, a = i.arrow?.centerOffset !== 0, o = a ? 0 : e.arrowWidth, s = a ? 0 : e.arrowHeight, [c, l] = Gg(n), u = {
				start: "0%",
				center: "50%",
				end: "100%"
			}[l], d = (i.arrow?.x ?? 0) + o / 2, f = (i.arrow?.y ?? 0) + s / 2, p = "", m = "";
			return c === "bottom" ? (p = a ? u : `${d}px`, m = `${-s}px`) : c === "top" ? (p = a ? u : `${d}px`, m = `${r.floating.height + s}px`) : c === "right" ? (p = `${-s}px`, m = a ? u : `${f}px`) : c === "left" && (p = `${r.floating.width + s}px`, m = a ? u : `${f}px`), { data: {
				x: p,
				y: m
			} };
		}
	};
}
function Gg(e) {
	let [t, n = "center"] = e.split("-");
	return [t, n];
}
function Kg(e) {
	return Gg(e)[0];
}
function qg(e) {
	return Gg(e)[1];
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-content.svelte
function Jg(e, t) {
	qe(t, !0);
	let n = G(t, "side", 3, "bottom"), r = G(t, "sideOffset", 3, 0), i = G(t, "align", 3, "center"), a = G(t, "alignOffset", 3, 0), o = G(t, "arrowPadding", 3, 0), s = G(t, "avoidCollisions", 3, !0), c = G(t, "collisionBoundary", 19, () => []), l = G(t, "collisionPadding", 3, 0), u = G(t, "hideWhenDetached", 3, !1), d = G(t, "onPlaced", 3, () => {}), f = G(t, "sticky", 3, "partial"), p = G(t, "updatePositionStrategy", 3, "optimized"), m = G(t, "strategy", 3, "fixed"), h = G(t, "dir", 3, "ltr"), _ = G(t, "style", 19, () => ({})), v = G(t, "wrapperId", 19, fm), y = G(t, "customAnchor", 3, null), b = G(t, "tooltip", 3, !1), x = Ug.create({
		side: Q(() => n()),
		sideOffset: Q(() => r()),
		align: Q(() => i()),
		alignOffset: Q(() => a()),
		id: Q(() => t.id),
		arrowPadding: Q(() => o()),
		avoidCollisions: Q(() => s()),
		collisionBoundary: Q(() => c()),
		collisionPadding: Q(() => l()),
		hideWhenDetached: Q(() => u()),
		onPlaced: Q(() => d()),
		sticky: Q(() => f()),
		updatePositionStrategy: Q(() => p()),
		strategy: Q(() => m()),
		dir: Q(() => h()),
		style: Q(() => _()),
		enabled: Q(() => t.enabled),
		wrapperId: Q(() => v()),
		customAnchor: Q(() => y())
	}, b()), S = /* @__PURE__ */ F(() => qd(x.wrapperProps, { style: { pointerEvents: "auto" } }));
	var C = U();
	ii(z(C), () => t.content ?? g, () => ({
		props: x.props,
		wrapperProps: H(S)
	})), W(e, C), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/floating-layer/components/floating-layer-content-static.svelte
function Yg(e, t) {
	qe(t, !0), ai(() => {
		t.onPlaced?.();
	});
	var n = U();
	ii(z(n), () => t.content ?? g, () => ({
		props: {},
		wrapperProps: {}
	})), W(e, n), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-content.svelte
var Xg = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy",
	"content",
	"isStatic",
	"onPlaced"
]);
function Zg(e, t) {
	let n = G(t, "isStatic", 3, !1), r = /* @__PURE__ */ sa(t, Xg);
	var i = U(), a = z(i), o = (e) => {
		Yg(e, {
			get content() {
				return t.content;
			},
			get onPlaced() {
				return t.onPlaced;
			}
		});
	}, s = (e) => {
		Jg(e, la({
			get content() {
				return t.content;
			},
			get onPlaced() {
				return t.onPlaced;
			}
		}, () => r));
	};
	si(a, (e) => {
		n() ? e(o) : e(s, -1);
	}), W(e, i);
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-inner.svelte
var Qg = /* @__PURE__ */ new Set(/* @__PURE__ */ "$$slots.$$events.$$legacy.popper.onEscapeKeydown.escapeKeydownBehavior.preventOverflowTextSelection.id.onPointerDown.onPointerUp.side.sideOffset.align.alignOffset.arrowPadding.avoidCollisions.collisionBoundary.collisionPadding.sticky.hideWhenDetached.updatePositionStrategy.strategy.dir.preventScroll.wrapperId.style.onPlaced.onInteractOutside.onCloseAutoFocus.onOpenAutoFocus.onFocusOutside.interactOutsideBehavior.loop.trapFocus.isValidEvent.customAnchor.isStatic.enabled.forceMount.ref.tooltip.contentPointerEvents".split(".")), $g = /* @__PURE__ */ Fr("<!> <!>", 1);
function e_(e, t) {
	qe(t, !0);
	let n = G(t, "interactOutsideBehavior", 3, "close"), r = G(t, "trapFocus", 3, !0), i = G(t, "isValidEvent", 3, () => !1), a = G(t, "customAnchor", 3, null), o = G(t, "isStatic", 3, !1), s = G(t, "tooltip", 3, !1), c = G(t, "contentPointerEvents", 3, "auto"), l = /* @__PURE__ */ sa(t, Qg), u = /* @__PURE__ */ F(() => t.preventScroll ?? !0), d = /* @__PURE__ */ F(() => t.strategy ?? (H(u) ? "fixed" : "absolute"));
	Zg(e, {
		get isStatic() {
			return o();
		},
		get id() {
			return t.id;
		},
		get side() {
			return t.side;
		},
		get sideOffset() {
			return t.sideOffset;
		},
		get align() {
			return t.align;
		},
		get alignOffset() {
			return t.alignOffset;
		},
		get arrowPadding() {
			return t.arrowPadding;
		},
		get avoidCollisions() {
			return t.avoidCollisions;
		},
		get collisionBoundary() {
			return t.collisionBoundary;
		},
		get collisionPadding() {
			return t.collisionPadding;
		},
		get sticky() {
			return t.sticky;
		},
		get hideWhenDetached() {
			return t.hideWhenDetached;
		},
		get updatePositionStrategy() {
			return t.updatePositionStrategy;
		},
		get strategy() {
			return H(d);
		},
		get dir() {
			return t.dir;
		},
		get wrapperId() {
			return t.wrapperId;
		},
		get style() {
			return t.style;
		},
		get onPlaced() {
			return t.onPlaced;
		},
		get customAnchor() {
			return a();
		},
		get enabled() {
			return t.enabled;
		},
		get tooltip() {
			return s();
		},
		content: (e, a) => {
			let o = () => (a?.()).props, s = () => (a?.()).wrapperProps;
			var d = $g(), f = z(d), p = (e) => {
				Om(e, { get preventScroll() {
					return H(u);
				} });
			}, m = (e) => {
				Om(e, { get preventScroll() {
					return H(u);
				} });
			};
			si(f, (e) => {
				t.forceMount && t.enabled ? e(p) : t.forceMount || e(m, 1);
			}), im(pn(f, 2), {
				get onOpenAutoFocus() {
					return t.onOpenAutoFocus;
				},
				get onCloseAutoFocus() {
					return t.onCloseAutoFocus;
				},
				get loop() {
					return t.loop;
				},
				get enabled() {
					return t.enabled;
				},
				get trapFocus() {
					return r();
				},
				get forceMount() {
					return t.forceMount;
				},
				get ref() {
					return t.ref;
				},
				focusScope: (e, r) => {
					let a = () => (r?.()).props;
					Sp(e, {
						get onEscapeKeydown() {
							return t.onEscapeKeydown;
						},
						get escapeKeydownBehavior() {
							return t.escapeKeydownBehavior;
						},
						get enabled() {
							return t.enabled;
						},
						get ref() {
							return t.ref;
						},
						children: (e, r) => {
							yp(e, {
								get id() {
									return t.id;
								},
								get onInteractOutside() {
									return t.onInteractOutside;
								},
								get onFocusOutside() {
									return t.onFocusOutside;
								},
								get interactOutsideBehavior() {
									return n();
								},
								get isValidEvent() {
									return i();
								},
								get enabled() {
									return t.enabled;
								},
								get ref() {
									return t.ref;
								},
								children: (e, n) => {
									let r = () => (n?.()).props;
									dm(e, {
										get id() {
											return t.id;
										},
										get preventOverflowTextSelection() {
											return t.preventOverflowTextSelection;
										},
										get onPointerDown() {
											return t.onPointerDown;
										},
										get onPointerUp() {
											return t.onPointerUp;
										},
										get enabled() {
											return t.enabled;
										},
										get ref() {
											return t.ref;
										},
										children: (e, n) => {
											var i = U(), u = z(i);
											{
												let e = /* @__PURE__ */ F(() => ({
													props: qd(l, o(), r(), a(), {
														id: t.id,
														style: { pointerEvents: c() }
													}),
													wrapperProps: s()
												}));
												ii(u, () => t.popper ?? g, () => H(e));
											}
											W(e, i);
										},
										$$slots: { default: !0 }
									});
								},
								$$slots: { default: !0 }
							});
						},
						$$slots: { default: !0 }
					});
				},
				$$slots: { focusScope: !0 }
			}), W(e, d);
		},
		$$slots: { content: !0 }
	}), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer.svelte
var t_ = /* @__PURE__ */ new Set(/* @__PURE__ */ "$$slots.$$events.$$legacy.popper.open.onEscapeKeydown.escapeKeydownBehavior.preventOverflowTextSelection.id.onPointerDown.onPointerUp.side.sideOffset.align.alignOffset.arrowPadding.avoidCollisions.collisionBoundary.collisionPadding.sticky.hideWhenDetached.updatePositionStrategy.strategy.dir.preventScroll.wrapperId.style.onPlaced.onInteractOutside.onCloseAutoFocus.onOpenAutoFocus.onFocusOutside.interactOutsideBehavior.loop.trapFocus.isValidEvent.customAnchor.isStatic.ref.shouldRender".split("."));
function n_(e, t) {
	let n = G(t, "interactOutsideBehavior", 3, "close"), r = G(t, "trapFocus", 3, !0), i = G(t, "isValidEvent", 3, () => !1), a = G(t, "customAnchor", 3, null), o = G(t, "isStatic", 3, !1), s = /* @__PURE__ */ sa(t, t_);
	var c = U(), l = z(c), u = (e) => {
		e_(e, la({
			get popper() {
				return t.popper;
			},
			get onEscapeKeydown() {
				return t.onEscapeKeydown;
			},
			get escapeKeydownBehavior() {
				return t.escapeKeydownBehavior;
			},
			get preventOverflowTextSelection() {
				return t.preventOverflowTextSelection;
			},
			get id() {
				return t.id;
			},
			get onPointerDown() {
				return t.onPointerDown;
			},
			get onPointerUp() {
				return t.onPointerUp;
			},
			get side() {
				return t.side;
			},
			get sideOffset() {
				return t.sideOffset;
			},
			get align() {
				return t.align;
			},
			get alignOffset() {
				return t.alignOffset;
			},
			get arrowPadding() {
				return t.arrowPadding;
			},
			get avoidCollisions() {
				return t.avoidCollisions;
			},
			get collisionBoundary() {
				return t.collisionBoundary;
			},
			get collisionPadding() {
				return t.collisionPadding;
			},
			get sticky() {
				return t.sticky;
			},
			get hideWhenDetached() {
				return t.hideWhenDetached;
			},
			get updatePositionStrategy() {
				return t.updatePositionStrategy;
			},
			get strategy() {
				return t.strategy;
			},
			get dir() {
				return t.dir;
			},
			get preventScroll() {
				return t.preventScroll;
			},
			get wrapperId() {
				return t.wrapperId;
			},
			get style() {
				return t.style;
			},
			get onPlaced() {
				return t.onPlaced;
			},
			get customAnchor() {
				return a();
			},
			get isStatic() {
				return o();
			},
			get enabled() {
				return t.open;
			},
			get onInteractOutside() {
				return t.onInteractOutside;
			},
			get onCloseAutoFocus() {
				return t.onCloseAutoFocus;
			},
			get onOpenAutoFocus() {
				return t.onOpenAutoFocus;
			},
			get interactOutsideBehavior() {
				return n();
			},
			get loop() {
				return t.loop;
			},
			get trapFocus() {
				return r();
			},
			get isValidEvent() {
				return i();
			},
			get onFocusOutside() {
				return t.onFocusOutside;
			},
			forceMount: !1,
			get ref() {
				return t.ref;
			}
		}, () => s));
	};
	si(l, (e) => {
		t.shouldRender && e(u);
	}), W(e, c);
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/utilities/popper-layer/popper-layer-force-mount.svelte
var r_ = /* @__PURE__ */ new Set(/* @__PURE__ */ "$$slots.$$events.$$legacy.popper.onEscapeKeydown.escapeKeydownBehavior.preventOverflowTextSelection.id.onPointerDown.onPointerUp.side.sideOffset.align.alignOffset.arrowPadding.avoidCollisions.collisionBoundary.collisionPadding.sticky.hideWhenDetached.updatePositionStrategy.strategy.dir.preventScroll.wrapperId.style.onPlaced.onInteractOutside.onCloseAutoFocus.onOpenAutoFocus.onFocusOutside.interactOutsideBehavior.loop.trapFocus.isValidEvent.customAnchor.isStatic.enabled".split("."));
function i_(e, t) {
	let n = G(t, "interactOutsideBehavior", 3, "close"), r = G(t, "trapFocus", 3, !0), i = G(t, "isValidEvent", 3, () => !1), a = G(t, "customAnchor", 3, null), o = G(t, "isStatic", 3, !1), s = /* @__PURE__ */ sa(t, r_);
	e_(e, la({
		get popper() {
			return t.popper;
		},
		get onEscapeKeydown() {
			return t.onEscapeKeydown;
		},
		get escapeKeydownBehavior() {
			return t.escapeKeydownBehavior;
		},
		get preventOverflowTextSelection() {
			return t.preventOverflowTextSelection;
		},
		get id() {
			return t.id;
		},
		get onPointerDown() {
			return t.onPointerDown;
		},
		get onPointerUp() {
			return t.onPointerUp;
		},
		get side() {
			return t.side;
		},
		get sideOffset() {
			return t.sideOffset;
		},
		get align() {
			return t.align;
		},
		get alignOffset() {
			return t.alignOffset;
		},
		get arrowPadding() {
			return t.arrowPadding;
		},
		get avoidCollisions() {
			return t.avoidCollisions;
		},
		get collisionBoundary() {
			return t.collisionBoundary;
		},
		get collisionPadding() {
			return t.collisionPadding;
		},
		get sticky() {
			return t.sticky;
		},
		get hideWhenDetached() {
			return t.hideWhenDetached;
		},
		get updatePositionStrategy() {
			return t.updatePositionStrategy;
		},
		get strategy() {
			return t.strategy;
		},
		get dir() {
			return t.dir;
		},
		get preventScroll() {
			return t.preventScroll;
		},
		get wrapperId() {
			return t.wrapperId;
		},
		get style() {
			return t.style;
		},
		get onPlaced() {
			return t.onPlaced;
		},
		get customAnchor() {
			return a();
		},
		get isStatic() {
			return o();
		},
		get enabled() {
			return t.enabled;
		},
		get onInteractOutside() {
			return t.onInteractOutside;
		},
		get onCloseAutoFocus() {
			return t.onCloseAutoFocus;
		},
		get onOpenAutoFocus() {
			return t.onOpenAutoFocus;
		},
		get interactOutsideBehavior() {
			return n();
		},
		get loop() {
			return t.loop;
		},
		get trapFocus() {
			return r();
		},
		get isValidEvent() {
			return i();
		},
		get onFocusOutside() {
			return t.onFocusOutside;
		}
	}, () => s, { forceMount: !0 }));
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/menu/utils.js
var a_ = [kf, " "], o_ = [
	Tf,
	Mf,
	Af
], s_ = [
	Of,
	jf,
	"End"
], c_ = [...o_, ...s_];
[...a_], [...a_];
function l_(e) {
	return e.pointerType === "mouse";
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/focus.js
function u_(e, { select: t = !1 } = {}) {
	if (!e || !e.focus) return;
	let n = gf(e);
	if (n.activeElement === e) return;
	let r = n.activeElement;
	e.focus({ preventScroll: !0 }), e !== r && qf(e) && t && e.select();
}
function d_(e, { select: t = !1 } = {}, n) {
	let r = n();
	for (let i of e) if (u_(i, { select: t }), n() !== r) return !0;
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/tabbable.js
function f_() {
	return {
		getShadowRoot: !0,
		displayCheck: typeof ResizeObserver == "function" && ResizeObserver.toString().includes("[native code]") ? "full" : "none"
	};
}
function p_(e, t) {
	if (!em(e, f_())) return m_(e, t);
	let n = gf(e), r = Qp(n.body, f_());
	t === "prev" && r.reverse();
	let i = r.indexOf(e);
	return i === -1 ? n.body : r.slice(i + 1)[0];
}
function m_(e, t) {
	let n = gf(e);
	if (!nm(e, f_())) return n.body;
	let r = $p(n.body, f_());
	t === "prev" && r.reverse();
	let i = r.indexOf(e);
	return i === -1 ? n.body : r.slice(i + 1).find((e) => em(e, f_())) ?? n.body;
}
new Zd("Menu.Root");
var h_ = new Zd("Menu.Root | Menu.Sub"), g_ = new Zd("Menu.Content");
new Zd("Menu.Group | Menu.RadioGroup"), new Zd("Menu.RadioGroup"), new Zd("Menu.CheckboxGroup");
var __ = new sp("bitsmenuopen", {
	bubbles: !1,
	cancelable: !0
});
wf({
	component: "menu",
	parts: [
		"trigger",
		"content",
		"sub-trigger",
		"item",
		"group",
		"group-heading",
		"checkbox-group",
		"checkbox-item",
		"radio-group",
		"radio-item",
		"separator",
		"sub-content",
		"arrow"
	]
});
var v_ = class {
	#e;
	#t = null;
	#n = null;
	#r = !1;
	#i = null;
	#a = null;
	#o = null;
	#s = null;
	constructor(e) {
		this.#e = e, ef([
			e.triggerNode,
			e.contentNode,
			e.enabled
		], ([e, t, n]) => {
			if (this.#_(), !e || !t || !n) return;
			let r = (e) => {
				l_(e) && (this.#s = {
					x: e.clientX,
					y: e.clientY
				}, this.#r || this.#d(e, "content"));
			}, i = (e) => {
				l_(e) && this.#f(e, "content");
			}, a = (e) => {
				l_(e) && (this.#r || this.#d(e, "trigger"));
			}, o = (e) => {
				if (l_(e)) {
					if (Uf(e.relatedTarget)) {
						let n = this.#e.subContentSelector(), r = e.relatedTarget.closest(n);
						if (r && r !== t && r.id && t.querySelector(`[aria-controls="${r.id}"]`)) return;
					}
					this.#f(e, "trigger");
				}
			}, s = (e) => {
				l_(e) && this.#m();
			}, c = (e) => {
				l_(e) && this.#m();
			};
			return e.addEventListener("pointermove", r), e.addEventListener("pointerleave", i), e.addEventListener("pointerenter", s), t.addEventListener("pointermove", a), t.addEventListener("pointerleave", o), t.addEventListener("pointerenter", c), () => {
				e.removeEventListener("pointermove", r), e.removeEventListener("pointerleave", i), e.removeEventListener("pointerenter", s), t.removeEventListener("pointermove", a), t.removeEventListener("pointerleave", o), t.removeEventListener("pointerenter", c), this.#_();
			};
		}), af(() => {
			this.#_();
		});
	}
	#c() {
		let e = this.#e.parentContentNode();
		return e ? e.getBoundingClientRect() : this.#e.triggerNode()?.getBoundingClientRect() ?? null;
	}
	#l(e, t) {
		let n = this.#e.triggerNode(), r = this.#e.contentNode();
		if (!n || !r) return null;
		let i = n.getBoundingClientRect(), a = r.getBoundingClientRect(), o = S_(i, a), s, c, l;
		return t === "content" ? (s = this.#r ? this.#a ?? e : e, c = a) : (s = this.#s ?? e, c = this.#c() ?? i, l = a), this.#a = s, {
			corridor: C_(i, a, o),
			intent: w_(s, c, o, t, l),
			targetRect: c,
			side: o
		};
	}
	#u(e, t, n) {
		return y_(e, t) || y_(e, n);
	}
	#d(e, t) {
		let n = {
			x: e.clientX,
			y: e.clientY
		};
		this.#l(n, t) && (this.#i = t, this.#o = n);
	}
	#f(e, t) {
		if (!this.#e.enabled()) return;
		let n = this.#e.triggerNode(), r = this.#e.contentNode();
		if (!n || !r) return;
		let i = e.relatedTarget;
		if (Uf(i) && (t === "content" && r.contains(i) || t === "trigger" && n.contains(i))) return;
		let a = {
			x: e.clientX,
			y: e.clientY
		}, o = this.#l(a, t);
		if (o) {
			if (!b_(a, o.targetRect) && !this.#u(a, o.corridor, o.intent)) {
				this.#w();
				return;
			}
			this.#r = !0, this.#i = t, this.#o = a, this.#e.setIsPointerInTransit(!0), this.#b(), this.#S();
		}
	}
	#p = null;
	#m() {
		if (!this.#r) return;
		let e = this.#i === "trigger";
		this.#x(), this.#C(), this.#r = !1, this.#w(), e ? (this.#h(), this.#p = setTimeout(() => {
			this.#p = null, this.#e.setIsPointerInTransit(!1);
		}, 100)) : this.#e.setIsPointerInTransit(!1);
	}
	#h() {
		this.#p !== null && (clearTimeout(this.#p), this.#p = null);
	}
	#g() {
		let e = this.#o;
		this.#x(), this.#C(), this.#h(), this.#r = !1, this.#e.setIsPointerInTransit(!1), this.#w(), this.#e.onIntentExit(e);
	}
	#_() {
		this.#x(), this.#C(), this.#h(), this.#r && this.#e.setIsPointerInTransit(!1), this.#r = !1, this.#i = null, this.#a = null, this.#o = null, this.#s = null;
	}
	#v(e) {
		let t = this.#e.contentNode();
		if (!t) return !1;
		let n = t.ownerDocument.elementFromPoint(e.x, e.y);
		if (!n) return !1;
		let r = this.#e.subContentSelector(), i = n.closest(r);
		return !i || i === t ? !1 : i.id ? !!t.querySelector(`[aria-controls="${i.id}"]`) : !1;
	}
	#y = (e) => {
		if (!this.#r || !this.#i || !l_(e)) return;
		let t = this.#e.triggerNode(), n = this.#e.contentNode();
		if (!t || !n) {
			this.#g();
			return;
		}
		this.#C();
		let r = {
			x: e.clientX,
			y: e.clientY
		};
		this.#o = r;
		let i = t.getBoundingClientRect(), a = n.getBoundingClientRect();
		if (this.#i === "content" && b_(r, a)) {
			this.#m();
			return;
		}
		if (this.#i === "trigger" && x_(r, i, 4)) {
			this.#m();
			return;
		}
		if (this.#v(r)) {
			this.#S();
			return;
		}
		let o = this.#l(r, this.#i);
		if (!o) {
			this.#g();
			return;
		}
		if (this.#u(r, o.corridor, o.intent)) {
			this.#S();
			return;
		}
		this.#g();
	};
	#b() {
		if (this.#t) return;
		let e = gf(this.#e.triggerNode() ?? this.#e.contentNode());
		e && (e.addEventListener("pointermove", this.#y, !0), this.#t = () => {
			e.removeEventListener("pointermove", this.#y, !0), this.#t = null;
		});
	}
	#x() {
		this.#t?.();
	}
	#S() {
		this.#C(), this.#n = setTimeout(() => {
			this.#n = null, this.#r && this.#g();
		}, 500);
	}
	#C() {
		this.#n !== null && (clearTimeout(this.#n), this.#n = null);
	}
	#w() {
		this.#i = null, this.#a = null, this.#o = null;
	}
};
function y_(e, t) {
	let { x: n, y: r } = e, i = !1;
	for (let e = 0, a = t.length - 1; e < t.length; a = e++) {
		let o = t[e].x, s = t[e].y, c = t[a].x, l = t[a].y;
		s > r != l > r && n < (c - o) * (r - s) / (l - s) + o && (i = !i);
	}
	return i;
}
function b_(e, t) {
	return e.x >= t.left && e.x <= t.right && e.y >= t.top && e.y <= t.bottom;
}
function x_(e, t, n) {
	return e.x >= t.left + n && e.x <= t.right - n && e.y >= t.top + n && e.y <= t.bottom - n;
}
function S_(e, t) {
	let n = e.left + e.width / 2, r = e.top + e.height / 2, i = t.left + t.width / 2, a = t.top + t.height / 2, o = i - n, s = a - r;
	return Math.abs(o) > Math.abs(s) ? o > 0 ? "right" : "left" : s > 0 ? "bottom" : "top";
}
function C_(e, t, n) {
	switch (n) {
		case "top": return [
			{
				x: Math.min(e.left, t.left) - 2,
				y: e.top
			},
			{
				x: Math.min(e.left, t.left) - 2,
				y: t.bottom
			},
			{
				x: Math.max(e.right, t.right) + 2,
				y: t.bottom
			},
			{
				x: Math.max(e.right, t.right) + 2,
				y: e.top
			}
		];
		case "bottom": return [
			{
				x: Math.min(e.left, t.left) - 2,
				y: e.bottom
			},
			{
				x: Math.min(e.left, t.left) - 2,
				y: t.top
			},
			{
				x: Math.max(e.right, t.right) + 2,
				y: t.top
			},
			{
				x: Math.max(e.right, t.right) + 2,
				y: e.bottom
			}
		];
		case "left": return [
			{
				x: e.left,
				y: Math.min(e.top, t.top) - 2
			},
			{
				x: t.right,
				y: Math.min(e.top, t.top) - 2
			},
			{
				x: t.right,
				y: Math.max(e.bottom, t.bottom) + 2
			},
			{
				x: e.left,
				y: Math.max(e.bottom, t.bottom) + 2
			}
		];
		case "right": return [
			{
				x: e.right,
				y: Math.min(e.top, t.top) - 2
			},
			{
				x: t.left,
				y: Math.min(e.top, t.top) - 2
			},
			{
				x: t.left,
				y: Math.max(e.bottom, t.bottom) + 2
			},
			{
				x: e.right,
				y: Math.max(e.bottom, t.bottom) + 2
			}
		];
	}
}
function w_(e, t, n, r, i) {
	let a = r === "trigger" ? T_(n) : n, o = i ? Math.min(t.top, i.top) - 8 : t.top - 8, s = i ? Math.max(t.bottom, i.bottom) + 8 : t.bottom + 8, c = i ? Math.min(t.left, i.left) - 8 : t.left - 8, l = i ? Math.max(t.right, i.right) + 8 : t.right + 8;
	switch (a) {
		case "right": return [
			e,
			{
				x: t.left,
				y: o
			},
			{
				x: t.left,
				y: s
			}
		];
		case "left": return [
			e,
			{
				x: t.right,
				y: o
			},
			{
				x: t.right,
				y: s
			}
		];
		case "bottom": return [
			e,
			{
				x: c,
				y: t.top
			},
			{
				x: l,
				y: t.top
			}
		];
		case "top": return [
			e,
			{
				x: c,
				y: t.bottom
			},
			{
				x: l,
				y: t.bottom
			}
		];
	}
}
function T_(e) {
	switch (e) {
		case "top": return "bottom";
		case "bottom": return "top";
		case "left": return "right";
		case "right": return "left";
	}
}
var E_ = class e {
	static create(t) {
		return g_.set(new e(t, h_.get()));
	}
	opts;
	parentMenu;
	rovingFocusGroup;
	domContext;
	attachment;
	#e = /* @__PURE__ */ L("");
	get search() {
		return H(this.#e);
	}
	set search(e) {
		R(this.#e, e, !0);
	}
	#t = 0;
	#n;
	#r = /* @__PURE__ */ L(!1);
	get mounted() {
		return H(this.#r);
	}
	set mounted(e) {
		R(this.#r, e, !0);
	}
	#i;
	constructor(e, t) {
		this.opts = e, this.parentMenu = t, this.domContext = new yf(e.ref), this.attachment = bf(this.opts.ref, (e) => {
			this.parentMenu.contentNode !== e && (this.parentMenu.contentNode = e);
		}), t.contentId = e.id, this.#i = e.isSub ?? !1, this.onkeydown = this.onkeydown.bind(this), this.onblur = this.onblur.bind(this), this.onfocus = this.onfocus.bind(this), this.handleInteractOutside = this.handleInteractOutside.bind(this), new v_({
			contentNode: () => this.parentMenu.contentNode,
			triggerNode: () => this.parentMenu.triggerNode,
			parentContentNode: () => this.parentMenu.parentMenu?.contentNode ?? null,
			subContentSelector: () => `[${this.parentMenu.root.getBitsAttr("sub-content")}]`,
			enabled: () => this.parentMenu.opts.open.current && !!this.parentMenu.triggerNode?.hasAttribute(this.parentMenu.root.getBitsAttr("sub-trigger")),
			onIntentExit: (e) => {
				this.parentMenu.opts.open.current = !1, this.#s(e);
			},
			setIsPointerInTransit: (e) => {
				this.parentMenu.root.isPointerInTransit = e;
			}
		}), this.#n = new Vm({
			getActiveElement: () => this.domContext.getActiveElement(),
			getWindow: () => this.domContext.getWindow()
		}).handleTypeaheadSearch, this.rovingFocusGroup = new Jf({
			rootNode: Q(() => this.parentMenu.contentNode),
			candidateAttr: this.parentMenu.root.getBitsAttr("item"),
			loop: this.opts.loop,
			orientation: Q(() => "vertical")
		}), ef(() => this.parentMenu.contentNode, (e) => e ? __.listen(e, () => {
			of(() => {
				this.parentMenu.root.isUsingKeyboard.current && this.rovingFocusGroup.focusFirstCandidate();
			});
		}) : void 0), wn(() => {
			this.parentMenu.opts.open.current || this.domContext.getWindow().clearTimeout(this.#t);
		});
	}
	#a() {
		let e = this.parentMenu.contentNode;
		return e ? Array.from(e.querySelectorAll(`[${this.parentMenu.root.getBitsAttr("item")}]:not([data-disabled])`)) : [];
	}
	#o() {
		return this.parentMenu.root.isPointerInTransit;
	}
	#s(e) {
		if (!e) return;
		let t = this.parentMenu.parentMenu?.contentNode;
		if (!t) return;
		let n = this.domContext.getDocument().elementFromPoint(e.x, e.y);
		if (!Uf(n)) return;
		let r = n.closest(`[${this.parentMenu.root.getBitsAttr("sub-trigger")}]`);
		r && t.contains(r) && r !== this.parentMenu.triggerNode && r.dispatchEvent(new PointerEvent("pointermove", {
			bubbles: !0,
			cancelable: !0,
			pointerType: "mouse",
			clientX: e.x,
			clientY: e.y
		}));
	}
	onCloseAutoFocus = (e) => {
		if (this.opts.onCloseAutoFocus.current?.(e), !(e.defaultPrevented || this.#i)) {
			if (this.parentMenu.root.ignoreCloseAutoFocus) {
				e.preventDefault();
				return;
			}
			this.parentMenu.triggerNode && em(this.parentMenu.triggerNode) && (e.preventDefault(), this.parentMenu.triggerNode.focus());
		}
	};
	handleTabKeyDown(e) {
		let t = this.parentMenu;
		for (; t.parentMenu !== null;) t = t.parentMenu;
		if (!t.triggerNode) return;
		e.preventDefault();
		let n = p_(t.triggerNode, e.shiftKey ? "prev" : "next");
		n ? (this.parentMenu.root.ignoreCloseAutoFocus = !0, t.onClose(), of(() => {
			n.focus(), of(() => {
				this.parentMenu.root.ignoreCloseAutoFocus = !1;
			});
		})) : this.domContext.getDocument().body.focus();
	}
	onkeydown(e) {
		if (e.defaultPrevented) return;
		if (e.key === "Tab") {
			this.handleTabKeyDown(e);
			return;
		}
		let t = e.target, n = e.currentTarget;
		if (!Hf(t) || !Hf(n)) return;
		let r = t.closest(`[${this.parentMenu.root.getBitsAttr("content")}]`)?.id === this.parentMenu.contentId.current, i = e.ctrlKey || e.altKey || e.metaKey, a = e.key.length === 1;
		if (this.rovingFocusGroup.handleKeydown(t, e) || e.code === "Space") return;
		let o = this.#a();
		r && !i && a && this.#n(e.key, o), e.target?.id === this.parentMenu.contentId.current && c_.includes(e.key) && (e.preventDefault(), s_.includes(e.key) && o.reverse(), d_(o, { select: !1 }, () => this.domContext.getActiveElement()));
	}
	onblur(e) {
		Uf(e.currentTarget) && Uf(e.target) && (e.currentTarget.contains?.(e.target) || (this.domContext.getWindow().clearTimeout(this.#t), this.search = ""));
	}
	onfocus(e) {
		this.parentMenu.root.isUsingKeyboard.current && of(() => this.rovingFocusGroup.focusFirstCandidate());
	}
	onItemEnter() {
		return this.#o();
	}
	onItemLeave(e) {
		e.currentTarget.hasAttribute(this.parentMenu.root.getBitsAttr("sub-trigger")) || this.#o() || this.parentMenu.root.isUsingKeyboard.current || (this.parentMenu.contentNode?.focus({ preventScroll: !0 }), this.rovingFocusGroup.setCurrentTabStopId(""));
	}
	onTriggerLeave() {
		return !!this.#o();
	}
	handleInteractOutside(e) {
		if (!Wf(e.target)) return;
		let t = this.parentMenu.triggerNode?.id;
		if (e.target.id === t) {
			e.preventDefault();
			return;
		}
		if (e.target.closest(`#${t}`)) {
			e.preventDefault();
			return;
		}
		this.parentMenu.root.ignoreCloseAutoFocus = !0, of(() => {
			this.parentMenu.root.ignoreCloseAutoFocus = !1;
		});
	}
	get shouldRender() {
		return this.parentMenu.contentPresence.shouldRender;
	}
	#c = /* @__PURE__ */ F(() => ({ open: this.parentMenu.opts.open.current }));
	get snippetProps() {
		return H(this.#c);
	}
	set snippetProps(e) {
		R(this.#c, e);
	}
	#l = /* @__PURE__ */ F(() => ({
		id: this.opts.id.current,
		role: "menu",
		"aria-orientation": "vertical",
		[this.parentMenu.root.getBitsAttr("content")]: "",
		"data-state": xf(this.parentMenu.opts.open.current),
		...Sf(this.parentMenu.contentPresence.transitionStatus),
		onkeydown: this.onkeydown,
		onblur: this.onblur,
		onfocus: this.onfocus,
		dir: this.parentMenu.root.opts.dir.current,
		style: {
			pointerEvents: "auto",
			contain: "layout style"
		},
		...this.attachment
	}));
	get props() {
		return H(this.#l);
	}
	set props(e) {
		R(this.#l, e);
	}
	popperProps = { onCloseAutoFocus: (e) => this.onCloseAutoFocus(e) };
}, D_ = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy",
	"id",
	"child",
	"children",
	"ref",
	"loop",
	"onInteractOutside",
	"onCloseAutoFocus",
	"onOpenAutoFocus",
	"preventScroll",
	"side",
	"sideOffset",
	"align",
	"onEscapeKeydown",
	"forceMount",
	"trapFocus",
	"style"
]), O_ = /* @__PURE__ */ Fr("<div><div><!></div></div>");
function k_(e, t) {
	qe(t, !0);
	let n = G(t, "id", 19, fm), r = G(t, "ref", 15, null), i = G(t, "loop", 3, !0), a = G(t, "onInteractOutside", 3, Zf), o = G(t, "onCloseAutoFocus", 3, Zf), s = G(t, "onOpenAutoFocus", 3, Zf), c = G(t, "preventScroll", 3, !0), l = G(t, "side", 3, "right"), u = G(t, "sideOffset", 3, 2), d = G(t, "align", 3, "start"), f = G(t, "onEscapeKeydown", 3, Zf), p = G(t, "forceMount", 3, !1), m = G(t, "trapFocus", 3, !1), h = /* @__PURE__ */ sa(t, D_), _ = E_.create({
		id: Q(() => n()),
		loop: Q(() => i()),
		ref: Q(() => r(), (e) => r(e)),
		onCloseAutoFocus: Q(() => o())
	}), v = /* @__PURE__ */ F(() => qd(h, _.props, {
		side: l(),
		sideOffset: u(),
		align: d(),
		onOpenAutoFocus: s(),
		isValidEvent: x,
		trapFocus: m(),
		loop: i(),
		id: n(),
		ref: _.opts.ref,
		preventScroll: c(),
		onInteractOutside: y,
		onEscapeKeydown: b,
		shouldRender: _.shouldRender
	}));
	function y(e) {
		if (a()(e), !e.defaultPrevented) {
			if (e.target && e.target instanceof Element) {
				let t = `[${_.parentMenu.root.getBitsAttr("sub-content")}]`;
				if (e.target.closest(t)) return;
			}
			_.parentMenu.onClose();
		}
	}
	function b(e) {
		f()(e), !e.defaultPrevented && _.parentMenu.onClose();
	}
	function x(e) {
		if ("button" in e && e.button === 2) {
			let t = e.target;
			return t ? t.closest(`[${fp}]`) !== _.parentMenu.triggerNode : !1;
		}
		return !1;
	}
	var S = U(), C = z(S), w = (e) => {
		i_(e, la(() => H(v), () => _.popperProps, {
			get enabled() {
				return _.parentMenu.opts.open.current;
			},
			popper: (e, n) => {
				let r = () => (n?.()).props, i = () => (n?.()).wrapperProps, a = /* @__PURE__ */ F(() => qd(r(), { style: Rm("context-menu") }, { style: t.style }));
				var o = U(), s = z(o), c = (e) => {
					var n = U(), r = z(n);
					{
						let e = /* @__PURE__ */ F(() => ({
							props: H(a),
							wrapperProps: i(),
							..._.snippetProps
						}));
						ii(r, () => t.child, () => H(e));
					}
					W(e, n);
				}, l = (e) => {
					var n = O_();
					Qi(n, () => ({ ...i() }));
					var r = dn(n);
					Qi(r, () => ({ ...H(a) })), ii(dn(r), () => t.children ?? g), ve(r), ve(n), W(e, n);
				};
				si(s, (e) => {
					t.child ? e(c) : e(l, -1);
				}), W(e, o);
			},
			$$slots: { popper: !0 }
		}));
	}, T = (e) => {
		n_(e, la(() => H(v), () => _.popperProps, {
			get open() {
				return _.parentMenu.opts.open.current;
			},
			popper: (e, n) => {
				let r = () => (n?.()).props, i = () => (n?.()).wrapperProps, a = /* @__PURE__ */ F(() => qd(r(), { style: Rm("context-menu") }, { style: t.style }));
				var o = U(), s = z(o), c = (e) => {
					var n = U(), r = z(n);
					{
						let e = /* @__PURE__ */ F(() => ({
							props: H(a),
							wrapperProps: i(),
							..._.snippetProps
						}));
						ii(r, () => t.child, () => H(e));
					}
					W(e, n);
				}, l = (e) => {
					var n = O_();
					Qi(n, () => ({ ...i() }));
					var r = dn(n);
					Qi(r, () => ({ ...H(a) })), ii(dn(r), () => t.children ?? g), ve(r), ve(n), W(e, n);
				};
				si(s, (e) => {
					t.child ? e(c) : e(l, -1);
				}), W(e, o);
			},
			$$slots: { popper: !0 }
		}));
	};
	si(C, (e) => {
		p() ? e(w) : p() || e(T, 1);
	}), W(e, S), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/internal/safe-polygon.svelte.js
function A_(e, t) {
	let [n, r] = e, i = !1, a = t.length;
	for (let e = 0, o = a - 1; e < a; o = e++) {
		let [a, s] = t[e] ?? [0, 0], [c, l] = t[o] ?? [0, 0];
		s >= r != l >= r && n <= (c - a) * (r - s) / (l - s) + a && (i = !i);
	}
	return i;
}
function j_(e, t) {
	return e[0] >= t.left && e[0] <= t.right && e[1] >= t.top && e[1] <= t.bottom;
}
function M_(e, t) {
	let n = e.left + e.width / 2, r = e.top + e.height / 2, i = t.left + t.width / 2, a = t.top + t.height / 2, o = i - n, s = a - r;
	return Math.abs(o) > Math.abs(s) ? o > 0 ? "right" : "left" : s > 0 ? "bottom" : "top";
}
var N_ = class {
	#e;
	#t;
	#n;
	#r = null;
	#i = null;
	#a = [];
	#o = null;
	#s = null;
	#c = null;
	#l() {
		this.#s !== null && (cancelAnimationFrame(this.#s), this.#s = null);
	}
	#u() {
		this.#l(), this.#s = requestAnimationFrame(() => {
			this.#s = null, this.#r && this.#i && (this.#m(), this.#e.onPointerExit());
		});
	}
	#d() {
		this.#c !== null && (clearTimeout(this.#c), this.#c = null);
	}
	#f() {
		this.#n !== null && (this.#d(), this.#c = window.setTimeout(() => {
			this.#c = null, this.#r && this.#i && (this.#m(), this.#e.onPointerExit());
		}, this.#n));
	}
	constructor(e) {
		this.#e = e, this.#t = e.buffer ?? 1;
		let t = e.transitIntentTimeout;
		this.#n = typeof t == "number" && t > 0 ? t : null, ef([
			e.triggerNode,
			e.contentNode,
			e.enabled
		], ([e, t, n]) => {
			if (!e || !t || !n) {
				this.#o = null, this.#m();
				return;
			}
			return this.#o && this.#o !== e && this.#m(), this.#o = e, [
				Tr(gf(e), "pointermove", (n) => {
					this.#p([n.clientX, n.clientY], e, t);
				}),
				Tr(e, "pointerleave", (e) => {
					let n = e.relatedTarget;
					if (Uf(n) && t.contains(n)) return;
					let r = this.#e.ignoredTargets?.() ?? [];
					Uf(n) && r.some((e) => e === n || e.contains(n)) || (this.#a = Uf(n) && r.length > 0 ? r.filter((e) => n.contains(e)) : [], this.#r = [e.clientX, e.clientY], this.#i = "content", this.#u());
				}),
				Tr(e, "pointerenter", () => {
					this.#m();
				}),
				Tr(t, "pointerenter", () => {
					this.#m();
				}),
				Tr(t, "pointerleave", (t) => {
					let n = t.relatedTarget;
					Uf(n) && e.contains(n) || (this.#r = [t.clientX, t.clientY], this.#i = "trigger", this.#u());
				})
			].reduce((e, t) => () => {
				e(), t();
			}, () => {});
		});
	}
	#p(e, t, n) {
		if (!this.#r || !this.#i) return;
		this.#l(), this.#f();
		let r = t.getBoundingClientRect(), i = n.getBoundingClientRect();
		if (this.#i === "content" && j_(e, i)) {
			this.#m();
			return;
		}
		if (this.#i === "trigger" && j_(e, r)) {
			this.#m();
			return;
		}
		if (this.#i === "content" && this.#a.length > 0) for (let t of this.#a) {
			let n = t.getBoundingClientRect();
			if (j_(e, n)) return;
			let i = M_(r, n), a = this.#h(r, n, i);
			if (a && A_(e, a)) return;
		}
		let a = M_(r, i), o = this.#h(r, i, a);
		if (o && A_(e, o)) return;
		let s = this.#i === "content" ? i : r;
		A_(e, this.#g(this.#r, s, a, this.#i)) || (this.#m(), this.#e.onPointerExit());
	}
	#m() {
		this.#r = null, this.#i = null, this.#a = [], this.#l(), this.#d();
	}
	#h(e, t, n) {
		let r = this.#t;
		switch (n) {
			case "top": return [
				[Math.min(e.left, t.left) - r, e.top],
				[Math.min(e.left, t.left) - r, t.bottom],
				[Math.max(e.right, t.right) + r, t.bottom],
				[Math.max(e.right, t.right) + r, e.top]
			];
			case "bottom": return [
				[Math.min(e.left, t.left) - r, e.bottom],
				[Math.min(e.left, t.left) - r, t.top],
				[Math.max(e.right, t.right) + r, t.top],
				[Math.max(e.right, t.right) + r, e.bottom]
			];
			case "left": return [
				[e.left, Math.min(e.top, t.top) - r],
				[t.right, Math.min(e.top, t.top) - r],
				[t.right, Math.max(e.bottom, t.bottom) + r],
				[e.left, Math.max(e.bottom, t.bottom) + r]
			];
			case "right": return [
				[e.right, Math.min(e.top, t.top) - r],
				[t.left, Math.min(e.top, t.top) - r],
				[t.left, Math.max(e.bottom, t.bottom) + r],
				[e.right, Math.max(e.bottom, t.bottom) + r]
			];
		}
	}
	#g(e, t, n, r) {
		let i = this.#t * 4, [a, o] = e;
		switch (r === "trigger" ? this.#_(n) : n) {
			case "top": return [
				[a - i, o + i],
				[a + i, o + i],
				[t.right + i, t.bottom],
				[t.right + i, t.top],
				[t.left - i, t.top],
				[t.left - i, t.bottom]
			];
			case "bottom": return [
				[a - i, o - i],
				[a + i, o - i],
				[t.right + i, t.top],
				[t.right + i, t.bottom],
				[t.left - i, t.bottom],
				[t.left - i, t.top]
			];
			case "left": return [
				[a + i, o - i],
				[a + i, o + i],
				[t.right, t.bottom + i],
				[t.left, t.bottom + i],
				[t.left, t.top - i],
				[t.right, t.top - i]
			];
			case "right": return [
				[a - i, o - i],
				[a - i, o + i],
				[t.left, t.bottom + i],
				[t.right, t.bottom + i],
				[t.right, t.top - i],
				[t.left, t.top - i]
			];
		}
	}
	#_(e) {
		switch (e) {
			case "top": return "bottom";
			case "bottom": return "top";
			case "left": return "right";
			case "right": return "left";
		}
	}
}, P_ = wf({
	component: "popover",
	parts: [
		"root",
		"trigger",
		"content",
		"close",
		"overlay"
	]
}), F_ = new Zd("Popover.Root"), I_ = class e {
	static create(t) {
		return F_.set(new e(t));
	}
	opts;
	#e = /* @__PURE__ */ L(null);
	get contentNode() {
		return H(this.#e);
	}
	set contentNode(e) {
		R(this.#e, e, !0);
	}
	contentPresence;
	#t = /* @__PURE__ */ L(null);
	get triggerNode() {
		return H(this.#t);
	}
	set triggerNode(e) {
		R(this.#t, e, !0);
	}
	#n = /* @__PURE__ */ L(null);
	get overlayNode() {
		return H(this.#n);
	}
	set overlayNode(e) {
		R(this.#n, e, !0);
	}
	overlayPresence;
	#r = /* @__PURE__ */ L(!1);
	get openedViaHover() {
		return H(this.#r);
	}
	set openedViaHover(e) {
		R(this.#r, e, !0);
	}
	#i = /* @__PURE__ */ L(!1);
	get hasInteractedWithContent() {
		return H(this.#i);
	}
	set hasInteractedWithContent(e) {
		R(this.#i, e, !0);
	}
	#a = /* @__PURE__ */ L(!1);
	get hoverCooldown() {
		return H(this.#a);
	}
	set hoverCooldown(e) {
		R(this.#a, e, !0);
	}
	#o = /* @__PURE__ */ L(0);
	get closeDelay() {
		return H(this.#o);
	}
	set closeDelay(e) {
		R(this.#o, e, !0);
	}
	#s = null;
	#c = null;
	constructor(e) {
		this.opts = e, this.contentPresence = new Xf({
			ref: Q(() => this.contentNode),
			open: this.opts.open,
			onComplete: () => {
				this.opts.onOpenChangeComplete.current(this.opts.open.current);
			}
		}), this.overlayPresence = new Xf({
			ref: Q(() => this.overlayNode),
			open: this.opts.open
		}), ef(() => this.opts.open.current, (e) => {
			e || (this.openedViaHover = !1, this.hasInteractedWithContent = !1, this.#l());
		});
	}
	setDomContext(e) {
		this.#c = e;
	}
	#l() {
		this.#s !== null && this.#c && (this.#c.clearTimeout(this.#s), this.#s = null);
	}
	toggleOpen() {
		this.#l(), this.opts.open.current = !this.opts.open.current;
	}
	handleClose() {
		this.#l(), this.opts.open.current && (this.opts.open.current = !1);
	}
	handleHoverOpen() {
		this.#l(), !this.opts.open.current && (this.openedViaHover = !0, this.opts.open.current = !0);
	}
	handleHoverClose() {
		this.opts.open.current && this.openedViaHover && !this.hasInteractedWithContent && (this.opts.open.current = !1);
	}
	handleDelayedHoverClose() {
		this.opts.open.current && this.openedViaHover && !this.hasInteractedWithContent && (this.#l(), this.closeDelay <= 0 ? this.opts.open.current = !1 : this.#c && (this.#s = this.#c.setTimeout(() => {
			this.openedViaHover && !this.hasInteractedWithContent && (this.opts.open.current = !1), this.#s = null;
		}, this.closeDelay)));
	}
	cancelDelayedClose() {
		this.#l();
	}
	markInteraction() {
		this.hasInteractedWithContent = !0, this.#l();
	}
}, L_ = class e {
	static create(t) {
		return new e(t, F_.get());
	}
	opts;
	root;
	attachment;
	constructor(e, t) {
		this.opts = e, this.root = t, this.attachment = bf(this.opts.ref, (e) => this.root.contentNode = e), this.onpointerdown = this.onpointerdown.bind(this), this.onfocusin = this.onfocusin.bind(this), this.onpointerenter = this.onpointerenter.bind(this), this.onpointerleave = this.onpointerleave.bind(this), new N_({
			triggerNode: () => this.root.triggerNode,
			contentNode: () => this.root.contentNode,
			enabled: () => this.root.opts.open.current && this.root.openedViaHover && !this.root.hasInteractedWithContent,
			onPointerExit: () => {
				this.root.handleDelayedHoverClose();
			}
		});
	}
	onpointerdown(e) {
		this.root.markInteraction();
	}
	onfocusin(e) {
		let t = e.target;
		Uf(t) && em(t) && this.root.markInteraction();
	}
	onpointerenter(e) {
		Gf(e) || this.root.cancelDelayedClose();
	}
	onpointerleave(e) {
		Gf(e);
	}
	onInteractOutside = (e) => {
		if (this.opts.onInteractOutside.current(e), e.defaultPrevented || !Uf(e.target)) return;
		let t = e.target.closest(P_.selector("trigger"));
		if (!(t && t === this.root.triggerNode)) {
			if (this.opts.customAnchor.current) {
				if (Uf(this.opts.customAnchor.current)) {
					if (this.opts.customAnchor.current.contains(e.target)) return;
				} else if (typeof this.opts.customAnchor.current == "string") {
					let t = document.querySelector(this.opts.customAnchor.current);
					if (t && t.contains(e.target)) return;
				}
			}
			this.root.handleClose();
		}
	};
	onEscapeKeydown = (e) => {
		this.opts.onEscapeKeydown.current(e), !e.defaultPrevented && this.root.handleClose();
	};
	get shouldRender() {
		return this.root.contentPresence.shouldRender;
	}
	get shouldTrapFocus() {
		return !(this.root.openedViaHover && !this.root.hasInteractedWithContent);
	}
	#e = /* @__PURE__ */ F(() => ({ open: this.root.opts.open.current }));
	get snippetProps() {
		return H(this.#e);
	}
	set snippetProps(e) {
		R(this.#e, e);
	}
	#t = /* @__PURE__ */ F(() => ({
		id: this.opts.id.current,
		tabindex: -1,
		"data-state": xf(this.root.opts.open.current),
		...Sf(this.root.contentPresence.transitionStatus),
		[P_.content]: "",
		style: {
			pointerEvents: "auto",
			contain: "layout style"
		},
		onpointerdown: this.onpointerdown,
		onfocusin: this.onfocusin,
		onpointerenter: this.onpointerenter,
		onpointerleave: this.onpointerleave,
		...this.attachment
	}));
	get props() {
		return H(this.#t);
	}
	set props(e) {
		R(this.#t, e);
	}
	popperProps = {
		onInteractOutside: this.onInteractOutside,
		onEscapeKeydown: this.onEscapeKeydown
	};
}, R_ = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy",
	"child",
	"children",
	"ref",
	"id",
	"forceMount",
	"onOpenAutoFocus",
	"onCloseAutoFocus",
	"onEscapeKeydown",
	"onInteractOutside",
	"trapFocus",
	"preventScroll",
	"customAnchor",
	"style"
]), z_ = /* @__PURE__ */ Fr("<div><div><!></div></div>");
function B_(e, t) {
	let n = Rr();
	qe(t, !0);
	let r = G(t, "ref", 15, null), i = G(t, "id", 19, () => Qf(n)), a = G(t, "forceMount", 3, !1), o = G(t, "onOpenAutoFocus", 3, Zf), s = G(t, "onCloseAutoFocus", 3, Zf), c = G(t, "onEscapeKeydown", 3, Zf), l = G(t, "onInteractOutside", 3, Zf), u = G(t, "trapFocus", 3, !0), d = G(t, "preventScroll", 3, !1), f = G(t, "customAnchor", 3, null), p = /* @__PURE__ */ sa(t, R_), m = L_.create({
		id: Q(() => i()),
		ref: Q(() => r(), (e) => r(e)),
		onInteractOutside: Q(() => l()),
		onEscapeKeydown: Q(() => c()),
		customAnchor: Q(() => f())
	}), h = /* @__PURE__ */ F(() => qd(p, m.props)), _ = /* @__PURE__ */ F(() => u() && m.shouldTrapFocus);
	function v(e) {
		m.shouldTrapFocus || e.preventDefault(), o()(e);
	}
	var y = U(), b = z(y), x = (e) => {
		i_(e, la(() => H(h), () => m.popperProps, {
			get ref() {
				return m.opts.ref;
			},
			get enabled() {
				return m.root.opts.open.current;
			},
			get id() {
				return i();
			},
			get trapFocus() {
				return H(_);
			},
			get preventScroll() {
				return d();
			},
			loop: !0,
			forceMount: !0,
			get customAnchor() {
				return f();
			},
			onOpenAutoFocus: v,
			get onCloseAutoFocus() {
				return s();
			},
			get shouldRender() {
				return m.shouldRender;
			},
			popper: (e, n) => {
				let r = () => (n?.()).props, i = () => (n?.()).wrapperProps, a = /* @__PURE__ */ F(() => qd(r(), { style: Rm("popover") }, { style: t.style }));
				var o = U(), s = z(o), c = (e) => {
					var n = U(), r = z(n);
					{
						let e = /* @__PURE__ */ F(() => ({
							props: H(a),
							wrapperProps: i(),
							...m.snippetProps
						}));
						ii(r, () => t.child, () => H(e));
					}
					W(e, n);
				}, l = (e) => {
					var n = z_();
					Qi(n, () => ({ ...i() }));
					var r = dn(n);
					Qi(r, () => ({ ...H(a) })), ii(dn(r), () => t.children ?? g), ve(r), ve(n), W(e, n);
				};
				si(s, (e) => {
					t.child ? e(c) : e(l, -1);
				}), W(e, o);
			},
			$$slots: { popper: !0 }
		}));
	}, S = (e) => {
		n_(e, la(() => H(h), () => m.popperProps, {
			get ref() {
				return m.opts.ref;
			},
			get open() {
				return m.root.opts.open.current;
			},
			get id() {
				return i();
			},
			get trapFocus() {
				return H(_);
			},
			get preventScroll() {
				return d();
			},
			loop: !0,
			forceMount: !1,
			get customAnchor() {
				return f();
			},
			onOpenAutoFocus: v,
			get onCloseAutoFocus() {
				return s();
			},
			get shouldRender() {
				return m.shouldRender;
			},
			popper: (e, n) => {
				let r = () => (n?.()).props, i = () => (n?.()).wrapperProps, a = /* @__PURE__ */ F(() => qd(r(), { style: Rm("popover") }, { style: t.style }));
				var o = U(), s = z(o), c = (e) => {
					var n = U(), r = z(n);
					{
						let e = /* @__PURE__ */ F(() => ({
							props: H(a),
							wrapperProps: i(),
							...m.snippetProps
						}));
						ii(r, () => t.child, () => H(e));
					}
					W(e, n);
				}, l = (e) => {
					var n = z_();
					Qi(n, () => ({ ...i() }));
					var r = dn(n);
					Qi(r, () => ({ ...H(a) })), ii(dn(r), () => t.children ?? g), ve(r), ve(n), W(e, n);
				};
				si(s, (e) => {
					t.child ? e(c) : e(l, -1);
				}), W(e, o);
			},
			$$slots: { popper: !0 }
		}));
	};
	si(b, (e) => {
		a() ? e(x) : a() || e(S, 1);
	}), W(e, y), Je();
}
//#endregion
//#region ../../node_modules/.bun/bits-ui@2.19.5+0f94339444b26649/node_modules/bits-ui/dist/bits/popover/components/popover.svelte
function V_(e, t) {
	qe(t, !0);
	let n = G(t, "open", 15, !1), r = G(t, "onOpenChange", 3, Zf), i = G(t, "onOpenChangeComplete", 3, Zf);
	I_.create({
		open: Q(() => n(), (e) => {
			n(e), r()(e);
		}),
		onOpenChangeComplete: Q(() => i())
	}), Pm(e, {
		children: (e, n) => {
			var r = U();
			ii(z(r), () => t.children ?? g), W(e, r);
		},
		$$slots: { default: !0 }
	}), Je();
}
//#endregion
//#region src/lib/components/ui/floating-presence.ts
function H_(e) {
	return e ? "auto" : "none";
}
function U_(e) {
	let t = !1, n = null;
	return {
		onInteractOutside: (r) => {
			e.onInteractOutside()?.(r);
			let i = r.target instanceof Element ? r.target : null;
			t = !(r.defaultPrevented || i?.closest("[data-bits-floating-content-wrapper]"));
			let a = e.content();
			n = a?.id ? document.querySelector(`[aria-controls="${CSS.escape(a.id)}"]`) : null;
		},
		onCloseAutoFocus: (r) => {
			e.onCloseAutoFocus()?.(r);
			let i = t;
			if (t = !1, !i || r.defaultPrevented) return;
			let a = e.content(), o = document.activeElement, s = o && o !== document.body && !a?.contains(o);
			(s || n) && r.preventDefault(), s || n?.focus({ preventScroll: !0 });
		}
	};
}
function W_(e) {
	let { shouldRender: t } = e;
	if (typeof t != "boolean") throw Error("bits-ui no longer hands its presence (`shouldRender`) to a forceMount content's child snippet: re-read bits-ui's popper-layer-force-mount.svelte and update floating-presence.ts");
	return t;
}
function G_(e) {
	let { shouldRender: t, ...n } = e;
	return n;
}
//#endregion
//#region src/lib/cawco/frame-observer.ts
var K_ = /* @__PURE__ */ new Map(), q_ = (e, t) => {
	let [n] = t === "border-box" ? e.borderBoxSize : e.contentBoxSize;
	return `${n?.inlineSize ?? 0}x${n?.blockSize ?? 0}`;
}, J_ = null, Y_ = globalThis.ResizeObserver, X_ = (e) => {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) for (let [e, r] of K_.get(n.target) ?? []) {
		let i = q_(n, r.box);
		i !== r.heard && (r.heard = i, e.delivered.push(n), t.add(e));
	}
	return t;
}, Z_ = (e) => {
	let t = [];
	for (let n of e.delivered) e.options.first && !e.reported.has(n.target) ? t.push(n) : e.take(n), e.reported.add(n.target);
	return t;
}, Q_ = (e, t) => {
	let n = e.delivered, r = Z_(e);
	for (let i of [r.length > 0 ? e.options.first?.(r) : void 0, e.options.inside?.(n)]) i && t.push(i);
}, $_ = (e) => {
	let t = [...X_(e)], n = t.filter((e) => !e.foreign);
	for (let e of n) e.options.read?.(e.delivered);
	let r = [];
	for (let e of n) Q_(e, r), e.delivered = [];
	for (let e of t) if (e.foreign) {
		let t = e.delivered;
		e.delivered = [], e.foreign(t);
	}
	for (let e of r) e();
}, ev = () => (J_ ??= new Y_($_), J_), tv = (e) => {
	let t = [...K_.get(e)?.values() ?? []].map((e) => e.box), n = ev();
	n.unobserve(e), n.observe(e, { box: t.includes("border-box") ? "border-box" : "content-box" });
}, nv = (e) => {
	let t = /* @__PURE__ */ new Set(), n = (n) => {
		let r = K_.get(n);
		r?.delete(e), r?.size === 0 && (K_.delete(n), J_?.unobserve(n)), t.delete(n);
	};
	return {
		observe: (n, r) => {
			let i = K_.get(n);
			i || (i = /* @__PURE__ */ new Map(), K_.set(n, i)), i.set(e, {
				box: r?.box ?? "content-box",
				heard: null
			}), t.add(n), tv(n);
		},
		release: n,
		releaseAll: () => {
			for (let e of [...t]) n(e);
		}
	};
};
Y_ && typeof window < "u" && (window.ResizeObserver = class {
	#e;
	constructor(e) {
		let t = {
			delivered: [],
			foreign: (t) => e(t, this),
			options: {},
			reported: /* @__PURE__ */ new WeakSet(),
			take: () => void 0
		};
		this.#e = nv(t);
	}
	observe(e, t) {
		this.#e.observe(e, t);
	}
	unobserve(e) {
		this.#e.release(e);
	}
	disconnect() {
		this.#e.releaseAll();
	}
});
function rv(e, t = {}) {
	let n = 0, r = /* @__PURE__ */ new Set(), i = () => {
		n === 0 && (n = requestAnimationFrame(() => {
			n = 0;
			let t = [...r];
			r.clear(), e(t);
		}));
	}, a = nv({
		delivered: [],
		options: t,
		reported: /* @__PURE__ */ new WeakSet(),
		take: (e) => {
			r.add(e.target), i();
		}
	});
	return {
		observe: a.observe,
		request: i,
		unobserve: (e) => {
			a.release(e), r.delete(e);
		},
		disconnect: () => {
			cancelAnimationFrame(n), n = 0, a.releaseAll(), r.clear();
		}
	};
}
//#endregion
//#region src/lib/utils/rendered.ts
function iv(e, t) {
	let n = !0, r = !1, i = !0, a = (e) => {
		e !== n && (n = e, t(e));
	}, o = !1, s = rv(() => a(o), {
		read: (e) => {
			for (let t of e) {
				let [e] = t.borderBoxSize;
				o = !!e && (e.inlineSize > 0 || e.blockSize > 0);
			}
		},
		first: () => (r = o, () => {
			r && a(!0);
		})
	});
	s.observe(e);
	let c = new IntersectionObserver(([t]) => {
		if (t.isIntersecting) {
			i = !1, a(!0);
			return;
		}
		if (i) {
			i = !1, a(r);
			return;
		}
		a(e.checkVisibility());
	});
	return c.observe(e), { stop: () => {
		c.disconnect(), s.disconnect();
	} };
}
//#endregion
//#region src/lib/components/ui/highlight/highlight.svelte.ts
var av = "\n[data-slot^=\"highlight-\"] {\n  pointer-events: none;\n  position: absolute;\n  top: 0;\n  left: 0;\n  z-index: -1;\n  translate: var(--hl-x) var(--hl-y);\n  opacity: var(--hl-show);\n  background-color: var(--color-selected-bg);\n}\n[data-slot=\"highlight-ghost\"] {\n  display: none;\n  background-color: var(--color-surface-hover);\n  transition: --hl-show var(--dur-control) var(--ease-out);\n}\n@media (hover: hover) {\n  [data-slot=\"highlight-ghost\"] {\n    display: block;\n  }\n}\n[data-slot=\"highlight-ghost\"][data-follow] {\n  display: block;\n}\n[data-slot=\"highlight-ghost\"][data-unseen] {\n  display: none;\n}\n[data-slot=\"highlight-pill\"][data-swap] {\n  transition: --hl-show var(--dur-fade) var(--ease-out);\n}\n[data-slot=\"highlight-trail\"][data-fade] {\n  transition: --hl-show var(--dur-control) var(--ease-out);\n}\n[data-slot=\"highlight-trail\"][data-fade][data-swap] {\n  transition: --hl-show var(--dur-fade) var(--ease-out);\n}\n@media (prefers-reduced-motion: no-preference) {\n  [data-slot=\"highlight-ghost\"][data-glide] {\n    transition:\n      --hl-x var(--dur-ghost) var(--ease-in-out),\n      --hl-y var(--dur-ghost) var(--ease-in-out),\n      width var(--dur-ghost) var(--ease-in-out),\n      height var(--dur-ghost) var(--ease-in-out),\n      --hl-show var(--dur-control) var(--ease-out);\n  }\n  [data-slot=\"highlight-pill\"][data-glide]:not([data-swap]) {\n    transition:\n      --hl-x var(--dur-control) var(--ease-drawer),\n      --hl-y var(--dur-control) var(--ease-drawer),\n      width var(--dur-control) var(--ease-drawer),\n      height var(--dur-control) var(--ease-drawer);\n  }\n}\n[data-highlight-frame] {\n  pointer-events: none;\n  position: absolute;\n  top: 0;\n  inset-inline: 0;\n  height: 1px;\n}\n:host([data-highlight=\"card\"]) :is([data-slot=\"highlight-pill\"], [data-slot=\"highlight-trail\"]) {\n  z-index: 1;\n  box-sizing: border-box;\n  border: var(--border-width) solid var(--color-brand-solid);\n  background-color: var(--color-surface-recess);\n}\n", ov = null, sv = () => (ov || (ov = new CSSStyleSheet(), ov.replaceSync(av)), ov), cv = (e) => {
	let t = e.shadowRoot ?? e.attachShadow({ mode: "open" });
	return t.adoptedStyleSheets.includes(sv()) || (t.adoptedStyleSheets = [...t.adoptedStyleSheets, sv()]), t.querySelector("slot") || t.append(document.createElement("slot")), t;
}, lv = 8, uv = .5, dv = .01, fv = 3, pv = 200, mv = 100, hv = [
	"transitionend",
	"transitioncancel",
	"animationend",
	"animationcancel"
], gv = (e) => {
	let t = [
		e.borderTopLeftRadius,
		e.borderTopRightRadius,
		e.borderBottomRightRadius,
		e.borderBottomLeftRadius
	].map((e) => e.split(" ")), n = t.map(([e = "0px"]) => e).join(" "), r = t.map(([e = "0px", t = e]) => t).join(" ");
	return n === r ? n : `${n} / ${r}`;
}, _v = (e) => {
	let t = document.createElement("span");
	return t.dataset.slot = e, t.setAttribute("aria-hidden", "true"), t;
}, vv = (e, t) => {
	e.style.setProperty("--hl-x", `${t.x}px`), e.style.setProperty("--hl-y", `${t.y}px`), e.style.width = `${t.w}px`, e.style.height = `${t.h}px`, e.style.borderRadius = t.r;
}, yv = (e, t) => {
	e.style.setProperty("--hl-show", t ? "1" : "0");
}, bv = (e, t) => {
	e.hasAttribute("data-glide") !== t && e.toggleAttribute("data-glide", t);
}, xv = (e, t, n = /* @__PURE__ */ new Map()) => {
	let r = 0, i = 0;
	for (let a = e; a && a !== t; a = a.parentElement) {
		let e = n.get(a);
		if (!e) {
			e = {
				x: 0,
				y: 0
			};
			let t = getComputedStyle(a);
			if (t.transform !== "none") {
				let n = new DOMMatrixReadOnly(t.transform);
				e.x += n.e, e.y += n.f;
			}
			if (t.translate !== "none") {
				let [n = "0", r = "0"] = t.translate.split(" ");
				e.x += Number.parseFloat(n), e.y += Number.parseFloat(r);
			}
			n.set(a, e);
		}
		r += e.x, i += e.y;
	}
	return {
		x: r,
		y: i
	};
}, Sv = (e, t) => Math.abs(e.x - t.x) > .001 || Math.abs(e.y - t.y) > .001 || Math.abs(e.w - t.w) > .001 || Math.abs(e.h - t.h) > .001, Cv = (e, t) => e !== null && t !== null && Math.abs(e.x - t.x) < .5 && Math.abs(e.y - t.y) < .5 && Math.abs(e.w - t.w) < .5 && Math.abs(e.h - t.h) < .5;
function wv(e) {
	return (t) => {
		let { rows: n, hovered: r, selected: i, covered: a, laidOut: o, axis: s = "y", ghost: c = !0, look: l } = e;
		t.dataset.highlight = l ?? "";
		let u = !t.classList.contains("isolate");
		t.classList.add("isolate");
		let d = _v("highlight-ghost"), f = _v("highlight-trail"), p = _v("highlight-pill");
		r && (d.dataset.follow = ""), c === "unseen" && (d.dataset.unseen = "");
		let m = document.createElement("span");
		m.dataset.highlightFrame = "", m.setAttribute("aria-hidden", "true"), cv(t).prepend(m, ...c ? [d] : [], f, p);
		let h = () => {
			let e = t.getBoundingClientRect(), n = getComputedStyle(t), r = (e, t) => {
				let n = Number.parseFloat(t);
				return n > 0 && Math.abs(e - n) > .01 ? e / n : 1;
			};
			return {
				left: e.left,
				top: e.top,
				borderLeft: t.clientLeft,
				borderTop: t.clientTop,
				sx: r(e.width, n.width),
				sy: r(e.height, n.height)
			};
		}, g = (e, n, r) => ({
			x: (n - e.left) / e.sx - e.borderLeft + t.scrollLeft,
			y: (r - e.top) / e.sy - e.borderTop + t.scrollTop,
			sx: e.sx,
			sy: e.sy
		}), _ = (e, t) => g(h(), e, t), v = (e, n) => {
			if (o) {
				let t = o().get(e);
				return t && {
					x: t.left,
					y: t.top,
					w: t.width,
					h: t.height
				};
			}
			let r = e.getBoundingClientRect(), i = xv(e, t, n), a = window.devicePixelRatio, s = (e) => Math.floor(e * a + dv) / a, c = (e) => Math.ceil(e * a - dv) / a, l = s(r.left - i.x), u = s(r.top - i.y), d = _(l, u);
			return {
				x: d.x,
				y: d.y,
				w: (c(r.right - i.x) - l) / d.sx,
				h: (c(r.bottom - i.y) - u) / d.sy
			};
		}, y = (e) => {
			let t = v(e);
			return t && {
				...t,
				r: gv(getComputedStyle(e))
			};
		}, b = (e) => e.offsetParent === null ? void 0 : y(e), x = () => [...t.querySelectorAll(n)].filter(j), S = !1, C = null, w = null, T = 0, E = null, ee = null, te = () => void 0, ne = () => {
			yv(d, !(a && w?.matches(a)));
		}, re = (e) => {
			if (!c || S) return;
			w !== e && (w?.removeAttribute("data-ghosted"), e?.setAttribute("data-ghosted", ""));
			let t = e && y(e);
			if (!(e && t)) {
				cancelAnimationFrame(D), e?.removeAttribute("data-ghosted"), yv(d, !1), w = null, te(), ie();
				return;
			}
			bv(d, w !== null), vv(d, t), C = t, w = e, te(), ne(), O(), ze();
		}, ie = () => {
			let e = () => {
				if (w === null) {
					for (let e of [
						"--hl-x",
						"--hl-y",
						"width",
						"height",
						"border-radius"
					]) d.style.removeProperty(e);
					C = null;
				}
			}, t = d.getAnimations().filter((e) => e instanceof CSSTransition && e.transitionProperty === "--hl-show");
			if (t.length === 0) {
				e();
				return;
			}
			Promise.all(t.map((e) => e.finished)).then(e, () => void 0);
		}, D = 0, O = () => {
			cancelAnimationFrame(D);
			let e = 0, t = () => {
				let n = w;
				if (!(n?.isConnected && C) || Ce || S) return;
				let r = y(n);
				r && Sv(r, C) ? (bv(d, !1), vv(d, r), C = r, e = 0) : e += 1, e < fv && (D = requestAnimationFrame(t));
			};
			D = requestAnimationFrame(t);
		}, ae = () => {
			if (!i) return null;
			let e = t.querySelector(i);
			return {
				row: e,
				box: e && b(e)
			};
		}, oe = (e, t = ae()) => {
			if (!t) return;
			let { row: n, box: r } = t;
			if (!(n && r)) {
				yv(p, !1), E = null, ee = null, te();
				return;
			}
			if (n === ee && Cv(r, E)) return;
			let i = n !== ee && (n === w && Cv(r, C) || n.hasAttribute("data-ghosted"));
			i && E && k(E), se(r, e && !i && E !== null && n !== ee), E = r, ee = n, te(), ze();
		}, k = (e) => {
			f.removeAttribute("data-fade"), f.removeAttribute("data-swap"), vv(f, e), yv(f, !0), requestAnimationFrame(() => {
				f.toggleAttribute("data-fade", !0), f.toggleAttribute("data-swap", ce.matches), yv(f, !1);
			});
		}, se = (e, t) => {
			if (t && E && ce.matches) {
				le(E, e);
				return;
			}
			p.removeAttribute("data-swap"), bv(p, t), vv(p, e), yv(p, !0);
		}, ce = matchMedia("(prefers-reduced-motion: reduce)"), le = (e, t) => {
			f.removeAttribute("data-fade"), f.removeAttribute("data-swap"), vv(f, e), yv(f, !0), p.removeAttribute("data-swap"), bv(p, !1), vv(p, t), yv(p, !1), requestAnimationFrame(() => {
				f.toggleAttribute("data-fade", !0), f.toggleAttribute("data-swap", !0), p.toggleAttribute("data-swap", !0), yv(f, !1), yv(p, !0);
			});
		}, ue = (e) => {
			S || oe(e);
		}, A = (e, t) => {
			let n = s === "y" ? 0 : lv, r = s === "x" ? 0 : lv;
			return t.x >= e.x - n && t.x <= e.x + e.w + n && t.y >= e.y - r && t.y <= e.y + e.h + r;
		}, j = (e) => t.contains(e) && !e.disabled && e.offsetParent !== null && (!o || o().has(e)), de = (e, t, n) => {
			let r = e.getBoundingClientRect(), i = Math.min(lv, r.width / 2), a = Math.min(1, r.height / 2), o = document.elementFromPoint(Math.min(r.right - i, Math.max(r.left + i, t)), Math.min(r.bottom - a, Math.max(r.top + a, n)));
			return o !== null && fe(o) === e;
		}, fe = (e) => {
			let r = e.closest(n);
			if (r) return r;
			for (let r = e; r && r !== t; r = r.parentElement) {
				let e = r.querySelectorAll(n);
				if (e.length > 0) return e.length === 1 ? e[0] : null;
			}
			return null;
		}, M = (e, n) => {
			let r = document.elementFromPoint(e, n);
			if (!(r && t.contains(r))) return null;
			let i = /* @__PURE__ */ new Map();
			return pe(r, i) ?? me(e, n, i);
		}, pe = (e, n) => {
			let r = fe(e);
			if (!(r && j(r))) return null;
			let i = xv(r, t, n);
			return Math.abs(i.x) <= uv && Math.abs(i.y) <= uv ? r : null;
		}, me = (e, t, n) => {
			let r = _(e, t), i = [];
			for (let e of x()) {
				let t = getComputedStyle(e).pointerEvents === "none" ? void 0 : v(e, n);
				if (!(t && A(t, r))) continue;
				let a = r.x - (t.x + t.w / 2), o = r.y - (t.y + t.h / 2), c = {
					x: Math.abs(a),
					y: Math.abs(o),
					xy: Math.hypot(a, o)
				}[s];
				i.push({
					distance: c,
					row: e
				});
			}
			return i.sort((e, t) => e.distance - t.distance), i.find(({ row: n }) => de(n, e, t))?.row ?? null;
		}, N = null, he = 0, P = (e, t = !1) => {
			if (r) return;
			cancelAnimationFrame(he), N = {
				x: e.clientX,
				y: e.clientY
			};
			let n = M(e.clientX, e.clientY);
			(t || n !== w) && re(n);
		}, ge = () => {
			let e = /* @__PURE__ */ new Map();
			return x().some((n) => {
				let r = xv(n, t, e);
				return Math.abs(r.x) > uv || Math.abs(r.y) > uv;
			});
		}, _e = () => {
			let e = N;
			if (r || !e) return;
			if (cancelAnimationFrame(he), M(e.x, e.y) === w && !ge()) {
				w && re(w);
				return;
			}
			re(null);
			let t = 0, n = () => {
				if (N === e) {
					if (t = ge() ? 0 : t + 1, t < fv) {
						he = requestAnimationFrame(n);
						return;
					}
					re(M(e.x, e.y));
				}
			};
			he = requestAnimationFrame(n);
		}, ve = (e) => {
			e.pointerType !== "touch" && P(e);
		}, ye = (e) => {
			e.pointerType !== "touch" && (N?.x === e.clientX && N.y === e.clientY ? _e() : P(e));
		}, be = () => {
			if (cancelAnimationFrame(he), Te(), N = null, !r) {
				let e = w?.isConnected ? y(w) : void 0;
				e && (bv(d, !1), vv(d, e), C = e), re(null);
			}
		}, xe = -Infinity, Se = () => {
			xe = performance.now();
		}, Ce = null, we, Te = () => {
			clearTimeout(we), Ce = null;
		}, Ee = (e) => {
			if (!Ce) {
				let e = /* @__PURE__ */ new Map();
				Ce = {
					frame: h(),
					rows: x().flatMap((t) => {
						let n = getComputedStyle(t).pointerEvents === "none" ? void 0 : v(t, e);
						return n ? [{
							row: t,
							box: n
						}] : [];
					})
				};
			}
			let t = g(Ce.frame, e.x, e.y), n = null, r = Infinity;
			for (let { row: e, box: i } of Ce.rows) {
				if (!A(i, t)) continue;
				let a = t.x - (i.x + i.w / 2), o = t.y - (i.y + i.h / 2), c = {
					x: Math.abs(a),
					y: Math.abs(o),
					xy: Math.hypot(a, o)
				}[s];
				c < r && (n = e, r = c);
			}
			n !== w && re(n), clearTimeout(we), we = setTimeout(() => {
				Ce = null, N && w && P({
					clientX: N.x,
					clientY: N.y
				}, !0);
			}, mv);
		}, De = () => {
			if (N) {
				if (performance.now() - xe < pv) {
					w && !r && (cancelAnimationFrame(he), Ee(N));
					return;
				}
				Te(), _e();
			}
		};
		t.addEventListener("pointermove", ve), t.addEventListener("pointerover", ye), t.addEventListener("pointerleave", be);
		let Oe = {
			capture: !0,
			passive: !0
		};
		t.addEventListener("wheel", Se, Oe), t.addEventListener("touchmove", Se, Oe), t.addEventListener("keydown", Se, Oe), t.addEventListener("scroll", De, Oe);
		let ke = new MutationObserver((e) => {
			if (e.some((e) => e.attributeName === "style") && Ie(), a && w && ne(), r) {
				let e = t.querySelector(r);
				cancelAnimationFrame(T), e ? re(e) : T = requestAnimationFrame(() => {
					t.querySelector(r) || re(null);
				});
			}
			cancelAnimationFrame(Ae), Ae = requestAnimationFrame(() => ue(!0));
		}), Ae = 0;
		ke.observe(t, {
			subtree: !0,
			childList: !0,
			attributes: !0,
			attributeFilter: [
				"aria-current",
				"aria-pressed",
				"aria-selected",
				"aria-checked",
				"data-state",
				"data-active",
				"data-highlighted",
				"data-selected",
				"style"
			]
		});
		let je = rv(() => Me(), { first: () => {
			if (S) return;
			let e = ae();
			return () => {
				S || oe(!1, e);
			};
		} }), Me = () => {
			if (Te(), S) return;
			ee = null, E = null, bv(p, !1), ue(!1);
			let e = w?.isConnected ? y(w) : void 0;
			e && (bv(d, !1), vv(d, e), C = e);
		};
		je.observe(m);
		let Ne = () => {
			if (S) return;
			let e = ee?.isConnected ? b(ee) : void 0;
			e && E && Sv(e, E) && (bv(p, !1), vv(p, e), E = e);
			let t = w?.isConnected ? y(w) : void 0;
			t && C && Sv(t, C) && (bv(d, !1), vv(d, t), C = t);
		}, Pe = /* @__PURE__ */ new Set(), Fe = rv(() => Ne()), Ie = () => Fe.request();
		te = () => {
			for (let e of Pe) e !== ee && e !== w && (Fe.unobserve(e), Pe.delete(e));
			for (let e of [ee, w]) e && !Pe.has(e) && (Pe.add(e), Fe.observe(e, { box: "border-box" }));
		}, te();
		let Le = (e) => {
			let { target: n } = e;
			n instanceof Element && n !== t && n.contains(t) && Ie();
		};
		for (let e of hv) document.addEventListener(e, Le, !0);
		let Re = /* @__PURE__ */ new WeakSet(), ze = () => {
			for (let e = t; e; e = e.parentElement) for (let t of e.getAnimations()) t.playState !== "finished" && !Re.has(t) && (Re.add(t), t.finished.then(Ie, () => void 0));
		}, Be = iv(m, (e) => {
			S = !e, Me();
		});
		return o && wn(() => {
			o(), br(() => {
				Te(), N && !r ? P({
					clientX: N.x,
					clientY: N.y
				}, !0) : w && re(w.isConnected ? w : null), ue(!0);
			});
		}), () => {
			Te(), cancelAnimationFrame(T), cancelAnimationFrame(Ae), cancelAnimationFrame(he), cancelAnimationFrame(D), t.removeEventListener("pointermove", ve), t.removeEventListener("pointerover", ye), t.removeEventListener("pointerleave", be), t.removeEventListener("wheel", Se, { capture: !0 }), t.removeEventListener("touchmove", Se, { capture: !0 }), t.removeEventListener("keydown", Se, { capture: !0 }), t.removeEventListener("scroll", De, { capture: !0 });
			for (let e of hv) document.removeEventListener(e, Le, !0);
			Fe.disconnect(), ke.disconnect(), je.disconnect(), Be.stop(), w?.removeAttribute("data-ghosted"), m.remove(), d.remove(), f.remove(), p.remove(), delete t.dataset.highlight, u && t.classList.remove("isolate");
		};
	};
}
//#endregion
//#region src/lib/cawco/motion/sizing.ts
var Tv = [
	"class",
	"hidden",
	"open",
	"data-state"
], Ev = (e = []) => ({
	childList: !0,
	characterData: !0,
	subtree: !0,
	attributes: !0,
	attributeFilter: [...Tv, ...e]
}), Dv = null;
function Ov(e, t = {}) {
	let n = Dv !== null && (t.close === !0 && Dv.pace.speed !== null || t.speed !== void 0 && Dv.pace.close);
	if (!Dv || n) {
		let e = {
			runs: /* @__PURE__ */ new Set(),
			pace: {
				close: !1,
				speed: null
			},
			since: null
		};
		Dv = e;
		let t = 0, n = () => {
			if (t += 1, t < (e.since === null ? 2 : 1)) {
				requestAnimationFrame(n);
				return;
			}
			Dv === e && (Dv = null);
			let r = e.since ?? Number(document.timeline.currentTime);
			for (let t of e.runs) t(r, e.pace);
		};
		requestAnimationFrame(n);
	}
	let r = Dv;
	return t.now && r.since === null && (r.since = Number(document.timeline.currentTime)), t.close && (r.pace.close = !0), t.speed !== void 0 && (r.pace.speed = Math.max(r.pace.speed ?? t.speed, t.least ?? t.speed)), r.runs.add(e), () => {
		r.runs.delete(e);
	};
}
function kv(e, t, n, r) {
	if (e.speed && r > 0) {
		let i = gu(r, e.speed);
		return {
			frames: i.frames(t, n),
			share: (e) => i.covered(e * i.duration) / r,
			timing: {
				duration: Math.max(1, i.duration),
				easing: "linear"
			}
		};
	}
	return {
		frames: [t, n],
		share: (e) => e,
		timing: e.close ? Nv() : Mv()
	};
}
var Av = (e) => {
	let { offset: t, easing: n, composite: r, computedOffset: i, ...a } = e;
	return a;
};
function jv(e, t) {
	return e.pause(), Ov((n, r) => {
		if (e.playState !== "paused") return;
		let i = e.effect;
		if (i && t !== void 0 && (r.speed || r.close)) {
			let [e, ...n] = i.getKeyframes(), a = kv(r, Av(e), Av(n.at(-1) ?? e), t);
			i.setKeyframes(a.frames), i.updateTiming(a.timing);
		}
		e.startTime = n;
	}), e;
}
var Mv = () => ({
	duration: du("--dur-panel"),
	easing: fu("--ease-in-out")
}), Nv = () => ({
	duration: du("--dur-exit"),
	easing: fu("--ease-in-out")
}), Pv = /* @__PURE__ */ new Set(), Fv = /* @__PURE__ */ new Set(), Iv = /* @__PURE__ */ new Map(), Lv = (e) => e.inert;
//#endregion
//#region src/lib/cawco/motion/morph.svelte.ts
function Rv(e, t) {
	let n = [], r = null;
	for (let [t, i] of Iv) {
		if (t === e || !e.contains(t)) continue;
		let a = (Lv(t) ? [["display", "none"]] : [
			["height", `${i.height}px`],
			["margin-block-end", `${i.margin}px`],
			...i.edges.map(([e, t]) => [e, `${t}px`])
		]).map(([e, n]) => {
			let r = [
				e,
				t.style.getPropertyValue(e),
				t.style.getPropertyPriority(e)
			];
			return t.style.setProperty(e, n, "important"), r;
		});
		n.push({
			el: t,
			props: a
		}), (!r || i.ms > r.ms) && (r = {
			ms: i.ms,
			easing: i.easing
		});
	}
	let i = t();
	for (let { el: e, props: t } of n) for (let [n, r, i] of t) e.style.setProperty(n, r, i);
	return {
		clock: r,
		value: i
	};
}
var zv = /* @__PURE__ */ new Set();
function Bv() {
	let e = [...zv];
	zv.clear();
	let t = e.map((e) => e.drawn());
	for (let t of e) t.stop();
	let n = e.map((e) => e.natural());
	e.forEach((e, r) => {
		let i = t[r];
		i && e.tween(i, n[r]);
	});
}
function Vv({ width: e = !1, ms: t, on: n = [], rows: r = !1, followUnfolds: i = !1, still: a } = {}) {
	return (o) => {
		let s = null, c, l, u = () => {
			if (r) {
				let e = o.getBoundingClientRect();
				return {
					w: e.width,
					h: e.height
				};
			}
			return {
				w: o.offsetWidth,
				h: o.offsetHeight
			};
		}, d = (e, n, i) => r ? jv(o.animate(e, {
			duration: du("--dur-panel"),
			easing: fu("--ease-in-out")
		}), n) : o.animate(e, i ? {
			duration: i.ms,
			easing: i.easing
		} : {
			duration: t ?? du("--dur-morph"),
			easing: mu.drawer
		}), f = () => {
			for (let e of Pv) if (e !== o && o.contains(e)) return !0;
			return !1;
		}, p = () => {
			for (let e of Iv.keys()) if (e !== o && o.contains(e)) return !0;
			return !1;
		}, m = (e) => {
			e !== o && o.contains(e) && g.stop();
		}, h = (t, n) => Math.max(Math.abs(n.h - t.h), e ? Math.abs(n.w - t.w) : 0), g = {
			drawn: () => c ? u() : s,
			natural: () => {
				let { clock: e, value: t } = Rv(o, () => ({
					size: u(),
					children: [...o.children].filter((e) => e instanceof HTMLElement && getComputedStyle(e).position !== "absolute").map((e) => {
						let t = e.getBoundingClientRect();
						return {
							child: e,
							blockSize: t.height,
							inlineSize: t.width
						};
					})
				}));
				return {
					...t,
					clock: e
				};
			},
			stop: () => {
				c?.cancel(), c = void 0, l?.(), l = void 0;
			},
			tween: (t, { size: n, children: r, clock: o }) => {
				if (!((Math.abs(n.h - t.h) > .5 || e && Math.abs(n.w - t.w) > .5) && ru.current) || a?.() || t.h === 0 || n.h === 0 || f() || i && p()) return;
				let s = [{
					height: `${t.h}px`,
					overflow: "hidden"
				}, {
					height: `${n.h}px`,
					overflow: "hidden"
				}];
				e && (s[0].width = `${t.w}px`, s[1].width = `${n.w}px`);
				let u = r.map(({ child: e, blockSize: t, inlineSize: n }) => ({
					child: e,
					blockSize: t,
					inlineSize: n,
					was: e.style.blockSize,
					wasInline: e.style.inlineSize,
					shrink: e.style.flexShrink
				}));
				for (let { child: t, blockSize: n, inlineSize: r } of u) t.style.flexShrink = "0", t.style.blockSize = `${n}px`, e && (t.style.inlineSize = `${r}px`);
				let m = d(s, h(t, n), o);
				c = m;
				let g = () => {
					for (let { child: t, was: n, wasInline: r, shrink: i } of u) t.style.flexShrink = i, t.style.blockSize = n, e && (t.style.inlineSize = r);
				};
				l = g;
				let _ = () => {
					c === m && (c = void 0, l = void 0, g());
				};
				m.finished.then(_, _);
			}
		}, _ = new ResizeObserver(([e]) => {
			let [t] = e.borderBoxSize;
			s = r ? {
				w: t.inlineSize,
				h: t.blockSize
			} : {
				w: Math.round(t.inlineSize),
				h: Math.round(t.blockSize)
			};
		});
		_.observe(o, { box: "border-box" });
		let v = (e) => {
			for (let t = e; t && t !== o; t = t.parentNode) if (t instanceof HTMLElement && t.style.position === "absolute") return !0;
			return !1;
		}, y = (e) => e.nodeType === Node.COMMENT_NODE || e.nodeType === Node.TEXT_NODE && !e.textContent?.trim(), b = (e) => !v(e.target) && (e.type !== "childList" || ![...e.addedNodes, ...e.removedNodes].every((e) => y(e) || v(e))), x = new MutationObserver((e) => {
			e.some(b) && (zv.size === 0 && queueMicrotask(Bv), zv.add(g));
		});
		return x.observe(o, Ev(n)), Fv.add(m), () => {
			Fv.delete(m), g.stop(), zv.delete(g), _.disconnect(), x.disconnect();
		};
	};
}
//#endregion
//#region src/lib/components/ui/popover/popover-portal.svelte
var Hv = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy"
]);
function Uv(e, t) {
	let n = /* @__PURE__ */ sa(t, Hv);
	var r = U();
	ui(z(r), () => op, (e, t) => {
		t(e, la(() => n));
	}), W(e, r);
}
//#endregion
//#region src/lib/components/ui/popover/popover-content.svelte
var Wv = "transition-opacity duration-(--dur-pop) ease-drawer [--kit-rise:0_calc(-1*var(--pop-rise))] side-left:[--kit-rise:var(--pop-rise)_0] side-right:[--kit-rise:calc(-1*var(--pop-rise))_0] side-top:[--kit-rise:0_var(--pop-rise)] data-closed:opacity-0 starting:data-open:opacity-0 data-closed:duration-(--dur-exit) motion-safe:data-closed:scale-(--pop-scale) motion-safe:starting:data-open:scale-(--pop-scale) motion-safe:[transition-property:opacity,translate,scale] motion-safe:data-closed:[translate:var(--kit-rise)] motion-safe:starting:data-open:[translate:var(--kit-rise)]", Gv = Xl({
	base: "rounded-lg concentric-in r-outer-lg border border-border-control bg-surface-raised p-c-floating-pad text-ink-strong shadow-overlay",
	variants: {
		motion: {
			pop: Wv,
			hang: "motion-reduce:transition-opacity motion-reduce:duration-(--dur-pop) motion-reduce:ease-drawer motion-reduce:data-closed:opacity-0 motion-reduce:starting:data-open:opacity-0 motion-reduce:data-closed:duration-(--dur-exit)"
		},
		edge: {
			own: "r-inset-c-inset-floating",
			drawn: "r-inset-c-floating-pad"
		}
	},
	defaultVariants: {
		motion: "pop",
		edge: "own"
	}
}), Kv = Xl({ variants: {
	width: {
		narrow: "w-64",
		wide: "w-80",
		widest: "w-96",
		room: "w-(--pop-w)"
	},
	height: {
		capped: "max-h-80",
		room: "max-h-(--pop-max-h)"
	},
	overflow: {
		scroll: "overflow-y-auto overscroll-contain",
		clip: "overflow-hidden"
	},
	pad: {
		none: "p-0",
		inset: "p-space-2",
		form: "p-3"
	},
	gap: {
		none: "gap-0",
		tight: "gap-space-1",
		snug: "gap-space-2",
		form: "gap-3"
	},
	frame: {
		panel: "rounded-lg shadow-lg",
		"panel-high": "rounded-lg shadow-xl",
		raised: "shadow-raised"
	},
	look: { "new-session": "ns-theme bg-surface-recess" }
} }), qv = /* @__PURE__ */ new Set(/* @__PURE__ */ "$$slots.$$events.$$legacy.ref.class.sideOffset.align.collisionPadding.portalProps.morphs.bare.ownWidth.width.height.overflow.pad.gap.frame.look.motion.forceMount.trapFocus.onInteractOutside.onCloseAutoFocus.child.children".split(".")), Jv = /* @__PURE__ */ Fr("<div><div><!></div></div>");
function Yv(e, t) {
	qe(t, !0);
	let n = G(t, "ref", 15, null), r = G(t, "sideOffset", 3, 4), i = G(t, "align", 3, "center"), a = G(t, "bare", 3, !1), o = G(t, "ownWidth", 3, !1), s = G(t, "forceMount", 3, !1), c = G(t, "trapFocus", 3, !1), l = /* @__PURE__ */ sa(t, qv), u = new nu("width < 640px"), d = /* @__PURE__ */ F(() => t.collisionPadding ?? pu(u.current ? "--c-screen-margin" : "--space-5")), f = /* @__PURE__ */ F(() => t.motion !== "hang" && !a() && !o()), p = U_({
		content: () => n(),
		onInteractOutside: () => t.onInteractOutside,
		onCloseAutoFocus: () => t.onCloseAutoFocus
	}), m = Vv(t.morphs), h = /* @__PURE__ */ L(!1), _ = /* @__PURE__ */ F(() => H(h) || !!t.child || t.motion === "hang");
	function v(e) {
		R(h, !1);
		let t = (t) => {
			t.target === e && t.propertyName === "opacity" && R(h, !0);
		};
		return e.addEventListener("transitionend", t), e.addEventListener("transitioncancel", t), () => {
			e.removeEventListener("transitionend", t), e.removeEventListener("transitioncancel", t);
		};
	}
	wn(() => {
		if (n() && H(_)) return m(n());
	}), Uv(e, la(() => t.portalProps, {
		children: (e, o) => {
			var u = U(), m = z(u);
			{
				let e = (e, n = g) => {
					var r = U(), i = z(r), a = (e) => {
						var r = U(), i = z(r), a = (e) => {
							var r = U();
							ii(z(r), () => t.child, n), W(e, r);
						}, o = (e) => {
							var r = Jv();
							Qi(r, (e) => ({
								...n().wrapperProps,
								[Vi]: { "pointer-events": e }
							}), [() => H_(n().open)]);
							var i = dn(r);
							Qi(i, (e, t) => ({
								...e,
								[Vi]: { "pointer-events": t }
							}), [() => G_(n().props), () => H_(n().open)]), ii(dn(i), () => t.children ?? g), ve(i), xi(i, () => v), ve(r), W(e, r);
						};
						si(i, (e) => {
							t.child ? e(a) : e(o, -1);
						}), W(e, r);
					}, o = /* @__PURE__ */ F(() => s() || W_(n().props));
					si(i, (e) => {
						H(o) && e(a);
					}), W(e, r);
				}, o = /* @__PURE__ */ F(() => Zl(Gv({ motion: t.motion }), "z-(--layer-float) flex w-72 origin-(--bits-popover-content-transform-origin) flex-col gap-4 text-label outline-hidden", a() && "border-current border-none bg-none bg-transparent p-0 shadow-none", Kv({
					width: t.width,
					height: t.height,
					overflow: t.overflow,
					pad: t.pad,
					gap: t.gap,
					frame: t.frame,
					look: t.look
				}), t.class, H(f) && "max-phone:min-w-[calc(100vw-2*var(--c-screen-margin))] max-phone:max-w-[calc(100vw-2*var(--c-screen-margin))]"));
				ui(m, () => B_, (t, a) => {
					a(t, la({
						get align() {
							return i();
						},
						get class() {
							return H(o);
						},
						get collisionPadding() {
							return H(d);
						},
						"data-slot": "popover-content",
						forceMount: !0,
						get onCloseAutoFocus() {
							return p.onCloseAutoFocus;
						},
						get onInteractOutside() {
							return p.onInteractOutside;
						},
						get sideOffset() {
							return r();
						},
						get trapFocus() {
							return c();
						}
					}, () => l, {
						get ref() {
							return n();
						},
						set ref(e) {
							n(e);
						},
						child: e,
						$$slots: { child: !0 }
					}));
				});
			}
			W(e, u);
		},
		$$slots: { default: !0 }
	})), Je();
}
//#endregion
//#region src/lib/components/ui/context-menu/context-menu-portal.svelte
var Xv = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy"
]);
function Zv(e, t) {
	let n = /* @__PURE__ */ sa(t, Xv);
	var r = U();
	ui(z(r), () => op, (e, t) => {
		t(e, la(() => n));
	}), W(e, r);
}
//#endregion
//#region src/lib/components/ui/context-menu/context-menu-content.svelte
var Qv = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy",
	"ref",
	"portalProps",
	"class",
	"forceMount",
	"preventScroll",
	"onInteractOutside",
	"onCloseAutoFocus",
	"motion",
	"child",
	"children"
]), $v = /* @__PURE__ */ Fr("<div><div><!></div></div>");
function ey(e, t) {
	qe(t, !0);
	let n = G(t, "ref", 15, null), r = G(t, "forceMount", 3, !1), i = G(t, "preventScroll", 3, !1), a = /* @__PURE__ */ sa(t, Qv), o = U_({
		content: () => n(),
		onInteractOutside: () => t.onInteractOutside,
		onCloseAutoFocus: () => t.onCloseAutoFocus
	});
	wn(() => {
		if (n()) return wv({
			rows: "[data-menu-item]",
			hovered: "[data-highlighted]"
		})(n());
	}), Zv(e, la(() => t.portalProps, {
		children: (e, s) => {
			var c = U(), l = z(c);
			{
				let e = (e, n = g) => {
					var i = U(), a = z(i), o = (e) => {
						var r = U(), i = z(r), a = (e) => {
							var r = U();
							ii(z(r), () => t.child, n), W(e, r);
						}, o = (e) => {
							var r = $v();
							Qi(r, (e) => ({
								...n().wrapperProps,
								[Vi]: { "pointer-events": e }
							}), [() => H_(n().open)]);
							var i = dn(r);
							Qi(i, (e, t) => ({
								...e,
								inert: !n().open,
								[Vi]: { "pointer-events": t }
							}), [() => G_(n().props), () => H_(n().open)]), ii(dn(i), () => t.children ?? g), ve(i), ve(r), W(e, r);
						};
						si(i, (e) => {
							t.child ? e(a) : e(o, -1);
						}), W(e, r);
					}, s = /* @__PURE__ */ F(() => r() || W_(n().props));
					si(a, (e) => {
						H(s) && e(o);
					}), W(e, i);
				}, s = /* @__PURE__ */ F(() => Zl(Gv({ motion: t.motion }), "relative z-(--layer-float) min-w-48 origin-(--bits-context-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none", t.class));
				ui(l, () => k_, (t, r) => {
					r(t, la({
						get class() {
							return H(s);
						},
						"data-slot": "context-menu-content",
						forceMount: !0,
						get onCloseAutoFocus() {
							return o.onCloseAutoFocus;
						},
						get onInteractOutside() {
							return o.onInteractOutside;
						},
						get preventScroll() {
							return i();
						}
					}, () => a, {
						get ref() {
							return n();
						},
						set ref(e) {
							n(e);
						},
						child: e,
						$$slots: { child: !0 }
					}));
				});
			}
			W(e, c);
		},
		$$slots: { default: !0 }
	})), Je();
}
//#endregion
//#region src/lib/components/ui/hang-card/hang-outline.ts
var ty = "http://www.w3.org/2000/svg", ny = 0;
function ry(e) {
	ny += 1;
	let t = `hang-outline-${ny}`, n = document.createElementNS(ty, "svg");
	n.setAttribute("class", "pointer-events-none fixed inset-0 size-full overflow-visible"), n.setAttribute("data-slot", "hang-outline"), n.setAttribute("aria-hidden", "true"), n.innerHTML = `<defs>
<linearGradient id="${t}-ink" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2="1"><stop offset="0" data-slot="rim"/><stop offset="1" class="[stop-color:var(--border-control)]"/></linearGradient>
<clipPath id="${t}-under"><rect data-slot="under" x="-100000" y="0" width="200000" height="200000"/></clipPath>
<filter id="${t}-cast" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="24"/><feOffset dy="18" result="far"/><feFlood class="[flood-color:var(--shadow-tint-3)]"/><feComposite in2="far" operator="in" result="farInk"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="2" result="near"/><feFlood class="[flood-color:var(--shadow-tint)]"/><feComposite in2="near" operator="in" result="nearInk"/>
<feMerge result="both"><feMergeNode in="farInk"/><feMergeNode in="nearInk"/></feMerge>
<feComposite in="both" in2="SourceAlpha" operator="out"/>
</filter>
</defs>
<path data-slot="cast" filter="url(#${t}-cast)" clip-path="url(#${t}-under)"/>
<path data-slot="line" fill="none" stroke="url(#${t}-ink)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
	let r = n.querySelector("linearGradient"), i = n.querySelector("[data-slot=\"rim\"]"), a = n.querySelector("[data-slot=\"under\"]"), o = n.querySelector("[data-slot=\"cast\"]"), s = n.querySelector("[data-slot=\"line\"]"), c = [e, e.parentElement ?? e].map((e) => Number.parseInt(getComputedStyle(e).zIndex, 10)).filter(Number.isFinite);
	return n.style.zIndex = c.length > 0 ? String(Math.max(...c)) : "", n.style.display = "none", document.body.append(n), {
		draw(e, t) {
			s.setAttribute("d", Zu(e)), o.setAttribute("d", Qu(e, {
				x: 0,
				y: 0
			})), a.setAttribute("y", String(e.tab.bottom)), r.setAttribute("y1", String(e.tab.top + e.box.radius)), r.setAttribute("y2", String(e.tab.bottom - e.box.flare)), i.style.setProperty("stop-color", t || "var(--border-control)");
		},
		show(e) {
			n.style.display = e ? "" : "none";
		},
		remove() {
			n.remove();
		}
	};
}
//#endregion
//#region src/lib/components/ui/hang-card/hang-card.svelte
var iy = Xl({
	base: "relative border-0 bg-(--hang-surface) [--hang-neck:var(--hang-surface)] [--hang-surface:var(--surface-raised)] before:pointer-events-none before:absolute before:z-2 before:bg-(--hang-neck) after:pointer-events-none after:absolute after:inset-0 after:z-1 after:rounded-[inherit] after:border after:border-border-control data-[rehearsing]:invisible before:[--gap-from:calc(var(--neck-start)-var(--neck-flare-start,0px))] before:[--gap-to:calc(var(--neck-end)+var(--neck-flare-end,0px))] before:[clip-path:var(--neck-cut,none)] data-[flush=end]:before:[--gap-to:calc(var(--neck-end)-1px)] data-[flush=start]:before:[--gap-from:1px]",
	variants: {
		from: {
			foot: "[clip-path:inset(0_-120px_-120px_round_0_0_var(--radius-lg)_var(--radius-lg))] before:top-0 before:left-(--gap-from) before:h-px before:w-[calc(var(--gap-to)-var(--gap-from))] data-[flush=start]:rounded-ss-none data-[flush=end]:rounded-se-none",
			end: "[clip-path:inset(-120px_-120px_-120px_0)] before:left-0 before:top-(--gap-from) before:w-px before:h-[calc(var(--gap-to)-var(--gap-from))] rounded-tl-[min(var(--radius-lg),var(--neck-room-start,var(--radius-lg)))] rounded-bl-[min(var(--radius-lg),var(--neck-room-end,var(--radius-lg)))]",
			start: "[clip-path:inset(-120px_0_-120px_-120px)] before:right-0 before:top-(--gap-from) before:w-px before:h-[calc(var(--gap-to)-var(--gap-from))] rounded-tr-[min(var(--radius-lg),var(--neck-room-start,var(--radius-lg)))] rounded-br-[min(var(--radius-lg),var(--neck-room-end,var(--radius-lg)))]"
		},
		tab: {
			true: "translate-none shadow-none will-change-auto [clip-path:path('M_0_0_Z')] before:hidden after:hidden",
			false: "motion-safe:will-change-[translate]"
		},
		glass: { true: "@max-desk/shell:rounded-ee-none shadow-none @max-desk/shell:after:border-e-0" },
		surface: { recess: "[--hang-surface:var(--surface-recess)]" }
	},
	compoundVariants: [
		{
			tab: !1,
			from: "foot",
			class: "motion-safe:not-data-[shown]:[translate:0_calc(-100%-var(--hang-reach,0px))]"
		},
		{
			tab: !1,
			from: "end",
			class: "motion-safe:not-data-[shown]:[translate:calc(-100%-var(--hang-reach,0px))_0]"
		},
		{
			tab: !1,
			from: "start",
			class: "motion-safe:not-data-[shown]:[translate:calc(100%+var(--hang-reach,0px))_0]"
		}
	],
	defaultVariants: {
		tab: !1,
		from: "foot"
	}
}), ay = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy",
	"anchor",
	"as",
	"flared",
	"from",
	"onplaced",
	"glass",
	"inPlace",
	"frame",
	"surface",
	"tab",
	"joined",
	"ref",
	"onneck",
	"held",
	"folded",
	"forceMount",
	"class",
	"children"
]), oy = /* @__PURE__ */ Fr("<span aria-hidden=\"true\" class=\"pointer-events-none absolute inset-0 -z-1 rounded-[inherit] bg-(--hang-surface)\" data-slot=\"hung-surface\"></span>"), sy = /* @__PURE__ */ Fr("<div><div><!> <!></div></div>");
function cy(e, t) {
	qe(t, !0);
	let n = {
		caw: "w-(--frame-w) @max-desk/shell:w-(--frame-w-narrow) gap-0 p-space-2",
		machines: "w-(--frame-w) gap-0",
		jump: "w-(--frame-w) max-h-(--frame-h) gap-0 p-0 @max-desk/shell:h-(--frame-h) @max-desk/shell:w-(--frame-w-narrow)",
		files: "flex w-(--frame-w) max-h-(--frame-h) flex-col gap-0 p-space-2",
		thread: "flex w-(--frame-w) max-h-(--float-max) flex-col gap-0 p-0",
		details: "flex max-h-[min(var(--c-details-card-max-h),var(--bits-popover-content-available-height,var(--c-sheet-max-h)))] overflow-hidden overscroll-contain p-0 @max-phone/shell:max-h-[min(calc(var(--shell-h)-var(--c-top-bar-h)-2*var(--c-screen-margin)-var(--safe-bottom)),var(--bits-popover-content-available-height,var(--c-sheet-max-h)))]"
	}, r = "calc(100cqi - 2 * var(--c-screen-margin))", i = "calc(100cqi - var(--c-bar-phone-edge) - env(safe-area-inset-right, 0px))", a = {
		caw: {
			w: `min(var(--c-panel-w), ${r})`,
			narrow: `min(var(--c-panel-w), ${i})`
		},
		machines: { w: `min(var(--c-machines-w), ${r})` },
		jump: {
			w: `min(var(--c-find-w), ${r})`,
			narrow: i,
			h: "calc(100dvh - var(--c-top-bar-h) - var(--space-7))"
		},
		files: {
			w: `min(var(--c-panel-w), ${r})`,
			h: "min(var(--c-caw-panel-h), calc(var(--bits-popover-content-available-height, 85dvh) - 2px))"
		},
		details: {},
		thread: { w: "min(var(--c-pin-card-reading-w), calc(100cqi - 2 * var(--space-2)))" }
	}, o = G(t, "as", 3, Yv), s = G(t, "flared", 3, !0), c = G(t, "from", 3, "foot"), l = G(t, "glass", 3, !1), u = G(t, "inPlace", 3, !1), d = G(t, "tab", 3, !1), f = G(t, "joined", 15, !1), p = G(t, "ref", 15, null), m = G(t, "forceMount", 3, !1), h = /* @__PURE__ */ sa(t, ay), g = /* @__PURE__ */ F(() => o() === Yv || o() === ey), _ = /* @__PURE__ */ F(() => c() !== "foot"), v = null, y = !0;
	function b(e) {
		let t = e.getBoundingClientRect(), n = O?.parentElement, r = n && getComputedStyle(n).position !== "fixed" ? n.offsetParent : null, i = 0, a = 1;
		if (r instanceof HTMLElement) {
			let e = r.getBoundingClientRect();
			a = r.offsetWidth > 0 ? e.width / r.offsetWidth : 1, i = H(_) ? e.top + r.clientTop * a - r.scrollTop * a : e.left + r.clientLeft * a - r.scrollLeft * a;
		}
		v = {
			start: ((H(_) ? t.top : t.left) - i) / a,
			end: ((H(_) ? t.bottom : t.right) - i) / a,
			flare: Number.parseFloat(getComputedStyle(e).getPropertyValue("--flare")) || 0
		}, y = !1;
	}
	let x = (e) => {
		if (b(e), O && C !== null) {
			let e = E(O, C, s());
			e && ee(O, e);
		}
	};
	wn(() => {
		let e = t.anchor;
		if (!e) {
			v = null;
			return;
		}
		b(e);
		let n = new ResizeObserver(() => x(e));
		n.observe(e);
		let r = new MutationObserver(() => x(e));
		r.observe(e, {
			attributes: !0,
			attributeFilter: ["style"]
		});
		let i = () => {
			y = !0;
		}, a = {
			capture: !0,
			passive: !0
		};
		return addEventListener("resize", i), addEventListener("scroll", i, a), () => {
			n.disconnect(), r.disconnect(), removeEventListener("resize", i), removeEventListener("scroll", i, a);
		};
	});
	let S = 0, C = null, w = null, T = 0;
	function E(e, n, r) {
		let i = t.anchor;
		if (!i || ((y || !v) && b(i), !v)) return null;
		let a = n + T, o = S || (H(_) ? e.offsetHeight : e.offsetWidth), s = a + o, c = r ? v.flare : 0, l = Math.abs(a - v.start) <= 1, u = Math.abs(s - v.end) <= 1, d = null;
		l ? d = "start" : u && (d = "end");
		let f = Math.min(Math.max(v.start - a, 0), o), p = Math.min(Math.max(v.end - a, f), o);
		return {
			start: f,
			end: p,
			flareStart: l ? 0 : Math.min(c, f),
			flareEnd: u ? 0 : Math.min(c, o - p),
			flush: d
		};
	}
	function ee(e, n) {
		if (!(w !== null && Eu(n, w) && e.style.getPropertyValue("--neck-start") === `${n.start}px`)) {
			if (Au(e, n, c()), H(_) && n.end - n.start >= .5) {
				let t = S || e.offsetHeight;
				e.style.setProperty("--neck-room-start", `${Math.max(0, n.start - n.flareStart)}px`), e.style.setProperty("--neck-room-end", `${Math.max(0, t - n.end - n.flareEnd)}px`);
			} else H(_) && (e.style.removeProperty("--neck-room-start"), e.style.removeProperty("--neck-room-end"));
			n.flush ? e.dataset.flush = n.flush : delete e.dataset.flush, w = n;
		}
		t.onneck?.(n);
	}
	function te(e) {
		T = e, t.anchor && x(t.anchor);
	}
	let ne = null, re = () => (t.anchor && (ne = t.anchor), t.anchor ?? ne);
	function ie(e) {
		let t = re();
		if (!t) return null;
		let n = t.querySelector("[data-slot=\"ff-tab\"]") ?? t, r = n.getBoundingClientRect(), i = getComputedStyle(n), a = (e) => Number.parseFloat(i.getPropertyValue(e)) || 0, o = e.getBoundingClientRect();
		return {
			box: {
				width: r.width,
				height: r.height,
				flare: a("--flare"),
				radius: a("--radius"),
				slopeStart: a("--slope-start"),
				slopeEnd: a("--slope-end")
			},
			corner: Number.parseFloat(getComputedStyle(e).borderBottomLeftRadius),
			flush: {
				start: Math.abs(o.left - r.left) <= 1,
				end: Math.abs(o.right - r.right) <= 1
			},
			hang: {
				left: o.left,
				right: o.right,
				height: o.bottom - r.bottom
			},
			tab: {
				left: r.left,
				right: r.right,
				top: r.top,
				bottom: r.bottom
			}
		};
	}
	let D = (e) => {
		let n = d() ? ry(e) : null, r = (t) => {
			let r = n ? ie(e) : null;
			if (!(n && r)) return;
			let i = $u(r, t), a = e.getBoundingClientRect();
			e.style.clipPath = `path("${Qu(i, {
				x: a.left,
				y: a.top
			})}")`;
			let o = re()?.querySelector("[data-slot=\"ff-tab\"]");
			n.draw(i, o ? getComputedStyle(o).getPropertyValue("--hang-rim").trim() : "");
		}, i = new ResizeObserver(([t]) => {
			let r = t?.borderBoxSize[0], i = (H(_) ? r?.blockSize : r?.inlineSize) ?? (H(_) ? e.offsetHeight : e.offsetWidth), a = i !== S;
			S = i, n && Iu(e);
			let o = a && C !== null ? E(e, C, s()) : null;
			o && ee(e, o);
		});
		i.observe(e);
		let a = 0, o = () => {
			Iu(e), a = e.hasAttribute("data-morph") ? requestAnimationFrame(o) : 0;
		}, l = new MutationObserver(() => {
			n && !a && e.hasAttribute("data-morph") && (a = requestAnimationFrame(o));
		});
		l.observe(e, {
			attributes: !0,
			attributeFilter: ["data-morph"]
		});
		let u = Nu({
			from: c(),
			neckAt: (t) => (C = t, E(e, t, s())),
			onneck: (t) => ee(e, t),
			onplaced: (e, n) => t.onplaced?.(e, n),
			onshown: (e) => {
				f(e), n?.show(e);
			},
			held: () => t.held?.() ?? !1,
			folded: () => t.folded?.() ?? !1,
			grow: n ? r : void 0
		})(e);
		return () => {
			i.disconnect(), l.disconnect(), cancelAnimationFrame(a), u?.(), n?.remove(), C = null, w = null;
		};
	}, O = null;
	wn(() => {
		let e = s();
		br(() => {
			if (O && C !== null) {
				let t = E(O, C, e);
				t && ee(O, t);
			}
		});
	});
	let ae = (e) => (O = e, y = !0, () => {
		O === e && (O = null);
	});
	var oe = { drawnOff: te }, k = U(), se = z(k);
	{
		let e = (e, n) => {
			let r = () => (n?.()).props, i = () => (n?.()).wrapperProps, o = () => (n?.()).open;
			var s = U(), u = z(s), d = (e) => {
				var n = sy();
				Qi(n, (e) => ({
					...i(),
					class: "z-(--layer-float)",
					"data-hang": c(),
					[Vi]: { "pointer-events": e }
				}), [() => H_(o())]);
				var s = dn(n);
				Qi(s, (e, n) => ({
					...e,
					[Vi]: {
						"--frame-w": t.frame ? a[t.frame].w : void 0,
						"--frame-w-narrow": t.frame ? a[t.frame].narrow : void 0,
						"--frame-h": t.frame ? a[t.frame].h : void 0,
						"pointer-events": n
					}
				}), [() => G_(r()), () => H_(o())]);
				var u = dn(s), d = (e) => {
					W(e, oy());
				};
				si(u, (e) => {
					l() && e(d);
				}), ii(pn(u, 2), () => t.children), ve(s), xi(s, () => D), xi(s, () => ae), ve(n), W(e, n);
			}, f = /* @__PURE__ */ F(() => m() || W_(r()));
			si(u, (e) => {
				H(f) && e(d);
			}), W(e, s);
		}, r = /* @__PURE__ */ F(() => l() || void 0), i = /* @__PURE__ */ F(() => Zl(Gv({
			motion: "hang",
			edge: "drawn"
		}), iy({
			tab: d(),
			glass: l(),
			surface: t.surface,
			from: c()
		}), t.frame && n[t.frame], t.class));
		ui(se, o, (t, n) => {
			n(t, la({ get "data-glass-card"() {
				return H(r);
			} }, () => H(g) ? { motion: "hang" } : {}, () => l() || u() ? { portalProps: { disabled: !0 } } : {}, () => h, {
				get class() {
					return H(i);
				},
				get "data-hang-from"() {
					return c();
				},
				forceMount: !0,
				get ref() {
					return p();
				},
				set ref(e) {
					p(e);
				},
				child: e,
				$$slots: { child: !0 }
			}));
		});
	}
	return W(e, k), Je(oe);
}
//#endregion
//#region src/lib/components/ui/root-open.svelte.ts
function ly() {
	let e = /* @__PURE__ */ L(!1);
	return ai(() => {
		R(e, !0);
	}), { get ready() {
		return H(e);
	} };
}
//#endregion
//#region src/lib/components/ui/popover/popover.svelte
var uy = /* @__PURE__ */ new Set([
	"$$slots",
	"$$events",
	"$$legacy",
	"open"
]);
function dy(e, t) {
	qe(t, !0);
	let n = G(t, "open", 15, !1), r = /* @__PURE__ */ sa(t, uy), i = ly();
	var a = U(), o = z(a), s = () => i.ready && n(), c = (e) => {
		n(e);
	};
	ui(o, () => V_, (e, t) => {
		t(e, la({
			get open() {
				return s();
			},
			set open(e) {
				c(e);
			}
		}, () => r));
	}), W(e, a), Je();
}
//#endregion
//#region src/lib/components/ui/chip/index.ts
var fy = Xl({
	base: "inline-flex items-center rounded-sm text-ink-strong type-label mark-line",
	variants: {
		variant: {
			option: "group/option touch-hit min-h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-3 py-space-1 text-start hit-edge-hair enabled:not-aria-pressed:not-aria-checked:not-data-chosen:hover:bg-surface-hover aria-checked:border-brand-solid aria-checked:bg-surface-recess aria-pressed:border-brand-solid aria-pressed:bg-surface-recess data-chosen:border-brand-solid data-chosen:bg-surface-recess motion-safe:transition-[border-color,background-color] motion-safe:duration-(--dur-control) motion-safe:ease-out",
			tray: "pointer-events-auto touch-hit relative isolate h-c-tray-chip touch-manipulation gap-c-pill-gap border-0 bg-transparent px-space-2 transition-[color] duration-(--dur-control) ease-out select-none [--tray-chip-fill:var(--surface-raised)] touch-callout-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-(color:--tray-chip-fill) before:shadow-tile before:transition-[background-color] before:duration-(--dur-control) before:ease-out motion-safe:transition-[color,transform] motion-safe:active:[transform:scale(var(--press-scale))] can-hover:hover:[--tray-chip-fill:var(--surface-hover)] *:[svg]:size-icon-md *:[svg]:flex-none",
			inline: "-my-c-inline-chip-pad max-w-full gap-space-1 rounded-[calc(var(--radius-xs)+var(--c-inline-chip-pad))] bg-surface-recess py-c-inline-chip-pad ps-c-inline-chip-pad pe-space-2 align-baseline leading-c-inline-chip-line whitespace-nowrap inset-ring inset-ring-border-hairline *:data-[slot=label]:max-w-c-inline-chip-max-w *:data-[slot=label]:min-w-0 *:data-[slot=label]:self-baseline *:data-[slot=label]:overflow-clip *:data-[slot=label]:text-ellipsis motion-safe:transition-[background-color,transform] motion-safe:duration-(--dur-control) motion-safe:ease-out motion-safe:enabled:active:[transform:scale(var(--press-scale))] can-hover:enabled:hover:bg-surface-hover *:[svg]:size-icon-md *:[svg]:flex-none",
			setting: "touch-hit h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-2 leading-none whitespace-nowrap hit-edge-hair transition-control aria-disabled:opacity-50 *:data-[slot=chevron]:size-icon-sm *:data-[slot=chevron]:text-ink-subtle **:data-[slot=chip-label]:min-w-0 **:data-[slot=chip-label]:overflow-hidden **:data-[slot=chip-label]:text-ellipsis motion-safe:transition-control-press can-hover:enabled:not-variant-static:hover:bg-surface-hover motion-safe:enabled:not-aria-busy:pressed:[transform:scale(var(--press-scale))] variant-static:border-border-hairline variant-static:bg-surface-recess *:[svg]:flex-none *:[svg]:not-data-[slot=chevron]:size-icon-md"
		},
		size: {
			regular: "",
			compact: "h-(--row-compact-h) gap-space-1 max-phone:h-c-btn-h-lg max-phone:not-data-account-chip:*:data-[slot=chevron]:hidden"
		},
		tone: {
			muted: "",
			fail: "",
			grant: ""
		}
	},
	compoundVariants: [
		{
			variant: "setting",
			tone: "muted",
			class: "text-ink-muted"
		},
		{
			variant: "setting",
			tone: "fail",
			class: "border-status-fail-ink text-status-fail-ink"
		},
		{
			variant: "setting",
			tone: "grant",
			class: "border-status-attn-ink bg-status-attn-bg text-status-attn-ink *:data-[slot=chevron]:text-status-attn-ink can-hover:enabled:not-variant-static:hover:bg-status-attn-bg variant-static:border-status-attn-ink variant-static:bg-status-attn-bg"
		}
	],
	defaultVariants: { variant: "option" }
});
Xl({ base: "flex flex-wrap gap-space-2 hit-gap-x-space-2 hit-gap-y-space-2 coarse:gap-y-space-4 coarse:hit-gap-y-space-4" }), Xl({
	base: "group/badge mark-line inline-flex h-icon-lg w-fit shrink-0 items-center justify-center gap-space-1 overflow-hidden whitespace-nowrap rounded-xs bg-surface-recess px-space-2 text-ink-strong text-label leading-none transition-colors has-data-[icon=inline-end]:pr-space-1 has-data-[icon=inline-start]:pl-space-1 [&>svg]:pointer-events-none [&>svg]:size-icon-sm",
	variants: {
		variant: {
			default: "",
			secondary: "text-ink-muted",
			outline: "",
			ghost: "bg-transparent text-ink-muted",
			destructive: "bg-status-fail-bg text-status-fail-ink",
			live: "bg-status-live-bg text-status-live-ink",
			attn: "bg-status-attn-bg text-status-attn-ink",
			done: "bg-status-done-bg text-status-done-ink",
			fail: "bg-status-fail-bg text-status-fail-ink",
			"note-new": "bg-note-new-bg text-note-new-ink",
			"note-improved": "bg-note-improved-bg text-note-improved-ink",
			"note-fixed": "bg-note-fixed-bg text-note-fixed-ink",
			link: "bg-transparent text-link-ink underline-offset-4 hover:underline"
		},
		size: {
			cell: "min-h-6 gap-1.5 px-2",
			"cell-tall": "h-auto min-h-6 gap-1.5 whitespace-normal px-2 py-space-1 text-start",
			count: "pointer-events-none px-[clamp(var(--space-1),calc(var(--space-2)_-_var(--tight,0px)_*_1000),var(--space-2))] text-meta tabular-nums"
		},
		figures: { tabular: "tabular-nums" },
		tone: {
			success: "text-success-9",
			muted: "text-ink-muted",
			subtle: "text-ink-subtle",
			"success-edge": "border-success-9 text-success-9",
			"warning-edge": "border-warning-9 text-warning-9",
			"muted-edge": "border-border text-ink-muted"
		},
		gap: { tight: "gap-space-row" },
		kind: { meta: "rounded-xs border-transparent bg-surface-recess px-space-2 py-px font-normal text-ink-muted text-size-meta" }
	},
	defaultVariants: { variant: "default" }
}), Xl({ variants: { look: {
	chip: fy({ variant: "setting" }),
	state: "mark-line type-meta inline-flex h-c-btn-h-xs items-center gap-space-1 whitespace-nowrap rounded-sm bg-surface-recess px-space-2 text-ink-muted transition-chip-settle not-data-fail:hover:bg-surface-hover data-fail:bg-status-fail-bg data-fail:text-status-fail-ink motion-safe:pressed:scale-(--press-scale)",
	count: "pressable type-meta num h-icon-md min-w-icon-md overflow-visible px-space-1 text-ink-row leading-none",
	strip: "press-tint flex h-c-btn-h-lg items-center rounded-sm px-space-3 text-start text-ink-strong transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover",
	"strip-home": "press-tint flex h-c-usage-strip-home-h items-center rounded-md px-space-4 text-start text-ink-strong transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover hover:ring-ground-surface-hover aria-expanded:bg-surface-hover aria-expanded:ring-ground-surface-hover",
	meter: "mark-line flex h-c-bar-item items-center gap-space-2 rounded-sm px-space-2 text-ink-muted text-label tabular-nums transition-[background-color,color] duration-(--dur-control) ease-out hover:bg-surface-hover data-compacting:text-ink-strong data-critical:not-data-compacting:text-error-9 data-warn:not-data-critical:not-data-compacting:text-warning-9"
} } });
//#endregion
//#region src/lib/cawco/motion/pop.svelte.ts
var py = {
	bottom: [0, -1],
	top: [0, 1],
	right: [-1, 0],
	left: [1, 0]
};
function my(e, { side: t = "bottom" } = {}) {
	if (!ru.current) return {
		duration: du("--dur-control"),
		css: (e) => `opacity: ${e}`
	};
	let n = getComputedStyle(e), r = Number.parseFloat(n.getPropertyValue("--pop-scale")), i = Number.parseFloat(n.getPropertyValue("--pop-rise")), [a, o] = py[t];
	return {
		duration: du("--dur-exit"),
		easing: ou,
		css: (e) => `opacity: ${e}; scale: ${r + (1 - r) * e}; translate: ${(a * (1 - e) * i).toFixed(2)}px ${(o * (1 - e) * i).toFixed(2)}px`
	};
}
var hy = .5, gy = 6, $ = (e) => Math.round(e * 100) / 100, _y = (e, t, n) => {
	let r = e / 2 + n, i = 2 + n;
	return [
		t === "top-start" ? i : r,
		t === "top-end" ? i : r,
		t === "bottom-end" ? i : r,
		t === "bottom-start" ? i : r
	];
};
function vy(e, t, n, r, [i, a, o, s]) {
	let c = Math.min(n, r) / 2, [l, u, d, f] = [
		i,
		a,
		o,
		s
	].map((e) => Math.min(e, c));
	return [
		`M ${$(e + l)} ${$(t)}`,
		`H ${$(e + n - u)}`,
		`A ${$(u)} ${$(u)} 0 0 1 ${$(e + n)} ${$(t + u)}`,
		`V ${$(t + r - d)}`,
		`A ${$(d)} ${$(d)} 0 0 1 ${$(e + n - d)} ${$(t + r)}`,
		`H ${$(e + f)}`,
		`A ${$(f)} ${$(f)} 0 0 1 ${$(e)} ${$(t + r - f)}`,
		`V ${$(t + l)}`,
		`A ${$(l)} ${$(l)} 0 0 1 ${$(e + l)} ${$(t)}`,
		"Z"
	].join(" ");
}
function yy(e) {
	let [t, n, r, i] = _y(e.h - 8, e.tail, 4), a = Math.min(e.w, e.h) / 2;
	return e.side === "end" ? {
		top: Math.min(t, a),
		bottom: Math.min(i, a)
	} : {
		top: Math.min(n, a),
		bottom: Math.min(r, a)
	};
}
var by = (e) => (t, n) => `${$(e.side === "end" ? t : e.w - t)} ${$(n)}`, xy = (e) => (t) => e.side === "end" ? t : 1 - t;
function Sy(e) {
	let t = by(e), n = xy(e), { w: r, h: i } = e, a = yy(e), o = e.flareStart, s = e.flareEnd, c = [];
	return o > 0 ? c.push(`M ${t(r, -o)}`, `A ${$(o)} ${$(o)} 0 0 ${n(1)} ${t(r - o, 0)}`) : c.push(`M ${t(r, 0)}`), c.push(`L ${t(a.top, 0)}`), c.push(`A ${$(a.top)} ${$(a.top)} 0 0 ${n(0)} ${t(0, a.top)}`), c.push(`L ${t(0, i - a.bottom)}`), c.push(`A ${$(a.bottom)} ${$(a.bottom)} 0 0 ${n(0)} ${t(a.bottom, i)}`), s > 0 ? c.push(`L ${t(r - s, i)}`, `A ${$(s)} ${$(s)} 0 0 ${n(1)} ${t(r, i + s)}`) : c.push(`L ${t(r, i)}`), c.push(`L ${t(r + 1, i + s)}`, `L ${t(r + 1, -o)}`, "Z"), c.join(" ");
}
function Cy(e, t) {
	let n = Math.min(1, Math.max(0, t)), r = by(e), i = xy(e), { w: a, h: o } = e, s = yy(e), c = Math.min(a, o) / 2 * (1 - n), [l, u] = [c, c], d = vy(0, 0, a, o, e.side === "end" ? [
		s.top,
		l,
		u,
		s.bottom
	] : [
		l,
		s.top,
		s.bottom,
		u
	]), f = (e, t) => {
		if (e <= 0) return "";
		let n = t ? 0 : o, s = t ? -e : o + e;
		return `M ${r(a, s)} A ${$(e)} ${$(e)} 0 0 ${i(+!!t)} ${r(a - e, n)} L ${r(a, n)} Z`;
	};
	return [
		d,
		f(e.flareStart * n, !0),
		f(e.flareEnd * n, !1)
	].filter(Boolean).join(" ");
}
function wy(e) {
	let t = by(e), n = xy(e), { w: r, h: i } = e, a = yy(e), o = e.flareStart, s = e.flareEnd, c = (e) => Math.sqrt((e + hy) ** 2 - e ** 2), l = [];
	return o > 0 ? l.push(`M ${t(r, -o + c(o))}`, `A ${$(o + hy)} ${$(o + hy)} 0 0 ${n(1)} ${t(r - o, hy)}`) : l.push(`M ${t(r, hy)}`), l.push(`L ${t(a.top, hy)}`), l.push(`A ${$(a.top - hy)} ${$(a.top - hy)} 0 0 ${n(0)} ${t(hy, a.top)}`), l.push(`L ${t(hy, i - a.bottom)}`), l.push(`A ${$(a.bottom - hy)} ${$(a.bottom - hy)} 0 0 ${n(0)} ${t(a.bottom, i - hy)}`), s > 0 ? l.push(`L ${t(r - s, i - hy)}`, `A ${$(s + hy)} ${$(s + hy)} 0 0 ${n(1)} ${t(r, i + s - c(s))}`) : l.push(`L ${t(r, i - hy)}`), l.join(" ");
}
function Ty(e) {
	let t = e.w - 8, n = e.h - 8;
	return vy(4, 4, t, n, _y(n, e.tail, 0));
}
function Ey(e, t = gy) {
	let n = t / 2;
	return `M ${$(e.w - 4 - 1 - n)} ${$(5)} a ${$(n)} ${$(n)} 0 1 0 ${$(2 * n)} 0 a ${$(n)} ${$(n)} 0 1 0 ${$(-2 * n)} 0 Z`;
}
//#endregion
//#region src/lib/cawco/preview/PinFoot.svelte
var Dy = /* @__PURE__ */ Lr("<svg aria-hidden=\"true\" class=\"absolute start-(--view-x) top-(--view-y) overflow-hidden data-[phase=bridge]:[&amp;>[data-part=plain]]:hidden data-[phase=none]:hidden data-[phase=rest]:[&amp;>[data-part=bridge]]:hidden\" data-phase=\"none\"><defs><clipPath clipPathUnits=\"userSpaceOnUse\"><path clip-rule=\"evenodd\"></path></clipPath><filter color-interpolation-filters=\"sRGB\" filterUnits=\"userSpaceOnUse\"><feGaussianBlur in=\"SourceAlpha\" result=\"blur\"></feGaussianBlur><feColorMatrix in=\"blur\" result=\"melt\" type=\"matrix\" values=\"0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 18 -8.5\"></feColorMatrix><feComposite in=\"SourceAlpha\" in2=\"melt\" operator=\"over\" result=\"shape\"></feComposite><feMorphology in=\"shape\" operator=\"erode\" radius=\"1\" result=\"inner\"></feMorphology><feFlood class=\"flood-border-control\" result=\"edgeInk\"></feFlood><feComposite in=\"edgeInk\" in2=\"shape\" operator=\"in\" result=\"edge\"></feComposite><feFlood class=\"flood-surface-raised\" result=\"surfaceInk\"></feFlood><feComposite in=\"surfaceInk\" in2=\"inner\" operator=\"in\" result=\"surface\"></feComposite><feMerge><feMergeNode in=\"edge\"></feMergeNode><feMergeNode in=\"surface\"></feMergeNode></feMerge></filter></defs><g data-part=\"plain\"><path class=\"fill-surface-raised\"></path><path class=\"fill-none stroke-border-control stroke-1\"></path></g><g data-part=\"bridge\"><g><path fill=\"currentColor\"></path><rect fill=\"currentColor\" height=\"0\" width=\"0\" x=\"0\" y=\"0\"></rect></g></g></svg>"), Oy = /* @__PURE__ */ Fr("<span aria-hidden=\"true\" data-slot=\"pin-foot\"><!></span>");
function ky(e, t) {
	let n = Rr();
	qe(t, !0);
	let r = G(t, "tail", 3, "bottom-start"), i = G(t, "dot", 3, !1), a = G(t, "neck", 3, null), o = G(t, "joined", 3, !1), s = G(t, "card", 3, null), c = G(t, "el", 15), l = /* @__PURE__ */ L(0), u = /* @__PURE__ */ L(0);
	wn(() => {
		let e = c();
		if (!e) return;
		let t = getComputedStyle(e);
		R(l, Number.parseFloat(t.getPropertyValue("--flare")) || 0, !0), R(u, Number.parseFloat(t.getPropertyValue("--status-dot-size")) || 0, !0);
	});
	let d = /* @__PURE__ */ F(() => t.box ? {
		w: t.box.w,
		h: t.box.h,
		side: t.side,
		tail: r(),
		flareStart: a()?.flareStart ?? 0,
		flareEnd: a()?.flareEnd ?? 0
	} : null), f = /* @__PURE__ */ F(() => !!a() && a().end - a().start >= .5), p = /* @__PURE__ */ F(() => H(l) / 2), m = /* @__PURE__ */ F(() => Math.ceil(3 * H(p)) + 2), h = /* @__PURE__ */ F(() => {
		if (!t.box) return null;
		let e = -(H(l) + H(m)), n = t.box.h + 2 * (H(l) + H(m));
		return t.side === "end" ? {
			x: -H(m),
			y: e,
			w: t.box.w + H(m) + 1,
			h: n
		} : {
			x: -1,
			y: e,
			w: t.box.w + H(m) + 1,
			h: n
		};
	}), g = (e, n) => {
		let r = e.getBoundingClientRect(), i = n.getBoundingClientRect(), a = n.offsetWidth > 0 ? i.width / n.offsetWidth : 1, o = t.side === "end" ? i.right : i.left, s = (t.side === "end" ? r.right - o : o - r.left) / a, c = r.width / a;
		return {
			out: Math.max(0, Math.min(s, c)),
			width: c,
			top: (r.top - i.top) / a,
			height: r.height / a
		};
	}, _ = /* @__PURE__ */ L(void 0), v = /* @__PURE__ */ L(void 0), y = /* @__PURE__ */ L(void 0), b = /* @__PURE__ */ L(void 0), x = !1, S = (e) => {
		H(_) && (H(_).dataset.phase = e);
	};
	wn(() => {
		let e = o() && H(f) ? "rest" : "none";
		br(() => {
			x || S(e);
		});
	});
	function C(e, n, r) {
		let i = H(d);
		if (!(i && H(v) && H(y) && H(b))) return;
		let a = g(e, n), o = a.width > 0 ? a.out / a.width : 0, s = r?.run.effect?.getComputedTiming(), c = Number(s?.duration) || 1, l = Math.min(1, Math.max(0, Number(r?.run.currentTime ?? 0) / c)), u = r?.opens === !1 ? l : 1 - l;
		H(y).setAttribute("d", Cy(i, o)), H(v).setAttribute("stdDeviation", String(Math.max(.5, H(p) * u)));
		let f = Math.min(a.out, H(m));
		H(b).setAttribute("x", String(t.side === "end" ? i.w : -f)), H(b).setAttribute("width", String(f)), H(b).setAttribute("y", String(a.top)), H(b).setAttribute("height", String(a.height));
	}
	wn(() => {
		let e = s(), t = c();
		if (!(e && t)) return;
		let n = 0, r = null, i = () => {
			C(e, t, r), n = requestAnimationFrame(i);
		}, a = (a) => {
			let o = a.detail;
			r = o, x = !0, S("bridge"), cancelAnimationFrame(n), C(e, t, o), n = requestAnimationFrame(i);
			let s = () => {
				r === o && (cancelAnimationFrame(n), x = !1, r = null, S(o.opens && H(f) ? "rest" : "none"));
			};
			o.run.finished.then(s, s);
		};
		return e.addEventListener(Su, a), () => {
			cancelAnimationFrame(n), e.removeEventListener(Su, a);
		};
	});
	var w = Oy();
	let T;
	var E = dn(w), ee = (e) => {
		let t = /* @__PURE__ */ F(() => `M ${H(h).x - H(m)} ${H(h).y} h ${H(h).w + 2 * H(m)} v ${H(h).h} h ${-(H(h).w + 2 * H(m))} Z ${Ty(H(d))}${i() && H(u) > 0 ? ` ${Ey(H(d), H(u))}` : ""}`);
		var r = Dy();
		let a;
		var o = dn(r), s = dn(o), c = fn(s), l = pn(s), f = dn(l);
		ra(f, (e) => R(v, e), () => H(v)), ye(8), ve(l), ve(o);
		var g = pn(o), x = dn(g), S = pn(x);
		ve(g);
		var C = pn(g), w = dn(C), T = dn(w);
		ra(T, (e) => R(y, e), () => H(y)), ra(pn(T), (e) => R(b, e), () => H(b)), ve(w), ve(C), ve(r), ra(r, (e) => R(_, e), () => H(_)), Mn((e, i, o) => {
			Xi(r, "height", H(h).h), Xi(r, "viewBox", `${H(h).x ?? ""} ${H(h).y ?? ""} ${H(h).w ?? ""} ${H(h).h ?? ""}`), Xi(r, "width", H(h).w), a = Mi(r, "", a, {
				"--view-x": `${H(h).x ?? ""}px`,
				"--view-y": `${H(h).y ?? ""}px`
			}), Xi(s, "id", `${n}-open`), Xi(c, "d", H(t)), Xi(l, "height", H(h).h), Xi(l, "id", `${n}-melt`), Xi(l, "width", H(h).w + 2 * H(m)), Xi(l, "x", H(h).x - H(m)), Xi(l, "y", H(h).y), Xi(f, "stdDeviation", H(p)), Xi(g, "clip-path", `url(#${n}-open)`), Xi(x, "d", e), Xi(S, "d", i), Xi(C, "clip-path", `url(#${n}-open)`), Xi(w, "filter", `url(#${n}-melt)`), Xi(T, "d", o);
		}, [
			() => Sy(H(d)),
			() => wy(H(d)),
			() => vy(0, 0, H(d).w, H(d).h, [
				0,
				0,
				0,
				0
			])
		]), W(e, r);
	};
	si(E, (e) => {
		H(d) && H(h) && e(ee);
	}), ve(w), ra(w, (e) => c(e), () => c()), Mn(() => {
		Ai(w, 1, wi(["pointer-events-none absolute start-(--foot-x) top-(--foot-y) h-(--foot-h) w-(--foot-w)", !t.box && "hidden"])), T = Mi(w, "", T, {
			"--flare": "var(--radius-lg)",
			"--foot-x": t.box ? `${t.box.x}px` : void 0,
			"--foot-y": t.box ? `${t.box.y}px` : void 0,
			"--foot-w": t.box ? `${t.box.w}px` : void 0,
			"--foot-h": t.box ? `${t.box.h}px` : void 0
		});
	}), W(e, w), Je();
}
//#endregion
//#region src/lib/cawco/preview/PinFloat.svelte
var Ay = /* @__PURE__ */ Fr("<div class=\"flex min-h-0 min-w-0 flex-col gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain p-space-3\" data-slot=\"pin-body\"><!></div>"), jy = /* @__PURE__ */ Fr("<div class=\"contents\"><!></div>"), My = /* @__PURE__ */ Fr("<div class=\"contents\"><!> <span aria-hidden=\"true\" class=\"pointer-events-none absolute start-(--spot-x) top-(--spot-y) size-px\" data-slot=\"pin-spot\"></span> <!></div>"), Ny = /* @__PURE__ */ Fr("<div role=\"dialog\"><div data-slot=\"pin-body\"><!></div></div>");
function Py(e, t) {
	qe(t, !0);
	let n = G(t, "box", 3, null), r = G(t, "sheet", 3, !1), i = G(t, "bare", 3, !1), a = G(t, "tail", 3, "bottom-start"), o = G(t, "dot", 3, !1), s = G(t, "exit", 19, () => ({ at: "fade" })), c = G(t, "float", 15), l = /* @__PURE__ */ F(() => !(r() || i())), u = /* @__PURE__ */ L(void 0), d = /* @__PURE__ */ L(0), f = /* @__PURE__ */ L(0), p = /* @__PURE__ */ L(0), m = /* @__PURE__ */ L(!1);
	wn(() => {
		let e = c(), t = H(u);
		if (!(e && t)) return;
		let n = [...e.querySelectorAll("[data-pin-room]")], r = () => {
			let r = e.offsetHeight, i = n.reduce((e, t) => e + t.scrollHeight - t.clientHeight, t.scrollHeight - t.clientHeight);
			R(d, e.offsetWidth, !0), R(f, r, !0), R(p, r + Math.max(0, i));
		};
		r(), _r().then(() => {
			c() === e && (br(() => H(l)) || getComputedStyle(e).translate, R(m, !0));
		});
		let i = rv(r);
		i.observe(e);
		for (let e of n) for (let t of e.children) i.observe(t);
		return () => i.disconnect();
	});
	let h = /* @__PURE__ */ F(() => pu("--space-2") || 7), g = /* @__PURE__ */ F(() => H(h) + 4), _ = (e) => {
		let t = Math.min(...e.map((e) => e.x)), n = Math.min(...e.map((e) => e.y));
		return {
			x: t,
			y: n,
			w: Math.max(...e.map((e) => e.x + e.w)) - t,
			h: Math.max(...e.map((e) => e.y + e.h)) - n
		};
	}, v = null, y = /* @__PURE__ */ F(() => (t.mark && (v = {
		mark: t.mark,
		whole: n() ? _([t.mark, n()]) : t.mark
	}), v)), b = (e, n) => {
		let r = Math.max(0, e.x), i = Math.max(0, e.y), a = Math.min(t.room.w, e.x + e.w), o = Math.min(t.room.h, e.y + e.h);
		return a > r && o > i ? {
			x: r,
			y: i,
			w: a - r,
			h: o - i
		} : n;
	}, x = (e) => {
		let n = Math.max(0, t.room.h - 2 * H(h)), r = Math.min(H(p) || H(f), n);
		if (!e) return {
			along: "room",
			side: "bottom",
			max: n
		};
		let i = e.mark, a = b(e.whole, i), o = (e) => e.x + e.w + H(g) + H(d) <= t.room.w - H(h) ? "right" : e.x - H(g) - H(d) >= H(h) ? "left" : null, s = t.room.h - (a.y + a.h + H(g)) - H(h), c = a.y - H(g) - H(h), l = o(a);
		if (l) return {
			along: "subject",
			side: l,
			max: n
		};
		if (s >= r) return {
			along: "subject",
			side: "bottom",
			max: s
		};
		if (c >= r) return {
			along: "subject",
			side: "top",
			max: c
		};
		let u = o(i);
		if (u) return {
			along: "pill",
			side: u,
			max: n
		};
		let m = t.room.h - (i.y + i.h + H(g)) - H(h), _ = i.y - H(g) - H(h);
		return m >= r || m >= _ ? {
			along: "pill",
			side: "bottom",
			max: Math.max(0, m)
		} : {
			along: "pill",
			side: "top",
			max: Math.max(0, _)
		};
	}, S = /* @__PURE__ */ F(() => [
		t.room.w,
		t.room.h,
		H(d),
		Math.round(H(p)),
		H(y) ? `${H(y).mark.w}x${H(y).mark.h}` : "none",
		H(y) ? `${Math.round(H(y).whole.w)}x${Math.round(H(y).whole.h)}` : ""
	].join()), C = "", w = null, T = /* @__PURE__ */ F(() => {
		if (r() || H(l)) return null;
		let e = H(S);
		return (e !== C || !w) && (C = e, w = br(() => x(H(y)))), w;
	}), E = /* @__PURE__ */ F(() => {
		if (!H(T)) return null;
		let e = Math.min(H(p) || H(f), H(T).max), n = H(y), r = (e) => Math.max(H(h), Math.min(e, t.room.w - H(d) - H(h))), i = (n) => Math.max(H(h), Math.min(n, t.room.h - H(h) - e));
		if (!n || H(T).along === "room") return {
			left: r(t.room.w - H(d) - H(h)),
			top: H(h),
			side: H(T).side,
			max: H(T).max,
			origin: {
				x: H(d),
				y: 0
			}
		};
		let a = n.mark, o = H(T).along === "pill" ? a : n.whole, s = a.x, c = a.y;
		H(T).side === "right" ? s = o.x + o.w + H(g) : H(T).side === "left" ? s = o.x - H(g) - H(d) : c = H(T).side === "bottom" ? o.y + o.h + H(g) : o.y - H(g) - e, s = r(s), c = i(c);
		let l = (e, t) => Math.max(0, Math.min(e, t));
		return {
			left: s,
			top: c,
			side: H(T).side,
			max: H(T).max,
			origin: {
				x: l(a.x + a.w / 2 - s, H(d)),
				y: l(a.y + a.h / 2 - c, e)
			}
		};
	}), ee = null, te = null;
	wn(() => {
		let e = H(E), t = H(T), n = c();
		if (!(e && n)) return;
		let r = ee;
		if (ee = {
			left: e.left,
			top: e.top,
			plan: t
		}, !(r && r.plan !== t && br(() => H(m)) && ru.current)) return;
		let i = getComputedStyle(n).translate, [a = 0, o = 0] = i === "none" ? [0, 0] : i.split(" ").map((e) => Number.parseFloat(e));
		te?.cancel(), te = n.animate([{ translate: `${r.left - e.left + a}px ${r.top - e.top + o}px` }, { translate: "0px 0px" }], {
			duration: du("--dur-morph"),
			easing: fu("--ease-drawer")
		});
	});
	let ne = /* @__PURE__ */ F(() => {
		if (!(r() || H(l))) return H(m) ? "open" : "closed";
	}), re = /* @__PURE__ */ F(() => t.mark ? {
		x: t.mark.x - 4,
		y: t.mark.y - 4,
		w: t.mark.w + 8,
		h: t.mark.h + 8
	} : null), ie = /* @__PURE__ */ F(() => H(y) ? {
		x: H(y).mark.x - 4,
		y: H(y).mark.y - 4,
		w: H(y).mark.w + 8,
		h: H(y).mark.h + 8
	} : null), D = (e) => {
		let n = Math.max(0, t.room.h - 2 * H(h));
		if (!e) return {
			side: "right",
			max: n
		};
		let r = t.room.w - H(h) - (e.x + e.w), i = e.x - H(h);
		return r >= H(d) ? {
			side: "right",
			max: n
		} : i >= H(d) ? {
			side: "left",
			max: n
		} : {
			side: r >= i ? "right" : "left",
			max: n
		};
	}, O = "", ae = null, oe = /* @__PURE__ */ F(() => {
		if (!H(l)) return null;
		let e = H(S);
		return (e !== O || !ae) && (O = e, ae = br(() => D(H(ie)))), ae;
	}), k = (e) => Math.min(H(p) || H(f), e.max), se = (e, n, r) => {
		let i = k(n), a = n.side === "right" ? e.x + e.w : e.x - H(d), o = r === "top" ? e.y : e.y + e.h - i;
		return {
			hung: n,
			left: Math.max(H(h), Math.min(a, t.room.w - H(d) - H(h))),
			top: Math.max(H(h), Math.min(o, t.room.h - H(h) - i))
		};
	}, ce = (e, t) => {
		let n = k(e.hung), r = e.hung.side === "right" ? t.x + t.w : t.x - H(d);
		return Math.abs(r - e.left) <= 1 && t.y >= e.top - 1 && t.y + t.h <= e.top + n + 1;
	}, le = null, ue = /* @__PURE__ */ F(() => {
		let e = H(oe);
		if (!e) return le = null, null;
		let n = H(re), r = br(() => le), i = r;
		if (!r || r.hung !== e) i = H(ie) ? se(n ?? H(ie), e, "top") : {
			hung: e,
			left: Math.max(H(h), t.room.w - H(d) - H(h)),
			top: H(h)
		};
		else if (n && !ce(r, n)) {
			let t = n.y < r.top - 1, a = se(n, e, t ? "foot" : "top");
			i = Math.abs(a.left - r.left) > .5 || Math.abs(a.top - r.top) > .5 ? a : r;
		}
		return le = i, i;
	}), A = /* @__PURE__ */ L(null);
	En(() => {
		H(l) && c(H(A) ?? void 0);
	});
	let j = /* @__PURE__ */ L(void 0), de = /* @__PURE__ */ L(void 0), fe = /* @__PURE__ */ L(!1), M = /* @__PURE__ */ L(null), pe = /* @__PURE__ */ L(void 0), me = /* @__PURE__ */ F(() => H(re)), N = /* @__PURE__ */ L(!1);
	wn(() => {
		H(d) > 0 && (H(p) || H(f)) > 0 && H(ue) && R(N, !0);
	});
	let he = null, P = null, ge = 0, _e = (e, t) => {
		let n = c()?.parentElement, r = he;
		if (he = {
			x: e,
			y: t
		}, !(n && r && br(() => H(fe)) && ru.current) || Math.abs(r.x - e) < .5 && Math.abs(r.y - t) < .5) return;
		let i = getComputedStyle(n).translate, [a = 0, o = 0] = i === "none" ? [0, 0] : i.split(" ").map((e) => Number.parseFloat(e));
		P?.cancel();
		let s = n.animate([{ translate: `${r.x - e + a}px ${r.y - t + o}px` }, { translate: "0px 0px" }], {
			duration: du("--dur-morph"),
			easing: fu("--ease-drawer")
		});
		P = s, cancelAnimationFrame(ge);
		let l = () => {
			let e = getComputedStyle(n).translate, t = e === "none" ? 0 : Number.parseFloat(e.split(" ")[1] ?? "0") || 0;
			H(pe)?.drawnOff(t), ge = P === s ? requestAnimationFrame(l) : 0;
		};
		ge = requestAnimationFrame(l);
		let u = () => {
			P === s && (P = null, cancelAnimationFrame(ge), H(pe)?.drawnOff(0));
		};
		s.finished.then(u, u);
	};
	wn(() => () => {
		cancelAnimationFrame(ge), P?.cancel();
	});
	function ye(e) {
		return r() ? {
			duration: du("--dur-menu"),
			easing: au,
			css: (e) => `opacity: ${e}`
		} : { duration: 0 };
	}
	function be(e) {
		if (s().at === "cut") return e.style.display = "none", { duration: 0 };
		if (r()) return {
			duration: du("--dur-control"),
			easing: au,
			css: (e) => `opacity: ${e}`
		};
		if (!H(l)) return my(e, { side: H(E)?.side ?? "bottom" });
		let t = c();
		return t && ru.current ? (Mu(t), { duration: du("--dur-exit") }) : (t?.animate([{ opacity: 1 }, { opacity: 0 }], {
			duration: du("--dur-control"),
			easing: fu("--ease-out"),
			fill: "forwards"
		}), { duration: du("--dur-control") });
	}
	var xe = U(), Se = z(xe), Ce = (e) => {
		var n = My(), r = dn(n);
		{
			let e = /* @__PURE__ */ F(() => c() ?? null), t = /* @__PURE__ */ F(() => H(oe)?.side === "left" ? "start" : "end");
			ky(r, {
				get box() {
					return H(me);
				},
				get card() {
					return H(e);
				},
				get dot() {
					return o();
				},
				get joined() {
					return H(fe);
				},
				get neck() {
					return H(M);
				},
				get side() {
					return H(t);
				},
				get tail() {
					return a();
				},
				get el() {
					return H(de);
				},
				set el(e) {
					R(de, e, !0);
				}
			});
		}
		var i = pn(r, 2);
		let s;
		ra(i, (e) => R(j, e), () => H(j));
		var l = pn(i, 2), f = (e) => {
			var n = jy();
			let r;
			ui(dn(n), () => dy, (e, n) => {
				n(e, {
					get open() {
						return H(N);
					},
					children: (e, n) => {
						{
							let n = /* @__PURE__ */ F(() => H(ue)?.hung.side), r = /* @__PURE__ */ F(() => H(ue)?.hung.side === "left" ? "start" : "end"), i = /* @__PURE__ */ F(() => H(ue)?.hung.side === "left" ? "left" : "right");
							ra(cy(e, {
								align: "start",
								get anchor() {
									return H(de);
								},
								get "aria-label"() {
									return t.label;
								},
								avoidCollisions: !1,
								get customAnchor() {
									return H(j);
								},
								get "data-pin-card"() {
									return t.pin;
								},
								get "data-side"() {
									return H(n);
								},
								get "data-slot"() {
									return t.slot;
								},
								escapeKeydownBehavior: "defer-otherwise-ignore",
								forceMount: !0,
								frame: "thread",
								get from() {
									return H(r);
								},
								interactOutsideBehavior: "defer-otherwise-ignore",
								onCloseAutoFocus: (e) => e.preventDefault(),
								onneck: (e) => {
									R(M, e, !0);
								},
								onOpenAutoFocus: (e) => e.preventDefault(),
								inPlace: !0,
								onplaced: _e,
								get side() {
									return H(i);
								},
								sideOffset: 0,
								strategy: "absolute",
								trapFocus: !1,
								get joined() {
									return H(fe);
								},
								set joined(e) {
									R(fe, e, !0);
								},
								get ref() {
									return H(A);
								},
								set ref(e) {
									R(A, e, !0);
								},
								children: (e, n) => {
									var r = Ay();
									ii(dn(r), () => t.children), ve(r), ra(r, (e) => R(u, e), () => H(u)), W(e, r);
								},
								$$slots: { default: !0 }
							}), (e) => R(pe, e, !0), () => H(pe));
						}
					},
					$$slots: { default: !0 }
				});
			}), ve(n), Mn(() => r = Mi(n, "", r, { "--float-max": H(ue) ? `${H(ue).hung.max}px` : void 0 })), W(e, n);
		};
		si(l, (e) => {
			H(j) && H(de) && e(f);
		}), ve(n), Mn(() => s = Mi(i, "", s, {
			"--spot-x": H(ue) ? `${H(ue).hung.side === "left" ? H(ue).left + H(d) : H(ue).left - 1}px` : void 0,
			"--spot-y": H(ue) ? `${H(ue).top}px` : void 0
		})), yi(5, n, () => ye), yi(6, n, () => be), W(e, n);
	}, we = (e) => {
		var n = Ny();
		let a;
		var o = dn(n);
		ii(dn(o), () => t.children), ve(o), ra(o, (e) => R(u, e), () => H(u)), ve(n), ra(n, (e) => c(e), () => c()), Mn(() => {
			Xi(n, "aria-label", t.label), Ai(n, 1, wi(["pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max)", r() ? "inset-x-0 bottom-(--keyboard-lift,0px) w-full max-h-over-keyboard-70" : [
				"start-(--float-x) top-(--float-y) w-(--float-w)",
				"origin-(--float-origin)",
				Wv
			]])), Xi(n, "data-bare", i() || void 0), Xi(n, "data-sheet", r() || void 0), Xi(n, "data-side", H(E)?.side), Xi(n, "data-slot", t.slot), Xi(n, "data-state", H(ne)), Xi(n, "data-pin-card", t.pin), a = Mi(n, "", a, {
				"--float-x": H(E) ? `${H(E).left}px` : void 0,
				"--float-y": H(E) ? `${H(E).top}px` : void 0,
				"--float-origin": H(E) ? `${H(E).origin.x}px ${H(E).origin.y}px` : "bottom center",
				"--float-w": "min(var(--c-pin-card-reading-w), calc(100cqi - 2 * var(--space-2)))",
				"--float-max": H(E) ? `${H(E).max}px` : "calc(100% - 2 * var(--space-2))",
				"--sheet-pb": "calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
			}), Ai(o, 1, wi([
				"flex min-h-0 min-w-0 flex-col",
				!i() && "gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain",
				r() && "px-space-3 pt-space-3 pb-(--sheet-pb) border-t border-border-hairline rounded-t-lg bg-surface-raised shadow-drawer"
			]));
		}), yi(5, n, () => ye), yi(6, n, () => be), W(e, n);
	};
	si(Se, (e) => {
		H(l) ? e(Ce) : e(we, -1);
	}), W(e, xe), Je();
}
//#endregion
//#region ../../design-previews/comment-sizing/live/LiveCard.svelte
var Fy = /* @__PURE__ */ Fr("<div class=\"contents\" data-slot=\"live-thread\"></div>");
function Iy(e, t) {
	qe(t, !0);
	let n = G(t, "view", 7), r = (e) => {
		n().fill?.(e);
	};
	var i = U(), a = z(i), o = (e) => {
		{
			let t = /* @__PURE__ */ F(() => n().bare ? "Comment" : `Comment ${n().number}`), i = /* @__PURE__ */ F(() => n().bare ? void 0 : n().number), a = /* @__PURE__ */ F(() => n().bare ? "pin-composer" : "pin-card");
			Py(e, {
				get bare() {
					return n().bare;
				},
				get box() {
					return n().box;
				},
				get label() {
					return H(t);
				},
				get mark() {
					return n().mark;
				},
				get pin() {
					return H(i);
				},
				get room() {
					return n().room;
				},
				get sheet() {
					return n().sheet;
				},
				get slot() {
					return H(a);
				},
				tail: "bottom-start",
				get float() {
					return n().float;
				},
				set float(e) {
					n().float = e;
				},
				children: (e, t) => {
					var n = Fy();
					xi(n, () => r), W(e, n);
				},
				$$slots: { default: !0 }
			});
		}
	};
	si(a, (e) => {
		n().open && e(o);
	}), W(e, i), Je();
}
//#endregion
//#region ../../design-previews/comment-sizing/live/entry.svelte.js
function Ly(e, t) {
	let n = $t({ ...t }), r = Qr(Iy, {
		target: e,
		props: { view: n }
	});
	return {
		set(e) {
			Object.assign(n, e);
		},
		get float() {
			return n.float ?? null;
		},
		unmount() {
			ni(r);
		}
	};
}
//#endregion
export { Ly as mountCard };
