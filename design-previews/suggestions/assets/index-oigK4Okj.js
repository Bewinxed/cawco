(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=Array.isArray,t=Array.prototype.indexOf,n=Array.prototype.includes,r=Array.from,i=Object.defineProperty,a=Object.getOwnPropertyDescriptor,o=Object.getOwnPropertyDescriptors,s=Object.prototype,c=Array.prototype,l=Object.getPrototypeOf,u=Object.isExtensible;function d(e){return typeof e==`function`}var f=()=>{};function p(e){for(var t=0;t<e.length;t++)e[t]()}function m(){var e,t;return{promise:new Promise((n,r)=>{e=n,t=r}),resolve:e,reject:t}}var h=1<<24,g=1024,_=2048,v=4096,y=8192,ee=16384,te=32768,ne=1<<25,re=65536,b=1<<19,x=1<<20,ie=1<<25,ae=1<<21,oe=1<<22,se=1<<23,ce=Symbol(`$state`),le=Symbol(`component`),ue=Symbol(`legacy props`),de=Symbol(``),fe=Symbol(`attributes`),pe=Symbol(`class`),S=Symbol(`style`),me=Symbol(`text`),he=Symbol(`form reset`),ge=new class extends Error{name=`StaleReactionError`;message="The reaction that called `getAbortSignal()` was re-run or destroyed"},_e=!!globalThis.document?.contentType&&globalThis.document.contentType.includes(`xml`),C={},w=Symbol(`uninitialized`),ve=`http://www.w3.org/1999/xhtml`;function ye(){console.warn(`https://svelte.dev/e/derived_inert`)}function T(e){console.warn(`https://svelte.dev/e/hydration_mismatch`)}function be(){console.warn(`https://svelte.dev/e/select_multiple_invalid_value`)}function xe(){console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`)}var E=!1;function Se(e){E=e}var D;function Ce(e){if(e===null)throw T(),C;return D=e}function we(){return Ce(fn(D))}function O(e){if(E){if(fn(D)!==null)throw T(),C;D=e}}function Te(e=1){if(E){for(var t=e,n=D;t--;)n=fn(n);D=n}}function Ee(e=!0){for(var t=0,n=D;;){if(n.nodeType===8){var r=n.data;if(r===`]`){if(t===0)return n;--t}else(r===`[`||r===`[!`||r[0]===`[`&&!isNaN(Number(r.slice(1))))&&(t+=1)}var i=fn(n);e&&n.remove(),n=i}}function De(e){if(!e||e.nodeType!==8)throw T(),C;return e.data}function Oe(e){return e===this.v}function ke(e,t){return e==e?e!==t||typeof e==`object`&&!!e||typeof e==`function`:t==t}function Ae(e){return!ke(e,this.v)}function je(){throw Error(`https://svelte.dev/e/async_derived_orphan`)}function Me(e,t,n){throw Error(`https://svelte.dev/e/each_key_duplicate`)}function Ne(e){throw Error(`https://svelte.dev/e/effect_in_teardown`)}function Pe(){throw Error(`https://svelte.dev/e/effect_in_unowned_derived`)}function Fe(e){throw Error(`https://svelte.dev/e/effect_orphan`)}function Ie(){throw Error(`https://svelte.dev/e/effect_update_depth_exceeded`)}function Le(e){throw Error(`https://svelte.dev/e/props_invalid_value`)}function Re(){throw Error(`https://svelte.dev/e/state_descriptors_fixed`)}function ze(){throw Error(`https://svelte.dev/e/state_prototype_fixed`)}function Be(){throw Error(`https://svelte.dev/e/state_unsafe_mutation`)}function Ve(){throw Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`)}var He=!1;function Ue(){He=!0}var We=null;function Ge(e){We=e}function Ke(e,t=!1,n){We={p:We,i:!1,c:null,e:null,s:e,x:null,r:R,l:null}}function qe(e){var t=We,n=t.e;if(n!==null){t.e=null;for(var r of n)En(r)}return e!==void 0&&(t.x=e),t.i=!0,We=t.p,Je(e)}function Je(e={}){return i(e,le,{value:!0}),e}function Ye(){return!0}var Xe=[];function Ze(){var e=Xe;Xe=[],p(e)}function Qe(e){if(Xe.length===0&&!Ot){var t=Xe;queueMicrotask(()=>{t===Xe&&Ze()})}Xe.push(e)}function $e(){for(;Xe.length>0;)Ze()}var et=~(_|v|g);function tt(e,t){e.f=e.f&et|t}function nt(e){e.f&512||e.deps===null?tt(e,g):tt(e,v)}function rt(e,t,n){e.f&2048?t.add(e):e.f&4096&&n.add(e),tt(e,g)}function it(e,t){if(t){let t=document.body;e.autofocus=!0,Qe(()=>{document.activeElement===t&&e.focus()})}}function at(e){E&&dn(e)!==null&&mn(e)}var ot=!1;function st(){ot||(ot=!0,document.addEventListener(`reset`,e=>{Promise.resolve().then(()=>{if(!e.defaultPrevented)for(let t of e.target.elements)t[he]?.()})},{capture:!0}))}function ct(e){var t=L,n=R;Yn(null),Xn(null);try{return e()}finally{Yn(t),Xn(n)}}function lt(e,t,n,r=n){e.addEventListener(t,()=>ct(n));let i=e[he];e[he]=i?()=>{i(),r(!0)}:()=>r(!0),st()}function ut(e,t,n,r){let i=Ye()?mt:_t;var a=e.filter(e=>!e.settled),o=t.map(i);if(n.length===0&&a.length===0){r(o);return}var s=R,c=dt(),l=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(e=>e.promise)):null;function u(e){if(!(s.f&16384)){c();try{r([...o,...e])}catch(e){yn(e,s)}ft()}}var d=pt();if(n.length===0){l.then(()=>u([])).finally(d);return}function f(){Promise.all(n.map(e=>gt(e))).then(u).catch(e=>yn(e,s)).finally(d)}l?l.then(()=>{if(s.f&16384){d();return}c(),f(),ft()}):f()}function dt(){var e=R,t=L,n=We,r=A;return function(i=!0){Xn(e),Yn(t),Ge(n),i&&!(e.f&16384)&&(r?.activate(),r?.apply())}}function ft(e=!0){Xn(null),Yn(null),Ge(null),e&&A?.deactivate()}function pt(){var e=R,t=e.b,n=A,r=!!t?.is_rendered();return t?.update_pending_count(1,n),n.increment(r,e),()=>{t?.update_pending_count(-1,n),n.decrement(r,e)}}function mt(e){var t=2|_;return R!==null&&(R.f|=b),{ctx:We,deps:null,effects:null,equals:Oe,f:t,fn:e,reactions:null,rv:0,v:w,wv:0,parent:R,ac:null}}var ht=Symbol(`obsolete`);function gt(e,t,n){let r=R;r===null&&je();var i=void 0,a=qt(w),o=!L,s=new Set;return kn(()=>{var t=R,n=m();i=n.promise;try{Promise.resolve(e()).then(n.resolve,e=>{e!==ge&&n.reject(e)}).finally(ft)}catch(e){n.reject(e),ft()}var c=A;if(o){if(t.f&32768)var l=pt();if(r.b?.is_rendered())c.async_deriveds.get(t)?.reject(ht);else for(let e of s.values())e.reject(ht);s.add(n),c.async_deriveds.set(t,n)}let u=(e,t=void 0)=>{l?.(),s.delete(n),t!==ht&&(c.activate(),t?(a.f|=se,Zt(a,t)):(a.f&8388608&&(a.f^=se),Zt(a,e)),c.deactivate())};n.promise.then(u,e=>u(null,e||`unknown`))}),wn(()=>{for(let e of s)e.reject(ht)}),new Promise(e=>{function t(n){function r(){n===i?e(a):t(i)}n.then(r,r)}t(i)})}function k(e){let t=mt(e);return He||Qn(t),t}function _t(e){let t=mt(e);return t.equals=Ae,t}function vt(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)Ln(t[n])}}function yt(e){var t,n=R,r=e.parent;if(!Kn&&r!==null&&e.v!==w&&r.f&24576)return ye(),e.v;Xn(r);try{vt(e),t=ur(e)}finally{Xn(n)}return t}function bt(e){var t=yt(e);if(!e.equals(t)&&(e.wv=sr(),(!A?.is_fork||e.deps===null)&&(A===null?e.v=t:(A.capture(e,t,!0),Tt?.capture(e,t,!0)),e.deps===null))){tt(e,g);return}Kn||(Et===null?nt(e):(Cn()||A?.is_fork)&&Et.set(e,t))}function xt(e){if(e.effects!==null)for(let t of e.effects)(t.teardown||t.ac)&&(t.teardown?.(),t.ac!==null&&ct(()=>{t.ac.abort(ge),t.ac=null}),t.fn!==null&&(t.teardown=f),pr(t,0),Fn(t))}function St(e){if(e.effects!==null)for(let t of e.effects)t.teardown&&t.fn!==null&&mr(t)}var Ct=null,wt=null,A=null,Tt=null,Et=null,Dt=null,Ot=!1,kt=!1,At=null,jt=null,Mt=0,Nt=1,Pt=class e{id=Nt++;#e=!1;linked=!0;#t=null;#n=null;async_deriveds=new Map;current=new Map;previous=new Map;#r=new Set;#i=new Set;#a=0;#o=new Map;#s=null;#c=[];#l=[];#u=new Set;#d=new Set;#f=new Map;#p=new Set;is_fork=!1;#m=!1;constructor(){wt===null?Ct=wt=this:(wt.#n=this,this.#t=wt),wt=this}#h(){if(this.is_fork)return!0;for(let n of this.#o.keys()){for(var e=n,t=!1;e.parent!==null;){if(this.#f.has(e)){t=!0;break}e=e.parent}if(!t)return!0}return!1}skip_effect(e){this.#f.has(e)||this.#f.set(e,{d:[],m:[]}),this.#p.delete(e)}unskip_effect(e,t=e=>this.schedule(e)){var n=this.#f.get(e);if(n){this.#f.delete(e);for(var r of n.d)tt(r,_),t(r);for(r of n.m)tt(r,v),t(r)}this.#p.add(e)}#g(){var e=[];for(let i of this.#c)if(!(i.f&16384||!(i.f&6144))){for(var t=i,n=!1;t.parent!==null;){t=t.parent;var r=t.f;if(r&96){if(!(r&1024)){n=!0;break}t.f^=g}}n||e.push(t)}return this.#c=[],e}#_(){this.#e=!0;for(let e of this.#u)this.#d.delete(e),tt(e,_),this.schedule(e);for(let e of this.#d)tt(e,v),this.schedule(e);this.apply();for(var t=At=[],n=[],r=jt=[];this.#c.length>0;){Mt++>1e3&&(this.#C(),It());for(let e of this.#g())try{this.#v(e,t,n)}catch(t){throw Ut(e),this.#h()||this.discard(),t}}if(A=null,r.length>0){var i=e.ensure();for(let e of r)i.schedule(e)}if(At=null,jt=null,this.#h()){this.#x(n),this.#x(t);for(let[e,t]of this.#f)Ht(e,t);r.length>0&&A.#_();return}let a=this.#y();if(a){this.#x(n),this.#x(t),a.#b(this);return}this.#u.clear(),this.#d.clear();for(let e of this.#r)e(this);this.#r.clear(),Tt=this,Rt(n),Rt(t),Tt=null,this.#s?.resolve();var o=A;if(this.#a===0&&(this.#c.length===0||o!==null)&&(this.#C(),He&&(this.#S(),A=o)),this.#c.length>0){if(o!==null){for(let e of this.#c)o.#c.push(e);this.#c=[]}else o=this}o!==null&&(Gt.clear(),o.#_())}#v(e,t,n){e.f^=g;for(var r=e.first;r!==null;){var i=r.f,a=!!(i&96);if(!(a&&i&1024||i&8192||this.#f.has(r))&&r.fn!==null){a?r.f^=g:i&4?t.push(r):He&&i&16777224?n.push(r):cr(r)&&(i&16&&this.#d.add(r),mr(r));var o=r.first;if(o!==null){r=o;continue}}for(;r!==null;){var s=r.next;if(s!==null){r=s;break}r=r.parent}}}#y(){for(var e=this.#t;e!==null;){if(!e.is_fork){for(let[t,[,n]]of this.current)if(e.current.has(t)&&!n)return e}e=e.#t}return null}#b(e){for(let[t,n]of e.current)!this.previous.has(t)&&e.previous.has(t)&&this.previous.set(t,e.previous.get(t)),this.current.set(t,n);for(let[t,n]of e.async_deriveds){let e=this.async_deriveds.get(t);e&&n.promise.then(e.resolve).catch(e.reject)}e.async_deriveds.clear(),this.transfer_effects(e.#u,e.#d);let t=e=>{var n=e.reactions;if(n!==null&&!(e.f&2&&!(e.f&6144)))for(let e of n){var r=e.f;if(r&2)t(e);else{var i=e;r&4194320&&!this.async_deriveds.has(i)&&(this.#d.delete(i),tt(i,_),this.schedule(i))}}};for(let e of this.current.keys())t(e);this.oncommit(()=>e.discard()),e.#C(),A=this,this.#_()}#x(e){for(var t=0;t<e.length;t+=1)rt(e[t],this.#u,this.#d)}capture(e,t,n=!1){e.v!==w&&!this.previous.has(e)&&this.previous.set(e,e.v),e.f&8388608||(this.current.set(e,[t,n]),Et?.set(e,t)),this.is_fork||(e.v=t)}activate(){A=this}deactivate(){A=null,Et=null}flush(){try{kt=!0,A=this,this.#_()}finally{Mt=0,Dt=null,At=null,jt=null,kt=!1,A=null,Et=null,Gt.clear()}}discard(){for(let e of this.#i)e(this);this.#i.clear();for(let e of this.async_deriveds.values())e.reject(ht);this.#C(),this.#s?.resolve()}register_created_effect(e){this.#l.push(e)}#S(){for(let u=Ct;u!==null;u=u.#n){var e=u.id<this.id,t=[];for(let[r,[i,a]]of this.current){if(u.current.has(r)){var n=u.current.get(r)[0];if(e&&i!==n)u.current.set(r,[i,a]);else continue}t.push(r)}if(e)for(let[e,t]of this.async_deriveds){let n=u.async_deriveds.get(e);n&&t.promise.then(n.resolve).catch(n.reject)}var r=[...u.current.keys()].filter(e=>!u.current.get(e)[1]);if(u.#e&&r.length!==0){var i=r.filter(e=>!this.current.has(e));if(i.length===0)e&&u.discard();else if(t.length>0){if(e)for(let e of this.#p)u.unskip_effect(e,e=>{e.f&4194320?u.schedule(e):u.#x([e])});u.activate();var a=new Set,o=new Map;for(var s of t)zt(s,i,a,o);o=new Map;var c=[...u.current].filter(([e,t])=>{let n=this.current.get(e);return!n||n[0]!==t[0]||n[1]!==t[1]}).map(([e])=>e);if(c.length>0)for(let e of this.#l)!(e.f&155648)&&Bt(e,c,o)&&(e.f&4194320?(tt(e,_),u.schedule(e)):u.#u.add(e));if(u.#c.length>0&&!u.#m){u.apply();for(var l of u.#g())u.#v(l,[],[])}u.deactivate()}}}}increment(e,t){if(this.#a+=1,e){let e=this.#o.get(t)??0;this.#o.set(t,e+1)}}decrement(e,t){if(--this.#a,e){let e=this.#o.get(t)??0;e===1?this.#o.delete(t):this.#o.set(t,e-1)}this.#m||(this.#m=!0,Qe(()=>{this.#m=!1,this.linked&&this.flush()}))}transfer_effects(e,t){for(let t of e)this.#u.add(t);for(let e of t)this.#d.add(e);e.clear(),t.clear()}oncommit(e){this.#r.add(e)}ondiscard(e){this.#i.add(e)}settled(){return(this.#s??=m()).promise}static ensure(){if(A===null){let t=A=new e;!kt&&!Ot&&Qe(()=>{t.#e||t.flush()})}return A}apply(){if(!He||!this.is_fork&&this.#t===null&&this.#n===null){Et=null;return}Et=new Map;for(let[e,[t]]of this.current)Et.set(e,t);for(let t=Ct;t!==null;t=t.#n)if(!(t===this||t.is_fork)){var e=!1;if(t.id<this.id){for(let[n,[,r]]of t.current)if(!r&&this.current.has(n)){e=!0;break}}if(!e)for(let[e,n]of t.previous)Et.has(e)||Et.set(e,n)}}schedule(e){if(Dt=e,e.b?.is_pending&&e.f&16777228&&!(e.f&32768)){e.b.defer_effect(e);return}this.#c.push(e)}#C(){if(this.linked){var e=this.#t,t=this.#n;e===null?Ct=t:e.#n=t,t===null?wt=e:t.#t=e,this.linked=!1}}};function Ft(e){var t=Ot,n=Tt;Tt=null,Ot=!0;try{var r;for(e&&(Ft(),r=e());;){if($e(),A===null)return r;A.flush()}}finally{Ot=t,Tt=n}}function It(){try{Ie()}catch(e){yn(e,Dt)}}var Lt=null;function Rt(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var r=e[n++];if(!(r.f&24576)&&cr(r)&&(Lt=new Set,mr(r),r.deps===null&&r.first===null&&r.nodes===null&&r.teardown===null&&r.ac===null&&zn(r),Lt?.size>0)){Gt.clear();for(let e of Lt){if(e.f&24576)continue;let t=[e],n=e.parent;for(;n!==null;)Lt.has(n)&&(Lt.delete(n),t.push(n)),n=n.parent;for(let e=t.length-1;e>=0;e--){let n=t[e];n.f&24576||mr(n)}}Lt.clear()}}Lt=null}}function zt(e,t,n,r){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(let i of e.reactions){let e=i.f;e&2?zt(i,t,n,r):e&4194320&&!(e&2048)&&Bt(i,t,r)&&(tt(i,_),Vt(i))}}function Bt(e,t,r){let i=r.get(e);if(i!==void 0)return i;if(e.deps!==null)for(let i of e.deps){if(n.call(t,i))return!0;if(i.f&2&&Bt(i,t,r))return r.set(i,!0),!0}return r.set(e,!1),!1}function Vt(e){A.schedule(e)}function Ht(e,t){if(!(e.f&32&&e.f&1024)){e.f&2048?t.d.push(e):e.f&4096&&t.m.push(e),tt(e,g);for(var n=e.first;n!==null;)Ht(n,t),n=n.next}}function Ut(e){tt(e,g);for(var t=e.first;t!==null;)Ut(t),t=t.next}var Wt=new Set,Gt=new Map,Kt=!1;function qt(e,t){return{f:0,v:e,reactions:null,equals:Oe,rv:0,wv:0}}function j(e,t){let n=qt(e,t);return Qn(n),n}function Jt(e,t=!1,n=!0){let r=qt(e);return t||(r.equals=Ae),r}function M(e,t,n=!1){return L!==null&&(!Jn||L.f&131072)&&Ye()&&L.f&4325394&&(Zn===null||!Zn.has(e))&&Be(),Zt(e,n?tn(t):t,jt)}var Yt=null,Xt=0;function Zt(e,t,n=null){if(!e.equals(t)){Kn?Gt.set(e,t):Gt.has(e)||Gt.set(e,e.v);var r=Pt.ensure();if(r.capture(e,t),e.f&2){let t=e;e.f&2048&&yt(t),Et===null&&nt(t)}e.wv=sr(),Yt=null,Xt=0,en(e,_,n),Yt=null,Ye()&&R!==null&&R.f&1024&&!(R.f&96)&&(tr===null?nr([e]):tr.push(e)),!r.is_fork&&Wt.size>0&&!Kt&&Qt()}return t}function Qt(){Kt=!1;for(let e of Wt){e.f&1024&&tt(e,v);let t;try{t=cr(e)}catch{t=!0}t&&mr(e)}Wt.clear()}function $t(e){M(e,e.v+1)}function en(e,t,n){var r=e.reactions;if(r!==null){var i=Ye(),a=r.length;if(Xt+=a,Xt>1e5&&Yt===null&&(Yt=new Set),Yt!==null){if(Yt.has(e))return;Yt.add(e)}for(var o=0;o<a;o++){var s=r[o],c=s.f;if(i||s!==R){var l=(c&_)===0;if(l&&tt(s,t),c&131072)Wt.add(s);else if(c&2){var u=s;Et?.delete(u),en(u,v,n)}else if(l){var d=s;c&16&&Lt!==null&&Lt.add(d),n===null?Vt(d):n.push(d)}}}}}function tn(t){if(typeof t!=`object`||!t||ce in t||le in t)return t;let n=l(t);if(n!==s&&n!==c)return t;var r=new Map,i=e(t),o=j(0),u=null,d=ar,f=e=>{if(ar===d)return e();var t=L,n=ar;Yn(null),or(d);var r=e();return Yn(t),or(n),r};return i&&r.set(`length`,j(t.length,u)),new Proxy(t,{defineProperty(e,t,n){(!(`value`in n)||n.configurable===!1||n.enumerable===!1||n.writable===!1)&&Re();var i=r.get(t);return i===void 0?f(()=>{var e=j(n.value,u);return r.set(t,e),e}):M(i,n.value,!0),!0},deleteProperty(e,t){var n=r.get(t);if(n===void 0){if(t in e){let e=f(()=>j(w,u));r.set(t,e),$t(o)}}else M(n,w),$t(o);return!0},get(e,n,i){if(n===ce)return t;var o=r.get(n),s=n in e;if(o===void 0&&(!s||a(e,n)?.writable)&&(o=f(()=>j(tn(s?e[n]:w),u)),r.set(n,o)),o!==void 0){var c=z(o);return c===w?void 0:c}return Reflect.get(e,n,i)},getOwnPropertyDescriptor(e,t){this.has?.(e,t);var n=Reflect.getOwnPropertyDescriptor(e,t),i=r.get(t);if(i!==void 0){var a=z(i);if(a===w)return;if(n&&`value`in n)n.value=a;else return{enumerable:!0,configurable:!0,value:a,writable:!0}}return n},has(e,t){if(t===ce)return!0;var n=r.get(t),i=n!==void 0&&n.v!==w||Reflect.has(e,t);return(n!==void 0||R!==null&&(!i||a(e,t)?.writable))&&(n===void 0&&(n=f(()=>j(i?tn(e[t]):w,u)),r.set(t,n)),z(n)===w)?!1:i},set(e,t,n,s){var c=r.get(t),l=t in e;if(i&&t===`length`)for(var d=n;d<c.v;d+=1){var p=r.get(d+``);p===void 0?d in e&&(p=f(()=>j(w,u)),r.set(d+``,p)):M(p,w)}if(c===void 0)(!l||a(e,t)?.writable)&&(c=f(()=>j(void 0,u)),M(c,tn(n)),r.set(t,c));else{l=c.v!==w;var m=f(()=>tn(n));M(c,m)}var h=Reflect.getOwnPropertyDescriptor(e,t);if(h?.set&&h.set.call(s,n),!l){if(i&&typeof t==`string`){var g=r.get(`length`),_=Number(t);Number.isInteger(_)&&_>=g.v&&M(g,_+1)}$t(o)}return!0},ownKeys(e){z(o);var t=Reflect.ownKeys(e).filter(e=>{var t=r.get(e);return t===void 0||t.v!==w});for(var[n,i]of r)i.v!==w&&!(n in e)&&t.push(n);return t},setPrototypeOf(){ze()}})}function nn(e){try{if(typeof e==`object`&&e&&ce in e)return e[ce]}catch{}return e}function rn(e,t){return Object.is(nn(e),nn(t))}var an,on,sn,cn;function ln(){if(an===void 0){an=window,on=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;sn=a(t,`firstChild`).get,cn=a(t,`nextSibling`).get,u(e)&&(e[pe]=void 0,e[fe]=null,e[S]=void 0,e.__e=void 0),u(n)&&(n[me]=void 0)}}function un(e=``){return document.createTextNode(e)}function dn(e){return sn.call(e)}function fn(e){return cn.call(e)}function N(e,t){if(!E)return dn(e);var n=dn(D);if(n===null)n=D.appendChild(un());else if(t&&n.nodeType!==3){var r=un();return n?.before(r),Ce(r),r}return t&&_n(n),Ce(n),n}function pn(e,t=!1){if(!E){var n=dn(e);return n instanceof Comment&&n.data===``?fn(n):n}if(t){if(D?.nodeType!==3){var r=un();return D?.before(r),Ce(r),r}_n(D)}return D}function P(e,t=!1){if(!E)return dn(e);var n=N(e,t);return O(e),n}function F(e,t=1,n=!1){let r=E?D:e;for(var i;t--;)i=r,r=fn(r);if(!E)return r;if(n){if(r?.nodeType!==3){var a=un();return r===null?i?.after(a):r.before(a),Ce(a),a}_n(r)}return Ce(r),r}function mn(e){e.textContent=``}function hn(){return!He||Lt!==null?!1:(R.f&te)!==0}function gn(e,t,n){return t==null||t===`http://www.w3.org/1999/xhtml`?n?document.createElement(e,{is:n}):document.createElement(e):n?document.createElementNS(t,e,{is:n}):document.createElementNS(t,e)}function _n(e){if(e.nodeValue.length<65536)return;let t=e.nextSibling;for(;t!==null&&t.nodeType===3;)t.remove(),e.nodeValue+=t.nodeValue,t=e.nextSibling}function vn(e){var t=R;if(t===null)return L.f|=se,e;if(!(t.f&32768)&&!(t.f&4))throw e;yn(e,t)}function yn(e,t){if(e===C)throw e;if(!(t!==null&&t.f&16384)){for(;t!==null;){if(t.f&128&&!(t.f&33570816)){if(!(t.f&32768))throw e;try{t.b.error(e);return}catch(t){e=t}}t=t.parent}throw e}}function bn(e){R===null&&(L===null&&Fe(e),Pe()),Kn&&Ne(e)}function xn(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function Sn(e,t){var n=R;n!==null&&n.f&8192&&(e|=y);var r={ctx:We,deps:null,nodes:null,f:e|_|512,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};A?.register_created_effect(r);var i=r;if(e&4)At===null?Pt.ensure().schedule(r):At.push(r);else if(t!==null){try{mr(r)}catch(e){throw Ln(r),e}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&!(i.f&524288)&&(i=i.first,e&16&&e&65536&&i!==null&&(i.f|=re))}if(i!==null&&(i.parent=n,n!==null&&xn(i,n),L!==null&&L.f&2&&!(e&64))){var a=L;(a.effects??=[]).push(i)}return r}function Cn(){return L!==null&&!Jn}function wn(e){let t=Sn(8,null);return tt(t,g),t.teardown=e,t}function Tn(e){bn(`$effect`);var t=R.f;if(!L&&t&32&&We!==null&&!We.i){var n=We;(n.e??=[]).push(e)}else return En(e)}function En(e){return Sn(4|x,e)}function Dn(e){Pt.ensure();let t=Sn(64|b,e);return(e={})=>new Promise(n=>{e.outro?Bn(t,()=>{Ln(t),n(void 0)}):(Ln(t),n(void 0))})}function On(e){return Sn(4,e)}function kn(e){return Sn(oe|b,e)}function An(e,t=0){return Sn(8|t,e)}function I(e,t=[],n=[],r=[]){ut(r,t,n,t=>{Sn(8,()=>{e(...t.map(z))})})}function jn(e,t=0){return Sn(16|t,e)}function Mn(e,t=0){return Sn(h|t,e)}function Nn(e){return Sn(32|b,e)}function Pn(e){var t=e.teardown;if(t!==null){let n=Kn,r=L;qn(!0),Yn(null);try{t.call(null)}catch(t){yn(t,e.parent)}finally{qn(n),Yn(r)}}}function Fn(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){let e=n.ac;e!==null&&ct(()=>{e.abort(ge)});var r=n.next;n.f&64?n.parent=null:Ln(n,t),n=r}}function In(e){for(var t=e.first;t!==null;){var n=t.next;t.f&32||Ln(t),t=n}}function Ln(e,t=!0){var n=!1;(t||e.f&262144)&&e.nodes!==null&&e.nodes.end!==null&&(Rn(e.nodes.start,e.nodes.end),n=!0),e.f|=ne,Fn(e,t&&!n),pr(e,0);var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)e.stop();Pn(e),e.f^=ne,e.f|=ee;var i=e.parent;i!==null&&i.first!==null&&zn(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Rn(e,t){for(;e!==null;){var n=e===t?null:fn(e);e.remove(),e=n}}function zn(e){var t=e.parent,n=e.prev,r=e.next;n!==null&&(n.next=r),r!==null&&(r.prev=n),t!==null&&(t.first===e&&(t.first=r),t.last===e&&(t.last=n))}function Bn(e,t,n=!0){var r=[];e.f|=256,Vn(e,r,!0);var i=()=>{n&&Ln(e),t&&t()},a=r.length;if(a>0){var o=()=>--a||i();for(var s of r)s.out(o)}else i()}function Vn(e,t,n){if(!(e.f&8192)){e.f^=y;var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)(e.is_global||n)&&t.push(e);for(var i=e.first;i!==null;){var a=i.next;if(!(i.f&64)){var o=!!(i.f&65536)||!!(i.f&32)&&!!(e.f&16);Vn(i,t,o?n:!1)}i=a}}}function Hn(e){e.f&=-257,Un(e,!0)}function Un(e,t){if(!(e.f&256)&&e.f&8192){e.f^=y,e.f&1024||(tt(e,_),Pt.ensure().schedule(e));for(var n=e.first;n!==null;){var r=n.next,i=!!(n.f&65536)||!!(n.f&32);Un(n,i?t:!1),n=r}var a=e.nodes&&e.nodes.t;if(a!==null)for(let e of a)(e.is_global||t)&&e.in()}}function Wn(e,t){if(e.nodes)for(var n=e.nodes.start,r=e.nodes.end;n!==null;){var i=n===r?null:fn(n);t.append(n),n=i}}var Gn=null,Kn=!1;function qn(e){Kn=e}var L=null,Jn=!1;function Yn(e){L=e}var R=null;function Xn(e){R=e}var Zn=null;function Qn(e){L!==null&&(!He&&L.f&2097152||L.f&2)&&(Zn??=new Set).add(e)}var $n=null,er=0,tr=null;function nr(e){tr=e}var rr=1,ir=0,ar=ir;function or(e){ar=e}function sr(){return++rr}function cr(e){var t=e.f;if(t&2048)return!0;if(t&4096){for(var n=e.deps,r=n.length,i=0;i<r;i++){var a=n[i];if(cr(a)&&bt(a),a.wv>e.wv)return!0}t&512&&Et===null&&tt(e,g)}return!1}function lr(e,t,n=!0){var r=e.reactions;if(r!==null&&(He||Zn===null||!Zn.has(e)))for(var i=0;i<r.length;i++){var a=r[i];a.f&2?lr(a,t,!1):t===a&&(n?tt(a,_):a.f&1024&&tt(a,v),Vt(a))}}function ur(e){var t=$n,n=er,r=tr,i=L,a=Zn,o=We,s=Jn,c=ar,l=e.f;$n=null,er=0,tr=null,L=l&96?null:e,Zn=null,Ge(e.ctx),Jn=!1,ar=++ir,e.ac!==null&&(ct(()=>{e.ac.abort(ge)}),e.ac=null);try{e.f|=ae;var u=e.fn,d=u();e.f|=te;var f=dr(e);if(Ye()&&tr!==null&&!Jn&&f!==null&&!(e.f&6146))for(var p=0;p<tr.length;p++)lr(tr[p],e);if(i!==null&&i!==e){if(ir++,i.deps!==null)for(let e=0;e<n;e+=1)i.deps[e].rv=ir;if(t!==null)for(let e of t)e.rv=ir;tr!==null&&(r===null?r=tr:r.push(...tr))}return e.f&8388608&&(e.f^=se),d}catch(t){return dr(e),vn(t)}finally{e.f^=ae,$n=t,er=n,tr=r,L=i,Zn=a,Ge(o),Jn=s,ar=c}}function dr(e){var t=e.deps,n=A?.is_fork;if($n!==null){var r;if(n||pr(e,er),t!==null&&er>0)for(t.length=er+$n.length,r=0;r<$n.length;r++)t[er+r]=$n[r];else e.deps=t=$n;if(Cn()&&e.f&512)for(r=er;r<t.length;r++)(t[r].reactions??=[]).push(e)}else!n&&t!==null&&er<t.length&&(pr(e,er),t.length=er);return t}function fr(e,r){let i=r.reactions;if(i!==null){var a=t.call(i,e);if(a!==-1){var o=i.length-1;o===0?i=r.reactions=null:(i[a]=i[o],i.pop())}}if(i===null&&r.f&2&&($n===null||!n.call($n,r))){var s=r;s.f&512&&(s.f^=512),s.v!==w&&nt(s),s.ac!==null&&ct(()=>{s.ac.abort(ge),s.ac=null,tt(s,_)}),xt(s),pr(s,0)}}function pr(e,t){var n=e.deps;if(n!==null)for(var r=t;r<n.length;r++)fr(e,n[r])}function mr(e){var t=e.f;if(!(t&16384)){tt(e,g);var n=R;R=e;try{t&16777232?In(e):Fn(e),Pn(e);var r=ur(e);e.teardown=typeof r==`function`?r:null,e.wv=rr}finally{R=n}}}async function hr(){if(He)return new Promise(e=>{requestAnimationFrame(()=>e()),setTimeout(()=>e())});await Promise.resolve(),Ft()}function z(e){var t=!!(e.f&2);if(Gn?.add(e),L!==null&&!Jn&&!(R!==null&&R.f&16384)&&(Zn===null||!Zn.has(e))){var r=L.deps;if(L.f&2097152)e.rv<ir&&(e.rv=ir,$n===null&&r!==null&&r[er]===e?er++:$n===null?$n=[e]:$n.push(e));else{L.deps??=[],n.call(L.deps,e)||L.deps.push(e);var i=e.reactions;i===null?e.reactions=[L]:n.call(i,L)||i.push(L)}}if(Kn&&Gt.has(e))return Gt.get(e);if(t){var a=e;if(Kn){var o=a.v;return(!(a.f&1024)&&a.reactions!==null||_r(a))&&(o=yt(a)),Gt.set(a,o),o}var s=!(a.f&512)&&!Jn&&L!==null&&!!(L.f&512),c=(a.f&te)===0;cr(a)&&(s&&(a.f|=512),bt(a)),s&&!c&&(St(a),gr(a))}if(Et?.has(e))return Et.get(e);if(e.f&8388608)throw e.v;return e.v}function gr(e){if(e.f|=512,e.deps!==null)for(let r of e.deps){var t=r.reactions;t===null?r.reactions=[e]:n.call(t,e)||t.push(e),r.f&2&&!(r.f&512)&&(St(r),gr(r))}}function _r(e){if(e.v===w)return!0;if(e.deps===null)return!1;for(let t of e.deps)if(Gt.has(t)||t.f&2&&_r(t))return!0;return!1}function vr(e){var t=Jn;try{return Jn=!0,e()}finally{Jn=t}}function yr(e){return e.endsWith(`capture`)&&e!==`gotpointercapture`&&e!==`lostpointercapture`}var br=[`beforeinput`,`click`,`change`,`dblclick`,`contextmenu`,`focusin`,`focusout`,`input`,`keydown`,`keyup`,`mousedown`,`mousemove`,`mouseout`,`mouseover`,`mouseup`,`pointerdown`,`pointermove`,`pointerout`,`pointerover`,`pointerup`,`touchend`,`touchmove`,`touchstart`];function xr(e){return br.includes(e)}var Sr=`allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback`.split(`.`),Cr={formnovalidate:`formNoValidate`,ismap:`isMap`,nomodule:`noModule`,playsinline:`playsInline`,readonly:`readOnly`,defaultvalue:`defaultValue`,defaultchecked:`defaultChecked`,srcobject:`srcObject`,novalidate:`noValidate`,allowfullscreen:`allowFullscreen`,disablepictureinpicture:`disablePictureInPicture`,disableremoteplayback:`disableRemotePlayback`};function wr(e){return e=e.toLowerCase(),Cr[e]??e}[...Sr];var Tr=[`touchstart`,`touchmove`];function Er(e){return Tr.includes(e)}var Dr=Symbol(`events`),Or=new Set,kr=new Set;function Ar(e,t,n,r={}){function i(e){if(r.capture||Ir.call(t,e),!e.cancelBubble)return ct(()=>n?.call(this,e))}return e.startsWith(`pointer`)||e.startsWith(`touch`)||e===`wheel`?(i.__removed=!1,Qe(()=>{i.__removed||t.addEventListener(e,i,r)})):t.addEventListener(e,i,r),i}function jr(e,t,n,r={}){var i=Ar(t,e,n,r);return()=>{i.__removed=!0,e.removeEventListener(t,i,r)}}function Mr(e,t,n){(t[Dr]??={})[e]=n}function Nr(e){for(var t=0;t<e.length;t++)Or.add(e[t]);for(var n of kr)n(e)}var Pr=null,Fr=!1;function Ir(e){var t=this,n=t.ownerDocument,r=e.type,a=e.composedPath?.()||[],o=a[0]||e.target;Pr=e,Fr||(Fr=!0,setTimeout(()=>{Fr=!1,Pr=null}));var s=0,c=Pr===e&&e[Dr];if(c){var l=a.indexOf(c);if(l!==-1&&(t===document||t===window)){e[Dr]=t;return}var u=a.indexOf(t);if(u===-1)return;l<=u&&(s=l)}if(o=a[s]||e.target,o!==t){i(e,`currentTarget`,{configurable:!0,get(){return o||n}});var d=L,f=R;Yn(null),Xn(null);try{for(var p,m=[];o!==null&&o!==t;){try{var h=o[Dr]?.[r];h!=null&&(!o.disabled||e.target===o)&&h.call(o,e)}catch(e){p?m.push(e):p=e}if(e.cancelBubble)break;s++,o=s<a.length?a[s]:null}if(p){for(let e of m)queueMicrotask(()=>{throw e});throw p}}finally{e[Dr]=t,delete e.currentTarget,Yn(d),Xn(f)}}}var Lr=globalThis?.window?.trustedTypes&&globalThis.window.trustedTypes.createPolicy(`svelte-trusted-html`,{createHTML:e=>e});function Rr(e){return Lr?.createHTML(e)??e}function zr(e){var t=gn(`template`);return t.innerHTML=Rr(e.replaceAll(`<!>`,`<!---->`)),t.content}function Br(e,t){var n=R;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function B(e,t){var n=!!(t&1),r=!!(t&2),i,a=!e.startsWith(`<!>`);return()=>{if(E)return Br(D,null),D;i===void 0&&(i=zr(a?e:`<!>`+e),n||(i=dn(i)));var t=r||on?document.importNode(i,!0):i.cloneNode(!0);if(n){var o=dn(t),s=t.lastChild;Br(o,s)}else Br(t,t);return t}}function Vr(e,t,n=`svg`){var r=!e.startsWith(`<!>`),i=!!(t&1),a=`<${n}>${r?e:`<!>`+e}</${n}>`,o;return()=>{if(E)return Br(D,null),D;if(!o){var e=dn(zr(a));if(i)for(o=document.createDocumentFragment();dn(e);)o.appendChild(dn(e));else o=dn(e)}var t=o.cloneNode(!0);if(i){var n=dn(t),r=t.lastChild;Br(n,r)}else Br(t,t);return t}}function Hr(e,t){return Vr(e,t,`svg`)}function Ur(){if(E)return Br(D,null),D;var e=document.createDocumentFragment(),t=document.createComment(``),n=un();return e.append(t,n),Br(t,n),e}function V(e,t){if(E){var n=R;(!(n.f&32768)||n.nodes.end===null)&&(n.nodes.end=D),we();return}e!==null&&e.before(t)}function Wr(e){let t=0,n=qt(0),r;return()=>{Cn()&&(z(n),An(()=>(t===0&&(r=vr(()=>e(()=>$t(n)))),t+=1,()=>{Qe(()=>{--t,t===0&&(r?.(),r=void 0,$t(n))})})))}}var Gr=re|b;function Kr(e,t,n,r){new qr(e,t,n,r)}var qr=class{parent;is_pending=!1;transform_error;#e;#t=E?D:null;#n;#r;#i;#a=null;#o=null;#s=null;#c=null;#l=0;#u=0;#d=!1;#f=new Set;#p=new Set;#m=null;#h=Wr(()=>(this.#m=qt(this.#l),()=>{this.#m=null}));constructor(e,t,n,r){this.#e=e,this.#n=t,this.#r=e=>{var t=R;t.b=this,t.f|=128,n(e)},this.parent=R.b,this.transform_error=r??this.parent?.transform_error??(e=>e),this.#i=jn(()=>{if(E){let e=De(this.#t);we();let t=e===`[!`;if(e.startsWith(`[?`)){let t=JSON.parse(e.slice(2));this.#_(t)}else t?this.#b():this.#g()}else this.#x()},Gr),E&&(this.#e=D)}#g(){try{this.#a=Nn(()=>this.#r(this.#e))}catch(e){this.error(e)}}#_(e){let t=this.#n.failed,{reset:n,invoke_onerror:r}=this.#v(e);Qe(r),t&&(this.#s=Nn(()=>{t(this.#e,()=>e,()=>n)}))}#v(e){var t=!1,n=!1;let r=()=>{if(!this.#y()){if(t){xe();return}t=!0,n&&Ve(),this.#s!==null&&Bn(this.#s,()=>{this.#s=null}),this.#C(()=>{this.#x()})}};return{reset:r,invoke_onerror:()=>{if(!this.#y())try{n=!0,this.#n.onerror?.(e,r),n=!1}catch(e){yn(e,this.#i&&this.#i.parent)}}}}#y(){return(this.#i.f&(ee|ne))!==0}#b(){let e=this.#n.pending;e&&(this.is_pending=!0,this.#o=Nn(()=>e(this.#e)),Qe(()=>{if(!this.#y()){var e=this.#c=document.createDocumentFragment(),t=un(),n=!1;if(e.append(t),this.#a=this.#C(()=>{try{return Nn(()=>this.#r(t))}catch(e){try{this.error(e),n=!0}catch(e){yn(e,this.#i.parent)}return null}}),this.#a===null){this.#c=null,n&&this.#S(A);return}this.#u===0&&(this.#e.before(e),this.#c=null,Bn(this.#o,()=>{this.#o=null}),this.#S(A))}}))}#x(){try{if(this.is_pending=this.has_pending_snippet(),this.#u=0,this.#l=0,this.#a=Nn(()=>{this.#r(this.#e)}),this.#u>0){var e=this.#c=document.createDocumentFragment();Wn(this.#a,e);let t=this.#n.pending;this.#o=Nn(()=>t(this.#e))}else this.#S(A)}catch(e){this.error(e)}}#S(e){this.is_pending=!1,e.transfer_effects(this.#f,this.#p)}defer_effect(e){rt(e,this.#f,this.#p)}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!this.#n.pending}#C(e){var t=R,n=L,r=We;Xn(this.#i),Yn(this.#i),Ge(this.#i.ctx);try{return Pt.ensure(),e()}finally{Xn(t),Yn(n),Ge(r)}}#w(e,t){if(!this.has_pending_snippet()){this.parent&&this.parent.#w(e,t);return}this.#u+=e,this.#u===0&&(this.#S(t),this.#o&&Bn(this.#o,()=>{this.#o=null}),this.#c&&=(this.#e.before(this.#c),null))}update_pending_count(e,t){this.#w(e,t),this.#l+=e,!(!this.#m||this.#d)&&(this.#d=!0,Qe(()=>{this.#d=!1,this.#m&&Zt(this.#m,this.#l)}))}get_effect_pending(){return this.#h(),z(this.#m)}error(e){if(e===C||!this.#n.onerror&&!this.#n.failed)throw e;A?.is_fork?(this.#a&&A.skip_effect(this.#a),this.#o&&A.skip_effect(this.#o),this.#s&&A.skip_effect(this.#s),A.oncommit(()=>{this.#y()||this.#T(e)})):this.#T(e)}#T(e){this.#a&&=(Ln(this.#a),null),this.#o&&=(Ln(this.#o),null),this.#s&&=(Ln(this.#s),null),E&&(Ce(this.#t),Te(),Ce(Ee()));let t=this.#n.failed,n=e=>{if(this.#y())return;let{reset:n,invoke_onerror:r}=this.#v(e);r(),t&&!this.#y()&&(this.#s=this.#C(()=>{try{return Nn(()=>{var r=R;r.b=this,r.f|=128,t(this.#e,()=>e,()=>n)})}catch(e){return yn(e,this.#i.parent),null}}))};Qe(()=>{if(!this.#y()){var t;try{t=this.transform_error(e)}catch(e){yn(e,this.#i&&this.#i.parent);return}typeof t==`object`&&t&&typeof t.then==`function`?t.then(n,e=>yn(e,this.#i&&this.#i.parent)):n(t)}})}},Jr=!0;function H(e,t){var n=t==null?``:typeof t==`object`?`${t}`:t;n!==(e[me]??=e.nodeValue)&&(e[me]=n,e.nodeValue=`${n}`)}function Yr(e,t){return Zr(e,t)}var Xr=new Map;function Zr(e,{target:t,anchor:n,props:i={},events:a,context:o,intro:s=!0,transformError:c}){ln();var l=void 0,u=Dn(()=>{var u=n??t.appendChild(un());Kr(u,{pending:()=>{}},t=>{Ke({});var n=We;if(o&&(n.c=o),a&&(i.$$events=a),E&&Br(t,null),Jr=s,l=e(t,i)||Je(),Jr=!0,E&&(R.nodes.end=D,D===null||D.nodeType!==8||D.data!==`]`))throw T(),C;qe()},c);var d=new Set,f=e=>{for(var n=0;n<e.length;n++){var r=e[n];if(!d.has(r)){d.add(r);var i=Er(r);for(let e of[t,document]){var a=Xr.get(e);a===void 0&&(a=new Map,Xr.set(e,a));var o=a.get(r);o===void 0?(e.addEventListener(r,Ir,{passive:i}),a.set(r,1)):a.set(r,o+1)}}}};return f(r(Or)),kr.add(f),()=>{for(var e of d)for(let n of[t,document]){var r=Xr.get(n),i=r.get(e);--i==0?(n.removeEventListener(e,Ir),r.delete(e),r.size===0&&Xr.delete(n)):r.set(e,i)}kr.delete(f),u!==n&&u.parentNode?.removeChild(u)}});return Qr.set(l,u),l}var Qr=new WeakMap,$r=class{anchor;#e=new Map;#t=new Map;#n=new Map;#r=new Set;#i=!0;constructor(e,t=!0){this.anchor=e,this.#i=t}#a=e=>{if(this.#e.has(e)){var t=this.#e.get(e),n=this.#t.get(t);if(n)Hn(n),this.#r.delete(t);else{var r=this.#n.get(t);r&&(Hn(r.effect),this.#t.set(t,r.effect),this.#n.delete(t),r.fragment.lastChild.remove(),this.anchor.before(r.fragment),n=r.effect)}for(let[t,n]of this.#e){if(this.#e.delete(t),t===e)break;let r=this.#n.get(n);r&&(Ln(r.effect),this.#n.delete(n))}for(let[e,r]of this.#t){if(e===t||this.#r.has(e))continue;let i=()=>{if(Array.from(this.#e.values()).includes(e)){var t=document.createDocumentFragment();Wn(r,t),t.append(un()),this.#n.set(e,{effect:r,fragment:t})}else Ln(r);this.#r.delete(e),this.#t.delete(e)};this.#i||!n?(this.#r.add(e),Bn(r,i,!1)):i()}}};#o=e=>{this.#e.delete(e);let t=Array.from(this.#e.values());for(let[e,n]of this.#n)t.includes(e)||(Ln(n.effect),this.#n.delete(e))};ensure(e,t){var n=A,r=hn();if(t&&!this.#t.has(e)&&!this.#n.has(e)){if(r){var i=document.createDocumentFragment(),a=un();i.append(a),this.#n.set(e,{effect:Nn(()=>t(a)),fragment:i})}else this.#t.set(e,Nn(()=>t(this.anchor)))}if(this.#e.set(n,e),r){for(let[t,r]of this.#t)t===e?n.unskip_effect(r):n.skip_effect(r);for(let[t,r]of this.#n)t===e?n.unskip_effect(r.effect):n.skip_effect(r.effect);n.oncommit(this.#a),n.ondiscard(this.#o)}else E&&(this.anchor=D),this.#a(n)}};function U(e,t,n=!1){var r;E&&(r=D,we());var i=new $r(e),a=n?re:0;function o(e,t){if(E){var n=De(r);if(e!==parseInt(n.substring(1))){var a=Ee();Ce(a),i.anchor=a,Se(!1),i.ensure(e,t),Se(!0);return}}i.ensure(e,t)}jn(()=>{var e=!1;t((t,n=0)=>{e=!0,o(n,t)}),e||o(-1,null)},a)}var ei=Symbol(`NaN`);function ti(e,t,n){E&&we();var r=new $r(e),i=!Ye();jn(()=>{var e=t();e!==e&&(e=ei),i&&typeof e==`object`&&e&&(e={}),r.ensure(e,n)})}function ni(e,t,n){for(var i=[],a=t.length,o,s=t.length,c=0;c<a;c++){let n=t[c];Bn(n,()=>{if(o){if(o.pending.delete(n),o.done.add(n),o.pending.size===0){var t=e.outrogroups;ri(e,r(o.done)),t.delete(o),t.size===0&&(e.outrogroups=null)}}else--s},!1)}if(s===0){var l=i.length===0&&n!==null&&e.pending.size===0;if(l){var u=n,d=u.parentNode;mn(d),d.append(u),e.items.clear()}ri(e,t,!l)}else o={pending:new Set(t),done:new Set},(e.outrogroups??=new Set).add(o)}function ri(e,t,n=!0){var r;if(e.pending.size>0){r=new Set;for(let t of e.pending.values())for(let n of t)r.add(e.items.get(n).e)}for(var i=0;i<t.length;i++){var a=t[i];r?.has(a)?(a.f|=ie,Wn(a,document.createDocumentFragment())):Ln(t[i],n)}}var ii;function ai(t,n,i,a,o,s=null){var c=t,l=new Map;if(n&4){var u=t;c=E?Ce(dn(u)):u.appendChild(un())}E&&we();var d=null,f=_t(()=>{var t=i();return e(t)?t:t==null?[]:r(t)}),p=new Map,m=!0;function h(e){if(!(_.effect.f&16384)){_.pending.delete(e);var t=z(f);_.fallback=d,si(_,t,c,n,a),d!==null&&(t.length===0?d.f&33554432?(d.f^=ie,li(d,null,c)):Hn(d):Bn(d,()=>{d=null}))}}function g(e){_.pending.delete(e)}var _={effect:jn(()=>{var e=z(f),t=e.length;let r=!1;E&&De(c)===`[!`!=(t===0)&&(c=Ee(),Ce(c),Se(!1),r=!0);for(var u=new Set,_=A,v=hn(),y=0;y<t;y+=1){E&&D.nodeType===8&&D.data===`]`&&(c=D,r=!0,Se(!1));var ee=e[y],te=a(ee,y),ne=m?null:l.get(te);ne?(ne.v&&Zt(ne.v,ee),ne.i&&Zt(ne.i,y),v&&_.unskip_effect(ne.e)):(ne=ci(l,m?c:ii??=un(),ee,te,y,o,n,i),m||(ne.e.f|=ie),l.set(te,ne)),u.add(te)}if(t===0&&s&&!d&&(m?d=Nn(()=>s(c)):(d=Nn(()=>s(ii??=un())),d.f|=ie)),t>u.size&&Me(``,``,``),E&&t>0&&Ce(Ee()),!m){if(p.set(_,u),v){for(let[e,t]of l)u.has(e)||_.skip_effect(t.e);_.oncommit(h),_.ondiscard(g)}else h(_)}r&&Se(!0),z(f)}),flags:n,items:l,pending:p,outrogroups:null,fallback:d};m=!1,E&&(c=D)}function oi(e){for(;e!==null&&!(e.f&32);)e=e.next;return e}function si(e,t,n,i,a){var o=!!(i&8),s=t.length,c=e.items,l=oi(e.effect.first),u,d=null,f,p=[],m=[],h,g,_,v;if(o)for(v=0;v<s;v+=1)h=t[v],g=a(h,v),_=c.get(g).e,_.f&33554432||(_.nodes?.a?.measure(),(f??=new Set).add(_));for(v=0;v<s;v+=1){if(h=t[v],g=a(h,v),_=c.get(g).e,e.outrogroups!==null)for(let t of e.outrogroups)t.pending.delete(_),t.done.delete(_);if(_.f&8192&&(Hn(_),o&&(_.nodes?.a?.unfix(),(f??=new Set).delete(_))),_.f&33554432){if(_.f^=ie,_===l)li(_,null,n);else{var y=d?d.next:l;_===e.effect.last&&(e.effect.last=_.prev),_.prev&&(_.prev.next=_.next),_.next&&(_.next.prev=_.prev),ui(e,d,_),ui(e,_,y),li(_,y,n),d=_,p=[],m=[],l=oi(d.next);continue}}if(_!==l){if(u!==void 0&&u.has(_)){if(p.length<m.length){var ee=m[0],te;d=ee.prev;var ne=p[0],re=p[p.length-1];for(te=0;te<p.length;te+=1)li(p[te],ee,n);for(te=0;te<m.length;te+=1)u.delete(m[te]);ui(e,ne.prev,re.next),ui(e,d,ne),ui(e,re,ee),l=ee,d=re,--v,p=[],m=[]}else u.delete(_),li(_,l,n),ui(e,_.prev,_.next),ui(e,_,d===null?e.effect.first:d.next),ui(e,d,_),d=_;continue}for(p=[],m=[];l!==null&&l!==_;)(u??=new Set).add(l),m.push(l),l=oi(l.next);if(l===null)continue}_.f&33554432||p.push(_),d=_,l=oi(_.next)}if(e.outrogroups!==null){for(let t of e.outrogroups)t.pending.size===0&&(ri(e,r(t.done)),e.outrogroups?.delete(t));e.outrogroups.size===0&&(e.outrogroups=null)}if(l!==null||u!==void 0){var b=[];if(u!==void 0)for(_ of u)_.f&8192||b.push(_);for(;l!==null;)!(l.f&8192)&&l!==e.fallback&&b.push(l),l=oi(l.next);var x=b.length;if(x>0){var ae=i&4&&s===0?n:null;if(o){for(v=0;v<x;v+=1)b[v].nodes?.a?.measure();for(v=0;v<x;v+=1)b[v].nodes?.a?.fix()}ni(e,b,ae)}}o&&Qe(()=>{if(f!==void 0)for(_ of f)_.nodes?.a?.apply()})}function ci(e,t,n,r,i,a,o,s){var c=o&1?o&16?qt(n):Jt(n,!1,!1):null,l=o&2?qt(i):null;return{v:c,i:l,e:Nn(()=>(a(t,c??n,l??i,s),()=>{e.delete(r)}))}}function li(e,t,n){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,a=t&&!(t.f&33554432)?t.nodes.start:n;r!==null;){var o=fn(r);if(a.before(r),r===i)return;r=o}}function ui(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}function di(e,t,...n){var r=new $r(e);jn(()=>{let e=t()??null;r.ensure(e,e&&(t=>e(t,...n)))},re)}function fi(e,t,n){var r;E&&(r=D,we());var i=new $r(e);jn(()=>{var e=t()??null;if(E&&De(r)===`[`!=(e!==null)){var a=Ee();Ce(a),i.anchor=a,Se(!1),i.ensure(e,e&&(t=>n(t,e))),Se(!0);return}i.ensure(e,e&&(t=>n(t,e)))},re)}var pi=()=>performance.now(),mi={tick:e=>requestAnimationFrame(e),now:()=>pi(),tasks:new Set};function hi(){let e=mi.now();mi.tasks.forEach(t=>{t.c(e)||(mi.tasks.delete(t),t.f())}),mi.tasks.size!==0&&mi.tick(hi)}function gi(e){let t;return mi.tasks.size===0&&mi.tick(hi),{promise:new Promise(n=>{mi.tasks.add(t={c:e,f:n})}),abort(){mi.tasks.delete(t)}}}function _i(e,t){ct(()=>{e.dispatchEvent(new CustomEvent(t))})}function vi(e){if(e===`float`)return`cssFloat`;if(e===`offset`)return`cssOffset`;if(e.startsWith(`--`))return e;let t=e.split(`-`);return t.length===1?t[0]:t[0]+t.slice(1).map(e=>e[0].toUpperCase()+e.slice(1)).join(``)}function yi(e){let t={},n=e.split(`;`);for(let e of n){let[n,r]=e.split(`:`);if(!n||r===void 0)break;let i=vi(n.trim());t[i]=r.trim()}return t}var bi=e=>e;function xi(e,t,n,r){var i=!!(e&1),a=!!(e&2),o=i&&a,s=!!(e&4),c=o?`both`:i?`in`:`out`,l,u=t.inert,d=t.style.overflow,f,p;function m(){return ct(()=>l??=n()(t,r?.()??{},{direction:c}))}var h={is_global:s,in(){if(t.inert=u,!i){p?.abort(),p?.reset?.();return}a||f?.abort(),f=Si(t,m(),p,1,()=>{_i(t,`introstart`)},()=>{_i(t,`introend`),f?.abort(),f=l=void 0,t.style.overflow=d})},out(e){if(!a){e?.(),l=void 0;return}t.inert=!0,p=Si(t,m(),f,0,()=>{_i(t,`outrostart`)},()=>{_i(t,`outroend`),e?.()})},stop:()=>{f?.abort(),p?.abort()}},g=R;if((g.nodes.t??=[]).push(h),i&&Jr){var _=s;if(!_){for(var v=g.parent;v&&v.f&65536;)for(;(v=v.parent)&&!(v.f&16););_=!v||!!(v.f&32768)}_&&On(()=>{vr(()=>h.in())})}}function Si(e,t,n,r,i,a){var o=r===1,s=!1;if(d(t)){var c;return Qe(()=>{s||(c=Si(e,t({direction:o?`in`:`out`}),n,r,i,a))}),{abort:()=>{s=!0,c?.abort()},deactivate:()=>c?.deactivate(),reset:()=>c?.reset(),t:()=>c?.t()??1-r}}if(n?.deactivate(),!t?.duration&&!t?.delay)return i(),a(),{abort:f,deactivate:f,reset:f,t:()=>r};let{delay:l=0,css:u,tick:p,easing:m=bi}=t;var h,g=()=>1-r;return Qe(()=>{if(!s){var c=[];if(o&&n===void 0&&(p&&p(0,1),u)){var d=yi(u(0,1));c.push(d,d)}h=e.animate(c,{duration:l,fill:`forwards`}),h.onfinish=()=>{h.cancel(),i();var o=n?.t()??1-r;n?.abort();var s=r-o,c=t.duration*Math.abs(s),l=[];if(c>0){var d=!1;if(u)for(var f=Math.ceil(c/(1e3/60)),_=0;_<=f;_+=1){var v=o+s*m(_/f),y=yi(u(v,1-v));l.push(y),d||=y.overflow===`hidden`}d&&(e.style.overflow=`hidden`),g=()=>{var e=h.currentTime;return o+s*m(e/c)},p&&gi(()=>{if(h.playState!==`running`)return!1;var e=g();return p(e,1-e),!0})}h=e.animate(l,{duration:c,fill:`forwards`}),h.onfinish=()=>{g=()=>r,p?.(r,1-r),a()}}}}),{abort:()=>{s=!0,h&&(h.cancel(),h.effect=null,h.onfinish=f)},deactivate:()=>{a=f},reset:()=>{r===0&&p?.(1,0)},t:()=>g()}}function Ci(e,t){var n=void 0,r;Mn(()=>{n!==(n=t())&&(r&&=(Ln(r),null),n&&(r=Nn(()=>{On(()=>n(e))})))})}function wi(e){var t,n,r=``;if(typeof e==`string`||typeof e==`number`)r+=e;else if(typeof e==`object`){if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(n=wi(e[t]))&&(r&&(r+=` `),r+=n)}else for(n in e)e[n]&&(r&&(r+=` `),r+=n)}return r}function Ti(){for(var e,t,n=0,r=``,i=arguments.length;n<i;n++)(e=arguments[n])&&(t=wi(e))&&(r&&(r+=` `),r+=t);return r}function Ei(e){return typeof e==`object`?Ti(e):e??``}var Di=[...` 	
\r\f\xA0\v﻿`];function Oi(e,t,n){var r=e==null?``:``+e;if(t&&(r=r?r+` `+t:t),n){for(var i of Object.keys(n))if(n[i])r=r?r+` `+i:i;else if(r.length)for(var a=i.length,o=0;(o=r.indexOf(i,o))>=0;){var s=o+a;(o===0||Di.includes(r[o-1]))&&(s===r.length||Di.includes(r[s]))?r=(o===0?``:r.substring(0,o))+r.substring(s+1):o=s}}return r===``?null:r}function ki(e,t=!1){var n=t?` !important;`:`;`,r=``;for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==``&&(r+=` `+i+`: `+a+n)}return r}function Ai(e){return e[0]!==`-`||e[1]!==`-`?e.toLowerCase():e}function ji(e,t){if(t){var n=``,r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\/\*.*?\*\//g,``).trim();var a=!1,o=0,s=!1,c=[];r&&c.push(...Object.keys(r).map(Ai)),i&&c.push(...Object.keys(i).map(Ai));var l=0,u=-1;let t=e.length;for(var d=0;d<t;d++){var f=e[d];if(s?f===`/`&&e[d-1]===`*`&&(s=!1):a?a===f&&(a=!1):f===`/`&&e[d+1]===`*`?s=!0:f===`"`||f===`'`?a=f:f===`(`?o++:f===`)`&&o--,!s&&a===!1&&o===0){if(f===`:`&&u===-1)u=d;else if(f===`;`||d===t-1){if(u!==-1){var p=Ai(e.substring(l,u).trim());if(!c.includes(p)){f!==`;`&&d++;var m=e.substring(l,d).trim();n+=` `+m+`;`}}l=d+1,u=-1}}}}return r&&(n+=ki(r)),i&&(n+=ki(i,!0)),n=n.trim(),n===``?null:n}return e==null?null:String(e)}function Mi(e,t,n,r,i,a){var o=e[pe];if(E||o!==n||o===void 0){var s=Oi(n,r,a);(!E||s!==e.getAttribute(`class`))&&(s==null?e.removeAttribute(`class`):t?e.className=s:e.setAttribute(`class`,s)),e[pe]=n}else if(a&&i!==a)for(var c in a){var l=!!a[c];(i==null||l!==!!i[c])&&e.classList.toggle(c,l)}return a}function Ni(e,t={},n,r){for(var i in n){var a=n[i];t[i]!==a&&(n[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,r))}}function Pi(e,t,n,r){var i=e[S];if(E||i!==t){var a=ji(t,r);(!E||a!==e.getAttribute(`style`))&&(a==null?e.removeAttribute(`style`):e.style.cssText=a),e[S]=t}else r&&(Array.isArray(r)?(Ni(e,n?.[0],r[0]),Ni(e,n?.[1],r[1],`important`)):Ni(e,n,r));return r}function Fi(e,t){t?e.hasAttribute(`selected`)||e.setAttribute(`selected`,``):e.removeAttribute(`selected`)}function Ii(e,t){var n=!(`__defaultValue`in e);(n||e.__defaultValue!==t)&&(e.__defaultValue=t,Li(e,!n||`__value`in e))}function Li(t,n){var r=t.__defaultValue,i=t.multiple,a=i?r??[]:null;if(!i||e(a)){var o=t.selectedIndex,s=n&&i?new Set(t.selectedOptions):null;for(var c of t.options){var l=Bi(c);Fi(c,i?a.includes(l):rn(l,r))}if(n){if(s!==null)for(c of t.options){var u=s.has(c);c.selected!==u&&(c.selected=u)}else t.selectedIndex!==o&&(t.selectedIndex=o)}}}function Ri(t,n,r=!1){if(t.multiple){if(n==null)return;if(!e(n))return be();for(var i of t.options)i.selected=n.includes(Bi(i));return}for(i of t.options)if(rn(Bi(i),n)){i.selected=!0;return}(!r||n!==void 0)&&(t.selectedIndex=-1)}function zi(e){var t=new MutationObserver(t=>{t.every(Vi)||(`__defaultValue`in e&&Li(e,!1),`__value`in e&&Ri(e,e.__value))});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`value`]}),wn(()=>{t.disconnect()})}function Bi(e){return`__value`in e?e.__value:e.value}function Vi(e){if(e.target.closest(`selectedcontent`)!==null)return!0;if(e.type===`childList`){var t=[...e.addedNodes,...e.removedNodes];return t.length>0&&t.every(e=>e.nodeName===`SELECTEDCONTENT`)}return!1}var Hi=Symbol(`class`),Ui=Symbol(`style`),Wi=Symbol(`is custom element`),Gi=Symbol(`is html`),Ki=_e?`link`:`LINK`,qi=_e?`input`:`INPUT`,Ji=_e?`option`:`OPTION`,Yi=_e?`select`:`SELECT`,Xi=_e?`progress`:`PROGRESS`;function Zi(e){if(E){var t=!1,n=()=>{if(!t){if(t=!0,e.hasAttribute(`value`)){var n=e.value;W(e,`value`,null),e.value=n}if(e.hasAttribute(`checked`)){var r=e.checked;W(e,`checked`,null),e.checked=r}}};e[he]=n,Qe(n),st()}}function W(e,t,n,r){var i=$i(e);E&&(i[t]=e.getAttribute(t),t===`src`||t===`srcset`||t===`href`&&e.nodeName===Ki)||i[t]!==(i[t]=n)&&(t===`loading`&&(e[de]=n),n==null?e.removeAttribute(t):typeof n!=`string`&&ta(e).has(t)?e[t]=n:e.setAttribute(t,n))}function Qi(e,t,n,r,i=!1,a=!1){E&&i&&e.nodeName===qi&&(`defaultValue`in n||`defaultChecked`in n||Zi(e));var o=$i(e),s=o[Wi],c=!o[Gi];let l=E&&s;l&&Se(!1);var u=t||{},d=e.nodeName===Ji,f=e.nodeName===Yi;try{for(var p in t)!(p in n)&&p[0]+p[1]!==`$$`&&(n[p]=null);n.class?n.class=Ei(n.class):(r||n[Hi])&&(n.class=null),n[Ui]&&(n.style??=null);var m=ta(e);if(e.nodeName===qi&&`type`in n&&(`value`in n||`__value`in n)){var h=n.type;(h!==u.type||h===void 0&&e.hasAttribute(`type`))&&(u.type=h,W(e,`type`,h,a))}for(let i in n){let l=n[i];if(d&&i===`value`&&l==null){e.value=e.__value=``,u[i]=l;continue}if(i===`class`){Mi(e,e.namespaceURI===`http://www.w3.org/1999/xhtml`,l,r,t?.[Hi],n[Hi]),u[i]=l,u[Hi]=n[Hi];continue}if(i===`style`){Pi(e,l,t?.[Ui],n[Ui]),u[i]=l,u[Ui]=n[Ui];continue}var g=u[i];if(l!==g||l===void 0&&e.hasAttribute(i)){u[i]=l;var _=i[0]+i[1];if(_!==`$$`){if(_===`on`){let t={},n=`$$`+i,r=i.slice(2);var v=xr(r);if(yr(r)&&(r=r.slice(0,-7),t.capture=!0),!v&&g){if(l!=null)continue;e.removeEventListener(r,u[n],t),u[n]=null}if(v)Mr(r,e,l),Nr([r]);else if(l!=null){function a(e){u[i].call(this,e)}u[n]=Ar(r,e,a,t)}}else if(i===`style`)W(e,i,l);else if(i===`autofocus`)it(e,!!l);else if(!s&&(i===`__value`||i===`value`&&l!=null))e.__value=l,(g==null||e.value!==l||l===0&&e.nodeName===Xi)&&(e.value=l);else if(i===`selected`&&d)Fi(e,l);else{var y=i;c||(y=wr(y));var ee=y===`defaultValue`||y===`defaultChecked`;if(f&&y===`defaultValue`)continue;if(l==null&&!s&&!ee){if(o[i]=null,y===`value`||y===`checked`){let n=e,r=t===void 0;if(y===`value`){let e=n.defaultValue;n.removeAttribute(y),n.defaultValue=e,n.value=n.__value=r?e:null}else{let e=n.defaultChecked;n.removeAttribute(y),n.defaultChecked=e,n.checked=r?e:!1}}else e.removeAttribute(i)}else ee||(s||typeof l!=`string`)&&m.has(y)?(e[y]=l,y in o&&(o[y]=w)):typeof l!=`function`&&W(e,y,l,a)}}}}}finally{l&&Se(!0)}return u}function G(e,t,n=[],r=[],i=[],a,o=!1,s=!1){ut(i,n,r,n=>{var r=void 0,i={},c=e.nodeName===Yi,l=!1;if(Mn(()=>{var u=t(...n.map(z)),d=Qi(e,r,u,a,o,s);if(l&&c){var f=e;`defaultValue`in u&&Ii(f,u.defaultValue),`value`in u&&Ri(f,u.value)}for(let e of Object.getOwnPropertySymbols(i))u[e]||Ln(i[e]);for(let t of Object.getOwnPropertySymbols(u)){var p=u[t];t.description===`@attach`&&(!r||p!==r[t])&&(i[t]&&Ln(i[t]),i[t]=Nn(()=>Ci(e,()=>p))),d[t]=p}r=d}),c){var u=e;On(()=>{var e=r;`defaultValue`in e&&Ii(u,e.defaultValue),Ri(u,e.value,!0),zi(u)})}l=!0})}function $i(e){return e[fe]??={[Wi]:e.nodeName.includes(`-`),[Gi]:e.namespaceURI===ve}}var ea=new Map;function ta(e){var t=e.getAttribute(`is`)||e.nodeName,n=ea.get(t);if(n)return n;ea.set(t,n=new Set);for(var r,i=e,a=Element.prototype;a!==i;){for(var s in r=o(i),r)r[s].set&&s!==`innerHTML`&&s!==`textContent`&&s!==`innerText`&&n.add(s);i=l(i)}return n}function na(e,t,n=t){var r=new WeakSet;lt(e,`input`,async i=>{var a=i?e.defaultValue:e.value;if(a=ra(e)?ia(a):a,n(a),A!==null&&r.add(A),await hr(),a!==(a=t())){var o=e.selectionStart,s=e.selectionEnd,c=e.value.length;if(e.value=a??``,s!==null){var l=e.value.length;o===s&&s===c&&l>c?(e.selectionStart=l,e.selectionEnd=l):(e.selectionStart=o,e.selectionEnd=Math.min(s,l))}}}),(E&&e.defaultValue!==e.value||vr(t)==null&&e.value)&&(n(ra(e)?ia(e.value):e.value),A!==null&&r.add(A)),An(()=>{var n=t();if(e===document.activeElement){var i=He?Tt:A;if(r.has(i))return}ra(e)&&n===ia(e.value)||(e.type!==`date`||n||e.value)&&n!==e.value&&(e.value=n??``)})}function ra(e){var t=e.type;return t===`number`||t===`range`}function ia(e){return e===``?null:+e}function aa(e,t){return e===t||e?.[ce]===t}function oa(e=Je(),t,n,r){var i=We.r,a=R;return On(()=>{var o,s;return An(()=>{o=s,s=r?.()||[],vr(()=>{aa(n(...s),e)||(t(e,...s),o&&aa(n(...o),e)&&t(null,...o))})}),()=>{let r=a;for(;r!==i&&r.parent!==null&&r.parent.f&33554432;)r=r.parent;let o=()=>{s&&aa(n(...s),e)&&t(null,...s)},c=r.teardown;r.teardown=()=>{o(),c?.()}}}),e}var sa=!1;function ca(e){var t=sa;try{return sa=!1,[e(),sa]}finally{sa=t}}var la={get(e,t){if(!e.exclude.has(t))return e.props[t]},set(e,t){return!1},getOwnPropertyDescriptor(e,t){if(!e.exclude.has(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},has(e,t){return!e.exclude.has(t)&&t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.has(t))}};function ua(e,t,n){return new Proxy({props:e,exclude:t},la)}function da(e,t,n,r){var i=!0,o=!!(n&8),s=!!(n&16),c=r,l=!0,u=void 0,d=()=>s&&i?(u??=mt(r),z(u)):(l&&(l=!1,c=s?vr(r):r),c);let f;if(o){var p=ce in e||ue in e;f=a(e,t)?.set??(p&&t in e?n=>e[t]=n:void 0)}var m,h=!1;o?[m,h]=ca(()=>e[t]):m=e[t],m===void 0&&r!==void 0&&(m=d(),f&&(i&&Le(t),f(m)));var g=i?()=>{var n=e[t];return n===void 0?d():(l=!0,n)}:()=>{var n=e[t];return n!==void 0&&(c=void 0),n===void 0?c:n};if(i&&!(n&4))return g;if(f){var _=e.$$legacy;return(function(e,t){return arguments.length>0?((!i||!t||_||h)&&f(t?g():e),e):g()})}var v=!1,y=(n&1?mt:_t)(()=>(v=!1,g()));o&&z(y);var ee=R;return(function(e,t){if(arguments.length>0){let n=t?z(y):i&&o?tn(e):e;return M(y,n),v=!0,c!==void 0&&(c=n),e}return Kn&&v||ee.f&16384?y.v:z(y)})}typeof window<`u`&&((window.__svelte??={}).v??=new Set).add(`5`),Ue();var[fa,...pa]=`project	place	position	glyph	text	reason
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
`),ma=fa.split(`	`),ha=pa.map(e=>{let t=e.split(`	`);return Object.fromEntries(ma.map((e,n)=>[e,t[n]??``]))}),ga=(e,t,n)=>{let r=ha.find(r=>r.project===e&&r.place===t&&r.position===String(n));if(!r)throw Error(`no starter ${e} ${t} ${n}`);return{glyph:r.glyph,text:r.text,reason:r.reason}},_a=[0,1,2].map(e=>ga(`Cawco`,`board`,e)),va=[ga(`Cawco`,`board`,1)],ya=[...[0,1,2,3].map(e=>ga(`Cawco`,`board`,e)),...[0,1,3].map(e=>ga(`Cawco-Dev`,`board`,e))],ba=[ga(`Cawco`,`board`,5),ga(`Cawco-Dev`,`board`,1),ga(`Cawco-Dev`,`board`,2)],xa=e=>e.map(({glyph:e,text:t})=>({glyph:e,text:t})),Sa={one:va,three:_a,seven:ya,longest:ba},K=(e,t,n={})=>({value:e,label:t,draws:{set:`three`,reasons:!0,loading:!1,expanded:!1,held:null,phase:`rest`,touch:!1,...n}}),q={loading:K(`loading`,`Loading`,{loading:!0}),one:K(`one`,`One`,{set:`one`}),three:K(`three`,`Three`),sevenCollapsed:K(`seven-collapsed`,`Seven collapsed`,{set:`seven`}),withReasons:K(`with-reasons`,`With reasons`),withoutReasons:K(`without-reasons`,`Without reasons`,{reasons:!1}),rest:K(`rest`,`Rest`),focus:K(`focus`,`Focus-visible`,{held:`focus`}),longest:K(`longest`,`Longest text at 380`,{set:`longest`})},Ca=[{value:`today`,label:`Today`,note:``,where:[`thread`,`board`,`phone`],data:[K(`three`,`Three`),K(`one`,`One`,{set:`one`}),K(`seven`,`Seven`,{set:`seven`}),K(`longest`,`Longest`,{set:`longest`}),K(`no-reasons`,`No reasons`,{reasons:!1}),K(`loading`,`Loading`,{loading:!0})]},{value:`drafts`,label:`Unsent drafts`,note:`Report: the stack stands right-aligned on the composer's end, and hides while the keyboard is up.`,where:[`thread`,`board`,`phone`,`keyboard`],data:[q.loading,K(`none`,`None (hidden)`,{set:`none`}),q.one,q.three,q.sevenCollapsed,K(`seven-expanded`,`Seven expanded`,{set:`seven`,expanded:!0}),q.withReasons,q.withoutReasons,q.rest,K(`hover`,`Hover`,{held:`hover`}),q.focus,K(`pressed`,`Pressed (travel)`,{held:`pressed`}),K(`filled`,`Filled (text in box, stack dimmed)`,{phase:`filled`}),K(`typing`,`Typing (hidden)`,{phase:`typing`}),K(`cleared`,`Composer cleared (returns)`,{phase:`cleared`}),K(`touch`,`Touch`,{touch:!0}),q.longest]},{value:`ledger`,label:`The ledger`,note:``,where:[`thread`,`board`,`phone`],data:[q.loading,K(`none`,`None`,{set:`none`}),q.one,q.three,q.sevenCollapsed,K(`seven-expanded`,`Seven expanded`,{set:`seven`,expanded:!0}),q.withReasons,q.withoutReasons,q.rest,K(`hover`,`Hover`,{held:`hover`}),q.focus,K(`pressed`,`Pressed`,{held:`pressed`}),K(`filled`,`Filled (pencil→check)`,{phase:`filled`}),K(`typing`,`Typing (faded)`,{phase:`typing`}),K(`cleared`,`Composer cleared`,{phase:`cleared`}),K(`refresh`,`Refresh pressed (rewriting, rows shimmer in place)`,{phase:`refresh`}),K(`touch`,`Touch`,{touch:!0}),q.longest]},{value:`tray`,label:`The tray`,note:`The design's stated change: the suggestions live in the composer's own frame, over its field, growing upward until the heading's room, then scrolling inside.`,where:[`thread`,`board`,`phone`,`keyboard`],data:[q.loading,K(`none`,`None (no tray)`,{set:`none`}),q.one,q.three,q.sevenCollapsed,K(`seven-expanded`,`Seven expanded (grows upward)`,{set:`seven`,expanded:!0}),q.withReasons,q.withoutReasons,q.rest,K(`hover`,`Hover (reason reveals)`,{held:`hover`}),q.focus,K(`pressed`,`Pressed (lift)`,{held:`pressed`}),K(`filled`,`Filled + chip row`,{phase:`filled`}),K(`scrolled`,`Chip row scrolled`,{phase:`scrolled`}),K(`reopened`,`Tray reopened via chevron`,{phase:`reopened`}),K(`cleared`,`Composer cleared (tray returns)`,{phase:`cleared`}),K(`sent`,`After first send (tray closed)`,{phase:`sent`}),K(`touch`,`Touch (reasons always shown)`,{touch:!0}),q.longest]}],wa={thread:{label:`Caw’s thread (380)`,width:380},board:{label:`The empty board (725)`,width:725},phone:{label:`The phone (390)`,width:390},keyboard:{label:`The phone, keyboard up (390)`,width:390}},Ta=[{value:`light`,label:`Light`},{value:`dark`,label:`Dark`}],Ea=e=>Ca.find(t=>t.value===e)?.note??``,Da=e=>{let t=Ca.find(t=>t.value===e)??Ca[0];return[{key:`direction`,label:`Direction`,entries:Ca.map(({value:e,label:t})=>({value:e,label:t}))},{key:`where`,label:`Where`,entries:t.where.map(e=>({value:e,label:wa[e].label}))},{key:`data`,label:`Data`,entries:t.data.map(({value:e,label:t})=>({value:e,label:t}))},{key:`theme`,label:`Theme`,entries:Ta}]};function Oa(e){let t=new Map((e??``).split(`,`).map(e=>e.split(`:`))),n=Ca.find(e=>e.value===t.get(`direction`))??Ca[0],r=(e,t)=>e.find(e=>e===t)??e[0];return{direction:n.value,where:r(n.where,t.get(`where`)),data:r(n.data.map(e=>e.value),t.get(`data`)),theme:r(Ta.map(e=>e.value),t.get(`theme`))}}var ka=e=>[`direction`,`where`,`data`,`theme`].map(t=>`${t}:${e[t]}`).join(`,`);function Aa(e){let t=Ca.find(t=>t.value===e.direction),n=t?.data.find(t=>t.value===e.data)?.draws??t?.data[0]?.draws,r=n.set===`none`?[]:Sa[n.set];return{...n,items:n.reasons?r:xa(r),touch:n.touch||e.where===`phone`||e.where===`keyboard`}}var ja=B(`<img alt="" src="caw/caw-ready-day.png"/><img alt="" src="caw/caw-ready-night.png"/>`,1);function Ma(e,t){let n=da(t,`class`,3,``);var r=ja(),i=pn(r),a=F(i);I(()=>{Mi(i,1,`${n()??``} caw-still day`),W(i,`height`,t.size),W(i,`width`,t.size),Mi(a,1,`${n()??``} caw-still night`),W(a,`height`,t.size),W(a,`width`,t.size)}),V(e,r)}var Na=class{#e;#t;constructor(e,t){this.#e=e,this.#t=Wr(t)}get current(){return this.#t(),this.#e()}},Pa=/\(.+\)/,Fa=new Set([`all`,`print`,`screen`,`and`,`or`,`not`,`only`]),Ia=new class extends Na{constructor(e,t){let n=Pa.test(e)||e.split(/[\s,]+/).some(e=>Fa.has(e.trim()))?e:`(${e})`,r=window.matchMedia(n);super(()=>r.matches,e=>jr(r,`change`,e))}}(`(prefers-reduced-motion: no-preference)`);function La(e,t,n,r){let i=3*e,a=3*(n-e)-i,o=1-i-a,s=3*t,c=3*(r-t)-s,l=1-s-c,u=e=>((o*e+a)*e+i)*e,d=e=>((l*e+c)*e+s)*e,f=e=>(3*o*e+2*a)*e+i,p=e=>{let t=e;for(let n=0;n<8;n+=1){let n=u(t)-e;if(Math.abs(n)<1e-6)return t;let r=f(t);if(Math.abs(r)<1e-6)break;t-=n/r}let n=0,r=1;for(t=e;r-n>1e-6;)u(t)<e?n=t:r=t,t=(n+r)/2;return t};return e=>e<=0?0:e>=1?1:d(p(e))}La(.23,1,.32,1),La(.77,0,.175,1);var Ra=La(.32,.72,0,1),za=`--dur-control.--dur-menu.--dur-pop.--dur-panel.--dur-grow.--dur-grow-exit.--dur-lift.--dur-press-hold.--dur-exit.--dur-toggle.--dur-morph.--dur-rail.--dur-fade.--dur-hold.--dur-ghost.--dur-stagger.--dur-cascade.--dur-skeleton-reveal.--skeleton-reveal-blur.--ease-out.--ease-in-out.--ease-drawer.--pop-scale.--pop-rise.--space-1.--space-3`.split(`.`),Ba=new Map,Va=!1,Ha=e=>{let t=Ba.get(e);if(t!==void 0)return t;let n=document.documentElement;Va||(Va=!0,new MutationObserver(()=>Ba.clear()).observe(n,{attributes:!0,attributeFilter:[`class`]}));let r=getComputedStyle(n);for(let t of Ba.size===0?[...za,e]:[e])Ba.set(t,r.getPropertyValue(t).trim());return Ba.get(e)},Ua=e=>{let t=Ha(e),n=Number.parseFloat(t);return t.endsWith(`ms`)?n:n*1e3},Wa=e=>Ha(e),Ga={out:`cubic-bezier(0.23, 1, 0.32, 1)`,inOut:`cubic-bezier(0.77, 0, 0.175, 1)`,drawer:`cubic-bezier(0.32, 0.72, 0, 1)`,glideIn:`cubic-bezier(0.3333, 0, 0.6667, 0.3333)`,glideOut:`cubic-bezier(0.3333, 0.6667, 0.6667, 1)`},Ka=e=>Number.parseFloat(Ha(e))||0;function qa(e,t){let n=Ka(`--space-3`)+Ka(`--space-1`),r=n>0?Math.min(1,e/n):0,i=Ka(`--space-3`)*r,a=Ka(`--space-1`)*r,o=2*i/t,s=Math.max(0,e-i-a)/t,c=2*a/t,l=o+s+c;return{covered:n=>{if(n<=0)return 0;if(n<o)return t/(2*o)*n*n;if(n<o+s)return i+t*(n-o);if(n<l){let r=l-n;return e-t/(2*c)*r*r}return e},duration:l,frames:(t,n)=>l<=0||e<=0?[t,n]:[{...t,offset:0,easing:Ga.glideIn},{...Xa(t,n,i/e),offset:o/l,easing:`linear`},{...Xa(t,n,(e-a)/e),offset:(o+s)/l,easing:Ga.glideOut},{...n,offset:1}],reached:n=>n<=0?0:n>=e?l:n<i?Math.sqrt(2*o*n/t):n<=e-a?o+(n-i)/t:l-Math.sqrt(2*c*(e-n)/t)}}var Ja=/-?\d*\.?\d+(?:e[-+]?\d+)?/gi,Ya=new Set([`offset`,`easing`,`composite`,`computedOffset`]);function Xa(e,t,n){let r={};for(let[i,a]of Object.entries(e)){if(Ya.has(i)||a==null)continue;let e=String(t[i]??a).match(Ja)??[],o=0;r[i]=String(a).replace(Ja,t=>{let r=Number(t),i=Number(e[o]??t);return o+=1,String(Number((r+(i-r)*n).toFixed(3)))})}return r}La(.42,0,.58,1);var Za=new Map,Qa=(e,t)=>{let[n]=t===`border-box`?e.borderBoxSize:e.contentBoxSize;return`${n?.inlineSize??0}x${n?.blockSize??0}`},$a=null,eo=globalThis.ResizeObserver,to=e=>{let t=new Set;for(let n of e)for(let[e,r]of Za.get(n.target)??[]){let i=Qa(n,r.box);i!==r.heard&&(r.heard=i,e.delivered.push(n),t.add(e))}return t},no=e=>{let t=[];for(let n of e.delivered)e.options.first&&!e.reported.has(n.target)?t.push(n):e.take(n),e.reported.add(n.target);return t},ro=(e,t)=>{let n=e.delivered,r=no(e);for(let i of[r.length>0?e.options.first?.(r):void 0,e.options.inside?.(n)])i&&t.push(i)},io=e=>{let t=[...to(e)],n=t.filter(e=>!e.foreign);for(let e of n)e.options.read?.(e.delivered);let r=[];for(let e of n)ro(e,r),e.delivered=[];for(let e of t)if(e.foreign){let t=e.delivered;e.delivered=[],e.foreign(t)}for(let e of r)e()},ao=()=>($a??=new eo(io),$a),oo=e=>{let t=[...Za.get(e)?.values()??[]].map(e=>e.box),n=ao();n.unobserve(e),n.observe(e,{box:t.includes(`border-box`)?`border-box`:`content-box`})},so=e=>{let t=new Set,n=n=>{let r=Za.get(n);r?.delete(e),r?.size===0&&(Za.delete(n),$a?.unobserve(n)),t.delete(n)};return{observe:(n,r)=>{let i=Za.get(n);i||(i=new Map,Za.set(n,i)),i.set(e,{box:r?.box??`content-box`,heard:null}),t.add(n),oo(n)},release:n,releaseAll:()=>{for(let e of[...t])n(e)}}};eo&&typeof window<`u`&&(window.ResizeObserver=class{#e;constructor(e){let t={delivered:[],foreign:t=>e(t,this),options:{},reported:new WeakSet,take:()=>void 0};this.#e=so(t)}observe(e,t){this.#e.observe(e,t)}unobserve(e){this.#e.release(e)}disconnect(){this.#e.releaseAll()}});var co=[`class`,`hidden`,`open`,`data-state`],lo=(e=[])=>({childList:!0,characterData:!0,subtree:!0,attributes:!0,attributeFilter:[...co,...e]}),uo=null;function fo(e,t={}){let n=uo!==null&&(t.close===!0&&uo.pace.speed!==null||t.speed!==void 0&&uo.pace.close);if(!uo||n){let e={runs:new Set,pace:{close:!1,speed:null},since:null};uo=e;let t=0,n=()=>{if(t+=1,t<(e.since===null?2:1)){requestAnimationFrame(n);return}uo===e&&(uo=null);let r=e.since??Number(document.timeline.currentTime);for(let t of e.runs)t(r,e.pace)};requestAnimationFrame(n)}let r=uo;return t.now&&r.since===null&&(r.since=Number(document.timeline.currentTime)),t.close&&(r.pace.close=!0),t.speed!==void 0&&(r.pace.speed=Math.max(r.pace.speed??t.speed,t.least??t.speed)),r.runs.add(e),()=>{r.runs.delete(e)}}function po(e,t,n,r){if(e.speed&&r>0){let i=qa(r,e.speed);return{frames:i.frames(t,n),share:e=>i.covered(e*i.duration)/r,timing:{duration:Math.max(1,i.duration),easing:`linear`}}}return{frames:[t,n],share:e=>e,timing:e.close?_o():go()}}var mo=e=>{let{offset:t,easing:n,composite:r,computedOffset:i,...a}=e;return a};function ho(e,t){return e.pause(),fo((n,r)=>{if(e.playState!==`paused`)return;let i=e.effect;if(i&&t!==void 0&&(r.speed||r.close)){let[e,...n]=i.getKeyframes(),a=po(r,mo(e),mo(n.at(-1)??e),t);i.setKeyframes(a.frames),i.updateTiming(a.timing)}e.startTime=n}),e}var go=()=>({duration:Ua(`--dur-panel`),easing:Wa(`--ease-in-out`)}),_o=()=>({duration:Ua(`--dur-exit`),easing:Wa(`--ease-in-out`)}),vo=new Set,yo=new Set,bo=new Map,xo=e=>e.inert;function So(e,t){let n=[],r=null;for(let[t,i]of bo){if(t===e||!e.contains(t))continue;let a=(xo(t)?[[`display`,`none`]]:[[`height`,`${i.height}px`],[`margin-block-end`,`${i.margin}px`],...i.edges.map(([e,t])=>[e,`${t}px`])]).map(([e,n])=>{let r=[e,t.style.getPropertyValue(e),t.style.getPropertyPriority(e)];return t.style.setProperty(e,n,`important`),r});n.push({el:t,props:a}),(!r||i.ms>r.ms)&&(r={ms:i.ms,easing:i.easing})}let i=t();for(let{el:e,props:t}of n)for(let[n,r,i]of t)e.style.setProperty(n,r,i);return{clock:r,value:i}}var Co=new Set;function wo(){let e=[...Co];Co.clear();let t=e.map(e=>e.drawn());for(let t of e)t.stop();let n=e.map(e=>e.natural());e.forEach((e,r)=>{let i=t[r];i&&e.tween(i,n[r])})}function To({width:e=!1,ms:t,on:n=[],rows:r=!1,followUnfolds:i=!1,still:a}={}){return o=>{let s=null,c,l,u=()=>{if(r){let e=o.getBoundingClientRect();return{w:e.width,h:e.height}}return{w:o.offsetWidth,h:o.offsetHeight}},d=(e,n,i)=>r?ho(o.animate(e,{duration:Ua(`--dur-panel`),easing:Wa(`--ease-in-out`)}),n):o.animate(e,i?{duration:i.ms,easing:i.easing}:{duration:t??Ua(`--dur-morph`),easing:Ga.drawer}),f=()=>{for(let e of vo)if(e!==o&&o.contains(e))return!0;return!1},p=()=>{for(let e of bo.keys())if(e!==o&&o.contains(e))return!0;return!1},m=e=>{e!==o&&o.contains(e)&&g.stop()},h=(t,n)=>Math.max(Math.abs(n.h-t.h),e?Math.abs(n.w-t.w):0),g={drawn:()=>c?u():s,natural:()=>{let{clock:e,value:t}=So(o,()=>({size:u(),children:[...o.children].filter(e=>e instanceof HTMLElement&&getComputedStyle(e).position!==`absolute`).map(e=>{let t=e.getBoundingClientRect();return{child:e,blockSize:t.height,inlineSize:t.width}})}));return{...t,clock:e}},stop:()=>{c?.cancel(),c=void 0,l?.(),l=void 0},tween:(t,{size:n,children:r,clock:o})=>{if(!((Math.abs(n.h-t.h)>.5||e&&Math.abs(n.w-t.w)>.5)&&Ia.current)||a?.()||t.h===0||n.h===0||f()||i&&p())return;let s=[{height:`${t.h}px`,overflow:`hidden`},{height:`${n.h}px`,overflow:`hidden`}];e&&(s[0].width=`${t.w}px`,s[1].width=`${n.w}px`);let u=r.map(({child:e,blockSize:t,inlineSize:n})=>({child:e,blockSize:t,inlineSize:n,was:e.style.blockSize,wasInline:e.style.inlineSize,shrink:e.style.flexShrink}));for(let{child:t,blockSize:n,inlineSize:r}of u)t.style.flexShrink=`0`,t.style.blockSize=`${n}px`,e&&(t.style.inlineSize=`${r}px`);let m=d(s,h(t,n),o);c=m;let g=()=>{for(let{child:t,was:n,wasInline:r,shrink:i}of u)t.style.flexShrink=i,t.style.blockSize=n,e&&(t.style.inlineSize=r)};l=g;let _=()=>{c===m&&(c=void 0,l=void 0,g())};m.finished.then(_,_)}},_=new ResizeObserver(([e])=>{let[t]=e.borderBoxSize;s=r?{w:t.inlineSize,h:t.blockSize}:{w:Math.round(t.inlineSize),h:Math.round(t.blockSize)}});_.observe(o,{box:`border-box`});let v=e=>{for(let t=e;t&&t!==o;t=t.parentNode)if(t instanceof HTMLElement&&t.style.position===`absolute`)return!0;return!1},y=e=>e.nodeType===Node.COMMENT_NODE||e.nodeType===Node.TEXT_NODE&&!e.textContent?.trim(),ee=e=>!v(e.target)&&(e.type!==`childList`||![...e.addedNodes,...e.removedNodes].every(e=>y(e)||v(e))),te=new MutationObserver(e=>{e.some(ee)&&(Co.size===0&&queueMicrotask(wo),Co.add(g))});return te.observe(o,lo(n)),yo.add(m),()=>{yo.delete(m),g.stop(),Co.delete(g),_.disconnect(),te.disconnect()}}}var Eo={bottom:[0,-1],top:[0,1],right:[-1,0],left:[1,0]};function Do(e,{side:t=`bottom`}={}){if(!Ia.current)return{duration:Ua(`--dur-control`),css:e=>`opacity: ${e}`};let n=getComputedStyle(e),r=Number.parseFloat(n.getPropertyValue(`--pop-scale`)),i=Number.parseFloat(n.getPropertyValue(`--pop-rise`)),[a,o]=Eo[t];return{duration:Ua(`--dur-exit`),easing:Ra,css:e=>`opacity: ${e}; scale: ${r+(1-r)*e}; translate: ${(a*(1-e)*i).toFixed(2)}px ${(o*(1-e)*i).toFixed(2)}px`}}function Oo(e){let t=document.timeline.currentTime;for(let n of e)n.startTime=t;return Promise.all(e.map(e=>e.finished.catch(()=>void 0)))}var ko=`In the message box, ready to edit`,Ao=e=>e.split(` `).slice(0,3).join(` `);function jo(e,t){e&&(e.value=t,e.dispatchEvent(new Event(`input`,{bubbles:!0})),e.focus({preventScroll:!0}),e.setSelectionRange(t.length,t.length))}var Mo=B(`<div class="composer svelte-r6n72d" data-slot="composer"><!> <label class="line svelte-r6n72d"><span class="sr-only">Message Caw</span> <textarea data-slot="composer-field" placeholder="Message Caw…" rows="1" class="svelte-r6n72d"></textarea> <span class="send svelte-r6n72d" aria-hidden="true"></span></label></div>`);function No(e,t){Ke(t,!0);let n=da(t,`value`,15,``),r=da(t,`field`,15),i=da(t,`focused`,3,!1);var a=Mo(),o=N(a);di(o,()=>t.children??f);var s=F(o,2),c=F(N(s),2);at(c),oa(c,e=>r(e),()=>r()),Te(2),O(s),O(a),I(()=>W(a,`data-focused`,i()||void 0)),na(c,n),V(e,a),qe()}var Po=B(`<div class="surround svelte-l37f3p" data-slot="surround"><div class="scroll kit-edge-fade-block svelte-l37f3p" data-slot="scroll"><div class="hero svelte-l37f3p" data-slot="hero"><!> <h2 class="title svelte-l37f3p" data-slot="heading"> </h2></div> <div class="set svelte-l37f3p" data-slot="set"><!></div></div> <div class="foot svelte-l37f3p" data-slot="foot"><!></div></div>`);function Fo(e,t){let n=da(t,`anchor`,3,`start`);var r=Po(),i=N(r),a=N(i),o=N(a);Ma(o,{class:`caw`,size:80});var s=P(F(o,2),!0);O(a);var c=F(a,2);di(N(c),()=>t.set),O(c),O(i);var l=F(i,2);di(N(l),()=>t.foot),O(l),O(r),I(()=>{W(r,`data-where`,t.where),H(s,t.where===`board`?`Nothing on the board yet`:`What’s next for Cawco?`),W(c,`data-anchor`,n())}),V(e,r)}var Io=B(`<span class="ghost svelte-1loi9xe" data-slot="skeleton"></span>`),Lo=B(`<span class="reason svelte-1loi9xe" data-slot="suggestion-reason"> </span>`),Ro=B(`<div class="item svelte-1loi9xe" data-draft=""><button class="draft svelte-1loi9xe" data-slot="suggestion" type="button"><span data-slot="suggestion-text"> </span></button> <!></div>`),zo=B(`<button class="more svelte-1loi9xe" data-more="" type="button"> </button>`),Bo=B(`<!> <!> <p class="provenance svelte-1loi9xe" data-provenance="" id="drafts-provenance">written from this project · 1h</p>`,1),Vo=B(`<div aria-labelledby="drafts-provenance" class="stack svelte-1loi9xe" role="group"><!></div>`),Ho=B(`<div class="drafts svelte-1loi9xe" data-direction="drafts"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function Uo(e,t){Ke(t,!0);let n=e=>{var n=Ur(),r=pn(n),i=e=>{var n=Vo(),r=N(n),i=e=>{var t=Ur();ai(pn(t),16,()=>[`var(--drafts-ghost-1)`,`var(--drafts-ghost-2)`,`var(--drafts-ghost-3)`],e=>e,(e,t)=>{var n=Io();let r;I(()=>r=Pi(n,``,r,{"inline-size":t})),V(e,n)}),V(e,t)},a=e=>{var n=Bo(),r=pn(n);ai(r,19,()=>z(f),(e,t)=>`${t}:${e.text}`,(e,n,r)=>{var i=Ro(),a=N(i),o=P(N(a),!0);O(a);var c=F(a,2),l=e=>{var t=Lo(),i=P(t,!0);I(()=>{W(t,`id`,`draft-reason-${z(r)??``}`),H(i,z(n).reason)}),V(e,t)};U(c,e=>{z(n).reason&&e(l)}),O(i),I(()=>{W(i,`data-taken`,z(m)&&z(s)===z(r)||void 0),W(a,`aria-describedby`,z(n).reason?`draft-reason-${z(r)}`:void 0),W(a,`data-held`,z(r)===0?t.draws.held:void 0),H(o,z(n).text)}),Mr(`click`,a,e=>g(z(r),e.currentTarget)),V(e,i)});var i=F(r,2),a=e=>{var t=zo(),n=P(t);I(()=>H(n,`${z(p)??``} more`)),Mr(`click`,t,()=>M(c,!0)),V(e,t)};U(i,e=>{z(p)>0&&e(a)}),Te(2),V(e,n)};U(r,e=>{t.draws.loading?e(i):e(a,-1)}),O(n),oa(n,e=>M(d,e),()=>z(d)),Ci(n,To),I(()=>W(n,`data-dimmed`,z(m)||void 0)),xi(2,n,()=>Do),V(e,n)};U(r,e=>{z(h)&&e(i)}),V(e,n)},r=e=>{No(e,{get focused(){return z(i)},get field(){return z(u)},set field(e){M(u,e,!0)},get value(){return z(o)},set value(e){M(o,e,!0)}})},i=k(()=>t.where===`keyboard`),a=k(()=>t.draws.items[0]?.text??``),o=j(tn(t.draws.phase===`filled`?z(a):t.draws.phase===`typing`?Ao(z(a)):``)),s=j(tn(t.draws.phase===`filled`?0:null)),c=j(tn(t.draws.expanded)),l=j(``),u=j(void 0),d=j(void 0),f=k(()=>z(c)?t.draws.items:t.draws.items.slice(0,4)),p=k(()=>t.draws.items.length-z(f).length),m=k(()=>z(s)!==null&&z(o)===t.draws.items[z(s)]?.text),h=k(()=>(t.draws.loading||t.draws.items.length>0)&&!z(i)&&(z(o)===``||z(m)));async function g(e,n){let r=t.draws.items[e]?.text??``,i=z(u)?.getBoundingClientRect(),a=n.getBoundingClientRect(),c=i?i.top+i.height/2-(a.top+a.height/2):0,f={duration:Ua(`--dur-morph`),easing:Wa(`--ease-out`),fill:`forwards`},p=e=>Number.parseFloat(getComputedStyle(n).getPropertyValue(e)),m=p(`--drafts-press-scale`),h=p(`--drafts-dim`),g=n.closest(`[data-draft]`)??n,_=[g.animate(Ia.current?[{transform:`translateY(0) scale(${m})`,opacity:1},{transform:`translateY(${c}px) scale(${m})`,opacity:0}]:[{opacity:1},{opacity:0}],f),...[...z(d)?.querySelectorAll(`[data-draft], [data-provenance], [data-more]`)??[]].filter(e=>e!==g).map(e=>e.animate([{opacity:1},{opacity:h}],f))];await Oo(_),M(s,e,!0),jo(z(u),r),M(o,r,!0),M(l,ko,!0);for(let e of _)e.cancel()}var _=Ho(),v=N(_);Fo(v,{anchor:`end`,get foot(){return r},get set(){return n},get where(){return t.where}});var y=P(F(v,2),!0);O(_),I(()=>{W(_,`data-touch`,t.draws.touch||void 0),W(_,`data-where`,t.where),H(y,z(l))}),V(e,_),qe()}Nr([`click`]);var Wo=(e,t)=>{let n=Array(e.length+t.length);for(let t=0;t<e.length;t++)n[t]=e[t];for(let r=0;r<t.length;r++)n[e.length+r]=t[r];return n},Go=(e,t)=>({classGroupId:e,validator:t}),Ko=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),qo=`-`,Jo=[],Yo=`arbitrary..`,Xo=e=>{let t=$o(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e.startsWith(`[`)&&e.endsWith(`]`))return Qo(e);let n=e.split(qo);return Zo(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?Wo(i,t):t:i||Jo}return n[e]||Jo}}},Zo=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=Zo(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(qo):e.slice(t).join(qo),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},Qo=e=>e.slice(1,-1).indexOf(`:`)===-1?void 0:(()=>{let t=e.slice(1,-1),n=t.indexOf(`:`),r=t.slice(0,n);return r?Yo+r:void 0})(),$o=e=>{let{theme:t,classGroups:n}=e;return es(n,t)},es=(e,t)=>{let n=Ko();for(let r in e){let i=e[r];ts(i,n,r,t)}return n},ts=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];ns(i,t,n,r)}},ns=(e,t,n,r)=>{if(typeof e==`string`){rs(e,t,n);return}if(typeof e==`function`){is(e,t,n,r);return}as(e,t,n,r)},rs=(e,t,n)=>{let r=e===``?t:os(t,e);r.classGroupId=n},is=(e,t,n,r)=>{if(ss(e)){ts(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Go(n,e))},as=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];ts(o,os(t,a),n,r)}},os=(e,t)=>{let n=e,r=t.split(qo),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=Ko(),n.nextPart.set(t,i)),n=i}return n},ss=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,cs=e=>{if(e<1)return{get:()=>void 0,set:()=>{}};let t=0,n=Object.create(null),r=Object.create(null),i=(i,a)=>{n[i]=a,t++,t>e&&(t=0,r=n,n=Object.create(null))};return{get(e){let t=n[e];if(t!==void 0)return t;if((t=r[e])!==void 0)return i(e,t),t},set(e,t){e in n?n[e]=t:i(e,t)}}},ls=`!`,us=`:`,ds=[],fs=(e,t,n,r,i)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:i}),ps=e=>{let{prefix:t,experimentalParseClassName:n}=e,r=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e[s];if(n===0&&r===0){if(o===us){t.push(e.slice(i,s)),i=s+1;continue}if(o===`/`){a=s;continue}}o===`[`?n++:o===`]`?n--:o===`(`?r++:o===`)`&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1;s.endsWith(ls)?(c=s.slice(0,-1),l=!0):s.startsWith(ls)&&(c=s.slice(1),l=!0);let u=a&&a>i?a-i:void 0;return fs(t,l,c,u)};if(t){let e=t+us,n=r;r=t=>t.startsWith(e)?n(t.slice(e.length)):fs(ds,!1,t,void 0,!0)}if(n){let e=r;r=t=>n({className:t,parseClassName:e})}return r},ms=e=>{let t=new Map;return e.orderSensitiveModifiers.forEach((e,n)=>{t.set(e,1e6+n)}),e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);o||s?(r.length>0&&(r.sort(),n.push(...r),r=[]),n.push(a)):r.push(a)}return r.length>0&&(r.sort(),n.push(...r)),n}},hs=e=>({cache:cs(e.cacheSize),parseClassName:ps(e),sortModifiers:ms(e),postfixLookupClassGroupIds:gs(e),...Xo(e)}),gs=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},_s=/\s+/,vs=(e,t)=>{let{parseClassName:n,getClassGroupId:r,getConflictingClassGroupIds:i,sortModifiers:a,postfixLookupClassGroupIds:o}=t,s=[],c=e.trim().split(_s),l=``;for(let e=c.length-1;e>=0;--e){let t=c[e],{isExternal:u,modifiers:d,hasImportantModifier:f,baseClassName:p,maybePostfixModifierPosition:m}=n(t);if(u){l=t+(l.length>0?` `+l:l);continue}let h=!!m,g;if(h){g=r(p.substring(0,m));let e=g&&o[g]?r(p):void 0;e&&e!==g&&(g=e,h=!1)}else g=r(p);if(!g){if(!h){l=t+(l.length>0?` `+l:l);continue}if(g=r(p),!g){l=t+(l.length>0?` `+l:l);continue}h=!1}let _=d.length===0?``:d.length===1?d[0]:a(d).join(`:`),v=f?_+ls:_,y=v+g;if(s.indexOf(y)>-1)continue;s.push(y);let ee=i(g,h);for(let e=0;e<ee.length;++e){let t=ee[e];s.push(v+t)}l=t+(l.length>0?` `+l:l)}return l},ys=(...e)=>{let t=0,n,r,i=``;for(;t<e.length;)(n=e[t++])&&(r=bs(n))&&(i&&(i+=` `),i+=r);return i},bs=e=>{if(typeof e==`string`)return e;let t,n=``;for(let r=0;r<e.length;r++)e[r]&&(t=bs(e[r]))&&(n&&(n+=` `),n+=t);return n},xs=(e,...t)=>{let n,r,i,a,o=o=>(n=hs(t.reduce((e,t)=>t(e),e())),r=n.cache.get,i=n.cache.set,a=s,s(o)),s=e=>{let t=r(e);if(t)return t;let a=vs(e,n);return i(e,a),a};return a=o,(...e)=>a(ys(...e))},Ss=[],Cs=e=>{let t=t=>t[e]||Ss;return t.isThemeGetter=!0,t.themeKey=e,t},ws=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,Ts=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Es=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,Ds=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Os=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,ks=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/,As=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,js=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,Ms=e=>Es.test(e),J=e=>!!e&&!Number.isNaN(Number(e)),Ns=e=>!!e&&Number.isInteger(Number(e)),Ps=e=>e.endsWith(`%`)&&J(e.slice(0,-1)),Fs=e=>Ds.test(e),Is=()=>!0,Ls=e=>Os.test(e)&&!ks.test(e),Rs=()=>!1,zs=e=>As.test(e),Bs=e=>js.test(e),Vs=e=>!Y(e)&&!X(e),Hs=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),Us=e=>ic(e,cc,Rs),Y=e=>ws.test(e),Ws=e=>ic(e,lc,Ls),Gs=e=>ic(e,uc,J),Ks=e=>ic(e,fc,Is),qs=e=>ic(e,dc,Rs),Js=e=>ic(e,oc,Rs),Ys=e=>ic(e,sc,Bs),Xs=e=>ic(e,pc,zs),X=e=>Ts.test(e),Zs=e=>ac(e,lc),Qs=e=>ac(e,dc),$s=e=>ac(e,oc),ec=e=>ac(e,cc),tc=e=>ac(e,sc),nc=e=>ac(e,pc,!0),rc=e=>ac(e,fc,!0),ic=(e,t,n)=>{let r=ws.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},ac=(e,t,n=!1)=>{let r=Ts.exec(e);return r?r[1]?t(r[1]):n:!1},oc=e=>e===`position`||e===`percentage`,sc=e=>e===`image`||e===`url`,cc=e=>e===`length`||e===`size`||e===`bg-size`,lc=e=>e===`length`,uc=e=>e===`number`,dc=e=>e===`family-name`,fc=e=>e===`number`||e===`weight`,pc=e=>e===`shadow`,mc=Object.defineProperty({__proto__:null,isAny:Is,isAnyNonArbitrary:Vs,isArbitraryFamilyName:qs,isArbitraryImage:Ys,isArbitraryLength:Ws,isArbitraryNumber:Gs,isArbitraryPosition:Js,isArbitraryShadow:Xs,isArbitrarySize:Us,isArbitraryValue:Y,isArbitraryVariable:X,isArbitraryVariableFamilyName:Qs,isArbitraryVariableImage:tc,isArbitraryVariableLength:Zs,isArbitraryVariablePosition:$s,isArbitraryVariableShadow:nc,isArbitraryVariableSize:ec,isArbitraryVariableWeight:rc,isArbitraryWeight:Ks,isFraction:Ms,isInteger:Ns,isNamedContainerQuery:Hs,isNumber:J,isPercent:Ps,isTshirtSize:Fs},Symbol.toStringTag,{value:`Module`}),hc=()=>{let e=Cs(`color`),t=Cs(`font`),n=Cs(`text`),r=Cs(`font-weight`),i=Cs(`tracking`),a=Cs(`leading`),o=Cs(`breakpoint`),s=Cs(`container`),c=Cs(`spacing`),l=Cs(`radius`),u=Cs(`shadow`),d=Cs(`inset-shadow`),f=Cs(`text-shadow`),p=Cs(`drop-shadow`),m=Cs(`blur`),h=Cs(`perspective`),g=Cs(`aspect`),_=Cs(`ease`),v=Cs(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],ee=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],te=()=>[...ee(),X,Y],ne=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],re=()=>[`auto`,`contain`,`none`],b=()=>[X,Y,c],x=()=>[Ms,`full`,`auto`,...b()],ie=()=>[Ns,`none`,`subgrid`,X,Y],ae=()=>[`auto`,{span:[`full`,Ns,X,Y]},Ns,X,Y],oe=()=>[Ns,`auto`,X,Y],se=()=>[`auto`,`min`,`max`,`fr`,X,Y],ce=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],le=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],ue=()=>[`auto`,...b()],de=()=>[Ms,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...b()],fe=()=>[s,Ms,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...b()],pe=()=>[Ms,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...b()],S=()=>[e,X,Y],me=()=>[...ee(),$s,Js,{position:[X,Y]}],he=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ge=()=>[`auto`,`cover`,`contain`,ec,Us,{size:[X,Y]}],_e=()=>[Ps,Zs,Ws],C=()=>[``,`none`,`full`,l,X,Y],w=()=>[``,J,Zs,Ws],ve=()=>[`solid`,`dashed`,`dotted`,`double`],ye=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],T=()=>[J,Ps,$s,Js],be=()=>[``,`none`,m,X,Y],xe=()=>[`none`,J,X,Y],E=()=>[`none`,J,X,Y],Se=()=>[J,X,Y],D=()=>[Ms,`full`,...b()];return{cacheSize:500,theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[Fs],breakpoint:[Fs],color:[Is],container:[Fs],"drop-shadow":[Fs],ease:[`in`,`out`,`in-out`],font:[Vs],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[Fs],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[Fs],shadow:[Fs],spacing:[`px`,J],text:[Fs],"text-shadow":[Fs],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,Ms,Y,X,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,X,Y]}],"container-named":[Hs],columns:[{columns:[J,`auto`,Y,X,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:te()}],overflow:[{overflow:ne()}],"overflow-x":[{"overflow-x":ne()}],"overflow-y":[{"overflow-y":ne()}],overscroll:[{overscroll:re()}],"overscroll-x":[{"overscroll-x":re()}],"overscroll-y":[{"overscroll-y":re()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:x()}],"inset-x":[{"inset-x":x()}],"inset-y":[{"inset-y":x()}],start:[{"inset-s":x(),start:x()}],end:[{"inset-e":x(),end:x()}],"inset-bs":[{"inset-bs":x()}],"inset-be":[{"inset-be":x()}],top:[{top:x()}],right:[{right:x()}],bottom:[{bottom:x()}],left:[{left:x()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Ns,`auto`,X,Y]}],basis:[{basis:[Ms,`full`,`auto`,s,...b()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[J,Ms,`auto`,`initial`,`none`,Y]}],grow:[{grow:[``,J,X,Y]}],shrink:[{shrink:[``,J,X,Y]}],order:[{order:[Ns,`first`,`last`,`none`,X,Y]}],"grid-cols":[{"grid-cols":ie()}],"col-start-end":[{col:ae()}],"col-start":[{"col-start":oe()}],"col-end":[{"col-end":oe()}],"grid-rows":[{"grid-rows":ie()}],"row-start-end":[{row:ae()}],"row-start":[{"row-start":oe()}],"row-end":[{"row-end":oe()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":se()}],"auto-rows":[{"auto-rows":se()}],gap:[{gap:b()}],"gap-x":[{"gap-x":b()}],"gap-y":[{"gap-y":b()}],"justify-content":[{justify:[...ce(),`normal`]}],"justify-items":[{"justify-items":[...le(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...le()]}],"align-content":[{content:[`normal`,...ce()]}],"align-items":[{items:[...le(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...le(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ce()}],"place-items":[{"place-items":[...le(),`baseline`]}],"place-self":[{"place-self":[`auto`,...le()]}],p:[{p:b()}],px:[{px:b()}],py:[{py:b()}],ps:[{ps:b()}],pe:[{pe:b()}],pbs:[{pbs:b()}],pbe:[{pbe:b()}],pt:[{pt:b()}],pr:[{pr:b()}],pb:[{pb:b()}],pl:[{pl:b()}],m:[{m:ue()}],mx:[{mx:ue()}],my:[{my:ue()}],ms:[{ms:ue()}],me:[{me:ue()}],mbs:[{mbs:ue()}],mbe:[{mbe:ue()}],mt:[{mt:ue()}],mr:[{mr:ue()}],mb:[{mb:ue()}],ml:[{ml:ue()}],"space-x":[{"space-x":b()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":b()}],"space-y-reverse":[`space-y-reverse`],size:[{size:de()}],"inline-size":[{inline:[`auto`,...fe()]}],"min-inline-size":[{"min-inline":[`auto`,...fe()]}],"max-inline-size":[{"max-inline":[`none`,...fe()]}],"block-size":[{block:[`auto`,...pe()]}],"min-block-size":[{"min-block":[`auto`,...pe()]}],"max-block-size":[{"max-block":[`none`,...pe()]}],w:[{w:[s,`screen`,...de()]}],"min-w":[{"min-w":[s,`screen`,`none`,...de()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...de()]}],h:[{h:[`screen`,`lh`,...de()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...de()]}],"max-h":[{"max-h":[`screen`,`lh`,`none`,...de()]}],"font-size":[{text:[`base`,n,Zs,Ws]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,rc,Ks]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Ps,Y]}],"font-family":[{font:[Qs,qs,t]}],"font-features":[{"font-features":[Y]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,X,Y]}],"line-clamp":[{"line-clamp":[J,`none`,X,Gs]}],leading:[{leading:[`none`,a,...b()]}],"list-image":[{"list-image":[`none`,X,Y]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,X,Y]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:S()}],"text-color":[{text:S()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...ve(),`wavy`]}],"text-decoration-thickness":[{decoration:[J,`from-font`,`auto`,X,Ws]}],"text-decoration-color":[{decoration:S()}],"underline-offset":[{"underline-offset":[J,`auto`,X,Y]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:b()}],"tab-size":[{tab:[Ns,X,Y]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,X,Y]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,X,Y]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:me()}],"bg-repeat":[{bg:he()}],"bg-size":[{bg:ge()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Ns,X,Y],radial:[``,X,Y],conic:[``,Ns,X,Y]},tc,Ys]}],"bg-color":[{bg:S()}],"gradient-from-pos":[{from:_e()}],"gradient-via-pos":[{via:_e()}],"gradient-to-pos":[{to:_e()}],"gradient-from":[{from:S()}],"gradient-via":[{via:S()}],"gradient-to":[{to:S()}],rounded:[{rounded:C()}],"rounded-s":[{"rounded-s":C()}],"rounded-e":[{"rounded-e":C()}],"rounded-t":[{"rounded-t":C()}],"rounded-r":[{"rounded-r":C()}],"rounded-b":[{"rounded-b":C()}],"rounded-l":[{"rounded-l":C()}],"rounded-ss":[{"rounded-ss":C()}],"rounded-se":[{"rounded-se":C()}],"rounded-ee":[{"rounded-ee":C()}],"rounded-es":[{"rounded-es":C()}],"rounded-tl":[{"rounded-tl":C()}],"rounded-tr":[{"rounded-tr":C()}],"rounded-br":[{"rounded-br":C()}],"rounded-bl":[{"rounded-bl":C()}],"border-w":[{border:w()}],"border-w-x":[{"border-x":w()}],"border-w-y":[{"border-y":w()}],"border-w-s":[{"border-s":w()}],"border-w-e":[{"border-e":w()}],"border-w-bs":[{"border-bs":w()}],"border-w-be":[{"border-be":w()}],"border-w-t":[{"border-t":w()}],"border-w-r":[{"border-r":w()}],"border-w-b":[{"border-b":w()}],"border-w-l":[{"border-l":w()}],"divide-x":[{"divide-x":w()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":w()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...ve(),`hidden`,`none`]}],"divide-style":[{divide:[...ve(),`hidden`,`none`]}],"border-color":[{border:S()}],"border-color-x":[{"border-x":S()}],"border-color-y":[{"border-y":S()}],"border-color-s":[{"border-s":S()}],"border-color-e":[{"border-e":S()}],"border-color-bs":[{"border-bs":S()}],"border-color-be":[{"border-be":S()}],"border-color-t":[{"border-t":S()}],"border-color-r":[{"border-r":S()}],"border-color-b":[{"border-b":S()}],"border-color-l":[{"border-l":S()}],"divide-color":[{divide:S()}],"outline-style":[{outline:[...ve(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[J,X,Y]}],"outline-w":[{outline:[``,J,Zs,Ws]}],"outline-color":[{outline:S()}],shadow:[{shadow:[``,`inner`,`none`,u,nc,Xs]}],"shadow-color":[{shadow:S()}],"inset-shadow":[{"inset-shadow":[`none`,d,nc,Xs]}],"inset-shadow-color":[{"inset-shadow":S()}],"ring-w":[{ring:w()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:S()}],"ring-offset-w":[{"ring-offset":[J,Ws]}],"ring-offset-color":[{"ring-offset":S()}],"inset-ring-w":[{"inset-ring":w()}],"inset-ring-color":[{"inset-ring":S()}],"text-shadow":[{"text-shadow":[`none`,f,nc,Xs]}],"text-shadow-color":[{"text-shadow":S()}],opacity:[{opacity:[J,X,Y]}],"mix-blend":[{"mix-blend":[...ye(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":ye()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[J]}],"mask-image-linear-from-pos":[{"mask-linear-from":T()}],"mask-image-linear-to-pos":[{"mask-linear-to":T()}],"mask-image-linear-from-color":[{"mask-linear-from":S()}],"mask-image-linear-to-color":[{"mask-linear-to":S()}],"mask-image-t-from-pos":[{"mask-t-from":T()}],"mask-image-t-to-pos":[{"mask-t-to":T()}],"mask-image-t-from-color":[{"mask-t-from":S()}],"mask-image-t-to-color":[{"mask-t-to":S()}],"mask-image-r-from-pos":[{"mask-r-from":T()}],"mask-image-r-to-pos":[{"mask-r-to":T()}],"mask-image-r-from-color":[{"mask-r-from":S()}],"mask-image-r-to-color":[{"mask-r-to":S()}],"mask-image-b-from-pos":[{"mask-b-from":T()}],"mask-image-b-to-pos":[{"mask-b-to":T()}],"mask-image-b-from-color":[{"mask-b-from":S()}],"mask-image-b-to-color":[{"mask-b-to":S()}],"mask-image-l-from-pos":[{"mask-l-from":T()}],"mask-image-l-to-pos":[{"mask-l-to":T()}],"mask-image-l-from-color":[{"mask-l-from":S()}],"mask-image-l-to-color":[{"mask-l-to":S()}],"mask-image-x-from-pos":[{"mask-x-from":T()}],"mask-image-x-to-pos":[{"mask-x-to":T()}],"mask-image-x-from-color":[{"mask-x-from":S()}],"mask-image-x-to-color":[{"mask-x-to":S()}],"mask-image-y-from-pos":[{"mask-y-from":T()}],"mask-image-y-to-pos":[{"mask-y-to":T()}],"mask-image-y-from-color":[{"mask-y-from":S()}],"mask-image-y-to-color":[{"mask-y-to":S()}],"mask-image-radial":[{"mask-radial":[X,Y]}],"mask-image-radial-from-pos":[{"mask-radial-from":T()}],"mask-image-radial-to-pos":[{"mask-radial-to":T()}],"mask-image-radial-from-color":[{"mask-radial-from":S()}],"mask-image-radial-to-color":[{"mask-radial-to":S()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":ee()}],"mask-image-conic-pos":[{"mask-conic":[J]}],"mask-image-conic-from-pos":[{"mask-conic-from":T()}],"mask-image-conic-to-pos":[{"mask-conic-to":T()}],"mask-image-conic-from-color":[{"mask-conic-from":S()}],"mask-image-conic-to-color":[{"mask-conic-to":S()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:me()}],"mask-repeat":[{mask:he()}],"mask-size":[{mask:ge()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,X,Y]}],filter:[{filter:[``,`none`,X,Y]}],blur:[{blur:be()}],brightness:[{brightness:[J,X,Y]}],contrast:[{contrast:[J,X,Y]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,nc,Xs]}],"drop-shadow-color":[{"drop-shadow":S()}],grayscale:[{grayscale:[``,J,X,Y]}],"hue-rotate":[{"hue-rotate":[J,X,Y]}],invert:[{invert:[``,J,X,Y]}],saturate:[{saturate:[J,X,Y]}],sepia:[{sepia:[``,J,X,Y]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,X,Y]}],"backdrop-blur":[{"backdrop-blur":be()}],"backdrop-brightness":[{"backdrop-brightness":[J,X,Y]}],"backdrop-contrast":[{"backdrop-contrast":[J,X,Y]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,J,X,Y]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[J,X,Y]}],"backdrop-invert":[{"backdrop-invert":[``,J,X,Y]}],"backdrop-opacity":[{"backdrop-opacity":[J,X,Y]}],"backdrop-saturate":[{"backdrop-saturate":[J,X,Y]}],"backdrop-sepia":[{"backdrop-sepia":[``,J,X,Y]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":b()}],"border-spacing-x":[{"border-spacing-x":b()}],"border-spacing-y":[{"border-spacing-y":b()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,X,Y]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[J,`initial`,X,Y]}],ease:[{ease:[`linear`,`initial`,_,X,Y]}],delay:[{delay:[J,X,Y]}],animate:[{animate:[`none`,v,X,Y]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,X,Y]}],"perspective-origin":[{"perspective-origin":te()}],rotate:[{rotate:xe()}],"rotate-x":[{"rotate-x":xe()}],"rotate-y":[{"rotate-y":xe()}],"rotate-z":[{"rotate-z":xe()}],scale:[{scale:E()}],"scale-x":[{"scale-x":E()}],"scale-y":[{"scale-y":E()}],"scale-z":[{"scale-z":E()}],"scale-3d":[`scale-3d`],skew:[{skew:Se()}],"skew-x":[{"skew-x":Se()}],"skew-y":[{"skew-y":Se()}],transform:[{transform:[X,Y,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:te()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:D()}],"translate-x":[{"translate-x":D()}],"translate-y":[{"translate-y":D()}],"translate-z":[{"translate-z":D()}],"translate-none":[`translate-none`],zoom:[{zoom:[Ns,X,Y]}],accent:[{accent:S()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:S()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,X,Y]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":S()}],"scrollbar-track-color":[{"scrollbar-track":S()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":b()}],"scroll-mx":[{"scroll-mx":b()}],"scroll-my":[{"scroll-my":b()}],"scroll-ms":[{"scroll-ms":b()}],"scroll-me":[{"scroll-me":b()}],"scroll-mbs":[{"scroll-mbs":b()}],"scroll-mbe":[{"scroll-mbe":b()}],"scroll-mt":[{"scroll-mt":b()}],"scroll-mr":[{"scroll-mr":b()}],"scroll-mb":[{"scroll-mb":b()}],"scroll-ml":[{"scroll-ml":b()}],"scroll-p":[{"scroll-p":b()}],"scroll-px":[{"scroll-px":b()}],"scroll-py":[{"scroll-py":b()}],"scroll-ps":[{"scroll-ps":b()}],"scroll-pe":[{"scroll-pe":b()}],"scroll-pbs":[{"scroll-pbs":b()}],"scroll-pbe":[{"scroll-pbe":b()}],"scroll-pt":[{"scroll-pt":b()}],"scroll-pr":[{"scroll-pr":b()}],"scroll-pb":[{"scroll-pb":b()}],"scroll-pl":[{"scroll-pl":b()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,X,Y]}],fill:[{fill:[`none`,...S()]}],"stroke-w":[{stroke:[J,Zs,Ws,Gs]}],stroke:[{stroke:[`none`,...S()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`start`,`end`,`right`,`left`],"inset-y":[`inset-bs`,`inset-be`,`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`ps`,`pe`,`pr`,`pl`],py:[`pbs`,`pbe`,`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`ms`,`me`,`mr`,`ml`],my:[`mbs`,`mbe`,`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-s`,`border-w-e`,`border-w-r`,`border-w-l`],"border-w-y":[`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-s`,`border-color-e`,`border-color-r`,`border-color-l`],"border-color-y":[`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-ms`,`scroll-me`,`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-ps`,`scroll-pe`,`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},gc=(e,{cacheSize:t,prefix:n,experimentalParseClassName:r,extend:i={},override:a={}})=>(_c(e,`cacheSize`,t),_c(e,`prefix`,n),_c(e,`experimentalParseClassName`,r),vc(e.theme,a.theme),vc(e.classGroups,a.classGroups),vc(e.conflictingClassGroups,a.conflictingClassGroups),vc(e.conflictingClassGroupModifiers,a.conflictingClassGroupModifiers),_c(e,`postfixLookupClassGroups`,a.postfixLookupClassGroups),_c(e,`orderSensitiveModifiers`,a.orderSensitiveModifiers),yc(e.theme,i.theme),yc(e.classGroups,i.classGroups),yc(e.conflictingClassGroups,i.conflictingClassGroups),yc(e.conflictingClassGroupModifiers,i.conflictingClassGroupModifiers),bc(e,i,`postfixLookupClassGroups`),bc(e,i,`orderSensitiveModifiers`),e),_c=(e,t,n)=>{n!==void 0&&(e[t]=n)},vc=(e,t)=>{if(t)for(let n in t)_c(e,n,t[n])},yc=(e,t)=>{if(t)for(let n in t)bc(e,t,n)},bc=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},xc=(e,...t)=>typeof e==`function`?xs(hc,e,...t):xs(()=>gc(hc(),e),...t),Sc=Array.isArray,Cc=e=>{if(!e&&e!==0&&e!==0n)return``;if(typeof e==`string`)return e;if(typeof e==`number`)return e===e?``+e:``;if(typeof e==`bigint`)return``+e;let t=``;if(Sc(e)){let n=e.length;for(let r=0;r<n;r++){let n=e[r];if(!n&&n!==0&&n!==0n)continue;let i=typeof n==`string`?n:Cc(n);i&&(t&&(t+=` `),t+=i)}return t}if(typeof e==`object`)for(let n in e)e[n]&&(t&&(t+=` `),t+=n);return t},wc=/\s+/g,Tc=Array.isArray,Ec=e=>typeof e!=`string`||!e?e:e.replace(wc,` `).trim(),Dc=e=>{let t=e.length;if(t===0)return!1;let n=e.charCodeAt(0),r=e.charCodeAt(t-1);if(n===32||r===32||n>=9&&n<=13||n===160||r>=9&&r<=13||r===160)return!0;for(let n=0;n<t;n++){let r=e.charCodeAt(n);if(r>=9&&r<=13||r===160||r===32&&n+1<t&&e.charCodeAt(n+1)===32)return!0}return!1},Oc=(...e)=>{let t=Cc(e);if(t)return Dc(t)?Ec(t):t},kc=e=>e===!1?`false`:e===!0?`true`:e===0?`0`:e,Ac=e=>{if(!e||typeof e!=`object`)return!0;for(let t in e)return!1;return!0},jc=(e,t)=>{if(e===t)return!0;if(!e||!t)return!1;let n=e,r=t,i=Object.keys(n),a=Object.keys(r);if(i.length!==a.length)return!1;for(let e=0;e<i.length;e++){let t=i[e];if(!a.includes(t)||n[t]!==r[t])return!1}return!0},Mc=(e,t)=>{let n=e;for(let e in t)if(Object.hasOwn(t,e)){let r=t[e];n[e]=e in n?Oc(n[e],r):r}return e},Nc=(e,t)=>{for(let n=0;n<e.length;n++){let r=e[n];Tc(r)?Nc(r,t):r&&t.push(r)}},Pc=(...e)=>{let t=[];Nc(e,t);let n=[];for(let e=0;e<t.length;e++)t[e]&&n.push(t[e]);return n},Fc=(e,t)=>{let n=e,r=t,i={};for(let e in n){let t=n[e];if(e in r){let n=r[e];i[e]=Tc(t)||Tc(n)?Pc(n,t):typeof t==`object`&&typeof n==`object`&&t&&n?Fc(t,n):n+` `+t}else i[e]=t}for(let e in r)e in n||(i[e]=r[e]);return i},Ic={twMerge:!0,twMergeConfig:{}},Lc=256,Rc=128,zc=Symbol(`tv-cache-miss`),Bc=e=>e?.class!=null&&e.class!==``||e?.className!=null&&e.className!==``,Vc=e=>{if(e===void 0)return``;if(e===null)return`null`;if(typeof e==`string`)return e;if(typeof e==`boolean`)return e?`true`:`false`;if(typeof e==`number`)return e===0?`0`:String(e);if(typeof e==`bigint`)return String(e);let t=kc(e),n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return String(t);if(n===`object`)try{return JSON.stringify(t)}catch{return null}return null},Hc=(e,t)=>{if(t===void 0)return e;if(t===null)return e+`null`;let n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return e+String(t);if(Array.isArray(t))return e+t.join(`\0`);try{return e+JSON.stringify(t)}catch{return e+`?`}},Uc=(e,t,n,r)=>{let i=``,a=Object.create(null);for(let r=0;r<e.length;r++){let o=e[r];a[o]=1;let s=t[o];n&&n[o]!==void 0&&(s=n[o]);let c=Vc(s);if(c===null)return null;i+=o+`:`+c+`;`}let o=[];for(let e in t)e===`class`||e===`className`||a[e]||(a[e]=1,o.push(e));if(n)for(let e in n)e===`class`||e===`className`||a[e]||n[e]===void 0||(a[e]=1,o.push(e));o.length>1&&o.sort();for(let e=0;e<o.length;e++){let r=o[e],a=t[r];n&&n[r]!==void 0&&(a=n[r]);let s=Vc(a);if(s===null)return null;i+=r+`:`+s+`;`}return i},Wc=(e,t)=>{let n=``;for(let t=0;t<e.length;t++){let{conditionKeys:r,source:i}=e[t];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=Hc(n,i[t]),n+=`,`}n+=`c=`,n=Hc(n,i.class),n+=`|cn=`,n=Hc(n,i.className),n+=`;`}for(let e=0;e<t.length;e++){let{conditionKeys:r,source:i}=t[e];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=Hc(n,i[t]),n+=`,`}Array.isArray(i.slots)&&(n+=`slots=`+i.slots.join(`,`)+`,`),n+=`c=`,n=Hc(n,i.class),n+=`|cn=`,n=Hc(n,i.className),n+=`;`}return n},Gc=(e=Lc)=>{let t=new Map,n=null;return{get(e){if(t.has(e))return t.get(e);if(n?.has(e)){let r=n.get(e);return t.set(e,r),r}return zc},set(r,i){t.size>=e&&(n=t,t=new Map),t.set(r,i)}}},Kc=(e=Lc)=>{let t=Gc(e);return{get(e){return t.get(e)},set(e,n){t.set(e,n)}}},qc=(e=Rc)=>{let t=new Map,n=null,r=0;return{get(e,i){let a=t.get(e);if(a){let e=a.get(i);if(e!==void 0||a.has(i))return e}if(n){let a=n.get(e);if(a){let n=a.get(i);if(n!==void 0||a.has(i)){let a=t.get(e);return a||(a=new Map,t.set(e,a)),a.has(i)||r++,a.set(i,n),n}}}return zc},set(i,a,o){r>=e&&(n=t,t=new Map,r=0);let s=t.get(i);s||(s=new Map,t.set(i,s)),s.has(a)||r++,s.set(a,o)}}},Jc=(e,t)=>{let n=null;return(r,i)=>{if(!Bc(i))return r;let a=i.class,o=i.className;if(a!=null&&a!==``&&typeof a!=`string`||o!=null&&o!==``&&typeof o!=`string`)return e(t,r,a,o);n??=qc();let s=r??``,c=(typeof a==`string`?a:``)+`\0`+(typeof o==`string`?o:``),l=n.get(s,c);if(l!==zc)return l;let u=e(t,r,a,o);return n.set(s,c,u),u}};function Yc(){let e=null,t={},n=!1;return{get cachedTwMerge(){return e},set cachedTwMerge(t){e=t},get cachedTwMergeConfig(){return t},set cachedTwMergeConfig(e){t=e},get didTwMergeConfigChange(){return n},set didTwMergeConfigChange(e){n=e},reset(){e=null,t={},n=!1}}}var Xc=Yc(),Zc=e=>{!Ac(e.twMergeConfig)&&!jc(e.twMergeConfig,Xc.cachedTwMergeConfig)&&(Xc.didTwMergeConfigChange=!0,Xc.cachedTwMergeConfig=e.twMergeConfig)},Qc=(e,t)=>{let n=[];for(let r=0;r<t.length;r++){let i=t[r],a=e[i];n.push({key:i,values:a,isEmpty:Ac(a)})}return n},$c=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},el=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`slots`&&e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},tl=e=>{let t={};for(let n=0;n<e.length;n++){let r=e[n],i=r.source.slots;if(Array.isArray(i))for(let e=0;e<i.length;e++){let n=i[e];t[n]||(t[n]=[]),t[n].push(r)}}return t},nl=(e,t)=>{let{extend:n=null,slots:r={},variants:i={},compoundVariants:a=[],compoundSlots:o=[],defaultVariants:s={}}=e,c={...Ic,...t},l=e.slots!==void 0,u=n?.base?Oc(n.base,e?.base):e?.base,d=n?.variants&&!Ac(n.variants)?Fc(i,n.variants):i,f=n?.defaultVariants&&!Ac(n.defaultVariants)?{...n.defaultVariants,...s}:s;Zc(c);let p=!n?.slots||Ac(n.slots),m=l?p&&n?.base?Oc(e?.base,n.base):typeof e?.base==`string`||e?.base==null?e.base:Oc(e.base):void 0,h=l?{base:m,...r}:{},g=p?h:Mc({...n?.slots},Ac(h)?{base:e?.base}:h),_=!n?.compoundVariants||Ac(n.compoundVariants)?a:Pc(n?.compoundVariants,a),v=!n?.compoundSlots||Ac(n.compoundSlots)?o:Pc(n?.compoundSlots,o),y=Object.keys(d);return{config:c,extend:n,base:u,variants:d,defaultVariants:f,slots:g,compoundVariants:_,compoundSlots:v,compiledVariants:null,compiledCompoundVariants:null,compiledCompoundSlots:null,compiledCompoundSlotsBySlot:null,deferredError:_&&!Array.isArray(_)?TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof _}`):v&&!Array.isArray(v)?TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof v}`):null,mode:l||!p?`slots`:y.length===0?`plain`:`variants`,slotKeys:null,variantKeys:y}},rl=e=>e.compiledVariants===null?(e.compiledVariants=Qc(e.variants,e.variantKeys),e.compiledCompoundVariants=$c(e.compoundVariants),e.compiledCompoundSlots=el(e.compoundSlots),e.compiledCompoundSlotsBySlot=tl(e.compiledCompoundSlots),e.slotKeys=e.slots&&typeof e.slots==`object`?Object.keys(e.slots):[],e):e,il=[],al=[],ol=[],sl=[],cl=[],ll=(e,t,n)=>{let r={};for(let t in e)r[t]=e[t];if(t)for(let e in t)t[e]!==void 0&&(r[e]=t[e]);if(n)for(let e in n)n[e]!==void 0&&(r[e]=n[e]);return r},ul=e=>e==null||e===!1,dl=(e,t)=>{if(!Array.isArray(e))return e===t||ul(e)&&ul(t);for(let n=0;n<e.length;n++){let r=e[n];if(r===t||ul(r)&&ul(t))return!0}return!1},fl=(e,t,n,r)=>{if(e.isEmpty)return null;let i=r?.[e.key]??n?.[e.key];if(i===null)return null;let a=kc(i);if(typeof a==`object`)return null;let o=t?.[e.key],s=a??kc(o);return e.values[s||`false`]},pl=(e,t)=>{let{conditionKeys:n,source:r}=e;for(let e=0;e<n.length;e++){let i=n[e];if(!dl(r[i],t[i]))return!1}return!0},ml=(e,t,n)=>{typeof n==`string`?t===`base`&&e.push(n):n&&typeof n==`object`&&n[t]&&e.push(n[t])},hl=(e,t,n)=>{let r=al;r.length=0;for(let i=0;i<e.length;i++){let a=fl(e[i],t,n);a&&r.push(a)}return r},gl=(e,t,n,r,i)=>{let a=al;a.length=0;for(let o=0;o<t.length;o++){let s=fl(t[o],n,r,i),c=e===`base`&&typeof s==`string`?s:s&&s[e];c&&a.push(c)}return a},_l=(e,t)=>{let n=ol;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];pl(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},vl=(e,t,n)=>{let r=sl;r.length=0;for(let i=0;i<t.length;i++){let a=t[i];pl(a,n)&&(ml(r,e,a.source.class),ml(r,e,a.source.className))}return r},yl=(e,t)=>{let n=cl;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];pl(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},bl=(e,t)=>{let{base:n,config:r}=e,i=zc,a=Jc(t,r);return(e=>(i===zc&&(i=t(r,n)),a(i,e)))},xl=(e,t)=>{let{base:n,config:r,defaultVariants:i,deferredError:a,variantKeys:o}=e,s=e.compiledCompoundVariants,c=e.compiledVariants,l=il,u=null,d=Jc(t,r),f=1,p=e=>{let a=s.length>0?_l(s,ll(i,e)):void 0;return t(r,n,hl(c,i,e),a)};return(t=>{if(a)throw a;(c===null||s===null)&&(rl(e),c=e.compiledVariants,s=e.compiledCompoundVariants,l=e.compiledCompoundSlots??il);let n;if(f>0)f--,n=p(t);else{u??=Kc();let e=Uc(o,i,t);if(e!==null){let r=s.length>0||l.length>0?Wc(s,l):``,i=e+`#`+r,a=u.get(i);a===zc?(n=p(t),u.set(i,n)):n=a}else n=p(t)}return d(n,t)})},Sl=(e,t)=>{let{config:n,defaultVariants:r,deferredError:i,slots:a,variantKeys:o}=e,s=null,c=null,l=null,u=null,d=!1,f=null,p=null,m=1,h=()=>{if(l!==null)return;(e.compiledVariants===null||e.compiledCompoundVariants===null||e.compiledCompoundSlots===null||e.compiledCompoundSlotsBySlot===null||e.slotKeys===null)&&rl(e);let i=e.compiledVariants;s=e.compiledCompoundVariants,c=e.compiledCompoundSlots;let o=e.compiledCompoundSlotsBySlot;l=e.slotKeys,d=s.length>0||c.length>0,f=Jc(t,n);let p=Array(l.length);for(let e=0;e<l.length;e++){let c=l[e],u=o[c]??il;p[e]=(e,o)=>{let l=d?ll(r,e,o):void 0,f=l?vl(c,s,l):void 0,p=l?yl(u,l):void 0;return t(n,a[c],gl(c,i,r,e,o),f,p)}}u=p},g=e=>{let t=l,n=u,r=f,i={};for(let a=0;a<t.length;a++){let o=n[a],s=o(e);i[t[a]]=t=>{if(t==null)return s;let n=!1;for(let e in t)if(e!==`class`&&e!==`className`&&t[e]!==void 0){n=!0;break}return r(n?o(e,t):s,t)}}return i};return(e=>{if(i)throw i;if(h(),m>0)return m--,g(e);let t=Uc(o,r,e);if(t===null)return g(e);let n=d?Wc(s,c):``,a=t+`#`+n;p??=Gc();let l=p.get(a);if(l!==zc)return l;let u=g(e);return p.set(a,u),u})},Cl=(e,t)=>{if(e.mode===`plain`)return bl(e,t);let n;return(r=>(n??=e.mode===`slots`?Sl(e,t):xl(e,t),n(r)))},wl=(e,t)=>{e.variantKeys=t.variantKeys,e.extend=t.extend,e.base=t.base,e.slots=t.slots,e.variants=t.variants,e.defaultVariants=t.defaultVariants,e.compoundSlots=t.compoundSlots,e.compoundVariants=t.compoundVariants},Tl=e=>{let t=(t,n)=>{let r=nl(t,n),i=Cl(r,e);return wl(i,r),i};return{tv:t,createTV:e=>(n,r)=>t(n,r?Fc(e,r):e)}},El=(e,t)=>{let n=e.length,r=t.length,i=Array(n+r);for(let t=0;t<n;t++)i[t]=e[t];for(let e=0;e<r;e++)i[n+e]=t[e];return i},Dl=(e,t)=>({classGroupId:e,validator:t}),Ol=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),kl=`-`,Al=[],jl=`arbitrary..`,Ml=e=>{let t=Fl(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e[0]===`[`&&e[e.length-1]===`]`)return Pl(e);let n=e.split(kl);return Nl(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?El(i,t):t:i||Al}return n[e]||Al}}},Nl=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=Nl(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(kl):e.slice(t).join(kl),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},Pl=e=>{let t=e.slice(1,-1),n=t.indexOf(`:`);if(n===-1)return;let r=t.slice(0,n);return r?jl+r:void 0},Fl=e=>{let{theme:t,classGroups:n}=e;return Il(n,t)},Il=(e,t)=>{let n=Ol();for(let r in e){let i=e[r];Ll(i,n,r,t)}return n},Ll=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];Rl(i,t,n,r)}},Rl=(e,t,n,r)=>{if(typeof e==`string`){zl(e,t,n);return}if(typeof e==`function`){Bl(e,t,n,r);return}Vl(e,t,n,r)},zl=(e,t,n)=>{let r=e===``?t:Hl(t,e);r.classGroupId=n},Bl=(e,t,n,r)=>{if(Ul(e)){Ll(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Dl(n,e))},Vl=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];Ll(o,Hl(t,a),n,r)}},Hl=(e,t)=>{let n=e,r=t.split(kl),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=Ol(),n.nextPart.set(t,i)),n=i}return n},Ul=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,Wl=`!`,Gl=58,Kl=47,ql=91,Jl=93,Yl=40,Xl=41,Zl=33,Ql=(e,t,n,r)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:void 0}),$l=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e.charCodeAt(s);if(n===0&&r===0){if(o===Gl){t.push(e.slice(i,s)),i=s+1;continue}if(o===Kl){a=s;continue}}o===ql?n++:o===Jl?n--:o===Yl?r++:o===Xl&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1,u=s.length-1;s.charCodeAt(u)===Zl?(c=s.slice(0,-1),l=!0):s.charCodeAt(0)===Zl&&(c=s.slice(1),l=!0);let d=a&&a>i?a-i:void 0;return Ql(t,l,c,d)},eu=e=>{let t=new Set(e.orderSensitiveModifiers);return e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);if(o||s){if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e]);r=[]}n.push(a)}else r.push(a)}if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e])}return n}},tu={isExternal:!0,classId:-1,conflictIds:[]},nu=4096,ru=16384,iu=e=>{let t=eu(e),n=au(e),{getClassGroupId:r,getConflictingClassGroupIds:i}=Ml(e),a=Object.create(null),o=Object.create(null),s=0,c=new Int32Array(256),l=0,u=new Uint8Array(64),d=!1,f=e=>{let t=[],n=e.length,r=-1;d=!1;for(let i=0;i<n;i++){let n=e.charCodeAt(i);n===32?r!==-1&&(t.push(e.slice(r,i)),r=-1):n>=9&&n<=13?(d=!0,r!==-1&&(t.push(e.slice(r,i)),r=-1)):r===-1&&(r=i)}return r!==-1&&t.push(e.slice(r)),t},p=new Map,m=0,h=e=>{let t=p.get(e);if(t===void 0&&(t=m++,p.set(e,t),t>=c.length)){let e=new Int32Array(c.length*2);e.set(c),c=e}return t},g=e=>{let{isExternal:a,modifiers:o,hasImportantModifier:s,baseClassName:c,maybePostfixModifierPosition:l}=$l(e);if(a)return tu;let u=!!l,d;if(u){let e=c.substring(0,l);d=r(e);let t=d&&n[d]?r(c):void 0;t&&t!==d&&(d=t,u=!1)}else d=r(c);if(!d){if(!u||(d=r(c),!d))return tu;u=!1}let f=o.length===0?``:o.length===1?o[0]:t(o).join(`:`),p=s?f+Wl:f,m=i(d,u),g=[];for(let e=0;e<m.length;e++)g.push(h(p+m[e]));return{isExternal:!1,classId:h(p+d),conflictIds:g}},_=e=>{let t=a[e];return t===void 0?(t=o[e],t===void 0&&(t=g(e)),a[e]=t,++s>nu&&(s=0,o=a,a=Object.create(null)),t):t};return{parseClassName:$l,sortModifiers:t,postfixLookupClassGroupIds:n,getClassGroupId:r,getConflictingClassGroupIds:i,getClassDescriptor:_,mergeClassList:e=>{let t=f(e),n=t.length;if(n===1)return t[0];m>ru&&(p.clear(),m=0,a=Object.create(null),o=Object.create(null),s=0),l=l+1|0,l===0&&(l=1);let r=l;if(n>u.length){let e=u.length;for(;e<n;)e*=2;u=new Uint8Array(e)}let i=!1,h=0;for(let e=n-1;e>=0;--e){let n=t[e];h+=n.length;let a=_(n);if(a.isExternal){u[e]=1;continue}let o=a.classId;if(c[o]===r){u[e]=0,i=!0;continue}c[o]=r;let s=a.conflictIds;for(let e=0;e<s.length;e++)c[s[e]]=r;u[e]=1}if(!i&&!d&&e.length===h+n-1)return e;let g=``;for(let e=0;e<n;e++)u[e]===1&&(g&&(g+=` `),g+=t[e]);return g}}},au=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},ou=500,su=e=>{let t,n,r=Object.create(null),i=Object.create(null),a=0,o=r=>(t=iu(e()),n=t.mergeClassList,c.mergeString=s,s(r)),s=e=>{let t=r[e];return t===void 0?(t=i[e],t===void 0&&(t=n(e)),r[e]=t,++a>ou&&(a=0,i=r,r=Object.create(null)),t):t},c=(...e)=>c.mergeString(Cc(e));return c.mergeString=o,c},cu=[],lu=e=>{let t=t=>t[e]||cu;return t.isThemeGetter=!0,t},uu=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,du=/^\((?:(\w[\w-]*):)?(.+)\)$/i,fu=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,pu=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,mu=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,hu=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,gu=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,_u=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,vu=Number,yu=Number.isNaN,bu=Number.isInteger,xu=e=>fu.test(e),Z=e=>!!e&&!yu(vu(e)),Su=e=>!!e&&bu(vu(e)),Cu=e=>e.endsWith(`%`)&&Z(e.slice(0,-1)),wu=e=>pu.test(e),Tu=()=>!0,Eu=e=>mu.test(e)&&!hu.test(e),Du=()=>!1,Ou=e=>gu.test(e),ku=e=>_u.test(e),Au=e=>!Q(e)&&!$(e),ju=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),Mu=e=>qu(e,Zu,Du),Q=e=>uu.test(e),Nu=e=>qu(e,Qu,Eu),Pu=e=>qu(e,$u,Z),Fu=e=>qu(e,td,Tu),Iu=e=>qu(e,ed,Du),Lu=e=>qu(e,Yu,Du),Ru=e=>qu(e,Xu,ku),zu=e=>qu(e,nd,Ou),$=e=>du.test(e),Bu=e=>Ju(e,Qu),Vu=e=>Ju(e,ed),Hu=e=>Ju(e,Yu),Uu=e=>Ju(e,Zu),Wu=e=>Ju(e,Xu),Gu=e=>Ju(e,nd,!0),Ku=e=>Ju(e,td,!0),qu=(e,t,n)=>{let r=uu.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},Ju=(e,t,n=!1)=>{let r=du.exec(e);return r?r[1]?t(r[1]):n:!1},Yu=e=>e===`position`||e===`percentage`,Xu=e=>e===`image`||e===`url`,Zu=e=>e===`length`||e===`size`||e===`bg-size`,Qu=e=>e===`length`,$u=e=>e===`number`,ed=e=>e===`family-name`,td=e=>e===`number`||e===`weight`,nd=e=>e===`shadow`,rd=()=>{let e=lu(`color`),t=lu(`font`),n=lu(`text`),r=lu(`font-weight`),i=lu(`tracking`),a=lu(`leading`),o=lu(`breakpoint`),s=lu(`container`),c=lu(`spacing`),l=lu(`radius`),u=lu(`shadow`),d=lu(`inset-shadow`),f=lu(`text-shadow`),p=lu(`drop-shadow`),m=lu(`blur`),h=lu(`perspective`),g=lu(`aspect`),_=lu(`ease`),v=lu(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],ee=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],te=()=>[...ee(),$,Q],ne=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],re=()=>[`auto`,`contain`,`none`],b=()=>[$,Q,c],x=()=>[xu,`full`,`auto`,...b()],ie=()=>[Su,`none`,`subgrid`,$,Q],ae=()=>[`auto`,{span:[`full`,Su,$,Q]},Su,$,Q],oe=()=>[Su,`auto`,$,Q],se=()=>[`auto`,`min`,`max`,`fr`,$,Q],ce=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],le=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],ue=()=>[`auto`,...b()],de=()=>[xu,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...b()],fe=()=>[xu,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...b()],pe=()=>[xu,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...b()],S=()=>[e,$,Q],me=()=>[...ee(),Hu,Lu,{position:[$,Q]}],he=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ge=()=>[`auto`,`cover`,`contain`,Uu,Mu,{size:[$,Q]}],_e=()=>[Cu,Bu,Nu],C=()=>[``,`none`,`full`,l,$,Q],w=()=>[``,Z,Bu,Nu],ve=()=>[`solid`,`dashed`,`dotted`,`double`],ye=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],T=()=>[Z,Cu,Hu,Lu],be=()=>[``,`none`,m,$,Q],xe=()=>[`none`,Z,$,Q],E=()=>[`none`,Z,$,Q],Se=()=>[Z,$,Q],D=()=>[xu,`full`,...b()];return{theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[wu],breakpoint:[wu],color:[Tu],container:[wu],"drop-shadow":[wu],ease:[`in`,`out`,`in-out`],font:[Au],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[wu],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[wu],shadow:[wu],spacing:[`px`,Z],text:[wu],"text-shadow":[wu],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,xu,Q,$,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,$,Q]}],"container-named":[ju],columns:[{columns:[Z,Q,$,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:te()}],overflow:[{overflow:ne()}],"overflow-x":[{"overflow-x":ne()}],"overflow-y":[{"overflow-y":ne()}],overscroll:[{overscroll:re()}],"overscroll-x":[{"overscroll-x":re()}],"overscroll-y":[{"overscroll-y":re()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:x()}],"inset-x":[{"inset-x":x()}],"inset-y":[{"inset-y":x()}],start:[{"inset-s":x(),start:x()}],end:[{"inset-e":x(),end:x()}],"inset-bs":[{"inset-bs":x()}],"inset-be":[{"inset-be":x()}],top:[{top:x()}],right:[{right:x()}],bottom:[{bottom:x()}],left:[{left:x()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Su,`auto`,$,Q]}],basis:[{basis:[xu,`full`,`auto`,s,...b()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[Z,xu,`auto`,`initial`,`none`,Q]}],grow:[{grow:[``,Z,$,Q]}],shrink:[{shrink:[``,Z,$,Q]}],order:[{order:[Su,`first`,`last`,`none`,$,Q]}],"grid-cols":[{"grid-cols":ie()}],"col-start-end":[{col:ae()}],"col-start":[{"col-start":oe()}],"col-end":[{"col-end":oe()}],"grid-rows":[{"grid-rows":ie()}],"row-start-end":[{row:ae()}],"row-start":[{"row-start":oe()}],"row-end":[{"row-end":oe()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":se()}],"auto-rows":[{"auto-rows":se()}],gap:[{gap:b()}],"gap-x":[{"gap-x":b()}],"gap-y":[{"gap-y":b()}],"justify-content":[{justify:[...ce(),`normal`]}],"justify-items":[{"justify-items":[...le(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...le()]}],"align-content":[{content:[`normal`,...ce()]}],"align-items":[{items:[...le(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...le(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ce()}],"place-items":[{"place-items":[...le(),`baseline`]}],"place-self":[{"place-self":[`auto`,...le()]}],p:[{p:b()}],px:[{px:b()}],py:[{py:b()}],ps:[{ps:b()}],pe:[{pe:b()}],pbs:[{pbs:b()}],pbe:[{pbe:b()}],pt:[{pt:b()}],pr:[{pr:b()}],pb:[{pb:b()}],pl:[{pl:b()}],m:[{m:ue()}],mx:[{mx:ue()}],my:[{my:ue()}],ms:[{ms:ue()}],me:[{me:ue()}],mbs:[{mbs:ue()}],mbe:[{mbe:ue()}],mt:[{mt:ue()}],mr:[{mr:ue()}],mb:[{mb:ue()}],ml:[{ml:ue()}],"space-x":[{"space-x":b()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":b()}],"space-y-reverse":[`space-y-reverse`],size:[{size:de()}],"inline-size":[{inline:[`auto`,...fe()]}],"min-inline-size":[{"min-inline":[`auto`,...fe()]}],"max-inline-size":[{"max-inline":[`none`,...fe()]}],"block-size":[{block:[`auto`,...pe()]}],"min-block-size":[{"min-block":[`auto`,...pe()]}],"max-block-size":[{"max-block":[`none`,...pe()]}],w:[{w:[s,`screen`,...de()]}],"min-w":[{"min-w":[s,`screen`,`none`,...de()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...de()]}],h:[{h:[`screen`,`lh`,...de()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...de()]}],"max-h":[{"max-h":[`screen`,`lh`,...de()]}],"font-size":[{text:[`base`,n,Bu,Nu]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,Ku,Fu]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Cu,Q]}],"font-family":[{font:[Vu,Iu,t]}],"font-features":[{"font-features":[Q]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,$,Q]}],"line-clamp":[{"line-clamp":[Z,`none`,$,Pu]}],leading:[{leading:[a,...b()]}],"list-image":[{"list-image":[`none`,$,Q]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,$,Q]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:S()}],"text-color":[{text:S()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...ve(),`wavy`]}],"text-decoration-thickness":[{decoration:[Z,`from-font`,`auto`,$,Nu]}],"text-decoration-color":[{decoration:S()}],"underline-offset":[{"underline-offset":[Z,`auto`,$,Q]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:b()}],"tab-size":[{tab:[Su,$,Q]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,$,Q]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,$,Q]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:me()}],"bg-repeat":[{bg:he()}],"bg-size":[{bg:ge()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Su,$,Q],radial:[``,$,Q],conic:[Su,$,Q]},Wu,Ru]}],"bg-color":[{bg:S()}],"gradient-from-pos":[{from:_e()}],"gradient-via-pos":[{via:_e()}],"gradient-to-pos":[{to:_e()}],"gradient-from":[{from:S()}],"gradient-via":[{via:S()}],"gradient-to":[{to:S()}],rounded:[{rounded:C()}],"rounded-s":[{"rounded-s":C()}],"rounded-e":[{"rounded-e":C()}],"rounded-t":[{"rounded-t":C()}],"rounded-r":[{"rounded-r":C()}],"rounded-b":[{"rounded-b":C()}],"rounded-l":[{"rounded-l":C()}],"rounded-ss":[{"rounded-ss":C()}],"rounded-se":[{"rounded-se":C()}],"rounded-ee":[{"rounded-ee":C()}],"rounded-es":[{"rounded-es":C()}],"rounded-tl":[{"rounded-tl":C()}],"rounded-tr":[{"rounded-tr":C()}],"rounded-br":[{"rounded-br":C()}],"rounded-bl":[{"rounded-bl":C()}],"border-w":[{border:w()}],"border-w-x":[{"border-x":w()}],"border-w-y":[{"border-y":w()}],"border-w-s":[{"border-s":w()}],"border-w-e":[{"border-e":w()}],"border-w-bs":[{"border-bs":w()}],"border-w-be":[{"border-be":w()}],"border-w-t":[{"border-t":w()}],"border-w-r":[{"border-r":w()}],"border-w-b":[{"border-b":w()}],"border-w-l":[{"border-l":w()}],"divide-x":[{"divide-x":w()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":w()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...ve(),`hidden`,`none`]}],"divide-style":[{divide:[...ve(),`hidden`,`none`]}],"border-color":[{border:S()}],"border-color-x":[{"border-x":S()}],"border-color-y":[{"border-y":S()}],"border-color-s":[{"border-s":S()}],"border-color-e":[{"border-e":S()}],"border-color-bs":[{"border-bs":S()}],"border-color-be":[{"border-be":S()}],"border-color-t":[{"border-t":S()}],"border-color-r":[{"border-r":S()}],"border-color-b":[{"border-b":S()}],"border-color-l":[{"border-l":S()}],"divide-color":[{divide:S()}],"outline-style":[{outline:[...ve(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[Z,$,Q]}],"outline-w":[{outline:[``,Z,Bu,Nu]}],"outline-color":[{outline:S()}],shadow:[{shadow:[``,`none`,u,Gu,zu]}],"shadow-color":[{shadow:S()}],"inset-shadow":[{"inset-shadow":[`none`,d,Gu,zu]}],"inset-shadow-color":[{"inset-shadow":S()}],"ring-w":[{ring:w()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:S()}],"ring-offset-w":[{"ring-offset":[Z,Nu]}],"ring-offset-color":[{"ring-offset":S()}],"inset-ring-w":[{"inset-ring":w()}],"inset-ring-color":[{"inset-ring":S()}],"text-shadow":[{"text-shadow":[`none`,f,Gu,zu]}],"text-shadow-color":[{"text-shadow":S()}],opacity:[{opacity:[Z,$,Q]}],"mix-blend":[{"mix-blend":[...ye(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":ye()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[Z]}],"mask-image-linear-from-pos":[{"mask-linear-from":T()}],"mask-image-linear-to-pos":[{"mask-linear-to":T()}],"mask-image-linear-from-color":[{"mask-linear-from":S()}],"mask-image-linear-to-color":[{"mask-linear-to":S()}],"mask-image-t-from-pos":[{"mask-t-from":T()}],"mask-image-t-to-pos":[{"mask-t-to":T()}],"mask-image-t-from-color":[{"mask-t-from":S()}],"mask-image-t-to-color":[{"mask-t-to":S()}],"mask-image-r-from-pos":[{"mask-r-from":T()}],"mask-image-r-to-pos":[{"mask-r-to":T()}],"mask-image-r-from-color":[{"mask-r-from":S()}],"mask-image-r-to-color":[{"mask-r-to":S()}],"mask-image-b-from-pos":[{"mask-b-from":T()}],"mask-image-b-to-pos":[{"mask-b-to":T()}],"mask-image-b-from-color":[{"mask-b-from":S()}],"mask-image-b-to-color":[{"mask-b-to":S()}],"mask-image-l-from-pos":[{"mask-l-from":T()}],"mask-image-l-to-pos":[{"mask-l-to":T()}],"mask-image-l-from-color":[{"mask-l-from":S()}],"mask-image-l-to-color":[{"mask-l-to":S()}],"mask-image-x-from-pos":[{"mask-x-from":T()}],"mask-image-x-to-pos":[{"mask-x-to":T()}],"mask-image-x-from-color":[{"mask-x-from":S()}],"mask-image-x-to-color":[{"mask-x-to":S()}],"mask-image-y-from-pos":[{"mask-y-from":T()}],"mask-image-y-to-pos":[{"mask-y-to":T()}],"mask-image-y-from-color":[{"mask-y-from":S()}],"mask-image-y-to-color":[{"mask-y-to":S()}],"mask-image-radial":[{"mask-radial":[$,Q]}],"mask-image-radial-from-pos":[{"mask-radial-from":T()}],"mask-image-radial-to-pos":[{"mask-radial-to":T()}],"mask-image-radial-from-color":[{"mask-radial-from":S()}],"mask-image-radial-to-color":[{"mask-radial-to":S()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":ee()}],"mask-image-conic-pos":[{"mask-conic":[Z]}],"mask-image-conic-from-pos":[{"mask-conic-from":T()}],"mask-image-conic-to-pos":[{"mask-conic-to":T()}],"mask-image-conic-from-color":[{"mask-conic-from":S()}],"mask-image-conic-to-color":[{"mask-conic-to":S()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:me()}],"mask-repeat":[{mask:he()}],"mask-size":[{mask:ge()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,$,Q]}],filter:[{filter:[``,`none`,$,Q]}],blur:[{blur:be()}],brightness:[{brightness:[Z,$,Q]}],contrast:[{contrast:[Z,$,Q]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,Gu,zu]}],"drop-shadow-color":[{"drop-shadow":S()}],grayscale:[{grayscale:[``,Z,$,Q]}],"hue-rotate":[{"hue-rotate":[Z,$,Q]}],invert:[{invert:[``,Z,$,Q]}],saturate:[{saturate:[Z,$,Q]}],sepia:[{sepia:[``,Z,$,Q]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,$,Q]}],"backdrop-blur":[{"backdrop-blur":be()}],"backdrop-brightness":[{"backdrop-brightness":[Z,$,Q]}],"backdrop-contrast":[{"backdrop-contrast":[Z,$,Q]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,Z,$,Q]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[Z,$,Q]}],"backdrop-invert":[{"backdrop-invert":[``,Z,$,Q]}],"backdrop-opacity":[{"backdrop-opacity":[Z,$,Q]}],"backdrop-saturate":[{"backdrop-saturate":[Z,$,Q]}],"backdrop-sepia":[{"backdrop-sepia":[``,Z,$,Q]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":b()}],"border-spacing-x":[{"border-spacing-x":b()}],"border-spacing-y":[{"border-spacing-y":b()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,$,Q]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[Z,`initial`,$,Q]}],ease:[{ease:[`linear`,`initial`,_,$,Q]}],delay:[{delay:[Z,$,Q]}],animate:[{animate:[`none`,v,$,Q]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,$,Q]}],"perspective-origin":[{"perspective-origin":te()}],rotate:[{rotate:xe()}],"rotate-x":[{"rotate-x":xe()}],"rotate-y":[{"rotate-y":xe()}],"rotate-z":[{"rotate-z":xe()}],scale:[{scale:E()}],"scale-x":[{"scale-x":E()}],"scale-y":[{"scale-y":E()}],"scale-z":[{"scale-z":E()}],"scale-3d":[`scale-3d`],skew:[{skew:Se()}],"skew-x":[{"skew-x":Se()}],"skew-y":[{"skew-y":Se()}],transform:[{transform:[$,Q,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:te()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:D()}],"translate-x":[{"translate-x":D()}],"translate-y":[{"translate-y":D()}],"translate-z":[{"translate-z":D()}],"translate-none":[`translate-none`],zoom:[{zoom:[Su,$,Q]}],accent:[{accent:S()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:S()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,$,Q]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":S()}],"scrollbar-track-color":[{"scrollbar-track":S()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":b()}],"scroll-mx":[{"scroll-mx":b()}],"scroll-my":[{"scroll-my":b()}],"scroll-ms":[{"scroll-ms":b()}],"scroll-me":[{"scroll-me":b()}],"scroll-mbs":[{"scroll-mbs":b()}],"scroll-mbe":[{"scroll-mbe":b()}],"scroll-mt":[{"scroll-mt":b()}],"scroll-mr":[{"scroll-mr":b()}],"scroll-mb":[{"scroll-mb":b()}],"scroll-ml":[{"scroll-ml":b()}],"scroll-p":[{"scroll-p":b()}],"scroll-px":[{"scroll-px":b()}],"scroll-py":[{"scroll-py":b()}],"scroll-ps":[{"scroll-ps":b()}],"scroll-pe":[{"scroll-pe":b()}],"scroll-pbs":[{"scroll-pbs":b()}],"scroll-pbe":[{"scroll-pbe":b()}],"scroll-pt":[{"scroll-pt":b()}],"scroll-pr":[{"scroll-pr":b()}],"scroll-pb":[{"scroll-pb":b()}],"scroll-pl":[{"scroll-pl":b()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,$,Q]}],fill:[{fill:[`none`,...S()]}],"stroke-w":[{stroke:[Z,Bu,Nu,Pu]}],stroke:[{stroke:[`none`,...S()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`right`,`left`],"inset-y":[`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`pr`,`pl`],py:[`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`mr`,`ml`],my:[`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-r`,`border-w-l`],"border-w-y":[`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-r`,`border-color-l`],"border-color-y":[`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},id=(e,{extend:t={},override:n={}})=>(od(e.theme,n.theme),od(e.classGroups,n.classGroups),od(e.conflictingClassGroups,n.conflictingClassGroups),od(e.conflictingClassGroupModifiers,n.conflictingClassGroupModifiers),ad(e,`postfixLookupClassGroups`,n.postfixLookupClassGroups),ad(e,`orderSensitiveModifiers`,n.orderSensitiveModifiers),sd(e.theme,t.theme),sd(e.classGroups,t.classGroups),sd(e.conflictingClassGroups,t.conflictingClassGroups),sd(e.conflictingClassGroupModifiers,t.conflictingClassGroupModifiers),cd(e,t,`postfixLookupClassGroups`),cd(e,t,`orderSensitiveModifiers`),e),ad=(e,t,n)=>{n!==void 0&&(e[t]=n)},od=(e,t)=>{if(t)for(let n in t)ad(e,n,t[n])},sd=(e,t)=>{if(t)for(let n in t)cd(e,t,n)},cd=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},ld=e=>su(e?typeof e==`function`?()=>e(rd()):()=>id(rd(),e):rd),ud=e=>{if(Ac(e))return;let t=e,n={...t.extend??{}};for(let e of[`theme`,`classGroups`,`conflictingClassGroups`,`conflictingClassGroupModifiers`,`postfixLookupClassGroups`,`orderSensitiveModifiers`,`cacheSize`,`prefix`,`separator`,`experimentalParseClassName`])t[e]!==void 0&&n[e]===void 0&&(n[e]=t[e]);let r={};if(Object.keys(n).length>0&&(r.extend=n),t.override!=null&&!Ac(t.override)&&(r.override=t.override),r.extend||r.override)return r},dd=e=>{let t=ld(ud(e));return e=>t.mergeString(e)},fd,pd=()=>(fd||=ld(),fd),md=()=>((!Xc.cachedTwMerge||Xc.didTwMergeConfigChange)&&(Xc.didTwMergeConfigChange=!1,Xc.cachedTwMerge=dd(Xc.cachedTwMergeConfig)),Xc.cachedTwMerge),hd=e=>{let t=e?.twMergeConfig;t&&!Ac(t)&&(jc(t,Xc.cachedTwMergeConfig)||(Xc.cachedTwMergeConfig=t,Xc.didTwMergeConfigChange=!0))},gd=e=>Cc(e);(()=>{let e=Error();return!(`line`in e)&&!(`lineNumber`in e)})();var _d=Xc.reset.bind(Xc);Xc.reset=()=>{fd=void 0,_d()};var vd=(e,t)=>{let n=gd(e);return!n||!(t?.twMerge??!0)?n||void 0:n.indexOf(` `)===-1?n:(hd(t),(t?.twMergeConfig&&!Ac(t.twMergeConfig)?md():pd().mergeString)(n)||void 0)},yd=Tl((e,...t)=>vd(t,e));yd.tv;var bd=yd.createTV,xd=`/* Generated by \`bun run tokens\` from design/tokens/cawco.tokens.json.
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
`,Sd=e=>[...xd.matchAll(RegExp(`^\\s*--${e}-([a-z0-9-]+):`,`gm`))].map(([,e])=>e),Cd=e=>[...xd.matchAll(RegExp(`^@utility ${e}-([a-z0-9-]+) \\{`,`gm`))].map(([,e])=>e),wd=Sd(`duration`),Td=[`type-role`,`font-shorthand`,`font-family`,`font-features`,`font-size`,`font-stretch`,`font-style`,`font-weight`,`fvn-normal`,`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`,`leading`],Ed=[mc.isArbitraryVariable,mc.isArbitraryValue],Dd={extend:{theme:{text:Cd(`text`).filter(e=>!e.startsWith(`size-`)),spacing:Sd(`spacing`),radius:Sd(`radius`),shadow:Sd(`shadow`),"drop-shadow":Sd(`drop-shadow`),leading:Sd(`leading`),tracking:Sd(`tracking`),ease:Sd(`ease`),font:Sd(`font`).filter(e=>!e.startsWith(`weight-`)),"font-weight":Sd(`font-weight`),breakpoint:Sd(`breakpoint`),container:Sd(`container`),animate:Sd(`animate`)},classGroups:{"font-size":[{"text-size":Cd(`text-size`)}],"bg-image":[{bg:Cd(`bg`)}],transition:[{transition:[...Cd(`transition`),`off`,`control-grow`]}],animate:[`sheet-fade`],content:[{content:[`data-n`,`placeholder`]}],"grid-rows":[{"grid-rows":[`shut`,`open`]}],"grid-cols":[{"grid-cols":[`fluid-auto`,`mark-fluid`]}],"auto-rows":[{"auto-rows":[`line`,`band`,`band-phone`]}],"animation-duration":[{"anim-dur":wd}],"animation-delay":[{"anim-delay":wd}],"type-role":[{type:Cd(`type`)}],"border-none-t":[`border-t-none`],"border-none-b":[`border-b-none`],"border-none-l":[`border-l-none`],"border-none-r":[`border-r-none`],"border-none-s":[`border-s-none`],"border-style-t":[`border-t-dashed`],"outline-off":[`outline-off`],"background-shorthand":[{background:[mc.isAny]}],rounded:[`rounded-inherit`,{concentric:Sd(`radius`)}],"concentric-in":[`concentric-in`],"r-outer":[{"r-outer":Sd(`radius`)}],"r-inset":[{"r-inset":Sd(`spacing`)}],"font-family":[`font-family-inherit`],gap:[`gap-inherit`],"color-scheme":[`scheme-inherit`],"pointer-events":[`pointer-events-all`],"max-h":[`max-h-inherit`],"align-items":[`items-box-start`,`items-box-end`,`items-unsafe-end`],"justify-content":[`justify-box-end`],"justify-self":[`justify-self-box-start`],"align-content":[`content-unsafe-end`],"border-color":[`border-suggest-tint`],"bg-color":[`bg-suggest-tint`,`bg-suggest-tint-hover`],"font-shorthand":[`font-inherit`,`font-mono-meta`],"line-clamp-undo":[`line-clamp-undo`],"translate-raw":[{"translate-raw":Ed}],"clip-margin":[{"clip-margin":[mc.isAny]}],"overflow-anchor":[`anchor-none`],"scroll-timeline":[`scroll-timeline-transcript-head`],"pane-tab-pads":[`pane-tab-pads`],"pane-tab-rims":[`pane-tab-rims`],"divider-chevron":[`divider-chevron`],"turn-pad":[`turn-pad`],"word-break-word":[`break-word`],"animation-play-state":[`animation-paused`],"inks-strong":[`inks-strong`],"tap-highlight":[`tap-highlight-none`],"touch-callout":[`touch-callout-none`],"content-visibility":[`content-visibility-hidden`],"timeline-scope":[`timeline-scope-transcript-head`],"writing-mode":[`writing-vertical-rl`],direction:[`dir-rtl`],"clip-path":[{"clip-path":Ed},`clip-block-start`,`clip-tab-foot`],"grid-areas":[{"grid-areas":Ed}],"line-clamp-std":[{"line-clamp-std":[mc.isInteger]}],"ring-ground":[{"ring-ground":[mc.isAny]}],"hit-gap-x":[{"hit-gap-x":[mc.isAny]}],"hit-gap-y":[{"hit-gap-y":Ed}],"caw-neck":[{"caw-neck":Ed}],"press-by":[{"press-by":Ed}],"swap-away":[{"swap-away":[mc.isInteger]}],"rail-step":[{"rail-step":Ed}],"prompt-fs":[{"prompt-fs":Ed}],"fade-inset-end":[{"fade-inset-end":Ed}]},conflictingClassGroups:{"type-role":[...Td],"font-shorthand":[...Td]}}},Od=xc(Dd),kd=bd({twMergeConfig:Dd});function Ad(...e){return Od(Ti(e))}var jd=kd({base:`loops block rounded-sm bg-surface-fill motion-safe:animate-skeleton-pulse`,variants:{height:{line:`h-6`,figure:`h-7`,item:`h-10`,tabs:`h-11`,row:`h-14`,block:`h-20`,plot:`h-24`,view:`h-40`,chart:`h-48`,board:`h-64`,"x-height":`h-c-skeleton-x-height`,picture:`aspect-16/10`,control:`h-c-btn-h`,"control-sm":`h-c-btn-h-sm`,field:`h-c-input-h`,badge:`h-c-badge-h`,chip:`h-c-suggest-chip`,stat:`h-c-stat-h`,card:`h-c-skeleton-card-h`,"reason-row":`h-c-find-skeleton-tall`},line:{meta:`type-meta h-lh`,label:`type-label h-lh`,body:`type-body h-lh`,title:`type-title h-lh`},width:{glyph:`w-6`,word:`w-14`,short:`w-16`,label:`w-20`,name:`w-24`,title:`w-40`,"chart-cap":`max-w-144`,age:`w-c-skeleton-age`},radius:{card:`rounded-lg`,tile:`rounded-md`,chip:`rounded-sm`,text:`rounded-xs`,flush:`rounded-none`,line:`rounded-hair`,pill:`rounded-pill`},cell:{rail:`rail-cell`,glyph:`size-icon-md`,mark:`size-c-row-mark`,pin:`size-c-pin`},type:{label:`type-label`,meta:`type-meta`},fill:{frame:`absolute inset-0`},hold:{cover:`group-data-ready/cover:animation-paused`}}}),Md=new Set([`$$slots`,`$$events`,`$$legacy`,`ref`,`class`,`height`,`line`,`width`,`radius`,`cell`,`type`,`fill`,`hold`]),Nd=B(`<span></span>`);function Pd(e,t){Ke(t,!0);let n=da(t,`ref`,15,null),r=ua(t,Md),i=e=>{for(let t of e.getAnimations({subtree:!0}))t instanceof CSSAnimation&&t.animationName===`kit-skeleton-pulse`&&t.playState===`running`&&(t.startTime=0)};var a=Nd();G(a,e=>({class:e,"data-slot":`skeleton`,...r}),[()=>Ad(jd({height:t.height,line:t.line,width:t.width,radius:t.radius,cell:t.cell,type:t.type,fill:t.fill,hold:t.hold}),t.class)]),oa(a,e=>n(e),()=>n()),Ci(a,()=>i),V(e,a),qe()}var Fd=new Set([`$$slots`,`$$events`,`$$legacy`]),Id=Hr(`<svg><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 9L12 15L5 9"></path></svg>`);function Ld(e,t){let n=ua(t,Fd);var r=Id();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Rd=new Set([`$$slots`,`$$events`,`$$legacy`]),zd=Hr(`<svg><g fill="currentColor"><g opacity=".5"><path d="M15.0625 8.00004C15.5698 8.00004 16.0547 8.09584 16.5 8.27055C17.9637 8.84479 19 10.2702 19 11.9375V15C19 18.6126 16.2633 21.5858 12.75 21.96V15C12.75 14.5858 12.4142 14.25 12 14.25C11.5858 14.25 11.25 14.5858 11.25 15V21.96C7.73669 21.5858 5 18.6126 5 15V11.9375C5 10.2702 6.03633 8.84479 7.5 8.27055C7.94531 8.09584 8.43023 8.00004 8.9375 8.00004H15.0625Z"></path><path d="M6.37598 1.58402C6.60572 1.23942 7.07138 1.14633 7.41602 1.37601L10.3311 3.31937C9.81444 3.52579 9.34486 3.82559 8.94336 4.1973L6.58398 2.62406C6.23941 2.39428 6.14623 1.92864 6.37598 1.58402Z"></path><path d="M16.584 1.37601C16.9286 1.14627 17.3942 1.23945 17.624 1.58402C17.8538 1.92867 17.7607 2.3943 17.416 2.62406L15.0566 4.1973C14.6551 3.82557 14.1856 3.5258 13.6689 3.31937L16.584 1.37601Z"></path></g><path d="M12 14.25C12.4142 14.25 12.75 14.5858 12.75 15V22H11.25V15C11.25 14.5858 11.5858 14.25 12 14.25Z"></path><path d="M5.70215 18.0605C5.92373 18.5156 6.1941 18.9426 6.50488 19.3359L3.83496 20.6709C3.46466 20.8558 3.01439 20.7061 2.8291 20.3359C2.64384 19.9655 2.79456 19.5144 3.16504 19.3291L5.70215 18.0605Z"></path><path d="M20.835 19.3291C21.2054 19.5144 21.3562 19.9655 21.1709 20.3359C20.9856 20.7061 20.5353 20.8558 20.165 20.6709L17.4951 19.3359C17.8059 18.9426 18.0763 18.5156 18.2979 18.0605L20.835 19.3291Z"></path><path d="M5 14.75H2C1.58583 14.75 1.25007 14.4142 1.25 14C1.25 13.5858 1.58579 13.25 2 13.25H5V14.75Z"></path><path d="M22 13.25C22.4142 13.25 22.75 13.5858 22.75 14C22.7499 14.4142 22.4142 14.75 22 14.75H19V13.25H22Z"></path><path d="M2.8291 7.66406C3.01434 7.29376 3.46457 7.14408 3.83496 7.3291L6.64648 8.73438C6.21949 9.04035 5.85589 9.43014 5.58008 9.87891L3.16504 8.6709C2.79456 8.48564 2.64384 8.03454 2.8291 7.66406Z"></path><path d="M20.165 7.3291C20.5354 7.14408 20.9857 7.29376 21.1709 7.66406C21.3562 8.03454 21.2054 8.48564 20.835 8.6709L18.4199 9.87891C18.1441 9.43014 17.7805 9.04035 17.3535 8.73438L20.165 7.3291Z"></path><path d="M12 3C14.4853 3 16.5 5.01472 16.5 7.5V8.27051C16.0547 8.09581 15.5698 8 15.0625 8H8.9375C8.43023 8 7.94531 8.09581 7.5 8.27051V7.5C7.5 5.01472 9.51472 3 12 3Z"></path></g></svg>`);function Bd(e,t){let n=ua(t,Rd);var r=zd();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Vd=new Set([`$$slots`,`$$events`,`$$legacy`]),Hd=Hr(`<svg><g fill="currentColor"><path d="M7 16C7.55228 16 8 16.4477 8 17C8 17.5523 7.55228 18 7 18C6.44772 18 6 17.5523 6 17C6 16.4477 6.44772 16 7 16Z"></path><path d="M12 16C12.5523 16 13 16.4477 13 17C13 17.5523 12.5523 18 12 18C11.4477 18 11 17.5523 11 17C11 16.4477 11.4477 16 12 16Z"></path><path d="M17 16C17.5523 16 18 16.4477 18 17C18 17.5523 17.5523 18 17 18C16.4477 18 16 17.5523 16 17C16 16.4477 16.4477 16 17 16Z"></path><path d="M7 12C7.55228 12 8 12.4477 8 13C8 13.5523 7.55228 14 7 14C6.44772 14 6 13.5523 6 13C6 12.4477 6.44772 12 7 12Z"></path><path d="M12 12C12.5523 12 13 12.4477 13 13C13 13.5523 12.5523 14 12 14C11.4477 14 11 13.5523 11 13C11 12.4477 11.4477 12 12 12Z"></path><path d="M17 12C17.5523 12 18 12.4477 18 13C18 13.5523 17.5523 14 17 14C16.4477 14 16 13.5523 16 13C16 12.4477 16.4477 12 17 12Z"></path><path d="M16.9805 2C17.3961 2.00025 17.7334 2.32483 17.7334 2.72461V4.24902C19.1781 4.36032 20.1264 4.63361 20.8232 5.30371C21.5201 5.97389 21.8042 6.88597 21.9199 8.27539L22 9H2V8.27539C2.11574 6.88599 2.39984 5.97389 3.09668 5.30371C3.79363 4.63345 4.74245 4.3603 6.1875 4.24902V2.72461C6.1875 2.32468 6.52457 2 6.94043 2C7.35622 2.00008 7.69336 2.32473 7.69336 2.72461V4.18457C8.36123 4.17212 9.10985 4.17285 9.95215 4.17285H13.9678C14.8099 4.17285 15.5588 4.17212 16.2266 4.18457V2.72461C16.2266 2.32468 16.5646 2 16.9805 2Z"></path><path d="M21.9995 14.0001V12.0001C21.9995 11.161 21.9963 9.66527 21.9834 9H2.00917C1.99626 9.66527 1.99953 11.161 1.99953 12.0001V14.0001C1.99953 17.7713 1.99953 19.6569 3.1711 20.8285C4.34267 22.0001 6.22829 22.0001 9.99953 22.0001H13.9995C17.7708 22.0001 19.6564 22.0001 20.828 20.8285C21.9995 19.6569 21.9995 17.7713 21.9995 14.0001Z" opacity=".5"></path></g></svg>`);function Ud(e,t){let n=ua(t,Vd);var r=Hd();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Wd=new Set([`$$slots`,`$$events`,`$$legacy`]),Gd=Hr(`<svg><g fill="currentColor"><path d="M21.9749 13.8143C20.4809 14.5732 18.7904 15.0009 17 15.0009C10.9249 15.0009 6 10.0761 6 4.00092C6 3.37164 6.05284 2.7547 6.15433 2.1543C5.43913 2.25971 4.87728 2.43759 4.38751 2.73772C3.71473 3.15 3.14908 3.71565 2.7368 4.38843C2 5.59078 2 7.22749 2 10.5009V11.5009C2 13.8306 2 14.9955 2.3806 15.9143C2.88807 17.1395 3.86144 18.1129 5.08658 18.6203C5.74689 18.8938 6.53422 18.9707 7.78958 18.9924C8.63992 19.007 9.06509 19.0144 9.40279 19.2108C9.74049 19.4072 9.95073 19.7624 10.3712 20.4728L10.9133 21.3886C11.3965 22.2049 12.6035 22.2049 13.0867 21.3886L13.6288 20.4728C14.0492 19.7624 14.2595 19.4072 14.5972 19.2108C14.9349 19.0144 15.36 19.007 16.2104 18.9924C17.4658 18.9707 18.2531 18.8938 18.9134 18.6203C20.1386 18.1129 21.1119 17.1395 21.6194 15.9143C21.8463 15.3666 21.9379 14.7315 21.9749 13.8143Z"></path><path fill-rule="evenodd" d="M13.0867 21.3886L13.6288 20.4728C14.0492 19.7624 14.2595 19.4072 14.5972 19.2108C14.9349 19.0144 15.36 19.007 16.2104 18.9924C17.4658 18.9707 18.2531 18.8938 18.9134 18.6203C20.1386 18.1129 21.1119 17.1395 21.6194 15.9143C21.8463 15.3666 21.9379 14.7315 21.9749 13.8143C20.4809 14.5732 18.7904 15.0009 17 15.0009C10.9249 15.0009 6 10.0761 6 4.00092C6 3.37164 6.05284 2.7547 6.15433 2.1543C5.43913 2.25971 4.87728 2.43759 4.38751 2.73772C3.71473 3.15 3.14908 3.71565 2.7368 4.38843C2 5.59078 2 7.22749 2 10.5009V11.5009C2 13.8306 2 14.9955 2.3806 15.9143C2.88807 17.1395 3.86144 18.1129 5.08658 18.6203C5.74689 18.8938 6.53422 18.9707 7.78958 18.9924C8.63992 19.007 9.06509 19.0144 9.40279 19.2108C9.74049 19.4072 9.95073 19.7624 10.3712 20.4728L10.9133 21.3886C11.3965 22.2049 12.6035 22.2049 13.0867 21.3886Z" clip-rule="evenodd"></path><path d="M13.5 2H10.5C8.56 2 7.19487 2 6.15433 2.15337C6.05284 2.75378 6 3.37072 6 4C6 10.0751 10.9249 15 17 15C18.7904 15 20.4809 14.5722 21.9749 13.8134C22 13.1919 22 12.441 22 11.5V10.5C22 7.22657 22 5.58985 21.2632 4.38751C20.8509 3.71473 20.2853 3.14908 19.6125 2.7368C18.4101 2 16.7734 2 13.5 2Z" opacity=".5"></path></g></svg>`);function Kd(e,t){let n=ua(t,Wd);var r=Gd();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var qd=new Set([`$$slots`,`$$events`,`$$legacy`]),Jd=Hr(`<svg><g fill="currentColor"><path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" opacity=".5"></path><path d="M10.5431 7.51724C10.8288 7.2173 10.8172 6.74256 10.5172 6.4569C10.2173 6.17123 9.74256 6.18281 9.4569 6.48276L7.14286 8.9125L6.5431 8.28276C6.25744 7.98281 5.78271 7.97123 5.48276 8.2569C5.18281 8.54256 5.17123 9.01729 5.4569 9.31724L6.59976 10.5172C6.74131 10.6659 6.9376 10.75 7.14286 10.75C7.34812 10.75 7.5444 10.6659 7.68596 10.5172L10.5431 7.51724Z"></path><path d="M13 8.25C12.5858 8.25 12.25 8.58579 12.25 9C12.25 9.41422 12.5858 9.75 13 9.75H18C18.4142 9.75 18.75 9.41422 18.75 9C18.75 8.58579 18.4142 8.25 18 8.25H13Z"></path><path d="M10.5431 14.5172C10.8288 14.2173 10.8172 13.7426 10.5172 13.4569C10.2173 13.1712 9.74256 13.1828 9.4569 13.4828L7.14286 15.9125L6.5431 15.2828C6.25744 14.9828 5.78271 14.9712 5.48276 15.2569C5.18281 15.5426 5.17123 16.0173 5.4569 16.3172L6.59976 17.5172C6.74131 17.6659 6.9376 17.75 7.14286 17.75C7.34812 17.75 7.5444 17.6659 7.68596 17.5172L10.5431 14.5172Z"></path><path d="M13 15.25C12.5858 15.25 12.25 15.5858 12.25 16C12.25 16.4142 12.5858 16.75 13 16.75H18C18.4142 16.75 18.75 16.4142 18.75 16C18.75 15.5858 18.4142 15.25 18 15.25H13Z"></path></g></svg>`);function Yd(e,t){let n=ua(t,qd);var r=Jd();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Xd=new Set([`$$slots`,`$$events`,`$$legacy`]),Zd=Hr(`<svg><g fill="currentColor"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" opacity=".5"></path><path fill-rule="evenodd" d="M12 7.25C12.4142 7.25 12.75 7.58579 12.75 8V11.6893L15.0303 13.9697C15.3232 14.2626 15.3232 14.7374 15.0303 15.0303C14.7374 15.3232 14.2626 15.3232 13.9697 15.0303L11.4697 12.5303C11.329 12.3897 11.25 12.1989 11.25 12V8C11.25 7.58579 11.5858 7.25 12 7.25Z" clip-rule="evenodd"></path></g></svg>`);function Qd(e,t){let n=ua(t,Xd);var r=Zd();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var $d=new Set([`$$slots`,`$$events`,`$$legacy`]),ef=Hr(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V10C2 6.22876 2 4.34315 3.17157 3.17157C4.34315 2 6.23869 2 10.0298 2C10.6358 2 11.1214 2 11.53 2.01666C11.5166 2.09659 11.5095 2.17813 11.5092 2.26057L11.5 5.09497C11.4999 6.19207 11.4998 7.16164 11.6049 7.94316C11.7188 8.79028 11.9803 9.63726 12.6716 10.3285C13.3628 11.0198 14.2098 11.2813 15.0569 11.3952C15.8385 11.5003 16.808 11.5002 17.9051 11.5001L18 11.5001H21.9574C22 12.0344 22 12.6901 22 13.5629V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22Z" clip-rule="evenodd" opacity=".5"></path><path d="M11.5 17.25C11.9142 17.25 12.25 17.5858 12.25 18C12.25 18.4142 11.9142 18.75 11.5 18.75H6C5.58579 18.75 5.25 18.4142 5.25 18C5.25 17.5858 5.58579 17.25 6 17.25H11.5Z"></path><path d="M14 13.75C14.4142 13.75 14.75 14.0858 14.75 14.5C14.75 14.9142 14.4142 15.25 14 15.25H6C5.58579 15.25 5.25 14.9142 5.25 14.5C5.25 14.0858 5.58579 13.75 6 13.75H14Z"></path><path d="M11.5 2.00586C12.0266 2.01725 12.4003 2.05009 12.7842 2.14453C12.9404 2.18298 13.1407 2.24407 13.292 2.29883C13.8622 2.50534 14.2785 2.7833 15.1104 3.33887C16.0788 3.98569 17.1892 4.777 18 5.5C18.911 6.31239 19.9546 7.49387 20.7471 8.44238C20.8745 8.59494 20.938 8.67168 21.0312 8.79883C21.5613 9.52144 21.9336 10.546 21.9902 11.4404C22.0002 11.5979 22 11.7325 22 12H21.9844C21.9781 11.8216 21.9694 11.6555 21.957 11.5H17.9053C16.8082 11.5001 15.8382 11.4996 15.0566 11.3945C14.2097 11.2806 13.363 11.0192 12.6719 10.3281C11.9806 9.63685 11.7184 8.7895 11.6045 7.94238C11.4995 7.16098 11.4999 6.19157 11.5 5.09473L11.5088 2.25977L11.5 2.00586Z"></path></g></svg>`);function tf(e,t){let n=ua(t,$d);var r=ef();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var nf=new Set([`$$slots`,`$$events`,`$$legacy`]),rf=Hr(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M2.02783 11.25C2.41136 6.07745 6.72957 2 12.0001 2C11.1693 2 10.4295 2.36421 9.82093 2.92113C9.21541 3.47525 8.70371 4.24878 8.28983 5.16315C7.87352 6.08292 7.55013 7.15868 7.33126 8.32611C7.1558 9.26194 7.04903 10.2485 7.01344 11.25H2.02783ZM2.02783 12.75H7.01344C7.04903 13.7515 7.1558 14.7381 7.33126 15.6739C7.55013 16.8413 7.87351 17.9171 8.28983 18.8368C8.70371 19.7512 9.21541 20.5247 9.82093 21.0789C10.4295 21.6358 11.1693 22 12.0001 22C6.72957 22 2.41136 17.9226 2.02783 12.75Z" clip-rule="evenodd"></path><path d="M12.0001 2C12.831 2 13.5708 2.36421 14.1793 2.92113C14.7849 3.47525 15.2966 4.24878 15.7104 5.16315C16.1267 6.08292 16.4501 7.15868 16.669 8.32612C16.8445 9.26194 16.9512 10.2485 16.9868 11.25H21.9724C21.5889 6.07745 17.2707 2 12.0001 2Z"></path><path d="M16.669 15.6739C16.4501 16.8413 16.1267 17.9171 15.7104 18.8368C15.2966 19.7512 14.7849 20.5247 14.1793 21.0789C13.5708 21.6358 12.831 22 12.0001 22C17.2707 22 21.5889 17.9226 21.9724 12.75H16.9868C16.9512 13.7515 16.8445 14.7381 16.669 15.6739Z"></path><g opacity=".5"><path d="M12.0002 3.39551C11.7252 3.39551 11.3699 3.51252 10.9568 3.89058C10.5406 4.27142 10.124 4.86831 9.7559 5.68153C9.39025 6.48936 9.09334 7.46456 8.88902 8.55435C8.72811 9.41258 8.62829 10.3223 8.59326 11.2502H15.4071C15.3721 10.3223 15.2723 9.41258 15.1113 8.55435C14.907 7.46457 14.6101 6.48937 14.2445 5.68153C13.8764 4.86831 13.4597 4.27142 13.0436 3.89058C12.6305 3.51252 12.2752 3.39551 12.0002 3.39551Z"></path><path d="M8.88902 15.446C9.09334 16.5358 9.39025 17.511 9.7559 18.3188C10.124 19.132 10.5406 19.7289 10.9568 20.1097C11.3699 20.4878 11.7252 20.6048 12.0002 20.6048C12.2752 20.6048 12.6305 20.4878 13.0436 20.1097C13.4597 19.7289 13.8764 19.132 14.2445 18.3188C14.6101 17.511 14.907 16.5358 15.1113 15.446C15.2723 14.5877 15.3721 13.678 15.4071 12.7502H8.59326C8.62829 13.678 8.72811 14.5877 8.88902 15.446Z"></path></g></g></svg>`);function af(e,t){let n=ua(t,nf);var r=rf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var of=new Set([`$$slots`,`$$events`,`$$legacy`]),sf=Hr(`<svg><g fill="currentColor"><path d="M19.0215 10.3145C21.0073 11.1088 22 11.5065 22 12C22 12.4935 21.0073 12.8912 19.0215 13.6855L18.2334 14L19.0215 14.3145C21.0073 15.1088 22 15.5065 22 16C22 16.4935 21.0073 16.8912 19.0215 17.6855L16.2129 18.8086C14.227 19.6029 13.2339 20 12 20C10.7661 20 9.773 19.6029 7.78711 18.8086L4.97852 17.6855C2.9927 16.8912 2 16.4935 2 16C2 15.5065 2.9927 15.1088 4.97852 14.3145L5.76562 14L4.97852 13.6855C2.9927 12.8912 2 12.4935 2 12C2 11.5065 2.9927 11.1088 4.97852 10.3145L5.7666 10L7.78711 10.8086C9.773 11.6029 10.7661 12 12 12C13.2339 12 14.227 11.6029 16.2129 10.8086L18.2334 10L19.0215 10.3145Z" opacity=".5"></path><path d="M19.0215 10.3145C21.0073 11.1088 22 11.5065 22 12C22 12.4935 21.0073 12.8912 19.0215 13.6855L16.2129 14.8086C14.227 15.6029 13.2339 16 12 16C10.7661 16 9.773 15.6029 7.78711 14.8086L4.97852 13.6855C2.9927 12.8912 2 12.4935 2 12C2 11.5065 2.9927 11.1088 4.97852 10.3145L5.7666 10L7.78711 10.8086C9.773 11.6029 10.7661 12 12 12C13.2339 12 14.227 11.6029 16.2129 10.8086L18.2334 10L19.0215 10.3145Z" opacity=".5"></path><path d="M12 4C13.2339 4 14.227 4.39705 16.2129 5.19141L19.0215 6.31445C21.0073 7.10878 22 7.50646 22 8C22 8.49354 21.0073 8.89122 19.0215 9.68555L16.2129 10.8086C14.227 11.6029 13.2339 12 12 12C10.7661 12 9.773 11.6029 7.78711 10.8086L4.97852 9.68555C2.9927 8.89122 2 8.49354 2 8C2 7.50646 2.9927 7.10878 4.97852 6.31445L7.78711 5.19141C9.773 4.39705 10.7661 4 12 4Z"></path></g></svg>`);function cf(e,t){let n=ua(t,of);var r=sf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var lf=new Set([`$$slots`,`$$events`,`$$legacy`]),uf=Hr(`<svg><path fill="currentColor" d="M20.313 11.157a9.157 9.157 0 1 1-18.313 0a9.157 9.157 0 0 1 18.313 0" opacity=".5"></path><path fill="currentColor" d="m17.1 18.122l3.666 3.666a.723.723 0 0 0 1.023-1.022L18.122 17.1a9 9 0 0 1-1.022 1.022"></path></svg>`);function df(e,t){let n=ua(t,lf);var r=uf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var ff=new Set([`$$slots`,`$$events`,`$$legacy`]),pf=Hr(`<svg><g fill="currentColor"><path d="M20 9C20.4142 9 20.75 9.33579 20.75 9.75V10.75C20.75 15.3298 17.2314 19.0883 12.75 19.4688V21.75C12.75 22.1642 12.4142 22.5 12 22.5C11.5858 22.5 11.25 22.1642 11.25 21.75V19.4688C6.7686 19.0883 3.25 15.3298 3.25 10.75V9.75C3.25 9.33579 3.58579 9 4 9C4.41421 9 4.75 9.33579 4.75 9.75V10.75C4.75 14.7541 7.99594 18 12 18C16.0041 18 19.25 14.7541 19.25 10.75V9.75C19.25 9.33579 19.5858 9 20 9Z"></path><path d="M17.7012 11.5H13C12.5858 11.5 12.25 11.1642 12.25 10.75C12.25 10.3358 12.5858 10 13 10H17.75L17.7012 11.5Z"></path><path d="M17.75 8.5H13C12.5858 8.5 12.25 8.16421 12.25 7.75C12.25 7.33579 12.5858 7 13 7H17.7012L17.75 8.5Z"></path><path d="M12 2C8.82436 2 6.25 4.57436 6.25 7.75V10.75C6.25 13.9256 8.82436 16.5 12 16.5C14.9214 16.5 17.334 14.3213 17.7015 11.5L13 11.5C12.5858 11.5 12.25 11.1642 12.25 10.75C12.25 10.3358 12.5858 10 13 10L17.75 10V8.5H13C12.5858 8.5 12.25 8.16421 12.25 7.75C12.25 7.33579 12.5858 7 13 7H17.7015C17.334 4.17873 14.9214 2 12 2Z" opacity=".5"></path></g></svg>`);function mf(e,t){let n=ua(t,ff);var r=pf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var hf=new Set([`$$slots`,`$$events`,`$$legacy`]),gf=Hr(`<svg><path fill="currentColor" d="M10.847 21.934C5.867 21.362 2 17.133 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10c0 5.157-3.283 4.733-6.086 4.37c-1.618-.209-3.075-.397-3.652.518c-.395.626.032 1.406.555 1.929a1.673 1.673 0 0 1 0 2.366c-.523.523-1.235.836-1.97.751" opacity=".5"></path><path fill="currentColor" d="M11.085 7a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M6.5 13a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m11 0a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m-3-4.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path></svg>`);function _f(e,t){let n=ua(t,hf);var r=gf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var vf=new Set([`$$slots`,`$$events`,`$$legacy`]),yf=Hr(`<svg><g fill="currentColor"><path d="M20.8487 8.71306C22.3844 7.17735 22.3844 4.68748 20.8487 3.15178C19.313 1.61607 16.8231 1.61607 15.2874 3.15178L14.4004 4.03882C14.4125 4.0755 14.4251 4.11268 14.4382 4.15035C14.7633 5.0875 15.3768 6.31601 16.5308 7.47002C17.6848 8.62403 18.9133 9.23749 19.8505 9.56262C19.888 9.57563 19.925 9.58817 19.9615 9.60026L20.8487 8.71306Z" opacity=".5"></path><path d="M14.4386 4L14.4004 4.03819C14.4125 4.07487 14.4251 4.11206 14.4382 4.14973C14.7633 5.08687 15.3768 6.31538 16.5308 7.4694C17.6848 8.62341 18.9133 9.23686 19.8505 9.56199C19.8876 9.57489 19.9243 9.58733 19.9606 9.59933L11.4001 18.1598C10.823 18.7369 10.5343 19.0255 10.2162 19.2737C9.84082 19.5665 9.43469 19.8175 9.00498 20.0223C8.6407 20.1959 8.25351 20.3249 7.47918 20.583L3.39584 21.9442C3.01478 22.0712 2.59466 21.972 2.31063 21.688C2.0266 21.4039 1.92743 20.9838 2.05445 20.6028L3.41556 16.5194C3.67368 15.7451 3.80273 15.3579 3.97634 14.9936C4.18114 14.5639 4.43213 14.1578 4.7249 13.7824C4.97307 13.4643 5.26165 13.1757 5.83874 12.5986L14.4386 4Z"></path></g></svg>`);function bf(e,t){let n=ua(t,vf);var r=yf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var xf=new Set([`$$slots`,`$$events`,`$$legacy`]),Sf=Hr(`<svg><path fill="currentColor" fill-rule="evenodd" d="M5.796 18.204L21.512 2.488c-.988-.989-2.86-.364-6.606.884l-9.331 3.11c-2.082.694-3.123 1.041-3.439 1.804q-.112.271-.133.564c-.059.824.717 1.6 2.269 3.151l.283.283c.254.254.382.382.478.523c.19.28.297.607.31.945c.008.171-.019.35-.072.705c-.196 1.304-.294 1.956-.179 2.458c.114.495.362.938.704 1.289" clip-rule="evenodd"></path><path fill="currentColor" d="m17.498 18.486l3.13-9.392c1.25-3.745 1.873-5.617.885-6.606L5.797 18.204c.348.356.794.617 1.296.74c.5.122 1.153.033 2.46-.144l.071-.01c.369-.05.553-.075.73-.064c.32.02.63.124.898.303c.147.099.278.23.541.493l.251.251c1.51 1.51 2.266 2.265 3.067 2.226c.22-.01.438-.062.64-.151c.734-.323 1.072-1.336 1.747-3.362" opacity=".5"></path></svg>`);function Cf(e,t){let n=ua(t,xf);var r=Sf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var wf=new Set([`$$slots`,`$$events`,`$$legacy`]),Tf=Hr(`<svg><g fill="currentColor"><path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" opacity=".5"></path><path d="M12 7.75C11.3787 7.75 10.875 8.25368 10.875 8.875C10.875 9.28921 10.5392 9.625 10.125 9.625C9.71079 9.625 9.375 9.28921 9.375 8.875C9.375 7.42525 10.5503 6.25 12 6.25C13.4497 6.25 14.625 7.42525 14.625 8.875C14.625 9.58584 14.3415 10.232 13.883 10.704C13.7907 10.7989 13.7027 10.8869 13.6187 10.9708C13.4029 11.1864 13.2138 11.3753 13.0479 11.5885C12.8289 11.8699 12.75 12.0768 12.75 12.25V13C12.75 13.4142 12.4142 13.75 12 13.75C11.5858 13.75 11.25 13.4142 11.25 13V12.25C11.25 11.5948 11.555 11.0644 11.8642 10.6672C12.0929 10.3733 12.3804 10.0863 12.6138 9.85346C12.6842 9.78321 12.7496 9.71789 12.807 9.65877C13.0046 9.45543 13.125 9.18004 13.125 8.875C13.125 8.25368 12.6213 7.75 12 7.75Z"></path><path d="M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z"></path></g></svg>`);function Ef(e,t){let n=ua(t,wf);var r=Tf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Df=new Set([`$$slots`,`$$events`,`$$legacy`]),Of=Hr(`<svg><g fill="currentColor"><path d="M12.0789 2.25C7.2854 2.25 3.34478 5.913 2.96055 10.5833H2.00002C1.69614 10.5833 1.42229 10.7667 1.30655 11.0477C1.19081 11.3287 1.25606 11.6517 1.47178 11.8657L3.15159 13.5324C3.444 13.8225 3.91567 13.8225 4.20808 13.5324L5.88789 11.8657C6.10361 11.6517 6.16886 11.3287 6.05312 11.0477C5.93738 10.7667 5.66353 10.5833 5.35965 10.5833H4.4668C4.84652 6.75167 8.10479 3.75 12.0789 3.75C14.8484 3.75 17.2727 5.20845 18.6156 7.39279C18.8325 7.74565 19.2944 7.85585 19.6473 7.63892C20.0002 7.42199 20.1104 6.96007 19.8934 6.60721C18.2871 3.99427 15.3873 2.25 12.0789 2.25Z"></path><path d="M20.8412 10.4666C20.5491 10.1778 20.0789 10.1778 19.7868 10.4666L18.1005 12.1333C17.8842 12.3471 17.8185 12.6703 17.934 12.9517C18.0496 13.233 18.3236 13.4167 18.6278 13.4167H19.5269C19.1456 17.2462 15.876 20.25 11.8828 20.25C9.10034 20.25 6.66595 18.7903 5.31804 16.6061C5.10051 16.2536 4.63841 16.1442 4.28591 16.3618C3.93342 16.5793 3.82401 17.0414 4.04154 17.3939C5.65416 20.007 8.56414 21.75 11.8828 21.75C16.6907 21.75 20.6476 18.0892 21.0332 13.4167H22.0002C22.3044 13.4167 22.5784 13.233 22.694 12.9517C22.8096 12.6703 22.7438 12.3471 22.5275 12.1333L20.8412 10.4666Z" opacity=".5"></path></g></svg>`);function kf(e,t){let n=ua(t,Df);var r=Of();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Af=new Set([`$$slots`,`$$events`,`$$legacy`]),jf=Hr(`<svg><g fill="currentColor"><circle cx="12" cy="12" r="10" opacity=".5"></circle><path d="M16.6483 10.6963C16.8521 10.7044 17.0441 10.7948 17.1796 10.9473L18.5605 12.502C18.8356 12.8116 18.8076 13.2854 18.498 13.5605C18.1883 13.8356 17.7145 13.8077 17.4394 13.498L17.2821 13.3213C16.8283 15.8445 14.6014 17.751 11.9345 17.751C10.3633 17.7509 8.94529 17.0895 7.95303 16.0322C7.66958 15.7302 7.68423 15.2551 7.98623 14.9717C8.28827 14.6882 8.76332 14.7038 9.04678 15.0059C9.76531 15.7714 10.7918 16.2509 11.9345 16.251C13.7811 16.251 15.3202 14.9995 15.7489 13.3203L15.5194 13.541C15.2207 13.8279 14.7458 13.8183 14.4589 13.5195C14.172 13.2208 14.1816 12.7459 14.4804 12.459L16.0995 10.9043L16.1571 10.8545C16.2964 10.7457 16.4702 10.6892 16.6483 10.6963Z"></path><path d="M12.0439 6.25C13.6212 6.25007 15.0435 6.92052 16.0331 7.99023C16.3144 8.2943 16.2952 8.7695 15.9911 9.05078C15.6871 9.33171 15.2128 9.31351 14.9315 9.00977C14.2153 8.23556 13.1879 7.75007 12.0439 7.75C10.2064 7.75 8.67087 9.00129 8.24502 10.6836L8.48037 10.459C8.77922 10.1725 9.25421 10.1819 9.54092 10.4805C9.82745 10.7793 9.81801 11.2543 9.51944 11.541L7.89639 13.0967C7.74909 13.2379 7.55047 13.313 7.34659 13.3047C7.14286 13.2963 6.95153 13.2054 6.81631 13.0527L5.43838 11.4971C5.16387 11.187 5.19278 10.7131 5.50283 10.4385C5.81293 10.164 6.28685 10.1929 6.56143 10.5029L6.71377 10.6748C7.16785 8.15565 9.38519 6.25 12.0439 6.25Z"></path></g></svg>`);function Mf(e,t){let n=ua(t,Af);var r=jf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Nf=new Set([`$$slots`,`$$events`,`$$legacy`]),Pf=Hr(`<svg><g fill="currentColor"><path fill-rule="evenodd" d="M15.5023 14.3674L20.5319 9.35289C21.2563 8.63072 21.6185 8.26963 21.8092 7.81046C22 7.3513 22 6.84065 22 5.81937V5.33146C22 3.76099 22 2.97576 21.5106 2.48788C21.0213 2 20.2337 2 18.6585 2H18.1691C17.1447 2 16.6325 2 16.172 2.19019C15.7114 2.38039 15.3493 2.74147 14.6249 3.46364L9.59522 8.47817C8.74882 9.32202 8.224 9.84526 8.02078 10.3506C7.95657 10.5103 7.92446 10.6682 7.92446 10.8339C7.92446 11.5238 8.48138 12.0791 9.59522 13.1896L9.74492 13.3388L11.4985 11.5591C11.7486 11.3053 12.1571 11.3022 12.4109 11.5523C12.6647 11.8024 12.6678 12.2109 12.4177 12.4647L10.6587 14.2499L10.7766 14.3674C11.8905 15.4779 12.4474 16.0331 13.1394 16.0331C13.2924 16.0331 13.4387 16.006 13.5858 15.9518C14.1048 15.7607 14.6345 15.2325 15.5023 14.3674ZM17.8652 8.47854C17.2127 9.12904 16.1548 9.12904 15.5024 8.47854C14.8499 7.82803 14.8499 6.77335 15.5024 6.12284C16.1548 5.47233 17.2127 5.47233 17.8652 6.12284C18.5177 6.77335 18.5177 7.82803 17.8652 8.47854Z" clip-rule="evenodd"></path><path fill-rule="evenodd" d="M2.77409 12.4814C3.07033 12.778 3.07004 13.2586 2.77343 13.5548L2.61779 13.7103C2.48483 13.8431 2.48483 14.058 2.61779 14.1908C2.75125 14.3241 2.96801 14.3241 3.10147 14.1908L4.8136 12.4807C5.1102 12.1845 5.59079 12.1848 5.88704 12.4814C6.18328 12.778 6.18298 13.2586 5.88638 13.5548L4.17426 15.2648C3.4481 15.9901 2.27116 15.9901 1.545 15.2648C0.818334 14.5391 0.818333 13.362 1.545 12.6362L1.70065 12.4807C1.99725 12.1845 2.47784 12.1848 2.77409 12.4814ZM7.29719 16.696C7.5903 16.9957 7.58495 17.4762 7.28525 17.7693L5.55508 19.4614C5.25538 19.7545 4.77481 19.7491 4.48171 19.4494C4.1886 19.1497 4.19395 18.6692 4.49365 18.3761L6.22382 16.684C6.52352 16.3909 7.00409 16.3963 7.29719 16.696ZM11.4811 18.118C11.7774 18.4146 11.7771 18.8952 11.4805 19.1915L9.76834 20.9015C9.63539 21.0343 9.63539 21.2492 9.76834 21.382C9.9018 21.5153 10.1186 21.5153 10.252 21.382L10.4077 21.2265C10.7043 20.9303 11.1849 20.9306 11.4811 21.2272C11.7774 21.5238 11.7771 22.0044 11.4805 22.3006L11.3248 22.4561C10.5987 23.1813 9.42171 23.1813 8.69556 22.4561C7.96889 21.7303 7.96889 20.5532 8.69556 19.8274L10.4077 18.1174C10.7043 17.8211 11.1849 17.8214 11.4811 18.118Z" clip-rule="evenodd"></path><g opacity=".5"><path d="M9.42154 16.2958C9.71796 15.9993 10.1984 15.9993 10.4948 16.2958C10.7912 16.5922 10.7912 17.0726 10.4948 17.369L8.36685 19.4969C8.07041 19.793 7.58991 19.7932 7.29361 19.4969C6.99718 19.2005 6.99718 18.7191 7.29361 18.4227L9.42154 16.2958Z"></path><path d="M18.5807 13.12C19.0406 13.8436 19.2824 14.2873 19.3522 14.7557C19.4282 15.2672 19.3599 15.798 19.1549 16.2889C18.9225 16.8456 17.766 17.9991 16.8024 18.9598L16.7301 19.0321C16.4313 19.33 15.9163 19.2272 15.7614 18.8387C15.5712 18.3616 15.4767 18.1226 15.3542 17.8993C15.2453 17.7009 15.1198 17.512 14.9801 17.3338C14.8744 17.1989 14.7578 17.0722 14.5817 16.8934C14.8285 16.7424 15.0522 16.5659 15.2565 16.3895C15.5975 16.095 15.9742 15.7184 16.3854 15.3084L18.5807 13.12Z"></path><path d="M6.61196 13.4901C6.90839 13.1937 7.38976 13.1937 7.68618 13.4901C7.98225 13.7865 7.98242 14.267 7.68618 14.5633L5.54361 16.7059C5.24729 17.0021 4.76678 17.002 4.47036 16.7059C4.17394 16.4095 4.17394 15.9281 4.47036 15.6317L6.61196 13.4901Z"></path><path d="M7.66763 4.83579C8.15998 4.63158 8.6918 4.5637 9.20474 4.6395C9.67474 4.70898 10.1193 4.95036 10.8454 5.40904L8.65786 7.59068C8.25586 7.99145 7.8866 8.35891 7.59536 8.69126C7.40837 8.90468 7.22144 9.13827 7.06314 9.39634L7.04165 9.37583C7.00119 9.3355 6.98091 9.31449 6.9606 9.29478C6.58043 8.92601 6.13343 8.63249 5.64321 8.43052C5.61701 8.41972 5.58996 8.40961 5.53677 8.38853L5.21157 8.25962C4.77033 8.08478 4.65225 7.51625 4.98794 7.1815C5.95158 6.22078 7.10926 5.06747 7.66763 4.83579Z"></path></g></g></svg>`);function Ff(e,t){let n=ua(t,Nf);var r=Pf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var If=new Set([`$$slots`,`$$events`,`$$legacy`]),Lf=Hr(`<svg><g fill="currentColor"><g opacity=".5"><path d="M19.9551 12.7237C21.3183 14.0869 22 14.7691 22 15.6162C21.9997 16.4632 21.3184 17.1455 19.9551 18.5088L18.5088 19.9551C17.1455 21.3184 16.4632 21.9998 15.6162 22C14.7691 22 14.0869 21.3184 12.7236 19.9551L11.1641 18.3955C11.2372 18.3226 11.3159 18.2447 11.4004 18.1602L18.3955 11.1641L19.9551 12.7237Z"></path><path d="M8.38379 2.00002C9.23091 2.00002 9.9131 2.68168 11.2764 4.04494L12.835 5.60354L5.83887 12.5987C5.75439 12.6831 5.67641 12.7619 5.60352 12.835L4.04492 11.2764C2.68165 9.91312 2 9.23094 2 8.38381C2.00025 7.53681 2.6816 6.85456 4.04492 5.49123L5.49121 4.04494C6.85454 2.68162 7.53679 2.00028 8.38379 2.00002Z"></path><path d="M15.2871 3.15139C16.8227 1.61581 19.3129 1.61594 20.8486 3.15139C22.3843 4.68708 22.3843 7.17721 20.8486 8.71291L19.9619 9.60061C19.9254 9.58852 19.8881 9.57552 19.8506 9.56252C18.9135 9.2374 17.6852 8.62371 16.5312 7.46975C15.3773 6.31578 14.7636 5.08754 14.4385 4.15041C14.4254 4.11282 14.4125 4.07569 14.4004 4.03909L15.2871 3.15139Z"></path></g><path d="M14.4383 4.1499C14.7634 5.08701 15.3771 6.31532 16.531 7.46924C17.685 8.62316 18.9133 9.23689 19.8504 9.56201C19.8875 9.57489 19.9245 9.58714 19.9607 9.59912L11.4002 18.1597C10.823 18.7368 10.5338 19.0258 10.2156 19.2739C9.84035 19.5666 9.43424 19.8172 9.00466 20.022C8.6404 20.1956 8.2535 20.3254 7.47927 20.5835L3.39528 21.9438C3.01428 22.0708 2.5943 21.972 2.31032 21.688C2.02636 21.404 1.92753 20.984 2.05446 20.603L3.41579 16.519C3.6738 15.745 3.80276 15.3579 3.97634 14.9937C4.18107 14.5641 4.43174 14.158 4.72438 13.7827C4.97255 13.4645 5.26155 13.1752 5.83864 12.5981L14.4002 4.03857C14.4123 4.07514 14.4252 4.11235 14.4383 4.1499Z"></path><path d="M20.1082 12.8774C20.5239 13.2935 20.8715 13.644 21.1502 13.9565L19.9998 15.1069C19.7069 15.3997 19.2321 15.3997 18.9392 15.1069C18.6464 14.8141 18.6464 14.3393 18.9392 14.0464L20.1082 12.8774Z"></path><path d="M9.7654 2.61279C10.0842 2.87146 10.4393 3.21184 10.865 3.63428L9.49977 4.99951C9.20688 5.2924 8.73212 5.2924 8.43923 4.99951C8.14651 4.7066 8.14639 4.2318 8.43923 3.93896L9.7654 2.61279Z"></path></g></svg>`);function Rf(e,t){let n=ua(t,If);var r=Lf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var zf=new Set([`$$slots`,`$$events`,`$$legacy`]),Bf=Hr(`<svg><g fill="currentColor"><path d="M12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22Z" opacity=".5"></path><path d="M18.75 8C18.75 8.41421 18.4142 8.75 18 8.75H6C5.58579 8.75 5.25 8.41421 5.25 8C5.25 7.58579 5.58579 7.25 6 7.25H18C18.4142 7.25 18.75 7.58579 18.75 8Z"></path><path d="M16.75 12C16.75 12.4142 16.4142 12.75 16 12.75H8C7.58579 12.75 7.25 12.4142 7.25 12C7.25 11.5858 7.58579 11.25 8 11.25H16C16.4142 11.25 16.75 11.5858 16.75 12Z"></path><path d="M14.75 16C14.75 16.4142 14.4142 16.75 14 16.75H10C9.58579 16.75 9.25 16.4142 9.25 16C9.25 15.5858 9.58579 15.25 10 15.25H14C14.4142 15.25 14.75 15.5858 14.75 16Z"></path></g></svg>`);function Vf(e,t){let n=ua(t,zf);var r=Bf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Hf=new Set([`$$slots`,`$$events`,`$$legacy`]),Uf=Hr(`<svg><g fill="currentColor"><path d="M7.45284 2.71266C7.8276 1.76244 9.1724 1.76245 9.54716 2.71267L10.7085 5.65732C10.8229 5.94743 11.0526 6.17707 11.3427 6.29148L14.2873 7.45284C15.2376 7.8276 15.2376 9.1724 14.2873 9.54716L11.3427 10.7085C11.0526 10.8229 10.8229 11.0526 10.7085 11.3427L9.54716 14.2873C9.1724 15.2376 7.8276 15.2376 7.45284 14.2873L6.29148 11.3427C6.17707 11.0526 5.94743 10.8229 5.65732 10.7085L2.71266 9.54716C1.76244 9.1724 1.76245 7.8276 2.71267 7.45284L5.65732 6.29148C5.94743 6.17707 6.17707 5.94743 6.29148 5.65732L7.45284 2.71266Z"></path><path d="M16.9245 13.3916C17.1305 12.8695 17.8695 12.8695 18.0755 13.3916L18.9761 15.6753C19.039 15.8348 19.1652 15.961 19.3247 16.0239L21.6084 16.9245C22.1305 17.1305 22.1305 17.8695 21.6084 18.0755L19.3247 18.9761C19.1652 19.039 19.039 19.1652 18.9761 19.3247L18.0755 21.6084C17.8695 22.1305 17.1305 22.1305 16.9245 21.6084L16.0239 19.3247C15.961 19.1652 15.8348 19.039 15.6753 18.9761L13.3916 18.0755C12.8695 17.8695 12.8695 17.1305 13.3916 16.9245L15.6753 16.0239C15.8348 15.961 15.961 15.8348 16.0239 15.6753L16.9245 13.3916Z" opacity=".5"></path></g></svg>`);function Wf(e,t){let n=ua(t,Hf);var r=Uf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Gf=new Set([`$$slots`,`$$events`,`$$legacy`]),Kf=Hr(`<svg><g fill="currentColor"><g opacity=".5"><path d="M16 14C18.7614 14 21 15.3431 21 17C21 18.6569 18.7614 20 16 20C13.2386 20 11 18.6569 11 17C11 15.3431 13.2386 14 16 14Z"></path><path d="M15 3C16.6569 3 18 4.34315 18 6C18 7.65685 16.6569 9 15 9C13.3431 9 12 7.65685 12 6C12 4.34315 13.3431 3 15 3Z"></path></g><path d="M9.00098 13.001C12.867 13.001 16.001 14.7918 16.001 17.001C16.001 19.2101 12.867 21.001 9.00098 21.001C5.13498 21.001 2.00098 19.2101 2.00098 17.001C2.00098 14.7918 5.13498 13.001 9.00098 13.001Z"></path><path d="M9.00098 2C11.2101 2 13.001 3.79086 13.001 6C13.001 8.20914 11.2101 10 9.00098 10C6.79184 10 5.00098 8.20914 5.00098 6C5.00098 3.79086 6.79184 2 9.00098 2Z"></path></g></svg>`);function qf(e,t){let n=ua(t,Gf);var r=Kf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Jf=new Set([`$$slots`,`$$events`,`$$legacy`]),Yf=Hr(`<svg><g fill="currentColor"><path d="M6.5 13C8.62132 13 9.68181 13.0002 10.3408 13.6592C10.9998 14.3182 11 15.3787 11 17.5C11 19.6213 10.9998 20.6818 10.3408 21.3408C9.68181 21.9998 8.62132 22 6.5 22C4.37868 22 3.31819 21.9998 2.65918 21.3408C2.00017 20.6818 2 19.6213 2 17.5C2 15.3787 2.00017 14.3182 2.65918 13.6592C3.31819 13.0002 4.37868 13 6.5 13Z"></path><path d="M6.63379 2C9.19304 2 11.2684 4.07458 11.2686 6.63379C11.2686 9.19316 9.19316 11.2686 6.63379 11.2686C4.07458 11.2684 2 9.19304 2 6.63379C2.00019 4.0747 4.0747 2.00019 6.63379 2Z"></path><g opacity=".5"><path d="M17.3662 12.7314C19.9256 12.7314 22.001 14.8068 22.001 17.3662C22.0008 19.9254 19.9255 22 17.3662 22C14.8071 21.9998 12.7326 19.9253 12.7324 17.3662C12.7324 14.807 14.807 12.7316 17.3662 12.7314Z"></path><path d="M17.5 2C19.6213 2 20.6818 2.00017 21.3408 2.65918C21.9998 3.31819 22 4.37868 22 6.5C22 8.62132 21.9998 9.68181 21.3408 10.3408C20.6818 10.9998 19.6213 11 17.5 11C15.3787 11 14.3182 10.9998 13.6592 10.3408C13.0002 9.68181 13 8.62132 13 6.5C13 4.37868 13.0002 3.31819 13.6592 2.65918C14.3182 2.00017 15.3787 2 17.5 2Z"></path></g></g></svg>`);function Xf(e,t){let n=ua(t,Jf);var r=Yf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var Zf=new Set([`$$slots`,`$$events`,`$$legacy`]),Qf=Hr(`<svg><g fill="currentColor"><path d="M2.02639 9.5V8.75C2.10074 6.11064 2.38461 4.5451 3.46486 3.46484C4.92933 2.00041 7.28601 2 12 2C16.714 2 19.0707 2.00038 20.5352 3.46484C21.6154 4.5451 21.8993 6.11066 21.9737 8.75L22 9.5H9.00002V22L8.25002 21.9561C5.90966 21.8589 4.47508 21.5454 3.46486 20.5352C2.00041 19.0707 2.00002 16.714 2.00002 12C2.00002 11.3766 1.99956 10.7944 2.00295 10.25L2.02639 9.5Z" opacity=".5"></path><path d="M2 12C2 16.714 2 19.0711 3.46447 20.5355C4.47468 21.5458 5.90962 21.8591 8.25 21.9563L9 22V10.25V9.5H2.02645L2.00339 10.25C2 10.7944 2 11.3766 2 12Z" opacity=".5"></path><path d="M21.9971 10.25C22.0005 10.7944 22 11.3766 22 12C22 16.714 21.9996 19.0707 20.5352 20.5352C19.0707 21.9996 16.714 22 12 22C11.1815 22 9.68405 21.9999 9 21.9922V9.5H22L21.9971 10.25Z"></path><path d="M6 5C6.55228 5 7 5.44772 7 6C7 6.55228 6.55228 7 6 7C5.44772 7 5 6.55228 5 6C5 5.44772 5.44772 5 6 5Z"></path><path d="M9 5C9.55228 5 10 5.44772 10 6C10 6.55228 9.55228 7 9 7C8.44772 7 8 6.55228 8 6C8 5.44772 8.44772 5 9 5Z"></path><path d="M12 5C12.5523 5 13 5.44772 13 6C13 6.55228 12.5523 7 12 7C11.4477 7 11 6.55228 11 6C11 5.44772 11.4477 5 12 5Z"></path></g></svg>`);function $f(e,t){let n=ua(t,Zf);var r=Qf();G(r,()=>({viewBox:`0 0 24 24`,width:`1.2em`,height:`1.2em`,...n})),V(e,r)}var ep=new Set([`$$slots`,`$$events`,`$$legacy`]),tp=Hr(`<svg><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"></path></svg>`);function np(e,t){let n=ua(t,ep);var r=tp();G(r,()=>({"aria-hidden":`true`,fill:`none`,height:`1.2em`,viewBox:`0 0 24 24`,width:`1.2em`,xmlns:`http://www.w3.org/2000/svg`,...n})),V(e,r)}var rp=B(`<li class="row bones svelte-nejrkp"><!> <!></li>`),ip=B(`<span class="reason svelte-nejrkp" data-slot="suggestion-reason"> </span>`),ap=B(`<li class="svelte-nejrkp"><button class="row svelte-nejrkp" data-slot="suggestion" type="button"><span class="words svelte-nejrkp"><span class="text svelte-nejrkp" data-slot="suggestion-text"> </span> <!></span> <span aria-hidden="true" class="mark svelte-nejrkp"><span class="pencil svelte-nejrkp" data-pencil=""><!></span> <span class="check svelte-nejrkp" data-check=""><!></span></span></button></li>`),op=B(`<li class="svelte-nejrkp"><button class="row more svelte-nejrkp" type="button"><span class="text svelte-nejrkp"> </span></button></li>`),sp=B(`<!> <!>`,1),cp=B(`<div aria-labelledby="ledger-kicker" class="set svelte-nejrkp" role="group"><div class="kicker svelte-nejrkp"><span id="ledger-kicker"> </span> <button aria-label="Refresh" class="refresh svelte-nejrkp" type="button"><!></button></div> <ul class="rows svelte-nejrkp"><!></ul></div>`),lp=B(`<div class="ledger svelte-nejrkp" data-direction="ledger"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function up(e,t){Ke(t,!0);let n=e=>{var n=Ur(),r=pn(n),i=e=>{var n=cp(),r=N(n),i=N(r),a=P(i,!0),c=F(i,2);kf(N(c),{"aria-hidden":`true`,class:`glyph`}),O(c),O(r);var l=F(r,2),h=N(l),_=e=>{var n=Ur();ai(pn(n),16,()=>t.draws.loading?[0,1,2]:z(d).map((e,t)=>t),e=>e,(e,t)=>{var n=rp(),r=N(n);Pd(r,{class:`bone suggestion-line`,radius:`line`,get style(){return`inline-size: ${m[t%3]??``}`}}),Pd(F(r,2),{class:`bone`,line:`meta`,radius:`line`,style:`inline-size: var(--ledger-bone-reason)`}),O(n),V(e,n)}),V(e,n)},v=e=>{var n=sp(),r=pn(n);ai(r,19,()=>z(d),(e,t)=>`${t}:${e.text}`,(e,n,r)=>{var i=ap(),a=N(i),s=N(a),c=N(s),l=P(c,!0),u=F(c,2),d=e=>{var t=ip(),i=P(t,!0);I(()=>{W(t,`id`,`ledger-reason-${z(r)??``}`),H(i,z(n).reason)}),V(e,t)};U(u,e=>{z(n).reason&&e(d)}),O(s);var f=F(s,2),p=N(f);bf(N(p),{class:`glyph`}),O(p);var m=F(p,2);np(N(m),{class:`glyph`}),O(m),O(f),O(a),O(i),I(()=>{W(a,`aria-describedby`,z(n).reason?`ledger-reason-${z(r)}`:void 0),W(a,`data-held`,z(r)===0?t.draws.held:void 0),H(l,z(n).text),W(p,`data-hidden`,z(o)===z(r)||void 0),W(m,`data-shown`,z(o)===z(r)||void 0)}),Mr(`click`,a,e=>g(z(r),e.currentTarget)),V(e,i)});var i=F(r,2),a=e=>{var t=op(),n=N(t),r=P(N(n));O(n),O(t),I(()=>H(r,`${z(f)??``} more`)),Mr(`click`,n,()=>M(s,!0)),V(e,t)};U(i,e=>{z(f)>0&&e(a)}),V(e,n)};U(h,e=>{z(u)?e(_):e(v,-1)}),O(l),O(n),Ci(n,To),I(()=>{W(n,`data-faded`,z(p)||void 0),H(a,z(u)?`Caw is writing suggestions`:`Caw suggests · ${t.draws.items.length}`)}),V(e,n)};U(r,e=>{(t.draws.items.length>0||t.draws.loading)&&e(i)}),V(e,n)},r=e=>{{let n=k(()=>t.where===`keyboard`);No(e,{get focused(){return z(n)},get field(){return z(l)},set field(e){M(l,e,!0)},get value(){return z(a)},set value(e){M(a,e,!0)}})}},i=k(()=>t.draws.items[0]?.text??``),a=j(tn(t.draws.phase===`filled`?z(i):t.draws.phase===`typing`?Ao(z(i)):``)),o=j(tn(t.draws.phase===`filled`?0:null)),s=j(tn(t.draws.expanded)),c=j(``),l=j(void 0),u=k(()=>t.draws.loading||t.draws.phase===`refresh`),d=k(()=>z(s)?t.draws.items:t.draws.items.slice(0,4)),f=k(()=>t.draws.items.length-z(d).length),p=k(()=>z(a)!==``&&!t.draws.items.some(e=>e.text===z(a))),m=[`var(--ledger-bone-1)`,`var(--ledger-bone-2)`,`var(--ledger-bone-3)`];function h(e,t){let n=e.querySelector(`[data-pencil]`),r=e.querySelector(`[data-check]`);if(!(n&&r))return Promise.resolve();let i={duration:Ua(`--dur-control`),easing:Wa(`--ease-out`),fill:`forwards`},[a,o]=t?[n,r]:[r,n],s=Number.parseFloat(getComputedStyle(a).opacity),c=Number.parseFloat(getComputedStyle(e).getPropertyValue(t?`--ledger-check-ink`:e.closest(`[data-touch]`)?`--ledger-pencil-touch`:`--ledger-pencil-rest`)),l=Ia.current?{opacity:0,scale:.25,filter:`blur(4px)`}:{opacity:0},u=Ia.current?{scale:1,filter:`blur(0px)`}:{},d=[a.animate([{opacity:s,...u},l],i),o.animate([l,{opacity:c,...u}],i)];return Oo(d).then(()=>{for(let e of d)e.cancel()})}async function g(e,n){let r=t.draws.items[e]?.text??``;jo(z(l),r),M(a,r,!0),M(c,ko,!0),await h(n,!0),M(o,e,!0),await new Promise(e=>setTimeout(e,Number.parseFloat(getComputedStyle(n).getPropertyValue(`--ledger-check-hold`)))),await h(n,!1),M(o,null)}var _=lp(),v=N(_);Fo(v,{get foot(){return r},get set(){return n},get where(){return t.where}});var y=P(F(v,2),!0);O(_),I(()=>{W(_,`data-touch`,t.draws.touch||void 0),W(_,`data-where`,t.where),H(y,z(c))}),V(e,_),qe()}Nr([`click`]);var dp={brief:tf,bug:Bd,calendar:Ud,draft:bf,explore:cf,grill:Ef,ideas:Wf,mail:Cf,palette:_f,people:qf,refresh:Mf,reply:Kd,rocket:Ff,routine:Qd,screen:$f,search:df,site:af,stages:Xf,system:Rf,tasks:Yd,triage:Vf,voice:mf},fp=kd({base:`inline-flex items-center rounded-sm text-ink-strong type-label mark-line`,variants:{variant:{option:`group/option touch-hit min-h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-3 py-space-1 text-start hit-edge-hair enabled:not-aria-pressed:not-aria-checked:not-data-chosen:hover:bg-surface-hover aria-checked:border-brand-solid aria-checked:bg-surface-recess aria-pressed:border-brand-solid aria-pressed:bg-surface-recess data-chosen:border-brand-solid data-chosen:bg-surface-recess motion-safe:transition-[border-color,background-color] motion-safe:duration-(--dur-control) motion-safe:ease-out`,tray:`pointer-events-auto touch-hit relative isolate h-c-tray-chip touch-manipulation gap-c-pill-gap border-0 bg-transparent px-space-2 transition-[color] duration-(--dur-control) ease-out select-none [--tray-chip-fill:var(--surface-raised)] touch-callout-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-(color:--tray-chip-fill) before:shadow-tile before:transition-[background-color] before:duration-(--dur-control) before:ease-out motion-safe:transition-[color,transform] motion-safe:active:[transform:scale(var(--press-scale))] can-hover:hover:[--tray-chip-fill:var(--surface-hover)] *:[svg]:size-icon-md *:[svg]:flex-none`,inline:`-my-c-inline-chip-pad max-w-full gap-space-1 rounded-[calc(var(--radius-xs)+var(--c-inline-chip-pad))] bg-surface-recess py-c-inline-chip-pad ps-c-inline-chip-pad pe-space-2 align-baseline leading-c-inline-chip-line whitespace-nowrap inset-ring inset-ring-border-hairline *:data-[slot=label]:max-w-c-inline-chip-max-w *:data-[slot=label]:min-w-0 *:data-[slot=label]:self-baseline *:data-[slot=label]:overflow-clip *:data-[slot=label]:text-ellipsis motion-safe:transition-[background-color,transform] motion-safe:duration-(--dur-control) motion-safe:ease-out motion-safe:enabled:active:[transform:scale(var(--press-scale))] can-hover:enabled:hover:bg-surface-hover *:[svg]:size-icon-md *:[svg]:flex-none`,setting:`touch-hit h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-2 leading-none whitespace-nowrap hit-edge-hair transition-control aria-disabled:opacity-50 *:data-[slot=chevron]:size-icon-sm *:data-[slot=chevron]:text-ink-subtle **:data-[slot=chip-label]:min-w-0 **:data-[slot=chip-label]:overflow-hidden **:data-[slot=chip-label]:text-ellipsis motion-safe:transition-control-press can-hover:enabled:not-variant-static:hover:bg-surface-hover motion-safe:enabled:not-aria-busy:pressed:[transform:scale(var(--press-scale))] variant-static:border-border-hairline variant-static:bg-surface-recess *:[svg]:flex-none *:[svg]:not-data-[slot=chevron]:size-icon-md`},size:{regular:``,compact:`h-(--row-compact-h) gap-space-1 max-phone:h-c-btn-h-lg max-phone:not-data-account-chip:*:data-[slot=chevron]:hidden`},tone:{muted:``,fail:``,grant:``}},compoundVariants:[{variant:`setting`,tone:`muted`,class:`text-ink-muted`},{variant:`setting`,tone:`fail`,class:`border-status-fail-ink text-status-fail-ink`},{variant:`setting`,tone:`grant`,class:`border-status-attn-ink bg-status-attn-bg text-status-attn-ink *:data-[slot=chevron]:text-status-attn-ink can-hover:enabled:not-variant-static:hover:bg-status-attn-bg variant-static:border-status-attn-ink variant-static:bg-status-attn-bg`}],defaultVariants:{variant:`option`}}),pp=kd({base:`flex flex-wrap gap-space-2 hit-gap-x-space-2 hit-gap-y-space-2 coarse:gap-y-space-4 coarse:hit-gap-y-space-4`}),mp=(e,t=f,n=f)=>{var r=Ur(),i=pn(r),a=e=>{Pd(e,{class:`w-c-measure-meta max-w-full`,get line(){return n()},radius:`line`})},o=e=>{Pd(e,{class:`w-3/4`,get line(){return n()},radius:`line`})},s=e=>{Pd(e,{class:`w-2/3`,get line(){return n()},radius:`line`})};U(i,e=>{t()%3==0?e(a):t()%3==1?e(o,1):e(s,-1)}),V(e,r)},hp=B(`<span class="grid place-items-center"><!></span>`),gp=B(`<li><!> <!></li>`),_p=B(`<span class="mark-cell"><!></span>`),vp=B(`<li class="not-last:border-b not-last:border-border-hairline"><button data-slot="suggestion" type="button"><!> <span data-slot="suggestion-text" class="min-w-0 text-pretty wrap-anywhere"> </span></button></li>`),yp=B(`<ul class="m-0 flex list-none flex-col p-0"><!></ul>`),bp=B(`<span class="mark-cell type-label"><!></span>`),xp=B(`<span class="flex"><!></span>`),Sp=B(`<span class="hidden @max-suggestion-rows-narrow:flex"><!></span>`),Cp=B(`<li><!> <span class="flex min-w-0 flex-col gap-space-1"><!> <span class="flex flex-col group-data-[placement=composer]/suggestions:hidden"><!> <span class="contents group-data-[placement=panel]/suggestions:hidden"><!></span></span></span></li>`),wp=B(`<span data-slot="suggestion-reason" class="type-meta text-pretty wrap-anywhere text-ink-muted group-data-[placement=composer]/suggestions:hidden"> </span>`),Tp=B(`<li><button data-slot="suggestion" type="button"><!> <span class="flex min-w-0 flex-col gap-space-1" data-box=""><span data-slot="suggestion-text" class="type-label text-pretty wrap-anywhere"> </span> <!></span></button></li>`),Ep=B(`<ul class="m-0 flex list-none flex-col gap-space-2 p-0"><!></ul>`),Dp=B(`<li class="flex max-w-full"><!></li>`),Op=B(`<li class="flex max-w-full"><button data-slot="suggestion" type="button"><!> <span data-slot="suggestion-text" class="min-w-0 text-pretty wrap-anywhere"> </span></button></li>`),kp=B(`<ul><!></ul>`),Ap=B(`<div data-slot="suggestions" class="group/suggestions @container w-full min-w-0 data-[placement=panel]:max-w-c-starters-w"><!></div>`);function jp(e,t){Ke(t,!0);let n=da(t,`look`,3,`list`),r=da(t,`placement`,3,`thread`),i=da(t,`loading`,3,0),a=k(()=>i()>0),o=k(()=>Array.from({length:i()},(e,t)=>t)),s=k(()=>r()!==`panel`),c=e=>z(s)&&e.glyph?dp[e.glyph]:null;var l=Ap(),u=N(l),d=e=>{var n=yp(),r=N(n),i=e=>{var t=Ur();ai(pn(t),16,()=>z(o),e=>e,(e,t)=>{var n=gp(),r=N(n),i=e=>{var t=hp();Pd(N(t),{cell:`glyph`,radius:`text`}),O(t),V(e,t)};U(r,e=>{z(s)&&e(i)}),mp(F(r,2),()=>t,()=>`body`),O(n),I(()=>Mi(n,1,Ei([`grid min-h-c-row-h content-center items-center gap-x-space-1 not-last:border-b not-last:border-border-hairline`,z(s)?`grid-cols-lead-fluid pe-space-3`:`grid-cols-1 px-space-3`]))),V(e,n)}),V(e,t)},l=e=>{var n=Ur();ai(pn(n),19,()=>t.suggestions,(e,t)=>`${t}:${e.text}`,(e,n)=>{let r=k(()=>c(z(n)));var i=vp(),a=N(i),o=N(a),l=e=>{var t=_p(),n=N(t),i=e=>{var t=Ur();fi(pn(t),()=>z(r),(e,t)=>{t(e,{"aria-hidden":`true`,"data-suggestion-glyph":!0,class:`size-icon-md text-ink-muted transition-[color] duration-(--dur-control) ease-out group-hover/item:text-ink-strong`})}),V(e,t)};U(n,e=>{z(r)&&e(i)}),O(t),V(e,t)};U(o,e=>{z(s)&&e(l)});var u=P(F(o,2),!0);O(a),O(i),I(()=>{Mi(a,1,Ei([`group/item mark-line press-tint focus-inset grid w-full min-h-c-row-h content-center items-start gap-x-space-1 rounded-sm py-space-3 text-start type-body text-ink-strong select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover`,z(s)?`grid-cols-lead-fluid pe-space-3`:`grid-cols-1 px-space-3`])),H(u,z(n).text)}),Mr(`click`,a,()=>t.onpick(z(n))),V(e,i)}),V(e,n)};U(r,e=>{z(a)?e(i):e(l,-1)}),O(n),I(()=>{W(n,`aria-busy`,z(a)||void 0),W(n,`aria-label`,t.label)}),V(e,n)},f=e=>{var n=Ep(),r=N(n),i=e=>{var t=Ur();ai(pn(t),16,()=>z(o),e=>e,(e,t)=>{var n=Cp(),r=N(n),i=e=>{var t=bp();Pd(N(t),{cell:`glyph`,radius:`text`}),O(t),V(e,t)};U(r,e=>{z(s)&&e(i)});var a=F(r,2),o=N(a);mp(o,()=>t,()=>`label`);var c=F(o,2),l=N(c);Pd(l,{class:`w-full`,line:`meta`,radius:`line`});var u=F(l,2),d=N(u),f=e=>{var t=xp();Pd(N(t),{class:`w-1/2`,line:`meta`,radius:`line`}),O(t),V(e,t)},p=e=>{var t=Sp();Pd(N(t),{class:`w-1/2`,line:`meta`,radius:`line`}),O(t),V(e,t)};U(d,e=>{t%2==1?e(f):e(p,-1)}),O(u),O(c),O(a),O(n),I(()=>Mi(n,1,Ei([`grid min-h-c-row-h-two content-center items-start gap-x-space-3 rounded-md bg-surface-raised px-space-4 py-space-3 shadow-tile`,z(s)?`grid-cols-mark-fluid`:`grid-cols-1`]))),V(e,n)}),V(e,t)},l=e=>{var n=Ur();ai(pn(n),19,()=>t.suggestions,(e,t)=>`${t}:${e.text}`,(e,n)=>{let r=k(()=>c(z(n)));var i=Tp(),a=N(i),o=N(a),l=e=>{var t=bp(),n=N(t),i=e=>{var t=Ur();fi(pn(t),()=>z(r),(e,t)=>{t(e,{"aria-hidden":`true`,"data-suggestion-glyph":!0,class:`size-icon-md text-ink-strong`})}),V(e,t)};U(n,e=>{z(r)&&e(i)}),O(t),V(e,t)};U(o,e=>{z(s)&&e(l)});var u=F(o,2),d=N(u),f=P(d,!0),p=F(d,2),m=e=>{var t=wp(),r=P(t,!0);I(()=>H(r,z(n).reason)),V(e,t)};U(p,e=>{z(n).reason&&e(m)}),O(u),O(a),O(i),I(()=>{Mi(a,1,Ei([`mark-line press-tint grid w-full min-h-c-row-h-two content-center items-start gap-x-space-3 rounded-md bg-surface-raised px-space-4 py-space-3 text-start text-ink-strong shadow-tile select-none transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover`,z(s)?`grid-cols-mark-fluid`:`grid-cols-1`])),H(f,z(n).text)}),Mr(`click`,a,()=>t.onpick(z(n))),V(e,i)}),V(e,n)};U(r,e=>{z(a)?e(i):e(l,-1)}),O(n),I(()=>{W(n,`aria-busy`,z(a)||void 0),W(n,`aria-label`,t.label)}),V(e,n)},p=e=>{var n=kp(),r=N(n),i=e=>{var t=Ur();ai(pn(t),16,()=>z(o),e=>e,(e,t)=>{var n=Dp();Pd(N(n),{class:`w-c-measure-meta max-w-full`,height:`control-sm`,radius:`chip`,type:`label`}),O(n),V(e,n)}),V(e,t)},s=e=>{var n=Ur();ai(pn(n),19,()=>t.suggestions,(e,t)=>`${t}:${e.text}`,(e,n)=>{let r=k(()=>c(z(n)));var i=Op(),a=N(i),o=N(a),s=e=>{var t=_p();fi(N(t),()=>z(r),(e,t)=>{t(e,{"aria-hidden":`true`,"data-suggestion-glyph":!0,class:`size-icon-md text-ink-muted`})}),O(t),V(e,t)};U(o,e=>{z(r)&&e(s)});var l=P(F(o,2),!0);O(a),O(i),I(e=>{Mi(a,1,e),H(l,z(n).text)},[()=>Ei(fp({class:`inline-grid min-w-c-touch-floor grid-cols-[auto_minmax(0,auto)] content-center items-start border-border-row-outline select-none motion-safe:transition-[border-color,background-color,transform] motion-safe:enabled:active:[transform:scale(var(--press-scale))] motion-safe:enabled:data-pressed:[transform:scale(var(--press-scale))]`}))]),Mr(`click`,a,()=>t.onpick(z(n))),V(e,i)}),V(e,n)};U(r,e=>{z(a)?e(i):e(s,-1)}),O(n),I(e=>{W(n,`aria-busy`,z(a)||void 0),W(n,`aria-label`,t.label),Mi(n,1,e)},[()=>Ei(pp({class:`m-0 list-none p-0`}))]),V(e,n)};U(u,e=>{n()===`list`?e(d):n()===`rows`?e(f,1):e(p,-1)}),O(l),I(()=>{W(l,`data-look`,n()),W(l,`data-placement`,r())}),V(e,l),qe()}Nr([`click`]);var Mp=B(`<div class="direction svelte-b21ipj" data-direction="today"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function Np(e,t){Ke(t,!0);let n=e=>{{let n=k(()=>t.draws.loading?3:0),r=k(()=>t.where===`board`?`panel`:`thread`);jp(e,{label:`Things to ask Caw`,get loading(){return z(n)},onpick:e=>{jo(z(o),e.text),M(i,e.text,!0),M(a,ko,!0)},get placement(){return z(r)},get suggestions(){return t.draws.items}})}},r=e=>{{let n=k(()=>t.where===`keyboard`);No(e,{get focused(){return z(n)},get field(){return z(o)},set field(e){M(o,e,!0)},get value(){return z(i)},set value(e){M(i,e,!0)}})}},i=j(``),a=j(``),o=j(void 0);var s=Mp(),c=N(s);Fo(c,{get foot(){return r},get set(){return n},get where(){return t.where}});var l=P(F(c,2),!0);O(s),I(()=>H(l,z(a))),V(e,s),qe()}var Pp=B(`<div class="sent svelte-l1hgve" data-slot="sent"> </div>`),Fp=B(`<button data-slot="suggestion" type="button"><span class="chip-text svelte-l1hgve" data-slot="suggestion-text"> </span></button>`),Ip=B(`<div class="head svelte-l1hgve" data-slot="tray-count"><span> </span></div> <div class="chip-row kit-edge-fade svelte-l1hgve" role="group"></div>`,1),Lp=B(`<li class="row bones svelte-l1hgve"><span class="bone svelte-l1hgve" data-slot="skeleton"></span> <span class="bone reason-bone svelte-l1hgve" data-slot="skeleton"></span></li>`),Rp=B(`<span class="reason svelte-l1hgve" data-slot="suggestion-reason"> </span>`),zp=B(`<li><button class="row svelte-l1hgve" data-slot="suggestion" type="button"><span class="text svelte-l1hgve" data-slot="suggestion-text"> </span> <!></button></li>`),Bp=B(`<li><button class="row more svelte-l1hgve" type="button"><span class="text svelte-l1hgve"> </span></button></li>`),Vp=B(`<!> <!>`,1),Hp=B(`<ul aria-labelledby="tray-label" class="rows kit-edge-fade-block svelte-l1hgve" data-slot="tray-rows"><!></ul>`),Up=B(`<div class="head svelte-l1hgve"><span id="tray-label"> </span> <button class="chevron svelte-l1hgve" type="button"><!></button></div> <!>`,1),Wp=B(`<span class="running svelte-l1hgve" data-slot="skeleton"></span>`),Gp=B(`<div class="tray svelte-l1hgve"><!> <div class="divider svelte-l1hgve"><!></div></div>`),Kp=B(`<div class="box svelte-l1hgve"><!></div>`),qp=B(`<div class="tray-direction svelte-l1hgve" data-direction="tray"><!> <p aria-live="polite" class="sr-only"> </p></div>`);function Jp(e,t){Ke(t,!0);let n=e=>{var n=Ur(),r=pn(n),i=e=>{var t=Pp(),n=P(t,!0);I(()=>H(n,z(a))),V(e,t)};U(r,e=>{t.draws.phase===`sent`&&e(i)}),V(e,n)},r=e=>{var n=Kp();No(N(n),{get focused(){return z(i)},get field(){return z(f)},set field(e){M(f,e,!0)},get value(){return z(o)},set value(e){M(o,e,!0)},children:(e,n)=>{var r=Ur(),i=pn(r),a=e=>{var n=Gp(),r=N(n),i=e=>{var n=Ip(),r=pn(n),i=P(N(r));O(r);var a=F(r,2);ai(a,23,()=>t.draws.items,(e,t)=>`${t}:${e.text}`,(e,t)=>{var n=Fp(),r=P(N(n),!0);O(n),I(e=>{Mi(n,1,e,`svelte-l1hgve`),H(r,z(t).text)},[()=>Ei(fp({class:`chip`}))]),Mr(`click`,n,()=>te(z(t).text)),V(e,n)}),O(a),oa(a,e=>M(p,e),()=>z(p)),I(()=>{H(i,`${z(v)??``}${z(y)??``}`),W(a,`aria-label`,`${z(v)??``}${z(y)??``}`)}),V(e,n)},a=e=>{var n=Up(),r=pn(n),i=N(r),a=P(i),o=F(i,2);Ld(N(o),{"aria-hidden":`true`,class:`glyph`}),O(o),O(r);var s=F(r,2),l=e=>{var n=Hp(),r=N(n),i=e=>{var t=Ur();ai(pn(t),16,()=>[`var(--tray-bone-1)`,`var(--tray-bone-2)`,`var(--tray-bone-3)`],e=>e,(e,t)=>{var n=Lp(),r=N(n);let i;Te(2),O(n),I(()=>i=Pi(r,``,i,{"inline-size":t})),V(e,n)}),V(e,t)},a=e=>{var n=Vp(),r=pn(n);ai(r,19,()=>z(g),(e,t)=>`${t}:${e.text}`,(e,n,r)=>{var i=zp(),a=N(i),o=N(a),s=P(o,!0),c=F(o,2),l=e=>{var t=Rp(),i=P(t,!0);I(()=>{W(t,`id`,`tray-reason-${z(r)??``}`),H(i,z(n).reason)}),V(e,t)};U(c,e=>{z(n).reason&&e(l)}),O(a),O(i),I(()=>{W(a,`aria-describedby`,z(n).reason?`tray-reason-${z(r)}`:void 0),W(a,`data-held`,z(r)===0?t.draws.held:void 0),H(s,z(n).text)}),Mr(`click`,a,e=>ee(z(r),e.currentTarget)),V(e,i)});var i=F(r,2),a=e=>{var t=Bp(),n=N(t),r=P(N(n));O(n),O(t),I(()=>H(r,`${z(_)??``} more`)),Mr(`click`,n,()=>M(u,!0)),V(e,t)};U(i,e=>{z(_)>0&&e(a)}),V(e,n)};U(r,e=>{t.draws.loading?e(i):e(a,-1)}),O(n),Ci(n,To),V(e,n)};U(s,e=>{z(c)||e(l)}),I(()=>{H(a,`${z(v)??``}${z(y)??``}`),W(o,`aria-expanded`,!z(c)),W(o,`aria-label`,z(c)?`Open`:`Close`),W(o,`data-shut`,z(c)||void 0)}),Mr(`click`,o,()=>M(c,!z(c))),V(e,n)};U(r,e=>{z(h)?e(i):e(a,-1)});var o=F(r,2),s=N(o),l=e=>{V(e,Wp())};U(s,e=>{t.draws.loading&&e(l)}),O(o),O(n),I(()=>W(n,`data-loading`,t.draws.loading||void 0)),V(e,n)};U(i,e=>{z(m)&&e(a)}),V(e,r)},$$slots:{default:!0}}),O(n),V(e,n)},i=k(()=>t.where===`keyboard`),a=k(()=>t.draws.items[0]?.text??``),o=j(tn((e=>e===`filled`||e===`scrolled`||e===`reopened`)(t.draws.phase)?z(a):``)),s=j(t.draws.phase===`reopened`),c=j(!1),l=j(!1),u=j(tn(t.draws.expanded)),d=j(``),f=j(void 0),p=j(void 0),m=k(()=>(t.draws.items.length>0||t.draws.loading)&&t.draws.phase!==`sent`),h=k(()=>(z(o)!==``||z(i))&&!z(s)&&!t.draws.loading&&!z(l)),g=k(()=>z(u)?t.draws.items:t.draws.items.slice(0,4)),_=k(()=>t.draws.items.length-z(g).length),v=k(()=>t.where===`board`?`Things you might say`:`You might say`),y=k(()=>t.draws.loading?``:` · ${t.draws.items.length}`);Tn(()=>{t.draws.phase===`scrolled`&&z(p)&&(z(p).scrollLeft=z(p).scrollWidth/3)});async function ee(e,n){let r=t.draws.items[e]?.text??``,i=n.querySelector(`[data-slot='suggestion-text']`);if(!(i&&z(f)))return;let a={duration:Ua(`--dur-exit`),easing:Wa(`--ease-out`),fill:`forwards`},c=Number.parseFloat(getComputedStyle(n).getPropertyValue(`--tray-carry`));M(l,!0),jo(z(f),r);let u=[i.animate(Ia.current?[{translate:`0 0`,opacity:1},{translate:`0 ${c}px`,opacity:0}]:[{opacity:1},{opacity:0}],a),z(f).animate([{opacity:0},{opacity:1}],a)];await Oo(u),M(o,r,!0),M(s,!1),M(l,!1),M(d,ko,!0);for(let e of u)e.cancel()}function te(e){jo(z(f),e),M(o,e,!0),M(d,ko,!0)}Tn(()=>{z(o)===``&&M(s,!1)});var ne=qp(),re=N(ne);Fo(re,{anchor:`end`,get foot(){return r},get set(){return n},get where(){return t.where}});var b=P(F(re,2),!0);O(ne),I(()=>{W(ne,`data-touch`,t.draws.touch||void 0),W(ne,`data-where`,t.where),H(b,z(d))}),V(e,ne),qe()}Nr([`click`]);var Yp=B(`<li><a> </a></li>`),Xp=B(`<section class="group"><h2> </h2> <ul></ul></section>`),Zp=B(`<p class="note" data-slot="note"> </p>`),Qp=B(`<header class="panel-head"><!> <span class="panel-words"><strong>Caw</strong><span>Cawco</span></span></header>`),$p=B(`<div aria-hidden="true" class="keyboard" data-slot="keyboard"><span>Keyboard</span></div>`),em=B(`<article class="frame"><!> <div class="body"><!></div> <!></article>`),tm=B(`<nav aria-label="Suggestions states" class="switcher" data-slot="switcher"><!> <!> <p class="key" data-slot="state-key"> </p></nav> <main aria-label="The state on show" class="stage" data-slot="stage"><!></main>`,1);function nm(e,t){Ke(t,!0);let n={today:Np,drafts:Uo,ledger:up,tray:Jp},r=()=>Oa(new URLSearchParams(location.search).get(`__state`)),i=j(tn(r())),a=k(()=>ka(z(i))),o=k(()=>Da(z(i).direction)),s=k(()=>Aa(z(i))),c=k(()=>n[z(i).direction]),l=k(()=>wa[z(i).where]),u=(e,t)=>`?__state=${ka(Oa(ka({...z(i),[e]:t})))}`;function d(e,t){e.metaKey||e.ctrlKey||e.shiftKey||e.button!==0||(e.preventDefault(),history.pushState(null,``,t),M(i,r(),!0))}Tn(()=>{let e=()=>M(i,r(),!0);return addEventListener(`popstate`,e),()=>removeEventListener(`popstate`,e)}),Tn(()=>{let e=document.documentElement;e.dataset.flipping=``,e.classList.toggle(`dark`,z(i).theme===`dark`),getComputedStyle(e).color,requestAnimationFrame(()=>requestAnimationFrame(()=>delete e.dataset.flipping))});var f=tm(),p=pn(f),m=N(p);ai(m,17,()=>z(o),e=>e.key,(e,t)=>{var n=Xp(),r=N(n),a=P(r,!0),o=F(r,2);ai(o,21,()=>z(t).entries,e=>e.value,(e,n)=>{let r=k(()=>u(z(t).key,z(n).value));var a=Yp(),o=N(a),s=P(o,!0);O(a),I(()=>{W(o,`aria-current`,z(i)[z(t).key]===z(n).value?`page`:void 0),W(o,`data-entry`,z(n).value),W(o,`href`,z(r)),H(s,z(n).label)}),Mr(`click`,o,e=>d(e,z(r))),V(e,a)}),O(o),O(n),I(()=>{W(n,`aria-labelledby`,`group-${z(t).key??``}`),W(n,`data-group`,z(t).key),W(r,`id`,`group-${z(t).key??``}`),H(a,z(t).label)}),V(e,n)});var h=F(m,2),g=e=>{var t=Zp(),n=P(t,!0);I(e=>H(n,e),[()=>Ea(z(i).direction)]),V(e,t)},_=k(()=>Ea(z(i).direction));U(h,e=>{z(_)&&e(g)});var v=P(F(h,2));O(p);var y=F(p,2);ti(N(y),()=>z(a),e=>{var t=em();let n;var r=N(t),a=e=>{var t=Qp();Ma(N(t),{class:`panel-mark`,size:28}),Te(2),O(t),V(e,t)};U(r,e=>{z(i).where!==`board`&&e(a)});var o=F(r,2);fi(N(o),()=>z(c),(e,t)=>{t(e,{get draws(){return z(s)},get where(){return z(i).where}})}),O(o);var u=F(o,2),d=e=>{V(e,$p())};U(u,e=>{z(i).where===`keyboard`&&e(d)}),O(t),I(()=>{W(t,`aria-label`,z(l).label),W(t,`data-frame`,z(i).where),n=Pi(t,``,n,{"--frame-w":`${z(l).width??``}px`})}),V(e,t)}),O(y),I(()=>{H(v,`?__state=${z(a)??``}`),W(y,`data-data`,z(i).data),W(y,`data-direction`,z(i).direction),W(y,`data-state`,z(a)),W(y,`data-theme`,z(i).theme),W(y,`data-where`,z(i).where)}),V(e,f),qe()}Nr([`click`]),Yr(nm,{target:document.body});