const MAX_FILE_TEXT_CHARS = 90000;
const MAX_PAGE_TEXT_CHARS = 3500;
const MAX_STORED_PAGES_PER_PDF = 120;
const MAX_KNOWLEDGE_STORAGE_CHARS = 2400000;
const LOCAL_AI_MODEL = 'qwen3:8b';
const LOCAL_AI_ENDPOINT = 'http://127.0.0.1:11434/api/chat';
// Proxy Cloudflare Worker care tine API key-ul Groq pe server.
// Utilizatorii finali nu configureaza nimic; un key manual salvat in setari
// (pentru dezvoltare) are prioritate si apeleaza Groq direct.
const GROQ_PROXY_ENDPOINT = ''; // ex: 'https://local-copilot-proxy.<subdomain>.workers.dev/chat'

const state = {
  latestReply: "",
  knowledgeFiles: [],
  pdfBuffers: new Map(),
  pendingAttachment: null,
  restoringChat: false,
  conversationMenu: null,
  conversationMenuTargetId: null,
  replyAbortController: null,
  thinkingNode: null,
  streamingMessage: null,
  streamingText: "",
  generating: false,
  tasks: [],
  groqMinuteRequests: []
};

const elements = {
  appShell: document.querySelector("#appShell"),
  chatSidebar: document.querySelector(".chat-sidebar"),
  sidebarScrim: document.querySelector("#sidebarScrim"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  sidebarOpenButton: document.querySelector("#sidebarOpenButton"),
  sidebarResizeHandle: document.querySelector("#sidebarResizeHandle"),
  sidebarDrawer: document.querySelector("#sidebarDrawer"),
  drawerTitle: document.querySelector("#drawerTitle"),
  drawerCloseButton: document.querySelector("#drawerCloseButton"),
  settingsMenuButton: document.querySelector("#settingsMenuButton"),
  settingsMenu: document.querySelector("#settingsMenu"),
  quickPanelButtons: document.querySelectorAll("[data-quick-panel]"),
  drawerButtons: document.querySelectorAll("[data-drawer-tab]"),
  drawerNavButtons: document.querySelectorAll("[data-drawer-nav]"),
  newChatButton: document.querySelector("#newChatButton"),
  conversationList: document.querySelector("#conversationList"),
  themeSelect: document.querySelector("#themeSelect"),
  accentColorInput: document.querySelector("#accentColorInput"),
  backgroundSelect: document.querySelector("#backgroundSelect"),
  backgroundOptionButtons: document.querySelectorAll("[data-background-option]"),
  wallpaperInput: document.querySelector("#wallpaperInput"),
  clearWallpaperButton: document.querySelector("#clearWallpaperButton"),
  conversation: document.querySelector("#conversation"),
  emptyChatHero: document.querySelector("#emptyChatHero"),
  textForm: document.querySelector("#textForm"),
  attachButton: document.querySelector("#attachButton"),
  sendButton: document.querySelector("#sendButton"),
  textInput: document.querySelector("#textInput"),
  clearChatButton: document.querySelector("#clearChatButton"),
  languageSelect: document.querySelector("#languageSelect"),
  languageOptionButtons: document.querySelectorAll("[data-language-option]"),
  fileInput: document.querySelector("#fileInput"),
  fileList: document.querySelector("#fileList"),
  clearFilesButton: document.querySelector("#clearFilesButton"),
  translatePdfToggle: document.querySelector("#translatePdfToggle"),
  translateEndpointInput: document.querySelector("#translateEndpointInput"),
  onlineTranslateToggle: document.querySelector("#onlineTranslateToggle"),
  testTranslatorButton: document.querySelector("#testTranslatorButton"),
  translatorStatus: document.querySelector("#translatorStatus"),
  settingsPanels: document.querySelectorAll(".settings-panel"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  taskForm: document.querySelector("#taskForm"),
  taskInput: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  clearDoneTasksButton: document.querySelector("#clearDoneTasksButton"),
  groqApiKeyInput: document.querySelector("#groqApiKeyInput"),
  groqModelSelect: document.querySelector("#groqModelSelect"),
  groqKeyStatus: document.querySelector("#groqKeyStatus"),
  exportChatButton: document.querySelector("#exportChatButton"),
  aiModeButton: document.querySelector("#aiModeButton"),
  groqUsageCircle: document.querySelector("#groqUsageCircle"),
  groqUsagePanel: document.querySelector("#groqUsagePanel"),
  conversationPanel: document.querySelector(".conversation-panel"),
  systemPromptInput: document.querySelector("#systemPromptInput"),
  temperatureSlider: document.querySelector("#temperatureSlider"),
  temperatureValue: document.querySelector("#temperatureValue"),
  maxTokensSlider: document.querySelector("#maxTokensSlider"),
  maxTokensValue: document.querySelector("#maxTokensValue"),
};

const storageKeys = {
  chat: "localCopilot.chat",
  conversations: "localCopilot.conversations",
  activeConversation: "localCopilot.activeConversation",
  language: "localCopilot.language",
  files: "localCopilot.files",
  tasks: "localCopilot.tasks",
  sidebarCollapsed: "localCopilot.sidebarCollapsed",
  sidebarWidth: "localCopilot.sidebarWidth",
  theme: "localCopilot.theme",
  accentColor: "localCopilot.accentColor",
  backgroundPreset: "localCopilot.backgroundPreset",
  customWallpaper: "localCopilot.customWallpaper",
  translatePdf: "localCopilot.translatePdf",
  translateEndpoint: "localCopilot.translateEndpoint",
  onlineTranslate: "localCopilot.onlineTranslate",
  groqApiKey: "localCopilot.groqApiKey",
  groqModel: "localCopilot.groqModel",
  systemPrompt: "localCopilot.systemPrompt",
  aiTemperature: "localCopilot.aiTemperature",
  aiMaxTokens: "localCopilot.aiMaxTokens",
  aiMode: "localCopilot.aiMode"
};

function init() {
  elements.languageSelect.value = localStorage.getItem(storageKeys.language) || "en-US";
  elements.translatePdfToggle.checked = localStorage.getItem(storageKeys.translatePdf) !== "false";
  elements.onlineTranslateToggle.checked = localStorage.getItem(storageKeys.onlineTranslate) !== "false";
  elements.translateEndpointInput.value = localStorage.getItem(storageKeys.translateEndpoint) || "";
  elements.themeSelect.value = localStorage.getItem(storageKeys.theme) || "dark";
  elements.accentColorInput.value = localStorage.getItem(storageKeys.accentColor) || "#0a84ff";
  elements.backgroundSelect.value = localStorage.getItem(storageKeys.backgroundPreset) || "aurora";
  const savedGroqKey = localStorage.getItem(storageKeys.groqApiKey) || "";
  elements.groqApiKeyInput.value = savedGroqKey;
  updateGroqKeyStatus(savedGroqKey);
  elements.groqModelSelect.value = localStorage.getItem(storageKeys.groqModel) || "llama-3.3-70b-versatile";
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    // Pe mobil nu exista Ollama local — doar Smart (Groq 70B) e disponibil.
    localStorage.setItem(storageKeys.aiMode, "smart");
    elements.aiModeButton.style.display = "none";
    document.body.classList.add("native-app");
  }
  updateAiModeButton();
  elements.systemPromptInput.value = localStorage.getItem(storageKeys.systemPrompt) || "";
  const savedTemp = localStorage.getItem(storageKeys.aiTemperature) || "0.35";
  elements.temperatureSlider.value = savedTemp;
  elements.temperatureValue.value = savedTemp;
  const savedTokens = localStorage.getItem(storageKeys.aiMaxTokens) || "1200";
  elements.maxTokensSlider.value = savedTokens;
  elements.maxTokensValue.value = savedTokens;
  applyAppearance();
  applySidebarWidth(localStorage.getItem(storageKeys.sidebarWidth) || "320");
  setSidebarCollapsed(true);
  restoreKnowledgeFiles();
  restoreTasks();
  restoreChat();
  renderConversationArchive();
  startNewConversation();
  bindEvents();
  applyUiLanguage();
  updateEmptyChatState();
}

function bindEvents() {
  elements.attachButton.addEventListener("click", () => elements.fileInput.click());
  elements.sidebarToggle.addEventListener("click", () => setSidebarCollapsed(true));
  elements.sidebarOpenButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setSidebarCollapsed(false);
  });
  elements.sidebarScrim.addEventListener("click", () => setSidebarCollapsed(true));
  elements.chatSidebar.addEventListener("click", (event) => {
    if (isNeutralSidebarClick(event)) {
      hideConversationMenu();
      closeSettingsMenu();
    }
    event.stopPropagation();
  });
  bindSidebarResize();
  elements.settingsMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    hideConversationMenu();
    toggleSettingsMenu();
  });
  elements.drawerButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSidebarDrawer(button.dataset.drawerTab);
      closeSettingsMenu();
    });
  });
  elements.drawerNavButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSidebarDrawer(button.dataset.drawerNav);
    });
  });
  elements.quickPanelButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openQuickPanel(button.dataset.quickPanel);
    });
  });
  elements.drawerCloseButton.addEventListener("click", closeSidebarDrawer);
  elements.languageOptionButtons.forEach((button) => {
    button.addEventListener("click", () => setUiLanguage(button.dataset.languageOption));
  });
  elements.newChatButton.addEventListener("click", startNewConversation);
  elements.textForm.addEventListener("click", (event) => {
    if (event.target.closest("button, input, .mode-control, .mode-menu")) return;
    elements.textInput.focus();
  });

  elements.textForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.generating) {
      stopCurrentReply();
      return;
    }
    const text = elements.textInput.value.trim();
    if (!text) return;
    elements.textInput.value = "";
    handleUserMessage(text);
  });

  elements.conversation.addEventListener("click", handleSlideNavigation);

  elements.clearChatButton.addEventListener("click", () => {
    elements.conversation.innerHTML = "";
    localStorage.removeItem(storageKeys.chat);
    localStorage.removeItem(storageKeys.activeConversation);
    renderConversationArchive();
    addMessage("assistant", replyText("Conversation cleared.", "Conversatia a fost stearsa."));
  });

  elements.fileInput.addEventListener("change", handleFiles);
  elements.fileList.addEventListener("click", handleFileListClick);
  elements.translatePdfToggle.addEventListener("change", () => {
    localStorage.setItem(storageKeys.translatePdf, String(elements.translatePdfToggle.checked));
  });
  elements.translateEndpointInput.addEventListener("input", () => {
    localStorage.setItem(storageKeys.translateEndpoint, elements.translateEndpointInput.value.trim());
  });
  elements.onlineTranslateToggle.addEventListener("change", () => {
    localStorage.setItem(storageKeys.onlineTranslate, String(elements.onlineTranslateToggle.checked));
  });
  elements.testTranslatorButton.addEventListener("click", testTranslatorEndpoint);
  elements.themeSelect.addEventListener("change", () => {
    localStorage.setItem(storageKeys.theme, elements.themeSelect.value);
    applyAppearance();
  });
  elements.accentColorInput.addEventListener("input", () => {
    localStorage.setItem(storageKeys.accentColor, elements.accentColorInput.value);
    applyAppearance();
  });
  elements.backgroundSelect.addEventListener("change", () => {
    setBackgroundPreset(elements.backgroundSelect.value);
  });
  elements.backgroundOptionButtons.forEach((button) => {
    button.addEventListener("click", () => setBackgroundPreset(button.dataset.backgroundOption));
  });
  elements.wallpaperInput.addEventListener("change", handleWallpaperUpload);
  elements.clearWallpaperButton.addEventListener("click", () => {
    localStorage.removeItem(storageKeys.customWallpaper);
    elements.wallpaperInput.value = "";
    if (elements.backgroundSelect.value === "custom-wallpaper") {
      elements.backgroundSelect.value = "aurora";
      localStorage.setItem(storageKeys.backgroundPreset, "aurora");
    }
    applyAppearance();
  });
  elements.clearFilesButton.addEventListener("click", () => {
    state.knowledgeFiles = [];
    state.pdfBuffers.clear();
    localStorage.removeItem(storageKeys.files);
    renderFileList();
    addMessage("assistant", replyText("Knowledge files cleared from this browser.", "Fisierele de cunostinte au fost sterse din acest browser."));
  });

  elements.languageSelect.addEventListener("change", () => {
    setUiLanguage(elements.languageSelect.value, true);
  });

  elements.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask(elements.taskInput.value.trim());
    elements.taskInput.value = "";
  });

  elements.clearDoneTasksButton.addEventListener("click", () => {
    state.tasks = state.tasks.filter((task) => !task.done);
    persistTasks();
    renderTasks();
  });

  elements.exportChatButton.addEventListener("click", exportConversation);

  elements.aiModeButton.addEventListener("click", toggleAiMode);

  if (elements.groqUsageCircle) {
    elements.groqUsageCircle.addEventListener("click", toggleGroqUsagePanel);
  }

  elements.groqApiKeyInput.addEventListener("input", () => {
    const key = elements.groqApiKeyInput.value.trim();
    localStorage.setItem(storageKeys.groqApiKey, key);
    updateGroqKeyStatus(key);
  });

  elements.groqModelSelect.addEventListener("change", () => {
    localStorage.setItem(storageKeys.groqModel, elements.groqModelSelect.value);
  });

  elements.systemPromptInput.addEventListener("input", () => {
    localStorage.setItem(storageKeys.systemPrompt, elements.systemPromptInput.value.trim());
  });

  elements.temperatureSlider.addEventListener("input", () => {
    const value = elements.temperatureSlider.value;
    elements.temperatureValue.value = value;
    localStorage.setItem(storageKeys.aiTemperature, value);
  });

  elements.maxTokensSlider.addEventListener("input", () => {
    const value = elements.maxTokensSlider.value;
    elements.maxTokensValue.value = value;
    localStorage.setItem(storageKeys.aiMaxTokens, value);
  });
  document.addEventListener("click", (event) => {
    if (
      !elements.appShell.classList.contains("sidebar-collapsed") &&
      !elements.chatSidebar.contains(event.target) &&
      !elements.sidebarOpenButton.contains(event.target)
    ) {
      setSidebarCollapsed(true);
    }

    const drawerTabButton = event.target.closest("[data-drawer-tab]");
    if (drawerTabButton) {
      hideConversationMenu();
      event.preventDefault();
      event.stopPropagation();
      openSidebarDrawer(drawerTabButton.dataset.drawerTab);
      closeSettingsMenu();
      return;
    }

    const quickPanelButton = event.target.closest("[data-quick-panel]");
    if (quickPanelButton) {
      hideConversationMenu();
      event.preventDefault();
      event.stopPropagation();
      openQuickPanel(quickPanelButton.dataset.quickPanel);
      return;
    }

    const drawerNavButton = event.target.closest("[data-drawer-nav]");
    if (drawerNavButton) {
      hideConversationMenu();
      event.preventDefault();
      event.stopPropagation();
      openSidebarDrawer(drawerNavButton.dataset.drawerNav);
      return;
    }

    if (state.conversationMenu && !state.conversationMenu.contains(event.target)) {
      hideConversationMenu();
    }

    if (elements.groqUsagePanel && !elements.groqUsagePanel.hidden &&
        !elements.groqUsagePanel.contains(event.target) &&
        event.target !== elements.groqUsageCircle) {
      elements.groqUsagePanel.hidden = true;
    }

    if (!elements.settingsMenu.contains(event.target) && !elements.settingsMenuButton.contains(event.target)) {
      closeSettingsMenu();
    }
  });
}

function isNeutralSidebarClick(event) {
  return elements.chatSidebar.contains(event.target) &&
    !event.target.closest("button, input, textarea, select, label, a, .settings-menu, .conversation-context-menu, .conversation-item, .sidebar-drawer, .sidebar-resize-handle");
}


function openSidebarDrawer(tabId, options = {}) {
  const settingsTabs = ["languageSettingsPanel", "customSettingsPanel", "apiSettingsPanel"];
  const isSettings = settingsTabs.includes(tabId);
  elements.appShell.classList.add("drawer-open");
  elements.sidebarDrawer.classList.toggle("quick-panel", Boolean(options.quick));
  elements.sidebarDrawer.classList.add("open");
  elements.sidebarDrawer.setAttribute("aria-hidden", "false");
  elements.drawerButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerTab === tabId);
  });
  elements.drawerNavButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerNav === tabId);
  });
  elements.drawerTitle.textContent = drawerTitleFor(tabId);

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", !isSettings && panel.id === tabId);
  });
  elements.settingsPanels.forEach((panel) => {
    panel.classList.toggle("active", isSettings && panel.id === tabId);
  });
}

