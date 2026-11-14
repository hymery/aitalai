const CLOUD_SELECTOR = ".cloud, .chat-bubble";
let cloudObserver;
let mutationObserver;
let fitFrame = 0;

function cloudLineCount(cloud) {
  const text = cloud.querySelector(".speech__text, .chat-bubble__content") || cloud;
  const style = getComputedStyle(text);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
  const contentHeight = text.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  return Math.max(1, Math.ceil(contentHeight / lineHeight));
}

function cloudAnchor(cloud) {
  const guide = cloud.closest(".node-guide");
  if (guide) return guide.parentElement.querySelector(".node-circle")?.getBoundingClientRect();
  const scene = cloud.closest(".stage, .library-scene, .daily-mascot");
  const actor = scene?.querySelector(".mascot-crop, .daily-mascot__crop")?.getBoundingClientRect();
  if (actor) {
    const facingLeft = scene.querySelector("[data-facing='left']");
    return { left: actor.left + actor.width * (facingLeft ? 0.35 : 0.65), right: actor.left + actor.width * (facingLeft ? 0.35 : 0.65) };
  }
  return null;
}

export function fitCloud(cloud) {
  if (!(cloud instanceof HTMLElement) || !cloud.isConnected || cloud.closest("[hidden]")) return;
  cloud.classList.add("cloud");
  if (!cloud.dataset.cloudBase) cloud.dataset.cloudBase = String(parseFloat(getComputedStyle(cloud).fontSize) || 20);
  const base = Number(cloud.dataset.cloudBase);
  const sizes = base <= 14 ? [14] : [22, 20, 18, 16].filter((size) => size <= base);
  if (!sizes.length) sizes.push(Math.max(16, base));
  cloud.classList.remove("cloud--wide");
  for (const size of sizes) {
    cloud.style.setProperty("--cloud-font-size", `${size}px`);
    if (cloudLineCount(cloud) <= 3) break;
  }
  if (cloudLineCount(cloud) > 3) cloud.classList.add("cloud--wide");

  const previousShift = Number(cloud.dataset.cloudShift || 0);
  const rect = cloud.getBoundingClientRect();
  const baseLeft = rect.left - previousShift;
  const baseRight = rect.right - previousShift;
  let shift = 0;
  if (baseLeft < 8) shift = 8 - baseLeft;
  else if (baseRight > window.innerWidth - 8) shift = window.innerWidth - 8 - baseRight;
  cloud.dataset.cloudShift = String(shift);
  cloud.style.setProperty("--cloud-shift", `${shift}px`);

  const anchor = cloudAnchor(cloud);
  if (anchor) {
    const anchorX = (anchor.left + anchor.right) / 2;
    const tailX = Math.max(0, Math.min(rect.width, anchorX - baseLeft - shift));
    cloud.style.setProperty("--tail-x", `${tailX}px`);
  }
}

export function refreshClouds(root = document) {
  const clouds = [];
  if (root instanceof HTMLElement && root.matches(CLOUD_SELECTOR)) clouds.push(root);
  clouds.push(...root.querySelectorAll(CLOUD_SELECTOR));
  clouds.forEach((cloud) => {
    cloudObserver?.observe(cloud);
    fitCloud(cloud);
  });
}

export function initClouds() {
  if ("ResizeObserver" in window) {
    cloudObserver = new ResizeObserver((entries) => {
      entries.forEach(({ target }) => fitCloud(target));
    });
  }
  mutationObserver = new MutationObserver((mutations) => {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") {
          const cloud = mutation.target.parentElement?.closest(CLOUD_SELECTOR);
          if (cloud) fitCloud(cloud);
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) refreshClouds(node);
        });
      });
    });
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  refreshClouds();
  window.addEventListener("resize", () => refreshClouds(), { passive: true });
}
