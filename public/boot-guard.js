// Boot guard.
//
// Lives outside the app bundle on purpose: if the bundle itself fails to load (deleted
// hashed asset, blocked script, parse error) this file is what tells the user, instead of a
// skeleton that says "Loading…" forever.
//
// It is a separate file rather than an inline script because the app ships a Content Security
// Policy that refuses inline scripts — an inline guard was silently blocked by our own CSP.
(function () {
  window.setTimeout(function () {
    if (window.__sahayogiMounted) return;
    var status = document.getElementById("boot-status");
    if (!status) return;
    status.textContent = "The app did not start. Check your connection and reload this page.";
    status.style.color = "#d29922";
  }, 15000);
})();