function openQuickPanel(tabId) {
  openSidebarDrawer(tabId, { quick: true });
  closeSettingsMenu();
}

function toggleSettingsMenu(force) {
  const open = typeof force === "boolean" ? force : !elements.settingsMenu.classList.contains("open");
  elements.settingsMenu.classList.toggle("open", open);
  elements.settingsMenu.setAttribute("aria-hidden", String(!open));
  elements.settingsMenuButton.setAttribute("aria-expanded", String(open));
}

function closeSettingsMenu() {
  toggleSettingsMenu(false);
}

window.localCopilotOpenPanel = function localCopilotOpenPanel(tabId) {
  openSidebarDrawer(tabId);
  closeSettingsMenu();
};

function closeSidebarDrawer() {
  elements.appShell.classList.remove("drawer-open");
  elements.sidebarDrawer.classList.remove("open");
  elements.sidebarDrawer.classList.remove("quick-panel");
  elements.sidebarDrawer.setAttribute("aria-hidden", "true");
  elements.drawerButtons.forEach((button) => button.classList.remove("active"));
  elements.drawerNavButtons.forEach((button) => button.classList.remove("active"));
}

function drawerTitleFor(tabId) {
  const titles = {
    tasksPanel: replyText("Tasks", "Task-uri"),
    filesPanel: replyText("Files", "Fisiere"),
    languageSettingsPanel: replyText("Language", "Limba"),
    customSettingsPanel: replyText("Appearance", "Aspect"),
    apiSettingsPanel: "API"
  };
  return titles[tabId] || "Panel";
}

function setBackgroundPreset(background) {
  const value = background || "aurora";
  elements.backgroundSelect.value = value;
  localStorage.setItem(storageKeys.backgroundPreset, value);
  applyAccentForBackground(value);
  applyAppearance();
  syncBackgroundButtons();
}

function syncBackgroundButtons() {
  const active = elements.backgroundSelect.value || "aurora";
  elements.backgroundOptionButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.backgroundOption === active);
  });
}


function setUiLanguage(language, announce = false) {
  const normalized = language === "ro-RO" ? "ro-RO" : "en-US";
  elements.languageSelect.value = normalized;
  localStorage.setItem(storageKeys.language, normalized);
  applyUiLanguage();
  syncLanguageButtons();
  if (announce) {
    addMessage("assistant", replyText("Language changed to English.", "Limba a fost schimbata in romana."));
  }
}

function syncLanguageButtons() {
  const activeLanguage = elements.languageSelect.value === "ro-RO" ? "ro-RO" : "en-US";
  elements.languageOptionButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.languageOption === activeLanguage);
  });
}

function applyAppearance() {
  const theme = elements.themeSelect.value === "light" ? "light" : "dark";
  const accent = elements.accentColorInput.value || "#0a84ff";
  const background = elements.backgroundSelect.value || "aurora";
  const customWallpaper = localStorage.getItem(storageKeys.customWallpaper);
  const presetWallpapers = {
    "wallpaper-teal": "assets/wallpapers/teal-waves.jpg",
    "wallpaper-blue": "assets/wallpapers/blue-teal.jpg",
    "wallpaper-white": "assets/wallpapers/white-minimal.jpg",
    "wallpaper-violet": "assets/wallpapers/violet-glass.jpg",
    "wallpaper-green": "assets/wallpapers/green-lab.jpg",
    "wallpaper-sunset": "assets/wallpapers/sunset-glass.jpg",
    "wallpaper-midnight": "assets/wallpapers/midnight-grid.jpg",
    "wallpaper-silver": "assets/wallpapers/silver-mist.jpg",
    "wallpaper-carbon": "assets/wallpapers/carbon-wave.jpg",
    "wallpaper-aqua": "assets/wallpapers/aqua-depth.jpg",
    "nature-forest": "assets/wallpapers/nature-forest.jpg",
    "nature-mountain": "assets/wallpapers/nature-mountain.jpg",
    "nature-ocean": "assets/wallpapers/nature-ocean.jpg",
    "space-nebula": "assets/wallpapers/space-nebula.jpg",
    "space-planets": "assets/wallpapers/space-planets.jpg",
    "space-stars": "assets/wallpapers/space-stars.jpg",
    "obsidian-aurora": "assets/wallpapers/obsidian-aurora.jpg",
    "deep-ocean": "assets/wallpapers/deep-ocean.jpg",
    "lunar-mist": "assets/wallpapers/lunar-mist.jpg",
    "mars-horizon": "assets/wallpapers/mars-horizon.jpg",
    "forest-night": "assets/wallpapers/forest-night.jpg",
    "glacier-blue": "assets/wallpapers/glacier-blue.jpg",
    "violet-nebula": "assets/wallpapers/violet-nebula.jpg",
    "solar-flare": "assets/wallpapers/solar-flare.jpg",
    "neon-circuit": "assets/wallpapers/neon-circuit.jpg",
    "polar-lights": "assets/wallpapers/polar-lights.jpg",
    "desert-glass": "assets/wallpapers/desert-glass.jpg",
    "crystal-lab": "assets/wallpapers/crystal-lab.jpg",
    "rainforest-mist": "assets/wallpapers/rainforest-mist.jpg",
    "cosmic-rose": "assets/wallpapers/cosmic-rose.jpg",
    "ice-cave": "assets/wallpapers/ice-cave.jpg",
    "black-gold": "assets/wallpapers/black-gold.jpg",
    "bio-grid": "assets/wallpapers/bio-grid.jpg",
    "ocean-sunrise": "assets/wallpapers/ocean-sunrise.jpg",
    "purple-horizon": "assets/wallpapers/purple-horizon.jpg",
    "steel-blueprint": "assets/wallpapers/steel-blueprint.jpg",
    "emerald-depth": "assets/wallpapers/emerald-depth.jpg",
    "starship-window": "assets/wallpapers/starship-window.jpg",
    "soft-sakura": "assets/wallpapers/soft-sakura.jpg",
    "alpine-dawn-painting": "assets/wallpapers/alpine-dawn-painting.jpg",
    "neon-rain-city": "assets/wallpapers/neon-rain-city.jpg",
    "bio-glass-lab": "assets/wallpapers/bio-glass-lab.jpg",
    "aurora-cabin": "assets/wallpapers/aurora-cabin.jpg",
    "coral-depths": "assets/wallpapers/coral-depths.jpg",
    "desert-temple": "assets/wallpapers/desert-temple.jpg",
    "orbital-blue-planet": "assets/wallpapers/orbital-blue-planet.jpg",
    "jade-forest-lake": "assets/wallpapers/jade-forest-lake.jpg",
    "glacier-cavern": "assets/wallpapers/glacier-cavern.jpg",
    "volcanic-coast": "assets/wallpapers/volcanic-coast.jpg",
    "moonlit-sakura": "assets/wallpapers/moonlit-sakura.jpg",
    "cyber-cathedral": "assets/wallpapers/cyber-cathedral.jpg",
    "cloud-ocean-cliffs": "assets/wallpapers/cloud-ocean-cliffs.jpg",
    "titanium-workshop": "assets/wallpapers/titanium-workshop.jpg",
    "northern-mountains": "assets/wallpapers/northern-mountains.jpg",
    "teal-chrome-flow": "assets/wallpapers/teal-chrome-flow.jpg",
    "blue-glass-ribbons": "assets/wallpapers/blue-glass-ribbons.jpg",
    "cyan-edge": "assets/wallpapers/cyan-edge.jpg",
    "opera-neon-lines": "assets/wallpapers/opera-neon-lines.jpg",
    "deep-teal-prism": "assets/wallpapers/deep-teal-prism.jpg",
    "midnight-aqua-grid": "assets/wallpapers/midnight-aqua-grid.jpg",
    "liquid-blue-metal": "assets/wallpapers/liquid-blue-metal.jpg",
    "teal-silk-lines": "assets/wallpapers/teal-silk-lines.jpg",
    "electric-navy": "assets/wallpapers/electric-navy.jpg",
    "glasswave-cyan": "assets/wallpapers/glasswave-cyan.jpg"
  };
  const wallpaperUrl = presetWallpapers[background]
    ? `url("${presetWallpapers[background]}")`
    : customWallpaper
      ? `url("${customWallpaper}")`
      : "none";

  document.documentElement.dataset.theme = theme;
  document.body.dataset.bg = background;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-strong", mixHexColors(accent, theme === "light" ? "#000000" : "#ffffff", theme === "light" ? 0.18 : 0.42));
  document.documentElement.style.setProperty("--accent-soft", `${hexToRgb(accent, 0.2)}`);
  document.documentElement.style.setProperty("--wallpaper-image", wallpaperUrl);
  syncBackgroundButtons();
}

function applyAccentForBackground(background) {
  const accentByBackground = {
    aurora: "#0a84ff",
    classic: "#0a84ff",
    graphite: "#9ca3af",
    clean: "#0a84ff",
    "wallpaper-teal": "#14b8a6",
    "wallpaper-blue": "#38bdf8",
    "wallpaper-white": "#0a84ff",
    "wallpaper-violet": "#8b5cf6",
    "wallpaper-green": "#22c55e",
    "wallpaper-sunset": "#f97316",
    "wallpaper-midnight": "#60a5fa",
    "wallpaper-silver": "#64748b",
    "wallpaper-carbon": "#14b8a6",
    "wallpaper-aqua": "#06b6d4",
    "nature-forest": "#22c55e",
    "nature-mountain": "#93c5fd",
    "nature-ocean": "#38bdf8",
    "space-nebula": "#a855f7",
    "space-planets": "#f59e0b",
    "space-stars": "#60a5fa",
    "obsidian-aurora": "#14b8a6",
    "deep-ocean": "#22d3ee",
    "lunar-mist": "#93c5fd",
    "mars-horizon": "#f97316",
    "forest-night": "#22c55e",
    "glacier-blue": "#93c5fd",
    "violet-nebula": "#c084fc",
    "solar-flare": "#facc15",
    "neon-circuit": "#0bf2d1",
    "polar-lights": "#4df9b8",
    "desert-glass": "#f6a84f",
    "crystal-lab": "#a7f3ff",
    "rainforest-mist": "#4ade80",
    "cosmic-rose": "#fb7185",
    "ice-cave": "#93c5fd",
    "black-gold": "#f5c451",
    "bio-grid": "#2dd4bf",
    "ocean-sunrise": "#38bdf8",
    "purple-horizon": "#a78bfa",
    "steel-blueprint": "#94a3b8",
    "emerald-depth": "#10b981",
    "starship-window": "#60a5fa",
    "soft-sakura": "#f9a8d4",
    "alpine-dawn-painting": "#7dd3fc",
    "neon-rain-city": "#22d3ee",
    "bio-glass-lab": "#2dd4bf",
    "aurora-cabin": "#34d399",
    "coral-depths": "#06b6d4",
    "desert-temple": "#f59e0b",
    "orbital-blue-planet": "#60a5fa",
    "jade-forest-lake": "#22c55e",
    "glacier-cavern": "#93c5fd",
    "volcanic-coast": "#fb7185",
    "moonlit-sakura": "#f9a8d4",
    "cyber-cathedral": "#38bdf8",
    "cloud-ocean-cliffs": "#67e8f9",
    "titanium-workshop": "#94a3b8",
    "northern-mountains": "#5eead4",
    "teal-chrome-flow": "#18e6d2",
    "blue-glass-ribbons": "#38bdf8",
    "cyan-edge": "#22d3ee",
    "opera-neon-lines": "#06b6d4",
    "deep-teal-prism": "#14b8a6",
    "midnight-aqua-grid": "#38bdf8",
    "liquid-blue-metal": "#3b82f6",
    "teal-silk-lines": "#2dd4bf",
    "electric-navy": "#0ea5e9",
    "glasswave-cyan": "#06b6d4"
  };
  const accent = accentByBackground[background];
  if (!accent || background === "custom-wallpaper") return;
  elements.accentColorInput.value = accent;
  localStorage.setItem(storageKeys.accentColor, accent);
}

function handleWallpaperUpload() {
  const file = elements.wallpaperInput.files && elements.wallpaperInput.files[0];
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => {
      const maxWidth = 1920;
      const maxHeight = 1080;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        localStorage.setItem(storageKeys.customWallpaper, dataUrl);
        elements.backgroundSelect.value = "custom-wallpaper";
        localStorage.setItem(storageKeys.backgroundPreset, "custom-wallpaper");
        applyAppearance();
      } catch {
        addMessage("safety", replyText(
          "That image is too large to save as a wallpaper. Try a smaller JPG or PNG.",
          "Imaginea este prea mare pentru a fi salvata ca wallpaper. Incearca un JPG sau PNG mai mic."
        ));
      }
    });
    image.src = reader.result;
  });
  reader.readAsDataURL(file);
}

