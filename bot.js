// ==============================
// 🤖 Quanton3D Bot - Frontend
// ==============================

// URL do seu backend no Render
const API = "https://quanton3d-bot-v2.onrender.com/ask";

const chatEl = document.getElementById("chat");
const inputEl = document.getElementById("input");
const formEl = document.getElementById("composer");
const statusEl = document.getElementById("status");
const resetEl = document.getElementById("resetBtn");

// Adiciona mensagens na tela
function addMsg(role, text) {
  const msg = document.createElement("div");
  msg.className = `msg ${role}`;
  msg.innerHTML = `
    <div class="avatar">${role === "user" ? "🧑" : "🤖"}</div>
    <div class="bubble">${text}</div>
  `;
  chatEl.appendChild(msg);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Define status do robô (pensando, falando, etc)
function setStatus(state) {
  statusEl.textContent =
    state === "thinking"
      ? "⏳ Quanton3D IA está pensando..."
      : state === "speaking"
      ? "💬 Respondendo..."
      : "⚡ Online";
}

// Função principal que conversa com o backend
async function askBot(prompt) {
  addMsg("user", prompt);
  setStatus("thinking");

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });

    const data = await res.json();
    addMsg("bot", data.reply || "Desculpe, não consegui entender.");
    setStatus("speaking");
  } catch (err) {
    console.error(err);
    addMsg("bot", "⚠️ Erro de conexão com o servidor da IA.");
    setStatus("neutral");
  }
}

// Captura o envio do formulário
formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (text) {
    askBot(text);
    inputEl.value = "";
  }
});

// Reseta o chat
resetEl.addEventListener("click", () => {
  chatEl.innerHTML = "";
  addMsg("bot", "👋 Oi! Eu sou o QuantonBot3D. Como posso te ajudar hoje?");
  setStatus("neutral");
});

// Mensagem inicial
addMsg("bot", "👋 Olá! Eu sou o QuantonBot3D, assistente da Quanton3D IA.");
setStatus("neutral");
