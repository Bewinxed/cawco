(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=Array.isArray,t=Array.prototype.indexOf,n=Array.prototype.includes,r=Array.from,i=Object.defineProperty,a=Object.getOwnPropertyDescriptor,o=Object.getOwnPropertyDescriptors,s=Object.prototype,c=Array.prototype,l=Object.getPrototypeOf,u=Object.isExtensible;function d(e){return typeof e==`function`}var f=()=>{};function p(e){return e()}function m(e){for(var t=0;t<e.length;t++)e[t]()}function h(){var e,t;return{promise:new Promise((n,r)=>{e=n,t=r}),resolve:e,reject:t}}function g(e,t){if(Array.isArray(e))return e;if(t===void 0||!(Symbol.iterator in e))return Array.from(e);let n=[];for(let r of e)if(n.push(r),n.length===t)break;return n}var _=1<<24,v=1024,y=2048,b=4096,x=8192,S=16384,ee=32768,C=1<<25,w=65536,te=1<<19,ne=1<<20,re=1<<25,ie=1<<21,ae=1<<22,T=1<<23,E=Symbol(`$state`),D=Symbol(`component`),oe=Symbol(`legacy props`),se=Symbol(``),O=Symbol(`attributes`),ce=Symbol(`class`),le=Symbol(`style`),ue=Symbol(`text`),de=Symbol(`form reset`),k=new class extends Error{name=`StaleReactionError`;message="The reaction that called `getAbortSignal()` was re-run or destroyed"},A=!!globalThis.document?.contentType&&globalThis.document.contentType.includes(`xml`),j={},M=Symbol(`uninitialized`),N=`http://www.w3.org/1999/xhtml`;function fe(){console.warn(`https://svelte.dev/e/derived_inert`)}function pe(e){console.warn(`https://svelte.dev/e/hydration_mismatch`)}function me(){console.warn(`https://svelte.dev/e/select_multiple_invalid_value`)}function he(){console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`)}var P=!1;function ge(e){P=e}var F;function _e(e){if(e===null)throw pe(),j;return F=e}function ve(){return _e(an(F))}function ye(e){if(P){if(an(F)!==null)throw pe(),j;F=e}}function be(e=1){if(P){for(var t=e,n=F;t--;)n=an(n);F=n}}function xe(e=!0){for(var t=0,n=F;;){if(n.nodeType===8){var r=n.data;if(r===`]`){if(t===0)return n;--t}else(r===`[`||r===`[!`||r[0]===`[`&&!isNaN(Number(r.slice(1))))&&(t+=1)}var i=an(n);e&&n.remove(),n=i}}function Se(e){if(!e||e.nodeType!==8)throw pe(),j;return e.data}function Ce(e){return e===this.v}function we(e,t){return e==e?e!==t||typeof e==`object`&&!!e||typeof e==`function`:t==t}function Te(e){return!we(e,this.v)}function Ee(){throw Error(`https://svelte.dev/e/async_derived_orphan`)}function De(e,t,n){throw Error(`https://svelte.dev/e/each_key_duplicate`)}function Oe(e){throw Error(`https://svelte.dev/e/effect_in_teardown`)}function ke(){throw Error(`https://svelte.dev/e/effect_in_unowned_derived`)}function Ae(e){throw Error(`https://svelte.dev/e/effect_orphan`)}function je(){throw Error(`https://svelte.dev/e/effect_update_depth_exceeded`)}function Me(e){throw Error(`https://svelte.dev/e/props_invalid_value`)}function Ne(){throw Error(`https://svelte.dev/e/state_descriptors_fixed`)}function Pe(){throw Error(`https://svelte.dev/e/state_prototype_fixed`)}function Fe(){throw Error(`https://svelte.dev/e/state_unsafe_mutation`)}function Ie(){throw Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`)}var Le=!1,Re=!1;function ze(){Le=!0}function Be(){Re=!0}var I=null;function Ve(e){I=e}function He(e,t=!1,n){I={p:I,i:!1,c:null,e:null,s:e,x:null,r:H,l:Re&&!t?{s:null,u:null,$:[]}:null}}function Ue(e){var t=I,n=t.e;if(n!==null){t.e=null;for(var r of n)Sn(r)}return e!==void 0&&(t.x=e),t.i=!0,I=t.p,We(e)}function We(e={}){return i(e,D,{value:!0}),e}function Ge(){return!Re||I!==null&&I.l===null}var Ke=[];function qe(){var e=Ke;Ke=[],m(e)}function Je(e){if(Ke.length===0&&!bt){var t=Ke;queueMicrotask(()=>{t===Ke&&qe()})}Ke.push(e)}var Ye=~(y|b|v);function L(e,t){e.f=e.f&Ye|t}function Xe(e){e.f&512||e.deps===null?L(e,v):L(e,b)}function Ze(e,t,n){e.f&2048?t.add(e):e.f&4096&&n.add(e),L(e,v)}function Qe(e,t){if(t){let t=document.body;e.autofocus=!0,Je(()=>{document.activeElement===t&&e.focus()})}}var $e=!1;function et(){$e||($e=!0,document.addEventListener(`reset`,e=>{Promise.resolve().then(()=>{if(!e.defaultPrevented)for(let t of e.target.elements)t[de]?.()})},{capture:!0}))}function tt(e){var t=V,n=H;Kn(null),qn(null);try{return e()}finally{Kn(t),qn(n)}}function nt(e,t,n,r){let i=Ge()?ot:ut;var a=e.filter(e=>!e.settled),o=t.map(i);if(n.length===0&&a.length===0){r(o);return}var s=H,c=rt(),l=a.length===1?a[0].promise:a.length>1?Promise.all(a.map(e=>e.promise)):null;function u(e){if(!(s.f&16384)){c();try{r([...o,...e])}catch(e){hn(e,s)}it()}}var d=at();if(n.length===0){l.then(()=>u([])).finally(d);return}function f(){Promise.all(n.map(e=>ct(e))).then(u).catch(e=>hn(e,s)).finally(d)}l?l.then(()=>{if(s.f&16384){d();return}c(),f(),it()}):f()}function rt(){var e=H,t=V,n=I,r=R;return function(i=!0){qn(e),Kn(t),Ve(n),i&&!(e.f&16384)&&(r?.activate(),r?.apply())}}function it(e=!0){qn(null),Kn(null),Ve(null),e&&R?.deactivate()}function at(){var e=H,t=e.b,n=R,r=!!t?.is_rendered();return t?.update_pending_count(1,n),n.increment(r,e),()=>{t?.update_pending_count(-1,n),n.decrement(r,e)}}function ot(e){var t=2|y;return H!==null&&(H.f|=te),{ctx:I,deps:null,effects:null,equals:Ce,f:t,fn:e,reactions:null,rv:0,v:M,wv:0,parent:H,ac:null}}var st=Symbol(`obsolete`);function ct(e,t,n){let r=H;r===null&&Ee();var i=void 0,a=Rt(M),o=!V,s=new Set;return En(()=>{var t=H,n=h();i=n.promise;try{Promise.resolve(e()).then(n.resolve,e=>{e!==k&&n.reject(e)}).finally(it)}catch(e){n.reject(e),it()}var c=R;if(o){if(t.f&32768)var l=at();if(r.b?.is_rendered())c.async_deriveds.get(t)?.reject(st);else for(let e of s.values())e.reject(st);s.add(n),c.async_deriveds.set(t,n)}let u=(e,t=void 0)=>{l?.(),s.delete(n),t!==st&&(c.activate(),t?(a.f|=T,Wt(a,t)):(a.f&8388608&&(a.f^=T),Wt(a,e)),c.deactivate())};n.promise.then(u,e=>u(null,e||`unknown`))}),bn(()=>{for(let e of s)e.reject(st)}),new Promise(e=>{function t(n){function r(){n===i?e(a):t(i)}n.then(r,r)}t(i)})}function lt(e){let t=ot(e);return Le||Yn(t),t}function ut(e){let t=ot(e);return t.equals=Te,t}function dt(e){var t=e.effects;if(t!==null){e.effects=null;for(var n=0;n<t.length;n+=1)B(t[n])}}function ft(e){var t,n=H,r=e.parent;if(!Un&&r!==null&&e.v!==M&&r.f&24576)return fe(),e.v;qn(r);try{dt(e),t=sr(e)}finally{qn(n)}return t}function pt(e){var t=ft(e);if(!e.equals(t)&&(e.wv=ir(),(!R?.is_fork||e.deps===null)&&(R===null?e.v=t:(R.capture(e,t,!0),vt?.capture(e,t,!0)),e.deps===null))){L(e,v);return}Un||(z===null?Xe(e):(yn()||R?.is_fork)&&z.set(e,t))}function mt(e){if(e.effects!==null)for(let t of e.effects)(t.teardown||t.ac)&&(t.teardown?.(),t.ac!==null&&tt(()=>{t.ac.abort(k),t.ac=null}),t.fn!==null&&(t.teardown=f),ur(t,0),Nn(t))}function ht(e){if(e.effects!==null)for(let t of e.effects)t.teardown&&t.fn!==null&&dr(t)}var gt=null,_t=null,R=null,vt=null,z=null,yt=null,bt=!1,xt=!1,St=null,Ct=null,wt=0,Tt=1,Et=class e{id=Tt++;#e=!1;linked=!0;#t=null;#n=null;async_deriveds=new Map;current=new Map;previous=new Map;#r=new Set;#i=new Set;#a=0;#o=new Map;#s=null;#c=[];#l=[];#u=new Set;#d=new Set;#f=new Map;#p=new Set;is_fork=!1;#m=!1;constructor(){_t===null?gt=_t=this:(_t.#n=this,this.#t=_t),_t=this}#h(){if(this.is_fork)return!0;for(let n of this.#o.keys()){for(var e=n,t=!1;e.parent!==null;){if(this.#f.has(e)){t=!0;break}e=e.parent}if(!t)return!0}return!1}skip_effect(e){this.#f.has(e)||this.#f.set(e,{d:[],m:[]}),this.#p.delete(e)}unskip_effect(e,t=e=>this.schedule(e)){var n=this.#f.get(e);if(n){this.#f.delete(e);for(var r of n.d)L(r,y),t(r);for(r of n.m)L(r,b),t(r)}this.#p.add(e)}#g(){var e=[];for(let i of this.#c)if(!(i.f&16384||!(i.f&6144))){for(var t=i,n=!1;t.parent!==null;){t=t.parent;var r=t.f;if(r&96){if(!(r&1024)){n=!0;break}t.f^=v}}n||e.push(t)}return this.#c=[],e}#_(){this.#e=!0;for(let e of this.#u)this.#d.delete(e),L(e,y),this.schedule(e);for(let e of this.#d)L(e,b),this.schedule(e);this.apply();for(var t=St=[],n=[],r=Ct=[];this.#c.length>0;){wt++>1e3&&(this.#C(),Dt());for(let e of this.#g())try{this.#v(e,t,n)}catch(t){throw Pt(e),this.#h()||this.discard(),t}}if(R=null,r.length>0){var i=e.ensure();for(let e of r)i.schedule(e)}if(St=null,Ct=null,this.#h()){this.#x(n),this.#x(t);for(let[e,t]of this.#f)Nt(e,t);r.length>0&&R.#_();return}let a=this.#y();if(a){this.#x(n),this.#x(t),a.#b(this);return}this.#u.clear(),this.#d.clear();for(let e of this.#r)e(this);this.#r.clear(),vt=this,kt(n),kt(t),vt=null,this.#s?.resolve();var o=R;if(this.#a===0&&(this.#c.length===0||o!==null)&&(this.#C(),Le&&(this.#S(),R=o)),this.#c.length>0){if(o!==null){for(let e of this.#c)o.#c.push(e);this.#c=[]}else o=this}o!==null&&(It.clear(),o.#_())}#v(e,t,n){e.f^=v;for(var r=e.first;r!==null;){var i=r.f,a=!!(i&96);if(!(a&&i&1024||i&8192||this.#f.has(r))&&r.fn!==null){a?r.f^=v:i&4?t.push(r):Le&&i&16777224?n.push(r):ar(r)&&(i&16&&this.#d.add(r),dr(r));var o=r.first;if(o!==null){r=o;continue}}for(;r!==null;){var s=r.next;if(s!==null){r=s;break}r=r.parent}}}#y(){for(var e=this.#t;e!==null;){if(!e.is_fork){for(let[t,[,n]]of this.current)if(e.current.has(t)&&!n)return e}e=e.#t}return null}#b(e){for(let[t,n]of e.current)!this.previous.has(t)&&e.previous.has(t)&&this.previous.set(t,e.previous.get(t)),this.current.set(t,n);for(let[t,n]of e.async_deriveds){let e=this.async_deriveds.get(t);e&&n.promise.then(e.resolve).catch(e.reject)}e.async_deriveds.clear(),this.transfer_effects(e.#u,e.#d);let t=e=>{var n=e.reactions;if(n!==null&&!(e.f&2&&!(e.f&6144)))for(let e of n){var r=e.f;if(r&2)t(e);else{var i=e;r&4194320&&!this.async_deriveds.has(i)&&(this.#d.delete(i),L(i,y),this.schedule(i))}}};for(let e of this.current.keys())t(e);this.oncommit(()=>e.discard()),e.#C(),R=this,this.#_()}#x(e){for(var t=0;t<e.length;t+=1)Ze(e[t],this.#u,this.#d)}capture(e,t,n=!1){e.v!==M&&!this.previous.has(e)&&this.previous.set(e,e.v),e.f&8388608||(this.current.set(e,[t,n]),z?.set(e,t)),this.is_fork||(e.v=t)}activate(){R=this}deactivate(){R=null,z=null}flush(){try{xt=!0,R=this,this.#_()}finally{wt=0,yt=null,St=null,Ct=null,xt=!1,R=null,z=null,It.clear()}}discard(){for(let e of this.#i)e(this);this.#i.clear();for(let e of this.async_deriveds.values())e.reject(st);this.#C(),this.#s?.resolve()}register_created_effect(e){this.#l.push(e)}#S(){for(let u=gt;u!==null;u=u.#n){var e=u.id<this.id,t=[];for(let[r,[i,a]]of this.current){if(u.current.has(r)){var n=u.current.get(r)[0];if(e&&i!==n)u.current.set(r,[i,a]);else continue}t.push(r)}if(e)for(let[e,t]of this.async_deriveds){let n=u.async_deriveds.get(e);n&&t.promise.then(n.resolve).catch(n.reject)}var r=[...u.current.keys()].filter(e=>!u.current.get(e)[1]);if(u.#e&&r.length!==0){var i=r.filter(e=>!this.current.has(e));if(i.length===0)e&&u.discard();else if(t.length>0){if(e)for(let e of this.#p)u.unskip_effect(e,e=>{e.f&4194320?u.schedule(e):u.#x([e])});u.activate();var a=new Set,o=new Map;for(var s of t)At(s,i,a,o);o=new Map;var c=[...u.current].filter(([e,t])=>{let n=this.current.get(e);return!n||n[0]!==t[0]||n[1]!==t[1]}).map(([e])=>e);if(c.length>0)for(let e of this.#l)!(e.f&155648)&&jt(e,c,o)&&(e.f&4194320?(L(e,y),u.schedule(e)):u.#u.add(e));if(u.#c.length>0&&!u.#m){u.apply();for(var l of u.#g())u.#v(l,[],[])}u.deactivate()}}}}increment(e,t){if(this.#a+=1,e){let e=this.#o.get(t)??0;this.#o.set(t,e+1)}}decrement(e,t){if(--this.#a,e){let e=this.#o.get(t)??0;e===1?this.#o.delete(t):this.#o.set(t,e-1)}this.#m||(this.#m=!0,Je(()=>{this.#m=!1,this.linked&&this.flush()}))}transfer_effects(e,t){for(let t of e)this.#u.add(t);for(let e of t)this.#d.add(e);e.clear(),t.clear()}oncommit(e){this.#r.add(e)}ondiscard(e){this.#i.add(e)}settled(){return(this.#s??=h()).promise}static ensure(){if(R===null){let t=R=new e;!xt&&Je(()=>{t.#e||t.flush()})}return R}apply(){if(!Le||!this.is_fork&&this.#t===null&&this.#n===null){z=null;return}z=new Map;for(let[e,[t]]of this.current)z.set(e,t);for(let t=gt;t!==null;t=t.#n)if(!(t===this||t.is_fork)){var e=!1;if(t.id<this.id){for(let[n,[,r]]of t.current)if(!r&&this.current.has(n)){e=!0;break}}if(!e)for(let[e,n]of t.previous)z.has(e)||z.set(e,n)}}schedule(e){if(yt=e,e.b?.is_pending&&e.f&16777228&&!(e.f&32768)){e.b.defer_effect(e);return}this.#c.push(e)}#C(){if(this.linked){var e=this.#t,t=this.#n;e===null?gt=t:e.#n=t,t===null?_t=e:t.#t=e,this.linked=!1}}};function Dt(){try{je()}catch(e){hn(e,yt)}}var Ot=null;function kt(e){var t=e.length;if(t!==0){for(var n=0;n<t;){var r=e[n++];if(!(r.f&24576)&&ar(r)&&(Ot=new Set,dr(r),r.deps===null&&r.first===null&&r.nodes===null&&r.teardown===null&&r.ac===null&&In(r),Ot?.size>0)){It.clear();for(let e of Ot){if(e.f&24576)continue;let t=[e],n=e.parent;for(;n!==null;)Ot.has(n)&&(Ot.delete(n),t.push(n)),n=n.parent;for(let e=t.length-1;e>=0;e--){let n=t[e];n.f&24576||dr(n)}}Ot.clear()}}Ot=null}}function At(e,t,n,r){if(!n.has(e)&&(n.add(e),e.reactions!==null))for(let i of e.reactions){let e=i.f;e&2?At(i,t,n,r):e&4194320&&!(e&2048)&&jt(i,t,r)&&(L(i,y),Mt(i))}}function jt(e,t,r){let i=r.get(e);if(i!==void 0)return i;if(e.deps!==null)for(let i of e.deps){if(n.call(t,i))return!0;if(i.f&2&&jt(i,t,r))return r.set(i,!0),!0}return r.set(e,!1),!1}function Mt(e){R.schedule(e)}function Nt(e,t){if(!(e.f&32&&e.f&1024)){e.f&2048?t.d.push(e):e.f&4096&&t.m.push(e),L(e,v);for(var n=e.first;n!==null;)Nt(n,t),n=n.next}}function Pt(e){L(e,v);for(var t=e.first;t!==null;)Pt(t),t=t.next}var Ft=new Set,It=new Map,Lt=!1;function Rt(e,t){return{f:0,v:e,reactions:null,equals:Ce,rv:0,wv:0}}function zt(e,t){let n=Rt(e,t);return Yn(n),n}function Bt(e,t=!1,n=!0){let r=Rt(e);return t||(r.equals=Te),Re&&n&&I!==null&&I.l!==null&&(I.l.s??=[]).push(r),r}function Vt(e,t,n=!1){return V!==null&&(!Gn||V.f&131072)&&Ge()&&V.f&4325394&&(Jn===null||!Jn.has(e))&&Fe(),Wt(e,n?Jt(t):t,Ct)}var Ht=null,Ut=0;function Wt(e,t,n=null){if(!e.equals(t)){Un?It.set(e,t):It.has(e)||It.set(e,e.v);var r=Et.ensure();if(r.capture(e,t),e.f&2){let t=e;e.f&2048&&ft(t),z===null&&Xe(t)}e.wv=ir(),Ht=null,Ut=0,qt(e,y,n),Ht=null,Ge()&&H!==null&&H.f&1024&&!(H.f&96)&&(Qn===null?$n([e]):Qn.push(e)),!r.is_fork&&Ft.size>0&&!Lt&&Gt()}return t}function Gt(){Lt=!1;for(let e of Ft){e.f&1024&&L(e,b);let t;try{t=ar(e)}catch{t=!0}t&&dr(e)}Ft.clear()}function Kt(e){Vt(e,e.v+1)}function qt(e,t,n){var r=e.reactions;if(r!==null){var i=Ge(),a=r.length;if(Ut+=a,Ut>1e5&&Ht===null&&(Ht=new Set),Ht!==null){if(Ht.has(e))return;Ht.add(e)}for(var o=0;o<a;o++){var s=r[o],c=s.f;if(i||s!==H){var l=(c&y)===0;if(l&&L(s,t),c&131072)Ft.add(s);else if(c&2){var u=s;z?.delete(u),qt(u,b,n)}else if(l){var d=s;c&16&&Ot!==null&&Ot.add(d),n===null?Mt(d):n.push(d)}}}}}function Jt(t){if(typeof t!=`object`||!t||E in t||D in t)return t;let n=l(t);if(n!==s&&n!==c)return t;var r=new Map,i=e(t),o=zt(0),u=null,d=nr,f=e=>{if(nr===d)return e();var t=V,n=nr;Kn(null),rr(d);var r=e();return Kn(t),rr(n),r};return i&&r.set(`length`,zt(t.length,u)),new Proxy(t,{defineProperty(e,t,n){(!(`value`in n)||n.configurable===!1||n.enumerable===!1||n.writable===!1)&&Ne();var i=r.get(t);return i===void 0?f(()=>{var e=zt(n.value,u);return r.set(t,e),e}):Vt(i,n.value,!0),!0},deleteProperty(e,t){var n=r.get(t);if(n===void 0){if(t in e){let e=f(()=>zt(M,u));r.set(t,e),Kt(o)}}else Vt(n,M),Kt(o);return!0},get(e,n,i){if(n===E)return t;var o=r.get(n),s=n in e;if(o===void 0&&(!s||a(e,n)?.writable)&&(o=f(()=>zt(Jt(s?e[n]:M),u)),r.set(n,o)),o!==void 0){var c=U(o);return c===M?void 0:c}return Reflect.get(e,n,i)},getOwnPropertyDescriptor(e,t){this.has?.(e,t);var n=Reflect.getOwnPropertyDescriptor(e,t),i=r.get(t);if(i!==void 0){var a=U(i);if(a===M)return;if(n&&`value`in n)n.value=a;else return{enumerable:!0,configurable:!0,value:a,writable:!0}}return n},has(e,t){if(t===E)return!0;var n=r.get(t),i=n!==void 0&&n.v!==M||Reflect.has(e,t);return(n!==void 0||H!==null&&(!i||a(e,t)?.writable))&&(n===void 0&&(n=f(()=>zt(i?Jt(e[t]):M,u)),r.set(t,n)),U(n)===M)?!1:i},set(e,t,n,s){var c=r.get(t),l=t in e;if(i&&t===`length`)for(var d=n;d<c.v;d+=1){var p=r.get(d+``);p===void 0?d in e&&(p=f(()=>zt(M,u)),r.set(d+``,p)):Vt(p,M)}if(c===void 0)(!l||a(e,t)?.writable)&&(c=f(()=>zt(void 0,u)),Vt(c,Jt(n)),r.set(t,c));else{l=c.v!==M;var m=f(()=>Jt(n));Vt(c,m)}var h=Reflect.getOwnPropertyDescriptor(e,t);if(h?.set&&h.set.call(s,n),!l){if(i&&typeof t==`string`){var g=r.get(`length`),_=Number(t);Number.isInteger(_)&&_>=g.v&&Vt(g,_+1)}Kt(o)}return!0},ownKeys(e){U(o);var t=Reflect.ownKeys(e).filter(e=>{var t=r.get(e);return t===void 0||t.v!==M});for(var[n,i]of r)i.v!==M&&!(n in e)&&t.push(n);return t},setPrototypeOf(){Pe()}})}function Yt(e){try{if(typeof e==`object`&&e&&E in e)return e[E]}catch{}return e}function Xt(e,t){return Object.is(Yt(e),Yt(t))}var Zt,Qt,$t,en;function tn(){if(Zt===void 0){Zt=window,Qt=/Firefox/.test(navigator.userAgent);var e=Element.prototype,t=Node.prototype,n=Text.prototype;$t=a(t,`firstChild`).get,en=a(t,`nextSibling`).get,u(e)&&(e[ce]=void 0,e[O]=null,e[le]=void 0,e.__e=void 0),u(n)&&(n[ue]=void 0)}}function nn(e=``){return document.createTextNode(e)}function rn(e){return $t.call(e)}function an(e){return en.call(e)}function on(e,t){if(!P)return rn(e);var n=rn(F);if(n===null)n=F.appendChild(nn());else if(t&&n.nodeType!==3){var r=nn();return n?.before(r),_e(r),r}return t&&pn(n),_e(n),n}function sn(e,t=!1){if(!P){var n=rn(e);return n instanceof Comment&&n.data===``?an(n):n}if(t){if(F?.nodeType!==3){var r=nn();return F?.before(r),_e(r),r}pn(F)}return F}function cn(e,t=!1){if(!P)return rn(e);var n=on(e,t);return ye(e),n}function ln(e,t=1,n=!1){let r=P?F:e;for(var i;t--;)i=r,r=an(r);if(!P)return r;if(n){if(r?.nodeType!==3){var a=nn();return r===null?i?.after(a):r.before(a),_e(a),a}pn(r)}return _e(r),r}function un(e){e.textContent=``}function dn(){return!Le||Ot!==null?!1:(H.f&ee)!==0}function fn(e,t,n){return t==null||t===`http://www.w3.org/1999/xhtml`?n?document.createElement(e,{is:n}):document.createElement(e):n?document.createElementNS(t,e,{is:n}):document.createElementNS(t,e)}function pn(e){if(e.nodeValue.length<65536)return;let t=e.nextSibling;for(;t!==null&&t.nodeType===3;)t.remove(),e.nodeValue+=t.nodeValue,t=e.nextSibling}function mn(e){var t=H;if(t===null)return V.f|=T,e;if(!(t.f&32768)&&!(t.f&4))throw e;hn(e,t)}function hn(e,t){if(e===j)throw e;if(!(t!==null&&t.f&16384)){for(;t!==null;){if(t.f&128&&!(t.f&33570816)){if(!(t.f&32768))throw e;try{t.b.error(e);return}catch(t){e=t}}t=t.parent}throw e}}function gn(e){H===null&&(V===null&&Ae(e),ke()),Un&&Oe(e)}function _n(e,t){var n=t.last;n===null?t.last=t.first=e:(n.next=e,e.prev=n,t.last=e)}function vn(e,t){var n=H;n!==null&&n.f&8192&&(e|=x);var r={ctx:I,deps:null,nodes:null,f:e|y|512,first:null,fn:t,last:null,next:null,parent:n,b:n&&n.b,prev:null,teardown:null,wv:0,ac:null};R?.register_created_effect(r);var i=r;if(e&4)St===null?Et.ensure().schedule(r):St.push(r);else if(t!==null){try{dr(r)}catch(e){throw B(r),e}i.deps===null&&i.teardown===null&&i.nodes===null&&i.first===i.last&&!(i.f&524288)&&(i=i.first,e&16&&e&65536&&i!==null&&(i.f|=w))}if(i!==null&&(i.parent=n,n!==null&&_n(i,n),V!==null&&V.f&2&&!(e&64))){var a=V;(a.effects??=[]).push(i)}return r}function yn(){return V!==null&&!Gn}function bn(e){let t=vn(8,null);return L(t,v),t.teardown=e,t}function xn(e){gn(`$effect`);var t=H.f;if(!V&&t&32&&I!==null&&!I.i){var n=I;(n.e??=[]).push(e)}else return Sn(e)}function Sn(e){return vn(4|ne,e)}function Cn(e){return gn(`$effect.pre`),vn(8|ne,e)}function wn(e){Et.ensure();let t=vn(64|te,e);return(e={})=>new Promise(n=>{e.outro?Ln(t,()=>{B(t),n(void 0)}):(B(t),n(void 0))})}function Tn(e){return vn(4,e)}function En(e){return vn(ae|te,e)}function Dn(e,t=0){return vn(8|t,e)}function On(e,t=[],n=[],r=[]){nt(r,t,n,t=>{vn(8,()=>{e(...t.map(U))})})}function kn(e,t=0){return vn(16|t,e)}function An(e,t=0){return vn(_|t,e)}function jn(e){return vn(32|te,e)}function Mn(e){var t=e.teardown;if(t!==null){let n=Un,r=V;Wn(!0),Kn(null);try{t.call(null)}catch(t){hn(t,e.parent)}finally{Wn(n),Kn(r)}}}function Nn(e,t=!1){var n=e.first;for(e.first=e.last=null;n!==null;){let e=n.ac;e!==null&&tt(()=>{e.abort(k)});var r=n.next;n.f&64?n.parent=null:B(n,t),n=r}}function Pn(e){for(var t=e.first;t!==null;){var n=t.next;t.f&32||B(t),t=n}}function B(e,t=!0){var n=!1;(t||e.f&262144)&&e.nodes!==null&&e.nodes.end!==null&&(Fn(e.nodes.start,e.nodes.end),n=!0),e.f|=C,Nn(e,t&&!n),ur(e,0);var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)e.stop();Mn(e),e.f^=C,e.f|=S;var i=e.parent;i!==null&&i.first!==null&&In(e),e.next=e.prev=e.teardown=e.ctx=e.deps=e.fn=e.nodes=e.ac=e.b=null}function Fn(e,t){for(;e!==null;){var n=e===t?null:an(e);e.remove(),e=n}}function In(e){var t=e.parent,n=e.prev,r=e.next;n!==null&&(n.next=r),r!==null&&(r.prev=n),t!==null&&(t.first===e&&(t.first=r),t.last===e&&(t.last=n))}function Ln(e,t,n=!0){var r=[];e.f|=256,Rn(e,r,!0);var i=()=>{n&&B(e),t&&t()},a=r.length;if(a>0){var o=()=>--a||i();for(var s of r)s.out(o)}else i()}function Rn(e,t,n){if(!(e.f&8192)){e.f^=x;var r=e.nodes&&e.nodes.t;if(r!==null)for(let e of r)(e.is_global||n)&&t.push(e);for(var i=e.first;i!==null;){var a=i.next;if(!(i.f&64)){var o=!!(i.f&65536)||!!(i.f&32)&&!!(e.f&16);Rn(i,t,o?n:!1)}i=a}}}function zn(e){e.f&=-257,Bn(e,!0)}function Bn(e,t){if(!(e.f&256)&&e.f&8192){e.f^=x,e.f&1024||(L(e,y),Et.ensure().schedule(e));for(var n=e.first;n!==null;){var r=n.next,i=!!(n.f&65536)||!!(n.f&32);Bn(n,i?t:!1),n=r}var a=e.nodes&&e.nodes.t;if(a!==null)for(let e of a)(e.is_global||t)&&e.in()}}function Vn(e,t){if(e.nodes)for(var n=e.nodes.start,r=e.nodes.end;n!==null;){var i=n===r?null:an(n);t.append(n),n=i}}var Hn=null,Un=!1;function Wn(e){Un=e}var V=null,Gn=!1;function Kn(e){V=e}var H=null;function qn(e){H=e}var Jn=null;function Yn(e){V!==null&&(!Le&&V.f&2097152||V.f&2)&&(Jn??=new Set).add(e)}var Xn=null,Zn=0,Qn=null;function $n(e){Qn=e}var er=1,tr=0,nr=tr;function rr(e){nr=e}function ir(){return++er}function ar(e){var t=e.f;if(t&2048)return!0;if(t&4096){for(var n=e.deps,r=n.length,i=0;i<r;i++){var a=n[i];if(ar(a)&&pt(a),a.wv>e.wv)return!0}t&512&&z===null&&L(e,v)}return!1}function or(e,t,n=!0){var r=e.reactions;if(r!==null&&(Le||Jn===null||!Jn.has(e)))for(var i=0;i<r.length;i++){var a=r[i];a.f&2?or(a,t,!1):t===a&&(n?L(a,y):a.f&1024&&L(a,b),Mt(a))}}function sr(e){var t=Xn,n=Zn,r=Qn,i=V,a=Jn,o=I,s=Gn,c=nr,l=e.f;Xn=null,Zn=0,Qn=null,V=l&96?null:e,Jn=null,Ve(e.ctx),Gn=!1,nr=++tr,e.ac!==null&&(tt(()=>{e.ac.abort(k)}),e.ac=null);try{e.f|=ie;var u=e.fn,d=u();e.f|=ee;var f=cr(e);if(Ge()&&Qn!==null&&!Gn&&f!==null&&!(e.f&6146))for(var p=0;p<Qn.length;p++)or(Qn[p],e);if(i!==null&&i!==e){if(tr++,i.deps!==null)for(let e=0;e<n;e+=1)i.deps[e].rv=tr;if(t!==null)for(let e of t)e.rv=tr;Qn!==null&&(r===null?r=Qn:r.push(...Qn))}return e.f&8388608&&(e.f^=T),d}catch(t){return cr(e),mn(t)}finally{e.f^=ie,Xn=t,Zn=n,Qn=r,V=i,Jn=a,Ve(o),Gn=s,nr=c}}function cr(e){var t=e.deps,n=R?.is_fork;if(Xn!==null){var r;if(n||ur(e,Zn),t!==null&&Zn>0)for(t.length=Zn+Xn.length,r=0;r<Xn.length;r++)t[Zn+r]=Xn[r];else e.deps=t=Xn;if(yn()&&e.f&512)for(r=Zn;r<t.length;r++)(t[r].reactions??=[]).push(e)}else!n&&t!==null&&Zn<t.length&&(ur(e,Zn),t.length=Zn);return t}function lr(e,r){let i=r.reactions;if(i!==null){var a=t.call(i,e);if(a!==-1){var o=i.length-1;o===0?i=r.reactions=null:(i[a]=i[o],i.pop())}}if(i===null&&r.f&2&&(Xn===null||!n.call(Xn,r))){var s=r;s.f&512&&(s.f^=512),s.v!==M&&Xe(s),s.ac!==null&&tt(()=>{s.ac.abort(k),s.ac=null,L(s,y)}),mt(s),ur(s,0)}}function ur(e,t){var n=e.deps;if(n!==null)for(var r=t;r<n.length;r++)lr(e,n[r])}function dr(e){var t=e.f;if(!(t&16384)){L(e,v);var n=H;H=e;try{t&16777232?Pn(e):Nn(e),Mn(e);var r=sr(e);e.teardown=typeof r==`function`?r:null,e.wv=er}finally{H=n}}}function U(e){var t=!!(e.f&2);if(Hn?.add(e),V!==null&&!Gn&&!(H!==null&&H.f&16384)&&(Jn===null||!Jn.has(e))){var r=V.deps;if(V.f&2097152)e.rv<tr&&(e.rv=tr,Xn===null&&r!==null&&r[Zn]===e?Zn++:Xn===null?Xn=[e]:Xn.push(e));else{V.deps??=[],n.call(V.deps,e)||V.deps.push(e);var i=e.reactions;i===null?e.reactions=[V]:n.call(i,V)||i.push(V)}}if(Un&&It.has(e))return It.get(e);if(t){var a=e;if(Un){var o=a.v;return(!(a.f&1024)&&a.reactions!==null||pr(a))&&(o=ft(a)),It.set(a,o),o}var s=!(a.f&512)&&!Gn&&V!==null&&!!(V.f&512),c=(a.f&ee)===0;ar(a)&&(s&&(a.f|=512),pt(a)),s&&!c&&(ht(a),fr(a))}if(z?.has(e))return z.get(e);if(e.f&8388608)throw e.v;return e.v}function fr(e){if(e.f|=512,e.deps!==null)for(let r of e.deps){var t=r.reactions;t===null?r.reactions=[e]:n.call(t,e)||t.push(e),r.f&2&&!(r.f&512)&&(ht(r),fr(r))}}function pr(e){if(e.v===M)return!0;if(e.deps===null)return!1;for(let t of e.deps)if(It.has(t)||t.f&2&&pr(t))return!0;return!1}function mr(e){var t=Gn;try{return Gn=!0,e()}finally{Gn=t}}function hr(e){if(!(typeof e!=`object`||!e||e instanceof EventTarget)){if(E in e)gr(e);else if(!Array.isArray(e))for(let t in e){let n=e[t];typeof n==`object`&&n&&E in n&&gr(n)}}}function gr(e,t=new Set){if(typeof e==`object`&&e&&!(e instanceof EventTarget)&&!t.has(e)){t.add(e),e instanceof Date&&e.getTime();for(let n in e)try{gr(e[n],t)}catch{}let n=l(e);if(n!==Object.prototype&&n!==Array.prototype&&n!==Map.prototype&&n!==Set.prototype&&n!==Date.prototype){let t=o(n);for(let n in t){let r=t[n].get;if(r)try{r.call(e)}catch{}}}}}function _r(e){return e.endsWith(`capture`)&&e!==`gotpointercapture`&&e!==`lostpointercapture`}var vr=[`beforeinput`,`click`,`change`,`dblclick`,`contextmenu`,`focusin`,`focusout`,`input`,`keydown`,`keyup`,`mousedown`,`mousemove`,`mouseout`,`mouseover`,`mouseup`,`pointerdown`,`pointermove`,`pointerout`,`pointerover`,`pointerup`,`touchend`,`touchmove`,`touchstart`];function yr(e){return vr.includes(e)}var br=`allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback`.split(`.`),xr={formnovalidate:`formNoValidate`,ismap:`isMap`,nomodule:`noModule`,playsinline:`playsInline`,readonly:`readOnly`,defaultvalue:`defaultValue`,defaultchecked:`defaultChecked`,srcobject:`srcObject`,novalidate:`noValidate`,allowfullscreen:`allowFullscreen`,disablepictureinpicture:`disablePictureInPicture`,disableremoteplayback:`disableRemotePlayback`};function Sr(e){return e=e.toLowerCase(),xr[e]??e}[...br];var Cr=[`touchstart`,`touchmove`];function wr(e){return Cr.includes(e)}var Tr=Symbol(`events`),Er=new Set,Dr=new Set;function Or(e,t,n,r={}){function i(e){if(r.capture||Fr.call(t,e),!e.cancelBubble)return tt(()=>n?.call(this,e))}return e.startsWith(`pointer`)||e.startsWith(`touch`)||e===`wheel`?(i.__removed=!1,Je(()=>{i.__removed||t.addEventListener(e,i,r)})):t.addEventListener(e,i,r),i}function kr(e,t,n,r={}){var i=Or(t,e,n,r);return()=>{i.__removed=!0,e.removeEventListener(t,i,r)}}function Ar(e,t,n,r,i){var a={capture:r,passive:i},o=Or(e,t,n,a);(t===document.body||t===window||t===document||t instanceof HTMLMediaElement)&&bn(()=>{o.__removed=!0,t.removeEventListener(e,o,a)})}function jr(e,t,n){(t[Tr]??={})[e]=n}function Mr(e){for(var t=0;t<e.length;t++)Er.add(e[t]);for(var n of Dr)n(e)}var Nr=null,Pr=!1;function Fr(e){var t=this,n=t.ownerDocument,r=e.type,a=e.composedPath?.()||[],o=a[0]||e.target;Nr=e,Pr||(Pr=!0,setTimeout(()=>{Pr=!1,Nr=null}));var s=0,c=Nr===e&&e[Tr];if(c){var l=a.indexOf(c);if(l!==-1&&(t===document||t===window)){e[Tr]=t;return}var u=a.indexOf(t);if(u===-1)return;l<=u&&(s=l)}if(o=a[s]||e.target,o!==t){i(e,`currentTarget`,{configurable:!0,get(){return o||n}});var d=V,f=H;Kn(null),qn(null);try{for(var p,m=[];o!==null&&o!==t;){try{var h=o[Tr]?.[r];h!=null&&(!o.disabled||e.target===o)&&h.call(o,e)}catch(e){p?m.push(e):p=e}if(e.cancelBubble)break;s++,o=s<a.length?a[s]:null}if(p){for(let e of m)queueMicrotask(()=>{throw e});throw p}}finally{e[Tr]=t,delete e.currentTarget,Kn(d),qn(f)}}}var Ir=globalThis?.window?.trustedTypes&&globalThis.window.trustedTypes.createPolicy(`svelte-trusted-html`,{createHTML:e=>e});function Lr(e){return Ir?.createHTML(e)??e}function Rr(e){var t=fn(`template`);return t.innerHTML=Lr(e.replaceAll(`<!>`,`<!---->`)),t.content}function zr(e,t){var n=H;n.nodes===null&&(n.nodes={start:e,end:t,a:null,t:null})}function Br(e,t){var n=!!(t&1),r=!!(t&2),i,a=!e.startsWith(`<!>`);return()=>{if(P)return zr(F,null),F;i===void 0&&(i=Rr(a?e:`<!>`+e),n||(i=rn(i)));var t=r||Qt?document.importNode(i,!0):i.cloneNode(!0);if(n){var o=rn(t),s=t.lastChild;zr(o,s)}else zr(t,t);return t}}function Vr(e,t,n=`svg`){var r=!e.startsWith(`<!>`),i=!!(t&1),a=`<${n}>${r?e:`<!>`+e}</${n}>`,o;return()=>{if(P)return zr(F,null),F;if(!o){var e=rn(Rr(a));if(i)for(o=document.createDocumentFragment();rn(e);)o.appendChild(rn(e));else o=rn(e)}var t=o.cloneNode(!0);if(i){var n=rn(t),r=t.lastChild;zr(n,r)}else zr(t,t);return t}}function Hr(e,t){return Vr(e,t,`svg`)}function Ur(e=``){if(!P){var t=nn(e+``);return zr(t,t),t}var n=F;return n.nodeType===3?pn(n):(n.before(n=nn()),_e(n)),zr(n,n),n}function Wr(){if(P)return zr(F,null),F;var e=document.createDocumentFragment(),t=document.createComment(``),n=nn();return e.append(t,n),zr(t,n),e}function Gr(e,t){if(P){var n=H;(!(n.f&32768)||n.nodes.end===null)&&(n.nodes.end=F),ve();return}e!==null&&e.before(t)}function Kr(){if(P&&F&&F.nodeType===8&&F.textContent?.startsWith(`$`)){let e=F.textContent.substring(1);return ve(),e}return(window.__svelte??={}).uid??=1,`c${window.__svelte.uid++}`}function qr(e){let t=0,n=Rt(0),r;return()=>{yn()&&(U(n),Dn(()=>(t===0&&(r=mr(()=>e(()=>Kt(n)))),t+=1,()=>{Je(()=>{--t,t===0&&(r?.(),r=void 0,Kt(n))})})))}}var Jr=w|te;function Yr(e,t,n,r){new Xr(e,t,n,r)}var Xr=class{parent;is_pending=!1;transform_error;#e;#t=P?F:null;#n;#r;#i;#a=null;#o=null;#s=null;#c=null;#l=0;#u=0;#d=!1;#f=new Set;#p=new Set;#m=null;#h=qr(()=>(this.#m=Rt(this.#l),()=>{this.#m=null}));constructor(e,t,n,r){this.#e=e,this.#n=t,this.#r=e=>{var t=H;t.b=this,t.f|=128,n(e)},this.parent=H.b,this.transform_error=r??this.parent?.transform_error??(e=>e),this.#i=kn(()=>{if(P){let e=Se(this.#t);ve();let t=e===`[!`;if(e.startsWith(`[?`)){let t=JSON.parse(e.slice(2));this.#_(t)}else t?this.#b():this.#g()}else this.#x()},Jr),P&&(this.#e=F)}#g(){try{this.#a=jn(()=>this.#r(this.#e))}catch(e){this.error(e)}}#_(e){let t=this.#n.failed,{reset:n,invoke_onerror:r}=this.#v(e);Je(r),t&&(this.#s=jn(()=>{t(this.#e,()=>e,()=>n)}))}#v(e){var t=!1,n=!1;let r=()=>{if(!this.#y()){if(t){he();return}t=!0,n&&Ie(),this.#s!==null&&Ln(this.#s,()=>{this.#s=null}),this.#C(()=>{this.#x()})}};return{reset:r,invoke_onerror:()=>{if(!this.#y())try{n=!0,this.#n.onerror?.(e,r),n=!1}catch(e){hn(e,this.#i&&this.#i.parent)}}}}#y(){return(this.#i.f&(S|C))!==0}#b(){let e=this.#n.pending;e&&(this.is_pending=!0,this.#o=jn(()=>e(this.#e)),Je(()=>{if(!this.#y()){var e=this.#c=document.createDocumentFragment(),t=nn(),n=!1;if(e.append(t),this.#a=this.#C(()=>{try{return jn(()=>this.#r(t))}catch(e){try{this.error(e),n=!0}catch(e){hn(e,this.#i.parent)}return null}}),this.#a===null){this.#c=null,n&&this.#S(R);return}this.#u===0&&(this.#e.before(e),this.#c=null,Ln(this.#o,()=>{this.#o=null}),this.#S(R))}}))}#x(){try{if(this.is_pending=this.has_pending_snippet(),this.#u=0,this.#l=0,this.#a=jn(()=>{this.#r(this.#e)}),this.#u>0){var e=this.#c=document.createDocumentFragment();Vn(this.#a,e);let t=this.#n.pending;this.#o=jn(()=>t(this.#e))}else this.#S(R)}catch(e){this.error(e)}}#S(e){this.is_pending=!1,e.transfer_effects(this.#f,this.#p)}defer_effect(e){Ze(e,this.#f,this.#p)}is_rendered(){return!this.is_pending&&(!this.parent||this.parent.is_rendered())}has_pending_snippet(){return!!this.#n.pending}#C(e){var t=H,n=V,r=I;qn(this.#i),Kn(this.#i),Ve(this.#i.ctx);try{return Et.ensure(),e()}finally{qn(t),Kn(n),Ve(r)}}#w(e,t){if(!this.has_pending_snippet()){this.parent&&this.parent.#w(e,t);return}this.#u+=e,this.#u===0&&(this.#S(t),this.#o&&Ln(this.#o,()=>{this.#o=null}),this.#c&&=(this.#e.before(this.#c),null))}update_pending_count(e,t){this.#w(e,t),this.#l+=e,!(!this.#m||this.#d)&&(this.#d=!0,Je(()=>{this.#d=!1,this.#m&&Wt(this.#m,this.#l)}))}get_effect_pending(){return this.#h(),U(this.#m)}error(e){if(e===j||!this.#n.onerror&&!this.#n.failed)throw e;R?.is_fork?(this.#a&&R.skip_effect(this.#a),this.#o&&R.skip_effect(this.#o),this.#s&&R.skip_effect(this.#s),R.oncommit(()=>{this.#y()||this.#T(e)})):this.#T(e)}#T(e){this.#a&&=(B(this.#a),null),this.#o&&=(B(this.#o),null),this.#s&&=(B(this.#s),null),P&&(_e(this.#t),be(),_e(xe()));let t=this.#n.failed,n=e=>{if(this.#y())return;let{reset:n,invoke_onerror:r}=this.#v(e);r(),t&&!this.#y()&&(this.#s=this.#C(()=>{try{return jn(()=>{var r=H;r.b=this,r.f|=128,t(this.#e,()=>e,()=>n)})}catch(e){return hn(e,this.#i.parent),null}}))};Je(()=>{if(!this.#y()){var t;try{t=this.transform_error(e)}catch(e){hn(e,this.#i&&this.#i.parent);return}typeof t==`object`&&t&&typeof t.then==`function`?t.then(n,e=>hn(e,this.#i&&this.#i.parent)):n(t)}})}},Zr=!0;function Qr(e,t){var n=t==null?``:typeof t==`object`?`${t}`:t;n!==(e[ue]??=e.nodeValue)&&(e[ue]=n,e.nodeValue=`${n}`)}function $r(e,t){return ti(e,t)}var ei=new Map;function ti(e,{target:t,anchor:n,props:i={},events:a,context:o,intro:s=!0,transformError:c}){tn();var l=void 0,u=wn(()=>{var u=n??t.appendChild(nn());Yr(u,{pending:()=>{}},t=>{He({});var n=I;if(o&&(n.c=o),a&&(i.$$events=a),P&&zr(t,null),Zr=s,l=e(t,i)||We(),Zr=!0,P&&(H.nodes.end=F,F===null||F.nodeType!==8||F.data!==`]`))throw pe(),j;Ue()},c);var d=new Set,f=e=>{for(var n=0;n<e.length;n++){var r=e[n];if(!d.has(r)){d.add(r);var i=wr(r);for(let e of[t,document]){var a=ei.get(e);a===void 0&&(a=new Map,ei.set(e,a));var o=a.get(r);o===void 0?(e.addEventListener(r,Fr,{passive:i}),a.set(r,1)):a.set(r,o+1)}}}};return f(r(Er)),Dr.add(f),()=>{for(var e of d)for(let n of[t,document]){var r=ei.get(n),i=r.get(e);--i==0?(n.removeEventListener(e,Fr),r.delete(e),r.size===0&&ei.delete(n)):r.set(e,i)}Dr.delete(f),u!==n&&u.parentNode?.removeChild(u)}});return ni.set(l,u),l}var ni=new WeakMap,ri=class{anchor;#e=new Map;#t=new Map;#n=new Map;#r=new Set;#i=!0;constructor(e,t=!0){this.anchor=e,this.#i=t}#a=e=>{if(this.#e.has(e)){var t=this.#e.get(e),n=this.#t.get(t);if(n)zn(n),this.#r.delete(t);else{var r=this.#n.get(t);r&&(zn(r.effect),this.#t.set(t,r.effect),this.#n.delete(t),r.fragment.lastChild.remove(),this.anchor.before(r.fragment),n=r.effect)}for(let[t,n]of this.#e){if(this.#e.delete(t),t===e)break;let r=this.#n.get(n);r&&(B(r.effect),this.#n.delete(n))}for(let[e,r]of this.#t){if(e===t||this.#r.has(e))continue;let i=()=>{if(Array.from(this.#e.values()).includes(e)){var t=document.createDocumentFragment();Vn(r,t),t.append(nn()),this.#n.set(e,{effect:r,fragment:t})}else B(r);this.#r.delete(e),this.#t.delete(e)};this.#i||!n?(this.#r.add(e),Ln(r,i,!1)):i()}}};#o=e=>{this.#e.delete(e);let t=Array.from(this.#e.values());for(let[e,n]of this.#n)t.includes(e)||(B(n.effect),this.#n.delete(e))};ensure(e,t){var n=R,r=dn();if(t&&!this.#t.has(e)&&!this.#n.has(e)){if(r){var i=document.createDocumentFragment(),a=nn();i.append(a),this.#n.set(e,{effect:jn(()=>t(a)),fragment:i})}else this.#t.set(e,jn(()=>t(this.anchor)))}if(this.#e.set(n,e),r){for(let[t,r]of this.#t)t===e?n.unskip_effect(r):n.skip_effect(r);for(let[t,r]of this.#n)t===e?n.unskip_effect(r.effect):n.skip_effect(r.effect);n.oncommit(this.#a),n.ondiscard(this.#o)}else P&&(this.anchor=F),this.#a(n)}};function ii(e,t,n=!1){var r;P&&(r=F,ve());var i=new ri(e),a=n?w:0;function o(e,t){if(P){var n=Se(r);if(e!==parseInt(n.substring(1))){var a=xe();_e(a),i.anchor=a,ge(!1),i.ensure(e,t),ge(!0);return}}i.ensure(e,t)}kn(()=>{var e=!1;t((t,n=0)=>{e=!0,o(n,t)}),e||o(-1,null)},a)}var ai=Symbol(`NaN`);function oi(e,t,n){P&&ve();var r=new ri(e),i=!Ge();kn(()=>{var e=t();e!==e&&(e=ai),i&&typeof e==`object`&&e&&(e={}),r.ensure(e,n)})}function si(e,t){return t}function ci(e,t,n){for(var i=[],a=t.length,o,s=t.length,c=0;c<a;c++){let n=t[c];Ln(n,()=>{if(o){if(o.pending.delete(n),o.done.add(n),o.pending.size===0){var t=e.outrogroups;li(e,r(o.done)),t.delete(o),t.size===0&&(e.outrogroups=null)}}else--s},!1)}if(s===0){var l=i.length===0&&n!==null&&e.pending.size===0;if(l){var u=n,d=u.parentNode;un(d),d.append(u),e.items.clear()}li(e,t,!l)}else o={pending:new Set(t),done:new Set},(e.outrogroups??=new Set).add(o)}function li(e,t,n=!0){var r;if(e.pending.size>0){r=new Set;for(let t of e.pending.values())for(let n of t)r.add(e.items.get(n).e)}for(var i=0;i<t.length;i++){var a=t[i];r?.has(a)?(a.f|=re,Vn(a,document.createDocumentFragment())):B(t[i],n)}}var ui;function di(t,n,i,a,o,s=null){var c=t,l=new Map;if(n&4){var u=t;c=P?_e(rn(u)):u.appendChild(nn())}P&&ve();var d=null,f=ut(()=>{var t=i();return e(t)?t:t==null?[]:r(t)}),p=new Map,m=!0;function h(e){if(!(_.effect.f&16384)){_.pending.delete(e);var t=U(f);_.fallback=d,pi(_,t,c,n,a),d!==null&&(t.length===0?d.f&33554432?(d.f^=re,hi(d,null,c)):zn(d):Ln(d,()=>{d=null}))}}function g(e){_.pending.delete(e)}var _={effect:kn(()=>{var e=U(f),t=e.length;let r=!1;P&&Se(c)===`[!`!=(t===0)&&(c=xe(),_e(c),ge(!1),r=!0);for(var u=new Set,_=R,v=dn(),y=0;y<t;y+=1){P&&F.nodeType===8&&F.data===`]`&&(c=F,r=!0,ge(!1));var b=e[y],x=a(b,y),S=m?null:l.get(x);S?(S.v&&Wt(S.v,b),S.i&&Wt(S.i,y),v&&_.unskip_effect(S.e)):(S=mi(l,m?c:ui??=nn(),b,x,y,o,n,i),m||(S.e.f|=re),l.set(x,S)),u.add(x)}if(t===0&&s&&!d&&(m?d=jn(()=>s(c)):(d=jn(()=>s(ui??=nn())),d.f|=re)),t>u.size&&De(``,``,``),P&&t>0&&_e(xe()),!m){if(p.set(_,u),v){for(let[e,t]of l)u.has(e)||_.skip_effect(t.e);_.oncommit(h),_.ondiscard(g)}else h(_)}r&&ge(!0),U(f)}),flags:n,items:l,pending:p,outrogroups:null,fallback:d};m=!1,P&&(c=F)}function fi(e){for(;e!==null&&!(e.f&32);)e=e.next;return e}function pi(e,t,n,i,a){var o=!!(i&8),s=t.length,c=e.items,l=fi(e.effect.first),u,d=null,f,p=[],m=[],h,g,_,v;if(o)for(v=0;v<s;v+=1)h=t[v],g=a(h,v),_=c.get(g).e,_.f&33554432||(_.nodes?.a?.measure(),(f??=new Set).add(_));for(v=0;v<s;v+=1){if(h=t[v],g=a(h,v),_=c.get(g).e,e.outrogroups!==null)for(let t of e.outrogroups)t.pending.delete(_),t.done.delete(_);if(_.f&8192&&(zn(_),o&&(_.nodes?.a?.unfix(),(f??=new Set).delete(_))),_.f&33554432){if(_.f^=re,_===l)hi(_,null,n);else{var y=d?d.next:l;_===e.effect.last&&(e.effect.last=_.prev),_.prev&&(_.prev.next=_.next),_.next&&(_.next.prev=_.prev),gi(e,d,_),gi(e,_,y),hi(_,y,n),d=_,p=[],m=[],l=fi(d.next);continue}}if(_!==l){if(u!==void 0&&u.has(_)){if(p.length<m.length){var b=m[0],x;d=b.prev;var S=p[0],ee=p[p.length-1];for(x=0;x<p.length;x+=1)hi(p[x],b,n);for(x=0;x<m.length;x+=1)u.delete(m[x]);gi(e,S.prev,ee.next),gi(e,d,S),gi(e,ee,b),l=b,d=ee,--v,p=[],m=[]}else u.delete(_),hi(_,l,n),gi(e,_.prev,_.next),gi(e,_,d===null?e.effect.first:d.next),gi(e,d,_),d=_;continue}for(p=[],m=[];l!==null&&l!==_;)(u??=new Set).add(l),m.push(l),l=fi(l.next);if(l===null)continue}_.f&33554432||p.push(_),d=_,l=fi(_.next)}if(e.outrogroups!==null){for(let t of e.outrogroups)t.pending.size===0&&(li(e,r(t.done)),e.outrogroups?.delete(t));e.outrogroups.size===0&&(e.outrogroups=null)}if(l!==null||u!==void 0){var C=[];if(u!==void 0)for(_ of u)_.f&8192||C.push(_);for(;l!==null;)!(l.f&8192)&&l!==e.fallback&&C.push(l),l=fi(l.next);var w=C.length;if(w>0){var te=i&4&&s===0?n:null;if(o){for(v=0;v<w;v+=1)C[v].nodes?.a?.measure();for(v=0;v<w;v+=1)C[v].nodes?.a?.fix()}ci(e,C,te)}}o&&Je(()=>{if(f!==void 0)for(_ of f)_.nodes?.a?.apply()})}function mi(e,t,n,r,i,a,o,s){var c=o&1?o&16?Rt(n):Bt(n,!1,!1):null,l=o&2?Rt(i):null;return{v:c,i:l,e:jn(()=>(a(t,c??n,l??i,s),()=>{e.delete(r)}))}}function hi(e,t,n){if(e.nodes)for(var r=e.nodes.start,i=e.nodes.end,a=t&&!(t.f&33554432)?t.nodes.start:n;r!==null;){var o=an(r);if(a.before(r),r===i)return;r=o}}function gi(e,t,n){t===null?e.effect.first=n:t.next=n,n===null?e.effect.last=t:n.prev=t}function _i(e,t,...n){var r=new ri(e);kn(()=>{let e=t()??null;r.ensure(e,e&&(t=>e(t,...n)))},w)}function vi(e,t,n){var r;P&&(r=F,ve());var i=new ri(e);kn(()=>{var e=t()??null;if(P&&Se(r)===`[`!=(e!==null)){var a=xe();_e(a),i.anchor=a,ge(!1),i.ensure(e,e&&(t=>n(t,e))),ge(!0);return}i.ensure(e,e&&(t=>n(t,e)))},w)}var yi=()=>performance.now(),bi={tick:e=>requestAnimationFrame(e),now:()=>yi(),tasks:new Set};function xi(){let e=bi.now();bi.tasks.forEach(t=>{t.c(e)||(bi.tasks.delete(t),t.f())}),bi.tasks.size!==0&&bi.tick(xi)}function Si(e){let t;return bi.tasks.size===0&&bi.tick(xi),{promise:new Promise(n=>{bi.tasks.add(t={c:e,f:n})}),abort(){bi.tasks.delete(t)}}}function Ci(e,t){tt(()=>{e.dispatchEvent(new CustomEvent(t))})}function wi(e){if(e===`float`)return`cssFloat`;if(e===`offset`)return`cssOffset`;if(e.startsWith(`--`))return e;let t=e.split(`-`);return t.length===1?t[0]:t[0]+t.slice(1).map(e=>e[0].toUpperCase()+e.slice(1)).join(``)}function Ti(e){let t={},n=e.split(`;`);for(let e of n){let[n,r]=e.split(`:`);if(!n||r===void 0)break;let i=wi(n.trim());t[i]=r.trim()}return t}var Ei=e=>e;function Di(e,t,n,r){var i=!!(e&1),a=!!(e&2),o=i&&a,s=!!(e&4),c=o?`both`:i?`in`:`out`,l,u=t.inert,d=t.style.overflow,f,p;function m(){return tt(()=>l??=n()(t,r?.()??{},{direction:c}))}var h={is_global:s,in(){if(t.inert=u,!i){p?.abort(),p?.reset?.();return}a||f?.abort(),f=Oi(t,m(),p,1,()=>{Ci(t,`introstart`)},()=>{Ci(t,`introend`),f?.abort(),f=l=void 0,t.style.overflow=d})},out(e){if(!a){e?.(),l=void 0;return}t.inert=!0,p=Oi(t,m(),f,0,()=>{Ci(t,`outrostart`)},()=>{Ci(t,`outroend`),e?.()})},stop:()=>{f?.abort(),p?.abort()}},g=H;if((g.nodes.t??=[]).push(h),i&&Zr){var _=s;if(!_){for(var v=g.parent;v&&v.f&65536;)for(;(v=v.parent)&&!(v.f&16););_=!v||!!(v.f&32768)}_&&Tn(()=>{mr(()=>h.in())})}}function Oi(e,t,n,r,i,a){var o=r===1,s=!1;if(d(t)){var c;return Je(()=>{s||(c=Oi(e,t({direction:o?`in`:`out`}),n,r,i,a))}),{abort:()=>{s=!0,c?.abort()},deactivate:()=>c?.deactivate(),reset:()=>c?.reset(),t:()=>c?.t()??1-r}}if(n?.deactivate(),!t?.duration&&!t?.delay)return i(),a(),{abort:f,deactivate:f,reset:f,t:()=>r};let{delay:l=0,css:u,tick:p,easing:m=Ei}=t;var h,g=()=>1-r;return Je(()=>{if(!s){var c=[];if(o&&n===void 0&&(p&&p(0,1),u)){var d=Ti(u(0,1));c.push(d,d)}h=e.animate(c,{duration:l,fill:`forwards`}),h.onfinish=()=>{h.cancel(),i();var o=n?.t()??1-r;n?.abort();var s=r-o,c=t.duration*Math.abs(s),l=[];if(c>0){var d=!1;if(u)for(var f=Math.ceil(c/(1e3/60)),_=0;_<=f;_+=1){var v=o+s*m(_/f),y=Ti(u(v,1-v));l.push(y),d||=y.overflow===`hidden`}d&&(e.style.overflow=`hidden`),g=()=>{var e=h.currentTime;return o+s*m(e/c)},p&&Si(()=>{if(h.playState!==`running`)return!1;var e=g();return p(e,1-e),!0})}h=e.animate(l,{duration:c,fill:`forwards`}),h.onfinish=()=>{g=()=>r,p?.(r,1-r),a()}}}}),{abort:()=>{s=!0,h&&(h.cancel(),h.effect=null,h.onfinish=f)},deactivate:()=>{a=f},reset:()=>{r===0&&p?.(1,0)},t:()=>g()}}function ki(e,t){var n=void 0,r;An(()=>{n!==(n=t())&&(r&&=(B(r),null),n&&(r=jn(()=>{Tn(()=>n(e))})))})}function Ai(e){var t,n,r=``;if(typeof e==`string`||typeof e==`number`)r+=e;else if(typeof e==`object`){if(Array.isArray(e)){var i=e.length;for(t=0;t<i;t++)e[t]&&(n=Ai(e[t]))&&(r&&(r+=` `),r+=n)}else for(n in e)e[n]&&(r&&(r+=` `),r+=n)}return r}function ji(){for(var e,t,n=0,r=``,i=arguments.length;n<i;n++)(e=arguments[n])&&(t=Ai(e))&&(r&&(r+=` `),r+=t);return r}function Mi(e){return typeof e==`object`?ji(e):e??``}var Ni=[...` 	
\r\f\xA0\v﻿`];function Pi(e,t,n){var r=e==null?``:``+e;if(t&&(r=r?r+` `+t:t),n){for(var i of Object.keys(n))if(n[i])r=r?r+` `+i:i;else if(r.length)for(var a=i.length,o=0;(o=r.indexOf(i,o))>=0;){var s=o+a;(o===0||Ni.includes(r[o-1]))&&(s===r.length||Ni.includes(r[s]))?r=(o===0?``:r.substring(0,o))+r.substring(s+1):o=s}}return r===``?null:r}function Fi(e,t=!1){var n=t?` !important;`:`;`,r=``;for(var i of Object.keys(e)){var a=e[i];a!=null&&a!==``&&(r+=` `+i+`: `+a+n)}return r}function Ii(e){return e[0]!==`-`||e[1]!==`-`?e.toLowerCase():e}function Li(e,t){if(t){var n=``,r,i;if(Array.isArray(t)?(r=t[0],i=t[1]):r=t,e){e=String(e).replaceAll(/\/\*.*?\*\//g,``).trim();var a=!1,o=0,s=!1,c=[];r&&c.push(...Object.keys(r).map(Ii)),i&&c.push(...Object.keys(i).map(Ii));var l=0,u=-1;let t=e.length;for(var d=0;d<t;d++){var f=e[d];if(s?f===`/`&&e[d-1]===`*`&&(s=!1):a?a===f&&(a=!1):f===`/`&&e[d+1]===`*`?s=!0:f===`"`||f===`'`?a=f:f===`(`?o++:f===`)`&&o--,!s&&a===!1&&o===0){if(f===`:`&&u===-1)u=d;else if(f===`;`||d===t-1){if(u!==-1){var p=Ii(e.substring(l,u).trim());if(!c.includes(p)){f!==`;`&&d++;var m=e.substring(l,d).trim();n+=` `+m+`;`}}l=d+1,u=-1}}}}return r&&(n+=Fi(r)),i&&(n+=Fi(i,!0)),n=n.trim(),n===``?null:n}return e==null?null:String(e)}function Ri(e,t,n,r,i,a){var o=e[ce];if(P||o!==n||o===void 0){var s=Pi(n,r,a);(!P||s!==e.getAttribute(`class`))&&(s==null?e.removeAttribute(`class`):t?e.className=s:e.setAttribute(`class`,s)),e[ce]=n}else if(a&&i!==a)for(var c in a){var l=!!a[c];(i==null||l!==!!i[c])&&e.classList.toggle(c,l)}return a}function zi(e,t={},n,r){for(var i in n){var a=n[i];t[i]!==a&&(n[i]==null?e.style.removeProperty(i):e.style.setProperty(i,a,r))}}function Bi(e,t,n,r){var i=e[le];if(P||i!==t){var a=Li(t,r);(!P||a!==e.getAttribute(`style`))&&(a==null?e.removeAttribute(`style`):e.style.cssText=a),e[le]=t}else r&&(Array.isArray(r)?(zi(e,n?.[0],r[0]),zi(e,n?.[1],r[1],`important`)):zi(e,n,r));return r}function Vi(e,t){t?e.hasAttribute(`selected`)||e.setAttribute(`selected`,``):e.removeAttribute(`selected`)}function Hi(e,t){var n=!(`__defaultValue`in e);(n||e.__defaultValue!==t)&&(e.__defaultValue=t,Ui(e,!n||`__value`in e))}function Ui(t,n){var r=t.__defaultValue,i=t.multiple,a=i?r??[]:null;if(!i||e(a)){var o=t.selectedIndex,s=n&&i?new Set(t.selectedOptions):null;for(var c of t.options){var l=Ki(c);Vi(c,i?a.includes(l):Xt(l,r))}if(n){if(s!==null)for(c of t.options){var u=s.has(c);c.selected!==u&&(c.selected=u)}else t.selectedIndex!==o&&(t.selectedIndex=o)}}}function Wi(t,n,r=!1){if(t.multiple){if(n==null)return;if(!e(n))return me();for(var i of t.options)i.selected=n.includes(Ki(i));return}for(i of t.options)if(Xt(Ki(i),n)){i.selected=!0;return}(!r||n!==void 0)&&(t.selectedIndex=-1)}function Gi(e){var t=new MutationObserver(t=>{t.every(qi)||(`__defaultValue`in e&&Ui(e,!1),`__value`in e&&Wi(e,e.__value))});t.observe(e,{childList:!0,subtree:!0,attributes:!0,attributeFilter:[`value`]}),bn(()=>{t.disconnect()})}function Ki(e){return`__value`in e?e.__value:e.value}function qi(e){if(e.target.closest(`selectedcontent`)!==null)return!0;if(e.type===`childList`){var t=[...e.addedNodes,...e.removedNodes];return t.length>0&&t.every(e=>e.nodeName===`SELECTEDCONTENT`)}return!1}var Ji=Symbol(`class`),Yi=Symbol(`style`),Xi=Symbol(`is custom element`),Zi=Symbol(`is html`),Qi=A?`link`:`LINK`,$i=A?`input`:`INPUT`,ea=A?`option`:`OPTION`,ta=A?`select`:`SELECT`,na=A?`progress`:`PROGRESS`;function ra(e){if(P){var t=!1,n=()=>{if(!t){if(t=!0,e.hasAttribute(`value`)){var n=e.value;ia(e,`value`,null),e.value=n}if(e.hasAttribute(`checked`)){var r=e.checked;ia(e,`checked`,null),e.checked=r}}};e[de]=n,Je(n),et()}}function ia(e,t,n,r){var i=sa(e);P&&(i[t]=e.getAttribute(t),t===`src`||t===`srcset`||t===`href`&&e.nodeName===Qi)||i[t]!==(i[t]=n)&&(t===`loading`&&(e[se]=n),n==null?e.removeAttribute(t):typeof n!=`string`&&la(e).has(t)?e[t]=n:e.setAttribute(t,n))}function aa(e,t,n,r,i=!1,a=!1){P&&i&&e.nodeName===$i&&(`defaultValue`in n||`defaultChecked`in n||ra(e));var o=sa(e),s=o[Xi],c=!o[Zi];let l=P&&s;l&&ge(!1);var u=t||{},d=e.nodeName===ea,f=e.nodeName===ta;try{for(var p in t)!(p in n)&&p[0]+p[1]!==`$$`&&(n[p]=null);n.class?n.class=Mi(n.class):(r||n[Ji])&&(n.class=null),n[Yi]&&(n.style??=null);var m=la(e);if(e.nodeName===$i&&`type`in n&&(`value`in n||`__value`in n)){var h=n.type;(h!==u.type||h===void 0&&e.hasAttribute(`type`))&&(u.type=h,ia(e,`type`,h,a))}for(let i in n){let l=n[i];if(d&&i===`value`&&l==null){e.value=e.__value=``,u[i]=l;continue}if(i===`class`){Ri(e,e.namespaceURI===`http://www.w3.org/1999/xhtml`,l,r,t?.[Ji],n[Ji]),u[i]=l,u[Ji]=n[Ji];continue}if(i===`style`){Bi(e,l,t?.[Yi],n[Yi]),u[i]=l,u[Yi]=n[Yi];continue}var g=u[i];if(l!==g||l===void 0&&e.hasAttribute(i)){u[i]=l;var _=i[0]+i[1];if(_!==`$$`){if(_===`on`){let t={},n=`$$`+i,r=i.slice(2);var v=yr(r);if(_r(r)&&(r=r.slice(0,-7),t.capture=!0),!v&&g){if(l!=null)continue;e.removeEventListener(r,u[n],t),u[n]=null}if(v)jr(r,e,l),Mr([r]);else if(l!=null){function a(e){u[i].call(this,e)}u[n]=Or(r,e,a,t)}}else if(i===`style`)ia(e,i,l);else if(i===`autofocus`)Qe(e,!!l);else if(!s&&(i===`__value`||i===`value`&&l!=null))e.__value=l,(g==null||e.value!==l||l===0&&e.nodeName===na)&&(e.value=l);else if(i===`selected`&&d)Vi(e,l);else{var y=i;c||(y=Sr(y));var b=y===`defaultValue`||y===`defaultChecked`;if(f&&y===`defaultValue`)continue;if(l==null&&!s&&!b){if(o[i]=null,y===`value`||y===`checked`){let n=e,r=t===void 0;if(y===`value`){let e=n.defaultValue;n.removeAttribute(y),n.defaultValue=e,n.value=n.__value=r?e:null}else{let e=n.defaultChecked;n.removeAttribute(y),n.defaultChecked=e,n.checked=r?e:!1}}else e.removeAttribute(i)}else b||(s||typeof l!=`string`)&&m.has(y)?(e[y]=l,y in o&&(o[y]=M)):typeof l!=`function`&&ia(e,y,l,a)}}}}}finally{l&&ge(!0)}return u}function oa(e,t,n=[],r=[],i=[],a,o=!1,s=!1){nt(i,n,r,n=>{var r=void 0,i={},c=e.nodeName===ta,l=!1;if(An(()=>{var u=t(...n.map(U)),d=aa(e,r,u,a,o,s);if(l&&c){var f=e;`defaultValue`in u&&Hi(f,u.defaultValue),`value`in u&&Wi(f,u.value)}for(let e of Object.getOwnPropertySymbols(i))u[e]||B(i[e]);for(let t of Object.getOwnPropertySymbols(u)){var p=u[t];t.description===`@attach`&&(!r||p!==r[t])&&(i[t]&&B(i[t]),i[t]=jn(()=>ki(e,()=>p))),d[t]=p}r=d}),c){var u=e;Tn(()=>{var e=r;`defaultValue`in e&&Hi(u,e.defaultValue),Wi(u,e.value,!0),Gi(u)})}l=!0})}function sa(e){return e[O]??={[Xi]:e.nodeName.includes(`-`),[Zi]:e.namespaceURI===N}}var ca=new Map;function la(e){var t=e.getAttribute(`is`)||e.nodeName,n=ca.get(t);if(n)return n;ca.set(t,n=new Set);for(var r,i=e,a=Element.prototype;a!==i;){for(var s in r=o(i),r)r[s].set&&s!==`innerHTML`&&s!==`textContent`&&s!==`innerText`&&n.add(s);i=l(i)}return n}var ua=new class e{#e=new WeakMap;#t;#n;static entries=new WeakMap;constructor(e){this.#n=e}observe(e,t){var n=this.#e.get(e)||new Set;return n.add(t),this.#e.set(e,n),this.#r().observe(e,this.#n),()=>{var n=this.#e.get(e);n.delete(t),n.size===0&&(this.#e.delete(e),this.#t.unobserve(e))}}#r(){return this.#t??=new ResizeObserver(t=>{for(var n of t){e.entries.set(n.target,n);for(var r of this.#e.get(n.target)||[])r(n)}})}}({box:`border-box`});function da(e,t,n){var r=ua.observe(e,()=>n(e[t]));Tn(()=>(mr(()=>n(e[t])),r))}function fa(e,t){return e===t||e?.[E]===t}function pa(e=We(),t,n,r){var i=I.r,a=H;return Tn(()=>{var o,s;return Dn(()=>{o=s,s=r?.()||[],mr(()=>{fa(n(...s),e)||(t(e,...s),o&&fa(n(...o),e)&&t(null,...o))})}),()=>{let r=a;for(;r!==i&&r.parent!==null&&r.parent.f&33554432;)r=r.parent;let o=()=>{s&&fa(n(...s),e)&&t(null,...s)},c=r.teardown;r.teardown=()=>{o(),c?.()}}}),e}function ma(e=!1){let t=I,n=t.l.u;if(!n)return;let r=()=>hr(t.s);if(e){let e=0,n={},i=ot(()=>{let r=!1,i=t.s;for(let e in i)i[e]!==n[e]&&(n[e]=i[e],r=!0);return r&&e++,e});r=()=>U(i)}n.b.length&&Cn(()=>{ha(t,r),m(n.b)}),xn(()=>{let e=mr(()=>n.m.map(p));return()=>{for(let t of e)typeof t==`function`&&t()}}),n.a.length&&xn(()=>{ha(t,r),m(n.a)})}function ha(e,t){if(e.l.s)for(let t of e.l.s)U(t);t()}var ga=!1;function _a(e){var t=ga;try{return ga=!1,[e(),ga]}finally{ga=t}}var va={get(e,t){if(!e.exclude.has(t))return e.props[t]},set(e,t){return!1},getOwnPropertyDescriptor(e,t){if(!e.exclude.has(t)&&t in e.props)return{enumerable:!0,configurable:!0,value:e.props[t]}},has(e,t){return!e.exclude.has(t)&&t in e.props},ownKeys(e){return Reflect.ownKeys(e.props).filter(t=>!e.exclude.has(t))}};function ya(e,t,n){return new Proxy({props:e,exclude:t},va)}function ba(e,t,n,r){var i=!Re||!!(n&2),o=!!(n&8),s=!!(n&16),c=r,l=!0,u=void 0,d=()=>s&&i?(u??=ot(r),U(u)):(l&&(l=!1,c=s?mr(r):r),c);let f;if(o){var p=E in e||oe in e;f=a(e,t)?.set??(p&&t in e?n=>e[t]=n:void 0)}var m,h=!1;o?[m,h]=_a(()=>e[t]):m=e[t],m===void 0&&r!==void 0&&(m=d(),f&&(i&&Me(t),f(m)));var g=i?()=>{var n=e[t];return n===void 0?d():(l=!0,n)}:()=>{var n=e[t];return n!==void 0&&(c=void 0),n===void 0?c:n};if(i&&!(n&4))return g;if(f){var _=e.$$legacy;return(function(e,t){return arguments.length>0?((!i||!t||_||h)&&f(t?g():e),e):g()})}var v=!1,y=(n&1?ot:ut)(()=>(v=!1,g()));o&&U(y);var b=H;return(function(e,t){if(arguments.length>0){let n=t?U(y):i&&o?Jt(e):e;return Vt(y,n),v=!0,c!==void 0&&(c=n),e}return Un&&v||b.f&16384?y.v:U(y)})}typeof window<`u`&&((window.__svelte??={}).v??=new Set).add(`5`),ze();var xa=(e,t)=>{let n=Array(e.length+t.length);for(let t=0;t<e.length;t++)n[t]=e[t];for(let r=0;r<t.length;r++)n[e.length+r]=t[r];return n},Sa=(e,t)=>({classGroupId:e,validator:t}),Ca=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),wa=`-`,Ta=[],Ea=`arbitrary..`,Da=e=>{let t=Aa(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e.startsWith(`[`)&&e.endsWith(`]`))return ka(e);let n=e.split(wa);return Oa(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?xa(i,t):t:i||Ta}return n[e]||Ta}}},Oa=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=Oa(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(wa):e.slice(t).join(wa),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},ka=e=>e.slice(1,-1).indexOf(`:`)===-1?void 0:(()=>{let t=e.slice(1,-1),n=t.indexOf(`:`),r=t.slice(0,n);return r?Ea+r:void 0})(),Aa=e=>{let{theme:t,classGroups:n}=e;return ja(n,t)},ja=(e,t)=>{let n=Ca();for(let r in e){let i=e[r];Ma(i,n,r,t)}return n},Ma=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];Na(i,t,n,r)}},Na=(e,t,n,r)=>{if(typeof e==`string`){Pa(e,t,n);return}if(typeof e==`function`){Fa(e,t,n,r);return}Ia(e,t,n,r)},Pa=(e,t,n)=>{let r=e===``?t:La(t,e);r.classGroupId=n},Fa=(e,t,n,r)=>{if(Ra(e)){Ma(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(Sa(n,e))},Ia=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];Ma(o,La(t,a),n,r)}},La=(e,t)=>{let n=e,r=t.split(wa),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=Ca(),n.nextPart.set(t,i)),n=i}return n},Ra=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,za=e=>{if(e<1)return{get:()=>void 0,set:()=>{}};let t=0,n=Object.create(null),r=Object.create(null),i=(i,a)=>{n[i]=a,t++,t>e&&(t=0,r=n,n=Object.create(null))};return{get(e){let t=n[e];if(t!==void 0)return t;if((t=r[e])!==void 0)return i(e,t),t},set(e,t){e in n?n[e]=t:i(e,t)}}},Ba=`!`,Va=`:`,Ha=[],Ua=(e,t,n,r,i)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:i}),Wa=e=>{let{prefix:t,experimentalParseClassName:n}=e,r=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e[s];if(n===0&&r===0){if(o===Va){t.push(e.slice(i,s)),i=s+1;continue}if(o===`/`){a=s;continue}}o===`[`?n++:o===`]`?n--:o===`(`?r++:o===`)`&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1;s.endsWith(Ba)?(c=s.slice(0,-1),l=!0):s.startsWith(Ba)&&(c=s.slice(1),l=!0);let u=a&&a>i?a-i:void 0;return Ua(t,l,c,u)};if(t){let e=t+Va,n=r;r=t=>t.startsWith(e)?n(t.slice(e.length)):Ua(Ha,!1,t,void 0,!0)}if(n){let e=r;r=t=>n({className:t,parseClassName:e})}return r},Ga=e=>{let t=new Map;return e.orderSensitiveModifiers.forEach((e,n)=>{t.set(e,1e6+n)}),e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);o||s?(r.length>0&&(r.sort(),n.push(...r),r=[]),n.push(a)):r.push(a)}return r.length>0&&(r.sort(),n.push(...r)),n}},Ka=e=>({cache:za(e.cacheSize),parseClassName:Wa(e),sortModifiers:Ga(e),postfixLookupClassGroupIds:qa(e),...Da(e)}),qa=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},Ja=/\s+/,Ya=(e,t)=>{let{parseClassName:n,getClassGroupId:r,getConflictingClassGroupIds:i,sortModifiers:a,postfixLookupClassGroupIds:o}=t,s=[],c=e.trim().split(Ja),l=``;for(let e=c.length-1;e>=0;--e){let t=c[e],{isExternal:u,modifiers:d,hasImportantModifier:f,baseClassName:p,maybePostfixModifierPosition:m}=n(t);if(u){l=t+(l.length>0?` `+l:l);continue}let h=!!m,g;if(h){g=r(p.substring(0,m));let e=g&&o[g]?r(p):void 0;e&&e!==g&&(g=e,h=!1)}else g=r(p);if(!g){if(!h){l=t+(l.length>0?` `+l:l);continue}if(g=r(p),!g){l=t+(l.length>0?` `+l:l);continue}h=!1}let _=d.length===0?``:d.length===1?d[0]:a(d).join(`:`),v=f?_+Ba:_,y=v+g;if(s.indexOf(y)>-1)continue;s.push(y);let b=i(g,h);for(let e=0;e<b.length;++e){let t=b[e];s.push(v+t)}l=t+(l.length>0?` `+l:l)}return l},Xa=(...e)=>{let t=0,n,r,i=``;for(;t<e.length;)(n=e[t++])&&(r=Za(n))&&(i&&(i+=` `),i+=r);return i},Za=e=>{if(typeof e==`string`)return e;let t,n=``;for(let r=0;r<e.length;r++)e[r]&&(t=Za(e[r]))&&(n&&(n+=` `),n+=t);return n},Qa=(e,...t)=>{let n,r,i,a,o=o=>(n=Ka(t.reduce((e,t)=>t(e),e())),r=n.cache.get,i=n.cache.set,a=s,s(o)),s=e=>{let t=r(e);if(t)return t;let a=Ya(e,n);return i(e,a),a};return a=o,(...e)=>a(Xa(...e))},$a=[],W=e=>{let t=t=>t[e]||$a;return t.isThemeGetter=!0,t.themeKey=e,t},eo=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,to=/^\((?:(\w[\w-]*):)?(.+)\)$/i,no=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,ro=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,io=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,ao=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix|color|light-dark)\(.+\)$/,oo=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,so=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,co=e=>no.test(e),G=e=>!!e&&!Number.isNaN(Number(e)),lo=e=>!!e&&Number.isInteger(Number(e)),uo=e=>e.endsWith(`%`)&&G(e.slice(0,-1)),fo=e=>ro.test(e),po=()=>!0,mo=e=>io.test(e)&&!ao.test(e),ho=()=>!1,go=e=>oo.test(e),_o=e=>so.test(e),vo=e=>!K(e)&&!q(e),yo=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),bo=e=>Fo(e,zo,ho),K=e=>eo.test(e),xo=e=>Fo(e,Bo,mo),So=e=>Fo(e,Vo,G),Co=e=>Fo(e,Uo,po),wo=e=>Fo(e,Ho,ho),To=e=>Fo(e,Lo,ho),Eo=e=>Fo(e,Ro,_o),Do=e=>Fo(e,Wo,go),q=e=>to.test(e),Oo=e=>Io(e,Bo),ko=e=>Io(e,Ho),Ao=e=>Io(e,Lo),jo=e=>Io(e,zo),Mo=e=>Io(e,Ro),No=e=>Io(e,Wo,!0),Po=e=>Io(e,Uo,!0),Fo=(e,t,n)=>{let r=eo.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},Io=(e,t,n=!1)=>{let r=to.exec(e);return r?r[1]?t(r[1]):n:!1},Lo=e=>e===`position`||e===`percentage`,Ro=e=>e===`image`||e===`url`,zo=e=>e===`length`||e===`size`||e===`bg-size`,Bo=e=>e===`length`,Vo=e=>e===`number`,Ho=e=>e===`family-name`,Uo=e=>e===`number`||e===`weight`,Wo=e=>e===`shadow`,Go=Object.defineProperty({__proto__:null,isAny:po,isAnyNonArbitrary:vo,isArbitraryFamilyName:wo,isArbitraryImage:Eo,isArbitraryLength:xo,isArbitraryNumber:So,isArbitraryPosition:To,isArbitraryShadow:Do,isArbitrarySize:bo,isArbitraryValue:K,isArbitraryVariable:q,isArbitraryVariableFamilyName:ko,isArbitraryVariableImage:Mo,isArbitraryVariableLength:Oo,isArbitraryVariablePosition:Ao,isArbitraryVariableShadow:No,isArbitraryVariableSize:jo,isArbitraryVariableWeight:Po,isArbitraryWeight:Co,isFraction:co,isInteger:lo,isNamedContainerQuery:yo,isNumber:G,isPercent:uo,isTshirtSize:fo},Symbol.toStringTag,{value:`Module`}),Ko=()=>{let e=W(`color`),t=W(`font`),n=W(`text`),r=W(`font-weight`),i=W(`tracking`),a=W(`leading`),o=W(`breakpoint`),s=W(`container`),c=W(`spacing`),l=W(`radius`),u=W(`shadow`),d=W(`inset-shadow`),f=W(`text-shadow`),p=W(`drop-shadow`),m=W(`blur`),h=W(`perspective`),g=W(`aspect`),_=W(`ease`),v=W(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),q,K],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],ee=()=>[`auto`,`contain`,`none`],C=()=>[q,K,c],w=()=>[co,`full`,`auto`,...C()],te=()=>[lo,`none`,`subgrid`,q,K],ne=()=>[`auto`,{span:[`full`,lo,q,K]},lo,q,K],re=()=>[lo,`auto`,q,K],ie=()=>[`auto`,`min`,`max`,`fr`,q,K],ae=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],T=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],E=()=>[`auto`,...C()],D=()=>[co,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...C()],oe=()=>[s,co,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...C()],se=()=>[co,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...C()],O=()=>[e,q,K],ce=()=>[...b(),Ao,To,{position:[q,K]}],le=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ue=()=>[`auto`,`cover`,`contain`,jo,bo,{size:[q,K]}],de=()=>[uo,Oo,xo],k=()=>[``,`none`,`full`,l,q,K],A=()=>[``,G,Oo,xo],j=()=>[`solid`,`dashed`,`dotted`,`double`],M=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],N=()=>[G,uo,Ao,To],fe=()=>[``,`none`,m,q,K],pe=()=>[`none`,G,q,K],me=()=>[`none`,G,q,K],he=()=>[G,q,K],P=()=>[co,`full`,...C()];return{cacheSize:500,theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[fo],breakpoint:[fo],color:[po],container:[fo],"drop-shadow":[fo],ease:[`in`,`out`,`in-out`],font:[vo],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[fo],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[fo],shadow:[fo],spacing:[`px`,G],text:[fo],"text-shadow":[fo],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,co,K,q,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,q,K]}],"container-named":[yo],columns:[{columns:[G,`auto`,K,q,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:ee()}],"overscroll-x":[{"overscroll-x":ee()}],"overscroll-y":[{"overscroll-y":ee()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:w()}],"inset-x":[{"inset-x":w()}],"inset-y":[{"inset-y":w()}],start:[{"inset-s":w(),start:w()}],end:[{"inset-e":w(),end:w()}],"inset-bs":[{"inset-bs":w()}],"inset-be":[{"inset-be":w()}],top:[{top:w()}],right:[{right:w()}],bottom:[{bottom:w()}],left:[{left:w()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[lo,`auto`,q,K]}],basis:[{basis:[co,`full`,`auto`,s,...C()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[G,co,`auto`,`initial`,`none`,K]}],grow:[{grow:[``,G,q,K]}],shrink:[{shrink:[``,G,q,K]}],order:[{order:[lo,`first`,`last`,`none`,q,K]}],"grid-cols":[{"grid-cols":te()}],"col-start-end":[{col:ne()}],"col-start":[{"col-start":re()}],"col-end":[{"col-end":re()}],"grid-rows":[{"grid-rows":te()}],"row-start-end":[{row:ne()}],"row-start":[{"row-start":re()}],"row-end":[{"row-end":re()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":ie()}],"auto-rows":[{"auto-rows":ie()}],gap:[{gap:C()}],"gap-x":[{"gap-x":C()}],"gap-y":[{"gap-y":C()}],"justify-content":[{justify:[...ae(),`normal`]}],"justify-items":[{"justify-items":[...T(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...T()]}],"align-content":[{content:[`normal`,...ae()]}],"align-items":[{items:[...T(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...T(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ae()}],"place-items":[{"place-items":[...T(),`baseline`]}],"place-self":[{"place-self":[`auto`,...T()]}],p:[{p:C()}],px:[{px:C()}],py:[{py:C()}],ps:[{ps:C()}],pe:[{pe:C()}],pbs:[{pbs:C()}],pbe:[{pbe:C()}],pt:[{pt:C()}],pr:[{pr:C()}],pb:[{pb:C()}],pl:[{pl:C()}],m:[{m:E()}],mx:[{mx:E()}],my:[{my:E()}],ms:[{ms:E()}],me:[{me:E()}],mbs:[{mbs:E()}],mbe:[{mbe:E()}],mt:[{mt:E()}],mr:[{mr:E()}],mb:[{mb:E()}],ml:[{ml:E()}],"space-x":[{"space-x":C()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":C()}],"space-y-reverse":[`space-y-reverse`],size:[{size:D()}],"inline-size":[{inline:[`auto`,...oe()]}],"min-inline-size":[{"min-inline":[`auto`,...oe()]}],"max-inline-size":[{"max-inline":[`none`,...oe()]}],"block-size":[{block:[`auto`,...se()]}],"min-block-size":[{"min-block":[`auto`,...se()]}],"max-block-size":[{"max-block":[`none`,...se()]}],w:[{w:[s,`screen`,...D()]}],"min-w":[{"min-w":[s,`screen`,`none`,...D()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...D()]}],h:[{h:[`screen`,`lh`,...D()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...D()]}],"max-h":[{"max-h":[`screen`,`lh`,`none`,...D()]}],"font-size":[{text:[`base`,n,Oo,xo]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,Po,Co]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,uo,K]}],"font-family":[{font:[ko,wo,t]}],"font-features":[{"font-features":[K]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,q,K]}],"line-clamp":[{"line-clamp":[G,`none`,q,So]}],leading:[{leading:[`none`,a,...C()]}],"list-image":[{"list-image":[`none`,q,K]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,q,K]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:O()}],"text-color":[{text:O()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...j(),`wavy`]}],"text-decoration-thickness":[{decoration:[G,`from-font`,`auto`,q,xo]}],"text-decoration-color":[{decoration:O()}],"underline-offset":[{"underline-offset":[G,`auto`,q,K]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:C()}],"tab-size":[{tab:[lo,q,K]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,q,K]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,q,K]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:ce()}],"bg-repeat":[{bg:le()}],"bg-size":[{bg:ue()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},lo,q,K],radial:[``,q,K],conic:[``,lo,q,K]},Mo,Eo]}],"bg-color":[{bg:O()}],"gradient-from-pos":[{from:de()}],"gradient-via-pos":[{via:de()}],"gradient-to-pos":[{to:de()}],"gradient-from":[{from:O()}],"gradient-via":[{via:O()}],"gradient-to":[{to:O()}],rounded:[{rounded:k()}],"rounded-s":[{"rounded-s":k()}],"rounded-e":[{"rounded-e":k()}],"rounded-t":[{"rounded-t":k()}],"rounded-r":[{"rounded-r":k()}],"rounded-b":[{"rounded-b":k()}],"rounded-l":[{"rounded-l":k()}],"rounded-ss":[{"rounded-ss":k()}],"rounded-se":[{"rounded-se":k()}],"rounded-ee":[{"rounded-ee":k()}],"rounded-es":[{"rounded-es":k()}],"rounded-tl":[{"rounded-tl":k()}],"rounded-tr":[{"rounded-tr":k()}],"rounded-br":[{"rounded-br":k()}],"rounded-bl":[{"rounded-bl":k()}],"border-w":[{border:A()}],"border-w-x":[{"border-x":A()}],"border-w-y":[{"border-y":A()}],"border-w-s":[{"border-s":A()}],"border-w-e":[{"border-e":A()}],"border-w-bs":[{"border-bs":A()}],"border-w-be":[{"border-be":A()}],"border-w-t":[{"border-t":A()}],"border-w-r":[{"border-r":A()}],"border-w-b":[{"border-b":A()}],"border-w-l":[{"border-l":A()}],"divide-x":[{"divide-x":A()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":A()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...j(),`hidden`,`none`]}],"divide-style":[{divide:[...j(),`hidden`,`none`]}],"border-color":[{border:O()}],"border-color-x":[{"border-x":O()}],"border-color-y":[{"border-y":O()}],"border-color-s":[{"border-s":O()}],"border-color-e":[{"border-e":O()}],"border-color-bs":[{"border-bs":O()}],"border-color-be":[{"border-be":O()}],"border-color-t":[{"border-t":O()}],"border-color-r":[{"border-r":O()}],"border-color-b":[{"border-b":O()}],"border-color-l":[{"border-l":O()}],"divide-color":[{divide:O()}],"outline-style":[{outline:[...j(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[G,q,K]}],"outline-w":[{outline:[``,G,Oo,xo]}],"outline-color":[{outline:O()}],shadow:[{shadow:[``,`inner`,`none`,u,No,Do]}],"shadow-color":[{shadow:O()}],"inset-shadow":[{"inset-shadow":[`none`,d,No,Do]}],"inset-shadow-color":[{"inset-shadow":O()}],"ring-w":[{ring:A()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:O()}],"ring-offset-w":[{"ring-offset":[G,xo]}],"ring-offset-color":[{"ring-offset":O()}],"inset-ring-w":[{"inset-ring":A()}],"inset-ring-color":[{"inset-ring":O()}],"text-shadow":[{"text-shadow":[`none`,f,No,Do]}],"text-shadow-color":[{"text-shadow":O()}],opacity:[{opacity:[G,q,K]}],"mix-blend":[{"mix-blend":[...M(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":M()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[G]}],"mask-image-linear-from-pos":[{"mask-linear-from":N()}],"mask-image-linear-to-pos":[{"mask-linear-to":N()}],"mask-image-linear-from-color":[{"mask-linear-from":O()}],"mask-image-linear-to-color":[{"mask-linear-to":O()}],"mask-image-t-from-pos":[{"mask-t-from":N()}],"mask-image-t-to-pos":[{"mask-t-to":N()}],"mask-image-t-from-color":[{"mask-t-from":O()}],"mask-image-t-to-color":[{"mask-t-to":O()}],"mask-image-r-from-pos":[{"mask-r-from":N()}],"mask-image-r-to-pos":[{"mask-r-to":N()}],"mask-image-r-from-color":[{"mask-r-from":O()}],"mask-image-r-to-color":[{"mask-r-to":O()}],"mask-image-b-from-pos":[{"mask-b-from":N()}],"mask-image-b-to-pos":[{"mask-b-to":N()}],"mask-image-b-from-color":[{"mask-b-from":O()}],"mask-image-b-to-color":[{"mask-b-to":O()}],"mask-image-l-from-pos":[{"mask-l-from":N()}],"mask-image-l-to-pos":[{"mask-l-to":N()}],"mask-image-l-from-color":[{"mask-l-from":O()}],"mask-image-l-to-color":[{"mask-l-to":O()}],"mask-image-x-from-pos":[{"mask-x-from":N()}],"mask-image-x-to-pos":[{"mask-x-to":N()}],"mask-image-x-from-color":[{"mask-x-from":O()}],"mask-image-x-to-color":[{"mask-x-to":O()}],"mask-image-y-from-pos":[{"mask-y-from":N()}],"mask-image-y-to-pos":[{"mask-y-to":N()}],"mask-image-y-from-color":[{"mask-y-from":O()}],"mask-image-y-to-color":[{"mask-y-to":O()}],"mask-image-radial":[{"mask-radial":[q,K]}],"mask-image-radial-from-pos":[{"mask-radial-from":N()}],"mask-image-radial-to-pos":[{"mask-radial-to":N()}],"mask-image-radial-from-color":[{"mask-radial-from":O()}],"mask-image-radial-to-color":[{"mask-radial-to":O()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[G]}],"mask-image-conic-from-pos":[{"mask-conic-from":N()}],"mask-image-conic-to-pos":[{"mask-conic-to":N()}],"mask-image-conic-from-color":[{"mask-conic-from":O()}],"mask-image-conic-to-color":[{"mask-conic-to":O()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:ce()}],"mask-repeat":[{mask:le()}],"mask-size":[{mask:ue()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,q,K]}],filter:[{filter:[``,`none`,q,K]}],blur:[{blur:fe()}],brightness:[{brightness:[G,q,K]}],contrast:[{contrast:[G,q,K]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,No,Do]}],"drop-shadow-color":[{"drop-shadow":O()}],grayscale:[{grayscale:[``,G,q,K]}],"hue-rotate":[{"hue-rotate":[G,q,K]}],invert:[{invert:[``,G,q,K]}],saturate:[{saturate:[G,q,K]}],sepia:[{sepia:[``,G,q,K]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,q,K]}],"backdrop-blur":[{"backdrop-blur":fe()}],"backdrop-brightness":[{"backdrop-brightness":[G,q,K]}],"backdrop-contrast":[{"backdrop-contrast":[G,q,K]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,G,q,K]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[G,q,K]}],"backdrop-invert":[{"backdrop-invert":[``,G,q,K]}],"backdrop-opacity":[{"backdrop-opacity":[G,q,K]}],"backdrop-saturate":[{"backdrop-saturate":[G,q,K]}],"backdrop-sepia":[{"backdrop-sepia":[``,G,q,K]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":C()}],"border-spacing-x":[{"border-spacing-x":C()}],"border-spacing-y":[{"border-spacing-y":C()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,q,K]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[G,`initial`,q,K]}],ease:[{ease:[`linear`,`initial`,_,q,K]}],delay:[{delay:[G,q,K]}],animate:[{animate:[`none`,v,q,K]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,q,K]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:pe()}],"rotate-x":[{"rotate-x":pe()}],"rotate-y":[{"rotate-y":pe()}],"rotate-z":[{"rotate-z":pe()}],scale:[{scale:me()}],"scale-x":[{"scale-x":me()}],"scale-y":[{"scale-y":me()}],"scale-z":[{"scale-z":me()}],"scale-3d":[`scale-3d`],skew:[{skew:he()}],"skew-x":[{"skew-x":he()}],"skew-y":[{"skew-y":he()}],transform:[{transform:[q,K,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:P()}],"translate-x":[{"translate-x":P()}],"translate-y":[{"translate-y":P()}],"translate-z":[{"translate-z":P()}],"translate-none":[`translate-none`],zoom:[{zoom:[lo,q,K]}],accent:[{accent:O()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:O()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,q,K]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":O()}],"scrollbar-track-color":[{"scrollbar-track":O()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":C()}],"scroll-mx":[{"scroll-mx":C()}],"scroll-my":[{"scroll-my":C()}],"scroll-ms":[{"scroll-ms":C()}],"scroll-me":[{"scroll-me":C()}],"scroll-mbs":[{"scroll-mbs":C()}],"scroll-mbe":[{"scroll-mbe":C()}],"scroll-mt":[{"scroll-mt":C()}],"scroll-mr":[{"scroll-mr":C()}],"scroll-mb":[{"scroll-mb":C()}],"scroll-ml":[{"scroll-ml":C()}],"scroll-p":[{"scroll-p":C()}],"scroll-px":[{"scroll-px":C()}],"scroll-py":[{"scroll-py":C()}],"scroll-ps":[{"scroll-ps":C()}],"scroll-pe":[{"scroll-pe":C()}],"scroll-pbs":[{"scroll-pbs":C()}],"scroll-pbe":[{"scroll-pbe":C()}],"scroll-pt":[{"scroll-pt":C()}],"scroll-pr":[{"scroll-pr":C()}],"scroll-pb":[{"scroll-pb":C()}],"scroll-pl":[{"scroll-pl":C()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,q,K]}],fill:[{fill:[`none`,...O()]}],"stroke-w":[{stroke:[G,Oo,xo,So]}],stroke:[{stroke:[`none`,...O()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`start`,`end`,`right`,`left`],"inset-y":[`inset-bs`,`inset-be`,`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`ps`,`pe`,`pr`,`pl`],py:[`pbs`,`pbe`,`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`ms`,`me`,`mr`,`ml`],my:[`mbs`,`mbe`,`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-s`,`border-w-e`,`border-w-r`,`border-w-l`],"border-w-y":[`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-s`,`border-color-e`,`border-color-r`,`border-color-l`],"border-color-y":[`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-ms`,`scroll-me`,`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-ps`,`scroll-pe`,`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},qo=(e,{cacheSize:t,prefix:n,experimentalParseClassName:r,extend:i={},override:a={}})=>(Jo(e,`cacheSize`,t),Jo(e,`prefix`,n),Jo(e,`experimentalParseClassName`,r),Yo(e.theme,a.theme),Yo(e.classGroups,a.classGroups),Yo(e.conflictingClassGroups,a.conflictingClassGroups),Yo(e.conflictingClassGroupModifiers,a.conflictingClassGroupModifiers),Jo(e,`postfixLookupClassGroups`,a.postfixLookupClassGroups),Jo(e,`orderSensitiveModifiers`,a.orderSensitiveModifiers),Xo(e.theme,i.theme),Xo(e.classGroups,i.classGroups),Xo(e.conflictingClassGroups,i.conflictingClassGroups),Xo(e.conflictingClassGroupModifiers,i.conflictingClassGroupModifiers),Zo(e,i,`postfixLookupClassGroups`),Zo(e,i,`orderSensitiveModifiers`),e),Jo=(e,t,n)=>{n!==void 0&&(e[t]=n)},Yo=(e,t)=>{if(t)for(let n in t)Jo(e,n,t[n])},Xo=(e,t)=>{if(t)for(let n in t)Zo(e,t,n)},Zo=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},Qo=(e,...t)=>typeof e==`function`?Qa(Ko,e,...t):Qa(()=>qo(Ko(),e),...t),$o=Array.isArray,es=e=>{if(!e&&e!==0&&e!==0n)return``;if(typeof e==`string`)return e;if(typeof e==`number`)return e===e?``+e:``;if(typeof e==`bigint`)return``+e;let t=``;if($o(e)){let n=e.length;for(let r=0;r<n;r++){let n=e[r];if(!n&&n!==0&&n!==0n)continue;let i=typeof n==`string`?n:es(n);i&&(t&&(t+=` `),t+=i)}return t}if(typeof e==`object`)for(let n in e)e[n]&&(t&&(t+=` `),t+=n);return t},ts=/\s+/g,ns=Array.isArray,rs=e=>typeof e!=`string`||!e?e:e.replace(ts,` `).trim(),is=e=>{let t=e.length;if(t===0)return!1;let n=e.charCodeAt(0),r=e.charCodeAt(t-1);if(n===32||r===32||n>=9&&n<=13||n===160||r>=9&&r<=13||r===160)return!0;for(let n=0;n<t;n++){let r=e.charCodeAt(n);if(r>=9&&r<=13||r===160||r===32&&n+1<t&&e.charCodeAt(n+1)===32)return!0}return!1},as=(...e)=>{let t=es(e);if(t)return is(t)?rs(t):t},os=e=>e===!1?`false`:e===!0?`true`:e===0?`0`:e,ss=e=>{if(!e||typeof e!=`object`)return!0;for(let t in e)return!1;return!0},cs=(e,t)=>{if(e===t)return!0;if(!e||!t)return!1;let n=e,r=t,i=Object.keys(n),a=Object.keys(r);if(i.length!==a.length)return!1;for(let e=0;e<i.length;e++){let t=i[e];if(!a.includes(t)||n[t]!==r[t])return!1}return!0},ls=(e,t)=>{let n=e;for(let e in t)if(Object.hasOwn(t,e)){let r=t[e];n[e]=e in n?as(n[e],r):r}return e},us=(e,t)=>{for(let n=0;n<e.length;n++){let r=e[n];ns(r)?us(r,t):r&&t.push(r)}},ds=(...e)=>{let t=[];us(e,t);let n=[];for(let e=0;e<t.length;e++)t[e]&&n.push(t[e]);return n},fs=(e,t)=>{let n=e,r=t,i={};for(let e in n){let t=n[e];if(e in r){let n=r[e];i[e]=ns(t)||ns(n)?ds(n,t):typeof t==`object`&&typeof n==`object`&&t&&n?fs(t,n):n+` `+t}else i[e]=t}for(let e in r)e in n||(i[e]=r[e]);return i},ps={twMerge:!0,twMergeConfig:{}},ms=256,hs=128,gs=Symbol(`tv-cache-miss`),_s=e=>e?.class!=null&&e.class!==``||e?.className!=null&&e.className!==``,vs=e=>{if(e===void 0)return``;if(e===null)return`null`;if(typeof e==`string`)return e;if(typeof e==`boolean`)return e?`true`:`false`;if(typeof e==`number`)return e===0?`0`:String(e);if(typeof e==`bigint`)return String(e);let t=os(e),n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return String(t);if(n===`object`)try{return JSON.stringify(t)}catch{return null}return null},ys=(e,t)=>{if(t===void 0)return e;if(t===null)return e+`null`;let n=typeof t;if(n===`string`||n===`number`||n===`boolean`||n===`bigint`)return e+String(t);if(Array.isArray(t))return e+t.join(`\0`);try{return e+JSON.stringify(t)}catch{return e+`?`}},bs=(e,t,n,r)=>{let i=``,a=Object.create(null);for(let r=0;r<e.length;r++){let o=e[r];a[o]=1;let s=t[o];n&&n[o]!==void 0&&(s=n[o]);let c=vs(s);if(c===null)return null;i+=o+`:`+c+`;`}let o=[];for(let e in t)e===`class`||e===`className`||a[e]||(a[e]=1,o.push(e));if(n)for(let e in n)e===`class`||e===`className`||a[e]||n[e]===void 0||(a[e]=1,o.push(e));o.length>1&&o.sort();for(let e=0;e<o.length;e++){let r=o[e],a=t[r];n&&n[r]!==void 0&&(a=n[r]);let s=vs(a);if(s===null)return null;i+=r+`:`+s+`;`}return i},xs=(e,t)=>{let n=``;for(let t=0;t<e.length;t++){let{conditionKeys:r,source:i}=e[t];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=ys(n,i[t]),n+=`,`}n+=`c=`,n=ys(n,i.class),n+=`|cn=`,n=ys(n,i.className),n+=`;`}for(let e=0;e<t.length;e++){let{conditionKeys:r,source:i}=t[e];for(let e=0;e<r.length;e++){let t=r[e];n+=t+`=`,n=ys(n,i[t]),n+=`,`}Array.isArray(i.slots)&&(n+=`slots=`+i.slots.join(`,`)+`,`),n+=`c=`,n=ys(n,i.class),n+=`|cn=`,n=ys(n,i.className),n+=`;`}return n},Ss=(e=ms)=>{let t=new Map,n=null;return{get(e){if(t.has(e))return t.get(e);if(n?.has(e)){let r=n.get(e);return t.set(e,r),r}return gs},set(r,i){t.size>=e&&(n=t,t=new Map),t.set(r,i)}}},Cs=(e=ms)=>{let t=Ss(e);return{get(e){return t.get(e)},set(e,n){t.set(e,n)}}},ws=(e=hs)=>{let t=new Map,n=null,r=0;return{get(e,i){let a=t.get(e);if(a){let e=a.get(i);if(e!==void 0||a.has(i))return e}if(n){let a=n.get(e);if(a){let n=a.get(i);if(n!==void 0||a.has(i)){let a=t.get(e);return a||(a=new Map,t.set(e,a)),a.has(i)||r++,a.set(i,n),n}}}return gs},set(i,a,o){r>=e&&(n=t,t=new Map,r=0);let s=t.get(i);s||(s=new Map,t.set(i,s)),s.has(a)||r++,s.set(a,o)}}},Ts=(e,t)=>{let n=null;return(r,i)=>{if(!_s(i))return r;let a=i.class,o=i.className;if(a!=null&&a!==``&&typeof a!=`string`||o!=null&&o!==``&&typeof o!=`string`)return e(t,r,a,o);n??=ws();let s=r??``,c=(typeof a==`string`?a:``)+`\0`+(typeof o==`string`?o:``),l=n.get(s,c);if(l!==gs)return l;let u=e(t,r,a,o);return n.set(s,c,u),u}};function Es(){let e=null,t={},n=!1;return{get cachedTwMerge(){return e},set cachedTwMerge(t){e=t},get cachedTwMergeConfig(){return t},set cachedTwMergeConfig(e){t=e},get didTwMergeConfigChange(){return n},set didTwMergeConfigChange(e){n=e},reset(){e=null,t={},n=!1}}}var J=Es(),Ds=e=>{!ss(e.twMergeConfig)&&!cs(e.twMergeConfig,J.cachedTwMergeConfig)&&(J.didTwMergeConfigChange=!0,J.cachedTwMergeConfig=e.twMergeConfig)},Os=(e,t)=>{let n=[];for(let r=0;r<t.length;r++){let i=t[r],a=e[i];n.push({key:i,values:a,isEmpty:ss(a)})}return n},ks=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},As=e=>{if(!Array.isArray(e)||e.length===0)return[];let t=[];for(let n=0;n<e.length;n++){let r=e[n],i=[];for(let e in r)e!==`slots`&&e!==`class`&&e!==`className`&&i.push(e);t.push({conditionKeys:i,source:r})}return t},js=e=>{let t={};for(let n=0;n<e.length;n++){let r=e[n],i=r.source.slots;if(Array.isArray(i))for(let e=0;e<i.length;e++){let n=i[e];t[n]||(t[n]=[]),t[n].push(r)}}return t},Ms=(e,t)=>{let{extend:n=null,slots:r={},variants:i={},compoundVariants:a=[],compoundSlots:o=[],defaultVariants:s={}}=e,c={...ps,...t},l=e.slots!==void 0,u=n?.base?as(n.base,e?.base):e?.base,d=n?.variants&&!ss(n.variants)?fs(i,n.variants):i,f=n?.defaultVariants&&!ss(n.defaultVariants)?{...n.defaultVariants,...s}:s;Ds(c);let p=!n?.slots||ss(n.slots),m=l?p&&n?.base?as(e?.base,n.base):typeof e?.base==`string`||e?.base==null?e.base:as(e.base):void 0,h=l?{base:m,...r}:{},g=p?h:ls({...n?.slots},ss(h)?{base:e?.base}:h),_=!n?.compoundVariants||ss(n.compoundVariants)?a:ds(n?.compoundVariants,a),v=!n?.compoundSlots||ss(n.compoundSlots)?o:ds(n?.compoundSlots,o),y=Object.keys(d);return{config:c,extend:n,base:u,variants:d,defaultVariants:f,slots:g,compoundVariants:_,compoundSlots:v,compiledVariants:null,compiledCompoundVariants:null,compiledCompoundSlots:null,compiledCompoundSlotsBySlot:null,deferredError:_&&!Array.isArray(_)?TypeError(`The "compoundVariants" prop must be an array. Received: ${typeof _}`):v&&!Array.isArray(v)?TypeError(`The "compoundSlots" prop must be an array. Received: ${typeof v}`):null,mode:l||!p?`slots`:y.length===0?`plain`:`variants`,slotKeys:null,variantKeys:y}},Ns=e=>e.compiledVariants===null?(e.compiledVariants=Os(e.variants,e.variantKeys),e.compiledCompoundVariants=ks(e.compoundVariants),e.compiledCompoundSlots=As(e.compoundSlots),e.compiledCompoundSlotsBySlot=js(e.compiledCompoundSlots),e.slotKeys=e.slots&&typeof e.slots==`object`?Object.keys(e.slots):[],e):e,Ps=[],Fs=[],Is=[],Ls=[],Rs=[],zs=(e,t,n)=>{let r={};for(let t in e)r[t]=e[t];if(t)for(let e in t)t[e]!==void 0&&(r[e]=t[e]);if(n)for(let e in n)n[e]!==void 0&&(r[e]=n[e]);return r},Bs=e=>e==null||e===!1,Vs=(e,t)=>{if(!Array.isArray(e))return e===t||Bs(e)&&Bs(t);for(let n=0;n<e.length;n++){let r=e[n];if(r===t||Bs(r)&&Bs(t))return!0}return!1},Hs=(e,t,n,r)=>{if(e.isEmpty)return null;let i=r?.[e.key]??n?.[e.key];if(i===null)return null;let a=os(i);if(typeof a==`object`)return null;let o=t?.[e.key],s=a??os(o);return e.values[s||`false`]},Us=(e,t)=>{let{conditionKeys:n,source:r}=e;for(let e=0;e<n.length;e++){let i=n[e];if(!Vs(r[i],t[i]))return!1}return!0},Ws=(e,t,n)=>{typeof n==`string`?t===`base`&&e.push(n):n&&typeof n==`object`&&n[t]&&e.push(n[t])},Gs=(e,t,n)=>{let r=Fs;r.length=0;for(let i=0;i<e.length;i++){let a=Hs(e[i],t,n);a&&r.push(a)}return r},Ks=(e,t,n,r,i)=>{let a=Fs;a.length=0;for(let o=0;o<t.length;o++){let s=Hs(t[o],n,r,i),c=e===`base`&&typeof s==`string`?s:s&&s[e];c&&a.push(c)}return a},qs=(e,t)=>{let n=Is;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];Us(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},Js=(e,t,n)=>{let r=Ls;r.length=0;for(let i=0;i<t.length;i++){let a=t[i];Us(a,n)&&(Ws(r,e,a.source.class),Ws(r,e,a.source.className))}return r},Ys=(e,t)=>{let n=Rs;n.length=0;for(let r=0;r<e.length;r++){let i=e[r];Us(i,t)&&(i.source.class&&n.push(i.source.class),i.source.className&&n.push(i.source.className))}return n},Xs=(e,t)=>{let{base:n,config:r}=e,i=gs,a=Ts(t,r);return(e=>(i===gs&&(i=t(r,n)),a(i,e)))},Zs=(e,t)=>{let{base:n,config:r,defaultVariants:i,deferredError:a,variantKeys:o}=e,s=e.compiledCompoundVariants,c=e.compiledVariants,l=Ps,u=null,d=Ts(t,r),f=1,p=e=>{let a=s.length>0?qs(s,zs(i,e)):void 0;return t(r,n,Gs(c,i,e),a)};return(t=>{if(a)throw a;(c===null||s===null)&&(Ns(e),c=e.compiledVariants,s=e.compiledCompoundVariants,l=e.compiledCompoundSlots??Ps);let n;if(f>0)f--,n=p(t);else{u??=Cs();let e=bs(o,i,t);if(e!==null){let r=s.length>0||l.length>0?xs(s,l):``,i=e+`#`+r,a=u.get(i);a===gs?(n=p(t),u.set(i,n)):n=a}else n=p(t)}return d(n,t)})},Qs=(e,t)=>{let{config:n,defaultVariants:r,deferredError:i,slots:a,variantKeys:o}=e,s=null,c=null,l=null,u=null,d=!1,f=null,p=null,m=1,h=()=>{if(l!==null)return;(e.compiledVariants===null||e.compiledCompoundVariants===null||e.compiledCompoundSlots===null||e.compiledCompoundSlotsBySlot===null||e.slotKeys===null)&&Ns(e);let i=e.compiledVariants;s=e.compiledCompoundVariants,c=e.compiledCompoundSlots;let o=e.compiledCompoundSlotsBySlot;l=e.slotKeys,d=s.length>0||c.length>0,f=Ts(t,n);let p=Array(l.length);for(let e=0;e<l.length;e++){let c=l[e],u=o[c]??Ps;p[e]=(e,o)=>{let l=d?zs(r,e,o):void 0,f=l?Js(c,s,l):void 0,p=l?Ys(u,l):void 0;return t(n,a[c],Ks(c,i,r,e,o),f,p)}}u=p},g=e=>{let t=l,n=u,r=f,i={};for(let a=0;a<t.length;a++){let o=n[a],s=o(e);i[t[a]]=t=>{if(t==null)return s;let n=!1;for(let e in t)if(e!==`class`&&e!==`className`&&t[e]!==void 0){n=!0;break}return r(n?o(e,t):s,t)}}return i};return(e=>{if(i)throw i;if(h(),m>0)return m--,g(e);let t=bs(o,r,e);if(t===null)return g(e);let n=d?xs(s,c):``,a=t+`#`+n;p??=Ss();let l=p.get(a);if(l!==gs)return l;let u=g(e);return p.set(a,u),u})},$s=(e,t)=>{if(e.mode===`plain`)return Xs(e,t);let n;return(r=>(n??=e.mode===`slots`?Qs(e,t):Zs(e,t),n(r)))},ec=(e,t)=>{e.variantKeys=t.variantKeys,e.extend=t.extend,e.base=t.base,e.slots=t.slots,e.variants=t.variants,e.defaultVariants=t.defaultVariants,e.compoundSlots=t.compoundSlots,e.compoundVariants=t.compoundVariants},tc=e=>{let t=(t,n)=>{let r=Ms(t,n),i=$s(r,e);return ec(i,r),i};return{tv:t,createTV:e=>(n,r)=>t(n,r?fs(e,r):e)}},nc=(e,t)=>{let n=e.length,r=t.length,i=Array(n+r);for(let t=0;t<n;t++)i[t]=e[t];for(let e=0;e<r;e++)i[n+e]=t[e];return i},rc=(e,t)=>({classGroupId:e,validator:t}),ic=(e=new Map,t=null,n)=>({nextPart:e,validators:t,classGroupId:n}),ac=`-`,oc=[],sc=`arbitrary..`,cc=e=>{let t=dc(e),{conflictingClassGroups:n,conflictingClassGroupModifiers:r}=e;return{getClassGroupId:e=>{if(e[0]===`[`&&e[e.length-1]===`]`)return uc(e);let n=e.split(ac);return lc(n,+(n[0]===``&&n.length>1),t)},getConflictingClassGroupIds:(e,t)=>{if(t){let t=r[e],i=n[e];return t?i?nc(i,t):t:i||oc}return n[e]||oc}}},lc=(e,t,n)=>{if(e.length-t===0)return n.classGroupId;let r=e[t],i=n.nextPart.get(r);if(i){let n=lc(e,t+1,i);if(n)return n}let a=n.validators;if(a===null)return;let o=t===0?e.join(ac):e.slice(t).join(ac),s=a.length;for(let e=0;e<s;e++){let t=a[e];if(t.validator(o))return t.classGroupId}},uc=e=>{let t=e.slice(1,-1),n=t.indexOf(`:`);if(n===-1)return;let r=t.slice(0,n);return r?sc+r:void 0},dc=e=>{let{theme:t,classGroups:n}=e;return fc(n,t)},fc=(e,t)=>{let n=ic();for(let r in e){let i=e[r];pc(i,n,r,t)}return n},pc=(e,t,n,r)=>{let i=e.length;for(let a=0;a<i;a++){let i=e[a];mc(i,t,n,r)}},mc=(e,t,n,r)=>{if(typeof e==`string`){hc(e,t,n);return}if(typeof e==`function`){gc(e,t,n,r);return}_c(e,t,n,r)},hc=(e,t,n)=>{let r=e===``?t:vc(t,e);r.classGroupId=n},gc=(e,t,n,r)=>{if(yc(e)){pc(e(r),t,n,r);return}t.validators===null&&(t.validators=[]),t.validators.push(rc(n,e))},_c=(e,t,n,r)=>{let i=Object.entries(e),a=i.length;for(let e=0;e<a;e++){let[a,o]=i[e];pc(o,vc(t,a),n,r)}},vc=(e,t)=>{let n=e,r=t.split(ac),i=r.length;for(let e=0;e<i;e++){let t=r[e],i=n.nextPart.get(t);i||(i=ic(),n.nextPart.set(t,i)),n=i}return n},yc=e=>`isThemeGetter`in e&&e.isThemeGetter===!0,bc=`!`,xc=58,Sc=47,Cc=91,wc=93,Tc=40,Ec=41,Dc=33,Oc=(e,t,n,r)=>({modifiers:e,hasImportantModifier:t,baseClassName:n,maybePostfixModifierPosition:r,isExternal:void 0}),kc=e=>{let t=[],n=0,r=0,i=0,a,o=e.length;for(let s=0;s<o;s++){let o=e.charCodeAt(s);if(n===0&&r===0){if(o===xc){t.push(e.slice(i,s)),i=s+1;continue}if(o===Sc){a=s;continue}}o===Cc?n++:o===wc?n--:o===Tc?r++:o===Ec&&r--}let s=t.length===0?e:e.slice(i),c=s,l=!1,u=s.length-1;s.charCodeAt(u)===Dc?(c=s.slice(0,-1),l=!0):s.charCodeAt(0)===Dc&&(c=s.slice(1),l=!0);let d=a&&a>i?a-i:void 0;return Oc(t,l,c,d)},Ac=e=>{let t=new Set(e.orderSensitiveModifiers);return e=>{let n=[],r=[];for(let i=0;i<e.length;i++){let a=e[i],o=a[0]===`[`,s=t.has(a);if(o||s){if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e]);r=[]}n.push(a)}else r.push(a)}if(r.length>0){r.sort();for(let e=0;e<r.length;e++)n.push(r[e])}return n}},jc={isExternal:!0,classId:-1,conflictIds:[]},Mc=4096,Nc=16384,Pc=e=>{let t=Ac(e),n=Fc(e),{getClassGroupId:r,getConflictingClassGroupIds:i}=cc(e),a=Object.create(null),o=Object.create(null),s=0,c=new Int32Array(256),l=0,u=new Uint8Array(64),d=!1,f=e=>{let t=[],n=e.length,r=-1;d=!1;for(let i=0;i<n;i++){let n=e.charCodeAt(i);n===32?r!==-1&&(t.push(e.slice(r,i)),r=-1):n>=9&&n<=13?(d=!0,r!==-1&&(t.push(e.slice(r,i)),r=-1)):r===-1&&(r=i)}return r!==-1&&t.push(e.slice(r)),t},p=new Map,m=0,h=e=>{let t=p.get(e);if(t===void 0&&(t=m++,p.set(e,t),t>=c.length)){let e=new Int32Array(c.length*2);e.set(c),c=e}return t},g=e=>{let{isExternal:a,modifiers:o,hasImportantModifier:s,baseClassName:c,maybePostfixModifierPosition:l}=kc(e);if(a)return jc;let u=!!l,d;if(u){let e=c.substring(0,l);d=r(e);let t=d&&n[d]?r(c):void 0;t&&t!==d&&(d=t,u=!1)}else d=r(c);if(!d){if(!u||(d=r(c),!d))return jc;u=!1}let f=o.length===0?``:o.length===1?o[0]:t(o).join(`:`),p=s?f+bc:f,m=i(d,u),g=[];for(let e=0;e<m.length;e++)g.push(h(p+m[e]));return{isExternal:!1,classId:h(p+d),conflictIds:g}},_=e=>{let t=a[e];return t===void 0?(t=o[e],t===void 0&&(t=g(e)),a[e]=t,++s>Mc&&(s=0,o=a,a=Object.create(null)),t):t};return{parseClassName:kc,sortModifiers:t,postfixLookupClassGroupIds:n,getClassGroupId:r,getConflictingClassGroupIds:i,getClassDescriptor:_,mergeClassList:e=>{let t=f(e),n=t.length;if(n===1)return t[0];m>Nc&&(p.clear(),m=0,a=Object.create(null),o=Object.create(null),s=0),l=l+1|0,l===0&&(l=1);let r=l;if(n>u.length){let e=u.length;for(;e<n;)e*=2;u=new Uint8Array(e)}let i=!1,h=0;for(let e=n-1;e>=0;--e){let n=t[e];h+=n.length;let a=_(n);if(a.isExternal){u[e]=1;continue}let o=a.classId;if(c[o]===r){u[e]=0,i=!0;continue}c[o]=r;let s=a.conflictIds;for(let e=0;e<s.length;e++)c[s[e]]=r;u[e]=1}if(!i&&!d&&e.length===h+n-1)return e;let g=``;for(let e=0;e<n;e++)u[e]===1&&(g&&(g+=` `),g+=t[e]);return g}}},Fc=e=>{let t=Object.create(null),n=e.postfixLookupClassGroups;if(n)for(let e=0;e<n.length;e++)t[n[e]]=!0;return t},Ic=500,Lc=e=>{let t,n,r=Object.create(null),i=Object.create(null),a=0,o=r=>(t=Pc(e()),n=t.mergeClassList,c.mergeString=s,s(r)),s=e=>{let t=r[e];return t===void 0?(t=i[e],t===void 0&&(t=n(e)),r[e]=t,++a>Ic&&(a=0,i=r,r=Object.create(null)),t):t},c=(...e)=>c.mergeString(es(e));return c.mergeString=o,c},Rc=[],Y=e=>{let t=t=>t[e]||Rc;return t.isThemeGetter=!0,t},zc=/^\[(?:(\w[\w-]*):)?(.+)\]$/i,Bc=/^\((?:(\w[\w-]*):)?(.+)\)$/i,Vc=/^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,Hc=/^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,Uc=/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,Wc=/^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,Gc=/^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,Kc=/^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,qc=Number,Jc=Number.isNaN,Yc=Number.isInteger,Xc=e=>Vc.test(e),X=e=>!!e&&!Jc(qc(e)),Zc=e=>!!e&&Yc(qc(e)),Qc=e=>e.endsWith(`%`)&&X(e.slice(0,-1)),$c=e=>Hc.test(e),el=()=>!0,tl=e=>Uc.test(e)&&!Wc.test(e),nl=()=>!1,rl=e=>Gc.test(e),il=e=>Kc.test(e),al=e=>!Z(e)&&!Q(e),ol=e=>e.startsWith(`@container`)&&(e[10]===`/`&&e[11]!==void 0||e[11]===`s`&&e[16]!==void 0&&e.startsWith(`-size/`,10)||e[11]===`n`&&e[18]!==void 0&&e.startsWith(`-normal/`,10)),sl=e=>Sl(e,El,nl),Z=e=>zc.test(e),cl=e=>Sl(e,Dl,tl),ll=e=>Sl(e,Ol,X),ul=e=>Sl(e,Al,el),dl=e=>Sl(e,kl,nl),fl=e=>Sl(e,wl,nl),pl=e=>Sl(e,Tl,il),ml=e=>Sl(e,jl,rl),Q=e=>Bc.test(e),hl=e=>Cl(e,Dl),gl=e=>Cl(e,kl),_l=e=>Cl(e,wl),vl=e=>Cl(e,El),yl=e=>Cl(e,Tl),bl=e=>Cl(e,jl,!0),xl=e=>Cl(e,Al,!0),Sl=(e,t,n)=>{let r=zc.exec(e);return r?r[1]?t(r[1]):n(r[2]):!1},Cl=(e,t,n=!1)=>{let r=Bc.exec(e);return r?r[1]?t(r[1]):n:!1},wl=e=>e===`position`||e===`percentage`,Tl=e=>e===`image`||e===`url`,El=e=>e===`length`||e===`size`||e===`bg-size`,Dl=e=>e===`length`,Ol=e=>e===`number`,kl=e=>e===`family-name`,Al=e=>e===`number`||e===`weight`,jl=e=>e===`shadow`,Ml=()=>{let e=Y(`color`),t=Y(`font`),n=Y(`text`),r=Y(`font-weight`),i=Y(`tracking`),a=Y(`leading`),o=Y(`breakpoint`),s=Y(`container`),c=Y(`spacing`),l=Y(`radius`),u=Y(`shadow`),d=Y(`inset-shadow`),f=Y(`text-shadow`),p=Y(`drop-shadow`),m=Y(`blur`),h=Y(`perspective`),g=Y(`aspect`),_=Y(`ease`),v=Y(`animate`),y=()=>[`auto`,`avoid`,`all`,`avoid-page`,`page`,`left`,`right`,`column`],b=()=>[`center`,`top`,`bottom`,`left`,`right`,`top-left`,`left-top`,`top-right`,`right-top`,`bottom-right`,`right-bottom`,`bottom-left`,`left-bottom`],x=()=>[...b(),Q,Z],S=()=>[`auto`,`hidden`,`clip`,`visible`,`scroll`],ee=()=>[`auto`,`contain`,`none`],C=()=>[Q,Z,c],w=()=>[Xc,`full`,`auto`,...C()],te=()=>[Zc,`none`,`subgrid`,Q,Z],ne=()=>[`auto`,{span:[`full`,Zc,Q,Z]},Zc,Q,Z],re=()=>[Zc,`auto`,Q,Z],ie=()=>[`auto`,`min`,`max`,`fr`,Q,Z],ae=()=>[`start`,`end`,`center`,`between`,`around`,`evenly`,`stretch`,`baseline`,`center-safe`,`end-safe`],T=()=>[`start`,`end`,`center`,`stretch`,`center-safe`,`end-safe`],E=()=>[`auto`,...C()],D=()=>[Xc,`auto`,`full`,`dvw`,`dvh`,`lvw`,`lvh`,`svw`,`svh`,`min`,`max`,`fit`,...C()],oe=()=>[Xc,`screen`,`full`,`dvw`,`lvw`,`svw`,`min`,`max`,`fit`,...C()],se=()=>[Xc,`screen`,`full`,`lh`,`dvh`,`lvh`,`svh`,`min`,`max`,`fit`,...C()],O=()=>[e,Q,Z],ce=()=>[...b(),_l,fl,{position:[Q,Z]}],le=()=>[`no-repeat`,{repeat:[``,`x`,`y`,`space`,`round`]}],ue=()=>[`auto`,`cover`,`contain`,vl,sl,{size:[Q,Z]}],de=()=>[Qc,hl,cl],k=()=>[``,`none`,`full`,l,Q,Z],A=()=>[``,X,hl,cl],j=()=>[`solid`,`dashed`,`dotted`,`double`],M=()=>[`normal`,`multiply`,`screen`,`overlay`,`darken`,`lighten`,`color-dodge`,`color-burn`,`hard-light`,`soft-light`,`difference`,`exclusion`,`hue`,`saturation`,`color`,`luminosity`],N=()=>[X,Qc,_l,fl],fe=()=>[``,`none`,m,Q,Z],pe=()=>[`none`,X,Q,Z],me=()=>[`none`,X,Q,Z],he=()=>[X,Q,Z],P=()=>[Xc,`full`,...C()];return{theme:{animate:[`spin`,`ping`,`pulse`,`bounce`],aspect:[`video`],blur:[$c],breakpoint:[$c],color:[el],container:[$c],"drop-shadow":[$c],ease:[`in`,`out`,`in-out`],font:[al],"font-weight":[`thin`,`extralight`,`light`,`normal`,`medium`,`semibold`,`bold`,`extrabold`,`black`],"inset-shadow":[$c],leading:[`none`,`tight`,`snug`,`normal`,`relaxed`,`loose`],perspective:[`dramatic`,`near`,`normal`,`midrange`,`distant`,`none`],radius:[$c],shadow:[$c],spacing:[`px`,X],text:[$c],"text-shadow":[$c],tracking:[`tighter`,`tight`,`normal`,`wide`,`wider`,`widest`]},classGroups:{aspect:[{aspect:[`auto`,`square`,Xc,Z,Q,g]}],container:[`container`],"container-type":[{"@container":[``,`normal`,`size`,Q,Z]}],"container-named":[ol],columns:[{columns:[X,Z,Q,s]}],"break-after":[{"break-after":y()}],"break-before":[{"break-before":y()}],"break-inside":[{"break-inside":[`auto`,`avoid`,`avoid-page`,`avoid-column`]}],"box-decoration":[{"box-decoration":[`slice`,`clone`]}],box:[{box:[`border`,`content`]}],display:[`block`,`inline-block`,`inline`,`flex`,`inline-flex`,`table`,`inline-table`,`table-caption`,`table-cell`,`table-column`,`table-column-group`,`table-footer-group`,`table-header-group`,`table-row-group`,`table-row`,`flow-root`,`grid`,`inline-grid`,`contents`,`list-item`,`hidden`],sr:[`sr-only`,`not-sr-only`],float:[{float:[`right`,`left`,`none`,`start`,`end`]}],clear:[{clear:[`left`,`right`,`both`,`none`,`start`,`end`]}],isolation:[`isolate`,`isolation-auto`],"object-fit":[{object:[`contain`,`cover`,`fill`,`none`,`scale-down`]}],"object-position":[{object:x()}],overflow:[{overflow:S()}],"overflow-x":[{"overflow-x":S()}],"overflow-y":[{"overflow-y":S()}],overscroll:[{overscroll:ee()}],"overscroll-x":[{"overscroll-x":ee()}],"overscroll-y":[{"overscroll-y":ee()}],position:[`static`,`fixed`,`absolute`,`relative`,`sticky`],inset:[{inset:w()}],"inset-x":[{"inset-x":w()}],"inset-y":[{"inset-y":w()}],start:[{"inset-s":w(),start:w()}],end:[{"inset-e":w(),end:w()}],"inset-bs":[{"inset-bs":w()}],"inset-be":[{"inset-be":w()}],top:[{top:w()}],right:[{right:w()}],bottom:[{bottom:w()}],left:[{left:w()}],visibility:[`visible`,`invisible`,`collapse`],z:[{z:[Zc,`auto`,Q,Z]}],basis:[{basis:[Xc,`full`,`auto`,s,...C()]}],"flex-direction":[{flex:[`row`,`row-reverse`,`col`,`col-reverse`]}],"flex-wrap":[{flex:[`nowrap`,`wrap`,`wrap-reverse`]}],flex:[{flex:[X,Xc,`auto`,`initial`,`none`,Z]}],grow:[{grow:[``,X,Q,Z]}],shrink:[{shrink:[``,X,Q,Z]}],order:[{order:[Zc,`first`,`last`,`none`,Q,Z]}],"grid-cols":[{"grid-cols":te()}],"col-start-end":[{col:ne()}],"col-start":[{"col-start":re()}],"col-end":[{"col-end":re()}],"grid-rows":[{"grid-rows":te()}],"row-start-end":[{row:ne()}],"row-start":[{"row-start":re()}],"row-end":[{"row-end":re()}],"grid-flow":[{"grid-flow":[`row`,`col`,`dense`,`row-dense`,`col-dense`]}],"auto-cols":[{"auto-cols":ie()}],"auto-rows":[{"auto-rows":ie()}],gap:[{gap:C()}],"gap-x":[{"gap-x":C()}],"gap-y":[{"gap-y":C()}],"justify-content":[{justify:[...ae(),`normal`]}],"justify-items":[{"justify-items":[...T(),`normal`]}],"justify-self":[{"justify-self":[`auto`,...T()]}],"align-content":[{content:[`normal`,...ae()]}],"align-items":[{items:[...T(),{baseline:[``,`last`]}]}],"align-self":[{self:[`auto`,...T(),{baseline:[``,`last`]}]}],"place-content":[{"place-content":ae()}],"place-items":[{"place-items":[...T(),`baseline`]}],"place-self":[{"place-self":[`auto`,...T()]}],p:[{p:C()}],px:[{px:C()}],py:[{py:C()}],ps:[{ps:C()}],pe:[{pe:C()}],pbs:[{pbs:C()}],pbe:[{pbe:C()}],pt:[{pt:C()}],pr:[{pr:C()}],pb:[{pb:C()}],pl:[{pl:C()}],m:[{m:E()}],mx:[{mx:E()}],my:[{my:E()}],ms:[{ms:E()}],me:[{me:E()}],mbs:[{mbs:E()}],mbe:[{mbe:E()}],mt:[{mt:E()}],mr:[{mr:E()}],mb:[{mb:E()}],ml:[{ml:E()}],"space-x":[{"space-x":C()}],"space-x-reverse":[`space-x-reverse`],"space-y":[{"space-y":C()}],"space-y-reverse":[`space-y-reverse`],size:[{size:D()}],"inline-size":[{inline:[`auto`,...oe()]}],"min-inline-size":[{"min-inline":[`auto`,...oe()]}],"max-inline-size":[{"max-inline":[`none`,...oe()]}],"block-size":[{block:[`auto`,...se()]}],"min-block-size":[{"min-block":[`auto`,...se()]}],"max-block-size":[{"max-block":[`none`,...se()]}],w:[{w:[s,`screen`,...D()]}],"min-w":[{"min-w":[s,`screen`,`none`,...D()]}],"max-w":[{"max-w":[s,`screen`,`none`,`prose`,{screen:[o]},...D()]}],h:[{h:[`screen`,`lh`,...D()]}],"min-h":[{"min-h":[`screen`,`lh`,`none`,...D()]}],"max-h":[{"max-h":[`screen`,`lh`,...D()]}],"font-size":[{text:[`base`,n,hl,cl]}],"font-smoothing":[`antialiased`,`subpixel-antialiased`],"font-style":[`italic`,`not-italic`],"font-weight":[{font:[r,xl,ul]}],"font-stretch":[{"font-stretch":[`ultra-condensed`,`extra-condensed`,`condensed`,`semi-condensed`,`normal`,`semi-expanded`,`expanded`,`extra-expanded`,`ultra-expanded`,Qc,Z]}],"font-family":[{font:[gl,dl,t]}],"font-features":[{"font-features":[Z]}],"fvn-normal":[`normal-nums`],"fvn-ordinal":[`ordinal`],"fvn-slashed-zero":[`slashed-zero`],"fvn-figure":[`lining-nums`,`oldstyle-nums`],"fvn-spacing":[`proportional-nums`,`tabular-nums`],"fvn-fraction":[`diagonal-fractions`,`stacked-fractions`],tracking:[{tracking:[i,Q,Z]}],"line-clamp":[{"line-clamp":[X,`none`,Q,ll]}],leading:[{leading:[a,...C()]}],"list-image":[{"list-image":[`none`,Q,Z]}],"list-style-position":[{list:[`inside`,`outside`]}],"list-style-type":[{list:[`disc`,`decimal`,`none`,Q,Z]}],"text-alignment":[{text:[`left`,`center`,`right`,`justify`,`start`,`end`]}],"placeholder-color":[{placeholder:O()}],"text-color":[{text:O()}],"text-decoration":[`underline`,`overline`,`line-through`,`no-underline`],"text-decoration-style":[{decoration:[...j(),`wavy`]}],"text-decoration-thickness":[{decoration:[X,`from-font`,`auto`,Q,cl]}],"text-decoration-color":[{decoration:O()}],"underline-offset":[{"underline-offset":[X,`auto`,Q,Z]}],"text-transform":[`uppercase`,`lowercase`,`capitalize`,`normal-case`],"text-overflow":[`truncate`,`text-ellipsis`,`text-clip`],"text-wrap":[{text:[`wrap`,`nowrap`,`balance`,`pretty`]}],indent:[{indent:C()}],"tab-size":[{tab:[Zc,Q,Z]}],"vertical-align":[{align:[`baseline`,`top`,`middle`,`bottom`,`text-top`,`text-bottom`,`sub`,`super`,Q,Z]}],whitespace:[{whitespace:[`normal`,`nowrap`,`pre`,`pre-line`,`pre-wrap`,`break-spaces`]}],break:[{break:[`normal`,`words`,`all`,`keep`]}],wrap:[{wrap:[`break-word`,`anywhere`,`normal`]}],hyphens:[{hyphens:[`none`,`manual`,`auto`]}],content:[{content:[`none`,Q,Z]}],"bg-attachment":[{bg:[`fixed`,`local`,`scroll`]}],"bg-clip":[{"bg-clip":[`border`,`padding`,`content`,`text`]}],"bg-origin":[{"bg-origin":[`border`,`padding`,`content`]}],"bg-position":[{bg:ce()}],"bg-repeat":[{bg:le()}],"bg-size":[{bg:ue()}],"bg-image":[{bg:[`none`,{linear:[{to:[`t`,`tr`,`r`,`br`,`b`,`bl`,`l`,`tl`]},Zc,Q,Z],radial:[``,Q,Z],conic:[Zc,Q,Z]},yl,pl]}],"bg-color":[{bg:O()}],"gradient-from-pos":[{from:de()}],"gradient-via-pos":[{via:de()}],"gradient-to-pos":[{to:de()}],"gradient-from":[{from:O()}],"gradient-via":[{via:O()}],"gradient-to":[{to:O()}],rounded:[{rounded:k()}],"rounded-s":[{"rounded-s":k()}],"rounded-e":[{"rounded-e":k()}],"rounded-t":[{"rounded-t":k()}],"rounded-r":[{"rounded-r":k()}],"rounded-b":[{"rounded-b":k()}],"rounded-l":[{"rounded-l":k()}],"rounded-ss":[{"rounded-ss":k()}],"rounded-se":[{"rounded-se":k()}],"rounded-ee":[{"rounded-ee":k()}],"rounded-es":[{"rounded-es":k()}],"rounded-tl":[{"rounded-tl":k()}],"rounded-tr":[{"rounded-tr":k()}],"rounded-br":[{"rounded-br":k()}],"rounded-bl":[{"rounded-bl":k()}],"border-w":[{border:A()}],"border-w-x":[{"border-x":A()}],"border-w-y":[{"border-y":A()}],"border-w-s":[{"border-s":A()}],"border-w-e":[{"border-e":A()}],"border-w-bs":[{"border-bs":A()}],"border-w-be":[{"border-be":A()}],"border-w-t":[{"border-t":A()}],"border-w-r":[{"border-r":A()}],"border-w-b":[{"border-b":A()}],"border-w-l":[{"border-l":A()}],"divide-x":[{"divide-x":A()}],"divide-x-reverse":[`divide-x-reverse`],"divide-y":[{"divide-y":A()}],"divide-y-reverse":[`divide-y-reverse`],"border-style":[{border:[...j(),`hidden`,`none`]}],"divide-style":[{divide:[...j(),`hidden`,`none`]}],"border-color":[{border:O()}],"border-color-x":[{"border-x":O()}],"border-color-y":[{"border-y":O()}],"border-color-s":[{"border-s":O()}],"border-color-e":[{"border-e":O()}],"border-color-bs":[{"border-bs":O()}],"border-color-be":[{"border-be":O()}],"border-color-t":[{"border-t":O()}],"border-color-r":[{"border-r":O()}],"border-color-b":[{"border-b":O()}],"border-color-l":[{"border-l":O()}],"divide-color":[{divide:O()}],"outline-style":[{outline:[...j(),`none`,`hidden`]}],"outline-offset":[{"outline-offset":[X,Q,Z]}],"outline-w":[{outline:[``,X,hl,cl]}],"outline-color":[{outline:O()}],shadow:[{shadow:[``,`none`,u,bl,ml]}],"shadow-color":[{shadow:O()}],"inset-shadow":[{"inset-shadow":[`none`,d,bl,ml]}],"inset-shadow-color":[{"inset-shadow":O()}],"ring-w":[{ring:A()}],"ring-w-inset":[`ring-inset`],"ring-color":[{ring:O()}],"ring-offset-w":[{"ring-offset":[X,cl]}],"ring-offset-color":[{"ring-offset":O()}],"inset-ring-w":[{"inset-ring":A()}],"inset-ring-color":[{"inset-ring":O()}],"text-shadow":[{"text-shadow":[`none`,f,bl,ml]}],"text-shadow-color":[{"text-shadow":O()}],opacity:[{opacity:[X,Q,Z]}],"mix-blend":[{"mix-blend":[...M(),`plus-darker`,`plus-lighter`]}],"bg-blend":[{"bg-blend":M()}],"mask-clip":[{"mask-clip":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]},`mask-no-clip`],"mask-composite":[{mask:[`add`,`subtract`,`intersect`,`exclude`]}],"mask-image-linear-pos":[{"mask-linear":[X]}],"mask-image-linear-from-pos":[{"mask-linear-from":N()}],"mask-image-linear-to-pos":[{"mask-linear-to":N()}],"mask-image-linear-from-color":[{"mask-linear-from":O()}],"mask-image-linear-to-color":[{"mask-linear-to":O()}],"mask-image-t-from-pos":[{"mask-t-from":N()}],"mask-image-t-to-pos":[{"mask-t-to":N()}],"mask-image-t-from-color":[{"mask-t-from":O()}],"mask-image-t-to-color":[{"mask-t-to":O()}],"mask-image-r-from-pos":[{"mask-r-from":N()}],"mask-image-r-to-pos":[{"mask-r-to":N()}],"mask-image-r-from-color":[{"mask-r-from":O()}],"mask-image-r-to-color":[{"mask-r-to":O()}],"mask-image-b-from-pos":[{"mask-b-from":N()}],"mask-image-b-to-pos":[{"mask-b-to":N()}],"mask-image-b-from-color":[{"mask-b-from":O()}],"mask-image-b-to-color":[{"mask-b-to":O()}],"mask-image-l-from-pos":[{"mask-l-from":N()}],"mask-image-l-to-pos":[{"mask-l-to":N()}],"mask-image-l-from-color":[{"mask-l-from":O()}],"mask-image-l-to-color":[{"mask-l-to":O()}],"mask-image-x-from-pos":[{"mask-x-from":N()}],"mask-image-x-to-pos":[{"mask-x-to":N()}],"mask-image-x-from-color":[{"mask-x-from":O()}],"mask-image-x-to-color":[{"mask-x-to":O()}],"mask-image-y-from-pos":[{"mask-y-from":N()}],"mask-image-y-to-pos":[{"mask-y-to":N()}],"mask-image-y-from-color":[{"mask-y-from":O()}],"mask-image-y-to-color":[{"mask-y-to":O()}],"mask-image-radial":[{"mask-radial":[Q,Z]}],"mask-image-radial-from-pos":[{"mask-radial-from":N()}],"mask-image-radial-to-pos":[{"mask-radial-to":N()}],"mask-image-radial-from-color":[{"mask-radial-from":O()}],"mask-image-radial-to-color":[{"mask-radial-to":O()}],"mask-image-radial-shape":[{"mask-radial":[`circle`,`ellipse`]}],"mask-image-radial-size":[{"mask-radial":[{closest:[`side`,`corner`],farthest:[`side`,`corner`]}]}],"mask-image-radial-pos":[{"mask-radial-at":b()}],"mask-image-conic-pos":[{"mask-conic":[X]}],"mask-image-conic-from-pos":[{"mask-conic-from":N()}],"mask-image-conic-to-pos":[{"mask-conic-to":N()}],"mask-image-conic-from-color":[{"mask-conic-from":O()}],"mask-image-conic-to-color":[{"mask-conic-to":O()}],"mask-mode":[{mask:[`alpha`,`luminance`,`match`]}],"mask-origin":[{"mask-origin":[`border`,`padding`,`content`,`fill`,`stroke`,`view`]}],"mask-position":[{mask:ce()}],"mask-repeat":[{mask:le()}],"mask-size":[{mask:ue()}],"mask-type":[{"mask-type":[`alpha`,`luminance`]}],"mask-image":[{mask:[`none`,Q,Z]}],filter:[{filter:[``,`none`,Q,Z]}],blur:[{blur:fe()}],brightness:[{brightness:[X,Q,Z]}],contrast:[{contrast:[X,Q,Z]}],"drop-shadow":[{"drop-shadow":[``,`none`,p,bl,ml]}],"drop-shadow-color":[{"drop-shadow":O()}],grayscale:[{grayscale:[``,X,Q,Z]}],"hue-rotate":[{"hue-rotate":[X,Q,Z]}],invert:[{invert:[``,X,Q,Z]}],saturate:[{saturate:[X,Q,Z]}],sepia:[{sepia:[``,X,Q,Z]}],"backdrop-filter":[{"backdrop-filter":[``,`none`,Q,Z]}],"backdrop-blur":[{"backdrop-blur":fe()}],"backdrop-brightness":[{"backdrop-brightness":[X,Q,Z]}],"backdrop-contrast":[{"backdrop-contrast":[X,Q,Z]}],"backdrop-grayscale":[{"backdrop-grayscale":[``,X,Q,Z]}],"backdrop-hue-rotate":[{"backdrop-hue-rotate":[X,Q,Z]}],"backdrop-invert":[{"backdrop-invert":[``,X,Q,Z]}],"backdrop-opacity":[{"backdrop-opacity":[X,Q,Z]}],"backdrop-saturate":[{"backdrop-saturate":[X,Q,Z]}],"backdrop-sepia":[{"backdrop-sepia":[``,X,Q,Z]}],"border-collapse":[{border:[`collapse`,`separate`]}],"border-spacing":[{"border-spacing":C()}],"border-spacing-x":[{"border-spacing-x":C()}],"border-spacing-y":[{"border-spacing-y":C()}],"table-layout":[{table:[`auto`,`fixed`]}],caption:[{caption:[`top`,`bottom`]}],transition:[{transition:[``,`all`,`colors`,`opacity`,`shadow`,`transform`,`none`,Q,Z]}],"transition-behavior":[{transition:[`normal`,`discrete`]}],duration:[{duration:[X,`initial`,Q,Z]}],ease:[{ease:[`linear`,`initial`,_,Q,Z]}],delay:[{delay:[X,Q,Z]}],animate:[{animate:[`none`,v,Q,Z]}],backface:[{backface:[`hidden`,`visible`]}],perspective:[{perspective:[h,Q,Z]}],"perspective-origin":[{"perspective-origin":x()}],rotate:[{rotate:pe()}],"rotate-x":[{"rotate-x":pe()}],"rotate-y":[{"rotate-y":pe()}],"rotate-z":[{"rotate-z":pe()}],scale:[{scale:me()}],"scale-x":[{"scale-x":me()}],"scale-y":[{"scale-y":me()}],"scale-z":[{"scale-z":me()}],"scale-3d":[`scale-3d`],skew:[{skew:he()}],"skew-x":[{"skew-x":he()}],"skew-y":[{"skew-y":he()}],transform:[{transform:[Q,Z,``,`none`,`gpu`,`cpu`]}],"transform-origin":[{origin:x()}],"transform-style":[{transform:[`3d`,`flat`]}],translate:[{translate:P()}],"translate-x":[{"translate-x":P()}],"translate-y":[{"translate-y":P()}],"translate-z":[{"translate-z":P()}],"translate-none":[`translate-none`],zoom:[{zoom:[Zc,Q,Z]}],accent:[{accent:O()}],appearance:[{appearance:[`none`,`auto`]}],"caret-color":[{caret:O()}],"color-scheme":[{scheme:[`normal`,`dark`,`light`,`light-dark`,`only-dark`,`only-light`]}],cursor:[{cursor:[`auto`,`default`,`pointer`,`wait`,`text`,`move`,`help`,`not-allowed`,`none`,`context-menu`,`progress`,`cell`,`crosshair`,`vertical-text`,`alias`,`copy`,`no-drop`,`grab`,`grabbing`,`all-scroll`,`col-resize`,`row-resize`,`n-resize`,`e-resize`,`s-resize`,`w-resize`,`ne-resize`,`nw-resize`,`se-resize`,`sw-resize`,`ew-resize`,`ns-resize`,`nesw-resize`,`nwse-resize`,`zoom-in`,`zoom-out`,Q,Z]}],"field-sizing":[{"field-sizing":[`fixed`,`content`]}],"pointer-events":[{"pointer-events":[`auto`,`none`]}],resize:[{resize:[`none`,``,`y`,`x`]}],"scroll-behavior":[{scroll:[`auto`,`smooth`]}],"scrollbar-thumb-color":[{"scrollbar-thumb":O()}],"scrollbar-track-color":[{"scrollbar-track":O()}],"scrollbar-gutter":[{"scrollbar-gutter":[`auto`,`stable`,`both`]}],"scrollbar-w":[{scrollbar:[`auto`,`thin`,`none`]}],"scroll-m":[{"scroll-m":C()}],"scroll-mx":[{"scroll-mx":C()}],"scroll-my":[{"scroll-my":C()}],"scroll-ms":[{"scroll-ms":C()}],"scroll-me":[{"scroll-me":C()}],"scroll-mbs":[{"scroll-mbs":C()}],"scroll-mbe":[{"scroll-mbe":C()}],"scroll-mt":[{"scroll-mt":C()}],"scroll-mr":[{"scroll-mr":C()}],"scroll-mb":[{"scroll-mb":C()}],"scroll-ml":[{"scroll-ml":C()}],"scroll-p":[{"scroll-p":C()}],"scroll-px":[{"scroll-px":C()}],"scroll-py":[{"scroll-py":C()}],"scroll-ps":[{"scroll-ps":C()}],"scroll-pe":[{"scroll-pe":C()}],"scroll-pbs":[{"scroll-pbs":C()}],"scroll-pbe":[{"scroll-pbe":C()}],"scroll-pt":[{"scroll-pt":C()}],"scroll-pr":[{"scroll-pr":C()}],"scroll-pb":[{"scroll-pb":C()}],"scroll-pl":[{"scroll-pl":C()}],"snap-align":[{snap:[`start`,`end`,`center`,`align-none`]}],"snap-stop":[{snap:[`normal`,`always`]}],"snap-type":[{snap:[`none`,`x`,`y`,`both`]}],"snap-strictness":[{snap:[`mandatory`,`proximity`]}],touch:[{touch:[`auto`,`none`,`manipulation`]}],"touch-x":[{"touch-pan":[`x`,`left`,`right`]}],"touch-y":[{"touch-pan":[`y`,`up`,`down`]}],"touch-pz":[`touch-pinch-zoom`],select:[{select:[`none`,`text`,`all`,`auto`]}],"will-change":[{"will-change":[`auto`,`scroll`,`contents`,`transform`,Q,Z]}],fill:[{fill:[`none`,...O()]}],"stroke-w":[{stroke:[X,hl,cl,ll]}],stroke:[{stroke:[`none`,...O()]}],"forced-color-adjust":[{"forced-color-adjust":[`auto`,`none`]}]},conflictingClassGroups:{"container-named":[`container-type`],overflow:[`overflow-x`,`overflow-y`],overscroll:[`overscroll-x`,`overscroll-y`],inset:[`inset-x`,`inset-y`,`inset-bs`,`inset-be`,`start`,`end`,`top`,`right`,`bottom`,`left`],"inset-x":[`right`,`left`],"inset-y":[`top`,`bottom`],flex:[`basis`,`grow`,`shrink`],gap:[`gap-x`,`gap-y`],p:[`px`,`py`,`ps`,`pe`,`pbs`,`pbe`,`pt`,`pr`,`pb`,`pl`],px:[`pr`,`pl`],py:[`pt`,`pb`],m:[`mx`,`my`,`ms`,`me`,`mbs`,`mbe`,`mt`,`mr`,`mb`,`ml`],mx:[`mr`,`ml`],my:[`mt`,`mb`],size:[`w`,`h`],"font-size":[`leading`],"fvn-normal":[`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`],"fvn-ordinal":[`fvn-normal`],"fvn-slashed-zero":[`fvn-normal`],"fvn-figure":[`fvn-normal`],"fvn-spacing":[`fvn-normal`],"fvn-fraction":[`fvn-normal`],"line-clamp":[`display`,`overflow`],rounded:[`rounded-s`,`rounded-e`,`rounded-t`,`rounded-r`,`rounded-b`,`rounded-l`,`rounded-ss`,`rounded-se`,`rounded-ee`,`rounded-es`,`rounded-tl`,`rounded-tr`,`rounded-br`,`rounded-bl`],"rounded-s":[`rounded-ss`,`rounded-es`],"rounded-e":[`rounded-se`,`rounded-ee`],"rounded-t":[`rounded-tl`,`rounded-tr`],"rounded-r":[`rounded-tr`,`rounded-br`],"rounded-b":[`rounded-br`,`rounded-bl`],"rounded-l":[`rounded-tl`,`rounded-bl`],"border-spacing":[`border-spacing-x`,`border-spacing-y`],"border-w":[`border-w-x`,`border-w-y`,`border-w-s`,`border-w-e`,`border-w-bs`,`border-w-be`,`border-w-t`,`border-w-r`,`border-w-b`,`border-w-l`],"border-w-x":[`border-w-r`,`border-w-l`],"border-w-y":[`border-w-t`,`border-w-b`],"border-color":[`border-color-x`,`border-color-y`,`border-color-s`,`border-color-e`,`border-color-bs`,`border-color-be`,`border-color-t`,`border-color-r`,`border-color-b`,`border-color-l`],"border-color-x":[`border-color-r`,`border-color-l`],"border-color-y":[`border-color-t`,`border-color-b`],translate:[`translate-x`,`translate-y`,`translate-none`],"translate-none":[`translate`,`translate-x`,`translate-y`,`translate-z`],"scroll-m":[`scroll-mx`,`scroll-my`,`scroll-ms`,`scroll-me`,`scroll-mbs`,`scroll-mbe`,`scroll-mt`,`scroll-mr`,`scroll-mb`,`scroll-ml`],"scroll-mx":[`scroll-mr`,`scroll-ml`],"scroll-my":[`scroll-mt`,`scroll-mb`],"scroll-p":[`scroll-px`,`scroll-py`,`scroll-ps`,`scroll-pe`,`scroll-pbs`,`scroll-pbe`,`scroll-pt`,`scroll-pr`,`scroll-pb`,`scroll-pl`],"scroll-px":[`scroll-pr`,`scroll-pl`],"scroll-py":[`scroll-pt`,`scroll-pb`],touch:[`touch-x`,`touch-y`,`touch-pz`],"touch-x":[`touch`],"touch-y":[`touch`],"touch-pz":[`touch`]},conflictingClassGroupModifiers:{"font-size":[`leading`]},postfixLookupClassGroups:[`container-type`],orderSensitiveModifiers:[`*`,`**`,`after`,`backdrop`,`before`,`details-content`,`file`,`first-letter`,`first-line`,`marker`,`placeholder`,`selection`]}},Nl=(e,{extend:t={},override:n={}})=>(Fl(e.theme,n.theme),Fl(e.classGroups,n.classGroups),Fl(e.conflictingClassGroups,n.conflictingClassGroups),Fl(e.conflictingClassGroupModifiers,n.conflictingClassGroupModifiers),Pl(e,`postfixLookupClassGroups`,n.postfixLookupClassGroups),Pl(e,`orderSensitiveModifiers`,n.orderSensitiveModifiers),Il(e.theme,t.theme),Il(e.classGroups,t.classGroups),Il(e.conflictingClassGroups,t.conflictingClassGroups),Il(e.conflictingClassGroupModifiers,t.conflictingClassGroupModifiers),Ll(e,t,`postfixLookupClassGroups`),Ll(e,t,`orderSensitiveModifiers`),e),Pl=(e,t,n)=>{n!==void 0&&(e[t]=n)},Fl=(e,t)=>{if(t)for(let n in t)Pl(e,n,t[n])},Il=(e,t)=>{if(t)for(let n in t)Ll(e,t,n)},Ll=(e,t,n)=>{let r=t[n];r!==void 0&&(e[n]=e[n]?e[n].concat(r):r)},Rl=e=>Lc(e?typeof e==`function`?()=>e(Ml()):()=>Nl(Ml(),e):Ml),zl=e=>{if(ss(e))return;let t=e,n={...t.extend??{}};for(let e of[`theme`,`classGroups`,`conflictingClassGroups`,`conflictingClassGroupModifiers`,`postfixLookupClassGroups`,`orderSensitiveModifiers`,`cacheSize`,`prefix`,`separator`,`experimentalParseClassName`])t[e]!==void 0&&n[e]===void 0&&(n[e]=t[e]);let r={};if(Object.keys(n).length>0&&(r.extend=n),t.override!=null&&!ss(t.override)&&(r.override=t.override),r.extend||r.override)return r},Bl=e=>{let t=Rl(zl(e));return e=>t.mergeString(e)},Vl,Hl=()=>(Vl||=Rl(),Vl),Ul=()=>((!J.cachedTwMerge||J.didTwMergeConfigChange)&&(J.didTwMergeConfigChange=!1,J.cachedTwMerge=Bl(J.cachedTwMergeConfig)),J.cachedTwMerge),Wl=e=>{let t=e?.twMergeConfig;t&&!ss(t)&&(cs(t,J.cachedTwMergeConfig)||(J.cachedTwMergeConfig=t,J.didTwMergeConfigChange=!0))},Gl=e=>es(e);(()=>{let e=Error();return!(`line`in e)&&!(`lineNumber`in e)})();var Kl=J.reset.bind(J);J.reset=()=>{Vl=void 0,Kl()};var ql=(e,t)=>{let n=Gl(e);return!n||!(t?.twMerge??!0)?n||void 0:n.indexOf(` `)===-1?n:(Wl(t),(t?.twMergeConfig&&!ss(t.twMergeConfig)?Ul():Hl().mergeString)(n)||void 0)},Jl=tc((e,...t)=>ql(t,e));Jl.tv;var Yl=Jl.createTV,Xl=`/* Generated by \`bun run tokens\` from design/tokens/cawco.tokens.json.
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
`,$=e=>[...Xl.matchAll(RegExp(`^\\s*--${e}-([a-z0-9-]+):`,`gm`))].map(([,e])=>e),Zl=e=>[...Xl.matchAll(RegExp(`^@utility ${e}-([a-z0-9-]+) \\{`,`gm`))].map(([,e])=>e),Ql=$(`duration`),$l=[`type-role`,`font-shorthand`,`font-family`,`font-features`,`font-size`,`font-stretch`,`font-style`,`font-weight`,`fvn-normal`,`fvn-ordinal`,`fvn-slashed-zero`,`fvn-figure`,`fvn-spacing`,`fvn-fraction`,`leading`],eu=[Go.isArbitraryVariable,Go.isArbitraryValue],tu={extend:{theme:{text:Zl(`text`).filter(e=>!e.startsWith(`size-`)),spacing:$(`spacing`),radius:$(`radius`),shadow:$(`shadow`),"drop-shadow":$(`drop-shadow`),leading:$(`leading`),tracking:$(`tracking`),ease:$(`ease`),font:$(`font`).filter(e=>!e.startsWith(`weight-`)),"font-weight":$(`font-weight`),breakpoint:$(`breakpoint`),container:$(`container`),animate:$(`animate`)},classGroups:{"font-size":[{"text-size":Zl(`text-size`)}],"bg-image":[{bg:Zl(`bg`)}],transition:[{transition:[...Zl(`transition`),`off`,`control-grow`]}],animate:[`sheet-fade`],content:[{content:[`data-n`,`placeholder`]}],"grid-rows":[{"grid-rows":[`shut`,`open`]}],"grid-cols":[{"grid-cols":[`fluid-auto`,`mark-fluid`]}],"auto-rows":[{"auto-rows":[`line`,`band`,`band-phone`]}],"animation-duration":[{"anim-dur":Ql}],"animation-delay":[{"anim-delay":Ql}],"type-role":[{type:Zl(`type`)}],"border-none-t":[`border-t-none`],"border-none-b":[`border-b-none`],"border-none-l":[`border-l-none`],"border-none-r":[`border-r-none`],"border-none-s":[`border-s-none`],"border-style-t":[`border-t-dashed`],"outline-off":[`outline-off`],"background-shorthand":[{background:[Go.isAny]}],rounded:[`rounded-inherit`,{concentric:$(`radius`)}],"concentric-in":[`concentric-in`],"r-outer":[{"r-outer":$(`radius`)}],"r-inset":[{"r-inset":$(`spacing`)}],"font-family":[`font-family-inherit`],gap:[`gap-inherit`],"color-scheme":[`scheme-inherit`],"pointer-events":[`pointer-events-all`],"max-h":[`max-h-inherit`],"align-items":[`items-box-start`,`items-box-end`,`items-unsafe-end`],"justify-content":[`justify-box-end`],"justify-self":[`justify-self-box-start`],"align-content":[`content-unsafe-end`],"border-color":[`border-suggest-tint`],"bg-color":[`bg-suggest-tint`,`bg-suggest-tint-hover`],"font-shorthand":[`font-inherit`,`font-mono-meta`],"line-clamp-undo":[`line-clamp-undo`],"translate-raw":[{"translate-raw":eu}],"clip-margin":[{"clip-margin":[Go.isAny]}],"overflow-anchor":[`anchor-none`],"scroll-timeline":[`scroll-timeline-transcript-head`],"pane-tab-pads":[`pane-tab-pads`],"pane-tab-rims":[`pane-tab-rims`],"divider-chevron":[`divider-chevron`],"turn-pad":[`turn-pad`],"word-break-word":[`break-word`],"animation-play-state":[`animation-paused`],"inks-strong":[`inks-strong`],"tap-highlight":[`tap-highlight-none`],"touch-callout":[`touch-callout-none`],"content-visibility":[`content-visibility-hidden`],"timeline-scope":[`timeline-scope-transcript-head`],"writing-mode":[`writing-vertical-rl`],direction:[`dir-rtl`],"clip-path":[{"clip-path":eu},`clip-block-start`,`clip-tab-foot`],"grid-areas":[{"grid-areas":eu}],"line-clamp-std":[{"line-clamp-std":[Go.isInteger]}],"ring-ground":[{"ring-ground":[Go.isAny]}],"hit-gap-x":[{"hit-gap-x":[Go.isAny]}],"hit-gap-y":[{"hit-gap-y":eu}],"caw-neck":[{"caw-neck":eu}],"press-by":[{"press-by":eu}],"swap-away":[{"swap-away":[Go.isInteger]}],"rail-step":[{"rail-step":eu}],"prompt-fs":[{"prompt-fs":eu}],"fade-inset-end":[{"fade-inset-end":eu}]},conflictingClassGroups:{"type-role":[...$l],"font-shorthand":[...$l]}}},nu=Qo(tu),ru=Yl({twMergeConfig:tu});function iu(...e){return nu(ji(e))}var au=ru({base:`inline-flex items-center rounded-sm text-ink-strong type-label mark-line`,variants:{variant:{option:`group/option touch-hit min-h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-3 py-space-1 text-start hit-edge-hair enabled:not-aria-pressed:not-aria-checked:not-data-chosen:hover:bg-surface-hover aria-checked:border-brand-solid aria-checked:bg-surface-recess aria-pressed:border-brand-solid aria-pressed:bg-surface-recess data-chosen:border-brand-solid data-chosen:bg-surface-recess motion-safe:transition-[border-color,background-color] motion-safe:duration-(--dur-control) motion-safe:ease-out`,tray:`pointer-events-auto touch-hit relative isolate h-c-tray-chip touch-manipulation gap-c-pill-gap border-0 bg-transparent px-space-2 transition-[color] duration-(--dur-control) ease-out select-none [--tray-chip-fill:var(--surface-raised)] touch-callout-none before:absolute before:inset-0 before:-z-1 before:rounded-inherit before:border before:border-border-hairline before:bg-(color:--tray-chip-fill) before:shadow-tile before:transition-[background-color] before:duration-(--dur-control) before:ease-out motion-safe:transition-[color,transform] motion-safe:active:[transform:scale(var(--press-scale))] can-hover:hover:[--tray-chip-fill:var(--surface-hover)] *:[svg]:size-icon-md *:[svg]:flex-none`,inline:`-my-c-inline-chip-pad max-w-full gap-space-1 rounded-[calc(var(--radius-xs)+var(--c-inline-chip-pad))] bg-surface-recess py-c-inline-chip-pad ps-c-inline-chip-pad pe-space-2 align-baseline leading-c-inline-chip-line whitespace-nowrap inset-ring inset-ring-border-hairline *:data-[slot=label]:max-w-c-inline-chip-max-w *:data-[slot=label]:min-w-0 *:data-[slot=label]:self-baseline *:data-[slot=label]:overflow-clip *:data-[slot=label]:text-ellipsis motion-safe:transition-[background-color,transform] motion-safe:duration-(--dur-control) motion-safe:ease-out motion-safe:enabled:active:[transform:scale(var(--press-scale))] can-hover:enabled:hover:bg-surface-hover *:[svg]:size-icon-md *:[svg]:flex-none`,setting:`touch-hit h-c-btn-h-sm max-w-full gap-space-2 border border-border-control bg-surface-raised px-space-2 leading-none whitespace-nowrap hit-edge-hair transition-control aria-disabled:opacity-50 *:data-[slot=chevron]:size-icon-sm *:data-[slot=chevron]:text-ink-subtle **:data-[slot=chip-label]:min-w-0 **:data-[slot=chip-label]:overflow-hidden **:data-[slot=chip-label]:text-ellipsis motion-safe:transition-control-press can-hover:enabled:not-variant-static:hover:bg-surface-hover motion-safe:enabled:not-aria-busy:pressed:[transform:scale(var(--press-scale))] variant-static:border-border-hairline variant-static:bg-surface-recess *:[svg]:flex-none *:[svg]:not-data-[slot=chevron]:size-icon-md`},size:{regular:``,compact:`h-(--row-compact-h) gap-space-1 max-phone:h-c-btn-h-lg max-phone:not-data-account-chip:*:data-[slot=chevron]:hidden`},tone:{muted:``,fail:``,grant:``}},compoundVariants:[{variant:`setting`,tone:`muted`,class:`text-ink-muted`},{variant:`setting`,tone:`fail`,class:`border-status-fail-ink text-status-fail-ink`},{variant:`setting`,tone:`grant`,class:`border-status-attn-ink bg-status-attn-bg text-status-attn-ink *:data-[slot=chevron]:text-status-attn-ink can-hover:enabled:not-variant-static:hover:bg-status-attn-bg variant-static:border-status-attn-ink variant-static:bg-status-attn-bg`}],defaultVariants:{variant:`option`}}),ou=ru({base:`flex flex-wrap gap-space-2 hit-gap-x-space-2 hit-gap-y-space-2 coarse:gap-y-space-4 coarse:hit-gap-y-space-4`});export{ye as $,Kr as A,Cn as B,$r as C,Wr as D,Gr as E,kr as F,Jt as G,sn as H,U as I,lt as J,Vt as K,mr as L,Mr as M,jr as N,Br as O,Ar as P,be as Q,On as R,ii as S,qr as T,cn as U,on as V,ln as W,He as X,Ue as Y,Be as Z,vi as _,ba as a,si as b,pa as c,ia as d,f as et,Bi as f,Di as g,ki as h,ru as i,Ur as j,Hr as k,da as l,Mi as m,ou as n,ya as o,Ri as p,zt as q,iu as r,ma as s,au as t,g as tt,oa as u,_i as v,Qr as w,oi as x,di as y,xn as z};