function hexToRgb(hex, alpha = 1) {
  const normalized = String(hex).replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHexColors(baseHex, mixHex, amount) {
  const base = parseHexColor(baseHex);
  const mix = parseHexColor(mixHex);
  const channel = (key) => Math.round(base[key] * (1 - amount) + mix[key] * amount);
  return `#${[channel("r"), channel("g"), channel("b")].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function parseHexColor(hex) {
  const normalized = String(hex).replace("#", "").trim();
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);
  return {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255
  };
}

function setSidebarCollapsed(collapsed) {
  elements.appShell.classList.toggle("sidebar-collapsed", collapsed);
  elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  elements.sidebarToggle.setAttribute("aria-label", collapsed ? "Show sidebar" : "Hide sidebar");
  localStorage.setItem(storageKeys.sidebarCollapsed, String(collapsed));
}

function applySidebarWidth(width) {
  const parsed = Number.parseInt(width, 10);
  const clamped = Math.min(520, Math.max(220, Number.isFinite(parsed) ? parsed : 320));
  document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
  localStorage.setItem(storageKeys.sidebarWidth, String(clamped));
}

function bindSidebarResize() {
  if (!elements.sidebarResizeHandle) return;

  let startX = 0;
  let startWidth = 320;

  const stopResize = () => {
    document.body.classList.remove("resizing-sidebar");
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stopResize);
  };

  const resize = (event) => {
    const nextWidth = startWidth + event.clientX - startX;
    applySidebarWidth(nextWidth);
  };

  elements.sidebarResizeHandle.addEventListener("pointerdown", (event) => {
    if (elements.appShell.classList.contains("sidebar-collapsed")) return;
    startX = event.clientX;
    startWidth = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"), 10) || 320;
    document.body.classList.add("resizing-sidebar");
    elements.sidebarResizeHandle.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  });
}


const uiText = {
  "en-US": {
    navWorkspace: "Workspace",
    navTasks: "Tasks",
    navSync: "Sync",
    navWebsite: "Website",
    heroEyebrow: "Local text workspace",
    heroLede: "Speak your ideas and get help thinking through problems, drafting notes, and planning tasks.",
    openWorkspace: "Open Workspace",
    shareProject: "Share Project",
    assistantLabel: "Assistant",
    previewTitle: "Assistant ready",
    previewText: "Files and tasks stay in one local workspace.",
    statusMode: "Mode",
    statusVoice: "Voice",
    statusSaved: "Saved",
    settingsWorkspace: "Workspace",
    settingsVoice: "Voice",
    settingsAi: "AI",
    settingsCustom: "Custom",
    languageLabel: "Language",
    voiceLabel: "Voice",
    speedLabel: "Speed",
    warmthLabel: "Warmth",
    featureSpeak: "Speak",
    featureSpeakText: "Talk through ideas and hear replies.",
    featureUpload: "Upload",
    featureUploadText: "Add PDFs, images, and project files.",
    featurePlan: "Plan",
    featurePlanText: "Create tasks and test checklists.",
    featureSync: "Sync",
    featureSyncText: "Export updates for collaborators.",
    conversationTitle: "Conversation",
    clearButton: "Clear",
    sendButton: "Send",
    tabTasks: "Tasks",
    tabChecks: "Checks",
    tabFiles: "Media",
    tabSync: "Sync",
    tabFiles: "Media",
    tabSync: "Sync",
    tasksTitle: "Tasks",
    clearDoneButton: "Clear Done",
    addButton: "Add",
    checklistTitle: "Checklist",
    resetButton: "Reset",
    filesTitle: "Media",
    chooseFiles: "Click here to choose media files",
    autoTranslate: "Auto-translate PDF answers to Romanian",
    translatorUrl: "Translator URL",
    onlineFallback: "Use online fallback if local translator is offline",
    testTranslator: "Test Translator",
    notTested: "Not tested",
    shareTitle: "Share & Sync",
    exportButton: "Export",
    syncText: "Export a sync file, send it to another person, then they can import it here.",
    importSync: "Import Local Copilot sync file",
  localAiLabel: "Local AI",
  localAiToggle: "Use local model for general questions",
  modelLabel: "Text model",
  advancedModelLabel: "Vision model",
  endpointLabel: "Endpoint",
    testLocalAi: "Test Local AI",
    localAiNotTested: "Not tested",
    conversationsTitle: "Conversations",
    newChatTitle: "New chat",
    dockSettings: "Settings",
    themeLabel: "Theme",
    accentLabel: "Accent color",
    backgroundLabel: "Background",
    customWallpaperLabel: "Upload wallpaper",
    clearWallpaper: "Clear wallpaper",
    chatPlaceholder: "Message Local Copilot",
    taskPlaceholder: "Add a task"
  },
  "ro-RO": {
    navWorkspace: "Spatiu de lucru",
    navTasks: "Task-uri",
    navSync: "Sincronizare",
    navWebsite: "Website",
    heroEyebrow: "Spatiu vocal local",
    heroLede: "Vorbeste-ti ideile si primeste ajutor sa gandesti probleme, sa scrii notite si sa planifici task-uri.",
    openWorkspace: "Deschide spatiul",
    shareProject: "Partajeaza proiectul",
    assistantLabel: "Asistent",
    previewTitle: "Asistent pregatit",
    previewText: "Fisierele si task-urile stau intr-un singur spatiu local.",
    statusMode: "Mod",
    statusVoice: "Voce",
    statusSaved: "Salvat",
    startListening: "Porneste ascultarea",
    voiceAnswerToggle: "Raspuns vocal on/off",
    settingsWorkspace: "Spatiu",
    settingsVoice: "Voce",
    settingsAi: "AI",
    settingsCustom: "Custom",
    languageLabel: "Limba",
    voiceLabel: "Voce",
    speedLabel: "Viteza",
    warmthLabel: "Caldura",
    featureSpeak: "Vorbeste",
    featureSpeakText: "Discuta ideile si asculta raspunsuri.",
    featureUpload: "Incarca",
    featureUploadText: "Adauga PDF-uri, imagini si fisiere de proiect.",
    featurePlan: "Planifica",
    featurePlanText: "Creeaza task-uri si checklist-uri de test.",
    featureSync: "Sync",
    featureSyncText: "Exporta actualizari pentru colaboratori.",
    conversationTitle: "Conversatie",
    clearButton: "Sterge",
    sendButton: "Trimite",
    tabTasks: "Task-uri",
    tabChecks: "Verificari",
    tabFiles: "Media",
    tabSync: "Sync",
    tasksTitle: "Task-uri",
    clearDoneButton: "Sterge facute",
    addButton: "Adauga",
    checklistTitle: "Checklist",
    resetButton: "Reset",
    filesTitle: "Media",
    chooseFiles: "Apasa aici pentru media",
    autoTranslate: "Tradu automat raspunsurile din PDF in romana",
    translatorUrl: "URL traducator",
    onlineFallback: "Foloseste fallback online daca translatorul local este oprit",
    testTranslator: "Testeaza traducatorul",
    notTested: "Netestat",
    shareTitle: "Partajare & Sync",
    exportButton: "Exporta",
    syncText: "Exporta un fisier de sincronizare, trimite-l altei persoane, apoi il poate importa aici.",
    importSync: "Importa fisier Local Copilot",
  localAiLabel: "AI local",
  localAiToggle: "Foloseste model local pentru intrebari generale",
  modelLabel: "Model text",
  advancedModelLabel: "Model vision",
  endpointLabel: "Endpoint",
    testLocalAi: "Testeaza AI local",
    localAiNotTested: "Netestat",
    conversationsTitle: "Conversatii",
    newChatTitle: "Chat nou",
    dockSettings: "Setari",
    themeLabel: "Tema",
    accentLabel: "Culoare UI",
    backgroundLabel: "Fundal",
    customWallpaperLabel: "Incarca wallpaper",
    clearWallpaper: "Sterge wallpaper",
    chatPlaceholder: "Scrie catre Local Copilot",
    taskPlaceholder: "Adauga un task"
  }
};

const uiBindings = {
  "nav a[href='#workspace']": "navWorkspace",
  "nav a[href='#tasks']": "navTasks",
  "nav a[href='#sync']": "navSync",
  ".app-nav > a": "navWebsite",
  ".hero-copy .eyebrow": "heroEyebrow",
  ".lede": "heroLede",
  ".hero-actions .primary-link": "openWorkspace",
  ".hero-actions .hero-button:not(.primary-link)": "shareProject",
  ".preview-card small": "assistantLabel",
  ".preview-card strong": "previewTitle",
  ".preview-card p": "previewText",
  ".status-grid div:nth-child(1) .status-label": "statusMode",
  ".status-grid div:nth-child(2) .status-label": "statusVoice",
  ".status-grid div:nth-child(3) .status-label": "statusSaved",
  ".settings-tabs button:nth-child(1)": "settingsWorkspace",
  ".settings-tabs button:nth-child(3)": "settingsAi",
  ".settings-tabs button:nth-child(4)": "settingsCustom",
  "#languageSelect": null,
  ".feature-strip article:nth-child(1) strong": "featureSpeak",
  ".feature-strip article:nth-child(1) p": "featureSpeakText",
  ".feature-strip article:nth-child(2) strong": "featureUpload",
  ".feature-strip article:nth-child(2) p": "featureUploadText",
  ".feature-strip article:nth-child(3) strong": "featurePlan",
  ".feature-strip article:nth-child(3) p": "featurePlanText",
  ".feature-strip article:nth-child(4) strong": "featureSync",
  ".feature-strip article:nth-child(4) p": "featureSyncText",
  "#conversation-title": "conversationTitle",
  "#clearChatButton": "clearButton",
  ".side-tabs button[data-tab='tasksPanel']": "tabTasks",
  ".side-tabs button[data-tab='filesPanel']": "tabFiles",
  "#tasksPanel h2": "tasksTitle",
  "#clearDoneTasksButton": "clearDoneButton",
  ".task-form button": "addButton",
  "#resetChecklistButton": "resetButton",
  "#filesPanel h2": "filesTitle",
  "#clearFilesButton": "clearButton",
  ".file-drop span": "chooseFiles",
  "#translatePdfToggle + span": "autoTranslate",
  ".translation-tool label:not(.toggle) span": "translatorUrl",
  "#onlineTranslateToggle + span": "onlineFallback",
  "#testTranslatorButton": "testTranslator",
  "#translatorStatus": "notTested",
  "#exportDataButton": "exportButton",
  ".sync-tool p": "syncText",
  ".sync-tool .file-drop span": "importSync",
  ".archive-heading h2": "conversationsTitle",
  "#settingsMenuButton strong": "dockSettings",
  "#quickTasksButton": "tabTasks",
  ".settings-menu button[data-drawer-tab='filesPanel']": "tabFiles",
  ".settings-menu button[data-drawer-tab='languageSettingsPanel']": "languageLabel",
  ".settings-menu button[data-drawer-tab='customSettingsPanel']": "settingsCustom",
  ".drawer-nav button[data-drawer-nav='filesPanel'] strong": "tabFiles",
  ".drawer-nav button[data-drawer-nav='languageSettingsPanel'] strong": "languageLabel",
  ".drawer-nav button[data-drawer-nav='customSettingsPanel'] strong": "settingsCustom",
  "#customSettingsPanel label:nth-child(1) > span": "themeLabel",
  "#customSettingsPanel label:nth-child(2) > span": "accentLabel",
  "#customSettingsPanel label:nth-child(3) > span": "backgroundLabel",
  "#customSettingsPanel label:nth-child(4) > span": "customWallpaperLabel",
  "#clearWallpaperButton": "clearWallpaper"
};

function applyUiLanguage() {
  const language = elements.languageSelect.value === "ro-RO" ? "ro-RO" : "en-US";
  const dict = uiText[language];
  document.documentElement.lang = language === "ro-RO" ? "ro" : "en";

  for (const [selector, key] of Object.entries(uiBindings)) {
    if (!key) continue;
    const node = document.querySelector(selector);
    if (!node || !dict[key]) continue;
    if (node.matches(".topbar-action-button")) {
      node.title = dict[key];
      node.setAttribute("aria-label", dict[key]);
    } else {
      node.textContent = dict[key];
    }
  }

  elements.textInput.placeholder = dict.chatPlaceholder;
  elements.taskInput.placeholder = dict.taskPlaceholder;
  elements.languageSelect.querySelector("option[value='en-US']").textContent = "English";
  elements.languageSelect.querySelector("option[value='ro-RO']").textContent = "Romana";
  syncLanguageButtons();
  renderConversationArchive();
  updateEmptyChatState();
}

function updateEmptyChatState(forceEmpty = null) {
  const isEmpty = forceEmpty === null
    ? elements.conversation.children.length === 0
    : Boolean(forceEmpty);
  elements.textInput.placeholder = isEmpty
    ? replyText("Ask anything", "Intreaba orice")
    : uiText[elements.languageSelect.value === "ro-RO" ? "ro-RO" : "en-US"].chatPlaceholder;
  elements.emptyChatHero.querySelector("h1").textContent = replyText(
    "What do you want to start with?",
    "Cu ce vrei sa incepem?"
  );
  elements.emptyChatHero.classList.toggle("visible", isEmpty);
  elements.conversation.classList.toggle("is-empty", isEmpty);
  elements.textForm.classList.toggle("centered-composer", isEmpty);
}

async function handleUserMessage(text) {
  updateEmptyChatState(false);
  addMessage("user", text);
  state.pendingAttachment = null;

  const fastReply = createFastReply(text);
  if (fastReply) {
    state.replyAbortController = new AbortController();
    state.generating = true;
    setComposerGenerating(true);
    try {
      const typedReply = await typeAssistantReply(fastReply, state.replyAbortController.signal);
      state.latestReply = typedReply || fastReply;
    } finally {
      state.streamingMessage = null;
      state.streamingText = "";
      state.replyAbortController = null;
      state.generating = false;
      setComposerGenerating(false);
    }
    return;
  }

  state.replyAbortController = new AbortController();
  state.generating = true;
  setComposerGenerating(true);
  const thinkingNode = showThinkingIndicator();
  state.thinkingNode = thinkingNode;
  let streamMessage = null;
  let streamContent = null;
  let streamedText = "";
  let firstTokenSeen = false;
  const onToken = (token) => {
    if (!token) return;
    firstTokenSeen = true;
    if (!streamMessage) {
      const stream = convertThinkingToStreamingMessage(thinkingNode, "assistant");
      streamMessage = stream.message;
      streamContent = stream.content;
      state.thinkingNode = null;
      state.streamingMessage = streamMessage;
    }
    streamedText += token;
    state.streamingText = streamedText;
    updateStreamingMessage(streamMessage, streamContent, streamedText);
  };

  try {
    const smartStartTimeout = new Promise((resolve) => {
      window.setTimeout(() => {
        if (!firstTokenSeen) resolve({ type: "smart-timeout" });
      }, 65000);
    });
    const replyResult = await Promise.race([
      createReply(text, state.replyAbortController.signal, onToken).then((reply) => ({ type: "reply", reply })),
      smartStartTimeout
    ]);

    if (replyResult.type === "smart-timeout" && !firstTokenSeen) {
      state.replyAbortController.abort();
      state.replyAbortController = new AbortController();
      const fallbackSignal = state.replyAbortController.signal;
      const fallbackReply = await askLocalAiWithModel(text, "qwen3:8b", fallbackSignal, "", null);
      const fallbackText = fallbackReply
        ? ensureCompleteLocalAiReply(fallbackReply, text)
        : getLocalAiTimeoutReply(text);
      const stream = convertThinkingToStreamingMessage(thinkingNode, "assistant");
      streamMessage = stream.message;
      streamContent = stream.content;
      state.thinkingNode = null;
      state.streamingMessage = streamMessage;
      streamedText = await typeStreamingReply(streamMessage, streamContent, fallbackText, fallbackSignal);
      if (fallbackSignal.aborted) {
        if (streamedText.trim()) finalizeStreamingMessage(streamMessage, streamedText);
        return;
      }
      finalizeStreamingMessage(streamMessage, fallbackText);
      state.latestReply = fallbackText;
      return;
    }

    const reply = replyResult.reply;
    if (state.replyAbortController.signal.aborted) {
      if (streamMessage && streamedText.trim()) finalizeStreamingMessage(streamMessage, streamedText);
      else {
        removeThinkingIndicator(thinkingNode);
        addMessage("safety", getLocalAiTimeoutReply(text));
      }
      return;
    }
    const role = "assistant";
  if (streamMessage) {
      const finalText = reply || streamedText;
      const attachment = state.pendingAttachment || createAutoVisualAttachment(text, finalText);
      finalizeStreamingMessage(streamMessage, finalText, attachment);
    } else {
      const stream = convertThinkingToStreamingMessage(thinkingNode, role);
      streamMessage = stream.message;
      streamContent = stream.content;
      state.thinkingNode = null;
      state.streamingMessage = streamMessage;
      const attachment = state.pendingAttachment || createAutoVisualAttachment(text, reply);
      streamedText = await typeStreamingReply(streamMessage, streamContent, reply, state.replyAbortController.signal);
      if (state.replyAbortController.signal.aborted) {
        if (streamedText.trim()) finalizeStreamingMessage(streamMessage, streamedText);
        return;
      }
      finalizeStreamingMessage(streamMessage, reply, attachment);
    }
    state.pendingAttachment = null;
    state.latestReply = reply;

  } catch (error) {
    if (error && error.name === "AbortError") {
      if (streamMessage && streamedText.trim()) finalizeStreamingMessage(streamMessage, streamedText);
      else {
        removeThinkingIndicator(thinkingNode);
        addMessage("safety", getLocalAiTimeoutReply(text));
      }
      return;
    }
    console.error("[Local Copilot] reply error", error);
    removeThinkingIndicator(thinkingNode);
    addMessage("safety", replyText("Something went wrong while thinking. Please try again.", "A aparut o problema in timp ce ma gandeam. Incearca din nou."));
  } finally {
    if (state.thinkingNode === thinkingNode) state.thinkingNode = null;
    state.streamingMessage = null;
    state.streamingText = "";
    state.replyAbortController = null;
    state.generating = false;
    setComposerGenerating(false);
  }
}

function getLocalAiTimeoutReply(input) {
  const fastReply = createFastReply(input);
  if (fastReply) return fastReply;
  return replyText(
    "The local AI took too long, so I stopped the request. Try a shorter question or check that Ollama is running.",
    "AI-ul local a durat prea mult, asa ca am oprit cererea. Incearca o intrebare mai scurta sau verifica daca Ollama ruleaza."
  );
}

function stopCurrentReply() {
  if (state.replyAbortController) state.replyAbortController.abort();
  if (state.streamingMessage && state.streamingText.trim()) {
    finalizeStreamingMessage(state.streamingMessage, state.streamingText);
  } else {
    removeThinkingIndicator(state.thinkingNode);
  }
  state.thinkingNode = null;
  state.streamingMessage = null;
  state.streamingText = "";
  state.replyAbortController = null;
  state.generating = false;
  state.pendingAttachment = null;
  setComposerGenerating(false);
}

function setComposerGenerating(generating) {
  elements.textForm.classList.toggle("is-generating", generating);
  elements.sendButton.setAttribute("aria-label", generating ? replyText("Stop", "Opreste") : replyText("Send", "Trimite"));
}

function createFastReply(input) {
  const text = normalizeSearchText(input);
  const compact = text.replace(/[?!.,;:]+/g, "").trim();
  const words = compact.split(/\s+/).filter(Boolean);

  if (isKnowledgeIntent(text)) return null;

  if (words.length <= 4 && hasAnyWord(words, ["buna", "salut", "hello", "hi", "hey", "hei"])) {
    return replyText(
      "Hi. I am here. Ask me anything, or add a PDF/image from the plus button.",
      "Buna. Sunt aici. Intreaba-ma orice sau adauga un PDF/o imagine din butonul plus."
    );
  }

  if (words.length <= 4 && hasAny(text, ["ce faci", "cum esti", "how are you", "what are you doing"])) {
    return replyText(
      "I am here and ready to help. Tell me what you want to build, understand, or organize.",
      "Sunt aici si gata sa te ajut. Spune-mi ce vrei sa construiesti, sa intelegi sau sa organizezi."
    );
  }

  if (words.length <= 5 && (hasAnyWord(words, ["multumesc", "mersi", "thanks"]) || compact === "thank you")) {
    return replyText("You are welcome.", "Cu placere.");
  }

  if (words.length <= 4 && hasAnyWord(words, ["ok", "okay", "bine", "perfect", "super"])) {
    return replyText("Good. Tell me the next step when you are ready.", "Bun. Spune-mi urmatorul pas cand esti gata.");
  }

  const schoolReply = quickSchoolReply(text);
  if (schoolReply) return schoolReply;

  return null;
}

function hasAnyWord(words, terms) {
  return terms.some((term) => words.includes(term));
}

function quickSchoolReply(text) {
  if (hasAny(text, ["teorema lui pitagora", "pitagora", "pythagorean theorem", "pythagoras theorem"])) {
    return replyText(
      `**Pythagorean theorem** says that in a right triangle, the square of the hypotenuse is equal to the sum of the squares of the other two sides.

Formula:
- **a² + b² = c²**

Where:
- **a** and **b** are the legs of the right triangle
- **c** is the hypotenuse, the side opposite the 90° angle

Example:
If a = 3 and b = 4, then:
- 3² + 4² = 9 + 16 = 25
- c = √25 = **5**`,
      `**Teorema lui Pitagora** spune ca intr-un triunghi dreptunghic, patratul ipotenuzei este egal cu suma patratelor catetelor.

Formula:
- **a² + b² = c²**

Unde:
- **a** si **b** sunt catetele
- **c** este ipotenuza, adica latura opusa unghiului de 90°

Exemplu:
Daca a = 3 si b = 4, atunci:
- 3² + 4² = 9 + 16 = 25
- c = √25 = **5**`
    );
  }

  if (hasAny(text, ["teorema lui thales", "thales theorem"])) {
    return replyText(
      `**Thales' theorem** says that if A and B are the ends of a circle diameter and C is any point on the circle, then angle ACB is **90°**.

In short:
- Diameter as one side
- Third point on the circle
- Opposite angle is a right angle`,
      `**Teorema lui Thales** spune ca daca A si B sunt capetele diametrului unui cerc, iar C este un punct de pe cerc, atunci unghiul ACB este **90°**.

Pe scurt:
- Diametrul este o latura
- Al treilea punct este pe cerc
- Unghiul opus diametrului este drept`
    );
  }

  return null;
}

async function createReply(input, signal = null, onToken = null) {
  const text = normalizeSearchText(input);
  if (isKnowledgeIntent(text)) {
    const knowledgeAnswer = await answerFromKnowledge(input, false);
    if (knowledgeAnswer) return knowledgeAnswer;
  }

  if (hasAny(text, ["file", "pdf", "document", "what do you know", "fisier", "fisier", "documente", "ce stii", "ce stii"])) {
    return await answerFromKnowledge(input);
  }

  if (isImageQuestion(text) && state.knowledgeFiles.some((file) => file.imageData || String(file.type || "").startsWith("image/"))) {
    const visionAnswer = await answerImageQuestion(input, signal);
    if (visionAnswer) return visionAnswer;
  }

  if (hasAny(text, ["task", "todo", "to do", "sarcina", "sarcina", "treaba", "de facut", "de facut"])) {
    return taskReply(input);
  }

  if (true) {
    const wantsWebContext = shouldUseWebContext(input);
    const fetchedWebContext = wantsWebContext ? await fetchWebContext(input, signal) : "";
    const webContext = wantsWebContext
      ? fetchedWebContext || "Internet lookup was attempted, but no current web results were available. Do not invent current facts; say that current data could not be verified."
      : "";
    const localAiReply = await askLocalAi(input, signal, webContext, onToken);
    if (localAiReply) {
      if (isWeakLocalAiReply(localAiReply, input) && !signal?.aborted) {
        const fallbackReply = await askLocalAi(input, signal, "", null);
        if (fallbackReply && !isWeakLocalAiReply(fallbackReply, input)) {
          return ensureCompleteLocalAiReply(fallbackReply, input);
        }
      }
      return ensureCompleteLocalAiReply(localAiReply, input);
    }
  }

  const knowledgeAnswer = await answerFromKnowledge(input, true);
  if (knowledgeAnswer) return knowledgeAnswer;

  return replyText(
    "I can help with local planning, notes, and tasks. Try asking me to draft something, add a task, or ask about a file you added in Media.",
    "Te pot ajuta cu planificare locala, notite si task-uri. Poti cere sa redactez ceva, sa adaug un task sau sa intreb despre un fisier adaugat in Media."
  );
}

function shouldUseWebContext(input) {
  const text = normalizeSearchText(input);
  // URL-uri → mereu cauta
  if (/https?:\/\//i.test(input)) return true;
  // PDF / imagini → raspunde din fisiere locale
  if (isKnowledgeIntent(text) || isImageQuestion(text)) return false;
  // Mesaje foarte scurte (salut, ok, multumesc) → fara web
  if (text.split(/\s+/).filter(Boolean).length <= 2) return false;
  // Orice altceva → cauta pe net
  return true;
}

function ensureCompleteLocalAiReply(reply, input) {
  const trimmed = String(reply || "").trim();
  if (/[,:;]\s*$/.test(trimmed) || /\b(cu|si|iar|dar|la|de|with|and|or|but|to|of)\s*$/i.test(trimmed)) {
    return `${trimmed.replace(/[,:;]\s*$/, ".")}\n\n${replyText("The local model may have stopped mid-sentence. Ask me to continue if you want the rest.", "Modelul local pare ca s-a oprit la mijlocul frazei. Spune-mi sa continui daca vrei restul.")}`;
  }
  return trimmed;
}

function isWeakLocalAiReply(reply, input) {
  const text = cleanLocalAiReply(reply).replace(/\s+/g, " ").trim();
  const inputText = normalizeSearchText(input);
  if (!text) return true;
  if (text.length < 80 && inputText.length > 8) return true;
  if (/[*_`#]*\s*teorema lui thales[,:]?\s*$/i.test(text)) return true;
  if (/[,:;]\s*$/.test(text)) return true;
  return false;
}

function isKnowledgeIntent(text) {
  return hasAny(text, [
    "lect", "lecture", "lectia", "lectie", "capitol", "chapter", "slide", "pdf",
    "din lect", "din pdf", "idei esentiale", "ideile esentiale", "rezumat", "summary",
    "essential", "main ideas", "scoti ideile", "scoate ideile"
  ]);
}

function isImageQuestion(text) {
  return hasAny(text, [
    "ce e in poza", "ce este in poza", "ce vezi", "recunoaste poza", "analizeaza poza",
    "imaginea asta", "poza asta", "image recognition", "recognize image", "what is in this image",
    "what do you see"
  ]);
}

async function answerImageQuestion(input, signal = null) {
  const imageFile = selectImageForQuestion(input);
  if (!imageFile || !imageFile.imageData) {
    return replyText(
      "I found image files, but they do not have a saved preview I can send to the vision model. Upload the image again in Media, then ask me about it.",
      "Am gasit fisiere imagine, dar nu au preview salvat pe care sa il pot trimite catre modelul vision. Incarca imaginea din nou in Media, apoi intreaba-ma despre ea."
    );
  }

  try {
    const visionText = await askVisionAi(input, imageFile.imageData, signal);
    if (!visionText) {
      return replyText(
        "Moondream is installed, but it did not return a usable image description. Try a clearer image or restart Ollama.",
        "Moondream este instalat, dar nu a returnat o descriere utila a imaginii. Incearca o imagine mai clara sau reporneste Ollama."
      );
    }

    return replyText(
      `From ${imageFile.name}:\n\n${visionText}`,
      `Din ${imageFile.name}:\n\n${visionText}`
    );
  } catch {
    return replyText(
      "I could not reach the local vision model. Make sure Ollama is running and that moondream is installed.",
      "Nu am putut contacta modelul local vision. Verifica daca Ollama ruleaza si daca moondream este instalat."
    );
  }
}

function selectImageForQuestion(input) {
  const images = state.knowledgeFiles.filter((file) => file.imageData || String(file.type || "").startsWith("image/"));
  if (!images.length) return null;
  const query = normalizeSearchText(input);
  const matched = images.find((file) => query.includes(normalizeSearchText(file.name).slice(0, 24)));
  return matched || images[0];
}

async function askVisionAi(userInput, imageDataUrl, externalSignal = null) {
  const endpoint = LOCAL_AI_ENDPOINT;
  if (!endpoint) return "";
  const imageBase64 = dataUrlToBase64(imageDataUrl);
  if (!imageBase64) return "";

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 70000);
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "moondream",
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 360
        },
        messages: [
          {
            role: "system",
            content: `Describe the image accurately. Reply in ${elements.languageSelect.value === "ro-RO" ? "Romanian" : "English"}. If the user asks for parts, labels, risks, or design ideas, answer directly from visible evidence and say when something is uncertain.`
          },
          {
            role: "user",
            content: userInput || "Describe this image.",
            images: [imageBase64]
          }
        ]
      })
    });
    if (!response.ok) return "";
    const data = await response.json();
    return cleanLocalAiReply(data.message?.content || data.response || "").trim();
  } finally {
    window.clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
}

