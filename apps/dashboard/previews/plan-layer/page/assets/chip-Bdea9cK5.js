(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=Array.isArray,t=Array.prototype.indexOf,n=Array.prototype.includes,r=Array.from,i=Object.defineProperty,a=Object.getOwnPropertyDescriptor,o=Object.getOwnPropertyDescriptors,s=Object.prototype,c=Array.prototype,l=Object.getPrototypeOf,u=Object.isExtensible;function d(e){return typeof e==`function`}var f=()=>{};function p(e){for(var t=0;t<e.length;t++)e[t]()}function m(){var e,t;return{promise:new Promise((n,r)=>{e=n,t=r}),resolve:e,reject:t}}function h(e,t){if(Array.isArray(e))return e;if(t===void 0||!(Symbol.iterator in e))return Array.from(e);let n=[];for(let r of e)if(n.push(r),n.length===t)break;return n}var g=1<<24,_=1024,v=2048,y=4096,b=8192,x=16384,S=32768,ee=1<<25,C=65536,w=1<<19,te=1<<20,ne=1<<25,re=1<<21,ie=1<<22,ae=1<<23,T=Symbol(`$state`),E=Symbol(`component`),D=Symbol(`legacy props`),oe=Symbol(``),se=Symbol(`attributes`),O=Symbol(`class`),ce=Symbol(`style`),le=Symbol(`text`),ue=Symbol(`form reset`),de=new class extends Error{name=`StaleReactionError`;message="The reaction that called `getAbortSignal()` was re-run or destroyed"},k=!!globalThis.document?.contentType&&globalThis.document.contentType.includes(`xml`),A={},j=Symbol(`uninitialized`),fe=`http://www.w3.org/1999/xhtml`;function M(){console.warn(`https://svelte.dev/e/derived_inert`)}function pe(e){console.warn(`https://svelte.dev/e/hydration_mismatch`)}function me(){console.warn(`https://svelte.dev/e/select_multiple_invalid_value`)}function he(){console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`)}var N=!1;function P(e){N=e}var F;function ge(e){if(e===null)throw pe(),A;return F=e}function _e(){return ge(tn(F))}function ve(e){if(N){if(tn(F)!==null)throw pe(),A;F=e}}function ye(e=1){if(N){for(var t=e,n=F;t--;)n=tn(n);F=n}}function be(e=!0){for(var t=0,n=F;;){if(n.nodeType===8){var r=n.data;if(r===`]`){if(t===0)return n;--t}else(r===`[`||r===`[!`||r[0]===`[`&&!isNaN(Number(r.slice(1))))&&(t+=1)}var i=tn(n);e&&n.remove(),n=i}}function xe(e){if(!e||e.nodeType!==8)throw pe(),A;return e.data}function Se(e){return e===this.v}function Ce(e,t){return e==e?e!==t||typeof e==`object`&&!!e||typeof e==`function`:t==t}function we(e){return!Ce(e,this.v)}function Te(){throw Error(`https://svelte.dev/e/async_derived_orphan`)}function Ee(e,t,n){throw Error(`https://svelte.dev/e/each_key_duplicate`)}function De(e){throw Error(`https://svelte.dev/e/effect_in_teardown`)}function Oe(){throw Error(`https://svelte.dev/e/effect_in_unowned_derived`)}function ke(e){throw Error(`https://svelte.dev/e/effect_orphan`)}function Ae(){throw Error(`https://svelte.dev/e/effect_update_depth_exceeded`)}function je(e){throw Error(`https://svelte.dev/e/props_invalid_value`)}function Me(){throw Error(`https://svelte.dev/e/state_descriptors_fixed`)}function Ne(){throw Error(`https://svelte.dev/e/state_prototype_fixed`)}function Pe(){throw Error(`https://svelte.dev/e/state_unsafe_mutation`)}function Fe(){throw Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`)}var Ie=!1;function Le(){Ie=!0}var I=null;function Re(e){I=e}function ze(e,t=!1,n){I={p:I,i:!1,c:null,e:null,s:e,x:null,r:H,l:null}}function Be(e){var t=I,n=t.e;if(n!==null){t.e=null;for(var r of n)yn(r)}return e!==void 0&&(t.x=e),t.i=!0,I=t.p,Ve(e)}function Ve(e={}){return i(e,E,{value:!0}),e}function He(){return!0}var Ue=[];function We(){var e=Ue;Ue=[],p(e)}function Ge(e){if(Ue.length===0&&!_t){var t=Ue;queueMicrotask(()=>{t===Ue&&We()})}Ue.push(e)}var Ke=~(v|y|_);function L(e,t){e.f=e.f&Ke|t}function qe(e){e.f&512||e.deps===null?L(e,_):L(e,y)}function Je(e,t,n){e.f&2048?t.add(e):e.f&4096&&n.add(e),L(e,_)}function Ye(e,t){if(t){let t=document.body;e.autofocus=!0,Ge(()=>{document.activeElement===t&&e.focus()})}}var Xe=!1;function Ze(){Xe||(Xe=!0,document.addEventListener(`reset`,e=>{Promise.resolve().then(()=>{if(!e.defaultPrevented)for(let t of e.target.elements)t[ue]?.()})},{capture:!0}))}function Qe(e){var t=V,n=H;Un(null),Wn(null);try{return e()}finally{Un(t),Wn(n)}}function $e(e,t,n,r){let i=He()?rt:st;var a=e.filter(e=>!e.settled),o=t.map(i);if(n.length===0&&a.length===0){r(o);return}var s=H,c=et(),l=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(e=>e.promise)):null;function u(e){if(!(s.f&16384)){c();try{r([...o,...e])}catch(e){fn(e,s)}tt()}}var d=nt();if(n.length===0){l.then(()=>u([])).finally(d);return}function f(){Promise.all(n.map(e=>at(e))).then(u).catch(e=>fn(e,s)).finally(d)}l?l.then(()=>{if(s.f&16384){d();return}c(),f(),tt()}):f()}function et(){var e=H,t=V,n=I,r=R;return function(i=!0){Wn(e),Un(t),Re(n),i&&!(e.f&16384)&&(r?.activate(),r?.apply())}}function tt(e=!0){Wn(null),Un(null),Re(null),e&&R?.deactivate()}function nt(){var e=H,t=e.b,n=R,r=!!t?.is_rendered();return t?.update_pending_count(1,n),n.increment(r,e),()=>{t?.update_pending_count(-1,n),n.decrement(r,e)}}function rt(e){var t=2|v;return H!==null&&(H.f|=w),{ctx:I,deps:null,effects:null,equals:Se,f:t,fn:e,reactions:null,rv:0,v:j,wv:0,parent:H,ac:null}}var it=Symbol(`obsolete`);function at(e,t,n){let r=H;r===null&&Te();var i=void 0,a=Ft(j),o=!V,s=new Set;return Cn(()=>{var t=H,n=m();i=n.promise;try{Promise.resolve(e()).then(n.resolve,e=>{e!==de&&n.reject(e)}).finally(tt)}catch(e){n.reject(e),tt()}var c=R;if(o){if(t.f&32768)var l=nt();if(r.b?.is_rendered())c.async_deriveds.get(t)?.reject(it);else for(let e of s.values())e.reject(it);s.add(n),c.async_deriveds.set(t,n)}let u=(e,t=void 0)=>{l?.(),s.delete(n),t!==it&&(c.activate(),t?(a.f|=ae,Vt(a,t)):(a.f&8388608&&(a.f^=ae),Vt(a,e)),c.deactivate())};n.promise.then(u,e=>u(null,e||`unknown`))}),_n(()=>{for(let e of s)e.reject(it)}),new Promise(e=>{function t(n){function r(){n===i?e(a):t(i)}n.then(r,r)}t(i)})}function ot(e){let t=rt(e);return Ie||Kn(t),t}function st(e){let t=rt(e);return t.equals=we,t}function ct(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)B(t[n])}}function lt(e){var t,n=H,r=e.parent;if(!Bn&&r!==null&&e.v!==j&&r.f&24576)return M(),e.v;Wn(r);try{ct(e),t=ir(e)}finally{Wn(n)}return t}function ut(e){var t=lt(e);if(!e.equals(t)&&(e.wv=tr(),(!R?.is_fork||e.deps===null)&&(R===null?e.v=t:(R.capture(e,t,!0),ht?.capture(e,t,!0)),e.deps===null))){L(e,_);return}Bn||(z===null?qe(e):(gn()||R?.is_fork)&&z.set(e,t))}function dt(e){if(e.effects!==null)for(let t of e.effects)(t.teardown||t.ac)&&(t.teardown?.(),t.ac!==null&&Qe(()=>{t.ac.abort(de),t.ac=null}),t.fn!==null&&(t.teardown=f),sr(t,0),An(t))}function ft(e){if(e.effects!==null)for(let t of e.effects)t.teardown&&t.fn!==null&&cr(t)}var pt=null,mt=null,R=null,ht=null,z=null,gt=null,_t=!1,vt=!1,yt=null,bt=null,xt=0,St=1,Ct=class e{id=St++;#e=!1;linked=!0;#t=null;#n=null;async_deriveds=new Map;current=new Map;previous=new Map;#r=new Set;#i=new Set;#a=0;#o=new Map;#s=null;#c=[];#l=[];#u=new Set;#d=new Set;#f=new Map;#p=new Set;is_fork=!1;#m=!1;constructor(){mt===null?pt=mt=this:(mt.#n=this,this.#t=mt),mt=this}#h(){if(this.is_fork)return!0;for(let n of this.#o.keys()){for(var e=n,t=!1;e.parent!==null;){if(this.#f.has(e)){t=!0;break}e=e.parent}if(!t)return!0}return!1}skip_effect(e){this.#f.has(e)||this.#f.set(e,{d:[],m:[]}),this.#p.delete(e)}unskip_effect(e,t=e=>this.schedule(e)){var n=this.#f.get(e);if(n){this.#f.delete(e);for(var r of n.d)L(r,v),t(r);for(r of n.m)L(r,y),t(r)}this.#p.add(e)}#g(){var e=[];for(let i of this.#c)if(!(i.f&16384||!(i.f&6144))){for(var t=i,n=!1;t.parent!==null;){t=t.parent;var r=t.f;if(r&96){if(!(r&1024)){n=!0;break}t.f^=_}}n||e.push(t)}return this.#c=[],e}#_(){this.#e=!0;for(let e of this.#u)this.#d.delete(e),L(e,v),this.schedule(e);for(let e of this.#d)L(e,y),this.schedule(e);this.apply();for(var t=yt=[],n=[],r=bt=[];this.#c.length>0;){xt++>1e3&&(this.#C(),wt());for(let e of this.#g())try{this.#v(e,t,n)}catch(t){throw jt(e),this.#h()||this.discard(),t}}if(R=null,r.length>0){var i=e.ensure();for(let e of r)i.schedule(e)}if(yt=null,bt=null,this.#h()){this.#x(n),this.#x(t);for(let[e,t]of this.#f)At(e,t);r.length>0&&R.#_();return}let a=this.#y();if(a){this.#x(n),this.#x(t),a.#b(this);return}this.#u.clear(),this.#d.clear();for(let e of this.#r)e(this);this.#r.clear(),ht=this,Et(n),Et(t),ht=null,this.#s?.resolve();var o=R;if(this.#a===0&&(this.#c.length===0||o!==null)&&(this.#C(),Ie&&(this.#S(),R=o)),this.#c.length>0){if(o!==null){for(let e of this.#c)o.#c.push(e);this.#c=[]}else o=this}o!==null&&(Nt.clear(),o.#_())}#v(e,t,n){e.f^=_;for(var r=e.first;r!==null;){var i=r.f,a=!!(i&96);if(!(a&&i&1024||i&8192||this.#f.has(r))&&r.fn!==null){a?r.f^=_:i&4?t.push(r):Ie&&i&16777224?n.push(r):nr(r)&&(i&16&&this.#d.add(r),cr(r));var o=r.first;if(o!==null){r=o;continue}}for(;r!==null;){var s=r.next;if(s!==null){r=s;break}r=r.parent}}}#y(){for(var e=this.#t;e!==null;){if(!e.is_fork){for(let[t,[,n]]of this.current)if(e.current.has(t)&&!n)return e}e=e.#t}return null}#b(e){for(let[t,n]of e.current)!this.previous.has(t)&&e.previous.has(t)&&this.previous.set(t,e.previous.get(t)),this.current.set(t,n);for(let[t,n]of e.async_deriveds){let e=this.async_deriveds.get(t);e&&n.promise.then(e.resolve).catch(e.reject)}e.async_deriveds.clear(),this.transfer_effects(e.#u,e.#d);let t=e=>{var n=e.reactions;if(n!==null&&!(e.f&2&&!(e.f&6144)))for(let e of n){var r=e.f;if(r&2)t(e);else{var i=e;r&4194320&&!this.async_deriveds.has(i)&&(this.#d.delete(i),L(i,v),this.schedule(i))}}};for(let e of this.current.keys())t(e);this.oncommit(()=>e.discard()),e.#C(),R=this,this.#_()}#x(e){for(var t=0;t<e.length;t+=1)Je(e[t],this.#u,this.#d)}capture(e,t,n=!1){e.v!==j&&!this.previous.has(e)&&this.previous.set(e,e.v),e.f&8388608||(this.current.set(e,[t,n]),z?.set(e,t)),this.is_fork||(e.v=t)}activate(){R=this}deactivate(){R=null,z=null}flush(){try{vt=!0,R=this,this.#_()}finally{xt=0,gt=null,yt=null,bt=null,vt=!1,R=null,z=null,Nt.clear()}}discard(){for(let e of this.#i)e(this);this.#i.clear();for(let e of this.async_deriveds.values())e.reject(it);this.#C(),this.#s?.resolve()}register_created_effect(e){this.#l.push(e)}#S(){for(let u=pt;u!==null;u=u.#n){var e=u.id<this.id,t=[];for(let[r,[i,a]]of this.current){if(u.current.has(r)){var n=u.current.get(r)[0];if(e&&i!==n)u.current.set(r,[i,a]);else continue}t.push(r)}if(e)for(let[e,t]of this.async_deriveds){let n=u.async_deriveds.get(e);n&&t.promise.then(n.resolve).catch(n.reject)}var r=[...u.current.keys()].filter(e=>!u.current.get(e)[1]);if(u.#e&&r.length!==0){var i=r.filter(e=>!this.current.has(e));if(i.length===0)e&&u.discard();else if(t.length>0){if(e)for(let e of this.#p)u.unskip_effect(e,e=>{e.f&4194320?u.schedule(e):u.#x([e])});u.activate();var a=new Set,o=new Map;for(var s of t)Dt(s,i,a,o);o=new Map;var c=[...u.current].filter(([e,t])=>{let n=this.current.get(e);return!n||n[0]!==t[0]||n[1]!==t[1]}).map(([e])=>e);if(c.length>0)for(let e of this.#l)!(e.f&155648)&&Ot(e,c,o)&&(e.f&4194320?(L(e,v),u.schedule(e)):u.#u.add(e));if(u.#c.length>0&&!u.#m){u.apply();for(var l of u.#g())u.#v(l,[],[])}u.deactivate()}}}}increment(e,t){if(this.#a+=1,e){let e=this.#o.get(t)??0;this.#o.set(t,e+1)}}decrement(e,t){if(--this.#a,e){let e=this.#o.get(t)??0;e===1?this.#o.delete(t):this.#o.set(t,e-1)}this.#m||(this.#m=!0,Ge(()=>{this.#m=!1,this.linked&&this.flush()}))}transfer_effects(e,t){for(let t of e)this.#u.add(t);for(let e of t)this.#d.add(e);e.clear(),t.clear()}oncommit(e){this.#r.add(e)}ondiscard(e){this.#i.add(e)}settled(){return(this.#s??=m()).promise}static ensure(){if(R===null){let t=R=new e;!vt&&Ge(()=>{t.#e||t.flush()})}return R}apply(){if(!Ie||!this.is_fork&&this.#t===null&&this.#n===null){z=null;return}z=new Map;for(let[e,[t]]of this.current)z.set(e,t);for(let t=pt;t!==null;t=t.#n)if(!(t===this||t.is_fork)){var e=!1;if(t.id<this.id){for(let[n,[,r]]of t.current)if(!r&&this.current.has(n)){e=!0;break}}if(!e)for(let[e,n]of t.previous)z.has(e)||z.set(e,n)}}schedule(e){if(gt=e,e.b?.is_pending&&e.f&16777228&&!(e.f&32768)){e.b.defer_effect(e);return}this.#c.push(e)}#C(){if(this.linked){var e=this.#t,t=this.#n;e===null?pt=t:e.#n=t,t===null?mt=e:t.#t=e,this.linked=!1}}};function wt(){try{Ae()}catch(e){fn(e,gt)}}var Tt=null;function Et(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var r=e[n++];if(!(r.f&24576)&&nr(r)&&(Tt=new Set,cr(r),r.deps===null&&r.first===null&&r.nodes===null&&r.teardown===null&&r.ac===null&&Nn(r),Tt?.size>0)){Nt.clear();for(let e of Tt){if(e.f&24576)continue;let t=[e],n=e.parent;for(;n!==null;)Tt.has(n)&&(Tt.delete(n),t.push(n)),n=n.parent;for(let e=t.length-1;e>=0;e--){let n=t[e];n.f&24576||cr(n)}}Tt.clear()}}Tt=null}}function Dt(e,t,n,r){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(let i of e.reactions){let e=i.f;e&2?Dt(i,t,n,r):e&4194320&&!(e&2048)&&Ot(i,t,r)&&(L(i,v),kt(i))}}function Ot(e,t,r){let i=r.get(e);if(i!==void 0)return i;if(e.deps!==null)for(let i of e.deps){if(n.call(t,i))return!0;if(i.f&2&&Ot(i,t,r))return r.set(i,!0),!0}return r.set(e,!1),!1}function kt(e){R.schedule(e)}function At(e,t){if(!(e.f&32&&e.f&1024)){e.f&2048?t.d.push(e):e.f&4096&&t.m.push(e),L(e,_);for(var n=e.first;n!==null;)At(n,t),n=n.next}}function jt(e){L(e,_);for(var t=e.first;t!==null;)jt(t),t=t.next}var Mt=new Set,Nt=new Map,Pt=!1;function Ft(e,t){return{f:0,v:e,reactions:null,equals:Se,rv:0,wv:0}}function It(e,t){let n=Ft(e,t);return Kn(n),n}function Lt(e,t=!1,n=!0){let r=Ft(e);return t||(r.equals=we),r}function Rt(e,t,n=!1){return V!==null&&(!Hn||V.f&131072)&&He()&&V.f&4325394&&(Gn===null||!Gn.has(e))&&Pe(),Vt(e,n?Gt(t):t,bt)}var zt=null,Bt=0;function Vt(e,t,n=null){if(!e.equals(t)){Bn?Nt.set(e,t):Nt.has(e)||Nt.set(e,e.v);var r=Ct.ensure();if(r.capture(e,t),e.f&2){let t=e;e.f&2048&&lt(t),z===null&&qe(t)}e.wv=tr(),zt=null,Bt=0,Wt(e,v,n),zt=null,He()&&H!==null&&H.f&1024&&!(H.f&96)&&(Yn===null?Xn([e]):Yn.push(e)),!r.is_fork&&Mt.size>0&&!Pt&&Ht()}return t}function Ht(){Pt=!1;for(let e of Mt){e.f&1024&&L(e,y);let t;try{t=nr(e)}catch{t=!0}t&&cr(e)}Mt.clear()}function Ut(e){Rt(e,e.v+1)}function Wt(e,t,n){var r=e.reactions;if(r!==null){var i=He(),a=r.length;if(Bt+=a,Bt>1e5&&zt===null&&(zt=new Set),zt!==null){if(zt.has(e))return;zt.add(e)}for(var o=0;o<a;o++){var s=r[o],c=s.f;if(i||s!==H){var l=(c&v)===0;if(l&&L(s,t),c&131072)Mt.add(s);else if(c&2){var u=s;z?.delete(u),Wt(u,y,n)}else if(l){var d=s;c&16&&Tt!==null&&Tt.add(d),n===null?kt(d):n.push(d)}}}}}function Gt(t){if(typeof t!=`object`||!t||T in t||E in t)return t;let n=l(t);if(n!==s&&n!==c)return t;var r=new Map,i=e(t),o=It(0),u=null,d=$n,f=e=>{if($n===d)return e();var t=V,n=$n;Un(null),er(d);var r=e();return Un(t),er(n),r};return i&&r.set(`length`,It(t.length,u)),new Proxy(t,{defineProperty(e,t,n){(!(`value`in n)||n.configurable===!1||n.enumerable===!1||n.writable===!1)&&Me();var i=r.get(t);return i===void 0?f(()=>{var e=It(n.value,u);return r.set(t,e),e}):Rt(i,n.value,!0),!0},deleteProperty(e,t){var n=r.get(t);if(n===void 0){if(t in e){let e=f(()=>It(j,u));r.set(t,e),Ut(o)}}else Rt(n,j),Ut(o);return!0},get(e,n,i){if(n===T)return t;var o=r.get(n),s=n in e;if(o===void 0&&(!s||a(e,n)?.writable)&&(o=f(()=>It(Gt(s?e[n]:j),u)),r.set(n,o)),o!==void 0){var c=U(o);return c===j?void 0:c}return Reflect.get(e,n,i)},getOwnPropertyDescriptor(e,t){this.has?.(e,t);var n=Reflect.getOwnPropertyDescriptor(e,t),i=r.get(t);if(i!==void 0){var a=U(i);if(a===j)return;if(n&&`value`in n)n.value=a;else return{enumerable:!0,configurable:!0,value:a,writable:!0}}return n},has(e,t){if(t===T)return!0;var n=r.get(t),i=n!==void 0&&n.v!==j||Reflect.has(e,t);return(n!==void 0||H!==null&&(!i||a(e,t)?.writable))&&(n===void 0&&(n=f(()=>It(i?Gt(e[t]):j,u)),r.set(t,n)),U(n)===j)?!1:i},set(e,t,n,s){var c=r.get(t),l=t in e;if(i&&t===`length`)for(var d=n;d<c.v;d+=1){var p=r.get(d+``);p===void 0?d in e&&(p=f(()=>It(j,u)),r.set(d+``,p)):Rt(p,j)}if(c===void 0)(!l||a(e,t)?.writable)&&(c=f(()=>It(void 0,u)),Rt(c,Gt(n)),r.set(t,c));else{l=c.v!==j;var m=f(()=>Gt(n));Rt(c,m)}var h=Reflect.getOwnPropertyDescriptor(e,t);if(h?.set&&h.set.call(s,n),!l){if(i&&typeof t==`string`){var g=r.get(`length`),_=Number(t);Number.isInteger(_)&&_>=g.v&&Rt(g,_+1)}Ut(o)}return!0},ownKeys(e){U(o);var t=Reflect.ownKeys(e).filter(e=>{var t=r.get(e);return t===void 0||t.v!==j});for(var[n,i]of r)i.v!==j&&!(n in e)&&t.push(n);return t},setPrototypeOf(){Ne()}})}function Kt(e){try{if(typeof e==`object`&&e&&T in e)return e[T]}catch{}return e}function qt(e,t){return Object.is(Kt(e),Kt(t))}var Jt,Yt,Xt,Zt;function Qt(){if(Jt===void 0){Jt=window,Yt=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;Xt=a(t,`firstChild`).get,Zt=a(t,`nextSibling`).get,u(e)&&(e[O]=void 0,e[se]=null,e[ce]=void 0,e.__e=void 0),u(n)&&(n[le]=void 0)}}function $t(e=``){return document.createTextNode(e)}function en(e){return Xt.call(e)}function tn(e){return Zt.call(e)}function nn(e,t){if(!N)return en(e);var n=en(F);if(n===null)n=F.appendChild($t());else if(t&&n.nodeType!==3){var r=$t();return n?.before(r),ge(r),r}return t&&un(n),ge(n),n}function rn(e,t=!1){if(!N){var n=en(e);return n instanceof Comment&&n.data===``?tn(n):n}if(t){if(F?.nodeType!==3){var r=$t();return F?.before(r),ge(r),r}un(F)}return F}function an(e,t=!1){if(!N)return en(e);var n=nn(e,t);return ve(e),n}function on(e,t=1,n=!1){let r=N?F:e;for(var i;t--;)i=r,r=tn(r);if(!N)return r;if(n){if(r?.nodeType!==3){var a=$t();return r===null?i?.after(a):r.before(a),ge(a),a}un(r)}return ge(r),r}function sn(e){e.textContent=``}function cn(){return!Ie||Tt!==null?!1:(H.f&S)!==0}function ln(e,t,n){return t==null||t===`http://www.w3.org/1999/xhtml`?n?document.createElement(e,{is:n}):document.createElement(e):n?document.createElementNS(t,e,{is:n}):document.createElementNS(t,e)}function un(e){if(e.nodeValue.length<65536)return;let t=e.nextSibling;for(;t!==null&&t.nodeType===3;)t.remove(),e.nodeValue+=t.nodeValue,t=e.nextSibling}function dn(e){var t=H;if(t===null)return V.f|=ae,e;if(!(t.f&32768)&&!(t.f&4))throw e;fn(e,t)}function fn(e,t){if(e===A)throw e;if(!(t!==null&&t.f&16384)){for(;t!==null;){if(t.f&128&&!(t.f&33570816)){if(!(t.f&32768))throw e;try{t.b.error(e);return}catch(t){e=t}}t=t.parent}throw e}}function pn(e){H===null&&(V===null&&ke(e),Oe()),Bn&&De(e)}function mn(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function hn(e,t){var n=H;n!==null&&n.f&8192&&(e|=b);var r={ctx:I,deps:null,nodes:null,f:e|v|512,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};R?.register_created_effect(r);var i=r;if(e&4)yt===null?Ct.ensure().schedule(r):yt.push(r);else if(t!==null){try{cr(r)}catch(e){throw B(r),e}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&!(i.f&524288)&&(i=i.first,e&16&&e&65536&&i!==null&&(i.f|=C))}if(i!==null&&(i.parent=n,n!==null&&mn(i,n),V!==null&&V.f&2&&!(e&64))){var a=V;(a.effects??=[]).push(i)}return r}function gn(){return V!==null&&!Hn}function _n(e){let t=hn(8,null);return L(t,_),t.teardown=e,t}function vn(e){pn(`$effect`);var t=H.f;if(!V&&t&32&&I!==null&&!I.i){var n=I;(n.e??=[]).push(e)}else return yn(e)}function yn(e){return hn(4|te,e)}function bn(e){return pn(`$effect.pre`),hn(8|te,e)}function xn(e){Ct.ensure();let t=hn(64|w,e);return(e={})=>new Promise(n=>{e.outro?Pn(t,()=>{B(t),n(void 0)}):(B(t),n(void 0))})}function Sn(e){return hn(4,e)}function Cn(e){return hn(ie|w,e)}function wn(e,t=0){return hn(8|t,e)}function Tn(e,t=[],n=[],r=[]){$e(r,t,n,t=>{hn(8,()=>{e(...t.map(U))})})}function En(e,t=0){return hn(16|t,e)}function Dn(e,t=0){return hn(g|t,e)}function On(e){return hn(32|w,e)}function kn(e){var t=e.teardown;if(t!==null){let n=Bn,r=V;Vn(!0),Un(null);try{t.call(null)}catch(t){fn(t,e.parent)}finally{Vn(n),Un(r)}}}function An(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){let e=n.ac;e!==null&&Qe(()=>{e.abort(de)});var r=n.next;n.f&64?n.parent=null:B(n,t),n=r}}function jn(e){for(var t=e.first;t!==null;){var n=t.next;t.f&32||B(t),t=n}}function B(e,t=!0){var n=!1;(t||e.f&262144)&&e.nodes!==null&&e.nodes.end!==null&&(Mn(e.nodes.start,e.nodes.end),n=!0),e.f|=ee,An(e,t&&!n),sr(e,0);var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)e.stop();kn(e),e.f^=ee,e.f|=x;var i=e.parent;i!==null&&i.first!==null&&Nn(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Mn(e,t){for(;e!==null;){var n=e===t?null:tn(e);e.remove(),e=n}}function Nn(e){var t=e.parent,n=e.prev,r=e.next;n!==null&&(n.next=r),r!==null&&(r.prev=n),t!==null&&(t.first===e&&(t.first=r),t.last===e&&(t.last=n))}function Pn(e,t,n=!0){var r=[];e.f|=256,Fn(e,r,!0);var i=()=>{n&&B(e),t&&t()},a=r.length;if(a>0){var o=()=>--a||i();for(var s of r)s.out(o)}else i()}function Fn(e,t,n){if(!(e.f&8192)){e.f^=b;var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)(e.is_global||n)&&t.push(e);for(var i=e.first;i!==null;){var a=i.next;if(!(i.f&64)){var o=!!(i.f&65536)||!!(i.f&32)&&!!(e.f&16);Fn(i,t,o?n:!1)}i=a}}}function In(e){e.f&=-257,Ln(e,!0)}function Ln(e,t){if(!(e.f&256)&&e.f&8192){e.f^=b,e.f&1024||(L(e,v),Ct.ensure().schedule(e));for(var n=e.first;n!==null;){var r=n.next,i=!!(n.f&65536)||!!(n.f&32);Ln(n,i?t:!1),n=r}var a=e.nodes&&e.nodes.t;if(a!==null)for(let e of a)(e.is_global||t)&&e.in()}}function Rn(e,t){if(e.nodes)for(var n=e.nodes.start,r=e.nodes.end;n!==null;){var i=n===r?null:tn(n);t.append(n),n=i}}var zn=null,Bn=!1;function Vn(e){Bn=e}var V=null,Hn=!1;function Un(e){V=e}var H=null;function Wn(e){H=e}var Gn=null;function Kn(e){V!==null&&(!Ie&&V.f&2097152||V.f&2)&&(Gn??=new Set).add(e)}var qn=null,Jn=0,Yn=null;function Xn(e){Yn=e}var Zn=1,Qn=0,$n=Qn;function er(e){$n=e}function tr(){return++Zn}function nr(e){var t=e.f;if(t&2048)return!0;if(t&4096){for(var n=e.deps,r=n.length,i=0;i<r;i++){var a=n[i];if(nr(a)&&ut(a),a.wv>e.wv)return!0}t&512&&z===null&&L(e,_)}return!1}function rr(e,t,n=!0){var r=e.reactions;if(r!==null&&(Ie||Gn===null||!Gn.has(e)))for(var i=0;i<r.length;i++){var a=r[i];a.f&2?rr(a,t,!1):t===a&&(n?L(a,v):a.f&1024&&L(a,y),kt(a))}}function ir(e){var t=qn,n=Jn,r=Yn,i=V,a=Gn,o=I,s=Hn,c=$n,l=e.f;qn=null,Jn=0,Yn=null,V=l&96?null:e,Gn=null,Re(e.ctx),Hn=!1,$n=++Qn,e.ac!==null&&(Qe(()=>{e.ac.abort(de)}),e.ac=null);try{e.f|=re;var u=e.fn,d=u();e.f|=S;var f=ar(e);if(He()&&Yn!==null&&!Hn&&f!==null&&!(e.f&6146))for(var p=0;p<Yn.length;p++)rr(Yn[p],e);if(i!==null&&i!==e){if(Qn++,i.deps!==null)for(let e=0;e<n;e+=1)i.deps[e].rv=Qn;if(t!==null)for(let e of t)e.rv=Qn;Yn!==null&&(r===null?r=Yn:r.push(...Yn))}return e.f&8388608&&(e.f^=ae),d}catch(t){return ar(e),dn(t)}finally{e.f^=re,qn=t,Jn=n,Yn=r,V=i,Gn=a,Re(o),Hn=s,$n=c}}function ar(e){var t=e.deps,n=R?.is_fork;if(qn!==null){var r;if(n||sr(e,Jn),t!==null&&Jn>0)for(t.length=Jn+qn.length,r=0;r<qn.length;r++)t[Jn+r]=qn[r];else e.deps=t=qn;if(gn()&&e.f&512)for(r=Jn;r<t.length;r++)(t[r].reactions??=[]).push(e)}else!n&&t!==null&&Jn<t.length&&(sr(e,Jn),t.length=Jn);return t}function or(e,r){let i=r.reactions;if(i!==null){var a=t.call(i,e);if(a!==-1){var o=i.length-1;o===0?i=r.reactions=null:(i[a]=i[o],i.pop())}}if(i===null&&r.f&2&&(qn===null||!n.call(qn,r))){var s=r;s.f&512&&(s.f^=512),s.v!==j&&qe(s),s.ac!==null&&Qe(()=>{s.ac.abort(de),s.ac=null,L(s,v)}),dt(s),sr(s,0)}}function sr(e,t){var n=e.deps;if(n!==null)for(var r=t;r<n.length;r++)or(e,n[r])}function cr(e){var t=e.f;if(!(t&16384)){L(e,_);var n=H;H=e;try{t&16777232?jn(e):An(e),kn(e);var r=ir(e);e.teardown=typeof r==`function`?r:null,e.wv=Zn}finally{H=n}}}function U(e){var t=!!(e.f&2);if(zn?.add(e),V!==null&&!Hn&&!(H!==null&&H.f&16384)&&(Gn===null||!Gn.has(e))){var r=V.deps;if(V.f&2097152)e.rv<Qn&&(e.rv=Qn,qn===null&&r!==null&&r[Jn]===e?Jn++:qn===null?qn=[e]:qn.push(e));else{V.deps??=[],n.call(V.deps,e)||V.deps.push(e);var i=e.reactions;i===null?e.reactions=[V]:n.call(i,V)||i.push(V)}}if(Bn&&Nt.has(e))return Nt.get(e);if(t){var a=e;if(Bn){var o=a.v;return(!(a.f&1024)&&a.reactions!==null||ur(a))&&(o=lt(a)),Nt.set(a,o),o}var s=!(a.f&512)&&!Hn&&V!==null&&!!(V.f&512),c=(a.f&S)===0;nr(a)&&(s&&(a.f|=512),ut(a)),s&&!c&&(ft(a),lr(a))}if(z?.has(e))return z.get(e);if(e.f&8388608)throw e.v;return e.v}function lr(e){if(e.f|=512,e.deps!==null)for(let r of e.deps){var t=r.reactions;t===null?r.reactions=[e]:n.call(t,e)||t.push(e),r.f&2&&!(r.f&512)&&(ft(r),lr(r))}}function ur(e){if(e.v===j)return!0;if(e.deps===null)return!1;for(let t of e.deps)if(Nt.has(t)||t.f&2&&ur(t))return!0;return!1}function dr(e){var t=Hn;try{return Hn=!0,e()}finally{Hn=t}}function fr(e){return e.endsWith(`capture`)&&e!==`gotpointercapture`&&e!==`lostpointercapture`}var pr=[`beforeinput`,`click`,`change`,`dblclick`,`contextmenu`,`focusin`,`focusout`,`input`,`keydown`,`keyup`,`mousedown`,`mousemove`,`mouseout`,`mouseover`,`mouseup`,`pointerdown`,`pointermove`,`pointerout`,`pointerover`,`pointerup`,`touchend`,`touchmove`,`touchstart`];function mr(e){return pr.includes(e)}var hr=`allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback`.split(`.`),gr={formnovalidate:`formNoValidate`,ismap:`isMap`,nomodule:`noModule`,playsinline:`playsInline`,readonly:`readOnly`,defaultvalue:`defaultValue`,defaultchecked:`defaultChecked`,srcobject:`srcObject`,novalidate:`noValidate`,allowfullscreen:`allowFullscreen`,disablepictureinpicture:`disablePictureInPicture`,disableremoteplayback:`disableRemotePlayback`};function _r(e){return e=e.toLowerCase(),gr[e]??e}[...hr];var vr=[`touchstart`,`touchmove`];function yr(e){return vr.includes(e)}var br=Symbol(`events`),xr=new Set,Sr=new Set;function Cr(e,t,n,r={}){function i(e){if(r.capture||Ar.call(t,e),!e.cancelBubble)return Qe(()=>n?.call(this,e))}return e.startsWith(`pointer`)||e.startsWith(`touch`)||e===`wheel`?(i.__removed=!1,Ge(()=>{i.__removed||t.addEventListener(e,i,r)})):t.addEventListener(e,i,r),i}function wr(e,t,n,r={}){var i=Cr(t,e,n,r);return()=>{i.__removed=!0,e.removeEventListener(t,i,r)}}function Tr(e,t,n,r,i){var a={capture:r,passive:i},o=Cr(e,t,n,a);(t===document.body||t===window||t===document||t instanceof HTMLMediaElement)&&_n(()=>{o.__removed=!0,t.removeEventListener(e,o,a)})}function Er(e,t,n){(t[br]??={})[e]=n}function Dr(e){for(var t=0;t<e.length;t++)xr.add(e[t]);for(var n of Sr)n(e)}var Or=null,kr=!1;function Ar(e){var t=this,n=t.ownerDocument,r=e.type,a=e.composedPath?.()||[],o=a[0]||e.target;Or=e,kr||(kr=!0,setTimeout(()=>{kr=!1,Or=null}));var s=0,c=Or===e&&e[br];if(c){var l=a.indexOf(c);if(l!==-1&&(t===document||t===window)){e[br]=t;return}var u=a.indexOf(t);if(u===-1)return;l<=u&&(s=l)}if(o=a[s]||e.target,o!==t){i(e,`currentTarget`,{configurable:!0,get(){return o||n}});var d=V,f=H;Un(null),Wn(null);try{for(var p,m=[];o!==null&&o!==t;){try{var h=o[br]?.[r];h!=null&&(!o.disabled||e.target===o)&&h.call(o,e)}catch(e){p?m.push(e):p=e}if(e.cancelBubble)break;s++,o=s<a.length?a[s]:null}if(p){for(let e of m)queueMicrotask(()=>{throw e});throw p}}finally{e[br]=t,delete e.currentTarget,Un(d),Wn(f)}}}var jr=globalThis?.window?.trustedTypes&&globalThis.window.trustedTypes.createPolicy(`svelte-trusted-html`,{createHTML:e=>e});function Mr(e){return jr?.createHTML(e)??e}function Nr(e){var t=ln(`template`);return t.innerHTML=Mr(e.replaceAll(`<!>`,`<!---->`)),t.content}function Pr(e,t){var n=H;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function Fr(e,t){var n=!!(t&1),r=!!(t&2),i,a=!e.startsWith(`<!>`);return()=>{if(N)return Pr(F,null),F;i===void 0&&(i=Nr(a?e:`<!>`+e),n||(i=en(i)));var t=r||Yt?document.importNode(i,!0):i.cloneNode(!0);if(n){var o=en(t),s=t.lastChild;Pr(o,s)}else Pr(t,t);return t}}function Ir(e,t,n=`svg`){var r=!e.startsWith(`<!>`),i=!!(t&1),a=`<${n}>${r?e:`<!>`+e}</${n}>`,o;return()=>{if(N)return Pr(F,null),F;if(!o){var e=en(Nr(a));if(i)for(o=document.createDocumentFragment();en(e);)o.appendChild(en(e));else o=en(e)}var t=o.cloneNode(!0);if(i){var n=en(t),r=t.lastChild;Pr(n,r)}else Pr(t,t);return t}}function Lr(e,t){return Ir(e,t,`svg`)}function Rr(e=``){if(!N){var t=$t(e+``);return Pr(t,t),t}var n=F;return n.nodeType===3?un(n):(n.before(n=$t()),ge(n)),Pr(n,n),n}function zr(){if(N)return Pr(F,null),F;var e=document.createDocumentFragment(),t=document.createComment(``),n=$t();return e.append(t,n),Pr(t,n),e}function Br(e,t){if(N){var n=H;(!(n.f&32768)||n.nodes.end===null)&&(n.nodes.end=F),_e();return}e!==null&&e.before(t)}function Vr(){if(N&&F&&F.nodeType===8&&F.textContent?.startsWith(`$`)){let e=F.textContent.substring(1);return _e(),e}return(window.__svelte??={}).uid??=1,`c${window.__svelte.uid++}`}function Hr(e){let t=0,n=Ft(0),r;return()=>{gn()&&(U(n),wn(()=>(t===0&&(r=dr(()=>e(()=>Ut(n)))),t+=1,()=>{Ge(()=>{--t,t===0&&(r?.(),r=void 0,Ut(n))})})))}}var Ur=C|w;function Wr(e,t,n,r){new Gr(e,t,n,r)}var Gr=class{parent;is_pending=!1;transform_error;#e;#t=N?F:null;#n;#r;#i;#a=null;#o=null;#s=null;#c=null;#l=0;#u=0;#d=!1;#f=new Set;#p=new Set;#m=null;#h=Hr(()=>(this.#m=Ft(this.#l),()=>{this.#m=null}));constructor(e,t,n,r){this.#e=e,this.#n=t,this.#r=e=>{var t=H;t.b=this,t.f|=128,n(e)},this.parent=H.b,this.transform_error=r??this.parent?.transform_error??(e=>e),this.#i=En(()=>{if(N){let e=xe(this.#t);_e();let t=e===`[!`;if(e.startsWith(`[?`)){let t=JSON.parse(e.slice(2));this.#_(t)}else t?this.#b():this.#g()}else this.#x()},Ur),N&&(this.#e=F)}#g(){try{this.#a=On(()=>this.#r(this.#e))}catch(e){this.error(e)}}#_(e){let t=this.#n.failed,{reset:n,invoke_onerror:r}=this.#v(e);Ge(r),t&&(this.#s=On(()=>{t(this.#e,()=>e,()=>n)}))}#v(e){var t=!1,n=!1;let r=()=>{if(!this.#y()){if(t){he();return}t=!0,n&&Fe(),this.#s!==null&&Pn(this.#s,()=>{this.#s=null}),this.#C(()=>{this.#x()})}};return{reset:r,invoke_onerror:()=>{if(!this.#y())try{n=!0,this.#n.onerror?.(e,r),n=!1}catch(e){fn(e,this.#i&&this.#i.parent)}}}}#y(){return(this.#i.f&(x|ee))!==0}#b(){let e=this.#n.pending;e&&(this.is_pending=!0,this.#o=On(()=>e(this.#e)),Ge(()=>{if(!this.#y()){var e=this.#c=document.createDocumentFragment(),t=$t(),n=!1;if(e.append(t),this.#a=this.#C(()=>{try{return On(()=>this.#r(t))}catch(e){try{this.error(e),n=!0}catch(e){fn(e,this.#i.parent)}return null}}),this.#a===null){this.#c=null,n&&this.#S(R);return}this.#u===0&&(this.#e.before(e),this.#c=null,Pn(this.#o,()=>{this.#o=null}),this.#S(R))}}))}#x(){try{if(this.is_pending=this.has_pending_snippet(),this.#u=0,this.#l=0,this.#a=On(()=>{this.#r(this.#e)}),this.#u>0){var e=this.#c=document.createDocumentFragment();Rn(this.#a,e);let t=this.#n.pending;this.#o=On(()=>t(this.#e))}else this.#S(R)}catch(e){this.error(e)}}#S(e){this.is_pending=!1,e.transfer_effects(this.#f,this.#p)}defer_effect(e){Je(e,this.#f,this.#p)}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!this.#n.pending}#C(e){var t=H,n=V,r=I;Wn(this.#i),Un(this.#i),Re(this.#i.ctx);try{return Ct.ensure(),e()}finally{Wn(t),Un(n),Re(r)}}#w(e,t){if(!this.has_pending_snippet()){this.parent&&this.parent.#w(e,t);return}this.#u+=e,this.#u===0&&(this.#S(t),this.#o&&Pn(this.#o,()=>{this.#o=null}),this.#c&&=(this.#e.before(this.#c),null))}update_pending_count(e,t){this.#w(e,t),this.#l+=e,!(!this.#m||this.#d)&&(this.#d=!0,Ge(()=>{this.#d=!1,this.#m&&Vt(this.#m,this.#l)}))}get_effect_pending(){return this.#h(),U(this.#m)}error(e){if(e===A||!this.#n.onerror&&!this.#n.failed)throw e;R?.is_fork?(this.#a&&R.skip_effect(this.#a),this.#o&&R.skip_effect(this.#o),this.#s&&R.skip_effect(this.#s),R.oncommit(()=>{this.#y()||this.#T(e)})):this.#T(e)}#T(e){this.#a&&=(B(this.#a),null),this.#o&&=(B(this.#o),null),this.#s&&=(B(this.#s),null),N&&(ge(this.#t),ye(),ge(be()));let t=this.#n.failed,n=e=>{if(this.#y())return;let{reset:n,invoke_onerror:r}=this.#v(e);r(),t&&!this.#y()&&(this.#s=this.#C(()=>{try{return On(()=>{var r=H;r.b=this,r.f|=128,t(this.#e,()=>e,()=>n)})}catch(e){return fn(e,this.#i.parent),null}}))};Ge(()=>{if(!this.#y()){var t;try{t=this.transform_error(e)}catch(e){fn(e,this.#i&&this.#i.parent);return}typeof t==`object`&&t&&typeof t.then==`function`?t.then(n,e=>fn(e,this.#i&&this.#i.parent)):n(t)}})}},Kr=!0;function qr(e,t){var n=t==null?``:typeof t==`object`?`${t}`:t;n!==(e[le]??=e.nodeValue)&&(e[le]=n,e.nodeValue=`${n}`)}function Jr(e,t){return Xr(e,t)}var Yr=new Map;function Xr(e,{target:t,anchor:n,props:i={},events:a,context:o,intro:s=!0,transformError:c}){Qt();var l=void 0,u=xn(()=>{var u=n??t.appendChild($t());Wr(u,{pending:()=>{}},t=>{ze({});var n=I;if(o&&(n.c=o),a&&(i.$$events=a),N&&Pr(t,null),Kr=s,l=e(t,i)||Ve(),Kr=!0,N&&(H.nodes.end=F,F===null||F.nodeType!==8||F.data!==`]`))throw pe(),A;Be()},c);var d=new Set,f=e=>{for(var n=0;n<e.length;n++){var r=e[n];if(!d.has(r)){d.add(r);var i=yr(r);for(let e of[t,document]){var a=Yr.get(e);a===void 0&&(a=new Map,Yr.set(e,a));var o=a.get(r);o===void 0?(e.addEventListener(r,Ar,{passive:i}),a.set(r,1)):a.set(r,o+1)}}}};return f(r(xr)),Sr.add(f),()=>{for(var e of d)for(let n of[t,document]){var r=Yr.get(n),i=r.get(e);--i==0?(n.removeEventListener(e,Ar),r.delete(e),r.size===0&&Yr.delete(n)):r.set(e,i)}Sr.delete(f),u!==n&&u.parentNode?.removeChild(u)}});return Zr.set(l,u),l}var Zr=new WeakMap,Qr=class{anchor;#e=new Map;#t=new Map;#n=new Map;#r=new Set;#i=!0;constructor(e,t=!0){this.anchor=e,this.#i=t}#a=e=>{if(this.#e.has(e)){var t=this.#e.get(e),n=this.#t.get(t);if(n)In(n),this.#r.delete(t);else{var r=this.#n.get(t);r&&(In(r.effect),this.#t.set(t,r.effect),this.#n.delete(t),r.fragment.lastChild.remove(),this.anchor.before(r.fragment),n=r.effect)}for(let[t,n]of this.#e){if(this.#e.delete(t),t===e)break;let r=this.#n.get(n);r&&(B(r.effect),this.#n.delete(n))}for(let[e,r]of this.#t){if(e===t||this.#r.has(e))continue;let i=()=>{if(Array.from(this.#e.values()).includes(e)){var t=document.createDocumentFragment();Rn(r,t),t.append($t()),this.#n.set(e,{effect:r,fragment:t})}else B(r);this.#r.delete(e),this.#t.delete(e)};this.#i||!n?(this.#r.add(e),Pn(r,i,!1)):i()}}};#o=e=>{this.#e.delete(e);let t=Array.from(this.#e.values());for(let[e,n]of this.#n)t.includes(e)||(B(n.effect),this.#n.delete(e))};ensure(e,t){var n=R,r=cn();if(t&&!this.#t.has(e)&&!this.#n.has(e)){if(r){var i=document.createDocumentFragment(),a=$t();i.append(a),this.#n.set(e,{effect:On(()=>t(a)),fragment:i})}else this.#t.set(e,On(()=>t(this.anchor)))}if(this.#e.set(n,e),r){for(let[t,r]of this.#t)t===e?n.unskip_effect(r):n.skip_effect(r);for(let[t,r]of this.#n)t===e?n.unskip_effect(r.effect):n.skip_effect(r.effect);n.oncommit(this.#a),n.ondiscard(this.#o)}else N&&(this.anchor=F),this.#a(n)}};function $r(e,t,n=!1){var r;N&&(r=F,_e());var i=new Qr(e),a=n?C:0;function o(e,t){if(N){var n=xe(r);if(e!==parseInt(n.substring(1))){var a=be();ge(a),i.anchor=a,P(!1),i.ensure(e,t),P(!0);return}}i.ensure(e,t)}En(()=>{var e=!1;t((t,n=0)=>{e=!0,o(n,t)}),e||o(-1,null)},a)}var ei=Symbol(`NaN`);function ti(e,t,n){N&&_e();var r=new Qr(e),i=!He();En(()=>{var e=t();e!==e&&(e=ei),i&&typeof e==`object`&&e&&(e={}),r.ensure(e,n)})}function ni(e,t){return t}function ri(e,t,n){for(var i=[],a=t.length,o,s=t.length,c=0;c<a;c++){let n=t[c];Pn(n,()=>{if(o){if(o.pending.delete(n),o.done.add(n),o.pending.size===0){var t=e.outrogroups;ii(e,r(o.done)),t.delete(o),t.size===0&&(e.outrogroups=null)}}else--s},!1)}if(s===0){var l=i.length===0&&n!==null&&e.pending.size===0;if(l){var u=n,d=u.parentNode;sn(d),d.append(u),e.items.clear()}ii(e,t,!l)}else o={pending:new Set(t),done:new Set},(e.outrogroups??=new Set).add(o)}function ii(e,t,n=!0){var r;if(e.pending.size>0){r=new Set;for(let t of e.pending.values())for(let n of t)r.add(e.items.get(n).e)}for(var i=0;i<t.length;i++){var a=t[i];r?.has(a)?(a.f|=ne,Rn(a,document.createDocumentFragment())):B(t[i],n)}}var ai;function oi(t,n,i,a,o,s=null){var c=t,l=new Map;if(n&4){var u=t;c=N?ge(en(u)):u.appendChild($t())}N&&_e();var d=null,f=st(()=>{var t=i();return e(t)?t:t==null?[]:r(t)}),p=new Map,m=!0;function h(e){if(!(_.effect.f&16384)){_.pending.delete(e);var t=U(f);_.fallback=d,ci(_,t,c,n,a),d!==null&&(t.length===0?d.f&33554432?(d.f^=ne,ui(d,null,c)):In(d):Pn(d,()=>{d=null}))}}function g(e){_.pending.delete(e)}var _={effect:En(()=>{var e=U(f),t=e.length;let r=!1;N&&xe(c)===`[!`!=(t===0)&&(c=be(),ge(c),P(!1),r=!0);for(var u=new Set,_=R,v=cn(),y=0;y<t;y+=1){N&&F.nodeType===8&&F.data===`]`&&(c=F,r=!0,P(!1));var b=e[y],x=a(b,y),S=m?null:l.get(x);S?(S.v&&Vt(S.v,b),S.i&&Vt(S.i,y),v&&_.unskip_effect(S.e)):(S=li(l,m?c:ai??=$t(),b,x,y,o,n,i),m||(S.e.f|=ne),l.set(x,S)),u.add(x)}if(t===0&&s&&!d&&(m?d=On(()=>s(c)):(d=On(()=>s(ai??=$t())),d.f|=ne)),t>u.size&&Ee(``,``,``),N&&t>0&&ge(be()),!m){if(p.set(_,u),v){for(let[e,t]of l)u.has(e)||_.skip_effect(t.e);_.oncommit(h),_.ondiscard(g)}else h(_)}r&&P(!0),U(f)}),flags:n,items:l,pending:p,outrogroups:null,fallback:d};m=!1,N&&(c=F)}function si(e){for(;e!==null&&!(e.f&32);)e=e.next;return e}function ci(e,t,n,i,a){var o=!!(i&8),s=t.length,c=e.items,l=si(e.effect.first),u,d=null,f,p=[],m=[],h,g,_,v;if(o)for(v=0;v<s;v+=1)h=t[v],g=a(h,v),_=c.get(g).e,_.f&33554432||(_.nodes?.a?.measure(),(f??=new Set).add(_));for(v=0;v<s;v+=1){if(h=t[v],g=a(h,v),_=c.get(g).e,e.outrogroups!==null)for(let t of e.outrogroups)t.pending.delete(_),t.done.delete(_);if(_.f&8192&&(In(_),o&&(_.nodes?.a?.unfix(),(f??=new Set).delete(_))),_.f&33554432){if(_.f^=ne,_===l)ui(_,null,n);else{var y=d?d.next:l;_===e.effect.last&&(e.effect.last=_.prev),_.prev&&(_.prev.next=_.next),_.next&&(_.next.prev=_.prev),di(e,d,_),di(e,_,y),ui(_,y,n),d=_,p=[],m=[],l=si(d.next);continue}}if(_!==l){if(u!==void 0&&u.has(_)){if(p.length<m.length){var b=m[0],x;d=b.prev;var S=p[0],ee=p[p.length-1];for(x=0;x<p.length;x+=1)ui(p[x],b,n);for(x=0;x<m.length;x+=1)u.delete(m[x]);di(e,S.prev,ee.next),di(e,d,S),di(e,ee,b),l=b,d=ee,--v,p=[],m=[]}else u.delete(_),ui(_,l,n),di(e,_.prev,_.next),di(e,_,d===null?e.effect.first:d.next),di(e,d,_),d=_;continue}for(p=[],m=[];l!==null&&l!==_;)(u??=new Set).add(l),m.push(l),l=si(l.next);if(l===null)continue}_.f&33554432||p.push(_),d=_,l=si(_.next)}if(e.outrogroups!==null){for(let t of e.outrogroups)t.pending.size===0&&(ii(e,r(t.done)),e.outrogroups?.delete(t));e.outrogroups.size===0&&(e.outrogroups=null)}if(l!==null||u!==void 0){var C=[];if(u!==void 0)for(_ of u)_.f&8192||C.push(_);for(;l!==null;)!(l.f&8192)&&l!==e.fallback&&C.push(l),l=si(l.next);var w=C.length;if(w>0){var te=i&4&&s===0?n:null;if(o){for(v=0;v<w;v+=1)C[v].nodes?.a?.measure();for(v=0;v<w;v+=1)C[v].nodes?.a?.fix()}ri(e,C,te)}}o&&Ge(()=>{if(f!==void 0)for(_ of f)_.nodes?.a?.apply()})}function li(e,t,n,r,i,a,o,s){var c=o&1?o&16?Ft(n):Lt(n,!1,!1):null,l=o&2?Ft(i):null;return{v:c,i:l,e:On(()=>(a(t,c??n,l??i,s),()=>{e.delete(r)}))}}function ui(e,t,n){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,a=t&&!(t.f&33554432)?t.nodes.start:n;r!==null;){var o=tn(r);if(a.before(r),r===i)return;r=o}}function di(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}function fi(e,t,...n){var r=new Qr(e);En(()=>{let e=t()??null;r.ensure(e,e&&(t=>e(t,...n)))},C)}function pi(e,t,n){var r;N&&(r=F,_e());var i=new Qr(e);En(()=>{var e=t()??null;if(N&&xe(r)===`[`!=(e!==null)){var a=be();ge(a),i.anchor=a,P(!1),i.ensure(e,e&&(t=>n(t,e))),P(!0);return}i.ensure(e,e&&(t=>n(t,e)))},C)}var mi=()=>performance.now(),hi={tick:e=>requestAnimationFrame(e),now:()=>mi(),tasks:new Set};function gi(){let e=hi.now();hi.tasks.forEach(t=>{t.c(e)||(hi.tasks.delete(t),t.f())}),hi.tasks.size!==0&&hi.tick(gi)}function _i(e){let t;return hi.tasks.size===0&&hi.tick(gi),{promise:new Promise(n=>{hi.tasks.add(t={c:e,f:n})}),abort(){hi.tasks.delete(t)}}}function vi(e,t){Qe(()=>{e.dispatchEvent(new CustomEvent(t))})}function yi(e){if(e===`float`)return`cssFloat`;if(e===`offset`)return`cssOffset`;if(e.startsWith(`--`))return e;let t=e.split(`-`);return t.length===1?t[0]:t[0]+t.slice(1).map(e=>e[0].toUpperCase()+e.slice(1)).join(``)}function bi(e){let t={},n=e.split(`;`);for(let e of n){let[n,r]=e.split(`:`);if(!n||r===void 0)break;let i=yi(n.trim());t[i]=r.trim()}return t}var xi=e=>e;function Si(e,t,n,r){var i=!!(e&1),a=!!(e&2),o=i&&a,s=!!(e&4),c=o?`both`:i?`in`:`out`,l,u=t.inert,d=t.style.overflow,f,p;function m(){return Qe(()=>l??=n()(t,r?.()??{},{direction:c}))}var h={is_global:s,in(){if(t.inert=u,!i){p?.abort(),p?.reset?.();return}a||f?.abort(),f=Ci(t,m(),p,1,()=>{vi(t,`introstart`)},()=>{vi(t,`introend`),f?.abort(),f=l=void 0,t.style.overflow=d})},out(e){if(!a){e?.(),l=void 0;return}t.inert=!0,p=Ci(t,m(),f,0,()=>{vi(t,`outrostart`)},()=>{vi(t,`outroend`),e?.()})},stop:()=>{f?.abort(),p?.abort()}},g=H;if((g.nodes.t??=[]).push(h),i&&Kr){var _=s;if(!_){for(var v=g.parent;v&&v.f&65536;)for(;(v=v.parent)&&!(v.f&16););_=!v||!!(v.f&32768)}_&&Sn(()=>{dr(()=>h.in())})}}function Ci(e,t,n,r,i,a){var o=r===1,s=!1;if(d(t)){var c;return Ge(()=>{s||(c=Ci(e,t({direction:o?`in`:`out`}),n,r,i,a))}),{abort:()=>{s=!0,c?.abort()},deactivate:()=>c?.deactivate(),reset:()=>c?.reset(),t:()=>c?.t()??1-r}}if(n?.deactivate(),!t?.duration&&!t?.delay)return i(),a(),{abort:f,deactivate:f,reset:f,t:()=>r};let{delay:l=0,css:u,tick:p,easing:m=xi}=t;var h,g=()=>1-r;return Ge(()=>{if(!s){var c=[];if(o&&n===void 0&&(p&&p(0,1),u)){var d=bi(u(0,1));c.push(d,d)}h=e.animate(c,{duration:l,fill:`forwards`}),h.onfinish=()=>{h.cancel(),i();var o=n?.t()??1-r;n?.abort();var s=r-o,c=t.duration*Math.abs(s),l=[];if(c>0){var d=!1;if(u)for(var f=Math.ceil(c/(1e3/60)),_=0;_<=f;_+=1){var v=o+s*m(_/f),y=bi(u(v,1-v));l.push(y),d||=y.overflow===`hidden`}d&&(e.style.overflow=`hidden`),g=()=>{var e=h.currentTime;return o+s*m(e/c)},p&&_i(()=>{if(h.playState!==`running`)return!1;var e=g();return p(e,1-e),!0})}h=e.animate(l,{duration:c,fill:`forwards`}),h.onfinish=()=>{g=()=>r,p?.(r,1-r),a()}}}}),{abort:()=>{s=!0,h&&(h.cancel(),h.effect=null,h.onfinish=f)},deactivate:()=>{a=f},reset:()=>{r===0&&p?.(1,0)},t:()=>g()}}function wi(e,t){var n=void 0,r;Dn(()=>{n!==(n=t())&&(r&&=(B(r),null),n&&(r=On(()=>{Sn(()=>n(e))})))})}function Ti(e){var t,n,r=``;if(typeof e==`string`||typeof e==`number`)r+=e;else if(typeof e==`object`){if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(n=Ti(e[t]))&&(r&&(r+=` `),r+=n)}else for(n in e)e[n]&&(r&&(r+=` `),r+=n)}return r}function Ei(){for(var e,t,n=0,r=``,i=arguments.length;n<i;n++)(e=arguments[n])&&(t=Ti(e))&&(r&&(r+=` `),r+=t);return r}function Di(e){return typeof e==`object`?Ei(e):e??``}var Oi=[...` 	
\r\f\xA0\v﻿`];function ki(e,t,n){var r=e==null?``:``+e;if(t&&(r=r?r+` `+t:t),n){for(var i of Object.keys(n))if(n[i])r=r?r+` `+i:i;else if(r.length)for(var a=i.length,o=0;(o=r.indexOf(i,o))>=0;){var s=o+a;(o===0||Oi.includes(r[o-1]))&&(s===r.length||Oi.includes(r[s]))?r=(o===0?``:r.substring(0,o))+r.substring(s+1):o=s}}return r===``?null:r}function Ai(e,t=!1){var n=t?` !important;`:`;`,r=``;for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==``&&(r+=` `+i+`: `+a+n)}return r}function ji(e){return e[0]!==`-`||e[1]!==`-`?e.toLowerCase():e}function Mi(e,t){if(t){var n=``,r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\/\*.*?\*\//g,``).trim();var a=!1,o=0,s=!1,c=[];r&&c.push(...Object.keys(r).map(ji)),i&&c.push(...Object.keys(i).map(ji));var l=0,u=-1;let t=e.length;for(var d=0;d<t;d++){var f=e[d];if(s?f===`/`&&e[d-1]===`*`&&(s=!1):a?a===f&&(a=!1):f===`/`&&e[d+1]===`*`?s=!0:f===`"`||f===`'`?a=f:f===`(`?o++:f===`)`&&o--,!s&&a===!1&&o===0){if(f===`:`&&u===-1)u=d;else if(f===`;`||d===t-1){if(u!==-1){var p=ji(e.substring(l,u).trim());if(!c.includes(p)){f!==`;`&&d++;var m=e.substring(l,d).trim();n+=` `+m+`;`}}l=d+1,u=-1}}}}return r&&(n+=Ai(r)),i&&(n+=Ai(i,!0)),n=n.trim(),n===``?null:n}return e==null?null:String(e)}function Ni(e,t,n,r,i,a){var o=e[O];if(N||o!==n||o===void 0){var s=ki(n,r,a);(!N||s!==e.getAttribute(`class`))&&(s==null?e.removeAttribute(`class`):t?e.className=s:e.setAttribute(`class`,s)),e[O]=n}else if(a&&i!==a)for(var c in a){var l=!!a[c];(i==null||l!==!!i[c])&&e.classList.toggle(c,l)}return a}function Pi(e,t={},n,r){for(var i in n){var a=n[i];t[i]!==a&&(n[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,r))}}function Fi(e,t,n,r){var i=e[ce];if(N||i!==t){var a=Mi(t,r);(!N||a!==e.getAttribute(`style`))&&(a==null?e.removeAttribute(`style`):e.style.cssText=a),e[ce]=t}else r&&(Array.isArray(r)?(Pi(e,n?.[0],r[0]),Pi(e,n?.[1],r[1],`important`)):Pi(e,n,r));return r}function Ii(e,t){t?e.hasAttribute(`selected`)||e.setAttribute(`selected`,``):e.removeAttribute(`selected`)}function Li(e,t){var n=!(`__defaultValue`in e);(n||e.__defaultValue!==t)&&(e.__defaultValue=t,Ri(e,!n||`__value`in e))}function Ri(t,n){var r=t.__defaultValue,i=t.multiple,a=i?r??[]:null;if(!i||e(a)){var o=t.selectedIndex,s=n&&i?new Set(t.selectedOptions):null;for(var c of t.options){var l=Vi(c);Ii(c,i?a.includes(l):qt(l,r))}if(n){if(s!==null)for(c of t.options){var u=s.has(c);c.selected!==u&&(c.selected=u)}else t.selectedIndex!==o&&(t.selectedIndex=o)}}}function zi(t,n,r=!1){if(t.multiple){if(n==null)return;if(!e(n))return me();for(var i of t.options)i.selected=n.includes(Vi(i));return}for(i of t.options)if(qt(Vi(i),n)){i.selected=!0;return}(!r||n!==void 0)&&(t.selectedIndex=-1)}function Bi(e){var t=new MutationObserver(t=>{t.every(Hi)||(`__defaultValue`in e&&Ri(e,!1),`__value`in e&&zi(e,e.__value))});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`value`]}),_n(()=>{t.disconnect()})}function Vi(e){return`__value`in e?e.__value:e.value}function Hi(e){if(e.target.closest(`selectedcontent`)!==null)return!0;if(e.type===`childList`){var t=[...e.addedNodes,...e.removedNodes];return t.length>0&&t.every(e=>e.nodeName===`SELECTEDCONTENT`)}return!1}var Ui=Symbol(`class`),Wi=Symbol(`style`),Gi=Symbol(`is custom element`),Ki=Symbol(`is html`),qi=k?`link`:`LINK`,Ji=k?`input`:`INPUT`,Yi=k?`option`:`OPTION`,Xi=k?`select`:`SELECT`,Zi=k?`progress`:`PROGRESS`;function Qi(e){if(N){var t=!1,n=()=>{if(!t){if(t=!0,e.hasAttribute(`value`)){var n=e.value;$i(e,`value`,null),e.value=n}if(e.hasAttribute(`checked`)){var r=e.checked;$i(e,`checked`,null),e.checked=r}}};e[ue]=n,Ge(n),Ze()}}function $i(e,t,n,r){var i=na(e);N&&(i[t]=e.getAttribute(t),t===`src`||t===`srcset`||t===`href`&&e.nodeName===qi)||i[t]!==(i[t]=n)&&(t===`loading`&&(e[oe]=n),n==null?e.removeAttribute(t):typeof n!=`string`&&ia(e).has(t)?e[t]=n:e.setAttribute(t,n))}function ea(e,t,n,r,i=!1,a=!1){N&&i&&e.nodeName===Ji&&(`defaultValue`in n||`defaultChecked`in n||Qi(e));var o=na(e),s=o[Gi],c=!o[Ki];let l=N&&s;l&&P(!1);var u=t||{},d=e.nodeName===Yi,f=e.nodeName===Xi;try{for(var p in t)!(p in n)&&p[0]+p[1]!==`$$`&&(n[p]=null);n.class?n.class=Di(n.class):(r||n[Ui])&&(n.class=null),n[Wi]&&(n.style??=null);var m=ia(e);if(e.nodeName===Ji&&`type`in n&&(`value`in n||`__value`in n)){var h=n.type;(h!==u.type||h===void 0&&e.hasAttribute(`type`))&&(u.type=h,$i(e,`type`,h,a))}for(let i in n){let l=n[i];if(d&&i===`value`&&l==null){e.value=e.__value=``,u[i]=l;continue}if(i===`class`){Ni(e,e.namespaceURI===`http://www.w3.org/1999/xhtml`,l,r,t?.[Ui],n[Ui]),u[i]=l,u[Ui]=n[Ui];continue}if(i===`style`){Fi(e,l,t?.[Wi],n[Wi]),u[i]=l,u[Wi]=n[Wi];continue}var g=u[i];if(l!==g||l===void 0&&e.hasAttribute(i)){u[i]=l;var _=i[0]+i[1];if(_!==`$$`){if(_===`on`){let t={},n=`$$`+i,r=i.slice(2);var v=mr(r);if(fr(r)&&(r=r.slice(0,-7),t.capture=!0),!v&&g){if(l!=null)continue;e.removeEventListener(r,u[n],t),u[n]=null}if(v)Er(r,e,l),Dr([r]);else if(l!=null){function a(e){u[i].call(this,e)}u[n]=Cr(r,e,a,t)}}else if(i===`style`)$i(e,i,l);else if(i===`autofocus`)Ye(e,!!l);else if(!s&&(i===`__value`||i===`value`&&l!=null))e.__value=l,(g==null||e.value!==l||l===0&&e.nodeName===Zi)&&(e.value=l);else if(i===`selected`&&d)Ii(e,l);else{var y=i;c||(y=_r(y));var b=y===`defaultValue`||y===`defaultChecked`;if(f&&y===`defaultValue`)continue;if(l==null&&!s&&!b){if(o[i]=null,y===`value`||y===`checked`){let n=e,r=t===void 0;if(y===`value`){let e=n.defaultValue;n.removeAttribute(y),n.defaultValue=e,n.value=n.__value=r?e:null}else{let e=n.defaultChecked;n.removeAttribute(y),n.defaultChecked=e,n.checked=r?e:!1}}else e.removeAttribute(i)}else b||(s||typeof l!=`string`)&&m.has(y)?(e[y]=l,y in o&&(o[y]=j)):typeof l!=`function`&&$i(e,y,l,a)}}}}}finally{l&&P(!0)}return u}function ta(e,t,n=[],r=[],i=[],a,o=!1,s=!1){$e(i,n,r,n=>{var r=void 0,i={},c=e.nodeName===Xi,l=!1;if(Dn(()=>{var u=t(...n.map(U)),d=ea(e,r,u,a,o,s);if(l&&c){var f=e;`defaultValue`in u&&Li(f,u.defaultValue),`value`in u&&zi(f,u.value)}for(let e of Object.getOwnPropertySymbols(i))u[e]||B(i[e]);for(let t of Object.getOwnPropertySymbols(u)){var p=u[t];t.description===`@attach`&&(!r||p!==r[t])&&(i[t]&&B(i[t]),i[t]=On(()=>wi(e,()=>p))),d[t]=p}r=d}),c){var u=e;Sn(()=>{var e=r;`defaultValue`in e&&Li(u,e.defaultValue),zi(u,e.value,!0),Bi(u)})}l=!0})}function na(e){return e[se]??={[Gi]:e.nodeName.includes(`-`),[Ki]:e.namespaceURI===fe}}var ra=new Map;function ia(e){var t=e.getAttribute(`is`)||e.nodeName,n=ra.get(t);if(n)return n;ra.set(t,n=new Set);for(var r,i=e,a=Element.prototype;a!==i;){for(var s in r=o(i),r)r[s].set&&s!==`innerHTML`&&s!==`textContent`&&s!==`innerText`&&n.add(s);i=l(i)}return n}var aa=new class e{#e=new WeakMap;#t;#n;static entries=new WeakMap;constructor(e){this.#n=e}observe(e,t){var n=this.#e.get(e)||new Set;return n.add(t),this.#e.set(e,n),this.#r().observe(e,this.#n),()=>{var n=this.#e.get(e);n.delete(t),n.size===0&&(this.#e.delete(e),this.#t.unobserve(e))}}#r(){return this.#t??=new ResizeObserver(t=>{for(var n of t){e.entries.set(n.target,n);for(var r of this.#e.get(n.target)||[])r(n)}})}}({box:`border-box`});function oa(e,t,n){var r=aa.observe(e,()=>n(e[t]));Sn(()=>(dr(()=>n(e[t])),r))}function sa(e,t){return e===t||e?.[T]===t}function ca(e=Ve(),t,n,r){var i=I.r,a=H;return Sn(()=>{var o,s;return wn(()=>{o=s,s=r?.()||[],dr(()=>{sa(n(...s),e)||(t(e,...s),o&&sa(n(...o),e)&&t(null,...o))})}),()=>{let r=a;for(;r!==i&&r.parent!==null&&r.parent.f&33554432;)r=r.parent;let o=()=>{s&&sa(n(...s),e)&&t(null,...s)},c=r.teardown;r.teardown=()=>{o(),c?.()}}}),e}var la=!1;function ua(e){var t=la;try{return la=!1,[e(),la]}finally{la=t}}var da={get(e,t){if(!e.exclude.has(t))return e.props[t]},set(e,t){return!1},getOwnPropertyDescriptor(e,t){if(!e.exclude.has(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},has(e,t){return!e.exclude.has(t)&&t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.has(t))}};function fa(e,t,n){return new Proxy({props:e,exclude:t},da)}function pa(e,t,n,r){var i=!0,o=!!(n&8),s=!!(n&16),c=r,l=!0,u=void 0,d=()=>s&&i?(u??=rt(r),U(u)):(l&&(l=!1,c=s?dr(r):r),c);let f;if(o){var p=T in e||D in e;f=a(e,t)?.set??(p&&t in e?n=>e[t]=n:void 0)}var m,h=!1;o?[m,h]=ua(()=>e[t]):m=e[t],m===void 0&&r!==void 0&&(m=d(),f&&(i&&je(t),f(m)));var g=i?()=>{var n=e[t];return n===void 0?d():(l=!0,n)}:()=>{var n=e[t];return n!==void 0&&(c=void 0),n===void 0?c:n};if(i&&!(n&4))return g;if(f){var _=e.$$legacy;return(function(e,t){return arguments.length>0?((!i||!t||_||h)&&f(t?g():e),e):g()})}var v=!1,y=(n&1?rt:st)(()=>(v=!1,g()));o&&U(y);var b=H;return(function(e,t){if(arguments.length>0){let n=t?U(y):i&&o?Gt(e):e;return Rt(y,n),v=!0,c!==void 0&&(c=n),e}return Bn&&v||b.f&16384?y.v:U(y)})}typeof window<`u`&&((window.__svelte??={}).v??=new Set).add(`5`),Le();var ma=(e,t)=>{let n=Array(e.length+t.length);for(let t=0;t<e.length;t++)n[t]=e[t];for(let r=0;r<t.length;r++)n[e.length+r]=t[r];return n},ha=(e,t)=>({classGroupId:e,validator:t}),ga=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),_a=`-`,va=[],ya=`arbitrary..`,ba=e=>{let t=Ca(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e.startsWith(`[`)&&e.endsWith(`]`))return Sa(e);let n=e.split(_a);return xa(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?ma(i,t):t:i||va}return n[e]||va}}},xa=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=xa(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(_a):e.slice(t).join(_a),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},Sa=e=>e.slice(1,-1).indexOf(`:`)===-1?void 0:(()=>{let t=e.slice(1,-1),n=t.indexOf(`:`),r=t.slice(0,n);return r?ya+r:void 0})(),Ca=e=>{let{theme:t,classGroups:n}=e;return wa(n,t)},wa=(e,t)=>{let n=ga();for(let r in e){let i=e[r];Ta(i,n,r,t)}return n},Ta=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];Ea(i,t,n,r)}},Ea=(e,t,n,r)=>{if(typeof e==`string`){Da(e,t,n);return}if(typeof e==`function`){Oa(e,t,n,r);return}ka(e,t,n,r)},Da=(e,t,n)=>{let r=e===``?t:Aa(t,e);r.classGroupId=n},Oa=(e,t,n,r)=>{if(ja(e)){Ta(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(ha(n,e))},ka=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];Ta(o,Aa(t,a),n,r)}},Aa=(e,t)=>{let n=e,r=t.split(_a),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=ga(),n.nextPart.set(t,i)),n=i}return n},ja=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,Ma=e=>{if(e<1)return{get:()=>void 0,set:()=>{}};let t=0,n=Object.create(null),r=Object.create(null),i=(i,a)=>{n[i]=a,t++,t>e&&(t=0,r=n,n=Object.create(null))};return{get(e){let t=n[e];if(t!==void 0)return t;if((t=r[e])!==void 0)return i(e,t),t},set(e,t){e in n?n[e]=t:i(e,t)}}},Na=`!`,Pa=`:`,Fa=[],Ia=(e,t,n,r,i)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:i}),La=e=>{let{prefix:t,experimentalParseClassName:n}=e,r=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e[s];if(n===0&&r===0){if(o===Pa){t.push(e.slice(i,s)),i=s+1;continue}if(o===`/`){a=s;continue}}o===`[`?n++:o===`]`?n--:o===`(`?r++:o===`)`&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1;s.endsWith(Na)?(c=s.slice(0,-1),l=!0):s.startsWith(Na)&&(c=s.slice(1),l=!0);let u=a&&a>i?a-i:void 0;return Ia(t,l,c,u)};if(t){let e=t+Pa,n=r;r=t=>t.startsWith(e)?n(t.slice(e.length)):Ia(Fa,!1,t,void 0,!0)}if(n){let e=r;r=t=>n({className:t,parseClassName:e})}return r},Ra=e=>{let t=new Map;return e.orderSensitiveModifiers.forEach((e,n)=>{t.set(e,1e6+n)}),e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);o||s?(r.length>0&&(r.sort(),n.push(...r),r=[]),n.push(a)):r.push(a)}return r.length>0&&(r.sort(),n.push(...r)),n}},za=e=>({cache:Ma(e.cacheSize),parseClassName:La(e),sortModifiers:Ra(e),postfixLookupClassGroupIds:Ba(e),...ba(e)}),Ba=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},Va=/\s+/,Ha=(e,t)=>{let{parseClassName:n,getClassGroupId:r,getConflictingClassGroupIds:i,sortModifiers:a,postfixLookupClassGroupIds:o}=t,s=[],c=e.trim().split(Va),l=``;for(let e=c.length-1;e>=0;--e){let t=c[e],{isExternal:u,modifiers:d,hasImportantModifier:f,baseClassName:p,maybePostfixModifierPosition:m}=n(t);if(u){l=t+(l.length>0?` `+l:l);continue}let h=!!m,g;if(h){g=r(p.substring(0,m));let e=g&&o[g]?r(p):void 0;e&&e!==g&&(g=e,h=!1)}else g=r(p);if(!g){if(!h){l=t+(l.length>0?` `+l:l);continue}if(g=r(p),!g){l=t+(l.length>0?` `+l:l);continue}h=!1}let _=d.length===0?``:d.length===1?d[0]:a(d).join(`:`),v=f?_+Na:_,y=v+g;if(s.indexOf(y)>-1)continue;s.push(y);let b=i(g,h);for(let e=0;e<b.length;++e){let t=b[e];s.push(v+t)}l=t+(l.length>0?` `+l:l)}return l},Ua=(...e)=>{let t=0,n,r,i=``;for(;t<e.length;)(n=e[t++])&&(r=Wa(n))&&(i&&(i+=` `),i+=r);return i},Wa=e=>{if(typeof e==`string`)return e;let t,n=``;for(let r=0;r<e.length;r++)e[r]&&(t=Wa(e[r]))&&(n&&(n+=` `),n+=t);return n},Ga=(e,...t)=>{let n,r,i,a,o=o=>(n=za(t.reduce((e,t)=>t(e),e())),r=n.cache.get,i=n.cache.set,a=s,s(o)),s=e=>{let t=r(e);if(t)return t;let a=Ha(e,n);return i(e,a),a};return a=o,(...e)=>a(Ua(...e))},Ka=[],W=e=>{let t=t=>t[e]||Ka;return t.isThemeGetter=!0,t.themeKey=e,t},qa=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,Ja=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Ya=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,Xa=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Za=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Qa=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/,$a=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,eo=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,to=e=>Ya.test(e),G=e=>!!e&&!Number.isNaN(Number(e)),no=e=>!!e&&Number.isInteger(Number(e)),ro=e=>e.endsWith(`%`)&&G(e.slice(0,-1)),io=e=>Xa.test(e),ao=()=>!0,oo=e=>Za.test(e)&&!Qa.test(e),so=()=>!1,co=e=>$a.test(e),lo=e=>eo.test(e),uo=e=>!K(e)&&!q(e),fo=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),po=e=>Oo(e,Mo,so),K=e=>qa.test(e),mo=e=>Oo(e,No,oo),ho=e=>Oo(e,Po,G),go=e=>Oo(e,Io,ao),_o=e=>Oo(e,Fo,so),vo=e=>Oo(e,Ao,so),yo=e=>Oo(e,jo,lo),bo=e=>Oo(e,Lo,co),q=e=>Ja.test(e),xo=e=>ko(e,No),So=e=>ko(e,Fo),Co=e=>ko(e,Ao),wo=e=>ko(e,Mo),To=e=>ko(e,jo),Eo=e=>ko(e,Lo,!0),Do=e=>ko(e,Io,!0),Oo=(e,t,n)=>{let r=qa.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},ko=(e,t,n=!1)=>{let r=Ja.exec(e);return r?r[1]?t(r[1]):n:!1},Ao=e=>e===`position`||e===`percentage`,jo=e=>e===`image`||e===`url`,Mo=e=>e===`length`||e===`size`||e===`bg-size`,No=e=>e===`length`,Po=e=>e===`number`,Fo=e=>e===`family-name`,Io=e=>e===`number`||e===`weight`,Lo=e=>e===`shadow`,Ro=Object.defineProperty({__proto__:null,isAny:ao,isAnyNonArbitrary:uo,isArbitraryFamilyName:_o,isArbitraryImage:yo,isArbitraryLength:mo,isArbitraryNumber:ho,isArbitraryPosition:vo,isArbitraryShadow:bo,isArbitrarySize:po,isArbitraryValue:K,isArbitraryVariable:q,isArbitraryVariableFamilyName:So,isArbitraryVariableImage:To,isArbitraryVariableLength:xo,isArbitraryVariablePosition:Co,isArbitraryVariableShadow:Eo,isArbitraryVariableSize:wo,isArbitraryVariableWeight:Do,isArbitraryWeight:go,isFraction:to,isInteger:no,isNamedContainerQuery:fo,isNumber:G,isPercent:ro,isTshirtSize:io},Symbol.toStringTag,{value:`Module`}),zo=()=>{let e=W(`color`),t=W(`font`),n=W(`text`),r=W(`font-weight`),i=W(`tracking`),a=W(`leading`),o=W(`breakpoint`),s=W(`container`),c=W(`spacing`),l=W(`radius`),u=W(`shadow`),d=W(`inset-shadow`),f=W(`text-shadow`),p=W(`drop-shadow`),m=W(`blur`),h=W(`perspective`),g=W(`aspect`),_=W(`ease`),v=W(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),q,K],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],ee=()=>[`auto`,`contain`,`none`],C=()=>[q,K,c],w=()=>[to,`full`,`auto`,...C()],te=()=>[no,`none`,`subgrid`,q,K],ne=()=>[`auto`,{span:[`full`,no,q,K]},no,q,K],re=()=>[no,`auto`,q,K],ie=()=>[`auto`,`min`,`max`,`fr`,q,K],ae=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],T=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],E=()=>[`auto`,...C()],D=()=>[to,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...C()],oe=()=>[s,to,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...C()],se=()=>[to,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...C()],O=()=>[e,q,K],ce=()=>[...b(),Co,vo,{position:[q,K]}],le=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ue=()=>[`auto`,`cover`,`contain`,wo,po,{size:[q,K]}],de=()=>[ro,xo,mo],k=()=>[``,`none`,`full`,l,q,K],A=()=>[``,G,xo,mo],j=()=>[`solid`,`dashed`,`dotted`,`double`],fe=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],M=()=>[G,ro,Co,vo],pe=()=>[``,`none`,m,q,K],me=()=>[`none`,G,q,K],he=()=>[`none`,G,q,K],N=()=>[G,q,K],P=()=>[to,`full`,...C()];return{cacheSize:500,theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[io],breakpoint:[io],color:[ao],container:[io],"drop-shadow":[io],ease:[`in`,`out`,`in-out`],font:[uo],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[io],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[io],shadow:[io],spacing:[`px`,G],text:[io],"text-shadow":[io],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,to,K,q,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,q,K]}],"container-named":[fo],columns:[{columns:[G,`auto`,K,q,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:ee()}],"overscroll-x":[{"overscroll-x":ee()}],"overscroll-y":[{"overscroll-y":ee()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:w()}],"inset-x":[{"inset-x":w()}],"inset-y":[{"inset-y":w()}],start:[{"inset-s":w(),start:w()}],end:[{"inset-e":w(),end:w()}],"inset-bs":[{"inset-bs":w()}],"inset-be":[{"inset-be":w()}],top:[{top:w()}],right:[{right:w()}],bottom:[{bottom:w()}],left:[{left:w()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[no,`auto`,q,K]}],basis:[{basis:[to,`full`,`auto`,s,...C()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[G,to,`auto`,`initial`,`none`,K]}],grow:[{grow:[``,G,q,K]}],shrink:[{shrink:[``,G,q,K]}],order:[{order:[no,`first`,`last`,`none`,q,K]}],"grid-cols":[{"grid-cols":te()}],"col-start-end":[{col:ne()}],"col-start":[{"col-start":re()}],"col-end":[{"col-end":re()}],"grid-rows":[{"grid-rows":te()}],"row-start-end":[{row:ne()}],"row-start":[{"row-start":re()}],"row-end":[{"row-end":re()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":ie()}],"auto-rows":[{"auto-rows":ie()}],gap:[{gap:C()}],"gap-x":[{"gap-x":C()}],"gap-y":[{"gap-y":C()}],"justify-content":[{justify:[...ae(),`normal`]}],"justify-items":[{"justify-items":[...T(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...T()]}],"align-content":[{content:[`normal`,...ae()]}],"align-items":[{items:[...T(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...T(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ae()}],"place-items":[{"place-items":[...T(),`baseline`]}],"place-self":[{"place-self":[`auto`,...T()]}],p:[{p:C()}],px:[{px:C()}],py:[{py:C()}],ps:[{ps:C()}],pe:[{pe:C()}],pbs:[{pbs:C()}],pbe:[{pbe:C()}],pt:[{pt:C()}],pr:[{pr:C()}],pb:[{pb:C()}],pl:[{pl:C()}],m:[{m:E()}],mx:[{mx:E()}],my:[{my:E()}],ms:[{ms:E()}],me:[{me:E()}],mbs:[{mbs:E()}],mbe:[{mbe:E()}],mt:[{mt:E()}],mr:[{mr:E()}],mb:[{mb:E()}],ml:[{ml:E()}],"space-x":[{"space-x":C()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":C()}],"space-y-reverse":[`space-y-reverse`],size:[{size:D()}],"inline-size":[{inline:[`auto`,...oe()]}],"min-inline-size":[{"min-inline":[`auto`,...oe()]}],"max-inline-size":[{"max-inline":[`none`,...oe()]}],"block-size":[{block:[`auto`,...se()]}],"min-block-size":[{"min-block":[`auto`,...se()]}],"max-block-size":[{"max-block":[`none`,...se()]}],w:[{w:[s,`screen`,...D()]}],"min-w":[{"min-w":[s,`screen`,`none`,...D()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...D()]}],h:[{h:[`screen`,`lh`,...D()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...D()]}],"max-h":[{"max-h":[`screen`,`lh`,`none`,...D()]}],"font-size":[{text:[`base`,n,xo,mo]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,Do,go]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,ro,K]}],"font-family":[{font:[So,_o,t]}],"font-features":[{"font-features":[K]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,q,K]}],"line-clamp":[{"line-clamp":[G,`none`,q,ho]}],leading:[{leading:[`none`,a,...C()]}],"list-image":[{"list-image":[`none`,q,K]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,q,K]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:O()}],"text-color":[{text:O()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...j(),`wavy`]}],"text-decoration-thickness":[{decoration:[G,`from-font`,`auto`,q,mo]}],"text-decoration-color":[{decoration:O()}],"underline-offset":[{"underline-offset":[G,`auto`,q,K]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:C()}],"tab-size":[{tab:[no,q,K]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,q,K]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,q,K]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:ce()}],"bg-repeat":[{bg:le()}],"bg-size":[{bg:ue()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},no,q,K],radial:[``,q,K],conic:[``,no,q,K]},To,yo]}],"bg-color":[{bg:O()}],"gradient-from-pos":[{from:de()}],"gradient-via-pos":[{via:de()}],"gradient-to-pos":[{to:de()}],"gradient-from":[{from:O()}],"gradient-via":[{via:O()}],"gradient-to":[{to:O()}],rounded:[{rounded:k()}],"rounded-s":[{"rounded-s":k()}],"rounded-e":[{"rounded-e":k()}],"rounded-t":[{"rounded-t":k()}],"rounded-r":[{"rounded-r":k()}],"rounded-b":[{"rounded-b":k()}],"rounded-l":[{"rounded-l":k()}],"rounded-ss":[{"rounded-ss":k()}],"rounded-se":[{"rounded-se":k()}],"rounded-ee":[{"rounded-ee":k()}],"rounded-es":[{"rounded-es":k()}],"rounded-tl":[{"rounded-tl":k()}],"rounded-tr":[{"rounded-tr":k()}],"rounded-br":[{"rounded-br":k()}],"rounded-bl":[{"rounded-bl":k()}],"border-w":[{border:A()}],"border-w-x":[{"border-x":A()}],"border-w-y":[{"border-y":A()}],"border-w-s":[{"border-s":A()}],"border-w-e":[{"border-e":A()}],"border-w-bs":[{"border-bs":A()}],"border-w-be":[{"border-be":A()}],"border-w-t":[{"border-t":A()}],"border-w-r":[{"border-r":A()}],"border-w-b":[{"border-b":A()}],"border-w-l":[{"border-l":A()}],"divide-x":[{"divide-x":A()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":A()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...j(),`hidden`,`none`]}],"divide-style":[{divide:[...j(),`hidden`,`none`]}],"border-color":[{border:O()}],"border-color-x":[{"border-x":O()}],"border-color-y":[{"border-y":O()}],"border-color-s":[{"border-s":O()}],"border-color-e":[{"border-e":O()}],"border-color-bs":[{"border-bs":O()}],"border-color-be":[{"border-be":O()}],"border-color-t":[{"border-t":O()}],"border-color-r":[{"border-r":O()}],"border-color-b":[{"border-b":O()}],"border-color-l":[{"border-l":O()}],"divide-color":[{divide:O()}],"outline-style":[{outline:[...j(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[G,q,K]}],"outline-w":[{outline:[``,G,xo,mo]}],"outline-color":[{outline:O()}],shadow:[{shadow:[``,`inner`,`none`,u,Eo,bo]}],"shadow-color":[{shadow:O()}],"inset-shadow":[{"inset-shadow":[`none`,d,Eo,bo]}],"inset-shadow-color":[{"inset-shadow":O()}],"ring-w":[{ring:A()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:O()}],"ring-offset-w":[{"ring-offset":[G,mo]}],"ring-offset-color":[{"ring-offset":O()}],"inset-ring-w":[{"inset-ring":A()}],"inset-ring-color":[{"inset-ring":O()}],"text-shadow":[{"text-shadow":[`none`,f,Eo,bo]}],"text-shadow-color":[{"text-shadow":O()}],opacity:[{opacity:[G,q,K]}],"mix-blend":[{"mix-blend":[...fe(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":fe()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[G]}],"mask-image-linear-from-pos":[{"mask-linear-from":M()}],"mask-image-linear-to-pos":[{"mask-linear-to":M()}],"mask-image-linear-from-color":[{"mask-linear-from":O()}],"mask-image-linear-to-color":[{"mask-linear-to":O()}],"mask-image-t-from-pos":[{"mask-t-from":M()}],"mask-image-t-to-pos":[{"mask-t-to":M()}],"mask-image-t-from-color":[{"mask-t-from":O()}],"mask-image-t-to-color":[{"mask-t-to":O()}],"mask-image-r-from-pos":[{"mask-r-from":M()}],"mask-image-r-to-pos":[{"mask-r-to":M()}],"mask-image-r-from-color":[{"mask-r-from":O()}],"mask-image-r-to-color":[{"mask-r-to":O()}],"mask-image-b-from-pos":[{"mask-b-from":M()}],"mask-image-b-to-pos":[{"mask-b-to":M()}],"mask-image-b-from-color":[{"mask-b-from":O()}],"mask-image-b-to-color":[{"mask-b-to":O()}],"mask-image-l-from-pos":[{"mask-l-from":M()}],"mask-image-l-to-pos":[{"mask-l-to":M()}],"mask-image-l-from-color":[{"mask-l-from":O()}],"mask-image-l-to-color":[{"mask-l-to":O()}],"mask-image-x-from-pos":[{"mask-x-from":M()}],"mask-image-x-to-pos":[{"mask-x-to":M()}],"mask-image-x-from-color":[{"mask-x-from":O()}],"mask-image-x-to-color":[{"mask-x-to":O()}],"mask-image-y-from-pos":[{"mask-y-from":M()}],"mask-image-y-to-pos":[{"mask-y-to":M()}],"mask-image-y-from-color":[{"mask-y-from":O()}],"mask-image-y-to-color":[{"mask-y-to":O()}],"mask-image-radial":[{"mask-radial":[q,K]}],"mask-image-radial-from-pos":[{"mask-radial-from":M()}],"mask-image-radial-to-pos":[{"mask-radial-to":M()}],"mask-image-radial-from-color":[{"mask-radial-from":O()}],"mask-image-radial-to-color":[{"mask-radial-to":O()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[G]}],"mask-image-conic-from-pos":[{"mask-conic-from":M()}],"mask-image-conic-to-pos":[{"mask-conic-to":M()}],"mask-image-conic-from-color":[{"mask-conic-from":O()}],"mask-image-conic-to-color":[{"mask-conic-to":O()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:ce()}],"mask-repeat":[{mask:le()}],"mask-size":[{mask:ue()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,q,K]}],filter:[{filter:[``,`none`,q,K]}],blur:[{blur:pe()}],brightness:[{brightness:[G,q,K]}],contrast:[{contrast:[G,q,K]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,Eo,bo]}],"drop-shadow-color":[{"drop-shadow":O()}],grayscale:[{grayscale:[``,G,q,K]}],"hue-rotate":[{"hue-rotate":[G,q,K]}],invert:[{invert:[``,G,q,K]}],saturate:[{saturate:[G,q,K]}],sepia:[{sepia:[``,G,q,K]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,q,K]}],"backdrop-blur":[{"backdrop-blur":pe()}],"backdrop-brightness":[{"backdrop-brightness":[G,q,K]}],"backdrop-contrast":[{"backdrop-contrast":[G,q,K]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,G,q,K]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[G,q,K]}],"backdrop-invert":[{"backdrop-invert":[``,G,q,K]}],"backdrop-opacity":[{"backdrop-opacity":[G,q,K]}],"backdrop-saturate":[{"backdrop-saturate":[G,q,K]}],"backdrop-sepia":[{"backdrop-sepia":[``,G,q,K]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":C()}],"border-spacing-x":[{"border-spacing-x":C()}],"border-spacing-y":[{"border-spacing-y":C()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,q,K]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[G,`initial`,q,K]}],ease:[{ease:[`linear`,`initial`,_,q,K]}],delay:[{delay:[G,q,K]}],animate:[{animate:[`none`,v,q,K]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,q,K]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:me()}],"rotate-x":[{"rotate-x":me()}],"rotate-y":[{"rotate-y":me()}],"rotate-z":[{"rotate-z":me()}],scale:[{scale:he()}],"scale-x":[{"scale-x":he()}],"scale-y":[{"scale-y":he()}],"scale-z":[{"scale-z":he()}],"scale-3d":[`scale-3d`],skew:[{skew:N()}],"skew-x":[{"skew-x":N()}],"skew-y":[{"skew-y":N()}],transform:[{transform:[q,K,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:P()}],"translate-x":[{"translate-x":P()}],"translate-y":[{"translate-y":P()}],"translate-z":[{"translate-z":P()}],"translate-none":[`translate-none`],zoom:[{zoom:[no,q,K]}],accent:[{accent:O()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:O()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,q,K]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":O()}],"scrollbar-track-color":[{"scrollbar-track":O()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":C()}],"scroll-mx":[{"scroll-mx":C()}],"scroll-my":[{"scroll-my":C()}],"scroll-ms":[{"scroll-ms":C()}],"scroll-me":[{"scroll-me":C()}],"scroll-mbs":[{"scroll-mbs":C()}],"scroll-mbe":[{"scroll-mbe":C()}],"scroll-mt":[{"scroll-mt":C()}],"scroll-mr":[{"scroll-mr":C()}],"scroll-mb":[{"scroll-mb":C()}],"scroll-ml":[{"scroll-ml":C()}],"scroll-p":[{"scroll-p":C()}],"scroll-px":[{"scroll-px":C()}],"scroll-py":[{"scroll-py":C()}],"scroll-ps":[{"scroll-ps":C()}],"scroll-pe":[{"scroll-pe":C()}],"scroll-pbs":[{"scroll-pbs":C()}],"scroll-pbe":[{"scroll-pbe":C()}],"scroll-pt":[{"scroll-pt":C()}],"scroll-pr":[{"scroll-pr":C()}],"scroll-pb":[{"scroll-pb":C()}],"scroll-pl":[{"scroll-pl":C()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,q,K]}],fill:[{fill:[`none`,...O()]}],"stroke-w":[{stroke:[G,xo,mo,ho]}],stroke:[{stroke:[`none`,...O()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`start`,`end`,`right`,`left`],"inset-y":[`inset-bs`,`inset-be`,`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`ps`,`pe`,`pr`,`pl`],py:[`pbs`,`pbe`,`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`ms`,`me`,`mr`,`ml`],my:[`mbs`,`mbe`,`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-s`,`border-w-e`,`border-w-r`,`border-w-l`],"border-w-y":[`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-s`,`border-color-e`,`border-color-r`,`border-color-l`],"border-color-y":[`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-ms`,`scroll-me`,`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-ps`,`scroll-pe`,`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},Bo=(e,{cacheSize:t,prefix:n,experimentalParseClassName:r,extend:i={},override:a={}})=>(Vo(e,`cacheSize`,t),Vo(e,`prefix`,n),Vo(e,`experimentalParseClassName`,r),Ho(e.theme,a.theme),Ho(e.classGroups,a.classGroups),Ho(e.conflictingClassGroups,a.conflictingClassGroups),Ho(e.conflictingClassGroupModifiers,a.conflictingClassGroupModifiers),Vo(e,`postfixLookupClassGroups`,a.postfixLookupClassGroups),Vo(e,`orderSensitiveModifiers`,a.orderSensitiveModifiers),Uo(e.theme,i.theme),Uo(e.classGroups,i.classGroups),Uo(e.conflictingClassGroups,i.conflictingClassGroups),Uo(e.conflictingClassGroupModifiers,i.conflictingClassGroupModifiers),Wo(e,i,`postfixLookupClassGroups`),Wo(e,i,`orderSensitiveModifiers`),e),Vo=(e,t,n)=>{n!==void 0&&(e[t]=n)},Ho=(e,t)=>{if(t)for(let n in t)Vo(e,n,t[n])},Uo=(e,t)=>{if(t)for(let n in t)Wo(e,t,n)},Wo=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},Go=(e,...t)=>typeof e==`function`?Ga(zo,e,...t):Ga(()=>Bo(zo(),e),...t),Ko=Array.isArray,qo=e=>{if(!e&&e!==0&&e!==0n)return``;if(typeof e==`string`)return e;if(typeof e==`number`)return e===e?``+e:``;if(typeof e==`bigint`)return``+e;let t=``;if(Ko(e)){let n=e.length;for(let r=0;r<n;r++){let n=e[r];if(!n&&n!==0&&n!==0n)continue;let i=typeof n==`string`?n:qo(n);i&&(t&&(t+=` `),t+=i)}return t}if(typeof e==`object`)for(let n in e)e[n]&&(t&&(t+=` `),t+=n);return t},Jo=/\s+/g,Yo=Array.isArray,Xo=e=>typeof e!=`string`||!e?e:e.replace(Jo,` `).trim(),Zo=e=>{let t=e.length;if(t===0)return!1;let n=e.charCodeAt(0),r=e.charCodeAt(t-1);if(n===32||r===32||n>=9&&n<=13||n===160||r>=9&&r<=13||r===160)return!0;for(let n=0;n<t;n++){let r=e.charCodeAt(n);if(r>=9&&r<=13||r===160||r===32&&n+1<t&&e.charCodeAt(n+1)===32)return!0}return!1},Qo=(...e)=>{let t=qo(e);if(t)return Zo(t)?Xo(t):t},$o=e=>e===!1?`false`:e===!0?`true`:e===0?`0`:e,es=e=>{if(!e||typeof e!=`object`)return!0;for(let t in e)return!1;return!0},ts=(e,t)=>{if(e===t)return!0;if(!e||!t)return!1;let n=e,r=t,i=Object.keys(n),a=Object.keys(r);if(i.length!==a.length)return!1;for(let e=0;e<i.length;e++){let t=i[e];if(!a.includes(t)||n[t]!==r[t])return!1}return!0},ns=(e,t)=>{let n=e;for(let e in t)if(Object.hasOwn(t,e)){let r=t[e];n[e]=e in n?Qo(n[e],r):r}return e},rs=(e,t)=>{for(let n=0;n<e.length;n++){let r=e[n];Yo(r)?rs(r,t):r&&t.push(r)}},is=(...e)=>{let t=[];rs(e,t);let n=[];for(let e=0;e<t.length;e++)t[e]&&n.push(t[e]);return n},as=(e,t)=>{let n=e,r=t,i={};for(let e in n){let t=n[e];if(e in r){let n=r[e];i[e]=Yo(t)||Yo(n)?is(n,t):typeof t==`object`&&typeof n==`object`&&t&&n?as(t,n):n+` `+t}else i[e]=t}for(let e in r)e in n||(i[e]=r[e]);return i},os={twMerge:!0,twMergeConfig:{}},ss=256,cs=128,ls=Symbol(`tv-cache-miss`),us=e=>e?.class!=null&&e.class!==``||e?.className!=null&&e.className!==``,ds=e=>{if(e===void 0)return``;if(e===null)return`null`;if(typeof e==`string`)return e;if(typeof e==`boolean`)return e?`true`:`false`;if(typeof e==`number`)return e===0?`0`:String(e);if(typeof e==`bigint`)return String(e);let t=$o(e),n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return String(t);if(n===`object`)try{return JSON.stringify(t)}catch{return null}return null},fs=(e,t)=>{if(t===void 0)return e;if(t===null)return e+`null`;let n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return e+String(t);if(Array.isArray(t))return e+t.join(`\0`);try{return e+JSON.stringify(t)}catch{return e+`?`}},ps=(e,t,n,r)=>{let i=``,a=Object.create(null);for(let r=0;r<e.length;r++){let o=e[r];a[o]=1;let s=t[o];n&&n[o]!==void 0&&(s=n[o]);let c=ds(s);if(c===null)return null;i+=o+`:`+c+`;`}let o=[];for(let e in t)e===`class`||e===`className`||a[e]||(a[e]=1,o.push(e));if(n)for(let e in n)e===`class`||e===`className`||a[e]||n[e]===void 0||(a[e]=1,o.push(e));o.length>1&&o.sort();for(let e=0;e<o.length;e++){let r=o[e],a=t[r];n&&n[r]!==void 0&&(a=n[r]);let s=ds(a);if(s===null)return null;i+=r+`:`+s+`;`}return i},ms=(e,t)=>{let n=``;for(let t=0;t<e.length;t++){let{conditionKeys:r,source:i}=e[t];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=fs(n,i[t]),n+=`,`}n+=`c=`,n=fs(n,i.class),n+=`|cn=`,n=fs(n,i.className),n+=`;`}for(let e=0;e<t.length;e++){let{conditionKeys:r,source:i}=t[e];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=fs(n,i[t]),n+=`,`}Array.isArray(i.slots)&&(n+=`slots=`+i.slots.join(`,`)+`,`),n+=`c=`,n=fs(n,i.class),n+=`|cn=`,n=fs(n,i.className),n+=`;`}return n},hs=(e=ss)=>{let t=new Map,n=null;return{get(e){if(t.has(e))return t.get(e);if(n?.has(e)){let r=n.get(e);return t.set(e,r),r}return ls},set(r,i){t.size>=e&&(n=t,t=new Map),t.set(r,i)}}},gs=(e=ss)=>{let t=hs(e);return{get(e){return t.get(e)},set(e,n){t.set(e,n)}}},_s=(e=cs)=>{let t=new Map,n=null,r=0;return{get(e,i){let a=t.get(e);if(a){let e=a.get(i);if(e!==void 0||a.has(i))return e}if(n){let a=n.get(e);if(a){let n=a.get(i);if(n!==void 0||a.has(i)){let a=t.get(e);return a||(a=new Map,t.set(e,a)),a.has(i)||r++,a.set(i,n),n}}}return ls},set(i,a,o){r>=e&&(n=t,t=new Map,r=0);let s=t.get(i);s||(s=new Map,t.set(i,s)),s.has(a)||r++,s.set(a,o)}}},vs=(e,t)=>{let n=null;return(r,i)=>{if(!us(i))return r;let a=i.class,o=i.className;if(a!=null&&a!==``&&typeof a!=`string`||o!=null&&o!==``&&typeof o!=`string`)return e(t,r,a,o);n??=_s();let s=r??``,c=(typeof a==`string`?a:``)+`\0`+(typeof o==`string`?o:``),l=n.get(s,c);if(l!==ls)return l;let u=e(t,r,a,o);return n.set(s,c,u),u}};function ys(){let e=null,t={},n=!1;return{get cachedTwMerge(){return e},set cachedTwMerge(t){e=t},get cachedTwMergeConfig(){return t},set cachedTwMergeConfig(e){t=e},get didTwMergeConfigChange(){return n},set didTwMergeConfigChange(e){n=e},reset(){e=null,t={},n=!1}}}var J=ys(),bs=e=>{!es(e.twMergeConfig)&&!ts(e.twMergeConfig,J.cachedTwMergeConfig)&&(J.didTwMergeConfigChange=!0,J.cachedTwMergeConfig=e.twMergeConfig)},xs=(e,t)=>{let n=[];for(let r=0;r<t.length;r++){let i=t[r],a=e[i];n.push({key:i,values:a,isEmpty:es(a)})}return n},Ss=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},Cs=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`slots`&&e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},ws=e=>{let t={};for(let n=0;n<e.length;n++){let r=e[n],i=r.source.slots;if(Array.isArray(i))for(let e=0;e<i.length;e++){let n=i[e];t[n]||(t[n]=[]),t[n].push(r)}}return t},Ts=(e,t)=>{let{extend:n=null,slots:r={},variants:i={},compoundVariants:a=[],compoundSlots:o=[],defaultVariants:s={}}=e,c={...os,...t},l=e.slots!==void 0,u=n?.base?Qo(n.base,e?.base):e?.base,d=n?.variants&&!es(n.variants)?as(i,n.variants):i,f=n?.defaultVariants&&!es(n.defaultVariants)?{...n.defaultVariants,...s}:s;bs(c);let p=!n?.slots||es(n.slots),m=l?p&&n?.base?Qo(e?.base,n.base):typeof e?.base==`string`||e?.base==null?e.base:Qo(e.base):void 0,h=l?{base:m,...r}:{},g=p?h:ns({...n?.slots},es(h)?{base:e?.base}:h),_=!n?.compoundVariants||es(n.compoundVariants)?a:is(n?.compoundVariants,a),v=!n?.compoundSlots||es(n.compoundSlots)?o:is(n?.compoundSlots,o),y=Object.keys(d);return{config:c,extend:n,base:u,variants:d,defaultVariants:f,slots:g,compoundVariants:_,compoundSlots:v,compiledVariants:null,compiledCompoundVariants:null,compiledCompoundSlots:null,compiledCompoundSlotsBySlot:null,deferredError:_&&!Array.isArray(_)?TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof _}`):v&&!Array.isArray(v)?TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof v}`):null,mode:l||!p?`slots`:y.length===0?`plain`:`variants`,slotKeys:null,variantKeys:y}},Es=e=>e.compiledVariants===null?(e.compiledVariants=xs(e.variants,e.variantKeys),e.compiledCompoundVariants=Ss(e.compoundVariants),e.compiledCompoundSlots=Cs(e.compoundSlots),e.compiledCompoundSlotsBySlot=ws(e.compiledCompoundSlots),e.slotKeys=e.slots&&typeof e.slots==`object`?Object.keys(e.slots):[],e):e,Ds=[],Os=[],ks=[],As=[],js=[],Ms=(e,t,n)=>{let r={};for(let t in e)r[t]=e[t];if(t)for(let e in t)t[e]!==void 0&&(r[e]=t[e]);if(n)for(let e in n)n[e]!==void 0&&(r[e]=n[e]);return r},Ns=e=>e==null||e===!1,Ps=(e,t)=>{if(!Array.isArray(e))return e===t||Ns(e)&&Ns(t);for(let n=0;n<e.length;n++){let r=e[n];if(r===t||Ns(r)&&Ns(t))return!0}return!1},Fs=(e,t,n,r)=>{if(e.isEmpty)return null;let i=r?.[e.key]??n?.[e.key];if(i===null)return null;let a=$o(i);if(typeof a==`object`)return null;let o=t?.[e.key],s=a??$o(o);return e.values[s||`false`]},Is=(e,t)=>{let{conditionKeys:n,source:r}=e;for(let e=0;e<n.length;e++){let i=n[e];if(!Ps(r[i],t[i]))return!1}return!0},Ls=(e,t,n)=>{typeof n==`string`?t===`base`&&e.push(n):n&&typeof n==`object`&&n[t]&&e.push(n[t])},Rs=(e,t,n)=>{let r=Os;r.length=0;for(let i=0;i<e.length;i++){let a=Fs(e[i],t,n);a&&r.push(a)}return r},zs=(e,t,n,r,i)=>{let a=Os;a.length=0;for(let o=0;o<t.length;o++){let s=Fs(t[o],n,r,i),c=e===`base`&&typeof s==`string`?s:s&&s[e];c&&a.push(c)}return a},Bs=(e,t)=>{let n=ks;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];Is(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},Vs=(e,t,n)=>{let r=As;r.length=0;for(let i=0;i<t.length;i++){let a=t[i];Is(a,n)&&(Ls(r,e,a.source.class),Ls(r,e,a.source.className))}return r},Hs=(e,t)=>{let n=js;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];Is(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},Us=(e,t)=>{let{base:n,config:r}=e,i=ls,a=vs(t,r);return(e=>(i===ls&&(i=t(r,n)),a(i,e)))},Ws=(e,t)=>{let{base:n,config:r,defaultVariants:i,deferredError:a,variantKeys:o}=e,s=e.compiledCompoundVariants,c=e.compiledVariants,l=Ds,u=null,d=vs(t,r),f=1,p=e=>{let a=s.length>0?Bs(s,Ms(i,e)):void 0;return t(r,n,Rs(c,i,e),a)};return(t=>{if(a)throw a;(c===null||s===null)&&(Es(e),c=e.compiledVariants,s=e.compiledCompoundVariants,l=e.compiledCompoundSlots??Ds);let n;if(f>0)f--,n=p(t);else{u??=gs();let e=ps(o,i,t);if(e!==null){let r=s.length>0||l.length>0?ms(s,l):``,i=e+`#`+r,a=u.get(i);a===ls?(n=p(t),u.set(i,n)):n=a}else n=p(t)}return d(n,t)})},Gs=(e,t)=>{let{config:n,defaultVariants:r,deferredError:i,slots:a,variantKeys:o}=e,s=null,c=null,l=null,u=null,d=!1,f=null,p=null,m=1,h=()=>{if(l!==null)return;(e.compiledVariants===null||e.compiledCompoundVariants===null||e.compiledCompoundSlots===null||e.compiledCompoundSlotsBySlot===null||e.slotKeys===null)&&Es(e);let i=e.compiledVariants;s=e.compiledCompoundVariants,c=e.compiledCompoundSlots;let o=e.compiledCompoundSlotsBySlot;l=e.slotKeys,d=s.length>0||c.length>0,f=vs(t,n);let p=Array(l.length);for(let e=0;e<l.length;e++){let c=l[e],u=o[c]??Ds;p[e]=(e,o)=>{let l=d?Ms(r,e,o):void 0,f=l?Vs(c,s,l):void 0,p=l?Hs(u,l):void 0;return t(n,a[c],zs(c,i,r,e,o),f,p)}}u=p},g=e=>{let t=l,n=u,r=f,i={};for(let a=0;a<t.length;a++){let o=n[a],s=o(e);i[t[a]]=t=>{if(t==null)return s;let n=!1;for(let e in t)if(e!==`class`&&e!==`className`&&t[e]!==void 0){n=!0;break}return r(n?o(e,t):s,t)}}return i};return(e=>{if(i)throw i;if(h(),m>0)return m--,g(e);let t=ps(o,r,e);if(t===null)return g(e);let n=d?ms(s,c):``,a=t+`#`+n;p??=hs();let l=p.get(a);if(l!==ls)return l;let u=g(e);return p.set(a,u),u})},Ks=(e,t)=>{if(e.mode===`plain`)return Us(e,t);let n;return(r=>(n??=e.mode===`slots`?Gs(e,t):Ws(e,t),n(r)))},qs=(e,t)=>{e.variantKeys=t.variantKeys,e.extend=t.extend,e.base=t.base,e.slots=t.slots,e.variants=t.variants,e.defaultVariants=t.defaultVariants,e.compoundSlots=t.compoundSlots,e.compoundVariants=t.compoundVariants},Js=e=>{let t=(t,n)=>{let r=Ts(t,n),i=Ks(r,e);return qs(i,r),i};return{tv:t,createTV:e=>(n,r)=>t(n,r?as(e,r):e)}},Ys=(e,t)=>{let n=e.length,r=t.length,i=Array(n+r);for(let t=0;t<n;t++)i[t]=e[t];for(let e=0;e<r;e++)i[n+e]=t[e];return i},Xs=(e,t)=>({classGroupId:e,validator:t}),Zs=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),Qs=`-`,$s=[],ec=`arbitrary..`,tc=e=>{let t=ic(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e[0]===`[`&&e[e.length-1]===`]`)return rc(e);let n=e.split(Qs);return nc(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?Ys(i,t):t:i||$s}return n[e]||$s}}},nc=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=nc(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(Qs):e.slice(t).join(Qs),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},rc=e=>{let t=e.slice(1,-1),n=t.indexOf(`:`);if(n===-1)return;let r=t.slice(0,n);return r?ec+r:void 0},ic=e=>{let{theme:t,classGroups:n}=e;return ac(n,t)},ac=(e,t)=>{let n=Zs();for(let r in e){let i=e[r];oc(i,n,r,t)}return n},oc=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];sc(i,t,n,r)}},sc=(e,t,n,r)=>{if(typeof e==`string`){cc(e,t,n);return}if(typeof e==`function`){lc(e,t,n,r);return}uc(e,t,n,r)},cc=(e,t,n)=>{let r=e===``?t:dc(t,e);r.classGroupId=n},lc=(e,t,n,r)=>{if(fc(e)){oc(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Xs(n,e))},uc=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];oc(o,dc(t,a),n,r)}},dc=(e,t)=>{let n=e,r=t.split(Qs),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=Zs(),n.nextPart.set(t,i)),n=i}return n},fc=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,pc=`!`,mc=58,hc=47,gc=91,_c=93,vc=40,yc=41,bc=33,xc=(e,t,n,r)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:void 0}),Sc=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e.charCodeAt(s);if(n===0&&r===0){if(o===mc){t.push(e.slice(i,s)),i=s+1;continue}if(o===hc){a=s;continue}}o===gc?n++:o===_c?n--:o===vc?r++:o===yc&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1,u=s.length-1;s.charCodeAt(u)===bc?(c=s.slice(0,-1),l=!0):s.charCodeAt(0)===bc&&(c=s.slice(1),l=!0);let d=a&&a>i?a-i:void 0;return xc(t,l,c,d)},Cc=e=>{let t=new Set(e.orderSensitiveModifiers);return e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);if(o||s){if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e]);r=[]}n.push(a)}else r.push(a)}if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e])}return n}},wc={isExternal:!0,classId:-1,conflictIds:[]},Tc=4096,Ec=16384,Dc=e=>{let t=Cc(e),n=Oc(e),{getClassGroupId:r,getConflictingClassGroupIds:i}=tc(e),a=Object.create(null),o=Object.create(null),s=0,c=new Int32Array(256),l=0,u=new Uint8Array(64),d=!1,f=e=>{let t=[],n=e.length,r=-1;d=!1;for(let i=0;i<n;i++){let n=e.charCodeAt(i);n===32?r!==-1&&(t.push(e.slice(r,i)),r=-1):n>=9&&n<=13?(d=!0,r!==-1&&(t.push(e.slice(r,i)),r=-1)):r===-1&&(r=i)}return r!==-1&&t.push(e.slice(r)),t},p=new Map,m=0,h=e=>{let t=p.get(e);if(t===void 0&&(t=m++,p.set(e,t),t>=c.length)){let e=new Int32Array(c.length*2);e.set(c),c=e}return t},g=e=>{let{isExternal:a,modifiers:o,hasImportantModifier:s,baseClassName:c,maybePostfixModifierPosition:l}=Sc(e);if(a)return wc;let u=!!l,d;if(u){let e=c.substring(0,l);d=r(e);let t=d&&n[d]?r(c):void 0;t&&t!==d&&(d=t,u=!1)}else d=r(c);if(!d){if(!u||(d=r(c),!d))return wc;u=!1}let f=o.length===0?``:o.length===1?o[0]:t(o).join(`:`),p=s?f+pc:f,m=i(d,u),g=[];for(let e=0;e<m.length;e++)g.push(h(p+m[e]));return{isExternal:!1,classId:h(p+d),conflictIds:g}},_=e=>{let t=a[e];return t===void 0?(t=o[e],t===void 0&&(t=g(e)),a[e]=t,++s>Tc&&(s=0,o=a,a=Object.create(null)),t):t};return{parseClassName:Sc,sortModifiers:t,postfixLookupClassGroupIds:n,getClassGroupId:r,getConflictingClassGroupIds:i,getClassDescriptor:_,mergeClassList:e=>{let t=f(e),n=t.length;if(n===1)return t[0];m>Ec&&(p.clear(),m=0,a=Object.create(null),o=Object.create(null),s=0),l=l+1|0,l===0&&(l=1);let r=l;if(n>u.length){let e=u.length;for(;e<n;)e*=2;u=new Uint8Array(e)}let i=!1,h=0;for(let e=n-1;e>=0;--e){let n=t[e];h+=n.length;let a=_(n);if(a.isExternal){u[e]=1;continue}let o=a.classId;if(c[o]===r){u[e]=0,i=!0;continue}c[o]=r;let s=a.conflictIds;for(let e=0;e<s.length;e++)c[s[e]]=r;u[e]=1}if(!i&&!d&&e.length===h+n-1)return e;let g=``;for(let e=0;e<n;e++)u[e]===1&&(g&&(g+=` `),g+=t[e]);return g}}},Oc=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},kc=500,Ac=e=>{let t,n,r=Object.create(null),i=Object.create(null),a=0,o=r=>(t=Dc(e()),n=t.mergeClassList,c.mergeString=s,s(r)),s=e=>{let t=r[e];return t===void 0?(t=i[e],t===void 0&&(t=n(e)),r[e]=t,++a>kc&&(a=0,i=r,r=Object.create(null)),t):t},c=(...e)=>c.mergeString(qo(e));return c.mergeString=o,c},jc=[],Y=e=>{let t=t=>t[e]||jc;return t.isThemeGetter=!0,t},Mc=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,Nc=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Pc=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,Fc=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Ic=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Lc=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,Rc=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,zc=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,Bc=Number,Vc=Number.isNaN,Hc=Number.isInteger,Uc=e=>Pc.test(e),X=e=>!!e&&!Vc(Bc(e)),Wc=e=>!!e&&Hc(Bc(e)),Gc=e=>e.endsWith(`%`)&&X(e.slice(0,-1)),Kc=e=>Fc.test(e),qc=()=>!0,Jc=e=>Ic.test(e)&&!Lc.test(e),Yc=()=>!1,Xc=e=>Rc.test(e),Zc=e=>zc.test(e),Qc=e=>!Z(e)&&!Q(e),$c=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),el=e=>hl(e,yl,Yc),Z=e=>Mc.test(e),tl=e=>hl(e,bl,Jc),nl=e=>hl(e,xl,X),rl=e=>hl(e,Cl,qc),il=e=>hl(e,Sl,Yc),al=e=>hl(e,_l,Yc),ol=e=>hl(e,vl,Zc),sl=e=>hl(e,wl,Xc),Q=e=>Nc.test(e),cl=e=>gl(e,bl),ll=e=>gl(e,Sl),ul=e=>gl(e,_l),dl=e=>gl(e,yl),fl=e=>gl(e,vl),pl=e=>gl(e,wl,!0),ml=e=>gl(e,Cl,!0),hl=(e,t,n)=>{let r=Mc.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},gl=(e,t,n=!1)=>{let r=Nc.exec(e);return r?r[1]?t(r[1]):n:!1},_l=e=>e===`position`||e===`percentage`,vl=e=>e===`image`||e===`url`,yl=e=>e===`length`||e===`size`||e===`bg-size`,bl=e=>e===`length`,xl=e=>e===`number`,Sl=e=>e===`family-name`,Cl=e=>e===`number`||e===`weight`,wl=e=>e===`shadow`,Tl=()=>{let e=Y(`color`),t=Y(`font`),n=Y(`text`),r=Y(`font-weight`),i=Y(`tracking`),a=Y(`leading`),o=Y(`breakpoint`),s=Y(`container`),c=Y(`spacing`),l=Y(`radius`),u=Y(`shadow`),d=Y(`inset-shadow`),f=Y(`text-shadow`),p=Y(`drop-shadow`),m=Y(`blur`),h=Y(`perspective`),g=Y(`aspect`),_=Y(`ease`),v=Y(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),Q,Z],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],ee=()=>[`auto`,`contain`,`none`],C=()=>[Q,Z,c],w=()=>[Uc,`full`,`auto`,...C()],te=()=>[Wc,`none`,`subgrid`,Q,Z],ne=()=>[`auto`,{span:[`full`,Wc,Q,Z]},Wc,Q,Z],re=()=>[Wc,`auto`,Q,Z],ie=()=>[`auto`,`min`,`max`,`fr`,Q,Z],ae=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],T=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],E=()=>[`auto`,...C()],D=()=>[Uc,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...C()],oe=()=>[Uc,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...C()],se=()=>[Uc,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...C()],O=()=>[e,Q,Z],ce=()=>[...b(),ul,al,{position:[Q,Z]}],le=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ue=()=>[`auto`,`cover`,`contain`,dl,el,{size:[Q,Z]}],de=()=>[Gc,cl,tl],k=()=>[``,`none`,`full`,l,Q,Z],A=()=>[``,X,cl,tl],j=()=>[`solid`,`dashed`,`dotted`,`double`],fe=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],M=()=>[X,Gc,ul,al],pe=()=>[``,`none`,m,Q,Z],me=()=>[`none`,X,Q,Z],he=()=>[`none`,X,Q,Z],N=()=>[X,Q,Z],P=()=>[Uc,`full`,...C()];return{theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[Kc],breakpoint:[Kc],color:[qc],container:[Kc],"drop-shadow":[Kc],ease:[`in`,`out`,`in-out`],font:[Qc],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[Kc],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[Kc],shadow:[Kc],spacing:[`px`,X],text:[Kc],"text-shadow":[Kc],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,Uc,Z,Q,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,Q,Z]}],"container-named":[$c],columns:[{columns:[X,Z,Q,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:ee()}],"overscroll-x":[{"overscroll-x":ee()}],"overscroll-y":[{"overscroll-y":ee()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:w()}],"inset-x":[{"inset-x":w()}],"inset-y":[{"inset-y":w()}],start:[{"inset-s":w(),start:w()}],end:[{"inset-e":w(),end:w()}],"inset-bs":[{"inset-bs":w()}],"inset-be":[{"inset-be":w()}],top:[{top:w()}],right:[{right:w()}],bottom:[{bottom:w()}],left:[{left:w()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Wc,`auto`,Q,Z]}],basis:[{basis:[Uc,`full`,`auto`,s,...C()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[X,Uc,`auto`,`initial`,`none`,Z]}],grow:[{grow:[``,X,Q,Z]}],shrink:[{shrink:[``,X,Q,Z]}],order:[{order:[Wc,`first`,`last`,`none`,Q,Z]}],"grid-cols":[{"grid-cols":te()}],"col-start-end":[{col:ne()}],"col-start":[{"col-start":re()}],"col-end":[{"col-end":re()}],"grid-rows":[{"grid-rows":te()}],"row-start-end":[{row:ne()}],"row-start":[{"row-start":re()}],"row-end":[{"row-end":re()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":ie()}],"auto-rows":[{"auto-rows":ie()}],gap:[{gap:C()}],"gap-x":[{"gap-x":C()}],"gap-y":[{"gap-y":C()}],"justify-content":[{justify:[...ae(),`normal`]}],"justify-items":[{"justify-items":[...T(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...T()]}],"align-content":[{content:[`normal`,...ae()]}],"align-items":[{items:[...T(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...T(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ae()}],"place-items":[{"place-items":[...T(),`baseline`]}],"place-self":[{"place-self":[`auto`,...T()]}],p:[{p:C()}],px:[{px:C()}],py:[{py:C()}],ps:[{ps:C()}],pe:[{pe:C()}],pbs:[{pbs:C()}],pbe:[{pbe:C()}],pt:[{pt:C()}],pr:[{pr:C()}],pb:[{pb:C()}],pl:[{pl:C()}],m:[{m:E()}],mx:[{mx:E()}],my:[{my:E()}],ms:[{ms:E()}],me:[{me:E()}],mbs:[{mbs:E()}],mbe:[{mbe:E()}],mt:[{mt:E()}],mr:[{mr:E()}],mb:[{mb:E()}],ml:[{ml:E()}],"space-x":[{"space-x":C()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":C()}],"space-y-reverse":[`space-y-reverse`],size:[{size:D()}],"inline-size":[{inline:[`auto`,...oe()]}],"min-inline-size":[{"min-inline":[`auto`,...oe()]}],"max-inline-size":[{"max-inline":[`none`,...oe()]}],"block-size":[{block:[`auto`,...se()]}],"min-block-size":[{"min-block":[`auto`,...se()]}],"max-block-size":[{"max-block":[`none`,...se()]}],w:[{w:[s,`screen`,...D()]}],"min-w":[{"min-w":[s,`screen`,`none`,...D()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...D()]}],h:[{h:[`screen`,`lh`,...D()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...D()]}],"max-h":[{"max-h":[`screen`,`lh`,...D()]}],"font-size":[{text:[`base`,n,cl,tl]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,ml,rl]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Gc,Z]}],"font-family":[{font:[ll,il,t]}],"font-features":[{"font-features":[Z]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,Q,Z]}],"line-clamp":[{"line-clamp":[X,`none`,Q,nl]}],leading:[{leading:[a,...C()]}],"list-image":[{"list-image":[`none`,Q,Z]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,Q,Z]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:O()}],"text-color":[{text:O()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...j(),`wavy`]}],"text-decoration-thickness":[{decoration:[X,`from-font`,`auto`,Q,tl]}],"text-decoration-color":[{decoration:O()}],"underline-offset":[{"underline-offset":[X,`auto`,Q,Z]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:C()}],"tab-size":[{tab:[Wc,Q,Z]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,Q,Z]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,Q,Z]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:ce()}],"bg-repeat":[{bg:le()}],"bg-size":[{bg:ue()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Wc,Q,Z],radial:[``,Q,Z],conic:[Wc,Q,Z]},fl,ol]}],"bg-color":[{bg:O()}],"gradient-from-pos":[{from:de()}],"gradient-via-pos":[{via:de()}],"gradient-to-pos":[{to:de()}],"gradient-from":[{from:O()}],"gradient-via":[{via:O()}],"gradient-to":[{to:O()}],rounded:[{rounded:k()}],"rounded-s":[{"rounded-s":k()}],"rounded-e":[{"rounded-e":k()}],"rounded-t":[{"rounded-t":k()}],"rounded-r":[{"rounded-r":k()}],"rounded-b":[{"rounded-b":k()}],"rounded-l":[{"rounded-l":k()}],"rounded-ss":[{"rounded-ss":k()}],"rounded-se":[{"rounded-se":k()}],"rounded-ee":[{"rounded-ee":k()}],"rounded-es":[{"rounded-es":k()}],"rounded-tl":[{"rounded-tl":k()}],"rounded-tr":[{"rounded-tr":k()}],"rounded-br":[{"rounded-br":k()}],"rounded-bl":[{"rounded-bl":k()}],"border-w":[{border:A()}],"border-w-x":[{"border-x":A()}],"border-w-y":[{"border-y":A()}],"border-w-s":[{"border-s":A()}],"border-w-e":[{"border-e":A()}],"border-w-bs":[{"border-bs":A()}],"border-w-be":[{"border-be":A()}],"border-w-t":[{"border-t":A()}],"border-w-r":[{"border-r":A()}],"border-w-b":[{"border-b":A()}],"border-w-l":[{"border-l":A()}],"divide-x":[{"divide-x":A()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":A()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...j(),`hidden`,`none`]}],"divide-style":[{divide:[...j(),`hidden`,`none`]}],"border-color":[{border:O()}],"border-color-x":[{"border-x":O()}],"border-color-y":[{"border-y":O()}],"border-color-s":[{"border-s":O()}],"border-color-e":[{"border-e":O()}],"border-color-bs":[{"border-bs":O()}],"border-color-be":[{"border-be":O()}],"border-color-t":[{"border-t":O()}],"border-color-r":[{"border-r":O()}],"border-color-b":[{"border-b":O()}],"border-color-l":[{"border-l":O()}],"divide-color":[{divide:O()}],"outline-style":[{outline:[...j(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[X,Q,Z]}],"outline-w":[{outline:[``,X,cl,tl]}],"outline-color":[{outline:O()}],shadow:[{shadow:[``,`none`,u,pl,sl]}],"shadow-color":[{shadow:O()}],"inset-shadow":[{"inset-shadow":[`none`,d,pl,sl]}],"inset-shadow-color":[{"inset-shadow":O()}],"ring-w":[{ring:A()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:O()}],"ring-offset-w":[{"ring-offset":[X,tl]}],"ring-offset-color":[{"ring-offset":O()}],"inset-ring-w":[{"inset-ring":A()}],"inset-ring-color":[{"inset-ring":O()}],"text-shadow":[{"text-shadow":[`none`,f,pl,sl]}],"text-shadow-color":[{"text-shadow":O()}],opacity:[{opacity:[X,Q,Z]}],"mix-blend":[{"mix-blend":[...fe(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":fe()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[X]}],"mask-image-linear-from-pos":[{"mask-linear-from":M()}],"mask-image-linear-to-pos":[{"mask-linear-to":M()}],"mask-image-linear-from-color":[{"mask-linear-from":O()}],"mask-image-linear-to-color":[{"mask-linear-to":O()}],"mask-image-t-from-pos":[{"mask-t-from":M()}],"mask-image-t-to-pos":[{"mask-t-to":M()}],"mask-image-t-from-color":[{"mask-t-from":O()}],"mask-image-t-to-color":[{"mask-t-to":O()}],"mask-image-r-from-pos":[{"mask-r-from":M()}],"mask-image-r-to-pos":[{"mask-r-to":M()}],"mask-image-r-from-color":[{"mask-r-from":O()}],"mask-image-r-to-color":[{"mask-r-to":O()}],"mask-image-b-from-pos":[{"mask-b-from":M()}],"mask-image-b-to-pos":[{"mask-b-to":M()}],"mask-image-b-from-color":[{"mask-b-from":O()}],"mask-image-b-to-color":[{"mask-b-to":O()}],"mask-image-l-from-pos":[{"mask-l-from":M()}],"mask-image-l-to-pos":[{"mask-l-to":M()}],"mask-image-l-from-color":[{"mask-l-from":O()}],"mask-image-l-to-color":[{"mask-l-to":O()}],"mask-image-x-from-pos":[{"mask-x-from":M()}],"mask-image-x-to-pos":[{"mask-x-to":M()}],"mask-image-x-from-color":[{"mask-x-from":O()}],"mask-image-x-to-color":[{"mask-x-to":O()}],"mask-image-y-from-pos":[{"mask-y-from":M()}],"mask-image-y-to-pos":[{"mask-y-to":M()}],"mask-image-y-from-color":[{"mask-y-from":O()}],"mask-image-y-to-color":[{"mask-y-to":O()}],"mask-image-radial":[{"mask-radial":[Q,Z]}],"mask-image-radial-from-pos":[{"mask-radial-from":M()}],"mask-image-radial-to-pos":[{"mask-radial-to":M()}],"mask-image-radial-from-color":[{"mask-radial-from":O()}],"mask-image-radial-to-color":[{"mask-radial-to":O()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[X]}],"mask-image-conic-from-pos":[{"mask-conic-from":M()}],"mask-image-conic-to-pos":[{"mask-conic-to":M()}],"mask-image-conic-from-color":[{"mask-conic-from":O()}],"mask-image-conic-to-color":[{"mask-conic-to":O()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:ce()}],"mask-repeat":[{mask:le()}],"mask-size":[{mask:ue()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,Q,Z]}],filter:[{filter:[``,`none`,Q,Z]}],blur:[{blur:pe()}],brightness:[{brightness:[X,Q,Z]}],contrast:[{contrast:[X,Q,Z]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,pl,sl]}],"drop-shadow-color":[{"drop-shadow":O()}],grayscale:[{grayscale:[``,X,Q,Z]}],"hue-rotate":[{"hue-rotate":[X,Q,Z]}],invert:[{invert:[``,X,Q,Z]}],saturate:[{saturate:[X,Q,Z]}],sepia:[{sepia:[``,X,Q,Z]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,Q,Z]}],"backdrop-blur":[{"backdrop-blur":pe()}],"backdrop-brightness":[{"backdrop-brightness":[X,Q,Z]}],"backdrop-contrast":[{"backdrop-contrast":[X,Q,Z]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,X,Q,Z]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[X,Q,Z]}],"backdrop-invert":[{"backdrop-invert":[``,X,Q,Z]}],"backdrop-opacity":[{"backdrop-opacity":[X,Q,Z]}],"backdrop-saturate":[{"backdrop-saturate":[X,Q,Z]}],"backdrop-sepia":[{"backdrop-sepia":[``,X,Q,Z]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":C()}],"border-spacing-x":[{"border-spacing-x":C()}],"border-spacing-y":[{"border-spacing-y":C()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,Q,Z]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[X,`initial`,Q,Z]}],ease:[{ease:[`linear`,`initial`,_,Q,Z]}],delay:[{delay:[X,Q,Z]}],animate:[{animate:[`none`,v,Q,Z]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,Q,Z]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:me()}],"rotate-x":[{"rotate-x":me()}],"rotate-y":[{"rotate-y":me()}],"rotate-z":[{"rotate-z":me()}],scale:[{scale:he()}],"scale-x":[{"scale-x":he()}],"scale-y":[{"scale-y":he()}],"scale-z":[{"scale-z":he()}],"scale-3d":[`scale-3d`],skew:[{skew:N()}],"skew-x":[{"skew-x":N()}],"skew-y":[{"skew-y":N()}],transform:[{transform:[Q,Z,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:P()}],"translate-x":[{"translate-x":P()}],"translate-y":[{"translate-y":P()}],"translate-z":[{"translate-z":P()}],"translate-none":[`translate-none`],zoom:[{zoom:[Wc,Q,Z]}],accent:[{accent:O()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:O()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,Q,Z]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":O()}],"scrollbar-track-color":[{"scrollbar-track":O()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":C()}],"scroll-mx":[{"scroll-mx":C()}],"scroll-my":[{"scroll-my":C()}],"scroll-ms":[{"scroll-ms":C()}],"scroll-me":[{"scroll-me":C()}],"scroll-mbs":[{"scroll-mbs":C()}],"scroll-mbe":[{"scroll-mbe":C()}],"scroll-mt":[{"scroll-mt":C()}],"scroll-mr":[{"scroll-mr":C()}],"scroll-mb":[{"scroll-mb":C()}],"scroll-ml":[{"scroll-ml":C()}],"scroll-p":[{"scroll-p":C()}],"scroll-px":[{"scroll-px":C()}],"scroll-py":[{"scroll-py":C()}],"scroll-ps":[{"scroll-ps":C()}],"scroll-pe":[{"scroll-pe":C()}],"scroll-pbs":[{"scroll-pbs":C()}],"scroll-pbe":[{"scroll-pbe":C()}],"scroll-pt":[{"scroll-pt":C()}],"scroll-pr":[{"scroll-pr":C()}],"scroll-pb":[{"scroll-pb":C()}],"scroll-pl":[{"scroll-pl":C()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,Q,Z]}],fill:[{fill:[`none`,...O()]}],"stroke-w":[{stroke:[X,cl,tl,nl]}],stroke:[{stroke:[`none`,...O()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`right`,`left`],"inset-y":[`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`pr`,`pl`],py:[`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`mr`,`ml`],my:[`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-r`,`border-w-l`],"border-w-y":[`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-r`,`border-color-l`],"border-color-y":[`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},El=(e,{extend:t={},override:n={}})=>(Ol(e.theme,n.theme),Ol(e.classGroups,n.classGroups),Ol(e.conflictingClassGroups,n.conflictingClassGroups),Ol(e.conflictingClassGroupModifiers,n.conflictingClassGroupModifiers),Dl(e,`postfixLookupClassGroups`,n.postfixLookupClassGroups),Dl(e,`orderSensitiveModifiers`,n.orderSensitiveModifiers),kl(e.theme,t.theme),kl(e.classGroups,t.classGroups),kl(e.conflictingClassGroups,t.conflictingClassGroups),kl(e.conflictingClassGroupModifiers,t.conflictingClassGroupModifiers),Al(e,t,`postfixLookupClassGroups`),Al(e,t,`orderSensitiveModifiers`),e),Dl=(e,t,n)=>{n!==void 0&&(e[t]=n)},Ol=(e,t)=>{if(t)for(let n in t)Dl(e,n,t[n])},kl=(e,t)=>{if(t)for(let n in t)Al(e,t,n)},Al=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},jl=e=>Ac(e?typeof e==`function`?()=>e(Tl()):()=>El(Tl(),e):Tl),Ml=e=>{if(es(e))return;let t=e,n={...t.extend??{}};for(let e of[`theme`,`classGroups`,`conflictingClassGroups`,`conflictingClassGroupModifiers`,`postfixLookupClassGroups`,`orderSensitiveModifiers`,`cacheSize`,`prefix`,`separator`,`experimentalParseClassName`])t[e]!==void 0&&n[e]===void 0&&(n[e]=t[e]);let r={};if(Object.keys(n).length>0&&(r.extend=n),t.override!=null&&!es(t.override)&&(r.override=t.override),r.extend||r.override)return r},Nl=e=>{let t=jl(Ml(e));return e=>t.mergeString(e)},Pl,Fl=()=>(Pl||=jl(),Pl),Il=()=>((!J.cachedTwMerge||J.didTwMergeConfigChange)&&(J.didTwMergeConfigChange=!1,J.cachedTwMerge=Nl(J.cachedTwMergeConfig)),J.cachedTwMerge),Ll=e=>{let t=e?.twMergeConfig;t&&!es(t)&&(ts(t,J.cachedTwMergeConfig)||(J.cachedTwMergeConfig=t,J.didTwMergeConfigChange=!0))},Rl=e=>qo(e);(()=>{let e=Error();return!(`line`in e)&&!(`lineNumber`in e)})();var zl=J.reset.bind(J);J.reset=()=>{Pl=void 0,zl()};var Bl=(e,t)=>{let n=Rl(e);return!n||!(t?.twMerge??!0)?n||void 0:n.indexOf(` `)===-1?n:(Ll(t),(t?.twMergeConfig&&!es(t.twMergeConfig)?Il():Fl().mergeString)(n)||void 0)},Vl=Js((e,...t)=>Bl(t,e));Vl.tv;var Hl=Vl.createTV,Ul=`/* Generated by \`bun run tokens\` from design/tokens/cawco.tokens.json.
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
  --spacing-c-pin-card-reading-room: var(--c-pin-card-reading-room);
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
  --animate-pin-card-in: pin-card-in var(--dur-pop) var(--ease-out);
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
  @keyframes pin-card-in {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise)) scale(var(--press-scale));
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
`,$=e=>[...Ul.matchAll(RegExp(`^\\s*--${e}-([a-z0-9-]+):`,`gm`))].map(([,e])=>e),Wl=e=>[...Ul.matchAll(RegExp(`^@utility ${e}-([a-z0-9-]+) \\{`,`gm`))].map(([,e])=>e),Gl=$(`duration`),Kl=[`type-role`,`font-shorthand`,`font-family`,`font-features`,`font-size`,`font-stretch`,`font-style`,`font-weight`,`fvn-normal`,`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`,`leading`],ql=[Ro.isArbitraryVariable,Ro.isArbitraryValue],Jl={extend:{theme:{text:Wl(`text`).filter(e=>!e.startsWith(`size-`)),spacing:$(`spacing`),radius:$(`radius`),shadow:$(`shadow`),"drop-shadow":$(`drop-shadow`),leading:$(`leading`),tracking:$(`tracking`),ease:$(`ease`),font:$(`font`).filter(e=>!e.startsWith(`weight-`)),"font-weight":$(`font-weight`),breakpoint:$(`breakpoint`),container:$(`container`),animate:$(`animate`)},classGroups:{"font-size":[{"text-size":Wl(`text-size`)}],"bg-image":[{bg:Wl(`bg`)}],transition:[{transition:[...Wl(`transition`),`off`,`control-grow`]}],animate:[`sheet-fade`],content:[{content:[`data-n`,`placeholder`]}],"grid-rows":[{"grid-rows":[`shut`,`open`]}],"grid-cols":[{"grid-cols":[`fluid-auto`,`mark-fluid`]}],"auto-rows":[{"auto-rows":[`line`,`band`,`band-phone`]}],"animation-duration":[{"anim-dur":Gl}],"animation-delay":[{"anim-delay":Gl}],"type-role":[{type:Wl(`type`)}],"border-none-t":[`border-t-none`],"border-none-b":[`border-b-none`],"border-none-l":[`border-l-none`],"border-none-r":[`border-r-none`],"border-none-s":[`border-s-none`],"border-style-t":[`border-t-dashed`],"outline-off":[`outline-off`],"background-shorthand":[{background:[Ro.isAny]}],rounded:[`rounded-inherit`,{concentric:$(`radius`)}],"concentric-in":[`concentric-in`],"r-outer":[{"r-outer":$(`radius`)}],"r-inset":[{"r-inset":$(`spacing`)}],"font-family":[`font-family-inherit`],gap:[`gap-inherit`],"color-scheme":[`scheme-inherit`],"pointer-events":[`pointer-events-all`],"max-h":[`max-h-inherit`],"align-items":[`items-box-start`,`items-box-end`,`items-unsafe-end`],"justify-content":[`justify-box-end`],"justify-self":[`justify-self-box-start`],"align-content":[`content-unsafe-end`],"border-color":[`border-suggest-tint`],"bg-color":[`bg-suggest-tint`,`bg-suggest-tint-hover`],"font-shorthand":[`font-inherit`,`font-mono-meta`],"line-clamp-undo":[`line-clamp-undo`],"translate-raw":[{"translate-raw":ql}],"clip-margin":[{"clip-margin":[Ro.isAny]}],"overflow-anchor":[`anchor-none`],"scroll-timeline":[`scroll-timeline-transcript-head`],"pane-tab-pads":[`pane-tab-pads`],"pane-tab-rims":[`pane-tab-rims`],"divider-chevron":[`divider-chevron`],"turn-pad":[`turn-pad`],"word-break-word":[`break-word`],"animation-play-state":[`animation-paused`],"inks-strong":[`inks-strong`],"tap-highlight":[`tap-highlight-none`],"touch-callout":[`touch-callout-none`],"content-visibility":[`content-visibility-hidden`],"timeline-scope":[`timeline-scope-transcript-head`],"writing-mode":[`writing-vertical-rl`],direction:[`dir-rtl`],"clip-path":[{"clip-path":ql},`clip-block-start`,`clip-tab-foot`],"grid-areas":[{"grid-areas":ql}],"line-clamp-std":[{"line-clamp-std":[Ro.isInteger]}],"ring-ground":[{"ring-ground":[Ro.isAny]}],"hit-gap-x":[{"hit-gap-x":[Ro.isAny]}],"hit-gap-y":[{"hit-gap-y":ql}],"caw-neck":[{"caw-neck":ql}],"press-by":[{"press-by":ql}],"swap-away":[{"swap-away":[Ro.isInteger]}],"rail-step":[{"rail-step":ql}],"prompt-fs":[{"prompt-fs":ql}],"fade-inset-end":[{"fade-inset-end":ql}]},conflictingClassGroups:{"type-role":[...Kl],"font-shorthand":[...Kl]}}},Yl=Go(Jl),Xl=Hl({twMergeConfig:Jl});function Zl(...e){return Yl(Ei(e))}var Ql=Xl({base:`inline-flex items-center rounded-sm text-ink-strong type-label mark-line`,variants:{variant:{option:`group/option touch-hit min-h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-3 py-space-1 text-start hit-edge-hair enabled:not-aria-pressed:not-aria-checked:not-data-chosen:hover:bg-surface-hover aria-checked:border-brand-solid aria-checked:bg-surface-recess aria-pressed:border-brand-solid aria-pressed:bg-surface-recess data-chosen:border-brand-solid data-chosen:bg-surface-recess motion-safe:transition-[border-color,background-color] motion-safe:duration-(--dur-control) motion-safe:ease-out`,tray:`pointer-events-auto touch-hit relative isolate h-c-tray-chip touch-manipulation gap-c-pill-gap border-0 bg-transparent px-space-2 transition-[color] duration-(--dur-control) ease-out select-none [--tray-chip-fill:var(--surface-raised)] touch-callout-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-(color:--tray-chip-fill) before:shadow-tile before:transition-[background-color] before:duration-(--dur-control) before:ease-out motion-safe:transition-[color,transform] motion-safe:active:[transform:scale(var(--press-scale))] can-hover:hover:[--tray-chip-fill:var(--surface-hover)] *:[svg]:size-icon-md *:[svg]:flex-none`,inline:`-my-c-inline-chip-pad max-w-full gap-space-1 rounded-[calc(var(--radius-xs)+var(--c-inline-chip-pad))] bg-surface-recess py-c-inline-chip-pad ps-c-inline-chip-pad pe-space-2 align-baseline leading-c-inline-chip-line whitespace-nowrap inset-ring inset-ring-border-hairline *:data-[slot=label]:max-w-c-inline-chip-max-w *:data-[slot=label]:min-w-0 *:data-[slot=label]:self-baseline *:data-[slot=label]:overflow-clip *:data-[slot=label]:text-ellipsis motion-safe:transition-[background-color,transform] motion-safe:duration-(--dur-control) motion-safe:ease-out motion-safe:enabled:active:[transform:scale(var(--press-scale))] can-hover:enabled:hover:bg-surface-hover *:[svg]:size-icon-md *:[svg]:flex-none`,setting:`touch-hit h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-2 leading-none whitespace-nowrap hit-edge-hair transition-control aria-disabled:opacity-50 *:data-[slot=chevron]:size-icon-sm *:data-[slot=chevron]:text-ink-subtle **:data-[slot=chip-label]:min-w-0 **:data-[slot=chip-label]:overflow-hidden **:data-[slot=chip-label]:text-ellipsis motion-safe:transition-control-press can-hover:enabled:not-variant-static:hover:bg-surface-hover motion-safe:enabled:not-aria-busy:pressed:[transform:scale(var(--press-scale))] variant-static:border-border-hairline variant-static:bg-surface-recess *:[svg]:flex-none *:[svg]:not-data-[slot=chevron]:size-icon-md`},size:{regular:``,compact:`h-(--row-compact-h) gap-space-1 max-phone:h-c-btn-h-lg max-phone:not-data-account-chip:*:data-[slot=chevron]:hidden`},tone:{muted:``,fail:``,grant:``}},compoundVariants:[{variant:`setting`,tone:`muted`,class:`text-ink-muted`},{variant:`setting`,tone:`fail`,class:`border-status-fail-ink text-status-fail-ink`},{variant:`setting`,tone:`grant`,class:`border-status-attn-ink bg-status-attn-bg text-status-attn-ink *:data-[slot=chevron]:text-status-attn-ink can-hover:enabled:not-variant-static:hover:bg-status-attn-bg variant-static:border-status-attn-ink variant-static:bg-status-attn-bg`}],defaultVariants:{variant:`option`}}),$l=Xl({base:`flex flex-wrap gap-space-2 hit-gap-x-space-2 hit-gap-y-space-2 coarse:gap-y-space-4 coarse:hit-gap-y-space-4`});export{h as $,Rr as A,nn as B,qr as C,Fr as D,zr as E,U as F,Rt as G,an as H,dr as I,Be as J,It as K,Tn as L,Er as M,Tr as N,Lr as O,wr as P,f as Q,vn as R,Jr as S,Br as T,on as U,rn as V,Gt as W,ye as X,ze as Y,ve as Z,fi as _,pa as a,ti as b,oa as c,Fi as d,Ni as f,pi as g,Si as h,Xl as i,Dr as j,Vr as k,ta as l,wi as m,$l as n,fa as o,Di as p,ot as q,Zl as r,ca as s,Ql as t,$i as u,oi as v,Hr as w,$r as x,ni as y,bn as z};