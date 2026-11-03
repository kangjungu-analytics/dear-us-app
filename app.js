// Supabase > Project Settings > API에서 확인한 값으로 바꿔 주세요.
// 브라우저에 넣는 publishable/anon key는 RLS 정책과 함께 사용합니다.
// service_role 키는 여기에 절대 넣지 마세요.
const SUPABASE_URL = "https://mkivsvpswhnegkiaormo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zIc8WLNsQx8eWbbrvoE3nw_4cdqOOkn";
const PHOTO_BUCKET = "couple-photos";

const $ = (selector) => document.querySelector(selector);
const views = ["loadingView", "setupView", "authView", "pairView", "coupleView"];
let supabase;
let currentUser;
let currentCouple;
let authMode = "signin";
let realtimeChannel;

function showView(id) {
  for (const view of views) document.getElementById(view).classList.toggle("hidden", view !== id);
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === id;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== id));
}

function setMessage(selector, message, isError = false) {
  const el = $(selector);
  el.textContent = message || "";
  el.style.color = isError ? "#a84640" : "";
}

function showAppMessage(message, isError = false) {
  setMessage("#appMessage", message, isError);
  if (message) window.setTimeout(() => setMessage("#appMessage", ""), 5000);
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function renderMessage(message) {
  const list = $("#messagesList");
  list.querySelector(".empty-state")?.remove();
  if (list.querySelector(`[data-message-id="${message.id}"]`)) return;

  const row = document.createElement("article");
  row.className = `message-row${message.sender_id === currentUser.id ? " mine" : ""}`;
  row.dataset.messageId = message.id;
  const meta = document.createElement("span");
  meta.className = "message-meta";
  meta.textContent = `${message.sender_id === currentUser.id ? "나" : "상대방"} · ${formatTime(message.created_at)}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.body;
  row.append(meta, bubble);
  list.append(row);
  list.scrollTop = list.scrollHeight;
}

async function loadMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("id, couple_id, sender_id, body, created_at")
    .eq("couple_id", currentCouple.id)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  const list = $("#messagesList");
  list.replaceChildren();
  if (!data.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "첫 인사를 남겨보세요. ☁️";
    list.append(empty);
  } else {
    data.forEach(renderMessage);
  }
}

async function loadPhotos() {
  const { data, error } = await supabase
    .from("photos")
    .select("id, couple_id, uploader_id, storage_path, caption, created_at")
    .eq("couple_id", currentCouple.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const grid = $("#photoGrid");
  grid.replaceChildren();
  $("#photoCount").textContent = `${data.length}장`;
  if (!data.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "함께 간직할 사진을 올려보세요. 🌷";
    grid.append(empty);
    return;
  }

  for (const photo of data) {
    const { data: signed, error: signedError } = await supabase
      .storage.from(PHOTO_BUCKET).createSignedUrl(photo.storage_path, 3600);
    if (signedError) continue;
    const card = document.createElement("article");
    card.className = "photo-item";
    const image = document.createElement("img");
    image.src = signed.signedUrl;
    image.alt = photo.caption || "우리의 사진";
    image.loading = "lazy";
    const caption = document.createElement("p");
    caption.textContent = photo.caption || formatTime(photo.created_at);
    const remove = document.createElement("button");
    remove.className = "photo-remove";
    remove.type = "button";
    remove.textContent = "삭제";
    remove.setAttribute("aria-label", "사진 삭제");
    remove.addEventListener("click", () => deletePhoto(photo));
    card.append(image, caption, remove);
    grid.append(card);
  }
}

async function deletePhoto(photo) {
  if (!window.confirm("이 사진을 두 사람의 앨범에서 삭제할까요?")) return;
  try {
    const { error: storageError } = await supabase.storage
      .from(PHOTO_BUCKET).remove([photo.storage_path]);
    if (storageError) throw storageError;
    const { error: rowError } = await supabase
      .from("photos").delete().eq("id", photo.id);
    if (rowError) throw rowError;
    await loadPhotos();
    showAppMessage("사진을 삭제했어요.");
  } catch (error) {
    showAppMessage(`사진을 삭제하지 못했어요: ${error.message}`, true);
  }
}

async function startRealtime() {
  if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel(`couple-${currentCouple.id}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "messages",
      filter: `couple_id=eq.${currentCouple.id}`
    }, (payload) => renderMessage(payload.new))
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "photos",
      filter: `couple_id=eq.${currentCouple.id}`
    }, () => loadPhotos().catch((error) => showAppMessage(error.message, true)))
    .subscribe((status) => {
      const indicator = document.querySelector(".live-indicator");
      if (indicator) indicator.innerHTML = status === "SUBSCRIBED" ? "<i></i> 실시간 연결됨" : "<i></i> 연결 중";
    });
}

async function enterApp() {
  try {
    const { data, error } = await supabase.rpc("get_my_couple");
    if (error) throw error;
    currentCouple = Array.isArray(data) ? data[0] : data;
    if (!currentCouple) {
      showView("pairView");
      return;
    }
    $("#inviteCodeDisplay").textContent = currentCouple.invite_code;
    showView("coupleView");
    await Promise.all([loadMessages(), loadPhotos()]);
    await startRealtime();
  } catch (error) {
    showView("pairView");
    setMessage("#pairMessage", `공간을 불러오지 못했어요: ${error.message}`, true);
  }
}