function dataUrlToBase64(dataUrl) {
  const text = String(dataUrl || "");
  const comma = text.indexOf(",");
  return comma >= 0 ? text.slice(comma + 1) : "";
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

async function handleFiles(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const added = [];
  const failed = [];

  for (const file of files) {
    try {
      const result = await readKnowledgeFile(file);
      const text = typeof result === "string" ? result : result.text;
      const trimmed = cleanExtractedText(text);
      const pages = typeof result === "string" ? [] : compactPdfPages(result.pages || []);
      const knowledgeFile = {
        name: file.name,
        type: file.type || "unknown",
        size: file.size,
        text: trimmed.slice(0, MAX_FILE_TEXT_CHARS),
        pages,
        imageData: result && typeof result === "object" ? result.imageData || "" : "",
        imageWidth: result && typeof result === "object" ? result.imageWidth || 0 : 0,
        imageHeight: result && typeof result === "object" ? result.imageHeight || 0 : 0
      };

      if (typeof result !== "string" && result.buffer) {
        state.pdfBuffers.set(file.name, result.buffer);
      }

      state.knowledgeFiles.push(knowledgeFile);
      trimKnowledgeStorage();
      added.push(file.name);
    } catch {
      failed.push(file.name);
    }
  }

  persistKnowledgeFilesSafely();

  renderFileList();
  elements.fileInput.value = "";

  if (added.length) {
    addMessage("assistant", replyText(
      `Added ${added.length} file${added.length === 1 ? "" : "s"} to local knowledge.`,
      `Am adaugat ${added.length} fisier${added.length === 1 ? "" : "e"} in cunostintele locale.`
    ));
  }

  if (failed.length) {
    addMessage("safety", replyText(
      `I could not load: ${failed.join(", ")}. Try one PDF at a time or clear old files first.`,
      `Nu am putut incarca: ${failed.join(", ")}. Incearca un PDF pe rand sau sterge fisierele vechi mai intai.`
    ));
  }
}

async function readKnowledgeFile(file) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const buffer = await file.arrayBuffer();
    const pdfJsResult = await extractPdfWithPdfJs(buffer);
    if (pdfJsResult) return pdfJsResult;
    return {
      text: extractTextFromPdfBuffer(buffer),
      pages: [],
      buffer
    };
  }
  if (file.type.startsWith("image/")) {
    const imageInfo = await readImageFileInfo(file);
    return {
      text: replyText(
        `Image file: ${file.name}. Saved locally as media. Dimensions: ${imageInfo.width} x ${imageInfo.height}. The current 8B text model can store and show images, but true visual recognition needs a vision model.`,
        `Imagine: ${file.name}. Salvata local in Media. Dimensiuni: ${imageInfo.width} x ${imageInfo.height}. Modelul text 8B poate salva si afisa imagini, dar recunoasterea vizuala reala necesita un model vision.`
      ),
      pages: [],
      imageData: imageInfo.dataUrl,
      imageWidth: imageInfo.width,
      imageHeight: imageInfo.height
    };
  }
  return file.text();
}

async function readImageFileInfo(file) {
  const dataUrl = await fileToDataUrl(file);
  const dimensions = await readImageDimensions(dataUrl);
  return {
    dataUrl,
    width: dimensions.width,
    height: dimensions.height
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve({ width: image.naturalWidth || 0, height: image.naturalHeight || 0 }));
    image.addEventListener("error", () => resolve({ width: 0, height: 0 }));
    image.src = src;
  });
}

async function extractPdfWithPdfJs(buffer) {
  const pdfApi = window.pdfjsLib || globalThis.pdfjsLib;
  if (!pdfApi || !pdfApi.getDocument) return null;

  try {
    if (pdfApi.GlobalWorkerOptions && !pdfApi.GlobalWorkerOptions.workerSrc) {
      pdfApi.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const pdf = await pdfApi.getDocument({ data: buffer.slice(0) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = cleanExtractedText(content.items.map((item) => item.str || "").join(" "));
      if (pageText) {
        pages.push({ pageNumber, text: pageText.slice(0, MAX_PAGE_TEXT_CHARS) });
      }
    }

    return {
      text: makePdfSummaryText(pages),
      pages,
      buffer
    };
  } catch {
    return null;
  }
}

function compactPdfPages(pages) {
  if (!Array.isArray(pages)) return [];

  return pages
    .filter((page) => page && page.text)
    .slice(0, MAX_STORED_PAGES_PER_PDF)
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: cleanExtractedText(page.text).slice(0, MAX_PAGE_TEXT_CHARS)
    }));
}

function makePdfSummaryText(pages) {
  return compactPdfPages(pages)
    .map((page) => `Page ${page.pageNumber}: ${page.text}`)
    .join(" ")
    .slice(0, MAX_FILE_TEXT_CHARS);
}

function extractTextFromPdfBuffer(buffer) {
  const data = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8000;
  for (let index = 0; index < data.length; index += chunkSize) {
    binary += String.fromCharCode(...data.slice(index, index + chunkSize));
  }

  const matches = [];
  const literalText = /\(([^()]{3,})\)/g;
  let match = literalText.exec(binary);
  while (match) {
    matches.push(match[1].replace(/\\[nrtbf()\\]/g, " "));
    match = literalText.exec(binary);
  }

  const text = matches.join(" ").replace(/\s+/g, " ").trim();
  if (text.length > 80) return cleanExtractedText(text);
  return "PDF added, but readable text was not found. If this is a scanned PDF or compressed PDF, convert it to text first or add a text/markdown version.";
}

