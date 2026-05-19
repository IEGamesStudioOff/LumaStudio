let selectedSize = "550ko";

const splash = document.getElementById("splash");
const projectScreen = document.getElementById("project");
const dots = document.getElementById("dots");
const statusText = document.getElementById("status");

let dotState = 0;

setInterval(() => {
  dotState = (dotState + 1) % 4;
  dots.textContent = ".".repeat(dotState || 3);
}, 350);

setTimeout(() => {
  splash.classList.remove("active");
  projectScreen.classList.add("active");
}, 1800);

document.querySelectorAll(".size-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".size-option").forEach((item) => {
      item.classList.remove("selected");
      const cursor = item.querySelector(".cursor");
      if (cursor) cursor.remove();
    });

    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "▶";

    button.prepend(cursor);
    button.classList.add("selected");
    selectedSize = button.dataset.size;

    statusText.textContent = `Taille sélectionnée : ${selectedSize}`;
  });
});

document.getElementById("createProject").addEventListener("click", async () => {
  const project = {
    name: document.getElementById("projectName").value.trim() || "MonProjet",
    editor: document.getElementById("editorName").value.trim() || "I.E.Games_Studio",
    size: selectedSize
  };

  statusText.textContent = "Création du projet...";

  const result = await window.lumaAPI.createProject(project);

  if (result.canceled) {
    statusText.textContent = "Création annulée.";
    return;
  }

  if (!result.ok) {
    statusText.textContent = result.error || "Erreur lors de la création.";
    return;
  }

  statusText.textContent = `Projet créé : ${result.path}`;
});
