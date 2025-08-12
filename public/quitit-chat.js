(function(){
  const API_BASE = ""; // same origin by default; if hosting elsewhere, set full URL

  const BRAND = {
    green: "#1C3A3B",
    orange: "#FF5B00",
    chipBg: "#EEFFBD",
    chipText: "#1C3A3B"
  };

  const style = document.createElement("style");
  style.textContent = `
  .qi-launch{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:${BRAND.green};display:grid;place-items:center;z-index:999999;border:none;box-shadow:0 10px 25px rgba(0,0,0,.18);cursor:pointer;transition:transform .15s}
  .qi-launch:hover{transform:scale(1.06)}
  .qi-launch img{width:30px;height:30px;border-radius:50%}
  .qi-box{position:fixed;right:18px;bottom:84px;width:360px;max-width:92vw;background:#fff;border:1px solid ${BRAND.green};border-radius:18px;box-shadow:0 16px 50px rgba(0,0,0,.18);overflow:hidden;z-index:999998;display:none}
  .qi-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:${BRAND.green};color:#fff}
  .qi-head .qi-title{font:600 14px/1.2 system-ui}
  .qi-head .qi-sub{font:12px system-ui;opacity:.85}
  .qi-body{height:420px;overflow:auto;background:#fff;padding:10px}
  .qi-row{display:flex;margin:6px 0}
  .qi-bot{justify-content:flex-start}
  .qi-user{justify-content:flex-end}
  .qi-bubble{max-width:78%;padding:8px 10px;border-radius:14px;border:1px solid #e8e8e8;background:#fff;font:13px/1.45 system-ui}
  .qi-user .qi-bubble{background:${BRAND.orange};border-color:${BRAND.orange};color:#fff}
  .qi-foot{border-top:1px solid #eee;padding:8px;background:#fff}
  .qi-input{width:100%;display:flex;gap:8px}
  .qi-input input{flex:1;border:1px solid #ddd;border-radius:14px;padding:10px 12px;font:13px system-ui}
  .qi-input button{border:none;background:${BRAND.orange};color:#fff;border-radius:14px;padding:10px 14px;font:600 12px system-ui;cursor:pointer}
  .qi-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
  .qi-chip{border:1px solid #d7e9c0;background:${BRAND.chipBg};color:${BRAND.chipText};border-radius:999px;padding:6px 10px;font:12px system-ui;cursor:pointer}
  `;
  document.head.appendChild(style);

  // Create launcher
  const launch = document.createElement("button");
  launch.className = "qi-launch";
  const logo = document.createElement("img");
  logo.alt = "QUIT IT";
  logo.src = "https://via.placeholder.com/60x60.png?text=QI"; // replace with your hosted logo if desired
  launch.appendChild(logo);
  document.body.appendChild(launch);

  // Chat window
  const box = document.createElement("div");
  box.className = "qi-box";
  box.innerHTML = `
    <div class="qi-head">
      <div class="qi-title">QUIT IT Support</div>
      <div class="qi-sub" style="margin-left:8px;">Hi! Ask me anything</div>
    </div>
    <div class="qi-body"></div>
    <div class="qi-foot">
      <div class="qi-chips"></div>
      <div class="qi-input">
        <input placeholder="Type your message…" />
        <button>Send</button>
      </div>
    </div>`;
  document.body.appendChild(box);

  const body = box.querySelector(".qi-body");
  const chips = box.querySelector(".qi-chips");
  const input = box.querySelector("input");
  const sendBtn = box.querySelector("button");

  function push(role, text){
    const row = document.createElement("div");
    row.className = "qi-row " + (role === "user" ? "qi-user" : "qi-bot");
    const b = document.createElement("div");
    b.className = "qi-bubble";
    b.textContent = text;
    row.appendChild(b);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  }

  function sampleQuickQuestions(){
    const all = [
      "How long do the Flavour Cores last?",
      "Does it feel like smoking a cigarette?",
      "Is it safe during pregnancy?",
      "How do I activate a core?",
      "Refunds & returns?",
      "Shipping times & tracking?",
      "Can you ship internationally?",
      "Is the product FDA/TGA approved?",
      "Can I buy in a physical store?",
      "Do you have Afterpay?",
      "How long is shipping?",
      "What’s inside the cores?",
      "The flavour feels weak — is that normal?",
      "Is it safe to use?",
      "Can I change my order address?",
      "How should I adjust my device for stronger taste?",
      "Why does my order route through another state?",
      "How can I schedule a delivery?",
      "What does “Sold Out” mean?",
      "When will a sold-out item be back?"
    ];
    const shuffled = all.sort(()=>Math.random()-0.5);
    return shuffled.slice(0,6);
  }

  function renderChips() {
    chips.innerHTML = "";
    const qs = sampleQuickQuestions();
    qs.forEach(q => {
      const btn = document.createElement("button");
      btn.className = "qi-chip";
      btn.textContent = q;
      btn.onclick = () => ask(q);
      chips.appendChild(btn);
    });
  }

  async function ask(text){
    push("user", text);
    chips.innerHTML = "";
    try{
      const r = await fetch((API_BASE || "") + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await r.json();
      const answer = data && data.answer ? data.answer :
        "I’m not 100% sure on that one! Could you email our team at support@quititaus.com.au so we can help you out?";
      push("assistant", answer);
      renderChips();
    }catch(e){
      push("assistant", "Hmm, something went wrong. Please email support@quititaus.com.au and we’ll help right away.");
    }
  }

  // Events
  launch.onclick = () => {
    const visible = box.style.display === "block";
    box.style.display = visible ? "none" : "block";
    if (!visible && body.children.length === 0) {
      push("assistant", "Hey! I can help with shipping, flavours, safety, returns — ask me anything.");
      renderChips();
    }
  };
  sendBtn.onclick = () => {
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    ask(t);
  };
  input.addEventListener("keydown", (e)=>{
    if (e.key === "Enter") { e.preventDefault(); sendBtn.click(); }
  });

})();