function cleanExtractedText(text) {
  return collapseSpacedLetters(String(text || ""))
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00C0-\u024F\u1E00-\u1EFF]/g, " ")
    .replace(/\b[a-zA-Z0-9+/]{45,}={0,2}\b/g, " ")
    .replace(/\bD:\d{14}[+\-]\d{2}'?\d{2}'?\b/g, " ")
    .replace(/\b(?:Microsoft|PowerPoint|MicrosoftPowerPointforMicrosoft|for Microsoft|Creator|Producer|ModDate|CreationDate)\b/gi, " ")
    .replace(/[\w.-]+\.(?:png|svg|jpg|jpeg)\b/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b(?:PNG|SVG|JPG|JPEG|free|gratuit|icon|pictogram|Noun Project|readerTheGreatAdventure|shocked)\b/gi, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\b3\s+6\s+5\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseSpacedLetters(text) {
  return text.replace(/\b(?:[A-Za-z]\s+){3,}[A-Za-z]\b/g, (match) => match.replace(/\s+/g, ""));
}

async function answerFromKnowledge(input, onlyIfRelevant = false) {
  if (!state.knowledgeFiles.length) {
    return onlyIfRelevant ? "" : replyText(
      "No knowledge files are loaded yet. Add PDF, images, text, CSV, JSON, or HTML files in Media, then ask me about them.",
      "Nu exista fisiere incarcate inca. Adauga PDF, imagini, text, CSV, JSON sau HTML in Media, apoi intreaba-ma despre ele."
    );
  }

  const query = buildKnowledgeQuery(input);
  const filesToSearch = getKnowledgeSearchScope(query);
  const hits = filesToSearch
    .map((file) => scoreKnowledgeFile(file, query))
    .filter((hit) => hit.score > 0 || !onlyIfRelevant)
    .sort((a, b) => b.score - a.score);

  const best = hits[0];
  if (!best || (onlyIfRelevant && best.score < 4)) return "";
  if (best.score < 4) {
    return replyText(
      "I could not confidently find that lecture or section. Try including the exact file name plus the lecture or chapter number, for example: Lecture 5 Introduction to the topic.",
      "Nu am gasit cu incredere lectia sau sectiunea ceruta. Incearca sa incluzi numele exact al fisierului plus numarul lectiei sau capitolului, de exemplu: Lectia 5 Introducere in subiect."
    );
  }

  const excerpt = makeSmartExcerpt(best.textSource || best.file.text, best.index, query.words);
  if (best.pageNumber || shouldAttachPdfPreview(query)) {
    await safeAttachRelevantPdfPage(best);
  }

  if (isPdfOverviewRequest(best.file, query)) {
    return buildPdfOverview(best, excerpt, query);
  }

  const translatedExcerpt = await translateExcerptIfNeeded(excerpt);
  return formatKnowledgeAnswer(best, translatedExcerpt);
}

function getKnowledgeSearchScope(query) {
  if (!query.lectureNumber) return state.knowledgeFiles;

  const n = query.lectureNumber;
  const lectureFilePattern = new RegExp("\\b(?:lect|lecture|lectia|lectie)\\s*0*" + n + "\\b");
  const exactLectureFiles = state.knowledgeFiles.filter((file) => lectureFilePattern.test(normalizeSearchText(file.name)));
  if (exactLectureFiles.length) return exactLectureFiles;

  return state.knowledgeFiles;
}

function shouldAttachPdfPreview(query) {
  return hasAny(query.raw, [
    "slide", "page", "pagina", "pagina", "poza", "poza", "imagine", "image",
    "arata", "arata", "show", "picture", "diagram"
  ]);
}

function cleanFileNameForDisplay(fileName) {
  return String(fileName || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatKnowledgeSource(hit) {
  const fileName = hit && hit.file ? hit.file.name : String(hit || "");
  const pageNumber = hit && hit.pageNumber ? Number(hit.pageNumber) : 0;
  const displayName = cleanFileNameForDisplay(fileName);
  return pageNumber
    ? `**${displayName} · slide ${pageNumber}**`
    : `**${displayName}**`;
}

function makeShortSourceQuote(text) {
  const cleaned = cleanAnswerExcerpt(text)
    .replace(/(?:Slide|Page)\s+\d+\s*:?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 18) return "";
  const sentence = cleaned.split(/(?<=[.!?])\s+/).find((part) => part.length >= 18) || cleaned;
  return sentence
    .split(/\s+/)
    .slice(0, 18)
    .join(" ")
    .replace(/^["'“”]+|["'“”.,;:]+$/g, "");
}

function formatSourceQuote(text) {
  const quote = makeShortSourceQuote(text);
  if (!quote) return "";
  return `\n> "${quote}"`;
}

function isPdfOverviewRequest(file, query) {
  const raw = query.raw || "";
  const fileName = normalizeSearchText(file.name);
  const asksExplain = hasAny(raw, [
    "explica", "explic", "explain", "overview", "rezumat", "summary", "despre",
    "idei esentiale", "ideile esentiale", "main ideas", "essential ideas", "scoti ideile", "scoate ideile"
  ]);
  const mentionsFile = query.words.filter((word) => fileName.includes(word)).length >= 3;
  const onlyFileLike = query.words.length > 0 && query.words.every((word) => fileName.includes(word) || ["explica", "explain"].includes(word));
  return asksExplain || mentionsFile || onlyFileLike;
}

function buildPdfOverview(hit, excerpt, query) {
  const file = hit.file;
  const sourceLine = formatKnowledgeSource(hit);
  const pages = Array.isArray(file.pages) ? file.pages : [];
  const sourceText = pages.length
    ? pages.slice(0, 12).map((page) => `Slide/Page ${page.pageNumber}: ${page.text}`).join(" ")
    : `${file.text || ""} ${excerpt || ""}`;
  const titles = extractSlideTitles(sourceText).slice(0, 10);
  const usefulExcerpt = cleanAnswerExcerpt(excerpt || sourceText).slice(0, 900);
  const subject = inferPdfSubject(file.name, sourceText, query);
  const quoteLine = formatSourceQuote(excerpt || sourceText);

  const topicBlock = titles.length
    ? titles.map((title) => `- ${title}`).join("\n")
    : splitIntoReadableBullets(usefulExcerpt).slice(0, 6).map((line) => `- ${line}`).join("\n");

  return replyText(
    `${sourceLine}${quoteLine}

This PDF appears to be about ${subject}.

Main things I found:
${topicBlock || "- I found the PDF, but the readable text is limited."}

Ask me a specific slide/topic from this PDF and I can explain that section more directly.`,
    `${sourceLine}

PDF-ul pare sa fie despre ${subject}.

Lucruri principale gasite:
${topicBlock || "- Am gasit PDF-ul, dar textul citibil este limitat."}

Intreaba-ma un slide sau un subiect specific din acest PDF si iti explic sectiunea mai direct.`
  );
}

function inferPdfSubject(fileName, sourceText, query) {
  const displayName = cleanFileNameForDisplay(fileName);
  return displayName
    ? replyText(displayName, displayName)
    : replyText("the uploaded document", "documentul incarcat");
}

function splitIntoReadableBullets(text) {
  return cleanAnswerExcerpt(text)
    .split(/(?:Slide\s+\d+\s*:|Page\s+\d+\s*:|[.;]\s+)/i)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12 && line.length <= 140)
    .filter((line, index, all) => all.findIndex((other) => normalizeSearchText(other) === normalizeSearchText(line)) === index);
}

function formatKnowledgeAnswer(hit, excerpt) {
  const cleaned = cleanAnswerExcerpt(excerpt);
  const slideTitles = extractSlideTitles(cleaned).slice(0, 8);
  const sourceLine = formatKnowledgeSource(hit);
  const quoteLine = formatSourceQuote(cleaned);
  const body = cleaned.replace(/Slide\s+\d+\s*:?\s*/gi, "").trim();

  if (slideTitles.length) {
    const topicsLabel = replyText("Topics in this section:", "Subiecte in aceasta sectiune:");
    return `${sourceLine}${quoteLine}\n\n${body || replyText("Relevant section found.", "Sectiune relevanta gasita.")}\n\n${topicsLabel}\n${slideTitles.map((title) => `- ${title}`).join("\n")}`;
  }

  return `${sourceLine}${quoteLine}\n\n${body || cleaned}`;
}

async function attachRelevantPdfPage(hit) {
  if (!hit || !hit.pageNumber) return;
  const buffer = state.pdfBuffers.get(hit.file.name);
  if (!buffer) return;

  const url = await renderPdfPageToImage(buffer, hit.pageNumber);
  if (!url) return;

  const displayName = cleanFileNameForDisplay(hit.file.name);
  state.pendingAttachment = {
    url,
    caption: replyText(`${displayName} — slide ${hit.pageNumber}`, `${displayName} — slide ${hit.pageNumber}`),
    fileName: hit.file.name,
    pageNumber: hit.pageNumber,
    maxPage: Array.isArray(hit.file.pages) && hit.file.pages.length
      ? Math.max(...hit.file.pages.map((page) => Number(page.pageNumber) || 1))
      : hit.pageNumber
  };
}

async function safeAttachRelevantPdfPage(hit) {
  try {
    await attachRelevantPdfPage(hit);
  } catch (error) {
    console.warn("Could not attach PDF slide preview", error);
    state.pendingAttachment = null;
  }
}

async function renderPdfPageToImage(buffer, pageNumber) {
  const pdfApi = window.pdfjsLib || globalThis.pdfjsLib;
  if (!pdfApi || !pdfApi.getDocument) return "";

  try {
    if (pdfApi.GlobalWorkerOptions && !pdfApi.GlobalWorkerOptions.workerSrc) {
      pdfApi.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const pdf = await pdfApi.getDocument({ data: buffer.slice(0) }).promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return "";
  }
}

function extractSlideTitles(text) {
  const titles = [];
  const pattern = /Slide\s+\d+\s*:?\s*([^:]{4,90}?)(?=Slide\s+\d+|$)/gi;
  let match = pattern.exec(text);
  while (match) {
    const title = formatSlideTitle(match[1]);
    if (title && !titles.includes(title)) titles.push(title);
    match = pattern.exec(text);
  }
  return titles;
}

function formatSlideTitle(title) {
  const cleaned = cleanAnswerExcerpt(title)
    .replace(/\\/g, "")
    .replace(/\b(?:Cont|Continuare)\.?\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[.;:\-\s]+|[.;:\-\s]+$/g, "")
    .trim();

  if (!cleaned || cleaned.length < 3) return "";
  return cleaned;
}

function buildKnowledgeQuery(input) {
  const normalized = normalizeSearchText(input);
  const lectureMatch = normalized.match(/\b(?:lect|lecture|lectia|lectie|capitol|chapter|chap|ch)\s*\.?\s*(\d{1,3})\b/);
  const slideMatch = normalized.match(/\b(?:slide|pagina|page)\s*\.?\s*(\d{1,3})\b/);
  const words = normalized
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && ![
      "what", "from", "about", "document", "files", "pdf", "the", "and",
      "din", "despre", "fisier", "fisiere", "documente", "lect", "lecture", "lectia",
      "lectie", "capitol", "chapter", "chap", "explica", "explain", "summary", "rezumat",
      "scoate", "scoti", "ideile", "idei", "esentiale", "main", "important"
    ].includes(word));

  return {
    raw: normalized,
    words,
    lectureNumber: lectureMatch ? lectureMatch[1] : "",
    slideNumber: slideMatch ? slideMatch[1] : ""
  };
}

function scoreKnowledgeFile(file, query) {
  const fileName = normalizeSearchText(file.name);
  if (Array.isArray(file.pages) && file.pages.length) {
    return scoreKnowledgePages(file, query, fileName);
  }

  const text = normalizeSearchText(file.text);
  const candidates = findCandidateIndexes(text, query);
  let best = { file, score: 0, index: 0, textSource: file.text, pageNumber: null };

  for (const index of candidates) {
    const start = Math.max(0, index - 900);
    const end = Math.min(text.length, index + 2400);
    const windowText = text.slice(start, end);
    let score = 0;

    if (query.lectureNumber) {
      const n = query.lectureNumber;
      if (new RegExp("\\b(?:lect|lecture|lectia|lectie|chapter|capitol|ch)\\s*\\.?\\s*" + n + "\\b").test(windowText)) score += 80;
      if (new RegExp("\\b(?:lect|lecture|chapter|capitol)\\s*\\.?\\s*" + n + "\\b").test(fileName)) score += 120;
    }

    for (const word of query.words) {
      if (fileName.includes(word)) score += 16;
      if (windowText.includes(word)) score += 5;
    }

    const titleScore = phraseScore(windowText, query.words);
    score += titleScore;

    if (score > best.score) {
      best = { file, score, index, textSource: file.text, pageNumber: null };
    }
  }

  return best;
}

function scoreKnowledgePages(file, query, fileName) {
  let best = { file, score: 0, index: 0, textSource: file.text, pageNumber: null };

  for (const page of file.pages) {
    const text = normalizeSearchText(page.text);
    const candidates = findCandidateIndexes(text, query);

    for (const index of candidates) {
      const start = Math.max(0, index - 400);
      const end = Math.min(text.length, index + 1600);
      const windowText = text.slice(start, end);
      let score = 0;

      if (query.lectureNumber) {
        const n = query.lectureNumber;
        if (new RegExp("\\b(?:lect|lecture|lectia|lectie|chapter|capitol|ch)\\s*\\.?\\s*" + n + "\\b").test(fileName)) score += 90;
        if (new RegExp("\\b(?:lect|lecture|lectia|lectie|chapter|capitol|ch)\\s*\\.?\\s*" + n + "\\b").test(windowText)) score += 50;
      }

      if (query.slideNumber && Number(page.pageNumber) === Number(query.slideNumber)) {
        score += 180;
      }

      for (const word of query.words) {
        if (fileName.includes(word)) score += 10;
        if (windowText.includes(word)) score += 12;
      }

      score += phraseScore(windowText, query.words) * 2;

      if (score > best.score) {
        best = {
          file,
          score,
          index,
          textSource: page.text,
          pageNumber: page.pageNumber
        };
      }
    }
  }

  return best;
}

function findCandidateIndexes(text, query) {
  const indexes = new Set([0]);

  if (query.lectureNumber) {
    const n = query.lectureNumber;
    const patterns = [
      new RegExp("\\b(?:lect|lecture|lectia|lectie|chapter|capitol|ch)\\s*\\.?\\s*" + n + "\\b", "g")
    ];
    for (const pattern of patterns) {
      let match = pattern.exec(text);
      while (match) {
        indexes.add(match.index);
        match = pattern.exec(text);
      }
    }
  }

  for (const word of query.words) {
    const index = text.indexOf(word);
    if (index >= 0) indexes.add(index);
  }

  return Array.from(indexes);
}

function phraseScore(text, words) {
  const useful = words.filter((word) => word.length > 3);
  if (useful.length < 2) return 0;
  let score = 0;
  for (let index = 0; index < useful.length - 1; index += 1) {
    const phrase = useful[index] + " " + useful[index + 1];
    if (text.includes(phrase)) score += 14;
  }
  return score;
}

function makeSmartExcerpt(text, index, words) {
  let safeIndex = Math.max(0, index);
  const normalized = normalizeSearchText(text);
  const usefulIndex = findFirstUsefulContentIndex(normalized);
  const titleIndex = findBestTitleIndex(normalized, words);
  if (titleIndex >= 0 && Math.abs(titleIndex - safeIndex) < 1800) safeIndex = titleIndex;
  if (usefulIndex >= 0 && safeIndex < usefulIndex) safeIndex = usefulIndex;
  const start = Math.max(0, safeIndex - 220);
  const end = Math.min(text.length, safeIndex + 900);
  let excerpt = cleanAnswerExcerpt(text.slice(start, end));
  excerpt = removeLeadingNoise(excerpt);
  if (safeIndex === 0) {
    const firstWord = words.find((word) => normalized.includes(word));
    if (firstWord) return makeSmartExcerpt(text, normalized.indexOf(firstWord), words);
  }
  return excerpt;
}

function findFirstUsefulContentIndex(text) {
  const markers = ["slide 1", "slide 2", "slide 3"];
  const indexes = markers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

function findBestTitleIndex(text, words) {
  const important = words.filter((word) => word.length > 4);
  let bestIndex = -1;
  let bestScore = 0;
  const patterns = ["slide 1"];
  for (const pattern of patterns) {
    const index = text.indexOf(pattern);
    if (index >= 0) {
      const windowText = text.slice(index, index + 420);
      const score = important.reduce((total, word) => total + (windowText.includes(word) ? 1 : 0), 0) + 3;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
  }
  return bestIndex;
}

function cleanAnswerExcerpt(text) {
  return cleanExtractedText(text)
    .replace(/\bQK\b.*?(?=Slide\s+\d+|$)/i, "")
    .replace(/^.*?(?=Slide\s+\d+)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function removeLeadingNoise(text) {
  const match = /Slide\s+\d+/i.exec(text);
  if (!match) return text;
  return text.slice(match.index).trim();
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeExcerpt(text, queryWord) {
  if (!queryWord) return text.slice(0, 420);
  const index = normalizeSearchText(text).indexOf(normalizeSearchText(queryWord));
  const start = Math.max(0, index - 160);
  const end = Math.min(text.length, index + 360);
  return text.slice(start, end).trim();
}

async function translateExcerptIfNeeded(text) {
  if (!elements.translatePdfToggle.checked || elements.languageSelect.value !== "ro-RO") return text;

  const limitedText = text.slice(0, 1800);
  const browserTranslation = await translateWithBrowser(limitedText);
  if (browserTranslation) return browserTranslation;

  const endpointTranslation = await translateWithEndpoint(limitedText);
  if (endpointTranslation) return endpointTranslation;

  const onlineTranslation = await translateWithOnlineFallback(limitedText);
  if (onlineTranslation) return onlineTranslation;

  return `${limitedText}\n\nTraducerea automata nu este disponibila inca. Pentru traducere completa, porneste LibreTranslate local si seteaza URL-ul: http://127.0.0.1:5000/translate`;
}

async function translateWithBrowser(text) {
  try {
    const translatorApi = window.Translator || self.Translator;
    if (!translatorApi || !translatorApi.create) return "";
    const translator = await translatorApi.create({
      sourceLanguage: "en",
      targetLanguage: "ro"
    });
    return await translator.translate(text);
  } catch {
    return "";
  }
}

async function translateWithEndpoint(text) {
  const endpoint = elements.translateEndpointInput.value.trim();
  if (!endpoint) return "";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: text,
        source: "en",
        target: "ro",
        format: "text"
      })
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data.translatedText || data.translation || "";
  } catch {
    return "";
  }
}

async function translateWithOnlineFallback(text) {
  if (!elements.onlineTranslateToggle.checked) return "";

  try {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "en");
    url.searchParams.set("tl", "ro");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", text);
    const response = await fetch(url.toString());
    if (!response.ok) return "";
    const data = await response.json();
    return Array.isArray(data[0])
      ? data[0].map((part) => part[0]).join("")
      : "";
  } catch {
    return "";
  }
}

async function testTranslatorEndpoint() {
  const endpoint = elements.translateEndpointInput.value.trim() || "http://127.0.0.1:5000/translate";
  elements.translateEndpointInput.value = endpoint;
  localStorage.setItem(storageKeys.translateEndpoint, endpoint);
  elements.translatorStatus.textContent = "Testing...";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: "hello world",
        source: "en",
        target: "ro",
        format: "text"
      })
    });
    if (!response.ok) throw new Error("Translator returned an error.");
    const data = await response.json();
    const translated = data.translatedText || data.translation || "";
    elements.translatorStatus.textContent = translated ? `OK: ${translated}` : "Connected, but no translation returned.";
  } catch {
    elements.translatorStatus.textContent = "Offline. Start LibreTranslate first.";
  }
}


