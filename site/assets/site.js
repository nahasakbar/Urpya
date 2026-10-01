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

// Project videos ([data-autoplay]): play silently while on screen and pause
// when scrolled away, so a phone never downloads or runs them all at once. On
// the home page they loop without controls; on a project's own page
// (data-autoplay="keep-controls") the controls stay so people can turn the
// sound on. Anyone who asked for less motion, or whose browser can't tell
// what's on screen, gets the normal play button instead.
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const autoVideos = document.querySelectorAll("video[data-autoplay]");
if (autoVideos.length && !reduceMotion && "IntersectionObserver" in window) {
  const onScreen = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
      });
    },
    { threshold: 0.35 }
  );
  autoVideos.forEach((video) => {
    if (video.dataset.autoplay !== "keep-controls") video.removeAttribute("controls");
    video.muted = true;
    onScreen.observe(video);
  });
}
