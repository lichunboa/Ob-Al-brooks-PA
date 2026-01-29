---

---
---
<%*
const url = await tp.system.prompt("请输入 TradingView 分享链接");
if (url) {
%>
<iframe
    src="<% url %>"
    width="100%"
    height="600"
    style="border:none;"
    allowfullscreen>
</iframe>
<%* } %>
---