(() => {
  "use strict";

  function createAppRealtimeCore(ctx) {
    const { state, realtime, deps = {} } = ctx || {};
    const {
      renderOnlineCounter,
      refreshThreads,
      loadConversation,
      renderMessages,
      setStatus,
      refreshMe,
      refreshUsers,
      refreshFollows,
      refreshNotifications,
      renderProfile,
      renderSettings,
      renderNotifications
    } = deps;
    const REALTIME_KEEPALIVE_INTERVAL_MS = 25000;

    function clearRealtimeReconnectTimer() {
      if (realtime.reconnectTimer) {
        clearTimeout(realtime.reconnectTimer);
        realtime.reconnectTimer = null;
      }
    }

    function clearRealtimeKeepaliveTimer() {
      if (realtime.keepaliveTimer) {
        clearInterval(realtime.keepaliveTimer);
        realtime.keepaliveTimer = null;
      }
    }

    function sendRealtimeKeepalive(socket = realtime.socket) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        // Browsers cannot send WS ping frames directly, so send a tiny text frame
        // to keep reverse proxies / mobile networks from idling out the connection.
        socket.send("{\"event\":\"client:ping\"}");
      } catch {
        // ignore transient send failures; close handler will reconnect
      }
    }

    function startRealtimeKeepalive(socket = realtime.socket) {
      clearRealtimeKeepaliveTimer();
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      sendRealtimeKeepalive(socket);
      realtime.keepaliveTimer = setInterval(() => {
        sendRealtimeKeepalive(socket);
      }, REALTIME_KEEPALIVE_INTERVAL_MS);
    }

    function getWebSocketUrl() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${window.location.host}/ws`;
    }

    function disconnectRealtimeSocket(manual = true) {
      realtime.manualClose = manual;
      clearRealtimeReconnectTimer();
      clearRealtimeKeepaliveTimer();

      if (!realtime.socket) {
        return;
      }

      const socket = realtime.socket;
      realtime.socket = null;

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {

        try {
          socket.close();
        } catch {
          // ignore
        }
      }
    }

    function scheduleRealtimeReconnect() {
      clearRealtimeReconnectTimer();

      if (!state.user || realtime.manualClose) {
        return;
      }

      realtime.reconnectTimer = setTimeout(() => {
        connectRealtimeSocket();
      }, 2000);
    }

    async function handleRealtimeEvent(message) {
      if (!message || typeof message.event !== "string") {
        return;
      }

      if (message.event === "ws:ready") {
        if (Number.isFinite(Number(message.payload?.onlineUsers))) {
          state.onlineUsers = Math.max(0, Number(message.payload.onlineUsers));
          renderOnlineCounter();
        }
        return;
      }

      if (message.event === "online:count") {
        if (Number.isFinite(Number(message.payload?.onlineUsers))) {
          state.onlineUsers = Math.max(0, Number(message.payload.onlineUsers));
          renderOnlineCounter();
        }
        return;
      }

      if (message.event === "message:new") {
        const payload = message.payload || {};
        const messageDto = payload.message;

        if (!messageDto || !state.user) {
          return;
        }

        const peerId = messageDto.fromUserId === state.user.id ? messageDto.toUserId : messageDto.fromUserId;

        await refreshThreads();



        if (state.currentChatUserId && peerId === state.currentChatUserId) {
          await loadConversation(peerId);
        } else {
          renderMessages();
        }

        if (!payload.echo && messageDto.fromUserId !== state.user.id) {
          setStatus(`Новое сообщение от @${messageDto.fromUsername}`, "success");
        }
        return;
      }

      if (message.event === "follow:update") {
        if (!state.user) {
          return;
        }

        await Promise.all([refreshMe(), refreshUsers(), refreshFollows()]);
        renderProfile();
        renderSettings();

        const action = message.payload?.action;
        const username = message.payload?.username;

        if (action === "followed" && username) {
          setStatus(`@${username} обновил подписку`, "success");
        } else if (action === "unfollowed" && username) {
          setStatus(`@${username} отписался`, "success");
        }
        return;
      }

      if (message.event === "notification:new") {
        if (!state.user) {
          return;
        }

        const incoming = message.payload?.notification;
        if (incoming && incoming.id) {
          const next = [incoming].concat(Array.isArray(state.notifications) ? state.notifications : []);
          const seen = new Set();
          state.notifications = next.filter((item) => {
            if (!item || !item.id || seen.has(item.id)) {
              return false;
            }
            seen.add(item.id);
            return true;
          }).slice(0, 100);
        } else if (typeof refreshNotifications === "function") {
          await refreshNotifications();
        }

        if (typeof renderNotifications === "function") {
          renderNotifications();
        }
        return;
      }
    }

    function connectRealtimeSocket() {
      if (!state.user) {
        return;
      }

      if (
        realtime.socket &&
        (realtime.socket.readyState === WebSocket.OPEN || realtime.socket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      clearRealtimeReconnectTimer();
      realtime.manualClose = false;

      const socket = new WebSocket(getWebSocketUrl());
      realtime.socket = socket;

      socket.addEventListener("open", () => {
        if (realtime.socket !== socket) {
          return;
        }
        startRealtimeKeepalive(socket);
      });

      socket.addEventListener("message", async (event) => {
        try {
          const message = JSON.parse(String(event.data || ""));
          await handleRealtimeEvent(message);
        } catch {
          // ignore bad ws payloads
        }
      });

      socket.addEventListener("close", () => {
        clearRealtimeKeepaliveTimer();
        if (realtime.socket === socket) {
          realtime.socket = null;
        }
        scheduleRealtimeReconnect();
      });

      socket.addEventListener("error", () => {
        clearRealtimeKeepaliveTimer();
        try {
          socket.close();
        } catch {
          // ignore
        }
      });
    }

    return {
      clearRealtimeReconnectTimer,
      getWebSocketUrl,
      disconnectRealtimeSocket,
      scheduleRealtimeReconnect,
      handleRealtimeEvent,
      connectRealtimeSocket
    };
  }

  window.SferaRealtimeCore = { createAppRealtimeCore };
})();
