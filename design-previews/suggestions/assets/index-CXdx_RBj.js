(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=Array.isArray,t=Array.prototype.indexOf,n=Array.prototype.includes,r=Array.from,i=Object.defineProperty,a=Object.getOwnPropertyDescriptor,o=Object.getOwnPropertyDescriptors,s=Object.prototype,c=Array.prototype,l=Object.getPrototypeOf,u=Object.isExtensible;function d(e){return typeof e==`function`}var f=()=>{};function p(e){for(var t=0;t<e.length;t++)e[t]()}function m(){var e,t;return{promise:new Promise((n,r)=>{e=n,t=r}),resolve:e,reject:t}}var h=1<<24,g=1024,_=2048,v=4096,y=8192,b=16384,x=32768,S=1<<25,ee=65536,C=1<<19,w=1<<20,te=1<<25,ne=1<<21,re=1<<22,ie=1<<23,ae=Symbol(`$state`),oe=Symbol(`component`),se=Symbol(`legacy props`),ce=Symbol(``),le=Symbol(`attributes`),ue=Symbol(`class`),T=Symbol(`style`),de=Symbol(`text`),fe=Symbol(`form reset`),pe=new class extends Error{name=`StaleReactionError`;message="The reaction that called `getAbortSignal()` was re-run or destroyed"},me=!!globalThis.document?.contentType&&globalThis.document.contentType.includes(`xml`),E={},D=Symbol(`uninitialized`),he=`http://www.w3.org/1999/xhtml`;function ge(){console.warn(`https://svelte.dev/e/derived_inert`)}function O(e){console.warn(`https://svelte.dev/e/hydration_mismatch`)}function _e(){console.warn(`https://svelte.dev/e/select_multiple_invalid_value`)}function ve(){console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`)}var k=!1;function ye(e){k=e}var A;function be(e){if(e===null)throw O(),E;return A=e}function xe(){return be(ln(A))}function j(e){if(k){if(ln(A)!==null)throw O(),E;A=e}}function Se(e=1){if(k){for(var t=e,n=A;t--;)n=ln(n);A=n}}function Ce(e=!0){for(var t=0,n=A;;){if(n.nodeType===8){var r=n.data;if(r===`]`){if(t===0)return n;--t}else(r===`[`||r===`[!`||r[0]===`[`&&!isNaN(Number(r.slice(1))))&&(t+=1)}var i=ln(n);e&&n.remove(),n=i}}function we(e){if(!e||e.nodeType!==8)throw O(),E;return e.data}function Te(e){return e===this.v}function Ee(e,t){return e==e?e!==t||typeof e==`object`&&!!e||typeof e==`function`:t==t}function De(e){return!Ee(e,this.v)}function Oe(){throw Error(`https://svelte.dev/e/async_derived_orphan`)}function ke(e,t,n){throw Error(`https://svelte.dev/e/each_key_duplicate`)}function Ae(e){throw Error(`https://svelte.dev/e/effect_in_teardown`)}function je(){throw Error(`https://svelte.dev/e/effect_in_unowned_derived`)}function Me(e){throw Error(`https://svelte.dev/e/effect_orphan`)}function Ne(){throw Error(`https://svelte.dev/e/effect_update_depth_exceeded`)}function Pe(e){throw Error(`https://svelte.dev/e/props_invalid_value`)}function Fe(){throw Error(`https://svelte.dev/e/state_descriptors_fixed`)}function Ie(){throw Error(`https://svelte.dev/e/state_prototype_fixed`)}function Le(){throw Error(`https://svelte.dev/e/state_unsafe_mutation`)}function Re(){throw Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`)}var ze=!1;function Be(){ze=!0}var Ve=null;function He(e){Ve=e}function Ue(e,t=!1,n){Ve={p:Ve,i:!1,c:null,e:null,s:e,x:null,r:B,l:null}}function We(e){var t=Ve,n=t.e;if(n!==null){t.e=null;for(var r of n)wn(r)}return e!==void 0&&(t.x=e),t.i=!0,Ve=t.p,Ge(e)}function Ge(e={}){return i(e,oe,{value:!0}),e}function Ke(){return!0}var qe=[];function Je(){var e=qe;qe=[],p(e)}function Ye(e){if(qe.length===0&&!Tt){var t=qe;queueMicrotask(()=>{t===qe&&Je()})}qe.push(e)}function Xe(){for(;qe.length>0;)Je()}var Ze=~(_|v|g);function Qe(e,t){e.f=e.f&Ze|t}function $e(e){e.f&512||e.deps===null?Qe(e,g):Qe(e,v)}function et(e,t,n){e.f&2048?t.add(e):e.f&4096&&n.add(e),Qe(e,g)}function tt(e,t){if(t){let t=document.body;e.autofocus=!0,Ye(()=>{document.activeElement===t&&e.focus()})}}function nt(e){k&&cn(e)!==null&&fn(e)}var rt=!1;function it(){rt||(rt=!0,document.addEventListener(`reset`,e=>{Promise.resolve().then(()=>{if(!e.defaultPrevented)for(let t of e.target.elements)t[fe]?.()})},{capture:!0}))}function at(e){var t=z,n=B;qn(null),Jn(null);try{return e()}finally{qn(t),Jn(n)}}function ot(e,t,n,r=n){e.addEventListener(t,()=>at(n));let i=e[fe];e[fe]=i?()=>{i(),r(!0)}:()=>r(!0),it()}function st(e,t,n,r){let i=Ke()?dt:mt;var a=e.filter(e=>!e.settled),o=t.map(i);if(n.length===0&&a.length===0){r(o);return}var s=B,c=ct(),l=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(e=>e.promise)):null;function u(e){if(!(s.f&16384)){c();try{r([...o,...e])}catch(e){_n(e,s)}lt()}}var d=ut();if(n.length===0){l.then(()=>u([])).finally(d);return}function f(){Promise.all(n.map(e=>pt(e))).then(u).catch(e=>_n(e,s)).finally(d)}l?l.then(()=>{if(s.f&16384){d();return}c(),f(),lt()}):f()}function ct(){var e=B,t=z,n=Ve,r=N;return function(i=!0){Jn(e),qn(t),He(n),i&&!(e.f&16384)&&(r?.activate(),r?.apply())}}function lt(e=!0){Jn(null),qn(null),He(null),e&&N?.deactivate()}function ut(){var e=B,t=e.b,n=N,r=!!t?.is_rendered();return t?.update_pending_count(1,n),n.increment(r,e),()=>{t?.update_pending_count(-1,n),n.decrement(r,e)}}function dt(e){var t=2|_;return B!==null&&(B.f|=C),{ctx:Ve,deps:null,effects:null,equals:Te,f:t,fn:e,reactions:null,rv:0,v:D,wv:0,parent:B,ac:null}}var ft=Symbol(`obsolete`);function pt(e,t,n){let r=B;r===null&&Oe();var i=void 0,a=Wt(D),o=!z,s=new Set;return Dn(()=>{var t=B,n=m();i=n.promise;try{Promise.resolve(e()).then(n.resolve,e=>{e!==pe&&n.reject(e)}).finally(lt)}catch(e){n.reject(e),lt()}var c=N;if(o){if(t.f&32768)var l=ut();if(r.b?.is_rendered())c.async_deriveds.get(t)?.reject(ft);else for(let e of s.values())e.reject(ft);s.add(n),c.async_deriveds.set(t,n)}let u=(e,t=void 0)=>{l?.(),s.delete(n),t!==ft&&(c.activate(),t?(a.f|=ie,Jt(a,t)):(a.f&8388608&&(a.f^=ie),Jt(a,e)),c.deactivate())};n.promise.then(u,e=>u(null,e||`unknown`))}),Sn(()=>{for(let e of s)e.reject(ft)}),new Promise(e=>{function t(n){function r(){n===i?e(a):t(i)}n.then(r,r)}t(i)})}function M(e){let t=dt(e);return ze||Xn(t),t}function mt(e){let t=dt(e);return t.equals=De,t}function ht(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)Fn(t[n])}}function gt(e){var t,n=B,r=e.parent;if(!Wn&&r!==null&&e.v!==D&&r.f&24576)return ge(),e.v;Jn(r);try{ht(e),t=cr(e)}finally{Jn(n)}return t}function _t(e){var t=gt(e);if(!e.equals(t)&&(e.wv=ar(),(!N?.is_fork||e.deps===null)&&(N===null?e.v=t:(N.capture(e,t,!0),St?.capture(e,t,!0)),e.deps===null))){Qe(e,g);return}Wn||(Ct===null?$e(e):(xn()||N?.is_fork)&&Ct.set(e,t))}function vt(e){if(e.effects!==null)for(let t of e.effects)(t.teardown||t.ac)&&(t.teardown?.(),t.ac!==null&&at(()=>{t.ac.abort(pe),t.ac=null}),t.fn!==null&&(t.teardown=f),dr(t,0),Nn(t))}function yt(e){if(e.effects!==null)for(let t of e.effects)t.teardown&&t.fn!==null&&fr(t)}var bt=null,xt=null,N=null,St=null,Ct=null,wt=null,Tt=!1,Et=!1,Dt=null,Ot=null,kt=0,At=1,jt=class e{id=At++;#e=!1;linked=!0;#t=null;#n=null;async_deriveds=new Map;current=new Map;previous=new Map;#r=new Set;#i=new Set;#a=0;#o=new Map;#s=null;#c=[];#l=[];#u=new Set;#d=new Set;#f=new Map;#p=new Set;is_fork=!1;#m=!1;constructor(){xt===null?bt=xt=this:(xt.#n=this,this.#t=xt),xt=this}#h(){if(this.is_fork)return!0;for(let n of this.#o.keys()){for(var e=n,t=!1;e.parent!==null;){if(this.#f.has(e)){t=!0;break}e=e.parent}if(!t)return!0}return!1}skip_effect(e){this.#f.has(e)||this.#f.set(e,{d:[],m:[]}),this.#p.delete(e)}unskip_effect(e,t=e=>this.schedule(e)){var n=this.#f.get(e);if(n){this.#f.delete(e);for(var r of n.d)Qe(r,_),t(r);for(r of n.m)Qe(r,v),t(r)}this.#p.add(e)}#g(){var e=[];for(let i of this.#c)if(!(i.f&16384||!(i.f&6144))){for(var t=i,n=!1;t.parent!==null;){t=t.parent;var r=t.f;if(r&96){if(!(r&1024)){n=!0;break}t.f^=g}}n||e.push(t)}return this.#c=[],e}#_(){this.#e=!0;for(let e of this.#u)this.#d.delete(e),Qe(e,_),this.schedule(e);for(let e of this.#d)Qe(e,v),this.schedule(e);this.apply();for(var t=Dt=[],n=[],r=Ot=[];this.#c.length>0;){kt++>1e3&&(this.#C(),Nt());for(let e of this.#g())try{this.#v(e,t,n)}catch(t){throw Bt(e),this.#h()||this.discard(),t}}if(N=null,r.length>0){var i=e.ensure();for(let e of r)i.schedule(e)}if(Dt=null,Ot=null,this.#h()){this.#x(n),this.#x(t);for(let[e,t]of this.#f)zt(e,t);r.length>0&&N.#_();return}let a=this.#y();if(a){this.#x(n),this.#x(t),a.#b(this);return}this.#u.clear(),this.#d.clear();for(let e of this.#r)e(this);this.#r.clear(),St=this,Ft(n),Ft(t),St=null,this.#s?.resolve();var o=N;if(this.#a===0&&(this.#c.length===0||o!==null)&&(this.#C(),ze&&(this.#S(),N=o)),this.#c.length>0){if(o!==null){for(let e of this.#c)o.#c.push(e);this.#c=[]}else o=this}o!==null&&(Ht.clear(),o.#_())}#v(e,t,n){e.f^=g;for(var r=e.first;r!==null;){var i=r.f,a=!!(i&96);if(!(a&&i&1024||i&8192||this.#f.has(r))&&r.fn!==null){a?r.f^=g:i&4?t.push(r):ze&&i&16777224?n.push(r):or(r)&&(i&16&&this.#d.add(r),fr(r));var o=r.first;if(o!==null){r=o;continue}}for(;r!==null;){var s=r.next;if(s!==null){r=s;break}r=r.parent}}}#y(){for(var e=this.#t;e!==null;){if(!e.is_fork){for(let[t,[,n]]of this.current)if(e.current.has(t)&&!n)return e}e=e.#t}return null}#b(e){for(let[t,n]of e.current)!this.previous.has(t)&&e.previous.has(t)&&this.previous.set(t,e.previous.get(t)),this.current.set(t,n);for(let[t,n]of e.async_deriveds){let e=this.async_deriveds.get(t);e&&n.promise.then(e.resolve).catch(e.reject)}e.async_deriveds.clear(),this.transfer_effects(e.#u,e.#d);let t=e=>{var n=e.reactions;if(n!==null&&!(e.f&2&&!(e.f&6144)))for(let e of n){var r=e.f;if(r&2)t(e);else{var i=e;r&4194320&&!this.async_deriveds.has(i)&&(this.#d.delete(i),Qe(i,_),this.schedule(i))}}};for(let e of this.current.keys())t(e);this.oncommit(()=>e.discard()),e.#C(),N=this,this.#_()}#x(e){for(var t=0;t<e.length;t+=1)et(e[t],this.#u,this.#d)}capture(e,t,n=!1){e.v!==D&&!this.previous.has(e)&&this.previous.set(e,e.v),e.f&8388608||(this.current.set(e,[t,n]),Ct?.set(e,t)),this.is_fork||(e.v=t)}activate(){N=this}deactivate(){N=null,Ct=null}flush(){try{Et=!0,N=this,this.#_()}finally{kt=0,wt=null,Dt=null,Ot=null,Et=!1,N=null,Ct=null,Ht.clear()}}discard(){for(let e of this.#i)e(this);this.#i.clear();for(let e of this.async_deriveds.values())e.reject(ft);this.#C(),this.#s?.resolve()}register_created_effect(e){this.#l.push(e)}#S(){for(let u=bt;u!==null;u=u.#n){var e=u.id<this.id,t=[];for(let[r,[i,a]]of this.current){if(u.current.has(r)){var n=u.current.get(r)[0];if(e&&i!==n)u.current.set(r,[i,a]);else continue}t.push(r)}if(e)for(let[e,t]of this.async_deriveds){let n=u.async_deriveds.get(e);n&&t.promise.then(n.resolve).catch(n.reject)}var r=[...u.current.keys()].filter(e=>!u.current.get(e)[1]);if(u.#e&&r.length!==0){var i=r.filter(e=>!this.current.has(e));if(i.length===0)e&&u.discard();else if(t.length>0){if(e)for(let e of this.#p)u.unskip_effect(e,e=>{e.f&4194320?u.schedule(e):u.#x([e])});u.activate();var a=new Set,o=new Map;for(var s of t)It(s,i,a,o);o=new Map;var c=[...u.current].filter(([e,t])=>{let n=this.current.get(e);return!n||n[0]!==t[0]||n[1]!==t[1]}).map(([e])=>e);if(c.length>0)for(let e of this.#l)!(e.f&155648)&&Lt(e,c,o)&&(e.f&4194320?(Qe(e,_),u.schedule(e)):u.#u.add(e));if(u.#c.length>0&&!u.#m){u.apply();for(var l of u.#g())u.#v(l,[],[])}u.deactivate()}}}}increment(e,t){if(this.#a+=1,e){let e=this.#o.get(t)??0;this.#o.set(t,e+1)}}decrement(e,t){if(--this.#a,e){let e=this.#o.get(t)??0;e===1?this.#o.delete(t):this.#o.set(t,e-1)}this.#m||(this.#m=!0,Ye(()=>{this.#m=!1,this.linked&&this.flush()}))}transfer_effects(e,t){for(let t of e)this.#u.add(t);for(let e of t)this.#d.add(e);e.clear(),t.clear()}oncommit(e){this.#r.add(e)}ondiscard(e){this.#i.add(e)}settled(){return(this.#s??=m()).promise}static ensure(){if(N===null){let t=N=new e;!Et&&!Tt&&Ye(()=>{t.#e||t.flush()})}return N}apply(){if(!ze||!this.is_fork&&this.#t===null&&this.#n===null){Ct=null;return}Ct=new Map;for(let[e,[t]]of this.current)Ct.set(e,t);for(let t=bt;t!==null;t=t.#n)if(!(t===this||t.is_fork)){var e=!1;if(t.id<this.id){for(let[n,[,r]]of t.current)if(!r&&this.current.has(n)){e=!0;break}}if(!e)for(let[e,n]of t.previous)Ct.has(e)||Ct.set(e,n)}}schedule(e){if(wt=e,e.b?.is_pending&&e.f&16777228&&!(e.f&32768)){e.b.defer_effect(e);return}this.#c.push(e)}#C(){if(this.linked){var e=this.#t,t=this.#n;e===null?bt=t:e.#n=t,t===null?xt=e:t.#t=e,this.linked=!1}}};function Mt(e){var t=Tt,n=St;St=null,Tt=!0;try{var r;for(e&&(Mt(),r=e());;){if(Xe(),N===null)return r;N.flush()}}finally{Tt=t,St=n}}function Nt(){try{Ne()}catch(e){_n(e,wt)}}var Pt=null;function Ft(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var r=e[n++];if(!(r.f&24576)&&or(r)&&(Pt=new Set,fr(r),r.deps===null&&r.first===null&&r.nodes===null&&r.teardown===null&&r.ac===null&&Ln(r),Pt?.size>0)){Ht.clear();for(let e of Pt){if(e.f&24576)continue;let t=[e],n=e.parent;for(;n!==null;)Pt.has(n)&&(Pt.delete(n),t.push(n)),n=n.parent;for(let e=t.length-1;e>=0;e--){let n=t[e];n.f&24576||fr(n)}}Pt.clear()}}Pt=null}}function It(e,t,n,r){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(let i of e.reactions){let e=i.f;e&2?It(i,t,n,r):e&4194320&&!(e&2048)&&Lt(i,t,r)&&(Qe(i,_),Rt(i))}}function Lt(e,t,r){let i=r.get(e);if(i!==void 0)return i;if(e.deps!==null)for(let i of e.deps){if(n.call(t,i))return!0;if(i.f&2&&Lt(i,t,r))return r.set(i,!0),!0}return r.set(e,!1),!1}function Rt(e){N.schedule(e)}function zt(e,t){if(!(e.f&32&&e.f&1024)){e.f&2048?t.d.push(e):e.f&4096&&t.m.push(e),Qe(e,g);for(var n=e.first;n!==null;)zt(n,t),n=n.next}}function Bt(e){Qe(e,g);for(var t=e.first;t!==null;)Bt(t),t=t.next}var Vt=new Set,Ht=new Map,Ut=!1;function Wt(e,t){return{f:0,v:e,reactions:null,equals:Te,rv:0,wv:0}}function P(e,t){let n=Wt(e,t);return Xn(n),n}function Gt(e,t=!1,n=!0){let r=Wt(e);return t||(r.equals=De),r}function F(e,t,n=!1){return z!==null&&(!Kn||z.f&131072)&&Ke()&&z.f&4325394&&(Yn===null||!Yn.has(e))&&Le(),Jt(e,n?Qt(t):t,Ot)}var Kt=null,qt=0;function Jt(e,t,n=null){if(!e.equals(t)){Wn?Ht.set(e,t):Ht.has(e)||Ht.set(e,e.v);var r=jt.ensure();if(r.capture(e,t),e.f&2){let t=e;e.f&2048&&gt(t),Ct===null&&$e(t)}e.wv=ar(),Kt=null,qt=0,Zt(e,_,n),Kt=null,Ke()&&B!==null&&B.f&1024&&!(B.f&96)&&($n===null?er([e]):$n.push(e)),!r.is_fork&&Vt.size>0&&!Ut&&Yt()}return t}function Yt(){Ut=!1;for(let e of Vt){e.f&1024&&Qe(e,v);let t;try{t=or(e)}catch{t=!0}t&&fr(e)}Vt.clear()}function Xt(e){F(e,e.v+1)}function Zt(e,t,n){var r=e.reactions;if(r!==null){var i=Ke(),a=r.length;if(qt+=a,qt>1e5&&Kt===null&&(Kt=new Set),Kt!==null){if(Kt.has(e))return;Kt.add(e)}for(var o=0;o<a;o++){var s=r[o],c=s.f;if(i||s!==B){var l=(c&_)===0;if(l&&Qe(s,t),c&131072)Vt.add(s);else if(c&2){var u=s;Ct?.delete(u),Zt(u,v,n)}else if(l){var d=s;c&16&&Pt!==null&&Pt.add(d),n===null?Rt(d):n.push(d)}}}}}function Qt(t){if(typeof t!=`object`||!t||ae in t||oe in t)return t;let n=l(t);if(n!==s&&n!==c)return t;var r=new Map,i=e(t),o=P(0),u=null,d=rr,f=e=>{if(rr===d)return e();var t=z,n=rr;qn(null),ir(d);var r=e();return qn(t),ir(n),r};return i&&r.set(`length`,P(t.length,u)),new Proxy(t,{defineProperty(e,t,n){(!(`value`in n)||n.configurable===!1||n.enumerable===!1||n.writable===!1)&&Fe();var i=r.get(t);return i===void 0?f(()=>{var e=P(n.value,u);return r.set(t,e),e}):F(i,n.value,!0),!0},deleteProperty(e,t){var n=r.get(t);if(n===void 0){if(t in e){let e=f(()=>P(D,u));r.set(t,e),Xt(o)}}else F(n,D),Xt(o);return!0},get(e,n,i){if(n===ae)return t;var o=r.get(n),s=n in e;if(o===void 0&&(!s||a(e,n)?.writable)&&(o=f(()=>P(Qt(s?e[n]:D),u)),r.set(n,o)),o!==void 0){var c=V(o);return c===D?void 0:c}return Reflect.get(e,n,i)},getOwnPropertyDescriptor(e,t){this.has?.(e,t);var n=Reflect.getOwnPropertyDescriptor(e,t),i=r.get(t);if(i!==void 0){var a=V(i);if(a===D)return;if(n&&`value`in n)n.value=a;else return{enumerable:!0,configurable:!0,value:a,writable:!0}}return n},has(e,t){if(t===ae)return!0;var n=r.get(t),i=n!==void 0&&n.v!==D||Reflect.has(e,t);return(n!==void 0||B!==null&&(!i||a(e,t)?.writable))&&(n===void 0&&(n=f(()=>P(i?Qt(e[t]):D,u)),r.set(t,n)),V(n)===D)?!1:i},set(e,t,n,s){var c=r.get(t),l=t in e;if(i&&t===`length`)for(var d=n;d<c.v;d+=1){var p=r.get(d+``);p===void 0?d in e&&(p=f(()=>P(D,u)),r.set(d+``,p)):F(p,D)}if(c===void 0)(!l||a(e,t)?.writable)&&(c=f(()=>P(void 0,u)),F(c,Qt(n)),r.set(t,c));else{l=c.v!==D;var m=f(()=>Qt(n));F(c,m)}var h=Reflect.getOwnPropertyDescriptor(e,t);if(h?.set&&h.set.call(s,n),!l){if(i&&typeof t==`string`){var g=r.get(`length`),_=Number(t);Number.isInteger(_)&&_>=g.v&&F(g,_+1)}Xt(o)}return!0},ownKeys(e){V(o);var t=Reflect.ownKeys(e).filter(e=>{var t=r.get(e);return t===void 0||t.v!==D});for(var[n,i]of r)i.v!==D&&!(n in e)&&t.push(n);return t},setPrototypeOf(){Ie()}})}function $t(e){try{if(typeof e==`object`&&e&&ae in e)return e[ae]}catch{}return e}function en(e,t){return Object.is($t(e),$t(t))}var tn,nn,rn,an;function on(){if(tn===void 0){tn=window,nn=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;rn=a(t,`firstChild`).get,an=a(t,`nextSibling`).get,u(e)&&(e[ue]=void 0,e[le]=null,e[T]=void 0,e.__e=void 0),u(n)&&(n[de]=void 0)}}function sn(e=``){return document.createTextNode(e)}function cn(e){return rn.call(e)}function ln(e){return an.call(e)}function I(e,t){if(!k)return cn(e);var n=cn(A);if(n===null)n=A.appendChild(sn());else if(t&&n.nodeType!==3){var r=sn();return n?.before(r),be(r),r}return t&&hn(n),be(n),n}function un(e,t=!1){if(!k){var n=cn(e);return n instanceof Comment&&n.data===``?ln(n):n}if(t){if(A?.nodeType!==3){var r=sn();return A?.before(r),be(r),r}hn(A)}return A}function dn(e,t=!1){if(!k)return cn(e);var n=I(e,t);return j(e),n}function L(e,t=1,n=!1){let r=k?A:e;for(var i;t--;)i=r,r=ln(r);if(!k)return r;if(n){if(r?.nodeType!==3){var a=sn();return r===null?i?.after(a):r.before(a),be(a),a}hn(r)}return be(r),r}function fn(e){e.textContent=``}function pn(){return!ze||Pt!==null?!1:(B.f&x)!==0}function mn(e,t,n){return t==null||t===`http://www.w3.org/1999/xhtml`?n?document.createElement(e,{is:n}):document.createElement(e):n?document.createElementNS(t,e,{is:n}):document.createElementNS(t,e)}function hn(e){if(e.nodeValue.length<65536)return;let t=e.nextSibling;for(;t!==null&&t.nodeType===3;)t.remove(),e.nodeValue+=t.nodeValue,t=e.nextSibling}function gn(e){var t=B;if(t===null)return z.f|=ie,e;if(!(t.f&32768)&&!(t.f&4))throw e;_n(e,t)}function _n(e,t){if(e===E)throw e;if(!(t!==null&&t.f&16384)){for(;t!==null;){if(t.f&128&&!(t.f&33570816)){if(!(t.f&32768))throw e;try{t.b.error(e);return}catch(t){e=t}}t=t.parent}throw e}}function vn(e){B===null&&(z===null&&Me(e),je()),Wn&&Ae(e)}function yn(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function bn(e,t){var n=B;n!==null&&n.f&8192&&(e|=y);var r={ctx:Ve,deps:null,nodes:null,f:e|_|512,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};N?.register_created_effect(r);var i=r;if(e&4)Dt===null?jt.ensure().schedule(r):Dt.push(r);else if(t!==null){try{fr(r)}catch(e){throw Fn(r),e}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&!(i.f&524288)&&(i=i.first,e&16&&e&65536&&i!==null&&(i.f|=ee))}if(i!==null&&(i.parent=n,n!==null&&yn(i,n),z!==null&&z.f&2&&!(e&64))){var a=z;(a.effects??=[]).push(i)}return r}function xn(){return z!==null&&!Kn}function Sn(e){let t=bn(8,null);return Qe(t,g),t.teardown=e,t}function Cn(e){vn(`$effect`);var t=B.f;if(!z&&t&32&&Ve!==null&&!Ve.i){var n=Ve;(n.e??=[]).push(e)}else return wn(e)}function wn(e){return bn(4|w,e)}function Tn(e){jt.ensure();let t=bn(64|C,e);return(e={})=>new Promise(n=>{e.outro?Rn(t,()=>{Fn(t),n(void 0)}):(Fn(t),n(void 0))})}function En(e){return bn(4,e)}function Dn(e){return bn(re|C,e)}function On(e,t=0){return bn(8|t,e)}function R(e,t=[],n=[],r=[]){st(r,t,n,t=>{bn(8,()=>{e(...t.map(V))})})}function kn(e,t=0){return bn(16|t,e)}function An(e,t=0){return bn(h|t,e)}function jn(e){return bn(32|C,e)}function Mn(e){var t=e.teardown;if(t!==null){let n=Wn,r=z;Gn(!0),qn(null);try{t.call(null)}catch(t){_n(t,e.parent)}finally{Gn(n),qn(r)}}}function Nn(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){let e=n.ac;e!==null&&at(()=>{e.abort(pe)});var r=n.next;n.f&64?n.parent=null:Fn(n,t),n=r}}function Pn(e){for(var t=e.first;t!==null;){var n=t.next;t.f&32||Fn(t),t=n}}function Fn(e,t=!0){var n=!1;(t||e.f&262144)&&e.nodes!==null&&e.nodes.end!==null&&(In(e.nodes.start,e.nodes.end),n=!0),e.f|=S,Nn(e,t&&!n),dr(e,0);var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)e.stop();Mn(e),e.f^=S,e.f|=b;var i=e.parent;i!==null&&i.first!==null&&Ln(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function In(e,t){for(;e!==null;){var n=e===t?null:ln(e);e.remove(),e=n}}function Ln(e){var t=e.parent,n=e.prev,r=e.next;n!==null&&(n.next=r),r!==null&&(r.prev=n),t!==null&&(t.first===e&&(t.first=r),t.last===e&&(t.last=n))}function Rn(e,t,n=!0){var r=[];e.f|=256,zn(e,r,!0);var i=()=>{n&&Fn(e),t&&t()},a=r.length;if(a>0){var o=()=>--a||i();for(var s of r)s.out(o)}else i()}function zn(e,t,n){if(!(e.f&8192)){e.f^=y;var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)(e.is_global||n)&&t.push(e);for(var i=e.first;i!==null;){var a=i.next;if(!(i.f&64)){var o=!!(i.f&65536)||!!(i.f&32)&&!!(e.f&16);zn(i,t,o?n:!1)}i=a}}}function Bn(e){e.f&=-257,Vn(e,!0)}function Vn(e,t){if(!(e.f&256)&&e.f&8192){e.f^=y,e.f&1024||(Qe(e,_),jt.ensure().schedule(e));for(var n=e.first;n!==null;){var r=n.next,i=!!(n.f&65536)||!!(n.f&32);Vn(n,i?t:!1),n=r}var a=e.nodes&&e.nodes.t;if(a!==null)for(let e of a)(e.is_global||t)&&e.in()}}function Hn(e,t){if(e.nodes)for(var n=e.nodes.start,r=e.nodes.end;n!==null;){var i=n===r?null:ln(n);t.append(n),n=i}}var Un=null,Wn=!1;function Gn(e){Wn=e}var z=null,Kn=!1;function qn(e){z=e}var B=null;function Jn(e){B=e}var Yn=null;function Xn(e){z!==null&&(!ze&&z.f&2097152||z.f&2)&&(Yn??=new Set).add(e)}var Zn=null,Qn=0,$n=null;function er(e){$n=e}var tr=1,nr=0,rr=nr;function ir(e){rr=e}function ar(){return++tr}function or(e){var t=e.f;if(t&2048)return!0;if(t&4096){for(var n=e.deps,r=n.length,i=0;i<r;i++){var a=n[i];if(or(a)&&_t(a),a.wv>e.wv)return!0}t&512&&Ct===null&&Qe(e,g)}return!1}function sr(e,t,n=!0){var r=e.reactions;if(r!==null&&(ze||Yn===null||!Yn.has(e)))for(var i=0;i<r.length;i++){var a=r[i];a.f&2?sr(a,t,!1):t===a&&(n?Qe(a,_):a.f&1024&&Qe(a,v),Rt(a))}}function cr(e){var t=Zn,n=Qn,r=$n,i=z,a=Yn,o=Ve,s=Kn,c=rr,l=e.f;Zn=null,Qn=0,$n=null,z=l&96?null:e,Yn=null,He(e.ctx),Kn=!1,rr=++nr,e.ac!==null&&(at(()=>{e.ac.abort(pe)}),e.ac=null);try{e.f|=ne;var u=e.fn,d=u();e.f|=x;var f=lr(e);if(Ke()&&$n!==null&&!Kn&&f!==null&&!(e.f&6146))for(var p=0;p<$n.length;p++)sr($n[p],e);if(i!==null&&i!==e){if(nr++,i.deps!==null)for(let e=0;e<n;e+=1)i.deps[e].rv=nr;if(t!==null)for(let e of t)e.rv=nr;$n!==null&&(r===null?r=$n:r.push(...$n))}return e.f&8388608&&(e.f^=ie),d}catch(t){return lr(e),gn(t)}finally{e.f^=ne,Zn=t,Qn=n,$n=r,z=i,Yn=a,He(o),Kn=s,rr=c}}function lr(e){var t=e.deps,n=N?.is_fork;if(Zn!==null){var r;if(n||dr(e,Qn),t!==null&&Qn>0)for(t.length=Qn+Zn.length,r=0;r<Zn.length;r++)t[Qn+r]=Zn[r];else e.deps=t=Zn;if(xn()&&e.f&512)for(r=Qn;r<t.length;r++)(t[r].reactions??=[]).push(e)}else!n&&t!==null&&Qn<t.length&&(dr(e,Qn),t.length=Qn);return t}function ur(e,r){let i=r.reactions;if(i!==null){var a=t.call(i,e);if(a!==-1){var o=i.length-1;o===0?i=r.reactions=null:(i[a]=i[o],i.pop())}}if(i===null&&r.f&2&&(Zn===null||!n.call(Zn,r))){var s=r;s.f&512&&(s.f^=512),s.v!==D&&$e(s),s.ac!==null&&at(()=>{s.ac.abort(pe),s.ac=null,Qe(s,_)}),vt(s),dr(s,0)}}function dr(e,t){var n=e.deps;if(n!==null)for(var r=t;r<n.length;r++)ur(e,n[r])}function fr(e){var t=e.f;if(!(t&16384)){Qe(e,g);var n=B;B=e;try{t&16777232?Pn(e):Nn(e),Mn(e);var r=cr(e);e.teardown=typeof r==`function`?r:null,e.wv=tr}finally{B=n}}}async function pr(){if(ze)return new Promise(e=>{requestAnimationFrame(()=>e()),setTimeout(()=>e())});await Promise.resolve(),Mt()}function V(e){var t=!!(e.f&2);if(Un?.add(e),z!==null&&!Kn&&!(B!==null&&B.f&16384)&&(Yn===null||!Yn.has(e))){var r=z.deps;if(z.f&2097152)e.rv<nr&&(e.rv=nr,Zn===null&&r!==null&&r[Qn]===e?Qn++:Zn===null?Zn=[e]:Zn.push(e));else{z.deps??=[],n.call(z.deps,e)||z.deps.push(e);var i=e.reactions;i===null?e.reactions=[z]:n.call(i,z)||i.push(z)}}if(Wn&&Ht.has(e))return Ht.get(e);if(t){var a=e;if(Wn){var o=a.v;return(!(a.f&1024)&&a.reactions!==null||hr(a))&&(o=gt(a)),Ht.set(a,o),o}var s=!(a.f&512)&&!Kn&&z!==null&&!!(z.f&512),c=(a.f&x)===0;or(a)&&(s&&(a.f|=512),_t(a)),s&&!c&&(yt(a),mr(a))}if(Ct?.has(e))return Ct.get(e);if(e.f&8388608)throw e.v;return e.v}function mr(e){if(e.f|=512,e.deps!==null)for(let r of e.deps){var t=r.reactions;t===null?r.reactions=[e]:n.call(t,e)||t.push(e),r.f&2&&!(r.f&512)&&(yt(r),mr(r))}}function hr(e){if(e.v===D)return!0;if(e.deps===null)return!1;for(let t of e.deps)if(Ht.has(t)||t.f&2&&hr(t))return!0;return!1}function gr(e){var t=Kn;try{return Kn=!0,e()}finally{Kn=t}}function _r(e){return e.endsWith(`capture`)&&e!==`gotpointercapture`&&e!==`lostpointercapture`}var vr=[`beforeinput`,`click`,`change`,`dblclick`,`contextmenu`,`focusin`,`focusout`,`input`,`keydown`,`keyup`,`mousedown`,`mousemove`,`mouseout`,`mouseover`,`mouseup`,`pointerdown`,`pointermove`,`pointerout`,`pointerover`,`pointerup`,`touchend`,`touchmove`,`touchstart`];function yr(e){return vr.includes(e)}var br=`allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback`.split(`.`),xr={formnovalidate:`formNoValidate`,ismap:`isMap`,nomodule:`noModule`,playsinline:`playsInline`,readonly:`readOnly`,defaultvalue:`defaultValue`,defaultchecked:`defaultChecked`,srcobject:`srcObject`,novalidate:`noValidate`,allowfullscreen:`allowFullscreen`,disablepictureinpicture:`disablePictureInPicture`,disableremoteplayback:`disableRemotePlayback`};function Sr(e){return e=e.toLowerCase(),xr[e]??e}[...br];var Cr=[`touchstart`,`touchmove`];function wr(e){return Cr.includes(e)}var Tr=Symbol(`events`),Er=new Set,Dr=new Set;function Or(e,t,n,r={}){function i(e){if(r.capture||Pr.call(t,e),!e.cancelBubble)return at(()=>n?.call(this,e))}return e.startsWith(`pointer`)||e.startsWith(`touch`)||e===`wheel`?(i.__removed=!1,Ye(()=>{i.__removed||t.addEventListener(e,i,r)})):t.addEventListener(e,i,r),i}function kr(e,t,n,r={}){var i=Or(t,e,n,r);return()=>{i.__removed=!0,e.removeEventListener(t,i,r)}}function Ar(e,t,n){(t[Tr]??={})[e]=n}function jr(e){for(var t=0;t<e.length;t++)Er.add(e[t]);for(var n of Dr)n(e)}var Mr=null,Nr=!1;function Pr(e){var t=this,n=t.ownerDocument,r=e.type,a=e.composedPath?.()||[],o=a[0]||e.target;Mr=e,Nr||(Nr=!0,setTimeout(()=>{Nr=!1,Mr=null}));var s=0,c=Mr===e&&e[Tr];if(c){var l=a.indexOf(c);if(l!==-1&&(t===document||t===window)){e[Tr]=t;return}var u=a.indexOf(t);if(u===-1)return;l<=u&&(s=l)}if(o=a[s]||e.target,o!==t){i(e,`currentTarget`,{configurable:!0,get(){return o||n}});var d=z,f=B;qn(null),Jn(null);try{for(var p,m=[];o!==null&&o!==t;){try{var h=o[Tr]?.[r];h!=null&&(!o.disabled||e.target===o)&&h.call(o,e)}catch(e){p?m.push(e):p=e}if(e.cancelBubble)break;s++,o=s<a.length?a[s]:null}if(p){for(let e of m)queueMicrotask(()=>{throw e});throw p}}finally{e[Tr]=t,delete e.currentTarget,qn(d),Jn(f)}}}var Fr=globalThis?.window?.trustedTypes&&globalThis.window.trustedTypes.createPolicy(`svelte-trusted-html`,{createHTML:e=>e});function Ir(e){return Fr?.createHTML(e)??e}function Lr(e){var t=mn(`template`);return t.innerHTML=Ir(e.replaceAll(`<!>`,`<!---->`)),t.content}function Rr(e,t){var n=B;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function H(e,t){var n=!!(t&1),r=!!(t&2),i,a=!e.startsWith(`<!>`);return()=>{if(k)return Rr(A,null),A;i===void 0&&(i=Lr(a?e:`<!>`+e),n||(i=cn(i)));var t=r||nn?document.importNode(i,!0):i.cloneNode(!0);if(n){var o=cn(t),s=t.lastChild;Rr(o,s)}else Rr(t,t);return t}}function zr(e,t,n=`svg`){var r=!e.startsWith(`<!>`),i=!!(t&1),a=`<${n}>${r?e:`<!>`+e}</${n}>`,o;return()=>{if(k)return Rr(A,null),A;if(!o){var e=cn(Lr(a));if(i)for(o=document.createDocumentFragment();cn(e);)o.appendChild(cn(e));else o=cn(e)}var t=o.cloneNode(!0);if(i){var n=cn(t),r=t.lastChild;Rr(n,r)}else Rr(t,t);return t}}function Br(e,t){return zr(e,t,`svg`)}function Vr(){if(k)return Rr(A,null),A;var e=document.createDocumentFragment(),t=document.createComment(``),n=sn();return e.append(t,n),Rr(t,n),e}function U(e,t){if(k){var n=B;(!(n.f&32768)||n.nodes.end===null)&&(n.nodes.end=A),xe();return}e!==null&&e.before(t)}function Hr(e){let t=0,n=Wt(0),r;return()=>{xn()&&(V(n),On(()=>(t===0&&(r=gr(()=>e(()=>Xt(n)))),t+=1,()=>{Ye(()=>{--t,t===0&&(r?.(),r=void 0,Xt(n))})})))}}var Ur=ee|C;function Wr(e,t,n,r){new Gr(e,t,n,r)}var Gr=class{parent;is_pending=!1;transform_error;#e;#t=k?A:null;#n;#r;#i;#a=null;#o=null;#s=null;#c=null;#l=0;#u=0;#d=!1;#f=new Set;#p=new Set;#m=null;#h=Hr(()=>(this.#m=Wt(this.#l),()=>{this.#m=null}));constructor(e,t,n,r){this.#e=e,this.#n=t,this.#r=e=>{var t=B;t.b=this,t.f|=128,n(e)},this.parent=B.b,this.transform_error=r??this.parent?.transform_error??(e=>e),this.#i=kn(()=>{if(k){let e=we(this.#t);xe();let t=e===`[!`;if(e.startsWith(`[?`)){let t=JSON.parse(e.slice(2));this.#_(t)}else t?this.#b():this.#g()}else this.#x()},Ur),k&&(this.#e=A)}#g(){try{this.#a=jn(()=>this.#r(this.#e))}catch(e){this.error(e)}}#_(e){let t=this.#n.failed,{reset:n,invoke_onerror:r}=this.#v(e);Ye(r),t&&(this.#s=jn(()=>{t(this.#e,()=>e,()=>n)}))}#v(e){var t=!1,n=!1;let r=()=>{if(!this.#y()){if(t){ve();return}t=!0,n&&Re(),this.#s!==null&&Rn(this.#s,()=>{this.#s=null}),this.#C(()=>{this.#x()})}};return{reset:r,invoke_onerror:()=>{if(!this.#y())try{n=!0,this.#n.onerror?.(e,r),n=!1}catch(e){_n(e,this.#i&&this.#i.parent)}}}}#y(){return(this.#i.f&(b|S))!==0}#b(){let e=this.#n.pending;e&&(this.is_pending=!0,this.#o=jn(()=>e(this.#e)),Ye(()=>{if(!this.#y()){var e=this.#c=document.createDocumentFragment(),t=sn(),n=!1;if(e.append(t),this.#a=this.#C(()=>{try{return jn(()=>this.#r(t))}catch(e){try{this.error(e),n=!0}catch(e){_n(e,this.#i.parent)}return null}}),this.#a===null){this.#c=null,n&&this.#S(N);return}this.#u===0&&(this.#e.before(e),this.#c=null,Rn(this.#o,()=>{this.#o=null}),this.#S(N))}}))}#x(){try{if(this.is_pending=this.has_pending_snippet(),this.#u=0,this.#l=0,this.#a=jn(()=>{this.#r(this.#e)}),this.#u>0){var e=this.#c=document.createDocumentFragment();Hn(this.#a,e);let t=this.#n.pending;this.#o=jn(()=>t(this.#e))}else this.#S(N)}catch(e){this.error(e)}}#S(e){this.is_pending=!1,e.transfer_effects(this.#f,this.#p)}defer_effect(e){et(e,this.#f,this.#p)}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!this.#n.pending}#C(e){var t=B,n=z,r=Ve;Jn(this.#i),qn(this.#i),He(this.#i.ctx);try{return jt.ensure(),e()}finally{Jn(t),qn(n),He(r)}}#w(e,t){if(!this.has_pending_snippet()){this.parent&&this.parent.#w(e,t);return}this.#u+=e,this.#u===0&&(this.#S(t),this.#o&&Rn(this.#o,()=>{this.#o=null}),this.#c&&=(this.#e.before(this.#c),null))}update_pending_count(e,t){this.#w(e,t),this.#l+=e,!(!this.#m||this.#d)&&(this.#d=!0,Ye(()=>{this.#d=!1,this.#m&&Jt(this.#m,this.#l)}))}get_effect_pending(){return this.#h(),V(this.#m)}error(e){if(e===E||!this.#n.onerror&&!this.#n.failed)throw e;N?.is_fork?(this.#a&&N.skip_effect(this.#a),this.#o&&N.skip_effect(this.#o),this.#s&&N.skip_effect(this.#s),N.oncommit(()=>{this.#y()||this.#T(e)})):this.#T(e)}#T(e){this.#a&&=(Fn(this.#a),null),this.#o&&=(Fn(this.#o),null),this.#s&&=(Fn(this.#s),null),k&&(be(this.#t),Se(),be(Ce()));let t=this.#n.failed,n=e=>{if(this.#y())return;let{reset:n,invoke_onerror:r}=this.#v(e);r(),t&&!this.#y()&&(this.#s=this.#C(()=>{try{return jn(()=>{var r=B;r.b=this,r.f|=128,t(this.#e,()=>e,()=>n)})}catch(e){return _n(e,this.#i.parent),null}}))};Ye(()=>{if(!this.#y()){var t;try{t=this.transform_error(e)}catch(e){_n(e,this.#i&&this.#i.parent);return}typeof t==`object`&&t&&typeof t.then==`function`?t.then(n,e=>_n(e,this.#i&&this.#i.parent)):n(t)}})}},Kr=!0;function qr(e,t){var n=t==null?``:typeof t==`object`?`${t}`:t;n!==(e[de]??=e.nodeValue)&&(e[de]=n,e.nodeValue=`${n}`)}function Jr(e,t){return Xr(e,t)}var Yr=new Map;function Xr(e,{target:t,anchor:n,props:i={},events:a,context:o,intro:s=!0,transformError:c}){on();var l=void 0,u=Tn(()=>{var u=n??t.appendChild(sn());Wr(u,{pending:()=>{}},t=>{Ue({});var n=Ve;if(o&&(n.c=o),a&&(i.$$events=a),k&&Rr(t,null),Kr=s,l=e(t,i)||Ge(),Kr=!0,k&&(B.nodes.end=A,A===null||A.nodeType!==8||A.data!==`]`))throw O(),E;We()},c);var d=new Set,f=e=>{for(var n=0;n<e.length;n++){var r=e[n];if(!d.has(r)){d.add(r);var i=wr(r);for(let e of[t,document]){var a=Yr.get(e);a===void 0&&(a=new Map,Yr.set(e,a));var o=a.get(r);o===void 0?(e.addEventListener(r,Pr,{passive:i}),a.set(r,1)):a.set(r,o+1)}}}};return f(r(Er)),Dr.add(f),()=>{for(var e of d)for(let n of[t,document]){var r=Yr.get(n),i=r.get(e);--i==0?(n.removeEventListener(e,Pr),r.delete(e),r.size===0&&Yr.delete(n)):r.set(e,i)}Dr.delete(f),u!==n&&u.parentNode?.removeChild(u)}});return Zr.set(l,u),l}var Zr=new WeakMap,Qr=class{anchor;#e=new Map;#t=new Map;#n=new Map;#r=new Set;#i=!0;constructor(e,t=!0){this.anchor=e,this.#i=t}#a=e=>{if(this.#e.has(e)){var t=this.#e.get(e),n=this.#t.get(t);if(n)Bn(n),this.#r.delete(t);else{var r=this.#n.get(t);r&&(Bn(r.effect),this.#t.set(t,r.effect),this.#n.delete(t),r.fragment.lastChild.remove(),this.anchor.before(r.fragment),n=r.effect)}for(let[t,n]of this.#e){if(this.#e.delete(t),t===e)break;let r=this.#n.get(n);r&&(Fn(r.effect),this.#n.delete(n))}for(let[e,r]of this.#t){if(e===t||this.#r.has(e))continue;let i=()=>{if(Array.from(this.#e.values()).includes(e)){var t=document.createDocumentFragment();Hn(r,t),t.append(sn()),this.#n.set(e,{effect:r,fragment:t})}else Fn(r);this.#r.delete(e),this.#t.delete(e)};this.#i||!n?(this.#r.add(e),Rn(r,i,!1)):i()}}};#o=e=>{this.#e.delete(e);let t=Array.from(this.#e.values());for(let[e,n]of this.#n)t.includes(e)||(Fn(n.effect),this.#n.delete(e))};ensure(e,t){var n=N,r=pn();if(t&&!this.#t.has(e)&&!this.#n.has(e)){if(r){var i=document.createDocumentFragment(),a=sn();i.append(a),this.#n.set(e,{effect:jn(()=>t(a)),fragment:i})}else this.#t.set(e,jn(()=>t(this.anchor)))}if(this.#e.set(n,e),r){for(let[t,r]of this.#t)t===e?n.unskip_effect(r):n.skip_effect(r);for(let[t,r]of this.#n)t===e?n.unskip_effect(r.effect):n.skip_effect(r.effect);n.oncommit(this.#a),n.ondiscard(this.#o)}else k&&(this.anchor=A),this.#a(n)}};function W(e,t,n=!1){var r;k&&(r=A,xe());var i=new Qr(e),a=n?ee:0;function o(e,t){if(k){var n=we(r);if(e!==parseInt(n.substring(1))){var a=Ce();be(a),i.anchor=a,ye(!1),i.ensure(e,t),ye(!0);return}}i.ensure(e,t)}kn(()=>{var e=!1;t((t,n=0)=>{e=!0,o(n,t)}),e||o(-1,null)},a)}var $r=Symbol(`NaN`);function ei(e,t,n){k&&xe();var r=new Qr(e),i=!Ke();kn(()=>{var e=t();e!==e&&(e=$r),i&&typeof e==`object`&&e&&(e={}),r.ensure(e,n)})}function ti(e,t,n){for(var i=[],a=t.length,o,s=t.length,c=0;c<a;c++){let n=t[c];Rn(n,()=>{if(o){if(o.pending.delete(n),o.done.add(n),o.pending.size===0){var t=e.outrogroups;ni(e,r(o.done)),t.delete(o),t.size===0&&(e.outrogroups=null)}}else--s},!1)}if(s===0){var l=i.length===0&&n!==null&&e.pending.size===0;if(l){var u=n,d=u.parentNode;fn(d),d.append(u),e.items.clear()}ni(e,t,!l)}else o={pending:new Set(t),done:new Set},(e.outrogroups??=new Set).add(o)}function ni(e,t,n=!0){var r;if(e.pending.size>0){r=new Set;for(let t of e.pending.values())for(let n of t)r.add(e.items.get(n).e)}for(var i=0;i<t.length;i++){var a=t[i];r?.has(a)?(a.f|=te,Hn(a,document.createDocumentFragment())):Fn(t[i],n)}}var ri;function ii(t,n,i,a,o,s=null){var c=t,l=new Map;if(n&4){var u=t;c=k?be(cn(u)):u.appendChild(sn())}k&&xe();var d=null,f=mt(()=>{var t=i();return e(t)?t:t==null?[]:r(t)}),p=new Map,m=!0;function h(e){if(!(_.effect.f&16384)){_.pending.delete(e);var t=V(f);_.fallback=d,oi(_,t,c,n,a),d!==null&&(t.length===0?d.f&33554432?(d.f^=te,ci(d,null,c)):Bn(d):Rn(d,()=>{d=null}))}}function g(e){_.pending.delete(e)}var _={effect:kn(()=>{var e=V(f),t=e.length;let r=!1;k&&we(c)===`[!`!=(t===0)&&(c=Ce(),be(c),ye(!1),r=!0);for(var u=new Set,_=N,v=pn(),y=0;y<t;y+=1){k&&A.nodeType===8&&A.data===`]`&&(c=A,r=!0,ye(!1));var b=e[y],x=a(b,y),S=m?null:l.get(x);S?(S.v&&Jt(S.v,b),S.i&&Jt(S.i,y),v&&_.unskip_effect(S.e)):(S=si(l,m?c:ri??=sn(),b,x,y,o,n,i),m||(S.e.f|=te),l.set(x,S)),u.add(x)}if(t===0&&s&&!d&&(m?d=jn(()=>s(c)):(d=jn(()=>s(ri??=sn())),d.f|=te)),t>u.size&&ke(``,``,``),k&&t>0&&be(Ce()),!m){if(p.set(_,u),v){for(let[e,t]of l)u.has(e)||_.skip_effect(t.e);_.oncommit(h),_.ondiscard(g)}else h(_)}r&&ye(!0),V(f)}),flags:n,items:l,pending:p,outrogroups:null,fallback:d};m=!1,k&&(c=A)}function ai(e){for(;e!==null&&!(e.f&32);)e=e.next;return e}function oi(e,t,n,i,a){var o=!!(i&8),s=t.length,c=e.items,l=ai(e.effect.first),u,d=null,f,p=[],m=[],h,g,_,v;if(o)for(v=0;v<s;v+=1)h=t[v],g=a(h,v),_=c.get(g).e,_.f&33554432||(_.nodes?.a?.measure(),(f??=new Set).add(_));for(v=0;v<s;v+=1){if(h=t[v],g=a(h,v),_=c.get(g).e,e.outrogroups!==null)for(let t of e.outrogroups)t.pending.delete(_),t.done.delete(_);if(_.f&8192&&(Bn(_),o&&(_.nodes?.a?.unfix(),(f??=new Set).delete(_))),_.f&33554432){if(_.f^=te,_===l)ci(_,null,n);else{var y=d?d.next:l;_===e.effect.last&&(e.effect.last=_.prev),_.prev&&(_.prev.next=_.next),_.next&&(_.next.prev=_.prev),li(e,d,_),li(e,_,y),ci(_,y,n),d=_,p=[],m=[],l=ai(d.next);continue}}if(_!==l){if(u!==void 0&&u.has(_)){if(p.length<m.length){var b=m[0],x;d=b.prev;var S=p[0],ee=p[p.length-1];for(x=0;x<p.length;x+=1)ci(p[x],b,n);for(x=0;x<m.length;x+=1)u.delete(m[x]);li(e,S.prev,ee.next),li(e,d,S),li(e,ee,b),l=b,d=ee,--v,p=[],m=[]}else u.delete(_),ci(_,l,n),li(e,_.prev,_.next),li(e,_,d===null?e.effect.first:d.next),li(e,d,_),d=_;continue}for(p=[],m=[];l!==null&&l!==_;)(u??=new Set).add(l),m.push(l),l=ai(l.next);if(l===null)continue}_.f&33554432||p.push(_),d=_,l=ai(_.next)}if(e.outrogroups!==null){for(let t of e.outrogroups)t.pending.size===0&&(ni(e,r(t.done)),e.outrogroups?.delete(t));e.outrogroups.size===0&&(e.outrogroups=null)}if(l!==null||u!==void 0){var C=[];if(u!==void 0)for(_ of u)_.f&8192||C.push(_);for(;l!==null;)!(l.f&8192)&&l!==e.fallback&&C.push(l),l=ai(l.next);var w=C.length;if(w>0){var ne=i&4&&s===0?n:null;if(o){for(v=0;v<w;v+=1)C[v].nodes?.a?.measure();for(v=0;v<w;v+=1)C[v].nodes?.a?.fix()}ti(e,C,ne)}}o&&Ye(()=>{if(f!==void 0)for(_ of f)_.nodes?.a?.apply()})}function si(e,t,n,r,i,a,o,s){var c=o&1?o&16?Wt(n):Gt(n,!1,!1):null,l=o&2?Wt(i):null;return{v:c,i:l,e:jn(()=>(a(t,c??n,l??i,s),()=>{e.delete(r)}))}}function ci(e,t,n){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,a=t&&!(t.f&33554432)?t.nodes.start:n;r!==null;){var o=ln(r);if(a.before(r),r===i)return;r=o}}function li(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}function ui(e,t,...n){var r=new Qr(e);kn(()=>{let e=t()??null;r.ensure(e,e&&(t=>e(t,...n)))},ee)}function di(e,t,n){var r;k&&(r=A,xe());var i=new Qr(e);kn(()=>{var e=t()??null;if(k&&we(r)===`[`!=(e!==null)){var a=Ce();be(a),i.anchor=a,ye(!1),i.ensure(e,e&&(t=>n(t,e))),ye(!0);return}i.ensure(e,e&&(t=>n(t,e)))},ee)}var fi=()=>performance.now(),pi={tick:e=>requestAnimationFrame(e),now:()=>fi(),tasks:new Set};function mi(){let e=pi.now();pi.tasks.forEach(t=>{t.c(e)||(pi.tasks.delete(t),t.f())}),pi.tasks.size!==0&&pi.tick(mi)}function hi(e){let t;return pi.tasks.size===0&&pi.tick(mi),{promise:new Promise(n=>{pi.tasks.add(t={c:e,f:n})}),abort(){pi.tasks.delete(t)}}}function gi(e,t){at(()=>{e.dispatchEvent(new CustomEvent(t))})}function _i(e){if(e===`float`)return`cssFloat`;if(e===`offset`)return`cssOffset`;if(e.startsWith(`--`))return e;let t=e.split(`-`);return t.length===1?t[0]:t[0]+t.slice(1).map(e=>e[0].toUpperCase()+e.slice(1)).join(``)}function vi(e){let t={},n=e.split(`;`);for(let e of n){let[n,r]=e.split(`:`);if(!n||r===void 0)break;let i=_i(n.trim());t[i]=r.trim()}return t}var yi=e=>e;function bi(e,t,n,r){var i=!!(e&1),a=!!(e&2),o=i&&a,s=!!(e&4),c=o?`both`:i?`in`:`out`,l,u=t.inert,d=t.style.overflow,f,p;function m(){return at(()=>l??=n()(t,r?.()??{},{direction:c}))}var h={is_global:s,in(){if(t.inert=u,!i){p?.abort(),p?.reset?.();return}a||f?.abort(),f=xi(t,m(),p,1,()=>{gi(t,`introstart`)},()=>{gi(t,`introend`),f?.abort(),f=l=void 0,t.style.overflow=d})},out(e){if(!a){e?.(),l=void 0;return}t.inert=!0,p=xi(t,m(),f,0,()=>{gi(t,`outrostart`)},()=>{gi(t,`outroend`),e?.()})},stop:()=>{f?.abort(),p?.abort()}},g=B;if((g.nodes.t??=[]).push(h),i&&Kr){var _=s;if(!_){for(var v=g.parent;v&&v.f&65536;)for(;(v=v.parent)&&!(v.f&16););_=!v||!!(v.f&32768)}_&&En(()=>{gr(()=>h.in())})}}function xi(e,t,n,r,i,a){var o=r===1,s=!1;if(d(t)){var c;return Ye(()=>{s||(c=xi(e,t({direction:o?`in`:`out`}),n,r,i,a))}),{abort:()=>{s=!0,c?.abort()},deactivate:()=>c?.deactivate(),reset:()=>c?.reset(),t:()=>c?.t()??1-r}}if(n?.deactivate(),!t?.duration&&!t?.delay)return i(),a(),{abort:f,deactivate:f,reset:f,t:()=>r};let{delay:l=0,css:u,tick:p,easing:m=yi}=t;var h,g=()=>1-r;return Ye(()=>{if(!s){var c=[];if(o&&n===void 0&&(p&&p(0,1),u)){var d=vi(u(0,1));c.push(d,d)}h=e.animate(c,{duration:l,fill:`forwards`}),h.onfinish=()=>{h.cancel(),i();var o=n?.t()??1-r;n?.abort();var s=r-o,c=t.duration*Math.abs(s),l=[];if(c>0){var d=!1;if(u)for(var f=Math.ceil(c/(1e3/60)),_=0;_<=f;_+=1){var v=o+s*m(_/f),y=vi(u(v,1-v));l.push(y),d||=y.overflow===`hidden`}d&&(e.style.overflow=`hidden`),g=()=>{var e=h.currentTime;return o+s*m(e/c)},p&&hi(()=>{if(h.playState!==`running`)return!1;var e=g();return p(e,1-e),!0})}h=e.animate(l,{duration:c,fill:`forwards`}),h.onfinish=()=>{g=()=>r,p?.(r,1-r),a()}}}}),{abort:()=>{s=!0,h&&(h.cancel(),h.effect=null,h.onfinish=f)},deactivate:()=>{a=f},reset:()=>{r===0&&p?.(1,0)},t:()=>g()}}function Si(e,t){var n=void 0,r;An(()=>{n!==(n=t())&&(r&&=(Fn(r),null),n&&(r=jn(()=>{En(()=>n(e))})))})}function Ci(e){var t,n,r=``;if(typeof e==`string`||typeof e==`number`)r+=e;else if(typeof e==`object`){if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(n=Ci(e[t]))&&(r&&(r+=` `),r+=n)}else for(n in e)e[n]&&(r&&(r+=` `),r+=n)}return r}function wi(){for(var e,t,n=0,r=``,i=arguments.length;n<i;n++)(e=arguments[n])&&(t=Ci(e))&&(r&&(r+=` `),r+=t);return r}function Ti(e){return typeof e==`object`?wi(e):e??``}var Ei=[...` 	
\r\f\xA0\v﻿`];function Di(e,t,n){var r=e==null?``:``+e;if(t&&(r=r?r+` `+t:t),n){for(var i of Object.keys(n))if(n[i])r=r?r+` `+i:i;else if(r.length)for(var a=i.length,o=0;(o=r.indexOf(i,o))>=0;){var s=o+a;(o===0||Ei.includes(r[o-1]))&&(s===r.length||Ei.includes(r[s]))?r=(o===0?``:r.substring(0,o))+r.substring(s+1):o=s}}return r===``?null:r}function Oi(e,t=!1){var n=t?` !important;`:`;`,r=``;for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==``&&(r+=` `+i+`: `+a+n)}return r}function ki(e){return e[0]!==`-`||e[1]!==`-`?e.toLowerCase():e}function Ai(e,t){if(t){var n=``,r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\/\*.*?\*\//g,``).trim();var a=!1,o=0,s=!1,c=[];r&&c.push(...Object.keys(r).map(ki)),i&&c.push(...Object.keys(i).map(ki));var l=0,u=-1;let t=e.length;for(var d=0;d<t;d++){var f=e[d];if(s?f===`/`&&e[d-1]===`*`&&(s=!1):a?a===f&&(a=!1):f===`/`&&e[d+1]===`*`?s=!0:f===`"`||f===`'`?a=f:f===`(`?o++:f===`)`&&o--,!s&&a===!1&&o===0){if(f===`:`&&u===-1)u=d;else if(f===`;`||d===t-1){if(u!==-1){var p=ki(e.substring(l,u).trim());if(!c.includes(p)){f!==`;`&&d++;var m=e.substring(l,d).trim();n+=` `+m+`;`}}l=d+1,u=-1}}}}return r&&(n+=Oi(r)),i&&(n+=Oi(i,!0)),n=n.trim(),n===``?null:n}return e==null?null:String(e)}function ji(e,t,n,r,i,a){var o=e[ue];if(k||o!==n||o===void 0){var s=Di(n,r,a);(!k||s!==e.getAttribute(`class`))&&(s==null?e.removeAttribute(`class`):t?e.className=s:e.setAttribute(`class`,s)),e[ue]=n}else if(a&&i!==a)for(var c in a){var l=!!a[c];(i==null||l!==!!i[c])&&e.classList.toggle(c,l)}return a}function Mi(e,t={},n,r){for(var i in n){var a=n[i];t[i]!==a&&(n[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,r))}}function Ni(e,t,n,r){var i=e[T];if(k||i!==t){var a=Ai(t,r);(!k||a!==e.getAttribute(`style`))&&(a==null?e.removeAttribute(`style`):e.style.cssText=a),e[T]=t}else r&&(Array.isArray(r)?(Mi(e,n?.[0],r[0]),Mi(e,n?.[1],r[1],`important`)):Mi(e,n,r));return r}function Pi(e,t){t?e.hasAttribute(`selected`)||e.setAttribute(`selected`,``):e.removeAttribute(`selected`)}function Fi(e,t){var n=!(`__defaultValue`in e);(n||e.__defaultValue!==t)&&(e.__defaultValue=t,Ii(e,!n||`__value`in e))}function Ii(t,n){var r=t.__defaultValue,i=t.multiple,a=i?r??[]:null;if(!i||e(a)){var o=t.selectedIndex,s=n&&i?new Set(t.selectedOptions):null;for(var c of t.options){var l=zi(c);Pi(c,i?a.includes(l):en(l,r))}if(n){if(s!==null)for(c of t.options){var u=s.has(c);c.selected!==u&&(c.selected=u)}else t.selectedIndex!==o&&(t.selectedIndex=o)}}}function Li(t,n,r=!1){if(t.multiple){if(n==null)return;if(!e(n))return _e();for(var i of t.options)i.selected=n.includes(zi(i));return}for(i of t.options)if(en(zi(i),n)){i.selected=!0;return}(!r||n!==void 0)&&(t.selectedIndex=-1)}function Ri(e){var t=new MutationObserver(t=>{t.every(Bi)||(`__defaultValue`in e&&Ii(e,!1),`__value`in e&&Li(e,e.__value))});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`value`]}),Sn(()=>{t.disconnect()})}function zi(e){return`__value`in e?e.__value:e.value}function Bi(e){if(e.target.closest(`selectedcontent`)!==null)return!0;if(e.type===`childList`){var t=[...e.addedNodes,...e.removedNodes];return t.length>0&&t.every(e=>e.nodeName===`SELECTEDCONTENT`)}return!1}var Vi=Symbol(`class`),Hi=Symbol(`style`),Ui=Symbol(`is custom element`),Wi=Symbol(`is html`),Gi=me?`link`:`LINK`,Ki=me?`input`:`INPUT`,qi=me?`option`:`OPTION`,Ji=me?`select`:`SELECT`,Yi=me?`progress`:`PROGRESS`;function Xi(e){if(k){var t=!1,n=()=>{if(!t){if(t=!0,e.hasAttribute(`value`)){var n=e.value;G(e,`value`,null),e.value=n}if(e.hasAttribute(`checked`)){var r=e.checked;G(e,`checked`,null),e.checked=r}}};e[fe]=n,Ye(n),it()}}function G(e,t,n,r){var i=$i(e);k&&(i[t]=e.getAttribute(t),t===`src`||t===`srcset`||t===`href`&&e.nodeName===Gi)||i[t]!==(i[t]=n)&&(t===`loading`&&(e[ce]=n),n==null?e.removeAttribute(t):typeof n!=`string`&&ta(e).has(t)?e[t]=n:e.setAttribute(t,n))}function Zi(e,t,n,r,i=!1,a=!1){k&&i&&e.nodeName===Ki&&(`defaultValue`in n||`defaultChecked`in n||Xi(e));var o=$i(e),s=o[Ui],c=!o[Wi];let l=k&&s;l&&ye(!1);var u=t||{},d=e.nodeName===qi,f=e.nodeName===Ji;try{for(var p in t)!(p in n)&&p[0]+p[1]!==`$$`&&(n[p]=null);n.class?n.class=Ti(n.class):(r||n[Vi])&&(n.class=null),n[Hi]&&(n.style??=null);var m=ta(e);if(e.nodeName===Ki&&`type`in n&&(`value`in n||`__value`in n)){var h=n.type;(h!==u.type||h===void 0&&e.hasAttribute(`type`))&&(u.type=h,G(e,`type`,h,a))}for(let i in n){let l=n[i];if(d&&i===`value`&&l==null){e.value=e.__value=``,u[i]=l;continue}if(i===`class`){ji(e,e.namespaceURI===`http://www.w3.org/1999/xhtml`,l,r,t?.[Vi],n[Vi]),u[i]=l,u[Vi]=n[Vi];continue}if(i===`style`){Ni(e,l,t?.[Hi],n[Hi]),u[i]=l,u[Hi]=n[Hi];continue}var g=u[i];if(l!==g||l===void 0&&e.hasAttribute(i)){u[i]=l;var _=i[0]+i[1];if(_!==`$$`){if(_===`on`){let t={},n=`$$`+i,r=i.slice(2);var v=yr(r);if(_r(r)&&(r=r.slice(0,-7),t.capture=!0),!v&&g){if(l!=null)continue;e.removeEventListener(r,u[n],t),u[n]=null}if(v)Ar(r,e,l),jr([r]);else if(l!=null){function a(e){u[i].call(this,e)}u[n]=Or(r,e,a,t)}}else if(i===`style`)G(e,i,l);else if(i===`autofocus`)tt(e,!!l);else if(!s&&(i===`__value`||i===`value`&&l!=null))e.__value=l,(g==null||e.value!==l||l===0&&e.nodeName===Yi)&&(e.value=l);else if(i===`selected`&&d)Pi(e,l);else{var y=i;c||(y=Sr(y));var b=y===`defaultValue`||y===`defaultChecked`;if(f&&y===`defaultValue`)continue;if(l==null&&!s&&!b){if(o[i]=null,y===`value`||y===`checked`){let n=e,r=t===void 0;if(y===`value`){let e=n.defaultValue;n.removeAttribute(y),n.defaultValue=e,n.value=n.__value=r?e:null}else{let e=n.defaultChecked;n.removeAttribute(y),n.defaultChecked=e,n.checked=r?e:!1}}else e.removeAttribute(i)}else b||(s||typeof l!=`string`)&&m.has(y)?(e[y]=l,y in o&&(o[y]=D)):typeof l!=`function`&&G(e,y,l,a)}}}}}finally{l&&ye(!0)}return u}function Qi(e,t,n=[],r=[],i=[],a,o=!1,s=!1){st(i,n,r,n=>{var r=void 0,i={},c=e.nodeName===Ji,l=!1;if(An(()=>{var u=t(...n.map(V)),d=Zi(e,r,u,a,o,s);if(l&&c){var f=e;`defaultValue`in u&&Fi(f,u.defaultValue),`value`in u&&Li(f,u.value)}for(let e of Object.getOwnPropertySymbols(i))u[e]||Fn(i[e]);for(let t of Object.getOwnPropertySymbols(u)){var p=u[t];t.description===`@attach`&&(!r||p!==r[t])&&(i[t]&&Fn(i[t]),i[t]=jn(()=>Si(e,()=>p))),d[t]=p}r=d}),c){var u=e;En(()=>{var e=r;`defaultValue`in e&&Fi(u,e.defaultValue),Li(u,e.value,!0),Ri(u)})}l=!0})}function $i(e){return e[le]??={[Ui]:e.nodeName.includes(`-`),[Wi]:e.namespaceURI===he}}var ea=new Map;function ta(e){var t=e.getAttribute(`is`)||e.nodeName,n=ea.get(t);if(n)return n;ea.set(t,n=new Set);for(var r,i=e,a=Element.prototype;a!==i;){for(var s in r=o(i),r)r[s].set&&s!==`innerHTML`&&s!==`textContent`&&s!==`innerText`&&n.add(s);i=l(i)}return n}function na(e,t,n=t){var r=new WeakSet;ot(e,`input`,async i=>{var a=i?e.defaultValue:e.value;if(a=ra(e)?ia(a):a,n(a),N!==null&&r.add(N),await pr(),a!==(a=t())){var o=e.selectionStart,s=e.selectionEnd,c=e.value.length;if(e.value=a??``,s!==null){var l=e.value.length;o===s&&s===c&&l>c?(e.selectionStart=l,e.selectionEnd=l):(e.selectionStart=o,e.selectionEnd=Math.min(s,l))}}}),(k&&e.defaultValue!==e.value||gr(t)==null&&e.value)&&(n(ra(e)?ia(e.value):e.value),N!==null&&r.add(N)),On(()=>{var n=t();if(e===document.activeElement){var i=ze?St:N;if(r.has(i))return}ra(e)&&n===ia(e.value)||(e.type!==`date`||n||e.value)&&n!==e.value&&(e.value=n??``)})}function ra(e){var t=e.type;return t===`number`||t===`range`}function ia(e){return e===``?null:+e}function aa(e,t){return e===t||e?.[ae]===t}function oa(e=Ge(),t,n,r){var i=Ve.r,a=B;return En(()=>{var o,s;return On(()=>{o=s,s=r?.()||[],gr(()=>{aa(n(...s),e)||(t(e,...s),o&&aa(n(...o),e)&&t(null,...o))})}),()=>{let r=a;for(;r!==i&&r.parent!==null&&r.parent.f&33554432;)r=r.parent;let o=()=>{s&&aa(n(...s),e)&&t(null,...s)},c=r.teardown;r.teardown=()=>{o(),c?.()}}}),e}var sa=!1;function ca(e){var t=sa;try{return sa=!1,[e(),sa]}finally{sa=t}}var la={get(e,t){if(!e.exclude.has(t))return e.props[t]},set(e,t){return!1},getOwnPropertyDescriptor(e,t){if(!e.exclude.has(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},has(e,t){return!e.exclude.has(t)&&t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.has(t))}};function ua(e,t,n){return new Proxy({props:e,exclude:t},la)}function da(e,t,n,r){var i=!0,o=!!(n&8),s=!!(n&16),c=r,l=!0,u=void 0,d=()=>s&&i?(u??=dt(r),V(u)):(l&&(l=!1,c=s?gr(r):r),c);let f;if(o){var p=ae in e||se in e;f=a(e,t)?.set??(p&&t in e?n=>e[t]=n:void 0)}var m,h=!1;o?[m,h]=ca(()=>e[t]):m=e[t],m===void 0&&r!==void 0&&(m=d(),f&&(i&&Pe(t),f(m)));var g=i?()=>{var n=e[t];return n===void 0?d():(l=!0,n)}:()=>{var n=e[t];return n!==void 0&&(c=void 0),n===void 0?c:n};if(i&&!(n&4))return g;if(f){var _=e.$$legacy;return(function(e,t){return arguments.length>0?((!i||!t||_||h)&&f(t?g():e),e):g()})}var v=!1,y=(n&1?dt:mt)(()=>(v=!1,g()));o&&V(y);var b=B;return(function(e,t){if(arguments.length>0){let n=t?V(y):i&&o?Qt(e):e;return F(y,n),v=!0,c!==void 0&&(c=n),e}return Wn&&v||b.f&16384?y.v:V(y)})}var fa=`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,pa=e=>`
.state-page {
  container: state-page / inline-size;
  margin-inline: calc(50% - 50vw);
  padding: 24px;
}

.state-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: ${e}px;
  margin-inline: auto;
}

.state-switcher {
  all: unset;
  display: none;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  scrollbar-width: none;
  padding: 6px;
  border-radius: 14px;
  background: rgb(20 20 20 / 0.92);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  font: 13px/1 ${fa};
  user-select: none;
}

.state-switcher-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.state-switcher-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 6px;
  font-size: 11px;
  font-weight: 500;
  color: rgb(255 255 255 / 0.45);
}

.state-switcher button {
  all: unset;
  flex: none;
  padding: 8px 10px;
  border-radius: 8px;
  font: inherit;
  color: rgb(255 255 255 / 0.6);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 200ms ease-out, font-weight 200ms ease-out;
}

.state-switcher button:hover {
  color: rgb(255 255 255 / 0.85);
}

.state-switcher button[aria-pressed="true"] {
  background: rgb(255 255 255 / 0.14);
  color: rgb(255 255 255);
  font-weight: 500;
}

.state-switcher button:focus-visible {
  outline: 2px solid rgb(255 255 255 / 0.7);
  outline-offset: 2px;
}

.state-switcher-selects {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.state-switcher-select {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  color: rgb(255 255 255);
}

.state-switcher-select select {
  all: unset;
  box-sizing: border-box;
  max-width: 100%;
  padding: 10px 36px 10px 16px;
  border-radius: 999px;
  background: rgb(20 20 20 / 0.92);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
  font: 500 13px/1 ${fa};
  cursor: pointer;
}

.state-switcher-select select:focus-visible {
  outline: 2px solid rgb(255 255 255 / 0.7);
  outline-offset: 2px;
}

.state-switcher-select svg {
  position: absolute;
  top: 50%;
  right: 14px;
  translate: 0 -50%;
  pointer-events: none;
  color: rgb(255 255 255 / 0.6);
}

.state-page[data-switcher-hidden] :is(.state-switcher, .state-switcher-selects) {
  visibility: hidden;
}

/* 208px list + 24px gap + ${e}px stage */
@container state-page (min-width: ${e+232}px) {
  .state-layout {
    display: grid;
    grid-template-columns: 208px ${e}px;
    justify-content: center;
    gap: 24px;
    align-items: start;
    max-width: none;
  }

  .state-switcher {
    display: flex;
    position: sticky;
    top: 24px;
  }

  .state-switcher-selects {
    display: none;
  }
}
`,ma=`<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v4a3 3 0 0 0 3 3h7" /><path d="m10 7 3 3-3 3" /></svg>`,ha=`<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4" /></svg>`,ga=`__state`;function _a(e,t){if(!t)return e??``;let n={};for(let t of(e??``).split(`,`)){let e=t.indexOf(`:`);e>0&&(n[t.slice(0,e)]=t.slice(e+1))}return n}function va(e,t={},n){let r=document.createElement(e);for(let[e,n]of Object.entries(t))r.setAttribute(e,n);return n!==void 0&&(r.textContent=n),r}function ya(e){if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return!0;let t=e.target;return t instanceof Element&&!!t.closest(`input, textarea, select, [contenteditable]:not([contenteditable='false'])`)}var ba=0;function xa({width:e,groups:t,axes:n=!1,initial:r,resolve:i=e=>e,onchange:a=()=>void 0,stage:o,label:s=`States`,host:c=document.body}){ba+=1;let l=`states-${ba}`,u=e=>typeof t==`function`?t(e):t,d=e=>n?e.axis??e.key:``,f=e=>{let t=new Map;for(let n of u(e))t.set(d(n),[...t.get(d(n))??[],n]);return t},p=e=>{if(!n){let t=u(e).flatMap(e=>e.states);return t.some(t=>t.value===e)?e:t.some(e=>e.value===r)?r:t[0]?.value}let t={...e};for(let n=0;n<2;n+=1){let n={};for(let[r,i]of f(t)){let t=i.flatMap(e=>e.states),a=e=>t.some(t=>t.value===e),o=i.find(e=>e.initial!==void 0)?.initial;n[r]=a(e[r])?e[r]:a(o)?o:t[0]?.value}t={...e,...n}}return t},m=e=>n?[...f(e).keys()].map(t=>`${t}:${e[t]}`).join(`,`):String(e),h=new URLSearchParams(location.search).get(ga),g=()=>p(_a(new URLSearchParams(location.search).get(ga),n)),_=e=>{let t=new URL(location.href);return t.searchParams.set(ga,m(e)),`${t.pathname}${t.search.replace(/%2C/gi,`,`).replace(/%3A/gi,`:`)}${t.hash}`};if(!document.querySelector(`style[data-state-switcher]`)){let t=va(`style`,{"data-state-switcher":``});t.textContent=pa(e),document.head.append(t)}let v=va(`div`,{class:`state-page`}),y=va(`div`,{class:`state-layout`}),b=va(`nav`,{class:`state-switcher`,"aria-label":s}),x=va(`div`,{class:`state-switcher-selects`}),S=va(`div`,{class:`state-stage`});y.append(b,x,S),v.append(y);let ee=o??[...c.childNodes].filter(e=>!(e instanceof HTMLScriptElement));S.append(...ee),c.prepend(v);let C={state:g(),named:h!==null,stage:S,set:se,refresh:ce},w=null,te=(e,t)=>n?C.state[d(e)]===t:C.state===t,ne=()=>u(C.state).flatMap(e=>e.states.map(t=>[e,t.value]));function re(e,t){let r=va(`div`,{class:`state-switcher-select`}),i=va(`select`,{"aria-label":n?t.map(e=>e.label).join(` · `):`State`});n&&(i.dataset.group=e),i.addEventListener(`change`,e=>{let[n,r]=JSON.parse(e.target.value);oe(t.find(e=>e.key===n),r)});for(let e of t){let r=t.length>1||!n?va(`optgroup`,{label:e.label}):i;for(let t of e.states){let n=va(`option`,{value:JSON.stringify([e.key,t.value])},t.label);n.selected=te(e,t.value),r.append(n)}r!==i&&i.append(r)}r.append(i),r.insertAdjacentHTML(`beforeend`,ha),x.append(r)}function ie(){let e=b.scrollTop;b.replaceChildren(),x.replaceChildren();for(let[e,t]of f(C.state)){for(let r of t){let t=`${l}-${String(r.key).replace(/[^\w-]/g,`-`)}`,i=va(`div`,{class:`state-switcher-group`,role:`group`,"aria-labelledby":t,"data-group":r.key,...n?{"data-axis":e}:{}}),a=va(`span`,{class:`state-switcher-heading`,id:t});a.innerHTML=ma,a.append(r.label),i.append(a);for(let e of r.states){let t=va(`button`,{type:`button`,"data-state":e.value,"aria-pressed":String(te(r,e.value))},e.label);t.addEventListener(`click`,()=>oe(r,e.value)),i.append(t)}b.append(i)}re(e,t)}b.scrollTop=e,ae()}function ae(){let e=w?.[0].key,t=(e===void 0?b:b.querySelector(`[data-group="${CSS.escape(String(e))}"]`)??b).querySelector(`button[aria-pressed="true"]`);if(!t||b.clientHeight===0)return;let n=t.offsetTop-b.offsetTop-6,r=n+t.offsetHeight+12;n<b.scrollTop?b.scrollTop=n:r>b.scrollTop+b.clientHeight&&(b.scrollTop=r-b.clientHeight)}function oe(e,t){let r=C.state,o=d(e),s=p(n?i({...r,[o]:t},o,r):t);if(w=[e,t],m(s)===m(r)){a(s,r);return}C.state=s,history.pushState(history.state,``,_(s)),ie(),a(s,r)}function se(e){C.state=p(n?{...C.state,...e}:e),history.replaceState(history.state,``,_(C.state)),ie()}function ce(){se(C.state)}return addEventListener(`popstate`,()=>{let e=C.state;C.state=g(),ie(),m(e)!==m(C.state)&&a(C.state,e)}),addEventListener(`keydown`,e=>{if(ya(e))return;if(e.key===`h`||e.key===`H`){v.toggleAttribute(`data-switcher-hidden`);return}let t={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[e.key];if(!t)return;let n=ne(),r=w?n.findIndex(([e,t])=>e.key===w[0].key&&t===w[1]):n.findIndex(([e,t])=>te(e,t)),[i,a]=n[(Math.max(r,0)+t+n.length)%n.length];e.preventDefault(),oe(i,a)}),history.replaceState(history.state,``,_(C.state)),ie(),C}typeof window<`u`&&((window.__svelte??={}).v??=new Set).add(`5`),Be();var[Sa,...Ca]=`project	place	position	glyph	text	reason
Cawco	board	0	grill	Grill me on “Make the Caw bookend kit for clips” until it has a spec	It has sat in idea for 10 days, not started.
Cawco	board	1	bug	Find out why the “Weekly X milestone check” routine failed and fix it	This routine’s last run failed.
Cawco	board	2	reply	Walk me through what “Post: install a skill once across the whole fleet” needs from me	It has waited on you in review for 10 days.
Cawco	board	3	reply	Walk me through what “Post: stop typing the same correction to every agent” needs from me	It has waited on you in review for 10 days.
Cawco	board	4	reply	Walk me through what “Post: one board instead of a wall of agent terminals” needs from me	It has waited on you in review for 10 days.
Cawco	board	5	grill	Grill me on “Write .agents/product-marketing.md for the marketing sk…” until it has a spec	It has sat in idea for 9 days, not started.
Cawco	decisions	0	explore	Lay out the options in “A session set up a routine: Review hub join f…” as a decision page	Its last answer lays out options for you to choose between.
Cawco	routines	0	triage	Every Monday, triage the week’s new “writer” tasks	7 tasks like these were filed in the last 14 days.
Cawco-Dev	board	0	grill	Grill me on “Publish the chip design page for each chip category” until it has a spec	It has sat in ready for 1 day, not started.
Cawco-Dev	board	1	search	Check what landed in “Design previews: how far DESIGN.md's new rules reach, today beside…”	It is one of the latest commits on main.
Cawco-Dev	board	2	grill	Grill me on “Ask for a sentence-shaped approval card when an agent e…” until it has a spec	It has sat in ready for 1 day, not started.
Cawco-Dev	board	3	grill	Grill me on “Give workflows a home of their own, apart from routines” until it has a spec	It is in ready and not started yet.
Cawco-Dev	board	4	grill	Grill me on “Rethink the sidebar highlight and the message row's edi…” until it has a spec	It has sat in ready for 1 day, not started.
Cawco-Dev	board	5	grill	Grill me on “Stop the orchestrator editing .md files instead of the…” until it has a spec	It has sat in ready for 1 day, not started.
Cawco-Dev	decisions	0	explore	Lay out the options in “connect cawco-dev to its github repo so issue…” as a decision page	Its last answer lays out options for you to choose between.
Cawco-Dev	routines	0	routine	Every Monday, do what “Live check of nightly 5539: reply with the word ready.” asked	This conversation asks for work that comes back again and again.
Cawco-Dev	routines	1	routine	Every Monday, do what “Live check of nightly 5552: reply with the word ready.” asked	This conversation asks for work that comes back again and again.
Cawco-Dev	routines	2	routine	Every Monday, do what “Live check of nightly 5548: reply with the word ready.” asked	This conversation asks for work that comes back again and again.
Cawco-Dev	routines	3	routine	Every Monday, do what “Live check of nightly 5541: reply with the word ready.” asked	This conversation asks for work that comes back again and again.
Cawco-Dev	routines	4	triage	Every Monday, triage the week’s new “fleet/machines” tasks	6 tasks like these were filed in the last 14 days.
HyucksField	board	0	tasks	Read HyucksField’s notes and file its first tasks	It has no open tasks, and its notes say what it is for.
anbar	board	0	tasks	Read anbar’s notes and file its first tasks	It has no open tasks, and its notes say what it is for.
patapon	board	0	tasks	Read patapon’s notes and file its first tasks	It has no open tasks, and its notes say what it is for.`.split(`
`),wa=Sa.split(`	`),Ta=Ca.map(e=>{let t=e.split(`	`);return Object.fromEntries(wa.map((e,n)=>[e,t[n]??``]))}),Ea=(e,t,n)=>{let r=Ta.find(r=>r.project===e&&r.place===t&&r.position===String(n));if(!r)throw Error(`no starter ${e} ${t} ${n}`);return{glyph:r.glyph,text:r.text,reason:r.reason}},Da=[0,1,2].map(e=>Ea(`Cawco`,`board`,e)),Oa=[Ea(`Cawco`,`board`,1)],ka=[...[0,1,2,3].map(e=>Ea(`Cawco`,`board`,e)),...[0,1,3].map(e=>Ea(`Cawco-Dev`,`board`,e))],Aa=[Ea(`Cawco`,`board`,5),Ea(`Cawco-Dev`,`board`,1),Ea(`Cawco-Dev`,`board`,2)],ja=e=>e.map(({glyph:e,text:t})=>({glyph:e,text:t})),Ma={one:Oa,three:Da,seven:ka,longest:Aa},K=(e,t,n={})=>({value:e,label:t,draws:{set:`three`,reasons:!0,loading:!1,expanded:!1,held:null,phase:`rest`,touch:!1,...n}}),q={loading:K(`loading`,`Loading`,{loading:!0}),one:K(`one`,`One`,{set:`one`}),three:K(`three`,`Three`),sevenCollapsed:K(`seven-collapsed`,`Seven collapsed`,{set:`seven`}),withReasons:K(`with-reasons`,`With reasons`),withoutReasons:K(`without-reasons`,`Without reasons`,{reasons:!1}),rest:K(`rest`,`Rest`),focus:K(`focus`,`Focus-visible`,{held:`focus`}),longest:K(`longest`,`Longest text at 380`,{set:`longest`})},Na=[{value:`today`,label:`Today`,note:``,where:[`thread`,`board`,`phone`],data:[K(`three`,`Three`),K(`one`,`One`,{set:`one`}),K(`seven`,`Seven`,{set:`seven`}),K(`longest`,`Longest`,{set:`longest`}),K(`no-reasons`,`No reasons`,{reasons:!1}),K(`loading`,`Loading`,{loading:!0})]},{value:`drafts`,label:`Unsent drafts`,note:`Report: the stack stands right-aligned on the composer, in a centred 560px column on the board, and hides while the keyboard is up.`,where:[`thread`,`board`,`phone`,`keyboard`],data:[q.loading,K(`none`,`None (hidden)`,{set:`none`}),q.one,q.three,q.sevenCollapsed,K(`seven-expanded`,`Seven expanded`,{set:`seven`,expanded:!0}),q.withReasons,q.withoutReasons,q.rest,K(`hover`,`Hover`,{held:`hover`}),q.focus,K(`pressed`,`Pressed (travel)`,{held:`pressed`}),K(`filled`,`Filled (text in box, stack dimmed)`,{phase:`filled`}),K(`typing`,`Typing (hidden)`,{phase:`typing`}),K(`cleared`,`Composer cleared (returns)`,{phase:`cleared`}),K(`touch`,`Touch`,{touch:!0}),q.longest]},{value:`ledger`,label:`The ledger`,note:`The design's stated change: on the board the rows stand at the report's 560px reading width.`,where:[`thread`,`board`,`phone`],data:[q.loading,K(`none`,`None`,{set:`none`}),q.one,q.three,q.sevenCollapsed,K(`seven-expanded`,`Seven expanded`,{set:`seven`,expanded:!0}),q.withReasons,q.withoutReasons,q.rest,K(`hover`,`Hover`,{held:`hover`}),q.focus,K(`pressed`,`Pressed`,{held:`pressed`}),K(`filled`,`Filled (pencil→check)`,{phase:`filled`}),K(`typing`,`Typing (faded)`,{phase:`typing`}),K(`cleared`,`Composer cleared`,{phase:`cleared`}),K(`refresh`,`Refresh pressed (rewriting, rows shimmer in place)`,{phase:`refresh`}),K(`touch`,`Touch`,{touch:!0}),q.longest]},{value:`tray`,label:`The tray`,note:`The design's stated change: the suggestions live in the composer's own frame, centred at 560px on the board, growing upward from it until the heading's room, then scrolling inside.`,where:[`thread`,`board`,`phone`,`keyboard`],data:[q.loading,K(`none`,`None (no tray)`,{set:`none`}),q.one,q.three,q.sevenCollapsed,K(`seven-expanded`,`Seven expanded (grows upward)`,{set:`seven`,expanded:!0}),q.withReasons,q.withoutReasons,q.rest,K(`hover`,`Hover (reason reveals)`,{held:`hover`}),q.focus,K(`pressed`,`Pressed (lift)`,{held:`pressed`}),K(`filled`,`Filled + chip row`,{phase:`filled`}),K(`scrolled`,`Chip row scrolled`,{phase:`scrolled`}),K(`reopened`,`Tray reopened via chevron`,{phase:`reopened`}),K(`cleared`,`Composer cleared (tray returns)`,{phase:`cleared`}),K(`sent`,`After first send (tray closed)`,{phase:`sent`}),K(`touch`,`Touch (reasons always shown)`,{touch:!0}),q.longest]}],Pa={thread:{label:`Caw’s thread (380)`,width:380},board:{label:`The empty board (725)`,width:725},phone:{label:`The phone (390)`,width:390},keyboard:{label:`The phone, keyboard up (390)`,width:390}},Fa=[{value:`light`,label:`Light`},{value:`dark`,label:`Dark`}],Ia=e=>Na.find(t=>t.value===e)?.note??``,La=e=>{let t=Na.find(t=>t.value===e)??Na[0];return[{key:`direction`,label:`Direction`,entries:Na.map(({value:e,label:t})=>({value:e,label:t}))},{key:`where`,label:`Where`,entries:t.where.map(e=>({value:e,label:Pa[e].label}))},{key:`data`,label:`Data`,entries:t.data.map(({value:e,label:t})=>({value:e,label:t}))},{key:`theme`,label:`Theme`,entries:Fa}]},Ra=e=>[`direction`,`where`,`data`,`theme`].map(t=>`${t}:${e[t]}`).join(`,`);function za(e){let t=Na.find(t=>t.value===e.direction),n=t?.data.find(t=>t.value===e.data)?.draws??t?.data[0]?.draws,r=n.set===`none`?[]:Ma[n.set];return{...n,items:n.reasons?r:ja(r),touch:n.touch||e.where===`phone`||e.where===`keyboard`}}var Ba=H(`<img alt="" src="caw/caw-ready-day.png"/><img alt="" src="caw/caw-ready-night.png"/>`,1);function Va(e,t){let n=da(t,`class`,3,``);var r=Ba(),i=un(r),a=L(i);R(()=>{ji(i,1,`${n()??``} caw-still day`),G(i,`height`,t.size),G(i,`width`,t.size),ji(a,1,`${n()??``} caw-still night`),G(a,`height`,t.size),G(a,`width`,t.size)}),U(e,r)}var Ha=class{#e;#t;constructor(e,t){this.#e=e,this.#t=Hr(t)}get current(){return this.#t(),this.#e()}},Ua=/\(.+\)/,Wa=new Set([`all`,`print`,`screen`,`and`,`or`,`not`,`only`]),Ga=new class extends Ha{constructor(e,t){let n=Ua.test(e)||e.split(/[\s,]+/).some(e=>Wa.has(e.trim()))?e:`(${e})`,r=window.matchMedia(n);super(()=>r.matches,e=>kr(r,`change`,e))}}(`(prefers-reduced-motion: no-preference)`);function Ka(e,t,n,r){let i=3*e,a=3*(n-e)-i,o=1-i-a,s=3*t,c=3*(r-t)-s,l=1-s-c,u=e=>((o*e+a)*e+i)*e,d=e=>((l*e+c)*e+s)*e,f=e=>(3*o*e+2*a)*e+i,p=e=>{let t=e;for(let n=0;n<8;n+=1){let n=u(t)-e;if(Math.abs(n)<1e-6)return t;let r=f(t);if(Math.abs(r)<1e-6)break;t-=n/r}let n=0,r=1;for(t=e;r-n>1e-6;)u(t)<e?n=t:r=t,t=(n+r)/2;return t};return e=>e<=0?0:e>=1?1:d(p(e))}Ka(.23,1,.32,1),Ka(.77,0,.175,1);var qa=Ka(.32,.72,0,1),Ja=`--dur-control.--dur-menu.--dur-pop.--dur-panel.--dur-grow.--dur-grow-exit.--dur-lift.--dur-press-hold.--dur-exit.--dur-toggle.--dur-morph.--dur-rail.--dur-fade.--dur-hold.--dur-ghost.--dur-stagger.--dur-cascade.--dur-skeleton-reveal.--skeleton-reveal-blur.--ease-out.--ease-in-out.--ease-drawer.--pop-scale.--pop-rise.--space-1.--space-3.--dur-loop.--dur-mark-hold.--dur-peek.--dur-settle.--dur-wait-grace.--ease-figure.--echo-opacity.--echo-scale.--deck-shrink.--deck-step.--press-scale.--ride-fade.--space-2.--space-4.--text-meta.--c-pin-card-w`.split(`.`),Ya=new Map,Xa=!1,Za=e=>{let t=Ya.get(e);if(t!==void 0)return t;let n=document.documentElement;Xa||(Xa=!0,new MutationObserver(()=>Ya.clear()).observe(n,{attributes:!0,attributeFilter:[`class`]}));let r=getComputedStyle(n);for(let t of Ya.size===0?[...Ja,e]:[e])Ya.set(t,r.getPropertyValue(t).trim());return Ya.get(e)},Qa=e=>{let t=Za(e),n=Number.parseFloat(t);return t.endsWith(`ms`)?n:n*1e3},$a=e=>Za(e),eo={out:`cubic-bezier(0.23, 1, 0.32, 1)`,inOut:`cubic-bezier(0.77, 0, 0.175, 1)`,drawer:`cubic-bezier(0.32, 0.72, 0, 1)`,glideIn:`cubic-bezier(0.3333, 0, 0.6667, 0.3333)`,glideOut:`cubic-bezier(0.3333, 0.6667, 0.6667, 1)`},to=e=>Number.parseFloat(Za(e))||0;function no(e,t){let n=to(`--space-3`)+to(`--space-1`),r=n>0?Math.min(1,e/n):0,i=to(`--space-3`)*r,a=to(`--space-1`)*r,o=2*i/t,s=Math.max(0,e-i-a)/t,c=2*a/t,l=o+s+c;return{covered:n=>{if(n<=0)return 0;if(n<o)return t/(2*o)*n*n;if(n<o+s)return i+t*(n-o);if(n<l){let r=l-n;return e-t/(2*c)*r*r}return e},duration:l,frames:(t,n)=>l<=0||e<=0?[t,n]:[{...t,offset:0,easing:eo.glideIn},{...ao(t,n,i/e),offset:o/l,easing:`linear`},{...ao(t,n,(e-a)/e),offset:(o+s)/l,easing:eo.glideOut},{...n,offset:1}],reached:n=>n<=0?0:n>=e?l:n<i?Math.sqrt(2*o*n/t):n<=e-a?o+(n-i)/t:l-Math.sqrt(2*c*(e-n)/t)}}var ro=/-?\d*\.?\d+(?:e[-+]?\d+)?/gi,io=new Set([`offset`,`easing`,`composite`,`computedOffset`]);function ao(e,t,n){let r={};for(let[i,a]of Object.entries(e)){if(io.has(i)||a==null)continue;let e=String(t[i]??a).match(ro)??[],o=0;r[i]=String(a).replace(ro,t=>{let r=Number(t),i=Number(e[o]??t);return o+=1,String(Number((r+(i-r)*n).toFixed(3)))})}return r}Ka(.42,0,.58,1);var oo=new Map,so=new Set,co=(e,t)=>{let[n]=t===`border-box`?e.borderBoxSize:e.contentBoxSize;return`${n?.inlineSize??0}x${n?.blockSize??0}`},lo=null,uo=globalThis.ResizeObserver,fo=e=>{let t=new Set;for(let n of e)for(let[e,r]of oo.get(n.target)??[]){let i=co(n,r.box);i!==r.heard&&(r.heard=i,e.delivered.push(n),t.add(e))}return t},po=e=>{let t=[];for(let n of e.delivered)e.options.first&&!e.reported.has(n.target)?t.push(n):e.take(n),e.reported.add(n.target);return t},mo=(e,t)=>{let n=e.delivered,r=po(e);for(let i of[r.length>0?e.options.first?.(r):void 0,e.options.inside?.(n)])i&&t.push(i)},ho=e=>{let t=fo(e),n=[...so];so.clear();let r=[...new Set([...t,...n])],i=r.filter(e=>!e.foreign);for(let e of i)e.options.read?.(e.delivered);for(let e of n)e.ask?.();let a=[];for(let e of i)mo(e,a),e.delivered=[];for(let e of r)if(e.foreign){let t=e.delivered;e.delivered=[],e.foreign(t)}for(let e of a)e()},go=()=>(lo??=new uo(ho),lo),_o=e=>{let t=[...oo.get(e)?.values()??[]].map(e=>e.box),n=go();n.unobserve(e),n.observe(e,{box:t.includes(`border-box`)?`border-box`:`content-box`})},vo=e=>{let t=new Set,n=n=>{let r=oo.get(n);r?.delete(e),r?.size===0&&(oo.delete(n),lo?.unobserve(n)),t.delete(n)};return{observe:(n,r)=>{let i=oo.get(n);i||(i=new Map,oo.set(n,i)),i.set(e,{box:r?.box??`content-box`,heard:null}),t.add(n),_o(n)},release:n,releaseAll:()=>{for(let e of[...t])n(e)}}};uo&&typeof window<`u`&&(window.ResizeObserver=class{#e;constructor(e){let t={delivered:[],foreign:t=>e(t,this),options:{},reported:new WeakSet,take:()=>void 0};this.#e=vo(t)}observe(e,t){this.#e.observe(e,t)}unobserve(e){this.#e.release(e)}disconnect(){this.#e.releaseAll()}});var yo=[`class`,`hidden`,`open`,`data-state`],bo=(e=[])=>({childList:!0,characterData:!0,subtree:!0,attributes:!0,attributeFilter:[...yo,...e]}),xo=null;function So(e,t={}){let n=xo!==null&&(t.close===!0&&xo.pace.speed!==null||t.speed!==void 0&&xo.pace.close);if(!xo||n){let e={runs:new Set,pace:{close:!1,speed:null},since:null};xo=e;let t=0,n=()=>{if(t+=1,t<(e.since===null?2:1)){requestAnimationFrame(n);return}xo===e&&(xo=null);let r=e.since??Number(document.timeline.currentTime);for(let t of e.runs)t(r,e.pace)};requestAnimationFrame(n)}let r=xo;return t.now&&r.since===null&&(r.since=Number(document.timeline.currentTime)),t.close&&(r.pace.close=!0),t.speed!==void 0&&(r.pace.speed=Math.max(r.pace.speed??t.speed,t.least??t.speed)),r.runs.add(e),()=>{r.runs.delete(e)}}function Co(e,t,n,r){if(e.speed&&r>0){let i=no(r,e.speed);return{frames:i.frames(t,n),share:e=>i.covered(e*i.duration)/r,timing:{duration:Math.max(1,i.duration),easing:`linear`}}}return{frames:[t,n],share:e=>e,timing:e.close?Do():Eo()}}var wo=e=>{let{offset:t,easing:n,composite:r,computedOffset:i,...a}=e;return a};function To(e,t){return e.pause(),So((n,r)=>{if(e.playState!==`paused`)return;let i=e.effect;if(i&&t!==void 0&&(r.speed||r.close)){let[e,...n]=i.getKeyframes(),a=Co(r,wo(e),wo(n.at(-1)??e),t);i.setKeyframes(a.frames),i.updateTiming(a.timing)}e.startTime=n}),e}var Eo=()=>({duration:Qa(`--dur-panel`),easing:$a(`--ease-in-out`)}),Do=()=>({duration:Qa(`--dur-exit`),easing:$a(`--ease-in-out`)}),Oo=new Set,ko=new Set,Ao=new Map,jo=e=>e.inert;function Mo(e,t){let n=[],r=null;for(let[t,i]of Ao){if(t===e||!e.contains(t))continue;let a=(jo(t)?[[`display`,`none`]]:[[`height`,`${i.height}px`],[`margin-block-end`,`${i.margin}px`],...i.edges.map(([e,t])=>[e,`${t}px`])]).map(([e,n])=>{let r=[e,t.style.getPropertyValue(e),t.style.getPropertyPriority(e)];return t.style.setProperty(e,n,`important`),r});n.push({el:t,props:a}),(!r||i.ms>r.ms)&&(r={ms:i.ms,easing:i.easing})}let i=t();for(let{el:e,props:t}of n)for(let[n,r,i]of t)e.style.setProperty(n,r,i);return{clock:r,value:i}}var No=new Set;function Po(){let e=[...No];No.clear();let t=e.map(e=>e.drawn());for(let t of e)t.stop();let n=e.map(e=>e.natural());e.forEach((e,r)=>{let i=t[r];i&&e.tween(i,n[r])})}function Fo({width:e=!1,ms:t,on:n=[],rows:r=!1,followUnfolds:i=!1,still:a}={}){return o=>{let s=null,c,l,u=()=>{if(r){let e=o.getBoundingClientRect();return{w:e.width,h:e.height}}return{w:o.offsetWidth,h:o.offsetHeight}},d=(e,n,i)=>r?To(o.animate(e,{duration:Qa(`--dur-panel`),easing:$a(`--ease-in-out`)}),n):o.animate(e,i?{duration:i.ms,easing:i.easing}:{duration:t??Qa(`--dur-morph`),easing:eo.drawer}),f=()=>{for(let e of Oo)if(e!==o&&o.contains(e))return!0;return!1},p=()=>{for(let e of Ao.keys())if(e!==o&&o.contains(e))return!0;return!1},m=e=>{e!==o&&o.contains(e)&&g.stop()},h=(t,n)=>Math.max(Math.abs(n.h-t.h),e?Math.abs(n.w-t.w):0),g={drawn:()=>c?u():s,natural:()=>{let{clock:e,value:t}=Mo(o,()=>({size:u(),children:[...o.children].filter(e=>e instanceof HTMLElement&&getComputedStyle(e).position!==`absolute`).map(e=>{let t=e.getBoundingClientRect();return{child:e,blockSize:t.height,inlineSize:t.width}})}));return{...t,clock:e}},stop:()=>{c?.cancel(),c=void 0,l?.(),l=void 0},tween:(t,{size:n,children:r,clock:o})=>{if(!((Math.abs(n.h-t.h)>.5||e&&Math.abs(n.w-t.w)>.5)&&Ga.current)||a?.()||t.h===0||n.h===0||f()||i&&p())return;let s=[{height:`${t.h}px`,overflow:`hidden`},{height:`${n.h}px`,overflow:`hidden`}];e&&(s[0].width=`${t.w}px`,s[1].width=`${n.w}px`);let u=r.map(({child:e,blockSize:t,inlineSize:n})=>({child:e,blockSize:t,inlineSize:n,was:e.style.blockSize,wasInline:e.style.inlineSize,shrink:e.style.flexShrink}));for(let{child:t,blockSize:n,inlineSize:r}of u)t.style.flexShrink=`0`,t.style.blockSize=`${n}px`,e&&(t.style.inlineSize=`${r}px`);let m=d(s,h(t,n),o);c=m;let g=()=>{for(let{child:t,was:n,wasInline:r,shrink:i}of u)t.style.flexShrink=i,t.style.blockSize=n,e&&(t.style.inlineSize=r)};l=g;let _=()=>{c===m&&(c=void 0,l=void 0,g())};m.finished.then(_,_)}},_=new ResizeObserver(([e])=>{let[t]=e.borderBoxSize;s=r?{w:t.inlineSize,h:t.blockSize}:{w:Math.round(t.inlineSize),h:Math.round(t.blockSize)}});_.observe(o,{box:`border-box`});let v=e=>{for(let t=e;t&&t!==o;t=t.parentNode)if(t instanceof HTMLElement&&t.style.position===`absolute`)return!0;return!1},y=e=>e.nodeType===Node.COMMENT_NODE||e.nodeType===Node.TEXT_NODE&&!e.textContent?.trim(),b=e=>!v(e.target)&&(e.type!==`childList`||![...e.addedNodes,...e.removedNodes].every(e=>y(e)||v(e))),x=new MutationObserver(e=>{e.some(b)&&(No.size===0&&queueMicrotask(Po),No.add(g))});return x.observe(o,bo(n)),ko.add(m),()=>{ko.delete(m),g.stop(),No.delete(g),_.disconnect(),x.disconnect()}}}var Io={bottom:[0,-1],top:[0,1],right:[-1,0],left:[1,0]};function Lo(e,{side:t=`bottom`}={}){if(!Ga.current)return{duration:Qa(`--dur-control`),css:e=>`opacity: ${e}`};let n=getComputedStyle(e),r=Number.parseFloat(n.getPropertyValue(`--pop-scale`)),i=Number.parseFloat(n.getPropertyValue(`--pop-rise`)),[a,o]=Io[t];return{duration:Qa(`--dur-exit`),easing:qa,css:e=>`opacity: ${e}; scale: ${r+(1-r)*e}; translate: ${(a*(1-e)*i).toFixed(2)}px ${(o*(1-e)*i).toFixed(2)}px`}}function Ro(e){let t=document.timeline.currentTime;for(let n of e)n.startTime=t;return Promise.all(e.map(e=>e.finished.catch(()=>void 0)))}var zo=`In the message box, ready to edit`,Bo=e=>e.split(` `).slice(0,3).join(` `);function Vo(e,t){e&&(e.value=t,e.dispatchEvent(new Event(`input`,{bubbles:!0})),e.focus({preventScroll:!0}),e.setSelectionRange(t.length,t.length))}var Ho=H(`<div class="composer svelte-r6n72d" data-slot="composer"><label class="line svelte-r6n72d"><span class="sr-only">Message Caw</span> <textarea data-slot="composer-field" placeholder="Message Caw…" rows="1" class="svelte-r6n72d"></textarea> <span class="send svelte-r6n72d" aria-hidden="true"></span></label> <!></div>`);function Uo(e,t){Ue(t,!0);let n=da(t,`value`,15,``),r=da(t,`field`,15),i=da(t,`focused`,3,!1);var a=Ho(),o=I(a),s=L(I(o),2);nt(s),oa(s,e=>r(e),()=>r()),Se(2),j(o),ui(L(o,2),()=>t.children??f),j(a),R(()=>G(a,`data-focused`,i()||void 0)),na(s,n),U(e,a),We()}function Wo(e){let t=()=>{let t=e.scrollHeight-e.clientHeight;e.toggleAttribute(`data-more-start`,t>1&&e.scrollTop>1),e.toggleAttribute(`data-more-end`,t>1&&e.scrollTop<t-1)};t(),e.addEventListener(`scroll`,t,{passive:!0});let n=new ResizeObserver(t);n.observe(e);let r=new MutationObserver(()=>{for(let t of e.children)n.observe(t);t()});r.observe(e,{childList:!0,subtree:!0,attributes:!0});for(let t of e.children)n.observe(t);return()=>{e.removeEventListener(`scroll`,t),n.disconnect(),r.disconnect()}}var Go=H(`<div class="surround svelte-l37f3p" data-slot="surround"><div class="scroll edges svelte-l37f3p" data-slot="scroll"><div class="hero svelte-l37f3p" data-slot="hero"><!> <h2 class="title svelte-l37f3p" data-slot="heading"> </h2></div> <div class="set svelte-l37f3p" data-slot="set"><!></div></div> <div class="foot svelte-l37f3p" data-slot="foot"><!></div></div>`);function Ko(e,t){let n=da(t,`anchor`,3,`start`);var r=Go(),i=I(r),a=I(i),o=I(a);Va(o,{class:`caw`,size:80});var s=dn(L(o,2),!0);j(a);var c=L(a,2);ui(I(c),()=>t.set),j(c),j(i),Si(i,()=>Wo);var l=L(i,2);ui(I(l),()=>t.foot),j(l),j(r),R(()=>{G(r,`data-where`,t.where),qr(s,t.where===`board`?`Nothing on the board yet`:`What’s next for Cawco?`),G(c,`data-anchor`,n())}),U(e,r)}var qo=H(`<span class="ghost svelte-1loi9xe" data-slot="skeleton"></span>`),Jo=H(`<span class="reason svelte-1loi9xe" data-slot="suggestion-reason"> </span>`),Yo=H(`<div class="item svelte-1loi9xe" data-draft=""><button class="draft svelte-1loi9xe" data-slot="suggestion" type="button"><span data-slot="suggestion-text"> </span></button> <!></div>`),Xo=H(`<button class="more svelte-1loi9xe" data-more="" type="button"> </button>`),Zo=H(`<!> <!> <p class="provenance svelte-1loi9xe" data-provenance="" id="drafts-provenance">written from this project · 1h</p>`,1),Qo=H(`<div aria-labelledby="drafts-provenance" class="stack svelte-1loi9xe" role="group"><!></div>`),$o=H(`<div class="drafts svelte-1loi9xe" data-direction="drafts"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function es(e,t){Ue(t,!0);let n=e=>{var n=Vr(),r=un(n),i=e=>{var n=Qo(),r=I(n),i=e=>{var t=Vr();ii(un(t),16,()=>[`var(--drafts-ghost-1)`,`var(--drafts-ghost-2)`,`var(--drafts-ghost-3)`],e=>e,(e,t)=>{var n=qo();let r;R(()=>r=Ni(n,``,r,{"inline-size":t})),U(e,n)}),U(e,t)},a=e=>{var n=Zo(),r=un(n);ii(r,19,()=>V(f),(e,t)=>`${t}:${e.text}`,(e,n,r)=>{var i=Yo(),a=I(i),o=dn(I(a),!0);j(a);var c=L(a,2),l=e=>{var t=Jo(),i=dn(t,!0);R(()=>{G(t,`id`,`draft-reason-${V(r)??``}`),qr(i,V(n).reason)}),U(e,t)};W(c,e=>{V(n).reason&&e(l)}),j(i),R(()=>{G(i,`data-taken`,V(m)&&V(s)===V(r)||void 0),G(a,`aria-describedby`,V(n).reason?`draft-reason-${V(r)}`:void 0),G(a,`data-held`,V(r)===0?t.draws.held:void 0),qr(o,V(n).text)}),Ar(`click`,a,e=>g(V(r),e.currentTarget)),U(e,i)});var i=L(r,2),a=e=>{var t=Xo(),n=dn(t);R(()=>qr(n,`${V(p)??``} more`)),Ar(`click`,t,()=>F(c,!0)),U(e,t)};W(i,e=>{V(p)>0&&e(a)}),Se(2),U(e,n)};W(r,e=>{t.draws.loading?e(i):e(a,-1)}),j(n),oa(n,e=>F(d,e),()=>V(d)),Si(n,Fo),R(()=>G(n,`data-dimmed`,V(m)||void 0)),bi(2,n,()=>Lo),U(e,n)};W(r,e=>{V(h)&&e(i)}),U(e,n)},r=e=>{Uo(e,{get focused(){return V(i)},get field(){return V(u)},set field(e){F(u,e,!0)},get value(){return V(o)},set value(e){F(o,e,!0)}})},i=M(()=>t.where===`keyboard`),a=M(()=>t.draws.items[0]?.text??``),o=P(Qt(t.draws.phase===`filled`?V(a):t.draws.phase===`typing`?Bo(V(a)):``)),s=P(Qt(t.draws.phase===`filled`?0:null)),c=P(Qt(t.draws.expanded)),l=P(``),u=P(void 0),d=P(void 0),f=M(()=>V(c)?t.draws.items:t.draws.items.slice(0,4)),p=M(()=>t.draws.items.length-V(f).length),m=M(()=>V(s)!==null&&V(o)===t.draws.items[V(s)]?.text),h=M(()=>(t.draws.loading||t.draws.items.length>0)&&!V(i)&&(V(o)===``||V(m)));async function g(e,n){let r=t.draws.items[e]?.text??``,i=V(u)?.getBoundingClientRect(),a=n.getBoundingClientRect(),c=i?i.top+i.height/2-(a.top+a.height/2):0,f={duration:Qa(`--dur-morph`),easing:$a(`--ease-out`),fill:`forwards`},p=e=>Number.parseFloat(getComputedStyle(n).getPropertyValue(e)),m=p(`--drafts-press-scale`),h=p(`--drafts-dim`),g=n.closest(`[data-draft]`)??n,_=[g.animate(Ga.current?[{transform:`translateY(0) scale(${m})`,opacity:1},{transform:`translateY(${c}px) scale(${m})`,opacity:0}]:[{opacity:1},{opacity:0}],f),...[...V(d)?.querySelectorAll(`[data-draft], [data-provenance], [data-more]`)??[]].filter(e=>e!==g).map(e=>e.animate([{opacity:1},{opacity:h}],f))];await Ro(_),F(s,e,!0),Vo(V(u),r),F(o,r,!0),F(l,zo,!0);for(let e of _)e.cancel()}var _=$o(),v=I(_);Ko(v,{anchor:`end`,get foot(){return r},get set(){return n},get where(){return t.where}});var y=dn(L(v,2),!0);j(_),R(()=>{G(_,`data-touch`,t.draws.touch||void 0),G(_,`data-where`,t.where),qr(y,V(l))}),U(e,_),We()}jr([`click`]);var ts=(e,t)=>{let n=Array(e.length+t.length);for(let t=0;t<e.length;t++)n[t]=e[t];for(let r=0;r<t.length;r++)n[e.length+r]=t[r];return n},ns=(e,t)=>({classGroupId:e,validator:t}),rs=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),is=`-`,as=[],os=`arbitrary..`,ss=e=>{let t=us(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e.startsWith(`[`)&&e.endsWith(`]`))return ls(e);let n=e.split(is);return cs(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?ts(i,t):t:i||as}return n[e]||as}}},cs=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=cs(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(is):e.slice(t).join(is),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},ls=e=>e.slice(1,-1).indexOf(`:`)===-1?void 0:(()=>{let t=e.slice(1,-1),n=t.indexOf(`:`),r=t.slice(0,n);return r?os+r:void 0})(),us=e=>{let{theme:t,classGroups:n}=e;return ds(n,t)},ds=(e,t)=>{let n=rs();for(let r in e){let i=e[r];fs(i,n,r,t)}return n},fs=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];ps(i,t,n,r)}},ps=(e,t,n,r)=>{if(typeof e==`string`){ms(e,t,n);return}if(typeof e==`function`){hs(e,t,n,r);return}gs(e,t,n,r)},ms=(e,t,n)=>{let r=e===``?t:_s(t,e);r.classGroupId=n},hs=(e,t,n,r)=>{if(vs(e)){fs(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(ns(n,e))},gs=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];fs(o,_s(t,a),n,r)}},_s=(e,t)=>{let n=e,r=t.split(is),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=rs(),n.nextPart.set(t,i)),n=i}return n},vs=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,ys=e=>{if(e<1)return{get:()=>void 0,set:()=>{}};let t=0,n=Object.create(null),r=Object.create(null),i=(i,a)=>{n[i]=a,t++,t>e&&(t=0,r=n,n=Object.create(null))};return{get(e){let t=n[e];if(t!==void 0)return t;if((t=r[e])!==void 0)return i(e,t),t},set(e,t){e in n?n[e]=t:i(e,t)}}},bs=`!`,xs=`:`,Ss=[],Cs=(e,t,n,r,i)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:i}),ws=e=>{let{prefix:t,experimentalParseClassName:n}=e,r=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e[s];if(n===0&&r===0){if(o===xs){t.push(e.slice(i,s)),i=s+1;continue}if(o===`/`){a=s;continue}}o===`[`?n++:o===`]`?n--:o===`(`?r++:o===`)`&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1;s.endsWith(bs)?(c=s.slice(0,-1),l=!0):s.startsWith(bs)&&(c=s.slice(1),l=!0);let u=a&&a>i?a-i:void 0;return Cs(t,l,c,u)};if(t){let e=t+xs,n=r;r=t=>t.startsWith(e)?n(t.slice(e.length)):Cs(Ss,!1,t,void 0,!0)}if(n){let e=r;r=t=>n({className:t,parseClassName:e})}return r},Ts=e=>{let t=new Map;return e.orderSensitiveModifiers.forEach((e,n)=>{t.set(e,1e6+n)}),e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);o||s?(r.length>0&&(r.sort(),n.push(...r),r=[]),n.push(a)):r.push(a)}return r.length>0&&(r.sort(),n.push(...r)),n}},Es=e=>({cache:ys(e.cacheSize),parseClassName:ws(e),sortModifiers:Ts(e),postfixLookupClassGroupIds:Ds(e),...ss(e)}),Ds=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},Os=/\s+/,ks=(e,t)=>{let{parseClassName:n,getClassGroupId:r,getConflictingClassGroupIds:i,sortModifiers:a,postfixLookupClassGroupIds:o}=t,s=[],c=e.trim().split(Os),l=``;for(let e=c.length-1;e>=0;--e){let t=c[e],{isExternal:u,modifiers:d,hasImportantModifier:f,baseClassName:p,maybePostfixModifierPosition:m}=n(t);if(u){l=t+(l.length>0?` `+l:l);continue}let h=!!m,g;if(h){g=r(p.substring(0,m));let e=g&&o[g]?r(p):void 0;e&&e!==g&&(g=e,h=!1)}else g=r(p);if(!g){if(!h){l=t+(l.length>0?` `+l:l);continue}if(g=r(p),!g){l=t+(l.length>0?` `+l:l);continue}h=!1}let _=d.length===0?``:d.length===1?d[0]:a(d).join(`:`),v=f?_+bs:_,y=v+g;if(s.indexOf(y)>-1)continue;s.push(y);let b=i(g,h);for(let e=0;e<b.length;++e){let t=b[e];s.push(v+t)}l=t+(l.length>0?` `+l:l)}return l},As=(...e)=>{let t=0,n,r,i=``;for(;t<e.length;)(n=e[t++])&&(r=js(n))&&(i&&(i+=` `),i+=r);return i},js=e=>{if(typeof e==`string`)return e;let t,n=``;for(let r=0;r<e.length;r++)e[r]&&(t=js(e[r]))&&(n&&(n+=` `),n+=t);return n},Ms=(e,...t)=>{let n,r,i,a,o=o=>(n=Es(t.reduce((e,t)=>t(e),e())),r=n.cache.get,i=n.cache.set,a=s,s(o)),s=e=>{let t=r(e);if(t)return t;let a=ks(e,n);return i(e,a),a};return a=o,(...e)=>a(As(...e))},Ns=[],Ps=e=>{let t=t=>t[e]||Ns;return t.isThemeGetter=!0,t.themeKey=e,t},Fs=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,Is=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Ls=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,Rs=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,zs=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Bs=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/,Vs=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,Hs=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,Us=e=>Ls.test(e),J=e=>!!e&&!Number.isNaN(Number(e)),Ws=e=>!!e&&Number.isInteger(Number(e)),Gs=e=>e.endsWith(`%`)&&J(e.slice(0,-1)),Ks=e=>Rs.test(e),qs=()=>!0,Js=e=>zs.test(e)&&!Bs.test(e),Ys=()=>!1,Xs=e=>Vs.test(e),Zs=e=>Hs.test(e),Qs=e=>!Y(e)&&!X(e),$s=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),ec=e=>hc(e,yc,Ys),Y=e=>Fs.test(e),tc=e=>hc(e,bc,Js),nc=e=>hc(e,xc,J),rc=e=>hc(e,Cc,qs),ic=e=>hc(e,Sc,Ys),ac=e=>hc(e,_c,Ys),oc=e=>hc(e,vc,Zs),sc=e=>hc(e,wc,Xs),X=e=>Is.test(e),cc=e=>gc(e,bc),lc=e=>gc(e,Sc),uc=e=>gc(e,_c),dc=e=>gc(e,yc),fc=e=>gc(e,vc),pc=e=>gc(e,wc,!0),mc=e=>gc(e,Cc,!0),hc=(e,t,n)=>{let r=Fs.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},gc=(e,t,n=!1)=>{let r=Is.exec(e);return r?r[1]?t(r[1]):n:!1},_c=e=>e===`position`||e===`percentage`,vc=e=>e===`image`||e===`url`,yc=e=>e===`length`||e===`size`||e===`bg-size`,bc=e=>e===`length`,xc=e=>e===`number`,Sc=e=>e===`family-name`,Cc=e=>e===`number`||e===`weight`,wc=e=>e===`shadow`,Tc=Object.defineProperty({__proto__:null,isAny:qs,isAnyNonArbitrary:Qs,isArbitraryFamilyName:ic,isArbitraryImage:oc,isArbitraryLength:tc,isArbitraryNumber:nc,isArbitraryPosition:ac,isArbitraryShadow:sc,isArbitrarySize:ec,isArbitraryValue:Y,isArbitraryVariable:X,isArbitraryVariableFamilyName:lc,isArbitraryVariableImage:fc,isArbitraryVariableLength:cc,isArbitraryVariablePosition:uc,isArbitraryVariableShadow:pc,isArbitraryVariableSize:dc,isArbitraryVariableWeight:mc,isArbitraryWeight:rc,isFraction:Us,isInteger:Ws,isNamedContainerQuery:$s,isNumber:J,isPercent:Gs,isTshirtSize:Ks},Symbol.toStringTag,{value:`Module`}),Ec=()=>{let e=Ps(`color`),t=Ps(`font`),n=Ps(`text`),r=Ps(`font-weight`),i=Ps(`tracking`),a=Ps(`leading`),o=Ps(`breakpoint`),s=Ps(`container`),c=Ps(`spacing`),l=Ps(`radius`),u=Ps(`shadow`),d=Ps(`inset-shadow`),f=Ps(`text-shadow`),p=Ps(`drop-shadow`),m=Ps(`blur`),h=Ps(`perspective`),g=Ps(`aspect`),_=Ps(`ease`),v=Ps(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),X,Y],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],ee=()=>[`auto`,`contain`,`none`],C=()=>[X,Y,c],w=()=>[Us,`full`,`auto`,...C()],te=()=>[Ws,`none`,`subgrid`,X,Y],ne=()=>[`auto`,{span:[`full`,Ws,X,Y]},Ws,X,Y],re=()=>[Ws,`auto`,X,Y],ie=()=>[`auto`,`min`,`max`,`fr`,X,Y],ae=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],oe=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],se=()=>[`auto`,...C()],ce=()=>[Us,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...C()],le=()=>[s,Us,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...C()],ue=()=>[Us,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...C()],T=()=>[e,X,Y],de=()=>[...b(),uc,ac,{position:[X,Y]}],fe=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],pe=()=>[`auto`,`cover`,`contain`,dc,ec,{size:[X,Y]}],me=()=>[Gs,cc,tc],E=()=>[``,`none`,`full`,l,X,Y],D=()=>[``,J,cc,tc],he=()=>[`solid`,`dashed`,`dotted`,`double`],ge=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],O=()=>[J,Gs,uc,ac],_e=()=>[``,`none`,m,X,Y],ve=()=>[`none`,J,X,Y],k=()=>[`none`,J,X,Y],ye=()=>[J,X,Y],A=()=>[Us,`full`,...C()];return{cacheSize:500,theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[Ks],breakpoint:[Ks],color:[qs],container:[Ks],"drop-shadow":[Ks],ease:[`in`,`out`,`in-out`],font:[Qs],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[Ks],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[Ks],shadow:[Ks],spacing:[`px`,J],text:[Ks],"text-shadow":[Ks],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,Us,Y,X,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,X,Y]}],"container-named":[$s],columns:[{columns:[J,`auto`,Y,X,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:ee()}],"overscroll-x":[{"overscroll-x":ee()}],"overscroll-y":[{"overscroll-y":ee()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:w()}],"inset-x":[{"inset-x":w()}],"inset-y":[{"inset-y":w()}],start:[{"inset-s":w(),start:w()}],end:[{"inset-e":w(),end:w()}],"inset-bs":[{"inset-bs":w()}],"inset-be":[{"inset-be":w()}],top:[{top:w()}],right:[{right:w()}],bottom:[{bottom:w()}],left:[{left:w()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Ws,`auto`,X,Y]}],basis:[{basis:[Us,`full`,`auto`,s,...C()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[J,Us,`auto`,`initial`,`none`,Y]}],grow:[{grow:[``,J,X,Y]}],shrink:[{shrink:[``,J,X,Y]}],order:[{order:[Ws,`first`,`last`,`none`,X,Y]}],"grid-cols":[{"grid-cols":te()}],"col-start-end":[{col:ne()}],"col-start":[{"col-start":re()}],"col-end":[{"col-end":re()}],"grid-rows":[{"grid-rows":te()}],"row-start-end":[{row:ne()}],"row-start":[{"row-start":re()}],"row-end":[{"row-end":re()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":ie()}],"auto-rows":[{"auto-rows":ie()}],gap:[{gap:C()}],"gap-x":[{"gap-x":C()}],"gap-y":[{"gap-y":C()}],"justify-content":[{justify:[...ae(),`normal`]}],"justify-items":[{"justify-items":[...oe(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...oe()]}],"align-content":[{content:[`normal`,...ae()]}],"align-items":[{items:[...oe(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...oe(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ae()}],"place-items":[{"place-items":[...oe(),`baseline`]}],"place-self":[{"place-self":[`auto`,...oe()]}],p:[{p:C()}],px:[{px:C()}],py:[{py:C()}],ps:[{ps:C()}],pe:[{pe:C()}],pbs:[{pbs:C()}],pbe:[{pbe:C()}],pt:[{pt:C()}],pr:[{pr:C()}],pb:[{pb:C()}],pl:[{pl:C()}],m:[{m:se()}],mx:[{mx:se()}],my:[{my:se()}],ms:[{ms:se()}],me:[{me:se()}],mbs:[{mbs:se()}],mbe:[{mbe:se()}],mt:[{mt:se()}],mr:[{mr:se()}],mb:[{mb:se()}],ml:[{ml:se()}],"space-x":[{"space-x":C()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":C()}],"space-y-reverse":[`space-y-reverse`],size:[{size:ce()}],"inline-size":[{inline:[`auto`,...le()]}],"min-inline-size":[{"min-inline":[`auto`,...le()]}],"max-inline-size":[{"max-inline":[`none`,...le()]}],"block-size":[{block:[`auto`,...ue()]}],"min-block-size":[{"min-block":[`auto`,...ue()]}],"max-block-size":[{"max-block":[`none`,...ue()]}],w:[{w:[s,`screen`,...ce()]}],"min-w":[{"min-w":[s,`screen`,`none`,...ce()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...ce()]}],h:[{h:[`screen`,`lh`,...ce()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...ce()]}],"max-h":[{"max-h":[`screen`,`lh`,`none`,...ce()]}],"font-size":[{text:[`base`,n,cc,tc]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,mc,rc]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Gs,Y]}],"font-family":[{font:[lc,ic,t]}],"font-features":[{"font-features":[Y]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,X,Y]}],"line-clamp":[{"line-clamp":[J,`none`,X,nc]}],leading:[{leading:[`none`,a,...C()]}],"list-image":[{"list-image":[`none`,X,Y]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,X,Y]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:T()}],"text-color":[{text:T()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...he(),`wavy`]}],"text-decoration-thickness":[{decoration:[J,`from-font`,`auto`,X,tc]}],"text-decoration-color":[{decoration:T()}],"underline-offset":[{"underline-offset":[J,`auto`,X,Y]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:C()}],"tab-size":[{tab:[Ws,X,Y]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,X,Y]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,X,Y]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:de()}],"bg-repeat":[{bg:fe()}],"bg-size":[{bg:pe()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Ws,X,Y],radial:[``,X,Y],conic:[``,Ws,X,Y]},fc,oc]}],"bg-color":[{bg:T()}],"gradient-from-pos":[{from:me()}],"gradient-via-pos":[{via:me()}],"gradient-to-pos":[{to:me()}],"gradient-from":[{from:T()}],"gradient-via":[{via:T()}],"gradient-to":[{to:T()}],rounded:[{rounded:E()}],"rounded-s":[{"rounded-s":E()}],"rounded-e":[{"rounded-e":E()}],"rounded-t":[{"rounded-t":E()}],"rounded-r":[{"rounded-r":E()}],"rounded-b":[{"rounded-b":E()}],"rounded-l":[{"rounded-l":E()}],"rounded-ss":[{"rounded-ss":E()}],"rounded-se":[{"rounded-se":E()}],"rounded-ee":[{"rounded-ee":E()}],"rounded-es":[{"rounded-es":E()}],"rounded-tl":[{"rounded-tl":E()}],"rounded-tr":[{"rounded-tr":E()}],"rounded-br":[{"rounded-br":E()}],"rounded-bl":[{"rounded-bl":E()}],"border-w":[{border:D()}],"border-w-x":[{"border-x":D()}],"border-w-y":[{"border-y":D()}],"border-w-s":[{"border-s":D()}],"border-w-e":[{"border-e":D()}],"border-w-bs":[{"border-bs":D()}],"border-w-be":[{"border-be":D()}],"border-w-t":[{"border-t":D()}],"border-w-r":[{"border-r":D()}],"border-w-b":[{"border-b":D()}],"border-w-l":[{"border-l":D()}],"divide-x":[{"divide-x":D()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":D()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...he(),`hidden`,`none`]}],"divide-style":[{divide:[...he(),`hidden`,`none`]}],"border-color":[{border:T()}],"border-color-x":[{"border-x":T()}],"border-color-y":[{"border-y":T()}],"border-color-s":[{"border-s":T()}],"border-color-e":[{"border-e":T()}],"border-color-bs":[{"border-bs":T()}],"border-color-be":[{"border-be":T()}],"border-color-t":[{"border-t":T()}],"border-color-r":[{"border-r":T()}],"border-color-b":[{"border-b":T()}],"border-color-l":[{"border-l":T()}],"divide-color":[{divide:T()}],"outline-style":[{outline:[...he(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[J,X,Y]}],"outline-w":[{outline:[``,J,cc,tc]}],"outline-color":[{outline:T()}],shadow:[{shadow:[``,`inner`,`none`,u,pc,sc]}],"shadow-color":[{shadow:T()}],"inset-shadow":[{"inset-shadow":[`none`,d,pc,sc]}],"inset-shadow-color":[{"inset-shadow":T()}],"ring-w":[{ring:D()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:T()}],"ring-offset-w":[{"ring-offset":[J,tc]}],"ring-offset-color":[{"ring-offset":T()}],"inset-ring-w":[{"inset-ring":D()}],"inset-ring-color":[{"inset-ring":T()}],"text-shadow":[{"text-shadow":[`none`,f,pc,sc]}],"text-shadow-color":[{"text-shadow":T()}],opacity:[{opacity:[J,X,Y]}],"mix-blend":[{"mix-blend":[...ge(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":ge()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[J]}],"mask-image-linear-from-pos":[{"mask-linear-from":O()}],"mask-image-linear-to-pos":[{"mask-linear-to":O()}],"mask-image-linear-from-color":[{"mask-linear-from":T()}],"mask-image-linear-to-color":[{"mask-linear-to":T()}],"mask-image-t-from-pos":[{"mask-t-from":O()}],"mask-image-t-to-pos":[{"mask-t-to":O()}],"mask-image-t-from-color":[{"mask-t-from":T()}],"mask-image-t-to-color":[{"mask-t-to":T()}],"mask-image-r-from-pos":[{"mask-r-from":O()}],"mask-image-r-to-pos":[{"mask-r-to":O()}],"mask-image-r-from-color":[{"mask-r-from":T()}],"mask-image-r-to-color":[{"mask-r-to":T()}],"mask-image-b-from-pos":[{"mask-b-from":O()}],"mask-image-b-to-pos":[{"mask-b-to":O()}],"mask-image-b-from-color":[{"mask-b-from":T()}],"mask-image-b-to-color":[{"mask-b-to":T()}],"mask-image-l-from-pos":[{"mask-l-from":O()}],"mask-image-l-to-pos":[{"mask-l-to":O()}],"mask-image-l-from-color":[{"mask-l-from":T()}],"mask-image-l-to-color":[{"mask-l-to":T()}],"mask-image-x-from-pos":[{"mask-x-from":O()}],"mask-image-x-to-pos":[{"mask-x-to":O()}],"mask-image-x-from-color":[{"mask-x-from":T()}],"mask-image-x-to-color":[{"mask-x-to":T()}],"mask-image-y-from-pos":[{"mask-y-from":O()}],"mask-image-y-to-pos":[{"mask-y-to":O()}],"mask-image-y-from-color":[{"mask-y-from":T()}],"mask-image-y-to-color":[{"mask-y-to":T()}],"mask-image-radial":[{"mask-radial":[X,Y]}],"mask-image-radial-from-pos":[{"mask-radial-from":O()}],"mask-image-radial-to-pos":[{"mask-radial-to":O()}],"mask-image-radial-from-color":[{"mask-radial-from":T()}],"mask-image-radial-to-color":[{"mask-radial-to":T()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[J]}],"mask-image-conic-from-pos":[{"mask-conic-from":O()}],"mask-image-conic-to-pos":[{"mask-conic-to":O()}],"mask-image-conic-from-color":[{"mask-conic-from":T()}],"mask-image-conic-to-color":[{"mask-conic-to":T()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:de()}],"mask-repeat":[{mask:fe()}],"mask-size":[{mask:pe()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,X,Y]}],filter:[{filter:[``,`none`,X,Y]}],blur:[{blur:_e()}],brightness:[{brightness:[J,X,Y]}],contrast:[{contrast:[J,X,Y]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,pc,sc]}],"drop-shadow-color":[{"drop-shadow":T()}],grayscale:[{grayscale:[``,J,X,Y]}],"hue-rotate":[{"hue-rotate":[J,X,Y]}],invert:[{invert:[``,J,X,Y]}],saturate:[{saturate:[J,X,Y]}],sepia:[{sepia:[``,J,X,Y]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,X,Y]}],"backdrop-blur":[{"backdrop-blur":_e()}],"backdrop-brightness":[{"backdrop-brightness":[J,X,Y]}],"backdrop-contrast":[{"backdrop-contrast":[J,X,Y]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,J,X,Y]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[J,X,Y]}],"backdrop-invert":[{"backdrop-invert":[``,J,X,Y]}],"backdrop-opacity":[{"backdrop-opacity":[J,X,Y]}],"backdrop-saturate":[{"backdrop-saturate":[J,X,Y]}],"backdrop-sepia":[{"backdrop-sepia":[``,J,X,Y]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":C()}],"border-spacing-x":[{"border-spacing-x":C()}],"border-spacing-y":[{"border-spacing-y":C()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,X,Y]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[J,`initial`,X,Y]}],ease:[{ease:[`linear`,`initial`,_,X,Y]}],delay:[{delay:[J,X,Y]}],animate:[{animate:[`none`,v,X,Y]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,X,Y]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:ve()}],"rotate-x":[{"rotate-x":ve()}],"rotate-y":[{"rotate-y":ve()}],"rotate-z":[{"rotate-z":ve()}],scale:[{scale:k()}],"scale-x":[{"scale-x":k()}],"scale-y":[{"scale-y":k()}],"scale-z":[{"scale-z":k()}],"scale-3d":[`scale-3d`],skew:[{skew:ye()}],"skew-x":[{"skew-x":ye()}],"skew-y":[{"skew-y":ye()}],transform:[{transform:[X,Y,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:A()}],"translate-x":[{"translate-x":A()}],"translate-y":[{"translate-y":A()}],"translate-z":[{"translate-z":A()}],"translate-none":[`translate-none`],zoom:[{zoom:[Ws,X,Y]}],accent:[{accent:T()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:T()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,X,Y]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":T()}],"scrollbar-track-color":[{"scrollbar-track":T()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":C()}],"scroll-mx":[{"scroll-mx":C()}],"scroll-my":[{"scroll-my":C()}],"scroll-ms":[{"scroll-ms":C()}],"scroll-me":[{"scroll-me":C()}],"scroll-mbs":[{"scroll-mbs":C()}],"scroll-mbe":[{"scroll-mbe":C()}],"scroll-mt":[{"scroll-mt":C()}],"scroll-mr":[{"scroll-mr":C()}],"scroll-mb":[{"scroll-mb":C()}],"scroll-ml":[{"scroll-ml":C()}],"scroll-p":[{"scroll-p":C()}],"scroll-px":[{"scroll-px":C()}],"scroll-py":[{"scroll-py":C()}],"scroll-ps":[{"scroll-ps":C()}],"scroll-pe":[{"scroll-pe":C()}],"scroll-pbs":[{"scroll-pbs":C()}],"scroll-pbe":[{"scroll-pbe":C()}],"scroll-pt":[{"scroll-pt":C()}],"scroll-pr":[{"scroll-pr":C()}],"scroll-pb":[{"scroll-pb":C()}],"scroll-pl":[{"scroll-pl":C()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,X,Y]}],fill:[{fill:[`none`,...T()]}],"stroke-w":[{stroke:[J,cc,tc,nc]}],stroke:[{stroke:[`none`,...T()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`start`,`end`,`right`,`left`],"inset-y":[`inset-bs`,`inset-be`,`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`ps`,`pe`,`pr`,`pl`],py:[`pbs`,`pbe`,`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`ms`,`me`,`mr`,`ml`],my:[`mbs`,`mbe`,`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-s`,`border-w-e`,`border-w-r`,`border-w-l`],"border-w-y":[`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-s`,`border-color-e`,`border-color-r`,`border-color-l`],"border-color-y":[`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-ms`,`scroll-me`,`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-ps`,`scroll-pe`,`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},Dc=(e,{cacheSize:t,prefix:n,experimentalParseClassName:r,extend:i={},override:a={}})=>(Oc(e,`cacheSize`,t),Oc(e,`prefix`,n),Oc(e,`experimentalParseClassName`,r),kc(e.theme,a.theme),kc(e.classGroups,a.classGroups),kc(e.conflictingClassGroups,a.conflictingClassGroups),kc(e.conflictingClassGroupModifiers,a.conflictingClassGroupModifiers),Oc(e,`postfixLookupClassGroups`,a.postfixLookupClassGroups),Oc(e,`orderSensitiveModifiers`,a.orderSensitiveModifiers),Ac(e.theme,i.theme),Ac(e.classGroups,i.classGroups),Ac(e.conflictingClassGroups,i.conflictingClassGroups),Ac(e.conflictingClassGroupModifiers,i.conflictingClassGroupModifiers),jc(e,i,`postfixLookupClassGroups`),jc(e,i,`orderSensitiveModifiers`),e),Oc=(e,t,n)=>{n!==void 0&&(e[t]=n)},kc=(e,t)=>{if(t)for(let n in t)Oc(e,n,t[n])},Ac=(e,t)=>{if(t)for(let n in t)jc(e,t,n)},jc=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},Mc=(e,...t)=>typeof e==`function`?Ms(Ec,e,...t):Ms(()=>Dc(Ec(),e),...t),Nc=Array.isArray,Pc=e=>{if(!e&&e!==0&&e!==0n)return``;if(typeof e==`string`)return e;if(typeof e==`number`)return e===e?``+e:``;if(typeof e==`bigint`)return``+e;let t=``;if(Nc(e)){let n=e.length;for(let r=0;r<n;r++){let n=e[r];if(!n&&n!==0&&n!==0n)continue;let i=typeof n==`string`?n:Pc(n);i&&(t&&(t+=` `),t+=i)}return t}if(typeof e==`object`)for(let n in e)e[n]&&(t&&(t+=` `),t+=n);return t},Fc=/\s+/g,Ic=Array.isArray,Lc=e=>typeof e!=`string`||!e?e:e.replace(Fc,` `).trim(),Rc=e=>{let t=e.length;if(t===0)return!1;let n=e.charCodeAt(0),r=e.charCodeAt(t-1);if(n===32||r===32||n>=9&&n<=13||n===160||r>=9&&r<=13||r===160)return!0;for(let n=0;n<t;n++){let r=e.charCodeAt(n);if(r>=9&&r<=13||r===160||r===32&&n+1<t&&e.charCodeAt(n+1)===32)return!0}return!1},zc=(...e)=>{let t=Pc(e);if(t)return Rc(t)?Lc(t):t},Bc=e=>e===!1?`false`:e===!0?`true`:e===0?`0`:e,Vc=e=>{if(!e||typeof e!=`object`)return!0;for(let t in e)return!1;return!0},Hc=(e,t)=>{if(e===t)return!0;if(!e||!t)return!1;let n=e,r=t,i=Object.keys(n),a=Object.keys(r);if(i.length!==a.length)return!1;for(let e=0;e<i.length;e++){let t=i[e];if(!a.includes(t)||n[t]!==r[t])return!1}return!0},Uc=(e,t)=>{let n=e;for(let e in t)if(Object.hasOwn(t,e)){let r=t[e];n[e]=e in n?zc(n[e],r):r}return e},Wc=(e,t)=>{for(let n=0;n<e.length;n++){let r=e[n];Ic(r)?Wc(r,t):r&&t.push(r)}},Gc=(...e)=>{let t=[];Wc(e,t);let n=[];for(let e=0;e<t.length;e++)t[e]&&n.push(t[e]);return n},Kc=(e,t)=>{let n=e,r=t,i={};for(let e in n){let t=n[e];if(e in r){let n=r[e];i[e]=Ic(t)||Ic(n)?Gc(n,t):typeof t==`object`&&typeof n==`object`&&t&&n?Kc(t,n):n+` `+t}else i[e]=t}for(let e in r)e in n||(i[e]=r[e]);return i},qc={twMerge:!0,twMergeConfig:{}},Jc=256,Yc=128,Xc=Symbol(`tv-cache-miss`),Zc=e=>e?.class!=null&&e.class!==``||e?.className!=null&&e.className!==``,Qc=e=>{if(e===void 0)return``;if(e===null)return`null`;if(typeof e==`string`)return e;if(typeof e==`boolean`)return e?`true`:`false`;if(typeof e==`number`)return e===0?`0`:String(e);if(typeof e==`bigint`)return String(e);let t=Bc(e),n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return String(t);if(n===`object`)try{return JSON.stringify(t)}catch{return null}return null},$c=(e,t)=>{if(t===void 0)return e;if(t===null)return e+`null`;let n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return e+String(t);if(Array.isArray(t))return e+t.join(`\0`);try{return e+JSON.stringify(t)}catch{return e+`?`}},el=(e,t,n,r)=>{let i=``,a=Object.create(null);for(let r=0;r<e.length;r++){let o=e[r];a[o]=1;let s=t[o];n&&n[o]!==void 0&&(s=n[o]);let c=Qc(s);if(c===null)return null;i+=o+`:`+c+`;`}let o=[];for(let e in t)e===`class`||e===`className`||a[e]||(a[e]=1,o.push(e));if(n)for(let e in n)e===`class`||e===`className`||a[e]||n[e]===void 0||(a[e]=1,o.push(e));o.length>1&&o.sort();for(let e=0;e<o.length;e++){let r=o[e],a=t[r];n&&n[r]!==void 0&&(a=n[r]);let s=Qc(a);if(s===null)return null;i+=r+`:`+s+`;`}return i},tl=(e,t)=>{let n=``;for(let t=0;t<e.length;t++){let{conditionKeys:r,source:i}=e[t];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=$c(n,i[t]),n+=`,`}n+=`c=`,n=$c(n,i.class),n+=`|cn=`,n=$c(n,i.className),n+=`;`}for(let e=0;e<t.length;e++){let{conditionKeys:r,source:i}=t[e];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=$c(n,i[t]),n+=`,`}Array.isArray(i.slots)&&(n+=`slots=`+i.slots.join(`,`)+`,`),n+=`c=`,n=$c(n,i.class),n+=`|cn=`,n=$c(n,i.className),n+=`;`}return n},nl=(e=Jc)=>{let t=new Map,n=null;return{get(e){if(t.has(e))return t.get(e);if(n?.has(e)){let r=n.get(e);return t.set(e,r),r}return Xc},set(r,i){t.size>=e&&(n=t,t=new Map),t.set(r,i)}}},rl=(e=Jc)=>{let t=nl(e);return{get(e){return t.get(e)},set(e,n){t.set(e,n)}}},il=(e=Yc)=>{let t=new Map,n=null,r=0;return{get(e,i){let a=t.get(e);if(a){let e=a.get(i);if(e!==void 0||a.has(i))return e}if(n){let a=n.get(e);if(a){let n=a.get(i);if(n!==void 0||a.has(i)){let a=t.get(e);return a||(a=new Map,t.set(e,a)),a.has(i)||r++,a.set(i,n),n}}}return Xc},set(i,a,o){r>=e&&(n=t,t=new Map,r=0);let s=t.get(i);s||(s=new Map,t.set(i,s)),s.has(a)||r++,s.set(a,o)}}},al=(e,t)=>{let n=null;return(r,i)=>{if(!Zc(i))return r;let a=i.class,o=i.className;if(a!=null&&a!==``&&typeof a!=`string`||o!=null&&o!==``&&typeof o!=`string`)return e(t,r,a,o);n??=il();let s=r??``,c=(typeof a==`string`?a:``)+`\0`+(typeof o==`string`?o:``),l=n.get(s,c);if(l!==Xc)return l;let u=e(t,r,a,o);return n.set(s,c,u),u}};function ol(){let e=null,t={},n=!1;return{get cachedTwMerge(){return e},set cachedTwMerge(t){e=t},get cachedTwMergeConfig(){return t},set cachedTwMergeConfig(e){t=e},get didTwMergeConfigChange(){return n},set didTwMergeConfigChange(e){n=e},reset(){e=null,t={},n=!1}}}var sl=ol(),cl=e=>{!Vc(e.twMergeConfig)&&!Hc(e.twMergeConfig,sl.cachedTwMergeConfig)&&(sl.didTwMergeConfigChange=!0,sl.cachedTwMergeConfig=e.twMergeConfig)},ll=(e,t)=>{let n=[];for(let r=0;r<t.length;r++){let i=t[r],a=e[i];n.push({key:i,values:a,isEmpty:Vc(a)})}return n},ul=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},dl=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`slots`&&e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},fl=e=>{let t={};for(let n=0;n<e.length;n++){let r=e[n],i=r.source.slots;if(Array.isArray(i))for(let e=0;e<i.length;e++){let n=i[e];t[n]||(t[n]=[]),t[n].push(r)}}return t},pl=(e,t)=>{let{extend:n=null,slots:r={},variants:i={},compoundVariants:a=[],compoundSlots:o=[],defaultVariants:s={}}=e,c={...qc,...t},l=e.slots!==void 0,u=n?.base?zc(n.base,e?.base):e?.base,d=n?.variants&&!Vc(n.variants)?Kc(i,n.variants):i,f=n?.defaultVariants&&!Vc(n.defaultVariants)?{...n.defaultVariants,...s}:s;cl(c);let p=!n?.slots||Vc(n.slots),m=l?p&&n?.base?zc(e?.base,n.base):typeof e?.base==`string`||e?.base==null?e.base:zc(e.base):void 0,h=l?{base:m,...r}:{},g=p?h:Uc({...n?.slots},Vc(h)?{base:e?.base}:h),_=!n?.compoundVariants||Vc(n.compoundVariants)?a:Gc(n?.compoundVariants,a),v=!n?.compoundSlots||Vc(n.compoundSlots)?o:Gc(n?.compoundSlots,o),y=Object.keys(d);return{config:c,extend:n,base:u,variants:d,defaultVariants:f,slots:g,compoundVariants:_,compoundSlots:v,compiledVariants:null,compiledCompoundVariants:null,compiledCompoundSlots:null,compiledCompoundSlotsBySlot:null,deferredError:_&&!Array.isArray(_)?TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof _}`):v&&!Array.isArray(v)?TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof v}`):null,mode:l||!p?`slots`:y.length===0?`plain`:`variants`,slotKeys:null,variantKeys:y}},ml=e=>e.compiledVariants===null?(e.compiledVariants=ll(e.variants,e.variantKeys),e.compiledCompoundVariants=ul(e.compoundVariants),e.compiledCompoundSlots=dl(e.compoundSlots),e.compiledCompoundSlotsBySlot=fl(e.compiledCompoundSlots),e.slotKeys=e.slots&&typeof e.slots==`object`?Object.keys(e.slots):[],e):e,hl=[],gl=[],_l=[],vl=[],yl=[],bl=(e,t,n)=>{let r={};for(let t in e)r[t]=e[t];if(t)for(let e in t)t[e]!==void 0&&(r[e]=t[e]);if(n)for(let e in n)n[e]!==void 0&&(r[e]=n[e]);return r},xl=e=>e==null||e===!1,Sl=(e,t)=>{if(!Array.isArray(e))return e===t||xl(e)&&xl(t);for(let n=0;n<e.length;n++){let r=e[n];if(r===t||xl(r)&&xl(t))return!0}return!1},Cl=(e,t,n,r)=>{if(e.isEmpty)return null;let i=r?.[e.key]??n?.[e.key];if(i===null)return null;let a=Bc(i);if(typeof a==`object`)return null;let o=t?.[e.key],s=a??Bc(o);return e.values[s||`false`]},wl=(e,t)=>{let{conditionKeys:n,source:r}=e;for(let e=0;e<n.length;e++){let i=n[e];if(!Sl(r[i],t[i]))return!1}return!0},Tl=(e,t,n)=>{typeof n==`string`?t===`base`&&e.push(n):n&&typeof n==`object`&&n[t]&&e.push(n[t])},El=(e,t,n)=>{let r=gl;r.length=0;for(let i=0;i<e.length;i++){let a=Cl(e[i],t,n);a&&r.push(a)}return r},Dl=(e,t,n,r,i)=>{let a=gl;a.length=0;for(let o=0;o<t.length;o++){let s=Cl(t[o],n,r,i),c=e===`base`&&typeof s==`string`?s:s&&s[e];c&&a.push(c)}return a},Ol=(e,t)=>{let n=_l;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];wl(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},kl=(e,t,n)=>{let r=vl;r.length=0;for(let i=0;i<t.length;i++){let a=t[i];wl(a,n)&&(Tl(r,e,a.source.class),Tl(r,e,a.source.className))}return r},Al=(e,t)=>{let n=yl;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];wl(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},jl=(e,t)=>{let{base:n,config:r}=e,i=Xc,a=al(t,r);return(e=>(i===Xc&&(i=t(r,n)),a(i,e)))},Ml=(e,t)=>{let{base:n,config:r,defaultVariants:i,deferredError:a,variantKeys:o}=e,s=e.compiledCompoundVariants,c=e.compiledVariants,l=hl,u=null,d=al(t,r),f=1,p=e=>{let a=s.length>0?Ol(s,bl(i,e)):void 0;return t(r,n,El(c,i,e),a)};return(t=>{if(a)throw a;(c===null||s===null)&&(ml(e),c=e.compiledVariants,s=e.compiledCompoundVariants,l=e.compiledCompoundSlots??hl);let n;if(f>0)f--,n=p(t);else{u??=rl();let e=el(o,i,t);if(e!==null){let r=s.length>0||l.length>0?tl(s,l):``,i=e+`#`+r,a=u.get(i);a===Xc?(n=p(t),u.set(i,n)):n=a}else n=p(t)}return d(n,t)})},Nl=(e,t)=>{let{config:n,defaultVariants:r,deferredError:i,slots:a,variantKeys:o}=e,s=null,c=null,l=null,u=null,d=!1,f=null,p=null,m=1,h=()=>{if(l!==null)return;(e.compiledVariants===null||e.compiledCompoundVariants===null||e.compiledCompoundSlots===null||e.compiledCompoundSlotsBySlot===null||e.slotKeys===null)&&ml(e);let i=e.compiledVariants;s=e.compiledCompoundVariants,c=e.compiledCompoundSlots;let o=e.compiledCompoundSlotsBySlot;l=e.slotKeys,d=s.length>0||c.length>0,f=al(t,n);let p=Array(l.length);for(let e=0;e<l.length;e++){let c=l[e],u=o[c]??hl;p[e]=(e,o)=>{let l=d?bl(r,e,o):void 0,f=l?kl(c,s,l):void 0,p=l?Al(u,l):void 0;return t(n,a[c],Dl(c,i,r,e,o),f,p)}}u=p},g=e=>{let t=l,n=u,r=f,i={};for(let a=0;a<t.length;a++){let o=n[a],s=o(e);i[t[a]]=t=>{if(t==null)return s;let n=!1;for(let e in t)if(e!==`class`&&e!==`className`&&t[e]!==void 0){n=!0;break}return r(n?o(e,t):s,t)}}return i};return(e=>{if(i)throw i;if(h(),m>0)return m--,g(e);let t=el(o,r,e);if(t===null)return g(e);let n=d?tl(s,c):``,a=t+`#`+n;p??=nl();let l=p.get(a);if(l!==Xc)return l;let u=g(e);return p.set(a,u),u})},Pl=(e,t)=>{if(e.mode===`plain`)return jl(e,t);let n;return(r=>(n??=e.mode===`slots`?Nl(e,t):Ml(e,t),n(r)))},Fl=(e,t)=>{e.variantKeys=t.variantKeys,e.extend=t.extend,e.base=t.base,e.slots=t.slots,e.variants=t.variants,e.defaultVariants=t.defaultVariants,e.compoundSlots=t.compoundSlots,e.compoundVariants=t.compoundVariants},Il=e=>{let t=(t,n)=>{let r=pl(t,n),i=Pl(r,e);return Fl(i,r),i};return{tv:t,createTV:e=>(n,r)=>t(n,r?Kc(e,r):e)}},Ll=(e,t)=>{let n=e.length,r=t.length,i=Array(n+r);for(let t=0;t<n;t++)i[t]=e[t];for(let e=0;e<r;e++)i[n+e]=t[e];return i},Rl=(e,t)=>({classGroupId:e,validator:t}),zl=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),Bl=`-`,Vl=[],Hl=`arbitrary..`,Ul=e=>{let t=Kl(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e[0]===`[`&&e[e.length-1]===`]`)return Gl(e);let n=e.split(Bl);return Wl(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?Ll(i,t):t:i||Vl}return n[e]||Vl}}},Wl=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=Wl(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(Bl):e.slice(t).join(Bl),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},Gl=e=>{let t=e.slice(1,-1),n=t.indexOf(`:`);if(n===-1)return;let r=t.slice(0,n);return r?Hl+r:void 0},Kl=e=>{let{theme:t,classGroups:n}=e;return ql(n,t)},ql=(e,t)=>{let n=zl();for(let r in e){let i=e[r];Jl(i,n,r,t)}return n},Jl=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];Yl(i,t,n,r)}},Yl=(e,t,n,r)=>{if(typeof e==`string`){Xl(e,t,n);return}if(typeof e==`function`){Zl(e,t,n,r);return}Ql(e,t,n,r)},Xl=(e,t,n)=>{let r=e===``?t:$l(t,e);r.classGroupId=n},Zl=(e,t,n,r)=>{if(eu(e)){Jl(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Rl(n,e))},Ql=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];Jl(o,$l(t,a),n,r)}},$l=(e,t)=>{let n=e,r=t.split(Bl),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=zl(),n.nextPart.set(t,i)),n=i}return n},eu=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,tu=`!`,nu=58,ru=47,iu=91,au=93,ou=40,su=41,cu=33,lu=(e,t,n,r)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:void 0}),uu=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e.charCodeAt(s);if(n===0&&r===0){if(o===nu){t.push(e.slice(i,s)),i=s+1;continue}if(o===ru){a=s;continue}}o===iu?n++:o===au?n--:o===ou?r++:o===su&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1,u=s.length-1;s.charCodeAt(u)===cu?(c=s.slice(0,-1),l=!0):s.charCodeAt(0)===cu&&(c=s.slice(1),l=!0);let d=a&&a>i?a-i:void 0;return lu(t,l,c,d)},du=e=>{let t=new Set(e.orderSensitiveModifiers);return e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);if(o||s){if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e]);r=[]}n.push(a)}else r.push(a)}if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e])}return n}},fu={isExternal:!0,classId:-1,conflictIds:[]},pu=4096,mu=16384,hu=e=>{let t=du(e),n=gu(e),{getClassGroupId:r,getConflictingClassGroupIds:i}=Ul(e),a=Object.create(null),o=Object.create(null),s=0,c=new Int32Array(256),l=0,u=new Uint8Array(64),d=!1,f=e=>{let t=[],n=e.length,r=-1;d=!1;for(let i=0;i<n;i++){let n=e.charCodeAt(i);n===32?r!==-1&&(t.push(e.slice(r,i)),r=-1):n>=9&&n<=13?(d=!0,r!==-1&&(t.push(e.slice(r,i)),r=-1)):r===-1&&(r=i)}return r!==-1&&t.push(e.slice(r)),t},p=new Map,m=0,h=e=>{let t=p.get(e);if(t===void 0&&(t=m++,p.set(e,t),t>=c.length)){let e=new Int32Array(c.length*2);e.set(c),c=e}return t},g=e=>{let{isExternal:a,modifiers:o,hasImportantModifier:s,baseClassName:c,maybePostfixModifierPosition:l}=uu(e);if(a)return fu;let u=!!l,d;if(u){let e=c.substring(0,l);d=r(e);let t=d&&n[d]?r(c):void 0;t&&t!==d&&(d=t,u=!1)}else d=r(c);if(!d){if(!u||(d=r(c),!d))return fu;u=!1}let f=o.length===0?``:o.length===1?o[0]:t(o).join(`:`),p=s?f+tu:f,m=i(d,u),g=[];for(let e=0;e<m.length;e++)g.push(h(p+m[e]));return{isExternal:!1,classId:h(p+d),conflictIds:g}},_=e=>{let t=a[e];return t===void 0?(t=o[e],t===void 0&&(t=g(e)),a[e]=t,++s>pu&&(s=0,o=a,a=Object.create(null)),t):t};return{parseClassName:uu,sortModifiers:t,postfixLookupClassGroupIds:n,getClassGroupId:r,getConflictingClassGroupIds:i,getClassDescriptor:_,mergeClassList:e=>{let t=f(e),n=t.length;if(n===1)return t[0];m>mu&&(p.clear(),m=0,a=Object.create(null),o=Object.create(null),s=0),l=l+1|0,l===0&&(l=1);let r=l;if(n>u.length){let e=u.length;for(;e<n;)e*=2;u=new Uint8Array(e)}let i=!1,h=0;for(let e=n-1;e>=0;--e){let n=t[e];h+=n.length;let a=_(n);if(a.isExternal){u[e]=1;continue}let o=a.classId;if(c[o]===r){u[e]=0,i=!0;continue}c[o]=r;let s=a.conflictIds;for(let e=0;e<s.length;e++)c[s[e]]=r;u[e]=1}if(!i&&!d&&e.length===h+n-1)return e;let g=``;for(let e=0;e<n;e++)u[e]===1&&(g&&(g+=` `),g+=t[e]);return g}}},gu=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},_u=500,vu=e=>{let t,n,r=Object.create(null),i=Object.create(null),a=0,o=r=>(t=hu(e()),n=t.mergeClassList,c.mergeString=s,s(r)),s=e=>{let t=r[e];return t===void 0?(t=i[e],t===void 0&&(t=n(e)),r[e]=t,++a>_u&&(a=0,i=r,r=Object.create(null)),t):t},c=(...e)=>c.mergeString(Pc(e));return c.mergeString=o,c},yu=[],bu=e=>{let t=t=>t[e]||yu;return t.isThemeGetter=!0,t},xu=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,Su=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Cu=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,wu=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Tu=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Eu=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,Du=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,Ou=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,ku=Number,Au=Number.isNaN,ju=Number.isInteger,Mu=e=>Cu.test(e),Z=e=>!!e&&!Au(ku(e)),Nu=e=>!!e&&ju(ku(e)),Pu=e=>e.endsWith(`%`)&&Z(e.slice(0,-1)),Fu=e=>wu.test(e),Iu=()=>!0,Lu=e=>Tu.test(e)&&!Eu.test(e),Ru=()=>!1,zu=e=>Du.test(e),Bu=e=>Ou.test(e),Vu=e=>!Q(e)&&!$(e),Hu=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),Uu=e=>id(e,cd,Ru),Q=e=>xu.test(e),Wu=e=>id(e,ld,Lu),Gu=e=>id(e,ud,Z),Ku=e=>id(e,fd,Iu),qu=e=>id(e,dd,Ru),Ju=e=>id(e,od,Ru),Yu=e=>id(e,sd,Bu),Xu=e=>id(e,pd,zu),$=e=>Su.test(e),Zu=e=>ad(e,ld),Qu=e=>ad(e,dd),$u=e=>ad(e,od),ed=e=>ad(e,cd),td=e=>ad(e,sd),nd=e=>ad(e,pd,!0),rd=e=>ad(e,fd,!0),id=(e,t,n)=>{let r=xu.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},ad=(e,t,n=!1)=>{let r=Su.exec(e);return r?r[1]?t(r[1]):n:!1},od=e=>e===`position`||e===`percentage`,sd=e=>e===`image`||e===`url`,cd=e=>e===`length`||e===`size`||e===`bg-size`,ld=e=>e===`length`,ud=e=>e===`number`,dd=e=>e===`family-name`,fd=e=>e===`number`||e===`weight`,pd=e=>e===`shadow`,md=()=>{let e=bu(`color`),t=bu(`font`),n=bu(`text`),r=bu(`font-weight`),i=bu(`tracking`),a=bu(`leading`),o=bu(`breakpoint`),s=bu(`container`),c=bu(`spacing`),l=bu(`radius`),u=bu(`shadow`),d=bu(`inset-shadow`),f=bu(`text-shadow`),p=bu(`drop-shadow`),m=bu(`blur`),h=bu(`perspective`),g=bu(`aspect`),_=bu(`ease`),v=bu(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),$,Q],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],ee=()=>[`auto`,`contain`,`none`],C=()=>[$,Q,c],w=()=>[Mu,`full`,`auto`,...C()],te=()=>[Nu,`none`,`subgrid`,$,Q],ne=()=>[`auto`,{span:[`full`,Nu,$,Q]},Nu,$,Q],re=()=>[Nu,`auto`,$,Q],ie=()=>[`auto`,`min`,`max`,`fr`,$,Q],ae=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],oe=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],se=()=>[`auto`,...C()],ce=()=>[Mu,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...C()],le=()=>[Mu,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...C()],ue=()=>[Mu,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...C()],T=()=>[e,$,Q],de=()=>[...b(),$u,Ju,{position:[$,Q]}],fe=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],pe=()=>[`auto`,`cover`,`contain`,ed,Uu,{size:[$,Q]}],me=()=>[Pu,Zu,Wu],E=()=>[``,`none`,`full`,l,$,Q],D=()=>[``,Z,Zu,Wu],he=()=>[`solid`,`dashed`,`dotted`,`double`],ge=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],O=()=>[Z,Pu,$u,Ju],_e=()=>[``,`none`,m,$,Q],ve=()=>[`none`,Z,$,Q],k=()=>[`none`,Z,$,Q],ye=()=>[Z,$,Q],A=()=>[Mu,`full`,...C()];return{theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[Fu],breakpoint:[Fu],color:[Iu],container:[Fu],"drop-shadow":[Fu],ease:[`in`,`out`,`in-out`],font:[Vu],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[Fu],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[Fu],shadow:[Fu],spacing:[`px`,Z],text:[Fu],"text-shadow":[Fu],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,Mu,Q,$,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,$,Q]}],"container-named":[Hu],columns:[{columns:[Z,Q,$,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:ee()}],"overscroll-x":[{"overscroll-x":ee()}],"overscroll-y":[{"overscroll-y":ee()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:w()}],"inset-x":[{"inset-x":w()}],"inset-y":[{"inset-y":w()}],start:[{"inset-s":w(),start:w()}],end:[{"inset-e":w(),end:w()}],"inset-bs":[{"inset-bs":w()}],"inset-be":[{"inset-be":w()}],top:[{top:w()}],right:[{right:w()}],bottom:[{bottom:w()}],left:[{left:w()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Nu,`auto`,$,Q]}],basis:[{basis:[Mu,`full`,`auto`,s,...C()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[Z,Mu,`auto`,`initial`,`none`,Q]}],grow:[{grow:[``,Z,$,Q]}],shrink:[{shrink:[``,Z,$,Q]}],order:[{order:[Nu,`first`,`last`,`none`,$,Q]}],"grid-cols":[{"grid-cols":te()}],"col-start-end":[{col:ne()}],"col-start":[{"col-start":re()}],"col-end":[{"col-end":re()}],"grid-rows":[{"grid-rows":te()}],"row-start-end":[{row:ne()}],"row-start":[{"row-start":re()}],"row-end":[{"row-end":re()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":ie()}],"auto-rows":[{"auto-rows":ie()}],gap:[{gap:C()}],"gap-x":[{"gap-x":C()}],"gap-y":[{"gap-y":C()}],"justify-content":[{justify:[...ae(),`normal`]}],"justify-items":[{"justify-items":[...oe(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...oe()]}],"align-content":[{content:[`normal`,...ae()]}],"align-items":[{items:[...oe(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...oe(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ae()}],"place-items":[{"place-items":[...oe(),`baseline`]}],"place-self":[{"place-self":[`auto`,...oe()]}],p:[{p:C()}],px:[{px:C()}],py:[{py:C()}],ps:[{ps:C()}],pe:[{pe:C()}],pbs:[{pbs:C()}],pbe:[{pbe:C()}],pt:[{pt:C()}],pr:[{pr:C()}],pb:[{pb:C()}],pl:[{pl:C()}],m:[{m:se()}],mx:[{mx:se()}],my:[{my:se()}],ms:[{ms:se()}],me:[{me:se()}],mbs:[{mbs:se()}],mbe:[{mbe:se()}],mt:[{mt:se()}],mr:[{mr:se()}],mb:[{mb:se()}],ml:[{ml:se()}],"space-x":[{"space-x":C()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":C()}],"space-y-reverse":[`space-y-reverse`],size:[{size:ce()}],"inline-size":[{inline:[`auto`,...le()]}],"min-inline-size":[{"min-inline":[`auto`,...le()]}],"max-inline-size":[{"max-inline":[`none`,...le()]}],"block-size":[{block:[`auto`,...ue()]}],"min-block-size":[{"min-block":[`auto`,...ue()]}],"max-block-size":[{"max-block":[`none`,...ue()]}],w:[{w:[s,`screen`,...ce()]}],"min-w":[{"min-w":[s,`screen`,`none`,...ce()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...ce()]}],h:[{h:[`screen`,`lh`,...ce()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...ce()]}],"max-h":[{"max-h":[`screen`,`lh`,...ce()]}],"font-size":[{text:[`base`,n,Zu,Wu]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,rd,Ku]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Pu,Q]}],"font-family":[{font:[Qu,qu,t]}],"font-features":[{"font-features":[Q]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,$,Q]}],"line-clamp":[{"line-clamp":[Z,`none`,$,Gu]}],leading:[{leading:[a,...C()]}],"list-image":[{"list-image":[`none`,$,Q]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,$,Q]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:T()}],"text-color":[{text:T()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...he(),`wavy`]}],"text-decoration-thickness":[{decoration:[Z,`from-font`,`auto`,$,Wu]}],"text-decoration-color":[{decoration:T()}],"underline-offset":[{"underline-offset":[Z,`auto`,$,Q]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:C()}],"tab-size":[{tab:[Nu,$,Q]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,$,Q]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,$,Q]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:de()}],"bg-repeat":[{bg:fe()}],"bg-size":[{bg:pe()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Nu,$,Q],radial:[``,$,Q],conic:[Nu,$,Q]},td,Yu]}],"bg-color":[{bg:T()}],"gradient-from-pos":[{from:me()}],"gradient-via-pos":[{via:me()}],"gradient-to-pos":[{to:me()}],"gradient-from":[{from:T()}],"gradient-via":[{via:T()}],"gradient-to":[{to:T()}],rounded:[{rounded:E()}],"rounded-s":[{"rounded-s":E()}],"rounded-e":[{"rounded-e":E()}],"rounded-t":[{"rounded-t":E()}],"rounded-r":[{"rounded-r":E()}],"rounded-b":[{"rounded-b":E()}],"rounded-l":[{"rounded-l":E()}],"rounded-ss":[{"rounded-ss":E()}],"rounded-se":[{"rounded-se":E()}],"rounded-ee":[{"rounded-ee":E()}],"rounded-es":[{"rounded-es":E()}],"rounded-tl":[{"rounded-tl":E()}],"rounded-tr":[{"rounded-tr":E()}],"rounded-br":[{"rounded-br":E()}],"rounded-bl":[{"rounded-bl":E()}],"border-w":[{border:D()}],"border-w-x":[{"border-x":D()}],"border-w-y":[{"border-y":D()}],"border-w-s":[{"border-s":D()}],"border-w-e":[{"border-e":D()}],"border-w-bs":[{"border-bs":D()}],"border-w-be":[{"border-be":D()}],"border-w-t":[{"border-t":D()}],"border-w-r":[{"border-r":D()}],"border-w-b":[{"border-b":D()}],"border-w-l":[{"border-l":D()}],"divide-x":[{"divide-x":D()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":D()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...he(),`hidden`,`none`]}],"divide-style":[{divide:[...he(),`hidden`,`none`]}],"border-color":[{border:T()}],"border-color-x":[{"border-x":T()}],"border-color-y":[{"border-y":T()}],"border-color-s":[{"border-s":T()}],"border-color-e":[{"border-e":T()}],"border-color-bs":[{"border-bs":T()}],"border-color-be":[{"border-be":T()}],"border-color-t":[{"border-t":T()}],"border-color-r":[{"border-r":T()}],"border-color-b":[{"border-b":T()}],"border-color-l":[{"border-l":T()}],"divide-color":[{divide:T()}],"outline-style":[{outline:[...he(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[Z,$,Q]}],"outline-w":[{outline:[``,Z,Zu,Wu]}],"outline-color":[{outline:T()}],shadow:[{shadow:[``,`none`,u,nd,Xu]}],"shadow-color":[{shadow:T()}],"inset-shadow":[{"inset-shadow":[`none`,d,nd,Xu]}],"inset-shadow-color":[{"inset-shadow":T()}],"ring-w":[{ring:D()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:T()}],"ring-offset-w":[{"ring-offset":[Z,Wu]}],"ring-offset-color":[{"ring-offset":T()}],"inset-ring-w":[{"inset-ring":D()}],"inset-ring-color":[{"inset-ring":T()}],"text-shadow":[{"text-shadow":[`none`,f,nd,Xu]}],"text-shadow-color":[{"text-shadow":T()}],opacity:[{opacity:[Z,$,Q]}],"mix-blend":[{"mix-blend":[...ge(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":ge()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[Z]}],"mask-image-linear-from-pos":[{"mask-linear-from":O()}],"mask-image-linear-to-pos":[{"mask-linear-to":O()}],"mask-image-linear-from-color":[{"mask-linear-from":T()}],"mask-image-linear-to-color":[{"mask-linear-to":T()}],"mask-image-t-from-pos":[{"mask-t-from":O()}],"mask-image-t-to-pos":[{"mask-t-to":O()}],"mask-image-t-from-color":[{"mask-t-from":T()}],"mask-image-t-to-color":[{"mask-t-to":T()}],"mask-image-r-from-pos":[{"mask-r-from":O()}],"mask-image-r-to-pos":[{"mask-r-to":O()}],"mask-image-r-from-color":[{"mask-r-from":T()}],"mask-image-r-to-color":[{"mask-r-to":T()}],"mask-image-b-from-pos":[{"mask-b-from":O()}],"mask-image-b-to-pos":[{"mask-b-to":O()}],"mask-image-b-from-color":[{"mask-b-from":T()}],"mask-image-b-to-color":[{"mask-b-to":T()}],"mask-image-l-from-pos":[{"mask-l-from":O()}],"mask-image-l-to-pos":[{"mask-l-to":O()}],"mask-image-l-from-color":[{"mask-l-from":T()}],"mask-image-l-to-color":[{"mask-l-to":T()}],"mask-image-x-from-pos":[{"mask-x-from":O()}],"mask-image-x-to-pos":[{"mask-x-to":O()}],"mask-image-x-from-color":[{"mask-x-from":T()}],"mask-image-x-to-color":[{"mask-x-to":T()}],"mask-image-y-from-pos":[{"mask-y-from":O()}],"mask-image-y-to-pos":[{"mask-y-to":O()}],"mask-image-y-from-color":[{"mask-y-from":T()}],"mask-image-y-to-color":[{"mask-y-to":T()}],"mask-image-radial":[{"mask-radial":[$,Q]}],"mask-image-radial-from-pos":[{"mask-radial-from":O()}],"mask-image-radial-to-pos":[{"mask-radial-to":O()}],"mask-image-radial-from-color":[{"mask-radial-from":T()}],"mask-image-radial-to-color":[{"mask-radial-to":T()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[Z]}],"mask-image-conic-from-pos":[{"mask-conic-from":O()}],"mask-image-conic-to-pos":[{"mask-conic-to":O()}],"mask-image-conic-from-color":[{"mask-conic-from":T()}],"mask-image-conic-to-color":[{"mask-conic-to":T()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:de()}],"mask-repeat":[{mask:fe()}],"mask-size":[{mask:pe()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,$,Q]}],filter:[{filter:[``,`none`,$,Q]}],blur:[{blur:_e()}],brightness:[{brightness:[Z,$,Q]}],contrast:[{contrast:[Z,$,Q]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,nd,Xu]}],"drop-shadow-color":[{"drop-shadow":T()}],grayscale:[{grayscale:[``,Z,$,Q]}],"hue-rotate":[{"hue-rotate":[Z,$,Q]}],invert:[{invert:[``,Z,$,Q]}],saturate:[{saturate:[Z,$,Q]}],sepia:[{sepia:[``,Z,$,Q]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,$,Q]}],"backdrop-blur":[{"backdrop-blur":_e()}],"backdrop-brightness":[{"backdrop-brightness":[Z,$,Q]}],"backdrop-contrast":[{"backdrop-contrast":[Z,$,Q]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,Z,$,Q]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[Z,$,Q]}],"backdrop-invert":[{"backdrop-invert":[``,Z,$,Q]}],"backdrop-opacity":[{"backdrop-opacity":[Z,$,Q]}],"backdrop-saturate":[{"backdrop-saturate":[Z,$,Q]}],"backdrop-sepia":[{"backdrop-sepia":[``,Z,$,Q]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":C()}],"border-spacing-x":[{"border-spacing-x":C()}],"border-spacing-y":[{"border-spacing-y":C()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,$,Q]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[Z,`initial`,$,Q]}],ease:[{ease:[`linear`,`initial`,_,$,Q]}],delay:[{delay:[Z,$,Q]}],animate:[{animate:[`none`,v,$,Q]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,$,Q]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:ve()}],"rotate-x":[{"rotate-x":ve()}],"rotate-y":[{"rotate-y":ve()}],"rotate-z":[{"rotate-z":ve()}],scale:[{scale:k()}],"scale-x":[{"scale-x":k()}],"scale-y":[{"scale-y":k()}],"scale-z":[{"scale-z":k()}],"scale-3d":[`scale-3d`],skew:[{skew:ye()}],"skew-x":[{"skew-x":ye()}],"skew-y":[{"skew-y":ye()}],transform:[{transform:[$,Q,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:A()}],"translate-x":[{"translate-x":A()}],"translate-y":[{"translate-y":A()}],"translate-z":[{"translate-z":A()}],"translate-none":[`translate-none`],zoom:[{zoom:[Nu,$,Q]}],accent:[{accent:T()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:T()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,$,Q]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":T()}],"scrollbar-track-color":[{"scrollbar-track":T()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":C()}],"scroll-mx":[{"scroll-mx":C()}],"scroll-my":[{"scroll-my":C()}],"scroll-ms":[{"scroll-ms":C()}],"scroll-me":[{"scroll-me":C()}],"scroll-mbs":[{"scroll-mbs":C()}],"scroll-mbe":[{"scroll-mbe":C()}],"scroll-mt":[{"scroll-mt":C()}],"scroll-mr":[{"scroll-mr":C()}],"scroll-mb":[{"scroll-mb":C()}],"scroll-ml":[{"scroll-ml":C()}],"scroll-p":[{"scroll-p":C()}],"scroll-px":[{"scroll-px":C()}],"scroll-py":[{"scroll-py":C()}],"scroll-ps":[{"scroll-ps":C()}],"scroll-pe":[{"scroll-pe":C()}],"scroll-pbs":[{"scroll-pbs":C()}],"scroll-pbe":[{"scroll-pbe":C()}],"scroll-pt":[{"scroll-pt":C()}],"scroll-pr":[{"scroll-pr":C()}],"scroll-pb":[{"scroll-pb":C()}],"scroll-pl":[{"scroll-pl":C()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,$,Q]}],fill:[{fill:[`none`,...T()]}],"stroke-w":[{stroke:[Z,Zu,Wu,Gu]}],stroke:[{stroke:[`none`,...T()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`right`,`left`],"inset-y":[`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`pr`,`pl`],py:[`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`mr`,`ml`],my:[`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-r`,`border-w-l`],"border-w-y":[`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-r`,`border-color-l`],"border-color-y":[`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},hd=(e,{extend:t={},override:n={}})=>(_d(e.theme,n.theme),_d(e.classGroups,n.classGroups),_d(e.conflictingClassGroups,n.conflictingClassGroups),_d(e.conflictingClassGroupModifiers,n.conflictingClassGroupModifiers),gd(e,`postfixLookupClassGroups`,n.postfixLookupClassGroups),gd(e,`orderSensitiveModifiers`,n.orderSensitiveModifiers),vd(e.theme,t.theme),vd(e.classGroups,t.classGroups),vd(e.conflictingClassGroups,t.conflictingClassGroups),vd(e.conflictingClassGroupModifiers,t.conflictingClassGroupModifiers),yd(e,t,`postfixLookupClassGroups`),yd(e,t,`orderSensitiveModifiers`),e),gd=(e,t,n)=>{n!==void 0&&(e[t]=n)},_d=(e,t)=>{if(t)for(let n in t)gd(e,n,t[n])},vd=(e,t)=>{if(t)for(let n in t)yd(e,t,n)},yd=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},bd=e=>vu(e?typeof e==`function`?()=>e(md()):()=>hd(md(),e):md),xd=e=>{if(Vc(e))return;let t=e,n={...t.extend??{}};for(let e of[`theme`,`classGroups`,`conflictingClassGroups`,`conflictingClassGroupModifiers`,`postfixLookupClassGroups`,`orderSensitiveModifiers`,`cacheSize`,`prefix`,`separator`,`experimentalParseClassName`])t[e]!==void 0&&n[e]===void 0&&(n[e]=t[e]);let r={};if(Object.keys(n).length>0&&(r.extend=n),t.override!=null&&!Vc(t.override)&&(r.override=t.override),r.extend||r.override)return r},Sd=e=>{let t=bd(xd(e));return e=>t.mergeString(e)},Cd,wd=()=>(Cd||=bd(),Cd),Td=()=>((!sl.cachedTwMerge||sl.didTwMergeConfigChange)&&(sl.didTwMergeConfigChange=!1,sl.cachedTwMerge=Sd(sl.cachedTwMergeConfig)),sl.cachedTwMerge),Ed=e=>{let t=e?.twMergeConfig;t&&!Vc(t)&&(Hc(t,sl.cachedTwMergeConfig)||(sl.cachedTwMergeConfig=t,sl.didTwMergeConfigChange=!0))},Dd=e=>Pc(e);(()=>{let e=Error();return!(`line`in e)&&!(`lineNumber`in e)})();var Od=sl.reset.bind(sl);sl.reset=()=>{Cd=void 0,Od()};var kd=(e,t)=>{let n=Dd(e);return!n||!(t?.twMerge??!0)?n||void 0:n.indexOf(` `)===-1?n:(Ed(t),(t?.twMergeConfig&&!Vc(t.twMergeConfig)?Td():wd().mergeString)(n)||void 0)},Ad=Il((e,...t)=>kd(t,e));Ad.tv;var jd=Ad.createTV,Md=`/* Generated by \`bun run tokens\` from design/tokens/cawco.tokens.json.
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
  --container-suggestion-rows-narrow: 340px;
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
  --spacing-c-decision-page-max: var(--c-decision-page-max);
  --spacing-c-decision-meter-w: var(--c-decision-meter-w);
  --spacing-c-decision-option-min: var(--c-decision-option-min);
  --spacing-c-media-max-h: var(--c-media-max-h);
  --spacing-c-media-words-floor: var(--c-media-words-floor);
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
  --spacing-c-project-head-h: var(--c-project-head-h);
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
  --spacing-c-usage-strip-clip: var(--c-usage-strip-clip);
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
`,Nd=e=>[...Md.matchAll(RegExp(`^\\s*--${e}-([a-z0-9-]+):`,`gm`))].map(([,e])=>e),Pd=e=>[...Md.matchAll(RegExp(`^@utility ${e}-([a-z0-9-]+) \\{`,`gm`))].map(([,e])=>e),Fd=Nd(`duration`),Id=[`type-role`,`font-shorthand`,`font-family`,`font-features`,`font-size`,`font-stretch`,`font-style`,`font-weight`,`fvn-normal`,`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`,`leading`],Ld=[Tc.isArbitraryVariable,Tc.isArbitraryValue],Rd={extend:{theme:{text:Pd(`text`).filter(e=>!e.startsWith(`size-`)),spacing:Nd(`spacing`),radius:Nd(`radius`),shadow:Nd(`shadow`),"drop-shadow":Nd(`drop-shadow`),leading:Nd(`leading`),tracking:Nd(`tracking`),ease:Nd(`ease`),font:Nd(`font`).filter(e=>!e.startsWith(`weight-`)),"font-weight":Nd(`font-weight`),breakpoint:Nd(`breakpoint`),container:Nd(`container`),animate:Nd(`animate`)},classGroups:{"font-size":[{"text-size":Pd(`text-size`)}],"bg-image":[{bg:Pd(`bg`)}],transition:[{transition:[...Pd(`transition`),`off`,`control-grow`]}],animate:[`sheet-fade`],content:[{content:[`data-n`,`placeholder`]}],"grid-rows":[{"grid-rows":[`shut`,`open`]}],"grid-cols":[{"grid-cols":[`fluid-auto`,`mark-fluid`]}],"auto-rows":[{"auto-rows":[`line`,`band`,`band-phone`]}],"animation-duration":[{"anim-dur":Fd}],"animation-delay":[{"anim-delay":Fd}],"type-role":[{type:Pd(`type`)}],"border-none-t":[`border-t-none`],"border-none-b":[`border-b-none`],"border-none-l":[`border-l-none`],"border-none-r":[`border-r-none`],"border-none-s":[`border-s-none`],"border-style-t":[`border-t-dashed`],"outline-off":[`outline-off`],"background-shorthand":[{background:[Tc.isAny]}],rounded:[`rounded-inherit`,{concentric:Nd(`radius`)}],"concentric-in":[`concentric-in`],"r-outer":[{"r-outer":Nd(`radius`)}],"r-inset":[{"r-inset":Nd(`spacing`)}],"font-family":[`font-family-inherit`],gap:[`gap-inherit`],"color-scheme":[`scheme-inherit`],"pointer-events":[`pointer-events-all`],"max-h":[`max-h-inherit`],"align-items":[`items-box-start`,`items-box-end`,`items-unsafe-end`],"justify-content":[`justify-box-end`],"justify-self":[`justify-self-box-start`],"align-content":[`content-unsafe-end`],"border-color":[`border-suggest-tint`],"bg-color":[`bg-suggest-tint`,`bg-suggest-tint-hover`],"font-shorthand":[`font-inherit`,`font-mono-meta`],"line-clamp-undo":[`line-clamp-undo`],"translate-raw":[{"translate-raw":Ld}],"clip-margin":[{"clip-margin":[Tc.isAny]}],"overflow-anchor":[`anchor-none`],"scroll-timeline":[`scroll-timeline-transcript-head`],"pane-tab-pads":[`pane-tab-pads`],"pane-tab-rims":[`pane-tab-rims`],"divider-chevron":[`divider-chevron`],"turn-pad":[`turn-pad`],"word-break-word":[`break-word`],"animation-play-state":[`animation-paused`],"inks-strong":[`inks-strong`],"tap-highlight":[`tap-highlight-none`],"touch-callout":[`touch-callout-none`],"content-visibility":[`content-visibility-hidden`],"timeline-scope":[`timeline-scope-transcript-head`],"writing-mode":[`writing-vertical-rl`],direction:[`dir-rtl`],"clip-path":[{"clip-path":Ld},`clip-block-start`,`clip-tab-foot`],"grid-areas":[{"grid-areas":Ld}],"line-clamp-std":[{"line-clamp-std":[Tc.isInteger]}],"ring-ground":[{"ring-ground":[Tc.isAny]}],"hit-gap-x":[{"hit-gap-x":[Tc.isAny]}],"hit-gap-y":[{"hit-gap-y":Ld}],"caw-neck":[{"caw-neck":Ld}],"press-by":[{"press-by":Ld}],"swap-away":[{"swap-away":[Tc.isInteger]}],"rail-step":[{"rail-step":Ld}],"prompt-fs":[{"prompt-fs":Ld}],"fade-inset-end":[{"fade-inset-end":Ld}]},conflictingClassGroups:{"type-role":[...Id],"font-shorthand":[...Id]}}},zd=Mc(Rd),Bd=jd({twMergeConfig:Rd});function Vd(...e){return zd(wi(e))}var Hd=Bd({base:`loops block rounded-sm bg-surface-fill motion-safe:animate-skeleton-pulse`,variants:{height:{line:`h-6`,figure:`h-7`,item:`h-10`,tabs:`h-11`,row:`h-14`,block:`h-20`,plot:`h-24`,view:`h-40`,chart:`h-48`,board:`h-64`,"x-height":`h-c-skeleton-x-height`,picture:`aspect-16/10`,control:`h-c-btn-h`,"control-sm":`h-c-btn-h-sm`,field:`h-c-input-h`,badge:`h-c-badge-h`,chip:`h-c-suggest-chip`,stat:`h-c-stat-h`,card:`h-c-skeleton-card-h`,"reason-row":`h-c-find-skeleton-tall`},line:{meta:`type-meta h-lh`,label:`type-label h-lh`,body:`type-body h-lh`,title:`type-title h-lh`},width:{glyph:`w-6`,word:`w-14`,short:`w-16`,label:`w-20`,name:`w-24`,title:`w-40`,"chart-cap":`max-w-144`,age:`w-c-skeleton-age`},radius:{card:`rounded-lg`,tile:`rounded-md`,chip:`rounded-sm`,text:`rounded-xs`,flush:`rounded-none`,line:`rounded-hair`,pill:`rounded-pill`},cell:{rail:`rail-cell`,glyph:`size-icon-md`,mark:`size-c-row-mark`,pin:`size-c-pin`},type:{label:`type-label`,meta:`type-meta`},fill:{frame:`absolute inset-0`},hold:{cover:`group-data-ready/cover:animation-paused`}}}),Ud=new Set([`$$slots`,`$$events`,`$$legacy`,`ref`,`class`,`height`,`line`,`width`,`radius`,`cell`,`type`,`fill`,`hold`]),Wd=H(`<span></span>`);function Gd(e,t){Ue(t,!0);let n=da(t,`ref`,15,null),r=ua(t,Ud),i=e=>{for(let t of e.getAnimations({subtree:!0}))t instanceof CSSAnimation&&t.animationName===`kit-skeleton-pulse`&&t.playState===`running`&&(t.startTime=0)};var a=Wd();Qi(a,e=>({class:e,"data-slot":`skeleton`,...r}),[()=>Vd(Hd({height:t.height,line:t.line,width:t.width,radius:t.radius,cell:t.cell,type:t.type,fill:t.fill,hold:t.hold}),t.class)]),oa(a,e=>n(e),()=>n()),Si(a,()=>i),U(e,a),We()}var Kd=new Set([`$$slots`,`$$events`,`$$legacy`]),qd=Br(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 9L12 15L5 9"></path></svg>`);function Jd(e,t){let n=ua(t,Kd);var r=qd();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Yd=new Set([`$$slots`,`$$events`,`$$legacy`]),Xd=Br(`<svg><g fill="currentColor"><g opacity=".5"><path d="M15.0625 8.00004C15.5698 8.00004 16.0547 8.09584 16.5 8.27055C17.9637 8.84479 19 10.2702 19 11.9375V15C19 18.6126 16.2633 21.5858 12.75 21.96V15C12.75 14.5858 12.4142 14.25 12 14.25C11.5858 14.25 11.25 14.5858 11.25 15V21.96C7.73669 21.5858 5 18.6126 5 15V11.9375C5 10.2702 6.03633 8.84479 7.5 8.27055C7.94531 8.09584 8.43023 8.00004 8.9375 8.00004H15.0625Z"></path><path d="M6.37598 1.58402C6.60572 1.23942 7.07138 1.14633 7.41602 1.37601L10.3311 3.31937C9.81444 3.52579 9.34486 3.82559 8.94336 4.1973L6.58398 2.62406C6.23941 2.39428 6.14623 1.92864 6.37598 1.58402Z"></path><path d="M16.584 1.37601C16.9286 1.14627 17.3942 1.23945 17.624 1.58402C17.8538 1.92867 17.7607 2.3943 17.416 2.62406L15.0566 4.1973C14.6551 3.82557 14.1856 3.5258 13.6689 3.31937L16.584 1.37601Z"></path></g><path d="M12 14.25C12.4142 14.25 12.75 14.5858 12.75 15V22H11.25V15C11.25 14.5858 11.5858 14.25 12 14.25Z"></path><path d="M5.70215 18.0605C5.92373 18.5156 6.1941 18.9426 6.50488 19.3359L3.83496 20.6709C3.46466 20.8558 3.01439 20.7061 2.8291 20.3359C2.64384 19.9655 2.79456 19.5144 3.16504 19.3291L5.70215 18.0605Z"></path><path d="M20.835 19.3291C21.2054 19.5144 21.3562 19.9655 21.1709 20.3359C20.9856 20.7061 20.5353 20.8558 20.165 20.6709L17.4951 19.3359C17.8059 18.9426 18.0763 18.5156 18.2979 18.0605L20.835 19.3291Z"></path><path d="M5 14.75H2C1.58583 14.75 1.25007 14.4142 1.25 14C1.25 13.5858 1.58579 13.25 2 13.25H5V14.75Z"></path><path d="M22 13.25C22.4142 13.25 22.75 13.5858 22.75 14C22.7499 14.4142 22.4142 14.75 22 14.75H19V13.25H22Z"></path><path d="M2.8291 7.66406C3.01434 7.29376 3.46457 7.14408 3.83496 7.3291L6.64648 8.73438C6.21949 9.04035 5.85589 9.43014 5.58008 9.87891L3.16504 8.6709C2.79456 8.48564 2.64384 8.03454 2.8291 7.66406Z"></path><path d="M20.165 7.3291C20.5354 7.14408 20.9857 7.29376 21.1709 7.66406C21.3562 8.03454 21.2054 8.48564 20.835 8.6709L18.4199 9.87891C18.1441 9.43014 17.7805 9.04035 17.3535 8.73438L20.165 7.3291Z"></path><path d="M12 3C14.4853 3 16.5 5.01472 16.5 7.5V8.27051C16.0547 8.09581 15.5698 8 15.0625 8H8.9375C8.43023 8 7.94531 8.09581 7.5 8.27051V7.5C7.5 5.01472 9.51472 3 12 3Z"></path></g></svg>`);function Zd(e,t){let n=ua(t,Yd);var r=Xd();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Qd=new Set([`$$slots`,`$$events`,`$$legacy`]),$d=Br(`<svg><g fill="currentColor"><path d="M7 16C7.55228 16 8 16.4477 8 17C8 17.5523 7.55228 18 7 18C6.44772 18 6 17.5523 6 17C6 16.4477 6.44772 16 7 16Z"></path><path d="M12 16C12.5523 16 13 16.4477 13 17C13 17.5523 12.5523 18 12 18C11.4477 18 11 17.5523 11 17C11 16.4477 11.4477 16 12 16Z"></path><path d="M17 16C17.5523 16 18 16.4477 18 17C18 17.5523 17.5523 18 17 18C16.4477 18 16 17.5523 16 17C16 16.4477 16.4477 16 17 16Z"></path><path d="M7 12C7.55228 12 8 12.4477 8 13C8 13.5523 7.55228 14 7 14C6.44772 14 6 13.5523 6 13C6 12.4477 6.44772 12 7 12Z"></path><path d="M12 12C12.5523 12 13 12.4477 13 13C13 13.5523 12.5523 14 12 14C11.4477 14 11 13.5523 11 13C11 12.4477 11.4477 12 12 12Z"></path><path d="M17 12C17.5523 12 18 12.4477 18 13C18 13.5523 17.5523 14 17 14C16.4477 14 16 13.5523 16 13C16 12.4477 16.4477 12 17 12Z"></path><path d="M16.9805 2C17.3961 2.00025 17.7334 2.32483 17.7334 2.72461V4.24902C19.1781 4.36032 20.1264 4.63361 20.8232 5.30371C21.5201 5.97389 21.8042 6.88597 21.9199 8.27539L22 9H2V8.27539C2.11574 6.88599 2.39984 5.97389 3.09668 5.30371C3.79363 4.63345 4.74245 4.3603 6.1875 4.24902V2.72461C6.1875 2.32468 6.52457 2 6.94043 2C7.35622 2.00008 7.69336 2.32473 7.69336 2.72461V4.18457C8.36123 4.17212 9.10985 4.17285 9.95215 4.17285H13.9678C14.8099 4.17285 15.5588 4.17212 16.2266 4.18457V2.72461C16.2266 2.32468 16.5646 2 16.9805 2Z"></path><path d="M21.9995 14.0001V12.0001C21.9995 11.161 21.9963 9.66527 21.9834 9H2.00917C1.99626 9.66527 1.99953 11.161 1.99953 12.0001V14.0001C1.99953 17.7713 1.99953 19.6569 3.1711 20.8285C4.34267 22.0001 6.22829 22.0001 9.99953 22.0001H13.9995C17.7708 22.0001 19.6564 22.0001 20.828 20.8285C21.9995 19.6569 21.9995 17.7713 21.9995 14.0001Z" opacity=".5"></path></g></svg>`);function ef(e,t){let n=ua(t,Qd);var r=$d();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var tf=new Set([`$$slots`,`$$events`,`$$legacy`]),nf=Br(`<svg><g fill="currentColor"><path d="M21.9749 13.8143C20.4809 14.5732 18.7904 15.0009 17 15.0009C10.9249 15.0009 6 10.0761 6 4.00092C6 3.37164 6.05284 2.7547 6.15433 2.1543C5.43913 2.25971 4.87728 2.43759 4.38751 2.73772C3.71473 3.15 3.14908 3.71565 2.7368 4.38843C2 5.59078 2 7.22749 2 10.5009V11.5009C2 13.8306 2 14.9955 2.3806 15.9143C2.88807 17.1395 3.86144 18.1129 5.08658 18.6203C5.74689 18.8938 6.53422 18.9707 7.78958 18.9924C8.63992 19.007 9.06509 19.0144 9.40279 19.2108C9.74049 19.4072 9.95073 19.7624 10.3712 20.4728L10.9133 21.3886C11.3965 22.2049 12.6035 22.2049 13.0867 21.3886L13.6288 20.4728C14.0492 19.7624 14.2595 19.4072 14.5972 19.2108C14.9349 19.0144 15.36 19.007 16.2104 18.9924C17.4658 18.9707 18.2531 18.8938 18.9134 18.6203C20.1386 18.1129 21.1119 17.1395 21.6194 15.9143C21.8463 15.3666 21.9379 14.7315 21.9749 13.8143Z"></path><path fill-rule="evenodd" d="M13.0867 21.3886L13.6288 20.4728C14.0492 19.7624 14.2595 19.4072 14.5972 19.2108C14.9349 19.0144 15.36 19.007 16.2104 18.9924C17.4658 18.9707 18.2531 18.8938 18.9134 18.6203C20.1386 18.1129 21.1119 17.1395 21.6194 15.9143C21.8463 15.3666 21.9379 14.7315 21.9749 13.8143C20.4809 14.5732 18.7904 15.0009 17 15.0009C10.9249 15.0009 6 10.0761 6 4.00092C6 3.37164 6.05284 2.7547 6.15433 2.1543C5.43913 2.25971 4.87728 2.43759 4.38751 2.73772C3.71473 3.15 3.14908 3.71565 2.7368 4.38843C2 5.59078 2 7.22749 2 10.5009V11.5009C2 13.8306 2 14.9955 2.3806 15.9143C2.88807 17.1395 3.86144 18.1129 5.08658 18.6203C5.74689 18.8938 6.53422 18.9707 7.78958 18.9924C8.63992 19.007 9.06509 19.0144 9.40279 19.2108C9.74049 19.4072 9.95073 19.7624 10.3712 20.4728L10.9133 21.3886C11.3965 22.2049 12.6035 22.2049 13.0867 21.3886Z" clip-rule="evenodd"></path><path d="M13.5 2H10.5C8.56 2 7.19487 2 6.15433 2.15337C6.05284 2.75378 6 3.37072 6 4C6 10.0751 10.9249 15 17 15C18.7904 15 20.4809 14.5722 21.9749 13.8134C22 13.1919 22 12.441 22 11.5V10.5C22 7.22657 22 5.58985 21.2632 4.38751C20.8509 3.71473 20.2853 3.14908 19.6125 2.7368C18.4101 2 16.7734 2 13.5 2Z" opacity=".5"></path></g></svg>`);function rf(e,t){let n=ua(t,tf);var r=nf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var af=new Set([`$$slots`,`$$events`,`$$legacy`]),of=Br(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M8.04832 2.48826C8.33094 2.79108 8.31458 3.26567 8.01176 3.54829L3.72605 7.54829C3.57393 7.69027 3.36967 7.76267 3.1621 7.74818C2.95453 7.7337 2.7623 7.63363 2.63138 7.4719L1.41709 5.9719C1.15647 5.64996 1.20618 5.17769 1.52813 4.91707C1.85007 4.65645 2.32234 4.70616 2.58296 5.0281L3.29089 5.90261L6.98829 2.45171C7.2911 2.16909 7.76569 2.18545 8.04832 2.48826ZM11.25 5C11.25 4.58579 11.5858 4.25 12 4.25H22C22.4142 4.25 22.75 4.58579 22.75 5C22.75 5.41422 22.4142 5.75 22 5.75H12C11.5858 5.75 11.25 5.41422 11.25 5ZM8.04832 16.4883C8.33094 16.7911 8.31458 17.2657 8.01176 17.5483L3.72605 21.5483C3.57393 21.6903 3.36967 21.7627 3.1621 21.7482C2.95453 21.7337 2.7623 21.6336 2.63138 21.4719L1.41709 19.9719C1.15647 19.65 1.20618 19.1777 1.52813 18.9171C1.85007 18.6564 2.32234 18.7062 2.58296 19.0281L3.29089 19.9026L6.98829 16.4517C7.2911 16.1691 7.76569 16.1855 8.04832 16.4883ZM11.25 19C11.25 18.5858 11.5858 18.25 12 18.25H22C22.4142 18.25 22.75 18.5858 22.75 19C22.75 19.4142 22.4142 19.75 22 19.75H12C11.5858 19.75 11.25 19.4142 11.25 19Z" clip-rule="evenodd"></path><g opacity=".5"><path d="M8.04832 9.48826C8.33094 9.79108 8.31458 10.2657 8.01176 10.5483L3.72605 14.5483C3.57393 14.6903 3.36967 14.7627 3.1621 14.7482C2.95453 14.7337 2.7623 14.6336 2.63138 14.4719L1.41709 12.9719C1.15647 12.65 1.20618 12.1777 1.52813 11.9171C1.85007 11.6564 2.32234 11.7062 2.58296 12.0281L3.29089 12.9026L6.98829 9.45171C7.2911 9.16909 7.76569 9.18545 8.04832 9.48826Z"></path><path d="M11.25 12C11.25 11.5858 11.5858 11.25 12 11.25H22C22.4142 11.25 22.75 11.5858 22.75 12C22.75 12.4142 22.4142 12.75 22 12.75H12C11.5858 12.75 11.25 12.4142 11.25 12Z"></path></g></g></svg>`);function sf(e,t){let n=ua(t,af);var r=of();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var cf=new Set([`$$slots`,`$$events`,`$$legacy`]),lf=Br(`<svg><g fill="currentColor"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" opacity=".5"></path><path fill-rule="evenodd" d="M12 7.25C12.4142 7.25 12.75 7.58579 12.75 8V11.6893L15.0303 13.9697C15.3232 14.2626 15.3232 14.7374 15.0303 15.0303C14.7374 15.3232 14.2626 15.3232 13.9697 15.0303L11.4697 12.5303C11.329 12.3897 11.25 12.1989 11.25 12V8C11.25 7.58579 11.5858 7.25 12 7.25Z" clip-rule="evenodd"></path></g></svg>`);function uf(e,t){let n=ua(t,cf);var r=lf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var df=new Set([`$$slots`,`$$events`,`$$legacy`]),ff=Br(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V10C2 6.22876 2 4.34315 3.17157 3.17157C4.34315 2 6.23869 2 10.0298 2C10.6358 2 11.1214 2 11.53 2.01666C11.5166 2.09659 11.5095 2.17813 11.5092 2.26057L11.5 5.09497C11.4999 6.19207 11.4998 7.16164 11.6049 7.94316C11.7188 8.79028 11.9803 9.63726 12.6716 10.3285C13.3628 11.0198 14.2098 11.2813 15.0569 11.3952C15.8385 11.5003 16.808 11.5002 17.9051 11.5001L18 11.5001H21.9574C22 12.0344 22 12.6901 22 13.5629V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22Z" clip-rule="evenodd" opacity=".5"></path><path d="M11.5 17.25C11.9142 17.25 12.25 17.5858 12.25 18C12.25 18.4142 11.9142 18.75 11.5 18.75H6C5.58579 18.75 5.25 18.4142 5.25 18C5.25 17.5858 5.58579 17.25 6 17.25H11.5Z"></path><path d="M14 13.75C14.4142 13.75 14.75 14.0858 14.75 14.5C14.75 14.9142 14.4142 15.25 14 15.25H6C5.58579 15.25 5.25 14.9142 5.25 14.5C5.25 14.0858 5.58579 13.75 6 13.75H14Z"></path><path d="M11.5 2.00586C12.0266 2.01725 12.4003 2.05009 12.7842 2.14453C12.9404 2.18298 13.1407 2.24407 13.292 2.29883C13.8622 2.50534 14.2785 2.7833 15.1104 3.33887C16.0788 3.98569 17.1892 4.777 18 5.5C18.911 6.31239 19.9546 7.49387 20.7471 8.44238C20.8745 8.59494 20.938 8.67168 21.0312 8.79883C21.5613 9.52144 21.9336 10.546 21.9902 11.4404C22.0002 11.5979 22 11.7325 22 12H21.9844C21.9781 11.8216 21.9694 11.6555 21.957 11.5H17.9053C16.8082 11.5001 15.8382 11.4996 15.0566 11.3945C14.2097 11.2806 13.363 11.0192 12.6719 10.3281C11.9806 9.63685 11.7184 8.7895 11.6045 7.94238C11.4995 7.16098 11.4999 6.19157 11.5 5.09473L11.5088 2.25977L11.5 2.00586Z"></path></g></svg>`);function pf(e,t){let n=ua(t,df);var r=ff();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var mf=new Set([`$$slots`,`$$events`,`$$legacy`]),hf=Br(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M2.02783 11.25C2.41136 6.07745 6.72957 2 12.0001 2C11.1693 2 10.4295 2.36421 9.82093 2.92113C9.21541 3.47525 8.70371 4.24878 8.28983 5.16315C7.87352 6.08292 7.55013 7.15868 7.33126 8.32611C7.1558 9.26194 7.04903 10.2485 7.01344 11.25H2.02783ZM2.02783 12.75H7.01344C7.04903 13.7515 7.1558 14.7381 7.33126 15.6739C7.55013 16.8413 7.87351 17.9171 8.28983 18.8368C8.70371 19.7512 9.21541 20.5247 9.82093 21.0789C10.4295 21.6358 11.1693 22 12.0001 22C6.72957 22 2.41136 17.9226 2.02783 12.75Z" clip-rule="evenodd"></path><path d="M12.0001 2C12.831 2 13.5708 2.36421 14.1793 2.92113C14.7849 3.47525 15.2966 4.24878 15.7104 5.16315C16.1267 6.08292 16.4501 7.15868 16.669 8.32612C16.8445 9.26194 16.9512 10.2485 16.9868 11.25H21.9724C21.5889 6.07745 17.2707 2 12.0001 2Z"></path><path d="M16.669 15.6739C16.4501 16.8413 16.1267 17.9171 15.7104 18.8368C15.2966 19.7512 14.7849 20.5247 14.1793 21.0789C13.5708 21.6358 12.831 22 12.0001 22C17.2707 22 21.5889 17.9226 21.9724 12.75H16.9868C16.9512 13.7515 16.8445 14.7381 16.669 15.6739Z"></path><g opacity=".5"><path d="M12.0002 3.39551C11.7252 3.39551 11.3699 3.51252 10.9568 3.89058C10.5406 4.27142 10.124 4.86831 9.7559 5.68153C9.39025 6.48936 9.09334 7.46456 8.88902 8.55435C8.72811 9.41258 8.62829 10.3223 8.59326 11.2502H15.4071C15.3721 10.3223 15.2723 9.41258 15.1113 8.55435C14.907 7.46457 14.6101 6.48937 14.2445 5.68153C13.8764 4.86831 13.4597 4.27142 13.0436 3.89058C12.6305 3.51252 12.2752 3.39551 12.0002 3.39551Z"></path><path d="M8.88902 15.446C9.09334 16.5358 9.39025 17.511 9.7559 18.3188C10.124 19.132 10.5406 19.7289 10.9568 20.1097C11.3699 20.4878 11.7252 20.6048 12.0002 20.6048C12.2752 20.6048 12.6305 20.4878 13.0436 20.1097C13.4597 19.7289 13.8764 19.132 14.2445 18.3188C14.6101 17.511 14.907 16.5358 15.1113 15.446C15.2723 14.5877 15.3721 13.678 15.4071 12.7502H8.59326C8.62829 13.678 8.72811 14.5877 8.88902 15.446Z"></path></g></g></svg>`);function gf(e,t){let n=ua(t,mf);var r=hf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var _f=new Set([`$$slots`,`$$events`,`$$legacy`]),vf=Br(`<svg><g fill="currentColor"><path d="M19.0215 10.3145C21.0073 11.1088 22 11.5065 22 12C22 12.4935 21.0073 12.8912 19.0215 13.6855L18.2334 14L19.0215 14.3145C21.0073 15.1088 22 15.5065 22 16C22 16.4935 21.0073 16.8912 19.0215 17.6855L16.2129 18.8086C14.227 19.6029 13.2339 20 12 20C10.7661 20 9.773 19.6029 7.78711 18.8086L4.97852 17.6855C2.9927 16.8912 2 16.4935 2 16C2 15.5065 2.9927 15.1088 4.97852 14.3145L5.76562 14L4.97852 13.6855C2.9927 12.8912 2 12.4935 2 12C2 11.5065 2.9927 11.1088 4.97852 10.3145L5.7666 10L7.78711 10.8086C9.773 11.6029 10.7661 12 12 12C13.2339 12 14.227 11.6029 16.2129 10.8086L18.2334 10L19.0215 10.3145Z" opacity=".5"></path><path d="M19.0215 10.3145C21.0073 11.1088 22 11.5065 22 12C22 12.4935 21.0073 12.8912 19.0215 13.6855L16.2129 14.8086C14.227 15.6029 13.2339 16 12 16C10.7661 16 9.773 15.6029 7.78711 14.8086L4.97852 13.6855C2.9927 12.8912 2 12.4935 2 12C2 11.5065 2.9927 11.1088 4.97852 10.3145L5.7666 10L7.78711 10.8086C9.773 11.6029 10.7661 12 12 12C13.2339 12 14.227 11.6029 16.2129 10.8086L18.2334 10L19.0215 10.3145Z" opacity=".5"></path><path d="M12 4C13.2339 4 14.227 4.39705 16.2129 5.19141L19.0215 6.31445C21.0073 7.10878 22 7.50646 22 8C22 8.49354 21.0073 8.89122 19.0215 9.68555L16.2129 10.8086C14.227 11.6029 13.2339 12 12 12C10.7661 12 9.773 11.6029 7.78711 10.8086L4.97852 9.68555C2.9927 8.89122 2 8.49354 2 8C2 7.50646 2.9927 7.10878 4.97852 6.31445L7.78711 5.19141C9.773 4.39705 10.7661 4 12 4Z"></path></g></svg>`);function yf(e,t){let n=ua(t,_f);var r=vf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var bf=new Set([`$$slots`,`$$events`,`$$legacy`]),xf=Br(`<svg><path fill="currentColor" d="M20.313 11.157a9.157 9.157 0 1 1-18.313 0a9.157 9.157 0 0 1 18.313 0" opacity=".5"></path><path fill="currentColor" d="m17.1 18.122l3.666 3.666a.723.723 0 0 0 1.023-1.022L18.122 17.1a9 9 0 0 1-1.022 1.022"></path></svg>`);function Sf(e,t){let n=ua(t,bf);var r=xf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Cf=new Set([`$$slots`,`$$events`,`$$legacy`]),wf=Br(`<svg><g fill="currentColor"><path d="M20 9C20.4142 9 20.75 9.33579 20.75 9.75V10.75C20.75 15.3298 17.2314 19.0883 12.75 19.4688V21.75C12.75 22.1642 12.4142 22.5 12 22.5C11.5858 22.5 11.25 22.1642 11.25 21.75V19.4688C6.7686 19.0883 3.25 15.3298 3.25 10.75V9.75C3.25 9.33579 3.58579 9 4 9C4.41421 9 4.75 9.33579 4.75 9.75V10.75C4.75 14.7541 7.99594 18 12 18C16.0041 18 19.25 14.7541 19.25 10.75V9.75C19.25 9.33579 19.5858 9 20 9Z"></path><path d="M17.7012 11.5H13C12.5858 11.5 12.25 11.1642 12.25 10.75C12.25 10.3358 12.5858 10 13 10H17.75L17.7012 11.5Z"></path><path d="M17.75 8.5H13C12.5858 8.5 12.25 8.16421 12.25 7.75C12.25 7.33579 12.5858 7 13 7H17.7012L17.75 8.5Z"></path><path d="M12 2C8.82436 2 6.25 4.57436 6.25 7.75V10.75C6.25 13.9256 8.82436 16.5 12 16.5C14.9214 16.5 17.334 14.3213 17.7015 11.5L13 11.5C12.5858 11.5 12.25 11.1642 12.25 10.75C12.25 10.3358 12.5858 10 13 10L17.75 10V8.5H13C12.5858 8.5 12.25 8.16421 12.25 7.75C12.25 7.33579 12.5858 7 13 7H17.7015C17.334 4.17873 14.9214 2 12 2Z" opacity=".5"></path></g></svg>`);function Tf(e,t){let n=ua(t,Cf);var r=wf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Ef=new Set([`$$slots`,`$$events`,`$$legacy`]),Df=Br(`<svg><path fill="currentColor" d="M10.847 21.934C5.867 21.362 2 17.133 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10c0 5.157-3.283 4.733-6.086 4.37c-1.618-.209-3.075-.397-3.652.518c-.395.626.032 1.406.555 1.929a1.673 1.673 0 0 1 0 2.366c-.523.523-1.235.836-1.97.751" opacity=".5"></path><path fill="currentColor" d="M11.085 7a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M6.5 13a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m11 0a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m-3-4.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path></svg>`);function Of(e,t){let n=ua(t,Ef);var r=Df();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var kf=new Set([`$$slots`,`$$events`,`$$legacy`]),Af=Br(`<svg><g fill="currentColor"><path d="M20.8487 8.71306C22.3844 7.17735 22.3844 4.68748 20.8487 3.15178C19.313 1.61607 16.8231 1.61607 15.2874 3.15178L14.4004 4.03882C14.4125 4.0755 14.4251 4.11268 14.4382 4.15035C14.7633 5.0875 15.3768 6.31601 16.5308 7.47002C17.6848 8.62403 18.9133 9.23749 19.8505 9.56262C19.888 9.57563 19.925 9.58817 19.9615 9.60026L20.8487 8.71306Z" opacity=".5"></path><path d="M14.4386 4L14.4004 4.03819C14.4125 4.07487 14.4251 4.11206 14.4382 4.14973C14.7633 5.08687 15.3768 6.31538 16.5308 7.4694C17.6848 8.62341 18.9133 9.23686 19.8505 9.56199C19.8876 9.57489 19.9243 9.58733 19.9606 9.59933L11.4001 18.1598C10.823 18.7369 10.5343 19.0255 10.2162 19.2737C9.84082 19.5665 9.43469 19.8175 9.00498 20.0223C8.6407 20.1959 8.25351 20.3249 7.47918 20.583L3.39584 21.9442C3.01478 22.0712 2.59466 21.972 2.31063 21.688C2.0266 21.4039 1.92743 20.9838 2.05445 20.6028L3.41556 16.5194C3.67368 15.7451 3.80273 15.3579 3.97634 14.9936C4.18114 14.5639 4.43213 14.1578 4.7249 13.7824C4.97307 13.4643 5.26165 13.1757 5.83874 12.5986L14.4386 4Z"></path></g></svg>`);function jf(e,t){let n=ua(t,kf);var r=Af();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Mf=new Set([`$$slots`,`$$events`,`$$legacy`]),Nf=Br(`<svg><path fill="currentColor" fill-rule="evenodd" d="M5.796 18.204L21.512 2.488c-.988-.989-2.86-.364-6.606.884l-9.331 3.11c-2.082.694-3.123 1.041-3.439 1.804q-.112.271-.133.564c-.059.824.717 1.6 2.269 3.151l.283.283c.254.254.382.382.478.523c.19.28.297.607.31.945c.008.171-.019.35-.072.705c-.196 1.304-.294 1.956-.179 2.458c.114.495.362.938.704 1.289" clip-rule="evenodd"></path><path fill="currentColor" d="m17.498 18.486l3.13-9.392c1.25-3.745 1.873-5.617.885-6.606L5.797 18.204c.348.356.794.617 1.296.74c.5.122 1.153.033 2.46-.144l.071-.01c.369-.05.553-.075.73-.064c.32.02.63.124.898.303c.147.099.278.23.541.493l.251.251c1.51 1.51 2.266 2.265 3.067 2.226c.22-.01.438-.062.64-.151c.734-.323 1.072-1.336 1.747-3.362" opacity=".5"></path></svg>`);function Pf(e,t){let n=ua(t,Mf);var r=Nf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Ff=new Set([`$$slots`,`$$events`,`$$legacy`]),If=Br(`<svg><g fill="currentColor"><path d="M11.625 15.75V12.8857C11.625 12.0189 12.0097 11.2908 12.5039 10.7188C12.9952 10.1501 13.6277 9.69535 14.2227 9.34961C15.2924 8.72801 16 7.5898 16 6.29688C16 4.35067 14.3898 2.75 12.375 2.75C10.3602 2.75002 8.75002 4.35068 8.75 6.29688C8.75 6.71109 8.41421 7.04688 8 7.04688C7.58579 7.04688 7.25 6.71109 7.25 6.29688C7.25002 3.49689 9.55734 1.25002 12.375 1.25C15.1927 1.25 17.5 3.49688 17.5 6.29688C17.5 8.15476 16.4813 9.7721 14.9766 10.6465C14.4625 10.9452 13.9823 11.3015 13.6387 11.6992C13.2981 12.0935 13.125 12.4871 13.125 12.8857V15.75C13.125 16.1642 12.7892 16.5 12.375 16.5C11.9608 16.5 11.625 16.1642 11.625 15.75Z" opacity=".5"></path><path d="M12 21.25C12.4142 21.25 12.75 21.5858 12.75 22C12.75 22.4142 12.4142 22.75 12 22.75C11.5858 22.75 11.25 22.4142 11.25 22C11.25 21.5858 11.5858 21.25 12 21.25Z"></path></g></svg>`);function Lf(e,t){let n=ua(t,Ff);var r=If();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Rf=new Set([`$$slots`,`$$events`,`$$legacy`]),zf=Br(`<svg><g fill="currentColor"><path d="M12.0789 2.25C7.2854 2.25 3.34478 5.913 2.96055 10.5833H2.00002C1.69614 10.5833 1.42229 10.7667 1.30655 11.0477C1.19081 11.3287 1.25606 11.6517 1.47178 11.8657L3.15159 13.5324C3.444 13.8225 3.91567 13.8225 4.20808 13.5324L5.88789 11.8657C6.10361 11.6517 6.16886 11.3287 6.05312 11.0477C5.93738 10.7667 5.66353 10.5833 5.35965 10.5833H4.4668C4.84652 6.75167 8.10479 3.75 12.0789 3.75C14.8484 3.75 17.2727 5.20845 18.6156 7.39279C18.8325 7.74565 19.2944 7.85585 19.6473 7.63892C20.0002 7.42199 20.1104 6.96007 19.8934 6.60721C18.2871 3.99427 15.3873 2.25 12.0789 2.25Z"></path><path d="M20.8412 10.4666C20.5491 10.1778 20.0789 10.1778 19.7868 10.4666L18.1005 12.1333C17.8842 12.3471 17.8185 12.6703 17.934 12.9517C18.0496 13.233 18.3236 13.4167 18.6278 13.4167H19.5269C19.1456 17.2462 15.876 20.25 11.8828 20.25C9.10034 20.25 6.66595 18.7903 5.31804 16.6061C5.10051 16.2536 4.63841 16.1442 4.28591 16.3618C3.93342 16.5793 3.82401 17.0414 4.04154 17.3939C5.65416 20.007 8.56414 21.75 11.8828 21.75C16.6907 21.75 20.6476 18.0892 21.0332 13.4167H22.0002C22.3044 13.4167 22.5784 13.233 22.694 12.9517C22.8096 12.6703 22.7438 12.3471 22.5275 12.1333L20.8412 10.4666Z" opacity=".5"></path></g></svg>`);function Bf(e,t){let n=ua(t,Rf);var r=zf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Vf=new Set([`$$slots`,`$$events`,`$$legacy`]),Hf=Br(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M15.5023 14.3674L20.5319 9.35289C21.2563 8.63072 21.6185 8.26963 21.8092 7.81046C22 7.3513 22 6.84065 22 5.81937V5.33146C22 3.76099 22 2.97576 21.5106 2.48788C21.0213 2 20.2337 2 18.6585 2H18.1691C17.1447 2 16.6325 2 16.172 2.19019C15.7114 2.38039 15.3493 2.74147 14.6249 3.46364L9.59522 8.47817C8.74882 9.32202 8.224 9.84526 8.02078 10.3506C7.95657 10.5103 7.92446 10.6682 7.92446 10.8339C7.92446 11.5238 8.48138 12.0791 9.59522 13.1896L9.74492 13.3388L11.4985 11.5591C11.7486 11.3053 12.1571 11.3022 12.4109 11.5523C12.6647 11.8024 12.6678 12.2109 12.4177 12.4647L10.6587 14.2499L10.7766 14.3674C11.8905 15.4779 12.4474 16.0331 13.1394 16.0331C13.2924 16.0331 13.4387 16.006 13.5858 15.9518C14.1048 15.7607 14.6345 15.2325 15.5023 14.3674ZM17.8652 8.47854C17.2127 9.12904 16.1548 9.12904 15.5024 8.47854C14.8499 7.82803 14.8499 6.77335 15.5024 6.12284C16.1548 5.47233 17.2127 5.47233 17.8652 6.12284C18.5177 6.77335 18.5177 7.82803 17.8652 8.47854Z" clip-rule="evenodd"></path><path fill-rule="evenodd" d="M2.77409 12.4814C3.07033 12.778 3.07004 13.2586 2.77343 13.5548L2.61779 13.7103C2.48483 13.8431 2.48483 14.058 2.61779 14.1908C2.75125 14.3241 2.96801 14.3241 3.10147 14.1908L4.8136 12.4807C5.1102 12.1845 5.59079 12.1848 5.88704 12.4814C6.18328 12.778 6.18298 13.2586 5.88638 13.5548L4.17426 15.2648C3.4481 15.9901 2.27116 15.9901 1.545 15.2648C0.818334 14.5391 0.818333 13.362 1.545 12.6362L1.70065 12.4807C1.99725 12.1845 2.47784 12.1848 2.77409 12.4814ZM7.29719 16.696C7.5903 16.9957 7.58495 17.4762 7.28525 17.7693L5.55508 19.4614C5.25538 19.7545 4.77481 19.7491 4.48171 19.4494C4.1886 19.1497 4.19395 18.6692 4.49365 18.3761L6.22382 16.684C6.52352 16.3909 7.00409 16.3963 7.29719 16.696ZM11.4811 18.118C11.7774 18.4146 11.7771 18.8952 11.4805 19.1915L9.76834 20.9015C9.63539 21.0343 9.63539 21.2492 9.76834 21.382C9.9018 21.5153 10.1186 21.5153 10.252 21.382L10.4077 21.2265C10.7043 20.9303 11.1849 20.9306 11.4811 21.2272C11.7774 21.5238 11.7771 22.0044 11.4805 22.3006L11.3248 22.4561C10.5987 23.1813 9.42171 23.1813 8.69556 22.4561C7.96889 21.7303 7.96889 20.5532 8.69556 19.8274L10.4077 18.1174C10.7043 17.8211 11.1849 17.8214 11.4811 18.118Z" clip-rule="evenodd"></path><g opacity=".5"><path d="M9.42154 16.2958C9.71796 15.9993 10.1984 15.9993 10.4948 16.2958C10.7912 16.5922 10.7912 17.0726 10.4948 17.369L8.36685 19.4969C8.07041 19.793 7.58991 19.7932 7.29361 19.4969C6.99718 19.2005 6.99718 18.7191 7.29361 18.4227L9.42154 16.2958Z"></path><path d="M18.5807 13.12C19.0406 13.8436 19.2824 14.2873 19.3522 14.7557C19.4282 15.2672 19.3599 15.798 19.1549 16.2889C18.9225 16.8456 17.766 17.9991 16.8024 18.9598L16.7301 19.0321C16.4313 19.33 15.9163 19.2272 15.7614 18.8387C15.5712 18.3616 15.4767 18.1226 15.3542 17.8993C15.2453 17.7009 15.1198 17.512 14.9801 17.3338C14.8744 17.1989 14.7578 17.0722 14.5817 16.8934C14.8285 16.7424 15.0522 16.5659 15.2565 16.3895C15.5975 16.095 15.9742 15.7184 16.3854 15.3084L18.5807 13.12Z"></path><path d="M6.61196 13.4901C6.90839 13.1937 7.38976 13.1937 7.68618 13.4901C7.98225 13.7865 7.98242 14.267 7.68618 14.5633L5.54361 16.7059C5.24729 17.0021 4.76678 17.002 4.47036 16.7059C4.17394 16.4095 4.17394 15.9281 4.47036 15.6317L6.61196 13.4901Z"></path><path d="M7.66763 4.83579C8.15998 4.63158 8.6918 4.5637 9.20474 4.6395C9.67474 4.70898 10.1193 4.95036 10.8454 5.40904L8.65786 7.59068C8.25586 7.99145 7.8866 8.35891 7.59536 8.69126C7.40837 8.90468 7.22144 9.13827 7.06314 9.39634L7.04165 9.37583C7.00119 9.3355 6.98091 9.31449 6.9606 9.29478C6.58043 8.92601 6.13343 8.63249 5.64321 8.43052C5.61701 8.41972 5.58996 8.40961 5.53677 8.38853L5.21157 8.25962C4.77033 8.08478 4.65225 7.51625 4.98794 7.1815C5.95158 6.22078 7.10926 5.06747 7.66763 4.83579Z"></path></g></g></svg>`);function Uf(e,t){let n=ua(t,Vf);var r=Hf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Wf=new Set([`$$slots`,`$$events`,`$$legacy`]),Gf=Br(`<svg><g fill="currentColor"><g opacity=".5"><path d="M19.9551 12.7237C21.3183 14.0869 22 14.7691 22 15.6162C21.9997 16.4632 21.3184 17.1455 19.9551 18.5088L18.5088 19.9551C17.1455 21.3184 16.4632 21.9998 15.6162 22C14.7691 22 14.0869 21.3184 12.7236 19.9551L11.1641 18.3955C11.2372 18.3226 11.3159 18.2447 11.4004 18.1602L18.3955 11.1641L19.9551 12.7237Z"></path><path d="M8.38379 2.00002C9.23091 2.00002 9.9131 2.68168 11.2764 4.04494L12.835 5.60354L5.83887 12.5987C5.75439 12.6831 5.67641 12.7619 5.60352 12.835L4.04492 11.2764C2.68165 9.91312 2 9.23094 2 8.38381C2.00025 7.53681 2.6816 6.85456 4.04492 5.49123L5.49121 4.04494C6.85454 2.68162 7.53679 2.00028 8.38379 2.00002Z"></path><path d="M15.2871 3.15139C16.8227 1.61581 19.3129 1.61594 20.8486 3.15139C22.3843 4.68708 22.3843 7.17721 20.8486 8.71291L19.9619 9.60061C19.9254 9.58852 19.8881 9.57552 19.8506 9.56252C18.9135 9.2374 17.6852 8.62371 16.5312 7.46975C15.3773 6.31578 14.7636 5.08754 14.4385 4.15041C14.4254 4.11282 14.4125 4.07569 14.4004 4.03909L15.2871 3.15139Z"></path></g><path d="M14.4383 4.1499C14.7634 5.08701 15.3771 6.31532 16.531 7.46924C17.685 8.62316 18.9133 9.23689 19.8504 9.56201C19.8875 9.57489 19.9245 9.58714 19.9607 9.59912L11.4002 18.1597C10.823 18.7368 10.5338 19.0258 10.2156 19.2739C9.84035 19.5666 9.43424 19.8172 9.00466 20.022C8.6404 20.1956 8.2535 20.3254 7.47927 20.5835L3.39528 21.9438C3.01428 22.0708 2.5943 21.972 2.31032 21.688C2.02636 21.404 1.92753 20.984 2.05446 20.603L3.41579 16.519C3.6738 15.745 3.80276 15.3579 3.97634 14.9937C4.18107 14.5641 4.43174 14.158 4.72438 13.7827C4.97255 13.4645 5.26155 13.1752 5.83864 12.5981L14.4002 4.03857C14.4123 4.07514 14.4252 4.11235 14.4383 4.1499Z"></path><path d="M20.1082 12.8774C20.5239 13.2935 20.8715 13.644 21.1502 13.9565L19.9998 15.1069C19.7069 15.3997 19.2321 15.3997 18.9392 15.1069C18.6464 14.8141 18.6464 14.3393 18.9392 14.0464L20.1082 12.8774Z"></path><path d="M9.7654 2.61279C10.0842 2.87146 10.4393 3.21184 10.865 3.63428L9.49977 4.99951C9.20688 5.2924 8.73212 5.2924 8.43923 4.99951C8.14651 4.7066 8.14639 4.2318 8.43923 3.93896L9.7654 2.61279Z"></path></g></svg>`);function Kf(e,t){let n=ua(t,Wf);var r=Gf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var qf=new Set([`$$slots`,`$$events`,`$$legacy`]),Jf=Br(`<svg><g fill="currentColor"><path d="M17 3.25C17.4142 3.25 17.75 3.58579 17.75 4V17.75L19.4004 15.5498C19.649 15.2187 20.1189 15.1519 20.4502 15.4004C20.7813 15.649 20.8481 16.1189 20.5996 16.4502L17.5996 20.4502C17.4059 20.7082 17.0688 20.814 16.7627 20.7119C16.4564 20.6098 16.25 20.3228 16.25 20V4C16.25 3.58579 16.5858 3.25 17 3.25Z"></path><path d="M13 15.25C13.4142 15.25 13.75 15.5858 13.75 16C13.75 16.4142 13.4142 16.75 13 16.75H4C3.58579 16.75 3.25 16.4142 3.25 16C3.25 15.5858 3.58579 15.25 4 15.25H13Z"></path><g opacity=".5"><path d="M13 10.25C13.4142 10.25 13.75 10.5858 13.75 11C13.75 11.4142 13.4142 11.75 13 11.75H6C5.58579 11.75 5.25 11.4142 5.25 11C5.25 10.5858 5.58579 10.25 6 10.25H13Z"></path><path d="M13 5.25C13.4142 5.25 13.75 5.58579 13.75 6C13.75 6.41421 13.4142 6.75 13 6.75H8C7.58579 6.75 7.25 6.41421 7.25 6C7.25 5.58579 7.58579 5.25 8 5.25H13Z"></path></g></g></svg>`);function Yf(e,t){let n=ua(t,qf);var r=Jf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var Xf=new Set([`$$slots`,`$$events`,`$$legacy`]),Zf=Br(`<svg><g fill="currentColor"><path d="M7.45284 2.71266C7.8276 1.76244 9.1724 1.76245 9.54716 2.71267L10.7085 5.65732C10.8229 5.94743 11.0526 6.17707 11.3427 6.29148L14.2873 7.45284C15.2376 7.8276 15.2376 9.1724 14.2873 9.54716L11.3427 10.7085C11.0526 10.8229 10.8229 11.0526 10.7085 11.3427L9.54716 14.2873C9.1724 15.2376 7.8276 15.2376 7.45284 14.2873L6.29148 11.3427C6.17707 11.0526 5.94743 10.8229 5.65732 10.7085L2.71266 9.54716C1.76244 9.1724 1.76245 7.8276 2.71267 7.45284L5.65732 6.29148C5.94743 6.17707 6.17707 5.94743 6.29148 5.65732L7.45284 2.71266Z"></path><path d="M16.9245 13.3916C17.1305 12.8695 17.8695 12.8695 18.0755 13.3916L18.9761 15.6753C19.039 15.8348 19.1652 15.961 19.3247 16.0239L21.6084 16.9245C22.1305 17.1305 22.1305 17.8695 21.6084 18.0755L19.3247 18.9761C19.1652 19.039 19.039 19.1652 18.9761 19.3247L18.0755 21.6084C17.8695 22.1305 17.1305 22.1305 16.9245 21.6084L16.0239 19.3247C15.961 19.1652 15.8348 19.039 15.6753 18.9761L13.3916 18.0755C12.8695 17.8695 12.8695 17.1305 13.3916 16.9245L15.6753 16.0239C15.8348 15.961 15.961 15.8348 16.0239 15.6753L16.9245 13.3916Z" opacity=".5"></path></g></svg>`);function Qf(e,t){let n=ua(t,Xf);var r=Zf();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var $f=new Set([`$$slots`,`$$events`,`$$legacy`]),ep=Br(`<svg><g fill="currentColor"><g opacity=".5"><path d="M16 14C18.7614 14 21 15.3431 21 17C21 18.6569 18.7614 20 16 20C13.2386 20 11 18.6569 11 17C11 15.3431 13.2386 14 16 14Z"></path><path d="M15 3C16.6569 3 18 4.34315 18 6C18 7.65685 16.6569 9 15 9C13.3431 9 12 7.65685 12 6C12 4.34315 13.3431 3 15 3Z"></path></g><path d="M9.00098 13.001C12.867 13.001 16.001 14.7918 16.001 17.001C16.001 19.2101 12.867 21.001 9.00098 21.001C5.13498 21.001 2.00098 19.2101 2.00098 17.001C2.00098 14.7918 5.13498 13.001 9.00098 13.001Z"></path><path d="M9.00098 2C11.2101 2 13.001 3.79086 13.001 6C13.001 8.20914 11.2101 10 9.00098 10C6.79184 10 5.00098 8.20914 5.00098 6C5.00098 3.79086 6.79184 2 9.00098 2Z"></path></g></svg>`);function tp(e,t){let n=ua(t,$f);var r=ep();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var np=new Set([`$$slots`,`$$events`,`$$legacy`]),rp=Br(`<svg><g fill="currentColor"><path d="M6.5 13C8.62132 13 9.68181 13.0002 10.3408 13.6592C10.9998 14.3182 11 15.3787 11 17.5C11 19.6213 10.9998 20.6818 10.3408 21.3408C9.68181 21.9998 8.62132 22 6.5 22C4.37868 22 3.31819 21.9998 2.65918 21.3408C2.00017 20.6818 2 19.6213 2 17.5C2 15.3787 2.00017 14.3182 2.65918 13.6592C3.31819 13.0002 4.37868 13 6.5 13Z"></path><path d="M6.63379 2C9.19304 2 11.2684 4.07458 11.2686 6.63379C11.2686 9.19316 9.19316 11.2686 6.63379 11.2686C4.07458 11.2684 2 9.19304 2 6.63379C2.00019 4.0747 4.0747 2.00019 6.63379 2Z"></path><g opacity=".5"><path d="M17.3662 12.7314C19.9256 12.7314 22.001 14.8068 22.001 17.3662C22.0008 19.9254 19.9255 22 17.3662 22C14.8071 21.9998 12.7326 19.9253 12.7324 17.3662C12.7324 14.807 14.807 12.7316 17.3662 12.7314Z"></path><path d="M17.5 2C19.6213 2 20.6818 2.00017 21.3408 2.65918C21.9998 3.31819 22 4.37868 22 6.5C22 8.62132 21.9998 9.68181 21.3408 10.3408C20.6818 10.9998 19.6213 11 17.5 11C15.3787 11 14.3182 10.9998 13.6592 10.3408C13.0002 9.68181 13 8.62132 13 6.5C13 4.37868 13.0002 3.31819 13.6592 2.65918C14.3182 2.00017 15.3787 2 17.5 2Z"></path></g></g></svg>`);function ip(e,t){let n=ua(t,np);var r=rp();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var ap=new Set([`$$slots`,`$$events`,`$$legacy`]),op=Br(`<svg><g fill="currentColor"><path d="M2.02639 9.5V8.75C2.10074 6.11064 2.38461 4.5451 3.46486 3.46484C4.92933 2.00041 7.28601 2 12 2C16.714 2 19.0707 2.00038 20.5352 3.46484C21.6154 4.5451 21.8993 6.11066 21.9737 8.75L22 9.5H9.00002V22L8.25002 21.9561C5.90966 21.8589 4.47508 21.5454 3.46486 20.5352C2.00041 19.0707 2.00002 16.714 2.00002 12C2.00002 11.3766 1.99956 10.7944 2.00295 10.25L2.02639 9.5Z" opacity=".5"></path><path d="M2 12C2 16.714 2 19.0711 3.46447 20.5355C4.47468 21.5458 5.90962 21.8591 8.25 21.9563L9 22V10.25V9.5H2.02645L2.00339 10.25C2 10.7944 2 11.3766 2 12Z" opacity=".5"></path><path d="M21.9971 10.25C22.0005 10.7944 22 11.3766 22 12C22 16.714 21.9996 19.0707 20.5352 20.5352C19.0707 21.9996 16.714 22 12 22C11.1815 22 9.68405 21.9999 9 21.9922V9.5H22L21.9971 10.25Z"></path><path d="M6 5C6.55228 5 7 5.44772 7 6C7 6.55228 6.55228 7 6 7C5.44772 7 5 6.55228 5 6C5 5.44772 5.44772 5 6 5Z"></path><path d="M9 5C9.55228 5 10 5.44772 10 6C10 6.55228 9.55228 7 9 7C8.44772 7 8 6.55228 8 6C8 5.44772 8.44772 5 9 5Z"></path><path d="M12 5C12.5523 5 13 5.44772 13 6C13 6.55228 12.5523 7 12 7C11.4477 7 11 6.55228 11 6C11 5.44772 11.4477 5 12 5Z"></path></g></svg>`);function sp(e,t){let n=ua(t,ap);var r=op();Qi(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),U(e,r)}var cp=new Set([`$$slots`,`$$events`,`$$legacy`]),lp=Br(`<svg><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>`);function up(e,t){let n=ua(t,cp);var r=lp();Qi(r,()=>({"aria-hidden":`true`,fill:`none`,height:`1.2em`,viewBox:`0 0 24 24`,width:`1.2em`,xmlns:`http://www.w3.org/2000/svg`,...n})),U(e,r)}var dp=H(`<li class="row bones svelte-nejrkp"><!> <!></li>`),fp=H(`<span class="reason svelte-nejrkp" data-slot="suggestion-reason"> </span>`),pp=H(`<li class="svelte-nejrkp"><button class="row svelte-nejrkp" data-slot="suggestion" type="button"><span class="words svelte-nejrkp"><span class="text svelte-nejrkp" data-slot="suggestion-text"> </span> <!></span> <span aria-hidden="true" class="mark svelte-nejrkp"><span class="pencil svelte-nejrkp" data-pencil=""><!></span> <span class="check svelte-nejrkp" data-check=""><!></span></span></button></li>`),mp=H(`<li class="svelte-nejrkp"><button class="row more svelte-nejrkp" type="button"><span class="text svelte-nejrkp"> </span></button></li>`),hp=H(`<!> <!>`,1),gp=H(`<div aria-labelledby="ledger-kicker" class="set svelte-nejrkp" role="group"><div class="kicker svelte-nejrkp"><span id="ledger-kicker"> </span> <button aria-label="Refresh" class="refresh svelte-nejrkp" type="button"><!></button></div> <ul class="rows svelte-nejrkp"><!></ul></div>`),_p=H(`<div class="ledger svelte-nejrkp" data-direction="ledger"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function vp(e,t){Ue(t,!0);let n=e=>{var n=Vr(),r=un(n),i=e=>{var n=gp(),r=I(n),i=I(r),a=dn(i,!0),c=L(i,2);Bf(I(c),{"aria-hidden":`true`,class:`glyph`}),j(c),j(r);var l=L(r,2),h=I(l),_=e=>{var n=Vr();ii(un(n),16,()=>t.draws.loading?[0,1,2]:V(d).map((e,t)=>t),e=>e,(e,t)=>{var n=dp(),r=I(n);Gd(r,{class:`bone`,line:`body`,radius:`line`,get style(){return`inline-size: ${m[t%3]??``}`}}),Gd(L(r,2),{class:`bone`,line:`meta`,radius:`line`,style:`inline-size: var(--ledger-bone-reason)`}),j(n),U(e,n)}),U(e,n)},v=e=>{var n=hp(),r=un(n);ii(r,19,()=>V(d),(e,t)=>`${t}:${e.text}`,(e,n,r)=>{var i=pp(),a=I(i),s=I(a),c=I(s),l=dn(c,!0),u=L(c,2),d=e=>{var t=fp(),i=dn(t,!0);R(()=>{G(t,`id`,`ledger-reason-${V(r)??``}`),qr(i,V(n).reason)}),U(e,t)};W(u,e=>{V(n).reason&&e(d)}),j(s);var f=L(s,2),p=I(f);jf(I(p),{class:`glyph`}),j(p);var m=L(p,2);up(I(m),{class:`glyph`}),j(m),j(f),j(a),j(i),R(()=>{G(a,`aria-describedby`,V(n).reason?`ledger-reason-${V(r)}`:void 0),G(a,`data-held`,V(r)===0?t.draws.held:void 0),qr(l,V(n).text),G(p,`data-hidden`,V(o)===V(r)||void 0),G(m,`data-shown`,V(o)===V(r)||void 0)}),Ar(`click`,a,e=>g(V(r),e.currentTarget)),U(e,i)});var i=L(r,2),a=e=>{var t=mp(),n=I(t),r=dn(I(n));j(n),j(t),R(()=>qr(r,`${V(f)??``} more`)),Ar(`click`,n,()=>F(s,!0)),U(e,t)};W(i,e=>{V(f)>0&&e(a)}),U(e,n)};W(h,e=>{V(u)?e(_):e(v,-1)}),j(l),j(n),Si(n,Fo),R(()=>{G(n,`data-faded`,V(p)||void 0),qr(a,V(u)?`Caw is writing suggestions`:`Caw suggests · ${t.draws.items.length}`)}),U(e,n)};W(r,e=>{(t.draws.items.length>0||t.draws.loading)&&e(i)}),U(e,n)},r=e=>{{let n=M(()=>t.where===`keyboard`);Uo(e,{get focused(){return V(n)},get field(){return V(l)},set field(e){F(l,e,!0)},get value(){return V(a)},set value(e){F(a,e,!0)}})}},i=M(()=>t.draws.items[0]?.text??``),a=P(Qt(t.draws.phase===`filled`?V(i):t.draws.phase===`typing`?Bo(V(i)):``)),o=P(Qt(t.draws.phase===`filled`?0:null)),s=P(Qt(t.draws.expanded)),c=P(``),l=P(void 0),u=M(()=>t.draws.loading||t.draws.phase===`refresh`),d=M(()=>V(s)?t.draws.items:t.draws.items.slice(0,4)),f=M(()=>t.draws.items.length-V(d).length),p=M(()=>V(a)!==``&&!t.draws.items.some(e=>e.text===V(a))),m=[`var(--ledger-bone-1)`,`var(--ledger-bone-2)`,`var(--ledger-bone-3)`];function h(e,t){let n=e.querySelector(`[data-pencil]`),r=e.querySelector(`[data-check]`);if(!(n&&r))return Promise.resolve();let i={duration:Qa(`--dur-control`),easing:$a(`--ease-out`),fill:`forwards`},[a,o]=t?[n,r]:[r,n],s=Number.parseFloat(getComputedStyle(a).opacity),c=Number.parseFloat(getComputedStyle(e).getPropertyValue(t?`--ledger-check-ink`:e.closest(`[data-touch]`)?`--ledger-pencil-touch`:`--ledger-pencil-rest`)),l=Ga.current?{opacity:0,scale:.25,filter:`blur(4px)`}:{opacity:0},u=Ga.current?{scale:1,filter:`blur(0px)`}:{},d=[a.animate([{opacity:s,...u},l],i),o.animate([l,{opacity:c,...u}],i)];return Ro(d).then(()=>{for(let e of d)e.cancel()})}async function g(e,n){let r=t.draws.items[e]?.text??``;Vo(V(l),r),F(a,r,!0),F(c,zo,!0),await h(n,!0),F(o,e,!0),await new Promise(e=>setTimeout(e,Number.parseFloat(getComputedStyle(n).getPropertyValue(`--ledger-check-hold`)))),await h(n,!1),F(o,null)}var _=_p(),v=I(_);Ko(v,{get foot(){return r},get set(){return n},get where(){return t.where}});var y=dn(L(v,2),!0);j(_),R(()=>{G(_,`data-touch`,t.draws.touch||void 0),G(_,`data-where`,t.where),qr(y,V(c))}),U(e,_),We()}jr([`click`]);var yp={brief:pf,bug:Zd,calendar:ef,draft:jf,explore:yf,grill:Lf,ideas:Qf,mail:Pf,palette:Of,people:tp,refresh:Bf,reply:rf,rocket:Uf,routine:uf,screen:sp,search:Sf,site:gf,stages:ip,system:Kf,tasks:sf,triage:Yf,voice:Tf},bp=Bd({base:`inline-flex items-center rounded-sm text-ink-strong type-label mark-line`,variants:{variant:{option:`group/option touch-hit min-h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-3 py-space-1 text-start hit-edge-hair enabled:not-aria-pressed:not-aria-checked:not-data-chosen:hover:bg-surface-hover aria-checked:border-brand-solid aria-checked:bg-surface-recess aria-pressed:border-brand-solid aria-pressed:bg-surface-recess data-chosen:border-brand-solid data-chosen:bg-surface-recess motion-safe:transition-[border-color,background-color] motion-safe:duration-(--dur-control) motion-safe:ease-out`,tray:`pointer-events-auto touch-hit relative isolate h-c-tray-chip touch-manipulation gap-c-pill-gap border-0 bg-transparent px-space-2 transition-[color] duration-(--dur-control) ease-out select-none [--tray-chip-fill:var(--surface-raised)] touch-callout-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-(color:--tray-chip-fill) before:shadow-tile before:transition-[background-color] before:duration-(--dur-control) before:ease-out motion-safe:transition-[color,transform] motion-safe:active:[transform:scale(var(--press-scale))] can-hover:hover:[--tray-chip-fill:var(--surface-hover)] *:[svg]:size-icon-md *:[svg]:flex-none`,inline:`-my-c-inline-chip-pad max-w-full gap-space-1 rounded-[calc(var(--radius-xs)+var(--c-inline-chip-pad))] bg-surface-recess py-c-inline-chip-pad ps-c-inline-chip-pad pe-space-2 align-baseline leading-c-inline-chip-line whitespace-nowrap inset-ring inset-ring-border-hairline *:data-[slot=label]:max-w-c-inline-chip-max-w *:data-[slot=label]:min-w-0 *:data-[slot=label]:self-baseline *:data-[slot=label]:overflow-clip *:data-[slot=label]:text-ellipsis motion-safe:transition-[background-color,transform] motion-safe:duration-(--dur-control) motion-safe:ease-out motion-safe:enabled:active:[transform:scale(var(--press-scale))] can-hover:enabled:hover:bg-surface-hover *:[svg]:size-icon-md *:[svg]:flex-none`,setting:`touch-hit h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-2 leading-none whitespace-nowrap hit-edge-hair transition-control aria-disabled:opacity-50 *:data-[slot=chevron]:size-icon-sm *:data-[slot=chevron]:text-ink-subtle **:data-[slot=chip-label]:min-w-0 **:data-[slot=chip-label]:overflow-hidden **:data-[slot=chip-label]:text-ellipsis motion-safe:transition-control-press can-hover:enabled:not-variant-static:hover:bg-surface-hover motion-safe:enabled:not-aria-busy:pressed:[transform:scale(var(--press-scale))] variant-static:border-border-hairline variant-static:bg-surface-recess *:[svg]:flex-none *:[svg]:not-data-[slot=chevron]:size-icon-md`},size:{regular:``,compact:`h-(--row-compact-h) gap-space-1 max-phone:h-c-btn-h-lg max-phone:not-data-account-chip:*:data-[slot=chevron]:hidden`},tone:{muted:``,fail:``,grant:``}},compoundVariants:[{variant:`setting`,tone:`muted`,class:`text-ink-muted`},{variant:`setting`,tone:`fail`,class:`border-status-fail-ink text-status-fail-ink`},{variant:`setting`,tone:`grant`,class:`border-status-attn-ink bg-status-attn-bg text-status-attn-ink *:data-[slot=chevron]:text-status-attn-ink can-hover:enabled:not-variant-static:hover:bg-status-attn-bg variant-static:border-status-attn-ink variant-static:bg-status-attn-bg`}],defaultVariants:{variant:`option`}}),xp=Bd({base:`flex flex-wrap gap-space-2 hit-gap-x-space-2 hit-gap-y-space-2 coarse:gap-y-space-4 coarse:hit-gap-y-space-4`}),Sp=(e,t=f,n=f)=>{var r=Vr(),i=un(r),a=e=>{Gd(e,{class:`w-c-measure-meta max-w-full`,get line(){return n()},radius:`line`})},o=e=>{Gd(e,{class:`w-3/4`,get line(){return n()},radius:`line`})},s=e=>{Gd(e,{class:`w-2/3`,get line(){return n()},radius:`line`})};W(i,e=>{t()%3==0?e(a):t()%3==1?e(o,1):e(s,-1)}),U(e,r)},Cp=H(`<span class="grid place-items-center"><!></span>`),wp=H(`<li><!> <!></li>`),Tp=H(`<span class="mark-cell"><!></span>`),Ep=H(`<li class="not-last:border-b not-last:border-border-hairline"><button data-slot="suggestion" type="button"><!> <span data-slot="suggestion-text" class="min-w-0 text-pretty wrap-anywhere"> </span></button></li>`),Dp=H(`<ul class="m-0 flex list-none flex-col p-0"><!></ul>`),Op=H(`<span class="mark-cell type-label"><!></span>`),kp=H(`<span class="flex"><!></span>`),Ap=H(`<span class="hidden @max-suggestion-rows-narrow:flex"><!></span>`),jp=H(`<li><!> <span class="flex min-w-0 flex-col gap-space-1"><!> <span class="flex flex-col group-data-[placement=composer]/suggestions:hidden"><!> <span class="contents group-data-[placement=panel]/suggestions:hidden"><!></span></span></span></li>`),Mp=H(`<span data-slot="suggestion-reason" class="type-meta text-pretty wrap-anywhere text-ink-muted group-data-[placement=composer]/suggestions:hidden"> </span>`),Np=H(`<li><button data-slot="suggestion" type="button"><!> <span class="flex min-w-0 flex-col gap-space-1" data-box=""><span data-slot="suggestion-text" class="type-label text-pretty wrap-anywhere"> </span> <!></span></button></li>`),Pp=H(`<ul class="m-0 flex list-none flex-col gap-space-2 p-0"><!></ul>`),Fp=H(`<li><!></li>`),Ip=H(`<li><button data-slot="suggestion" type="button"><!> <span data-slot="suggestion-text" class="min-w-0 text-pretty wrap-anywhere"> </span></button></li>`),Lp=H(`<ul><!></ul>`),Rp=H(`<div data-slot="suggestions" class="group/suggestions @container w-full min-w-0 data-[placement=panel]:max-w-c-starters-w"><!></div>`);function zp(e,t){Ue(t,!0);let n=da(t,`look`,3,`list`),r=da(t,`placement`,3,`thread`),i=da(t,`loading`,3,0),a=M(()=>i()>0),o=M(()=>Array.from({length:i()},(e,t)=>t)),s=M(()=>r()!==`panel`),c=e=>V(s)&&e.glyph?yp[e.glyph]:null;var l=Rp(),u=I(l),d=e=>{var n=Dp(),r=I(n),i=e=>{var t=Vr();ii(un(t),16,()=>V(o),e=>e,(e,t)=>{var n=wp(),r=I(n),i=e=>{var t=Cp();Gd(I(t),{cell:`glyph`,radius:`text`}),j(t),U(e,t)};W(r,e=>{V(s)&&e(i)}),Sp(L(r,2),()=>t,()=>`body`),j(n),R(()=>ji(n,1,Ti([`grid min-h-c-row-h content-center items-center gap-x-space-1 not-last:border-b not-last:border-border-hairline`,V(s)?`grid-cols-lead-fluid pe-space-3`:`grid-cols-1 px-space-3`]))),U(e,n)}),U(e,t)},l=e=>{var n=Vr();ii(un(n),19,()=>t.suggestions,(e,t)=>`${t}:${e.text}`,(e,n)=>{let r=M(()=>c(V(n)));var i=Ep(),a=I(i),o=I(a),l=e=>{var t=Tp(),n=I(t),i=e=>{var t=Vr();di(un(t),()=>V(r),(e,t)=>{t(e,{"aria-hidden":`true`,"data-suggestion-glyph":!0,class:`size-icon-md text-ink-muted transition-[color] duration-(--dur-control) ease-out group-hover/item:text-ink-strong`})}),U(e,t)};W(n,e=>{V(r)&&e(i)}),j(t),U(e,t)};W(o,e=>{V(s)&&e(l)});var u=dn(L(o,2),!0);j(a),j(i),R(()=>{ji(a,1,Ti([`group/item mark-line press-tint focus-inset grid w-full min-h-c-row-h content-center items-start gap-x-space-1 rounded-sm py-space-3 text-start type-body text-ink-strong select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover`,V(s)?`grid-cols-lead-fluid pe-space-3`:`grid-cols-1 px-space-3`])),qr(u,V(n).text)}),Ar(`click`,a,()=>t.onpick(V(n))),U(e,i)}),U(e,n)};W(r,e=>{V(a)?e(i):e(l,-1)}),j(n),R(()=>{G(n,`aria-busy`,V(a)||void 0),G(n,`aria-label`,t.label)}),U(e,n)},f=e=>{var n=Pp(),r=I(n),i=e=>{var t=Vr();ii(un(t),16,()=>V(o),e=>e,(e,t)=>{var n=jp(),r=I(n),i=e=>{var t=Op();Gd(I(t),{cell:`glyph`,radius:`text`}),j(t),U(e,t)};W(r,e=>{V(s)&&e(i)});var a=L(r,2),o=I(a);Sp(o,()=>t,()=>`label`);var c=L(o,2),l=I(c);Gd(l,{class:`w-full`,line:`meta`,radius:`line`});var u=L(l,2),d=I(u),f=e=>{var t=kp();Gd(I(t),{class:`w-1/2`,line:`meta`,radius:`line`}),j(t),U(e,t)},p=e=>{var t=Ap();Gd(I(t),{class:`w-1/2`,line:`meta`,radius:`line`}),j(t),U(e,t)};W(d,e=>{t%2==1?e(f):e(p,-1)}),j(u),j(c),j(a),j(n),R(()=>ji(n,1,Ti([`grid min-h-c-row-h-two content-center items-start gap-x-space-3 rounded-md bg-surface-raised px-space-4 py-space-3 shadow-tile`,V(s)?`grid-cols-mark-fluid`:`grid-cols-1`]))),U(e,n)}),U(e,t)},l=e=>{var n=Vr();ii(un(n),19,()=>t.suggestions,(e,t)=>`${t}:${e.text}`,(e,n)=>{let r=M(()=>c(V(n)));var i=Np(),a=I(i),o=I(a),l=e=>{var t=Op(),n=I(t),i=e=>{var t=Vr();di(un(t),()=>V(r),(e,t)=>{t(e,{"aria-hidden":`true`,"data-suggestion-glyph":!0,class:`size-icon-md text-ink-strong`})}),U(e,t)};W(n,e=>{V(r)&&e(i)}),j(t),U(e,t)};W(o,e=>{V(s)&&e(l)});var u=L(o,2),d=I(u),f=dn(d,!0),p=L(d,2),m=e=>{var t=Mp(),r=dn(t,!0);R(()=>qr(r,V(n).reason)),U(e,t)};W(p,e=>{V(n).reason&&e(m)}),j(u),j(a),j(i),R(()=>{ji(a,1,Ti([`mark-line press-tint grid w-full min-h-c-row-h-two content-center items-start gap-x-space-3 rounded-md bg-surface-raised px-space-4 py-space-3 text-start text-ink-strong shadow-tile select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover`,V(s)?`grid-cols-mark-fluid`:`grid-cols-1`])),qr(f,V(n).text)}),Ar(`click`,a,()=>t.onpick(V(n))),U(e,i)}),U(e,n)};W(r,e=>{V(a)?e(i):e(l,-1)}),j(n),R(()=>{G(n,`aria-busy`,V(a)||void 0),G(n,`aria-label`,t.label)}),U(e,n)},p=e=>{var r=Lp(),i=I(r),s=e=>{var t=Vr();ii(un(t),16,()=>V(o),e=>e,(e,t)=>{var r=Fp();Gd(I(r),{class:`w-c-measure-meta max-w-full`,height:`control-sm`,radius:`chip`,type:`label`}),j(r),R(()=>ji(r,1,Ti([`flex`,n()===`row`?`max-w-4/5 flex-none`:`max-w-full`]))),U(e,r)}),U(e,t)},l=e=>{var r=Vr();ii(un(r),19,()=>t.suggestions,(e,t)=>`${t}:${e.text}`,(e,r)=>{let i=M(()=>c(V(r)));var a=Ip(),o=I(a),s=I(o),l=e=>{var t=Tp();di(I(t),()=>V(i),(e,t)=>{t(e,{"aria-hidden":`true`,"data-suggestion-glyph":!0,class:`size-icon-md text-ink-muted`})}),j(t),U(e,t)};W(s,e=>{V(i)&&e(l)});var u=dn(L(s,2),!0);j(o),j(a),R(e=>{ji(a,1,Ti([`flex`,n()===`row`?`max-w-4/5 flex-none`:`max-w-full`])),ji(o,1,e),qr(u,V(r).text)},[()=>Ti(bp({class:`inline-grid min-w-c-touch-floor grid-cols-[auto_minmax(0,auto)] content-center items-start border-border-row-outline select-none motion-safe:transition-[border-color,background-color,transform] motion-safe:enabled:active:[transform:scale(var(--press-scale))] motion-safe:enabled:data-pressed:[transform:scale(var(--press-scale))]`}))]),Ar(`click`,o,()=>t.onpick(V(r))),U(e,a)}),U(e,r)};W(i,e=>{V(a)?e(s):e(l,-1)}),j(r),R(e=>{G(r,`aria-busy`,V(a)||void 0),G(r,`aria-label`,t.label),G(r,`data-row`,n()===`row`||void 0),ji(r,1,e)},[()=>Ti(xp({class:n()===`row`?`kit-edge-fade m-0 list-none flex-nowrap items-start overflow-x-auto overscroll-x-contain p-0 no-scrollbar`:`m-0 list-none p-0`}))]),U(e,r)};W(u,e=>{n()===`list`?e(d):n()===`rows`?e(f,1):e(p,-1)}),j(l),R(()=>{G(l,`data-look`,n()),G(l,`data-placement`,r())}),U(e,l),We()}jr([`click`]);var Bp=H(`<div class="direction svelte-b21ipj" data-direction="today"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function Vp(e,t){Ue(t,!0);let n=e=>{{let n=M(()=>t.draws.loading?3:0),r=M(()=>t.where===`board`?`panel`:`thread`);zp(e,{label:`Things to ask Caw`,get loading(){return V(n)},onpick:e=>{Vo(V(o),e.text),F(i,e.text,!0),F(a,zo,!0)},get placement(){return V(r)},get suggestions(){return t.draws.items}})}},r=e=>{{let n=M(()=>t.where===`keyboard`);Uo(e,{get focused(){return V(n)},get field(){return V(o)},set field(e){F(o,e,!0)},get value(){return V(i)},set value(e){F(i,e,!0)}})}},i=P(``),a=P(``),o=P(void 0);var s=Bp(),c=I(s);Ko(c,{get foot(){return r},get set(){return n},get where(){return t.where}});var l=dn(L(c,2),!0);j(s),R(()=>qr(l,V(a))),U(e,s),We()}var Hp=H(`<div class="sent svelte-l1hgve" data-slot="sent"> </div>`),Up=H(`<span class="running svelte-l1hgve" data-slot="skeleton"></span>`),Wp=H(`<button data-slot="suggestion" type="button"><span class="chip-text svelte-l1hgve" data-slot="suggestion-text"> </span></button>`),Gp=H(`<div class="head svelte-l1hgve" data-slot="tray-count"><span> </span></div> <div class="chip-row kit-edge-fade svelte-l1hgve" role="group"></div>`,1),Kp=H(`<li class="row bones svelte-l1hgve"><span class="bone svelte-l1hgve" data-slot="skeleton"></span></li>`),qp=H(`<span class="reason svelte-l1hgve" data-slot="suggestion-reason"> </span>`),Jp=H(`<li><button class="row svelte-l1hgve" data-slot="suggestion" type="button"><span class="text svelte-l1hgve" data-slot="suggestion-text"> </span> <!></button></li>`),Yp=H(`<li><button class="row more svelte-l1hgve" type="button"><span class="text svelte-l1hgve"> </span></button></li>`),Xp=H(`<!> <!>`,1),Zp=H(`<ul aria-labelledby="tray-label" class="rows edges svelte-l1hgve" data-slot="tray-rows"><!></ul>`),Qp=H(`<div class="head svelte-l1hgve"><span id="tray-label"> </span> <button class="chevron svelte-l1hgve" type="button"><!></button></div> <!>`,1),$p=H(`<div class="tray svelte-l1hgve"><div class="divider svelte-l1hgve"><!></div> <!></div>`),em=H(`<div class="box svelte-l1hgve"><!></div>`),tm=H(`<div class="tray-direction svelte-l1hgve" data-direction="tray"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function nm(e,t){Ue(t,!0);let n=e=>{var n=Vr(),r=un(n),i=e=>{var t=Hp(),n=dn(t,!0);R(()=>qr(n,V(a))),U(e,t)};W(r,e=>{t.draws.phase===`sent`&&e(i)}),U(e,n)},r=e=>{var n=em();Uo(I(n),{get focused(){return V(i)},get field(){return V(f)},set field(e){F(f,e,!0)},get value(){return V(o)},set value(e){F(o,e,!0)},children:(e,n)=>{var r=Vr(),i=un(r),a=e=>{var n=$p(),r=I(n),i=I(r),a=e=>{U(e,Up())};W(i,e=>{t.draws.loading&&e(a)}),j(r);var o=L(r,2),s=e=>{var n=Gp(),r=un(n),i=dn(I(r));j(r);var a=L(r,2);ii(a,23,()=>t.draws.items,(e,t)=>`${t}:${e.text}`,(e,t)=>{var n=Wp(),r=dn(I(n),!0);j(n),R(e=>{ji(n,1,e,`svelte-l1hgve`),qr(r,V(t).text)},[()=>Ti(bp({class:`chip`}))]),Ar(`click`,n,()=>x(V(t).text)),U(e,n)}),j(a),oa(a,e=>F(p,e),()=>V(p)),R(()=>{qr(i,`${V(v)??``}${V(y)??``}`),G(a,`aria-label`,`${V(v)??``}${V(y)??``}`)}),U(e,n)},l=e=>{var n=Qp(),r=un(n),i=I(r),a=dn(i),o=L(i,2);Jd(I(o),{"aria-hidden":`true`,class:`glyph`}),j(o),j(r);var s=L(r,2),l=e=>{var n=Zp(),r=I(n),i=e=>{var t=Vr();ii(un(t),16,()=>[`var(--tray-bone-1)`,`var(--tray-bone-2)`,`var(--tray-bone-3)`],e=>e,(e,t)=>{var n=Kp(),r=I(n);let i;j(n),R(()=>i=Ni(r,``,i,{"inline-size":t})),U(e,n)}),U(e,t)},a=e=>{var n=Xp(),r=un(n);ii(r,19,()=>V(g),(e,t)=>`${t}:${e.text}`,(e,n,r)=>{var i=Jp(),a=I(i),o=I(a),s=dn(o,!0),c=L(o,2),l=e=>{var t=qp(),i=dn(t,!0);R(()=>{G(t,`id`,`tray-reason-${V(r)??``}`),qr(i,V(n).reason)}),U(e,t)};W(c,e=>{V(n).reason&&e(l)}),j(a),j(i),R(()=>{G(a,`aria-describedby`,V(n).reason?`tray-reason-${V(r)}`:void 0),G(a,`data-held`,V(r)===0?t.draws.held:void 0),qr(s,V(n).text)}),Ar(`click`,a,e=>b(V(r),e.currentTarget)),U(e,i)});var i=L(r,2),a=e=>{var t=Yp(),n=I(t),r=dn(I(n));j(n),j(t),R(()=>qr(r,`${V(_)??``} more`)),Ar(`click`,n,()=>F(u,!0)),U(e,t)};W(i,e=>{V(_)>0&&e(a)}),U(e,n)};W(r,e=>{t.draws.loading?e(i):e(a,-1)}),j(n),Si(n,Fo),Si(n,()=>Wo),U(e,n)};W(s,e=>{V(c)||e(l)}),R(()=>{qr(a,`${V(v)??``}${V(y)??``}`),G(o,`aria-expanded`,!V(c)),G(o,`aria-label`,V(c)?`Open`:`Close`),G(o,`data-shut`,V(c)||void 0)}),Ar(`click`,o,()=>F(c,!V(c))),U(e,n)};W(o,e=>{V(h)?e(s):e(l,-1)}),j(n),R(()=>G(n,`data-loading`,t.draws.loading||void 0)),U(e,n)};W(i,e=>{V(m)&&e(a)}),U(e,r)},$$slots:{default:!0}}),j(n),U(e,n)},i=M(()=>t.where===`keyboard`),a=M(()=>t.draws.items[0]?.text??``),o=P(Qt((e=>e===`filled`||e===`scrolled`||e===`reopened`)(t.draws.phase)?V(a):``)),s=P(t.draws.phase===`reopened`),c=P(!1),l=P(!1),u=P(Qt(t.draws.expanded)),d=P(``),f=P(void 0),p=P(void 0),m=M(()=>(t.draws.items.length>0||t.draws.loading)&&t.draws.phase!==`sent`),h=M(()=>(V(o)!==``||V(i))&&!V(s)&&!t.draws.loading&&!V(l)),g=M(()=>V(u)?t.draws.items:t.draws.items.slice(0,4)),_=M(()=>t.draws.items.length-V(g).length),v=M(()=>t.where===`board`?`Things you might say`:`You might say`),y=M(()=>t.draws.loading?``:` · ${t.draws.items.length}`);Cn(()=>{t.draws.phase===`scrolled`&&V(p)&&(V(p).scrollLeft=V(p).scrollWidth/3)});async function b(e,n){let r=t.draws.items[e]?.text??``,i=n.querySelector(`[data-slot='suggestion-text']`);if(!(i&&V(f)))return;let a={duration:Qa(`--dur-exit`),easing:$a(`--ease-out`),fill:`forwards`},c=Number.parseFloat(getComputedStyle(n).getPropertyValue(`--tray-lift`));F(l,!0),Vo(V(f),r);let u=[i.animate(Ga.current?[{translate:`0 0`,opacity:1},{translate:`0 ${c}px`,opacity:0}]:[{opacity:1},{opacity:0}],a),V(f).animate([{opacity:0},{opacity:1}],a)];await Ro(u),F(o,r,!0),F(s,!1),F(l,!1),F(d,zo,!0);for(let e of u)e.cancel()}function x(e){Vo(V(f),e),F(o,e,!0),F(d,zo,!0)}Cn(()=>{V(o)===``&&F(s,!1)});var S=tm(),ee=I(S);Ko(ee,{anchor:`end`,get foot(){return r},get set(){return n},get where(){return t.where}});var C=dn(L(ee,2),!0);j(S),R(()=>{G(S,`data-touch`,t.draws.touch||void 0),G(S,`data-where`,t.where),qr(C,V(d))}),U(e,S),We()}jr([`click`]);var rm=H(`<p class="note" data-slot="note"> </p>`),im=H(`<header class="panel-head"><!> <span class="panel-words"><strong>Caw</strong><span>Cawco</span></span></header>`),am=H(`<div aria-hidden="true" class="keyboard" data-slot="keyboard"><span>Keyboard</span></div>`),om=H(`<article class="frame"><!> <div class="body"><!></div> <!></article>`),sm=H(`<!> <main aria-label="The state on show" class="stage" data-slot="stage"><!></main>`,1);function cm(e,t){Ue(t,!0);let n={today:Vp,drafts:es,ledger:vp,tray:nm},r=P(Qt(t.initial)),i=M(()=>Ra(V(r))),a=M(()=>za(V(r))),o=M(()=>n[V(r).direction]),s=M(()=>Pa[V(r).where]);function c(e){F(r,e,!0)}Cn(()=>{let e=document.documentElement;e.dataset.flipping=``,e.classList.toggle(`dark`,V(r).theme===`dark`),getComputedStyle(e).color,requestAnimationFrame(()=>requestAnimationFrame(()=>delete e.dataset.flipping))});var l={show:c},u=sm(),d=un(u),f=e=>{var t=rm(),n=dn(t,!0);R(e=>qr(n,e),[()=>Ia(V(r).direction)]),U(e,t)},p=M(()=>Ia(V(r).direction));W(d,e=>{V(p)&&e(f)});var m=L(d,2);return ei(I(m),()=>V(i),e=>{var t=om();let n;var i=I(t),c=e=>{var t=im();Va(I(t),{class:`panel-mark`,size:28}),Se(2),j(t),U(e,t)};W(i,e=>{V(r).where!==`board`&&e(c)});var l=L(i,2);di(I(l),()=>V(o),(e,t)=>{t(e,{get draws(){return V(a)},get where(){return V(r).where}})}),j(l);var u=L(l,2),d=e=>{U(e,am())};W(u,e=>{V(r).where===`keyboard`&&e(d)}),j(t),R(()=>{G(t,`aria-label`,V(s).label),G(t,`data-frame`,V(r).where),n=Ni(t,``,n,{"--frame-w":`${V(s).width??``}px`})}),U(e,t)}),j(m),R(()=>{G(m,`data-data`,V(r).data),G(m,`data-direction`,V(r).direction),G(m,`data-state`,V(i)),G(m,`data-theme`,V(r).theme),G(m,`data-where`,V(r).where)}),U(e,u),We(l)}var lm,um=xa({width:725,axes:!0,label:`Suggestions states`,groups:e=>La(e.direction).map(e=>({key:e.key,label:e.label,states:e.entries})),onchange:e=>lm?.show(e)});lm=Jr(cm,{target:um.stage,props:{initial:um.state}});