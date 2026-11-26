import{c as n}from"./index-CSlwhp0V.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const i=n("Zap",[["path",{d:"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",key:"1xq2db"}]]),t="rv:season-div",h=()=>{const o=window.location.hash;return/^#\/?season\b/i.test(o)?new URLSearchParams(o.split("?")[1]??"").get("div")??"":""},c=o=>{const a=new URLSearchParams(window.location.hash.split("?")[1]??"").get("y"),s=`#season?${a&&/^#\/?season/i.test(window.location.hash)?`y=${a}&`:""}div=${encodeURIComponent(o)}`;window.location.hash!==s&&(window.location.hash=s),window.dispatchEvent(new CustomEvent(t,{detail:o}))};export{t as S,i as Z,h,c as o};