async function askLocalAi(userInput, externalSignal = null, webContext = "", onToken = null) {
  const mode = localStorage.getItem(storageKeys.aiMode) || "normal";
  if (mode === "smart") {
    const groqKey = (localStorage.getItem(storageKeys.groqApiKey) || "").trim();
    if (groqKey || GROQ_PROXY_ENDPOINT) {
      const groqReply = await askGroqAi(userInput, externalSignal, webContext, onToken);
      if (groqReply) return groqReply;
    }
  }

  const endpoint = LOCAL_AI_ENDPOINT;
  const requestedModel = getActiveLocalAiModel();
  if (!endpoint || !requestedModel) return "";
  return askLocalAiWithModel(userInput, requestedModel, externalSignal, webContext, onToken);
}

async function askLocalAiWithModel(userInput, model, externalSignal = null, webContext = "", onToken = null) {
  const endpoint = LOCAL_AI_ENDPOINT;
  if (!endpoint || !model) return "";

  for (const modelName of [model]) {
    const controller = new AbortController();
    const shortProbe = isShortLocalAiProbe(userInput);
    const timeout = window.setTimeout(() => controller.abort(), shortProbe ? 14000 : webContext ? 75000 : 50000);
    const abortFromExternal = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: modelName,
          stream: Boolean(onToken),
          think: false,
          options: {
            num_ctx: webContext ? 3072 : 2048,
            num_predict: shortProbe ? 120 : Math.max(120, Number(localStorage.getItem(storageKeys.aiMaxTokens)) || 1200),
            temperature: Number(localStorage.getItem(storageKeys.aiTemperature)) || 0.35,
            top_p: 0.85,
            repeat_penalty: 1.08
          },
          messages: [
            {
              role: "system",
              content: buildLocalAiSystemPrompt(webContext)
            },
            {
              role: "user",
              content: userInput
            }
          ]
        })
      });
      if (!response.ok) continue;
      if (onToken && response.body) {
        const streamed = await readOllamaStream(response, onToken);
        const cleanedStream = cleanLocalAiReply(streamed);
        if (cleanedStream.trim()) return cleanedStream.trim();
        continue;
      }
      const data = await response.json();
      const content = cleanLocalAiReply(data.message && data.message.content ? data.message.content : "").trim();
      if (content) {
        return content;
      }
    } catch (error) {
      if (controller.signal.aborted || (externalSignal && externalSignal.aborted)) throw error;
      continue;
    } finally {
      window.clearTimeout(timeout);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
    }
  }

  return "";
}

function getActiveLocalAiModel() {
  return LOCAL_AI_MODEL;
}

function buildGroqSystemPrompt(webContext = "") {
  const language = elements.languageSelect.value === "ro-RO" ? "Romanian" : "English";
  const currentDate = new Date().toLocaleDateString("en-CA");
  const customInstructions = (localStorage.getItem(storageKeys.systemPrompt) || "").trim();
  const customBlock = customInstructions ? ` ${customInstructions}` : "";
  const webBlock = webContext
    ? `\n\nWeb context (use for current facts, cite the source when possible):\n${webContext.slice(0, 2400)}`
    : "";
  return `You are Local Copilot, a general-purpose intelligent assistant. Today is ${currentDate}. Reply in ${language}. Be direct and thorough. Use **bold** for key terms and bullets for lists.${customBlock}\n\nRULES:\n- Use web context below when it contains relevant current facts.\n- If web context is empty, answer from training knowledge and note when info may be outdated.\n- Never refuse a general knowledge question.${webBlock}`;
}

function getRecentConversationMessages() {
  const nodes = Array.from(elements.conversation.children)
    .filter((node) => !node.classList.contains("thinking"));
  // Exclude the last node (current user message just added to DOM before this call)
  return nodes.slice(-7, -1).map((node) => {
    const role = node.classList.contains("user") ? "user" : "assistant";
    const text = (node.dataset.messageText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 600);
    return text ? { role, content: text } : null;
  }).filter(Boolean);
}

function buildLocalAiSystemPrompt(webContext = "") {
  const language = elements.languageSelect.value === "ro-RO" ? "Romanian" : "English";
  const recentConversation = getRecentConversationText();
  const currentDate = new Date().toLocaleDateString("en-CA");
  const customInstructions = (localStorage.getItem(storageKeys.systemPrompt) || "").trim();
  const customBlock = customInstructions ? ` ${customInstructions}` : "";
  const webBlock = webContext
    ? `\n\nWeb context (use for current facts):\n${webContext.slice(0, 2000)}`
    : "";
  return `/no_think\nYou are Local Copilot, a local assistant. Today is ${currentDate}. Reply in ${language}. Be direct and concise. Use **bold** for key terms and bullets for lists.${customBlock}\n\nRULES:\n- If web context below contains relevant info, use it directly and cite it.\n- If web context is empty, answer from training knowledge. Never say "I haven't heard of X" — always give your best answer and note if it may be outdated.\n- Never refuse to answer a general knowledge question.\n\nRecent:\n${recentConversation || "—"}${webBlock}`;
}

function getRecentConversationText() {
  return Array.from(elements.conversation.children)
    .filter((node) => !node.classList.contains("thinking"))
    .slice(-4)
    .map((node) => {
      const role = node.classList.contains("user") ? "U" : "A";
      const text = (node.dataset.messageText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 700);
}

function cleanLocalAiReply(reply) {
  return String(reply || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
    .replace(/^\s*<\/think>\s*/i, "")
    .trim();
}

async function readOllamaStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const data = JSON.parse(line);
        const token = data.message?.content || data.response || "";
        if (token) {
          fullText += token;
          onToken(token);
        }
      } catch {
        // Ignore partial or non-JSON stream fragments.
      }
    }
  }

  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer);
      const token = data.message?.content || data.response || "";
      if (token) {
        fullText += token;
        onToken(token);
      }
    } catch {
      // Ignore final malformed fragment.
    }
  }

  return fullText;
}

function buildSearchQuery(input) {
  const text = normalizeSearchText(input);
  const currentYear = new Date().getFullYear();
  const translated = text
    .replace(/\bcine e\b|\bcine este\b|\bcine a fost\b/g, "who is")
    .replace(/\bce e\b|\bce este\b|\bce sunt\b/g, "what is")
    .replace(/\bcum fac\b|\bcum se face\b|\bcum functioneaza\b/g, "how to")
    .replace(/\bpresedintele?\b/g, "president")
    .replace(/\bamericii\b|\bstatelor unite\b|\bsua\b/g, "united states")
    .replace(/\bromania\b|\bromaniei\b/g, "romania")
    .replace(/\bpret\b|\bcosta\b|\bcat costa\b/g, "price")
    .replace(/\bazi\b|\bastazi\b|\bacum\b/g, `${currentYear}`)
    .replace(/\brazboi\b/g, "war")
    .replace(/\bguvernul?\b/g, "government")
    .replace(/\bpremier(ul)?\b|\bprim.?ministr(ul)?\b/g, "prime minister");
  return translated !== text ? `${translated} ${currentYear}` : `${input} ${currentYear}`;
}

async function fetchWebContext(query, externalSignal = null) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  try {
    const results = [];
    const searchQuery = buildSearchQuery(query);

    const urlContext = await fetchLinkedPageContext(query, controller.signal);
    if (urlContext) results.push(urlContext);

    const newsContext = await fetchNewsContext(searchQuery, controller.signal);
    if (newsContext) results.push(newsContext);

    const searchContext = await fetchSearchPageContext(searchQuery, controller.signal);
    if (searchContext) results.push(searchContext);

    const ddgUrl = new URL("https://api.duckduckgo.com/");
    ddgUrl.searchParams.set("q", searchQuery);
    ddgUrl.searchParams.set("format", "json");
    ddgUrl.searchParams.set("no_html", "1");
    ddgUrl.searchParams.set("skip_disambig", "1");
    const ddgResponse = await fetch(ddgUrl.toString(), { signal: controller.signal });
    if (ddgResponse.ok) {
      const data = await ddgResponse.json();
      if (data.AbstractText) results.push(`DuckDuckGo: ${data.AbstractText}`);
      const related = flattenDuckDuckGoTopics(data.RelatedTopics).slice(0, 4);
      related.forEach((item) => {
        if (item.Text) results.push(`DuckDuckGo result: ${item.Text}`);
      });
    }

    const wikiSummary = await fetchWikipediaSummary(searchQuery, controller.signal);
    if (wikiSummary) results.push(wikiSummary);

    return results.slice(0, 8).join("\n");
  } catch {
    return "";
  } finally {
    window.clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
}


