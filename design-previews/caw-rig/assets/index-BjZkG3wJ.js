(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={},t=Symbol(`uninitialized`),n=`http://www.w3.org/1999/xhtml`,r=`http://www.w3.org/2000/svg`,i=Array.isArray,a=Array.prototype.indexOf,o=Array.prototype.includes,s=Array.from,c=Object.defineProperty,l=Object.getOwnPropertyDescriptor,u=Object.getOwnPropertyDescriptors,d=Object.prototype,f=Array.prototype,p=Object.getPrototypeOf,m=Object.isExtensible,h=()=>{};function g(e){for(var t=0;t<e.length;t++)e[t]()}function _(){var e,t;return{promise:new Promise((n,r)=>{e=n,t=r}),resolve:e,reject:t}}function v(e,t){if(Array.isArray(e))return e;if(t===void 0||!(Symbol.iterator in e))return Array.from(e);let n=[];for(let r of e)if(n.push(r),n.length===t)break;return n}var y=1<<24,b=1024,x=2048,S=4096,C=8192,w=16384,T=32768,ee=1<<25,E=65536,D=1<<19,te=1<<20,ne=1<<25,re=1<<21,O=1<<22,ie=1<<23,k=Symbol(`$state`),ae=Symbol(`component`),A=Symbol(`legacy props`),oe=Symbol(``),se=Symbol(`attributes`),ce=Symbol(`class`),le=Symbol(`style`),j=Symbol(`text`),M=Symbol(`form reset`),ue=new class extends Error{name=`StaleReactionError`;message="The reaction that called `getAbortSignal()` was re-run or destroyed"},de=!!globalThis.document?.contentType&&globalThis.document.contentType.includes(`xml`);function N(){console.warn(`https://svelte.dev/e/derived_inert`)}function fe(e){console.warn(`https://svelte.dev/e/hydration_mismatch`)}function pe(){console.warn(`https://svelte.dev/e/select_multiple_invalid_value`)}function P(){console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`)}var F=!1;function I(e){F=e}var L;function me(t){if(t===null)throw fe(),e;return L=t}function he(){return me(cn(L))}function R(t){if(F){if(cn(L)!==null)throw fe(),e;L=t}}function ge(e=1){if(F){for(var t=e,n=L;t--;)n=cn(n);L=n}}function _e(e=!0){for(var t=0,n=L;;){if(n.nodeType===8){var r=n.data;if(r===`]`){if(t===0)return n;--t}else(r===`[`||r===`[!`||r[0]===`[`&&!isNaN(Number(r.slice(1))))&&(t+=1)}var i=cn(n);e&&n.remove(),n=i}}function ve(t){if(!t||t.nodeType!==8)throw fe(),e;return t.data}function ye(e){return e===this.v}function be(e,t){return e==e?e!==t||typeof e==`object`&&!!e||typeof e==`function`:t==t}function xe(e){return!be(e,this.v)}function Se(e){throw Error(`https://svelte.dev/e/lifecycle_outside_component`)}function Ce(){throw Error(`https://svelte.dev/e/set_context_after_init`)}function we(){throw Error(`https://svelte.dev/e/async_derived_orphan`)}function Te(e,t,n){throw Error(`https://svelte.dev/e/each_key_duplicate`)}function Ee(e){throw Error(`https://svelte.dev/e/effect_in_teardown`)}function De(){throw Error(`https://svelte.dev/e/effect_in_unowned_derived`)}function Oe(e){throw Error(`https://svelte.dev/e/effect_orphan`)}function ke(){throw Error(`https://svelte.dev/e/effect_update_depth_exceeded`)}function Ae(e){throw Error(`https://svelte.dev/e/props_invalid_value`)}function je(){throw Error(`https://svelte.dev/e/state_descriptors_fixed`)}function Me(){throw Error(`https://svelte.dev/e/state_prototype_fixed`)}function Ne(){throw Error(`https://svelte.dev/e/state_unsafe_mutation`)}function Pe(){throw Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`)}var Fe=!1;function Ie(){Fe=!0}function Le(e){let t=e.p;for(;t!==null&&t.c===null;)t=t.p;return t?.c??null}function Re(e,t){return e===null&&Se(t),e.c??=new Map(Le(e)||void 0)}var ze=null;function Be(e){ze=e}function Ve(e){return Re(ze,`getContext`).get(e)}function He(e,t){let n=Re(ze,`setContext`);if(Fe){var r=G.f;!W&&r&32&&!ze.i||Ce()}return n.set(e,t),t}function Ue(e,t=!1,n){ze={p:ze,i:!1,c:null,e:null,s:e,x:null,r:G,l:null}}function We(e){var t=ze,n=t.e;if(n!==null){t.e=null;for(var r of n)Cn(r)}return e!==void 0&&(t.x=e),t.i=!0,ze=t.p,Ge(e)}function Ge(e={}){return c(e,ae,{value:!0}),e}function Ke(){return!0}var qe=[];function Je(){var e=qe;qe=[],g(e)}function Ye(e){if(qe.length===0&&!wt){var t=qe;queueMicrotask(()=>{t===qe&&Je()})}qe.push(e)}function Xe(){for(;qe.length>0;)Je()}var Ze=~(x|S|b);function Qe(e,t){e.f=e.f&Ze|t}function $e(e){e.f&512||e.deps===null?Qe(e,b):Qe(e,S)}function et(e,t,n){e.f&2048?t.add(e):e.f&4096&&n.add(e),Qe(e,b)}function tt(e,t){if(t){let t=document.body;e.autofocus=!0,Ye(()=>{document.activeElement===t&&e.focus()})}}var nt=!1;function rt(){nt||(nt=!0,document.addEventListener(`reset`,e=>{Promise.resolve().then(()=>{if(!e.defaultPrevented)for(let t of e.target.elements)t[M]?.()})},{capture:!0}))}function it(e){var t=W,n=G;Yn(null),Xn(null);try{return e()}finally{Yn(t),Xn(n)}}function at(e,t,n,r){let i=Ke()?lt:pt;var a=e.filter(e=>!e.settled),o=t.map(i);if(n.length===0&&a.length===0){r(o);return}var s=G,c=ot(),l=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(e=>e.promise)):null;function u(e){if(!(s.f&16384)){c();try{r([...o,...e])}catch(e){gn(e,s)}st()}}var d=ct();if(n.length===0){l.then(()=>u([])).finally(d);return}function f(){Promise.all(n.map(e=>dt(e))).then(u).catch(e=>gn(e,s)).finally(d)}l?l.then(()=>{if(s.f&16384){d();return}c(),f(),st()}):f()}function ot(){var e=G,t=W,n=ze,r=z;return function(i=!0){Xn(e),Yn(t),Be(n),i&&!(e.f&16384)&&(r?.activate(),r?.apply())}}function st(e=!0){Xn(null),Yn(null),Be(null),e&&z?.deactivate()}function ct(){var e=G,t=e.b,n=z,r=!!t?.is_rendered();return t?.update_pending_count(1,n),n.increment(r,e),()=>{t?.update_pending_count(-1,n),n.decrement(r,e)}}function lt(e){var n=2|x;return G!==null&&(G.f|=D),{ctx:ze,deps:null,effects:null,equals:ye,f:n,fn:e,reactions:null,rv:0,v:t,wv:0,parent:G,ac:null}}var ut=Symbol(`obsolete`);function dt(e,n,r){let i=G;i===null&&we();var a=void 0,o=Ut(t),s=!W,c=new Set;return On(()=>{var t=G,n=_();a=n.promise;try{Promise.resolve(e()).then(n.resolve,e=>{e!==ue&&n.reject(e)}).finally(st)}catch(e){n.reject(e),st()}var r=z;if(s){if(t.f&32768)var l=ct();if(i.b?.is_rendered())r.async_deriveds.get(t)?.reject(ut);else for(let e of c.values())e.reject(ut);c.add(n),r.async_deriveds.set(t,n)}let u=(e,t=void 0)=>{l?.(),c.delete(n),t!==ut&&(r.activate(),t?(o.f|=ie,qt(o,t)):(o.f&8388608&&(o.f^=ie),qt(o,e)),r.deactivate())};n.promise.then(u,e=>u(null,e||`unknown`))}),xn(()=>{for(let e of c)e.reject(ut)}),new Promise(e=>{function t(n){function r(){n===a?e(o):t(a)}n.then(r,r)}t(a)})}function ft(e){let t=lt(e);return Fe||Qn(t),t}function pt(e){let t=lt(e);return t.equals=xe,t}function mt(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)Ln(t[n])}}function ht(e){var n,r=G,i=e.parent;if(!Kn&&i!==null&&e.v!==t&&i.f&24576)return N(),e.v;Xn(i);try{mt(e),n=ur(e)}finally{Xn(r)}return n}function gt(e){var t=ht(e);if(!e.equals(t)&&(e.wv=sr(),(!z?.is_fork||e.deps===null)&&(z===null?e.v=t:(z.capture(e,t,!0),xt?.capture(e,t,!0)),e.deps===null))){Qe(e,b);return}Kn||(St===null?$e(e):(bn()||z?.is_fork)&&St.set(e,t))}function _t(e){if(e.effects!==null)for(let t of e.effects)(t.teardown||t.ac)&&(t.teardown?.(),t.ac!==null&&it(()=>{t.ac.abort(ue),t.ac=null}),t.fn!==null&&(t.teardown=h),pr(t,0),Fn(t))}function vt(e){if(e.effects!==null)for(let t of e.effects)t.teardown&&t.fn!==null&&mr(t)}var yt=null,bt=null,z=null,xt=null,St=null,Ct=null,wt=!1,Tt=!1,Et=null,Dt=null,Ot=0,kt=1,At=class e{id=kt++;#e=!1;linked=!0;#t=null;#n=null;async_deriveds=new Map;current=new Map;previous=new Map;#r=new Set;#i=new Set;#a=0;#o=new Map;#s=null;#c=[];#l=[];#u=new Set;#d=new Set;#f=new Map;#p=new Set;is_fork=!1;#m=!1;constructor(){bt===null?yt=bt=this:(bt.#n=this,this.#t=bt),bt=this}#h(){if(this.is_fork)return!0;for(let n of this.#o.keys()){for(var e=n,t=!1;e.parent!==null;){if(this.#f.has(e)){t=!0;break}e=e.parent}if(!t)return!0}return!1}skip_effect(e){this.#f.has(e)||this.#f.set(e,{d:[],m:[]}),this.#p.delete(e)}unskip_effect(e,t=e=>this.schedule(e)){var n=this.#f.get(e);if(n){this.#f.delete(e);for(var r of n.d)Qe(r,x),t(r);for(r of n.m)Qe(r,S),t(r)}this.#p.add(e)}#g(){var e=[];for(let i of this.#c)if(!(i.f&16384||!(i.f&6144))){for(var t=i,n=!1;t.parent!==null;){t=t.parent;var r=t.f;if(r&96){if(!(r&1024)){n=!0;break}t.f^=b}}n||e.push(t)}return this.#c=[],e}#_(){this.#e=!0;for(let e of this.#u)this.#d.delete(e),Qe(e,x),this.schedule(e);for(let e of this.#d)Qe(e,S),this.schedule(e);this.apply();for(var t=Et=[],n=[],r=Dt=[];this.#c.length>0;){Ot++>1e3&&(this.#C(),Mt());for(let e of this.#g())try{this.#v(e,t,n)}catch(t){throw zt(e),this.#h()||this.discard(),t}}if(z=null,r.length>0){var i=e.ensure();for(let e of r)i.schedule(e)}if(Et=null,Dt=null,this.#h()){this.#x(n),this.#x(t);for(let[e,t]of this.#f)Rt(e,t);r.length>0&&z.#_();return}let a=this.#y();if(a){this.#x(n),this.#x(t),a.#b(this);return}this.#u.clear(),this.#d.clear();for(let e of this.#r)e(this);this.#r.clear(),xt=this,Pt(n),Pt(t),xt=null,this.#s?.resolve();var o=z;if(this.#a===0&&(this.#c.length===0||o!==null)&&(this.#C(),Fe&&(this.#S(),z=o)),this.#c.length>0){if(o!==null){for(let e of this.#c)o.#c.push(e);this.#c=[]}else o=this}o!==null&&(Vt.clear(),o.#_())}#v(e,t,n){e.f^=b;for(var r=e.first;r!==null;){var i=r.f,a=!!(i&96);if(!(a&&i&1024||i&8192||this.#f.has(r))&&r.fn!==null){a?r.f^=b:i&4?t.push(r):Fe&&i&16777224?n.push(r):cr(r)&&(i&16&&this.#d.add(r),mr(r));var o=r.first;if(o!==null){r=o;continue}}for(;r!==null;){var s=r.next;if(s!==null){r=s;break}r=r.parent}}}#y(){for(var e=this.#t;e!==null;){if(!e.is_fork){for(let[t,[,n]]of this.current)if(e.current.has(t)&&!n)return e}e=e.#t}return null}#b(e){for(let[t,n]of e.current)!this.previous.has(t)&&e.previous.has(t)&&this.previous.set(t,e.previous.get(t)),this.current.set(t,n);for(let[t,n]of e.async_deriveds){let e=this.async_deriveds.get(t);e&&n.promise.then(e.resolve).catch(e.reject)}e.async_deriveds.clear(),this.transfer_effects(e.#u,e.#d);let t=e=>{var n=e.reactions;if(n!==null&&!(e.f&2&&!(e.f&6144)))for(let e of n){var r=e.f;if(r&2)t(e);else{var i=e;r&4194320&&!this.async_deriveds.has(i)&&(this.#d.delete(i),Qe(i,x),this.schedule(i))}}};for(let e of this.current.keys())t(e);this.oncommit(()=>e.discard()),e.#C(),z=this,this.#_()}#x(e){for(var t=0;t<e.length;t+=1)et(e[t],this.#u,this.#d)}capture(e,n,r=!1){e.v!==t&&!this.previous.has(e)&&this.previous.set(e,e.v),e.f&8388608||(this.current.set(e,[n,r]),St?.set(e,n)),this.is_fork||(e.v=n)}activate(){z=this}deactivate(){z=null,St=null}flush(){try{Tt=!0,z=this,this.#_()}finally{Ot=0,Ct=null,Et=null,Dt=null,Tt=!1,z=null,St=null,Vt.clear()}}discard(){for(let e of this.#i)e(this);this.#i.clear();for(let e of this.async_deriveds.values())e.reject(ut);this.#C(),this.#s?.resolve()}register_created_effect(e){this.#l.push(e)}#S(){for(let u=yt;u!==null;u=u.#n){var e=u.id<this.id,t=[];for(let[r,[i,a]]of this.current){if(u.current.has(r)){var n=u.current.get(r)[0];if(e&&i!==n)u.current.set(r,[i,a]);else continue}t.push(r)}if(e)for(let[e,t]of this.async_deriveds){let n=u.async_deriveds.get(e);n&&t.promise.then(n.resolve).catch(n.reject)}var r=[...u.current.keys()].filter(e=>!u.current.get(e)[1]);if(u.#e&&r.length!==0){var i=r.filter(e=>!this.current.has(e));if(i.length===0)e&&u.discard();else if(t.length>0){if(e)for(let e of this.#p)u.unskip_effect(e,e=>{e.f&4194320?u.schedule(e):u.#x([e])});u.activate();var a=new Set,o=new Map;for(var s of t)Ft(s,i,a,o);o=new Map;var c=[...u.current].filter(([e,t])=>{let n=this.current.get(e);return!n||n[0]!==t[0]||n[1]!==t[1]}).map(([e])=>e);if(c.length>0)for(let e of this.#l)!(e.f&155648)&&It(e,c,o)&&(e.f&4194320?(Qe(e,x),u.schedule(e)):u.#u.add(e));if(u.#c.length>0&&!u.#m){u.apply();for(var l of u.#g())u.#v(l,[],[])}u.deactivate()}}}}increment(e,t){if(this.#a+=1,e){let e=this.#o.get(t)??0;this.#o.set(t,e+1)}}decrement(e,t){if(--this.#a,e){let e=this.#o.get(t)??0;e===1?this.#o.delete(t):this.#o.set(t,e-1)}this.#m||(this.#m=!0,Ye(()=>{this.#m=!1,this.linked&&this.flush()}))}transfer_effects(e,t){for(let t of e)this.#u.add(t);for(let e of t)this.#d.add(e);e.clear(),t.clear()}oncommit(e){this.#r.add(e)}ondiscard(e){this.#i.add(e)}settled(){return(this.#s??=_()).promise}static ensure(){if(z===null){let t=z=new e;!Tt&&!wt&&Ye(()=>{t.#e||t.flush()})}return z}apply(){if(!Fe||!this.is_fork&&this.#t===null&&this.#n===null){St=null;return}St=new Map;for(let[e,[t]]of this.current)St.set(e,t);for(let t=yt;t!==null;t=t.#n)if(!(t===this||t.is_fork)){var e=!1;if(t.id<this.id){for(let[n,[,r]]of t.current)if(!r&&this.current.has(n)){e=!0;break}}if(!e)for(let[e,n]of t.previous)St.has(e)||St.set(e,n)}}schedule(e){if(Ct=e,e.b?.is_pending&&e.f&16777228&&!(e.f&32768)){e.b.defer_effect(e);return}this.#c.push(e)}#C(){if(this.linked){var e=this.#t,t=this.#n;e===null?yt=t:e.#n=t,t===null?bt=e:t.#t=e,this.linked=!1}}};function jt(e){var t=wt,n=xt;xt=null,wt=!0;try{var r;for(e&&(jt(),r=e());;){if(Xe(),z===null)return r;z.flush()}}finally{wt=t,xt=n}}function Mt(){try{ke()}catch(e){gn(e,Ct)}}var Nt=null;function Pt(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var r=e[n++];if(!(r.f&24576)&&cr(r)&&(Nt=new Set,mr(r),r.deps===null&&r.first===null&&r.nodes===null&&r.teardown===null&&r.ac===null&&zn(r),Nt?.size>0)){Vt.clear();for(let e of Nt){if(e.f&24576)continue;let t=[e],n=e.parent;for(;n!==null;)Nt.has(n)&&(Nt.delete(n),t.push(n)),n=n.parent;for(let e=t.length-1;e>=0;e--){let n=t[e];n.f&24576||mr(n)}}Nt.clear()}}Nt=null}}function Ft(e,t,n,r){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(let i of e.reactions){let e=i.f;e&2?Ft(i,t,n,r):e&4194320&&!(e&2048)&&It(i,t,r)&&(Qe(i,x),Lt(i))}}function It(e,t,n){let r=n.get(e);if(r!==void 0)return r;if(e.deps!==null)for(let r of e.deps){if(o.call(t,r))return!0;if(r.f&2&&It(r,t,n))return n.set(r,!0),!0}return n.set(e,!1),!1}function Lt(e){z.schedule(e)}function Rt(e,t){if(!(e.f&32&&e.f&1024)){e.f&2048?t.d.push(e):e.f&4096&&t.m.push(e),Qe(e,b);for(var n=e.first;n!==null;)Rt(n,t),n=n.next}}function zt(e){Qe(e,b);for(var t=e.first;t!==null;)zt(t),t=t.next}var Bt=new Set,Vt=new Map,Ht=!1;function Ut(e,t){return{f:0,v:e,reactions:null,equals:ye,rv:0,wv:0}}function B(e,t){let n=Ut(e,t);return Qn(n),n}function Wt(e,t=!1,n=!0){let r=Ut(e);return t||(r.equals=xe),r}function V(e,t,n=!1){return W!==null&&(!Jn||W.f&131072)&&Ke()&&W.f&4325394&&(Zn===null||!Zn.has(e))&&Ne(),qt(e,n?Zt(t):t,Dt)}var Gt=null,Kt=0;function qt(e,t,n=null){if(!e.equals(t)){Kn?Vt.set(e,t):Vt.has(e)||Vt.set(e,e.v);var r=At.ensure();if(r.capture(e,t),e.f&2){let t=e;e.f&2048&&ht(t),St===null&&$e(t)}e.wv=sr(),Gt=null,Kt=0,Xt(e,x,n),Gt=null,Ke()&&G!==null&&G.f&1024&&!(G.f&96)&&(tr===null?nr([e]):tr.push(e)),!r.is_fork&&Bt.size>0&&!Ht&&Jt()}return t}function Jt(){Ht=!1;for(let e of Bt){e.f&1024&&Qe(e,S);let t;try{t=cr(e)}catch{t=!0}t&&mr(e)}Bt.clear()}function Yt(e){V(e,e.v+1)}function Xt(e,t,n){var r=e.reactions;if(r!==null){var i=Ke(),a=r.length;if(Kt+=a,Kt>1e5&&Gt===null&&(Gt=new Set),Gt!==null){if(Gt.has(e))return;Gt.add(e)}for(var o=0;o<a;o++){var s=r[o],c=s.f;if(i||s!==G){var l=(c&x)===0;if(l&&Qe(s,t),c&131072)Bt.add(s);else if(c&2){var u=s;St?.delete(u),Xt(u,S,n)}else if(l){var d=s;c&16&&Nt!==null&&Nt.add(d),n===null?Lt(d):n.push(d)}}}}}function Zt(e){if(typeof e!=`object`||!e||k in e||ae in e)return e;let n=p(e);if(n!==d&&n!==f)return e;var r=new Map,a=i(e),o=B(0),s=null,c=ar,u=e=>{if(ar===c)return e();var t=W,n=ar;Yn(null),or(c);var r=e();return Yn(t),or(n),r};return a&&r.set(`length`,B(e.length,s)),new Proxy(e,{defineProperty(e,t,n){(!(`value`in n)||n.configurable===!1||n.enumerable===!1||n.writable===!1)&&je();var i=r.get(t);return i===void 0?u(()=>{var e=B(n.value,s);return r.set(t,e),e}):V(i,n.value,!0),!0},deleteProperty(e,n){var i=r.get(n);if(i===void 0){if(n in e){let e=u(()=>B(t,s));r.set(n,e),Yt(o)}}else V(i,t),Yt(o);return!0},get(n,i,a){if(i===k)return e;var o=r.get(i),c=i in n;if(o===void 0&&(!c||l(n,i)?.writable)&&(o=u(()=>B(Zt(c?n[i]:t),s)),r.set(i,o)),o!==void 0){var d=K(o);return d===t?void 0:d}return Reflect.get(n,i,a)},getOwnPropertyDescriptor(e,n){this.has?.(e,n);var i=Reflect.getOwnPropertyDescriptor(e,n),a=r.get(n);if(a!==void 0){var o=K(a);if(o===t)return;if(i&&`value`in i)i.value=o;else return{enumerable:!0,configurable:!0,value:o,writable:!0}}return i},has(e,n){if(n===k)return!0;var i=r.get(n),a=i!==void 0&&i.v!==t||Reflect.has(e,n);return(i!==void 0||G!==null&&(!a||l(e,n)?.writable))&&(i===void 0&&(i=u(()=>B(a?Zt(e[n]):t,s)),r.set(n,i)),K(i)===t)?!1:a},set(e,n,i,c){var d=r.get(n),f=n in e;if(a&&n===`length`)for(var p=i;p<d.v;p+=1){var m=r.get(p+``);m===void 0?p in e&&(m=u(()=>B(t,s)),r.set(p+``,m)):V(m,t)}if(d===void 0)(!f||l(e,n)?.writable)&&(d=u(()=>B(void 0,s)),V(d,Zt(i)),r.set(n,d));else{f=d.v!==t;var h=u(()=>Zt(i));V(d,h)}var g=Reflect.getOwnPropertyDescriptor(e,n);if(g?.set&&g.set.call(c,i),!f){if(a&&typeof n==`string`){var _=r.get(`length`),v=Number(n);Number.isInteger(v)&&v>=_.v&&V(_,v+1)}Yt(o)}return!0},ownKeys(e){K(o);var n=Reflect.ownKeys(e).filter(e=>{var n=r.get(e);return n===void 0||n.v!==t});for(var[i,a]of r)a.v!==t&&!(i in e)&&n.push(i);return n},setPrototypeOf(){Me()}})}function Qt(e){try{if(typeof e==`object`&&e&&k in e)return e[k]}catch{}return e}function $t(e,t){return Object.is(Qt(e),Qt(t))}var en,tn,nn,rn;function an(){if(en===void 0){en=window,tn=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;nn=l(t,`firstChild`).get,rn=l(t,`nextSibling`).get,m(e)&&(e[ce]=void 0,e[se]=null,e[le]=void 0,e.__e=void 0),m(n)&&(n[j]=void 0)}}function on(e=``){return document.createTextNode(e)}function sn(e){return nn.call(e)}function cn(e){return rn.call(e)}function H(e,t){if(!F)return sn(e);var n=sn(L);if(n===null)n=L.appendChild(on());else if(t&&n.nodeType!==3){var r=on();return n?.before(r),me(r),r}return t&&mn(n),me(n),n}function ln(e,t=!1){if(!F){var n=sn(e);return n instanceof Comment&&n.data===``?cn(n):n}if(t){if(L?.nodeType!==3){var r=on();return L?.before(r),me(r),r}mn(L)}return L}function un(e,t=!1){if(!F)return sn(e);var n=H(e,t);return R(e),n}function U(e,t=1,n=!1){let r=F?L:e;for(var i;t--;)i=r,r=cn(r);if(!F)return r;if(n){if(r?.nodeType!==3){var a=on();return r===null?i?.after(a):r.before(a),me(a),a}mn(r)}return me(r),r}function dn(e){e.textContent=``}function fn(){return!Fe||Nt!==null?!1:(G.f&T)!==0}function pn(e,t,n){return t==null||t===`http://www.w3.org/1999/xhtml`?n?document.createElement(e,{is:n}):document.createElement(e):n?document.createElementNS(t,e,{is:n}):document.createElementNS(t,e)}function mn(e){if(e.nodeValue.length<65536)return;let t=e.nextSibling;for(;t!==null&&t.nodeType===3;)t.remove(),e.nodeValue+=t.nodeValue,t=e.nextSibling}function hn(e){var t=G;if(t===null)return W.f|=ie,e;if(!(t.f&32768)&&!(t.f&4))throw e;gn(e,t)}function gn(t,n){if(t===e)throw t;if(!(n!==null&&n.f&16384)){for(;n!==null;){if(n.f&128&&!(n.f&33570816)){if(!(n.f&32768))throw t;try{n.b.error(t);return}catch(e){t=e}}n=n.parent}throw t}}function _n(e){G===null&&(W===null&&Oe(e),De()),Kn&&Ee(e)}function vn(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function yn(e,t){var n=G;n!==null&&n.f&8192&&(e|=C);var r={ctx:ze,deps:null,nodes:null,f:e|x|512,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};z?.register_created_effect(r);var i=r;if(e&4)Et===null?At.ensure().schedule(r):Et.push(r);else if(t!==null){try{mr(r)}catch(e){throw Ln(r),e}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&!(i.f&524288)&&(i=i.first,e&16&&e&65536&&i!==null&&(i.f|=E))}if(i!==null&&(i.parent=n,n!==null&&vn(i,n),W!==null&&W.f&2&&!(e&64))){var a=W;(a.effects??=[]).push(i)}return r}function bn(){return W!==null&&!Jn}function xn(e){let t=yn(8,null);return Qe(t,b),t.teardown=e,t}function Sn(e){_n(`$effect`);var t=G.f;if(!W&&t&32&&ze!==null&&!ze.i){var n=ze;(n.e??=[]).push(e)}else return Cn(e)}function Cn(e){return yn(4|te,e)}function wn(e){return _n(`$effect.pre`),yn(8|te,e)}function Tn(e){At.ensure();let t=yn(64|D,e);return()=>{Ln(t)}}function En(e){At.ensure();let t=yn(64|D,e);return(e={})=>new Promise(n=>{e.outro?Bn(t,()=>{Ln(t),n(void 0)}):(Ln(t),n(void 0))})}function Dn(e){return yn(4,e)}function On(e){return yn(O|D,e)}function kn(e,t=0){return yn(8|t,e)}function An(e,t=[],n=[],r=[]){at(r,t,n,t=>{yn(8,()=>{e(...t.map(K))})})}function jn(e,t=0){return yn(16|t,e)}function Mn(e,t=0){return yn(y|t,e)}function Nn(e){return yn(32|D,e)}function Pn(e){var t=e.teardown;if(t!==null){let n=Kn,r=W;qn(!0),Yn(null);try{t.call(null)}catch(t){gn(t,e.parent)}finally{qn(n),Yn(r)}}}function Fn(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){let e=n.ac;e!==null&&it(()=>{e.abort(ue)});var r=n.next;n.f&64?n.parent=null:Ln(n,t),n=r}}function In(e){for(var t=e.first;t!==null;){var n=t.next;t.f&32||Ln(t),t=n}}function Ln(e,t=!0){var n=!1;(t||e.f&262144)&&e.nodes!==null&&e.nodes.end!==null&&(Rn(e.nodes.start,e.nodes.end),n=!0),e.f|=ee,Fn(e,t&&!n),pr(e,0);var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)e.stop();Pn(e),e.f^=ee,e.f|=w;var i=e.parent;i!==null&&i.first!==null&&zn(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Rn(e,t){for(;e!==null;){var n=e===t?null:cn(e);e.remove(),e=n}}function zn(e){var t=e.parent,n=e.prev,r=e.next;n!==null&&(n.next=r),r!==null&&(r.prev=n),t!==null&&(t.first===e&&(t.first=r),t.last===e&&(t.last=n))}function Bn(e,t,n=!0){var r=[];e.f|=256,Vn(e,r,!0);var i=()=>{n&&Ln(e),t&&t()},a=r.length;if(a>0){var o=()=>--a||i();for(var s of r)s.out(o)}else i()}function Vn(e,t,n){if(!(e.f&8192)){e.f^=C;var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)(e.is_global||n)&&t.push(e);for(var i=e.first;i!==null;){var a=i.next;if(!(i.f&64)){var o=!!(i.f&65536)||!!(i.f&32)&&!!(e.f&16);Vn(i,t,o?n:!1)}i=a}}}function Hn(e){e.f&=-257,Un(e,!0)}function Un(e,t){if(!(e.f&256)&&e.f&8192){e.f^=C,e.f&1024||(Qe(e,x),At.ensure().schedule(e));for(var n=e.first;n!==null;){var r=n.next,i=!!(n.f&65536)||!!(n.f&32);Un(n,i?t:!1),n=r}var a=e.nodes&&e.nodes.t;if(a!==null)for(let e of a)(e.is_global||t)&&e.in()}}function Wn(e,t){if(e.nodes)for(var n=e.nodes.start,r=e.nodes.end;n!==null;){var i=n===r?null:cn(n);t.append(n),n=i}}var Gn=null,Kn=!1;function qn(e){Kn=e}var W=null,Jn=!1;function Yn(e){W=e}var G=null;function Xn(e){G=e}var Zn=null;function Qn(e){W!==null&&(!Fe&&W.f&2097152||W.f&2)&&(Zn??=new Set).add(e)}var $n=null,er=0,tr=null;function nr(e){tr=e}var rr=1,ir=0,ar=ir;function or(e){ar=e}function sr(){return++rr}function cr(e){var t=e.f;if(t&2048)return!0;if(t&4096){for(var n=e.deps,r=n.length,i=0;i<r;i++){var a=n[i];if(cr(a)&&gt(a),a.wv>e.wv)return!0}t&512&&St===null&&Qe(e,b)}return!1}function lr(e,t,n=!0){var r=e.reactions;if(r!==null&&(Fe||Zn===null||!Zn.has(e)))for(var i=0;i<r.length;i++){var a=r[i];a.f&2?lr(a,t,!1):t===a&&(n?Qe(a,x):a.f&1024&&Qe(a,S),Lt(a))}}function ur(e){var t=$n,n=er,r=tr,i=W,a=Zn,o=ze,s=Jn,c=ar,l=e.f;$n=null,er=0,tr=null,W=l&96?null:e,Zn=null,Be(e.ctx),Jn=!1,ar=++ir,e.ac!==null&&(it(()=>{e.ac.abort(ue)}),e.ac=null);try{e.f|=re;var u=e.fn,d=u();e.f|=T;var f=dr(e);if(Ke()&&tr!==null&&!Jn&&f!==null&&!(e.f&6146))for(var p=0;p<tr.length;p++)lr(tr[p],e);if(i!==null&&i!==e){if(ir++,i.deps!==null)for(let e=0;e<n;e+=1)i.deps[e].rv=ir;if(t!==null)for(let e of t)e.rv=ir;tr!==null&&(r===null?r=tr:r.push(...tr))}return e.f&8388608&&(e.f^=ie),d}catch(t){return dr(e),hn(t)}finally{e.f^=re,$n=t,er=n,tr=r,W=i,Zn=a,Be(o),Jn=s,ar=c}}function dr(e){var t=e.deps,n=z?.is_fork;if($n!==null){var r;if(n||pr(e,er),t!==null&&er>0)for(t.length=er+$n.length,r=0;r<$n.length;r++)t[er+r]=$n[r];else e.deps=t=$n;if(bn()&&e.f&512)for(r=er;r<t.length;r++)(t[r].reactions??=[]).push(e)}else!n&&t!==null&&er<t.length&&(pr(e,er),t.length=er);return t}function fr(e,n){let r=n.reactions;if(r!==null){var i=a.call(r,e);if(i!==-1){var s=r.length-1;s===0?r=n.reactions=null:(r[i]=r[s],r.pop())}}if(r===null&&n.f&2&&($n===null||!o.call($n,n))){var c=n;c.f&512&&(c.f^=512),c.v!==t&&$e(c),c.ac!==null&&it(()=>{c.ac.abort(ue),c.ac=null,Qe(c,x)}),_t(c),pr(c,0)}}function pr(e,t){var n=e.deps;if(n!==null)for(var r=t;r<n.length;r++)fr(e,n[r])}function mr(e){var t=e.f;if(!(t&16384)){Qe(e,b);var n=G;G=e;try{t&16777232?In(e):Fn(e),Pn(e);var r=ur(e);e.teardown=typeof r==`function`?r:null,e.wv=rr}finally{G=n}}}function K(e){var t=!!(e.f&2);if(Gn?.add(e),W!==null&&!Jn&&!(G!==null&&G.f&16384)&&(Zn===null||!Zn.has(e))){var n=W.deps;if(W.f&2097152)e.rv<ir&&(e.rv=ir,$n===null&&n!==null&&n[er]===e?er++:$n===null?$n=[e]:$n.push(e));else{W.deps??=[],o.call(W.deps,e)||W.deps.push(e);var r=e.reactions;r===null?e.reactions=[W]:o.call(r,W)||r.push(W)}}if(Kn&&Vt.has(e))return Vt.get(e);if(t){var i=e;if(Kn){var a=i.v;return(!(i.f&1024)&&i.reactions!==null||gr(i))&&(a=ht(i)),Vt.set(i,a),a}var s=!(i.f&512)&&!Jn&&W!==null&&!!(W.f&512),c=(i.f&T)===0;cr(i)&&(s&&(i.f|=512),gt(i)),s&&!c&&(vt(i),hr(i))}if(St?.has(e))return St.get(e);if(e.f&8388608)throw e.v;return e.v}function hr(e){if(e.f|=512,e.deps!==null)for(let n of e.deps){var t=n.reactions;t===null?n.reactions=[e]:o.call(t,e)||t.push(e),n.f&2&&!(n.f&512)&&(vt(n),hr(n))}}function gr(e){if(e.v===t)return!0;if(e.deps===null)return!1;for(let t of e.deps)if(Vt.has(t)||t.f&2&&gr(t))return!0;return!1}function _r(e){var t=Jn;try{return Jn=!0,e()}finally{Jn=t}}function vr(e){if(!(typeof e!=`object`||!e||e instanceof EventTarget)){if(k in e)yr(e);else if(!Array.isArray(e))for(let t in e){let n=e[t];typeof n==`object`&&n&&k in n&&yr(n)}}}function yr(e,t=new Set){if(typeof e==`object`&&e&&!(e instanceof EventTarget)&&!t.has(e)){t.add(e),e instanceof Date&&e.getTime();for(let n in e)try{yr(e[n],t)}catch{}let n=p(e);if(n!==Object.prototype&&n!==Array.prototype&&n!==Map.prototype&&n!==Set.prototype&&n!==Date.prototype){let t=u(n);for(let n in t){let r=t[n].get;if(r)try{r.call(e)}catch{}}}}}var br=Symbol(`events`),xr=new Set,Sr=new Set;function Cr(e,t,n,r={}){function i(e){if(r.capture||kr.call(t,e),!e.cancelBubble)return it(()=>n?.call(this,e))}return e.startsWith(`pointer`)||e.startsWith(`touch`)||e===`wheel`?(i.__removed=!1,Ye(()=>{i.__removed||t.addEventListener(e,i,r)})):t.addEventListener(e,i,r),i}function wr(e,t,n,r={}){var i=Cr(t,e,n,r);return()=>{i.__removed=!0,e.removeEventListener(t,i,r)}}function Tr(e,t,n){(t[br]??={})[e]=n}function Er(e){for(var t=0;t<e.length;t++)xr.add(e[t]);for(var n of Sr)n(e)}var Dr=null,Or=!1;function kr(e){var t=this,n=t.ownerDocument,r=e.type,i=e.composedPath?.()||[],a=i[0]||e.target;Dr=e,Or||(Or=!0,setTimeout(()=>{Or=!1,Dr=null}));var o=0,s=Dr===e&&e[br];if(s){var l=i.indexOf(s);if(l!==-1&&(t===document||t===window)){e[br]=t;return}var u=i.indexOf(t);if(u===-1)return;l<=u&&(o=l)}if(a=i[o]||e.target,a!==t){c(e,`currentTarget`,{configurable:!0,get(){return a||n}});var d=W,f=G;Yn(null),Xn(null);try{for(var p,m=[];a!==null&&a!==t;){try{var h=a[br]?.[r];h!=null&&(!a.disabled||e.target===a)&&h.call(a,e)}catch(e){p?m.push(e):p=e}if(e.cancelBubble)break;o++,a=o<i.length?i[o]:null}if(p){for(let e of m)queueMicrotask(()=>{throw e});throw p}}finally{e[br]=t,delete e.currentTarget,Yn(d),Xn(f)}}}var Ar=globalThis?.window?.trustedTypes&&globalThis.window.trustedTypes.createPolicy(`svelte-trusted-html`,{createHTML:e=>e});function jr(e){return Ar?.createHTML(e)??e}function Mr(e){var t=pn(`template`);return t.innerHTML=jr(e.replaceAll(`<!>`,`<!---->`)),t.content}function Nr(e,t){var n=G;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function Pr(e,t){var n=!!(t&1),r=!!(t&2),i,a=!e.startsWith(`<!>`);return()=>{if(F)return Nr(L,null),L;i===void 0&&(i=Mr(a?e:`<!>`+e),n||(i=sn(i)));var t=r||tn?document.importNode(i,!0):i.cloneNode(!0);if(n){var o=sn(t),s=t.lastChild;Nr(o,s)}else Nr(t,t);return t}}function Fr(e,t,n=`svg`){var r=!e.startsWith(`<!>`),i=!!(t&1),a=`<${n}>${r?e:`<!>`+e}</${n}>`,o;return()=>{if(F)return Nr(L,null),L;if(!o){var e=sn(Mr(a));if(i)for(o=document.createDocumentFragment();sn(e);)o.appendChild(sn(e));else o=sn(e)}var t=o.cloneNode(!0);if(i){var n=sn(t),r=t.lastChild;Nr(n,r)}else Nr(t,t);return t}}function Ir(e,t){return Fr(e,t,`svg`)}function Lr(){if(F)return Nr(L,null),L;var e=document.createDocumentFragment(),t=document.createComment(``),n=on();return e.append(t,n),Nr(t,n),e}function Rr(e,t){if(F){var n=G;(!(n.f&32768)||n.nodes.end===null)&&(n.nodes.end=L),he();return}e!==null&&e.before(t)}function zr(){if(F&&L&&L.nodeType===8&&L.textContent?.startsWith(`$`)){let e=L.textContent.substring(1);return he(),e}return(window.__svelte??={}).uid??=1,`c${window.__svelte.uid++}`}function Br(e){return e.endsWith(`capture`)&&e!==`gotpointercapture`&&e!==`lostpointercapture`}var Vr=[`beforeinput`,`click`,`change`,`dblclick`,`contextmenu`,`focusin`,`focusout`,`input`,`keydown`,`keyup`,`mousedown`,`mousemove`,`mouseout`,`mouseover`,`mouseup`,`pointerdown`,`pointermove`,`pointerout`,`pointerover`,`pointerup`,`touchend`,`touchmove`,`touchstart`];function Hr(e){return Vr.includes(e)}var Ur=`allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback`.split(`.`),Wr={formnovalidate:`formNoValidate`,ismap:`isMap`,nomodule:`noModule`,playsinline:`playsInline`,readonly:`readOnly`,defaultvalue:`defaultValue`,defaultchecked:`defaultChecked`,srcobject:`srcObject`,novalidate:`noValidate`,allowfullscreen:`allowFullscreen`,disablepictureinpicture:`disablePictureInPicture`,disableremoteplayback:`disableRemotePlayback`};function Gr(e){return e=e.toLowerCase(),Wr[e]??e}[...Ur];var Kr=[`touchstart`,`touchmove`];function qr(e){return Kr.includes(e)}var Jr=[`textarea`,`script`,`style`,`title`];function Yr(e){return Jr.includes(e)}function Xr(e){let t=0,n=Ut(0),r;return()=>{bn()&&(K(n),kn(()=>(t===0&&(r=_r(()=>e(()=>Yt(n)))),t+=1,()=>{Ye(()=>{--t,t===0&&(r?.(),r=void 0,Yt(n))})})))}}var Zr=E|D;function Qr(e,t,n,r){new $r(e,t,n,r)}var $r=class{parent;is_pending=!1;transform_error;#e;#t=F?L:null;#n;#r;#i;#a=null;#o=null;#s=null;#c=null;#l=0;#u=0;#d=!1;#f=new Set;#p=new Set;#m=null;#h=Xr(()=>(this.#m=Ut(this.#l),()=>{this.#m=null}));constructor(e,t,n,r){this.#e=e,this.#n=t,this.#r=e=>{var t=G;t.b=this,t.f|=128,n(e)},this.parent=G.b,this.transform_error=r??this.parent?.transform_error??(e=>e),this.#i=jn(()=>{if(F){let e=ve(this.#t);he();let t=e===`[!`;if(e.startsWith(`[?`)){let t=JSON.parse(e.slice(2));this.#_(t)}else t?this.#b():this.#g()}else this.#x()},Zr),F&&(this.#e=L)}#g(){try{this.#a=Nn(()=>this.#r(this.#e))}catch(e){this.error(e)}}#_(e){let t=this.#n.failed,{reset:n,invoke_onerror:r}=this.#v(e);Ye(r),t&&(this.#s=Nn(()=>{t(this.#e,()=>e,()=>n)}))}#v(e){var t=!1,n=!1;let r=()=>{if(!this.#y()){if(t){P();return}t=!0,n&&Pe(),this.#s!==null&&Bn(this.#s,()=>{this.#s=null}),this.#C(()=>{this.#x()})}};return{reset:r,invoke_onerror:()=>{if(!this.#y())try{n=!0,this.#n.onerror?.(e,r),n=!1}catch(e){gn(e,this.#i&&this.#i.parent)}}}}#y(){return(this.#i.f&(w|ee))!==0}#b(){let e=this.#n.pending;e&&(this.is_pending=!0,this.#o=Nn(()=>e(this.#e)),Ye(()=>{if(!this.#y()){var e=this.#c=document.createDocumentFragment(),t=on(),n=!1;if(e.append(t),this.#a=this.#C(()=>{try{return Nn(()=>this.#r(t))}catch(e){try{this.error(e),n=!0}catch(e){gn(e,this.#i.parent)}return null}}),this.#a===null){this.#c=null,n&&this.#S(z);return}this.#u===0&&(this.#e.before(e),this.#c=null,Bn(this.#o,()=>{this.#o=null}),this.#S(z))}}))}#x(){try{if(this.is_pending=this.has_pending_snippet(),this.#u=0,this.#l=0,this.#a=Nn(()=>{this.#r(this.#e)}),this.#u>0){var e=this.#c=document.createDocumentFragment();Wn(this.#a,e);let t=this.#n.pending;this.#o=Nn(()=>t(this.#e))}else this.#S(z)}catch(e){this.error(e)}}#S(e){this.is_pending=!1,e.transfer_effects(this.#f,this.#p)}defer_effect(e){et(e,this.#f,this.#p)}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!this.#n.pending}#C(e){var t=G,n=W,r=ze;Xn(this.#i),Yn(this.#i),Be(this.#i.ctx);try{return At.ensure(),e()}finally{Xn(t),Yn(n),Be(r)}}#w(e,t){if(!this.has_pending_snippet()){this.parent&&this.parent.#w(e,t);return}this.#u+=e,this.#u===0&&(this.#S(t),this.#o&&Bn(this.#o,()=>{this.#o=null}),this.#c&&=(this.#e.before(this.#c),null))}update_pending_count(e,t){this.#w(e,t),this.#l+=e,!(!this.#m||this.#d)&&(this.#d=!0,Ye(()=>{this.#d=!1,this.#m&&qt(this.#m,this.#l)}))}get_effect_pending(){return this.#h(),K(this.#m)}error(t){if(t===e||!this.#n.onerror&&!this.#n.failed)throw t;z?.is_fork?(this.#a&&z.skip_effect(this.#a),this.#o&&z.skip_effect(this.#o),this.#s&&z.skip_effect(this.#s),z.oncommit(()=>{this.#y()||this.#T(t)})):this.#T(t)}#T(e){this.#a&&=(Ln(this.#a),null),this.#o&&=(Ln(this.#o),null),this.#s&&=(Ln(this.#s),null),F&&(me(this.#t),ge(),me(_e()));let t=this.#n.failed,n=e=>{if(this.#y())return;let{reset:n,invoke_onerror:r}=this.#v(e);r(),t&&!this.#y()&&(this.#s=this.#C(()=>{try{return Nn(()=>{var r=G;r.b=this,r.f|=128,t(this.#e,()=>e,()=>n)})}catch(e){return gn(e,this.#i.parent),null}}))};Ye(()=>{if(!this.#y()){var t;try{t=this.transform_error(e)}catch(e){gn(e,this.#i&&this.#i.parent);return}typeof t==`object`&&t&&typeof t.then==`function`?t.then(n,e=>gn(e,this.#i&&this.#i.parent)):n(t)}})}};function ei(e,t){var n=t==null?``:typeof t==`object`?`${t}`:t;n!==(e[j]??=e.nodeValue)&&(e[j]=n,e.nodeValue=`${n}`)}function ti(e,t){return ri(e,t)}var ni=new Map;function ri(t,{target:n,anchor:r,props:i={},events:a,context:o,intro:c=!0,transformError:l}){an();var u=void 0,d=En(()=>{var c=r??n.appendChild(on());Qr(c,{pending:()=>{}},n=>{Ue({});var r=ze;if(o&&(r.c=o),a&&(i.$$events=a),F&&Nr(n,null),u=t(n,i)||Ge(),F&&(G.nodes.end=L,L===null||L.nodeType!==8||L.data!==`]`))throw fe(),e;We()},l);var d=new Set,f=e=>{for(var t=0;t<e.length;t++){var r=e[t];if(!d.has(r)){d.add(r);var i=qr(r);for(let e of[n,document]){var a=ni.get(e);a===void 0&&(a=new Map,ni.set(e,a));var o=a.get(r);o===void 0?(e.addEventListener(r,kr,{passive:i}),a.set(r,1)):a.set(r,o+1)}}}};return f(s(xr)),Sr.add(f),()=>{for(var e of d)for(let r of[n,document]){var t=ni.get(r),i=t.get(e);--i==0?(r.removeEventListener(e,kr),t.delete(e),t.size===0&&ni.delete(r)):t.set(e,i)}Sr.delete(f),c!==r&&c.parentNode?.removeChild(c)}});return ii.set(u,d),u}var ii=new WeakMap,ai=class{anchor;#e=new Map;#t=new Map;#n=new Map;#r=new Set;#i=!0;constructor(e,t=!0){this.anchor=e,this.#i=t}#a=e=>{if(this.#e.has(e)){var t=this.#e.get(e),n=this.#t.get(t);if(n)Hn(n),this.#r.delete(t);else{var r=this.#n.get(t);r&&(Hn(r.effect),this.#t.set(t,r.effect),this.#n.delete(t),r.fragment.lastChild.remove(),this.anchor.before(r.fragment),n=r.effect)}for(let[t,n]of this.#e){if(this.#e.delete(t),t===e)break;let r=this.#n.get(n);r&&(Ln(r.effect),this.#n.delete(n))}for(let[e,r]of this.#t){if(e===t||this.#r.has(e))continue;let i=()=>{if(Array.from(this.#e.values()).includes(e)){var t=document.createDocumentFragment();Wn(r,t),t.append(on()),this.#n.set(e,{effect:r,fragment:t})}else Ln(r);this.#r.delete(e),this.#t.delete(e)};this.#i||!n?(this.#r.add(e),Bn(r,i,!1)):i()}}};#o=e=>{this.#e.delete(e);let t=Array.from(this.#e.values());for(let[e,n]of this.#n)t.includes(e)||(Ln(n.effect),this.#n.delete(e))};ensure(e,t){var n=z,r=fn();if(t&&!this.#t.has(e)&&!this.#n.has(e)){if(r){var i=document.createDocumentFragment(),a=on();i.append(a),this.#n.set(e,{effect:Nn(()=>t(a)),fragment:i})}else this.#t.set(e,Nn(()=>t(this.anchor)))}if(this.#e.set(n,e),r){for(let[t,r]of this.#t)t===e?n.unskip_effect(r):n.skip_effect(r);for(let[t,r]of this.#n)t===e?n.unskip_effect(r.effect):n.skip_effect(r.effect);n.oncommit(this.#a),n.ondiscard(this.#o)}else F&&(this.anchor=L),this.#a(n)}};function oi(e,t,...n){var r=new ai(e);jn(()=>{let e=t()??null;r.ensure(e,e&&(t=>e(t,...n)))},E)}function si(e){ze===null&&Se(`onMount`),Sn(()=>{let t=_r(e);if(typeof t==`function`)return t})}function ci(e,t,n=!1){var r;F&&(r=L,he());var i=new ai(e),a=n?E:0;function o(e,t){if(F){var n=ve(r);if(e!==parseInt(n.substring(1))){var a=_e();me(a),i.anchor=a,I(!1),i.ensure(e,t),I(!0);return}}i.ensure(e,t)}jn(()=>{var e=!1;t((t,n=0)=>{e=!0,o(n,t)}),e||o(-1,null)},a)}function li(e,t){return t}function ui(e,t,n){for(var r=[],i=t.length,a,o=t.length,c=0;c<i;c++){let n=t[c];Bn(n,()=>{if(a){if(a.pending.delete(n),a.done.add(n),a.pending.size===0){var t=e.outrogroups;di(e,s(a.done)),t.delete(a),t.size===0&&(e.outrogroups=null)}}else--o},!1)}if(o===0){var l=r.length===0&&n!==null&&e.pending.size===0;if(l){var u=n,d=u.parentNode;dn(d),d.append(u),e.items.clear()}di(e,t,!l)}else a={pending:new Set(t),done:new Set},(e.outrogroups??=new Set).add(a)}function di(e,t,n=!0){var r;if(e.pending.size>0){r=new Set;for(let t of e.pending.values())for(let n of t)r.add(e.items.get(n).e)}for(var i=0;i<t.length;i++){var a=t[i];r?.has(a)?(a.f|=ne,Wn(a,document.createDocumentFragment())):Ln(t[i],n)}}var fi;function pi(e,t,n,r,a,o=null){var c=e,l=new Map;if(t&4){var u=e;c=F?me(sn(u)):u.appendChild(on())}F&&he();var d=null,f=pt(()=>{var e=n();return i(e)?e:e==null?[]:s(e)}),p=new Map,m=!0;function h(e){if(!(_.effect.f&16384)){_.pending.delete(e);var n=K(f);_.fallback=d,hi(_,n,c,t,r),d!==null&&(n.length===0?d.f&33554432?(d.f^=ne,_i(d,null,c)):Hn(d):Bn(d,()=>{d=null}))}}function g(e){_.pending.delete(e)}var _={effect:jn(()=>{var e=K(f),i=e.length;let s=!1;F&&ve(c)===`[!`!=(i===0)&&(c=_e(),me(c),I(!1),s=!0);for(var u=new Set,_=z,v=fn(),y=0;y<i;y+=1){F&&L.nodeType===8&&L.data===`]`&&(c=L,s=!0,I(!1));var b=e[y],x=r(b,y),S=m?null:l.get(x);S?(S.v&&qt(S.v,b),S.i&&qt(S.i,y),v&&_.unskip_effect(S.e)):(S=gi(l,m?c:fi??=on(),b,x,y,a,t,n),m||(S.e.f|=ne),l.set(x,S)),u.add(x)}if(i===0&&o&&!d&&(m?d=Nn(()=>o(c)):(d=Nn(()=>o(fi??=on())),d.f|=ne)),i>u.size&&Te(``,``,``),F&&i>0&&me(_e()),!m){if(p.set(_,u),v){for(let[e,t]of l)u.has(e)||_.skip_effect(t.e);_.oncommit(h),_.ondiscard(g)}else h(_)}s&&I(!0),K(f)}),flags:t,items:l,pending:p,outrogroups:null,fallback:d};m=!1,F&&(c=L)}function mi(e){for(;e!==null&&!(e.f&32);)e=e.next;return e}function hi(e,t,n,r,i){var a=!!(r&8),o=t.length,c=e.items,l=mi(e.effect.first),u,d=null,f,p=[],m=[],h,g,_,v;if(a)for(v=0;v<o;v+=1)h=t[v],g=i(h,v),_=c.get(g).e,_.f&33554432||(_.nodes?.a?.measure(),(f??=new Set).add(_));for(v=0;v<o;v+=1){if(h=t[v],g=i(h,v),_=c.get(g).e,e.outrogroups!==null)for(let t of e.outrogroups)t.pending.delete(_),t.done.delete(_);if(_.f&8192&&(Hn(_),a&&(_.nodes?.a?.unfix(),(f??=new Set).delete(_))),_.f&33554432){if(_.f^=ne,_===l)_i(_,null,n);else{var y=d?d.next:l;_===e.effect.last&&(e.effect.last=_.prev),_.prev&&(_.prev.next=_.next),_.next&&(_.next.prev=_.prev),vi(e,d,_),vi(e,_,y),_i(_,y,n),d=_,p=[],m=[],l=mi(d.next);continue}}if(_!==l){if(u!==void 0&&u.has(_)){if(p.length<m.length){var b=m[0],x;d=b.prev;var S=p[0],C=p[p.length-1];for(x=0;x<p.length;x+=1)_i(p[x],b,n);for(x=0;x<m.length;x+=1)u.delete(m[x]);vi(e,S.prev,C.next),vi(e,d,S),vi(e,C,b),l=b,d=C,--v,p=[],m=[]}else u.delete(_),_i(_,l,n),vi(e,_.prev,_.next),vi(e,_,d===null?e.effect.first:d.next),vi(e,d,_),d=_;continue}for(p=[],m=[];l!==null&&l!==_;)(u??=new Set).add(l),m.push(l),l=mi(l.next);if(l===null)continue}_.f&33554432||p.push(_),d=_,l=mi(_.next)}if(e.outrogroups!==null){for(let t of e.outrogroups)t.pending.size===0&&(di(e,s(t.done)),e.outrogroups?.delete(t));e.outrogroups.size===0&&(e.outrogroups=null)}if(l!==null||u!==void 0){var w=[];if(u!==void 0)for(_ of u)_.f&8192||w.push(_);for(;l!==null;)!(l.f&8192)&&l!==e.fallback&&w.push(l),l=mi(l.next);var T=w.length;if(T>0){var ee=r&4&&o===0?n:null;if(a){for(v=0;v<T;v+=1)w[v].nodes?.a?.measure();for(v=0;v<T;v+=1)w[v].nodes?.a?.fix()}ui(e,w,ee)}}a&&Ye(()=>{if(f!==void 0)for(_ of f)_.nodes?.a?.apply()})}function gi(e,t,n,r,i,a,o,s){var c=o&1?o&16?Ut(n):Wt(n,!1,!1):null,l=o&2?Ut(i):null;return{v:c,i:l,e:Nn(()=>(a(t,c??n,l??i,s),()=>{e.delete(r)}))}}function _i(e,t,n){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,a=t&&!(t.f&33554432)?t.nodes.start:n;r!==null;){var o=cn(r);if(a.before(r),r===i)return;r=o}}function vi(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}function yi(e,t,n){var r;F&&(r=L,he());var i=new ai(e);jn(()=>{var e=t()??null;if(F&&ve(r)===`[`!=(e!==null)){var a=_e();me(a),i.anchor=a,I(!1),i.ensure(e,e&&(t=>n(t,e))),I(!0);return}i.ensure(e,e&&(t=>n(t,e)))},E)}function bi(e,t,n,i,a,o){let s=F;F&&he();var c=null;F&&L.nodeType===1&&(c=L,he());var l=F?L:e,u=new ai(l,!1);jn(()=>{let e=t()||null;var o=a?a():n||e===`svg`?r:void 0;if(e===null){u.ensure(null,null);return}return u.ensure(e,t=>{if(e){var n=F;if(c=F?c:pn(e,o),Nr(c,c),i){var r=null;F&&Yr(e)&&c.append(r=document.createComment(``));var a=F?sn(c):c.appendChild(on());F&&(a===null?I(!1):me(a)),i(c,a),r?.remove()}G.nodes.end=c,n||t.before(c)}F&&me(t)}),()=>{}},E),xn(()=>{}),s&&(I(!0),me(l))}function xi(e,t,n){Dn(()=>{var r=_r(()=>t(e,n?.())||{});if(n&&r?.update){var i=!1,a={};kn(()=>{var e=n();vr(e),i&&be(a,e)&&(a=e,r.update(e))}),i=!0}if(r?.destroy)return()=>r.destroy()})}function Si(e,t){var n=void 0,r;Mn(()=>{n!==(n=t())&&(r&&=(Ln(r),null),n&&(r=Nn(()=>{Dn(()=>n(e))})))})}function Ci(e){var t,n,r=``;if(typeof e==`string`||typeof e==`number`)r+=e;else if(typeof e==`object`){if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(n=Ci(e[t]))&&(r&&(r+=` `),r+=n)}else for(n in e)e[n]&&(r&&(r+=` `),r+=n)}return r}function wi(){for(var e,t,n=0,r=``,i=arguments.length;n<i;n++)(e=arguments[n])&&(t=Ci(e))&&(r&&(r+=` `),r+=t);return r}function Ti(e){return typeof e==`object`?wi(e):e??``}var Ei=[...` 	
\r\f\xA0\v﻿`];function Di(e,t,n){var r=e==null?``:``+e;if(t&&(r=r?r+` `+t:t),n){for(var i of Object.keys(n))if(n[i])r=r?r+` `+i:i;else if(r.length)for(var a=i.length,o=0;(o=r.indexOf(i,o))>=0;){var s=o+a;(o===0||Ei.includes(r[o-1]))&&(s===r.length||Ei.includes(r[s]))?r=(o===0?``:r.substring(0,o))+r.substring(s+1):o=s}}return r===``?null:r}function Oi(e,t=!1){var n=t?` !important;`:`;`,r=``;for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==``&&(r+=` `+i+`: `+a+n)}return r}function ki(e){return e[0]!==`-`||e[1]!==`-`?e.toLowerCase():e}function Ai(e,t){if(t){var n=``,r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\/\*.*?\*\//g,``).trim();var a=!1,o=0,s=!1,c=[];r&&c.push(...Object.keys(r).map(ki)),i&&c.push(...Object.keys(i).map(ki));var l=0,u=-1;let t=e.length;for(var d=0;d<t;d++){var f=e[d];if(s?f===`/`&&e[d-1]===`*`&&(s=!1):a?a===f&&(a=!1):f===`/`&&e[d+1]===`*`?s=!0:f===`"`||f===`'`?a=f:f===`(`?o++:f===`)`&&o--,!s&&a===!1&&o===0){if(f===`:`&&u===-1)u=d;else if(f===`;`||d===t-1){if(u!==-1){var p=ki(e.substring(l,u).trim());if(!c.includes(p)){f!==`;`&&d++;var m=e.substring(l,d).trim();n+=` `+m+`;`}}l=d+1,u=-1}}}}return r&&(n+=Oi(r)),i&&(n+=Oi(i,!0)),n=n.trim(),n===``?null:n}return e==null?null:String(e)}function ji(e,t,n,r,i,a){var o=e[ce];if(F||o!==n||o===void 0){var s=Di(n,r,a);(!F||s!==e.getAttribute(`class`))&&(s==null?e.removeAttribute(`class`):t?e.className=s:e.setAttribute(`class`,s)),e[ce]=n}else if(a&&i!==a)for(var c in a){var l=!!a[c];(i==null||l!==!!i[c])&&e.classList.toggle(c,l)}return a}function Mi(e,t={},n,r){for(var i in n){var a=n[i];t[i]!==a&&(n[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,r))}}function Ni(e,t,n,r){var i=e[le];if(F||i!==t){var a=Ai(t,r);(!F||a!==e.getAttribute(`style`))&&(a==null?e.removeAttribute(`style`):e.style.cssText=a),e[le]=t}else r&&(Array.isArray(r)?(Mi(e,n?.[0],r[0]),Mi(e,n?.[1],r[1],`important`)):Mi(e,n,r));return r}function Pi(e,t){t?e.hasAttribute(`selected`)||e.setAttribute(`selected`,``):e.removeAttribute(`selected`)}function Fi(e,t){var n=!(`__defaultValue`in e);(n||e.__defaultValue!==t)&&(e.__defaultValue=t,Ii(e,!n||`__value`in e))}function Ii(e,t){var n=e.__defaultValue,r=e.multiple,a=r?n??[]:null;if(!r||i(a)){var o=e.selectedIndex,s=t&&r?new Set(e.selectedOptions):null;for(var c of e.options){var l=zi(c);Pi(c,r?a.includes(l):$t(l,n))}if(t){if(s!==null)for(c of e.options){var u=s.has(c);c.selected!==u&&(c.selected=u)}else e.selectedIndex!==o&&(e.selectedIndex=o)}}}function Li(e,t,n=!1){if(e.multiple){if(t==null)return;if(!i(t))return pe();for(var r of e.options)r.selected=t.includes(zi(r));return}for(r of e.options)if($t(zi(r),t)){r.selected=!0;return}(!n||t!==void 0)&&(e.selectedIndex=-1)}function Ri(e){var t=new MutationObserver(t=>{t.every(Bi)||(`__defaultValue`in e&&Ii(e,!1),`__value`in e&&Li(e,e.__value))});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`value`]}),xn(()=>{t.disconnect()})}function zi(e){return`__value`in e?e.__value:e.value}function Bi(e){if(e.target.closest(`selectedcontent`)!==null)return!0;if(e.type===`childList`){var t=[...e.addedNodes,...e.removedNodes];return t.length>0&&t.every(e=>e.nodeName===`SELECTEDCONTENT`)}return!1}var Vi=Symbol(`class`),Hi=Symbol(`style`),Ui=Symbol(`is custom element`),Wi=Symbol(`is html`),Gi=de?`link`:`LINK`,Ki=de?`input`:`INPUT`,qi=de?`option`:`OPTION`,Ji=de?`select`:`SELECT`,Yi=de?`progress`:`PROGRESS`;function Xi(e){if(F){var t=!1,n=()=>{if(!t){if(t=!0,e.hasAttribute(`value`)){var n=e.value;q(e,`value`,null),e.value=n}if(e.hasAttribute(`checked`)){var r=e.checked;q(e,`checked`,null),e.checked=r}}};e[M]=n,Ye(n),rt()}}function q(e,t,n,r){var i=$i(e);F&&(i[t]=e.getAttribute(t),t===`src`||t===`srcset`||t===`href`&&e.nodeName===Gi)||i[t]!==(i[t]=n)&&(t===`loading`&&(e[oe]=n),n==null?e.removeAttribute(t):typeof n!=`string`&&ta(e).has(t)?e[t]=n:e.setAttribute(t,n))}function Zi(e,n,r,i,a=!1,o=!1){F&&a&&e.nodeName===Ki&&(`defaultValue`in r||`defaultChecked`in r||Xi(e));var s=$i(e),c=s[Ui],l=!s[Wi];let u=F&&c;u&&I(!1);var d=n||{},f=e.nodeName===qi,p=e.nodeName===Ji;try{for(var m in n)!(m in r)&&m[0]+m[1]!==`$$`&&(r[m]=null);r.class?r.class=Ti(r.class):(i||r[Vi])&&(r.class=null),r[Hi]&&(r.style??=null);var h=ta(e);if(e.nodeName===Ki&&`type`in r&&(`value`in r||`__value`in r)){var g=r.type;(g!==d.type||g===void 0&&e.hasAttribute(`type`))&&(d.type=g,q(e,`type`,g,o))}for(let a in r){let u=r[a];if(f&&a===`value`&&u==null){e.value=e.__value=``,d[a]=u;continue}if(a===`class`){ji(e,e.namespaceURI===`http://www.w3.org/1999/xhtml`,u,i,n?.[Vi],r[Vi]),d[a]=u,d[Vi]=r[Vi];continue}if(a===`style`){Ni(e,u,n?.[Hi],r[Hi]),d[a]=u,d[Hi]=r[Hi];continue}var _=d[a];if(u!==_||u===void 0&&e.hasAttribute(a)){d[a]=u;var v=a[0]+a[1];if(v!==`$$`){if(v===`on`){let t={},n=`$$`+a,r=a.slice(2);var y=Hr(r);if(Br(r)&&(r=r.slice(0,-7),t.capture=!0),!y&&_){if(u!=null)continue;e.removeEventListener(r,d[n],t),d[n]=null}if(y)Tr(r,e,u),Er([r]);else if(u!=null){function i(e){d[a].call(this,e)}d[n]=Cr(r,e,i,t)}}else if(a===`style`)q(e,a,u);else if(a===`autofocus`)tt(e,!!u);else if(!c&&(a===`__value`||a===`value`&&u!=null))e.__value=u,(_==null||e.value!==u||u===0&&e.nodeName===Yi)&&(e.value=u);else if(a===`selected`&&f)Pi(e,u);else{var b=a;l||(b=Gr(b));var x=b===`defaultValue`||b===`defaultChecked`;if(p&&b===`defaultValue`)continue;if(u==null&&!c&&!x){if(s[a]=null,b===`value`||b===`checked`){let t=e,r=n===void 0;if(b===`value`){let e=t.defaultValue;t.removeAttribute(b),t.defaultValue=e,t.value=t.__value=r?e:null}else{let e=t.defaultChecked;t.removeAttribute(b),t.defaultChecked=e,t.checked=r?e:!1}}else e.removeAttribute(a)}else x||(c||typeof u!=`string`)&&h.has(b)?(e[b]=u,b in s&&(s[b]=t)):typeof u!=`function`&&q(e,b,u,o)}}}}}finally{u&&I(!0)}return d}function Qi(e,t,n=[],r=[],i=[],a,o=!1,s=!1){at(i,n,r,n=>{var r=void 0,i={},c=e.nodeName===Ji,l=!1;if(Mn(()=>{var u=t(...n.map(K)),d=Zi(e,r,u,a,o,s);if(l&&c){var f=e;`defaultValue`in u&&Fi(f,u.defaultValue),`value`in u&&Li(f,u.value)}for(let e of Object.getOwnPropertySymbols(i))u[e]||Ln(i[e]);for(let t of Object.getOwnPropertySymbols(u)){var p=u[t];t.description===`@attach`&&(!r||p!==r[t])&&(i[t]&&Ln(i[t]),i[t]=Nn(()=>Si(e,()=>p))),d[t]=p}r=d}),c){var u=e;Dn(()=>{var e=r;`defaultValue`in e&&Fi(u,e.defaultValue),Li(u,e.value,!0),Ri(u)})}l=!0})}function $i(e){return e[se]??={[Ui]:e.nodeName.includes(`-`),[Wi]:e.namespaceURI===n}}var ea=new Map;function ta(e){var t=e.getAttribute(`is`)||e.nodeName,n=ea.get(t);if(n)return n;ea.set(t,n=new Set);for(var r,i=e,a=Element.prototype;a!==i;){for(var o in r=u(i),r)r[o].set&&o!==`innerHTML`&&o!==`textContent`&&o!==`innerText`&&n.add(o);i=p(i)}return n}function na(e,t){return e===t||e?.[k]===t}function ra(e=Ge(),t,n,r){var i=ze.r,a=G;return Dn(()=>{var o,s;return kn(()=>{o=s,s=r?.()||[],_r(()=>{na(n(...s),e)||(t(e,...s),o&&na(n(...o),e)&&t(null,...o))})}),()=>{let r=a;for(;r!==i&&r.parent!==null&&r.parent.f&33554432;)r=r.parent;let o=()=>{s&&na(n(...s),e)&&t(null,...s)},c=r.teardown;r.teardown=()=>{o(),c?.()}}}),e}var ia=!1;function aa(e){var t=ia;try{return ia=!1,[e(),ia]}finally{ia=t}}var oa={get(e,t){if(!e.exclude.has(t))return e.props[t]},set(e,t){return!1},getOwnPropertyDescriptor(e,t){if(!e.exclude.has(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},has(e,t){return!e.exclude.has(t)&&t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.has(t))}};function sa(e,t,n){return new Proxy({props:e,exclude:t},oa)}function ca(e,t,n,r){var i=!0,a=!!(n&8),o=!!(n&16),s=r,c=!0,u=void 0,d=()=>o&&i?(u??=lt(r),K(u)):(c&&(c=!1,s=o?_r(r):r),s);let f;if(a){var p=k in e||A in e;f=l(e,t)?.set??(p&&t in e?n=>e[t]=n:void 0)}var m,h=!1;a?[m,h]=aa(()=>e[t]):m=e[t],m===void 0&&r!==void 0&&(m=d(),f&&(i&&Ae(t),f(m)));var g=i?()=>{var n=e[t];return n===void 0?d():(c=!0,n)}:()=>{var n=e[t];return n!==void 0&&(s=void 0),n===void 0?s:n};if(i&&!(n&4))return g;if(f){var _=e.$$legacy;return(function(e,t){return arguments.length>0?((!i||!t||_||h)&&f(t?g():e),e):g()})}var v=!1,y=(n&1?lt:pt)(()=>(v=!1,g()));a&&K(y);var b=G;return(function(e,t){if(arguments.length>0){let n=t?K(y):i&&a?Zt(e):e;return V(y,n),v=!0,s!==void 0&&(s=n),e}return Kn&&v||b.f&16384?y.v:K(y)})}var la=class extends Map{#e=new Map;#t=B(0);#n=B(0);#r=ar||-1;constructor(e){if(super(),e){for(var[t,n]of e)super.set(t,n);this.#n.v=super.size}}#i(e){return ar===this.#r?B(e):Ut(e)}has(e){var t=this.#e,n=t.get(e);if(n===void 0){if(super.has(e))n=this.#i(0),t.set(e,n);else return K(this.#t),!1}return K(n),!0}forEach(e,t){this.#a(),super.forEach(e,t)}get(e){var t=this.#e,n=t.get(e);if(n===void 0){if(super.has(e))n=this.#i(0),t.set(e,n);else{K(this.#t);return}}return K(n),super.get(e)}getOrInsert(e,t){return super.has(e)||this.set(e,t),this.get(e)}getOrInsertComputed(e,t){return super.has(e)||this.set(e,t(e)),this.get(e)}set(e,t){var n=this.#e,r=n.get(e),i=super.get(e),a=super.set(e,t),o=this.#t;if(r===void 0)r=this.#i(0),n.set(e,r),V(this.#n,super.size),Yt(o);else if(i!==t){Yt(r);var s=o.reactions===null?null:new Set(o.reactions);(s===null||!r.reactions?.every(e=>s.has(e)))&&Yt(o)}return a}delete(e){var t=this.#e,n=t.get(e),r=super.delete(e);return n!==void 0&&(t.delete(e),V(n,-1)),r&&(V(this.#n,super.size),Yt(this.#t)),r}clear(){if(super.size!==0){super.clear();var e=this.#e;V(this.#n,0);for(var t of e.values())V(t,-1);Yt(this.#t),e.clear()}}#a(){K(this.#t);var e=this.#e;if(this.#n.v!==e.size){for(var t of super.keys())if(!e.has(t)){var n=this.#i(0);e.set(t,n)}}for([,n]of this.#e)K(n)}keys(){return K(this.#t),super.keys()}values(){return this.#a(),super.values()}entries(){return this.#a(),super.entries()}[Symbol.iterator](){return this.entries()}get size(){return K(this.#n),super.size}},ua=class{#e;#t;constructor(e,t){this.#e=e,this.#t=Xr(t)}get current(){return this.#t(),this.#e()}},da=/\(.+\)/,fa=new Set([`all`,`print`,`screen`,`and`,`or`,`not`,`only`]),pa=new class extends ua{constructor(e,t){let n=da.test(e)||e.split(/[\s,]+/).some(e=>fa.has(e.trim()))?e:`(${e})`,r=window.matchMedia(n);super(()=>r.matches,e=>wr(r,`change`,e))}}(`(prefers-reduced-motion: no-preference)`);function ma(e,t,n,r){let i=3*e,a=3*(n-e)-i,o=1-i-a,s=3*t,c=3*(r-t)-s,l=1-s-c,u=e=>((o*e+a)*e+i)*e,d=e=>((l*e+c)*e+s)*e,f=e=>(3*o*e+2*a)*e+i,p=e=>{let t=e;for(let n=0;n<8;n+=1){let n=u(t)-e;if(Math.abs(n)<1e-6)return t;let r=f(t);if(Math.abs(r)<1e-6)break;t-=n/r}let n=0,r=1;for(t=e;r-n>1e-6;)u(t)<e?n=t:r=t,t=(n+r)/2;return t};return e=>e<=0?0:e>=1?1:d(p(e))}var ha=ma(.23,1,.32,1),ga=ma(.77,0,.175,1);ma(.32,.72,0,1),ma(.42,0,.58,1);function _a(e){if(typeof window>`u`)return null;try{return(e===`local`?window.localStorage:window.sessionStorage)??null}catch{return null}}function va(e,t){try{return _a(e)?.getItem(t)??null}catch{return null}}function ya(e,t,n){try{_a(e)?.setItem(t,n)}catch{}}function ba(){return va(`local`,`cawco-theme`)||`system`}function xa(e){return e===`system`?window.matchMedia(`(prefers-color-scheme: dark)`).matches?`dark`:`light`:e}function Sa(e){let t=xa(e);return document.documentElement.classList.toggle(`dark`,t===`dark`),t}var Ca=new class{#e=B(Zt(ba()));get current(){return K(this.#e)}set current(e){V(this.#e,e,!0)}#t=B(`light`);get resolved(){return K(this.#t)}set resolved(e){V(this.#t,e,!0)}constructor(){this.resolved=Sa(this.current),window.matchMedia(`(prefers-color-scheme: dark)`).addEventListener(`change`,()=>{this.current===`system`&&(this.resolved=Sa(`system`))})}#n=0;set(e){let t=()=>jt(()=>{this.current=e,ya(`local`,`cawco-theme`,e),this.resolved=Sa(e)}),n=document.documentElement;this.#n+=1;let r=this.#n,i=()=>{r===this.#n&&delete n.dataset.themeFlip};if(n.dataset.themeFlip=``,!pa.current){t(),requestAnimationFrame(()=>requestAnimationFrame(i));return}document.startViewTransition(t).finished.finally(i)}toggle(){this.set(this.resolved===`light`?`dark`:`light`)}};typeof window<`u`&&((window.__svelte??={}).v??=new Set).add(`5`),Ie();var wa=class{#e=B(Zt([]));get order(){return K(this.#e)}set order(e){V(this.#e,e,!0)}#t=B(void 0);get uncontrolled(){return K(this.#t)}set uncontrolled(e){V(this.#t,e,!0)}#n=B(void 0);get controlled(){return K(this.#n)}set controlled(e){V(this.#n,e,!0)}#r=B(void 0);get selectedIndex(){return K(this.#r)}set selectedIndex(e){V(this.#r,e,!0)}#i=B(`default`);get size(){return K(this.#i)}set size(e){V(this.#i,e,!0)}#a=B(`segmented`);get variant(){return K(this.#a)}set variant(e){V(this.#a,e,!0)}#o=B(void 0);get strip(){return K(this.#o)}set strip(e){V(this.#o,e,!0)}#s=B({});get boxes(){return K(this.#s)}set boxes(e){V(this.#s,e)}#c=B(null);get travel(){return K(this.#c)}set travel(e){V(this.#c,e,!0)}onValueChange;onSelect;constructor(e){this.uncontrolled=e}get value(){return this.controlled===void 0?this.selectedIndex===void 0?this.uncontrolled??this.order[0]:this.order[this.selectedIndex]:this.controlled}select(e){if(this.controlled===void 0&&this.selectedIndex===void 0&&(this.uncontrolled=e),this.onValueChange?.(e),this.onSelect){let t=this.order.indexOf(e);t!==-1&&this.onSelect(t)}}setOrder(e){e.length===this.order.length&&e.every((e,t)=>e===this.order[t])||(this.order=e)}};function Ta(e,t,n){let r=Math.max(t,0),i=e=>e===t?0:1,a=e=>Math.abs(e-r),o=1;for(let t=0;t<e;t+=1){let e=i(t)>i(n)||i(t)===i(n)&&(a(t)>a(n)||a(t)===a(n)&&t<n);t!==n&&e&&(o+=1)}return o}var Ea=class{rects;#e=B(null);get optimisticIndex(){return K(this.#e)}set optimisticIndex(e){V(this.#e,e,!0)}#t=B(null);get focusedIndex(){return K(this.#t)}set focusedIndex(e){V(this.#t,e,!0)}folds=new la;poses=new la;constructor(e){this.rects=e}},Da=Symbol(`fluid-tabs`),Oa=Symbol(`fluid-tabs-list`);function ka(e){He(Da,e)}function Aa(){return Ve(Da)}function ja(e){He(Oa,e)}function Ma(){return Ve(Oa)}var Na=new Map,Pa=(e,t)=>{let[n]=t===`border-box`?e.borderBoxSize:e.contentBoxSize;return`${n?.inlineSize??0}x${n?.blockSize??0}`},Fa=null,Ia=globalThis.ResizeObserver,La=e=>{let t=new Set;for(let n of e)for(let[e,r]of Na.get(n.target)??[]){let i=Pa(n,r.box);i!==r.heard&&(r.heard=i,e.delivered.push(n),t.add(e))}return t},Ra=e=>{let t=[];for(let n of e.delivered)e.options.first&&!e.reported.has(n.target)?t.push(n):e.take(n),e.reported.add(n.target);return t},za=(e,t)=>{let n=e.delivered,r=Ra(e);for(let i of[r.length>0?e.options.first?.(r):void 0,e.options.inside?.(n)])i&&t.push(i)},Ba=e=>{let t=[...La(e)],n=t.filter(e=>!e.foreign);for(let e of n)e.options.read?.(e.delivered);let r=[];for(let e of n)za(e,r),e.delivered=[];for(let e of t)if(e.foreign){let t=e.delivered;e.delivered=[],e.foreign(t)}for(let e of r)e()},Va=()=>(Fa??=new Ia(Ba),Fa),Ha=e=>{let t=[...Na.get(e)?.values()??[]].map(e=>e.box),n=Va();n.unobserve(e),n.observe(e,{box:t.includes(`border-box`)?`border-box`:`content-box`})},Ua=e=>{let t=new Set,n=n=>{let r=Na.get(n);r?.delete(e),r?.size===0&&(Na.delete(n),Fa?.unobserve(n)),t.delete(n)};return{observe:(n,r)=>{let i=Na.get(n);i||(i=new Map,Na.set(n,i)),i.set(e,{box:r?.box??`content-box`,heard:null}),t.add(n),Ha(n)},release:n,releaseAll:()=>{for(let e of[...t])n(e)}}};Ia&&typeof window<`u`&&(window.ResizeObserver=class{#e;constructor(e){let t={delivered:[],foreign:t=>e(t,this),options:{},reported:new WeakSet,take:()=>void 0};this.#e=Ua(t)}observe(e,t){this.#e.observe(e,t)}unobserve(e){this.#e.release(e)}disconnect(){this.#e.releaseAll()}});function Wa(e,t={}){let n=0,r=new Set,i=()=>{n===0&&(n=requestAnimationFrame(()=>{n=0;let t=[...r];r.clear(),e(t)}))},a=Ua({delivered:[],options:t,reported:new WeakSet,take:e=>{r.add(e.target),i()}});return{observe:a.observe,request:i,unobserve:e=>{a.release(e),r.delete(e)},disconnect:()=>{cancelAnimationFrame(n),n=0,a.releaseAll(),r.clear()}}}var Ga=.5523,Ka=e=>({spread:[+!e[0],+!e[1]],tuck:[0,0]}),qa=e=>Math.round(e*100)/100;function Ja(e,t,n={}){let{width:r,flare:i}=e,a=n.inset??0,o=n.at?.x??0,s=n.at?.y??0,c=e.height,l=e.radius-a,u=(e,t)=>`${qa(e+o)} ${qa(t+s)}`,[d,f]=t.spread,p=i+a+t.tuck[0],m=i+r-a-t.tuck[1],h=c-i,g=(i+a)*d,_=(i+a)*f,v=p-g,y=m+_,b=c+a*Math.max(d,0),x=c+a*Math.max(f,0),S=l+a;return[`M ${u(v,b)}`,`C ${u(v+Ga*g,b)} ${u(p,h+Ga*g)} ${u(p,h)}`,`L ${u(p+e.slopeStart,S)}`,`A ${qa(l)} ${qa(l)} 0 0 1 ${u(p+e.slopeStart+l,a)}`,`L ${u(m-e.slopeEnd-l,a)}`,`A ${qa(l)} ${qa(l)} 0 0 1 ${u(m-e.slopeEnd,S)}`,`L ${u(m,h)}`,`C ${u(m,h+Ga*_)} ${u(y-Ga*_,x)} ${u(y,x)}`].join(` `)}function Ya(e,t,n,r){let{flare:i,height:a,radius:o}=e,s=i+t/2,c=s*Math.PI/2,l=e=>e<=i?s*Math.acos(Math.max(-1,1-e/i)):c+(e-i),u=Math.max(0,a-o),d=e=>e>=u||n<=0?1:1-(1-Math.min(1,l(e)/n))**r,f=new Set([0,u,a]);for(let e=.25;e<u;e+=e<i?.75:2)f.add(qa(e));return[...f].filter(e=>e>=0&&e<=a).sort((e,t)=>e-t).map(e=>({offset:a>0?qa(e/a*1e4)/1e4:0,ink:qa(d(e)*1e3)/1e3}))}var Xa=.5,Za=(e,t)=>{let n=Array(e.length+t.length);for(let t=0;t<e.length;t++)n[t]=e[t];for(let r=0;r<t.length;r++)n[e.length+r]=t[r];return n},Qa=(e,t)=>({classGroupId:e,validator:t}),$a=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),eo=`-`,to=[],no=`arbitrary..`,ro=e=>{let t=oo(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e.startsWith(`[`)&&e.endsWith(`]`))return ao(e);let n=e.split(eo);return io(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?Za(i,t):t:i||to}return n[e]||to}}},io=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=io(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(eo):e.slice(t).join(eo),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},ao=e=>e.slice(1,-1).indexOf(`:`)===-1?void 0:(()=>{let t=e.slice(1,-1),n=t.indexOf(`:`),r=t.slice(0,n);return r?no+r:void 0})(),oo=e=>{let{theme:t,classGroups:n}=e;return so(n,t)},so=(e,t)=>{let n=$a();for(let r in e){let i=e[r];co(i,n,r,t)}return n},co=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];lo(i,t,n,r)}},lo=(e,t,n,r)=>{if(typeof e==`string`){uo(e,t,n);return}if(typeof e==`function`){fo(e,t,n,r);return}po(e,t,n,r)},uo=(e,t,n)=>{let r=e===``?t:mo(t,e);r.classGroupId=n},fo=(e,t,n,r)=>{if(ho(e)){co(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Qa(n,e))},po=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];co(o,mo(t,a),n,r)}},mo=(e,t)=>{let n=e,r=t.split(eo),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=$a(),n.nextPart.set(t,i)),n=i}return n},ho=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,go=e=>{if(e<1)return{get:()=>void 0,set:()=>{}};let t=0,n=Object.create(null),r=Object.create(null),i=(i,a)=>{n[i]=a,t++,t>e&&(t=0,r=n,n=Object.create(null))};return{get(e){let t=n[e];if(t!==void 0)return t;if((t=r[e])!==void 0)return i(e,t),t},set(e,t){e in n?n[e]=t:i(e,t)}}},_o=`!`,vo=`:`,yo=[],bo=(e,t,n,r,i)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:i}),xo=e=>{let{prefix:t,experimentalParseClassName:n}=e,r=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e[s];if(n===0&&r===0){if(o===vo){t.push(e.slice(i,s)),i=s+1;continue}if(o===`/`){a=s;continue}}o===`[`?n++:o===`]`?n--:o===`(`?r++:o===`)`&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1;s.endsWith(_o)?(c=s.slice(0,-1),l=!0):s.startsWith(_o)&&(c=s.slice(1),l=!0);let u=a&&a>i?a-i:void 0;return bo(t,l,c,u)};if(t){let e=t+vo,n=r;r=t=>t.startsWith(e)?n(t.slice(e.length)):bo(yo,!1,t,void 0,!0)}if(n){let e=r;r=t=>n({className:t,parseClassName:e})}return r},So=e=>{let t=new Map;return e.orderSensitiveModifiers.forEach((e,n)=>{t.set(e,1e6+n)}),e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);o||s?(r.length>0&&(r.sort(),n.push(...r),r=[]),n.push(a)):r.push(a)}return r.length>0&&(r.sort(),n.push(...r)),n}},Co=e=>({cache:go(e.cacheSize),parseClassName:xo(e),sortModifiers:So(e),postfixLookupClassGroupIds:wo(e),...ro(e)}),wo=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},To=/\s+/,Eo=(e,t)=>{let{parseClassName:n,getClassGroupId:r,getConflictingClassGroupIds:i,sortModifiers:a,postfixLookupClassGroupIds:o}=t,s=[],c=e.trim().split(To),l=``;for(let e=c.length-1;e>=0;--e){let t=c[e],{isExternal:u,modifiers:d,hasImportantModifier:f,baseClassName:p,maybePostfixModifierPosition:m}=n(t);if(u){l=t+(l.length>0?` `+l:l);continue}let h=!!m,g;if(h){g=r(p.substring(0,m));let e=g&&o[g]?r(p):void 0;e&&e!==g&&(g=e,h=!1)}else g=r(p);if(!g){if(!h){l=t+(l.length>0?` `+l:l);continue}if(g=r(p),!g){l=t+(l.length>0?` `+l:l);continue}h=!1}let _=d.length===0?``:d.length===1?d[0]:a(d).join(`:`),v=f?_+_o:_,y=v+g;if(s.indexOf(y)>-1)continue;s.push(y);let b=i(g,h);for(let e=0;e<b.length;++e){let t=b[e];s.push(v+t)}l=t+(l.length>0?` `+l:l)}return l},Do=(...e)=>{let t=0,n,r,i=``;for(;t<e.length;)(n=e[t++])&&(r=Oo(n))&&(i&&(i+=` `),i+=r);return i},Oo=e=>{if(typeof e==`string`)return e;let t,n=``;for(let r=0;r<e.length;r++)e[r]&&(t=Oo(e[r]))&&(n&&(n+=` `),n+=t);return n},ko=(e,...t)=>{let n,r,i,a,o=o=>(n=Co(t.reduce((e,t)=>t(e),e())),r=n.cache.get,i=n.cache.set,a=s,s(o)),s=e=>{let t=r(e);if(t)return t;let a=Eo(e,n);return i(e,a),a};return a=o,(...e)=>a(Do(...e))},Ao=[],jo=e=>{let t=t=>t[e]||Ao;return t.isThemeGetter=!0,t.themeKey=e,t},Mo=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,No=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Po=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,Fo=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Io=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Lo=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/,Ro=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,zo=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,Bo=e=>Po.test(e),J=e=>!!e&&!Number.isNaN(Number(e)),Vo=e=>!!e&&Number.isInteger(Number(e)),Ho=e=>e.endsWith(`%`)&&J(e.slice(0,-1)),Uo=e=>Fo.test(e),Wo=()=>!0,Go=e=>Io.test(e)&&!Lo.test(e),Ko=()=>!1,qo=e=>Ro.test(e),Jo=e=>zo.test(e),Yo=e=>!Y(e)&&!X(e),Xo=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),Zo=e=>fs(e,gs,Ko),Y=e=>Mo.test(e),Qo=e=>fs(e,_s,Go),$o=e=>fs(e,vs,J),es=e=>fs(e,bs,Wo),ts=e=>fs(e,ys,Ko),ns=e=>fs(e,ms,Ko),rs=e=>fs(e,hs,Jo),is=e=>fs(e,xs,qo),X=e=>No.test(e),as=e=>ps(e,_s),os=e=>ps(e,ys),ss=e=>ps(e,ms),cs=e=>ps(e,gs),ls=e=>ps(e,hs),us=e=>ps(e,xs,!0),ds=e=>ps(e,bs,!0),fs=(e,t,n)=>{let r=Mo.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},ps=(e,t,n=!1)=>{let r=No.exec(e);return r?r[1]?t(r[1]):n:!1},ms=e=>e===`position`||e===`percentage`,hs=e=>e===`image`||e===`url`,gs=e=>e===`length`||e===`size`||e===`bg-size`,_s=e=>e===`length`,vs=e=>e===`number`,ys=e=>e===`family-name`,bs=e=>e===`number`||e===`weight`,xs=e=>e===`shadow`,Ss=Object.defineProperty({__proto__:null,isAny:Wo,isAnyNonArbitrary:Yo,isArbitraryFamilyName:ts,isArbitraryImage:rs,isArbitraryLength:Qo,isArbitraryNumber:$o,isArbitraryPosition:ns,isArbitraryShadow:is,isArbitrarySize:Zo,isArbitraryValue:Y,isArbitraryVariable:X,isArbitraryVariableFamilyName:os,isArbitraryVariableImage:ls,isArbitraryVariableLength:as,isArbitraryVariablePosition:ss,isArbitraryVariableShadow:us,isArbitraryVariableSize:cs,isArbitraryVariableWeight:ds,isArbitraryWeight:es,isFraction:Bo,isInteger:Vo,isNamedContainerQuery:Xo,isNumber:J,isPercent:Ho,isTshirtSize:Uo},Symbol.toStringTag,{value:`Module`}),Cs=()=>{let e=jo(`color`),t=jo(`font`),n=jo(`text`),r=jo(`font-weight`),i=jo(`tracking`),a=jo(`leading`),o=jo(`breakpoint`),s=jo(`container`),c=jo(`spacing`),l=jo(`radius`),u=jo(`shadow`),d=jo(`inset-shadow`),f=jo(`text-shadow`),p=jo(`drop-shadow`),m=jo(`blur`),h=jo(`perspective`),g=jo(`aspect`),_=jo(`ease`),v=jo(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),X,Y],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],C=()=>[`auto`,`contain`,`none`],w=()=>[X,Y,c],T=()=>[Bo,`full`,`auto`,...w()],ee=()=>[Vo,`none`,`subgrid`,X,Y],E=()=>[`auto`,{span:[`full`,Vo,X,Y]},Vo,X,Y],D=()=>[Vo,`auto`,X,Y],te=()=>[`auto`,`min`,`max`,`fr`,X,Y],ne=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],re=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],O=()=>[`auto`,...w()],ie=()=>[Bo,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...w()],k=()=>[s,Bo,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...w()],ae=()=>[Bo,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...w()],A=()=>[e,X,Y],oe=()=>[...b(),ss,ns,{position:[X,Y]}],se=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ce=()=>[`auto`,`cover`,`contain`,cs,Zo,{size:[X,Y]}],le=()=>[Ho,as,Qo],j=()=>[``,`none`,`full`,l,X,Y],M=()=>[``,J,as,Qo],ue=()=>[`solid`,`dashed`,`dotted`,`double`],de=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],N=()=>[J,Ho,ss,ns],fe=()=>[``,`none`,m,X,Y],pe=()=>[`none`,J,X,Y],P=()=>[`none`,J,X,Y],F=()=>[J,X,Y],I=()=>[Bo,`full`,...w()];return{cacheSize:500,theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[Uo],breakpoint:[Uo],color:[Wo],container:[Uo],"drop-shadow":[Uo],ease:[`in`,`out`,`in-out`],font:[Yo],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[Uo],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[Uo],shadow:[Uo],spacing:[`px`,J],text:[Uo],"text-shadow":[Uo],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,Bo,Y,X,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,X,Y]}],"container-named":[Xo],columns:[{columns:[J,`auto`,Y,X,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:C()}],"overscroll-x":[{"overscroll-x":C()}],"overscroll-y":[{"overscroll-y":C()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:T()}],"inset-x":[{"inset-x":T()}],"inset-y":[{"inset-y":T()}],start:[{"inset-s":T(),start:T()}],end:[{"inset-e":T(),end:T()}],"inset-bs":[{"inset-bs":T()}],"inset-be":[{"inset-be":T()}],top:[{top:T()}],right:[{right:T()}],bottom:[{bottom:T()}],left:[{left:T()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Vo,`auto`,X,Y]}],basis:[{basis:[Bo,`full`,`auto`,s,...w()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[J,Bo,`auto`,`initial`,`none`,Y]}],grow:[{grow:[``,J,X,Y]}],shrink:[{shrink:[``,J,X,Y]}],order:[{order:[Vo,`first`,`last`,`none`,X,Y]}],"grid-cols":[{"grid-cols":ee()}],"col-start-end":[{col:E()}],"col-start":[{"col-start":D()}],"col-end":[{"col-end":D()}],"grid-rows":[{"grid-rows":ee()}],"row-start-end":[{row:E()}],"row-start":[{"row-start":D()}],"row-end":[{"row-end":D()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":te()}],"auto-rows":[{"auto-rows":te()}],gap:[{gap:w()}],"gap-x":[{"gap-x":w()}],"gap-y":[{"gap-y":w()}],"justify-content":[{justify:[...ne(),`normal`]}],"justify-items":[{"justify-items":[...re(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...re()]}],"align-content":[{content:[`normal`,...ne()]}],"align-items":[{items:[...re(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...re(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ne()}],"place-items":[{"place-items":[...re(),`baseline`]}],"place-self":[{"place-self":[`auto`,...re()]}],p:[{p:w()}],px:[{px:w()}],py:[{py:w()}],ps:[{ps:w()}],pe:[{pe:w()}],pbs:[{pbs:w()}],pbe:[{pbe:w()}],pt:[{pt:w()}],pr:[{pr:w()}],pb:[{pb:w()}],pl:[{pl:w()}],m:[{m:O()}],mx:[{mx:O()}],my:[{my:O()}],ms:[{ms:O()}],me:[{me:O()}],mbs:[{mbs:O()}],mbe:[{mbe:O()}],mt:[{mt:O()}],mr:[{mr:O()}],mb:[{mb:O()}],ml:[{ml:O()}],"space-x":[{"space-x":w()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":w()}],"space-y-reverse":[`space-y-reverse`],size:[{size:ie()}],"inline-size":[{inline:[`auto`,...k()]}],"min-inline-size":[{"min-inline":[`auto`,...k()]}],"max-inline-size":[{"max-inline":[`none`,...k()]}],"block-size":[{block:[`auto`,...ae()]}],"min-block-size":[{"min-block":[`auto`,...ae()]}],"max-block-size":[{"max-block":[`none`,...ae()]}],w:[{w:[s,`screen`,...ie()]}],"min-w":[{"min-w":[s,`screen`,`none`,...ie()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...ie()]}],h:[{h:[`screen`,`lh`,...ie()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...ie()]}],"max-h":[{"max-h":[`screen`,`lh`,`none`,...ie()]}],"font-size":[{text:[`base`,n,as,Qo]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,ds,es]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Ho,Y]}],"font-family":[{font:[os,ts,t]}],"font-features":[{"font-features":[Y]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,X,Y]}],"line-clamp":[{"line-clamp":[J,`none`,X,$o]}],leading:[{leading:[`none`,a,...w()]}],"list-image":[{"list-image":[`none`,X,Y]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,X,Y]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:A()}],"text-color":[{text:A()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...ue(),`wavy`]}],"text-decoration-thickness":[{decoration:[J,`from-font`,`auto`,X,Qo]}],"text-decoration-color":[{decoration:A()}],"underline-offset":[{"underline-offset":[J,`auto`,X,Y]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:w()}],"tab-size":[{tab:[Vo,X,Y]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,X,Y]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,X,Y]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:oe()}],"bg-repeat":[{bg:se()}],"bg-size":[{bg:ce()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Vo,X,Y],radial:[``,X,Y],conic:[``,Vo,X,Y]},ls,rs]}],"bg-color":[{bg:A()}],"gradient-from-pos":[{from:le()}],"gradient-via-pos":[{via:le()}],"gradient-to-pos":[{to:le()}],"gradient-from":[{from:A()}],"gradient-via":[{via:A()}],"gradient-to":[{to:A()}],rounded:[{rounded:j()}],"rounded-s":[{"rounded-s":j()}],"rounded-e":[{"rounded-e":j()}],"rounded-t":[{"rounded-t":j()}],"rounded-r":[{"rounded-r":j()}],"rounded-b":[{"rounded-b":j()}],"rounded-l":[{"rounded-l":j()}],"rounded-ss":[{"rounded-ss":j()}],"rounded-se":[{"rounded-se":j()}],"rounded-ee":[{"rounded-ee":j()}],"rounded-es":[{"rounded-es":j()}],"rounded-tl":[{"rounded-tl":j()}],"rounded-tr":[{"rounded-tr":j()}],"rounded-br":[{"rounded-br":j()}],"rounded-bl":[{"rounded-bl":j()}],"border-w":[{border:M()}],"border-w-x":[{"border-x":M()}],"border-w-y":[{"border-y":M()}],"border-w-s":[{"border-s":M()}],"border-w-e":[{"border-e":M()}],"border-w-bs":[{"border-bs":M()}],"border-w-be":[{"border-be":M()}],"border-w-t":[{"border-t":M()}],"border-w-r":[{"border-r":M()}],"border-w-b":[{"border-b":M()}],"border-w-l":[{"border-l":M()}],"divide-x":[{"divide-x":M()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":M()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...ue(),`hidden`,`none`]}],"divide-style":[{divide:[...ue(),`hidden`,`none`]}],"border-color":[{border:A()}],"border-color-x":[{"border-x":A()}],"border-color-y":[{"border-y":A()}],"border-color-s":[{"border-s":A()}],"border-color-e":[{"border-e":A()}],"border-color-bs":[{"border-bs":A()}],"border-color-be":[{"border-be":A()}],"border-color-t":[{"border-t":A()}],"border-color-r":[{"border-r":A()}],"border-color-b":[{"border-b":A()}],"border-color-l":[{"border-l":A()}],"divide-color":[{divide:A()}],"outline-style":[{outline:[...ue(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[J,X,Y]}],"outline-w":[{outline:[``,J,as,Qo]}],"outline-color":[{outline:A()}],shadow:[{shadow:[``,`inner`,`none`,u,us,is]}],"shadow-color":[{shadow:A()}],"inset-shadow":[{"inset-shadow":[`none`,d,us,is]}],"inset-shadow-color":[{"inset-shadow":A()}],"ring-w":[{ring:M()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:A()}],"ring-offset-w":[{"ring-offset":[J,Qo]}],"ring-offset-color":[{"ring-offset":A()}],"inset-ring-w":[{"inset-ring":M()}],"inset-ring-color":[{"inset-ring":A()}],"text-shadow":[{"text-shadow":[`none`,f,us,is]}],"text-shadow-color":[{"text-shadow":A()}],opacity:[{opacity:[J,X,Y]}],"mix-blend":[{"mix-blend":[...de(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":de()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[J]}],"mask-image-linear-from-pos":[{"mask-linear-from":N()}],"mask-image-linear-to-pos":[{"mask-linear-to":N()}],"mask-image-linear-from-color":[{"mask-linear-from":A()}],"mask-image-linear-to-color":[{"mask-linear-to":A()}],"mask-image-t-from-pos":[{"mask-t-from":N()}],"mask-image-t-to-pos":[{"mask-t-to":N()}],"mask-image-t-from-color":[{"mask-t-from":A()}],"mask-image-t-to-color":[{"mask-t-to":A()}],"mask-image-r-from-pos":[{"mask-r-from":N()}],"mask-image-r-to-pos":[{"mask-r-to":N()}],"mask-image-r-from-color":[{"mask-r-from":A()}],"mask-image-r-to-color":[{"mask-r-to":A()}],"mask-image-b-from-pos":[{"mask-b-from":N()}],"mask-image-b-to-pos":[{"mask-b-to":N()}],"mask-image-b-from-color":[{"mask-b-from":A()}],"mask-image-b-to-color":[{"mask-b-to":A()}],"mask-image-l-from-pos":[{"mask-l-from":N()}],"mask-image-l-to-pos":[{"mask-l-to":N()}],"mask-image-l-from-color":[{"mask-l-from":A()}],"mask-image-l-to-color":[{"mask-l-to":A()}],"mask-image-x-from-pos":[{"mask-x-from":N()}],"mask-image-x-to-pos":[{"mask-x-to":N()}],"mask-image-x-from-color":[{"mask-x-from":A()}],"mask-image-x-to-color":[{"mask-x-to":A()}],"mask-image-y-from-pos":[{"mask-y-from":N()}],"mask-image-y-to-pos":[{"mask-y-to":N()}],"mask-image-y-from-color":[{"mask-y-from":A()}],"mask-image-y-to-color":[{"mask-y-to":A()}],"mask-image-radial":[{"mask-radial":[X,Y]}],"mask-image-radial-from-pos":[{"mask-radial-from":N()}],"mask-image-radial-to-pos":[{"mask-radial-to":N()}],"mask-image-radial-from-color":[{"mask-radial-from":A()}],"mask-image-radial-to-color":[{"mask-radial-to":A()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[J]}],"mask-image-conic-from-pos":[{"mask-conic-from":N()}],"mask-image-conic-to-pos":[{"mask-conic-to":N()}],"mask-image-conic-from-color":[{"mask-conic-from":A()}],"mask-image-conic-to-color":[{"mask-conic-to":A()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:oe()}],"mask-repeat":[{mask:se()}],"mask-size":[{mask:ce()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,X,Y]}],filter:[{filter:[``,`none`,X,Y]}],blur:[{blur:fe()}],brightness:[{brightness:[J,X,Y]}],contrast:[{contrast:[J,X,Y]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,us,is]}],"drop-shadow-color":[{"drop-shadow":A()}],grayscale:[{grayscale:[``,J,X,Y]}],"hue-rotate":[{"hue-rotate":[J,X,Y]}],invert:[{invert:[``,J,X,Y]}],saturate:[{saturate:[J,X,Y]}],sepia:[{sepia:[``,J,X,Y]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,X,Y]}],"backdrop-blur":[{"backdrop-blur":fe()}],"backdrop-brightness":[{"backdrop-brightness":[J,X,Y]}],"backdrop-contrast":[{"backdrop-contrast":[J,X,Y]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,J,X,Y]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[J,X,Y]}],"backdrop-invert":[{"backdrop-invert":[``,J,X,Y]}],"backdrop-opacity":[{"backdrop-opacity":[J,X,Y]}],"backdrop-saturate":[{"backdrop-saturate":[J,X,Y]}],"backdrop-sepia":[{"backdrop-sepia":[``,J,X,Y]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":w()}],"border-spacing-x":[{"border-spacing-x":w()}],"border-spacing-y":[{"border-spacing-y":w()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,X,Y]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[J,`initial`,X,Y]}],ease:[{ease:[`linear`,`initial`,_,X,Y]}],delay:[{delay:[J,X,Y]}],animate:[{animate:[`none`,v,X,Y]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,X,Y]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:pe()}],"rotate-x":[{"rotate-x":pe()}],"rotate-y":[{"rotate-y":pe()}],"rotate-z":[{"rotate-z":pe()}],scale:[{scale:P()}],"scale-x":[{"scale-x":P()}],"scale-y":[{"scale-y":P()}],"scale-z":[{"scale-z":P()}],"scale-3d":[`scale-3d`],skew:[{skew:F()}],"skew-x":[{"skew-x":F()}],"skew-y":[{"skew-y":F()}],transform:[{transform:[X,Y,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:I()}],"translate-x":[{"translate-x":I()}],"translate-y":[{"translate-y":I()}],"translate-z":[{"translate-z":I()}],"translate-none":[`translate-none`],zoom:[{zoom:[Vo,X,Y]}],accent:[{accent:A()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:A()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,X,Y]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":A()}],"scrollbar-track-color":[{"scrollbar-track":A()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":w()}],"scroll-mx":[{"scroll-mx":w()}],"scroll-my":[{"scroll-my":w()}],"scroll-ms":[{"scroll-ms":w()}],"scroll-me":[{"scroll-me":w()}],"scroll-mbs":[{"scroll-mbs":w()}],"scroll-mbe":[{"scroll-mbe":w()}],"scroll-mt":[{"scroll-mt":w()}],"scroll-mr":[{"scroll-mr":w()}],"scroll-mb":[{"scroll-mb":w()}],"scroll-ml":[{"scroll-ml":w()}],"scroll-p":[{"scroll-p":w()}],"scroll-px":[{"scroll-px":w()}],"scroll-py":[{"scroll-py":w()}],"scroll-ps":[{"scroll-ps":w()}],"scroll-pe":[{"scroll-pe":w()}],"scroll-pbs":[{"scroll-pbs":w()}],"scroll-pbe":[{"scroll-pbe":w()}],"scroll-pt":[{"scroll-pt":w()}],"scroll-pr":[{"scroll-pr":w()}],"scroll-pb":[{"scroll-pb":w()}],"scroll-pl":[{"scroll-pl":w()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,X,Y]}],fill:[{fill:[`none`,...A()]}],"stroke-w":[{stroke:[J,as,Qo,$o]}],stroke:[{stroke:[`none`,...A()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`start`,`end`,`right`,`left`],"inset-y":[`inset-bs`,`inset-be`,`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`ps`,`pe`,`pr`,`pl`],py:[`pbs`,`pbe`,`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`ms`,`me`,`mr`,`ml`],my:[`mbs`,`mbe`,`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-s`,`border-w-e`,`border-w-r`,`border-w-l`],"border-w-y":[`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-s`,`border-color-e`,`border-color-r`,`border-color-l`],"border-color-y":[`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-ms`,`scroll-me`,`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-ps`,`scroll-pe`,`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},ws=(e,{cacheSize:t,prefix:n,experimentalParseClassName:r,extend:i={},override:a={}})=>(Ts(e,`cacheSize`,t),Ts(e,`prefix`,n),Ts(e,`experimentalParseClassName`,r),Es(e.theme,a.theme),Es(e.classGroups,a.classGroups),Es(e.conflictingClassGroups,a.conflictingClassGroups),Es(e.conflictingClassGroupModifiers,a.conflictingClassGroupModifiers),Ts(e,`postfixLookupClassGroups`,a.postfixLookupClassGroups),Ts(e,`orderSensitiveModifiers`,a.orderSensitiveModifiers),Ds(e.theme,i.theme),Ds(e.classGroups,i.classGroups),Ds(e.conflictingClassGroups,i.conflictingClassGroups),Ds(e.conflictingClassGroupModifiers,i.conflictingClassGroupModifiers),Os(e,i,`postfixLookupClassGroups`),Os(e,i,`orderSensitiveModifiers`),e),Ts=(e,t,n)=>{n!==void 0&&(e[t]=n)},Es=(e,t)=>{if(t)for(let n in t)Ts(e,n,t[n])},Ds=(e,t)=>{if(t)for(let n in t)Os(e,t,n)},Os=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},ks=(e,...t)=>typeof e==`function`?ko(Cs,e,...t):ko(()=>ws(Cs(),e),...t),As=Array.isArray,js=e=>{if(!e&&e!==0&&e!==0n)return``;if(typeof e==`string`)return e;if(typeof e==`number`)return e===e?``+e:``;if(typeof e==`bigint`)return``+e;let t=``;if(As(e)){let n=e.length;for(let r=0;r<n;r++){let n=e[r];if(!n&&n!==0&&n!==0n)continue;let i=typeof n==`string`?n:js(n);i&&(t&&(t+=` `),t+=i)}return t}if(typeof e==`object`)for(let n in e)e[n]&&(t&&(t+=` `),t+=n);return t},Ms=/\s+/g,Ns=Array.isArray,Ps=e=>typeof e!=`string`||!e?e:e.replace(Ms,` `).trim(),Fs=e=>{let t=e.length;if(t===0)return!1;let n=e.charCodeAt(0),r=e.charCodeAt(t-1);if(n===32||r===32||n>=9&&n<=13||n===160||r>=9&&r<=13||r===160)return!0;for(let n=0;n<t;n++){let r=e.charCodeAt(n);if(r>=9&&r<=13||r===160||r===32&&n+1<t&&e.charCodeAt(n+1)===32)return!0}return!1},Is=(...e)=>{let t=js(e);if(t)return Fs(t)?Ps(t):t},Ls=e=>e===!1?`false`:e===!0?`true`:e===0?`0`:e,Rs=e=>{if(!e||typeof e!=`object`)return!0;for(let t in e)return!1;return!0},zs=(e,t)=>{if(e===t)return!0;if(!e||!t)return!1;let n=e,r=t,i=Object.keys(n),a=Object.keys(r);if(i.length!==a.length)return!1;for(let e=0;e<i.length;e++){let t=i[e];if(!a.includes(t)||n[t]!==r[t])return!1}return!0},Bs=(e,t)=>{let n=e;for(let e in t)if(Object.hasOwn(t,e)){let r=t[e];n[e]=e in n?Is(n[e],r):r}return e},Vs=(e,t)=>{for(let n=0;n<e.length;n++){let r=e[n];Ns(r)?Vs(r,t):r&&t.push(r)}},Hs=(...e)=>{let t=[];Vs(e,t);let n=[];for(let e=0;e<t.length;e++)t[e]&&n.push(t[e]);return n},Us=(e,t)=>{let n=e,r=t,i={};for(let e in n){let t=n[e];if(e in r){let n=r[e];i[e]=Ns(t)||Ns(n)?Hs(n,t):typeof t==`object`&&typeof n==`object`&&t&&n?Us(t,n):n+` `+t}else i[e]=t}for(let e in r)e in n||(i[e]=r[e]);return i},Ws={twMerge:!0,twMergeConfig:{}},Gs=256,Ks=128,qs=Symbol(`tv-cache-miss`),Js=e=>e?.class!=null&&e.class!==``||e?.className!=null&&e.className!==``,Ys=e=>{if(e===void 0)return``;if(e===null)return`null`;if(typeof e==`string`)return e;if(typeof e==`boolean`)return e?`true`:`false`;if(typeof e==`number`)return e===0?`0`:String(e);if(typeof e==`bigint`)return String(e);let t=Ls(e),n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return String(t);if(n===`object`)try{return JSON.stringify(t)}catch{return null}return null},Xs=(e,t)=>{if(t===void 0)return e;if(t===null)return e+`null`;let n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return e+String(t);if(Array.isArray(t))return e+t.join(`\0`);try{return e+JSON.stringify(t)}catch{return e+`?`}},Zs=(e,t,n,r)=>{let i=``,a=Object.create(null);for(let r=0;r<e.length;r++){let o=e[r];a[o]=1;let s=t[o];n&&n[o]!==void 0&&(s=n[o]);let c=Ys(s);if(c===null)return null;i+=o+`:`+c+`;`}let o=[];for(let e in t)e===`class`||e===`className`||a[e]||(a[e]=1,o.push(e));if(n)for(let e in n)e===`class`||e===`className`||a[e]||n[e]===void 0||(a[e]=1,o.push(e));o.length>1&&o.sort();for(let e=0;e<o.length;e++){let r=o[e],a=t[r];n&&n[r]!==void 0&&(a=n[r]);let s=Ys(a);if(s===null)return null;i+=r+`:`+s+`;`}return i},Qs=(e,t)=>{let n=``;for(let t=0;t<e.length;t++){let{conditionKeys:r,source:i}=e[t];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=Xs(n,i[t]),n+=`,`}n+=`c=`,n=Xs(n,i.class),n+=`|cn=`,n=Xs(n,i.className),n+=`;`}for(let e=0;e<t.length;e++){let{conditionKeys:r,source:i}=t[e];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=Xs(n,i[t]),n+=`,`}Array.isArray(i.slots)&&(n+=`slots=`+i.slots.join(`,`)+`,`),n+=`c=`,n=Xs(n,i.class),n+=`|cn=`,n=Xs(n,i.className),n+=`;`}return n},$s=(e=Gs)=>{let t=new Map,n=null;return{get(e){if(t.has(e))return t.get(e);if(n?.has(e)){let r=n.get(e);return t.set(e,r),r}return qs},set(r,i){t.size>=e&&(n=t,t=new Map),t.set(r,i)}}},ec=(e=Gs)=>{let t=$s(e);return{get(e){return t.get(e)},set(e,n){t.set(e,n)}}},tc=(e=Ks)=>{let t=new Map,n=null,r=0;return{get(e,i){let a=t.get(e);if(a){let e=a.get(i);if(e!==void 0||a.has(i))return e}if(n){let a=n.get(e);if(a){let n=a.get(i);if(n!==void 0||a.has(i)){let a=t.get(e);return a||(a=new Map,t.set(e,a)),a.has(i)||r++,a.set(i,n),n}}}return qs},set(i,a,o){r>=e&&(n=t,t=new Map,r=0);let s=t.get(i);s||(s=new Map,t.set(i,s)),s.has(a)||r++,s.set(a,o)}}},nc=(e,t)=>{let n=null;return(r,i)=>{if(!Js(i))return r;let a=i.class,o=i.className;if(a!=null&&a!==``&&typeof a!=`string`||o!=null&&o!==``&&typeof o!=`string`)return e(t,r,a,o);n??=tc();let s=r??``,c=(typeof a==`string`?a:``)+`\0`+(typeof o==`string`?o:``),l=n.get(s,c);if(l!==qs)return l;let u=e(t,r,a,o);return n.set(s,c,u),u}};function rc(){let e=null,t={},n=!1;return{get cachedTwMerge(){return e},set cachedTwMerge(t){e=t},get cachedTwMergeConfig(){return t},set cachedTwMergeConfig(e){t=e},get didTwMergeConfigChange(){return n},set didTwMergeConfigChange(e){n=e},reset(){e=null,t={},n=!1}}}var ic=rc(),ac=e=>{!Rs(e.twMergeConfig)&&!zs(e.twMergeConfig,ic.cachedTwMergeConfig)&&(ic.didTwMergeConfigChange=!0,ic.cachedTwMergeConfig=e.twMergeConfig)},oc=(e,t)=>{let n=[];for(let r=0;r<t.length;r++){let i=t[r],a=e[i];n.push({key:i,values:a,isEmpty:Rs(a)})}return n},sc=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},cc=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`slots`&&e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},lc=e=>{let t={};for(let n=0;n<e.length;n++){let r=e[n],i=r.source.slots;if(Array.isArray(i))for(let e=0;e<i.length;e++){let n=i[e];t[n]||(t[n]=[]),t[n].push(r)}}return t},uc=(e,t)=>{let{extend:n=null,slots:r={},variants:i={},compoundVariants:a=[],compoundSlots:o=[],defaultVariants:s={}}=e,c={...Ws,...t},l=e.slots!==void 0,u=n?.base?Is(n.base,e?.base):e?.base,d=n?.variants&&!Rs(n.variants)?Us(i,n.variants):i,f=n?.defaultVariants&&!Rs(n.defaultVariants)?{...n.defaultVariants,...s}:s;ac(c);let p=!n?.slots||Rs(n.slots),m=l?p&&n?.base?Is(e?.base,n.base):typeof e?.base==`string`||e?.base==null?e.base:Is(e.base):void 0,h=l?{base:m,...r}:{},g=p?h:Bs({...n?.slots},Rs(h)?{base:e?.base}:h),_=!n?.compoundVariants||Rs(n.compoundVariants)?a:Hs(n?.compoundVariants,a),v=!n?.compoundSlots||Rs(n.compoundSlots)?o:Hs(n?.compoundSlots,o),y=Object.keys(d);return{config:c,extend:n,base:u,variants:d,defaultVariants:f,slots:g,compoundVariants:_,compoundSlots:v,compiledVariants:null,compiledCompoundVariants:null,compiledCompoundSlots:null,compiledCompoundSlotsBySlot:null,deferredError:_&&!Array.isArray(_)?TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof _}`):v&&!Array.isArray(v)?TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof v}`):null,mode:l||!p?`slots`:y.length===0?`plain`:`variants`,slotKeys:null,variantKeys:y}},dc=e=>e.compiledVariants===null?(e.compiledVariants=oc(e.variants,e.variantKeys),e.compiledCompoundVariants=sc(e.compoundVariants),e.compiledCompoundSlots=cc(e.compoundSlots),e.compiledCompoundSlotsBySlot=lc(e.compiledCompoundSlots),e.slotKeys=e.slots&&typeof e.slots==`object`?Object.keys(e.slots):[],e):e,fc=[],pc=[],mc=[],hc=[],gc=[],_c=(e,t,n)=>{let r={};for(let t in e)r[t]=e[t];if(t)for(let e in t)t[e]!==void 0&&(r[e]=t[e]);if(n)for(let e in n)n[e]!==void 0&&(r[e]=n[e]);return r},vc=e=>e==null||e===!1,yc=(e,t)=>{if(!Array.isArray(e))return e===t||vc(e)&&vc(t);for(let n=0;n<e.length;n++){let r=e[n];if(r===t||vc(r)&&vc(t))return!0}return!1},bc=(e,t,n,r)=>{if(e.isEmpty)return null;let i=r?.[e.key]??n?.[e.key];if(i===null)return null;let a=Ls(i);if(typeof a==`object`)return null;let o=t?.[e.key],s=a??Ls(o);return e.values[s||`false`]},xc=(e,t)=>{let{conditionKeys:n,source:r}=e;for(let e=0;e<n.length;e++){let i=n[e];if(!yc(r[i],t[i]))return!1}return!0},Sc=(e,t,n)=>{typeof n==`string`?t===`base`&&e.push(n):n&&typeof n==`object`&&n[t]&&e.push(n[t])},Cc=(e,t,n)=>{let r=pc;r.length=0;for(let i=0;i<e.length;i++){let a=bc(e[i],t,n);a&&r.push(a)}return r},wc=(e,t,n,r,i)=>{let a=pc;a.length=0;for(let o=0;o<t.length;o++){let s=bc(t[o],n,r,i),c=e===`base`&&typeof s==`string`?s:s&&s[e];c&&a.push(c)}return a},Tc=(e,t)=>{let n=mc;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];xc(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},Ec=(e,t,n)=>{let r=hc;r.length=0;for(let i=0;i<t.length;i++){let a=t[i];xc(a,n)&&(Sc(r,e,a.source.class),Sc(r,e,a.source.className))}return r},Dc=(e,t)=>{let n=gc;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];xc(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},Oc=(e,t)=>{let{base:n,config:r}=e,i=qs,a=nc(t,r);return(e=>(i===qs&&(i=t(r,n)),a(i,e)))},kc=(e,t)=>{let{base:n,config:r,defaultVariants:i,deferredError:a,variantKeys:o}=e,s=e.compiledCompoundVariants,c=e.compiledVariants,l=fc,u=null,d=nc(t,r),f=1,p=e=>{let a=s.length>0?Tc(s,_c(i,e)):void 0;return t(r,n,Cc(c,i,e),a)};return(t=>{if(a)throw a;(c===null||s===null)&&(dc(e),c=e.compiledVariants,s=e.compiledCompoundVariants,l=e.compiledCompoundSlots??fc);let n;if(f>0)f--,n=p(t);else{u??=ec();let e=Zs(o,i,t);if(e!==null){let r=s.length>0||l.length>0?Qs(s,l):``,i=e+`#`+r,a=u.get(i);a===qs?(n=p(t),u.set(i,n)):n=a}else n=p(t)}return d(n,t)})},Ac=(e,t)=>{let{config:n,defaultVariants:r,deferredError:i,slots:a,variantKeys:o}=e,s=null,c=null,l=null,u=null,d=!1,f=null,p=null,m=1,h=()=>{if(l!==null)return;(e.compiledVariants===null||e.compiledCompoundVariants===null||e.compiledCompoundSlots===null||e.compiledCompoundSlotsBySlot===null||e.slotKeys===null)&&dc(e);let i=e.compiledVariants;s=e.compiledCompoundVariants,c=e.compiledCompoundSlots;let o=e.compiledCompoundSlotsBySlot;l=e.slotKeys,d=s.length>0||c.length>0,f=nc(t,n);let p=Array(l.length);for(let e=0;e<l.length;e++){let c=l[e],u=o[c]??fc;p[e]=(e,o)=>{let l=d?_c(r,e,o):void 0,f=l?Ec(c,s,l):void 0,p=l?Dc(u,l):void 0;return t(n,a[c],wc(c,i,r,e,o),f,p)}}u=p},g=e=>{let t=l,n=u,r=f,i={};for(let a=0;a<t.length;a++){let o=n[a],s=o(e);i[t[a]]=t=>{if(t==null)return s;let n=!1;for(let e in t)if(e!==`class`&&e!==`className`&&t[e]!==void 0){n=!0;break}return r(n?o(e,t):s,t)}}return i};return(e=>{if(i)throw i;if(h(),m>0)return m--,g(e);let t=Zs(o,r,e);if(t===null)return g(e);let n=d?Qs(s,c):``,a=t+`#`+n;p??=$s();let l=p.get(a);if(l!==qs)return l;let u=g(e);return p.set(a,u),u})},jc=(e,t)=>{if(e.mode===`plain`)return Oc(e,t);let n;return(r=>(n??=e.mode===`slots`?Ac(e,t):kc(e,t),n(r)))},Mc=(e,t)=>{e.variantKeys=t.variantKeys,e.extend=t.extend,e.base=t.base,e.slots=t.slots,e.variants=t.variants,e.defaultVariants=t.defaultVariants,e.compoundSlots=t.compoundSlots,e.compoundVariants=t.compoundVariants},Nc=e=>{let t=(t,n)=>{let r=uc(t,n),i=jc(r,e);return Mc(i,r),i};return{tv:t,createTV:e=>(n,r)=>t(n,r?Us(e,r):e)}},Pc=(e,t)=>{let n=e.length,r=t.length,i=Array(n+r);for(let t=0;t<n;t++)i[t]=e[t];for(let e=0;e<r;e++)i[n+e]=t[e];return i},Fc=(e,t)=>({classGroupId:e,validator:t}),Ic=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),Lc=`-`,Rc=[],zc=`arbitrary..`,Bc=e=>{let t=Uc(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e[0]===`[`&&e[e.length-1]===`]`)return Hc(e);let n=e.split(Lc);return Vc(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?Pc(i,t):t:i||Rc}return n[e]||Rc}}},Vc=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=Vc(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(Lc):e.slice(t).join(Lc),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},Hc=e=>{let t=e.slice(1,-1),n=t.indexOf(`:`);if(n===-1)return;let r=t.slice(0,n);return r?zc+r:void 0},Uc=e=>{let{theme:t,classGroups:n}=e;return Wc(n,t)},Wc=(e,t)=>{let n=Ic();for(let r in e){let i=e[r];Gc(i,n,r,t)}return n},Gc=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];Kc(i,t,n,r)}},Kc=(e,t,n,r)=>{if(typeof e==`string`){qc(e,t,n);return}if(typeof e==`function`){Jc(e,t,n,r);return}Yc(e,t,n,r)},qc=(e,t,n)=>{let r=e===``?t:Xc(t,e);r.classGroupId=n},Jc=(e,t,n,r)=>{if(Zc(e)){Gc(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Fc(n,e))},Yc=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];Gc(o,Xc(t,a),n,r)}},Xc=(e,t)=>{let n=e,r=t.split(Lc),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=Ic(),n.nextPart.set(t,i)),n=i}return n},Zc=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,Qc=`!`,$c=58,el=47,tl=91,nl=93,rl=40,il=41,al=33,ol=(e,t,n,r)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:void 0}),sl=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e.charCodeAt(s);if(n===0&&r===0){if(o===$c){t.push(e.slice(i,s)),i=s+1;continue}if(o===el){a=s;continue}}o===tl?n++:o===nl?n--:o===rl?r++:o===il&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1,u=s.length-1;s.charCodeAt(u)===al?(c=s.slice(0,-1),l=!0):s.charCodeAt(0)===al&&(c=s.slice(1),l=!0);let d=a&&a>i?a-i:void 0;return ol(t,l,c,d)},cl=e=>{let t=new Set(e.orderSensitiveModifiers);return e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);if(o||s){if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e]);r=[]}n.push(a)}else r.push(a)}if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e])}return n}},ll={isExternal:!0,classId:-1,conflictIds:[]},ul=4096,dl=16384,fl=e=>{let t=cl(e),n=pl(e),{getClassGroupId:r,getConflictingClassGroupIds:i}=Bc(e),a=Object.create(null),o=Object.create(null),s=0,c=new Int32Array(256),l=0,u=new Uint8Array(64),d=!1,f=e=>{let t=[],n=e.length,r=-1;d=!1;for(let i=0;i<n;i++){let n=e.charCodeAt(i);n===32?r!==-1&&(t.push(e.slice(r,i)),r=-1):n>=9&&n<=13?(d=!0,r!==-1&&(t.push(e.slice(r,i)),r=-1)):r===-1&&(r=i)}return r!==-1&&t.push(e.slice(r)),t},p=new Map,m=0,h=e=>{let t=p.get(e);if(t===void 0&&(t=m++,p.set(e,t),t>=c.length)){let e=new Int32Array(c.length*2);e.set(c),c=e}return t},g=e=>{let{isExternal:a,modifiers:o,hasImportantModifier:s,baseClassName:c,maybePostfixModifierPosition:l}=sl(e);if(a)return ll;let u=!!l,d;if(u){let e=c.substring(0,l);d=r(e);let t=d&&n[d]?r(c):void 0;t&&t!==d&&(d=t,u=!1)}else d=r(c);if(!d){if(!u||(d=r(c),!d))return ll;u=!1}let f=o.length===0?``:o.length===1?o[0]:t(o).join(`:`),p=s?f+Qc:f,m=i(d,u),g=[];for(let e=0;e<m.length;e++)g.push(h(p+m[e]));return{isExternal:!1,classId:h(p+d),conflictIds:g}},_=e=>{let t=a[e];return t===void 0?(t=o[e],t===void 0&&(t=g(e)),a[e]=t,++s>ul&&(s=0,o=a,a=Object.create(null)),t):t};return{parseClassName:sl,sortModifiers:t,postfixLookupClassGroupIds:n,getClassGroupId:r,getConflictingClassGroupIds:i,getClassDescriptor:_,mergeClassList:e=>{let t=f(e),n=t.length;if(n===1)return t[0];m>dl&&(p.clear(),m=0,a=Object.create(null),o=Object.create(null),s=0),l=l+1|0,l===0&&(l=1);let r=l;if(n>u.length){let e=u.length;for(;e<n;)e*=2;u=new Uint8Array(e)}let i=!1,h=0;for(let e=n-1;e>=0;--e){let n=t[e];h+=n.length;let a=_(n);if(a.isExternal){u[e]=1;continue}let o=a.classId;if(c[o]===r){u[e]=0,i=!0;continue}c[o]=r;let s=a.conflictIds;for(let e=0;e<s.length;e++)c[s[e]]=r;u[e]=1}if(!i&&!d&&e.length===h+n-1)return e;let g=``;for(let e=0;e<n;e++)u[e]===1&&(g&&(g+=` `),g+=t[e]);return g}}},pl=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},ml=500,hl=e=>{let t,n,r=Object.create(null),i=Object.create(null),a=0,o=r=>(t=fl(e()),n=t.mergeClassList,c.mergeString=s,s(r)),s=e=>{let t=r[e];return t===void 0?(t=i[e],t===void 0&&(t=n(e)),r[e]=t,++a>ml&&(a=0,i=r,r=Object.create(null)),t):t},c=(...e)=>c.mergeString(js(e));return c.mergeString=o,c},gl=[],_l=e=>{let t=t=>t[e]||gl;return t.isThemeGetter=!0,t},vl=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,yl=/^\((?:(\w[\w-]*):)?(.+)\)$/i,bl=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,xl=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Sl=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Cl=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,wl=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,Tl=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,El=Number,Dl=Number.isNaN,Ol=Number.isInteger,kl=e=>bl.test(e),Z=e=>!!e&&!Dl(El(e)),Al=e=>!!e&&Ol(El(e)),jl=e=>e.endsWith(`%`)&&Z(e.slice(0,-1)),Ml=e=>xl.test(e),Nl=()=>!0,Pl=e=>Sl.test(e)&&!Cl.test(e),Fl=()=>!1,Il=e=>wl.test(e),Ll=e=>Tl.test(e),Rl=e=>!Q(e)&&!$(e),zl=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),Bl=e=>tu(e,au,Fl),Q=e=>vl.test(e),Vl=e=>tu(e,ou,Pl),Hl=e=>tu(e,su,Z),Ul=e=>tu(e,lu,Nl),Wl=e=>tu(e,cu,Fl),Gl=e=>tu(e,ru,Fl),Kl=e=>tu(e,iu,Ll),ql=e=>tu(e,uu,Il),$=e=>yl.test(e),Jl=e=>nu(e,ou),Yl=e=>nu(e,cu),Xl=e=>nu(e,ru),Zl=e=>nu(e,au),Ql=e=>nu(e,iu),$l=e=>nu(e,uu,!0),eu=e=>nu(e,lu,!0),tu=(e,t,n)=>{let r=vl.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},nu=(e,t,n=!1)=>{let r=yl.exec(e);return r?r[1]?t(r[1]):n:!1},ru=e=>e===`position`||e===`percentage`,iu=e=>e===`image`||e===`url`,au=e=>e===`length`||e===`size`||e===`bg-size`,ou=e=>e===`length`,su=e=>e===`number`,cu=e=>e===`family-name`,lu=e=>e===`number`||e===`weight`,uu=e=>e===`shadow`,du=()=>{let e=_l(`color`),t=_l(`font`),n=_l(`text`),r=_l(`font-weight`),i=_l(`tracking`),a=_l(`leading`),o=_l(`breakpoint`),s=_l(`container`),c=_l(`spacing`),l=_l(`radius`),u=_l(`shadow`),d=_l(`inset-shadow`),f=_l(`text-shadow`),p=_l(`drop-shadow`),m=_l(`blur`),h=_l(`perspective`),g=_l(`aspect`),_=_l(`ease`),v=_l(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),$,Q],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],C=()=>[`auto`,`contain`,`none`],w=()=>[$,Q,c],T=()=>[kl,`full`,`auto`,...w()],ee=()=>[Al,`none`,`subgrid`,$,Q],E=()=>[`auto`,{span:[`full`,Al,$,Q]},Al,$,Q],D=()=>[Al,`auto`,$,Q],te=()=>[`auto`,`min`,`max`,`fr`,$,Q],ne=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],re=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],O=()=>[`auto`,...w()],ie=()=>[kl,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...w()],k=()=>[kl,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...w()],ae=()=>[kl,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...w()],A=()=>[e,$,Q],oe=()=>[...b(),Xl,Gl,{position:[$,Q]}],se=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ce=()=>[`auto`,`cover`,`contain`,Zl,Bl,{size:[$,Q]}],le=()=>[jl,Jl,Vl],j=()=>[``,`none`,`full`,l,$,Q],M=()=>[``,Z,Jl,Vl],ue=()=>[`solid`,`dashed`,`dotted`,`double`],de=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],N=()=>[Z,jl,Xl,Gl],fe=()=>[``,`none`,m,$,Q],pe=()=>[`none`,Z,$,Q],P=()=>[`none`,Z,$,Q],F=()=>[Z,$,Q],I=()=>[kl,`full`,...w()];return{theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[Ml],breakpoint:[Ml],color:[Nl],container:[Ml],"drop-shadow":[Ml],ease:[`in`,`out`,`in-out`],font:[Rl],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[Ml],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[Ml],shadow:[Ml],spacing:[`px`,Z],text:[Ml],"text-shadow":[Ml],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,kl,Q,$,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,$,Q]}],"container-named":[zl],columns:[{columns:[Z,Q,$,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:C()}],"overscroll-x":[{"overscroll-x":C()}],"overscroll-y":[{"overscroll-y":C()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:T()}],"inset-x":[{"inset-x":T()}],"inset-y":[{"inset-y":T()}],start:[{"inset-s":T(),start:T()}],end:[{"inset-e":T(),end:T()}],"inset-bs":[{"inset-bs":T()}],"inset-be":[{"inset-be":T()}],top:[{top:T()}],right:[{right:T()}],bottom:[{bottom:T()}],left:[{left:T()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Al,`auto`,$,Q]}],basis:[{basis:[kl,`full`,`auto`,s,...w()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[Z,kl,`auto`,`initial`,`none`,Q]}],grow:[{grow:[``,Z,$,Q]}],shrink:[{shrink:[``,Z,$,Q]}],order:[{order:[Al,`first`,`last`,`none`,$,Q]}],"grid-cols":[{"grid-cols":ee()}],"col-start-end":[{col:E()}],"col-start":[{"col-start":D()}],"col-end":[{"col-end":D()}],"grid-rows":[{"grid-rows":ee()}],"row-start-end":[{row:E()}],"row-start":[{"row-start":D()}],"row-end":[{"row-end":D()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":te()}],"auto-rows":[{"auto-rows":te()}],gap:[{gap:w()}],"gap-x":[{"gap-x":w()}],"gap-y":[{"gap-y":w()}],"justify-content":[{justify:[...ne(),`normal`]}],"justify-items":[{"justify-items":[...re(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...re()]}],"align-content":[{content:[`normal`,...ne()]}],"align-items":[{items:[...re(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...re(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ne()}],"place-items":[{"place-items":[...re(),`baseline`]}],"place-self":[{"place-self":[`auto`,...re()]}],p:[{p:w()}],px:[{px:w()}],py:[{py:w()}],ps:[{ps:w()}],pe:[{pe:w()}],pbs:[{pbs:w()}],pbe:[{pbe:w()}],pt:[{pt:w()}],pr:[{pr:w()}],pb:[{pb:w()}],pl:[{pl:w()}],m:[{m:O()}],mx:[{mx:O()}],my:[{my:O()}],ms:[{ms:O()}],me:[{me:O()}],mbs:[{mbs:O()}],mbe:[{mbe:O()}],mt:[{mt:O()}],mr:[{mr:O()}],mb:[{mb:O()}],ml:[{ml:O()}],"space-x":[{"space-x":w()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":w()}],"space-y-reverse":[`space-y-reverse`],size:[{size:ie()}],"inline-size":[{inline:[`auto`,...k()]}],"min-inline-size":[{"min-inline":[`auto`,...k()]}],"max-inline-size":[{"max-inline":[`none`,...k()]}],"block-size":[{block:[`auto`,...ae()]}],"min-block-size":[{"min-block":[`auto`,...ae()]}],"max-block-size":[{"max-block":[`none`,...ae()]}],w:[{w:[s,`screen`,...ie()]}],"min-w":[{"min-w":[s,`screen`,`none`,...ie()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...ie()]}],h:[{h:[`screen`,`lh`,...ie()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...ie()]}],"max-h":[{"max-h":[`screen`,`lh`,...ie()]}],"font-size":[{text:[`base`,n,Jl,Vl]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,eu,Ul]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,jl,Q]}],"font-family":[{font:[Yl,Wl,t]}],"font-features":[{"font-features":[Q]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,$,Q]}],"line-clamp":[{"line-clamp":[Z,`none`,$,Hl]}],leading:[{leading:[a,...w()]}],"list-image":[{"list-image":[`none`,$,Q]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,$,Q]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:A()}],"text-color":[{text:A()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...ue(),`wavy`]}],"text-decoration-thickness":[{decoration:[Z,`from-font`,`auto`,$,Vl]}],"text-decoration-color":[{decoration:A()}],"underline-offset":[{"underline-offset":[Z,`auto`,$,Q]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:w()}],"tab-size":[{tab:[Al,$,Q]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,$,Q]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,$,Q]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:oe()}],"bg-repeat":[{bg:se()}],"bg-size":[{bg:ce()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Al,$,Q],radial:[``,$,Q],conic:[Al,$,Q]},Ql,Kl]}],"bg-color":[{bg:A()}],"gradient-from-pos":[{from:le()}],"gradient-via-pos":[{via:le()}],"gradient-to-pos":[{to:le()}],"gradient-from":[{from:A()}],"gradient-via":[{via:A()}],"gradient-to":[{to:A()}],rounded:[{rounded:j()}],"rounded-s":[{"rounded-s":j()}],"rounded-e":[{"rounded-e":j()}],"rounded-t":[{"rounded-t":j()}],"rounded-r":[{"rounded-r":j()}],"rounded-b":[{"rounded-b":j()}],"rounded-l":[{"rounded-l":j()}],"rounded-ss":[{"rounded-ss":j()}],"rounded-se":[{"rounded-se":j()}],"rounded-ee":[{"rounded-ee":j()}],"rounded-es":[{"rounded-es":j()}],"rounded-tl":[{"rounded-tl":j()}],"rounded-tr":[{"rounded-tr":j()}],"rounded-br":[{"rounded-br":j()}],"rounded-bl":[{"rounded-bl":j()}],"border-w":[{border:M()}],"border-w-x":[{"border-x":M()}],"border-w-y":[{"border-y":M()}],"border-w-s":[{"border-s":M()}],"border-w-e":[{"border-e":M()}],"border-w-bs":[{"border-bs":M()}],"border-w-be":[{"border-be":M()}],"border-w-t":[{"border-t":M()}],"border-w-r":[{"border-r":M()}],"border-w-b":[{"border-b":M()}],"border-w-l":[{"border-l":M()}],"divide-x":[{"divide-x":M()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":M()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...ue(),`hidden`,`none`]}],"divide-style":[{divide:[...ue(),`hidden`,`none`]}],"border-color":[{border:A()}],"border-color-x":[{"border-x":A()}],"border-color-y":[{"border-y":A()}],"border-color-s":[{"border-s":A()}],"border-color-e":[{"border-e":A()}],"border-color-bs":[{"border-bs":A()}],"border-color-be":[{"border-be":A()}],"border-color-t":[{"border-t":A()}],"border-color-r":[{"border-r":A()}],"border-color-b":[{"border-b":A()}],"border-color-l":[{"border-l":A()}],"divide-color":[{divide:A()}],"outline-style":[{outline:[...ue(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[Z,$,Q]}],"outline-w":[{outline:[``,Z,Jl,Vl]}],"outline-color":[{outline:A()}],shadow:[{shadow:[``,`none`,u,$l,ql]}],"shadow-color":[{shadow:A()}],"inset-shadow":[{"inset-shadow":[`none`,d,$l,ql]}],"inset-shadow-color":[{"inset-shadow":A()}],"ring-w":[{ring:M()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:A()}],"ring-offset-w":[{"ring-offset":[Z,Vl]}],"ring-offset-color":[{"ring-offset":A()}],"inset-ring-w":[{"inset-ring":M()}],"inset-ring-color":[{"inset-ring":A()}],"text-shadow":[{"text-shadow":[`none`,f,$l,ql]}],"text-shadow-color":[{"text-shadow":A()}],opacity:[{opacity:[Z,$,Q]}],"mix-blend":[{"mix-blend":[...de(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":de()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[Z]}],"mask-image-linear-from-pos":[{"mask-linear-from":N()}],"mask-image-linear-to-pos":[{"mask-linear-to":N()}],"mask-image-linear-from-color":[{"mask-linear-from":A()}],"mask-image-linear-to-color":[{"mask-linear-to":A()}],"mask-image-t-from-pos":[{"mask-t-from":N()}],"mask-image-t-to-pos":[{"mask-t-to":N()}],"mask-image-t-from-color":[{"mask-t-from":A()}],"mask-image-t-to-color":[{"mask-t-to":A()}],"mask-image-r-from-pos":[{"mask-r-from":N()}],"mask-image-r-to-pos":[{"mask-r-to":N()}],"mask-image-r-from-color":[{"mask-r-from":A()}],"mask-image-r-to-color":[{"mask-r-to":A()}],"mask-image-b-from-pos":[{"mask-b-from":N()}],"mask-image-b-to-pos":[{"mask-b-to":N()}],"mask-image-b-from-color":[{"mask-b-from":A()}],"mask-image-b-to-color":[{"mask-b-to":A()}],"mask-image-l-from-pos":[{"mask-l-from":N()}],"mask-image-l-to-pos":[{"mask-l-to":N()}],"mask-image-l-from-color":[{"mask-l-from":A()}],"mask-image-l-to-color":[{"mask-l-to":A()}],"mask-image-x-from-pos":[{"mask-x-from":N()}],"mask-image-x-to-pos":[{"mask-x-to":N()}],"mask-image-x-from-color":[{"mask-x-from":A()}],"mask-image-x-to-color":[{"mask-x-to":A()}],"mask-image-y-from-pos":[{"mask-y-from":N()}],"mask-image-y-to-pos":[{"mask-y-to":N()}],"mask-image-y-from-color":[{"mask-y-from":A()}],"mask-image-y-to-color":[{"mask-y-to":A()}],"mask-image-radial":[{"mask-radial":[$,Q]}],"mask-image-radial-from-pos":[{"mask-radial-from":N()}],"mask-image-radial-to-pos":[{"mask-radial-to":N()}],"mask-image-radial-from-color":[{"mask-radial-from":A()}],"mask-image-radial-to-color":[{"mask-radial-to":A()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[Z]}],"mask-image-conic-from-pos":[{"mask-conic-from":N()}],"mask-image-conic-to-pos":[{"mask-conic-to":N()}],"mask-image-conic-from-color":[{"mask-conic-from":A()}],"mask-image-conic-to-color":[{"mask-conic-to":A()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:oe()}],"mask-repeat":[{mask:se()}],"mask-size":[{mask:ce()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,$,Q]}],filter:[{filter:[``,`none`,$,Q]}],blur:[{blur:fe()}],brightness:[{brightness:[Z,$,Q]}],contrast:[{contrast:[Z,$,Q]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,$l,ql]}],"drop-shadow-color":[{"drop-shadow":A()}],grayscale:[{grayscale:[``,Z,$,Q]}],"hue-rotate":[{"hue-rotate":[Z,$,Q]}],invert:[{invert:[``,Z,$,Q]}],saturate:[{saturate:[Z,$,Q]}],sepia:[{sepia:[``,Z,$,Q]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,$,Q]}],"backdrop-blur":[{"backdrop-blur":fe()}],"backdrop-brightness":[{"backdrop-brightness":[Z,$,Q]}],"backdrop-contrast":[{"backdrop-contrast":[Z,$,Q]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,Z,$,Q]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[Z,$,Q]}],"backdrop-invert":[{"backdrop-invert":[``,Z,$,Q]}],"backdrop-opacity":[{"backdrop-opacity":[Z,$,Q]}],"backdrop-saturate":[{"backdrop-saturate":[Z,$,Q]}],"backdrop-sepia":[{"backdrop-sepia":[``,Z,$,Q]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":w()}],"border-spacing-x":[{"border-spacing-x":w()}],"border-spacing-y":[{"border-spacing-y":w()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,$,Q]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[Z,`initial`,$,Q]}],ease:[{ease:[`linear`,`initial`,_,$,Q]}],delay:[{delay:[Z,$,Q]}],animate:[{animate:[`none`,v,$,Q]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,$,Q]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:pe()}],"rotate-x":[{"rotate-x":pe()}],"rotate-y":[{"rotate-y":pe()}],"rotate-z":[{"rotate-z":pe()}],scale:[{scale:P()}],"scale-x":[{"scale-x":P()}],"scale-y":[{"scale-y":P()}],"scale-z":[{"scale-z":P()}],"scale-3d":[`scale-3d`],skew:[{skew:F()}],"skew-x":[{"skew-x":F()}],"skew-y":[{"skew-y":F()}],transform:[{transform:[$,Q,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:I()}],"translate-x":[{"translate-x":I()}],"translate-y":[{"translate-y":I()}],"translate-z":[{"translate-z":I()}],"translate-none":[`translate-none`],zoom:[{zoom:[Al,$,Q]}],accent:[{accent:A()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:A()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,$,Q]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":A()}],"scrollbar-track-color":[{"scrollbar-track":A()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":w()}],"scroll-mx":[{"scroll-mx":w()}],"scroll-my":[{"scroll-my":w()}],"scroll-ms":[{"scroll-ms":w()}],"scroll-me":[{"scroll-me":w()}],"scroll-mbs":[{"scroll-mbs":w()}],"scroll-mbe":[{"scroll-mbe":w()}],"scroll-mt":[{"scroll-mt":w()}],"scroll-mr":[{"scroll-mr":w()}],"scroll-mb":[{"scroll-mb":w()}],"scroll-ml":[{"scroll-ml":w()}],"scroll-p":[{"scroll-p":w()}],"scroll-px":[{"scroll-px":w()}],"scroll-py":[{"scroll-py":w()}],"scroll-ps":[{"scroll-ps":w()}],"scroll-pe":[{"scroll-pe":w()}],"scroll-pbs":[{"scroll-pbs":w()}],"scroll-pbe":[{"scroll-pbe":w()}],"scroll-pt":[{"scroll-pt":w()}],"scroll-pr":[{"scroll-pr":w()}],"scroll-pb":[{"scroll-pb":w()}],"scroll-pl":[{"scroll-pl":w()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,$,Q]}],fill:[{fill:[`none`,...A()]}],"stroke-w":[{stroke:[Z,Jl,Vl,Hl]}],stroke:[{stroke:[`none`,...A()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`right`,`left`],"inset-y":[`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`pr`,`pl`],py:[`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`mr`,`ml`],my:[`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-r`,`border-w-l`],"border-w-y":[`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-r`,`border-color-l`],"border-color-y":[`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},fu=(e,{extend:t={},override:n={}})=>(mu(e.theme,n.theme),mu(e.classGroups,n.classGroups),mu(e.conflictingClassGroups,n.conflictingClassGroups),mu(e.conflictingClassGroupModifiers,n.conflictingClassGroupModifiers),pu(e,`postfixLookupClassGroups`,n.postfixLookupClassGroups),pu(e,`orderSensitiveModifiers`,n.orderSensitiveModifiers),hu(e.theme,t.theme),hu(e.classGroups,t.classGroups),hu(e.conflictingClassGroups,t.conflictingClassGroups),hu(e.conflictingClassGroupModifiers,t.conflictingClassGroupModifiers),gu(e,t,`postfixLookupClassGroups`),gu(e,t,`orderSensitiveModifiers`),e),pu=(e,t,n)=>{n!==void 0&&(e[t]=n)},mu=(e,t)=>{if(t)for(let n in t)pu(e,n,t[n])},hu=(e,t)=>{if(t)for(let n in t)gu(e,t,n)},gu=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},_u=e=>hl(e?typeof e==`function`?()=>e(du()):()=>fu(du(),e):du),vu=e=>{if(Rs(e))return;let t=e,n={...t.extend??{}};for(let e of[`theme`,`classGroups`,`conflictingClassGroups`,`conflictingClassGroupModifiers`,`postfixLookupClassGroups`,`orderSensitiveModifiers`,`cacheSize`,`prefix`,`separator`,`experimentalParseClassName`])t[e]!==void 0&&n[e]===void 0&&(n[e]=t[e]);let r={};if(Object.keys(n).length>0&&(r.extend=n),t.override!=null&&!Rs(t.override)&&(r.override=t.override),r.extend||r.override)return r},yu=e=>{let t=_u(vu(e));return e=>t.mergeString(e)},bu,xu=()=>(bu||=_u(),bu),Su=()=>((!ic.cachedTwMerge||ic.didTwMergeConfigChange)&&(ic.didTwMergeConfigChange=!1,ic.cachedTwMerge=yu(ic.cachedTwMergeConfig)),ic.cachedTwMerge),Cu=e=>{let t=e?.twMergeConfig;t&&!Rs(t)&&(zs(t,ic.cachedTwMergeConfig)||(ic.cachedTwMergeConfig=t,ic.didTwMergeConfigChange=!0))},wu=e=>js(e);(()=>{let e=Error();return!(`line`in e)&&!(`lineNumber`in e)})();var Tu=ic.reset.bind(ic);ic.reset=()=>{bu=void 0,Tu()};var Eu=(e,t)=>{let n=wu(e);return!n||!(t?.twMerge??!0)?n||void 0:n.indexOf(` `)===-1?n:(Cu(t),(t?.twMergeConfig&&!Rs(t.twMergeConfig)?Su():xu().mergeString)(n)||void 0)},Du=Nc((e,...t)=>Eu(t,e));Du.tv;var Ou=Du.createTV,ku=`/* Generated by \`bun run tokens\` from design/tokens/cawco.tokens.json.
   Do not edit: change the token source and rebuild. The Tailwind theme
   over tokens.css: a utility exists only where a token does. */
@theme {
  --*: initial;

  --spacing: 0.25rem;

  --breakpoint-phone: 640px;
  --breakpoint-desk: 900px;
  --breakpoint-wide: 1025px;

  --container-phone: 640px;
  --container-desk: 900px;
  --container-wide: 1025px;
  --container-field-group: 28rem;
  --container-details: 30rem;
  --container-table-34rem: 34rem;
  --container-task-frame: 56rem;
  --container-table-400px: 400px;
  --container-table-424px: 424px;
  --container-table-496px: 496px;
  --container-table-576px: 576px;
  --container-table-670px: 670px;
  --container-table-766px: 766px;
  --container-table-878px: 878px;
  --container-table-1102px: 1102px;
  --container-stop-tray: 420px;
  --container-kinds: 480px;
  --container-decisions-520px: 520px;
  --container-leaf: 620px;
  --container-setup: 640px;
  --container-media-split: 640px;
  --container-decisions-900px: 900px;
  --container-project-dock: 938px;
  --container-section-row: 312px;
  --container-connect-row: 400px;
}

@theme inline {
  --color-neutral-1: var(--neutral-1);
  --color-neutral-2: var(--neutral-2);
  --color-neutral-3: var(--neutral-3);
  --color-neutral-4: var(--neutral-4);
  --color-neutral-5: var(--neutral-5);
  --color-neutral-6: var(--neutral-6);
  --color-neutral-7: var(--neutral-7);
  --color-neutral-8: var(--neutral-8);
  --color-neutral-9: var(--neutral-9);
  --color-neutral-11: var(--neutral-11);
  --color-neutral-12: var(--neutral-12);
  --color-coral-3: var(--coral-3);
  --color-coral-5: var(--coral-5);
  --color-coral-9: var(--coral-9);
  --color-coral-10: var(--coral-10);
  --color-coral-11: var(--coral-11);
  --color-spark: var(--spark);
  --color-paper: var(--paper);
  --color-crow-ink: var(--crow-ink);
  --color-opencode-logo-core: var(--opencode-logo-core);
  --color-opencode-logo-frame: var(--opencode-logo-frame);
  --color-error-3: var(--error-3);
  --color-error-9: var(--error-9);
  --color-error-11: var(--error-11);
  --color-warning-3: var(--warning-3);
  --color-warning-9: var(--warning-9);
  --color-warning-11: var(--warning-11);
  --color-success-3: var(--success-3);
  --color-success-9: var(--success-9);
  --color-success-11: var(--success-11);
  --color-info-3: var(--info-3);
  --color-info-9: var(--info-9);
  --color-info-11: var(--info-11);
  --color-mark-1: var(--mark-1);
  --color-mark-2: var(--mark-2);
  --color-mark-3: var(--mark-3);
  --color-mark-4: var(--mark-4);
  --color-mark-5: var(--mark-5);
  --color-mark-6: var(--mark-6);
  --color-mark-7: var(--mark-7);
  --color-mark-8: var(--mark-8);
  --color-account-amber: var(--account-amber);
  --color-account-orange: var(--account-orange);
  --color-account-green: var(--account-green);
  --color-account-cyan: var(--account-cyan);
  --color-account-blue: var(--account-blue);
  --color-account-rose: var(--account-rose);
  --color-account-violet: var(--account-violet);
  --color-account-week-toward: var(--account-week-toward);
  --color-ring-track-spent: var(--ring-track-spent);
  --color-account-reserved: var(--account-reserved);
  --color-mark-glyph: var(--mark-glyph);
  --color-mark-deck-shade: var(--mark-deck-shade);
  --color-mark-deck-cast: var(--mark-deck-cast);
  --color-hue-cyan-400: var(--hue-cyan-400);
  --color-hue-cyan-500: var(--hue-cyan-500);
  --color-hue-amber-500: var(--hue-amber-500);
  --color-hue-orange-500: var(--hue-orange-500);
  --color-hue-green-500: var(--hue-green-500);
  --color-hue-green-600: var(--hue-green-600);
  --color-hue-blue-500: var(--hue-blue-500);
  --color-hue-blue-600: var(--hue-blue-600);
  --color-tool-run: var(--tool-run);
  --color-tool-mcp: var(--tool-mcp);
  --color-tool-search: var(--tool-search);
  --color-tool-ask: var(--tool-ask);
  --color-tool-web: var(--tool-web);
  --color-tool-read: var(--tool-read);
  --color-tool-agent: var(--tool-agent);
  --color-tool-edit: var(--tool-edit);
  --color-tool-write: var(--tool-write);
  --color-tool-skill: var(--tool-skill);
  --color-tool-plan: var(--tool-plan);
  --color-card: var(--card);
  --color-accent: var(--accent);
  --color-surface-page: var(--surface-page);
  --color-surface-raised: var(--surface-raised);
  --color-surface-card: var(--surface-card);
  --color-surface-recess: var(--surface-recess);
  --color-surface-recess-clear: var(--surface-recess-clear);
  --color-mask-opaque: var(--mask-opaque);
  --color-mask-opaque-a10: var(--mask-opaque-a10);
  --color-mask-opaque-a15: var(--mask-opaque-a15);
  --color-mask-opaque-a50: var(--mask-opaque-a50);
  --color-mask-opaque-a60: var(--mask-opaque-a60);
  --color-mask-opaque-a90: var(--mask-opaque-a90);
  --color-surface-band: var(--surface-band);
  --color-surface-recess-deep: var(--surface-recess-deep);
  --color-surface-well: var(--surface-well);
  --color-surface-shelf: var(--surface-shelf);
  --color-tab-sheet: var(--tab-sheet);
  --color-tab-recede-1: var(--tab-recede-1);
  --color-tab-recede-2: var(--tab-recede-2);
  --color-tab-recede-3: var(--tab-recede-3);
  --color-surface-lift: var(--surface-lift);
  --color-surface-tile: var(--surface-tile);
  --color-surface-fill: var(--surface-fill);
  --color-surface-fill-strong: var(--surface-fill-strong);
  --color-press-fill: var(--press-fill);
  --color-surface-pressed: var(--surface-pressed);
  --color-surface-hover: var(--surface-hover);
  --color-well-edge: var(--well-edge);
  --color-seam: var(--seam);
  --color-code-bg: var(--code-bg);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-surface-4: var(--surface-4);
  --color-surface-5: var(--surface-5);
  --color-surface-6: var(--surface-6);
  --color-surface-7: var(--surface-7);
  --color-surface-8: var(--surface-8);
  --color-border: var(--border);
  --color-border-hairline: var(--border-hairline);
  --color-border-well: var(--border-well);
  --color-border-control: var(--border-control);
  --color-border-contrast: var(--border-contrast);
  --color-border-card: var(--border-card);
  --color-border-button-outline: var(--border-button-outline);
  --color-border-row-outline: var(--border-row-outline);
  --color-border-control-strong: var(--border-control-strong);
  --color-input: var(--input);
  --color-ink-strong: var(--ink-strong);
  --color-ink-row: var(--ink-row);
  --color-ink-stat: var(--ink-stat);
  --color-ink-muted: var(--ink-muted);
  --color-ink-subtle: var(--ink-subtle);
  --color-text-strong: var(--text-strong);
  --color-text-muted: var(--text-muted);
  --color-brand-solid: var(--brand-solid);
  --color-brand-hover: var(--brand-hover);
  --color-brand-wash: var(--brand-wash);
  --color-c-target-tint: var(--c-target-tint);
  --color-c-change-ring: var(--c-change-ring);
  --color-brand-ink: var(--brand-ink);
  --color-brand-ink-strong: var(--brand-ink-strong);
  --color-link-ink: var(--link-ink);
  --color-link-hover: var(--link-hover);
  --color-action-solid: var(--action-solid);
  --color-action-hover: var(--action-hover);
  --color-on-action: var(--on-action);
  --color-on-brand: var(--on-brand);
  --color-action-top: var(--action-top);
  --color-action-bottom: var(--action-bottom);
  --color-action-hover-top: var(--action-hover-top);
  --color-action-hover-bottom: var(--action-hover-bottom);
  --color-selected-bg: var(--selected-bg);
  --color-selected-ink: var(--selected-ink);
  --color-selected-icon: var(--selected-icon);
  --color-chip-chosen-bg: var(--chip-chosen-bg);
  --color-chip-chosen-ink: var(--chip-chosen-ink);
  --color-ink-solid: var(--ink-solid);
  --color-on-ink: var(--on-ink);
  --color-focus-ring: var(--focus-ring);
  --color-selection: var(--selection);
  --color-status-live-bg: var(--status-live-bg);
  --color-status-attn-bg: var(--status-attn-bg);
  --color-needs-ground: var(--needs-ground);
  --color-strategy-card-picked: var(--strategy-card-picked);
  --color-status-done-bg: var(--status-done-bg);
  --color-status-fail-bg: var(--status-fail-bg);
  --color-status-idle-bg: var(--status-idle-bg);
  --color-status-live-ink: var(--status-live-ink);
  --color-status-attn-ink: var(--status-attn-ink);
  --color-status-done-ink: var(--status-done-ink);
  --color-status-fail-ink: var(--status-fail-ink);
  --color-status-idle-ink: var(--status-idle-ink);
  --color-status-live-glyph: var(--status-live-glyph);
  --color-status-attn-glyph: var(--status-attn-glyph);
  --color-tab-rim-attn: var(--tab-rim-attn);
  --color-status-done-glyph: var(--status-done-glyph);
  --color-status-fail-glyph: var(--status-fail-glyph);
  --color-status-idle-glyph: var(--status-idle-glyph);
  --color-nest-ink: var(--nest-ink);
  --color-meter-calm: var(--meter-calm);
  --color-meter-calm-track: var(--meter-calm-track);
  --color-meter-near: var(--meter-near);
  --color-meter-near-track: var(--meter-near-track);
  --color-meter-over: var(--meter-over);
  --color-meter-over-track: var(--meter-over-track);
  --color-meter-stale: var(--meter-stale);
  --color-meter-stale-track: var(--meter-stale-track);
  --color-meter-share: var(--meter-share);
  --color-meter-wash-near: var(--meter-wash-near);
  --color-meter-wash-over: var(--meter-wash-over);
  --color-presence-online: var(--presence-online);
  --color-presence-away: var(--presence-away);
  --color-presence-off: var(--presence-off);
  --color-scrollbar-thumb: var(--scrollbar-thumb);
  --color-skeleton-sheen: var(--skeleton-sheen);
  --color-prose-bullet: var(--prose-bullet);
  --color-identity-ink: var(--identity-ink);
  --color-machine-offline: var(--machine-offline);
  --color-data-ok: var(--data-ok);
  --color-data-warn: var(--data-warn);
  --color-data-bad: var(--data-bad);
  --color-diff-add-bg: var(--diff-add-bg);
  --color-diff-del-bg: var(--diff-del-bg);
  --color-diff-add-emphasis: var(--diff-add-emphasis);
  --color-diff-del-emphasis: var(--diff-del-emphasis);
  --color-note-new-ink: var(--note-new-ink);
  --color-note-new-bg: var(--note-new-bg);
  --color-note-improved-ink: var(--note-improved-ink);
  --color-note-improved-bg: var(--note-improved-bg);
  --color-note-fixed-ink: var(--note-fixed-ink);
  --color-note-fixed-bg: var(--note-fixed-bg);
  --color-chart-1: var(--chart-1);
  --color-chart-brand: var(--chart-brand);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-code-ink: var(--code-ink);
  --color-code-keyword: var(--code-keyword);
  --color-code-fn: var(--code-fn);
  --color-code-string: var(--code-string);
  --color-code-number: var(--code-number);
  --color-code-comment: var(--code-comment);
  --color-rail-body: var(--rail-body);
  --color-material-panel: var(--material-panel);
  --color-scrim: var(--scrim);
  --color-image-outline: var(--image-outline);
  --color-shadow-tint: var(--shadow-tint);
  --color-shadow-tint-2: var(--shadow-tint-2);
  --color-shadow-tint-3: var(--shadow-tint-3);
  --color-tab-shade: var(--tab-shade);
  --color-tab-shade-chosen: var(--tab-shade-chosen);
  --color-night-ring: var(--night-ring);

  --shadow-surface-shadow-1: var(--surface-shadow-1);
  --shadow-surface-shadow-2: var(--surface-shadow-2);
  --shadow-surface-shadow-3: var(--surface-shadow-3);
  --shadow-surface-shadow-4: var(--surface-shadow-4);
  --shadow-surface-shadow-5: var(--surface-shadow-5);
  --shadow-surface-shadow-6: var(--surface-shadow-6);
  --shadow-surface-shadow-7: var(--surface-shadow-7);
  --shadow-surface-shadow-8: var(--surface-shadow-8);
  --shadow-action-ring: var(--action-ring);
  --shadow-code-ring: var(--code-ring);
  --shadow-selected-shadow: var(--selected-shadow);

  --drop-shadow-drop: var(--shadow-drop);
  --drop-shadow-drop-near: var(--shadow-drop-near);

  --tracking-wordmark: var(--track-wordmark);
  --tracking-display: var(--track-display);
  --tracking-title: var(--track-title);
  --tracking-caps: var(--track-caps);
  --tracking-widest: var(--track-widest);

  --font-weight-normal: var(--weight-body);
  --font-weight-medium: var(--weight-strong);

  --spacing-space-1: var(--space-1);
  --spacing-space-2: var(--space-2);
  --spacing-space-3: var(--space-3);
  --spacing-space-4: var(--space-4);
  --spacing-space-5: var(--space-5);
  --spacing-space-6: var(--space-6);
  --spacing-space-7: var(--space-7);
  --spacing-space-8: var(--space-8);
  --spacing-space-group: var(--space-group);
  --spacing-space-row: var(--space-row);
  --spacing-c-btn-h: var(--c-btn-h);
  --spacing-c-btn-h-sm: var(--c-btn-h-sm);
  --spacing-c-btn-h-xs: var(--c-btn-h-xs);
  --spacing-c-btn-h-lg: var(--c-btn-h-lg);
  --spacing-c-input-h: var(--c-input-h);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-nav-h: var(--c-nav-h);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-rail-row-h: var(--c-rail-row-h);
  --spacing-c-artifact-row-h: var(--c-artifact-row-h);
  --spacing-c-pin: var(--c-pin);
  --spacing-c-pin-pad: var(--c-pin-pad);
  --spacing-c-pin-gone-ring: var(--c-pin-gone-ring);
  --spacing-c-comments-w: var(--c-comments-w);
  --spacing-c-pin-card-w: var(--c-pin-card-w);
  --spacing-c-pin-card-reading-w: var(--c-pin-card-reading-w);
  --spacing-c-target-stroke: var(--c-target-stroke);
  --spacing-c-target-gap: var(--c-target-gap);
  --spacing-c-sheet-inspector-w: var(--c-sheet-inspector-w);
  --spacing-c-sheet-inspector-max-h: var(--c-sheet-inspector-max-h);
  --spacing-c-sheet-inspector-head-h: var(--c-sheet-inspector-head-h);
  --spacing-c-canvas-skeleton-w: var(--c-canvas-skeleton-w);
  --spacing-c-canvas-skeleton-h: var(--c-canvas-skeleton-h);
  --spacing-c-graph-edge: var(--c-graph-edge);
  --spacing-c-map-node-w: var(--c-map-node-w);
  --spacing-c-pin-list-min: var(--c-pin-list-min);
  --spacing-c-pin-list-max: var(--c-pin-list-max);
  --spacing-c-review-words: var(--c-review-words);
  --spacing-c-mark: var(--c-mark);
  --spacing-c-mark-glyph: var(--c-mark-glyph);
  --spacing-c-row-mark: var(--c-row-mark);
  --spacing-c-pill-h: var(--c-pill-h);
  --spacing-c-pill-gap: var(--c-pill-gap);
  --spacing-c-pill-fs: var(--c-pill-fs);
  --spacing-c-badge-h: var(--c-badge-h);
  --spacing-c-stat-h: var(--c-stat-h);
  --spacing-c-stat-well-pad: var(--c-stat-well-pad);
  --spacing-c-toolbar-zone: var(--c-toolbar-zone);
  --spacing-c-toolbar-ctl: var(--c-toolbar-ctl);
  --spacing-c-find-w: var(--c-find-w);
  --spacing-c-new-session-pop-w: var(--c-new-session-pop-w);
  --spacing-c-step-rail-x: var(--c-step-rail-x);
  --spacing-c-step-rail-top: var(--c-step-rail-top);
  --spacing-c-step-rail-gap: var(--c-step-rail-gap);
  --spacing-c-connect-w: var(--c-connect-w);
  --spacing-c-panel-w: var(--c-panel-w);
  --spacing-c-signin-pop-w: var(--c-signin-pop-w);
  --spacing-c-caw-panel-h: var(--c-caw-panel-h);
  --spacing-c-top-bar-h: var(--c-top-bar-h);
  --spacing-c-bar-toggle-glyph: var(--c-bar-toggle-glyph);
  --spacing-c-bar-phone-edge: var(--c-bar-phone-edge);
  --spacing-c-side-divider-hit: var(--c-side-divider-hit);
  --spacing-c-corner-grip-leg: var(--c-corner-grip-leg);
  --spacing-c-corner-grip-inset: var(--c-corner-grip-inset);
  --spacing-c-corner-grip-stroke: var(--c-corner-grip-stroke);
  --spacing-c-bar-phone-gap: var(--c-bar-phone-gap);
  --spacing-c-edge-pull: var(--c-edge-pull);
  --spacing-c-tab-lead: var(--c-tab-lead);
  --spacing-c-tab-row-h: var(--c-tab-row-h);
  --spacing-c-head-fade: var(--c-head-fade);
  --spacing-c-head-fade-blur: var(--c-head-fade-blur);
  --spacing-c-recall-cross-blur: var(--c-recall-cross-blur);
  --spacing-c-deck-peek: var(--c-deck-peek);
  --spacing-c-tab-max-w: var(--c-tab-max-w);
  --spacing-c-bar-group-pad: var(--c-bar-group-pad);
  --spacing-c-bar-item: var(--c-bar-item);
  --spacing-c-bar-symbol: var(--c-bar-symbol);
  --spacing-c-bar-caw-glass-phone: var(--c-bar-caw-glass-phone);
  --spacing-c-bar-caw-head-phone: var(--c-bar-caw-head-phone);
  --spacing-c-caw-ring: var(--c-caw-ring);
  --spacing-c-page-head-h: var(--c-page-head-h);
  --spacing-c-sidebar-w: var(--c-sidebar-w);
  --spacing-c-composer-field: var(--c-composer-field);
  --spacing-c-composer-inset: var(--c-composer-inset);
  --spacing-c-inset-composer: var(--c-inset-composer);
  --spacing-c-floating-pad: var(--c-floating-pad);
  --spacing-c-inset-floating: var(--c-inset-floating);
  --spacing-c-composer-panel: var(--c-composer-panel);
  --spacing-c-new-project-field-w: var(--c-new-project-field-w);
  --spacing-c-composer-w: var(--c-composer-w);
  --spacing-c-suggest-chip: var(--c-suggest-chip);
  --spacing-c-suggest-row: var(--c-suggest-row);
  --spacing-c-suggest-room: var(--c-suggest-room);
  --spacing-c-starter-w: var(--c-starter-w);
  --spacing-c-starter-h: var(--c-starter-h);
  --spacing-c-starters-w: var(--c-starters-w);
  --spacing-c-row-lead: var(--c-row-lead);
  --spacing-c-section-head-h: var(--c-section-head-h);
  --spacing-c-row-inset: var(--c-row-inset);
  --spacing-c-row-h: var(--c-row-h);
  --spacing-c-routine-time-w: var(--c-routine-time-w);
  --spacing-c-grid-4: var(--c-grid-4);
  --spacing-c-grid-2: var(--c-grid-2);
  --spacing-c-block-routines: var(--c-block-routines);
  --spacing-c-block-ledger: var(--c-block-ledger);
  --spacing-c-block-view: var(--c-block-view);
  --spacing-c-block-body-max: var(--c-block-body-max);
  --spacing-c-block-drop-line: var(--c-block-drop-line);
  --spacing-c-block-drop-dot: var(--c-block-drop-dot);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-tray-chip: var(--c-tray-chip);
  --spacing-c-inline-chip-line: var(--c-inline-chip-line);
  --spacing-c-inline-chip-pad: var(--c-inline-chip-pad);
  --spacing-c-inline-chip-max-w: var(--c-inline-chip-max-w);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-peek-glyph: var(--c-peek-glyph);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-tray-gap: var(--c-tray-gap);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-tray-row: var(--c-tray-row);
  --spacing-c-tray-chip-min: var(--c-tray-chip-min);
  --spacing-c-tray-chip-max: var(--c-tray-chip-max);
  --spacing-icon-sm: var(--icon-sm);
  --spacing-icon-md: var(--icon-md);
  --spacing-icon-lg: var(--icon-lg);
  --spacing-c-change-ring-width: var(--c-change-ring-width);
  --spacing-c-change-ring-offset: var(--c-change-ring-offset);
  --spacing-c-change-ping-spread: var(--c-change-ping-spread);
  --spacing-c-segmented-pad: var(--c-segmented-pad);
  --spacing-c-segment-gap: var(--c-segment-gap);
  --spacing-c-segment-pad-x: var(--c-segment-pad-x);
  --spacing-c-tab-item: var(--c-tab-item);
  --spacing-c-tab-px: var(--c-tab-px);
  --spacing-c-tab-slope-start: var(--c-tab-slope-start);
  --spacing-c-tab-slope-end: var(--c-tab-slope-end);
  --spacing-c-measure: var(--c-measure);
  --spacing-c-measure-short: var(--c-measure-short);
  --spacing-c-measure-meta: var(--c-measure-meta);
  --spacing-c-count-digit: var(--c-count-digit);
  --spacing-c-rail-count-min: var(--c-rail-count-min);
  --spacing-c-skeleton-x-height: var(--c-skeleton-x-height);
  --spacing-c-code-chip-pad-x: var(--c-code-chip-pad-x);
  --spacing-c-skeleton-age: var(--c-skeleton-age);
  --spacing-c-textarea-max-h: var(--c-textarea-max-h);
  --spacing-c-number-field-w: var(--c-number-field-w);
  --spacing-c-port-field-w: var(--c-port-field-w);
  --spacing-c-btn-min-w: var(--c-btn-min-w);
  --spacing-c-btn-gap: var(--c-btn-gap);
  --spacing-c-btn-words-blur: var(--c-btn-words-blur);
  --spacing-c-pointer-floor: var(--c-pointer-floor);
  --spacing-c-touch-floor: var(--c-touch-floor);
  --spacing-c-screen-margin: var(--c-screen-margin);
  --spacing-c-pop-w: var(--c-pop-w);
  --spacing-c-pop-max-h: var(--c-pop-max-h);
  --spacing-c-pop-max-h-phone: var(--c-pop-max-h-phone);
  --spacing-c-tip-max-w: var(--c-tip-max-w);
  --spacing-c-scrollbar-thin: var(--c-scrollbar-thin);
  --spacing-c-edge-fade-len: var(--c-edge-fade-len);
  --spacing-c-edge-fade-len-phone: var(--c-edge-fade-len-phone);
  /* Switches with its context: no literal maps to it. */
  --spacing-c-menu-item-h: var(--c-menu-item-h);
  --spacing-c-icon-card-min: var(--c-icon-card-min);
  --spacing-c-sheet-max-h: var(--c-sheet-max-h);
  --spacing-c-peek-sheet-h: var(--c-peek-sheet-h);
  --spacing-c-peek-sheet-w: var(--c-peek-sheet-w);
  --spacing-c-grabber-w: var(--c-grabber-w);
  --spacing-c-grabber-h: var(--c-grabber-h);
  --spacing-c-lightbox-sheet-w: var(--c-lightbox-sheet-w);
  --spacing-c-lightbox-sheet-max-h: var(--c-lightbox-sheet-max-h);
  --spacing-c-report-text-max: var(--c-report-text-max);
  --spacing-c-config-max-w: var(--c-config-max-w);
  --spacing-c-config-rail-w: var(--c-config-rail-w);
  --spacing-c-row-h-two: var(--c-row-h-two);
  --spacing-c-detail-max: var(--c-detail-max);
  --spacing-c-output-max: var(--c-output-max);
  --spacing-c-editor-well-min: var(--c-editor-well-min);
  --spacing-c-choice-list-max-h: var(--c-choice-list-max-h);
  --spacing-c-setup-rail-w: var(--c-setup-rail-w);
  --spacing-c-setup-machine-name-w: var(--c-setup-machine-name-w);
  --spacing-c-setup-code-basis: var(--c-setup-code-basis);
  --spacing-c-setup-nickname-w: var(--c-setup-nickname-w);
  --spacing-c-setup-preview-w: var(--c-setup-preview-w);
  --spacing-c-drag-dots-w: var(--c-drag-dots-w);
  --spacing-c-drag-dots-tile: var(--c-drag-dots-tile);
  --spacing-c-drag-dots-edge: var(--c-drag-dots-edge);
  --spacing-c-block-refused-basis: var(--c-block-refused-basis);
  --spacing-c-canvas-grab-w: var(--c-canvas-grab-w);
  --spacing-c-decision-head-what: var(--c-decision-head-what);
  --spacing-c-decision-graph-min-h: var(--c-decision-graph-min-h);
  --spacing-c-decision-node-w: var(--c-decision-node-w);
  --spacing-c-decision-node-h: var(--c-decision-node-h);
  --spacing-c-decision-page-w: var(--c-decision-page-w);
  --spacing-c-decision-meter-w: var(--c-decision-meter-w);
  --spacing-c-decision-option-min: var(--c-decision-option-min);
  --spacing-c-media-max-h: var(--c-media-max-h);
  --spacing-c-artifact-card-min: var(--c-artifact-card-min);
  --spacing-c-work-tabs-roomy-w: var(--c-work-tabs-roomy-w);
  --spacing-c-work-tabs-squeeze: var(--c-work-tabs-squeeze);
  --spacing-c-caw-list-h: var(--c-caw-list-h);
  --spacing-c-caw-list-clear: var(--c-caw-list-clear);
  --spacing-c-caw-list-clear-phone: var(--c-caw-list-clear-phone);
  --spacing-c-lead-card-w: var(--c-lead-card-w);
  --spacing-c-lead-card-max-h: var(--c-lead-card-max-h);
  --spacing-c-move-wait-col-w: var(--c-move-wait-col-w);
  --spacing-c-move-wait-caw-h: var(--c-move-wait-caw-h);
  --spacing-c-move-wait-caw-h-phone: var(--c-move-wait-caw-h-phone);
  --spacing-c-move-wait-file-bar-w: var(--c-move-wait-file-bar-w);
  --spacing-c-machines-w: var(--c-machines-w);
  --spacing-c-find-row-h: var(--c-find-row-h);
  --spacing-c-find-row-h-phone: var(--c-find-row-h-phone);
  --spacing-c-find-line-h: var(--c-find-line-h);
  --spacing-c-find-phone-h: var(--c-find-phone-h);
  --spacing-c-find-head-h: var(--c-find-head-h);
  --spacing-c-find-skeleton-tall: var(--c-find-skeleton-tall);
  --spacing-c-head-who-basis: var(--c-head-who-basis);
  --spacing-c-project-details-measure: var(--c-project-details-measure);
  --spacing-c-project-details-label-w: var(--c-project-details-label-w);
  --spacing-c-project-details-select-w: var(--c-project-details-select-w);
  --spacing-c-ledger-when-w: var(--c-ledger-when-w);
  --spacing-c-ledger-when-w-narrow: var(--c-ledger-when-w-narrow);
  --spacing-c-ledger-outcome-w: var(--c-ledger-outcome-w);
  --spacing-c-ledger-outcome-w-narrow: var(--c-ledger-outcome-w-narrow);
  --spacing-c-ledger-took-w: var(--c-ledger-took-w);
  --spacing-c-ledger-band-h: var(--c-ledger-band-h);
  --spacing-c-ledger-row-h: var(--c-ledger-row-h);
  --spacing-c-ledger-count-w: var(--c-ledger-count-w);
  --spacing-c-ledger-usd-w: var(--c-ledger-usd-w);
  --spacing-c-matrix-col-w: var(--c-matrix-col-w);
  --spacing-c-ledger-title-min: var(--c-ledger-title-min);
  --spacing-c-side-grip-w: var(--c-side-grip-w);
  --spacing-c-side-surface-min: var(--c-side-surface-min);
  --spacing-c-effort-track-h-phone: var(--c-effort-track-h-phone);
  --spacing-c-model-list-h: var(--c-model-list-h);
  --spacing-c-model-row-basis: var(--c-model-row-basis);
  --spacing-c-folder-list-max-h: var(--c-folder-list-max-h);
  --spacing-c-prompt-grown-h: var(--c-prompt-grown-h);
  --spacing-c-page-column-w: var(--c-page-column-w);
  --spacing-c-page-line: var(--c-page-line);
  --spacing-c-hover-panel-room: var(--c-hover-panel-room);
  --spacing-c-status-mark: var(--c-status-mark);
  --spacing-c-inventory-text-basis: var(--c-inventory-text-basis);
  --spacing-c-empty-fleet-caw: var(--c-empty-fleet-caw);
  --spacing-c-stat-min: var(--c-stat-min);
  --spacing-c-view-lead-min: var(--c-view-lead-min);
  --spacing-c-bulk-labels-max-h: var(--c-bulk-labels-max-h);
  --spacing-c-post-media-max-h: var(--c-post-media-max-h);
  --spacing-c-board-col-min: var(--c-board-col-min);
  --spacing-c-board-col-max: var(--c-board-col-max);
  --spacing-c-task-key-w: var(--c-task-key-w);
  --spacing-c-filter-label-w: var(--c-filter-label-w);
  --spacing-c-task-label-field-w: var(--c-task-label-field-w);
  --spacing-c-task-args-max-h: var(--c-task-args-max-h);
  --spacing-c-task-output-compact-h: var(--c-task-output-compact-h);
  --spacing-c-task-output-image-h: var(--c-task-output-image-h);
  --spacing-c-task-output-video-h: var(--c-task-output-video-h);
  --spacing-c-task-stage-skeleton-w: var(--c-task-stage-skeleton-w);
  --spacing-c-task-edge-label-w: var(--c-task-edge-label-w);
  --spacing-c-task-candidates-max-h: var(--c-task-candidates-max-h);
  --spacing-c-task-col-id-w: var(--c-task-col-id-w);
  --spacing-c-task-col-stage-w: var(--c-task-col-stage-w);
  --spacing-c-task-col-labels-w: var(--c-task-col-labels-w);
  --spacing-c-task-col-todos-w: var(--c-task-col-todos-w);
  --spacing-c-task-col-time-w: var(--c-task-col-time-w);
  --spacing-c-stop-tray-status-w: var(--c-stop-tray-status-w);
  --spacing-c-stop-tray-trail-w: var(--c-stop-tray-trail-w);
  --spacing-c-tree-mark-hole-edge: var(--c-tree-mark-hole-edge);
  --spacing-c-tree-mark-num-w: var(--c-tree-mark-num-w);
  --spacing-c-usage-cap-lh: var(--c-usage-cap-lh);
  --spacing-c-usage-strip-row: var(--c-usage-strip-row);
  --spacing-c-usage-strip-home-h: var(--c-usage-strip-home-h);
  --spacing-c-usage-pct-w: var(--c-usage-pct-w);
  --spacing-c-filed-task-w: var(--c-filed-task-w);
  --spacing-c-atts-max-h: var(--c-atts-max-h);
  --spacing-c-compaction-word-bleed: var(--c-compaction-word-bleed);
  --spacing-c-give-way-min: var(--c-give-way-min);
  --spacing-c-elapsed-w: var(--c-elapsed-w);
  --spacing-c-composer-more-w: var(--c-composer-more-w);
  --spacing-c-composer-menu-max-h: var(--c-composer-menu-max-h);
  --spacing-c-ask-value-max-h: var(--c-ask-value-max-h);
  --spacing-c-offer-line: var(--c-offer-line);
  --spacing-c-suggest-shimmer-w: var(--c-suggest-shimmer-w);
  --spacing-c-turn-clock-w: var(--c-turn-clock-w);
  --spacing-c-update-said-h: var(--c-update-said-h);
  --spacing-c-usage-plot: var(--c-usage-plot);
  --spacing-c-limit-bar: var(--c-limit-bar);
  --spacing-c-usage-tile-min: var(--c-usage-tile-min);
  --spacing-c-stat-tile-min: var(--c-stat-tile-min);
  --spacing-c-rings-key-label-w: var(--c-rings-key-label-w);
  --spacing-c-rings-key-value-w: var(--c-rings-key-value-w);
  --spacing-c-mark-dot: var(--c-mark-dot);
  --spacing-c-usage-figure-w: var(--c-usage-figure-w);
  --spacing-c-meter-bar-h: var(--c-meter-bar-h);
  --spacing-c-dialog-max-h: var(--c-dialog-max-h);
  --spacing-c-dialog-close-clear: var(--c-dialog-close-clear);
  --spacing-c-dialog-document-w: var(--c-dialog-document-w);
  --spacing-c-tool-well-max-h: var(--c-tool-well-max-h);
  --spacing-c-completer-max-h: var(--c-completer-max-h);
  --spacing-c-key-field-basis: var(--c-key-field-basis);
  --spacing-c-key-field-max: var(--c-key-field-max);
  --spacing-c-bench-phone-w: var(--c-bench-phone-w);
  --spacing-c-bench-phone-h: var(--c-bench-phone-h);
  --spacing-c-bench-controls-w: var(--c-bench-controls-w);
  --spacing-c-bench-stage: var(--c-bench-stage);
  --spacing-c-bench-side-w: var(--c-bench-side-w);
  --spacing-c-bench-side-h: var(--c-bench-side-h);
  --spacing-c-bench-field-w: var(--c-bench-field-w);
  --spacing-c-bench-readout-w: var(--c-bench-readout-w);
  --spacing-c-side-bench-h: var(--c-side-bench-h);
  --spacing-c-rail-sheet-w: var(--c-rail-sheet-w);
  --spacing-c-session-hover-head: var(--c-session-hover-head);
  --spacing-c-session-hover-room: var(--c-session-hover-room);
  --spacing-c-trail-col: var(--c-trail-col);
  --spacing-c-foot-fade: var(--c-foot-fade);
  --spacing-c-doc-max: var(--c-doc-max);
  --spacing-c-tray-more-w: var(--c-tray-more-w);
  --spacing-c-made-tile-min: var(--c-made-tile-min);
  --spacing-c-canvas-min-h: var(--c-canvas-min-h);
  --spacing-c-deck-gap: var(--c-deck-gap);
  --spacing-c-new-project-w: var(--c-new-project-w);
  --spacing-c-address-tray-w: var(--c-address-tray-w);
  --spacing-c-address-caw: var(--c-address-caw);
  --spacing-c-address-caw-title: var(--c-address-caw-title);
  --spacing-c-address-qr: var(--c-address-qr);
  --spacing-c-address-raw-h: var(--c-address-raw-h);
  --spacing-c-address-phone-h: var(--c-address-phone-h);
  --spacing-c-caw-hero: var(--c-caw-hero);
  --spacing-c-context-bar-min: var(--c-context-bar-min);
  --spacing-c-context-bar-max: var(--c-context-bar-max);
  --spacing-c-model-list-max: var(--c-model-list-max);
  --spacing-c-tab-strip-fade: var(--c-tab-strip-fade);
  --spacing-c-tab-strip-uncapped: var(--c-tab-strip-uncapped);
  --spacing-c-details-card-w: var(--c-details-card-w);
  --spacing-c-details-card-max-h: var(--c-details-card-max-h);
  --spacing-c-tab-menu-min: var(--c-tab-menu-min);
  --spacing-c-new-task-w: var(--c-new-task-w);
  --spacing-c-draft-line: var(--c-draft-line);
  --spacing-c-skeleton-card-h: var(--c-skeleton-card-h);
  --spacing-c-offer-text-basis: var(--c-offer-text-basis);

  --radius-well-r: var(--well-r);
  --radius-row-mark: var(--row-mark-r);
  --radius-tab-icon: var(--tab-icon-r);
  --radius-glide-row: var(--glide-row-r);
  --radius-inner-well: var(--inner-well-r);

  --duration-stagger: var(--dur-stagger);
  --duration-cascade: var(--dur-cascade);
  --duration-ghost: var(--dur-ghost);
  --duration-control: var(--dur-control);
  --duration-menu: var(--dur-menu);
  --duration-peek: var(--dur-peek);
  --duration-toggle: var(--dur-toggle);
  --duration-exit: var(--dur-exit);
  --duration-morph: var(--dur-morph);
  --duration-rail: var(--dur-rail);
  --duration-fade: var(--dur-fade);
  --duration-mark-hold: var(--dur-mark-hold);
  --duration-wait-grace: var(--dur-wait-grace);
  --duration-pop: var(--dur-pop);
  --duration-panel: var(--dur-panel);
  --duration-pick-up: var(--dur-pick-up);
  --duration-grow: var(--dur-grow);
  --duration-grow-exit: var(--dur-grow-exit);
  --duration-lift: var(--dur-lift);
  --duration-press-hold: var(--dur-press-hold);
  --duration-settle: var(--dur-settle);
  --duration-reveal: var(--dur-reveal);
  --duration-hold: var(--dur-hold);
  --duration-loop: var(--dur-loop);
  --duration-skeleton-pulse: var(--dur-skeleton-pulse);
  --duration-skeleton-reveal: var(--dur-skeleton-reveal);
  --duration-c-500: var(--c-500);
  --duration-breath: var(--breath);

  --font-weight-brand: 600;

  --default-font-family: var(--font-body);
  --default-mono-font-family: var(--font-mono);
  --default-transition-duration: var(--dur-control);
  --default-transition-timing-function: var(--ease-out);
  --animate-spin: spin var(--dur-loop) linear infinite;
  --animate-pulse: pulse var(--dur-loop) var(--ease-in-out) infinite;
  --animate-ping: ping var(--dur-loop) var(--ease-out) infinite;
  --animate-breath: breath var(--breath) var(--ease-in-out) infinite;
  --animate-kit-fade-out: kit-fade-out var(--dur-exit) var(--ease-out) both;
  --animate-kit-tip-fade: kit-tip-fade var(--dur-menu) var(--ease-out);
  --animate-thinking-step-in: kit-fade-in var(--dur-menu) var(--ease-out)
    backwards;
  --animate-sheet-fade-in: kit-fade-in var(--dur-control) var(--ease-out);
  --animate-sheet-fade-out: kit-fade-out var(--dur-control) var(--ease-out)
    forwards;
  --animate-wait-grace-in: kit-fade-in var(--dur-fade) var(--ease-out)
    var(--dur-wait-grace) both;
  --animate-wait-grace-show: kit-fade-in 1ms var(--dur-wait-grace) both;
  --animate-check-in: kit-fade-in var(--dur-toggle) var(--ease-out) both;
  --animate-check-draw: check-draw var(--dur-toggle) var(--ease-out) both;
  --animate-rail-label-in: rail-label-in var(--dur-exit) var(--ease-out) both;
  --animate-thinking-word: thinking-word calc(var(--breath) * 8) var(--ease-out)
    var(--word-delay, 0s) infinite both;
  --animate-thinking-circle: thinking-circle calc(var(--breath) * 3)
    var(--ease-in-out) infinite both;
  --animate-thinking-lemniscate: thinking-lemniscate calc(var(--breath) * 3)
    var(--ease-in-out) infinite both;
  --animate-thinking-sheen: thinking-sheen var(--breath) var(--ease-in-out)
    infinite;
  --animate-thinking-sheen-hold: thinking-sheen-hold var(--breath)
    var(--ease-in-out) infinite;
  --animate-step-shimmer: step-shimmer var(--breath) var(--ease-in-out) infinite;
  --animate-row-flash: row-flash calc(var(--dur-fade) * 3) var(--ease-out) both;
  --animate-mention-tip-in: mention-tip-in var(--dur-menu) var(--ease-out);
  --animate-mark-in: mark-in var(--dur-pop) var(--ease-out) both;
  --animate-sheet-in: sheet-in var(--dur-panel) var(--ease-drawer);
  --animate-sheet-out: sheet-out var(--dur-exit) var(--ease-drawer) forwards;
  --animate-ns-sec: ns-in var(--dur-pop) var(--ease-out) var(--delay, 0ms)
    backwards;
  --animate-ns-in: ns-in var(--ns-row-ms) var(--ease-out) backwards;
  --animate-ns-check: ns-check var(--ns-check-ms) var(--ease-out) both;
  --animate-ns-panel: ns-panel var(--dur-fade) var(--ease-out) both;
  --animate-ns-pop-in: ns-pop-in var(--dur-pop) var(--ease-drawer) both;
  --animate-ns-pop-out: ns-pop-out var(--dur-exit) var(--ease-out) both;
  --animate-filed-fade: kit-fade-in var(--dur-pop) var(--ease-out)
    var(--arrive-delay, 0ms) backwards;
  --animate-filed-rise: rise-in var(--dur-pop) var(--ease-out)
    var(--arrive-delay, 0ms) backwards;
  --animate-offer-settle: rise-in calc(var(--dur-control) * 2) var(--ease-out)
    backwards;
  --animate-face-out: kit-fade-out var(--dur-exit) var(--ease-out) forwards;
  --animate-face-in: kit-fade-in var(--dur-menu) var(--ease-out) backwards;
  --animate-wave-arrive: wave-draw var(--dur-pop) var(--ease-out)
    calc(var(--dur-rail) + var(--lead)) backwards;
  --animate-wave-draw: wave-draw var(--dur-pop) var(--ease-out) backwards;
  --animate-wave-breathe:
    wave-breath-draw calc(var(--breath) * 2) var(--ease-out) infinite,
    wave-breath-fade calc(var(--breath) * 2) var(--ease-in-out) infinite;
  --animate-icon-swap: icon-swap var(--dur-control) var(--ease-out) both;
  --animate-icon-swap-still: icon-swap-still var(--dur-control) var(--ease-out)
    both;
  --animate-cell-swap: cell-swap var(--dur-control) var(--ease-out);
  --animate-cell-fade: kit-fade-in var(--dur-control) var(--ease-out);
  --animate-arrive: kit-fade-in var(--dur-menu) var(--ease-out) both;
  --animate-arrive-late: kit-fade-in var(--dur-menu) var(--ease-out)
    var(--dur-control) both;
  --animate-finish: finish calc(var(--dur-fade) * 2) var(--ease-out);
  --animate-attn-echo: ping var(--dur-loop) var(--ease-out) 3 forwards;
  --animate-head-fade: head-fade linear both;
  --animate-dialog-in: kit-dialog-in var(--dur-panel) var(--ease-out) both;
  --animate-dialog-out: kit-dialog-out var(--dur-exit) var(--ease-out) both;
  --animate-scrim-in: kit-fade-in var(--dur-panel) var(--ease-out) both;
  --animate-tip-fade: kit-tip-fade var(--dur-fade) var(--ease-out) both;
  --animate-tip-in: kit-tip-in var(--dur-fade) var(--ease-out) both;
  --animate-skeleton-pulse: kit-skeleton-pulse var(--dur-skeleton-pulse)
    var(--ease-crossfade) infinite;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
  @keyframes check-draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes thinking-word {
    0% {
      opacity: 0;
      transform: translateY(80%);
    }
    1.5%,
    25% {
      opacity: 1;
      transform: translateY(0);
    }
    26%,
    100% {
      opacity: 0;
      transform: translateY(-80%);
    }
  }
  @keyframes thinking-circle {
    0%,
    50%,
    100% {
      opacity: 1;
      transform: none;
    }
    25%,
    75% {
      opacity: 0;
      transform: scale(1.15, 0.8);
    }
  }
  @keyframes thinking-lemniscate {
    0%,
    50%,
    100% {
      opacity: 0;
      transform: scale(0.7, 1.1);
    }
    25%,
    75% {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes thinking-sheen {
    to {
      transform: translateX(-66.6667%);
    }
  }
  @keyframes thinking-sheen-hold {
    to {
      transform: translateX(200%);
    }
  }
  @keyframes step-shimmer {
    from {
      background-position: 0% 0;
    }
    to {
      background-position: 100% 0;
    }
  }
  @keyframes row-flash {
    from {
      opacity: 0.35;
    }
  }
  @keyframes mention-tip-in {
    from {
      opacity: 0;
      scale: var(--press-scale);
    }
  }
  @keyframes mark-in {
    from {
      opacity: 0;
      scale: 0.25;
      filter: blur(var(--space-1));
    }
  }
  @keyframes icon-swap {
    from {
      opacity: 0;
      transform: scale(0.25);
      filter: blur(var(--space-1));
    }
  }
  @keyframes icon-swap-still {
    from {
      opacity: 0;
    }
  }
  @keyframes sheet-in {
    from {
      transform: var(--sheet-away);
    }
  }
  @keyframes sheet-out {
    to {
      transform: var(--sheet-away);
    }
  }
  @keyframes ns-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes ns-check {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes ns-panel {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes ns-pop-out {
    to {
      opacity: 0;
      scale: var(--pop-scale);
    }
  }
  @keyframes ns-pop-in {
    from {
      opacity: 0;
      scale: var(--pop-scale);
      translate: 0 calc(-1 * var(--pop-rise));
    }
  }
  @keyframes rise-in {
    from {
      opacity: 0;
      translate: 0 var(--pop-rise);
    }
  }
  @keyframes wave-draw {
    from {
      stroke-dashoffset: var(--run);
    }
  }
  @keyframes wave-breath-draw {
    0% {
      stroke-dashoffset: var(--run);
    }
    50%,
    100% {
      stroke-dashoffset: 0;
    }
  }
  @keyframes wave-breath-fade {
    0%,
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @keyframes cell-swap {
    from {
      opacity: 0;
      scale: var(--pop-scale);
    }
  }
  @keyframes finish {
    35% {
      background-color: var(--status-done-bg);
    }
  }
  @keyframes head-fade {
    to {
      opacity: 1;
    }
  }
  @keyframes kit-dialog-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @keyframes kit-dialog-out {
    to {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @keyframes kit-tip-in {
    from {
      opacity: 0;
      translate: var(--kit-tip-from);
    }
  }
  @keyframes kit-skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: var(--skeleton-pulse-floor);
    }
  }
}

@theme inline reference {
  --shadow-xs: var(--shadow-xs);
  --shadow-tile: var(--shadow-tile);
  --shadow-raised: var(--shadow-raised);
  --shadow-hairline: var(--shadow-hairline);
  --shadow-stat: var(--shadow-stat);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-overlay: var(--shadow-overlay);
  --shadow-overlay-hung: var(--shadow-overlay-hung);
  --shadow-modal: var(--shadow-modal);
  --shadow-drawer: var(--shadow-drawer);
  --shadow-tab-start: var(--shadow-tab-start);
  --shadow-tab-end: var(--shadow-tab-end);
  --shadow-tab-start-chosen: var(--shadow-tab-start-chosen);
  --shadow-tab-end-chosen: var(--shadow-tab-end-chosen);
  --shadow-inset-sel: var(--shadow-inset-sel);
  --shadow-knob: var(--shadow-knob);

  --font-wordmark: var(--font-wordmark);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
  --font-display: var(--font-display);

  --leading-meta: var(--leading-meta);
  --leading-label: var(--leading-label);
  --leading-tight: var(--leading-tight);
  --leading-ui: var(--leading-ui);
  --leading-body: var(--leading-body);
  --leading-prose: var(--leading-prose);
  --leading-code: var(--leading-code);
  --leading-kpi: var(--leading-kpi);
  --leading-root: var(--leading-root);
  --leading-prose-sm: var(--leading-prose-sm);
  --leading-relaxed: var(--leading-relaxed);

  --radius-hair: var(--radius-hair);
  --radius-xs: var(--radius-xs);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-well: var(--radius-well);
  --radius-panel: var(--radius-panel);
  --radius-modal: var(--radius-modal);
  --radius-pill: var(--radius-pill);

  --ease-out: var(--ease-out);
  --ease-in-out: var(--ease-in-out);
  --ease-drawer: var(--ease-drawer);
  --ease-crossfade: var(--ease-crossfade);
  --ease-arrive: var(--ease-arrive);
  --ease-figure: var(--ease-figure);
  --ease-glide-in: var(--ease-glide-in);
  --ease-glide-out: var(--ease-glide-out);
}

@utility bg-mark-overlay {
  background-image: var(--mark-overlay);
}

@utility bg-action-surface {
  background-image: var(--action-surface);
}

@utility bg-action-surface-hover {
  background-image: var(--action-surface-hover);
}

@utility bg-rail {
  background-image: var(--rail);
}

@utility bg-head-tint-ramp {
  background-image: var(--head-tint-ramp);
}

@utility type-meta {
  --tw-sort: vertical-align;
  font: var(--type-meta);
}

@utility type-label {
  --tw-sort: vertical-align;
  font: var(--type-label);
}

@utility type-body {
  --tw-sort: vertical-align;
  font: var(--type-body);
}

@utility type-prose {
  --tw-sort: vertical-align;
  font: var(--type-prose);
}

@utility type-button {
  --tw-sort: vertical-align;
  font: var(--type-button);
}

@utility type-title {
  --tw-sort: vertical-align;
  font: var(--type-title);
}

@utility type-kpi {
  --tw-sort: vertical-align;
  font: var(--type-kpi);
  font-variant-numeric: tabular-nums;
}

@utility type-code {
  --tw-sort: vertical-align;
  font: var(--type-code);
}

@utility type-caps {
  --tw-sort: vertical-align;
  font: var(--type-caps);
}

@utility text-size-meta {
  font-size: var(--text-meta);
}

@utility text-size-label {
  font-size: var(--text-label);
}

@utility text-size-body {
  font-size: var(--text-body);
}

@utility text-size-code {
  font-size: var(--text-code);
}

@utility text-size-title {
  font-size: var(--text-title);
}

@utility text-size-kpi {
  font-size: var(--text-kpi);
}

@utility text-size-display {
  font-size: var(--text-display);
}

@utility text-size-field-floor {
  font-size: var(--text-field-floor);
}

@utility text-meta {
  font-size: var(--text-meta);
  line-height: var(--tw-leading, var(--leading-meta));
  font-weight: var(--tw-font-weight, var(--weight-body));
}

@utility text-label {
  font-size: var(--text-label);
  line-height: var(--tw-leading, var(--leading-label));
  font-weight: var(--tw-font-weight, var(--weight-strong));
}

@utility text-body {
  font-size: var(--text-body);
  line-height: var(--tw-leading, var(--leading-body));
  font-weight: var(--tw-font-weight, var(--weight-body));
}

@utility text-title {
  font-size: var(--text-title);
  line-height: var(--tw-leading, var(--leading-ui));
  letter-spacing: var(--tw-tracking, var(--track-title));
  font-weight: var(--tw-font-weight, var(--weight-strong));
}

@utility text-kpi {
  font-size: var(--text-kpi);
  line-height: var(--tw-leading, var(--leading-kpi));
  font-weight: var(--tw-font-weight, var(--weight-strong));
}

@utility transition-control {
  transition: var(--transition-control);
}

@utility transition-fade-show {
  transition: var(--transition-fade-show);
}

@utility transition-fade-hide {
  transition: var(--transition-fade-hide);
}

@utility transition-exit-show {
  transition: var(--transition-exit-show);
}

@utility transition-exit-hide {
  transition: var(--transition-exit-hide);
}

@utility transition-fade-blur {
  transition: var(--transition-fade-blur);
}

@utility transition-fade-slide-blur {
  transition: var(--transition-fade-slide-blur);
}

@utility transition-tint-press {
  transition: var(--transition-tint-press);
}

@utility transition-control-press {
  transition: var(--transition-control-press);
}

@utility transition-control-slide {
  transition: var(--transition-control-slide);
}

@utility transition-control-ring {
  transition: var(--transition-control-ring);
}

@utility transition-chip-settle {
  transition: var(--transition-chip-settle);
}

@utility transition-pick-card {
  transition: var(--transition-pick-card);
}

@utility transition-frame-end-first {
  transition: var(--transition-frame-end-first);
}

@utility transition-frame-start-first {
  transition: var(--transition-frame-start-first);
}

@utility transition-split-surface {
  transition: var(--transition-split-surface);
}

@utility transition-ring-arc {
  transition: var(--transition-ring-arc);
}

@utility transition-rail-tip {
  transition: var(--transition-rail-tip);
}

@utility transition-panel-travel {
  transition: var(--transition-panel-travel);
}

@utility transition-panel-resize {
  transition: var(--transition-panel-resize);
}

@utility transition-suggest-chip {
  transition: var(--transition-suggest-chip);
}

@utility transition-segment {
  transition: var(--transition-segment);
}

@utility transition-fold-fade {
  transition: var(--transition-fold-fade);
}

@utility transition-morph-fade {
  transition: var(--transition-morph-fade);
}

@utility transition-band-hide {
  transition: var(--transition-band-hide);
}

@utility transition-band-show {
  transition: var(--transition-band-show);
}

@utility transition-band-slide-hide {
  transition: var(--transition-band-slide-hide);
}

@utility transition-band-slide-show {
  transition: var(--transition-band-slide-show);
}

@utility transition-band-row-shut {
  transition: var(--transition-band-row-shut);
}

@utility transition-band-row-open {
  transition: var(--transition-band-row-open);
}

@utility liga-none {
  font-variant-ligatures: none;
}

@utility no-scrollbar {
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

@utility anim-dur-* {
  animation-duration: --value(--duration-*);
}

@utility anim-delay-* {
  animation-delay: --value(--duration-*);
}
`,Au=e=>[...ku.matchAll(RegExp(`^\\s*--${e}-([a-z0-9-]+):`,`gm`))].map(([,e])=>e),ju=e=>[...ku.matchAll(RegExp(`^@utility ${e}-([a-z0-9-]+) \\{`,`gm`))].map(([,e])=>e),Mu=Au(`duration`),Nu=[`type-role`,`font-shorthand`,`font-family`,`font-features`,`font-size`,`font-stretch`,`font-style`,`font-weight`,`fvn-normal`,`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`,`leading`],Pu=[Ss.isArbitraryVariable,Ss.isArbitraryValue],Fu={extend:{theme:{text:ju(`text`).filter(e=>!e.startsWith(`size-`)),spacing:Au(`spacing`),radius:Au(`radius`),shadow:Au(`shadow`),"drop-shadow":Au(`drop-shadow`),leading:Au(`leading`),tracking:Au(`tracking`),ease:Au(`ease`),font:Au(`font`).filter(e=>!e.startsWith(`weight-`)),"font-weight":Au(`font-weight`),breakpoint:Au(`breakpoint`),container:Au(`container`),animate:Au(`animate`)},classGroups:{"font-size":[{"text-size":ju(`text-size`)}],"bg-image":[{bg:ju(`bg`)}],transition:[{transition:[...ju(`transition`),`off`,`control-grow`]}],animate:[`sheet-fade`],content:[{content:[`data-n`,`placeholder`]}],"grid-rows":[{"grid-rows":[`shut`,`open`]}],"grid-cols":[{"grid-cols":[`fluid-auto`,`mark-fluid`]}],"auto-rows":[{"auto-rows":[`line`,`band`,`band-phone`]}],"animation-duration":[{"anim-dur":Mu}],"animation-delay":[{"anim-delay":Mu}],"type-role":[{type:ju(`type`)}],"border-none-t":[`border-t-none`],"border-none-b":[`border-b-none`],"border-none-l":[`border-l-none`],"border-none-r":[`border-r-none`],"border-none-s":[`border-s-none`],"border-style-t":[`border-t-dashed`],"outline-off":[`outline-off`],"background-shorthand":[{background:[Ss.isAny]}],rounded:[`rounded-inherit`,{concentric:Au(`radius`)}],"concentric-in":[`concentric-in`],"r-outer":[{"r-outer":Au(`radius`)}],"r-inset":[{"r-inset":Au(`spacing`)}],"font-family":[`font-family-inherit`],gap:[`gap-inherit`],"color-scheme":[`scheme-inherit`],"pointer-events":[`pointer-events-all`],"max-h":[`max-h-inherit`],"align-items":[`items-box-start`,`items-box-end`,`items-unsafe-end`],"justify-content":[`justify-box-end`],"justify-self":[`justify-self-box-start`],"align-content":[`content-unsafe-end`],"border-color":[`border-suggest-tint`],"bg-color":[`bg-suggest-tint`,`bg-suggest-tint-hover`],"font-shorthand":[`font-inherit`,`font-mono-meta`],"line-clamp-undo":[`line-clamp-undo`],"translate-raw":[{"translate-raw":Pu}],"clip-margin":[{"clip-margin":[Ss.isAny]}],"overflow-anchor":[`anchor-none`],"scroll-timeline":[`scroll-timeline-transcript-head`],"pane-tab-pads":[`pane-tab-pads`],"pane-tab-rims":[`pane-tab-rims`],"divider-chevron":[`divider-chevron`],"turn-pad":[`turn-pad`],"word-break-word":[`break-word`],"animation-play-state":[`animation-paused`],"inks-strong":[`inks-strong`],"tap-highlight":[`tap-highlight-none`],"touch-callout":[`touch-callout-none`],"content-visibility":[`content-visibility-hidden`],"timeline-scope":[`timeline-scope-transcript-head`],"writing-mode":[`writing-vertical-rl`],direction:[`dir-rtl`],"clip-path":[{"clip-path":Pu},`clip-block-start`,`clip-tab-foot`],"grid-areas":[{"grid-areas":Pu}],"line-clamp-std":[{"line-clamp-std":[Ss.isInteger]}],"ring-ground":[{"ring-ground":[Ss.isAny]}],"hit-gap-x":[{"hit-gap-x":[Ss.isAny]}],"hit-gap-y":[{"hit-gap-y":Pu}],"caw-neck":[{"caw-neck":Pu}],"press-by":[{"press-by":Pu}],"swap-away":[{"swap-away":[Ss.isInteger]}],"rail-step":[{"rail-step":Pu}],"prompt-fs":[{"prompt-fs":Pu}],"fade-inset-end":[{"fade-inset-end":Pu}]},conflictingClassGroups:{"type-role":[...Nu],"font-shorthand":[...Nu]}}},Iu=ks(Fu),Lu=Ou({twMergeConfig:Fu});function Ru(...e){return Iu(wi(e))}function zu(e){fetch(`/prefs`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify(e),keepalive:!0}).catch(()=>{})}var Bu=`cawco-tab-boxes`,Vu=9,Hu=120,Uu=e=>Array.isArray(e)&&e.length===Vu&&e.every(e=>typeof e==`number`&&Number.isFinite(e)),Wu=({box:e,ink:t})=>[e.width,e.height,e.flare,e.radius,e.slopeStart,e.slopeEnd,t.stroke,t.taper,t.ease].map(e=>Math.round(e*100)/100),Gu=e=>{if(!e)return[];try{let t=JSON.parse(e);return t&&typeof t==`object`?Object.entries(t).filter(e=>Uu(e[1])):[]}catch{return[]}},Ku=e=>{let t=e.slice(-40),n=JSON.stringify(Object.fromEntries(t));for(;t.length>0&&encodeURIComponent(n).length>3800;)t=t.slice(1),n=JSON.stringify(Object.fromEntries(t));return n},qu=()=>va(`local`,Bu),Ju;function Yu(e,t){let n=new Map(Gu(qu())),r=Wu(t);if(n.get(e)?.every((e,t)=>e===r[t]))return;n.delete(e),n.set(e,r);let i=Ku([...n]);ya(`local`,Bu,i),clearTimeout(Ju),Ju=setTimeout(()=>zu({[Bu]:qu()??i}),Hu)}var Xu=new Map,Zu,Qu=e=>{let t=[];for(let n of e){let e=Xu.get(n);e&&t.push([e,e.measure()])}return()=>{for(let[e,n]of t)e.take(n)}},$u=(e,t)=>(Xu.set(e,t),Zu??=Wa(e=>Qu(e)(),{first:e=>Qu(e.map(e=>e.target))}),Zu.observe(e),()=>{Xu.delete(e),Zu?.unobserve(e)}),ed=new Set([`$$slots`,`$$events`,`$$legacy`,`value`,`label`,`icon`,`href`,`class`,`lead`,`trail`,`onclick`,`flush`,`hung`,`glyphOnly`]),td=Ir(`<stop class="stop-rim-ink"></stop>`),nd=Ir(`<g data-slot="rim" class="pick-inherit rim-strength rim-glow contrast-more:filter-none reduced-transparency:filter-none"><use data-slot="stroke" class="fill-none rim-stroke-w vector-non-scaling"></use></g>`),rd=Ir(`<svg data-slot="fold" aria-hidden="true" class="pick-inherit pointer-events-none absolute inset-y-0 start-(--fold-start) z-1 h-full w-(--fold-w) overflow-visible clip-path-(--fold-clip)" preserveAspectRatio="none"><defs><path></path><clipPath><use></use></clipPath><linearGradient gradientUnits="userSpaceOnUse" x1="0" x2="0" y2="0"></linearGradient></defs><use data-ff-sheet="" class="pick-inherit paint-tab-sheet hover-hover:group-data-ghosted/ff-tab:not-group-data-tab-item-selected/ff-tab:paint-tab-hover group-hit-pressed/ff-tab:fill-press-fill"></use><!></svg>`),id=Pr(`<!>  <span data-slot="tab-item-label"><span data-slot="text" class="col-start-1 row-start-1 min-w-0 truncate leading-(--item) font-medium"> </span> <span data-slot="text" aria-hidden="true" class="pick-inherit col-start-1 row-start-1 hidden min-w-0 truncate leading-(--item) font-medium in-variant-folder:block in-variant-folder:text-ink-strong in-variant-folder:opacity-(--pick) before:content-[attr(data-text)]"></span></span>`,1),ad=Pr(`<span data-slot="ff-tab" data-ff-tab=""><!> <!> <!></span>`);function od(e,t){let n=zr();Ue(t,!0);let r=ca(t,`hung`,3,!1),i=ca(t,`glyphOnly`,3,!1),a=sa(t,ed),o=Aa(),s=Ma(),c=B(void 0);Sn(()=>{if(K(c))return s.rects.register(K(c),t.value)});let l=ft(()=>K(c)?s.rects.items.indexOf(K(c)):-1),u=ft(()=>o.value===t.value),d=B(Zt(_r(()=>o.value===t.value)));Sn(()=>{let e=K(u),t,n=requestAnimationFrame(()=>{t=setTimeout(()=>{V(d,e,!0)})});return()=>{cancelAnimationFrame(n),clearTimeout(t)}});let f=ft(()=>{let e=o.order.indexOf(t.value);return e<0?void 0:Ta(o.order.length,o.value===void 0?-1:o.order.indexOf(o.value),e)}),p=ft(()=>{let{travel:e}=o,n=+!!K(u);if(!e||e.toward===o.value)return n;let r=Math.min(1,Math.max(0,e.fraction));return n+(+(t.value===e.toward)-n)*r}),m=ft(()=>o.variant===`folder`),h=B(null),g;Sn(()=>{let e=K(c);if(!(e&&K(m)))return;let n=$u(e,{measure:()=>{let t=getComputedStyle(e),n=e=>Number.parseFloat(t.getPropertyValue(e))||0;return{box:{width:e.offsetWidth,height:e.offsetHeight,flare:n(`--flare`),radius:n(`--radius`),slopeStart:n(`--slope-start`),slopeEnd:n(`--slope-end`)},ink:{stroke:n(`--rim-w`)||1,taper:n(`--tab-rim-taper`),ease:n(`--tab-rim-taper-ease`)||1}}},take:e=>{V(h,e,!0),clearTimeout(g),g=setTimeout(()=>Yu(t.value,e),400)}});return()=>{n(),clearTimeout(g)}});let _=ft(()=>K(h)??o.boxes[t.value]??null),v=ft(()=>{let e=K(c)?s.folds.get(K(c)):void 0,n=e?.[0],r=e?.[1];if(e===void 0){let e=o.order.indexOf(t.value),i=o.value===void 0?-1:o.order.indexOf(o.value),a=o.order.length,s=e=>Ta(a,i,e);n=e>0&&s(e-1)>s(e),r=e>=0&&e<a-1&&s(e+1)>s(e)}return[!!n||t.flush===`start`,!!r||t.flush===`end`]}),y=ft(()=>{let e=K(c)?s.poses.get(K(c)):void 0;return e?{...e,spread:[t.flush===`start`?0:e.spread[0],t.flush===`end`?0:e.spread[1]]}:Ka(K(v))}),b=ft(()=>K(_)?Ja(K(_).box,K(y),r()?{inset:Xa}:{}):``),x=ft(()=>K(_)?Ya(K(_).box,K(_).ink.stroke,K(_).ink.taper,K(_).ink.ease):[]);function S(e){t.onclick?.(e),!(e.defaultPrevented||e.button!==0)&&(t.href&&(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)||(e.preventDefault(),s.optimisticIndex=K(l),o.select(t.value)))}var C=ad();let w;var T=H(C),ee=e=>{var t=rd();Ni(t,``,{},{"--fold-start":`calc(-1 * var(--flare))`,"--fold-w":`calc(100% + 2 * var(--flare))`,"--fold-clip":`inset(calc(-1 * var(--tab-rim-glow-room)) calc(-1 * var(--tab-rim-glow-room)) 0)`});var i=H(t),a=H(i),o=U(a),s=un(o),c=U(o);pi(c,21,()=>K(x),e=>e.offset,(e,t,n,r)=>{var i=td();An(()=>{q(i,`offset`,K(t).offset),q(i,`stop-opacity`,K(t).ink)}),Rr(e,i)}),R(c),R(i);var l=U(i),u=U(l),d=e=>{var t=nd(),r=un(t);An(()=>{q(r,`clip-path`,`url(#${n}-inside)`),q(r,`href`,`#${n}-outline`),q(r,`stroke`,`url(#${n}-taper)`)}),Rr(e,t)};ci(u,e=>{r()||e(d)}),R(t),An(()=>{q(t,`viewBox`,`0 0 ${K(_).box.width+2*K(_).box.flare} ${K(_).box.height??``}`),q(a,`d`,K(b)),q(a,`id`,`${n}-outline`),q(o,`id`,`${n}-inside`),q(s,`href`,`#${n}-outline`),q(c,`id`,`${n}-taper`),q(c,`y1`,K(_).box.height),q(l,`href`,`#${n}-outline`)}),Rr(e,t)};ci(T,e=>{K(m)&&K(_)&&e(ee)});var E=U(T,2);bi(E,()=>t.href?`a`:`button`,!1,(e,n)=>{Qi(e,()=>({"data-slot":`hit`,"data-hit":!0,"aria-selected":K(u),class:`touch-hit pick-inherit static z-3 flex min-w-0 flex-auto items-center gap-(--hit-gap) self-stretch rounded-inherit border-none border-current background-transparent py-0 ps-(--hit-ps) text-(length:--text) leading-none whitespace-nowrap text-inherit no-underline outline-off last:pe-(--px) before:absolute before:inset-0 before:-z-1 in-variant-folder:aria-selected:before:-inset-x-(--flare) in-variant-folder:aria-selected:before:clip-tab-foot`,draggable:t.href?`false`:void 0,href:t.href,onclick:S,role:`tab`,tabindex:K(d)?0:-1,type:t.href?void 0:`button`,...a,[Hi]:{"--hit-gap":`calc(var(--gap) + var(--space-1))`,"--hit-ps":`var(--px-start, var(--px))`}}));var r=id(),o=ln(r),s=e=>{var n=Lr();oi(ln(n),()=>t.lead),Rr(e,n)},c=e=>{var n=Lr();yi(ln(n),()=>t.icon,(e,t)=>{t(e,{class:`size-(--icon) flex-none`})}),Rr(e,n)};ci(o,e=>{t.lead?e(s):t.icon&&e(c,1)});var l=U(o,2),f=H(l),p=un(f,!0),m=U(f,2);R(l),An(e=>{ji(l,1,e),ei(p,t.label),q(m,`data-text`,t.label)},[()=>Ti(Ru(`pick-inherit grid min-w-0`,i()&&`sr-only`))]),Rr(n,r)});var D=U(E,2),te=e=>{var n=Lr();oi(ln(n),()=>t.trail),Rr(e,n)};ci(D,e=>{t.trail&&e(te)}),R(C),ra(C,e=>V(c,e),()=>K(c)),An(e=>{q(C,`data-tab-item-selected`,K(u)||void 0),ji(C,1,e),q(C,`data-flush`,t.flush),q(C,`data-tab-index`,K(l)),w=Ni(C,``,w,{"--pick":K(p),"--z-rest":K(f),"--end-pad":`calc(var(--px) - var(--space-2))`,"--fold-end-pad":`var(--px-end, var(--px))`})},[()=>Ti(Ru(`group/ff-tab relative flex h-(--item) min-w-0 flex-initial items-center rounded-(--shape) text-ink-muted`,`[&>:where(:not([data-slot=fold],[data-slot=hit]))]:relative [&>:where(:not([data-slot=fold],[data-slot=hit]))]:z-3`,`[&:not(:has([data-slot=hit]:last-child))]:pe-(--end-pad)`,`in-variant-folder:[&:not(:has([data-slot=hit]:last-child))]:pe-(--fold-end-pad)`,`data-tab-item-selected:text-ink-strong hover-hover:data-ghosted:not-data-tab-item-selected:text-ink-strong`,`in-variant-folder:data-tab-item-selected:text-ink-muted`,`motion-safe:transition-[color] motion-safe:duration-(--dur-ghost) motion-safe:ease-out`,`in-variant-folder:motion-safe:[transition:color_var(--dur-ghost)_var(--ease-out),--pick_var(--choose-dur)_var(--choose-ease)]`,`[[data-variant=folder]_[data-ride]_&]:transition-off`,`hit-pressed:bg-surface-pressed in-variant-folder:hit-pressed:bg-transparent light:hit-pressed:text-ink-strong`,t.class))]),Rr(e,C),We()}var sd=Lu({variants:{fill:{none:`background-none p-0`},strip:{session:`coarse:relative coarse:z-1 flex min-w-0 flex-none items-end bg-surface-shelf desk:@max-leaf/leaf:ps-space-4 ps-space-7 pe-space-4 pt-space-1 pb-0 [--strip-fade:var(--c-tab-strip-fade)] [--strip-flare:var(--radius-sm)] [--strip-item-rest:var(--space-8)] [--strip-item:var(--strip-item-rest)] [--strip-px:var(--space-3)] [--strip-reach:var(--space-3)] [--strip-uncapped:var(--c-tab-strip-uncapped)] max-desk:min-h-c-top-bar-h max-desk:ps-[calc(var(--c-bar-phone-edge)_+_var(--c-bar-toggle-glyph))] max-desk:pe-[calc(var(--c-bar-phone-gap)_+_var(--c-bar-caw-glass-phone))] max-desk:pt-0 max-desk:[--strip-flare:var(--radius-lg)] max-desk:[--strip-item:var(--c-tab-row-h)]`,hosted:`coarse:relative coarse:z-1 flex min-w-0 flex-[1_1_0] items-end self-stretch bg-transparent p-0 [--strip-fade:var(--c-tab-strip-fade)] [--strip-flare:var(--radius-sm)] [--strip-item-rest:var(--space-8)] [--strip-item:var(--strip-item-rest)] [--strip-px:var(--space-3)] [--strip-reach:var(--space-3)] [--strip-uncapped:var(--c-tab-strip-uncapped)]`,work:``}}}),cd=new Set([`$$slots`,`$$events`,`$$legacy`,`value`,`onValueChange`,`selectedIndex`,`onSelect`,`defaultValue`,`size`,`variant`,`travel`,`values`,`boxes`,`fill`,`strip`,`class`,`children`]),ld=Pr(`<div><!></div>`);function ud(e,t){Ue(t,!0);let n=ca(t,`size`,3,`default`),r=ca(t,`variant`,3,`segmented`),i=ca(t,`travel`,3,null),a=sa(t,cd),o=new wa(t.defaultValue),s=()=>{o.controlled=t.value,o.selectedIndex=t.selectedIndex,o.size=n(),o.variant=r(),o.strip=t.strip,o.boxes=t.boxes??{},o.travel=i(),o.onValueChange=t.onValueChange,o.onSelect=t.onSelect;let e=t.values?[...t.values]:null;e&&_r(()=>o.setOrder(e))};s(),wn(s),ka(o);var c=ld();Qi(c,e=>({class:e,"data-size":n(),"data-slot":`tabs`,"data-variant":r(),...a}),[()=>Ru(sd({fill:t.fill,strip:t.strip}),t.class)]),oi(H(c),()=>t.children),R(c),Rr(e,c),We()}function dd(e,t){let n=!0,r=!1,i=!0,a=e=>{e!==n&&(n=e,t(e))},o=!1,s=Wa(()=>a(o),{read:e=>{for(let t of e){let[e]=t.borderBoxSize;o=!!e&&(e.inlineSize>0||e.blockSize>0)}},first:()=>(r=o,()=>{r&&a(!0)})});s.observe(e);let c=new IntersectionObserver(([t])=>{if(t.isIntersecting){i=!1,a(!0);return}if(i){i=!1,a(r);return}a(e.checkVisibility())});return c.observe(e),{stop:()=>{c.disconnect(),s.disconnect()}}}var fd=`
[data-slot^="highlight-"] {
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  translate: var(--hl-x) var(--hl-y);
  opacity: var(--hl-show);
  background-color: var(--color-selected-bg);
}
[data-slot="highlight-ghost"] {
  display: none;
  background-color: var(--color-surface-hover);
  transition: --hl-show var(--dur-control) var(--ease-out);
}
@media (hover: hover) {
  [data-slot="highlight-ghost"] {
    display: block;
  }
}
[data-slot="highlight-ghost"][data-follow] {
  display: block;
}
[data-slot="highlight-ghost"][data-unseen] {
  display: none;
}
[data-slot="highlight-pill"][data-swap] {
  transition: --hl-show var(--dur-fade) var(--ease-out);
}
[data-slot="highlight-trail"][data-fade] {
  transition: --hl-show var(--dur-control) var(--ease-out);
}
[data-slot="highlight-trail"][data-fade][data-swap] {
  transition: --hl-show var(--dur-fade) var(--ease-out);
}
@media (prefers-reduced-motion: no-preference) {
  [data-slot="highlight-ghost"][data-glide] {
    transition:
      --hl-x var(--dur-ghost) var(--ease-in-out),
      --hl-y var(--dur-ghost) var(--ease-in-out),
      width var(--dur-ghost) var(--ease-in-out),
      height var(--dur-ghost) var(--ease-in-out),
      --hl-show var(--dur-control) var(--ease-out);
  }
  [data-slot="highlight-pill"][data-glide]:not([data-swap]) {
    transition:
      --hl-x var(--dur-control) var(--ease-drawer),
      --hl-y var(--dur-control) var(--ease-drawer),
      width var(--dur-control) var(--ease-drawer),
      height var(--dur-control) var(--ease-drawer);
  }
}
[data-highlight-frame] {
  pointer-events: none;
  position: absolute;
  top: 0;
  inset-inline: 0;
  height: 1px;
}
:host([data-highlight="card"]) :is([data-slot="highlight-pill"], [data-slot="highlight-trail"]) {
  z-index: 1;
  box-sizing: border-box;
  border: var(--border-width) solid var(--color-brand-solid);
  background-color: var(--color-surface-recess);
}
`,pd=null,md=()=>(pd||(pd=new CSSStyleSheet,pd.replaceSync(fd)),pd),hd=e=>{let t=e.shadowRoot??e.attachShadow({mode:`open`});return t.adoptedStyleSheets.includes(md())||(t.adoptedStyleSheets=[...t.adoptedStyleSheets,md()]),t.querySelector(`slot`)||t.append(document.createElement(`slot`)),t},gd=8,_d=.5,vd=.01,yd=3,bd=200,xd=100,Sd=[`transitionend`,`transitioncancel`,`animationend`,`animationcancel`],Cd=e=>{let t=[e.borderTopLeftRadius,e.borderTopRightRadius,e.borderBottomRightRadius,e.borderBottomLeftRadius].map(e=>e.split(` `)),n=t.map(([e=`0px`])=>e).join(` `),r=t.map(([e=`0px`,t=e])=>t).join(` `);return n===r?n:`${n} / ${r}`},wd=e=>{let t=document.createElement(`span`);return t.dataset.slot=e,t.setAttribute(`aria-hidden`,`true`),t},Td=(e,t)=>{e.style.setProperty(`--hl-x`,`${t.x}px`),e.style.setProperty(`--hl-y`,`${t.y}px`),e.style.width=`${t.w}px`,e.style.height=`${t.h}px`,e.style.borderRadius=t.r},Ed=(e,t)=>{e.style.setProperty(`--hl-show`,t?`1`:`0`)},Dd=(e,t)=>{e.hasAttribute(`data-glide`)!==t&&e.toggleAttribute(`data-glide`,t)},Od=(e,t,n=new Map)=>{let r=0,i=0;for(let a=e;a&&a!==t;a=a.parentElement){let e=n.get(a);if(!e){e={x:0,y:0};let t=getComputedStyle(a);if(t.transform!==`none`){let n=new DOMMatrixReadOnly(t.transform);e.x+=n.e,e.y+=n.f}if(t.translate!==`none`){let[n=`0`,r=`0`]=t.translate.split(` `);e.x+=Number.parseFloat(n),e.y+=Number.parseFloat(r)}n.set(a,e)}r+=e.x,i+=e.y}return{x:r,y:i}},kd=(e,t)=>Math.abs(e.x-t.x)>.001||Math.abs(e.y-t.y)>.001||Math.abs(e.w-t.w)>.001||Math.abs(e.h-t.h)>.001,Ad=(e,t)=>e!==null&&t!==null&&Math.abs(e.x-t.x)<.5&&Math.abs(e.y-t.y)<.5&&Math.abs(e.w-t.w)<.5&&Math.abs(e.h-t.h)<.5;function jd(e){return t=>{let{rows:n,hovered:r,selected:i,covered:a,laidOut:o,axis:s=`y`,ghost:c=!0,look:l}=e;t.dataset.highlight=l??``;let u=!t.classList.contains(`isolate`);t.classList.add(`isolate`);let d=wd(`highlight-ghost`),f=wd(`highlight-trail`),p=wd(`highlight-pill`);r&&(d.dataset.follow=``),c===`unseen`&&(d.dataset.unseen=``);let m=document.createElement(`span`);m.dataset.highlightFrame=``,m.setAttribute(`aria-hidden`,`true`),hd(t).prepend(m,...c?[d]:[],f,p);let h=()=>{let e=t.getBoundingClientRect(),n=getComputedStyle(t),r=(e,t)=>{let n=Number.parseFloat(t);return n>0&&Math.abs(e-n)>.01?e/n:1};return{left:e.left,top:e.top,borderLeft:t.clientLeft,borderTop:t.clientTop,sx:r(e.width,n.width),sy:r(e.height,n.height)}},g=(e,n,r)=>({x:(n-e.left)/e.sx-e.borderLeft+t.scrollLeft,y:(r-e.top)/e.sy-e.borderTop+t.scrollTop,sx:e.sx,sy:e.sy}),_=(e,t)=>g(h(),e,t),v=(e,n)=>{if(o){let t=o().get(e);return t&&{x:t.left,y:t.top,w:t.width,h:t.height}}let r=e.getBoundingClientRect(),i=Od(e,t,n),a=window.devicePixelRatio,s=e=>Math.floor(e*a+vd)/a,c=e=>Math.ceil(e*a-vd)/a,l=s(r.left-i.x),u=s(r.top-i.y),d=_(l,u);return{x:d.x,y:d.y,w:(c(r.right-i.x)-l)/d.sx,h:(c(r.bottom-i.y)-u)/d.sy}},y=e=>{let t=v(e);return t&&{...t,r:Cd(getComputedStyle(e))}},b=e=>e.offsetParent===null?void 0:y(e),x=()=>[...t.querySelectorAll(n)].filter(M),S=!1,C=null,w=null,T=0,ee=null,E=null,D=()=>void 0,te=()=>{Ed(d,!(a&&w?.matches(a)))},ne=e=>{if(!c||S)return;w!==e&&(w?.removeAttribute(`data-ghosted`),e?.setAttribute(`data-ghosted`,``));let t=e&&y(e);if(!(e&&t)){cancelAnimationFrame(O),e?.removeAttribute(`data-ghosted`),Ed(d,!1),w=null,D(),re();return}Dd(d,w!==null),Td(d,t),C=t,w=e,D(),te(),ie(),Fe()},re=()=>{let e=()=>{if(w===null){for(let e of[`--hl-x`,`--hl-y`,`width`,`height`,`border-radius`])d.style.removeProperty(e);C=null}},t=d.getAnimations().filter(e=>e instanceof CSSTransition&&e.transitionProperty===`--hl-show`);if(t.length===0){e();return}Promise.all(t.map(e=>e.finished)).then(e,()=>void 0)},O=0,ie=()=>{cancelAnimationFrame(O);let e=0,t=()=>{let n=w;if(!(n?.isConnected&&C)||ye||S)return;let r=y(n);r&&kd(r,C)?(Dd(d,!1),Td(d,r),C=r,e=0):e+=1,e<yd&&(O=requestAnimationFrame(t))};O=requestAnimationFrame(t)},k=()=>{if(!i)return null;let e=t.querySelector(i);return{row:e,box:e&&b(e)}},ae=(e,t=k())=>{if(!t)return;let{row:n,box:r}=t;if(!(n&&r)){Ed(p,!1),ee=null,E=null,D();return}if(n===E&&Ad(r,ee))return;let i=n!==E&&(n===w&&Ad(r,C)||n.hasAttribute(`data-ghosted`));i&&ee&&A(ee),oe(r,e&&!i&&ee!==null&&n!==E),ee=r,E=n,D(),Fe()},A=e=>{f.removeAttribute(`data-fade`),f.removeAttribute(`data-swap`),Td(f,e),Ed(f,!0),requestAnimationFrame(()=>{f.toggleAttribute(`data-fade`,!0),f.toggleAttribute(`data-swap`,se.matches),Ed(f,!1)})},oe=(e,t)=>{if(t&&ee&&se.matches){ce(ee,e);return}p.removeAttribute(`data-swap`),Dd(p,t),Td(p,e),Ed(p,!0)},se=matchMedia(`(prefers-reduced-motion: reduce)`),ce=(e,t)=>{f.removeAttribute(`data-fade`),f.removeAttribute(`data-swap`),Td(f,e),Ed(f,!0),p.removeAttribute(`data-swap`),Dd(p,!1),Td(p,t),Ed(p,!1),requestAnimationFrame(()=>{f.toggleAttribute(`data-fade`,!0),f.toggleAttribute(`data-swap`,!0),p.toggleAttribute(`data-swap`,!0),Ed(f,!1),Ed(p,!0)})},le=e=>{S||ae(e)},j=(e,t)=>{let n=s===`y`?0:gd,r=s===`x`?0:gd;return t.x>=e.x-n&&t.x<=e.x+e.w+n&&t.y>=e.y-r&&t.y<=e.y+e.h+r},M=e=>t.contains(e)&&!e.disabled&&e.offsetParent!==null&&(!o||o().has(e)),ue=(e,t,n)=>{let r=e.getBoundingClientRect(),i=Math.min(gd,r.width/2),a=Math.min(1,r.height/2),o=document.elementFromPoint(Math.min(r.right-i,Math.max(r.left+i,t)),Math.min(r.bottom-a,Math.max(r.top+a,n)));return o!==null&&de(o)===e},de=e=>{let r=e.closest(n);if(r)return r;for(let r=e;r&&r!==t;r=r.parentElement){let e=r.querySelectorAll(n);if(e.length>0)return e.length===1?e[0]:null}return null},N=(e,n)=>{let r=document.elementFromPoint(e,n);if(!(r&&t.contains(r)))return null;let i=new Map;return fe(r,i)??pe(e,n,i)},fe=(e,n)=>{let r=de(e);if(!(r&&M(r)))return null;let i=Od(r,t,n);return Math.abs(i.x)<=_d&&Math.abs(i.y)<=_d?r:null},pe=(e,t,n)=>{let r=_(e,t),i=[];for(let e of x()){let t=getComputedStyle(e).pointerEvents===`none`?void 0:v(e,n);if(!(t&&j(t,r)))continue;let a=r.x-(t.x+t.w/2),o=r.y-(t.y+t.h/2),c={x:Math.abs(a),y:Math.abs(o),xy:Math.hypot(a,o)}[s];i.push({distance:c,row:e})}return i.sort((e,t)=>e.distance-t.distance),i.find(({row:n})=>ue(n,e,t))?.row??null},P=null,F=0,I=(e,t=!1)=>{if(r)return;cancelAnimationFrame(F),P={x:e.clientX,y:e.clientY};let n=N(e.clientX,e.clientY);(t||n!==w)&&ne(n)},L=()=>{let e=new Map;return x().some(n=>{let r=Od(n,t,e);return Math.abs(r.x)>_d||Math.abs(r.y)>_d})},me=()=>{let e=P;if(r||!e)return;if(cancelAnimationFrame(F),N(e.x,e.y)===w&&!L()){w&&ne(w);return}ne(null);let t=0,n=()=>{if(P===e){if(t=L()?0:t+1,t<yd){F=requestAnimationFrame(n);return}ne(N(e.x,e.y))}};F=requestAnimationFrame(n)},he=e=>{e.pointerType!==`touch`&&I(e)},R=e=>{e.pointerType!==`touch`&&(P?.x===e.clientX&&P.y===e.clientY?me():I(e))},ge=()=>{if(cancelAnimationFrame(F),xe(),P=null,!r){let e=w?.isConnected?y(w):void 0;e&&(Dd(d,!1),Td(d,e),C=e),ne(null)}},_e=-1/0,ve=()=>{_e=performance.now()},ye=null,be,xe=()=>{clearTimeout(be),ye=null},Se=e=>{if(!ye){let e=new Map;ye={frame:h(),rows:x().flatMap(t=>{let n=getComputedStyle(t).pointerEvents===`none`?void 0:v(t,e);return n?[{row:t,box:n}]:[]})}}let t=g(ye.frame,e.x,e.y),n=null,r=1/0;for(let{row:e,box:i}of ye.rows){if(!j(i,t))continue;let a=t.x-(i.x+i.w/2),o=t.y-(i.y+i.h/2),c={x:Math.abs(a),y:Math.abs(o),xy:Math.hypot(a,o)}[s];c<r&&(n=e,r=c)}n!==w&&ne(n),clearTimeout(be),be=setTimeout(()=>{ye=null,P&&w&&I({clientX:P.x,clientY:P.y},!0)},xd)},Ce=()=>{if(P){if(performance.now()-_e<bd){w&&!r&&(cancelAnimationFrame(F),Se(P));return}xe(),me()}};t.addEventListener(`pointermove`,he),t.addEventListener(`pointerover`,R),t.addEventListener(`pointerleave`,ge);let we={capture:!0,passive:!0};t.addEventListener(`wheel`,ve,we),t.addEventListener(`touchmove`,ve,we),t.addEventListener(`keydown`,ve,we),t.addEventListener(`scroll`,Ce,we);let Te=new MutationObserver(e=>{if(e.some(e=>e.attributeName===`style`)&&Me(),a&&w&&te(),r){let e=t.querySelector(r);cancelAnimationFrame(T),e?ne(e):T=requestAnimationFrame(()=>{t.querySelector(r)||ne(null)})}cancelAnimationFrame(Ee),Ee=requestAnimationFrame(()=>le(!0))}),Ee=0;Te.observe(t,{subtree:!0,childList:!0,attributes:!0,attributeFilter:[`aria-current`,`aria-pressed`,`aria-selected`,`aria-checked`,`data-state`,`data-active`,`data-highlighted`,`data-selected`,`style`]});let De=Wa(()=>Oe(),{first:()=>{if(S)return;let e=k();return()=>{S||ae(!1,e)}}}),Oe=()=>{if(xe(),S)return;E=null,ee=null,Dd(p,!1),le(!1);let e=w?.isConnected?y(w):void 0;e&&(Dd(d,!1),Td(d,e),C=e)};De.observe(m);let ke=()=>{if(S)return;let e=E?.isConnected?b(E):void 0;e&&ee&&kd(e,ee)&&(Dd(p,!1),Td(p,e),ee=e);let t=w?.isConnected?y(w):void 0;t&&C&&kd(t,C)&&(Dd(d,!1),Td(d,t),C=t)},Ae=new Set,je=Wa(()=>ke()),Me=()=>je.request();D=()=>{for(let e of Ae)e!==E&&e!==w&&(je.unobserve(e),Ae.delete(e));for(let e of[E,w])e&&!Ae.has(e)&&(Ae.add(e),je.observe(e,{box:`border-box`}))},D();let Ne=e=>{let{target:n}=e;n instanceof Element&&n!==t&&n.contains(t)&&Me()};for(let e of Sd)document.addEventListener(e,Ne,!0);let Pe=new WeakSet,Fe=()=>{for(let e=t;e;e=e.parentElement)for(let t of e.getAnimations())t.playState!==`finished`&&!Pe.has(t)&&(Pe.add(t),t.finished.then(Me,()=>void 0))},Ie=dd(m,e=>{S=!e,Oe()});return o&&Sn(()=>{o(),_r(()=>{xe(),P&&!r?I({clientX:P.x,clientY:P.y},!0):w&&ne(w.isConnected?w:null),le(!0)})}),()=>{xe(),cancelAnimationFrame(T),cancelAnimationFrame(Ee),cancelAnimationFrame(F),cancelAnimationFrame(O),t.removeEventListener(`pointermove`,he),t.removeEventListener(`pointerover`,R),t.removeEventListener(`pointerleave`,ge),t.removeEventListener(`wheel`,ve,{capture:!0}),t.removeEventListener(`touchmove`,ve,{capture:!0}),t.removeEventListener(`keydown`,ve,{capture:!0}),t.removeEventListener(`scroll`,Ce,{capture:!0});for(let e of Sd)document.removeEventListener(e,Ne,!0);je.disconnect(),Te.disconnect(),De.disconnect(),Ie.stop(),w?.removeAttribute(`data-ghosted`),m.remove(),d.remove(),f.remove(),p.remove(),delete t.dataset.highlight,u&&t.classList.remove(`isolate`)}}}var Md={current:`pointer`};if(typeof window<`u`){let e={capture:!0,passive:!0};addEventListener(`keydown`,()=>{Md.current=`key`},e),addEventListener(`pointerdown`,()=>{Md.current=`pointer`},e)}var Nd=/--[\w-]+\s*:[^;]*;?/g,Pd=e=>(e??``).replace(Nd,``).trim(),Fd=class{#e=B([]);get items(){return K(this.#e)}set items(e){V(this.#e,e)}#t=B(new Map);get rects(){return K(this.#t)}set rects(e){V(this.#t,e)}#n=B(Zt({width:0,height:0}));get viewport(){return K(this.#n)}set viewport(e){V(this.#n,e,!0)}#r=B({items:[],rects:new Map});#i=new Map;#a;#o=null;#s=null;#c=null;#l=null;#u=new Set;#d=null;constructor(e){this.#a=e}at(e){if(e===null)return;let{items:t,rects:n}=K(this.#r);return n.get(t[e])}container=e=>{this.#o=e;let t=()=>{let e=this.#l;this.#l=null,e?.()};this.#c=Wa(t,{read:()=>this.#_(),first:e=>{for(let t of e)this.#u.delete(t.target);return t}}),this.#h(e);for(let e of this.#i.keys())this.#h(e);return this.#d=new MutationObserver(e=>{e.some(e=>this.#f(e))&&(this.#m(),this.#g())}),this.#d.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeOldValue:!0,attributeFilter:[`style`,`class`,`inert`]}),{destroy:()=>{this.#c?.disconnect(),this.#c=null,this.#u.clear(),this.#d?.disconnect(),this.#d=null,this.#o=null,this.#s!==null&&cancelAnimationFrame(this.#s)}}};register(e,t){return _r(()=>{this.#i.set(e,t),this.#h(e),this.#m(),this.#g()}),()=>_r(()=>{this.#i.delete(e),this.#c?.unobserve(e),this.#u.delete(e),this.#m(),this.#g()})}#f(e){let t=e=>{for(let t of this.#i.keys())if(e!==t&&e.contains(t))return!0;return!1};return e.type===`childList`?[...e.addedNodes,...e.removedNodes].some(e=>this.#i.has(e)||t(e)):e.attributeName===`style`&&Pd(e.oldValue)===Pd(e.target.getAttribute(`style`))?!1:t(e.target)}#p(e){for(let t=e;t&&t!==this.#o;t=t.parentElement)if(t.inert)return!0;return!1}#m(){let e=[...this.#i.keys()].filter(e=>e.isConnected&&!this.#p(e)).sort((e,t)=>e.compareDocumentPosition(t)===Node.DOCUMENT_POSITION_FOLLOWING?-1:1),t=this.items;e.length===t.length&&e.every((e,n)=>e===t[n])||(this.items=e,this.#a(e.map(e=>this.#i.get(e))),this.#g())}#h(e){this.#c&&(this.#u.add(e),this.#c.observe(e))}#g(){this.#s??=requestAnimationFrame(()=>{if(this.#s=null,this.#u.size>0){this.#u.clear(),this.#g();return}this.#v()})}#_(){this.#s!==null&&(cancelAnimationFrame(this.#s),this.#s=null),this.#l=this.#y()}#v(){this.#y()?.()}#y(){let e=this.#o;if(!e)return null;let t=new Map;for(let n of this.items){if(n.offsetParent===null)continue;let r=n.offsetTop,i=n.offsetLeft,a=n.offsetParent;for(;a&&a!==e&&e.contains(a);)r+=a.offsetTop+a.clientTop,i+=a.offsetLeft+a.clientLeft,a=a.offsetParent;t.set(n,{top:r,left:i,width:n.offsetWidth,height:n.offsetHeight})}let n=this.rects,r=n.size!==t.size;for(let[e,i]of t){if(r)break;let t=n.get(e);r=!t||t.top!==i.top||t.left!==i.left||t.width!==i.width||t.height!==i.height}let{items:i}=this,a=e.clientWidth,o=e.clientHeight;return()=>{r&&(this.rects=t),(r||K(this.#r).items!==i)&&V(this.#r,{items:i,rects:this.rects}),(a!==this.viewport.width||o!==this.viewport.height)&&(this.viewport={width:a,height:o})}}},Id=Lu({base:`relative inline-flex flex-none select-none items-center gap-(--gap) rounded-(--radius) bg-(--muted) p-(--pad) [--gap:var(--space-row)] [--icon:var(--icon-md)] [--item:var(--c-tab-item)] [--pad:var(--space-1)] [--px:var(--c-tab-px)] [--radius:var(--radius-sm)] [--shape:calc(var(--radius)_-_var(--pad))] [--sheet:var(--surface-raised)] [--text:var(--text-label)] coarse:[--item:var(--space-8)]`,variants:{size:{default:``,compact:`[--item:var(--c-btn-h-xs)] [--pad:var(--space-row)] [--px:var(--c-segment-pad-x)] [--radius:var(--radius-xs)] coarse:[--item:var(--c-tab-item)]`},variant:{segmented:``,folder:`isolate gap-0 rounded-none bg-transparent ps-[calc(var(--flare)_+_var(--overlap))] pe-(--flare) pb-0 [--choose-dur:var(--dur-settle)] [--choose-ease:var(--ease-crossfade)] [--flare:var(--radius)] [--overlap:var(--flare)] [--shape:var(--radius)_var(--radius)_0_0] [--slope-end:var(--c-tab-slope-end)] [--slope-start:var(--c-tab-slope-start)] [&>:not([data-slot=segment],[data-slot=ring],[data-slot^=highlight-])]:relative [&>:not([data-slot=segment],[data-slot=ring],[data-slot^=highlight-])]:isolate [&>:not([data-slot=segment],[data-slot=ring],[data-slot^=highlight-])]:z-(--z,var(--z-rest,1)) [&>:not([data-slot=segment],[data-slot=ring],[data-slot^=highlight-])]:-ms-(--overlap)`},scrollable:{true:`kit-edge-fade no-scrollbar min-w-0 max-w-full flex-[0_1_auto] overflow-x-auto overflow-y-hidden [--edge-room-end:var(--fade-len)] [--edge-room-start:var(--fade-len)] [&>[data-slot=ff-tab]]:shrink-0`},strip:{session:`[--item:var(--strip-item)] [--px:var(--strip-px)] [--rim-w:var(--tab-rim-width)] [--sheet:var(--tab-sheet)] [--tab-hover:light-dark(var(--surface-recess),var(--surface-hover))] coarse:[--item:var(--strip-item)] reduced-transparency:[--rim-w:1] contrast-more:[--rim-w:1]`,hosted:`[--item:var(--strip-item)] [--px:var(--strip-px)] [--rim-w:var(--tab-rim-width)] [--sheet:var(--tab-sheet)] [--tab-hover:light-dark(var(--surface-recess),var(--surface-hover))] coarse:[--item:var(--strip-item)] reduced-transparency:[--rim-w:1] contrast-more:[--rim-w:1]`,work:`min-w-0 flex-[0_1_auto] [--item:var(--space-8)] [--px:calc(var(--space-2)_-_var(--tight)_*_0.15)] [--sheet:light-dark(var(--surface-raised),var(--surface-hover))] [--tab-fill:var(--surface-recess)] [--tab-hover:light-dark(var(--surface-hover),color-mix(in_oklch,var(--surface-fill)_50%,transparent))] coarse:[--item:var(--space-8)] [&_[data-slot=ff-tab]]:[--gap:max(0px,var(--space-row)_-_var(--tight)_*_0.06)] [&_[data-slot=ff-tab]~[data-slot=ff-tab]]:[--px-start:calc(var(--overlap)_+_var(--px))]`}},compoundVariants:[{strip:`session`,scrollable:!0,class:`max-desk:strip-edge-mask desk:coarse:-mt-(--strip-reach) coarse:-mb-(--strip-reach) desk:coarse:pt-[calc(var(--pad)_+_var(--strip-reach))] coarse:pb-(--strip-reach) max-desk:mt-0 max-desk:pt-[calc(var(--c-top-bar-h)_-_var(--c-tab-row-h))] max-desk:[--edge-room-start:calc(var(--fade-len)_*_1.5)] max-desk:[--fade-len:var(--strip-fade)] max-desk:[--overlap:var(--radius-sm)] max-desk:[--pad:0px] max-desk:[--radius:var(--radius-lg)]`},{strip:`hosted`,scrollable:!0,class:`coarse:-my-(--strip-reach) coarse:pt-[calc(var(--pad)_+_var(--strip-reach))] coarse:pb-(--strip-reach)`}]}),Ld=new Set([`$$slots`,`$$events`,`$$legacy`,`class`,`scrollable`,`children`]),Rd=Pr(`<div data-slot="segment" aria-hidden="true" class="pointer-events-none absolute start-0 top-0 z-1 rounded-(--shape) bg-(--sheet) shadow-tile in-variant-folder:hidden hover-hover:beside-ghost:opacity-85 data-travelling:transition-off motion-safe:transition-segment motion-safe:data-travelling:transition-off"></div>`),zd=Pr(`<div data-slot="ring" aria-hidden="true" class="pointer-events-none absolute start-0 top-0 z-4 rounded-(--shape) border-(length:--focus-ring-width) border-focus-ring in-variant-folder:z-(--ring-z) in-variant-folder:rounded-(--ring-r) motion-safe:transition-[transform,width,height] motion-safe:duration-(--dur-ghost) motion-safe:ease-out"></div>`),Bd=Pr(`<div><!> <!> <!></div>`);function Vd(e,t){Ue(t,!0);let n=ca(t,`scrollable`,3,!1),r=sa(t,Ld),i=Aa(),a=new Fd(e=>i.setOrder(e)),o=new Ea(a);ja(o);let s=ft(()=>i.value===void 0?-1:i.order.indexOf(i.value));wn(()=>{o.optimisticIndex=K(s)>=0?K(s):null});let c=B(!1);Sn(()=>{if(i.travel){V(c,!0);return}let e=requestAnimationFrame(()=>{e=requestAnimationFrame(()=>{V(c,!1)})});return()=>cancelAnimationFrame(e)});function l(e,t){let n=e;for(;n.parentElement&&n.parentElement!==t;)n=n.parentElement;return n}let u=B(null),d=B(null),f=new Map;function p(e,t,n){let r=!(t.length===A.items.length&&t.every((e,t)=>e===A.items[t])&&K(u)===null&&A.lifted===null&&K(d)===A.hung);A={items:t,lifted:K(u),hung:K(d)};let i=t.length;f.clear(),t.forEach((t,r)=>{let a=l(t,e),o=a===(K(u)??K(d))?i+1:Ta(i,n,r);f.set(t,o);let s=String(o);a.style.getPropertyValue(`--z`)!==s&&a.style.setProperty(`--z`,s)}),_(t,h),r&&S(e)}let m=.5,h=e=>{let t=a.rects.get(e);return t?{left:t.left,right:t.left+t.width}:null},g=e=>{let t=e.getBoundingClientRect();return{left:t.left,right:t.right}};function _(e,t){for(let[n,[r,i]]of v(e,e=>f.get(e)??0,t)){let e=o.folds.get(n);(!e||e[0]!==r||e[1]!==i)&&o.folds.set(n,[r,i])}}function v(e,t,n){let r=e.flatMap(e=>{let r=n(e);return r?[{item:e,...r,z:t(e)}]:[]});return new Map(r.map(e=>{let t=r.filter(t=>t.z>e.z);return[e.item,[t.some(t=>t.left<=e.left+m&&t.right>=e.left-m),t.some(t=>t.right>=e.right-m&&t.left<=e.right+m)]]}))}let y=0,b=[],x=e=>e.playState===`running`||e.playState===`paused`;function S(e){if(b=[],y)return;let t=0,n=()=>K(u)!==null||(b.length===0&&(b=[...e.children].flatMap(e=>e.getAnimations())),b.some(x)),r=()=>{let e=n();_(a.items,e?g:h),t=e?0:t+1,y=t>3?0:requestAnimationFrame(r)};y=requestAnimationFrame(r)}let C=null,w=e=>{let t=e.effect?.getComputedTiming();return Number(e.currentTime??0)>=Number(t?.endTime??0)?1:t?.progress??0},T=(e,t)=>{let n=e.getPropertyValue(t).trim(),r=Number.parseFloat(n)||0;return n.endsWith(`ms`)?r:r*1e3},ee=null,E=e=>{let t=getComputedStyle(e),n=e=>Number.parseFloat(t.getPropertyValue(e))||0;return{duration:T(t,`--choose-dur`),easing:t.getPropertyValue(`--choose-ease`).trim()||`ease`,flare:n(`--flare`),overlap:n(`--overlap`)}};Sn(()=>{let e=K(de),{width:t,height:n}=a.viewport;if(!(e&&t+n>0))return;let r=requestAnimationFrame(()=>{ee=E(e)});return()=>cancelAnimationFrame(r)});function D(e){return ee??=E(e),ee}let te=.5;function ne(e,t,n,r){return i=>{let a=Math.min(1,i/te),o=Math.max(0,(i-te)/.5);return new Map(e.map(e=>{let s=t.get(e)??Ka([!1,!1]),c=Ka(n.get(e)??[!1,!1]),l=e=>{let t=s.spread[e],n=c.spread[e],l=s.tuck[e];return n<t?i<te?{spread:t+(n-t)*a,tuck:l+(r-l)*a}:{spread:n,tuck:r*(1-o)}:{spread:t+(n-t)*o,tuck:l*(1-a)}},u=l(0),d=l(1);return[e,{spread:[u.spread,d.spread],tuck:[u.tuck,d.tuck]}]}))}}function re(e){let t=C?.poseAt(w(C.clock));return new Map(e.map(e=>[e,t?.get(e)??Ka(o.folds.get(e)??[!1,!1])]))}function O(e,t,n){let r=C;r&&(C=null,cancelAnimationFrame(r.frame),r.clock.cancel(),p(e,t,n),o.poses.clear())}function ie(e,t,n,r,i){let s=t[r],c=t[n];if(!(s&&c))return;let l=re(t);C&&=(cancelAnimationFrame(C.frame),C.clock.cancel(),null);let u=D(e),d=t.length,f=ne(t,l,v(t,e=>Ta(d,r,t.indexOf(e)),h),u.overlap);p(e,t,n);let m=e.animate([{"--forward":0},{"--forward":1}],{id:`tab-come-forward`,duration:u.duration,easing:u.easing});i&&m.pause();let g={clock:m,flipped:!1,mover:s,leaving:c,poseAt:f,frame:0,held:i,ride:null};C=g;let _=t=>{let n=g.ride;if(!n)return;let r=n.p0>=1?1:Math.max(0,(t-n.p0)/(1-n.p0));e.scrollLeft=n.from+(n.to-n.from)*r},y=e=>{let t=a.items;return{fresh:t,at:t.indexOf(e)}},b=t=>{let n=t>=te;if(n!==g.flipped){g.flipped=n;let{fresh:t,at:r}=y(n?s:c);p(e,t,r)}},x=()=>{if(C!==g)return;let t=Number(m.currentTime??0),n=m.playbackRate<0,r=w(m);b(r);let i=!g.held&&(n?m.playState===`finished`:t>=u.duration);if(_(i?1:r),i){let{fresh:t,at:r}=y(n?c:s);O(e,t,r);return}for(let[e,t]of f(r))o.poses.set(e,t);g.frame=requestAnimationFrame(x)};for(let[e,t]of f(0))o.poses.set(e,t);g.frame=requestAnimationFrame(x)}let k=null,ae=new Set,A={items:[],lifted:null,hung:null};Sn(()=>{let e=K(de),{items:t}=a,n=o.optimisticIndex??-1,{travel:r}=i,[s]=[K(u),K(d),a.rects];e?.closest(`[data-variant="folder"]`)&&_r(()=>{let a=r?i.order.indexOf(r.toward):-1;r&&a>=0&&n>=0&&a!==n?oe(e,t,n,a,r.fraction):se(e,t,n,s===null)})});function oe(e,t,n,r,i){C?.held&&C.leaving===t[n]&&C.mover===t[r]||ie(e,t,n,r,!0);let a=C?.clock;a&&(a.currentTime=Math.min(1,Math.max(0,i))*Number(a.effect?.getTiming().duration??0))}function se(e,t,n,r){let i=t[n]??null,a=k?t.indexOf(k):-1;C?.held?(C.held=!1,i===C.mover?C.clock.play():C.clock.reverse()):i===k?C||p(e,t,n):r&&a>=0&&i&&ae.has(i)&&pa.current&&Md.current===`pointer`?ie(e,t,a,n,!1):(O(e,t,n),p(e,t,n)),k=i,ae=new Set(t)}Sn(()=>{let e=K(de);if(!e)return;let t=new MutationObserver(()=>{V(u,e.querySelector(`:scope > [data-lifted]`),!0),V(d,e.querySelector(`:scope > [data-hung]`),!0)});return t.observe(e,{subtree:!0,attributes:!0,attributeFilter:[`data-lifted`,`data-hung`]}),()=>t.disconnect()}),Sn(()=>()=>{cancelAnimationFrame(y),y=0,C&&=(cancelAnimationFrame(C.frame),C.clock.cancel(),null)});let ce=ft(()=>a.at(o.optimisticIndex)),le=ft(()=>a.at(o.focusedIndex)),j=(e,t,n)=>e+(t-e)*n,M=ft(()=>{let{travel:e}=i,t=K(ce),n=e&&a.at(i.order.indexOf(e.toward));if(!(t&&n))return;let r=Math.min(1,Math.max(0,e.fraction));return{left:j(t.left,n.left,r),top:j(t.top,n.top,r),width:j(t.width,n.width,r),height:j(t.height,n.height,r)}}),ue=ft(()=>K(M)??K(ce)),de=B(void 0);function N(e){let t=e.target,n=t.closest(`[data-tab-index]`);n&&(o.focusedIndex=t.matches(`:focus-visible`)?Number(n.dataset.tabIndex):null)}function fe(e){e.relatedTarget instanceof Node&&K(de)?.contains(e.relatedTarget)||(o.focusedIndex=null)}function pe(e){let t={ArrowRight:1,ArrowLeft:-1,Home:`start`,End:`end`}[e.key];if(t===void 0||!K(de))return;let n=a.items.flatMap(e=>e.querySelector(`:scope > [data-slot="hit"]`)??[]);if(n.length===0)return;let r=(n.indexOf(document.activeElement)+t+n.length)%n.length;t===`start`?r=0:t===`end`&&(r=n.length-1),e.preventDefault(),n[r].focus(),n[r].click()}let P=null,F=null,I=null;Sn(()=>{let e=K(ce),{travel:t}=i,r=t&&a.at(i.order.indexOf(t.toward)),{width:o}=a.viewport,s=K(de);if(!(n()&&s&&e&&o>0)){F=null;return}F=()=>{let n=s.scrollLeft,i=getComputedStyle(s),c={start:Number.parseFloat(i.getPropertyValue(`--edge-room-start`)),end:Number.parseFloat(i.getPropertyValue(`--edge-room-end`))},l;if(t&&r?(P??=n,l=j(L(P,e,o,c),L(P,r,o,c),Math.min(1,Math.max(0,t.fraction)))):(P=null,l=L(n,e,o,c,me===null?void 0:a.at(me),Number.parseFloat(i.getPropertyValue(`--flare`))||0)),Math.abs(l-n)>.5){xe();let e=!t&&C&&!C.held&&C.clock.playbackRate>0?C:null;e?e.ride={from:n,to:l,p0:w(e.clock)}:s.scrollLeft=l}ge()},I??=requestAnimationFrame(()=>{I=null,F?.()})}),Sn(()=>()=>{I!==null&&cancelAnimationFrame(I)});function L(e,t,n,r,i,a=0){let o=r=>{let i=t.left+t.width+r.end-n,a=t.left-r.start;return Math.max(0,i>a?a:Math.min(a,Math.max(i,e)))},s=o(r),c=e=>({left:e.left-a,width:e.width+2*a});if(!i||((e,t)=>t.left>=e-.5&&t.left+t.width<=e+n+.5)(s,c(i)))return s;let l=c(t),u=c(i),d=Math.max(l.left+l.width,u.left+u.width),f=Math.min(l.left,u.left);return d-n>f?o({start:a,end:a}):Math.max(0,Math.min(f,Math.max(d-n,e)))}let me=null,he=null;wn(()=>{let e=o.optimisticIndex;_r(()=>{he!==null&&e!==null&&e!==he&&(me=he),he=e})}),Sn(()=>{let{travel:e}=i;if(o.optimisticIndex===null||e)return;let t=requestAnimationFrame(function e(){if(C){t=requestAnimationFrame(e);return}me=null,ge()});return()=>cancelAnimationFrame(t)});function ge(){let e=K(de);if(!(n()&&e))return;let t=e.scrollLeft,{width:r}=a.viewport,i=D(e).flare,s=1/0,c=1/0;for(let e of[o.optimisticIndex,me]){let n=e===null?void 0:a.at(e);if(n){let e=n.left-i-t,a=t+r-(n.left+n.width+i);e>=-.5&&(s=Math.min(s,e)),a>=-.5&&(c=Math.min(c,a))}}let l=(t,n)=>{Number.isFinite(n)?e.style.setProperty(t,`${Math.max(0,n)}px`):e.style.removeProperty(t)};l(`--fade-cap-start`,s),l(`--fade-cap-end`,c)}let _e=ft(()=>[...a.rects.values()].some(e=>e.left+e.width>a.viewport.width+.5)),ve=.3,ye=(2*Math.PI/ve)**2,be=4*Math.PI/ve,xe=()=>{};function Se(e){let t=0,n=0,r=0,i=null,a=0,o=()=>{i!==null&&(cancelAnimationFrame(i),i=null)};xe=o;let s=o=>{let c=Math.min(.032,(o-a)/1e3);if(a=o,r+=(ye*(t-n)-be*r)*c,n+=r*c,Math.abs(t-n)<.5&&Math.abs(r)<10){e.scrollLeft=t,i=null;return}e.scrollLeft=n,i=requestAnimationFrame(s)},c=c=>{if(c.deltaX!==0){o();return}c.preventDefault();let l=c.deltaY;if(c.deltaMode===WheelEvent.DOM_DELTA_LINE?l*=16:c.deltaMode===WheelEvent.DOM_DELTA_PAGE&&(l*=e.clientWidth),!pa.current){e.scrollLeft+=l;return}i===null&&(n=e.scrollLeft,t=n,r=0,a=performance.now(),i=requestAnimationFrame(s));let u=e.scrollWidth-e.clientWidth;t=Math.max(0,Math.min(u,t+l))},l=0,u=()=>{l||=requestAnimationFrame(()=>{l=0,ge()})};e.addEventListener(`scroll`,u,{passive:!0});let d=Tn(()=>{Sn(()=>{if(!K(_e)){o();return}return e.addEventListener(`wheel`,c,{passive:!1}),()=>e.removeEventListener(`wheel`,c)})});return{destroy(){o(),d(),cancelAnimationFrame(l),e.removeEventListener(`scroll`,u)}}}var Ce=Bd();Qi(Ce,e=>({"data-slot":`ff-tabs-list`,class:e,"data-overflows":K(_e)?``:void 0,"data-scrollable":n()||void 0,"data-ride":K(c)?``:void 0,onfocusin:N,onfocusout:fe,onkeydown:pe,role:`tablist`,...r,[Hi]:{"--stack-top":4*(i.order.length+1)}}),[()=>Ru(Id({size:i.size,variant:i.variant,scrollable:n(),strip:i.strip}),t.class)]);var we=H(Ce),Te=e=>{let t=ft(()=>K(ue)??K(ce));var n=Rd();let r;An(()=>{q(n,`data-travelling`,K(M)!==void 0||void 0),r=Ni(n,``,r,{transform:`translate(${K(t).left??``}px,${K(t).top??``}px)`,width:`${K(t).width??``}px`,height:`${K(t).height??``}px`})}),Rr(e,n)};ci(we,e=>{K(ce)&&e(Te)});var Ee=U(we,2),De=e=>{var t=zd();let n;An(()=>n=Ni(t,``,n,{transform:`translate(${K(le).left??``}px,${K(le).top??``}px)`,width:`${K(le).width??``}px`,height:`${K(le).height??``}px`,"--ring-z":`calc(var(--stack-top) + 2)`,"--ring-r":`calc(var(--radius) + 2px) calc(var(--radius) + 2px) 0 0`})),Rr(e,t)};ci(Ee,e=>{K(le)&&e(De)}),oi(U(Ee,2),()=>t.children),R(Ce),ra(Ce,e=>V(de,e),()=>K(de)),xi(Ce,e=>a.container?.(e)),xi(Ce,e=>Se?.(e)),Si(Ce,()=>jd({rows:`[data-slot="ff-tab"]`,axis:`x`,ghost:i.variant!==`folder`||`unseen`,covered:`[data-slot="ff-tab"][data-tab-item-selected]`,laidOut:()=>a.rects})),Rr(e,Ce),We()}var Hd={inks:{black:`#1d1d1b`,plane:`#22221f`,white:`#f8f6f1`,vermilion:`#dc5c44`},pivots:{body:[272,420],head:[272,258],tuft:[240,122],beak:[370,186],jaw:[370,203],wingL:[205,305],handL:[139,311],wingR:[355,305],handR:[386,318],tail:[222,398],legL:[229,404],legR:[301,405]},tail:{black:`M174.07 436.26C172.87 435.71 172.00 434.51 172.00 433.38C172.00 431.82 173.38 429.57 175.94 426.97C177.28 425.61 178.36 424.38 178.35 424.25C178.28 423.58 178.21 423.50 177.74 423.50C177.45 423.50 176.70 423.89 176.07 424.37C175.44 424.86 173.06 426.16 170.78 427.28C168.49 428.39 166.44 429.40 166.21 429.52C165.84 429.70 164.76 430.12 160.38 431.76C157.36 432.88 154.12 433.55 151.07 433.68C148.15 433.81 147.96 433.79 146.70 433.17C143.58 431.63 143.46 429.14 146.29 425.22C148.09 422.74 151.97 418.65 159.87 410.93C170.88 400.17 182.63 388.59 183.66 387.47C184.20 386.88 184.45 386.41 184.35 386.15C184.12 385.56 183.51 385.66 182.27 386.50C180.80 387.50 179.50 387.52 178.74 386.56C178.27 385.97 178.21 385.66 178.33 384.38C178.41 383.55 178.88 381.75 179.38 380.38C180.89 376.23 180.87 376.09 178.62 375.45L177.38 375.09L178.19 374.66C178.64 374.43 179.37 374.22 179.81 374.21C180.26 374.19 186.25 375.12 193.12 376.27L205.61 378.35L208.96 380.57L212.31 382.79L213.72 382.04C216.46 380.59 218.51 380.13 222.12 380.15C224.90 380.16 225.66 380.26 227.29 380.80C230.27 381.78 232.39 383.10 234.65 385.35C236.90 387.61 238.21 389.73 239.20 392.71C239.76 394.38 239.84 395.05 239.84 398.00C239.84 400.95 239.76 401.62 239.20 403.29C238.16 406.44 236.92 408.38 234.28 411.03C232.96 412.35 231.69 413.77 231.46 414.19C230.98 415.08 222.90 421.25 222.23 421.25C221.71 421.25 221.03 419.21 220.82 417.00C220.70 415.74 220.22 414.75 219.73 414.75C219.62 414.75 218.82 415.34 217.95 416.06C214.48 418.94 211.13 421.27 206.49 424.02L203.42 425.84L202.69 425.42C201.77 424.89 201.15 424.89 200.72 425.41C200.15 426.10 196.74 428.60 194.62 429.87C192.09 431.41 185.94 434.43 184.62 434.78C184.07 434.93 183.23 435.21 182.75 435.40C181.47 435.90 177.31 436.75 176.14 436.74C175.58 436.74 174.65 436.52 174.07 436.26Z`,line:{d:`M178.38 423.59C177.74 422.95 177.99 422.14 178.87 422.04C179.35 421.99 179.94 421.60 180.52 420.98C181.02 420.44 181.55 420.00 181.70 420.00C182.13 420.00 183.63 418.91 184.58 417.91C185.05 417.41 185.54 417.00 185.67 417.00C185.80 417.00 186.63 416.49 187.52 415.88C189.73 414.33 190.60 414.35 189.44 415.91C188.75 416.83 185.48 420.00 185.21 420.00C184.86 420.00 183.29 421.18 182.42 422.09C181.95 422.59 181.34 423.00 181.07 423.00C180.80 423.00 180.37 423.23 180.12 423.50C179.58 424.11 178.93 424.14 178.38 423.59Z`,ink:`#3c3c39`}},legL:{black:`M236.00 481.33C234.20 480.27 229.39 476.36 224.31 471.82C223.02 470.66 221.78 469.75 221.49 469.75C220.94 469.75 219.64 470.47 214.20 473.83C208.26 477.48 203.33 479.74 201.27 479.75C200.33 479.75 198.75 478.72 198.75 478.11C198.75 477.20 202.93 473.62 207.05 471.01C209.40 469.51 211.02 468.35 213.86 466.11C215.26 465.00 217.21 463.57 218.18 462.92C219.15 462.28 220.14 461.46 220.37 461.10C220.90 460.28 222.43 456.10 222.87 454.25C223.05 453.49 223.38 452.38 223.60 451.78C223.82 451.18 224.00 450.43 224.00 450.12C224.00 449.80 224.21 448.94 224.47 448.21C224.73 447.48 225.26 445.69 225.63 444.25C226.01 442.81 226.58 440.78 226.90 439.75C228.84 433.40 228.82 433.52 228.34 432.79C228.10 432.42 227.65 431.93 227.34 431.68C225.98 430.61 223.68 426.88 222.53 423.87C222.13 422.81 220.75 417.62 220.75 417.15C220.75 417.07 221.10 417.00 221.53 417.00C222.31 417.00 222.31 416.99 222.18 415.97C222.04 414.92 220.97 413.50 220.33 413.50C220.06 413.50 220.00 411.63 220.00 403.75L220.00 394.00L228.62 394.00L237.25 394.00L237.25 405.47L237.25 416.94L240.20 417.04C243.51 417.16 244.44 417.50 245.42 418.96C246.15 420.05 246.29 421.50 246.20 427.09L246.12 431.81L244.50 432.72C242.80 433.67 240.61 434.60 239.44 434.86C238.52 435.06 238.28 435.49 236.50 440.00C235.66 442.13 234.76 444.34 234.49 444.90C234.22 445.47 234.00 446.02 234.00 446.12C234.00 446.23 233.79 446.78 233.53 447.35C233.09 448.30 232.34 450.27 231.24 453.38C230.00 456.87 229.42 458.45 229.10 459.20C228.18 461.36 228.82 462.03 232.12 462.35C236.17 462.75 245.10 464.99 248.75 466.54C253.47 468.54 258.00 471.65 258.00 472.88C258.00 473.64 257.13 474.34 256.18 474.34C255.74 474.34 254.19 474.11 252.75 473.82C250.24 473.32 249.11 473.04 242.38 471.25C239.74 470.55 235.94 469.77 235.08 469.75C234.92 469.75 234.61 469.93 234.39 470.14C233.90 470.63 234.12 471.09 235.76 473.00C237.08 474.54 238.97 477.21 239.59 478.43C240.20 479.61 240.10 480.43 239.27 481.27C238.35 482.19 237.48 482.21 236.00 481.33Z`},legR:{black:`M328.50 477.98C327.61 477.72 326.14 477.29 325.25 477.02C323.79 476.59 319.66 475.15 316.00 473.80C314.57 473.27 312.92 472.60 309.75 471.27C308.72 470.84 306.98 470.14 305.88 469.73C304.77 469.31 303.39 468.76 302.81 468.49C301.45 467.87 299.56 467.86 297.48 468.47C295.46 469.06 293.89 469.37 286.12 470.75C281.99 471.48 279.25 471.17 279.25 469.98C279.25 469.58 279.82 469.21 281.90 468.24C283.36 467.56 284.71 467.00 284.89 467.00C285.08 467.00 285.60 466.83 286.05 466.63C286.51 466.43 287.94 465.85 289.25 465.36C290.56 464.86 292.99 463.84 294.66 463.09C298.78 461.23 298.61 461.61 298.43 454.73C298.19 445.86 297.74 434.16 297.62 433.57C297.54 433.21 296.74 432.52 295.40 431.64C292.80 429.92 290.90 427.89 289.64 425.48C289.11 424.46 288.55 423.53 288.40 423.42C288.25 423.31 287.20 423.28 286.07 423.36L284.01 423.50L284.16 422.69C284.49 420.88 285.66 419.64 287.39 419.24C287.93 419.11 290.09 419.01 292.19 419.01L296.00 419.00L296.00 406.50L296.00 394.00L302.12 394.00L308.25 394.00L308.25 406.47L308.25 418.93L310.72 419.05C314.39 419.23 315.78 420.28 316.14 423.14C316.29 424.39 316.24 424.61 315.59 425.56C314.49 427.17 311.50 430.03 309.90 431.00C309.11 431.48 308.14 432.16 307.75 432.50L307.04 433.12L306.71 441.75C306.16 455.81 306.27 459.73 307.19 459.75C307.29 459.76 311.09 459.80 315.62 459.85C323.90 459.94 325.85 460.10 330.25 461.02C336.66 462.36 342.43 465.09 345.19 468.09C346.33 469.33 346.43 469.65 345.91 470.36C345.62 470.76 345.35 470.80 343.85 470.67C342.90 470.59 341.34 470.36 340.38 470.17C339.41 469.98 337.61 469.63 336.38 469.39C335.14 469.16 333.31 468.79 332.32 468.59C330.70 468.25 325.47 467.71 323.67 467.69C322.84 467.68 322.38 468.07 322.58 468.60C322.66 468.81 323.32 469.28 324.05 469.65C326.98 471.13 330.63 473.98 332.16 475.97C333.14 477.26 333.16 477.34 332.50 478.00C331.87 478.63 330.67 478.63 328.50 477.98Z`},body:{black:`M242.00 427.62L242.00 421.25L231.89 421.25L221.79 421.25L221.37 419.82C221.14 419.03 220.89 417.76 220.82 417.00C220.67 415.46 220.16 414.67 219.46 414.89C219.12 414.99 219.00 414.91 219.00 414.56C219.00 414.00 216.19 404.53 215.85 403.96C215.73 403.75 214.39 401.91 212.88 399.89L210.12 396.20L204.12 393.19C198.33 390.28 197.89 390.10 191.25 388.08C187.47 386.93 183.76 385.81 183.00 385.61C182.24 385.40 180.87 385.00 179.95 384.72C178.27 384.21 178.27 384.21 178.42 383.42C178.51 382.98 178.96 381.56 179.43 380.25C180.87 376.25 180.84 376.00 178.74 375.50C177.00 375.08 175.28 373.49 174.38 371.45C173.68 369.87 173.09 369.00 172.72 369.00C172.61 369.00 172.30 369.24 172.03 369.53L171.53 370.06L171.25 369.01C170.77 367.22 170.30 364.21 169.74 359.32C169.29 355.43 169.22 353.83 169.34 350.00C169.53 344.14 169.83 341.60 170.90 336.65C173.54 324.44 175.65 318.43 181.13 307.49C183.88 301.99 187.81 295.84 192.77 289.25C195.13 286.12 196.08 285.11 196.46 285.35C196.59 285.43 196.92 285.42 197.18 285.31C197.73 285.10 204.75 277.43 204.75 277.04C204.75 276.58 202.64 274.76 202.10 274.75C201.81 274.75 200.74 275.09 199.72 275.51C195.60 277.22 193.37 276.70 191.84 273.68C191.18 272.39 190.53 268.79 190.50 266.38C190.49 265.10 190.10 263.99 189.59 263.82C189.44 263.77 188.73 264.23 188.01 264.84C186.45 266.18 183.28 267.83 182.29 267.83C181.37 267.83 180.28 267.05 179.38 265.76C178.86 265.00 178.53 263.98 178.07 261.69C177.33 257.93 177.37 254.01 178.22 247.03C178.53 244.51 178.72 242.29 178.65 242.10C178.41 241.48 177.65 241.73 176.65 242.75C175.37 244.07 172.84 245.75 172.13 245.75C171.82 245.75 171.27 245.51 170.90 245.23C170.22 244.69 169.11 242.80 169.35 242.57C169.42 242.50 170.20 242.55 171.09 242.67L172.71 242.91L173.36 241.15C174.42 238.29 176.88 234.01 179.38 230.70C183.85 224.78 190.68 219.14 199.25 214.30C206.86 210.00 217.96 206.19 227.88 204.48C230.50 204.02 232.47 204.00 272.02 204.00C315.54 204.00 315.44 204.00 320.62 205.10C322.64 205.52 328.20 207.00 331.12 207.89C333.82 208.71 341.62 212.56 344.52 214.51C350.85 218.75 355.99 223.71 360.05 229.47C362.36 232.74 365.54 238.56 366.88 241.96C367.78 244.27 367.79 244.32 367.50 245.96C367.16 247.90 366.12 251.83 365.49 253.62C363.90 258.10 362.44 261.34 361.57 262.31C361.01 262.94 360.32 262.85 359.65 262.08C359.31 261.69 358.93 261.47 358.71 261.56C358.50 261.64 357.94 262.47 357.46 263.41C356.46 265.37 355.60 266.90 355.09 267.62C354.61 268.31 354.67 269.08 355.26 269.83C356.24 271.08 359.93 276.66 361.60 279.44C363.21 282.11 363.34 282.25 364.12 282.25C364.66 282.25 365.00 282.39 365.10 282.66C365.19 282.89 366.44 284.95 367.87 287.24C370.56 291.52 374.16 298.62 376.01 303.25C378.07 308.44 378.79 310.71 380.12 316.12C382.48 325.79 382.91 328.83 383.16 337.50C383.28 342.00 383.22 343.77 382.76 348.38C381.98 356.15 381.31 359.17 378.83 365.88C375.95 373.68 371.00 382.04 369.06 382.40C367.18 382.76 363.85 381.81 363.17 380.72C362.81 380.13 362.19 380.12 361.70 380.69C361.50 380.93 360.79 382.08 360.13 383.25C356.77 389.21 351.93 395.62 347.97 399.39C344.64 402.55 343.72 402.90 343.50 401.12C343.42 400.49 343.23 400.10 342.98 400.05C342.76 400.01 341.61 400.92 340.36 402.13C335.57 406.74 331.96 409.20 322.52 414.31C321.38 414.93 321.17 415.19 320.45 416.81C319.33 419.33 317.88 422.08 316.63 424.01C315.43 425.87 312.60 429.25 312.24 429.25C312.10 429.25 312.00 427.99 312.00 426.25L312.00 423.25L301.12 423.25L290.25 423.25L290.23 424.94L290.22 426.62L289.43 425.05C288.94 424.09 288.44 423.43 288.13 423.35C287.85 423.29 285.71 423.35 283.38 423.49C274.12 424.06 271.75 424.08 265.38 423.63C261.94 423.39 258.40 423.05 257.51 422.87C256.51 422.66 255.74 422.62 255.47 422.76C255.24 422.89 254.30 423.90 253.39 425.00C250.22 428.83 248.06 430.72 244.62 432.66C241.70 434.32 242.00 434.90 242.00 427.62Z`,lines:{wingL:{d:`M184.00 376.00C184.00 375.07 184.05 375.00 184.71 375.00C185.11 375.00 185.62 374.78 185.88 374.50C186.12 374.23 186.47 374.00 186.65 374.00C187.02 374.00 188.67 372.93 189.10 372.41C189.25 372.23 190.47 371.21 191.80 370.16C194.13 368.30 199.00 363.61 199.00 363.21C199.00 362.92 200.04 361.48 200.96 360.50C201.41 360.02 201.84 359.31 201.92 358.93C202.00 358.55 202.25 358.13 202.48 358.01C202.71 357.89 203.21 357.16 203.60 356.40C203.98 355.64 204.46 354.89 204.65 354.73C204.84 354.57 205.00 354.17 205.00 353.84C205.00 353.51 205.18 353.17 205.39 353.08C205.61 353.00 206.12 352.22 206.53 351.34C206.95 350.47 207.40 349.75 207.53 349.75C207.67 349.75 207.89 349.41 208.04 349.00C208.18 348.59 208.40 348.25 208.52 348.25C208.88 348.25 208.79 349.59 208.38 350.59C208.17 351.08 208.00 351.75 208.00 352.08C208.00 352.41 207.78 352.88 207.50 353.12C207.22 353.37 207.00 353.88 207.00 354.26C207.00 354.63 206.78 355.22 206.50 355.57C206.22 355.92 206.00 356.55 206.00 356.97C206.00 357.48 205.83 357.82 205.50 358.00C205.22 358.15 205.00 358.49 205.00 358.77C205.00 359.04 204.55 359.83 204.00 360.53C203.45 361.23 203.00 361.96 203.00 362.16C203.00 362.36 202.55 362.99 202.00 363.56C201.45 364.13 201.00 364.77 201.00 364.99C201.00 365.20 200.58 365.82 200.07 366.38C199.56 366.93 198.36 368.33 197.40 369.50C196.45 370.67 195.52 371.71 195.34 371.82C194.92 372.07 192.80 373.81 192.12 374.46C191.85 374.72 191.38 375.01 191.09 375.10C190.79 375.19 190.41 375.43 190.24 375.63C190.08 375.84 189.69 376.00 189.38 376.00C189.08 376.00 188.62 376.23 188.38 376.50C188.00 376.92 187.61 377.00 185.96 377.00C184.00 377.00 184.00 377.00 184.00 376.00Z`,ink:`#454441`},wingR:{d:`M374.45 332.62C374.36 332.21 374.21 330.98 374.12 329.88C374.03 328.77 373.62 326.69 373.21 325.25C372.79 323.81 372.23 321.45 371.96 320.01C371.68 318.58 371.13 316.50 370.73 315.40C369.92 313.19 369.78 311.93 370.36 312.15C370.55 312.23 370.84 312.59 371.00 312.96C371.73 314.70 373.45 317.41 373.94 317.61C374.12 317.68 374.50 317.50 374.79 317.21C375.28 316.72 375.30 316.51 375.15 314.46C375.06 313.23 374.76 311.53 374.49 310.68C374.23 309.82 374.00 308.83 374.00 308.48C374.00 308.12 373.79 307.22 373.54 306.48C373.28 305.73 372.99 304.68 372.89 304.14C372.79 303.59 372.55 302.92 372.35 302.64C372.16 302.37 372.00 301.87 372.00 301.53C372.00 301.20 371.79 300.47 371.53 299.90C371.28 299.34 370.93 298.48 370.76 298.00C369.38 294.07 368.86 292.80 368.46 292.28C368.21 291.95 368.00 291.54 368.00 291.37C368.00 291.20 367.83 290.92 367.62 290.75C367.42 290.58 367.25 290.24 367.25 290.01C367.25 289.77 367.02 289.32 366.75 289.00C366.22 288.38 366.09 287.75 366.50 287.75C366.64 287.75 366.75 287.85 366.75 287.96C366.75 288.08 367.20 288.87 367.75 289.72C368.30 290.57 368.75 291.42 368.75 291.60C368.75 291.78 368.98 292.22 369.25 292.57C369.52 292.92 369.75 293.39 369.75 293.63C369.75 293.86 370.03 294.39 370.38 294.80C370.72 295.20 371.00 295.73 371.00 295.96C371.00 296.19 371.23 296.71 371.50 297.12C371.77 297.54 372.00 298.13 372.00 298.45C372.00 298.77 372.22 299.44 372.48 299.95C374.57 303.95 376.76 312.65 376.75 316.94C376.75 318.43 376.66 318.84 376.24 319.26C375.72 319.78 375.62 319.76 374.44 318.91C373.19 318.00 373.08 318.53 373.69 322.56C374.47 327.72 374.81 330.97 374.71 332.25C374.63 333.29 374.61 333.32 374.45 332.62Z`,ink:`#2e2d2a`}}},wingR:{arm:{black:`M368.18 370.73C367.93 370.58 367.48 370.50 367.18 370.54C365.99 370.69 366.00 370.77 366.00 361.17L366.00 352.12L369.00 344.15L372.00 336.17L373.01 328.17L374.02 320.17L372.51 310.14L371.00 300.12L368.01 291.15C366.36 286.21 365.10 282.04 365.20 281.87C365.29 281.69 366.27 280.88 367.38 280.05C368.48 279.23 370.29 277.72 371.42 276.71C372.54 275.70 375.07 273.42 377.04 271.65C386.45 263.18 393.41 259.65 402.83 258.57C404.04 258.43 406.84 258.73 410.66 259.40C414.46 260.07 419.25 261.87 425.07 264.84C428.07 266.37 430.41 267.66 430.26 267.70C429.74 267.88 430.02 268.44 431.17 269.52C440.06 277.94 441.09 282.77 434.54 285.27C433.36 285.72 432.55 285.82 429.63 285.84C425.38 285.88 425.25 286.02 427.36 288.17C428.67 289.49 429.13 290.11 431.58 293.72C432.77 295.48 434.06 298.22 435.07 301.12C435.76 303.10 435.86 303.71 435.87 306.12C435.87 308.72 435.83 308.95 435.13 310.22C434.72 310.96 434.05 311.82 433.63 312.13C432.73 312.81 430.52 313.50 429.27 313.50C427.73 313.49 423.94 312.62 422.32 311.89C420.07 310.87 419.50 311.28 420.47 313.20C420.93 314.11 421.41 315.72 422.55 320.12C423.06 322.10 423.12 322.93 423.10 327.00L423.08 331.62L422.25 333.75C420.23 338.88 416.50 340.59 411.34 338.77C408.98 337.94 405.39 335.66 403.74 333.94C401.96 332.08 401.34 332.39 401.76 334.93C402.54 339.72 401.46 348.71 399.50 353.74C397.47 358.91 393.13 363.01 390.02 362.68C387.17 362.38 383.07 359.82 380.68 356.86C379.50 355.40 378.90 355.00 378.49 355.41C378.37 355.53 378.15 356.69 377.99 357.99C377.52 361.88 375.87 365.84 373.64 368.42C373.08 369.07 372.11 369.76 371.12 370.24C369.39 371.05 368.88 371.14 368.18 370.73Z`},hand:{vermilion:`M393.91 393.11C390.50 392.27 387.37 389.76 384.65 385.67C383.25 383.56 381.75 380.60 381.12 378.66C380.94 378.09 380.44 376.67 380.02 375.51C379.60 374.35 379.25 373.15 379.25 372.85C379.25 372.55 379.04 372.04 378.78 371.72C378.14 370.93 377.73 371.30 376.88 373.45C375.26 377.53 372.89 380.59 370.39 381.86C369.20 382.46 368.78 382.55 367.66 382.43C366.93 382.36 365.84 382.15 365.25 381.97C364.09 381.62 362.50 380.24 362.50 379.59C362.50 379.26 365.73 372.28 366.47 371.00C366.61 370.77 367.03 370.64 367.58 370.65C368.41 370.68 368.45 370.65 368.23 370.07C368.10 369.74 368.00 365.59 368.00 360.86L368.00 352.25L370.13 346.56C371.30 343.44 372.43 340.75 372.64 340.59C374.16 339.45 380.53 339.08 383.50 339.95C384.39 340.22 385.34 340.52 385.60 340.63C386.06 340.83 386.07 340.72 385.87 337.48C385.51 331.48 385.79 329.40 387.39 326.12C389.56 321.69 393.35 318.56 398.00 317.37C398.99 317.12 400.63 316.95 402.21 316.95C404.73 316.94 404.79 316.93 404.64 316.41C404.27 315.16 404.08 311.86 404.26 310.06C404.75 305.15 407.39 300.83 411.58 298.09C412.57 297.44 413.41 296.88 413.46 296.85C413.51 296.82 413.09 296.02 412.54 295.08C411.26 292.91 410.50 290.64 410.27 288.25C409.79 283.38 411.15 278.95 414.22 275.47L415.21 274.34L414.72 272.61C414.11 270.47 414.05 266.05 414.60 264.04C414.80 263.30 415.00 262.66 415.05 262.62C415.31 262.36 419.43 264.14 424.68 266.80C428.01 268.48 430.81 269.77 430.91 269.68C431.01 269.58 430.84 269.24 430.54 268.92C429.75 268.08 429.83 267.65 430.75 267.84C431.53 267.99 433.47 269.09 438.12 272.00C439.64 272.94 441.83 274.29 443.00 274.99C446.63 277.17 449.54 279.09 452.13 281.02C453.50 282.04 454.87 283.04 455.17 283.25C456.96 284.49 461.58 288.28 465.22 291.50C474.15 299.39 478.65 305.27 481.68 313.00C482.19 314.31 482.32 315.09 482.35 317.00C482.37 319.19 482.32 319.47 481.66 320.58C480.76 322.12 480.08 322.71 478.34 323.44C475.89 324.48 471.78 324.06 466.62 322.25C464.28 321.42 458.79 318.83 457.43 317.90C456.30 317.13 455.61 317.07 455.26 317.72C455.06 318.10 455.19 318.41 455.91 319.31C457.00 320.65 461.05 327.66 462.73 331.12C466.35 338.57 467.60 342.74 468.52 350.41C468.81 352.85 468.80 353.03 468.13 355.72C467.66 357.63 467.21 358.83 466.71 359.52C463.79 363.55 457.79 363.06 450.72 358.22C448.10 356.42 440.67 349.52 438.27 346.65C437.08 345.23 436.53 344.75 436.15 344.80C435.39 344.91 435.37 345.62 436.07 347.34C437.09 349.86 438.61 356.18 439.36 361.00C440.45 367.99 440.46 372.61 439.40 377.81C438.48 382.32 436.99 384.70 434.12 386.21C433.00 386.81 432.61 386.87 430.25 386.87C427.69 386.87 427.57 386.84 425.44 385.83C424.24 385.26 422.59 384.27 421.77 383.64C420.05 382.32 415.95 378.00 414.52 376.00C413.25 374.23 410.20 368.91 409.74 367.65C409.33 366.56 408.77 366.09 408.16 366.33C407.83 366.45 407.75 366.86 407.75 368.43C407.75 373.33 406.85 379.15 405.51 382.88C403.13 389.55 401.34 391.98 398.17 392.86C396.05 393.45 395.45 393.48 393.91 393.11Z`}},head:{black:`M300.00 289.00C300.00 268.36 299.94 263.00 299.69 263.01C299.52 263.02 293.25 263.72 285.76 264.58L272.15 266.13L243.26 263.08L214.38 260.03L198.38 254.55C189.57 251.54 181.77 248.87 181.03 248.63L179.69 248.19L179.82 246.69C179.96 245.22 179.94 245.19 179.25 244.92C178.57 244.67 178.54 244.58 178.58 243.26C178.62 242.05 178.56 241.87 178.12 241.81C177.81 241.76 177.27 242.11 176.68 242.72C175.79 243.64 175.69 243.68 174.89 243.44C174.18 243.22 173.91 243.26 173.18 243.72C172.02 244.43 171.82 244.40 171.22 243.38C170.82 242.70 170.54 242.50 169.99 242.50C169.33 242.50 169.27 242.41 169.12 241.31C169.03 240.66 168.79 239.49 168.60 238.71C167.41 233.95 167.43 212.42 168.63 206.25C168.83 205.22 169.11 203.53 169.26 202.50C169.92 197.92 172.90 186.98 174.61 182.91C174.79 182.48 175.20 181.45 175.51 180.62C176.12 178.99 177.26 176.24 178.02 174.57C178.28 173.98 178.50 173.45 178.50 173.39C178.50 172.99 181.42 167.27 183.28 164.02C186.42 158.55 190.85 151.89 193.33 148.93C196.76 144.84 201.49 139.63 203.17 138.10C204.25 137.12 205.63 135.85 206.25 135.29C207.26 134.36 207.51 134.26 208.66 134.25L209.94 134.25L212.16 131.97C215.41 128.63 218.79 125.67 220.39 124.76C221.17 124.32 221.86 123.75 221.93 123.49C222.08 122.91 225.98 119.70 229.25 117.45C233.06 114.82 239.18 111.48 244.27 109.24C247.58 107.79 255.54 105.05 258.50 104.36C259.94 104.02 261.29 103.69 261.50 103.62C261.74 103.55 262.08 103.87 262.44 104.50C263.29 105.98 264.04 106.39 265.22 106.04C265.75 105.88 267.35 105.63 268.78 105.49C270.21 105.35 272.04 105.13 272.84 105.00C275.34 104.61 283.69 104.44 286.88 104.72C291.20 105.10 296.44 105.70 297.75 105.97C298.37 106.10 300.00 106.44 301.38 106.72C304.87 107.45 309.79 108.82 312.50 109.84C323.31 113.86 332.08 119.39 339.84 127.08C347.66 134.83 353.63 143.04 357.85 151.87C359.45 155.19 361.75 160.62 361.75 161.06C361.75 161.71 363.23 163.75 363.70 163.75C364.10 163.75 364.48 165.19 366.70 175.06C368.90 184.83 372.58 203.84 373.13 208.33C373.29 209.63 373.25 209.84 372.74 210.39C372.23 210.93 372.20 211.09 372.44 211.93C372.59 212.45 372.78 213.61 372.88 214.50C372.97 215.39 373.25 217.08 373.50 218.25C374.57 223.18 374.96 231.02 374.40 236.25C373.93 240.56 373.28 242.92 372.25 244.08C371.42 245.01 370.85 244.86 369.94 243.50C369.35 242.62 368.63 242.27 368.23 242.67C368.11 242.79 367.84 243.90 367.63 245.13C367.23 247.55 366.21 251.61 365.49 253.62C363.88 258.16 362.44 261.34 361.57 262.31C361.01 262.94 360.32 262.85 359.65 262.08C359.31 261.69 358.93 261.47 358.71 261.56C358.50 261.64 357.94 262.47 357.46 263.41C356.46 265.37 355.60 266.90 355.09 267.62C354.60 268.32 354.67 269.08 355.30 269.88C355.60 270.26 356.31 271.27 356.89 272.13L357.94 273.69L355.48 276.99C347.62 287.53 338.03 296.37 326.92 303.30C322.51 306.05 315.00 309.83 310.25 311.68C306.42 313.18 300.98 315.00 300.33 315.00C300.06 315.00 300.00 310.51 300.00 289.00Z`},tuft:{black:`M204.43 136.95C205.23 136.24 206.38 135.18 207.00 134.60C209.12 132.60 215.98 127.37 218.16 126.09C218.60 125.83 219.59 125.26 220.36 124.80C221.14 124.35 221.84 123.82 221.91 123.61C222.18 122.92 221.52 122.52 220.16 122.55C219.46 122.57 215.78 122.45 212.00 122.30C202.55 121.91 198.78 121.08 197.06 119.04C196.33 118.17 196.29 116.14 196.99 114.77C198.01 112.77 201.70 110.24 205.75 108.77C210.23 107.14 216.20 106.00 220.29 106.00C222.85 106.00 230.11 106.94 232.08 107.52C233.99 108.09 234.83 108.07 234.95 107.46C235.04 106.96 234.93 106.87 232.38 105.20C223.58 99.48 218.26 93.93 218.25 90.47C218.25 88.59 219.40 87.12 221.84 85.88L223.81 84.88L228.59 84.89C233.19 84.90 233.48 84.93 236.12 85.69C240.12 86.84 241.36 87.32 244.71 89.00C252.22 92.77 257.96 97.76 262.28 104.27C263.47 106.05 264.11 106.43 265.27 106.03C267.83 105.14 265.94 106.25 258.37 110.07L249.86 114.38L242.36 120.02C238.24 123.13 230.62 128.50 225.44 131.96L216.00 138.25L209.50 138.25L202.99 138.25L204.43 136.95Z`},beak:{lower:`M317.07 218.64L306.01 216.14L305.00 213.13L304.00 210.13L305.06 209.10L306.12 208.07L313.88 207.14L321.62 206.20L330.75 203.69C339.55 201.26 340.13 201.06 347.00 198.12C361.84 191.77 382.44 184.59 396.38 180.90C403.71 178.96 405.71 178.55 420.38 176.00C429.18 174.46 436.81 173.21 437.35 173.21C438.33 173.22 438.80 173.58 438.69 174.22C438.62 174.61 438.47 174.70 436.50 175.58C425.51 180.51 417.67 184.26 411.91 187.36C409.55 188.62 406.50 190.26 405.12 191.00C402.90 192.19 400.32 193.66 392.62 198.12C386.57 201.64 377.90 206.85 375.00 208.73L373.38 209.78L373.17 208.53L372.97 207.28L370.67 208.36C369.41 208.95 364.77 211.15 360.38 213.26L352.38 217.08L340.25 219.11L328.12 221.15L317.07 218.64Z`,plane:`M305.04 212.09L304.01 210.02L305.01 205.07C305.89 200.70 306.23 199.56 307.94 195.25C309.87 190.38 309.88 190.37 312.95 186.25C315.65 182.62 316.41 181.79 319.32 179.29C321.14 177.72 324.65 175.09 327.12 173.43L331.61 170.42L338.74 168.59C344.86 167.02 345.95 166.67 346.38 166.14C346.82 165.59 347.59 165.36 352.63 164.27C355.79 163.59 359.10 162.74 359.98 162.39C360.87 162.04 361.67 161.75 361.76 161.75C361.86 161.75 362.21 162.17 362.55 162.68L363.17 163.61L371.52 163.54C379.86 163.46 389.43 163.79 392.50 164.26C393.39 164.39 396.23 164.67 398.81 164.86C401.39 165.06 403.60 165.28 403.71 165.35C403.83 165.43 405.38 165.66 407.15 165.88C408.92 166.09 411.11 166.42 412.00 166.62C412.89 166.81 414.52 167.14 415.62 167.35C419.53 168.10 424.98 169.37 429.12 170.50C430.77 170.95 432.86 171.52 433.75 171.76C435.64 172.27 437.49 173.03 437.12 173.16C436.19 173.48 418.48 178.86 412.12 180.76C407.70 182.09 401.26 184.25 397.12 185.81C393.14 187.31 385.09 190.16 379.25 192.12C366.32 196.48 356.37 200.22 347.25 204.13C340.76 206.91 339.88 207.22 331.50 209.56L322.62 212.05L314.34 213.10L306.06 214.15L305.04 212.09Z`},eyes:{big:{white:`M265.38 229.37C256.80 227.78 249.74 222.99 243.96 214.88C240.98 210.68 238.71 205.27 236.88 198.00C235.05 190.73 234.96 181.03 236.65 174.38C239.36 163.72 243.14 157.35 249.89 152.05C254.29 148.61 260.48 146.57 265.75 146.83C274.37 147.25 282.25 151.85 288.37 160.01C293.11 166.33 294.76 169.34 295.84 173.62C296.02 174.31 296.28 175.10 296.42 175.38C296.56 175.65 296.76 176.36 296.85 176.96C296.94 177.56 297.17 178.35 297.35 178.71C297.54 179.08 297.96 180.95 298.28 182.88C299.37 189.32 299.02 198.77 297.47 204.50C296.02 209.87 294.04 214.45 291.86 217.50C290.20 219.81 286.95 223.05 284.70 224.65C281.80 226.71 278.01 228.42 275.08 229.01C271.70 229.69 267.87 229.83 265.38 229.37Z`,lid:`M265.38 231.35C256.31 229.77 248.46 224.55 242.46 216.12C239.33 211.73 236.72 205.43 234.78 197.62C233.01 190.49 233.00 180.87 234.75 174.01C237.26 164.16 240.82 157.54 246.25 152.61C250.60 148.65 254.94 146.41 260.46 145.27C263.61 144.62 266.12 144.61 269.26 145.25C277.80 146.99 284.36 151.35 290.09 159.09C295.43 166.29 296.68 168.77 298.55 175.88C298.69 176.43 299.02 177.49 299.28 178.25C301.35 184.42 301.44 197.17 299.47 204.50C297.93 210.23 295.64 215.57 293.36 218.75C291.71 221.05 288.21 224.55 286.00 226.11C282.15 228.84 278.26 230.46 273.78 231.22C270.25 231.82 268.23 231.85 265.38 231.35Z`,pupil:`M285.48 196.03C283.01 195.06 279.96 192.36 278.11 189.50C275.29 185.15 273.31 178.85 273.07 173.45C272.78 167.12 275.02 161.86 278.71 160.17C280.47 159.37 282.94 159.43 284.86 160.32C288.06 161.82 290.23 164.38 292.95 169.88C293.16 170.29 293.50 170.83 293.71 171.07C294.23 171.67 295.42 174.71 296.04 177.00C296.42 178.41 296.58 179.97 296.67 183.30C296.79 187.30 296.76 187.89 296.28 189.45C296.00 190.39 295.47 191.69 295.12 192.32C294.26 193.85 292.07 195.82 290.82 196.20C289.37 196.63 286.82 196.55 285.48 196.03Z`,closed:`M292.56 199.18L291.56 202.58L290.29 205.82L288.77 208.87L287.01 211.70L285.04 214.27L282.87 216.56L280.53 218.54L278.04 220.19L275.44 221.50L272.74 222.44L269.98 223.01L267.19 223.20L264.41 223.01L261.65 222.44L258.95 221.50L256.35 220.19L253.86 218.54L251.52 216.56L249.35 214.27L247.37 211.70L245.62 208.87L244.10 205.82L242.83 202.58L241.83 199.18L241.83 199.18L242.83 200.26L244.10 201.81L245.62 203.39L247.37 204.91L249.35 206.33L251.52 207.61L253.86 208.72L256.35 209.66L258.95 210.41L261.65 210.95L264.41 211.27L267.19 211.38L269.98 211.27L272.74 210.95L275.44 210.41L278.04 209.66L280.53 208.72L282.87 207.61L285.04 206.33L287.01 204.91L288.77 203.39L290.29 201.81L291.56 200.26L292.56 199.18Z`,center:[267.19,188.44],pupilAt:[284.9,178.17],travel:[18,21],top:144.88,bottom:231.62,left:233.38,right:300.88},small:{white:`M328.05 170.08C327.43 169.83 325.21 164.91 323.75 160.54C321.48 153.75 320.91 150.64 320.89 145.00C320.88 141.25 320.96 140.02 321.35 138.50C322.59 133.59 325.11 130.87 328.89 130.37C331.64 130.00 335.64 131.74 339.59 135.01C340.91 136.10 342.15 137.25 342.37 137.58C342.82 138.28 345.93 165.44 345.59 165.73C345.43 165.87 332.92 169.13 328.75 170.12C328.54 170.17 328.23 170.15 328.05 170.08Z`,lid:`M327.32 171.76C326.36 171.32 326.15 171.04 324.87 168.49C323.15 165.07 320.52 157.27 319.59 152.88C318.98 150.01 318.90 149.07 318.89 144.88C318.88 140.67 318.94 139.89 319.45 138.03C321.03 132.28 323.83 129.31 328.47 128.45C330.39 128.09 332.48 128.57 335.62 130.09C339.17 131.81 343.47 135.31 344.29 137.15C344.64 137.94 345.13 141.60 346.26 151.67C347.88 166.11 347.90 166.57 346.68 167.36C346.37 167.55 342.30 168.68 337.62 169.87C332.95 171.06 328.96 172.07 328.75 172.13C328.54 172.19 327.90 172.02 327.32 171.76Z`,pupil:`M346.62 165.72C344.88 165.17 340.06 157.38 338.65 152.85C337.26 148.37 336.91 144.68 337.61 142.03C338.19 139.86 339.91 138.39 341.56 138.66C342.48 138.81 342.85 138.55 342.61 137.92C342.53 137.71 341.68 136.86 340.73 136.04L339.00 134.53L339.88 132.86C342.79 127.26 346.92 124.93 351.12 126.51C353.21 127.30 355.77 129.88 357.17 132.62C359.25 136.68 360.11 140.58 360.11 146.00C360.11 151.42 359.25 155.32 357.17 159.38C355.78 162.09 353.21 164.71 351.18 165.46C349.67 166.02 347.91 166.12 346.62 165.72Z`,closed:`M342.74 155.38L342.35 157.01L341.86 158.57L341.27 160.04L340.58 161.39L339.81 162.63L338.97 163.73L338.06 164.68L337.09 165.47L336.07 166.10L335.02 166.55L333.95 166.83L332.86 166.92L331.77 166.83L330.70 166.55L329.65 166.10L328.63 165.47L327.66 164.68L326.75 163.73L325.90 162.63L325.13 161.39L324.45 160.04L323.86 158.57L323.36 157.01L322.97 155.38L322.97 155.38L323.36 155.90L323.86 156.65L324.45 157.40L325.13 158.13L325.90 158.81L326.75 159.43L327.66 159.96L328.63 160.42L329.65 160.77L330.70 161.03L331.77 161.19L332.86 161.24L333.95 161.19L335.02 161.03L336.07 160.77L337.09 160.42L338.06 159.96L338.97 159.43L339.81 158.81L340.58 158.13L341.27 157.40L341.86 156.65L342.35 155.90L342.74 155.38Z`,center:[332.86,150.22],pupilAt:[349.06,145.83],travel:[-1,-2],top:128.38,bottom:172.12,left:318.88,right:347.62}},wingL:{arm:{black:`M153.88 371.01C152.71 370.71 150.45 369.61 149.70 368.96C148.68 368.08 146.52 365.27 145.89 364.00C145.58 363.38 145.07 361.75 144.75 360.38C144.25 358.15 144.20 357.44 144.32 353.88C144.41 351.27 144.59 349.44 144.85 348.62C145.07 347.94 145.25 347.18 145.25 346.94C145.25 346.20 144.35 346.44 143.12 347.50C137.76 352.14 130.04 355.00 125.49 354.02C123.84 353.67 121.82 352.74 120.76 351.85C118.93 350.31 117.19 347.00 116.76 344.25C116.38 341.86 116.44 335.36 116.87 332.56C117.30 329.70 118.91 324.34 120.05 321.93C120.79 320.37 120.82 320.21 120.44 319.84C120.07 319.46 119.97 319.47 119.21 319.95C115.72 322.15 109.74 324.34 106.32 324.67C102.61 325.03 98.99 323.47 97.55 320.88C96.98 319.85 97.00 315.99 97.59 313.50C98.31 310.49 101.85 303.60 104.00 301.03C105.98 298.65 106.23 297.87 104.94 298.08C104.49 298.15 103.51 298.39 102.76 298.61C100.71 299.20 96.25 299.14 94.16 298.49C92.30 297.92 91.00 296.96 91.00 296.17C91.01 295.44 92.06 293.22 92.94 292.06C93.34 291.55 94.14 290.48 94.73 289.69C96.28 287.63 99.50 284.54 102.25 282.51C105.10 280.40 105.75 279.81 105.75 279.35C105.75 278.87 104.31 278.90 102.55 279.41C100.82 279.91 95.80 279.75 93.88 279.14C91.35 278.33 89.80 276.72 90.13 275.23C90.33 274.30 92.32 271.28 93.91 269.49C95.66 267.51 96.77 266.58 99.81 264.52C102.35 262.81 102.92 262.26 102.19 262.24C102.02 262.24 103.62 261.39 105.75 260.35C112.88 256.88 119.69 254.59 126.62 253.34C130.43 252.65 136.30 252.71 140.00 253.46C146.46 254.77 151.77 257.18 159.00 262.08C161.74 263.94 166.95 267.91 172.50 272.39C181.68 279.81 187.42 283.11 193.98 284.75C196.94 285.49 197.77 285.46 198.10 284.61C198.22 284.29 199.06 285.25 201.52 288.53L204.78 292.88L206.19 293.06C211.32 293.73 215.34 297.23 216.62 302.14C217.96 307.30 215.37 313.08 210.61 315.55C208.78 316.50 208.96 315.97 208.50 321.75L208.23 325.12L202.23 334.14L196.23 343.16L189.18 349.69C184.14 354.35 181.12 356.94 178.62 358.72C175.52 360.93 175.10 361.16 174.95 360.73C174.85 360.47 174.64 360.25 174.48 360.25C174.33 360.25 172.72 361.62 170.91 363.29C167.29 366.65 165.59 367.84 161.92 369.60C158.81 371.10 156.10 371.57 153.88 371.01Z`},hand:{vermilion:`M118.25 394.34C116.59 393.91 114.61 392.92 113.71 392.07C112.00 390.47 110.39 386.24 109.97 382.25C109.64 379.12 109.86 372.26 110.39 369.51C110.84 367.14 110.84 366.39 110.39 366.01C109.84 365.55 109.36 365.95 107.88 368.11C104.38 373.19 97.08 380.41 91.88 383.92C88.05 386.50 84.75 387.75 81.33 387.93C78.89 388.06 78.72 388.03 77.19 387.32C74.33 385.98 72.97 384.29 72.12 381.00C71.56 378.83 71.56 373.05 72.11 369.50C73.18 362.73 76.88 352.85 80.76 346.43C81.75 344.78 81.95 343.77 81.33 343.57C81.16 343.51 79.89 344.50 78.50 345.76C72.98 350.78 63.30 357.37 57.88 359.80C54.40 361.36 52.24 361.88 49.13 361.88C46.12 361.88 45.23 361.59 43.60 360.07C42.35 358.90 42.01 358.19 41.61 355.90C41.01 352.49 41.56 349.39 43.87 343.05C45.99 337.21 53.88 325.67 60.06 319.35C61.40 317.98 62.02 317.16 61.96 316.85C61.82 316.12 61.16 316.16 59.97 316.96C57.41 318.67 49.67 321.57 44.12 322.89C40.26 323.81 35.12 323.57 32.70 322.35C28.80 320.38 28.95 315.00 33.08 308.88C37.37 302.52 43.52 296.75 54.62 288.67C60.69 284.26 63.34 282.51 70.75 278.04C78.08 273.62 80.49 272.33 91.25 267.05C100.18 262.67 102.50 261.72 102.50 262.47C102.50 262.60 101.58 263.33 100.45 264.10C98.30 265.57 98.20 265.91 100.20 264.91C100.84 264.58 101.79 264.18 102.30 264.02C102.80 263.86 104.78 262.95 106.70 262.01C108.61 261.07 110.95 260.00 111.90 259.64C112.85 259.27 114.19 258.76 114.88 258.49C115.56 258.23 116.47 257.94 116.90 257.86C117.66 257.71 117.69 257.74 117.98 258.90C118.42 260.63 118.36 264.59 117.87 266.54L117.46 268.18L118.64 269.90C120.77 273.01 121.54 275.53 121.54 279.38C121.54 282.75 120.86 285.32 119.24 288.02L118.70 288.91L119.45 290.14C121.45 293.40 122.11 298.45 121.12 302.90L120.95 303.68L122.29 303.81C126.57 304.26 131.20 307.23 133.85 311.21C135.83 314.20 136.54 316.64 136.54 320.38C136.54 323.24 136.14 325.08 134.89 327.95C133.88 330.27 132.75 333.79 132.75 334.64C132.75 335.23 132.80 335.21 134.28 334.12C136.17 332.73 138.37 331.67 140.50 331.12C142.66 330.56 146.84 330.56 149.00 331.12C154.70 332.59 159.15 337.04 160.63 342.75C160.92 343.86 161.05 345.35 161.05 347.44C161.04 349.12 161.10 350.50 161.18 350.50C161.25 350.50 162.02 349.84 162.88 349.04C165.77 346.33 168.86 344.88 172.50 344.52C177.39 344.03 181.80 345.40 185.32 348.50L186.48 349.52L183.80 352.02C182.33 353.40 179.46 355.71 177.44 357.16C174.01 359.61 173.00 360.50 173.00 361.10C173.00 361.23 173.28 361.08 173.61 360.76C174.26 360.15 175.00 360.21 175.00 360.87C175.00 361.09 174.72 361.95 174.38 362.79C174.04 363.63 173.58 365.23 173.37 366.34C173.08 367.90 172.83 368.54 172.28 369.12C171.89 369.53 170.89 370.89 170.07 372.12C168.23 374.88 164.22 379.41 162.05 381.19C158.75 383.90 156.48 384.82 153.09 384.82C150.91 384.82 150.70 384.77 149.52 384.01C147.00 382.40 145.44 379.41 144.33 374.12C144.02 372.62 143.32 372.76 142.38 374.52C141.33 376.45 138.21 381.02 136.47 383.16C131.48 389.28 126.88 392.87 122.50 394.07C120.26 394.68 119.70 394.72 118.25 394.34Z`}}},Ud=ga,Wd=ha;ma(.55,0,1,.45);function Gd(e,t){let[n]=t;if(!n||e<=n[0])return n?n[1]:0;for(let n=1;n<t.length;n+=1){let r=t[n];if(e<=r[0]){let i=t[n-1],a=r[0]-i[0],o=a>0?(e-i[0])/a:1,s=r[2]===`out`?Wd(o):Ud(o);return i[1]+(r[1]-i[1])*s}}return t.at(-1)?.[1]??0}function Kd(e,t,n,r=`out`){if(e<=t)return 0;if(e>=n)return 1;let i=(e-t)/(n-t);return r===`out`?Wd(i):Ud(i)}function qd(e,t,n=0){return Math.sin((e/t+n)*Math.PI*2)}function Jd(e,t,n=0){return qd(e,t,n)-qd(0,t,n)}function Yd(e,t=0){let n=Math.sin(e*12.9898+t*78.233)*43758.5453;return n-Math.floor(n)}function Xd(e,t){let n=e%t;return n<0?n+t:n}var Zd=64,Qd=class{state={frames:0,held:!1,live:!1,motion:!0,onScreen:!1,t:0,tabShown:!0};#e;#t;#n=0;#r=0;#i;#a;#o=()=>{this.state.tabShown=document.visibilityState===`visible`,this.#c()};#s=()=>{this.state.motion=!this.#a?.matches,this.state.motion||(this.state.t=0,this.#t(0,0)),this.#c()};constructor(e,t,n=0){this.#e=e,this.state.t=Xd(n,e),this.#t=t}get period(){return this.#e}set period(e){this.state.t=this.state.t/this.#e*e,this.#e=e}watch(e){return this.#a=window.matchMedia(`(prefers-reduced-motion: reduce)`),this.#a.addEventListener(`change`,this.#s),this.state.motion=!this.#a.matches,this.state.motion||(this.state.t=0),document.addEventListener(`visibilitychange`,this.#o),this.state.tabShown=document.visibilityState===`visible`,this.#i=new IntersectionObserver(e=>{let t=e.at(-1);t&&(this.state.onScreen=t.isIntersecting,this.#c())}),this.#i.observe(e),this.#t(this.state.t,0),()=>this.stop()}stop(){this.#i?.disconnect(),this.#a?.removeEventListener(`change`,this.#s),document.removeEventListener(`visibilitychange`,this.#o),cancelAnimationFrame(this.#n),this.#n=0,this.state.live=!1}seek(e){this.state.held=!0,this.state.t=e,this.#c(),this.#t(e,0)}release(){this.state.held=!1,this.#c()}redraw(){this.#t(this.state.motion?this.state.t:0,0)}#c(){let e=this.state,t=e.onScreen&&e.tabShown&&e.motion&&!e.held;t!==e.live&&(e.live=t,cancelAnimationFrame(this.#n),this.#n=0,t&&(this.#r=performance.now(),this.#n=requestAnimationFrame(this.#l)))}#l=e=>{let t=Math.min(Zd,Math.max(0,e-this.#r));this.#r=e,this.state.t=Xd(this.state.t+t,this.#e),this.state.frames+=1,this.#t(this.state.t,t),this.state.live&&(this.#n=requestAnimationFrame(this.#l))}},$d=Hd.eyes.big,ef=[($d.pupilAt[0]-$d.center[0])/$d.travel[0],($d.pupilAt[1]-$d.center[1])/$d.travel[1]],tf={L:73,R:68};function nf(e,t){let n=t.a-tf[e]+t.e;return e===`L`?-n:n}var rf={a:124,e:32,out:20},af={ready:{wingL:{a:73,e:0},wingR:{a:68,e:0},tilt:0,yaw:0,gaze:ef,lid:0,beak:0,breath:1,weight:0},waving:{wingL:{a:124,e:18},wingR:{a:52,e:-8},tilt:-4,yaw:-.22,gaze:[.2,.05],lid:0,beak:8,breath:1,weight:-.4,accent:{on:`handL`,amp:12,every:760}},phoneUp:{wingL:rf,wingR:{a:44,e:-6},tilt:-6,yaw:-.3,gaze:[-.75,-.7],lid:0,beak:0,breath:1,weight:.35,prop:{prop:`phone`,on:`handL`,at:[40,306],rotate:nf(`L`,rf),scale:1.1}},cheer:{wingL:{a:112,e:35,out:22},wingR:{a:120,e:30,out:22},tilt:-3,yaw:-.18,gaze:[-.2,-.45],lid:0,beak:28,breath:1.3,weight:0,accent:{on:`handL`,amp:5,every:520}},shrug:{wingL:{a:94,e:26},wingR:{a:90,e:24},tilt:9,yaw:-.12,gaze:[.45,-.8],lid:0,beak:5,breath:1,weight:.15},letGo:{wingL:{a:34,e:-8},wingR:{a:30,e:-10},tilt:5,yaw:.08,gaze:[.55,.75],lid:0,beak:0,breath:.8,weight:.2,prop:{prop:`phone`,on:`ground`,at:[432,442],rotate:0}}};function of(e,t,n,r=0){let i=-e/2,a=r-t/2;return`M${i+n} ${a}H${i+e-n}A${n} ${n} 0 0 1 ${i+e} ${a+n}V${a+t-n}A${n} ${n} 0 0 1 ${i+e-n} ${a+t}H${i+n}A${n} ${n} 0 0 1 ${i} ${a+t-n}V${a+n}A${n} ${n} 0 0 1 ${i+n} ${a}Z`}var sf={phone:{shapes:[{d:of(44,76,11),ink:`black`},{d:of(34,66,7),ink:`paper`},{d:of(10,3,1.5,-27),ink:`black`}]}};function cf(e){return[[e,0],[e+110,1],[e+150,1],[e+340,0,`out`]]}var lf={calm:{period:7200,breath:{every:3600,lift:1.6,swell:.012},blinks:[600,3800,4060],glances:[{at:3800,to:[-.55,.25],yaw:-.1,hold:1500}],head:{every:7200,tilt:1.6},wing:{sway:1.6,curl:2.5},weight:1.2,tail:2.5,tuft:2},attentive:{period:6e3,breath:{every:3e3,lift:1.8,swell:.014},blinks:[400,3300],glances:[{at:400,to:[-.6,.2],yaw:-.12,hold:1200},{at:3300,to:[0,-.35],yaw:.05,hold:1e3}],head:{every:6e3,tilt:2.2},wing:{sway:2.4,curl:3.5},weight:1.6,tail:3.5,tuft:3}};function uf(e){return[[0,0],...e.blinks.flatMap(cf),[e.period,0]]}function df(e,t){return[[0,0],...e.glances.flatMap(e=>[[e.at,0],[e.at+520,t(e)],[e.at+520+e.hold,t(e)],[e.at+1040+e.hold,0]]),[e.period,0]]}var ff=Hd.pivots;function pf(e,t){return[e[0]*t[0]+e[2]*t[1],e[1]*t[0]+e[3]*t[1],e[0]*t[2]+e[2]*t[3],e[1]*t[2]+e[3]*t[3],e[0]*t[4]+e[2]*t[5]+e[4],e[1]*t[4]+e[3]*t[5]+e[5]]}function mf(e,t){let n=e*Math.PI/180,r=Math.cos(n),i=Math.sin(n);return[r,i,-i,r,t[0]-r*t[0]+i*t[1],t[1]-i*t[0]-r*t[1]]}function hf(e,t){return[1,0,0,1,e,t]}function gf(e,t,n){return[e,0,0,t,n[0]-e*n[0],n[1]-t*n[1]]}var _f=205,vf={beak:.13,face:.1,tuft:-.09},yf=.4,bf=6,xf=74,Sf={wing:90,head:110,tuft:120},Cf=.45,wf=2;function Tf(e){return{aL:e.wingL.a,oL:e.wingL.out??0,oR:e.wingR.out??0,eL:e.wingL.e,aR:e.wingR.a,eR:e.wingR.e,tilt:e.tilt,yaw:e.yaw,gx:e.gaze[0],gy:e.gaze[1],lid:e.lid,beak:e.beak,breath:e.breath,weight:e.weight}}function Ef(e,t,n){let r={...e};for(let i of Object.keys(e))r[i]=e[i]+(t[i]-e[i])*n;return r}function Df(e,t){return e.duration<=0?1:Kd(t,e.start,e.start+e.duration,`inOut`)}function Of(e,t){return Ef(e.fromChannels??Tf(e.from),Tf(e.to),Df(e,t))}function kf(e,t,n){return{from:e.to,fromChannels:Of(e,t),to:n,start:t,duration:640,blink:Math.abs(n.yaw-Of(e,t).yaw)>Af}}var Af=.12,jf=[[0,0],[110,1],[150,1],[340,0,`out`]];function Mf(e){return{from:e,to:e,start:0,duration:0}}function Nf(e){return{idle:e,lid:uf(e),gx:df(e,e=>e.to[0]),gy:df(e,e=>e.to[1]),yaw:df(e,e=>e.yaw)}}var Pf=e=>Math.min(1,Math.max(0,e));function Ff(e){let t=e.period;return{drift:n=>e.weight*Jd(n,t,.25),nod:t=>e.head.tilt*Jd(t,e.head.every,.35),swayL:n=>e.wing.sway*(Jd(n,t/3,0)+.5*Jd(n,t/5,.3)),swayR:n=>e.wing.sway*(Jd(n,t/3,.5)+.5*Jd(n,t/5,.8))}}function If(e,t,n){return qd(e,t/Math.max(1,Math.round(t/n)))}function Lf(e,t,n,r){let i=e.accent;return i&&i.on===t?i.amp*If(n,r,i.every):0}function Rf(e){let t=e[0]*e[3]-e[1]*e[2];return[e[3]/t,-e[1]/t,-e[2]/t,e[0]/t,(e[2]*e[5]-e[3]*e[4])/t,(e[1]*e[4]-e[0]*e[5])/t]}function zf(e,t,n){let r=e=>Math.atan2(e[1],e[0]),i=e=>Math.hypot(e[0],e[1]),a=r(t)-r(e);a-=Math.round(a/(2*Math.PI))*2*Math.PI;let o=r(e)+a*n,s=i(e)+(i(t)-i(e))*n;return[Math.cos(o)*s,Math.sin(o)*s,-Math.sin(o)*s,Math.cos(o)*s,e[4]+(t[4]-e[4])*n,e[5]+(t[5]-e[5])*n]}function Bf(e,t=e.scale??1){return pf(hf(e.at[0],e.at[1]),pf(mf(e.rotate,[0,0]),gf(t,t,[0,0])))}var Vf=.6,Hf=120;function Uf(e,t){let n=Wd(t);if(e.on===`ground`)return{key:e.prop,prop:e.prop,home:`ground`,m:pf(hf(0,Hf*(1-n)),Bf(e))};let r=ff[e.on],i=Bf({...e,at:[r[0],r[1]]},(e.scale??1)*Vf);return{key:e.prop,prop:e.prop,home:e.on,m:zf(i,Bf(e),n)}}function Wf(e,t,n){let r=e.from.prop,i=e.to.prop;if(r&&i&&r.prop===i.prop){let e=e=>e.on===`ground`?Bf(e):pf(n[e.on],Bf(e)),a=`ground`;i.on===`ground`?r.on!==`ground`&&(a=r.on):a=i.on;let o=zf(e(r),e(i),t);return[{key:i.prop,prop:i.prop,home:a,m:a===`ground`?o:pf(Rf(n[a]),o)}]}let a=[];return i&&a.push(Uf(i,t)),r&&t<1&&a.push(Uf(r,1-t)),a}function Gf(e,t,n,r){let{idle:i}=r,{period:a}=i,o=Ff(i),s=Of(n,t),c=Df(n,t),l=(t,n)=>t(Xd(e-n,a))-t(e)-(t(Xd(-n,a))-t(0)),u=(1-Math.cos(2*Math.PI*e/i.breath.every))/2,d=i.breath.lift*s.breath*u,f=1+i.breath.swell*s.breath*u,p=1/f**.6,m=s.weight*bf+o.drift(e),h=pf(hf(m,-d),gf(p,f,ff.body)),g=Math.asin(Math.max(-1,Math.min(1,m/xf)))*180/Math.PI,_=pf(hf(m,0),mf(g,ff.legL)),v=pf(hf(m,0),mf(g,ff.legR)),y=(Of(n,t-Sf.head).weight-s.weight)*bf+l(o.drift,Sf.head),b=s.tilt+o.nod(e)+.4*y,x=Of(n,t-Sf.tuft).tilt-s.tilt+l(o.nod,Sf.tuft),S=s.yaw+Gd(e,r.yaw),C=mf(b,ff.head),w=pf(hf(S*vf.tuft*_f,0),mf(Cf*x+i.tuft*Jd(e,a/5,.6),ff.tuft)),T=hf(S*vf.face*_f,0),ee=hf(S*vf.beak*_f,0),E=pf(h,mf(i.tail*Jd(e,a/3,.15)+.5*y,ff.tail)),D=Of(n,t-Sf.wing),te=s.aL+o.swayL(e),ne=s.aR+o.swayR(e),re=(1-c)*Lf(n.from,`handL`,e,a)+c*Lf(n.to,`handL`,e,a),O=(1-c)*Lf(n.from,`handR`,e,a)+c*Lf(n.to,`handR`,e,a),ie=s.eL+i.wing.curl*Jd(e,a/3,.6)+Cf*(D.aL-s.aL+l(o.swayL,Sf.wing))+re,k=s.eR+i.wing.curl*Jd(e,a/3,.1)+Cf*(D.aR-s.aR+l(o.swayR,Sf.wing))+O,ae=pf(hf(-s.oL,wf*s.oL),mf(te-tf.L,ff.wingL)),A=pf(hf(s.oR,wf*s.oR),mf(-(ne-tf.R),ff.wingR)),oe=mf(ie,ff.handL),se=mf(-k,ff.handR),ce=s.gx+Gd(e,r.gx)-ef[0],le=s.gy+Gd(e,r.gy)-ef[1],j=Math.max(s.lid,Gd(e,r.lid),n.blink?Gd(t-n.start,jf):0),M=(e,t)=>{let n=e.bottom-e.top;return{pupil:[ce*e.travel[0]*t,le*e.travel[1]*t],upper:j*.85*n,lower:j*.15*n,closed:Pf((j-.88)/.12)}},{big:ue}=Hd.eyes,de={big:M(ue,1),small:M({travel:ue.travel,top:Hd.eyes.small.top,bottom:Hd.eyes.small.bottom},yf)},N=Wf(n,c,{handL:pf(h,pf(ae,oe)),handR:pf(h,pf(A,se))}),fe=(e,t)=>1-Pf((Math.abs(e-t)-4)/10);return{m:{body:h,legL:_,legR:v,tail:E,head:C,jaw:mf(s.beak,ff.jaw),tuft:w,face:T,beak:ee,wingL:ae,wingR:A,handL:oe,handR:se},eyes:de,lines:{wingL:fe(te,tf.L),wingR:fe(ne,tf.R)},props:N}}function Kf(e){return`matrix(${e.map(e=>Math.round(e*1e4)/1e4).join(` `)})`}var qf=Ir(`<path class="fill-paper"></path>`),Jf=Ir(`<path></path>`),Yf=Ir(`<g data-part="prop"></g>`),Xf=Ir(`<g data-part="eye"><path></path><g><g><path></path></g></g><g><rect height="0"></rect><rect height="0"></rect></g><path opacity="0"></path></g>`),Zf=Pr(`<div data-caw-rig=""><svg class="size-full overflow-visible text-paper" viewBox="0 0 512 512"><defs><clipPath><path></path></clipPath><clipPath><path></path></clipPath><clipPath><path></path></clipPath><clipPath><rect height="882" width="912" x="-200" y="-400"></rect></clipPath><filter color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" height="832" width="832" x="-160" y="-160"><feComponentTransfer in="SourceAlpha" result="solid"><feFuncA slope="6" type="linear"></feFuncA></feComponentTransfer><feMorphology in="solid" operator="dilate" result="grown"></feMorphology><feFlood flood-color="currentColor"></feFlood><feComposite in2="grown" operator="in" result="rim"></feComposite><feMerge><feMergeNode in="rim"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter></defs><g data-part="caw"><g data-layer="tail" data-part="tail"><path></path><path></path></g><g data-layer="legL" data-part="foot" data-side="L"><path></path></g><g data-layer="legR" data-part="foot" data-side="R"><path></path></g><g data-layer="body" data-part="body"><path></path><path data-layer="line-wingL"></path><path data-layer="line-wingR"></path><g data-layer="wingR" data-part="wing" data-side="R"><g data-layer="handR" data-part="primaries"><!><path></path></g><path></path></g><g data-layer="head" data-part="head"><path></path><g data-layer="tuft" data-part="tuft"><path></path></g><g><g data-layer="face" data-part="face"></g></g><g data-layer="beak" data-part="beak"><g data-layer="jaw" data-part="jaw"><path></path></g><path></path></g></g><g data-layer="wingL" data-part="wing" data-side="L"><g data-layer="handL" data-part="primaries"><!><path></path></g><path></path></g></g><g></g></g></svg></div>`);function Qf(e,t){let n=zr();Ue(t,!0);let r=(e,t=h)=>{var n=Yf();pi(n,21,()=>sf[t().prop].shapes,li,(e,t)=>{var n=Lr(),r=ln(n),i=e=>{var n=qf();An(()=>q(n,`d`,K(t).d)),Rr(e,n)},a=e=>{var n=Jf();An(()=>{q(n,`d`,K(t).d),q(n,`fill`,s.inks.black)}),Rr(e,n)};ci(r,e=>{K(t).ink===`paper`?e(i):e(a,-1)}),Rr(e,n)}),R(n),An(e=>{q(n,`data-layer`,`prop-${t().key??``}`),q(n,`transform`,e)},[()=>Kf(t().m)]),Rr(e,n)},i=ca(t,`pose`,3,`ready`),a=ca(t,`idle`,3,`calm`),o=ca(t,`size`,3,160),s=Hd,c=[`big`,`small`],l=`caw-rig-${n}`,u=ft(()=>(t.scheme??Ca.resolved)===`dark`),d=ft(()=>typeof i()==`string`?af[i()]:i()),f=B(1),p=ft(()=>Math.max(5.31,512/(o()*K(f)))),m=B(null),g=B(Zt([])),_=Nf(lf[a()]),v=Mf(K(d)),y=0,b=new Map,x,S=Yd([...n].reduce((e,t)=>e*31+t.charCodeAt(0),7)%9973),C=new Qd(_.idle.period,(e,t)=>{y+=t,w(Gf(e,y,v,_))},S*_.idle.period);function w(e){if(x=e,b.size===0)return;for(let[t,n]of Object.entries(e.m))b.get(t)?.setAttribute(`transform`,Kf(n));for(let t of[`big`,`small`]){let n=e.eyes[t],r=s.eyes[t];b.get(`pupil-${t}`)?.setAttribute(`transform`,`translate(${n.pupil[0]} ${n.pupil[1]})`),b.get(`upper-${t}`)?.setAttribute(`height`,String(n.upper));let i=b.get(`lower-${t}`);i?.setAttribute(`y`,String(r.bottom-n.lower)),i?.setAttribute(`height`,String(n.lower)),b.get(`closed-${t}`)?.setAttribute(`opacity`,String(n.closed))}b.get(`line-wingL`)?.setAttribute(`opacity`,String(e.lines.wingL)),b.get(`line-wingR`)?.setAttribute(`opacity`,String(e.lines.wingR));let t=e=>e.map(e=>`${e.key}@${e.home}`).join();t(e.props)!==t(K(g))&&V(g,e.props,!0);for(let t of e.props)b.get(`prop-${t.key}`)?.setAttribute(`transform`,Kf(t.m))}function T(e){b=new Map;for(let t of e.querySelectorAll(`[data-layer]`))b.set(t.dataset.layer,t)}Sn(()=>{let e=K(d);e!==v.to&&(v=C.state.live||C.state.held?kf(v,y,e):Mf(e),C.redraw())}),Sn(()=>{_=Nf(lf[a()]),C.period=_.idle.period,C.redraw()}),Sn(()=>{K(g).length>0&&K(m)&&(T(K(m)),x&&w(x))}),si(()=>{let e=()=>{V(f,window.devicePixelRatio,!0)};e(),window.addEventListener(`resize`,e),K(m)&&T(K(m));let t=C.watch(K(m));return()=>{t(),window.removeEventListener(`resize`,e)}});function ee(){return{...C.state,period:C.period,now:y}}function E(e){C.seek(e)}function D(){C.release()}function te(e){return Gf(e,y,v,_)}function ne(e){return Gf(C.state.t,v.start+e,v,_)}var re={clockState:ee,seek:E,release:D,frameAt:te,frameInBlend:ne},O=Zf();let ie;var k=H(O),ae=H(k),A=H(ae),oe=un(A),se=U(A),ce=un(se),le=U(se),j=un(le),M=U(le),ue=U(M),de=U(H(ue));ge(3),R(ue),R(ae);var N=U(ae),fe=H(N),pe=H(fe),P=U(pe);R(fe);var F=U(fe),I=un(F),L=U(F),me=un(L),he=U(L),_e=H(he),ve=U(_e),ye=U(ve),be=U(ye),xe=H(be),Se=H(xe);pi(Se,17,()=>K(g).filter(e=>e.home===`handR`),e=>e.key,(e,t)=>{r(e,()=>K(t))});var Ce=U(Se);R(xe);var we=U(xe);R(be);var Te=U(be),Ee=H(Te),De=U(Ee),Oe=un(De),ke=U(De),Ae=H(ke);pi(Ae,20,()=>c,e=>e,(e,t)=>{let n=ft(()=>s.eyes[t]);var r=Xf(),i=H(r),a=U(i),o=H(a),c=un(o);R(a);var u=U(a),d=H(u),f=U(d);R(u);var p=U(u);R(r),An(()=>{q(r,`data-eye`,t),q(i,`d`,K(n).white),q(i,`fill`,s.inks.white),q(a,`clip-path`,`url(#${l}-lid-${t??``})`),q(o,`data-layer`,`pupil-${t??``}`),q(c,`d`,K(n).pupil),q(c,`fill`,s.inks.black),q(u,`clip-path`,`url(#${l}-lid-${t??``})`),q(d,`data-layer`,`upper-${t??``}`),q(d,`fill`,s.inks.black),q(d,`width`,K(n).right-K(n).left),q(d,`x`,K(n).left),q(d,`y`,K(n).top),q(f,`data-layer`,`lower-${t??``}`),q(f,`fill`,s.inks.black),q(f,`width`,K(n).right-K(n).left),q(f,`x`,K(n).left),q(f,`y`,K(n).bottom),q(p,`d`,K(n).closed),q(p,`data-layer`,`closed-${t??``}`),q(p,`fill`,s.inks.white)}),Rr(e,r)}),R(Ae),R(ke);var je=U(ke),Me=H(je),Ne=un(Me),Pe=U(Me);R(je),R(Te);var Fe=U(Te),Ie=H(Fe),Le=H(Ie);pi(Le,17,()=>K(g).filter(e=>e.home===`handL`),e=>e.key,(e,t)=>{r(e,()=>K(t))});var Re=U(Le);R(Ie);var ze=U(Ie);R(Fe),R(he);var Be=U(he);return pi(Be,21,()=>K(g).filter(e=>e.home===`ground`),e=>e.key,(e,t)=>{r(e,()=>K(t))}),R(Be),R(N),R(k),ra(k,e=>V(m,e),()=>K(m)),R(O),An(()=>{ji(O,1,Ti([`relative size-(--caw-size) shrink-0`,t.class])),q(O,`data-pose`,typeof i()==`string`?i():`custom`),q(O,`data-idle`,a()),q(O,`data-scheme`,K(u)?`dark`:`light`),ie=Ni(O,``,ie,{"--caw-size":`${o()??``}px`}),q(k,`aria-hidden`,t.label?void 0:`true`),q(k,`aria-label`,t.label),q(k,`role`,t.label?`img`:void 0),q(A,`id`,`${l}-head`),q(oe,`d`,s.head.black),q(se,`id`,`${l}-lid-big`),q(ce,`d`,s.eyes.big.lid),q(le,`id`,`${l}-lid-small`),q(j,`d`,s.eyes.small.lid),q(M,`id`,`${l}-ground`),q(ue,`id`,`${l}-rim`),q(de,`radius`,K(p)),q(N,`filter`,K(u)?`url(#${l}-rim)`:void 0),q(pe,`d`,s.tail.black),q(pe,`fill`,s.inks.black),q(P,`d`,s.tail.line.d),q(P,`fill`,s.tail.line.ink),q(I,`d`,s.legL.black),q(I,`fill`,s.inks.black),q(me,`d`,s.legR.black),q(me,`fill`,s.inks.black),q(_e,`d`,s.body.black),q(_e,`fill`,s.inks.black),q(ve,`d`,s.body.lines.wingL.d),q(ve,`fill`,s.body.lines.wingL.ink),q(ye,`d`,s.body.lines.wingR.d),q(ye,`fill`,s.body.lines.wingR.ink),q(Ce,`d`,s.wingR.hand.vermilion),q(Ce,`fill`,s.inks.vermilion),q(we,`d`,s.wingR.arm.black),q(we,`fill`,s.inks.black),q(Ee,`d`,s.head.black),q(Ee,`fill`,s.inks.black),q(Oe,`d`,s.tuft.black),q(Oe,`fill`,s.inks.black),q(ke,`clip-path`,`url(#${l}-head)`),q(Ne,`d`,s.beak.lower),q(Ne,`fill`,s.inks.black),q(Pe,`d`,s.beak.plane),q(Pe,`fill`,s.inks.plane),q(Re,`d`,s.wingL.hand.vermilion),q(Re,`fill`,s.inks.vermilion),q(ze,`d`,s.wingL.arm.black),q(ze,`fill`,s.inks.black),q(Be,`clip-path`,`url(#${l}-ground)`)}),Rr(e,O),We(re)}var $f=Pr(`<!> <!>`,1),ep=Pr(`<div class="grid justify-items-center gap-space-2"><!> <span class="type-meta tabular-nums text-ink-muted"> </span></div>`),tp=Pr(`<div><!></div>`),np=Pr(`<figure class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3 rounded-lg p-space-5 ring-1 ring-border-hairline"><figcaption class="type-meta text-ink-muted"> </figcaption> <div class="flex flex-wrap items-end gap-space-5"></div></figure>`),rp=Pr(`<div class="grid min-h-dvh grid-cols-1 content-start gap-space-6 bg-surface-page p-space-6" data-preview="caw-rig"><header class="grid max-w-c-measure gap-space-4"><div class="grid gap-space-1"><h1 class="m-0 type-title tracking-title text-balance text-ink-strong">Caw, rigged</h1> <p class="m-0 type-body text-pretty text-ink-muted">One drawing cut at his pivots: every pose here is a few numbers on it.
        He breathes, blinks and glances on one clock per Caw, which stops while
        he is off screen; with reduced motion he holds his pose.</p></div> <div class="flex flex-wrap items-end gap-x-space-6 gap-y-space-3"><div class="grid gap-space-1"><span class="type-meta text-ink-muted" id="rig-pose">Pose</span> <!></div> <div class="grid gap-space-1"><span class="type-meta text-ink-muted" id="rig-idle">Idle</span> <!></div> <div class="grid gap-space-1"><span class="type-meta text-ink-muted" id="rig-theme">Day or night</span> <!></div></div></header> <main class="grid grid-cols-1 gap-space-8"><div class="flex flex-wrap items-stretch gap-space-4"><figure class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3 rounded-lg p-space-5 ring-1 ring-border-hairline" data-slot="stage"><figcaption class="type-meta text-ink-muted"> </figcaption> <div class="flex flex-wrap items-end gap-space-6"></div></figure> <figure class="m-0 grid min-w-0 grid-cols-1 content-start gap-space-3 rounded-lg p-space-5 ring-1 ring-border-hairline" data-still=""><figcaption class="type-meta text-ink-muted">The still he is cut from</figcaption> <div class="grid justify-items-center gap-space-2"><img class="size-40 object-contain" alt="Caw's open-eyed still"/> <span class="type-meta tabular-nums text-ink-muted">160 px</span></div></figure></div> <section class="grid gap-space-4" data-slot="poses"><h2 class="m-0 type-label text-balance text-ink-strong">Every pose</h2> <div class="grid grid-cols-1 gap-space-4 desk:max-wide:grid-cols-2 wide:grid-cols-3"></div></section></main></div>`);function ip(e,t){Ue(t,!0);let n=[64,96,160],r={ready:`Ready`,waving:`Waving`,phoneUp:`Phone up`,cheer:`Cheer`,shrug:`Shrug`,letGo:`Let go`},i={calm:`Calm`,attentive:`Attentive`},a=`./still.png`,o=B(`ready`),s=B(`calm`),c=Zt({}),l={poses:Object.keys(af),idles:Object.keys(lf),still:a,names:()=>Object.keys(c),clock:e=>c[e]?.clockState(),seek:(e,t)=>c[e]?.seek(t),release:e=>c[e]?.release(),frameAt:(e,t)=>c[e]?.frameAt(t),blendFrame:(e,t)=>c[e]?.frameInBlend(t),pose:e=>{V(o,e,!0)},idle:e=>{V(s,e,!0)},theme:e=>Ca.set(e)};window.preview=l,Sn(()=>{document.documentElement.dataset.ready=``});var u=rp(),d=H(u),f=U(H(d),2),p=H(f);ud(U(H(p),2),{onValueChange:e=>{V(o,e,!0)},size:`compact`,get value(){return K(o)},children:(e,t)=>{Vd(e,{"aria-labelledby":`rig-pose`,children:(e,t)=>{var n=Lr();pi(ln(n),17,()=>Object.entries(r),([e,t])=>e,(e,t)=>{var n=ft(()=>v(K(t),2));let r=()=>K(n)[0],i=()=>K(n)[1];od(e,{get"data-pose-pick"(){return r()},get label(){return i()},get value(){return r()}})}),Rr(e,n)},$$slots:{default:!0}})},$$slots:{default:!0}}),R(p);var m=U(p,2);ud(U(H(m),2),{onValueChange:e=>{V(s,e,!0)},size:`compact`,get value(){return K(s)},children:(e,t)=>{Vd(e,{"aria-labelledby":`rig-idle`,children:(e,t)=>{var n=Lr();pi(ln(n),17,()=>Object.entries(i),([e,t])=>e,(e,t)=>{var n=ft(()=>v(K(t),2));let r=()=>K(n)[0],i=()=>K(n)[1];od(e,{get"data-idle-pick"(){return r()},get label(){return i()},get value(){return r()}})}),Rr(e,n)},$$slots:{default:!0}})},$$slots:{default:!0}}),R(m);var h=U(m,2),g=U(H(h),2);{let e=ft(()=>Ca.resolved===`dark`?`night`:`day`);ud(g,{onValueChange:e=>Ca.set(e===`night`?`dark`:`light`),size:`compact`,get value(){return K(e)},children:(e,t)=>{Vd(e,{"aria-labelledby":`rig-theme`,children:(e,t)=>{var n=$f(),r=ln(n);od(r,{"data-theme-pick":`day`,label:`Day`,value:`day`}),od(U(r,2),{"data-theme-pick":`night`,label:`Night`,value:`night`}),Rr(e,n)},$$slots:{default:!0}})},$$slots:{default:!0}})}R(h),R(f),R(d);var _=U(d,2),y=H(_),b=H(y),x=H(b),S=un(x),C=U(x,2);pi(C,20,()=>n,e=>e,(e,t)=>{var n=ep(),i=H(n);{let e=ft(()=>t===160?`Caw, ${r[K(o)]}`:void 0);ra(Qf(i,{get idle(){return K(s)},get label(){return K(e)},get pose(){return K(o)},get size(){return t}}),(e,t)=>c[`stage-${t}`]=e,e=>c?.[`stage-${e}`],()=>[t])}var a=un(U(i,2));R(n),An(()=>{q(n,`data-rig-name`,`stage-${t??``}`),ei(a,`${t??``} px`)}),Rr(e,n)}),R(C),R(b);var w=U(b,2),T=U(H(w),2),ee=H(T);ge(2),R(T),R(w),R(y);var E=U(y,2),D=U(H(E),2);pi(D,20,()=>Object.keys(af),e=>e,(e,t)=>{let i=ft(()=>t);var a=np(),o=H(a),l=un(o,!0),u=U(o,2);pi(u,20,()=>n,e=>e,(e,t)=>{var n=tp();ra(Qf(H(n),{get idle(){return K(s)},get pose(){return K(i)},get size(){return t}}),(e,t,n)=>c[`pose-${t}-${n}`]=e,(e,t)=>c?.[`pose-${e}-${t}`],()=>[K(i),t]),R(n),An(()=>q(n,`data-rig-name`,`pose-${K(i)??``}-${t??``}`)),Rr(e,n)}),R(u),R(a),An(()=>{q(a,`data-pose-card`,K(i)),ei(l,r[K(i)])}),Rr(e,a)}),R(D),R(E),R(_),R(u),An(()=>{ei(S,`On the stage: ${r[K(o)]??``}`),q(ee,`src`,Ca.resolved===`dark`?`./still-night.png`:a)}),Rr(e,u),We()}var ap=document.getElementById(`preview`);ap&&ti(ip,{target:ap});