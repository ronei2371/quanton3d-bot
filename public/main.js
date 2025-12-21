const form = document.getElementById("ask-form");
const input = document.getElementById("user-input");
const responseText = document.getElementById("response-text");
const responseStatus = document.getElementById("response-status");
const clearButton = document.getElementById("clear-response");
const copyButton = document.getElementById("copy-response");
const robotMedia = document.querySelector(".robot-media");
const robotVideo = document.getElementById("elio-video");
const quickActions = document.querySelectorAll(".chip");

const SESSION_KEY = "quanton3d-session";

const getSessionId = () => {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, generated);
  return generated;
};

const setStatus = (text) => {
  responseStatus.textContent = text;
};

const setRobotState = (state) => {
  if (state === "thinking") {
    robotMedia.classList.add("is-thinking");
    robotVideo.currentTime = 0;
    robotVideo.play().catch(() => {});
    return;
  }

  robotMedia.classList.remove("is-thinking");
  robotVideo.pause();
};

const typeResponse = async (text) => {
  responseText.textContent = "";
  const characters = [...text];
  for (let index = 0; index < characters.length; index += 1) {
    responseText.textContent += characters[index];
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
};

const sendQuestion = async (question) => {
  setStatus("Processando pergunta...");
  setRobotState("thinking");
  responseText.textContent = "";

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: question,
        sessionId: getSessionId(),
      }),
    });

    if (!response.ok) {
      throw new Error("Erro ao buscar resposta");
    }

    const data = await response.json();
    setStatus("Respondendo...");
    await typeResponse(data.reply || "Sem resposta disponível no momento.");
    setStatus("Resposta concluída");
  } catch (error) {
    responseText.textContent =
      "Não foi possível obter a resposta agora. Tente novamente em alguns instantes.";
    setStatus("Falha na comunicação");
  } finally {
    setRobotState("idle");
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  sendQuestion(question);
});

clearButton.addEventListener("click", () => {
  responseText.textContent = "";
  setStatus("Aguardando sua pergunta");
  input.value = "";
  input.focus();
});

copyButton.addEventListener("click", async () => {
  const text = responseText.textContent.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Resposta copiada");
  } catch (error) {
    setStatus("Não foi possível copiar");
  }
});

quickActions.forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.prompt;
    if (!prompt) return;
    input.value = prompt;
    input.focus();
  });
});