async function fetchWikipediaSummary(searchQuery, signal) {
  try {
    const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("srsearch", searchQuery);
    searchUrl.searchParams.set("srlimit", "2");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    const searchResp = await fetch(searchUrl.toString(), { signal });
    if (!searchResp.ok) return "";
    const searchData = await searchResp.json();
    const results = [];
    for (const item of (searchData.query?.search || []).slice(0, 2)) {
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(item.title)}`;
      const summaryResp = await fetch(summaryUrl, { signal });
      if (!summaryResp.ok) continue;
      const summaryData = await summaryResp.json();
      if (summaryData.extract) {
        results.push(`Wikipedia (${item.title}): ${summaryData.extract.slice(0, 600)}`);
      }
    }
    return results.join("\n");
  } catch {
    return "";
  }
}

async function fetchSearchPageContext(query, signal) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.bing.com/search?q=${encodeURIComponent(query)}`)}`
  ];
  for (const proxyUrl of proxies) {
    const text = await fetchReadablePageText(proxyUrl, signal);
    if (text && text.length > 200) return `Web search results for "${query}":\n${text.slice(0, 2000)}`;
  }
  return "";
}

function extractUrls(text) {
  return Array.from(String(text || "").matchAll(/\bhttps?:\/\/[^\s<>"')]+/gi))
    .map((match) => match[0].replace(/[.,;:!?]+$/, ""))
    .slice(0, 3);
}

async function fetchLinkedPageContext(query, signal) {
  const urls = extractUrls(query);
  if (!urls.length) return "";

  const chunks = [];
  for (const url of urls) {
    const direct = await fetchReadablePageText(url, signal);
    if (direct) {
      chunks.push(`Linked page ${url}:\n${direct}`);
      continue;
    }

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const proxied = await fetchReadablePageText(proxyUrl, signal);
    if (proxied) chunks.push(`Linked page ${url}:\n${proxied}`);
  }

  return chunks.join("\n\n").slice(0, 2600);
}

async function fetchReadablePageText(url, signal) {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!/text|html|json|xml/i.test(contentType)) return "";
    const raw = await response.text();
    return htmlToReadableText(raw).slice(0, 1800);
  } catch {
    return "";
  }
}

function htmlToReadableText(raw) {
  const withoutScripts = String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const parsed = new DOMParser().parseFromString(withoutScripts, "text/html");
  const text = parsed.body ? parsed.body.textContent || "" : withoutScripts.replace(/<[^>]+>/g, " ");
  return cleanExtractedText(text).replace(/\s+/g, " ").trim();
}

function flattenDuckDuckGoTopics(topics = []) {
  return topics.flatMap((item) => Array.isArray(item.Topics) ? flattenDuckDuckGoTopics(item.Topics) : [item]);
}

async function fetchNewsContext(query, signal) {
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", "5");
  url.searchParams.set("sort", "hybridrel");
  url.searchParams.set("timespan", "30d");
  const response = await fetch(url.toString(), { signal });
  if (!response.ok) return "";
  const data = await response.json();
  const articles = Array.isArray(data.articles) ? data.articles.slice(0, 5) : [];
  if (!articles.length) return "";
  return [
    "Recent news search results from GDELT, last 30 days:",
    ...articles.map((item) => {
      const title = String(item.title || "Untitled").replace(/\s+/g, " ").trim();
      const source = String(item.sourceCountry || item.domain || "unknown source").trim();
      const date = String(item.seendate || "").slice(0, 8);
      return `- ${title}${source ? ` (${source})` : ""}${date ? `, seen ${date}` : ""}.`;
    })
  ].join("\n");
}

function isShortLocalAiProbe(input) {
  const text = normalizeSearchText(input);
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= 12 || text.includes("one word") || text.includes("short sentence") || text.includes("ready");
}

function restoreKnowledgeFiles() {
  try {
    state.knowledgeFiles = JSON.parse(localStorage.getItem(storageKeys.files) || "[]");
  } catch {
    state.knowledgeFiles = [];
    localStorage.removeItem(storageKeys.files);
  }
  renderFileList();
}

function persistKnowledgeFiles() {
  try {
    localStorage.setItem(storageKeys.files, JSON.stringify(state.knowledgeFiles));
  } catch {
    trimKnowledgeStorage(true);
    localStorage.setItem(storageKeys.files, JSON.stringify(state.knowledgeFiles));
    addMessage("safety", replyText(
      "Browser storage was full, so I kept shorter excerpts from the uploaded files.",
      "Spatiul de salvare din browser era plin, asa ca am pastrat fragmente mai scurte din fisierele incarcate."
    ));
  }
}

function persistKnowledgeFilesSafely() {
  try {
    localStorage.setItem(storageKeys.files, JSON.stringify(state.knowledgeFiles));
  } catch {
    trimKnowledgeStorage(true);
    try {
      localStorage.setItem(storageKeys.files, JSON.stringify(state.knowledgeFiles));
      addMessage("safety", replyText(
        "Browser storage was full, so I kept shorter excerpts from the uploaded files.",
        "Spatiul de salvare din browser era plin, asa ca am pastrat fragmente mai scurte din fisierele incarcate."
      ));
    } catch {
      state.knowledgeFiles = state.knowledgeFiles.map((file) => ({
        ...file,
        imageData: "",
        text: String(file.text || "").slice(0, 25000),
        pages: Array.isArray(file.pages)
          ? file.pages.slice(0, 30).map((page) => ({
            pageNumber: page.pageNumber,
            text: String(page.text || "").slice(0, 1200)
          }))
          : []
      }));
      localStorage.setItem(storageKeys.files, JSON.stringify(state.knowledgeFiles));
      addMessage("safety", replyText(
        "Browser storage was very full, so I kept a compact PDF index only.",
        "Spatiul din browser era foarte plin, asa ca am pastrat doar un index compact al PDF-urilor."
      ));
    }
  }
}

function trimKnowledgeStorage(forceSmall = false) {
  const fileLimit = forceSmall ? 30000 : MAX_FILE_TEXT_CHARS;
  const pageLimit = forceSmall ? 1200 : MAX_PAGE_TEXT_CHARS;
  const storageLimit = forceSmall ? 1200000 : MAX_KNOWLEDGE_STORAGE_CHARS;

  state.knowledgeFiles = state.knowledgeFiles.map((file) => ({
    ...file,
    imageData: forceSmall ? "" : file.imageData,
    text: String(file.text || "").slice(0, fileLimit),
    pages: Array.isArray(file.pages)
      ? file.pages.slice(0, forceSmall ? 40 : MAX_STORED_PAGES_PER_PDF).map((page) => ({
        pageNumber: page.pageNumber,
        text: String(page.text || "").slice(0, pageLimit)
      }))
      : []
  }));

  while (JSON.stringify(state.knowledgeFiles).length > storageLimit) {
    const largest = state.knowledgeFiles
      .map((file, index) => ({
        index,
        length: String(file.text || "").length + JSON.stringify(file.pages || []).length
      }))
      .sort((a, b) => b.length - a.length)[0];

    if (!largest || largest.length <= 20000) break;
    const file = state.knowledgeFiles[largest.index];
    if (Array.isArray(file.pages) && file.pages.length > 10) {
      file.pages = file.pages.slice(0, Math.max(10, Math.floor(file.pages.length * 0.75)));
    } else {
      file.text = String(file.text || "").slice(0, Math.max(10000, Math.floor(String(file.text || "").length * 0.75)));
    }
  }
}

function renderFileList() {
  if (!state.knowledgeFiles.length) {
    elements.fileList.textContent = replyText("No files added yet.", "Nu ai adaugat fisiere inca.");
    return;
  }
  elements.fileList.innerHTML = state.knowledgeFiles
    .map((file, index) => `
      <div class="file-row ${file.imageData ? "image-file-row" : ""}">
        ${file.imageData ? `<img src="${escapeAttribute(file.imageData)}" alt="${escapeHtml(file.name)}">` : ""}
        <span>${escapeHtml(file.name)}</span>
        <span>${Math.max(1, Math.round(file.size / 1024))} KB${file.imageWidth ? `, ${file.imageWidth}x${file.imageHeight}` : ""}</span>
        <button class="file-remove-button" type="button" data-file-index="${index}" aria-label="${escapeAttribute(replyText(`Remove ${file.name}`, `Sterge ${file.name}`))}">x</button>
      </div>
    `)
    .join("");
}

function handleFileListClick(event) {
  const removeButton = event.target.closest("[data-file-index]");
  if (!removeButton) return;
  const index = Number(removeButton.dataset.fileIndex);
  removeKnowledgeFile(index);
}

function removeKnowledgeFile(index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.knowledgeFiles.length) return;
  const [removedFile] = state.knowledgeFiles.splice(index, 1);
  if (removedFile && removedFile.name) {
    state.pdfBuffers.delete(removedFile.name);
  }
  if (state.knowledgeFiles.length) {
    persistKnowledgeFilesSafely();
  } else {
    localStorage.removeItem(storageKeys.files);
  }
  renderFileList();
}

function addTask(title) {
  if (!title) return;
  state.tasks.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    title,
    done: false,
    createdAt: new Date().toISOString()
  });
  persistTasks();
  renderTasks();
}

function restoreTasks() {
  try {
    state.tasks = JSON.parse(localStorage.getItem(storageKeys.tasks) || "[]");
  } catch {
    state.tasks = [];
    localStorage.removeItem(storageKeys.tasks);
  }
  renderTasks();
}

function persistTasks() {
  localStorage.setItem(storageKeys.tasks, JSON.stringify(state.tasks));
}

function renderTasks() {
  if (!state.tasks.length) {
    elements.taskList.textContent = "No tasks yet.";
    return;
  }

  elements.taskList.innerHTML = state.tasks
    .map((task) => `
      <div class="task-item ${task.done ? "done" : ""}" data-id="${escapeHtml(task.id)}">
        <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Mark task done">
        <span>${escapeHtml(task.title)}</span>
        <button class="task-delete-button" type="button" aria-label="${escapeHtml(replyText("Delete task", "Sterge task"))}"></button>
      </div>
    `)
    .join("");

  elements.taskList.querySelectorAll(".task-item").forEach((row) => {
    const task = state.tasks.find((item) => item.id === row.dataset.id);
    row.querySelector("input").addEventListener("change", (event) => {
      task.done = event.target.checked;
      persistTasks();
      renderTasks();
    });
    row.querySelector("button").addEventListener("click", () => {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      persistTasks();
      renderTasks();
    });
  });
}

function taskReply(input) {
  const addMatch = input.match(/(?:add|create|make)\s+(?:a\s+)?(?:task|todo|to do)\s*(?:to|:)?\s*(.+)/i);
  if (addMatch && addMatch[1]) {
    addTask(addMatch[1].trim());
    return replyText("Task added.", "Task adaugat.");
  }

  const openTasks = state.tasks.filter((task) => !task.done);
  if (!openTasks.length) {
    return replyText(
      "You have no open tasks. Say: add task to review project notes.",
      "Nu ai task-uri deschise. Spune: add task to review project notes."
    );
  }
  return replyText(
    `Open tasks: ${openTasks.slice(0, 5).map((task) => task.title).join("; ")}.`,
    `Task-uri deschise: ${openTasks.slice(0, 5).map((task) => task.title).join("; ")}.`
  );
}


function replyText(english, romanian) {
  return elements.languageSelect.value === "ro-RO" ? romanian : english;
}

function mergeTasks(currentTasks, incomingTasks) {
  const byId = new Map(currentTasks.map((task) => [task.id, task]));
  incomingTasks.forEach((task) => {
    if (!task || !task.title) return;
    byId.set(task.id || task.title, {
      id: task.id || `${Date.now()}-${task.title}`,
      title: String(task.title),
      done: Boolean(task.done),
      createdAt: task.createdAt || new Date().toISOString()
    });
  });
  return Array.from(byId.values()).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function addMessage(role, text, attachment = null) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.dataset.messageText = String(text || "");

  const content = document.createElement("div");
  content.className = "message-content";
  content.innerHTML = role === "user" ? escapeHtml(text) : formatAssistantMessage(text);
  message.appendChild(content);

  if (role === "assistant" || role === "safety") {
    const copyButton = document.createElement("button");
    copyButton.className = "message-copy-button";
    copyButton.type = "button";
    copyButton.textContent = "Copy";
    copyButton.setAttribute("aria-label", replyText("Copy message", "Copiaza mesajul"));
    copyButton.addEventListener("click", () => copyMessageText(message, copyButton));
    message.appendChild(copyButton);
  }

  appendMessageAttachment(message, attachment);
  elements.conversation.appendChild(message);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
  updateEmptyChatState(false);
  saveChat();
}

function appendMessageAttachment(message, attachment = null) {
  if (!attachment || !attachment.url) return;

  const figure = document.createElement("figure");
  figure.className = "message-attachment";
  const pageNumber = Number(attachment.pageNumber) || 1;
  const maxPage = Number(attachment.maxPage) || pageNumber;
  figure.innerHTML = `
    <img src="${attachment.url}" alt="${escapeHtml(attachment.caption || "PDF slide preview")}">
    <figcaption>
      <span>${escapeHtml(attachment.caption || "PDF slide preview")}</span>
      ${attachment.fileName ? `
        <span class="slide-actions">
          <button type="button" data-slide-file="${escapeHtml(attachment.fileName)}" data-slide-page="${Math.max(1, pageNumber - 1)}" ${pageNumber <= 1 ? "disabled" : ""} title="${escapeHtml(replyText("Previous slide", "Slide anterior"))}"><</button>
          <button type="button" data-slide-file="${escapeHtml(attachment.fileName)}" data-slide-page="${Math.min(maxPage, pageNumber + 1)}" ${pageNumber >= maxPage ? "disabled" : ""} title="${escapeHtml(replyText("Next slide", "Slide urmator"))}">></button>
        </span>
      ` : ""}
    </figcaption>
  `;
  message.appendChild(figure);
}

function addCopyButton(message) {
  const copyButton = document.createElement("button");
  copyButton.className = "message-copy-button";
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.setAttribute("aria-label", replyText("Copy message", "Copiaza mesajul"));
  copyButton.addEventListener("click", () => copyMessageText(message, copyButton));
  message.appendChild(copyButton);
  return copyButton;
}

function convertThinkingToStreamingMessage(node, role = "assistant") {
  const message = node || document.createElement("div");
  message.className = `message ${role} streaming`;
  message.dataset.messageText = "";
  message.innerHTML = "";

  const content = document.createElement("div");
  content.className = "message-content";
  message.appendChild(content);
  addCopyButton(message);

  if (!message.parentNode) elements.conversation.appendChild(message);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
  return { message, content };
}

function updateStreamingMessage(message, content, text) {
  message.dataset.messageText = String(text || "");
  content.innerHTML = formatAssistantMessage(text);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function finalizeStreamingMessage(message, text, attachment = null) {
  message.classList.remove("streaming");
  message.dataset.messageText = String(text || "");
  const content = message.querySelector(".message-content");
  if (content) content.innerHTML = formatAssistantMessage(text);

  if (attachment && attachment.url) {
    appendMessageAttachment(message, attachment);
  }

  updateEmptyChatState(false);
  saveChat();
}

function createAutoVisualAttachment(prompt, reply) {
  const text = normalizeSearchText(`${prompt} ${reply || ""}`);
  const wantsVisual = hasAny(text, [
    "desen", "deseneaza", "schita", "schema", "diagrama", "imagine", "poza",
    "draw", "sketch", "diagram", "visual"
  ]);
  if (!wantsVisual) return null;

  const title = replyText("Simple concept diagram", "Diagrama simpla de concept");
  const svg = makeConceptDiagramSvg(title);
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    caption: title
  };
}

function makeConceptDiagramSvg(title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="920" height="520" viewBox="0 0 920 520">
  <rect width="920" height="520" rx="28" fill="#101214"/>
  <text x="44" y="58" fill="#f5f5f7" font-family="Arial, sans-serif" font-size="28" font-weight="700">${escapeSvg(title)}</text>
  <circle cx="175" cy="230" r="74" fill="#1f2937" stroke="#14b8a6" stroke-width="4"/>
  <circle cx="460" cy="230" r="74" fill="#1f2937" stroke="#60a5fa" stroke-width="4"/>
  <circle cx="745" cy="230" r="74" fill="#1f2937" stroke="#a78bfa" stroke-width="4"/>
  <path d="M249 230 H386 M534 230 H671" stroke="#c7c7cc" stroke-width="5" stroke-linecap="round"/>
  <text x="125" y="238" fill="#fff" font-family="Arial, sans-serif" font-size="22" font-weight="700">Input</text>
  <text x="410" y="238" fill="#fff" font-family="Arial, sans-serif" font-size="22" font-weight="700">Control</text>
  <text x="704" y="238" fill="#fff" font-family="Arial, sans-serif" font-size="22" font-weight="700">Output</text>
  <text x="95" y="390" fill="#f5f5f7" font-family="Arial, sans-serif" font-size="20">Flux simplu: informatie -> decizie -> actiune / rezultat.</text>
</svg>`;
}

function escapeSvg(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function typeAssistantReply(text, signal = null) {
  const stream = convertThinkingToStreamingMessage(null, "assistant");
  state.streamingMessage = stream.message;
  const typedText = await typeStreamingReply(stream.message, stream.content, text, signal);

  if (signal && signal.aborted) return typedText;

  finalizeStreamingMessage(stream.message, text);
  return text;
}

async function typeStreamingReply(message, content, text, signal = null) {
  let typed = "";
  const chunks = String(text || "").match(/\S+\s*|\n+/g) || [String(text || "")];

  for (const chunk of chunks) {
    if (signal && signal.aborted) return typed;
    typed += chunk;
    state.streamingText = typed;
    updateStreamingMessage(message, content, typed);
    await waitForTypingDelay(chunk);
  }

  return typed;
}

function waitForTypingDelay(chunk) {
  const delay = chunk.includes("\n") ? 80 : Math.min(52, Math.max(18, chunk.length * 7));
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

function formatAssistantMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*\n][^*]*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\n)&gt; ([^\n]+)/g, (_, prefix, content) => `\n<blockquote>${content}</blockquote>`)
    .replace(/(^|\n)- /g, "$1- ");
}

async function copyMessageText(message, button) {
  const text = message.dataset.messageText || message.textContent || "";
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    const original = button.textContent;
    button.textContent = replyText("Copied", "Copiat");
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  } catch {
    button.textContent = replyText("Failed", "Eroare");
    window.setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  }
}

function showThinkingIndicator() {
  const message = document.createElement("div");
  message.className = "message assistant thinking";
  message.innerHTML = `
    <div class="thinking-orb" aria-live="polite" aria-label="${escapeHtml(replyText("Thinking", "Se gandeste"))}">
      <span class="thinking-logo" aria-hidden="true"></span>
      <span class="thinking-label" aria-hidden="true"></span>
    </div>
  `;
  elements.conversation.appendChild(message);
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
  updateEmptyChatState(false);

  const label = message.querySelector(".thinking-label");
  const loadingTimer = window.setTimeout(() => {
    if (message.parentNode && label) {
      label.textContent = replyText("Loading model into memory…", "Se incarca modelul in memorie…");
    }
  }, 10000);
  message._loadingTimer = loadingTimer;

  return message;
}

function removeThinkingIndicator(node) {
  if (!node) return;
  if (node._loadingTimer) window.clearTimeout(node._loadingTimer);
  if (node.parentNode) node.parentNode.removeChild(node);
}


async function handleSlideNavigation(event) {
  const button = event.target.closest("[data-slide-file][data-slide-page]");
  if (!button || button.disabled) return;

  const fileName = button.dataset.slideFile;
  const pageNumber = Number(button.dataset.slidePage);
  const buffer = state.pdfBuffers.get(fileName);
  const file = state.knowledgeFiles.find((item) => item.name === fileName);
  if (!buffer || !file || !pageNumber) return;

  button.disabled = true;
  const url = await renderPdfPageToImage(buffer, pageNumber);
  if (!url) return;

  const figure = button.closest(".message-attachment");
  const image = figure.querySelector("img");
  const caption = figure.querySelector("figcaption span");
  const maxPage = Array.isArray(file.pages) && file.pages.length
    ? Math.max(...file.pages.map((page) => Number(page.pageNumber) || 1))
    : pageNumber;

  image.src = url;
  image.alt = replyText(`Slide/page ${pageNumber}`, `Slide/pagina ${pageNumber}`);
  caption.textContent = replyText(`Slide/page ${pageNumber}`, `Slide/pagina ${pageNumber}`);

  figure.querySelectorAll("[data-slide-page]").forEach((node, index) => {
    const nextPage = index === 0 ? Math.max(1, pageNumber - 1) : Math.min(maxPage, pageNumber + 1);
    node.dataset.slidePage = String(nextPage);
    node.disabled = index === 0 ? pageNumber <= 1 : pageNumber >= maxPage;
  });
}

function saveChat() {
  const messages = Array.from(elements.conversation.children).map((node) => ({
    role: node.classList.contains("user") ? "user" : node.classList.contains("safety") ? "safety" : "assistant",
    text: (node.dataset.messageText || node.textContent).replace(/^(You|Safety Guard|Assistant|Local Copilot Assistant)/, "").trim()
  }));
  localStorage.setItem(storageKeys.chat, JSON.stringify(messages));
  if (!state.restoringChat) {
    saveActiveConversation(messages);
  }
}

function restoreChat() {
  try {
    const messages = JSON.parse(localStorage.getItem(storageKeys.chat) || "[]").filter((message) => {
      const text = String(message?.text || "").trim();
      return text !== "New conversation ready." && text !== "Conversatie noua pregatita.";
    });
    state.restoringChat = true;
    messages.forEach((message) => addMessage(message.role, message.text));
  } catch {
    localStorage.removeItem(storageKeys.chat);
  } finally {
    state.restoringChat = false;
  }
}

