import{c as r,an as i,r as c,ai as o,ao as u,j as e}from"./index-CSlwhp0V.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=r("ChevronLeft",[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]]),d=(a,n="Back")=>{const{navigate:t}=i(),s=c.useRef(null);return{ref:o({down:!1,right:!0,reveal:()=>s.current,onDismiss:()=>{u()?window.history.back():t(a,{replace:!0})}}),hint:e.jsxs("div",{ref:s,className:"swipe-back-hint","aria-hidden":"true",children:[e.jsx(h,{className:"h-5 w-5"}),e.jsx("span",{children:n})]})}};export{h as C,d as u};
