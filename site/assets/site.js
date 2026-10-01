// "Copy email" buttons: copy the address, say so for a moment, and announce it
// to screen readers. If copying isn't allowed, open the email app instead.
document.querySelectorAll("[data-copy]").forEach((button) => {
  const label = button.textContent;
  const status = document.querySelector("[data-copy-status]");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = "Copied";
      if (status) status.textContent = "Email address copied";
      setTimeout(() => {
        button.textContent = label;
        if (status) status.textContent = "";
      }, 2000);
    } catch {
      window.location.href = "mailto:" + button.dataset.copy;
    }
  });
});
