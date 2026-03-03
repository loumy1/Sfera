(() => {
  "use strict";

  function createAppCommentsUi(ctx) {
    const { state, deps = {} } = ctx || {};
    const { setStatus, api, refreshTracks, renderAll, formatDate, setImageWithFallback } = deps;

        async function createComment(trackId, text, parentCommentId = null) {
          try {
            await api(`/api/tracks/${trackId}/comments`, {
              method: "POST",
              body: {
                text,
                parentCommentId
              }
            });
            await refreshTracks();
            renderAll();
            setStatus("Комментарий опубликован", "success");
          } catch (error) {
            setStatus(error.message, "error");
          }
        }
        async function deleteComment(trackId, commentId) {
          const confirmed = window.confirm("Удалить этот комментарий?");
          if (!confirmed) {
            return;
          }
          try {
            setStatus("Удаляю комментарий...");
            await api(`/api/tracks/${trackId}/comments/${commentId}`, {
              method: "DELETE"
            });
            await refreshTracks();
            renderAll();
            setStatus("Комментарий удален", "success");
          } catch (error) {
            setStatus(error.message, "error");
          }
        }
        async function toggleCommentReaction(trackId, commentId, reaction) {
          try {
            await api(`/api/tracks/${trackId}/comments/${commentId}/${reaction}`, {
              method: "POST"
            });
            await refreshTracks();
            renderAll();
            setStatus("Реакция на комментарий обновлена", "success");
          } catch (error) {
            setStatus(error.message, "error");
          }
        }
        function buildAuthorBadge(comment) {
          if (!comment.likedByAuthor) {
            return null;
          }
          const badge = document.createElement("span");
          badge.className = "comment-author-badge";
          if (comment.authorBadgeAvatarUrl) {
            const avatar = document.createElement("img");
            setImageWithFallback(avatar, comment.authorBadgeAvatarUrl);
            avatar.alt = "Автор трека";
            badge.appendChild(avatar);
          }
          const text = document.createElement("span");
          text.textContent = "❤ от автора";
          badge.appendChild(text);
          return badge;
        }
        function renderCommentNode(comment, trackId) {
          const node = document.createElement("div");
          node.className = "comment-node";
          const head = document.createElement("div");
          head.className = "comment-head";
          const left = document.createElement("span");
          left.textContent = `@${comment.username}`;
          const right = document.createElement("span");
          right.textContent = formatDate(comment.createdAt);
          head.append(left, right);
          const text = document.createElement("p");
          text.className = "comment-text";
          text.textContent = comment.text;
          node.append(head, text);
          const badge = buildAuthorBadge(comment);
          if (badge) {
            node.appendChild(badge);
          }
          const actions = document.createElement("div");
          actions.className = "comment-actions";
          const likeBtn = document.createElement("button");
          likeBtn.type = "button";
          likeBtn.className = `ghost action-btn ${comment.liked ? "active" : ""}`;
          likeBtn.textContent = `👍 ${comment.likesCount}`;
          likeBtn.disabled = !state.user;
          likeBtn.addEventListener("click", () => toggleCommentReaction(trackId, comment.id, "like"));
          const dislikeBtn = document.createElement("button");
          dislikeBtn.type = "button";
          dislikeBtn.className = `ghost action-btn ${comment.disliked ? "active" : ""}`;
          dislikeBtn.textContent = `👎 ${comment.dislikesCount}`;
          dislikeBtn.disabled = !state.user;
          dislikeBtn.addEventListener("click", () => toggleCommentReaction(trackId, comment.id, "dislike"));
          actions.append(likeBtn, dislikeBtn);
          if (state.user && comment.canDelete) {
            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "ghost";
            deleteBtn.textContent = "Удалить";
            deleteBtn.addEventListener("click", () => {
              deleteComment(trackId, comment.id);
            });
            actions.appendChild(deleteBtn);
          }
          node.appendChild(actions);
          if (state.user) {
            const replyButton = document.createElement("button");
            replyButton.type = "button";
            replyButton.className = "ghost";
            replyButton.textContent = "Ответить";
            const replyForm = document.createElement("form");
            replyForm.className = "reply-form hidden";
            const replyInput = document.createElement("input");
            replyInput.type = "text";
            replyInput.maxLength = 400;
            replyInput.placeholder = "Ваш ответ";
            replyInput.required = true;
            const replySubmit = document.createElement("button");
            replySubmit.type = "submit";
            replySubmit.textContent = "Отправить";
            replyForm.append(replyInput, replySubmit);
            replyButton.addEventListener("click", () => {
              replyForm.classList.toggle("hidden");
            });
            replyForm.addEventListener("submit", async (event) => {
              event.preventDefault();
              const textValue = replyInput.value.trim();
              if (!textValue) {
                return;
              }
              setStatus("Публикую ответ...");
              await createComment(trackId, textValue, comment.id);
            });
            node.append(replyButton, replyForm);
          }
          if (Array.isArray(comment.replies) && comment.replies.length > 0) {
            const repliesWrap = document.createElement("div");
            repliesWrap.className = "replies";
            for (const reply of comment.replies) {
              repliesWrap.appendChild(renderCommentNode(reply, trackId));
            }
            node.appendChild(repliesWrap);
          }
          return node;
        }

    return {
      createComment,
      deleteComment,
      toggleCommentReaction,
      buildAuthorBadge,
      renderCommentNode
    };
  }

  window.SferaCommentsUi = { createAppCommentsUi };
})();
