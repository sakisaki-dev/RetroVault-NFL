import{c as d,r as t,ap as f,j as n,b as p}from"./index-CSlwhp0V.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=d("Clock",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 16 14",key:"68esgv"}]]),y=({open:e,children:o,className:c,id:i})=>{const[l,s]=t.useState(e),[u,a]=t.useState(e);return t.useEffect(()=>{if(e){s(!0);let r=requestAnimationFrame(()=>{r=requestAnimationFrame(()=>a(!0))});return()=>cancelAnimationFrame(r)}a(!1);const m=window.setTimeout(()=>s(!1),f.slow+40);return()=>window.clearTimeout(m)},[e]),l?n.jsx("div",{id:i,className:p("rv-collapse",c),"data-open":u,children:n.jsx("div",{children:o})}):null};export{x as C,y as a};
