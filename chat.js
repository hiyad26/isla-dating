(function () {
  "use strict";

  const MUTE_KEY = "isla_muted_chats";
  const BLOCK_KEY = "isla_local_blocks";

  function getJSON(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isMuted(matchId) {
    return getJSON(MUTE_KEY, []).map(String).includes(String(matchId));
  }

  function isBlocked(userId) {
    return getJSON(BLOCK_KEY, []).map(String).includes(String(userId));
  }

  function setMuted(matchId, value) {
    let list = getJSON(MUTE_KEY, []).map(String);

    list = list.filter(id => id !== String(matchId));

    if (value) {
      list.push(String(matchId));
    }

    saveJSON(MUTE_KEY, list);
  }

  function setBlocked(userId, value) {
    let list = getJSON(BLOCK_KEY, []).map(String);

    list = list.filter(id => id !== String(userId));

    if (value) {
      list.push(String(userId));
    }

    saveJSON(BLOCK_KEY, list);
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function closeChatMenu() {
    const menu = getEl("chatOptions");

    if (menu) {
      menu.classList.remove("active");
    }
  }

  function createChatMenu() {
    let menu = getEl("chatOptions");

    if (menu) {
      return menu;
    }

    menu = document.createElement("div");

    menu.id = "chatOptions";

    menu.className = "chat-options";

    menu.innerHTML = `
      <div class="chat-options-sheet">

        <div class="chat-options-title">
          Conversation options
        </div>

        <button
          type="button"
          class="chat-option"
          id="chatMuteOption">
          🔕 Mute
          <small>Silence notifications for this chat.</small>
        </button>

        <button
          type="button"
          class="chat-option"
          id="chatUnmatchOption">
          💔 Unmatch
          <small>Remove this match and conversation.</small>
        </button>

        <button
          type="button"
          class="chat-option danger"
          id="chatBlockOption">
          🚫 Block
          <small>Block this person and remove the conversation.</small>
        </button>

        <button
          type="button"
          class="chat-option danger"
          id="chatReportOption">
          ⚑ Report
          <small>Report this person to ISLA.</small>
        </button>

        <button
          type="button"
          class="chat-option"
          id="chatCancelOption">
          Cancel
        </button>

      </div>
    `;

    document.body.appendChild(menu);

    menu.addEventListener("click", function (event) {
      if (event.target === menu) {
        closeChatMenu();
      }
    });

    getEl("chatCancelOption").addEventListener(
      "click",
      closeChatMenu
    );

    getEl("chatMuteOption").addEventListener(
      "click",
      toggleMute
    );

    getEl("chatUnmatchOption").addEventListener(
      "click",
      unmatchChat
    );

    getEl("chatBlockOption").addEventListener(
      "click",
      blockChat
    );

    getEl("chatReportOption").addEventListener(
      "click",
      reportChat
    );

    return menu;
  }

  function openChatMenu() {
    if (
      typeof currentChat === "undefined" ||
      !currentChat
    ) {
      alert("Please open a chat first.");
      return;
    }

    const menu = createChatMenu();

    const muteButton = getEl("chatMuteOption");

    if (isMuted(currentChat.match_id)) {
      muteButton.innerHTML = `
        🔔 Unmute
        <small>Turn notifications back on.</small>
      `;
    } else {
      muteButton.innerHTML = `
        🔕 Mute
        <small>Silence notifications for this chat.</small>
      `;
    }

    menu.classList.add("active");
  }

  function toggleMute() {
    if (
      typeof currentChat === "undefined" ||
      !currentChat
    ) {
      return;
    }

    const matchId = currentChat.match_id;

    const newValue = !isMuted(matchId);

    setMuted(matchId, newValue);

    closeChatMenu();

    if (typeof toast === "function") {
      toast(
        newValue
          ? "Chat muted 🔕"
          : "Chat unmuted 🔔"
      );
    } else {
      alert(
        newValue
          ? "Chat muted"
          : "Chat unmuted"
      );
    }
  }

  function showConfirmation(title, message, action) {
    const old = getEl("chatConfirmation");

    if (old) {
      old.remove();
    }

    const modal = document.createElement("div");

    modal.id = "chatConfirmation";

    modal.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.75);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:999999;
      padding:20px;
    `;

    modal.innerHTML = `
      <div style="
        background:#181818;
        color:white;
        width:100%;
        max-width:420px;
        border-radius:18px;
        padding:25px;
        box-sizing:border-box;
      ">

        <h2 style="margin-top:0;">
          ${title}
        </h2>

        <p style="
          color:#bbb;
          line-height:1.5;
        ">
          ${message}
        </p>

        <div style="
          display:flex;
          gap:10px;
          margin-top:25px;
        ">

          <button
            id="confirmationCancel"
            type="button"
            style="
              flex:1;
              padding:13px;
              border:0;
              border-radius:10px;
              background:#333;
              color:white;
            ">
            Cancel
          </button>

          <button
            id="confirmationYes"
            type="button"
            style="
              flex:1;
              padding:13px;
              border:0;
              border-radius:10px;
              background:#e53935;
              color:white;
            ">
            Confirm
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(modal);

    getEl("confirmationCancel").onclick = function () {
      modal.remove();
    };

    getEl("confirmationYes").onclick = async function () {
      await action();
      modal.remove();
    };
  }

  function unmatchChat() {
    if (
      typeof currentChat === "undefined" ||
      !currentChat
    ) {
      return;
    }

    const chat = currentChat;

    closeChatMenu();

    showConfirmation(
      "Unmatch?",
      "This will remove the match and conversation from your Messages.",
      async function () {

        if (
          typeof client === "undefined" ||
          !client
        ) {
          alert("Supabase connection is unavailable.");
          return;
        }

        const result = await client
          .from("matches")
          .delete()
          .eq("id", chat.match_id);

        if (result.error) {
          console.error(result.error);

          alert(
            "Could not unmatch: " +
            result.error.message
          );

          return;
        }

        if (typeof currentChat !== "undefined") {
          currentChat = null;
        }

        const chatScreen = getEl("chat");

        if (chatScreen) {
          chatScreen.classList.remove("active");
        }

        if (typeof loadChats === "function") {
          loadChats();
        }

        if (typeof toast === "function") {
          toast("Unmatched");
        }
      }
    );
  }

  function blockChat() {
    if (
      typeof currentChat === "undefined" ||
      !currentChat
    ) {
      return;
    }

    const chat = currentChat;

    closeChatMenu();

    showConfirmation(
      "Block this person?",
      "They will be blocked and this conversation will be removed.",
      async function () {

        setBlocked(chat.id, true);

        if (
          typeof client !== "undefined" &&
          client &&
          typeof user !== "undefined" &&
          user
        ) {

          try {

            const result = await client
              .from("blocks")
              .insert({
                blocker_id: user.id,
                blocked_id: chat.id
              });

            if (result.error) {
              console.warn(
                "Supabase blocks table:",
                result.error.message
              );
            }

          } catch (error) {
            console.warn(error);
          }

          try {

            await client
              .from("matches")
              .delete()
              .eq("id", chat.match_id);

          } catch (error) {
            console.warn(error);
          }
        }

        if (typeof currentChat !== "undefined") {
          currentChat = null;
        }

        const chatScreen = getEl("chat");

        if (chatScreen) {
          chatScreen.classList.remove("active");
        }

        if (typeof loadChats === "function") {
          loadChats();
        }

        if (typeof toast === "function") {
          toast("Member blocked");
        }
      }
    );
  }

  function reportChat() {
    if (
      typeof currentChat === "undefined" ||
      !currentChat
    ) {
      return;
    }

    const chat = currentChat;

    closeChatMenu();

    const reason = prompt(
      "Why are you reporting this person?"
    );

    if (!reason || !reason.trim()) {
      return;
    }

    if (
      typeof client === "undefined" ||
      !client
    ) {
      alert("Report could not be submitted.");
      return;
    }

    if (
      typeof user === "undefined" ||
      !user
    ) {
      alert("You must be logged in to report.");
      return;
    }

    client
      .from("reports")
      .insert({
        reporter_id: user.id,
        reported_id: chat.id,
        match_id: chat.match_id,
        reason: reason.trim()
      })
      .then(function (result) {

        if (result.error) {

          console.error(result.error);

          alert(
            "Report could not be submitted: " +
            result.error.message
          );

          return;
        }

        if (typeof toast === "function") {
          toast("Report submitted. Thank you.");
        } else {
          alert("Report submitted. Thank you.");
        }
      });
  }

  function setupChatMenuButton() {

    const button = getEl("chatMenuBtn");

    if (!button) {
      console.warn(
        "ISLA: chatMenuBtn was not found."
      );
      return;
    }

    if (button.dataset.chatMenuReady === "true") {
      return;
    }

    button.dataset.chatMenuReady = "true";

    button.type = "button";

    button.style.cursor = "pointer";

    button.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();

        openChatMenu();
      },
      true
    );

    console.log(
      "ISLA chat menu button connected."
    );
  }

  function setupBackButton() {

    const back = getEl("chatBack");

    if (!back) {
      return;
    }

    if (back.dataset.chatBackReady === "true") {
      return;
    }

    back.dataset.chatBackReady = "true";

    back.addEventListener(
      "click",
      function () {

        const chatScreen = getEl("chat");

        if (chatScreen) {
          chatScreen.classList.remove("active");
        }

        if (typeof currentChat !== "undefined") {
          currentChat = null;
        }

        if (typeof loadChats === "function") {
          loadChats();
        }

      },
      true
    );
  }

  function start() {

    createChatMenu();

    setupChatMenuButton();

    setupBackButton();
  }

  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      start
    );

  } else {

    start();

  }

  setTimeout(start, 500);
  setTimeout(start, 1500);
  setTimeout(start, 3000);

})();