async function handleSession(session) {
  currentUser = session?.user || null;
  currentCouple = null;
  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!currentUser) {
    showView("authView");
    return;
  }
  await enterApp();
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === "signup";
  $("#authTitle").textContent = signingUp ? "우리 공간 계정 만들기" : "우리 공간에 로그인";
  $("#authSubmit").textContent = signingUp ? "회원가입" : "로그인";
  $("#authModeButton").textContent = signingUp ? "이미 계정이 있나요? 로그인" : "처음 오셨나요? 회원가입";
  $("#passwordInput").autocomplete = signingUp ? "new-password" : "current-password";
  setMessage("#authMessage", "");
}

$("#authModeButton").addEventListener("click", () => {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#emailInput").value.trim();
  const password = $("#passwordInput").value;
  const button = $("#authSubmit");
  button.disabled = true;
  setMessage("#authMessage", "처리 중이에요…");
  try {
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (authMode === "signup" && !result.data.session) {
      setMessage("#authMessage", "dear, us에 오신 걸 환영해요. 가입 확인 메일의 링크를 누른 뒤 로그인해 주세요.");
    } else {
      setMessage("#authMessage", "로그인했어요.");
      if (result.data.session) await handleSession(result.data.session);
    }
  } catch (error) {
    setMessage("#authMessage", error.message, true);
  } finally {
    button.disabled = false;
  }
});

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) showAppMessage(error.message, true);
}
$("#signOutButton").addEventListener("click", signOut);
$("#signOutAppButton").addEventListener("click", signOut);

$("#createCoupleButton").addEventListener("click", async () => {
  try {
    const { data, error } = await supabase.rpc("create_couple");
    if (error) throw error;
    await enterApp();
    switchTab("invitePanel");
    showAppMessage("공간을 만들었어요. 초대 화면에서 코드를 복사해 연인에게 보내주세요.");
  } catch (error) {
    setMessage("#pairMessage", error.message, true);
  }
});

$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = $("#inviteInput").value.trim().toUpperCase();
  try {
    const { error } = await supabase.rpc("join_couple", { p_code: code });
    if (error) throw error;
    setMessage("#pairMessage", "두 사람의 공간을 연결했어요!");
    await enterApp();
  } catch (error) {
    setMessage("#pairMessage", error.message, true);
  }
});

$("#messageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#messageInput");
  const body = input.value.trim();
  if (!body || !currentCouple) return;
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const { error } = await supabase.from("messages").insert({
      couple_id: currentCouple.id,
      sender_id: currentUser.id,
      body,
    });
    if (error) throw error;
    input.value = "";
    input.focus();
  } catch (error) {
    showAppMessage(`메시지를 보내지 못했어요: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

$("#photoForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = $("#photoInput").files[0];
  if (!file) return showAppMessage("먼저 사진을 선택해 주세요.", true);
  if (!currentCouple) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return showAppMessage("JPG, PNG, WEBP 사진만 올릴 수 있어요.", true);
  }
  if (file.size > 10 * 1024 * 1024) {
    return showAppMessage("사진은 10MB 이하로 선택해 주세요.", true);
  }

  const button = $("#uploadButton");
  button.disabled = true;
  button.textContent = "저장 중…";
  const path = `${currentCouple.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  try {
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { error: rowError } = await supabase.from("photos").insert({
      couple_id: currentCouple.id,
      uploader_id: currentUser.id,
      storage_path: path,
      caption: $("#captionInput").value.trim() || null,
    });
    if (rowError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      throw rowError;
    }
    $("#photoForm").reset();
    await loadPhotos();
    showAppMessage("사진을 둘만의 앨범에 저장했어요.");
  } catch (error) {
    showAppMessage(`사진을 저장하지 못했어요: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "사진 저장";
  }
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

$("#copyInviteButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(currentCouple.invite_code);
    showAppMessage("초대 코드를 복사했어요.");
  } catch {
    showAppMessage(`초대 코드: ${currentCouple.invite_code}`);
  }
});

$("#shareInviteButton").addEventListener("click", async () => {
  const message = `dear, us에 초대할게요 ♡\n사이트: ${window.location.origin}${window.location.pathname}\n초대 코드: ${currentCouple.invite_code}\n가입 후 로그인해서 이 코드를 입력해 주세요.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "dear, us 초대", text: message });
    } else {
      await navigator.clipboard.writeText(message);
      showAppMessage("초대 링크와 코드가 복사됐어요. 연인에게 보내주세요.");
    }
  } catch (error) {
    if (error.name !== "AbortError") showAppMessage("공유를 열지 못했어요. 코드 복사를 이용해 주세요.", true);
  }
});

async function start() {
  const configured = !SUPABASE_URL.includes("YOUR_PROJECT")
    && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE");
  if (!configured) {
    showView("setupView");
    return;
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => handleSession(session), 0);
    });
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await handleSession(data.session);
  } catch (error) {
    showView("setupView");
    console.error(error);
  }
}

start();

