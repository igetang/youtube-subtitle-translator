console.log("内容脚本已加载。");function L(){chrome.runtime.sendMessage({action:"getData"},e=>{if(chrome.runtime.lastError){console.error("发送消息时出错:",chrome.runtime.lastError);return}e&&e.status==="success"?console.log("来自后台的数据:",e.data):console.error("从后台获取数据失败。",e)})}window.addEventListener("load",()=>{console.log("页面已加载。正在获取数据..."),L()});const m=chrome.runtime.getURL("icons/off.svg"),g=chrome.runtime.getURL("icons/on.svg"),f=chrome.runtime.getURL("icons/l-setting.svg"),h=chrome.runtime.getURL("icons/l-setting-active.svg"),T=chrome.runtime.getURL("icons/normal-border.svg");let p=!1,i=!1,t=null,a=null,d=null;function x(){t||(t=document.createElement("div"),t.className="ytp-tooltip ytp-top vid-translate-tooltip",t.setAttribute("aria-hidden","true"),t.style.cssText=`
    position: fixed; /* 使用 fixed 相对于视口定位 */
    max-width: 300px;
    display: none; /* 初始隐藏 */
    z-index: 2300;
    pointer-events: none;
    box-sizing: border-box;
    /* 模拟 YouTube 工具提示样式 */
    background-color: rgba(28, 28, 28, 0.9);
    color: #fff;
    padding: 6px 8px;
    border-radius: 5px;
    font-size: 1.2rem; /* 按要求 */
    font-weight: 500;
    white-space: nowrap; /* 防止文本换行 */
    text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
    transition: opacity 0.1s cubic-bezier(0.4, 0, 1, 1);
    opacity: 0;
  `,a=document.createElement("div"),a.className="ytp-tooltip-text",t.appendChild(a),document.body.appendChild(t),console.log("工具提示容器已创建。"))}function E(e,o){if(x(),!t||!a)return;d&&(clearTimeout(d),d=null),a.textContent=o,t.style.visibility="hidden",t.style.display="block",t.style.opacity="0";const n=t.offsetWidth,r=e.getBoundingClientRect(),s=r.left+r.width/2,c=r.top,l=s-n/2,u=c-40;t.style.left=`${l}px`,t.style.top=`${u}px`,t.style.visibility="visible",t.style.opacity="1"}function C(){t&&(t.style.opacity="0",d=window.setTimeout(()=>{t&&(t.style.display="none"),d=null},100))}function w(){const e=document.createElement("img");return e.src=T,e.style.cssText=`
    position: absolute;
    width: 36px;
    height: 36px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    box-sizing: border-box;
  `,e.classList.add("ytp-custom-button-border"),e}function R(e,o){const n=document.createElement("img");return n.src=e,n.width=24,n.height=24,n.alt=o,n.style.cssText=`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  `,n.classList.add("ytp-custom-button-icon"),n}function y(e,o,n,r){const s=document.createElement("button");s.id=e,s.style.cssText=`
    position: relative;
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    vertical-align: top;
    outline: none;
  `,s.classList.add("ytp-button");const c=w(),l=R(n,o);return s.appendChild(c),s.appendChild(l),s.addEventListener("mouseenter",()=>{E(s,o)}),s.addEventListener("mouseleave",C),s.addEventListener("click",r),{button:s,icon:l}}function b(){if(p){console.log("控件已注入。");return}const e=document.querySelector(".ytp-left-controls");if(!e){console.log("尚未找到 .ytp-left-controls。");return}console.log("正在注入自定义控件..."),x();const o=document.createElement("div");o.id="ytp-custom-controls-panel",o.style.cssText=`
    display: flex;
    align-items: center;
    height: 48px;
    /* margin-right is already set below */
    /* order: 99; Might be unnecessary with marginLeft: auto */
  `,o.style.marginLeft="auto",o.style.marginRight="8px";const n="翻译开关",{button:r,icon:s}=y("custom-translate-button",n,i?g:m,()=>{i=!i,s.src=i?g:m,chrome.storage.sync.set({translateActive:i}),console.log("翻译状态:",i)}),c="翻译设置",{button:l,icon:u}=y("custom-settings-button",c,f,()=>{console.log("设置按钮已点击");const v=u.src===h;u.src=v?f:h});o.appendChild(r),o.appendChild(l),e.appendChild(o),p=!0,console.log("自定义控件注入成功。")}function I(){chrome.storage.sync.get(["translateActive"],o=>{chrome.runtime.lastError?console.error("读取存储时出错:",chrome.runtime.lastError):(i=!!o.translateActive,console.log("初始翻译状态:",i)),b()}),new MutationObserver((o,n)=>{if(p){n.disconnect();return}document.querySelector(".ytp-left-controls")&&(console.log("观察者找到 .ytp-left-controls。"),b())}).observe(document.body,{childList:!0,subtree:!0}),console.log("MutationObserver 已启动。")}I();