function saveActiveConversation(messages = getCurrentMessages()) {
  const usefulMessages = messages.filter((message) => message.text && !message.text.includes("Conversation cleared"));
  if (usefulMessages.length < 2) return;

  const conversations = getStoredConversations();
  let id = localStorage.getItem(storageKeys.activeConversation);
  if (!id) {
    id = `chat-${Date.now()}`;
    localStorage.setItem(storageKeys.activeConversation, id);
  }

  const firstUser = usefulMessages.find((message) => message.role === "user");
  const title = makeConversationTitle(firstUser ? firstUser.text : usefulMessages[0].text);
  const existingIndex = conversations.findIndex((conversation) => conversation.id === id);
  const existingConversation = existingIndex >= 0 ? conversations[existingIndex] : null;
  const nextConversation = {
    id,
    title,
    pinned: Boolean(existingConversation && existingConversation.pinned),
    updatedAt: new Date().toISOString(),
    messages: usefulMessages.slice(-80)
  };

  if (existingIndex >= 0) {
    conversations[existingIndex] = nextConversation;
  } else {
    conversations.unshift(nextConversation);
  }

  localStorage.setItem(storageKeys.conversations, JSON.stringify(conversations.slice(0, 30)));
  renderConversationArchive();
}

function getCurrentMessages() {
  return Array.from(elements.conversation.children).map((node) => ({
    role: node.classList.contains("user") ? "user" : node.classList.contains("safety") ? "safety" : "assistant",
    text: (node.dataset.messageText || node.textContent).replace(/^(You|Safety Guard|Assistant|Local Copilot Assistant)/, "").trim()
  }));
}

function getStoredConversations() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.conversations) || "[]").filter((item) => item && item.id);
  } catch {
    localStorage.removeItem(storageKeys.conversations);
    return [];
  }
}

function makeConversationTitle(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return replyText("New conversation", "Conversatie noua");
  return cleaned.length > 44 ? `${cleaned.slice(0, 44)}...` : cleaned;
}

function renderConversationArchive() {
  const conversations = getStoredConversations();
  const activeId = localStorage.getItem(storageKeys.activeConversation);
  elements.conversationList.innerHTML = "";

  if (!conversations.length) {
    const empty = document.createElement("p");
    empty.className = "conversation-empty";
    empty.textContent = replyText("Old conversations will appear here.", "Conversatiile vechi apar aici.");
    elements.conversationList.appendChild(empty);
    return;
  }

  conversations
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .forEach((conversation) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `conversation-item${conversation.id === activeId ? " active" : ""}${conversation.pinned ? " pinned" : ""}`;
      button.innerHTML = `
        <strong>${escapeHtml(conversation.title || replyText("Conversation", "Conversatie"))}</strong>
        <span>${escapeHtml(formatConversationDate(conversation.updatedAt))}</span>
      `;
      button.addEventListener("click", () => loadConversation(conversation.id));
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        showConversationMenu(event, conversation.id);
      });
      elements.conversationList.appendChild(button);
    });
}

function showConversationMenu(event, conversationId) {
  closeSettingsMenu();
  state.conversationMenuTargetId = conversationId;
  const conversation = getStoredConversations().find((item) => item.id === conversationId);
  if (!conversation) return;

  if (!state.conversationMenu) {
    state.conversationMenu = document.createElement("div");
    state.conversationMenu.className = "conversation-context-menu";
    document.body.appendChild(state.conversationMenu);
  }

  state.conversationMenu.innerHTML = `
    <button type="button" data-action="pin">${conversation.pinned ? replyText("Unpin", "Scoate pin") : replyText("Pin", "Fixeaza")}</button>
    <button type="button" data-action="delete">${replyText("Delete", "Sterge")}</button>
  `;

  state.conversationMenu.querySelector("[data-action='pin']").addEventListener("click", () => toggleConversationPin(conversationId));
  state.conversationMenu.querySelector("[data-action='delete']").addEventListener("click", () => deleteConversation(conversationId));

  const menuWidth = 170;
  const menuHeight = 92;
  const left = Math.min(event.clientX, window.innerWidth - menuWidth - 10);
  const top = Math.min(event.clientY, window.innerHeight - menuHeight - 10);
  state.conversationMenu.style.left = `${Math.max(10, left)}px`;
  state.conversationMenu.style.top = `${Math.max(10, top)}px`;
  state.conversationMenu.classList.add("open");
}

function hideConversationMenu() {
  if (state.conversationMenu) state.conversationMenu.classList.remove("open");
  state.conversationMenuTargetId = null;
}

function toggleConversationPin(conversationId) {
  const conversations = getStoredConversations().map((conversation) => (
    conversation.id === conversationId
      ? { ...conversation, pinned: !conversation.pinned }
      : conversation
  ));
  localStorage.setItem(storageKeys.conversations, JSON.stringify(conversations));
  hideConversationMenu();
  renderConversationArchive();
}

function deleteConversation(conversationId) {
  const previousConversations = getStoredConversations()
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const deletedIndex = previousConversations.findIndex((conversation) => conversation.id === conversationId);
  const conversations = previousConversations.filter((conversation) => conversation.id !== conversationId);
  localStorage.setItem(storageKeys.conversations, JSON.stringify(conversations));

  if (localStorage.getItem(storageKeys.activeConversation) === conversationId) {
    const nextConversation = conversations[Math.max(0, deletedIndex - 1)] || conversations[0] || null;
    if (nextConversation) {
      loadConversation(nextConversation.id);
    } else {
      localStorage.removeItem(storageKeys.activeConversation);
      localStorage.removeItem(storageKeys.chat);
      elements.conversation.innerHTML = "";
      updateEmptyChatState(true);
    }
  }

  hideConversationMenu();
  renderConversationArchive();
}

function formatConversationDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(elements.languageSelect.value === "ro-RO" ? "ro-RO" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function loadConversation(id) {
  const conversation = getStoredConversations().find((item) => item.id === id);
  if (!conversation) return;
  localStorage.setItem(storageKeys.activeConversation, id);
  localStorage.setItem(storageKeys.chat, JSON.stringify(conversation.messages || []));
  elements.conversation.innerHTML = "";
  state.restoringChat = true;
  (conversation.messages || []).forEach((message) => addMessage(message.role, message.text));
  state.restoringChat = false;
  renderConversationArchive();
  closeSidebarDrawer();
}

function startNewConversation() {
  saveActiveConversation();
  localStorage.removeItem(storageKeys.chat);
  localStorage.removeItem(storageKeys.activeConversation);
  elements.conversation.innerHTML = "";
  updateEmptyChatState(true);
  renderConversationArchive();
  closeSidebarDrawer();
}


function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(String(value || ""));
}

function updateGroqKeyStatus(key) {
  const status = document.querySelector("#groqKeyStatus");
  if (!status) return;
  status.classList.toggle("active", Boolean(key));
}

function toggleAiMode() {
  const current = localStorage.getItem(storageKeys.aiMode) || "normal";
  const next = current === "smart" ? "normal" : "smart";
  localStorage.setItem(storageKeys.aiMode, next);
  updateAiModeButton();

  if (next === "smart") {
    const hasKey = Boolean((localStorage.getItem(storageKeys.groqApiKey) || "").trim());
    if (!hasKey && !GROQ_PROXY_ENDPOINT) {
      addMessage("assistant", replyText(
        "Smart mode uses Groq 70B. Add your free API key in Settings → API to activate it.",
        "Modul Smart foloseste Groq 70B. Adauga cheia gratuita in Setari → API ca sa il activezi."
      ));
    }
  }
}

function updateAiModeButton() {
  const btn = elements.aiModeButton;
  if (!btn) return;
  const mode = localStorage.getItem(storageKeys.aiMode) || "normal";
  const isSmart = mode === "smart";
  btn.textContent = isSmart ? "Smart" : "Normal";
  btn.classList.toggle("is-smart", isSmart);
  btn.classList.remove("is-limited");
  btn.disabled = false;
  btn.title = isSmart
    ? "Smart: Groq 70B — click pentru Normal (local 8B)"
    : "Normal: local 8B — click pentru Smart (Groq 70B)";

  const circle = elements.groqUsageCircle;
  if (circle) {
    circle.hidden = !isSmart;
    if (isSmart) updateGroqUsageCircle();
  }
}

const GROQ_MINUTE_LIMIT = 30;
const GROQ_DAILY_LIMIT = 14400;
const GROQ_WEEKLY_LIMIT = 100800;
const GROQ_CIRCLE_C = 43.98;

function getWeekStartDate() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toLocaleDateString("en-CA");
}

function getGroqPersisted(key, periodKey, periodValue) {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "{}");
    return d[periodKey] === periodValue ? (d.count || 0) : 0;
  } catch { return 0; }
}

function incrementGroqPersisted(key, periodKey, periodValue) {
  let count = 0;
  try {
    const d = JSON.parse(localStorage.getItem(key) || "{}");
    count = d[periodKey] === periodValue ? (d.count || 0) + 1 : 1;
  } catch { count = 1; }
  localStorage.setItem(key, JSON.stringify({ [periodKey]: periodValue, count }));
}

function incrementGroqUsageCounts() {
  const today = new Date().toLocaleDateString("en-CA");
  const weekStart = getWeekStartDate();
  incrementGroqPersisted("localCopilot.groqDailyUsage", "date", today);
  incrementGroqPersisted("localCopilot.groqWeeklyUsage", "week", weekStart);
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function msUntilNextMonday() {
  const now = new Date();
  const day = now.getDay();
  const daysLeft = day === 0 ? 1 : 8 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysLeft);
  next.setHours(0, 0, 0, 0);
  return next - now;
}

function formatResetIn(ms) {
  const h = ms / 3600000;
  const d = h / 24;
  if (d >= 2) return `resets in ${Math.floor(d)}d`;
  if (h >= 1) return `resets in ${Math.round(h)}h`;
  return "resets soon";
}

function updateGroqUsagePanelContent() {
  const panel = elements.groqUsagePanel;
  if (!panel) return;
  const today = new Date().toLocaleDateString("en-CA");
  const weekStart = getWeekStartDate();
  const daily = getGroqPersisted("localCopilot.groqDailyUsage", "date", today);
  const weekly = getGroqPersisted("localCopilot.groqWeeklyUsage", "week", weekStart);
  const dailyPct = Math.min(100, Math.round(daily / GROQ_DAILY_LIMIT * 100));
  const weeklyPct = Math.min(100, Math.round(weekly / GROQ_WEEKLY_LIMIT * 100));
  panel.querySelector(".usage-row-daily .usage-pct").textContent =
    `${dailyPct}% · ${formatResetIn(msUntilMidnight())}`;
  panel.querySelector(".usage-row-daily .usage-fill").style.width = `${dailyPct}%`;
  panel.querySelector(".usage-row-weekly .usage-pct").textContent =
    `${weeklyPct}% · ${formatResetIn(msUntilNextMonday())}`;
  panel.querySelector(".usage-row-weekly .usage-fill").style.width = `${weeklyPct}%`;
}

function toggleGroqUsagePanel(event) {
  event.stopPropagation();
  const panel = elements.groqUsagePanel;
  if (!panel) return;
  if (panel.hidden) {
    updateGroqUsagePanelContent();
    panel.hidden = false;
  } else {
    panel.hidden = true;
  }
}

function recordGroqRequest() {
  state.groqMinuteRequests.push(Date.now());
  incrementGroqUsageCounts();
  updateGroqUsageCircle();
}

function updateGroqUsageCircle() {
  const circle = elements.groqUsageCircle;
  if (!circle || circle.hidden) return;

  const now = Date.now();
  state.groqMinuteRequests = state.groqMinuteRequests.filter((t) => now - t < 60000);

  const used = state.groqMinuteRequests.length;
  const remaining = Math.max(0, GROQ_MINUTE_LIMIT - used);
  const remainingFraction = remaining / GROQ_MINUTE_LIMIT;
  const dashoffset = (GROQ_CIRCLE_C * (1 - remainingFraction)).toFixed(2);

  const fillEl = circle.querySelector(".usage-fill");
  if (fillEl) {
    fillEl.setAttribute("stroke-dashoffset", dashoffset);
    fillEl.style.stroke = remainingFraction > 0.5
      ? "var(--accent)"
      : remainingFraction > 0.2
        ? "var(--warn)"
        : "#ff453a";
  }

  circle.title = `Smart: ${remaining}/${GROQ_MINUTE_LIMIT} req/min ramase`;
}

function disableSmartMode() {
  localStorage.setItem(storageKeys.aiMode, "normal");
  const btn = elements.aiModeButton;
  if (btn) {
    btn.textContent = "Smart";
    btn.classList.remove("is-smart");
    btn.classList.add("is-limited");
    btn.disabled = true;
    btn.title = "Limita Groq atinsa — se reactiveaza in ~1 minut";
  }
  const circle = elements.groqUsageCircle;
  if (circle) circle.hidden = true;

  addMessage("assistant", replyText(
    "Groq rate limit reached. Switched to local model. Smart mode re-enables in ~1 minute.",
    "Limita Groq per minut atinsa. Am trecut pe modelul local. Modul Smart se reactiveaza in ~1 minut."
  ));

  window.setTimeout(() => {
    state.groqMinuteRequests = [];
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-limited");
    }
    updateAiModeButton();
  }, 62000);
}

async function askGroqAi(userInput, externalSignal = null, webContext = "", onToken = null) {
  const apiKey = (localStorage.getItem(storageKeys.groqApiKey) || "").trim();
  // Key manual (dezvoltare) → direct la Groq; altfel prin proxy-ul nostru,
  // care are key-ul pe server — utilizatorii finali nu configureaza nimic.
  const useProxy = !apiKey && Boolean(GROQ_PROXY_ENDPOINT);
  if (!apiKey && !useProxy) return "";
  const model = localStorage.getItem(storageKeys.groqModel) || "llama-3.3-70b-versatile";

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 60000);
  const abortFromExternal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) { controller.abort(); }
    externalSignal.addEventListener("abort", abortFromExternal, { once: true });
  }

  try {
    const historyMessages = getRecentConversationMessages();
    const endpoint = useProxy ? GROQ_PROXY_ENDPOINT : "https://api.groq.com/openai/v1/chat/completions";
    const headers = { "Content-Type": "application/json" };
    if (!useProxy) headers["Authorization"] = `Bearer ${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        stream: Boolean(onToken),
        max_tokens: Math.max(120, Number(localStorage.getItem(storageKeys.aiMaxTokens)) || 1200),
        temperature: Number(localStorage.getItem(storageKeys.aiTemperature)) || 0.35,
        messages: [
          { role: "system", content: buildGroqSystemPrompt(webContext) },
          ...historyMessages,
          { role: "user", content: userInput }
        ]
      })
    });

    if (!response.ok) {
      let errorDetail = response.status;
      try { const err = await response.json(); errorDetail = err?.error?.message || response.status; } catch {}
      console.error(`[Local Copilot] Groq API error ${response.status}:`, errorDetail);
      if (response.status === 429) disableSmartMode();
      return "";
    }

    if (onToken && response.body) {
      const streamed = await readGroqStream(response, onToken);
      if (streamed) recordGroqRequest();
      return streamed;
    }

    const data = await response.json();
    const content = cleanLocalAiReply(data.choices?.[0]?.message?.content || "").trim();
    if (content) recordGroqRequest();
    return content;
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error("[Local Copilot] Groq request failed:", error);
    }
    return "";
  } finally {
    window.clearTimeout(timeout);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
  }
}

async function readGroqStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.replace(/^data: /, "").trim();
      if (!trimmed || trimmed === "[DONE]") continue;
      try {
        const data = JSON.parse(trimmed);
        const token = data.choices?.[0]?.delta?.content || "";
        if (token) { fullText += token; onToken(token); }
      } catch { }
    }
  }
  return fullText;
}


function exportConversation() {
  const messages = Array.from(elements.conversation.children)
    .filter((node) => !node.classList.contains("thinking"))
    .map((node) => {
      const role = node.classList.contains("user") ? "user" : "assistant";
      const text = (node.dataset.messageText || node.textContent || "").trim();
      return { role, text };
    })
    .filter((msg) => msg.text);

  if (!messages.length) {
    addMessage("assistant", replyText("No conversation to export yet.", "Nu exista conversatie de exportat inca."));
    return;
  }

  const date = new Date().toLocaleDateString("en-CA");
  const lines = [`# Local Copilot — ${replyText("Conversation", "Conversatie")}`, `${replyText("Date", "Data")}: ${date}`, "", "---", ""];
  for (const msg of messages) {
    const label = msg.role === "user" ? replyText("**User:**", "**Tu:**") : replyText("**Local Copilot:**", "**Local Copilot:**");
    lines.push(`${label} ${msg.text}`, "");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `local-copilot-${date}.md`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 200);
}

init();







